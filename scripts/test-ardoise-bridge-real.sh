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
health_code="$(curl -sS -o /dev/null -w '%{http_code}' "$API/auth/v1/health" \
  -H "apikey: $PUBLISHABLE_KEY" 2>/dev/null || printf '000')"
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
    curl -sS -D "$SMOKE_LIB_TMP/derniers-headers" -o "$out" -w '%{http_code}' \
      -X POST -H 'content-type: application/json' -K "$config" --data @"$corps" "$url" 2>"$SMOKE_LIB_TMP/curl-err" \
      || { cat "$SMOKE_LIB_TMP/curl-err" >&2; printf '000'; }
  elif [ -n "$config" ]; then
    curl -sS -D "$SMOKE_LIB_TMP/derniers-headers" -o "$out" -w '%{http_code}' \
      -X POST -H 'content-type: application/json' -K "$config" "$url" 2>"$SMOKE_LIB_TMP/curl-err" \
      || { cat "$SMOKE_LIB_TMP/curl-err" >&2; printf '000'; }
  else
    curl -sS -D "$SMOKE_LIB_TMP/derniers-headers" -o "$out" -w '%{http_code}' \
      -X POST -H 'content-type: application/json' --data @"$corps" "$url" 2>"$SMOKE_LIB_TMP/curl-err" \
      || { cat "$SMOKE_LIB_TMP/curl-err" >&2; printf '000'; }
  fi
}

# GET authentifié : statut sur stdout, corps dans $2, en-têtes pour D-10.
get_json() {
  url="$1" out="$2" config="$3"
  curl -sS -D "$SMOKE_LIB_TMP/derniers-headers" -o "$out" -w '%{http_code}' \
    -K "$config" "$url" 2>"$SMOKE_LIB_TMP/curl-err" \
    || { cat "$SMOKE_LIB_TMP/curl-err" >&2; printf '000'; }
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
}

rouge() {
  GLOBAL_KO=1
  KO_RAISON="$1"
  printf '   ✗ %s\n' "$1" >&2
  printf 'VERDICT ROUGE | %s\n' "$1" >>"$RUN_LOG"
}

# Garde D-10 factuelle sur le dernier appel : CORS présent, pas de 3xx, pas de
# 429 hors budget (un 429 est un rate-limit, jamais la preuve d'une propriété).
garde_app() {
  statut="$1"
  if ! grep -qi '^access-control-allow-origin' "$SMOKE_LIB_TMP/derniers-headers" 2>/dev/null; then
    signal_d10 "en-tête access-control-allow-origin absent sur la réponse HTTP $statut"
  fi
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
  stamp_code="$(curl -sS -D "$stamp_headers" -o "$stamp_body" -w '%{http_code}' \
    "$E2E_BASE_URL/version.json" 2>/dev/null || printf '000')"
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
    printf '_Section rédigée par le script à la fin du run._\n'
    printf '\n'
    printf '## 3. Lecture SQL après coup (PROOF-03)\n'
    printf '\n'
    printf '_Section rédigée par le script à la fin du run._\n'
    printf '\n'
    printf '## 4. Ce qui n'"'"'est PAS prouvé (D-09)\n'
    printf '\n'
    printf '- Le dialog de copie du lien et le rendu du panneau invité : surfaces UI\n'
    printf '  non couvertes — le script traverse le fil HTTP, pas le navigateur.\n'
    printf '- L'"'"'e2e navigateur du parcours invité (W2) : déclenché par besoin\n'
    printf '  (PROOF-07), jamais préventif — le verdict humain tranche si un seam\n'
    printf '  apparaît via les signaux DÉCALAGE CHEMIN APP.\n'
    printf '- L'"'"'estampille de l'"'"'Edge Function : pas de canal dédié — seule\n'
    printf '  l'"'"'estampille frontend (/version.json) est capturée. '
    if [ -n "$ETAMPILLE" ]; then
      printf 'Valeur de ce run : %s.\n' "$ETAMPILLE"
    else
      printf 'INDISPONIBLE sur ce run (canal non joignable — nommé plus haut).\n'
    fi
    printf '- Les signaux DÉCALAGE CHEMIN APP émis sur ce run : %s\n' "$DECALAGES"
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
    printf '\n'
    printf -- '---\n'
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
    printf "select 'expenses_restants', count(*) from public.expenses where household_id in (select id from public.households where false);\n" >>"$purge_sql"
    purge_sql_controles="$SMOKE_LIB_TMP/purge-controles.sql"
    {
      printf "select 'expenses_restants', count(*) from public.expenses where household_id = :'foyer';\n"
      printf "select 'ardoises_restantes', count(*) from public.ardoises where household_id = :'foyer';\n"
      printf "select 'tokens_restants', count(*) from public.household_invite_tokens where household_id = :'foyer';\n"
    } >"$purge_sql_controles"
    while IFS= read -r hid; do
      [ -n "$hid" ] || continue
      del_out="$(sh "$SCRIPT_DIR/psql.sh" -v foyer="$hid" <"$purge_sql" 2>&1 </dev/null || true)"
      if printf '%s' "$del_out" | grep -q '^DELETE'; then
        verdict_vert "foyer $hid supprimé (cascade)"
      else
        printf '   ! foyer %s non supprimé : %s\n' "$hid" "$del_out" >&2
        purge_ko=1
      fi
      ctrl_out="$(sh "$SCRIPT_DIR/psql.sh" -v foyer="$hid" <"$purge_sql_controles" 2>&1 </dev/null || true)"
      # Chaque ligne de contrôle est « <nom> | <n> » : un n ≠ 0 est un orphelin.
      if printf '%s' "$ctrl_out" | grep -E '\| [1-9]' >/dev/null; then
        printf '   ! orphelins après cascade pour %s : %s\n' "$hid" "$(printf '%s' "$ctrl_out" | grep -E '\| [1-9]' | tr '\n' ' ')" >&2
        purge_ko=1
      else
        verdict_vert "foyer $hid : 0 ligne résiduelle (expenses/ardoises/tokens)"
      fi
    done <"$FOYERS_LISTE"
  fi

  # Détection résiduelle (EE-02) : les comptes e2e hors de ce run sont
  # SIGNALÉS, jamais supprimés par ce run.
  if residus="$(smoke_accounts_list 2>/dev/null)" && [ -n "$residus" ]; then
    echo "   ! comptes e2e résiduels hors de ce run (à traiter à la main) :" >&2
    printf '     %s\n' "$residus" >&2
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

# Le squelette s'arrête ici : les étapes fixtures → happy path → négatifs →
# réconciliation bornée sont ajoutées par les tâches 2 et 3 du plan 43-01.
exit 1
