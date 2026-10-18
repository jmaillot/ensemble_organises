#!/usr/bin/env sh
# scripts/smoke-functions-serveur.sh
# Smoke-test ciblé post-redéploiement : off-search (moteur search-a-licious)
# + gift-list-invite (oracle uniforme), contre une stack déployée.
#
#   sh scripts/smoke-functions-serveur.sh
#
# Depuis la racine du dépôt ou depuis supabase-project/ (le script s'ancre sur
# son propre emplacement) :
#   sh scripts/smoke-functions-serveur.sh
#   sh ../scripts/smoke-functions-serveur.sh
#
# Les trois valeurs — SUPABASE_PUBLIC_URL, SUPABASE_PUBLISHABLE_KEY,
# SUPABASE_SECRET_KEY — sont LUES dans le `.env` de la pile
# (`supabase-project/.env`), ligne à ligne, sans être affichées ni exécutées :
# aucun secret sur la ligne de commande, où il finirait dans l'historique du
# shell (AGENTS.md §2.7 H). L'URL est la RACINE (`SUPABASE_PUBLIC_URL`) et non
# `API_EXTERNAL_URL` : celle-ci porte le suffixe `…/auth/v1`, qui rendrait
# « 404 page not found » sur chacune des six vérifications.
#
# Surchargeurs reconnus (par nom seulement ; aucun exemple ne porte une valeur) :
#   STACK_ENV         fichier .env de la pile (défaut : supabase-project/.env)
#   API               URL d'une autre pile que celle du .env
#   PUBLISHABLE_KEY   clé publiable déjà fournie par l'appelant
#   SECRET_KEY        clé secrète déjà fournie par l'appelant
#
# SECRET_KEY ne sert qu'au nettoyage : suppression du compte jetable via
# l'endpoint admin. Sa présence est EXIGÉE — un nettoyage impossible n'est pas
# un succès (cf. la validation plus bas, qui sort en 2 avant tout appel réseau).
# Aucune clé n'est affichée. Compte jetable : smoke-fn-<epoch>@example.com.
#
# Ce que ça prouve :
#   1. off-search répond 200 + `{hits: [...]}` sur une session réelle
#      (nouvelle version : enrichissement via fiches produit).
#   2. gift-list-invite rend l'oracle uniforme `Ce code est invalide.` (404)
#      sur un code inconnu bien formé — preuve que le code redéployé tourne.
#   3. Les deux fonctions refusent l'anonyme en 401 (garde auth intacte).

set -eu

# Les chemins sont ancrés sur l'emplacement du script, pas sur le répertoire
# courant : la documentation fait lancer ce script depuis `supabase-project/`
# comme depuis la racine, et un chemin relatif au répertoire courant donnerait
# `supabase-project/supabase-project/.env` dans le premier cas.
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
REPO_DIR="$(CDPATH='' cd -- "$SCRIPT_DIR/.." && pwd)"

STACK_ENV="${STACK_ENV:-$REPO_DIR/supabase-project/.env}"

# Première porte de refus : le fichier est ABSENT, il n'y a rien à lire.
# (`/dev/null` n'est pas un fichier régulier : `[ -f /dev/null ]` est faux, il
# tomberait ici — exit 1 — alors qu'un fichier vide doit tomber en exit 2.)
if [ ! -f "$STACK_ENV" ]; then
  echo "smoke-functions-serveur.sh: $STACK_ENV introuvable." >&2
  echo "  Depuis la racine du dépôt, ou depuis supabase-project/ :" >&2
  echo "    sh scripts/smoke-functions-serveur.sh" >&2
  echo "    sh ../scripts/smoke-functions-serveur.sh" >&2
  echo "  Autre emplacement : STACK_ENV=/chemin/vers/.env" >&2
  exit 1
fi

# --- Lecture du .env sans le sourcer ----------------------------------------
# Le fichier contient des secrets et des commandes potentielles : on l'extrait
# ligne à ligne, on ne l'exécute pas, et rien n'est affiché.
stack_value() {
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$STACK_ENV" \
    | head -n 1 | sed 's/[[:space:]]*$//; s/^"\(.*\)"$/\1/'
}

API="${API:-$(stack_value SUPABASE_PUBLIC_URL)}"
PUBLISHABLE_KEY="${PUBLISHABLE_KEY:-$(stack_value SUPABASE_PUBLISHABLE_KEY)}"
SECRET_KEY="${SECRET_KEY:-$(stack_value SUPABASE_SECRET_KEY)}"

# Seconde porte de refus : le fichier est PRÉSENT mais incomplet — dont un
# `.env` vidé, dont le lecteur ressort les trois valeurs vides. Les trois sont
# exigées et cette validation précède tout appel réseau : sans SECRET_KEY, le
# compte jetable créé plus bas ne pourrait pas être purgé, et un nettoyage
# impossible n'est pas un succès.
if [ -z "$API" ] || [ -z "$PUBLISHABLE_KEY" ] || [ -z "$SECRET_KEY" ]; then
  echo "smoke-functions-serveur.sh: variables absentes de $STACK_ENV." >&2
  echo "  SUPABASE_PUBLIC_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY sont exigées :" >&2
  echo "  un nettoyage impossible n'est pas un succès (cf. en-tête)." >&2
  exit 2
fi

TMPD="$(mktemp -d "${TMPDIR:-/tmp}/smoke-fn-XXXXXX")"
trap 'rm -rf "$TMPD"' EXIT INT TERM

