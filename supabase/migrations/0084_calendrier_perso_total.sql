-- 0084_calendrier_perso_total.sql
-- Phase 01 calendrier, D-01 (Option B tranchee en gate 01-01) : le calendrier
-- Perso devient invisible aux autres membres, meme admin, en lecture comme en
-- ecriture de calendrier.
--
-- Portee exacte :
-- - `private.is_calendar_visible` : branche `or is_household_admin` retiree.
--   Les `events` du Perso deviennent invisibles via PostgREST puisque
--   `events_select_household` delegue a ce helper (0047 inchange sur ce point).
-- - Politique `event_calendars_select` : branche admin retiree.
-- - Politique `event_calendars_update` : branche `or is_household_admin`
--   generique retiree. Perso = owner seul, Commun = admin. Le `with check`
--   est reconduit a l'identique (defense RLS + contrainte, cf. 0047).
-- - `events_delete_admin` (0047 l.297-310) est VOLONTAIREMENT conserve :
--   l'admin garde la suppression des events Perso comme filet de moderation
--   (ecart documente au registre T-01-01, gate 01-01 Option B). Idem pour
--   `event_calendars_delete` (admin, sauf Commun) et `can_admin_event`.
--
-- Ne reecrit aucune migration appliquee : forward-only (`create or replace`,
-- `drop policy if exists` + `create policy`).
--
-- Ordre : DDL/policy d'abord, aucun DML dans ce fichier (controle statique 8
-- sans objet ici, mais la convention ALTER-avant-DML reste la regle).

begin;

-- ---------------------------------------------------------------------------
-- Helper : membre + (commun OU owner). Plus aucune branche admin.
-- ---------------------------------------------------------------------------
create or replace function private.is_calendar_visible(p_calendar_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.event_calendars c
     where c.id = p_calendar_id
       and private.is_household_member(c.household_id)
       and (
         c.visibility = 'commun'
         or c.owner_member_id = private.current_member_id(c.household_id)
       )
  );
$$;

-- ---------------------------------------------------------------------------
-- event_calendars_select : commun partage + perso owner-seul.
-- ---------------------------------------------------------------------------
drop policy if exists event_calendars_select on public.event_calendars;
create policy event_calendars_select on public.event_calendars
  for select using (
    private.is_household_member(household_id)
    and (
      visibility = 'commun'
      or owner_member_id = private.current_member_id(household_id)
    )
  );

-- ---------------------------------------------------------------------------
-- event_calendars_update : Perso owner-seul, Commun admin. La branche
-- `or private.is_household_admin(household_id)` generique de 0047 permettait
-- a l'admin de renommer/deplacer le Perso d'autrui : retiree.
-- ---------------------------------------------------------------------------
drop policy if exists event_calendars_update on public.event_calendars;
create policy event_calendars_update on public.event_calendars
  for update using (
    private.can_write_household(household_id)
    and (
      (visibility = 'commun' and private.is_household_admin(household_id))
      or (
        visibility = 'perso'
        and owner_member_id = private.current_member_id(household_id)
      )
    )
  )
  with check (
    private.can_write_household(household_id)
    and (
      (visibility = 'commun' and owner_member_id is null)
      or (
        visibility = 'perso'
        and private.member_in_household(owner_member_id, household_id)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Commentaires : l'admin ne lit plus le Perso (0047 disait le contraire).
-- La suppression admin reste un filet de moderation documente (voir entete).
-- ---------------------------------------------------------------------------
comment on table public.event_calendars is
  'Calendriers du foyer : Commun partage + Perso visible et modifiable par son owner seul, invisible aux autres membres meme admin. Filet de moderation : la suppression admin reste possible (politiques delete inchangees).';

-- `create or replace` conserve les grants 0047 sur is_calendar_visible
-- (authenticated + service_role) : rien a re-accorder ici.

commit;
