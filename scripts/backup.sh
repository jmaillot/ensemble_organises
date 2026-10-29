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
#   EO_MAIL_TO             destinataire du mail de résultat (D-06) ; sans
#                          valeur, la sauvegarde s'exécute sans notification.
#
# En toute fin, un mail part à CHAQUE exécution — succès comme échec (D-06) —
# via scripts/send-mail.sh, sujet préfixé [EO-backup].

set -eu

# Le verdict traverse tout le script malgré `set -e` : chaque étape critique
# est gardée (`if ! commande; then verdict_fail=1; verdict_step=…; fi`) et
# note son échec au lieu de tuer l'exécution. Un trap purge les artefacts en
# clair tant que le chiffrement n'a pas abouti. Le mail de fin (D-06) part
# donc à chaque exécution, succès comme échec.
verdict_fail=0
verdict_step=""

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

# Tant que le chiffrement n'a pas abouti, `database.dump` et les tars sont EN
# CLAIR sur le disque : un `set -e` qui tuerait le script à la première
# commande en échec les y laisserait, et supprimerait le mail D-06. Le trap
# purge ces artefacts à toute sortie tant qu'il est posé ; il est retiré
# après le chiffrement complet réussi.
trap 'rm -f "$out"/database.dump "$out"/*.tar.gz' EXIT

echo "Sauvegarde $stamp → $out"

# --- Base de données --------------------------------------------------------
echo "  · base de données"
. "$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)/lib-db.sh"
db_resolve
# Étape gardée : sous set -e, un pg_dump en échec tuerait le script AVANT le
# mail D-06 et le trap de purge n'aurait pas la décision d'archiver un dump
# tronqué — verdict échec et poursuite, la suite saute les étapes downstream.
if ! db_exec_as postgres \
  pg_dump -U "$DB_USER_RESOLVED" -d "$DB_NAME_RESOLVED" \
    --format=custom --compress=9 --no-owner --no-privileges \
  > "$out/database.dump"; then
  echo "backup.sh: pg_dump a échoué." >&2
  verdict_fail=1
  verdict_step="dump base"
fi

# --- Objets stockés ---------------------------------------------------------
echo "  · objets storage"
if ! docker run --rm \
  -v "${COMPOSE_PROJECT_NAME:-supabase}_storage:/source:ro" \
  -v "$out:/backup" \
  alpine:3.21 tar -czf /backup/storage.tar.gz -C /source .; then
  echo "backup.sh: le tar du storage a échoué." >&2
  verdict_fail=1
  verdict_step="tar storage"
fi

# --- Clé pgsodium et configuration de la base -------------------------------
echo "  · db-config (clé pgsodium, configuration)"
if ! docker run --rm \
  -v "${COMPOSE_PROJECT_NAME:-supabase}_db-config:/source:ro" \
  -v "$out:/backup" \
  alpine:3.21 tar -czf /backup/db-config.tar.gz -C /source .; then
  echo "backup.sh: le tar de db-config a échoué." >&2
  verdict_fail=1
  verdict_step="tar db-config"
fi

# --- Edge Functions ----------------------------------------------------------
# Le service `functions` monte le bind hôte ./volumes/functions (docker-compose
#.yml) : le tar porte le répertoire hôte directement, sans conteneur — même
# convention que « volumes/functions versionné ». Un tar relatif (.) : la
# restauration déballera dans le répertoire, pas sur des chemins absolus.
echo "  · fonctions (volumes/functions)"
if [ ! -d "$PROJECT_DIR/volumes/functions" ]; then
  echo "backup.sh: répertoire des fonctions introuvable : $PROJECT_DIR/volumes/functions" >&2
  echo "           Déployez-les d'abord : sh scripts/deploy-functions.sh" >&2
  verdict_fail=1
  verdict_step="tar functions"
else
  tar -czf "$out/functions.tar.gz" -C "$PROJECT_DIR/volumes/functions" .
fi

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
if [ "$verdict_fail" -eq 0 ]; then
  for artefact in database.dump storage.tar.gz db-config.tar.gz functions.tar.gz; do
    # Étape gardée comme les précédentes : un gpg en échec ne doit ni tuer le
    # script avant le mail D-06, ni laisser croire que l'artefact a été
    # chiffré — le clair correspondant reste à purger, le trap en décide.
    if ! gpg --batch --yes --pinentry-mode loopback \
      --passphrase-file "$BACKUP_PASSPHRASE_FILE" \
      --symmetric --cipher-algo AES256 \
      -o "$out/$artefact.gpg" "$out/$artefact"; then
      echo "backup.sh: le chiffrement de $artefact a échoué." >&2
      verdict_fail=1
      verdict_step="chiffrement"
    else
      rm -f "$out/$artefact"
    fi
  done
  if [ "$verdict_fail" -eq 0 ]; then
    # Chiffrement complet réussi : plus aucun artefact en clair sur le disque,
    # le trap de purge n'a plus de raison d'être.
    trap - EXIT
  fi
