-- supabase/tests/lints/0015_rls_references_user_metadata.sql
-- Source officielle : https://github.com/supabase/splinter/blob/2026.09.1/lints/0015_rls_references_user_metadata.sql
-- Provenance D-09/D-10 : dépôt supabase/splinter, tag 2026.09.1, récupéré le 2026-11-12
-- (récupéré par le plan 45-01 dans lints-source/, porté par le plan 45-02).
-- Adaptation consignée dans .planning/phases/45-audit-s-curit-rls/45-AUDIT.md §2 :
--   l'en-tête `create view lint."…" as` du SQL officiel est retiré — requête pure ; et
--   ajout `and schema_name = 'public'` (périmètre 45-SPEC.md §3, schéma exposé API) ;
--   et adaptation des motifs de détection (consignée, §2.7-D.6) : `pg_policies.qual`
--   est RE-DÉPARSÉ par PostgreSQL — sur cette stack, `auth.jwt()` est rendu `jwt()`
--   (résolution par search_path au moment du rendu), donc le motif officiel
--   `%auth.jwt()%user_metadata%` ne matchait jamais. Motif porté à `%jwt()%user_metadata%`,
--   qui couvre les deux rendus.
--   Tous les noms système restent qualifiés `pg_catalog.*` (§2.7-A.3, search_path vide).

with policies as (
    select
        nsp.nspname as schema_name,
        pb.tablename as table_name,
        polname as policy_name,
        qual,
        with_check
    from
        pg_catalog.pg_policy pa
        join pg_catalog.pg_class pc
            on pa.polrelid = pc.oid
        join pg_catalog.pg_namespace nsp
            on pc.relnamespace = nsp.oid
        join pg_catalog.pg_policies pb
            on pc.relname = pb.tablename
            and nsp.nspname = pb.schemaname
            and pa.polname = pb.policyname
)
select
    'rls_references_user_metadata' as name,
    'RLS references user metadata' as title,
    'ERROR' as level,
    'EXTERNAL' as facing,
    array['SECURITY'] as categories,
    'Detects when Supabase Auth user_metadata is referenced insecurely in a row level security (RLS) policy.' as description,
    format(
        'Table \`%s.%s\` has a row level security policy \`%s\` that references Supabase Auth \`user_metadata\`. \`user_metadata\` is editable by end users and should never be used in a security context.',
        schema_name,
        table_name,
        policy_name
    ) as detail,
    'https://supabase.com/docs/guides/database/database-linter?lint=0015_rls_references_user_metadata' as remediation,
    jsonb_build_object(
        'schema', schema_name,
        'name', table_name,
        'type', 'table'
    ) as metadata,
    format('rls_references_user_metadata_%s_%s_%s', schema_name, table_name, policy_name) as cache_key
from
    policies
where
    schema_name not in (
        '_timescaledb_cache', '_timescaledb_catalog', '_timescaledb_config', '_timescaledb_internal', 'auth', 'cron', 'extensions', 'graphql', 'graphql_public', 'information_schema', 'net', 'pgmq', 'pgroonga', 'pgsodium', 'pgsodium_masks', 'pgtle', 'pgbouncer', 'pg_catalog', 'realtime', 'repack', 'storage', 'supabase_functions', 'supabase_migrations', 'tiger', 'topology', 'vault'
    )
    -- Périmètre 45-SPEC.md §3 (adaptation consignée) : schéma public uniquement — exposé API.
    and schema_name = 'public'
    and (
        -- Example: auth.jwt() -> 'user_metadata'
        -- False positives are possible, but it isn't practical to string match
        -- If false positive rate is too high, this expression can iterate
        qual like '%jwt()%user_metadata%'  -- adaptation consignée : le dé-parse rend jwt() non qualifié (§2.7-D.6) ; %jwt()…% couvre aussi auth.jwt()
        or qual like '%current_setting(%request.jwt.claims%)%user_metadata%'
        or with_check like '%jwt()%user_metadata%'  -- adaptation consignée (dé-parse non qualifié)
        or with_check like '%current_setting(%request.jwt.claims%)%user_metadata%'
    );
