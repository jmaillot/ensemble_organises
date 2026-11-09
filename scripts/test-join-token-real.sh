#!/usr/bin/env sh
# scripts/test-join-token-real.sh
# Spec e2e RÉELLE du parcours join-token (flux 31-03) contre la stack déployée.
#
#   sh scripts/test-join-token-real.sh
#   STACK_ENV=/chemin/.env E2E_BASE_URL=https://app.exemple.fr sh scripts/test-join-token-real.sh
#
# CE QUE CE SCRIPT PROUVE, ET CE QU'IL NE PROUVE PAS
#   La suite e2e standard tourne en mode démonstration (build + preview, aucun
#   backend) : elle prouve le UI, pas la chaîne réelle. Ce script, lui, fait
#   tourner `app/e2e/join-token-real.spec.ts` contre la stack déployée — vrai
#   navigateur, vraie Edge `household-invite` / `household-invite-preview`,
#   vrai GoTrue — et couvre les 6 points JT-02 du flux 31-03 : création de
#   foyer (token copiable + QR), pré-écran public nommant l'invitant (D-20),
#   traversée sessionStorage D-06, redeem authentifié D-08, atterrissage
#   non bloquant D-09, message uniforme D-03/D-17 sur token mort.
#
#   Il ne prouve PAS la traversée du token par le mail de confirmation de
#   l'inscription : aucun accès IMAP, et le contournement `generate_link`
#   ferait emprunter un chemin qu'aucun vrai utilisateur n'emprunte. Le
#   testage s'arrête au hand-off sessionStorage (D-06) ; le redeem est
#   effectué par un compte pré-confirmé via l'Admin GoTrue (grant password,
#   A1 — vérifié par le smoke du plan 01).
#
#   C'est l'analogue de `test-dispatch-push.sh` pour l'application : un run
#   séparé, documenté, qui exige une ressource réelle (stack déployée) et qui
#   REFUSE sans elle — jamais de skip silencieux (JT-03). La suite e2e
#   standard reste 100 % verte sans ce script (JT-01).
#
# VARIABLES D'ENVIRONNEMENT
#   STACK_ENV      fichier .env de la stack (défaut : supabase-project/.env)
#   API            URL publique de la stack (défaut : SUPABASE_PUBLIC_URL)
#   E2E_BASE_URL   URL du frontend déployé (défaut : SITE_URL du .env)
#   E2E_MAIL_DOMAIN  domaine des emails e2e (défaut : valeur du .env ou
#                  ensemble.jeremymaillot.fr — EE-01, aucun DNS requis)
#
# DISCIPLINE DES SECRETS (§2.7 H, JT-04)
#   La clé secrète ne quitte JAMAIS ce shell : création et purge des comptes
#   passent par lib-smoke-accounts.sh, où elle ne circule que via un fichier
#   `curl -K` en 0600. Le processus Node de Playwright ne reçoit que des
#   valeurs publiques ou éphémères (URL, token d'invitation, identifiants des
#   comptes jetables du run) — jamais SUPABASE_SECRET_KEY.
#
# AUCUNE CLÉ N'EST AFFICHÉE. Le rapport nomme les comptes jetables du run,
# leurs codes HTTP, et le verdict de la purge — jamais une valeur secrète.

set -eu

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
REPO_DIR="$(CDPATH='' cd -- "$SCRIPT_DIR/.." && pwd)"

STACK_ENV="${STACK_ENV:-$REPO_DIR/supabase-project/.env}"
API="${API:-}"
E2E_BASE_URL="${E2E_BASE_URL:-}"

if [ ! -f "$STACK_ENV" ]; then
  echo "test-join-token-real.sh: $STACK_ENV introuvable." >&2
  echo "  Le run réel exige le .env de la stack (il porte SUPABASE_SECRET_KEY," >&2
  echo "  nécessaire à la création ET à la purge vérifiée des comptes)." >&2
  echo "  Lancez depuis l'hôte de la stack :" >&2
  echo "    sh scripts/test-join-token-real.sh" >&2
  echo "  Autre emplacement : STACK_ENV=/chemin/vers/.env" >&2
  exit 1
fi

# Lecture du .env sans le sourcer — même canal que le smoke (§2.7 H).
stack_value() {
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$STACK_ENV" \
    | head -n 1 | sed 's/[[:space:]]*$//; s/^"\(.*\)"$/\1/'
}

