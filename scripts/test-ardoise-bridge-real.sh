#!/usr/bin/env sh
# scripts/test-ardoise-bridge-real.sh
# Preuve prod RÉELLE du bridge ardoise (phase 43) contre la stack déployée.
#
#   sh scripts/test-ardoise-bridge-real.sh
#   STACK_ENV=/chemin/.env E2E_BASE_URL=https://app.exemple.fr sh scripts/test-ardoise-bridge-real.sh
#
# CE QUE CE SCRIPT PROUVE, ET CE QU'IL NE PROUVE PAS
#   La suite e2e standard tourne en mode démonstration (build + preview, aucun
#   backend) : elle prouve le UI, pas la chaîne réelle. Ce script, lui, traverse
#   le fil HTTP complet du bridge ardoise (phase 40) contre la stack déployée —
#   vraies Edge `ardoise-invite` / `household-invite`, vrai PostgREST, vrai
#   GoTrue — sans JAMAIS appeler les RPC PostgREST `create_household_bridge_token`
#   ou `redeem_household_invite_token` (service_role only : le script ne parle
#   qu'aux Edges, canal exact de l'app réelle, app/src/lib/invites.ts:17-35).
#
#   Il prouve : le happy path (code de partage ardoise → `household-token` →
#   `household-invite` action `redeem` → adhésion foyer + réconciliation des
#   participations `guest:` en `membre:`), quatre négatifs red-team vus rouges
#   (replay → 410 « épuisé », token muté → 404 « inconnu », token expiré → 410
#   après l'attente RÉELLE des 15 minutes en dur de 0180b, cross-household via
#   la borne de la réconciliation), et l'état après coup par psql borné par
#   foyer. Chaque appel HTTP est attribuable par une ligne `ÉTAPE n |` (méthode,
#   statut, champs clés non sensibles, estampille du build) — l'attribution
#   PROOF-04 est portée par la sortie curl elle-même, PAS par la sonde
#   `net._http_response` de test-dispatch-push.sh : aucun pg_net sur le chemin
#   bridge (43-RESEARCH Summary §2).
#
#   Il ne prouve PAS le dialog de copie du lien, le rendu du panneau invité,
#   ni l'e2e navigateur du parcours (W2, déclenché par besoin — PROOF-07) ;
#   l'estampille couvre le build frontend via `/version.json`, l'estampille de
#   l'Edge n'a pas de canal dédié. Ces exclusions sont consignées dans la
#   section « Ce qui n'est PAS prouvé » du document auto-rédigé.
#
#   C'est le frère de `test-join-token-real.sh` : un script par preuve à
#   ressource réelle (convention dépôt) — jamais une extension inline. Il exige
#   une stack déployée et REFUSE sans elle — jamais de skip silencieux.
#   Durée assumée : ~20 minutes par run (attente réelle de l'expiration, D-03).
#
# VARIABLES D'ENVIRONNEMENT
#   STACK_ENV      fichier .env de la stack (défaut : supabase-project/.env)
#   API            URL publique de la stack (défaut : SUPABASE_PUBLIC_URL)
#   E2E_BASE_URL   URL du frontend déployé (défaut : SITE_URL du .env)
#
# DISCIPLINE DES SECRETS (§2.7 H, PROOF-04)
#   La clé secrète et les JWT de session ne quittent JAMAIS ce shell en argv ni
#   en variable d'environnement : chaque appel HTTP porte ses en-têtes via un
#   fichier `curl -K` en 0600, et les corps porteurs de token/code passent par
#   `--data @fichier` 0600, dans un répertoire mktemp supprimé au trap EXIT.
#   Aucune valeur secrète (token bridge, guest_ticket, code ardoise, JWT, clés)
#   n'est imprimée dans la sortie ni dans docs/BRIDGE-ARDOISE-PREUVE.md — seuls
#   les champs non sensibles (household_id, ardoise_id, already_member…).

set -eu

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
REPO_DIR="$(CDPATH='' cd -- "$SCRIPT_DIR/.." && pwd)"

STACK_ENV="${STACK_ENV:-$REPO_DIR/supabase-project/.env}"
API="${API:-}"
E2E_BASE_URL="${E2E_BASE_URL:-}"

if [ ! -f "$STACK_ENV" ]; then
  echo "test-ardoise-bridge-real.sh: REFUS — $STACK_ENV introuvable." >&2
  echo "  Le run réel exige le .env de la stack (il porte SUPABASE_SECRET_KEY," >&2
  echo "  nécessaire à la création ET à la purge vérifiée des comptes e2e)." >&2
  echo "  Lancez depuis l'hôte de la stack :" >&2
  echo "    sh scripts/test-ardoise-bridge-real.sh" >&2
  echo "  Autre emplacement : STACK_ENV=/chemin/vers/.env" >&2
  exit 1
fi

# Lecture du .env sans le sourcer — même canal que les sœurs (§2.7 H).
stack_value() {
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$STACK_ENV" \
    | head -n 1 | sed 's/[[:space:]]*$//; s/^"\(.*\)"$/\1/'
}

if [ -z "$API" ]; then
  API="$(stack_value SUPABASE_PUBLIC_URL)"
fi
if [ -z "$API" ]; then
  echo "test-ardoise-bridge-real.sh: REFUS — aucune URL de stack." >&2
  echo "  Ni API, ni SUPABASE_PUBLIC_URL dans $STACK_ENV." >&2
  echo "  API=https://api.exemple.fr sh scripts/test-ardoise-bridge-real.sh" >&2
  exit 1
fi
API="${API%/}"

if [ -z "$E2E_BASE_URL" ]; then
  E2E_BASE_URL="$(stack_value SITE_URL)"
fi
if [ -z "$E2E_BASE_URL" ]; then
  echo "test-ardoise-bridge-real.sh: REFUS — aucune URL de frontend." >&2
  echo "  Ni E2E_BASE_URL, ni SITE_URL dans $STACK_ENV." >&2
  exit 1
fi
E2E_BASE_URL="${E2E_BASE_URL%/}"

PUBLISHABLE_KEY="${PUBLISHABLE_KEY:-$(stack_value SUPABASE_PUBLISHABLE_KEY)}"
if [ -z "$PUBLISHABLE_KEY" ]; then
  echo "test-ardoise-bridge-real.sh: REFUS — SUPABASE_PUBLISHABLE_KEY absent de $STACK_ENV." >&2
  exit 1
fi

# --- Refus sans stack joignable ------------------------------------------------
# Une sonde qui échoue est une cause nommée, pas un skip : le run s'arrête
# avant tout compte créé (§2.7 F). La clé publiable n'est pas un secret.
# `curl -w` imprime `000` même sur échec réseau (exit ≠ 0) : le `||` ajoutait
# un second `000` (« 000000 », vu au run réel). Le statut se lit seul, jamais
# complété par un second printf.
http_code_ou_000() {
  code="$(curl "$@" || true)"
  [ -n "$code" ] || code=000
  printf '%s' "$code"
}

health_code="$(http_code_ou_000 -sS -o /dev/null -w '%{http_code}' "$API/auth/v1/health" \
  -H "apikey: $PUBLISHABLE_KEY" 2>/dev/null)"
if [ "$health_code" != "200" ]; then
  echo "test-ardoise-bridge-real.sh: REFUS — la stack ne répond pas ($API/auth/v1/health → code $health_code)." >&2
  echo "  Le run réel exige une stack déployée joignable : vérifiez que la stack" >&2
  echo "  est démarrée et que API pointe sa gateway publique." >&2
  exit 1
fi

# --- Bibliothèque comptes e2e (PROOF-04) ---------------------------------------
# Un seul chemin d'accès à SUPABASE_SECRET_KEY : création, session et purge
# passent toutes par la bibliothèque, jamais réimplémentées ici.
. "$SCRIPT_DIR/lib-smoke-accounts.sh"
SMOKE_API="$API"
SMOKE_STACK_ENV="$STACK_ENV"
SMOKE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY"

