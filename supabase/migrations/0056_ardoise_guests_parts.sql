-- 0056_ardoise_guests_parts.sql
-- Parts et payeurs invités : `guest_id` sur les parts, `paid_by_guest` sur la
-- dépense (exclusif avec `paid_by`, désormais nullable). Le périmètre est
-- l'ardoise : parts et payeur doivent appartenir à l'ardoise de la dépense.

begin;

alter table public.expense_participants
  add column guest_id text references public.ardoise_guests (id) on delete cascade;

alter table public.expenses
  alter column paid_by drop not null;
alter table public.expenses
  add column paid_by_guest text references public.ardoise_guests (id) on delete restrict;

alter table public.expense_participants drop constraint if exists expense_participants_kind_check;
alter table public.expense_participants add constraint expense_participants_kind_check check (
  (participant_type = 'membre' and member_id is not null and guest_id is null)
  or (participant_type = 'guest' and member_id is null and guest_id is not null)
);

alter table public.expenses add constraint expenses_payer_check check (
  (paid_by is not null and paid_by_guest is null)
  or (paid_by is null and paid_by_guest is not null)
);

-- ---------------------------------------------------------------------------
-- Parts : membre du foyer ET de l'ardoise, ou invité de l'ardoise.
-- ---------------------------------------------------------------------------
create or replace function private.validate_expense_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id text;
  v_ardoise_id text;
begin
  select e.household_id, e.ardoise_id into v_household_id, v_ardoise_id
    from public.expenses e
   where e.id = new.expense_id;

  if v_household_id is null then
    raise exception 'dépense introuvable : %', new.expense_id using errcode = '23503';
  end if;

  if new.participant_type = 'membre' then
    if new.member_id is null or new.guest_id is not null
       or not private.member_in_household(new.member_id, v_household_id)
       or not exists (
         select 1 from public.ardoise_members am
          where am.ardoise_id = v_ardoise_id and am.member_id = new.member_id
       ) then
      raise exception 'le membre % n''appartient pas à l''ardoise de la dépense', new.member_id
        using errcode = '23514';
    end if;
  elsif new.participant_type = 'guest' then
    if new.guest_id is null or new.member_id is not null
       or not exists (
         select 1 from public.ardoise_guests g
          where g.id = new.guest_id and g.ardoise_id = v_ardoise_id
       ) then
      raise exception 'l''invité n''appartient pas à l''ardoise de la dépense'
        using errcode = '23514';
    end if;
  else
    raise exception 'type de participant invalide' using errcode = '22023';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Payeur : membre du foyer ET de l'ardoise, ou invité de l'ardoise.
-- (`validate_member_refs` sur `paid_by` reste en place : double contrôle
-- volontaire, même foyer exigé des deux côtés.)
-- ---------------------------------------------------------------------------
create or replace function private.validate_expense_payer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ardoise_id text;
begin
  select a.id into v_ardoise_id
    from public.ardoises a
   where a.id = new.ardoise_id;

  if v_ardoise_id is null then
    raise exception 'ardoise introuvable : %', new.ardoise_id using errcode = '23503';
  end if;

  if new.paid_by is not null then
    if not private.member_in_household(new.paid_by, new.household_id)
       or not exists (
         select 1 from public.ardoise_members am
          where am.ardoise_id = new.ardoise_id and am.member_id = new.paid_by
       ) then
      raise exception 'le payeur n''appartient pas à l''ardoise de la dépense'
        using errcode = '23514';
    end if;
  elsif new.paid_by_guest is not null then
    if not exists (
      select 1 from public.ardoise_guests g
       where g.id = new.paid_by_guest and g.ardoise_id = new.ardoise_id
    ) then
      raise exception 'l''invité payeur n''appartient pas à l''ardoise de la dépense'
        using errcode = '23514';
    end if;
  else
    raise exception 'payeur obligatoire (membre ou invité)' using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_expense_payer on public.expenses;
create trigger validate_expense_payer
  before insert or update of ardoise_id, paid_by, paid_by_guest, household_id on public.expenses
  for each row execute function private.validate_expense_payer();

revoke all on function private.validate_expense_payer() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC d'insertion des parts : branche `guest` + périmètre ardoise.
-- Même signature, mêmes messages au mot près quand le cas est identique.
-- ---------------------------------------------------------------------------
create or replace function private.insert_expense_parts(
  p_expense_id text,
  p_household_id text,
  p_amount numeric,
  p_parts jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r jsonb;
  v_type text;
  v_member text;
  v_guest text;
  v_share numeric;
  v_total numeric := 0;
  v_ardoise_id text;
begin
  if p_parts is null or jsonb_typeof(p_parts) != 'array' or jsonb_array_length(p_parts) = 0 then
    raise exception 'au moins une personne doit partager la dépense' using errcode = '22023';
  end if;

  select e.ardoise_id into v_ardoise_id
    from public.expenses e
   where e.id = p_expense_id;
  if v_ardoise_id is null then
    raise exception 'dépense introuvable : %', p_expense_id using errcode = '23503';
  end if;

  for r in select * from jsonb_array_elements(p_parts) loop
    v_type := r ->> 'participant_type';
    v_member := nullif(r ->> 'member_id', '');
    v_guest := nullif(r ->> 'guest_id', '');
    if coalesce(r ->> 'share_amount', '') !~ '^[0-9]+(\.[0-9]+)?$' then
      raise exception 'part de dépense invalide' using errcode = '22023';
    end if;
    v_share := (r ->> 'share_amount')::numeric;

    if v_type = 'membre' then
      if v_member is null or v_guest is not null then
        raise exception 'part membre invalide' using errcode = '22023';
      end if;
      if not private.member_in_household(v_member, p_household_id)
         or not exists (
           select 1 from public.ardoise_members am
            where am.ardoise_id = v_ardoise_id and am.member_id = v_member
         ) then
        raise exception 'le membre % n''appartient pas à l''ardoise de la dépense', v_member
          using errcode = '23514';
      end if;
    elsif v_type = 'guest' then
      if v_guest is null or v_member is not null then
        raise exception 'part invité invalide' using errcode = '22023';
      end if;
      if not exists (
        select 1 from public.ardoise_guests g
         where g.id = v_guest and g.ardoise_id = v_ardoise_id
      ) then
        raise exception 'l''invité n''appartient pas à l''ardoise de la dépense'
          using errcode = '23514';
      end if;
    else
      raise exception 'type de participant invalide' using errcode = '22023';
    end if;

    v_total := v_total + v_share;

    insert into public.expense_participants (
      id, expense_id, participant_type, member_id, guest_id, share_amount
    ) values (
      private.new_id('expense-participant'), p_expense_id, v_type, v_member, v_guest, v_share
    );
  end loop;

  if abs(v_total - p_amount) > 0.01 then
    raise exception 'la somme des parts (%) ne correspond pas au montant de la dépense (%)', v_total, p_amount
      using errcode = '23514';
  end if;
end;
$$;

commit;
