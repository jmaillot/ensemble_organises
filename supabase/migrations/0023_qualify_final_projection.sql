-- 0023_qualify_final_projection.sql
-- La projection finale de `private.push_reminder_notifications()` était
-- ambiguë.
--
-- POURQUOI UNE NOUVELLE MIGRATION
--   0022 est appliquée. En corrigeant les noms non qualifiés, elle a révélé le
--   défaut suivant de la même fonction — qui était déjà dans 0019, et que rien
--   n'avait encore atteint.
--
-- LE DÉFAUT : LES COLONNES DE SORTIE SONT DES VARIABLES
--   `returns table (user_id uuid, …)` ne décrit pas seulement le résultat : en
--   PL/pgSQL, ces colonnes sont des VARIABLES. Un `select user_id, …` non
--   qualifié est donc lu comme une référence à la variable `user_id`, et
--   PostgreSQL répond :
--
--     column reference "user_id" is ambiguous
--     DETAIL: It could refer to either a PL/pgSQL variable or a table column.
--
--   Les deux issues sont mauvaises, et la seconde est pire que la première :
--     * plusieurs tables Fournissent la colonne — c'est le cas ici, puisque
--       l'`union all` porte sur trois CTE : PostgreSQL REFUSE ;
--     * une seule table la fournit — plpgsql remplace la colonne par la
--       variable, sans le moindre avertissement. Dans une fonction renvoyant
--       un ensemble, ces variables valent NULL : la requête ne lève aucune
--       erreur et renvoie des lignes vides. Un défaut silencieux, de ceux que
--       seule une assertion sur le contenu des lignes peut voir.
--
--   C'est pourquoi la correction qualifie TOUTES les colonnes, y compris celles
--   qui ne poseaient pas encore de problème : les huit noms de la projection
--   finale sont exactement les huit paramètres de sortie.
--
-- CHOIX : EXPLICITE PLUTÔT QUE `r.*`
--   `select r.* from rappels_taches r` serait plus court, et l'ordre des
--   colonnes est garanti par la clause `returns table`. Mais si la liste de
--   sortie d'un CTE change un jour, `r.*` suivrait sans bruit. Nommer les huit
--   colonnes fait échouer la migration à la place : un rappel sans destinataire
--   ou sans titre est pire qu'une migration refusée.
--
-- CORRÉLÉ : `private.push_birthday_notifications()` déclare les mêmes colonnes et
--   les qualifie déjà (`m.user_id`, `a.birthday_id`) — c'est pourquoi 0006 passe
--   et 0007 non, pour deux fonctions écrites le même jour.

begin;