PASSWORD='Mot-de-passe-de-test-2026!'
SMOKE_ACCOUNT_PASSWORD="$PASSWORD"

# Runid avec entropy : deux runs à la même seconde ne collisionnent pas ; le
# préfixe e2e+ isole ces adresses de tout vrai destinataire (EE-01).
RUN_ID="$(date +%s)-$$"

smoke_accounts_init
RUN_LOG="$SMOKE_LIB_TMP/run.log"
: >"$RUN_LOG"

# --- État du run ---------------------------------------------------------------
PAYEUR_JWT=''
INVITE_JWT=''
INVITE_UID=''
FOYER_A=''
FOYER_B=''
ARDOISE_ID=''
GUEST_ID=''
MEMBRE_A_ID=''
ETAMPILLE=''
X_APP_VERSION=''
STAMP_COURT='estampille indisponible'
DECALAGES=0
GLOBAL_KO=0
KO_RAISON=''
CORPS_N=0
ETAPES_N=0
FOYERS_LISTE="$SMOKE_LIB_TMP/foyers-du-run"
NEG_LOG="$SMOKE_LIB_TMP/negatifs.log"
SQL_LOG="$SMOKE_LIB_TMP/sql-apres-coup.log"

# Fichier des en-têtes de session pour curl -K (0600) — le JWT ne passe jamais
# en argv ni en variable d'environnement (§2.7 H : `ps` ne doit rien montrer).
config_session() {
  CORPS_N=$((CORPS_N + 1))
  file="$SMOKE_LIB_TMP/session-$CORPS_N"
  {
    printf 'header = "apikey: %s"\n' "$PUBLISHABLE_KEY"
    printf 'header = "Authorization: Bearer %s"\n' "$1"
  } >"$file"
  chmod 600 "$file"
  printf '%s' "$file"
}

# Corps de requête porteur d'un secret (token, code) — fichier 0600, passé par
# --data @fichier, jamais en argv.
corps_secret() {
  CORPS_N=$((CORPS_N + 1))
  file="$SMOKE_LIB_TMP/corps-$CORPS_N"
  printf '%s\n' "$1" >"$file"
  chmod 600 "$file"
  printf '%s' "$file"
}

# POST JSON : sortie corps dans $4, statut sur stdout, derniers en-têtes
# conservés pour la garde D-10. `curl` ne suit PAS les redirect (aucun -L) :
# un 3xx est un décalage de chemin, jamais un succès.
post_json() {
  url="$1" config="$2" corps="$3" out="$4"
  if [ -n "$config" ] && [ -n "$corps" ]; then
    code="$(http_code_ou_000 -sS -D "$SMOKE_LIB_TMP/derniers-headers" -o "$out" -w '%{http_code}' \
      -X POST -H 'content-type: application/json' -K "$config" --data @"$corps" "$url" 2>"$SMOKE_LIB_TMP/curl-err")"
  elif [ -n "$config" ]; then
    code="$(http_code_ou_000 -sS -D "$SMOKE_LIB_TMP/derniers-headers" -o "$out" -w '%{http_code}' \
      -X POST -H 'content-type: application/json' -K "$config" "$url" 2>"$SMOKE_LIB_TMP/curl-err")"
  else
    code="$(http_code_ou_000 -sS -D "$SMOKE_LIB_TMP/derniers-headers" -o "$out" -w '%{http_code}' \
      -X POST -H 'content-type: application/json' --data @"$corps" "$url" 2>"$SMOKE_LIB_TMP/curl-err")"
  fi
  # Un échec réseau (000) n'est jamais muet : la cause curl est imprimée.
  if [ "$code" = "000" ] && [ -s "$SMOKE_LIB_TMP/curl-err" ]; then
    cat "$SMOKE_LIB_TMP/curl-err" >&2
  fi
  printf '%s' "$code"
}

# GET authentifié : statut sur stdout, corps dans $2, config -K dans $3.
get_json() {
  http_code_ou_000 -sS -D "$SMOKE_LIB_TMP/derniers-headers" -o "$2" -w '%{http_code}' \
    -K "$3" "$1" 2>"$SMOKE_LIB_TMP/curl-err"
}

# --- Reporting attribuable (PROOF-01, PROOF-04) --------------------------------
# Chaque appel HTTP du script passe par `etape` : la sortie imprime une ligne
# « ÉTAPE n | MÉTHODE <url> | HTTP <statut> | champs clés | estampille ». Les
# champs n'embarquent JAMAIS une valeur secrète — seuls les identifiants non
# sensibles renvoyés par le serveur (household_id, ardoise_id, already_member).
etape() {
  ETAPES_N=$((ETAPES_N + 1))
  ligne="ÉTAPE $1 | $2 $3 | HTTP $4 | $5 | estampille: $STAMP_COURT"
  printf '%s\n' "$ligne"
  printf '%s\n' "$ligne" >>"$RUN_LOG"
}

# Signal D-10 (PROOF-07) : un comportement HTTP qui s'écarte du chemin de l'app
# réelle (statut inattendu, CORS absent, redirect non suivi, 429 hors budget)
# n'est PAS un verdict — c'est un signal mécanique pour un verdict humain.
signal_d10() {
  DECALAGES=$((DECALAGES + 1))
  printf 'DÉCALAGE CHEMIN APP | %s\n' "$1" >&2
  printf 'DÉCALAGE CHEMIN APP | %s\n' "$1" >>"$RUN_LOG"
}

verdict_vert() {
  printf '   ✓ %s\n' "$1"
  # Chaque verdict vert est consigné pour les sections 2 et 3 du document
  # (aucun succès muet : le doc cite la ligne, il ne la résume pas).
  printf 'VERDICT VERT | %s\n' "$1" >>"$RUN_LOG"
}

rouge() {
  GLOBAL_KO=1
  KO_RAISON="$1"
  printf '   ✗ %s\n' "$1" >&2
  printf 'VERDICT ROUGE | %s\n' "$1" >>"$RUN_LOG"
}

# Garde D-10 factuelle sur le dernier appel : CORS présent (sur les Edge
# Functions uniquement — un RPC PostgREST appelé sans en-tête Origin ne renvoie
# pas d'ACAO en prod, ce n'est pas un décalage de chemin : calibrage affiné au
# run réel du 2026-11-11), pas de 3xx, pas de 429 hors budget.
garde_app() {
  statut="$1" url="$2"
  case "$url" in
    */functions/*)
      if ! grep -qi '^access-control-allow-origin' "$SMOKE_LIB_TMP/derniers-headers" 2>/dev/null; then
        signal_d10 "en-tête access-control-allow-origin absent sur la réponse HTTP $statut"
      fi
      ;;
  esac
  case "$statut" in
    3*) signal_d10 "redirect non suivi (HTTP $statut) — l'app réelle ne suit pas de redirect ici" ;;
    429) signal_d10 "429 rate-limit inattendu — un run nerveux ne prouve rien, espacez les appels" ;;
  esac
}

# --- Estampille du build (PROOF-01) --------------------------------------------
# Canal officiel du dépôt : GET $E2E_BASE_URL/version.json + en-tête
# X-App-Version (app/nginx.conf, app/Dockerfile). Le canal est best-effort et
# SON ABSENCE EST NOMMÉE — jamais un succès muet (§2.7 F) : si le frontend n'est
# pas joignable, la ligne ci-dessous le dit et le doc le consigne.
estampille() {
  stamp_body="$SMOKE_LIB_TMP/version.json"
  stamp_headers="$SMOKE_LIB_TMP/version-headers"
  stamp_code="$(http_code_ou_000 -sS -D "$stamp_headers" -o "$stamp_body" -w '%{http_code}' \
    "$E2E_BASE_URL/version.json" 2>/dev/null)"
  if [ "$stamp_code" = "200" ]; then
    ETAMPILLE="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$stamp_body" | head -n 1)"
    X_APP_VERSION="$(grep -i '^x-app-version:' "$stamp_headers" 2>/dev/null \
      | sed 's/^[Xx]-[Aa]pp-[Vv]ersion: *//; s/[[:space:]]*$//' | head -n 1)"
    if [ -n "$X_APP_VERSION" ] && [ "$X_APP_VERSION" != "$ETAMPILLE" ]; then
      STAMP_COURT="frontend $ETAMPILLE / en-tête $X_APP_VERSION"
    else
      STAMP_COURT="frontend $ETAMPILLE"
    fi
    printf 'Estampille du build déployé : %s (%s/version.json)\n' "$STAMP_COURT" "$E2E_BASE_URL"
  else
    printf '! estampille frontend INDISPONIBLE : %s/version.json → code %s. Le canal' "$E2E_BASE_URL" "$stamp_code" >&2
    printf '\n  /version.json n'"'"'est pas joignable sur ce run — consigné dans « Ce qui n'"'"'est PAS prouvé ».\n' >&2
    printf 'ESTAMPILLE INDISPONIBLE | %s/version.json → HTTP %s\n' "$E2E_BASE_URL" "$stamp_code" >>"$RUN_LOG"
  fi
}

