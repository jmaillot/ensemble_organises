-- 0070_redeem_join_zero_shares.sql
-- Adhésion via code : le nouveau membre rejoint les dépenses existantes avec
-- une part à ZÉRO (listé, ne doit rien sur le passé, partage normal ensuite).
-- Aucun solde existant ne bouge : la somme des parts est inchangée, le
-- contrôle différé ne voit rien. Idempotent (rejoindre deux fois n'ajoute
-- rien) comme le reste du chemin membre.
--
-- Redéfinition de la version effective (0062), jamais réécrite : le corps est
-- repris à l'ajout du bloc membre près.

begin;

create or replace function public.redeem_ardoise_invite(
  p_invite_hash text,
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
  v_ardoise public.ardoises%rowtype;
  v_member_id text;
  v_ticket text := encode(extensions.gen_random_bytes(24), 'base64');
  v_guest_id text := private.new_id('ardoise-guest');
begin
  if p_invite_hash is null or p_invite_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'code invalide' using errcode = '22023';
  end if;

  select * into v_ardoise
    from public.ardoises a
   where a.invite_hash = p_invite_hash
   for update;
  if v_ardoise.id is null then
    raise exception 'code invalide' using errcode = 'P0002';
  end if;
  if not v_ardoise.is_active
     or (v_ardoise.expires_at is not null and v_ardoise.expires_at <= now())
     or (v_ardoise.max_uses is not null and v_ardoise.use_count >= v_ardoise.max_uses) then
    raise exception 'code invalide' using errcode = 'P0002';
  end if;

  -- Membre du foyer déjà connecté : inscription idempotente, sans ticket.
  if p_actor_id is not null then
    select m.id into v_member_id
      from public.household_members m
     where m.household_id = v_ardoise.household_id and m.user_id = p_actor_id
     limit 1;
    if v_member_id is not null then
      insert into public.ardoise_members (ardoise_id, member_id)
      values (v_ardoise.id, v_member_id)
      on conflict do nothing;
      -- Dépenses existantes : part à zéro là où il manque (ni dette sur le
      -- passé, ni doublon en cas de double échange).
      insert into public.expense_participants (expense_id, participant_type, member_id, share_amount)
      select e.id, 'membre', v_member_id, 0
        from public.expenses e
       where e.ardoise_id = v_ardoise.id
         and not exists (
           select 1 from public.expense_participants ep
            where ep.expense_id = e.id
              and ep.participant_type = 'membre'
              and ep.member_id = v_member_id
         )
      on conflict do nothing;
      return jsonb_build_object('ardoise_id', v_ardoise.id, 'already_member', true);
    end if;
  end if;

  if p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 120 then
    raise exception 'pseudonyme invalide' using errcode = '22023';
  end if;
  insert into public.ardoise_guests (id, ardoise_id, display_name, ticket_hash)
  values (v_guest_id, v_ardoise.id, btrim(p_display_name),
          encode(extensions.digest(v_ticket, 'sha256'), 'hex'));

  update public.ardoises
     set use_count = use_count + 1
   where id = v_ardoise.id;

  return jsonb_build_object('ardoise_id', v_ardoise.id, 'guest_ticket', v_ticket);
end;
$$;

comment on function public.redeem_ardoise_invite(text, uuid, text) is
  'Échange d''un code : membre inscrit (parts à zéro sur le passé) ou invité externe (ticket).';

commit;
