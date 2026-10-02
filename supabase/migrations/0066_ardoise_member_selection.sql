-- 0066_ardoise_member_selection.sql
-- Sélection des membres à la création d'une ardoise + ajout/retrait ensuite.
--
-- `create_ardoise` accepte `p_member_ids` (optionnel) : restreint aux membres
-- admin/membre du foyer, toute autre valeur est ignorée. NULL (défaut) garde
-- le régime historique : tous les admin + membre. Un tableau vide donne une
-- ardoise sans membre (ajout ultérieur via PostgREST, politique
-- `ardoise_members_admin` déjà en place pour les admins).
--
-- Changement de signature = nouvelle fonction : l'ancienne est supprimée
-- (jamais appelée que par l'Edge en `service_role`), jamais réécrite.

begin;

drop function if exists public.create_ardoise(uuid, text, text, text, text, text);

create or replace function public.create_ardoise(
  p_actor_id uuid,
  p_household_id text,
  p_name text,
  p_description text default null,
  p_cover_url text default null,
  p_invite_hash text default null,
  p_member_ids text[] default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ardoise_id text := private.new_id('ardoise');
  v_member_id text;
  v_out jsonb;
begin
  if p_actor_id is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  perform private.assert_household_writer(p_household_id, p_actor_id);
  if p_name is null or char_length(btrim(p_name)) not between 1 and 120 then
    raise exception 'nom d''ardoise invalide' using errcode = '22023';
  end if;
  if p_invite_hash is not null and p_invite_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'empreinte d''invitation invalide' using errcode = '22023';
  end if;

  select m.id into v_member_id
    from public.household_members m
   where m.household_id = p_household_id and m.user_id = p_actor_id
   limit 1;

  insert into public.ardoises (id, household_id, name, description, cover_url, invite_hash, created_by)
  values (v_ardoise_id, p_household_id, btrim(p_name), p_description, p_cover_url, p_invite_hash, v_member_id);

  -- Membres initiaux : sélection explicite si fournie, sinon admin + membre
  -- du foyer (enfants exclus dans les deux cas).
  if p_member_ids is null then
    insert into public.ardoise_members (ardoise_id, member_id)
    select v_ardoise_id, m.id
      from public.household_members m
     where m.household_id = p_household_id and m.role in ('admin', 'membre');
  else
    insert into public.ardoise_members (ardoise_id, member_id)
    select v_ardoise_id, m.id
      from public.household_members m
     where m.household_id = p_household_id
       and m.role in ('admin', 'membre')
       and m.id = any (p_member_ids)
    on conflict do nothing;
  end if;

  select to_jsonb(a) into v_out from public.ardoises a where a.id = v_ardoise_id;
  return v_out;
end;
$$;

revoke all on function public.create_ardoise(uuid, text, text, text, text, text, text[]) from public, anon, authenticated;
grant execute on function public.create_ardoise(uuid, text, text, text, text, text, text[]) to service_role;

comment on function public.create_ardoise(uuid, text, text, text, text, text, text[]) is
  'Création d''ardoise (Edge `ardoise-invite` seul) : `p_member_ids` restreint les membres initiaux, NULL = tous les admin/membre.';

commit;