# --- Auto-rédaction du document de consignation (PROOF-05, D-07/D-08) ----------
# UN seul document réécrit à chaque run : docs/BRIDGE-ARDOISE-PREUVE.md. Le doc
# est écrit depuis le trap EXIT pour consigner aussi les runs avortés — jamais
# de succès muet, un run rouge laisse un doc qui dit ROUGE.
rediger_doc() {
  doc="$REPO_DIR/docs/BRIDGE-ARDOISE-PREUVE.md"
  mkdir -p "$REPO_DIR/docs"
  {
    printf '# BRIDGE-ARDOISE-PREUVE — Preuve prod du bridge ardoise (phase 43)\n'
    printf '\n'
    printf '**Run du :** %s (UTC, run %s)\n' "$(date -u '+%Y-%m-%d %H:%M:%S')" "$RUN_ID"
    printf '**Estampille du build frontend :** %s\n' "${ETAMPILLE:-indisponible}"
    printf '**Exigences couvertes :** PROOF-01..07\n'
    printf '\n'
    printf 'Document réécrit par `scripts/test-ardoise-bridge-real.sh` à CHAQUE run\n'
    printf '(D-07/D-08) — historique dans git. L'"'"'attribution PROOF-04 est portée par\n'
    printf 'la sortie curl par appel (méthode, statut, champs clés, estampille), pas\n'
    printf 'par la sonde `net._http_response` : aucun pg_net sur le chemin bridge.\n'
    printf '\n'
    printf '## 1. Chaîne HTTP, dans l'"'"'ordre, chaque étape citée\n'
    printf '\n'
    if [ -s "$RUN_LOG" ]; then
      printf '```\n'
      cat "$RUN_LOG"
      printf '```\n'
    else
      printf '_Aucune étape atteinte — le run a échoué avant le premier appel._\n'
    fi
    printf '\n'
    printf '## 2. Négatifs red-team (PROOF-02)\n'
    printf '\n'
    if [ -s "$NEG_LOG" ]; then
      printf 'Ordre fixe D-01/D-02 : replay → token muté → token expiré → cross-household.\n'
      printf '\n'
      printf '```\n'
      cat "$NEG_LOG"
      printf '```\n'
    else
      printf '_Négatifs non exécutés — run avorté avant la séquence red-team._\n'
    fi
    printf '\n'
    printf '## 3. Lecture SQL après coup (PROOF-03)\n'
    printf '\n'
    if [ -s "$SQL_LOG" ]; then
      printf 'Lectures psql.sh (stdin, rôle postgres) bornées par foyer du run.\n'
      printf '\n'
      printf '```\n'
      cat "$SQL_LOG"
      printf '```\n'
    else
      printf '_Lectures SQL après coup non exécutées — run avorté avant._\n'
    fi
    printf '\n'
    printf '## 4. Ce qui n'"'"'est PAS prouvé (D-09)\n'
    printf '\n'
    printf '%s\n' '- Le dialog de copie du lien et le rendu du panneau invité : surfaces UI'
    printf '  non couvertes — le script traverse le fil HTTP, pas le navigateur.\n'
    printf '%s\n' "- L'e2e navigateur du parcours invité (W2) : déclenché par besoin"
    printf '  (PROOF-07), jamais préventif — le verdict humain tranche si un seam\n'
    printf '  apparaît via les signaux DÉCALAGE CHEMIN APP.\n'
    printf '%s\n' "- L'estampille de l'Edge Function : pas de canal dédié — seule"
    printf '  l'"'"'estampille frontend (/version.json) est capturée. '
    if [ -n "$ETAMPILLE" ]; then
      printf 'Valeur de ce run : %s.\n' "$ETAMPILLE"
    else
      printf 'INDISPONIBLE sur ce run (canal non joignable — nommé plus haut).\n'
    fi
    printf '%s\n' "- Les signaux DÉCALAGE CHEMIN APP émis sur ce run : $DECALAGES"
    printf '\n'
    printf '## 5. Verdict + self-check\n'
    printf '\n'
    if [ "$GLOBAL_KO" -eq 0 ]; then
      printf '**Verdict du run : VERT** — tous les verdicts d'"'"'étape sont verts.\n'
    else
      printf '**Verdict du run : ROUGE** — %s\n' "$KO_RAISON"
    fi
    printf '\n'
    printf 'Self-check purge (PROOF-06) : %s\n' "${SELF_CHECK_PURGE:-non exécuté (run avorté avant la purge)}"
    if [ -n "${RESIDUS:-}" ]; then
      printf '\nComptes e2e résiduels hors de ce run (signalés, non supprimés — EE-02, à traiter à la main) :\n'
      printf '%s\n' "$RESIDUS" | while IFS= read -r r; do printf '%s\n' "- $r"; done
    fi
    printf '\n'
    printf '%s\n' '---'
    printf '*Phase 43 — généré automatiquement, aucune main humaine n'"'"'édite ce fichier.*\n'
  } >"$doc"
}

