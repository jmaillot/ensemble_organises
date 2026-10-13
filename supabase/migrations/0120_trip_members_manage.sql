-- 0120_trip_members_manage.sql
-- Rubrique Membres de la fiche voyage : les admins du foyer cochent ou
-- décochent les participants (section Paramètres, lecture dans Infos).
--
-- Deux RPC service_role seuls (motif 0118) : `trip_add_member` inscrit un
-- membre du foyer au voyage (idempotent, + ardoise liée pour les adultes
-- seuls — 0119 : un enfant voyage sans budget) ; `trip_remove_member`
-- retire un participant ET son inscription ardoise, en refusant de vider le
-- voyage (au moins un participant). Les lignes déjà écrites par le membre
-- (tâches, notes…) restent pour le foyer, comme `trip_leave`.
--
-- Vers l'avant uniquement, aucune migration appliquée retouchée (AGENTS.md
-- §2.7A). Toute table s'écrit `public.*` (search_path vide ne résout rien).

begin;

-- Inscription par un admin (idempotente) : membre du même foyer uniquement.
create or replace function public.trip_add_member(
  p_actor_id uuid,
  p_trip_id text,
  p_member_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_household_id text;
  v_role text;
  v_ardoise_id text;
  v_already boolean;
begin
  if p_actor_id is null or p_trip_id is null or p_member_id is null then
    raise exception 'acteur, voyage et membre obligatoires' using errcode = '22023';
  end if;
  select t.household_id into v_household_id
    from public.trips t
   where t.id = p_trip_id;
  if v_household_id is null then
    raise exception 'voyage introuvable' using errcode = 'P0002';
  end if;
  perform private.assert_household_admin(v_household_id, p_actor_id);

  select m.role into v_role
    from public.household_members m
   where m.id = p_member_id and m.household_id = v_household_id;
  if v_role is null then
    raise exception 'membre du foyer introuvable' using errcode = 'P0002';
  end if;

  select exists (
    select 1
      from public.trip_members tm
     where tm.trip_id = p_trip_id and tm.member_id = p_member_id
  ) into v_already;
  if not v_already then
    insert into public.trip_members (trip_id, member_id)
    values (p_trip_id, p_member_id);

    -- Ardoise liée : adultes seuls (0119).
    if v_role in ('admin', 'membre') then
      select a.id into v_ardoise_id
        from public.ardoises a
       where a.trip_id = p_trip_id;
      if v_ardoise_id is not null then
        insert into public.ardoise_members (ardoise_id, member_id)
        values (v_ardoise_id, p_member_id)
        on conflict do nothing;
      end if;
    end if;
  end if;

  return jsonb_build_object('trip_id', p_trip_id, 'member_id', p_member_id, 'already_member', v_already);
end;
$$;

comment on function public.trip_add_member(uuid, text, text) is
  'USAGE SERVEUR UNIQUEMENT. Inscrit un membre du foyer au voyage (admin seul, idempotent, + ardoise adultes seuls).';

-- Retrait par un admin : voyage ET ardoise liée, jamais le dernier.
create or replace function public.trip_remove_member(
  p_actor_id uuid,
  p_trip_id text,
  p_member_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_household_id text;
  v_ardoise_id text;
begin
  if p_actor_id is null or p_trip_id is null or p_member_id is null then
    raise exception 'acteur, voyage et membre obligatoires' using errcode = '22023';
  end if;
  select t.household_id into v_household_id
    from public.trips t
   where t.id = p_trip_id;
  if v_household_id is null then
    raise exception 'voyage introuvable' using errcode = 'P0002';
  end if;
  perform private.assert_household_admin(v_household_id, p_actor_id);

  delete from public.trip_members tm
   where tm.trip_id = p_trip_id and tm.member_id = p_member_id;
  if not found then
    raise exception 'participation introuvable' using errcode = 'P0002';
  end if;

  -- Un voyage garde au moins un participant (l'exception annule le retrait).
  if not exists (
    select 1
      from public.trip_members tm
     where tm.trip_id = p_trip_id
  ) then
    raise exception 'le voyage garde au moins un participant' using errcode = '22023';
  end if;

  select a.id into v_ardoise_id
    from public.ardoises a
   where a.trip_id = p_trip_id;
  if v_ardoise_id is not null then
    delete from public.ardoise_members am
     where am.ardoise_id = v_ardoise_id and am.member_id = p_member_id;
  end if;

  return jsonb_build_object('trip_id', p_trip_id, 'member_id', p_member_id, 'removed', true);
end;
$$;

comment on function public.trip_remove_member(uuid, text, text) is
  'USAGE SERVEUR UNIQUEMENT. Retire un participant du voyage et de l''ardoise liee (admin seul, jamais le dernier).';

revoke all on function public.trip_add_member(uuid, text, text) from public, anon, authenticated;
revoke all on function public.trip_remove_member(uuid, text, text) from public, anon, authenticated;
grant execute on function public.trip_add_member(uuid, text, text) to service_role;
grant execute on function public.trip_remove_member(uuid, text, text) to service_role;

commit;
