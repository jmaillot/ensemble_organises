-- 0085_calendrier_perso_auto.sql
-- Phase 01 calendrier, D-02/D-05 : un calendrier Perso par membre adulte,
-- cree avec le foyer (trigger) + backfill de l'existant. Pas de Perso pour
-- les enfants (`enfant` : lecture seule, leurs evenements vivent dans le
-- Commun per D-05).
--
-- Piege unicite (0047 l.43) : `event_calendars_name_unique (household_id,
-- name)` interdisait deux Perso nommes `Perso` dans le meme foyer. La
-- contrainte est donc remplacee, vers l'avant, par deux uniques partielles :
-- - un seul Commun par nom et par foyer (le seed `Commun` reste protegee) ;
-- - un seul Perso par owner et par foyer (le nom `Perso` devient partageable).
--
-- Ordre dans ce fichier : ALTER/DDL d'abord, DML (backfill) ensuite. C'est
-- l'ordre sain du controle statique 8 (un ALTER avant tout DML ne laisse
-- aucun evenement differe en attente ; de toute facon `event_calendars` ne
-- porte aucun trigger differe, contrairement a `expenses`).
--
-- Discipline trigger (AGENTS.md 2.7A, motif 0048) : SECURITY DEFINER,
-- `search_path = ''`, tables `public.*` qualifiees, REVOKE final.
-- Ne touche ni a 0047, ni a 0048, ni a 0054 : forward-only.

begin;

-- ---------------------------------------------------------------------------
-- 1. Unicite : nom partageable pour le Perso, un Perso par owner.
-- ---------------------------------------------------------------------------
alter table public.event_calendars
  drop constraint event_calendars_name_unique;

create unique index event_calendars_commun_name_unique
  on public.event_calendars (household_id, name)
  where visibility = 'commun';

create unique index event_calendars_perso_owner_unique
  on public.event_calendars (household_id, owner_member_id)
  where visibility = 'perso';

-- ---------------------------------------------------------------------------
-- 2. Trigger : tout nouvel adulte recoit son Perso, jamais un enfant.
-- ---------------------------------------------------------------------------
create or replace function private.create_perso_calendar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role in ('admin', 'membre') then
    insert into public.event_calendars (household_id, name, visibility, owner_member_id)
    values (new.household_id, 'Perso', 'perso', new.id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists create_perso_calendar on public.household_members;
create trigger create_perso_calendar
  after insert on public.household_members
  for each row execute function private.create_perso_calendar();

revoke all on function private.create_perso_calendar() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Backfill : un Perso aux adultes existants qui n'en ont pas.
--    Le trigger couvre les futurs membres (dont `create_household`, 0054).
-- ---------------------------------------------------------------------------
insert into public.event_calendars (household_id, name, visibility, owner_member_id)
select m.household_id, 'Perso', 'perso', m.id
  from public.household_members m
 where m.role in ('admin', 'membre')
   and not exists (
     select 1
       from public.event_calendars c
      where c.household_id = m.household_id
        and c.visibility = 'perso'
        and c.owner_member_id = m.id
   );

commit;
