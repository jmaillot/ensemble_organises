-- 0001_foundations.sql
-- Schéma privé, conventions globales et utilitaires sans dépendance aux tables.
--
-- Les migrations sont appliquées dans l'ordre lexicographique par
-- `scripts/migrate.sh`, qui journalise chaque fichier dans `schema_migrations`.
-- L'idempotence vient de ce journal, pas de `if not exists` sur les tables.

begin;

-- ---------------------------------------------------------------------------
-- Schéma privé : fonctions utilitaires SECURITY DEFINER, jamais exposées par
-- PostgREST (le stack n'expose que `public`). Les fonctions qui portent la
-- logique d'autorisation y vivent pour ne jamais pouvoir être appelées par un
-- client PostgREST.
-- ---------------------------------------------------------------------------
create schema if not exists private;
comment on schema private is
  'Fonctions utilitaires SECURITY DEFINER. Jamais exposée par PostgREST : le stack ne publie que public.';

revoke all on schema private from public;
grant usage on schema private to authenticated;

-- Personne ne crée d'objets dans `public` depuis un rôle applicatif.
revoke create on schema public from public;

-- ---------------------------------------------------------------------------
-- Identifiants métier.
--
-- Le frontend génère ses propres identifiants (`randomId()` de
-- `app/src/lib/utils.ts` produit `<prefixe>_<uuid>`) et les transmet à PostgREST.
-- Les clés primaires des tables métier sont donc des `text` préfixés, et non
-- des `uuid`. Seuls les identifiants d'identité (auth.users) restent des uuid.
-- Le défaut `private.new_id()` aligne les lignes créées côté serveur sur le
-- même format, afin qu'aucun code ne fasse d'hypothèse sur le type de `id`.
-- ---------------------------------------------------------------------------
create or replace function private.new_id(p_prefix text)
returns text
language sql
volatile
set search_path = ''
as $$
  select p_prefix || '_' || gen_random_uuid()::text;
$$;

comment on function private.new_id(text) is
  'Identifiant métier préfixé, aligné sur randomId() du frontend.';

-- Vocabulaire de couleur partagé (household_members.color_tag, avatar_color…).
create or replace function private.is_member_color(p_value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is not null
    and p_value in ('accent', 'ink', 'coral', 'amber', 'violet');
$$;

comment on function private.is_member_color(text) is
  'Couleurs de membre autorisées : accent, ink, coral, amber, violet.';

commit;
