-- 0058_ardoise_settlement_rpc.sql
-- Soldes par ardoise (membres + invités), compensation minimale, pont
-- `public.ardoise_settlement` (service_role seul), RPC de cycle de vie des
-- invitations, et `create/update_expense` conscients de l'ardoise.
--
-- Les anciennes signatures `create/update_expense` à 7 paramètres sont
-- supprimées (les RPC sont versionnées par signature, pas de surcharge
-- fantôme) ; les fonctions `household_*` historiques restent inchangées.

begin;

-- ---------------------------------------------------------------------------
-- Soldes par ardoise : deux familles (membre via ardoise_members, invité via
-- ardoise_guests). Dépense sans parts imputée à son payeur (comme 0006).
-- ---------------------------------------------------------------------------
create or replace function private.ardoise_balances(p_ardoise_id text)
returns table (
  kind text,
  participant_id text,
  display_name text,
  paid numeric(14, 2),
  share numeric(14, 2),
  balance numeric(14, 2)
)
language sql
stable
security definer
set search_path = ''
as $$
  with expense_totals as (
    select
      e.id,
      e.paid_by,
      e.paid_by_guest,
      e.amount,
      coalesce(
        (select sum(ep.share_amount) from public.expense_participants ep where ep.expense_id = e.id),
        0
      ) as allocated
    from public.expenses e
    where e.ardoise_id = p_ardoise_id
  ), paid as (
    select et.paid_by as member_id, null::text as guest_id, sum(et.amount)::numeric(14, 2) as amount
      from expense_totals et
     where et.paid_by is not null
     group by et.paid_by
    union all
    select null::text as member_id, et.paid_by_guest as guest_id, sum(et.amount)::numeric(14, 2) as amount
      from expense_totals et
     where et.paid_by_guest is not null
     group by et.paid_by_guest
  ), shared as (
    select s.member_id, s.guest_id, sum(s.amount)::numeric(14, 2) as amount
      from (
        select et.paid_by as member_id, et.paid_by_guest as guest_id, et.amount
          from expense_totals et
         where et.allocated = 0
        union all
        select ep.member_id, ep.guest_id, ep.share_amount
          from public.expense_participants ep
          join expense_totals et on et.id = ep.expense_id
         where et.allocated > 0
      ) s
     group by s.member_id, s.guest_id
  ), members as (
    select 'membre'::text as kind, m.id as participant_id, m.display_name as display_name
      from public.household_members m
      join public.ardoise_members am on am.member_id = m.id
     where am.ardoise_id = p_ardoise_id
    union
    select 'guest'::text as kind, g.id as participant_id, g.display_name as display_name
      from public.ardoise_guests g
     where g.ardoise_id = p_ardoise_id
  )
  select
    members.kind,
    members.participant_id,
    members.display_name,
    coalesce(paid.amount, 0),
    coalesce(shared.amount, 0),
    coalesce(paid.amount, 0) - coalesce(shared.amount, 0)
  from members
  left join paid
    on (paid.member_id = members.participant_id and members.kind = 'membre')
    or (paid.guest_id = members.participant_id and members.kind = 'guest')
  left join shared
    on (shared.member_id = members.participant_id and members.kind = 'membre')
    or (shared.guest_id = members.participant_id and members.kind = 'guest')
  order by members.display_name;
$$;

comment on function private.ardoise_balances(text) is
  'Solde par participant d''une ardoise (membres + invités) : positif = l''ardoise lui doit.';

