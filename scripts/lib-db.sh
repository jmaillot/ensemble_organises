#!/usr/bin/env sh
# Connexion psql au conteneur `db`, commune aux scripts d'exploitation.
#
# À fournir par les scripts appelants (migrate.sh, test-db.sh, backup.sh,
# restore.sh). Elle n'exécute rien : elle définit `db_resolve`, `db_exec` et
# `db_exec_as`.
#
# Trois pièges corrigés ici, rencontrés lors de la première exécution réelle :
#
#   1. `docker compose exec` sans `-u` se connecte avec l'utilisateur système
#      root, que l'authentification « peer » de PostgreSQL rejette. On exécute
#      donc en tant qu'utilisateur `postgres`.
#   2. Sans `-U`/`-d` explicites, psql passe par le socket Unix et prend ses
#      valeurs par défaut. On les passe en argument.
#   3. Le rôle et la base de la stack ne sont pas `postgres` : le snapshot
#      auto-hébergé définit `POSTGRES_USER=supabase_admin` et une base
#      associée, et PostgREST/GoTrue s'y connectent. Migrer `-d postgres`
#      créerait une base que personne n'utilise. On lit donc les valeurs
#      réelles dans le conteneur, l'environnement de l'hôte restant prioritaire.
#
# Variables d'environnement reconnues :
#   DB_CONTAINER  nom du service Compose (défaut : db)
#   POSTGRES_USER rôle à utiliser (défaut : valeur du conteneur, sinon postgres)
#   POSTGRES_DB   base à utiliser (défaut : valeur du conteneur, sinon postgres)

# Valeur d'une variable d'environnement du conteneur, sans échouer si absente.
db_printenv() {
  docker compose exec -T "$DB_CONTAINER" printenv "$1" 2>/dev/null | tr -d '\r' | head -n 1 || true
}

# Résout le rôle et la base à utiliser, une seule fois, avant tout psql.
db_resolve() {
  DB_USER_RESOLVED="${POSTGRES_USER:-}"
  DB_NAME_RESOLVED="${POSTGRES_DB:-}"

  if [ -z "$DB_USER_RESOLVED" ]; then
    DB_USER_RESOLVED="$(db_printenv POSTGRES_USER)"
  fi
  if [ -z "$DB_NAME_RESOLVED" ]; then
    DB_NAME_RESOLVED="$(db_printenv POSTGRES_DB)"
  fi

  [ -n "$DB_USER_RESOLVED" ] || DB_USER_RESOLVED=postgres
  [ -n "$DB_NAME_RESOLVED" ] || DB_NAME_RESOLVED=postgres

  export DB_USER_RESOLVED DB_NAME_RESOLVED
}

# db_exec <args psql…> : psql dans le conteneur, sur le bon rôle et la bonne base.
db_exec() {
  docker compose exec -T -u postgres -e ON_ERROR_STOP=1 "$DB_CONTAINER" \
    psql -v ON_ERROR_STOP=1 -X -U "$DB_USER_RESOLVED" -d "$DB_NAME_RESOLVED" "$@"
}

# db_exec_as <utilisateur unix> <commande…> : pour pg_dump / pg_restore.
db_exec_as() {
  run_as="$1"
  shift
  docker compose exec -T -u "$run_as" -e ON_ERROR_STOP=1 "$DB_CONTAINER" "$@"
}
