#!/usr/bin/env sh
# scripts/test-db.sh
# Exécute les tests SQL de `supabase/tests` contre la base de la stack.
#
# Déroulement :
#   1. `_setup.sql` installe le schéma `testkit` (fixtures, assertions) ;
#   2. chaque fichier numéroté tourne dans SA propre transaction, annulée en
#      sortie : la base est laissée exactement comme elle était ;
#   3. `_teardown.sql` retire `testkit`.
#
# Le script est idempotent et sans effet de bord : il peut être rejoué sur une
# base de développement comme en préproduction.
#
#   sh scripts/test-db.sh
#   sh scripts/test-db.sh 0003            # un seul fichier
#
# Variables d'environnement reconnues :
#   DB_CONTAINER  nom du service Compose (défaut : db)

set -eu

DB_CONTAINER="${DB_CONTAINER:-db}"
TESTS_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")/../supabase/tests" && pwd)"

if [ ! -f "$TESTS_DIR/_setup.sql" ]; then
  echo "test-db.sh: répertoire de tests introuvable : $TESTS_DIR" >&2
  exit 1
fi

psql_exec() {
  docker compose exec -T -e ON_ERROR_STOP=1 "$DB_CONTAINER" \
    psql -v ON_ERROR_STOP=1 -X "$@"
}

run_file() {
  printf '  → %s\n' "$(basename "$1")"
  psql_exec -d postgres -q -f - <"$1" >/dev/null
}

echo "Installation de l'outillage de test…"
run_file "$TESTS_DIR/_setup.sql"

failed=0
executed=0

cleanup() {
  docker compose exec -T "$DB_CONTAINER" \
    psql -v ON_ERROR_STOP=1 -X -d postgres -q -f - \
    <<'SQL' >/dev/null 2>&1 || true
drop schema if exists testkit cascade;
SQL
}
trap cleanup EXIT INT TERM

if [ -n "${1:-}" ]; then
  files="$(ls "$TESTS_DIR"/"$1"*.sql 2>/dev/null || true)"
else
  files="$(ls "$TESTS_DIR"/[0-9]*.sql 2>/dev/null || true)"
fi

if [ -z "$files" ]; then
  echo "test-db.sh: aucun fichier de test ne correspond." >&2
  exit 1
fi

for file in $files; do
  executed=$((executed + 1))
  if run_file "$file"; then
    printf '    \033[32mOK\033[0m %s\n' "$(basename "$file")"
  else
    printf '    \033[31mÉCHEC\033[0m %s\n' "$(basename "$file")"
    psql_exec -d postgres -f "$file" || true
    failed=$((failed + 1))
  fi
done

echo
if [ "$failed" -eq 0 ]; then
  echo "Tests SQL : $executed fichier(s), tous verts."
  exit 0
fi

echo "Tests SQL : $failed fichier(s) en échec sur $executed." >&2
exit 1
