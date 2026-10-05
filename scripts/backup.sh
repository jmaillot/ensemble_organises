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
#   DB_CONTAINER           service Compose de la base (défaut : db)
#   STORAGE_SERVICE        service de stockage      (défaut : storage)
#   BACKUP_DIR             destination              (défaut : supabase-project/backups)
#   RETENTION_DAYS         jours conservés          (défaut : 30, cf. politique §6)
#   BACKUP_PASSPHRASE_FILE fichier contenant la phrase secrète de chiffrement
#                          (OBLIGATOIRE, jamais versionné, chmod 600 ; voir
#                          docs/BACKEND.md §11). Lue par fichier uniquement :
#                          jamais en argv, jamais journalisée.

set -eu

DB_CONTAINER="${DB_CONTAINER:-db}"
STORAGE_SERVICE="${STORAGE_SERVICE:-storage}"
PROJECT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")/../supabase-project" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
BACKUP_PASSPHRASE_FILE="${BACKUP_PASSPHRASE_FILE:-$PROJECT_DIR/.backup-passphrase}"

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

# --- Chiffrement --------------------------------------------------------------
# Données personnelles : aucun artefact ne reste en clair sur le disque.
# La phrase secrète vit dans un fichier chmod 600, hors dépôt ; `gpg` la lit
# par `--passphrase-file`, jamais en ligne de commande.
if [ ! -f "$BACKUP_PASSPHRASE_FILE" ]; then
  echo "backup.sh: phrase secrète introuvable : $BACKUP_PASSPHRASE_FILE" >&2
  echo "           Créez-la (hors dépôt) : openssl rand -base64 48 > fichier && chmod 600 fichier" >&2
  exit 1
fi
if [ "$(stat -c %a "$BACKUP_PASSPHRASE_FILE")" != "600" ]; then
  echo "backup.sh: permissions trop ouvertes sur $BACKUP_PASSPHRASE_FILE (exigé : 600)." >&2
  exit 1
fi

# --- Manifeste --------------------------------------------------------------
# Le manifeste porte sur les fichiers CHIFFRÉS : c'est ce qui est archivé.
for artefact in database.dump storage.tar.gz db-config.tar.gz; do
  gpg --batch --yes --pinentry-mode loopback \
    --passphrase-file "$BACKUP_PASSPHRASE_FILE" \
    --symmetric --cipher-algo AES256 \
    -o "$out/$artefact.gpg" "$out/$artefact"
  rm -f "$out/$artefact"
done
( cd "$out" && sha256sum ./*.gpg > SHA256SUMS )

echo
echo "Sauvegarde chiffrée terminée :"
ls -lh "$out" | sed 's/^/  /'
echo
echo "Contrôle d'intégrité : (cd '$out' && sha256sum -c SHA256SUMS)"
echo "Restauration : BACKUP_PASSPHRASE_FILE=<fichier> sh scripts/restore.sh $stamp --confirm"

# --- Rétention --------------------------------------------------------------
find "$BACKUP_DIR" -maxdepth 1 -type d -name '20*' -mtime "+$RETENTION_DAYS" -print -exec rm -rf {} +