STAMP="$(date +%s)"
EMAIL="smoke-fn-$STAMP@example.com"
PASSWORD="Smoke-$(openssl rand -hex 12)-Aa1"
PASS=0
FAIL=0

ok() { PASS=$((PASS + 1)); echo "ok   - $1"; }
ko() { FAIL=$((FAIL + 1)); echo "FAIL - $1"; }

# POST JSON -> $TMPD/out.json ; imprime le code HTTP sur stdout.
post() {
  _path="$1"; _jwt="$2"; _data="$3"
  if [ -n "$_jwt" ]; then
    _auth="Authorization: Bearer $_jwt"
  else
    _auth="Authorization: Bearer $PUBLISHABLE_KEY"
  fi
  curl -sS -o "$TMPD/out.json" -w '%{http_code}' -X POST "$API$_path" \
    -H "apikey: $PUBLISHABLE_KEY" -H "$_auth" \
    -H 'Content-Type: application/json' -d "$_data"
}

jget() {
  python3 -c "import json,sys; print(json.load(open('$TMPD/out.json')).get('$1', ''))" 2>/dev/null || echo ''
}

echo "== 1. signup $EMAIL"
CODE=$(post "/auth/v1/signup" "" "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
JWT=$(jget access_token)
UID=$(python3 -c "import json; print(json.load(open('$TMPD/out.json')).get('user',{}).get('id',''))" 2>/dev/null || echo '')
if [ -z "$JWT" ]; then
  if [ -n "$UID" ]; then
    echo "info - signup sans session (confirmation requise ?) -> tentative signin"
    CODE=$(post "/auth/v1/token?grant_type=password" "" "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
    JWT=$(jget access_token)
    UID=$(python3 -c "import json; print(json.load(open('$TMPD/out.json')).get('user',{}).get('id',''))" 2>/dev/null || echo '')
  fi
fi
if [ -n "$JWT" ]; then ok "signup + session (uid ${UID:-?})"; else ko "signup (HTTP $CODE : $(head -c 200 "$TMPD/out.json")"; fi

echo "== 2. off-search sans JWT -> 401 attendu"
CODE=$(post "/functions/v1/off-search" "" '{"q":"lait","limit":5}')
[ "$CODE" = "401" ] && ok "off-search anonyme refusé (401)" || ko "off-search anonyme: HTTP $CODE"

echo "== 3. off-search authentifié {q:lait} -> 200 + hits"
if [ -n "$JWT" ]; then
  CODE=$(post "/functions/v1/off-search" "$JWT" '{"q":"lait","limit":5}')
  HITS=$(python3 -c "import json; d=json.load(open('$TMPD/out.json')); print(len(d['hits']))" 2>/dev/null || echo '?')
  if [ "$CODE" = "200" ] && [ "$HITS" != "?" ]; then
    ok "off-search 200, $HITS hit(s)"
    python3 -c "import json; h=json.load(open('$TMPD/out.json'))['hits'][0]; print('info - 1er hit:', h.get('code'), '|', (h.get('name') or '')[:60])" 2>/dev/null || true
  elif [ "$CODE" = "502" ]; then
    ko "off-search 502 : Open Food Facts injoignable (réessayer, pas forcément un défaut de déploiement)"
  else
    ko "off-search: HTTP $CODE : $(head -c 200 "$TMPD/out.json")"
  fi
else
  ko "off-search authentifié : sans JWT, test ignoré"
fi

echo "== 4. gift-list-invite sans JWT -> 401 attendu"
CODE=$(post "/functions/v1/gift-list-invite" "" '{"action":"redeem","code":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}')
[ "$CODE" = "401" ] && ok "gift-list-invite anonyme refusé (401)" || ko "gift-list-invite anonyme: HTTP $CODE"

echo "== 5. gift-list-invite redeem code inconnu -> oracle 404 attendu"
if [ -n "$JWT" ]; then
  CODE=$(post "/functions/v1/gift-list-invite" "$JWT" '{"action":"redeem","code":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}')
  ERR=$(jget error)
  if [ "$CODE" = "404" ] && [ "$ERR" = "Ce code est invalide." ]; then
    ok "oracle uniforme (404 « Ce code est invalide. »)"
  else
    ko "redeem inconnu: HTTP $CODE : $(head -c 200 "$TMPD/out.json")"
  fi
else
  ko "redeem inconnu : sans JWT, test ignoré"
fi

echo "== 6. nettoyage compte jetable"
# Une seule condition à distinguer : un compte a été créé (UID posé) ou non.
# SECRET_KEY n'est pas testée ici parce qu'elle est garantie non vide par la
# porte de refus de la ligne 79, qui sort en 2 avant tout appel réseau —
# l'ancienne branche « sans SECRET_KEY, purger manuellement » ne pouvait donc
# jamais être jouée. L'intention de purge manuelle survit dans le ko ci-dessous,
# qui dit explicitement de purger $EMAIL à la main.
if [ -n "${UID:-}" ]; then
  DEL=$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE "$API/auth/v1/admin/users/$UID" \
    -H "apikey: $SECRET_KEY" -H "Authorization: Bearer $SECRET_KEY")
  [ "$DEL" = "200" ] || [ "$DEL" = "204" ] && ok "compte $EMAIL supprimé" || ko "purge admin: HTTP $DEL (purger $EMAIL à la main)"
else
  echo "info - aucun compte créé, rien à purger"
fi

echo "== résultat : $PASS ok, $FAIL échec(s)"
[ "$FAIL" = "0" ]