fi
( cd "$out" && sha256sum ./*.gpg > SHA256SUMS ) 2>/dev/null || {
  echo "backup.sh: aucun artefact chiffré à archiver." >&2
  verdict_fail=1
  verdict_step="chiffrement"
}

echo
echo "Sauvegarde chiffrée terminée :"
ls -lh "$out" | sed 's/^/  /'
echo
echo "Contrôle d'intégrité : (cd '$out' && sha256sum -c SHA256SUMS)"
echo "Restauration : BACKUP_PASSPHRASE_FILE=<fichier> sh scripts/restore.sh $stamp --confirm"

# --- Vérification D-07 -------------------------------------------------------
# Trois contrôles, aucun artefact en clair sur le disque :
#   1. l'archive dump est valide : pg_restore --list lit le dump DÉCHIFFRÉ sur
#      STDIN dans le conteneur db (§2.7-C : stdin seul traverse la frontière du
#      conteneur — jamais -f, jamais -c "$(cat …)"). Le déchiffrement est
#      pipe-éphémère : le dump clair ne touche jamais le disque (T-28-01).
#   2. les quatre .gpg sont non vides.
#   3. le manifeste SHA256SUMS se vérifie sur lui-même.
echo
echo "Vérification de la sauvegarde (D-07) :"
if [ "$verdict_fail" -eq 0 ]; then
  if ! gpg --batch --yes --pinentry-mode loopback \
        --passphrase-file "$BACKUP_PASSPHRASE_FILE" \
        -d "$out/database.dump.gpg" \
      | db_exec_as postgres pg_restore --list -U "$DB_USER_RESOLVED" >/dev/null; then
    echo "  ✗ l'archive de la base ne se relit pas (pg_restore --list)" >&2
    verdict_fail=1
    verdict_step="vérification pg_restore"
  else
    echo "  ✓ archive de la base lisible (pg_restore --list)"
  fi

  empty_gpg="$(find "$out" -name '*.gpg' -size 0)"
  if [ -n "$empty_gpg" ]; then
    echo "  ✗ artefact(s) vide(s) : $empty_gpg" >&2
    verdict_fail=1
    verdict_step="taille des artefacts"
  else
    echo "  ✓ 4 artefacts chiffrés non vides"
  fi

  if ! ( cd "$out" && sha256sum -c SHA256SUMS >/dev/null ); then
    echo "  ✗ le manifeste SHA256SUMS ne correspond pas" >&2
    verdict_fail=1
    verdict_step="contrôle sha256"
  else
    echo "  ✓ manifeste SHA256SUMS vérifié"
  fi
fi

# --- Mail du verdict (D-06) --------------------------------------------------
# Succès ET échec notifiés. L'absence d'EO_MAIL_TO est une exécution sans
# notification, pas une erreur : une sauvegarde sans destinataire configuré
# ne doit pas échouer pour ça.
if [ -n "${EO_MAIL_TO:-}" ] && [ -f "$(dirname -- "$0")/send-mail.sh" ]; then
  sizes="$(ls -lh "$out"/*.gpg 2>/dev/null | awk '{print $9, $5}')"
  body="$(mktemp "${TMPDIR:-/tmp}/eo-backup.XXXXXX")"
  if [ "$verdict_fail" -eq 0 ]; then
    mail_subject="[EO-backup] succès : $stamp"
    {
      echo "Sauvegarde $stamp terminée et vérifiée."
      echo
      echo "$sizes"
      echo
      echo "Vérification D-07 : pg_restore --list ✓, tailles ✓, sha256 ✓."
    } > "$body"
  else
    mail_subject="[EO-backup] ÉCHEC : $stamp ($verdict_step)"
    {
      echo "La sauvegarde $stamp a ÉCHOUÉ à l'étape : $verdict_step."
      echo
      echo "Répertoire partiel : $out"
      echo "Contenu :"
      ls -lh "$out" | sed 's/^/  /'
      echo
      echo "Consulter le cron : journal de sh scripts/backup.sh."
    } > "$body"
  fi
  if ! sh "$(dirname -- "$0")/send-mail.sh" "$mail_subject" "$body"; then
    echo "backup.sh: le mail de résultat n'a pas pu être envoyé (cause sur stderr ci-dessus)." >&2
  fi
  rm -f "$body"
fi

# Verdict final : le code de sortie porte l'échec APRÈS le mail et la
# rétention — le cron voit l'échec, l'opérateur a déjà été notifié.
find "$BACKUP_DIR" -maxdepth 1 -type d -name '20*' -mtime "+$RETENTION_DAYS" -print -exec rm -rf {} +
exit "$verdict_fail"
