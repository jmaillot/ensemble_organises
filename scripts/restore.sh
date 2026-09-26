#!/usr/bin/env sh
# scripts/restore.sh
# Restaure une sauvegarde produite par `scripts/backup.sh`.
#
# La restauration REMPLACE les données de la base et des volumes : la cible est
# irréversible. Le script refuse donc de s'exécuter sans `--confirm`, et il faut
# fournir explicitement l'identifiant de la sauvegarde.
#
#   sh scripts/backup.sh                      # produire une sauvegarde
#   sh scripts/restore.sh 20260925T060000Z --confirm
#   sh scripts/restore.sh 20260925T060000Z --dry-run
#
# Variables d'environnement reconnues :
#   DB_CONTAINER     service Compose de la base (défaut : db)
#   STORAGE_SERVICE  service de stockage      (défaut : storage)
#   BACKUP_DIR       origine des sauvegardes  (défaut : supabase-project/backups)

set -eu

DB_CONTAINER="${DB_CONTAINER:-db}"
STORAGE_SERVICE="${STORAGE_SERVICE:-storage}"
PROJECT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")/../supabase-project" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"

stamp="${1:-}"
confirm="${2:-}"

if [ -z "$stamp" ]; then
  echo "usage : sh scripts/restore.sh <horodatage> [--confirm|--dry-run]" >&2
  echo "sauvegardes disponibles :" >&2
  ls -1 "$BACKUP_DIR" 2>/dev/null | sed 's/^/  /' >&2
  exit 2
fi

target="$BACKUP_DIR/$stamp"
if [ ! -d "$target" ]; then
  echo "restore.sh: sauvegarde introuvable : $target" >&2
  exit 1
fi

echo "Sauvegarde ciblée : $target"
( cd "$target" && sha256sum -c SHA256SUMS )

if [ "$confirm" = "--dry-run" ]; then
  echo
  echo "Simulation : rien n'a été modifié."
  exit 0
fi

if [ "$confirm" != "--confirm" ]; then
  echo
  echo "RESTAURATION DESTRUCTIVE : la base et les volumes de $stamp vont être remplacés." >&2
  echo "Relancez avec --confirm une fois la sauvegarde vérifiée." >&2
  exit 1
fi

echo "Arrêt des services dépendants (PostgREST, Realtime, Functions, Auth)…"
db_compose stop rest realtime functions auth analytics 2>/dev/null || true

echo "  · base de données"
. "$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)/lib-db.sh"
db_resolve
db_exec -q -c 'drop schema if exists public cascade; create schema public;'

db_exec_as postgres \
  pg_restore -U "$DB_USER_RESOLVED" -d "$DB_NAME_RESOLVED" --no-owner --no-privileges <"$target/database.dump"

echo "  · objets storage"
docker run --rm \
  -v "${COMPOSE_PROJECT_NAME:-supabase}_storage:/target" \
  -v "$target:/backup:ro" \
  alpine:3.21 sh -c 'rm -rf /target/* && tar -xzf /backup/storage.tar.gz -C /target'

echo "  · db-config"
docker run --rm \
  -v "${COMPOSE_PROJECT_NAME:-supabase}_db-config:/target" \
  -v "$target:/backup:ro" \
  alpine:3.21 sh -c 'rm -rf /target/* && tar -xzf /backup/db-config.tar.gz -C /target'

echo
echo "Restauration terminée. Rechargez le profil des rôles révoqués par la sauvegarde :"
echo "  sh run.sh start"
echo "puis vérifiez : sh run.sh logs db   |   sh ../scripts/test-db.sh"