-- ---------------------------------------------------------------------------
-- Compensation minimale par ardoise (même glissement que 0006, epsilon 0.005).
-- ---------------------------------------------------------------------------
create or replace function private.simplify_ardoise_debts(p_ardoise_id text)
returns table (
  debtor_kind text,
  debtor_id text,
  debtor_name text,
  creditor_kind text,
  creditor_id text,
  creditor_name text,
  amount numeric(14, 2)
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_debtor_kinds text[] := '{}';
  v_debtor_ids text[] := '{}';
  v_debtor_names text[] := '{}';
  v_debtor_amounts numeric[] := '{}';
  v_creditor_kinds text[] := '{}';
  v_creditor_ids text[] := '{}';
  v_creditor_names text[] := '{}';
  v_creditor_amounts numeric[] := '{}';
  v_i integer := 1;
  v_j integer := 1;
  v_amount numeric;
  v_epsilon numeric := 0.005;
begin
  if p_ardoise_id is null then
    raise exception 'ardoise manquante' using errcode = '22023';
  end if;

  with balances as (
    select * from private.ardoise_balances(p_ardoise_id)
  )
  select
    coalesce(array_agg(kind order by balance), '{}'),
    coalesce(array_agg(participant_id order by balance), '{}'),
    coalesce(array_agg(display_name order by balance), '{}'),
    coalesce(array_agg(-balance order by balance), '{}')
  into v_debtor_kinds, v_debtor_ids, v_debtor_names, v_debtor_amounts
  from balances
  where balance < -v_epsilon;

  with balances as (
    select * from private.ardoise_balances(p_ardoise_id)
  )
  select
    coalesce(array_agg(kind order by -balance), '{}'),
    coalesce(array_agg(participant_id order by -balance), '{}'),
    coalesce(array_agg(display_name order by -balance), '{}'),
    coalesce(array_agg(balance order by -balance), '{}')
  into v_creditor_kinds, v_creditor_ids, v_creditor_names, v_creditor_amounts
  from balances
  where balance > v_epsilon;

  while v_i <= coalesce(array_length(v_debtor_ids, 1), 0)
    and v_j <= coalesce(array_length(v_creditor_ids, 1), 0)
  loop
    v_amount := least(v_debtor_amounts[v_i], v_creditor_amounts[v_j]);

    if v_amount > v_epsilon then
      debtor_kind := v_debtor_kinds[v_i];
      debtor_id := v_debtor_ids[v_i];
      debtor_name := v_debtor_names[v_i];
      creditor_kind := v_creditor_kinds[v_j];
      creditor_id := v_creditor_ids[v_j];
      creditor_name := v_creditor_names[v_j];
      amount := round(v_amount, 2);
      return next;
    end if;

    v_debtor_amounts[v_i] := v_debtor_amounts[v_i] - v_amount;
    v_creditor_amounts[v_j] := v_creditor_amounts[v_j] - v_amount;

    if v_debtor_amounts[v_i] <= v_epsilon then
      v_i := v_i + 1;
    end if;
    if v_creditor_amounts[v_j] <= v_epsilon then
      v_j := v_j + 1;
    end if;
  end loop;

  return;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pont serveur : `public.ardoise_settlement` (service_role seul, comme 0013).
-- L'appelant doit être membre du foyer ET inscrit à l'ardoise (ou admin).
-- ---------------------------------------------------------------------------
create or replace function public.ardoise_settlement(
  p_actor_id uuid,
  p_ardoise_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_balances jsonb;
  v_settlements jsonb;
  v_household_id text;
  v_member_id text;
  v_role text;
begin
  if p_actor_id is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_ardoise_id is null then
    raise exception 'ardoise obligatoire' using errcode = '22023';
  end if;

  select a.household_id into v_household_id
    from public.ardoises a
   where a.id = p_ardoise_id;
  if v_household_id is null then
    raise exception 'ardoise introuvable' using errcode = 'P0002';
  end if;
  perform private.assert_household_member(v_household_id, p_actor_id);

  select m.id, m.role into v_member_id, v_role
    from public.household_members m
   where m.household_id = v_household_id
     and m.user_id = p_actor_id
   limit 1;
  if v_role <> 'admin'
     and not exists (
       select 1 from public.ardoise_members am
        where am.ardoise_id = p_ardoise_id and am.member_id = v_member_id
     ) then
    raise exception 'inscription à l''ardoise requise' using errcode = '42501';
  end if;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'kind', b.kind,
               'participant_id', b.participant_id,
               'display_name', b.display_name,
               'amount', round(b.balance, 2)
             ) order by b.display_name
           ),
           '[]'::jsonb
         )
    into v_balances
    from private.ardoise_balances(p_ardoise_id) b;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'from_kind', s.debtor_kind,
               'from_id', s.debtor_id,
               'from_name', s.debtor_name,
               'to_kind', s.creditor_kind,
               'to_id', s.creditor_id,
               'to_name', s.creditor_name,
               'amount', round(s.amount, 2)
             ) order by s.debtor_name, s.creditor_name
           ),
           '[]'::jsonb
         )
    into v_settlements
    from private.simplify_ardoise_debts(p_ardoise_id) s;

  return jsonb_build_object(
    'ardoise_id', p_ardoise_id,
    'household_id', v_household_id,
    'balances', v_balances,
    'settlements', v_settlements,
    'generated_at', now()
  );
end;
$$;

comment on function public.ardoise_settlement(uuid, text) is
  'USAGE SERVEUR UNIQUEMENT. Soldes et compensation minimale des dettes d''une ardoise.';