if [ -z "$API" ]; then
  API="$(stack_value SUPABASE_PUBLIC_URL)"
fi
if [ -z "$API" ]; then
  echo "test-join-token-real.sh: aucune URL de stack." >&2
  echo "  Ni API, ni SUPABASE_PUBLIC_URL dans $STACK_ENV." >&2
  echo "  API=https://api.exemple.fr sh scripts/test-join-token-real.sh" >&2
  exit 1
fi
API="${API%/}"

if [ -z "$E2E_BASE_URL" ]; then
  E2E_BASE_URL="$(stack_value SITE_URL)"
fi
if [ -z "$E2E_BASE_URL" ]; then
  echo "test-join-token-real.sh: aucune URL de frontend." >&2
  echo "  Ni E2E_BASE_URL, ni SITE_URL dans $STACK_ENV." >&2
  echo "  La spec ouvre le VRAI navigateur contre le frontend déployé — sans" >&2
  echo "  cette URL, le run n'a pas de sens : refus, jamais de skip (JT-03)." >&2
  echo "  E2E_BASE_URL=https://app.exemple.fr sh scripts/test-join-token-real.sh" >&2
  exit 1
fi

PUBLISHABLE_KEY="${PUBLISHABLE_KEY:-$(stack_value SUPABASE_PUBLISHABLE_KEY)}"
if [ -z "$PUBLISHABLE_KEY" ]; then
  echo "test-join-token-real.sh: SUPABASE_PUBLISHABLE_KEY absent de $STACK_ENV." >&2
  exit 1
fi

# --- Refus sans stack joignable (JT-01, JT-03) --------------------------------
# Une sonde qui échoue est une cause nommée, pas un skip : le run s'arrête
# avant tout compte créé.
# La sonde porte la clé publiable : la gateway exige apikey sur toute route
# /auth, un curl nu prend un 401 avant même GoTrue (constaté au run réel
# du 2026-11-09). La clé publique n'est pas un secret (§2.7 H).
health_code="$(curl -sS -o /dev/null -w '%{http_code}' "$API/auth/v1/health" \
  -H "apikey: $PUBLISHABLE_KEY" 2>/dev/null || printf '000')"
if [ "$health_code" != "200" ]; then
  echo "test-join-token-real.sh: la stack ne répond pas ($API/auth/v1/health → code $health_code)." >&2
  echo "  Le run réel exige une stack déployée joignable (DS-01) : vérifiez que" >&2
  echo "  la stack est démarrée et que API pointe sa gateway publique." >&2
  exit 1
fi

# --- Bibliothèque comptes e2e (CS-04, JT-04) ----------------------------------
# Un seul chemin d'accès à SUPABASE_SECRET_KEY : création, session et purge
# passent toutes par la bibliothèque, jamais réimplémentées ici.
. "$SCRIPT_DIR/lib-smoke-accounts.sh"
SMOKE_API="$API"
SMOKE_STACK_ENV="$STACK_ENV"
SMOKE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY"

PASSWORD='Mot-de-passe-de-test-2026!'
SMOKE_ACCOUNT_PASSWORD="$PASSWORD"

# Runid avec entropy (Pitfall 3) : deux runs à la même seconde ne collisionnent
# pas ; le préfixe e2e+ isole ces adresses de tout vrai destinataire (EE-01).
RUN_ID="$(date +%s)-$$"
INVITER_MAIL="e2e+${RUN_ID}-1@${E2E_MAIL_DOMAIN:-$(smoke_accounts_domain)}"
JOIN_MAIL="e2e+${RUN_ID}-2@${E2E_MAIL_DOMAIN:-ensemble.jeremymaillot.fr}"
INVITER_NAME="Fernande Inviteuse"
JOIN_NAME="Gustave Invite"

smoke_accounts_init

SPEC_STATUS=0
INVITER_JWT=''
HOUSEHOLD_ID=''
TOKEN=''
PURGE_KO=0

