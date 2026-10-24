#!/bin/sh
# Build et déploiement du frontend, avec estampille correcte garantie.
#
# POURQUOI CE SCRIPT. Le 24/10/2026, un rebuild sans `GIT_SHA` devant les
# commandes a produit un déploiement « unknown » : Compose transmet
# l'argument toujours, vide quand la variable manque, et le repli
# `unknown` de la phase 24 est silencieux (c'est son contrat). Le SHA ne
# peut pas être calculé dans le build (`.git` est exclu du contexte) ni
# par Compose (pas de substitution shell dans le YAML) : il vient du
# shell opérateur. Ce script le fait à sa place — l'oubli devient
# structurellement impossible.
#
# L'estampille suit les RELEASES GitHub : `git describe --tags --always`
# donne le tag exact (`v1.2.0`) sur un tag, `v1.2.0-3-ga41df8b` (version +
# commits qui la dépassent) sinon, le SHA court à défaut de tag. Créer et
# pousser un tag à chaque version livrée :
#   git tag v0.9.0 && git push --tags
#
# Usage : sh scripts/build-app.sh [--no-cache]
set -eu

cd "$(dirname "$0")/.."

VERSION="$(git describe --tags --always)"
echo "estampille: $VERSION"

ARGS="--env-file .env.app -f compose.app.yaml"
docker compose $ARGS build ${1:-} ensemble-organises-app
docker compose $ARGS up -d --wait ensemble-organises-app

# Preuve immédiate : le fichier doit exister et porter l'estampille. Un
# silence ici vaudrait échec inexpliqué (AGENTS.md §2.7 F).
docker compose $ARGS exec ensemble-organises-app \
  cat /usr/share/nginx/html/version.json
echo "rebuild terminé — contrôlez aussi l'en-tête :"
echo "  curl -sI https://<votre-domaine-app>/version.json | grep -i x-app-version"