# --- Teardown (PROOF-06) -------------------------------------------------------
# Ordre : foyers éphémères (cascade SQL, §2.7 C — psql.sh stdin uniquement) →
# comptes e2e (re-delete → 404 exigé) → nettoyage du répertoire secrets → doc.
# Un foyer ou un compte qui survit à son run fait ÉCHOUER le script, même si le
# reste est vert (§2.7 F).
cleanup() {
  code=$?
  set +e
  echo
  echo "── Nettoyage (run $RUN_ID)"
  SELF_CHECK_PURGE="échec (voir les lignes ✗ ci-dessus)"
  purge_ko=0

  # Purge des foyers éphémères : DELETE FROM public.households (cascade sur
  # ardoises, expenses, participants, tokens, pont — FK `on delete cascade`).
  # Lecture des contrôles : foyer → 0 lignes attendu sur les tables métier.
  if [ -s "$FOYERS_LISTE" ]; then
    purge_sql="$SMOKE_LIB_TMP/purge-foyers.sql"
    : >"$purge_sql"
    while IFS= read -r hid; do
      [ -n "$hid" ] || continue
      printf "delete from public.households where id = :'foyer';\n" >>"$purge_sql"
    done <"$FOYERS_LISTE"
    purge_sql_controles="$SMOKE_LIB_TMP/purge-controles.sql"
    {
      printf "select 'expenses_restants', count(*) from public.expenses where household_id = :'foyer';\n"
      printf "select 'ardoises_restantes', count(*) from public.ardoises where household_id = :'foyer';\n"
      printf "select 'tokens_restants', count(*) from public.household_invite_tokens where household_id = :'foyer';\n"
    } >"$purge_sql_controles"
    while IFS= read -r hid; do
      [ -n "$hid" ] || continue
      # Une seule redirection d'entrée : le fichier SQL. Le `</dev/null` de
      # contexte, posé après, écrasait le stdin (run réel du 2026-11-11 : psql
      # ne lisait RIEN, sortie vide, « non supprimé » sans raison — et le
      # contrôle des orphelins passait faussement vert sur une sortie vide).
      del_out="$(sh "$SCRIPT_DIR/psql.sh" -v foyer="$hid" <"$purge_sql" 2>&1 || true)"
      if printf '%s' "$del_out" | grep -q '^DELETE 1'; then
        verdict_vert "foyer $hid supprimé (cascade)"
      else
        printf '   ! foyer %s non supprimé (sortie psql : %s)\n' "$hid" "${del_out:-<vide>}" >&2
        purge_ko=1
      fi
      ctrl_out="$(sh "$SCRIPT_DIR/psql.sh" -A -t -v foyer="$hid" <"$purge_sql_controles" 2>&1 || true)"
      # Sortie vide = échec inexpliqué, jamais un vert (§2.7 F). Chaque ligne
      # est « <nom>|<n> » (-A -t) : un n ≠ 0 est un orphelin.
      if [ -z "$ctrl_out" ]; then
        printf '   ! contrôle orphelins %s sans sortie — psql a échoué\n' "$hid" >&2
        purge_ko=1
      elif printf '%s' "$ctrl_out" | grep -E '\|[1-9]' >/dev/null; then
        printf '   ! orphelins après cascade pour %s : %s\n' "$hid" "$(printf '%s' "$ctrl_out" | grep -E '\|[1-9]' | tr '\n' ' ')" >&2
        purge_ko=1
      else
        verdict_vert "foyer $hid : 0 ligne résiduelle (expenses/ardoises/tokens)"
      fi
    done <"$FOYERS_LISTE"
  fi

  # Détection résiduelle (EE-02) : les comptes e2e hors de ce run sont
  # SIGNALÉS, jamais supprimés par ce run.
  RESIDUS=''
  if residus="$(smoke_accounts_list 2>/dev/null)" && [ -n "$residus" ]; then
    RESIDUS="$residus"
    echo "   ! comptes e2e résiduels hors de ce run (à traiter à la main) :" >&2
    printf '     %s\n' "$residus" >&2
  fi

  # Purge comptes — filet SQL préalable : tout foyer dont un compte du run
  # est membre est supprimé (cascade), même si sa capture a échoué avant
  # l'enregistrement dans FOYERS_LISTE. Sinon la suppression Admin du compte
  # échoue en 500 (FK household_members.user_id on delete set null, 0166,
  # + CHECK chk_members_managed_child, 0145 : ligne membre admin sans
  # user_id = contrainte violée). Borné aux uids de CE run (pas
  # d'interpolation libre, §2.7 D.2), via stdin uniquement.
  if [ -s "$SMOKE_ACCOUNTS_LOG" ]; then
    uid1="$(sed -n '1p' "$SMOKE_ACCOUNTS_LOG" | cut -f1)"
    uid2="$(sed -n '2p' "$SMOKE_ACCOUNTS_LOG" | cut -f1)"
    filet_sql="$SMOKE_LIB_TMP/purge-filet.sql"
    printf "delete from public.households h where exists (select 1 from public.household_members m where m.household_id = h.id and m.user_id::text in (:'u1', :'u2'));\n" >"$filet_sql"
    filet_out="$(sh "$SCRIPT_DIR/psql.sh" -v u1="$uid1" -v u2="$uid2" <"$filet_sql" 2>&1 || true)"
    if printf '%s' "$filet_out" | grep -q '^DELETE'; then
      verdict_vert "filet purge foyers des comptes du run : $filet_out"
    else
      printf '   ! filet purge foyers sans résultat attendu : %s\n' "${filet_out:-<vide>}" >&2
      purge_ko=1
    fi
  fi

  # Purge vérifiée (§2.7 F) : re-delete → 404 exigé pour chaque compte du run.
  if [ -s "$SMOKE_ACCOUNTS_LOG" ]; then
    if smoke_accounts_purge "$RUN_ID"; then
      verdict_vert "comptes purgés, purge prouvée (re-delete → 404)"
    else
      printf '   ✗ purge incomplète : un compte du run a survécu\n' >&2
      purge_ko=1
    fi
  else
    echo "   (aucun compte créé, rien à purger)"
  fi
  if [ "$purge_ko" -eq 0 ]; then
    SELF_CHECK_PURGE="purgé et prouvé (foyers → 0 lignes résiduelles, comptes re-delete → 404)"
  fi

  rediger_doc

  smoke_accounts_tmp_clean

  if [ "$purge_ko" -eq 1 ]; then
    exit 1
  fi
  # Le code de sortie reste celui du run : les deux verdicts (run et purge)
  # sont rapportés, aucun des deux n'est muet (§2.7 F).
  exit "$code"
}
trap cleanup EXIT

echo "Preuve prod du bridge ardoise — stack $API"
echo "Run $RUN_ID. Deux comptes jetables e2e+$RUN_ID-{1,2}. Durée attendue ~20 min (attente réelle de l'expiration, D-03)."

# --- Estampille du build déployé ------------------------------------------------
estampille

# ============================================================================
# FIXTURES → HAPPY PATH (tâche 2) — chaque étape passe par `etape`, canal
# exact de l'app réelle : Edge `ardoise-invite`, Edge `household-invite`,
# PostgREST RPC (`create_household`, `create_expense`). AUCUN appel direct
# aux RPC service_role `create_household_bridge_token` /
# `redeem_household_invite_token` (D-06 : le script ne parle qu'aux Edges).
# ============================================================================

# Extraction d'une valeur JSON chaîne par sa clé (les champs captés ici ne
# sont jamais des secrets — les secrets restent dans les fichiers 0600).
json_val() {
  printf '%s' "$1" | grep -o "\"$2\": *\"[^\"]*\"" | head -n 1 \
    | sed "s/\"$2\": *\"//; s/\"$//"
}

# Extraction d'un id métier PAR PRÉFIXE — l'ordre des objets dans une réponse
# (create_household renvoie foyer + membre) n'est PAS contractuel, et l'inversion
# au run réel (p_household_id = member_…) a causé un 403 à l'étape 6. Les ids
# portent des préfixes univoques (0001 : new_id préfixe), on capture par eux.
json_id_prefixe() {
  # Le préfixe passé en $2 se termine DÉJÀ par l'underscore de new_id
  # (0001 : `p_prefix || '_'`) — aucun séparateur ajouté ici.
  printf '%s' "$1" | grep -o "\"id\": *\"$2[^\"]*\"" | head -n 1 \
    | sed 's/"id": *"//; s/"$//'
}

# Fichier -K portant la seule clé publiable (pas un secret : §2.7 H ne
# l'exclut pas d'argv, mais le canal -K uniformise tous les appels).
config_pub="$SMOKE_LIB_TMP/config-pub"
printf 'header = "apikey: %s"\n' "$PUBLISHABLE_KEY" >"$config_pub"
chmod 600 "$config_pub"

# Budget rate-limit Edge : 8/min/IP par action (`household-token`,
# `redeem-guest`, `redeem`). Le script espace ses appels répétés d'une même
# action de 10 s minimum — 6/min maximum, jamais un 429.
attend_budget() {
  sleep 10
}

# --- (1) Deux comptes e2e (D-04) ---------------------------------------------
if ! smoke_accounts_create "$RUN_ID" 1 "Payeur e2e"; then
  rouge "création du compte payeur impossible"
  exit 1
fi
PAYEUR_UID="$SMOKE_CREATED_ID"
if ! smoke_accounts_create "$RUN_ID" 2 "Invité e2e"; then
  rouge "création du compte invité impossible"
  exit 1
fi
INVITE_UID="$SMOKE_CREATED_ID"

if ! smoke_accounts_session "e2e+$RUN_ID-1@$(smoke_accounts_domain)" "$PASSWORD"; then
  rouge "session du payeur impossible"
  exit 1