-- ---------------------------------------------------------------------------
-- Cycle de vie des invitations d'ardoise (service_role seul : seule l'Edge
-- Function `ardoise-invite` les appelle, comme `household-invite`).
-- ---------------------------------------------------------------------------
create or replace function public.create_ardoise(
  p_actor_id uuid,
  p_household_id text,
  p_name text,
  p_description text default null,
  p_cover_url text default null,
  p_invite_hash text default null
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

  -- Membres initiaux : admin + membre du foyer (enfants exclus).
  insert into public.ardoise_members (ardoise_id, member_id)
  select v_ardoise_id, m.id
    from public.household_members m
   where m.household_id = p_household_id and m.role in ('admin', 'membre');

  select to_jsonb(a) into v_out from public.ardoises a where a.id = v_ardoise_id;
  return v_out;
end;
$$;

create or replace function public.create_ardoise_invite(
  p_actor_id uuid,
  p_ardoise_id text,
  p_invite_hash text,
  p_expires_at timestamptz default null,
  p_max_uses integer default 10
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_household_id text;
  v_member_id text;
  v_role text;
begin
  if p_actor_id is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  select a.household_id into v_household_id
    from public.ardoises a where a.id = p_ardoise_id;
  if v_household_id is null then
    raise exception 'ardoise introuvable' using errcode = 'P0002';
  end if;
  select m.id, m.role into v_member_id, v_role
    from public.household_members m
   where m.household_id = v_household_id and m.user_id = p_actor_id
   limit 1;
  if v_role is distinct from 'admin'
     and not exists (
       select 1 from public.ardoises a
        where a.id = p_ardoise_id and a.created_by = v_member_id
     ) then
    raise exception 'gestion de l''ardoise réservée' using errcode = '42501';
  end if;
  if p_invite_hash is null or p_invite_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'empreinte d''invitation invalide' using errcode = '22023';
  end if;
  if p_max_uses is null or p_max_uses < 1 or p_max_uses > 100 then
    raise exception 'nombre d''utilisations invalide' using errcode = '22023';
  end if;
  if p_expires_at is not null and (p_expires_at <= now() or p_expires_at > now() + interval '90 days') then
    raise exception 'expiration invalide' using errcode = '22023';
  end if;

  -- Régénérer désactive immédiatement le précédent (un seul code actif).
  update public.ardoises
     set invite_hash = null, is_active = false, use_count = 0
   where id = p_ardoise_id;

  update public.ardoises
     set invite_hash = p_invite_hash,
         is_active = true,
         use_count = 0,
         max_uses = p_max_uses,
         expires_at = p_expires_at
   where id = p_ardoise_id;

  return jsonb_build_object(
    'ardoise_id', p_ardoise_id,
    'expires_at', p_expires_at,
    'max_uses', p_max_uses
  );
end;
$$;

create or replace function public.revoke_ardoise_invite(
  p_actor_id uuid,
  p_ardoise_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_household_id text;
  v_member_id text;
  v_role text;
begin
  if p_actor_id is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  select a.household_id into v_household_id
    from public.ardoises a where a.id = p_ardoise_id;
  if v_household_id is null then
    raise exception 'ardoise introuvable' using errcode = 'P0002';
  end if;
  select m.id, m.role into v_member_id, v_role
    from public.household_members m
   where m.household_id = v_household_id and m.user_id = p_actor_id
   limit 1;
  if v_role is distinct from 'admin'
     and not exists (
       select 1 from public.ardoises a
        where a.id = p_ardoise_id and a.created_by = v_member_id
     ) then
    raise exception 'gestion de l''ardoise réservée' using errcode = '42501';
  end if;

  update public.ardoises
     set invite_hash = null, is_active = false
   where id = p_ardoise_id;

  return jsonb_build_object('ardoise_id', p_ardoise_id, 'revoked', true);
end;
$$;

create or replace function public.ardoise_invite_summary(
  p_actor_id uuid,
  p_ardoise_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  if p_actor_id is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  -- Appelée en `service_role` (sans JWT) : l'acteur est le paramètre, jamais
  -- auth.uid(), qui serait NULL ici et fermerait tout.
  select jsonb_build_object(
           'ardoise_id', a.id,
           'is_active', a.is_active,
           'has_code', a.invite_hash is not null,
           'expires_at', a.expires_at,
           'max_uses', a.max_uses,
           'use_count', a.use_count
         )
    into v_out
    from public.ardoises a
   where a.id = p_ardoise_id
     and exists (
       select 1 from public.household_members m
        where m.household_id = a.household_id and m.user_id = p_actor_id
     );
  if v_out is null then
    raise exception 'ardoise introuvable' using errcode = 'P0002';
  end if;
  return v_out;
end;
$$;

-- Échange d'un code contre une inscription : membre du foyer (idempotent) ou
-- invité externe (ticket rendu une seule fois, jamais stocké en clair).
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
  v_ticket text := encode(gen_random_bytes(24), 'base64');
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
      return jsonb_build_object('ardoise_id', v_ardoise.id, 'already_member', true);
    end if;
  end if;

  -- Invité externe : ticket brut rendu une seule fois, HMAC stocké.
  if p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 120 then
    raise exception 'pseudonyme invalide' using errcode = '22023';
  end if;
  insert into public.ardoise_guests (id, ardoise_id, display_name, ticket_hash)
  values (v_guest_id, v_ardoise.id, btrim(p_display_name),
          encode(digest(v_ticket, 'sha256'), 'hex'));

  update public.ardoises
     set use_count = use_count + 1
   where id = v_ardoise.id;

  return jsonb_build_object('ardoise_id', v_ardoise.id, 'guest_ticket', v_ticket);
end;
$$;

-- Vérification d'un ticket invité pour les appels Edge (jamais PostgREST).
create or replace function public.verify_ardoise_ticket(p_ticket_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  if p_ticket_hash is null or p_ticket_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'ticket invalide' using errcode = '22023';
  end if;
  select jsonb_build_object(
           'guest_id', g.id,
           'ardoise_id', g.ardoise_id,
           'display_name', g.display_name
         )
    into v_out
    from public.ardoise_guests g
   where g.ticket_hash = p_ticket_hash;
  if v_out is null then
    raise exception 'ticket invalide' using errcode = 'P0002';
  end if;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- `create/update_expense` conscients de l'ardoise (anciennes signatures à 7
-- paramètres supprimées, pas de surcharge fantôme).
-- ---------------------------------------------------------------------------
drop function if exists public.create_expense(text, text, numeric, text, date, text, jsonb);
drop function if exists public.update_expense(text, text, numeric, text, date, text, jsonb);

create or replace function public.create_expense(
  p_household_id text,
  p_ardoise_id text,
  p_title text,
  p_amount numeric,
  p_paid_by text,
  p_paid_by_guest text,
  p_expense_date date,
  p_split_type text default 'egal',
  p_parts jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_expense_id text := private.new_id('expense');
  v_out jsonb;
  v_ardoise_household text;
begin
  if v_actor is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_household_id is null then
    raise exception 'foyer obligatoire' using errcode = '22023';
  end if;
  perform private.assert_household_member(p_household_id, v_actor);
  perform private.assert_household_writer(p_household_id, v_actor);

  select a.household_id into v_ardoise_household
    from public.ardoises a
   where a.id = p_ardoise_id;
  if v_ardoise_household is null then
    raise exception 'ardoise introuvable' using errcode = 'P0002';
  end if;
  if v_ardoise_household <> p_household_id then
    raise exception 'ardoise d''un autre foyer' using errcode = '23514';
  end if;
  if not private.can_write_ardoise(p_ardoise_id)
     and not private.is_household_admin(p_household_id) then
    -- `can_write_ardoise` lit auth.uid() : l'acteur courant est déjà vérifié
    -- writer, il doit en plus être inscrit à l'ardoise (ou admin).
    raise exception 'inscription à l''ardoise requise' using errcode = '42501';
  end if;

  if p_title is null or char_length(btrim(p_title)) not between 1 and 200 then
    raise exception 'libellé de dépense invalide' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'le montant doit être supérieur à zéro' using errcode = '22023';
  end if;
  if p_split_type not in ('egal', 'personnalise') then
    raise exception 'type de partage invalide' using errcode = '22023';
  end if;
  if p_paid_by is not null and p_paid_by_guest is not null then
    raise exception 'un seul payeur par dépense' using errcode = '22023';
  end if;

  insert into public.expenses (id, household_id, ardoise_id, title, amount, paid_by, paid_by_guest, expense_date, split_type)
  values (v_expense_id, p_household_id, p_ardoise_id, btrim(p_title), round(p_amount, 2), p_paid_by, p_paid_by_guest, coalesce(p_expense_date, current_date), p_split_type);

  perform private.insert_expense_parts(v_expense_id, p_household_id, round(p_amount, 2), p_parts);

  select to_jsonb(e) into v_out from public.expenses e where e.id = v_expense_id;
  return v_out;
end;
$$;

create or replace function public.update_expense(
  p_expense_id text,
  p_title text,
  p_amount numeric,
  p_paid_by text,
  p_paid_by_guest text,
  p_expense_date date,
  p_split_type text default 'egal',
  p_parts jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_household_id text;
  v_ardoise_id text;
  v_out jsonb;
begin
  if v_actor is null then
    raise exception 'session requise' using errcode = '28000';
  end if;

  select e.household_id, e.ardoise_id into v_household_id, v_ardoise_id
    from public.expenses e
   where e.id = p_expense_id;
  if v_household_id is null then
    raise exception 'dépense introuvable' using errcode = 'P0002';
  end if;
  perform private.assert_household_member(v_household_id, v_actor);
  perform private.assert_household_writer(v_household_id, v_actor);
  if not private.can_write_ardoise(v_ardoise_id)
     and not private.is_household_admin(v_household_id) then
    raise exception 'inscription à l''ardoise requise' using errcode = '42501';
  end if;

  if p_title is null or char_length(btrim(p_title)) not between 1 and 200 then
    raise exception 'libellé de dépense invalide' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'le montant doit être supérieur à zéro' using errcode = '22023';
  end if;
  if p_split_type not in ('egal', 'personnalise') then
    raise exception 'type de partage invalide' using errcode = '22023';
  end if;
  if p_paid_by is not null and p_paid_by_guest is not null then
    raise exception 'un seul payeur par dépense' using errcode = '22023';
  end if;

  update public.expenses
     set title = btrim(p_title),
         amount = round(p_amount, 2),
         paid_by = p_paid_by,
         paid_by_guest = p_paid_by_guest,
         expense_date = coalesce(p_expense_date, expense_date),
         split_type = p_split_type
   where id = p_expense_id;

  delete from public.expense_participants where expense_id = p_expense_id;

  perform private.insert_expense_parts(p_expense_id, v_household_id, round(p_amount, 2), p_parts);

  select to_jsonb(e) into v_out from public.expenses e where e.id = p_expense_id;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privilèges : fonctions serveur au seul `service_role`, RPC d'écriture au
-- seul `authenticated` (comme 0035/0037, signatures mises à jour).
-- ---------------------------------------------------------------------------
revoke all on function private.ardoise_balances(text) from public, anon, authenticated;
revoke all on function private.simplify_ardoise_debts(text) from public, anon, authenticated;
grant execute on function private.ardoise_balances(text) to service_role;
grant execute on function private.simplify_ardoise_debts(text) to service_role;

revoke all on function public.ardoise_settlement(uuid, text) from public, anon, authenticated;
revoke all on function public.create_ardoise(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.create_ardoise_invite(uuid, text, text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.revoke_ardoise_invite(uuid, text) from public, anon, authenticated;
revoke all on function public.ardoise_invite_summary(uuid, text) from public, anon, authenticated;
revoke all on function public.redeem_ardoise_invite(text, uuid, text) from public, anon, authenticated;
revoke all on function public.verify_ardoise_ticket(text) from public, anon, authenticated;
grant execute on function public.ardoise_settlement(uuid, text) to service_role;
grant execute on function public.create_ardoise(uuid, text, text, text, text, text) to service_role;
grant execute on function public.create_ardoise_invite(uuid, text, text, timestamptz, integer) to service_role;
grant execute on function public.revoke_ardoise_invite(uuid, text) to service_role;
grant execute on function public.ardoise_invite_summary(uuid, text) to service_role;
grant execute on function public.redeem_ardoise_invite(text, uuid, text) to service_role;
grant execute on function public.verify_ardoise_ticket(text) to service_role;

revoke all on function public.create_expense(text, text, text, numeric, text, text, date, text, jsonb) from public, anon;
revoke all on function public.update_expense(text, text, numeric, text, text, date, text, jsonb) from public, anon;
grant execute on function public.create_expense(text, text, text, numeric, text, text, date, text, jsonb) to authenticated;
grant execute on function public.update_expense(text, text, numeric, text, text, date, text, jsonb) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.create_expense(text, text, text, numeric, text, text, date, text, jsonb)', 'EXECUTE') then
    raise exception 'anon ne doit pas pouvoir créer une dépense par RPC';
  end if;
  if not has_function_privilege('authenticated', 'public.create_expense(text, text, text, numeric, text, text, date, text, jsonb)', 'EXECUTE') then
    raise exception 'authenticated doit pouvoir créer une dépense par RPC';
  end if;
  if has_function_privilege('authenticated', 'public.ardoise_settlement(uuid, text)', 'EXECUTE') then
    raise exception 'authenticated ne doit pas pouvoir appeler le settlement serveur';
  end if;
  if has_function_privilege('authenticated', 'public.redeem_ardoise_invite(text, uuid, text)', 'EXECUTE') then
    raise exception 'authenticated ne doit pas pouvoir échanger un code ardoise';
  end if;
end;
$$;

commit;
