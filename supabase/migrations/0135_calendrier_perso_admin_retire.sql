-- 0135_calendrier_perso_admin_retire.sql
-- Aligne le calendrier sur la règle des dossiers (`0134`) : un calendrier
-- `perso` n'appartient qu'à son propriétaire, et l'administrateur n'y touche
-- plus.
--
-- `0084` avait retiré l'admin de la lecture et de l'écriture des calendriers
-- perso, mais deux portes restaient ouvertes, et le fichier le disait :
--   * `events_delete_admin` (`0047:296-310`) : `is_household_admin` suffisait
--     pour supprimer n'importe quel événement, y compris celui d'un perso
--     invisible — une modération qu'on ne peut pas exercer à l'écran, mais
--     qu'un appel direct pouvait encore déclencher ;
--   * `private.can_admin_event` (`0047:345-367`), qui porte
--     `event_reminders_delete` (`0007:355`), avait exactement la même forme :
--     les rappels d'un événement perso restaient supprimables par l'admin.
--
-- Les deux passent à « admin du Commun seulement, propriétaire pour le perso ».
-- Le Commun garde sa modération : c'est un calendrier partagé, pas un espace
-- privé. `calendar_id` est NOT NULL depuis `0047:121`, donc aucun événement
-- orphelin n'est à traiter.
--
-- `private.can_admin_event` conserve l'`EXECUTE` par défaut de PUBLIC (aucun
-- `revoke` ici) : une politique RLS s'évalue avec les privilèges de l'appelant,
-- et la révoquer à `authenticated` rendrait `event_reminders_delete` inerte.
--
-- Forward-only : `drop policy if exists` + `create policy`,
-- `create or replace` ; aucun DML.

begin;

-- ---------------------------------------------------------------------------
-- Événements : suppression par l'admin d'un Commun, par le propriétaire d'un
-- perso. Plus de branche admin générique.
-- ---------------------------------------------------------------------------
drop policy if exists events_delete_admin on public.events;
create policy events_delete_admin on public.events
  for delete using (
    private.can_write_household(household_id)
    and exists (
      select 1
        from public.event_calendars c
       where c.id = public.events.calendar_id
         and (
           (c.visibility = 'commun' and private.is_household_admin(household_id))
           or (
             c.visibility = 'perso'
             and c.owner_member_id = private.current_member_id(household_id)
           )
         )
    )
  );

-- ---------------------------------------------------------------------------
-- Rappels : même périmètre que leur événement (0007:355 s'appuie dessus).
-- ---------------------------------------------------------------------------
create or replace function private.can_admin_event(p_event_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.events e
      join public.event_calendars c on c.id = e.calendar_id
     where e.id = p_event_id
       and private.can_write_household(e.household_id)
       and (
         (c.visibility = 'commun' and private.is_household_admin(e.household_id))
         or (
           c.visibility = 'perso'
           and c.owner_member_id = private.current_member_id(e.household_id)
         )
       )
  );
$$;

comment on function private.can_admin_event(text) is
  'Suppression d''un événement ou de ses rappels : admin du Commun, propriétaire du perso (0135).';

commit;
