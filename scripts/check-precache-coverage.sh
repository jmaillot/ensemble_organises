#!/bin/sh
# Preuve de couverture précache (09-06, D-09) : chaque morceau JS construit
# dans `dist/assets` doit apparaître dans le manifeste que le SW consomme
# (`dist/sw.js`, injectManifest), sinon la navigation hors ligne vers une page
# jamais visitée échoue malgré le préchargement idle.
#
# Usage : sh scripts/check-precache-coverage.sh   (après `npm run build` dans app/)
# Répétable à chaque rebuild : le script ne fait que lire `dist/` et `nginx.conf`.
set -eu

cd "$(dirname "$0")/../app"
test -d dist || { echo "ECHEC: dist/ absent — lancer d'abord 'npm run build' dans app/."; exit 1; }
test -f dist/sw.js || { echo "ECHEC: dist/sw.js absent — le SW injectManifest n'a pas été généré."; exit 1; }

missing=0
total=0
for f in dist/assets/*.js; do
  total=$((total + 1))
  base=$(basename "$f")
  if ! grep -qF "$base" dist/sw.js; then
    echo "NON PRECACHE: $base"
    missing=$((missing + 1))
  fi
done
echo "morceaux JS dans dist/assets : $total, absents du SW : $missing"

# Un morceau par entrée de la table unique : si le routeur peut demander un
# morceau que le build ne produit pas (ou l'inverse), la navigation fiable
# (D-09) repose sur une hypothèse fausse — échec explicite, pas silence.
expected=$(grep -c "() => import(" src/app/route-preload.ts)
found=$(ls dist/assets | grep -cE -- "-page-[A-Za-z0-9_.-]+\.js$" || true)
echo "entrees routeChunkLoaders : $expected, morceaux *-page-* dans dist : $found"
if [ "$expected" != "$found" ]; then
  echo "ECHEC: la table des morceaux et le build divergent — revoir route-preload.ts."
  exit 1
fi

# Alignement SW/nginx (09-02) : le SW servi doit être revalidé à chaque visite.
if ! grep -q "location = /sw.js" nginx.conf; then
  echo "ECHEC: règle no-cache /sw.js absente de app/nginx.conf."
  exit 1
fi
echo "alignement sw.js/nginx : OK"

if [ "$missing" != "0" ]; then
  echo "ECHEC: $missing morceau(x) non précaché(s)."
  exit 1
fi
echo "COUVERTURE PRECACHE: OK"
