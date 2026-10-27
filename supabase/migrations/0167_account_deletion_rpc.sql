-- 0167_account_deletion_rpc.sql
-- RPC transactionnels de la suppression de compte (phase 27, plan 27-01).
--
-- `request_account_deletion` — UNE seule transaction, dans l'ordre qui limite
-- les dégâts (D-04 puis D-01/D-02/D-03) :
--   1. instantané de restauration D-04 (upsert : l'ancien nom/avatar du profil
--      ET de la ligne membre, la ligne membre ancrée, le foyer) ;
--   2. déshumanisation D-01/D-02 : profil ET ligne membre passent à
--      « Ancien membre », sans avatar ; la ligne membre est marquée
--      `account_deleted_at = now()` (D-03 : elle RESTE en base) ;
--   3. insertion de la demande avec `purge_due_at = now() + 30 days`.
--   D-06 (remplacement) : si une demande active existe, elle passe à
--   « annulee » AVANT l'insertion — l'index unique partiel fait foi si une
--   course concurrente franchit quand même (l'insertion échoue bruyamment).
--
-- `cancel_account_deletion` — restauration depuis l'instantané (D-05),
-- demande passée à « annulee », reposable immédiatement. L'instantané est
-- conservé (aucune perte au-delà du plan) : un re-demande le met à jour.
--
-- Acteur (T-27-01) : l'acteur est vérifié EN BASE, jamais cru. Sans session,
-- refus 28000 ; l'acteur ne peut agir que sur sa propre demande (42501) ;
-- son profil doit exister (P0002). Forme 0074 : SECURITY DEFINER,
-- `search_path = ''` — tout nom est qualifié, y compris `auth.uid()`.
--
-- Privilèges (T-27-03) : `EXECUTE` retiré à PUBLIC puis accordé à
-- `authenticated` (l'utilisateur agit sur son propre compte) et
-- `service_role` (cron du plan 02), avec preuve par `has_function_privilege`.

begin;

create or replace function public.request_account_deletion(p_user_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_request_id uuid;
  v_profile_name text;
  v_profile_avatar text;
  v_member_id text;
  v_member_name text;
  v_member_avatar text;
  v_household_id text;
  v_had_active boolean;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if v_actor is distinct from p_user_id then
    raise exception 'un utilisateur ne peut agir que sur sa propre demande'
      using errcode = '42501';
  end if;

  -- Revérification en base de l'acteur : le profil doit exister.
  select p.display_name, p.avatar_url
    into v_profile_name, v_profile_avatar
    from public.profiles p
   where p.id = v_actor;
  if v_profile_name is null then
    raise exception 'profil introuvable' using errcode = 'P0002';
  end if;

  -- D-06 (remplacement) : une demande active existante est annulée d'abord.
  update public.account_deletion_requests
     set status = 'annulee',
         updated_at = now()
   where user_id = v_actor
     and status in ('demandee', 'rappellee');
  select exists (
    select 1 from public.account_deletion_requests
     where user_id = v_actor
       and status = 'annulee'
       and updated_at = now()
  ) into v_had_active;

  if v_had_active then
    -- Remplacement D-06 : la surface est déjà déshumanisée et l'instantané
    -- porte déjà les valeurs D'ORIGINE — ne pas re-snapshotter (on y
    -- recopierait « Ancien membre ») ni re-déshumaniser. Seule l'horloge
    -- est rejouée par la nouvelle demande, insérée plus bas.
    null;
  else
    -- La ligne membre d'ancrage : la plus ancienne ligne vivante de l'acteur.
    select m.id, m.display_name, m.avatar_url, m.household_id
      into v_member_id, v_member_name, v_member_avatar, v_household_id
      from public.household_members m
     where m.user_id = v_actor
       and m.account_deleted_at is null
     order by m.created_at asc
     limit 1;
    if v_member_id is null then
      raise exception 'membre introuvable' using errcode = 'P0002';
    end if;

    -- 1. Instantané D-04, AVANT toute déshumanisation.
    insert into public.account_deletion_restorations
      (user_id, former_display_name, former_avatar_url,
       former_member_row_id, former_member_display_name,
       former_member_avatar_url, household_id)
    values
      (v_actor, v_profile_name, v_profile_avatar,
       v_member_id, v_member_name, v_member_avatar, v_household_id)
    on conflict (user_id) do update
      set former_display_name = excluded.former_display_name,
          former_avatar_url = excluded.former_avatar_url,
          former_member_row_id = excluded.former_member_row_id,
          former_member_display_name = excluded.former_member_display_name,
          former_member_avatar_url = excluded.former_member_avatar_url,
          household_id = excluded.household_id,
          created_at = now();

    -- 2. Déshumanisation D-01/D-02, puis l'état « ancien membre » D-03.
    --    La ligne membre reste en base : seul le marqueur est posé.
    update public.profiles
       set display_name = 'Ancien membre',
           avatar_url = null,
           updated_at = now()
     where id = v_actor;
    update public.household_members
       set account_deleted_at = now(),
           display_name = 'Ancien membre',
           avatar_url = null
     where user_id = v_actor
       and account_deleted_at is null;
  end if;

  -- 3. La demande, avec l'horloge J+30 rejouée à chaque demande.
  insert into public.account_deletion_requests (user_id)
  values (v_actor)
  returning id into v_request_id;

  return v_request_id;
end;
$$;

comment on function public.request_account_deletion(uuid) is
  'Demande de suppression de compte : instantané D-04 puis déshumanisation D-01/D-02/D-03 puis demande D-06, une seule transaction. USAGE SERVEUR UNIQUEMENT : l''acteur est vérifié en base, jamais auth.uid() cru.';

create or replace function public.cancel_account_deletion(p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_snapshot public.account_deletion_restorations%rowtype;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if v_actor is distinct from p_user_id then
    raise exception 'un utilisateur ne peut agir que sur sa propre demande'
      using errcode = '42501';
  end if;

  select r.*
    into v_snapshot
    from public.account_deletion_restorations r
   where r.user_id = v_actor;
  if v_snapshot.user_id is null then
    raise exception 'aucune demande à annuler' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.account_deletion_requests q
     where q.user_id = v_actor
       and q.status in ('demandee', 'rappellee')
  ) then
    raise exception 'aucune demande active' using errcode = 'P0002';
  end if;

  -- Restauration D-05 : l'état revient depuis l'instantané. La valeur NULL
  -- de l'avatar d'origine est restaurée telle quelle (coalesce interdit ici :
  -- NULL est un état porteur, pas une absence de donnée).
  update public.profiles
     set display_name = v_snapshot.former_display_name,
         avatar_url = v_snapshot.former_avatar_url,
         updated_at = now()
   where id = v_actor;
  update public.household_members
     set account_deleted_at = null,
         display_name = v_snapshot.former_member_display_name,
         avatar_url = v_snapshot.former_member_avatar_url
   where user_id = v_actor;

  update public.account_deletion_requests
     set status = 'annulee',
         updated_at = now()
   where user_id = v_actor
     and status in ('demandee', 'rappellee');

  -- L'instantané est conservé : une demande annulée peut être reposée, et le
  -- upsert de request_account_deletion le mettra à jour. Purge définitive
  -- à J+30 par le plan 02.
end;
$$;

comment on function public.cancel_account_deletion(uuid) is
  'Annulation d''une demande de suppression : restauration D-05 depuis l''instantané, demande « annulee », reposable immédiatement. USAGE SERVEUR UNIQUEMENT : acteur vérifié en base.';

-- Privilèges explicites (motif 0074:56-58) : retrait à PUBLIC puis accords
-- nommés — authenticated (le compte est personnel) et service_role (cron 02).
revoke all on function public.request_account_deletion(uuid)
  from public, anon, authenticated;
revoke all on function public.cancel_account_deletion(uuid)
  from public, anon, authenticated;
grant execute on function public.request_account_deletion(uuid)
  to authenticated, service_role;
grant execute on function public.cancel_account_deletion(uuid)
  to authenticated, service_role;

-- Preuve des privilèges (motif 0074:60-69) : la migration refuse de
-- s'appliquer si un rôle indû garde EXECUTE.
do $$
begin
  if has_function_privilege('anon', 'public.request_account_deletion(uuid)', 'EXECUTE') then
    raise exception 'anon ne doit pas pouvoir demander une suppression de compte';
  end if;
  if has_function_privilege('anon', 'public.cancel_account_deletion(uuid)', 'EXECUTE') then
    raise exception 'anon ne doit pas pouvoir annuler une suppression de compte';
  end if;
  if not has_function_privilege('authenticated', 'public.request_account_deletion(uuid)', 'EXECUTE') then
    raise exception 'authenticated doit pouvoir demander sa propre suppression';
  end if;
  if not has_function_privilege('authenticated', 'public.cancel_account_deletion(uuid)', 'EXECUTE') then
    raise exception 'authenticated doit pouvoir annuler sa propre demande';
  end if;
  if not has_function_privilege('service_role', 'public.request_account_deletion(uuid)', 'EXECUTE') then
    raise exception 'service_role doit pouvoir exécuter les RPC de suppression (cron plan 02)';
  end if;
end;
$$;

commit;
