#!/usr/bin/env sh
# scripts/smoke-functions-serveur.sh
# Smoke-test ciblé post-redéploiement : off-search (moteur search-a-licious)
# + gift-list-invite (oracle uniforme), contre une stack déployée.
#
#   API=https://api.mondomaine.fr PUBLISHABLE_KEY=sb_publishable_... \
#     SECRET_KEY=sb_secret_... sh scripts/smoke-functions-serveur.sh
#
# SECRET_KEY ne sert qu'au nettoyage (suppression du compte jetable via
# l'endpoint admin). Sans lui, le compte est signalé pour purge manuelle.
# Aucune clé n'est affichée. Compte jetable : smoke-fn-<epoch>@example.com.
#
# Ce que ça prouve :
#   1. off-search répond 200 + `{hits: [...]}` sur une session réelle
#      (nouvelle version : enrichissement via fiches produit).
#   2. gift-list-invite rend l'oracle uniforme `Ce code est invalide.` (404)
#      sur un code inconnu bien formé — preuve que le code redéployé tourne.
#   3. Les deux fonctions refusent l'anonyme en 401 (garde auth intacte).

set -eu

API="${API:-}"
PUBLISHABLE_KEY="${PUBLISHABLE_KEY:-}"
SECRET_KEY="${SECRET_KEY:-}"

if [ -z "$API" ] || [ -z "$PUBLISHABLE_KEY" ]; then
  echo "Usage: API=https://api.mondomaine.fr PUBLISHABLE_KEY=sb_publishable_... sh scripts/smoke-functions-serveur.sh" >&2
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
if [ -n "${UID:-}" ] && [ -n "$SECRET_KEY" ]; then
  DEL=$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE "$API/auth/v1/admin/users/$UID" \
    -H "apikey: $SECRET_KEY" -H "Authorization: Bearer $SECRET_KEY")
  [ "$DEL" = "200" ] || [ "$DEL" = "204" ] && ok "compte $EMAIL supprimé" || ko "purge admin: HTTP $DEL (purger $EMAIL à la main)"
elif [ -n "${UID:-}" ]; then
  echo "info - sans SECRET_KEY : purger manuellement $EMAIL (uid $UID)"
else
  echo "info - aucun compte créé, rien à purger"
fi

echo "== résultat : $PASS ok, $FAIL échec(s)"
[ "$FAIL" = "0" ]