cleanup() {
  code=$?
  set +e
  echo
  echo "── Nettoyage (run $RUN_ID)"

  # Le(s) foyer(s) d'abord : `households.created_by` est en `on delete set
  # null`, le foyer survivrait à la suppression du compte. La spec peut avoir
  # créé un SECOND foyer via l'UI (point 1 JT-02) : la liste porte sur les
  # appartenances de l'invitant, elle couvre les deux sans les deviner.
  if [ -n "$INVITER_JWT" ]; then
    hresp="$(curl -sS -w '\n%{http_code}' "$API/rest/v1/households" \
      -H "apikey: $PUBLISHABLE_KEY" -H "Authorization: Bearer $INVITER_JWT" 2>/dev/null \
      || printf '\n000')"
    hcode="$(printf '%s' "$hresp" | tail -n 1)"
    hbody="$(printf '%s' "$hresp" | sed '$d')"
    if [ "$hcode" = "200" ]; then
      printf '%s' "$hbody" | grep -o '"id": *"[^"]*"' \
        | sed 's/^"id": *"//; s/"$//' >"$SMOKE_LIB_TMP/foyers-du-run"
      while IFS= read -r hid; do
        [ -n "$hid" ] || continue
        hdel="$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE \
          "$API/rest/v1/households?id=eq.$hid" \
          -H "apikey: $PUBLISHABLE_KEY" -H "Authorization: Bearer $INVITER_JWT" 2>/dev/null || printf '000')"
        case "$hdel" in
          200|204) echo "   ✓ foyer $hid supprimé" ;;
          *) echo "   ! foyer $hid non supprimé (code $hdel)" >&2 ;;
        esac
      done <"$SMOKE_LIB_TMP/foyers-du-run"
    else
      echo "   ! foyers non listés (code $hcode) : vérifiez Studio s'il en reste" >&2
    fi
  fi

  # Détection résiduelle (EE-02) : les comptes e2e hors de ce run sont
  # SIGNALÉS, jamais supprimés par ce run.
  if residus="$(smoke_accounts_list 2>/dev/null)" && [ -n "$residus" ]; then
    echo "   ! comptes e2e résiduels hors de ce run (à traiter à la main) :" >&2
    printf '     %s\n' "$residus" >&2
  fi

  # Purge vérifiée (§2.7 F) : re-delete → 404 exigé pour chaque compte du run.
  # Un compte qui survit à son run fait échouer le script, même si la spec
  # est verte (T-39-08).
  if [ -s "$SMOKE_ACCOUNTS_LOG" ]; then
    if smoke_accounts_purge "$RUN_ID"; then
      echo "   ✓ comptes purgés, purge prouvée (re-delete → 404)"
    else
      echo "   ✗ purge incomplète : un compte du run a survécu (voir ci-dessus)" >&2
      PURGE_KO=1
    fi
  else
    echo "   (aucun compte créé, rien à purger)"
  fi
  smoke_accounts_tmp_clean

  if [ "$PURGE_KO" -eq 1 ]; then
    exit 1
  fi
  # Le code de sortie reste celui de la spec : les deux verdicts (spec et
  # purge) sont rapportés, aucun des deux n'est muet (§2.7 F).
  exit "$code"
}
trap cleanup EXIT

echo "Spec e2e réelle join-token — frontend $E2E_BASE_URL, stack $API"
echo "Run $RUN_ID. Comptes jetables : $INVITER_MAIL (invitante $INVITER_NAME), $JOIN_MAIL (invité $JOIN_NAME)."

# --- Préparation : comptes, foyer, token --------------------------------------
# La même chaîne que le smoke : création admin (email_confirm:true), session
# par grant password (A1), foyer via `create_household`, token via la Edge
# `household-invite`. La spec, elle, ne touche jamais à l'Admin.
if ! smoke_accounts_create "$RUN_ID" 1 "$INVITER_NAME"; then
  echo "test-join-token-real.sh: création du compte invitant refusée (voir le corps nommé ci-dessus)." >&2
  exit 1
fi
INVITER_MAIL="$SMOKE_CREATED_EMAIL"
if ! smoke_accounts_session "$INVITER_MAIL" "$PASSWORD"; then
  echo "test-join-token-real.sh: session du compte invitant impossible (grant_type=password, A1)." >&2
  exit 1
fi
INVITER_JWT="$SMOKE_SESSION_JWT"
echo "   ✓ invitante créée et connectée (grant password)"

if ! smoke_accounts_create "$RUN_ID" 2 "$JOIN_NAME"; then
  echo "test-join-token-real.sh: création du compte invité refusée (voir le corps nommé ci-dessus)." >&2
  exit 1
fi
JOIN_MAIL="$SMOKE_CREATED_EMAIL"
echo "   ✓ invité créé"

