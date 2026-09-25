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

# La connexion (utilisateur unix, rôle, base) est centralisée : voir lib-db.sh.
. "$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)/lib-db.sh"

db_resolve

psql_exec() {
  db_exec "$@"
}

run_file() {
  printf '  → %s\n' "$(basename "$1")"
  psql_exec -q -f - <"$1" >/dev/null
}

echo "Installation de l'outillage de test…"
run_file "$TESTS_DIR/_setup.sql"

# Prérequis : le schéma `storage` vient du service `storage` de la stack, et le
# contrat de schéma vérifie les buckets et leurs politiques. Mieux vaut le dire
# ici qu'échouer sur une assertion incompréhensible.
storage_buckets="$(psql_exec -t -A -c \
  "select coalesce(to_regclass('storage.buckets')::text, '');" | tr -d ' \r' | head -n 1)"
if [ -z "$storage_buckets" ]; then
  echo "test-db.sh: le schéma 'storage' est absent." >&2
  echo "            cd supabase-project && sh run.sh start db storage" >&2
  echo "            puis cd supabase-project && sh ../scripts/migrate.sh" >&2
  exit 1
fi

failed=0
executed=0

cleanup() {
  db_exec -q -f - \
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
    # Rappel du fichier pour afficher la sortie des assertions. $file est un
    # chemin d'hôte, inexistant dans le conteneur : on repasse par l'entrée
    # standard, comme à la première passe.
    psql_exec -f - <"$file" || true
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
