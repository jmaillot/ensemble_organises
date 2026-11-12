-- supabase/tests/lints/0011_function_search_path_mutable.sql
-- Source officielle : https://github.com/supabase/splinter/blob/2026.09.1/lints/0011_function_search_path_mutable.sql
-- Provenance D-09/D-10 : dépôt supabase/splinter, tag 2026.09.1, récupéré le 2026-11-12
-- (récupéré par le plan 45-01 dans lints-source/, porté par le plan 45-02).
-- Adaptation consignée dans .planning/phases/45-audit-s-curit-rls/45-AUDIT.md §2 :
--   l'en-tête `create view lint."…" as` du SQL officiel est retiré — le corps est
--   une requête pure, exécutable via `sh scripts/psql.sh < fichier` et par
--   `sh scripts/test-db.sh lints/` (chaque fichier dans une transaction rollbackée).
--   Tous les noms système restent qualifiés `pg_catalog.*` (§2.7-A.3, search_path vide).

select
    'function_search_path_mutable' as name,
    'Function Search Path Mutable' as title,
    'WARN' as level,
    'EXTERNAL' as facing,
    array['SECURITY'] as categories,
    'Detects functions where the search_path parameter is not set.' as description,
    format(
        'Function \`%s.%s\` has a role mutable search_path',
        n.nspname,
        p.proname
    ) as detail,
    'https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable' as remediation,
    jsonb_build_object(
        'schema', n.nspname,
        'name', p.proname,
        'type', 'function'
    ) as metadata,
    format(
        'function_search_path_mutable_%s_%s_%s',
        n.nspname,
        p.proname,
        md5(p.prosrc) -- required when function is polymorphic
    ) as cache_key
from
    pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n
        on p.pronamespace = n.oid
    left join pg_catalog.pg_depend dep
        on p.oid = dep.objid
        and dep.deptype = 'e'
        and dep.classid = 'pg_catalog.pg_proc'::regclass
where
    n.nspname not in (
        '_timescaledb_cache', '_timescaledb_catalog', '_timescaledb_config', '_timescaledb_internal', 'auth', 'cron', 'extensions', 'graphql', 'graphql_public', 'information_schema', 'net', 'pgmq', 'pgroonga', 'pgsodium', 'pgsodium_masks', 'pgtle', 'pgbouncer', 'pg_catalog', 'realtime', 'repack', 'storage', 'supabase_functions', 'supabase_migrations', 'tiger', 'topology', 'vault'
    )
    and dep.objid is null -- exclude functions owned by extensions
    -- Search path not set
    and not exists (
        select 1
        from unnest(coalesce(p.proconfig, '{}')) as config
        where config like 'search_path=%'
    );