# Foyer + token via la même chaîne que le smoke (étapes 3 et 7). La clé
# publiable passe en argv — ce n'est pas un secret (§2.7 H) ; le JWT de
# session est éphémère et meurt avec le run.
hresp="$(curl -sS -w '\n%{http_code}' -X POST "$API/rest/v1/rpc/create_household" \
  -H "apikey: $PUBLISHABLE_KEY" -H "Authorization: Bearer $INVITER_JWT" \
  -H 'Content-Type: application/json' -H 'Prefer: return=representation' \
  --data '{"p_name":"Foyer d’échange e2e","p_avatar_color":"accent"}' 2>/dev/null \
  || printf '\n000')"
hcode="$(printf '%s' "$hresp" | tail -n 1)"
hbody="$(printf '%s' "$hresp" | sed '$d')"
HOUSEHOLD_ID="$(printf '%s' "$hbody" | sed -n 's/.*"household": *{[^}]*"id": *"\([^"]*\)".*/\1/p' | head -n 1)"
if [ "$hcode" != "200" ] && [ "$hcode" != "201" ] || [ -z "$HOUSEHOLD_ID" ]; then
  echo "test-join-token-real.sh: création du foyer impossible (code $hcode) : $hbody" >&2
  exit 1
fi
echo "   ✓ foyer d'échange créé ($HOUSEHOLD_ID)"

tresp="$(curl -sS -w '\n%{http_code}' -X POST "$API/functions/v1/household-invite" \
  -H "apikey: $PUBLISHABLE_KEY" -H "Authorization: Bearer $INVITER_JWT" \
  -H 'Content-Type: application/json' \
  --data "{\"action\":\"create\",\"householdId\":\"$HOUSEHOLD_ID\"}" 2>/dev/null \
  || printf '\n000')"
tcode="$(printf '%s' "$tresp" | tail -n 1)"
tbody="$(printf '%s' "$tresp" | sed '$d')"
TOKEN="$(printf '%s' "$tbody" | sed -n 's/.*"token": *"\([^"]*\)".*/\1/p' | head -n 1)"
if [ "$tcode" != "200" ] && [ "$tcode" != "201" ] || [ -z "$TOKEN" ]; then
  echo "test-join-token-real.sh: aucun token émis (code $tcode) : $tbody" >&2
  case "$tbody" in
    *HMAC*) echo "  INVITE_TOKEN_HMAC_SECRET est absent ou trop court." >&2 ;;
  esac
  exit 1
fi
echo "   ✓ token d'invitation émis (${#TOKEN} caractères)"

# --- Export vers Playwright : valeurs publiques/éphémères UNIQUEMENT ----------
# (JT-04, T-39-07) : SUPABASE_SECRET_KEY reste dans ce shell. Les
# identifiants des comptes jetables meurent avec le run.
export E2E_BASE_URL
export E2E_JOIN_TOKEN="$TOKEN"
export E2E_JOIN_HOUSEHOLD_ID="$HOUSEHOLD_ID"
export E2E_JOIN_EMAIL="$JOIN_MAIL"
export E2E_JOIN_PASSWORD="$PASSWORD"
export E2E_JOIN_INVITER_NAME="$(printf '%s' "$INVITER_NAME" | cut -d' ' -f1)"
export E2E_INVITER_EMAIL="$INVITER_MAIL"
export E2E_INVITER_PASSWORD="$PASSWORD"
export E2E_API_URL="$API"
export E2E_PUBLISHABLE_KEY="$PUBLISHABLE_KEY"

# --- Run de la spec : UN seul projet (Pitfall 4 / T-39-06) --------------------
# La config Playwright définit chromium ET mobile : sans `--project`, la spec
# tournerait 2×, le redeem serait consommé au premier passage et le second
# créerait des comptes en double. Le `cd app` du sous-shell fait résoudre la
# config ET le chemin de la spec depuis la racine `app/` (découverte cwd).
cd "$REPO_DIR"
if (cd app && npx playwright test e2e/join-token-real.spec.ts --project=chromium); then
  SPEC_STATUS=0
else
  SPEC_STATUS=$?
fi

if [ "$SPEC_STATUS" -eq 0 ]; then
  echo
  echo "Spec réelle : les 6 points JT-02 sont verts (voir le rapport Playwright)."
else
  echo
  echo "Spec réelle : ÉCHEC (code $SPEC_STATUS) — voir le rapport Playwright." >&2
fi
