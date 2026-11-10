#!/usr/bin/env sh
# scripts/test-sw-gate.sh
# Spec e2e RÉELLE de la gate « file vide » de mise à jour du SW (GATE-01,
# phase 41) contre DEUX builds réels servis sur le MÊME origin.
#
#   sh scripts/test-sw-gate.sh
#   TEST_SW_GATE_CONTROLE_ROUGE=1 sh scripts/test-sw-gate.sh   # preuve rouge du contrôle négatif
#
# CE QUE CE SCRIPT PROUVE, ET CE QU'IL NE PROUVE PAS
#   Il construit DEUX builds successifs à VITE_BUILD_ID distincts (dist-v1,
#   dist-v2), prouve que leur precache diffère (diff sw.js non vide) AVANT
#   tout lancement de la spec, démarre le serveur statique du harnais
#   (scripts/e2e-sw-server.mjs, Node natif, no-cache + repli SPA, symlink
#   dist-current relu à chaque requête), et fait tourner
#   app/e2e/sw-gate-real.spec.ts --project=chromium --workers=1 : revalidation
#   RÉELLE de /sw.js par le navigateur, worker en attente réel, bandeau réel
#   poussé par onNeedRefresh, gate fermée (file non vide → bouton désactivé)
#   et ouverte (file vide → application du build B).
#
#   Il ne prouve PAS le déploiement Traefik/nginx réel ni le precache servi
#   par nginx en production : GATE-PROD reste observatoire hors jalon
#   (docs/EXPLOITATION.md) — le build+preview simule l'origine, il n'est pas
#   la prod.
#
#   C'est l'analogue de `test-join-token-real.sh` : un run séparé, documenté,
#   qui REFUSE sans ses prérequis — jamais de skip silencieux (JT-03). La
#   suite e2e standard reste 100 % verte sans ce script (JT-01) ; elle ne
#   paie aucun des trois builds de ce run (coût : plusieurs minutes, T-41-03).
#
# PREUVE ANTI-PROD (assumption A2, T-41-01)
#   Un build STANDARD (sans aucun flag) est d'abord construit dans dist-std :
#   le grep de son bundle pour `__eoSwHarness` et `e2e-sw-harness` doit être
#   VIDE. Si le symbole survit, le tree-shaking a échoué : REFUS nommé, le
#   branchement de main.tsx doit être corrigé — jamais un harnais en prod.
#
# MODE CONTRÔLE ROUGE (§2.7 B — un contrôle se prouve sur son cas qui échoue)
#   TEST_SW_GATE_CONTROLE_ROUGE=1 lance UNIQUEMENT le contrôle négatif de la
#   spec avec E2E_SW_CONTROLE_ROUGE=1 (commutation forcée vers le second
#   build) et exige qu'il ÉCHOUE : un succès est traité comme un échec du
#   script — le contrôle qui ne peut pas échouer ne prouve rien.
#
# AUCUN SECRET (§2.7 H non déclenché) : VITE_BUILD_ID et VITE_E2E_SW_HARNESS
# sont des valeurs de test sans secret, passées en env du build uniquement —
# jamais persistées dans .env.app, compose.app.yaml ou le Dockerfile (T-41-02).

set -eu

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
REPO_DIR="$(CDPATH='' cd -- "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$REPO_DIR/app"
LIEN="$SCRIPT_DIR/dist-current"

BUILD_ID_1="gate-a"
BUILD_ID_2="gate-b"

# ---------------------------------------------------------------- prérequis
if [ ! -d "$APP_DIR/node_modules" ]; then
  echo "test-sw-gate.sh: $APP_DIR/node_modules introuvable." >&2
  echo "  Le run construit l'application : npm ci dans app/ d'abord." >&2
  exit 1
fi
if ! (cd "$APP_DIR" && npx --no-install playwright --version >/dev/null 2>&1); then
  echo "test-sw-gate.sh: Playwright indisponible dans app/." >&2
  echo "  npx playwright install chromium (ou npm ci) d'abord." >&2
  exit 1
fi