fi
PAYEUR_JWT="$SMOKE_SESSION_JWT"
cfg_payeur="$(config_session "$PAYEUR_JWT")"
if ! smoke_accounts_session "e2e+$RUN_ID-2@$(smoke_accounts_domain)" "$PASSWORD"; then
  rouge "session de l'invité impossible"
  exit 1
fi
INVITE_JWT="$SMOKE_SESSION_JWT"
cfg_invite="$(config_session "$INVITE_JWT")"
verdict_vert "2 comptes e2e créés et sessions obtenues (payeur, invité)"

# --- (2) Foyer éphémère du payeur : canal app réelle -------------------------
# RPC `create_household` (supabase-adapter.ts:235) : le foyer et la ligne
# `household_members` admin du payeur naissent dans UNE transaction SQL.
corps_foyer="$(corps_secret '{"p_name":"Foyer éphémère e2e 43","p_avatar_color":"accent"}')"
statut="$(post_json "$API/rest/v1/rpc/create_household" "$cfg_payeur" "$corps_foyer" "$SMOKE_LIB_TMP/foyer.json")"
etape 1 POST /rest/v1/rpc/create_household "$statut" "création du foyer éphémère du payeur"
garde_app "$statut" "$API/rest/v1/rpc/create_household"
if [ "$statut" != "200" ]; then
  rouge "create_household a échoué (HTTP $statut)"
  exit 1
fi
# Le préfixe distingue foyer et membre : l'ordre JSON n'est pas contractuel
# (voir json_id_prefixe). Les deux identifiants portent les assertions bornées.
FOYER_A="$(json_id_prefixe "$(cat "$SMOKE_LIB_TMP/foyer.json")" household_)"
MEMBRE_A_ID="$(json_id_prefixe "$(cat "$SMOKE_LIB_TMP/foyer.json")" member_)"
# La capture est validée AVANT l'enregistrement du foyer dans la liste de
# purge : une capture vide y écrivait une ligne vide et la boucle de purge la
# sautait en silence — le foyer survivait, et la suppression du compte admin
# échouait ensuite en 500 (FK on delete set null de 0166 + CHECK enfant de
# 0145 : une ligne membre admin sans user_id viole chk_members_managed_child).
if [ -z "$FOYER_A" ] || [ -z "$MEMBRE_A_ID" ]; then
  rouge "create_household : foyer ou membre admin non capturés"
  exit 1
fi
printf '%s\n' "$FOYER_A" >>"$FOYERS_LISTE"
verdict_vert "foyer éphémère créé : household_id=$FOYER_A, payeur admin (membre $MEMBRE_A_ID)"
echo "$FOYER_A" >"$SMOKE_LIB_TMP/foyer-a"

# NOTE DE CONFORMITÉ AU PLAN (déviation Rule 1, consignée au SUMMARY) :
# le plan demandait de « promouvoir le compte invité en membre admin du foyer
# éphémère » AVANT le happy path. C'est contradictoire avec les assertions de
# la même tâche 3 : le chemin already-member de redeem_household_invite_token
# (0181) ne vérifie PAS use_count (« sortie idempotente … sans incrementation
# de use_count ») — le replay reviendrait 200 et jamais 410 « épuisé », et
# l'assert `use_count = 1 / is_active = false` serait fausse. L'invité rejoint
# donc le foyer PAR LE PONT (c'est le comportement réel prouvé) : adhésion et
# réconciliation dans la même transaction, au redeem du happy path.

# --- (3) Ardoise + code de partage (canal Edge, JWT payeur) ------------------
# `create-ardoise` (10/min) puis `create` (20/min) : le code brut n'existe
# qu'une fois dans la réponse, il va direct en fichier 0600.
corps_ardoise="$(corps_secret '{"action":"create-ardoise","name":"Ardoise éphémère e2e"}')"
statut="$(post_json "$API/functions/v1/ardoise-invite" "$cfg_payeur" "$corps_ardoise" "$SMOKE_LIB_TMP/ardoise.json")"
etape 2 POST /functions/v1/ardoise-invite "$statut" "create-ardoise — création de l'ardoise du foyer"
garde_app "$statut" "$API/functions/v1/ardoise-invite"
if [ "$statut" != "200" ]; then
  rouge "create-ardoise a échoué (HTTP $statut)"
  exit 1
fi
ARDOISE_ID="$(json_id_prefixe "$(cat "$SMOKE_LIB_TMP/ardoise.json")" ardoise_)"
if [ -z "$ARDOISE_ID" ]; then
  rouge "create-ardoise : ardoise_id non capturé"
  exit 1
fi
verdict_vert "ardoise créée : ardoise_id=$ARDOISE_ID"

attend_budget
# expiresAt futur lointain : le code de partage ne doit PAS expirer pendant le
# run — seul le TOKEN bridge (15 minutes en dur, 0180b) porte le négatif
# d'expiration.
expires_futur="$(date -u -d '+2 days' '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null \
  || date -u -v+2d '+%Y-%m-%dT%H:%M:%SZ')"
corps_code="$(corps_secret "{\"action\":\"create\",\"ardoiseId\":\"$ARDOISE_ID\",\"expiresAt\":\"$expires_futur\"}")"
statut="$(post_json "$API/functions/v1/ardoise-invite" "$cfg_payeur" "$corps_code" "$SMOKE_LIB_TMP/code.json")"
etape 3 POST /functions/v1/ardoise-invite "$statut" "create — émission du code de partage ardoise (expiration +2 jours)"
garde_app "$statut" "$API/functions/v1/ardoise-invite"
if [ "$statut" != "200" ]; then
  rouge "create (code de partage) a échoué (HTTP $statut)"
  exit 1
fi
CODE_ARDOISE="$(json_val "$(cat "$SMOKE_LIB_TMP/code.json")" code)"
if [ -z "$CODE_ARDOISE" ]; then
  rouge "create : code brut non capturé"
  exit 1
fi
verdict_vert "code de partage émis et scellé en fichier 0600 (jamais imprimé)"

# --- (4) Guest : redeem-guest sans session (clé publiable seule) -------------
# Chemin sans identité (ardoise-invite, dispatch 946-948) : c'est le canal
# exact d'un invité externe sans compte. Budget 8/min : espacé.
attend_budget
corps_guest="$(corps_secret "{\"action\":\"redeem-guest\",\"code\":\"$CODE_ARDOISE\",\"displayName\":\"Invité ponté e2e\"}")"
statut="$(post_json "$API/functions/v1/ardoise-invite" "$config_pub" "$corps_guest" "$SMOKE_LIB_TMP/guest.json")"
etape 4 POST /functions/v1/ardoise-invite "$statut" "redeem-guest — adhésion invitée sans compte (clé publiable seule)"
garde_app "$statut" "$API/functions/v1/ardoise-invite"
if [ "$statut" != "200" ]; then
  rouge "redeem-guest a échoué (HTTP $statut)"
  exit 1
fi
GUEST_TICKET="$(json_val "$(cat "$SMOKE_LIB_TMP/guest.json")" guest_ticket)"
if [ -z "$GUEST_TICKET" ]; then
  rouge "redeem-guest : guest_ticket non capturé"
  exit 1
fi
verdict_vert "invité adhéré, guest_ticket scellé en fichier 0600"

# --- (5) Dépense participant guest, AVANT household-token (D-05) -------------
# LECTURE CANAL APP : le payeur (membre du foyer) lit ardoise_guests —
# politique ardoise_guests_select (0057/0113). Le guest_id est nécessaire au
# payload `p_parts` du RPC create_expense (expensePartsPayload, api.ts:594).
statut="$(get_json "$API/rest/v1/ardoise_guests?ardoise_id=eq.$ARDOISE_ID&select=id" "$SMOKE_LIB_TMP/guests.json" "$cfg_payeur")"
etape 5 GET /rest/v1/ardoise_guests "$statut" "lecture du guest_id par le payeur (canal app)"
garde_app "$statut" "$API/rest/v1/ardoise_guests"
if [ "$statut" != "200" ]; then
  rouge "lecture ardoise_guests a échoué (HTTP $statut)"
  exit 1
