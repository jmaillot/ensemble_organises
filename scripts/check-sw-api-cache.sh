#!/bin/sh
# Contrôle statique (33-02, OFFR-05) : le service worker ne doit JAMAIS mettre
# une réponse API en cache — le cache de lecture passe par TanStack/IndexedDB,
# le serveur reste la seule vérité (D-10). Si une stratégie cacheable de
# workbox (CacheFirst, StaleWhileRevalidate, NetworkFirst,
# CacheableResponsePlugin) apparaissait dans `dist/sw.js`, ce contrôle casse
# la vérification au lieu de laisser un défaut silencieux partir en production.
#
# Le précache `precacheAndRoute` est légitime et volontairement hors de la
# liste interdite : il sert les morceaux de l'application (navigation hors
# ligne, D-09), jamais une réponse de `/rest/`, `/auth/`, `/functions/`,
# `/realtime/` ou `/storage/`.
#
# Usage :
#   sh scripts/check-sw-api-cache.sh                          (après `npm run build` dans app/)
#   sh scripts/check-sw-api-cache.sh --check-file <chemin>    (contre-preuve sur une fixture)
#
# Répétable à chaque rebuild : le script ne fait que lire `dist/` et `src/sw.ts`.
set -eu

cd "$(dirname "$0")/../app"

BUNDLE="dist/sw.js"
if [ "${1:-}" = "--check-file" ]; then
  [ -n "${2:-}" ] || { echo "ECHEC: --check-file attend un chemin."; exit 1; }
  BUNDLE="$2"
fi

if [ "$BUNDLE" = "dist/sw.js" ]; then
  test -d dist || { echo "ECHEC: dist/ absent — lancer d'abord 'npm run build' dans app/."; exit 1; }
  test -f dist/sw.js || { echo "ECHEC: dist/sw.js absent — le SW injectManifest n'a pas été généré."; exit 1; }
else
  test -f "$BUNDLE" || { echo "ECHEC: fichier $BUNDLE absent."; exit 1; }
fi

# 1. La denylist de navigation doit rester intacte : ces cinq motifs disent au
#    SW de NE PAS servir index.html sur les routes de l'API. Leur disparition
#    déplacerait l'échec d'une API indisponible vers une réponse HTML illisible.
for motif in '/^\/rest\//' '/^\/auth\//' '/^\/functions\//' '/^\/realtime\//' '/^\/storage\//'; do
  if ! grep -qF "$motif" "$BUNDLE"; then
    echo "ECHEC: motif de denylist navigation absent de $BUNDLE : $motif"
    exit 1
  fi
done
echo "denylist navigation (5 motifs) : presente"

# 2. Aucune stratégie cacheable : c'est la garantie « le SW ne cache jamais une
#    réponse API ». `precacheAndRoute` est hors de cette liste (voir l'en-tête).
if grep -Eq 'CacheFirst|StaleWhileRevalidate|NetworkFirst|CacheableResponsePlugin' "$BUNDLE"; then
  echo "ECHEC: stratégie cacheable détectée dans $BUNDLE — le SW ne doit jamais cacher une réponse API."
  exit 1
fi
echo "strategies cacheables : aucune"

# 3. Le source `src/sw.ts` ne doit contenir qu'un seul `registerRoute(` : la
#    NavigationRoute légitime (denylist ci-dessus). Toute route ajoutée
#    contournait cette preuve — le contrôle refuse le moindre `registerRoute(`
#    supplémentaire.
routes=$(grep -o 'registerRoute(' src/sw.ts | wc -l)
if [ "$routes" != "1" ]; then
  echo "ECHEC: src/sw.ts contient $routes registerRoute( — seule la NavigationRoute (denylist API) est permise."
  exit 1
fi
echo "registerRoute dans src/sw.ts : 1 (NavigationRoute uniquement)"

echo "SW API CACHE: OK"