purger() {
  rm -f "$LIEN"
  rm -rf "$APP_DIR/dist-std" "$APP_DIR/dist-v1" "$APP_DIR/dist-v2"
  if [ ! -e "$LIEN" ] && [ ! -d "$APP_DIR/dist-std" ] && [ ! -d "$APP_DIR/dist-v1" ] && [ ! -d "$APP_DIR/dist-v2" ]; then
    echo "✓ purge des artefacts du run (dist-current, dist-std, dist-v1, dist-v2)"
  else
    echo "✗ purge incomplète : des artefacts du run subsistent" >&2
  fi
}
trap purger EXIT

# ------------------------------------------------- build standard (preuve A2)
echo "── build standard (sans flag) — preuve anti-prod A2"
(cd "$APP_DIR" && npm run build -- --outDir dist-std --emptyOutDir >/dev/null)
# Le grep porte sur les fichiers JS du bundle uniquement — jamais les .map :
# une sourcemap embarque le code source par définition, et le plan demande la
# preuve sur le bundle exécutable (`dist/assets/*.js`).
FICHIERS_STD=$(find "$APP_DIR/dist-std/assets" -name '*.js' ! -name '*.map' 2>/dev/null)
SUITE_DE_HARNAIS=$(grep -l "__eoSwHarness\|e2e-sw-harness" $FICHIERS_STD 2>/dev/null | wc -l | tr -d ' ')
if [ "$SUITE_DE_HARNAIS" != "0" ]; then
  echo "test-sw-gate.sh: le harnais e2e SURVIT dans le bundle standard (A2 violé)." >&2
  grep -l "__eoSwHarness\|e2e-sw-harness" $FICHIERS_STD >&2 || true
  echo "  Le tree-shaking a échoué : corriger le branchement de main.tsx avant de relancer." >&2
  exit 1
fi
echo "✓ grep du bundle standard : 0 occurrence de __eoSwHarness / e2e-sw-harness"

# ---------------------------------------------------------- les deux builds
echo "── build 1 (VITE_BUILD_ID=$BUILD_ID_1, harnais flag-compilé)"
(cd "$APP_DIR" && VITE_BUILD_ID="$BUILD_ID_1" VITE_E2E_SW_HARNESS=1 npm run build -- --outDir dist-v1 --emptyOutDir >/dev/null)
echo "── build 2 (VITE_BUILD_ID=$BUILD_ID_2, harnais flag-compilé)"
(cd "$APP_DIR" && VITE_BUILD_ID="$BUILD_ID_2" VITE_E2E_SW_HARNESS=1 npm run build -- --outDir dist-v2 --emptyOutDir >/dev/null)

# A1 : le buildId est bien incrusté dans le bundle (recours documenté :
# `define` dans vite.config.ts si Vite ne peuplait pas import.meta.env).
for pair in "dist-v1:$BUILD_ID_1" "dist-v2:$BUILD_ID_2"; do
  dist="${pair%%:*}"
  id="${pair##*:}"
  if ! grep -rq "$id" "$APP_DIR/$dist/assets"; then
    echo "test-sw-gate.sh: VITE_BUILD_ID=$id absent du bundle $dist (A1 violé)." >&2
    echo "  Recours documenté au plan : définir \`define\` dans vite.config.ts." >&2
    exit 1
  fi
done
echo "✓ VITE_BUILD_ID incrusté dans les deux bundles"

# Contrôle d'entrée (§2.7 : le contrôle se prouve sur son entrée) — deux
# precache identiques rendraient la spec incapable de prouver une mise à jour.
if cmp -s "$APP_DIR/dist-v1/sw.js" "$APP_DIR/dist-v2/sw.js"; then
  echo "test-sw-gate.sh: les deux builds produisent un precache IDENTIQUE." >&2
  echo "  La spec ne peut pas prouver une mise à jour — refus avant tout run." >&2
  exit 1
fi
echo "✓ diff dist-v1/sw.js ≠ dist-v2/sw.js (precache distinct, preuve SC1)"