fi
GUEST_ID="$(json_id_prefixe "$(cat "$SMOKE_LIB_TMP/guests.json")" ardoise-guest_)"
if [ -z "$GUEST_ID" ]; then
  rouge "guest_id non capturé avant la dépense"
  exit 1
fi

# D-05 — CONTRAINTE NON NÉGOCIABLE : la dépense participant guest EXISTE
# avant l'appel `household-token`. Le pont (0180b) est rempli au moment du
# household-token ; une dépense créée après rendrait la réconciliation
# invérifiable et la capture pré-redeem tautologique.
part_montant='2400'
corps_depense="$(corps_secret "{\"p_household_id\":\"$FOYER_A\",\"p_ardoise_id\":\"$ARDOISE_ID\",\"p_title\":\"Courses pontées e2e\",\"p_amount\":$part_montant,\"p_paid_by\":\"$MEMBRE_A_ID\",\"p_paid_by_guest\":null,\"p_expense_date\":\"$(date -u '+%Y-%m-%d')\",\"p_split_type\":\"egal\",\"p_parts\":[{\"participant_type\":\"guest\",\"member_id\":null,\"guest_id\":\"$GUEST_ID\",\"share_amount\":$part_montant}]}")"
statut="$(post_json "$API/rest/v1/rpc/create_expense" "$cfg_payeur" "$corps_depense" "$SMOKE_LIB_TMP/depense.json")"
etape 6 POST /rest/v1/rpc/create_expense "$statut" "dépense 24,00 € participant guest AVANT household-token (D-05)"
garde_app "$statut" "$API/rest/v1/rpc/create_expense"
if [ "$statut" != "200" ]; then
  rouge "create_expense a échoué (HTTP $statut)"
  exit 1
fi
EXPENSE_ID="$(json_id_prefixe "$(cat "$SMOKE_LIB_TMP/depense.json")" expense_)"
if [ -z "$EXPENSE_ID" ]; then
  rouge "create_expense : expense_id non capturé"
  exit 1
fi
verdict_vert "dépense créée : expense_id=$EXPENSE_ID, participant guest=$GUEST_ID"

# --- CAPTURE PRÉ-REDEEM des identifiants du pont (exigence tâche 2) ----------
# La redemption purge private.ardoise_bridge_identities (0181:327-329) : les
# assertions bornées de la tâche 3 (plus aucune part guest pontée dans le
# foyer) dépendent de CES variables capturées ICI — sinon tautologie.
BRIDGE_FOYER="$FOYER_A"
BRIDGE_GUEST="$GUEST_ID"
BRIDGE_ARDOISE="$ARDOISE_ID"
verdict_vert "identifiants du pont capturés avant redeem : foyer=$BRIDGE_FOYER guest=$BRIDGE_GUEST"

# --- (6) Happy path : household-token (JWT invité + code) --------------------
# L'invité (compte réel, non membre du foyer) échange le code ardoise contre
# un token foyer. Budget 8/min : premier appel de l'action, espacé quand même.
attend_budget
corps_ht="$(corps_secret "{\"action\":\"household-token\",\"code\":\"$CODE_ARDOISE\"}")"
statut="$(post_json "$API/functions/v1/ardoise-invite" "$cfg_invite" "$corps_ht" "$SMOKE_LIB_TMP/token.json")"
etape 7 POST /functions/v1/ardoise-invite "$statut" "household-token — échange code → token foyer (JWT invité)"
garde_app "$statut" "$API/functions/v1/ardoise-invite"
if [ "$statut" != "200" ]; then
  rouge "household-token a échoué (HTTP $statut)"
  exit 1
fi
BRIDGE_TOKEN="$(json_val "$(cat "$SMOKE_LIB_TMP/token.json")" token)"
if [ -z "$BRIDGE_TOKEN" ]; then
  rouge "household-token : token non capturé"
  exit 1
fi
verdict_vert "token foyer reçu et scellé en fichier 0600"

# --- (7) Redemption foyer : household-invite action redeem (D-06) ------------
# SEUL canal de redemption : Edge `household-invite` action `redeem`. Les RPC
# PostgREST directs sont service_role only — jamais appelés par ce script.
attend_budget
corps_redeem="$(corps_secret "{\"action\":\"redeem\",\"token\":\"$BRIDGE_TOKEN\"}")"
statut="$(post_json "$API/functions/v1/household-invite" "$cfg_invite" "$corps_redeem" "$SMOKE_LIB_TMP/redeem.json")"
etape 8 POST /functions/v1/household-invite "$statut" "redeem — redemption du token foyer : adhésion + réconciliation guest"
garde_app "$statut" "$API/functions/v1/household-invite"
if [ "$statut" != "200" ]; then
  rouge "household-invite redeem a échoué (HTTP $statut)"
  exit 1
fi
FOYER_REDEEM="$(json_val "$(cat "$SMOKE_LIB_TMP/redeem.json")" household_id)"
if [ "$FOYER_REDEEM" != "$BRIDGE_FOYER" ]; then
  rouge "redeem : household_id retourné ($FOYER_REDEEM) ≠ foyer du pont ($BRIDGE_FOYER)"
  exit 1
fi
verdict_vert "redeem vert : invité membre du foyer $FOYER_REDEEM, réconciliation déclenchée"

# ============================================================================
# NÉGATIFS RED-TEAM (tâche 3) — ORDRE FIXE D-01/D-02, justifié :
#   (a) replay      d'abord : il prouve l'usage unique SUR LE TOKEN du happy
#                   path, avant toute ré-émission qui créerait d'autres tokens
#                   dans le foyer et brouillerait l'assert use_count = 1 ;
#   (b) token muté  ensuite : 1 caractère changé → hash différent → 404
#                   « introuvable », indépendant de l'état du premier token ;
#   (c) token expiré en dernier des redeem : il exige une RÉ-ÉMISSION (nouveau
#                   household-token) puis l'attente RÉELLE des 15 minutes en
#                   dur de 0180b — le plus coûteux, il n'influence pas (a)/(b) ;
#   (d) cross-household enfin : fixture séparée, uniquement lu après coup.
# Chaque négatif est indépendant du happy path : aucun ne le rejoue, chacun
# part d'un état reconstruit (token capturé, token ré-émis, second foyer).
# ============================================================================

neg_verdict() {
  # $1 = nom du négatif, $2 = ok|ko, $3 = détail citable.
  printf 'NÉGATIF %s | %s | %s\n' "$1" "$2" "$3" | tee -a "$NEG_LOG" >&2
}

# --- (a) Replay du token consommé → 410 « épuisé » ----------------------------
# PROOF-03 (assert positif single-use) : le redeem du happy path a incrémenté
# use_count à 1 (max_uses = 1) — 0181 refuse AVANT tout le reste
# (`use_count >= max_uses`, l.96-98). Un 429 serait un rate-limit, jamais ce
# verdict — d'où l'espacement budget ci-dessous.
attend_budget
statut="$(post_json "$API/functions/v1/household-invite" "$cfg_invite" "$corps_redeem" "$SMOKE_LIB_TMP/replay.json")"
etape 9 POST /functions/v1/household-invite "$statut" "redeem — négatif replay : même token re-présenté (410 « épuisé » attendu)"
garde_app "$statut" "$API/functions/v1/household-invite"
replay_msg="$(json_val "$(cat "$SMOKE_LIB_TMP/replay.json")" error)"
if [ "$statut" = "410" ] && printf '%s' "$replay_msg" | grep -q "utilisations maximal"; then
  neg_verdict "replay" OK "HTTP 410 + « $replay_msg »"
  verdict_vert "replay refusé : HTTP 410, message « utilisations maximal » (usage unique prouvé)"
else
  neg_verdict "replay" KO "HTTP $statut, message « $replay_msg » — 410 « utilisations maximal » attendu"
  rouge "négatif replay : HTTP $statut au lieu de 410 « épuisé »"
  exit 1
fi

