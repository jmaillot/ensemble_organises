-- 0119_trip_enfants_participants.sql
-- Voyages : toute la famille voyage, enfants compris (retour utilisateur
-- 12/10/2026 : un foyer avec un enfant ne pouvait sélectionner qu'un seul
-- participant, les enfants étant exclus comme l'ardoise).
--
-- Décision 0119 : `trip_members` accepte les rôles admin/membre/enfant ;
-- l'ardoise liée reste aux adultes (le budget filtre déjà les enfants côté
-- client, comme l'ardoise). Un enfant voyage, ne paie pas.
--
-- Vers l'avant uniquement, aucune migration appliquée retouchée (AGENTS.md
-- §2.7A). Toute table s'écrit `public.*` (search_path vide ne résout rien).

begin;

-- ---------------------------------------------------------------------------
-- A. Création atomique : participants = toute la famille, ardoise = adultes.
-- ---------------------------------------------------------------------------
create or replace function public.create_trip_atomic(
  p_actor_id uuid,
  p_household_id text,
  p_name text,
  p_destination text,
  p_start_date date,
  p_end_date date,
  p_notes text default null,
  p_member_ids text[] default null,
  p_tab_state jsonb default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_member_id text;
  v_trip_id text := private.new_id('trip');
  v_ardoise_id text := private.new_id('ardoise');
  v_out jsonb;
begin
  if p_actor_id is null or p_household_id is null then
    raise exception 'acteur et foyer obligatoires' using errcode = '22023';
  end if;
  perform private.assert_household_writer(p_household_id, p_actor_id);
  if p_name is null or char_length(btrim(p_name)) not between 1 and 200 then
    raise exception 'nom de voyage invalide' using errcode = '22023';
  end if;
  if p_destination is null or char_length(btrim(p_destination)) = 0 then
    raise exception 'destination obligatoire' using errcode = '22023';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'dates de voyage invalides' using errcode = '22023';
  end if;

  select m.id into v_member_id
    from public.household_members m
   where m.household_id = p_household_id and m.user_id = p_actor_id
   limit 1;

  insert into public.trips (
    id, household_id, name, destination, start_date, end_date,
    notes, created_by, tab_state
  ) values (
    v_trip_id, p_household_id, btrim(p_name), btrim(p_destination),
    p_start_date, p_end_date, p_notes, v_member_id,
    coalesce(
      p_tab_state,
      '{"infos": true, "courses": true, "notes": true, "taches": true, "adresses": true, "budget": true, "parametres": true}'::jsonb
    )
  );

  -- 0119 : toute la famille voyage (admin/membre/enfant). NULL = tous.
  if p_member_ids is null then
    insert into public.trip_members (trip_id, member_id)
    select v_trip_id, m.id
      from public.household_members m
     where m.household_id = p_household_id
       and m.role in ('admin', 'membre', 'enfant');
  else
    insert into public.trip_members (trip_id, member_id)
    select v_trip_id, m.id
      from public.household_members m
     where m.household_id = p_household_id
       and m.role in ('admin', 'membre', 'enfant')
       and m.id = any (p_member_ids)
    on conflict do nothing;
  end if;

  -- Ardoise liée (nom du voyage) + inscriptions miroirs ADULTES seuls :
  -- les enfants voyagent mais ne paient pas (budget filtré côté client).
  insert into public.ardoises (id, household_id, name, created_by, trip_id)
  values (v_ardoise_id, p_household_id, btrim(p_name), v_member_id, v_trip_id);

  insert into public.ardoise_members (ardoise_id, member_id)
  select v_ardoise_id, tm.member_id
    from public.trip_members tm
    join public.household_members m on m.id = tm.member_id
   where tm.trip_id = v_trip_id
     and m.role in ('admin', 'membre')
  on conflict do nothing;

  return jsonb_build_object('trip_id', v_trip_id, 'ardoise_id', v_ardoise_id);
end;
$$;

comment on function public.create_trip_atomic(uuid, text, text, text, date, date, text, text[], jsonb) is
  'USAGE SERVEUR UNIQUEMENT (Edge trip-invite). Cree voyage + participants (0119 : toute la famille, enfants compris) + ardoise liee adultes seuls en une transaction.';

-- ---------------------------------------------------------------------------
-- B. Échange : un enfant membre rejoint le voyage (sans ardoise).
-- ---------------------------------------------------------------------------
create or replace function public.redeem_trip_invite(
  p_token_hash text,
  p_actor_id uuid default null,
  p_display_name text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_invite public.trip_invites%rowtype;
  v_household_id text;
  v_member_id text;
  v_role text;
  v_ticket text := encode(extensions.gen_random_bytes(24), 'base64');
  v_guest_id text := private.new_id('trip-guest');
  v_ardoise_id text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'code invalide' using errcode = '22023';
  end if;

  select t.* into v_invite
    from public.trip_invites t
   where t.token_hash = p_token_hash
     and private.token_hash_matches(t.token_hash, p_token_hash)
   for update;
  if not found then
    raise exception 'code invalide' using errcode = 'P0002';
  end if;
  if not v_invite.is_active
     or (v_invite.expires_at is not null and v_invite.expires_at <= now())
     or v_invite.use_count >= v_invite.max_uses then
    raise exception 'code invalide' using errcode = 'P0002';
  end if;

  select t.household_id into v_household_id
    from public.trips t where t.id = v_invite.trip_id;
  if v_household_id is null then
    raise exception 'code invalide' using errcode = 'P0002';
  end if;

  -- Membre du foyer : inscription idempotente, sans consommer le compteur.
  -- 0119 : enfants compris (voyageurs sans ardoise).
  if p_actor_id is not null then
    select m.id, m.role into v_member_id, v_role
      from public.household_members m
     where m.household_id = v_household_id and m.user_id = p_actor_id
     limit 1;
    if v_member_id is not null then
      if exists (
        select 1
          from public.trip_members tm
         where tm.trip_id = v_invite.trip_id and tm.member_id = v_member_id
      ) then
        return jsonb_build_object('trip_id', v_invite.trip_id, 'already_member', true);
      end if;

      insert into public.trip_members (trip_id, member_id)
      values (v_invite.trip_id, v_member_id)
      on conflict do nothing;

      -- Ardoise liée : adultes seuls (enfant voyageur, jamais payeur).
      if v_role in ('admin', 'membre') then
        select a.id into v_ardoise_id
          from public.ardoises a
         where a.trip_id = v_invite.trip_id;
        if v_ardoise_id is not null then
          insert into public.ardoise_members (ardoise_id, member_id)
          values (v_ardoise_id, v_member_id)
          on conflict do nothing;
        end if;
      end if;

      update public.trip_invites
         set use_count = use_count + 1,
             is_active = (use_count + 1 < max_uses)
       where id = v_invite.id;

      return jsonb_build_object('trip_id', v_invite.trip_id, 'already_member', false);
    end if;
  end if;

  -- Invité externe : ticket brut rendu une seule fois, HMAC stocké.
  if p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 120 then
    raise exception 'pseudonyme invalide' using errcode = '22023';
  end if;
  insert into public.trip_guests (id, trip_id, display_name, ticket_hash)
  values (v_guest_id, v_invite.trip_id, btrim(p_display_name),
          encode(extensions.digest(v_ticket, 'sha256'), 'hex'));

  select a.id into v_ardoise_id
    from public.ardoises a
   where a.trip_id = v_invite.trip_id;
  if v_ardoise_id is not null then
    insert into public.ardoise_guests (id, ardoise_id, display_name, ticket_hash)
    values (v_guest_id, v_ardoise_id, btrim(p_display_name), null)
    on conflict (id) do nothing;
  end if;

  update public.trip_invites
     set use_count = use_count + 1,
         is_active = (use_count + 1 < max_uses)
   where id = v_invite.id;

  return jsonb_build_object('trip_id', v_invite.trip_id, 'guest_ticket', v_ticket);
end;
$$;

comment on function public.redeem_trip_invite(text, uuid, text) is
  'USAGE SERVEUR UNIQUEMENT. Echange un code contre une inscription membre (0119 : enfants compris, sans ardoise) ou un ticket invite, oracle `code invalide` unique.';

comment on table public.trip_members is
  'Participants du voyage : toute la famille du foyer (0119 : admin/membre/enfant, les enfants voyagent sans budget). Acces derive du voyage.';

revoke all on function public.create_trip_atomic(uuid, text, text, text, date, date, text, text[], jsonb) from public, anon, authenticated;
grant execute on function public.create_trip_atomic(uuid, text, text, text, date, date, text, text[], jsonb) to service_role;
revoke all on function public.redeem_trip_invite(text, uuid, text) from public, anon, authenticated;
grant execute on function public.redeem_trip_invite(text, uuid, text) to service_role;

commit;
