#!/usr/bin/env sh
# scripts/migrate.sh
# Applique les migrations SQL de `supabase/migrations` via le conteneur `db` de
# la stack auto-hébergée, dans l'ordre lexicographique.
#
# Chaque fichier est appliqué dans sa propre transaction avec ON_ERROR_STOP, puis
# journalisé dans `schema_migrations`. Le script est donc idempotent : relancer
# une migration déjà appliquée ne fait rien, et un échec laisse la base intacte.
#
#   sh ../scripts/migrate.sh            # depuis supabase-project/
#   sh scripts/migrate.sh               # depuis la racine du dépôt
#   sh scripts/migrate.sh --status      # journal des migrations appliquées
#
# Variables d'environnement reconnues :
#   DB_CONTAINER  nom du service Compose (défaut : db)

set -eu

DB_CONTAINER="${DB_CONTAINER:-db}"
MIGRATIONS_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")/../supabase/migrations" && pwd)"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "migrate.sh: répertoire introuvable : $MIGRATIONS_DIR" >&2
  exit 1
fi

if ! docker compose ps --status running --services 2>/dev/null | grep -qx "$DB_CONTAINER"; then
  echo "migrate.sh: le service '$DB_CONTAINER' n'est pas démarré." >&2
  echo "           cd supabase-project && sh run.sh start $DB_CONTAINER" >&2
  exit 1
fi

psql_exec() {
  docker compose exec -T -e ON_ERROR_STOP=1 "$DB_CONTAINER" \
    psql -v ON_ERROR_STOP=1 -q -X "$@"
}

# --- Journal ---------------------------------------------------------------
psql_exec -d postgres -c "
  create table if not exists public.schema_migrations (
    version    text primary key,
    applied_at timestamptz not null default now()
  );
  comment on table public.schema_migrations is
    'Historique des migrations supabase/migrations, maintained par scripts/migrate.sh';
" >/dev/null

if [ "${1:-}" = "--status" ]; then
  echo "Migrations appliquées :"
  psql_exec -d postgres -c "
    select version, applied_at from public.schema_migrations order by version;
  "
  echo
  echo "Fichiers présents :"
  ls -1 "$MIGRATIONS_DIR"
  exit 0
fi

applied=0
skipped=0

for file in "$MIGRATIONS_DIR"/*.sql; do
  [ -e "$file" ] || continue
  version="$(basename "$file")"

  already="$(psql_exec -d postgres -t -A -c \
    "select count(*) from public.schema_migrations where version = '$version';")"

  if [ "$already" = "1" ]; then
    echo "  · $version (déjà appliquée)"
    skipped=$((skipped + 1))
    continue
  fi

  echo "  → $version"
  # La transaction et le journal sont ouverts dans la même session : si le
  # fichier échoue, le version n'est pas enregistré et rien n'est commité.
  {
    echo "begin;"
    cat "$file"
    echo "insert into public.schema_migrations (version) values ('$version');"
    echo "commit;"
  } | psql_exec -d postgres -q -f - >/dev/null

  applied=$((applied + 1))
done

echo
echo "Migrations terminées : $applied appliquée(s), $skipped déjà connue(s)."
echo "Vérification rapide :"
psql_exec -d postgres -c "
  select count(*) filter (where not relrowsecurity) as tables_sans_rls,
         count(*) as tables_total
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r';
"