# --- (b) Token muté (1 caractère) → 404 « introuvable » -----------------------
# Le hash HMAC du token muté ne correspond à aucune ligne : mapping Edge
# (`token inconnu` → 404 « Ce token est introuvable. », l.321-325).
token_mute="$(printf '%s' "$BRIDGE_TOKEN" | sed 's/^./X/')"
if [ "$token_mute" = "$BRIDGE_TOKEN" ]; then
  token_mute="$(printf '%s' "$BRIDGE_TOKEN" | sed 's/.$/Y/')"
fi
attend_budget
corps_mute="$(corps_secret "{\"action\":\"redeem\",\"token\":\"$token_mute\"}")"
statut="$(post_json "$API/functions/v1/household-invite" "$cfg_invite" "$corps_mute" "$SMOKE_LIB_TMP/mute.json")"
etape 10 POST /functions/v1/household-invite "$statut" "redeem — négatif token muté : 1 caractère changé (404 « introuvable » attendu)"
garde_app "$statut" "$API/functions/v1/household-invite"
mute_msg="$(json_val "$(cat "$SMOKE_LIB_TMP/mute.json")" error)"
if [ "$statut" = "404" ] && printf '%s' "$mute_msg" | grep -q "introuvable"; then
  neg_verdict "token-mute" OK "HTTP 404 + « $mute_msg »"
  verdict_vert "token muté refusé : HTTP 404 « Ce token est introuvable. »"
else
  neg_verdict "token-mute" KO "HTTP $statut, message « $mute_msg » — 404 « introuvable » attendu"
  rouge "négatif token muté : HTTP $statut au lieu de 404 « introuvable »"
  exit 1
fi

# --- (c) Token expiré → 410 « expiré » après attente RÉELLE -------------------
# Ré-émission d'un NOUVEAU token bridge (household-token, 2ᵉ appel de
# l'action — budget 8/min espacé), puis attente des 15 MINUTES RÉELLES
# (expiration en dur `interval '15 minutes'`, 0180b) + 120 s de marge
# d'horloge. AUCUNE falsification SQL d'expires_at (D-01) : la durée ~20 min
# du run est un choix assumé (D-03).
attend_budget
corps_ht2="$(corps_secret "{\"action\":\"household-token\",\"code\":\"$CODE_ARDOISE\"}")"
statut="$(post_json "$API/functions/v1/ardoise-invite" "$cfg_invite" "$corps_ht2" "$SMOKE_LIB_TMP/token2.json")"
etape 11 POST /functions/v1/ardoise-invite "$statut" "household-token — ré-émission d'un token frais pour le négatif d'expiration"
garde_app "$statut" "$API/functions/v1/ardoise-invite"
if [ "$statut" != "200" ]; then
  rouge "ré-émission household-token a échoué (HTTP $statut)"
  exit 1
fi
TOKEN_EXPIRE="$(json_val "$(cat "$SMOKE_LIB_TMP/token2.json")" token)"
if [ -z "$TOKEN_EXPIRE" ]; then
  rouge "ré-émission : token non capturé"
  exit 1
fi
verdict_vert "token frais ré-émis pour le négatif d'expiration"
echo "Attente RÉELLE de l'expiration : 15 min (0180b) + 120 s de marge = 1020 s. Aucune falsification SQL (D-01)."
sleep 1020
attend_budget
corps_exp="$(corps_secret "{\"action\":\"redeem\",\"token\":\"$TOKEN_EXPIRE\"}")"
statut="$(post_json "$API/functions/v1/household-invite" "$cfg_invite" "$corps_exp" "$SMOKE_LIB_TMP/exp.json")"
etape 12 POST /functions/v1/household-invite "$statut" "redeem — négatif token expiré : attente réelle 1020 s puis re-redeem (410 « expiré » attendu)"
garde_app "$statut" "$API/functions/v1/household-invite"
exp_msg="$(json_val "$(cat "$SMOKE_LIB_TMP/exp.json")" error)"
if [ "$statut" = "410" ] && printf '%s' "$exp_msg" | grep -q "expiré"; then
  neg_verdict "token-expires" OK "HTTP 410 + « $exp_msg » (après attente réelle 1020 s)"
  verdict_vert "token expiré refusé : HTTP 410 « Ce token est expiré. » après l'attente réelle"
else
  neg_verdict "token-expires" KO "HTTP $statut, message « $exp_msg » — 410 « expiré » attendu"
  rouge "négatif token expiré : HTTP $statut au lieu de 410 « expiré »"
  exit 1
fi

# --- (d) Cross-household (OQ-1, tranché : borne de la réconciliation) --------
# La borne du pont ET de la conversion est le couple (user_id, household_id)
# (0181 l.137-139) : les parts guest d'un AUTRE foyer de l'invité ne sont
# JAMAIS converties. Fixture : un 2ᵉ foyer dont l'invité est admin/payeur,
# avec sa propre ardoise, son invité sans compte et une dépense participant
# guest — après le run, cette part DOIT rester `guest`. Le choix OQ-1 (borne
# de réconciliation plutôt qu'adhésion multi-foyer forcée) est appliqué ici.
corps_foyer_b="$(corps_secret '{"p_name":"Second foyer e2e 43","p_avatar_color":"coral"}')"
statut="$(post_json "$API/rest/v1/rpc/create_household" "$cfg_invite" "$corps_foyer_b" "$SMOKE_LIB_TMP/foyer-b.json")"
etape 13 POST /rest/v1/rpc/create_household "$statut" "fixture cross-household : second foyer, invité payeur/admin"
garde_app "$statut" "$API/rest/v1/rpc/create_household"
if [ "$statut" != "200" ]; then
  rouge "create_household (2ᵉ foyer) a échoué (HTTP $statut)"
  exit 1
fi
FOYER_B="$(json_id_prefixe "$(cat "$SMOKE_LIB_TMP/foyer-b.json")" household_)"
MEMBRE_B_ID="$(json_id_prefixe "$(cat "$SMOKE_LIB_TMP/foyer-b.json")" member_)"
if [ -z "$FOYER_B" ] || [ -z "$MEMBRE_B_ID" ]; then
  rouge "2ᵉ foyer : identifiants non capturés"
  exit 1
fi
printf '%s\n' "$FOYER_B" >>"$FOYERS_LISTE"
corps_ardoise_b="$(corps_secret '{"action":"create-ardoise","name":"Ardoise second foyer e2e"}')"
statut="$(post_json "$API/functions/v1/ardoise-invite" "$cfg_invite" "$corps_ardoise_b" "$SMOKE_LIB_TMP/ardoise-b.json")"
etape 14 POST /functions/v1/ardoise-invite "$statut" "create-ardoise — ardoise du second foyer"
garde_app "$statut" "$API/functions/v1/ardoise-invite"
if [ "$statut" != "200" ]; then
  rouge "create-ardoise (2ᵉ foyer) a échoué (HTTP $statut)"
  exit 1
fi
ARDOISE_B="$(json_id_prefixe "$(cat "$SMOKE_LIB_TMP/ardoise-b.json")" ardoise_)"
corps_code_b="$(corps_secret "{\"action\":\"create\",\"ardoiseId\":\"$ARDOISE_B\",\"expiresAt\":\"$expires_futur\"}")"
statut="$(post_json "$API/functions/v1/ardoise-invite" "$cfg_invite" "$corps_code_b" "$SMOKE_LIB_TMP/code-b.json")"
etape 15 POST /functions/v1/ardoise-invite "$statut" "create — code de partage du second foyer"
garde_app "$statut" "$API/functions/v1/ardoise-invite"
if [ "$statut" != "200" ]; then
  rouge "create (2ᵉ foyer) a échoué (HTTP $statut)"
  exit 1
