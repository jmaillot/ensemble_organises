-- 0061_ardoise_default_members.sql
-- L'ardoise par défaut auto-créée par le trigger doit contenir les écrivains
-- du foyer, sinon le payeur (membre légitime) est refusé par
-- `validate_expense_payer` et les clients historiques restent cassés.

begin;

create or replace function private.align_ardoise_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id text;
begin
  if new.ardoise_id is null then
    select a.id into new.ardoise_id
      from public.ardoises a
     where a.household_id = new.household_id
       and a.name = 'Ardoise du foyer'
     limit 1;
    if new.ardoise_id is null then
      insert into public.ardoises (household_id, name)
      values (new.household_id, 'Ardoise du foyer')
      returning id into new.ardoise_id;
      -- Écrivains initiaux, comme le seed 0055 (enfants exclus).
      insert into public.ardoise_members (ardoise_id, member_id)
      select new.ardoise_id, m.id
        from public.household_members m
       where m.household_id = new.household_id
         and m.role in ('admin', 'membre');
    end if;
  end if;

  select a.household_id into v_household_id
    from public.ardoises a
   where a.id = new.ardoise_id;
  if v_household_id is null then
    raise exception 'ardoise introuvable : %', new.ardoise_id using errcode = '23503';
  end if;
  if new.household_id is not null and new.household_id <> v_household_id then
    raise exception 'ardoise d''un autre foyer' using errcode = '23514';
  end if;
  new.household_id := v_household_id;
  return new;
end;
$$;

commit;
