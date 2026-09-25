#!/usr/bin/env sh
# scripts/psql.sh
# Exécute une requête ou un fichier SQL sur le conteneur `db` de la stack, avec
# le bon rôle et la bonne base (voir scripts/lib-db.sh).
#
#   sh scripts/psql.sh -c "select count(*) from public.households"
#   sh scripts/psql.sh -f /tmp/verif.sql
#   cat verif.sql | sh scripts/psql.sh
#
# La session n'est pas interactive : `docker compose exec -T` n'alloue pas de
# terminal, ce qui évite tout blocage sur une invite. On passe donc une
# commande, un fichier, ou l'entrée standard.
#
# Par défaut, la transaction n'est PAS rollbackée : on parle à la base de
# production. Pour une exploration, passer `--rollback` (ou entourer la requête
# de BEGIN/ROLLBACK, ce que font les tests).
#
#   sh scripts/psql.sh --rollback -c "insert into … ; select …"
#
# Variables d'environnement reconnues :
#   DB_CONTAINER  nom du service Compose (défaut : db)

set -eu

DB_CONTAINER="${DB_CONTAINER:-db}"

if ! docker compose ps --status running --services 2>/dev/null | grep -qx "$DB_CONTAINER"; then
  echo "psql.sh: le service '$DB_CONTAINER' n'est pas démarré." >&2
  echo "         cd supabase-project && sh run.sh start $DB_CONTAINER" >&2
  exit 1
fi

. "$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)/lib-db.sh"

db_resolve

# `--rollback` est à nous : psql ne le connaît pas. On l'extrait puis on
# encadre la requête, plutôt que de laisser un `insert` sans filet.
rollback=0
if [ "${1:-}" = "--rollback" ]; then
  rollback=1
  shift
fi

if [ "$rollback" -eq 1 ]; then
  if [ $# -eq 0 ]; then
    # Requête sur l'entrée standard : on encadre le flux.
    { echo 'begin;'; cat; echo 'rollback;'; } | db_exec -f -
    exit $?
  fi

  # -c ou -f : on rend la commande via une requête unique pour rester atomique.
  case "$1" in
    -c)
      query="$2"
      db_exec -c "begin; $query rollback;"
      ;;
    -f)
      # Un fichier peut contenir ses propres begin/commit : on ne l'encadre pas,
      # on se contente de prévenir.
      echo "psql.sh: --rollback ignoré avec -f (le fichier gère ses transactions)." >&2
      db_exec -f "$2"
      ;;
    *)
      db_exec "$@"
      ;;
  esac
  exit $?
fi

db_exec "$@"