create or replace function private.push_reminder_notifications(p_now timestamptz)
returns table (
  user_id uuid,
  reminder_id text,
  household_id text,
  title text,
  body text,
  url text,
  tag text,
  preference text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  -- `bounds` et non `window` : `window` est un MOT RÉSERVÉ de PostgreSQL (la
  -- clause des fonctions fenêtrées), et `with window as (…)` est refusé à
  -- l'analyse. Le premier jet employait ce nom.
  --
  -- Les trois requêtes s'appellent `rappels_*` et non `tasks`/`events`/
  -- `routines` : un CTE masque la table du même nom, et `join tasks t` à
  -- l'intérieur du CTE `tasks` aurait joint le CTE à lui-même.
  --
  -- Toutes les tables sont qualifiées : le `search_path` est vide, et il doit
  -- le rester. La projection finale l'est aussi, pour une autre raison — voir
  -- l'en-tête de cette migration.
  with bounds as (
    select private.push_reminder_window(p_now) as slot
  ), rappels_taches as (
    select
      m.user_id,
      tr.id as reminder_id,
      t.household_id,
      'Tâche : ' || t.name as title,
      case
        when t.due_date is not null and nullif(btrim(coalesce(t.description, '')), '') is not null
          then 'Échéance le ' || to_char(t.due_date, 'DD/MM') || ' — ' || btrim(t.description)
        when t.due_date is not null
          then 'Échéance le ' || to_char(t.due_date, 'DD/MM')
        else btrim(coalesce(t.description, 'Sans date d''échéance.'))
      end as body,
      '/taches'::text as url,
      'tache-' || t.id as tag,
      'task'::text as preference
    from public.task_reminders tr
    join public.tasks t on t.id = tr.task_id
    cross join bounds w
    -- `lateral … on true` : zéro ligne si la tâche n'a aucun assignataire
    -- doté d'un compte, et le `coalesce` bascule alors sur le créateur.
    left join lateral (
      select ta.member_id
        from public.task_assignees ta
        join public.household_members assignee on assignee.id = ta.member_id
       where ta.task_id = t.id
         and assignee.user_id is not null
      order by ta.member_id
      limit 1
    ) assigned on true
    join public.household_members m on m.id = coalesce(assigned.member_id, t.created_by)
    where tr.remind_at <@ w.slot
      and t.status <> 'fait'
      and m.user_id is not null
  ), rappels_evenements as (
    select
      m.user_id,
      er.id as reminder_id,
      e.household_id,
      'Événement : ' || e.title as title,
      (case
         when e.all_day then 'Toute la journée'
         else to_char(e.start_at at time zone 'Europe/Paris', 'DD/MM à HH24:MI')
       end)
      || case
           when nullif(btrim(coalesce(e.location, '')), '') is null then ''
           else ' — ' || btrim(e.location)
         end as body,
      '/calendrier'::text as url,
      'evenement-' || e.id as tag,
      'event'::text as preference
    from public.event_reminders er
    join public.events e on e.id = er.event_id
    cross join bounds w
    join public.household_members m on m.household_id = e.household_id and m.user_id is not null
    where er.remind_at <@ w.slot
      -- Un événement déjà commencé n'a plus rien à annoncer.
      and e.start_at > coalesce(p_now, now())
      and (e.created_by is null or m.id = e.created_by)
  ), rappels_routines as (
    select
      m.user_id,
      rr.id as reminder_id,
      r.household_id,
      'Routine : ' || r.name as title,
      nullif(btrim(coalesce(r.description, '')), '') as body,
      '/routines'::text as url,
      'routine-' || r.id as tag,
      'routine'::text as preference
    from public.routine_reminders rr
    join public.routines r on r.id = rr.routine_id
    cross join bounds w
    join public.household_members m on m.household_id = r.household_id and m.user_id is not null
    where rr.remind_at <@ w.slot
      and (r.created_by is null or m.id = r.created_by)
  )
  select
    rappels_taches.user_id,
    rappels_taches.reminder_id,
    rappels_taches.household_id,
    rappels_taches.title,
    rappels_taches.body,
    rappels_taches.url,
    rappels_taches.tag,
    rappels_taches.preference
  from rappels_taches
  union all
  select
    rappels_evenements.user_id,
    rappels_evenements.reminder_id,
    rappels_evenements.household_id,
    rappels_evenements.title,
    rappels_evenements.body,
    rappels_evenements.url,
    rappels_evenements.tag,
    rappels_evenements.preference
  from rappels_evenements
  union all
  select
    rappels_routines.user_id,
    rappels_routines.reminder_id,
    rappels_routines.household_id,
    rappels_routines.title,
    rappels_routines.body,
    rappels_routines.url,
    rappels_routines.tag,
    rappels_routines.preference
  from rappels_routines;
end;
$$;

comment on function private.push_reminder_notifications(timestamptz) is
  'Rappels dus dans la fenêtre, un couple (destinataire, rappel) par ligne.';

-- ---------------------------------------------------------------------------
-- Privilèges — inchangés depuis 0019.
-- ---------------------------------------------------------------------------
revoke all on function private.push_reminder_notifications(timestamptz) from public, anon, authenticated;
grant execute on function private.push_reminder_notifications(timestamptz) to service_role;

commit;
