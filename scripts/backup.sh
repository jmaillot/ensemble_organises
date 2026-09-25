#!/usr/bin/env sh
# scripts/backup.sh
# Sauvegarde cohérente de la stack : base PostgreSQL, objets Storage et volume
# `db-config` (clé pgsodium + configuration).
#
# `pg_dump` en format custom produit un instantané cohérent même sur une base
# active ; c'est ce fichier, et non une copie à chaud, qui doit être archivé.
#
#   sh scripts/backup.sh
#   BACKUP_DIR=/srv/backups/eo sh scripts/backup.sh
#
# Variables d'environnement reconnues :
#   DB_CONTAINER     service Compose de la base (défaut : db)
#   STORAGE_SERVICE  service de stockage      (défaut : storage)
#   BACKUP_DIR       destination              (défaut : supabase-project/backups)
#   RETENTION_DAYS   jours conservés          (défaut : 14)

set -eu

DB_CONTAINER="${DB_CONTAINER:-db}"
STORAGE_SERVICE="${STORAGE_SERVICE:-storage}"
PROJECT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")/../supabase-project" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

# Le répertoire de sauvegarde contient des données personnelles : il ne doit
# jamais être versionné.
if [ -d "$PROJECT_DIR/.git" ] && [ ! -f "$PROJECT_DIR/.gitignore" ]; then
  echo "backup.sh: aucun .gitignore dans supabase-project/." >&2
  echo "           Ajoutez 'backups/' au fichier d'exclusion avant de commiter." >&2
fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$BACKUP_DIR/$stamp"
mkdir -p "$out"

echo "Sauvegarde $stamp → $out"

# --- Base de données --------------------------------------------------------
echo "  · base de données"
. "$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)/lib-db.sh"
db_resolve
db_exec_as postgres \
  pg_dump -U "$DB_USER_RESOLVED" -d "$DB_NAME_RESOLVED" \
    --format=custom --compress=9 --no-owner --no-privileges \
  > "$out/database.dump"

# --- Objets stockés ---------------------------------------------------------
echo "  · objets storage"
docker run --rm \
  -v "${COMPOSE_PROJECT_NAME:-supabase}_storage:/source:ro" \
  -v "$out:/backup" \
  alpine:3.21 tar -czf /backup/storage.tar.gz -C /source .

# --- Clé pgsodium et configuration de la base -------------------------------
echo "  · db-config (clé pgsodium, configuration)"
docker run --rm \
  -v "${COMPOSE_PROJECT_NAME:-supabase}_db-config:/source:ro" \
  -v "$out:/backup" \
  alpine:3.21 tar -czf /backup/db-config.tar.gz -C /source .

# --- Manifeste --------------------------------------------------------------
( cd "$out" && sha256sum ./* > SHA256SUMS )

echo
echo "Sauvegarde terminée :"
ls -lh "$out" | sed 's/^/  /'
echo
echo "Contrôle d'intégrité : (cd '$out' && sha256sum -c SHA256SUMS)"
echo "Restauration : sh scripts/restore.sh $stamp --confirm"

# --- Rétention --------------------------------------------------------------
find "$BACKUP_DIR" -maxdepth 1 -type d -name '20*' -mtime "+$RETENTION_DAYS" -print -exec rm -rf {} +