# Couverture de precache de chaque dist (appui optionnel du plan) — le script
# lit `app/dist` en dur : l'appui passe par un swap temporaire de symlink,
# avec restauration explicite (aucun succès muet).
if [ -f "$SCRIPT_DIR/check-precache-coverage.sh" ]; then
  DIST_REEL=""
  if [ -e "$APP_DIR/dist" ]; then
    DIST_REEL="$APP_DIR/dist.original-sw-gate"
    mv "$APP_DIR/dist" "$DIST_REEL"
  fi
  COUVERTURE_OK="1"
  for dist in dist-v1 dist-v2; do
    ln -sfn "$dist" "$APP_DIR/dist"
    if ! (cd "$APP_DIR" && sh "$SCRIPT_DIR/check-precache-coverage.sh" >/dev/null); then
      COUVERTURE_OK=""
      echo "⚠ couverture precache non concluant sur $dist (non bloquant : le diff fait foi)" >&2
    fi
  done
  rm -f "$APP_DIR/dist"
  if [ -n "$DIST_REEL" ]; then mv "$DIST_REEL" "$APP_DIR/dist"; fi
  [ -n "$COUVERTURE_OK" ] && echo "✓ couverture precache vérifiée sur dist-v1 et dist-v2" || true
fi

# ------------------------------------------------- serveur + run de la spec
ln -sfn "../app/dist-v1" "$LIEN"
node "$SCRIPT_DIR/e2e-sw-server.mjs" &
SERVEUR_PID=$!
arreter_serveur() { kill "$SERVEUR_PID" 2>/dev/null || true; wait "$SERVEUR_PID" 2>/dev/null || true; }
trap 'arreter_serveur; purger' EXIT

# §2.7 F : un succès muet est un échec inexpliqué — une réponse 200 sur le
# port peut venir d'UN AUTRE processus (un serveur oublié d'un run précédent)
# pendant que le nôtre meurt en EADDRINUSE. Le processus est donc vérifié
# VIVANT avant chaque curl : un serveur mort est un refus nommé, jamais un
# run dirigé contre le mauvais serveur (défaut observé le 2026-11-10).
for tentative in 1 2 3 4 5; do
  if ! kill -0 "$SERVEUR_PID" 2>/dev/null; then
    echo "test-sw-gate.sh: le serveur du harnais est MORT (port 4173 déjà occupé ?)" >&2
    echo "  Tuer le processus qui occupe le port puis relancer — un curl vert" >&2
    echo "  contre un serveur étranger invaliderait tout le run." >&2
    exit 1
  fi
  if curl -fsS -o /dev/null "http://127.0.0.1:4173/index.html"; then
    echo "✓ serveur du harnais prêt sur http://127.0.0.1:4173 (racine : dist-current → dist-v1)"
    break
  fi
  if [ "$tentative" = "5" ]; then
    echo "test-sw-gate.sh: le serveur du harnais n'a jamais répondu." >&2
    exit 1
  fi
  sleep 1
done

if [ "${TEST_SW_GATE_CONTROLE_ROUGE:-}" = "1" ]; then
  # Preuve rouge du contrôle négatif : la spec doit ÉCHOUER.
  echo "── mode CONTRÔLE ROUGE : le contrôle négatif doit échouer"
  if (cd "$APP_DIR" && E2E_SW_BASE_URL="http://127.0.0.1:4173" \
      E2E_SW_BUILD_ID_1="$BUILD_ID_1" E2E_SW_BUILD_ID_2="$BUILD_ID_2" \
      E2E_SW_CONTROLE_ROUGE=1 \
      npx playwright test e2e/sw-gate-real.spec.ts --project=chromium --workers=1 -g 'contrôle négatif'); then
    echo "test-sw-gate.sh: le contrôle négatif a RÉUSSI alors qu'il devait échouer." >&2
    echo "  Un contrôle qui ne peut pas échouer ne prouve rien (§2.7 B)." >&2
    exit 1
  fi
  echo "✓ contrôle négatif VU ROUGE : la simulation est falsifiable"
  exit 0
fi

echo "── run de la spec sw-gate (chromium seul, workers: 1 — commutation séquentielle du symlink)"
if (cd "$APP_DIR" && E2E_SW_BASE_URL="http://127.0.0.1:4173" \
    E2E_SW_BUILD_ID_1="$BUILD_ID_1" E2E_SW_BUILD_ID_2="$BUILD_ID_2" \
    npx playwright test e2e/sw-gate-real.spec.ts --project=chromium --workers=1); then
  echo "✓ GATE-01 : les 4 cas de la spec sw-gate sont verts (deux builds réels, même origin)"
else
  echo "✗ la spec sw-gate a échoué : voir le rapport Playwright ci-dessus" >&2
  exit 1
fi
