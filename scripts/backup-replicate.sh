#!/usr/bin/env sh
# scripts/backup-replicate.sh
# Réplication des sauvegardes chiffrées vers la machine tierce (D-01/D-02),
# copie disjointe de la clé pgsodium (D-03), puis purge GFS (D-04).
#
# L'ordre est NON NÉGOCIABLE (Pitfall 6, T-28-03) :
#   1. rsync des sauvegardes chiffrées telles quelles vers la tierce ;
#   2. vérification : le stamp du jour existe sur la tierce ET son
#      SHA256SUMS s'y vérifie (sha256sum -c) ;
#   3. copie de la clé pgsodium vers un chemin DISJOINT (hors répertoire
#      des sauvegardes — D-03, refusé sinon) ;
#   4. SEULEMENT ALORS purge GFS, locale puis tierce — même logique des
#      deux côtés, par date portée dans le nom du répertoire. Jamais
#      `rsync --delete` : la destruction est explicite, par date, et
#      jamais antérieure à une réplication vérifiée.
#
#   EO_REPL_TARGET=<user>@<hôte> EO_REPL_SSH=~/.ssh/eo_replication \
#   EO_REPL_DIR=/srv/backups/eo EO_PGSODIUM_COPY=/srv/secrets/eo/pgsodium \
#     sh scripts/backup-replicate.sh
#
# Variables d'environnement reconnues :
#   BACKUP_DIR           destination locale de backup.sh (défaut :
#                        supabase-project/backups)
#   EO_REPL_TARGET       cible ssh `<utilisateur>@<hôte-tierce>`
#                        (OBLIGATOIRE)
#   EO_REPL_SSH          fichier de clé ssh DÉDIÉE, chmod 600
#                        (OBLIGATOIRE ; jamais la clé d'agent par défaut,
#                        jamais en argv — T-28-05)
#   EO_REPL_DIR          répertoire des sauvegardes sur la tierce
#                        (défaut : /srv/backups/eo)
#   EO_REPL_KNOWN_HOSTS  known_hosts DÉDIÉ, hôte tierce épinglé (défaut :
#                        ~/.ssh/eo_replication_known_hosts)
#   EO_PGSODIUM_COPY     répertoire tierce de la clé pgsodium, DISJOINT de
#                        EO_REPL_DIR (défaut : /srv/secrets/eo/pgsodium) ;
#                        le refus est fatal si ce chemin imbrique l'autre
#   EO_PGSODIUM_LOCAL    source locale de la clé : soit le tar
#                        db-config.tar.gz du stamp le plus récent
#                        (défaut), soit un fichier de clé documenté
#   EO_MAIL_TO           destinataire d'un mail UNIQUEMENT en échec
#                        (D-06) ; sans valeur, échec silencieux — le cron
#                        journalise et backup.sh notifie déjà chaque
#                        exécution de sauvegarde.
#
# Secrets : la clé ssh vit dans un fichier 600, jamais en ligne de
# commande ; rien de secret n'est journalisé (§2.7-H).

set -eu

verdict_fail=0
verdict_step=""

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_DIR="$(CDPATH='' cd -- "$SCRIPT_DIR/../supabase-project" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
EO_REPL_TARGET="${EO_REPL_TARGET:-}"
EO_REPL_SSH="${EO_REPL_SSH:-$HOME/.ssh/eo_replication}"
EO_REPL_DIR="${EO_REPL_DIR:-/srv/backups/eo}"
EO_REPL_KNOWN_HOSTS="${EO_REPL_KNOWN_HOSTS:-$HOME/.ssh/eo_replication_known_hosts}"
EO_PGSODIUM_COPY="${EO_PGSODIUM_COPY:-/srv/secrets/eo/pgsodium}"
EO_PGSODIUM_LOCAL="${EO_PGSODIUM_LOCAL:-}"

fail() {
  verdict_fail=1
  verdict_step="$1"
  echo "backup-replicate.sh: ÉCHEC à l'étape : $1" >&2
}

# --- Pré-requis --------------------------------------------------------------
if [ -z "$EO_REPL_TARGET" ]; then
  echo "backup-replicate.sh: EO_REPL_TARGET est obligatoire (<utilisateur>@<hôte-tierce>)." >&2
  exit 1
fi
if [ ! -f "$EO_REPL_SSH" ]; then
  echo "backup-replicate.sh: clé ssh dédiée introuvable : $EO_REPL_SSH." >&2
  echo "           Cf. docs/DEPLOIEMENT-PROD.md § Réplication (commandes d'installation)." >&2
  exit 1
