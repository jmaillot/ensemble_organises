-- supabase/tests/lints/0016_materialized_view_in_api.sql
-- Source officielle : https://github.com/supabase/splinter/blob/2026.09.1/lints/0016_materialized_view_in_api.sql
-- Provenance D-09/D-10 : dépôt supabase/splinter, tag 2026.09.1, récupéré le 2026-11-12
-- (récupéré par le plan 45-01 dans lints-source/, porté par le plan 45-02).
-- Adaptation consignée dans .planning/phases/45-audit-s-curit-rls/45-AUDIT.md §2 :
--   l'en-tête `create view lint."…" as` du SQL officiel est retiré — requête pure ; et
--   ajout `and n.nspname = 'public'` (périmètre 45-SPEC.md §3, schéma exposé API).
--   Tous les noms système restent qualifiés `pg_catalog.*` (§2.7-A.3, search_path vide).

select
    'materialized_view_in_api' as name,
    'Materialized View in API' as title,
    'WARN' as level,
    'EXTERNAL' as facing,
    array['SECURITY'] as categories,
    'Detects materialized views that are accessible over the Data APIs.' as description,
    format(
        'Materialized view \`%s.%s\` is selectable by anon or authenticated roles',
        n.nspname,
        c.relname
    ) as detail,
    'https://supabase.com/docs/guides/database/database-linter?lint=0016_materialized_view_in_api' as remediation,
    jsonb_build_object(
        'schema', n.nspname,
        'name', c.relname,
        'type', 'materialized view'
    ) as metadata,
    format(
        'materialized_view_in_api_%s_%s',
        n.nspname,
        c.relname
    ) as cache_key
from
    pg_catalog.pg_class c
    join pg_catalog.pg_namespace n
        on n.oid = c.relnamespace
    left join pg_catalog.pg_depend dep
        on c.oid = dep.objid
        and dep.deptype = 'e'
        and dep.classid = 'pg_catalog.pg_class'::regclass
where
    c.relkind = 'm'
    and (
        pg_catalog.has_table_privilege('anon', c.oid, 'SELECT')
        or pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT')
    )
    -- Périmètre 45-SPEC.md §3 (adaptation consignée) : schéma public uniquement — exposé API.
    and n.nspname = 'public'
    and n.nspname = any(array(select trim(unnest(string_to_array(coalesce(current_setting('pgrst.db_schemas', 't'), 'public'), ',')))))
    and n.nspname not in (
        '_timescaledb_cache', '_timescaledb_catalog', '_timescaledb_config', '_timescaledb_internal', 'auth', 'cron', 'extensions', 'graphql', 'graphql_public', 'information_schema', 'net', 'pgmq', 'pgroonga', 'pgsodium', 'pgsodium_masks', 'pgtle', 'pgbouncer', 'pg_catalog', 'realtime', 'repack', 'storage', 'supabase_functions', 'supabase_migrations', 'tiger', 'topology', 'vault'
    )
    and dep.objid is null;
