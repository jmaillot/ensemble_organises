-- supabase/migrations/0082_gift_redeem_upgrade.sql
--
-- Correctif vers l'avant (0079 inchangée) : l'échange d'un code surclasse en
-- `reservation` un partage `lecture` pré-existant (membre ou e-mail), au lieu
-- de le laisser en lecture seule. Cas réel : liste privée partagée par e-mail
-- en `lecture` depuis le dialogue, puis échange du code par l'invité —
-- sans surclassement, l'invité restait en lecture seule (D-17 : le rachat
-- donne lecture + réservation). L'idempotence (compteur intact,
-- `already_shared: true`) est conservée.

create or replace function public.redeem_gift_list_invite(
  p_token_hash text,
  p_actor_id uuid default null,
  p_email text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_invite public.gift_list_invites%rowtype;
  v_household_id text;
  v_member_id text;
  v_email text;
  v_existing text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'code invalide' using errcode = '22023';
  end if;

  -- Verrou pessimiste : deux échanges simultanés du même code ne peuvent pas
  -- franchir `use_count < max_uses`. La ligne est d'abord localisée par
  -- l'index sur `token_hash`, puis la comparaison est refaite à temps
  -- constant (motif 0017).
  select t.* into v_invite
    from public.gift_list_invites t
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

  select l.household_id into v_household_id
    from public.gift_lists l where l.id = v_invite.list_id;
  -- La liste a pu disparaître entre-temps (cascade) : oracle uniforme, le
  -- client n'apprend rien de plus que sur un code inconnu.
  if v_household_id is null then
    raise exception 'code invalide' using errcode = 'P0002';
  end if;

  -- Membre du foyer : partage idempotent, sans consommer le compteur.
  if p_actor_id is not null then
    select m.id into v_member_id
      from public.household_members m
     where m.household_id = v_household_id and m.user_id = p_actor_id
     limit 1;
    if v_member_id is not null then
      select s.id into v_existing
        from public.gift_list_shares s
       where s.list_id = v_invite.list_id
         and s.shared_with_member_id = v_member_id
       limit 1;
      if v_existing is not null then
        -- Surclassement : un partage `lecture` pré-existant (ex. dialogue)
        -- devient `reservation` à l'échange (D-17), sans consommer le compteur.
        update public.gift_list_shares
           set permission = 'reservation'
         where id = v_existing and permission = 'lecture';
        return jsonb_build_object('list_id', v_invite.list_id, 'already_shared', true);
      end if;

      insert into public.gift_list_shares (list_id, shared_with_member_id, permission)
      values (v_invite.list_id, v_member_id, 'reservation');

      update public.gift_list_invites
         set use_count = use_count + 1,
             is_active = (use_count + 1 < max_uses)
       where id = v_invite.id;

      return jsonb_build_object('list_id', v_invite.list_id, 'already_shared', false);
    end if;
  end if;

  -- Externe par e-mail : même idempotence, même compteur. Un acteur d'un
  -- autre foyer sans e-mail tombe ici aussi : oracle uniforme.
  if p_email is null or btrim(p_email) = '' then
    raise exception 'code invalide' using errcode = 'P0002';
  end if;
  v_email := lower(btrim(p_email));
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'adresse e-mail invalide' using errcode = '22023';
  end if;

  select s.id into v_existing
    from public.gift_list_shares s
   where s.list_id = v_invite.list_id
     and lower(btrim(s.shared_with_email)) = v_email
   limit 1;
  if v_existing is not null then
    -- Surclassement e-mail, même règle que la branche membre (D-17).
    update public.gift_list_shares
       set permission = 'reservation'
     where id = v_existing and permission = 'lecture';
    return jsonb_build_object('list_id', v_invite.list_id, 'already_shared', true);
  end if;

  insert into public.gift_list_shares (list_id, shared_with_email, permission)
  values (v_invite.list_id, v_email, 'reservation');

  update public.gift_list_invites
     set use_count = use_count + 1,
         is_active = (use_count + 1 < max_uses)
   where id = v_invite.id;

  return jsonb_build_object('list_id', v_invite.list_id, 'already_shared', false);
end;
$$;

comment on function public.redeem_gift_list_invite(text, uuid, text) is
  'USAGE SERVEUR UNIQUEMENT. Échange un code contre un partage `reservation` (membre du foyer ou e-mail externe), atomique et idempotent, oracle `code invalide` unique. Surclasse `lecture` en `reservation` (0082).';
