#!/usr/bin/env sh
# Connexion psql au conteneur `db`, commune aux scripts d'exploitation.
#
# À fournir par les scripts appelants (migrate.sh, test-db.sh, backup.sh,
# restore.sh). Elle n'exécute rien : elle définit `db_exec`.
#
# Trois pièges corrigés ici, rencontrés lors de la première exécution réelle :
#
#   1. `docker compose exec` sans `-u` se connecte en root : l'authentification
#      « peer » de PostgreSQL rejette alors le rôle `root`. On exécute donc en
#      tant qu'utilisateur système `postgres`.
#   2. Sans `-U`/`-d` explicites, psql se connecte via le socket Unix et prend
#      les valeurs de rôle et de base par défaut : on les passe en argument.
#   3. La base n'est pas toujours `postgres` : si `POSTGRES_DB` est personnalisé
#      dans le `.env` de la stack, c'est cette base que PostgREST et GoTrue
#      utilisent. Migrer `postgres` à la place créerait un schéma orphelin.
#      On lit donc la valeur dans le conteneur, l'environnement de l'hôte
#      restant prioritaire.
#
# Variables d'environnement reconnues :
#   DB_CONTAINER  nom du service Compose (défaut : db)
#   POSTGRES_USER rôle à utiliser (défaut : valeur du conteneur, sinon postgres)
#   POSTGRES_DB   base à utiliser (défaut : valeur du conteneur, sinon postgres)

db_env() {
  name="$1"
  if [ -n "$(eval echo \"\$$name\")" ]; then
    eval echo \"\$$name\"
    return 0
  fi
  if [ "${DB_CONTAINER_READY:-0}" = "1" ]; then
    eval echo \"\$$name\"
    return 0
  fi
  DB_CONTAINER_READY=1
  value="$(docker compose exec -T "$DB_CONTAINER" printenv "$name" 2>/dev/null | tr -d '\r' | head -n 1)"
  eval \"$name=\${value:-}\"
  eval echo \"\$$name\"
}

db_resolve() {
  DB_USER_RESOLVED="$(db_env POSTGRES_USER)"
  DB_NAME_RESOLVED="$(db_env POSTGRES_DB)"
  [ -n "$DB_USER_RESOLVED" ] || DB_USER_RESOLVED=postgres
  [ -n "$DB_NAME_RESOLVED" ] || DB_NAME_RESOLVED=postgres
}

# db_exec <args psql…> : exécute psql dans le conteneur, sur la bonne base.
db_exec() {
  docker compose exec -T -u postgres -e ON_ERROR_STOP=1 "$DB_CONTAINER" \
    psql -v ON_ERROR_STOP=1 -X -U "$DB_USER_RESOLVED" -d "$DB_NAME_RESOLVED" "$@"
}

# db_exec_as <utilisateur unix> <args…> : pour pg_dump / pg_restore.
db_exec_as() {
  run_as="$1"
  shift
  docker compose exec -T -u "$run_as" -e ON_ERROR_STOP=1 "$DB_CONTAINER" "$@"
}
