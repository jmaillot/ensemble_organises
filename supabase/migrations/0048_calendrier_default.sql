-- 0048_calendrier_default.sql
-- Compatibilité : les clients/tests historiques insèrent des events sans
-- calendar_id. Assigner automatiquement le Commun du foyer (créé à la volée
-- si absent) au lieu de rejeter en NOT NULL.

begin;

create or replace function private.assign_default_calendar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_calendar_id text;
begin
  if new.calendar_id is not null then return new; end if;
  select c.id into v_calendar_id
    from public.event_calendars c
   where c.household_id = new.household_id
     and c.name = 'Commun'
     and c.visibility = 'commun'
   limit 1;
  if v_calendar_id is null then
    insert into public.event_calendars (household_id, name, visibility, owner_member_id)
    values (new.household_id, 'Commun', 'commun', null)
    returning id into v_calendar_id;
  end if;
  new.calendar_id := v_calendar_id;
  return new;
end;
$$;

drop trigger if exists assign_default_calendar on public.events;
create trigger assign_default_calendar
  before insert on public.events
  for each row execute function private.assign_default_calendar();

revoke all on function private.assign_default_calendar() from public, anon, authenticated;

commit;
