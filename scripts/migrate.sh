#!/usr/bin/env sh
# scripts/migrate.sh
# Applique les migrations SQL de `supabase/migrations` via le conteneur `db` de
# la stack auto-hébergée, dans l'ordre lexicographique.
#
# Chaque fichier porte sa propre transaction (`begin; … commit;`) : le script ne
# l'impose pas, il ne l'encadre pas non plus, sinon PostgreSQL signale une
# transaction déjà ouverte et le `commit;` interne fermerait celle du journal
# avant l'écriture de celui-ci.
#
# Le script est idempotent : une migration déjà journalisée est ignorée. Si un
# fichier s'applique mais que l'écriture du journal échoue, le fichier sera
# rejoué au prochain passage — sans risque, tous les fichiers étant idempotents.
#
#   sh ../scripts/migrate.sh            # depuis supabase-project/
#   sh scripts/migrate.sh               # depuis la racine du dépôt
#   sh ../scripts/migrate.sh --status   # journal des migrations appliquées
#
# Prérequis : le service `db` démarré (sh run.sh start db). Les migrations qui
# touchent au schéma `storage` exigent en plus le service `storage` démarré
# (sh run.sh start db storage) : c'est lui qui crée ce schéma, pas nous.
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

# La connexion (utilisateur unix, rôle, base) est centralisée : voir lib-db.sh.
. "$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)/lib-db.sh"

db_resolve

psql_exec() {
  db_exec "$@"
}

# --- Journal ---------------------------------------------------------------
psql_exec -c "
  create table if not exists public.schema_migrations (
    version    text primary key,
    applied_at timestamptz not null default now()
  );
  comment on table public.schema_migrations is
    'Historique des migrations supabase/migrations, maintenu par scripts/migrate.sh';
  -- Table d'outillage interne : aucun client n'a à la lire. La RLS activée sans
  -- politique la rend inaccessible à anon et authenticated ; le rôle propriétaire
  -- utilisé par ce script n'en est pas affecté.
  alter table public.schema_migrations enable row level security;
" >/dev/null

if [ "${1:-}" = "--status" ]; then
  echo "Migrations appliquées :"
  psql_exec -c "
    select version, applied_at from public.schema_migrations order by version;
  "
  echo
  echo "Fichiers présents :"
  ls -1 "$MIGRATIONS_DIR"
  exit 0
fi

# --- Contrôle préalable ----------------------------------------------------
# Le schéma `storage` appartient au service `storage` de la stack : sans lui,
# la 0010 échoue sur `relation "storage.buckets" does not exist`. Mieux vaut
# s'arrêter ici, avec la bonne consigne, qu'au milieu d'une série de migrations.
pending="$(mktemp)"
trap 'rm -f "$pending"' EXIT INT TERM

for file in "$MIGRATIONS_DIR"/*.sql; do
  [ -e "$file" ] || continue
  version="$(basename "$file")"
  already="$(psql_exec -t -A -c \
    "select count(*) from public.schema_migrations where version = '$version';")"
  [ "$already" = "1" ] || printf '%s\n' "$file" >> "$pending"
done

if [ ! -s "$pending" ]; then
  echo "Toutes les migrations sont déjà appliquées."
  exit 0
fi

if grep -ql 'storage\.' $(cat "$pending") 2>/dev/null; then
  storage_buckets="$(psql_exec -t -A -c \
    "select coalesce(to_regclass('storage.buckets')::text, '');" | tr -d ' \r' | head -n 1)"
  if [ -z "$storage_buckets" ]; then
    echo "migrate.sh: le schéma 'storage' est absent : il est créé par le" >&2
    echo "           service 'storage' de la stack, pas par nos migrations." >&2
    echo "           cd supabase-project && sh run.sh start db storage" >&2
    echo "           (ou 'sh run.sh start' pour toute la stack)" >&2
    exit 1
  fi
fi

# --- Application ------------------------------------------------------------
applied=0
skipped=0

for file in "$MIGRATIONS_DIR"/*.sql; do
  [ -e "$file" ] || continue
  version="$(basename "$file")"

  already="$(psql_exec -t -A -c \
    "select count(*) from public.schema_migrations where version = '$version';")"

  if [ "$already" = "1" ]; then
    echo "  · $version (déjà appliquée)"
    skipped=$((skipped + 1))
    continue
  fi

  echo "  → $version"
  psql_exec -q -f - <"$file" >/dev/null
  psql_exec -q -c "insert into public.schema_migrations (version) values ('$version');" >/dev/null

  applied=$((applied + 1))
done

echo
echo "Migrations terminées : $applied appliquée(s), $skipped déjà connue(s)."
echo "Vérification rapide :"
psql_exec -c "
  select count(*) filter (where not relrowsecurity) as tables_sans_rls,
         count(*) as tables_total
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r';
"
