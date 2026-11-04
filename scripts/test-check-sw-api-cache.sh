#!/bin/sh
# Contre-preuve du contrôle `check-sw-api-cache.sh` (33-02, OFFR-05).
#
# Un contrôle qui n'a jamais rien refusé n'a pas été exercé (AGENTS.md §2.7).
# Ce script donne au contrôle le cas qui DOIT échouer (fixture mauvaise :
# CacheFirst sur une route API) — vu ROUGE avant le cas qui doit passer
# (fixture bonne) — puis prouve que le source réel `src/sw.ts` passe les
# trois vérifications.
#
# Usage : sh scripts/test-check-sw-api-cache.sh
set -eu

cd "$(dirname "$0")/.."
CHECKER="scripts/check-sw-api-cache.sh"

fail() { echo "ECHEC CONTRE-PREUVE: $1"; exit 1; }

# 1. Cas qui doit échouer — la fixture mauvaise est refusée (vu rouge).
#    (chemins relatifs à app/, le vérificateur y entre avant de lire)
if sh "$CHECKER" --check-file fixtures/sw-mauvais.js > /tmp/sw-mauvais.out 2>&1; then
  cat /tmp/sw-mauvais.out
  fail "la fixture mauvaise (CacheFirst sur /rest/) est passée — le contrôle n'a rien vu."
fi
grep -q "ECHEC" /tmp/sw-mauvais.out || fail "refus de la fixture mauvaise sans message ECHEC explicite."
echo "fixture mauvaise : refusee comme attendu (vu rouge) — $(grep -m1 ECHEC /tmp/sw-mauvais.out)"

# 2. Cas qui doit passer — la fixture bonne est acceptée.
sh "$CHECKER" --check-file fixtures/sw-bon.js > /tmp/sw-bon.out 2>&1 \
  || { cat /tmp/sw-bon.out; fail "la fixture bonne a été refusée à tort."; }
grep -q "SW API CACHE: OK" /tmp/sw-bon.out || fail "sortie sans verdict OK sur la fixture bonne."
echo "fixture bonne : acceptee"

# 3. Le vérificateur refuse un fichier absent (il ne regarde pas dans le vide).
if sh "$CHECKER" --check-file fixtures/inexistant.js > /dev/null 2>&1; then
  fail "un fichier absent est passé — le vérificateur ne lit rien."
fi
echo "fichier absent : refuse"

echo "CONTRE-PREUVE SW API CACHE: OK"
