-- 0009_grants.sql
-- Privilèges : RLS filtre les lignes, les GRANT filtrent les tables.
--
-- Règles :
--   * `anon` n'a aucun accès (le produit ne propose pas de session anonyme).
--   * `authenticated` a CRUD sur les tables métier : c'est la RLS qui décide.
--   * `household_invite_tokens` n'est accessible qu'à `service_role`.
--   * Les quatre fonctions serveur sur les tokens ne sont exécutables que par
--     `service_role` : un client porteur d'un JWT utilisateur est `authenticated`
--     et se voit refuser l'appel.

begin;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

grant usage, select on all sequences in schema public to authenticated, service_role;

-- Aucune politique n'existe sur cette table : on verrouille aussi les GRANT.
revoke all on table public.household_invite_tokens from anon, authenticated;
grant all on table public.household_invite_tokens to service_role;

-- Les tables enfants n'ont pas de colonne household_id : on ne laisse passer
-- que ce dont le client a réellement besoin, via RLS sur le parent.
revoke all on table public.household_invite_tokens from public;

-- Valeurs par défaut pour les tables créées plus tard.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fonctions du schéma privé
--
-- Les fonctions de politique sont exécutées avec le rôle `authenticated` : sans
-- droit EXECUTE, chaque requête du client échouerait. Elles ne renvoient que
-- des booléens calculés à partir des identifiants du JWT, jamais de donnée.
-- Les fonctions Trigger sont accordées aux rôles qui écrivent réellement dans
-- les tables ; les invoquer directement échoue de toute façon.
-- ---------------------------------------------------------------------------
revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

-- Le trigger de création de profil s'exécute quand GoTrue écrit dans
-- `auth.users`, donc avec le rôle `supabase_auth_admin`.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    execute 'grant execute on all functions in schema private to supabase_auth_admin';
  end if;
end;
$$;

-- Fonctions qui ne doivent pas être appelables par un client, y compris via RPC.
revoke execute on function private.household_balances(text) from public, anon, authenticated;
revoke execute on function private.simplify_household_debts(text) from public, anon, authenticated;
grant execute on function private.household_balances(text) to service_role;
grant execute on function private.simplify_household_debts(text) to service_role;
revoke execute on function private.assert_household_admin(text, uuid) from public, anon, authenticated;
revoke execute on function private.token_hash_matches(text, text) from public, anon, authenticated;
revoke execute on function private.assert_expense_share_total(text) from public, anon, authenticated;
revoke execute on function private.parent_household_id(text, text) from public, anon, authenticated;
revoke execute on function private.handle_new_user() from anon, authenticated;
revoke execute on function private.align_child_household() from anon, authenticated;
revoke execute on function private.validate_member_refs() from anon, authenticated;
revoke execute on function private.validate_expense_participant() from anon, authenticated;


-- ---------------------------------------------------------------------------
-- Fonctions serveur sur les tokens d'invitation
-- ---------------------------------------------------------------------------
revoke all on function public.create_household_invite_token(uuid, text, text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.revoke_household_invite_tokens(uuid, text) from public, anon, authenticated;
revoke all on function public.household_invite_token_summary(uuid, text) from public, anon, authenticated;
revoke all on function public.redeem_household_invite_token(text, uuid, text, text, text) from public, anon, authenticated;

grant execute on function public.create_household_invite_token(uuid, text, text, timestamptz, integer) to service_role;
grant execute on function public.revoke_household_invite_tokens(uuid, text) to service_role;
grant execute on function public.household_invite_token_summary(uuid, text) to service_role;
grant execute on function public.redeem_household_invite_token(text, uuid, text, text, text) to service_role;

commit;