fi
CODE_B="$(json_val "$(cat "$SMOKE_LIB_TMP/code-b.json")" code)"
attend_budget
corps_guest_b="$(corps_secret "{\"action\":\"redeem-guest\",\"code\":\"$CODE_B\",\"displayName\":\"Invité second foyer e2e\"}")"
statut="$(post_json "$API/functions/v1/ardoise-invite" "$config_pub" "$corps_guest_b" "$SMOKE_LIB_TMP/guest-b.json")"
etape 16 POST /functions/v1/ardoise-invite "$statut" "redeem-guest — invité sans compte du second foyer"
garde_app "$statut" "$API/functions/v1/ardoise-invite"
if [ "$statut" != "200" ]; then
  rouge "redeem-guest (2ᵉ foyer) a échoué (HTTP $statut)"
  exit 1
fi
statut="$(get_json "$API/rest/v1/ardoise_guests?ardoise_id=eq.$ARDOISE_B&select=id" "$SMOKE_LIB_TMP/guests-b.json" "$cfg_invite")"
etape 17 GET /rest/v1/ardoise_guests "$statut" "lecture du guest_id du second foyer"
garde_app "$statut" "$API/rest/v1/ardoise_guests"
GUEST_B="$(json_id_prefixe "$(cat "$SMOKE_LIB_TMP/guests-b.json")" ardoise-guest_)"
if [ -z "$GUEST_B" ]; then
  rouge "guest_id du second foyer non capturé"
  exit 1
fi
corps_depense_b="$(corps_secret "{\"p_household_id\":\"$FOYER_B\",\"p_ardoise_id\":\"$ARDOISE_B\",\"p_title\":\"Dépense second foyer\",\"p_amount\":1500,\"p_paid_by\":\"$MEMBRE_B_ID\",\"p_paid_by_guest\":null,\"p_expense_date\":\"$(date -u '+%Y-%m-%d')\",\"p_split_type\":\"egal\",\"p_parts\":[{\"participant_type\":\"guest\",\"member_id\":null,\"guest_id\":\"$GUEST_B\",\"share_amount\":1500}]}")"
statut="$(post_json "$API/rest/v1/rpc/create_expense" "$cfg_invite" "$corps_depense_b" "$SMOKE_LIB_TMP/depense-b.json")"
etape 18 POST /rest/v1/rpc/create_expense "$statut" "dépense participant guest du second foyer (borne cross-household)"
garde_app "$statut" "$API/rest/v1/rpc/create_expense"
if [ "$statut" != "200" ]; then
  rouge "create_expense (2ᵉ foyer) a échoué (HTTP $statut)"
  exit 1
fi
verdict_vert "fixture cross-household en place : foyer B=$FOYER_B avec une part guest vivante"

# ============================================================================
# LECTURE SQL APRÈS COUP (PROOF-03) — psql.sh stdin UNIQUEMENT (§2.7 C), rôle
# postgres : la RLS est court-circuitée, donc CHAQUE requête est bornée à la
# main par foyer du run via variables psql (§2.7 D.2). La borne guest_id est
# issue de la CAPTURE PRÉ-REDEEM de la tâche 2 — sans elle, l'assert (i)
# serait tautologique (le pont est purgé par 0181:327-329). Aucune tautologie
# (pas de >= 0, pas de is not null sur colonne not null, §2.7 D.3) : chaque
# attendu est un chiffre exact.
# ============================================================================
sql_apres="$SMOKE_LIB_TMP/apres-coup.sql"
{
  printf "%s\n" "-- Lectures après coup, bornées par foyer (variables :'foyer' :'guest' :'invite' :'foyer_b')\n"
  printf "%s\n" "-- (i) parts guest pontées restantes dans le foyer du run : attendu 0\n"
  printf "select 'parts_guest_pontees_restantes', count(*) from public.expense_participants ep where ep.participant_type = 'guest' and ep.guest_id = :'guest' and exists (select 1 from public.expenses e where e.id = ep.expense_id and e.household_id = :'foyer');\n"
  printf "%s\n" "-- (ii) duplication : aucune dépense du foyer avec plus d'une part membre pour le nouveau membre : attendu 0\n"
  printf "select 'depenses_dupliquees_membre', count(*) from (select e.id from public.expenses e join public.expense_participants ep on ep.expense_id = e.id where e.household_id = :'foyer' and ep.participant_type = 'membre' and ep.member_id = (select m.id from public.household_members m where m.user_id = :'invite' and m.household_id = :'foyer') group by e.id having count(*) > 1) d;\n"
  printf "%s\n" "-- (iii) part membre convertie du nouveau membre : attendu exactement 1\n"
  printf "select 'parts_membre_converties', count(*) from public.expense_participants ep where ep.participant_type = 'membre' and ep.member_id = (select m.id from public.household_members m where m.user_id = :'invite' and m.household_id = :'foyer') and exists (select 1 from public.expenses e where e.id = ep.expense_id and e.household_id = :'foyer');\n"
  printf "%s\n" "-- (iii bis) token consommé : use_count = 1, max_uses = 1, is_active = false\n"
  printf "select 'token_use_count', use_count from public.household_invite_tokens where household_id = :'foyer';\n"
  printf "select 'token_max_uses', max_uses from public.household_invite_tokens where household_id = :'foyer';\n"
  printf "select 'token_actifs', count(*) from public.household_invite_tokens where household_id = :'foyer' and is_active;\n"
  printf "%s\n" "-- (iv) borne cross-household : la part guest du 2ᵉ foyer reste guest (attendu 1), rien n'y est converti (attendu 0)\n"
  printf "select 'parts_guest_restantes_foyer_b', count(*) from public.expense_participants ep where ep.participant_type = 'guest' and ep.guest_id = :'guest_b' and exists (select 1 from public.expenses e where e.id = ep.expense_id and e.household_id = :'foyer_b');\n"
  printf "select 'parts_membre_converties_foyer_b', count(*) from public.expense_participants ep where ep.participant_type = 'membre' and exists (select 1 from public.expenses e where e.id = ep.expense_id and e.household_id = :'foyer_b');\n"
} >"$sql_apres"

sql_out="$(sh "$SCRIPT_DIR/psql.sh" -A -t \
  -v foyer="$FOYER_A" -v guest="$BRIDGE_GUEST" -v invite="$INVITE_UID" \
  -v foyer_b="$FOYER_B" -v guest_b="$GUEST_B" \
  <"$sql_apres" 2>&1 || true)"
printf '%s\n' "$sql_out" | tee -a "$SQL_LOG" >&2

sql_val() {
  printf '%s\n' "$sql_out" | grep "^$1|" | head -n 1 | cut -d'|' -f2 | tr -d ' '
}

assert_sql() {
  # $1 nom, $2 attendu — chaque écart est un verdict rouge nommé (§2.7 F).
  trouve="$(sql_val "$1")"
  if [ "$trouve" = "$2" ]; then
    neg_verdict "sql-$1" OK "$1 = $trouve (attendu $2)"
    verdict_vert "SQL après coup : $1 = $trouve (attendu $2)"
  else
    neg_verdict "sql-$1" KO "$1 = « $trouve » au lieu de $2"
    rouge "SQL après coup : $1 = « $trouve » au lieu de $2"
    exit 1
  fi
}

assert_sql parts_guest_pontees_restantes 0
assert_sql depenses_dupliquees_membre 0
assert_sql parts_membre_converties 1
assert_sql token_use_count 1
assert_sql token_max_uses 1
assert_sql token_actifs 0
assert_sql parts_guest_restantes_foyer_b 1
assert_sql parts_membre_converties_foyer_b 0

# Purge de la fixture cross-household enregistrée dans FOYERS_LISTE : le trap
# EXIT existant supprime les DEUX foyers (cascade) et re-vérifie 0 ligne sur
# expenses/ardoises/household_invite_tokens, puis smoke_accounts_purge
# re-delete → 404 (PROOF-06, Pitfall 7).

verdict_vert "Tous les verdicts sont verts : happy path, 4 négatifs, réconciliation bornée"
printf '\nPREUVE ÉTABLIE — PROOF-01..04 couverts par ce run (PROOF-05..06 : doc + purge ci-dessous).\n'
exit 0