fi
if [ "$(stat -c %a "$EO_REPL_SSH" 2>/dev/null)" != "600" ]; then
  echo "backup-replicate.sh: permissions de la clé ssh trop ouvertes : $EO_REPL_SSH (exigé : 600)." >&2
  exit 1
fi

# D-03 : la clé pgsodium sur la tierce vit HORS du répertoire des
# sauvegardes. L'imbrication est refusée — une clé dans le répertoire
# répliqué ne forme plus deux copies disjointes.
case "$EO_PGSODIUM_COPY" in
  "$EO_REPL_DIR"|"$EO_REPL_DIR"/*)
    echo "backup-replicate.sh: EO_PGSODIUM_COPY ($EO_PGSODIUM_COPY) est dans EO_REPL_DIR ($EO_REPL_DIR)." >&2
    echo "           D-03 exige deux copies disjointes : choisissez un chemin hors des sauvegardes." >&2
    exit 1
    ;;
esac

ssh_opts="-o BatchMode=yes -o ConnectTimeout=10 -o UserKnownHostsFile=$EO_REPL_KNOWN_HOSTS -i $EO_REPL_SSH"

repl_ssh() {
  # shellcheck disable=SC2086  # options délibérément non quotées
  ssh $ssh_opts "$EO_REPL_TARGET" "$@"
}

repl_rsync() {
  # shellcheck disable=SC2086
  rsync -a -e "ssh $ssh_opts" "$@"
}

# --- Le corps GFS, unique source de vérité, exécuté des deux côtés -----------
# Reçoit la liste des répertoires sur stdin. Sélection par DATE portée dans
# le nom du répertoire (format 20YYYYMMDDTHHMMSSZ) :
#   quotidien    : les 7 stamps les plus récents ;
#   hebdomadaire : le premier stamp de chaque jour distinct du mois écoulé
#                  (31 derniers jours-calendriers) — au plus un par jour ;
#   mensuel      : le premier stamp de chaque mois distinct de l'année
#                  écoulée (12 derniers mois).
# Tout stamp hors de cette sélection est supprimé (rm -rf explicite —
# jamais rsync --delete, T-28-03).
GFS_BODY='
stamps=$(find "$1" -maxdepth 1 -type d -name "20*" -printf "%f\n" | sort)
[ -n "$stamps" ] || exit 0
list="$stamps"
stamps_file=$(mktemp)
printf "%s\n" "$list" > "$stamps_file"
{
  tail -n7 "$stamps_file"
  awk "{print substr(\$0,1,8)}" "$stamps_file" | uniq | tail -n31 \
    | while read -r day; do grep "^$day" "$stamps_file" | head -n1; done
  awk "{print substr(\$0,1,6)}" "$stamps_file" | uniq | tail -n12 \
    | while read -r month; do grep "^$month" "$stamps_file" | head -n1; done
} | sort -u > "$stamps_file.keep"
while read -r s; do
  grep -qx "$s" "$stamps_file.keep" || rm -rf "$1/$s"
done < "$stamps_file"
rm -f "$stamps_file" "$stamps_file.keep"
'

# --- 1. rsync des sauvegardes chiffrées --------------------------------------
# Fichiers .gpg et SHA256SUMS transférés tels quels (D-02) : pas de
# re-chiffrement, pas de compression supplémentaire. Pas de --delete :
# la purge est explicite, par date (étape 4).
echo "1/4 réplication : $BACKUP_DIR → $EO_REPL_TARGET:$EO_REPL_DIR"
if [ ! -d "$BACKUP_DIR" ]; then
  fail "réplication (répertoire local absent : $BACKUP_DIR)"
elif ! repl_rsync "$BACKUP_DIR/" "$EO_REPL_TARGET:$EO_REPL_DIR/"; then
  fail "réplication rsync"
fi

latest_stamp() {
  find "$BACKUP_DIR" -maxdepth 1 -type d -name '20*' -printf '%f\n' 2>/dev/null | sort | tail -n1
}

# --- 2. Vérification du stamp du jour sur la tierce ---------------------------
# Stamp du jour = le répertoire 20* le plus récent CÔTÉ LOCAL ; il doit
# exister sur la tierce et son SHA256SUMS doit s'y vérifier. La purge de
# l'étape 4 est conditionnée à ce contrôle : on ne détruit jamais avant
# d'avoir prouvé que la réplication du jour est complète (T-28-03).
today_stamp=""
if [ "$verdict_fail" -eq 0 ]; then
  today_stamp="$(latest_stamp)"
  if [ -z "$today_stamp" ]; then
    fail "vérification (aucun stamp local — lancez d'abord sh scripts/backup.sh)"
  elif ! repl_ssh "cd '$EO_REPL_DIR/$today_stamp' && [ -f SHA256SUMS ] && sha256sum -c SHA256SUMS --quiet"; then
    fail "vérification du stamp du jour sur la tierce ($today_stamp : stamp ou SHA256SUMS absent/corrompu)"
  else
    echo "  ✓ stamp du jour $today_stamp présent et SHA256SUMS vérifié sur la tierce"
  fi
fi

# --- 3. Copie disjointe de la clé pgsodium (D-03) -----------------------------
# La clé part déjà avec le dump (db-config.tar.gz, répliqué à l'étape 1)
# ET vit séparément : si l'hôte est perdu, la tierce contient données ET
# clé. Source par défaut : le tar du stamp le plus récent ;
# EO_PGSODIUM_LOCAL permet un fichier de clé dédié documenté. Le chemin
# tierce est posé 700, le fichier 600.
if [ "$verdict_fail" -eq 0 ]; then
  key_src=""
  if [ -n "$EO_PGSODIUM_LOCAL" ] && [ -f "$EO_PGSODIUM_LOCAL" ]; then
    key_src="$EO_PGSODIUM_LOCAL"
  else
    key_src="$(find "$BACKUP_DIR" -maxdepth 2 -name 'db-config.tar.gz' 2>/dev/null | sort | tail -n1)"
  fi
  if [ -z "$key_src" ]; then
    fail "copie pgsodium (aucune source : ni EO_PGSODIUM_LOCAL ni db-config.tar.gz répliqué)"
  elif ! repl_ssh "mkdir -p '$EO_PGSODIUM_COPY' && chmod 700 '$EO_PGSODIUM_COPY'"; then
    fail "copie pgsodium (préparation du répertoire disjoint)"
  elif ! repl_rsync "$key_src" "$EO_REPL_TARGET:$EO_PGSODIUM_COPY/" \
     || ! repl_ssh "chmod 600 '$EO_PGSODIUM_COPY'/* 2>/dev/null"; then
    fail "copie pgsodium (transfert/permissions)"
  else
    echo "  ✓ clé pgsodium copiée hors du répertoire des sauvegardes : $EO_PGSODIUM_COPY"
  fi
fi

# --- 4. Purge GFS (locale puis tierce) — APRÈS vérification --------------------
# Le même corps GFS tourne des deux côtés : localement via sh -c, sur la
# tierce transmis par stdin (§2.7-C : stdin seul traverse une frontière).
# L'exécution n'a lieu QUE si les étapes 1-3 ont réussi.
if [ "$verdict_fail" -eq 0 ]; then
  echo "4/4 purge GFS (quotidien 7 j + hebdo 1 mois + mensuel 1 an, D-04)"
  if ! sh -c "$GFS_BODY" gfs "$BACKUP_DIR"; then
    fail "purge GFS locale"
  else
    echo "  ✓ purge locale appliquée"
  fi
  if ! printf '%s\n' "$GFS_BODY" | repl_ssh sh -s gfs "$EO_REPL_DIR"; then
    fail "purge GFS tierce"
  else
    echo "  ✓ purge tierce appliquée"
  fi
fi

# --- Mail UNIQUEMENT en échec --------------------------------------------------
# D-06 : backup.sh notifie déjà chaque exécution de sauvegarde ; la
# réplication n'ajoute un mail que si elle-même a échoué.
if [ "$verdict_fail" -ne 0 ] && [ -n "${EO_MAIL_TO:-}" ] && [ -f "$SCRIPT_DIR/send-mail.sh" ]; then
  body="$(mktemp "${TMPDIR:-/tmp}/eo-repl.XXXXXX")"
  {
    echo "La réplication des sauvegardes a ÉCHOUÉ à l'étape : $verdict_step."
    echo
    echo "Cible : $EO_REPL_TARGET:$EO_REPL_DIR"
    echo "Consulter le journal cron : /var/log/eo-backup-replicate.log"
  } > "$body"
  sh "$SCRIPT_DIR/send-mail.sh" "[EO-backup] ÉCHEC réplication : $verdict_step" "$body" \
    || echo "backup-replicate.sh: mail d'échec non envoyé (cause sur stderr)." >&2
  rm -f "$body"
fi

if [ "$verdict_fail" -eq 0 ]; then
  echo
  echo "Réplication vérifiée : stamp du jour + SHA256SUMS sur la tierce,"
  echo "clé pgsodium disjointe copiée, purge GFS appliquée (local + tierce)."
fi
exit "$verdict_fail"
