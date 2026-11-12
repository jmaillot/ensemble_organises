-- supabase/tests/lints/0008_rls_enabled_no_policy.sql
-- Source officielle : https://github.com/supabase/splinter/blob/2026.09.1/lints/0008_rls_enabled_no_policy.sql
-- Provenance D-09/D-10 : dépôt supabase/splinter, tag 2026.09.1, récupéré le 2026-11-12
-- (récupéré par le plan 45-01 dans lints-source/, porté par le plan 45-02).
-- Adaptation consignée dans .planning/phases/45-audit-s-curit-rls/45-AUDIT.md §2 :
--   l'en-tête `create view lint."…" as` du SQL officiel est retiré — le corps est
--   une requête pure, exécutable via `sh scripts/psql.sh < fichier` et par
--   `sh scripts/test-db.sh lints/` (chaque fichier dans une transaction rollbackée).
--   Tous les noms système restent qualifiés `pg_catalog.*` (§2.7-A.3, search_path vide).

select
    'rls_enabled_no_policy' as name,
    'RLS Enabled No Policy' as title,
    'INFO' as level,
    'EXTERNAL' as facing,
    array['SECURITY'] as categories,
    'Detects cases where row level security (RLS) has been enabled on a table but no RLS policies have been created.' as description,
    format(
        'Table \`%s.%s\` has RLS enabled, but no policies exist',
        n.nspname,
        c.relname
    ) as detail,
    'https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy' as remediation,
    jsonb_build_object(
        'schema', n.nspname,
        'name', c.relname,
        'type', 'table'
    ) as metadata,
    format(
        'rls_enabled_no_policy_%s_%s',
        n.nspname,
        c.relname
    ) as cache_key
from
    pg_catalog.pg_class c
    left join pg_catalog.pg_policy p
        on p.polrelid = c.oid
    join pg_catalog.pg_namespace n
        on c.relnamespace = n.oid
    left join pg_catalog.pg_depend dep
        on c.oid = dep.objid
        and dep.deptype = 'e'
        and dep.classid = 'pg_catalog.pg_class'::regclass
where
    c.relkind = 'r' -- regular tables
    and n.nspname not in (
        '_timescaledb_cache', '_timescaledb_catalog', '_timescaledb_config', '_timescaledb_internal', 'auth', 'cron', 'extensions', 'graphql', 'graphql_public', 'information_schema', 'net', 'pgmq', 'pgroonga', 'pgsodium', 'pgsodium_masks', 'pgtle', 'pgbouncer', 'pg_catalog', 'realtime', 'repack', 'storage', 'supabase_functions', 'supabase_migrations', 'tiger', 'topology', 'vault'
    )
    -- Périmètre 45-SPEC.md §3 (adaptation consignée) : schéma public uniquement — exposé API.
    and n.nspname = 'public'
    -- RLS is enabled
    and c.relrowsecurity
    and p.polname is null
    and dep.objid is null -- exclude tables owned by extensions
group by
    n.nspname,
    c.relname;
