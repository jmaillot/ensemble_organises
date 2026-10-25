-- 0147_child_push_adults.sql
-- Les notifications push destinées à un enfant géré partent aux adultes du
-- foyer (phase 25, plan 25-04, décision D-23).
--
-- POURQUOI UNE NOUVELLE MIGRATION
--   0019, 0022 et 0023 sont appliquées. Aucune migration appliquée n'est
--   réécrite : les définitions effectives de `push_reminder_notifications`
--   (0023) et `push_birthday_notifications` (0019) sont recopiées-modifiées
--   ici sous le même contrat — signatures identiques, les jobs
--   `eo-push-dispatch` et `eo-birthday-alerts` appellent par leur nom et
--   continuent de fonctionner sans redéploiement.
--
-- LE DÉFAUT AVANT 0147
--   * Anniversaire : quand `linked_member_id` désigne un enfant géré, la
--     jointure `m.id = a.linked_member_id and m.user_id is not null` ne rend
--     AUCUNE ligne — un enfant n'a pas de compte (invariant 0145). L'alerte
--     du jour tombait à l'eau, sans erreur : un succès muet (§2.7 F).
--   * Tâche : attribuée à un enfant seul, la fenêtre latérale (assignataire
--     doté d'un compte) est vide et le `coalesce` bascule sur le créateur.
--     Un seul adulte est prévenu, alors que D-08 fait de tout adulte du foyer
--     le gardien des espaces de l'enfant.
--
-- LE CHOIX D-23 : REDIRECTION VERS LES ADULTES
--   Quand la personne visée est un enfant géré — `private.is_managed_child`
--   (0146) : role 'enfant', sans compte, non archivé — les destinataires
--   deviennent les ADULTES du foyer : role dans ('admin','membre'), dotés
--   d'un compte (`user_id is not null`), non archivés. La condition globale
--   `m.user_id is not null` est conservée partout : un enfant géré n'est
--   JAMAIS destinataire, dans aucune branche.
--
--   * rappels_taches regarde le PREMIER assignataire, enfant compris
--     (`attributed`, sans filtre de compte) ; sinon comportement 0019
--     inchangé — premier assignataire doté d'un compte, à défaut le créateur ;
--   * rappels_evenements et rappels_routines regardent le créateur ;
--   * push_birthday_notifications regarde `linked_member_id`.
--
--   Un enfant ARCHIVÉ (deleted_at posé) ne matche plus `is_managed_child`
--   (0146) : il sort de la redirection, rien de nouveau ne le vise — pour
--   l'anniversaire lié, plus aucune ligne ne satisfait la jointure et la
--   notification n'est simplement pas produite.
--
-- AUCUN NOM NON QUALIFIÉ : le `search_path` est vide et il doit le rester.
-- La projection finale qualifie les huit colonnes (ce sont des VARIABLES
-- plpgsql — défaut corrigé par 0023, le rappel vaut ici aussi).

begin;

-- ---------------------------------------------------------------------------
-- Rappels de tâche, d'événement et de routine — définition effective 0023
-- recopiée-modifiée (signature et contrat 0019 inchangés).
-- ---------------------------------------------------------------------------
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
  -- `bounds` et non `window` : `window` est un MOT RÉSERVÉ de PostgreSQL.
  -- Les trois requêtes s'appellent `rappels_*` : un CTE masque la table du
  -- même nom, et `join tasks t` à l'intérieur du CTE `tasks` aurait joint le
  -- CTE à lui-même. Toutes les tables sont qualifiées.
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
    -- D-23 : le premier assignataire, SANS filtre de compte — c'est lui qui
    -- décide si la tâche est « attribuée à un enfant géré ».
    left join lateral (
      select ta.member_id
        from public.task_assignees ta
        join public.household_members assignee on assignee.id = ta.member_id
       where ta.task_id = t.id
       order by ta.member_id
       limit 1
    ) attributed on true
    -- `lateral … on true` : zéro ligne si la tâche n'a aucun assignataire
    -- doté d'un compte, et le `coalesce` bascule alors sur le créateur
    -- (comportement 0019 inchangé).
    left join lateral (
      select ta.member_id
        from public.task_assignees ta
        join public.household_members assignee on assignee.id = ta.member_id
       where ta.task_id = t.id
         and assignee.user_id is not null
       order by ta.member_id
       limit 1
    ) assigned on true
    join public.household_members m on m.household_id = t.household_id
      and m.user_id is not null
      and case
            -- D-23 : tâche attribuée à un enfant géré → tous les adultes du
            -- foyer, jamais l'enfant (sans compte) ni le seul créateur.
            when private.is_managed_child(attributed.member_id) is true
              then m.role in ('admin', 'membre') and m.deleted_at is null
            else m.id = coalesce(assigned.member_id, t.created_by)
          end
    where tr.remind_at <@ w.slot
      and t.status <> 'fait'
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
      and case
            -- D-23 : créateur enfant géré (défensif — la saisie passe par une
            -- session adulte) → les adultes du foyer reçoivent à sa place.
            when private.is_managed_child(e.created_by) is true
              then m.role in ('admin', 'membre') and m.deleted_at is null
            else e.created_by is null or m.id = e.created_by
          end
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
      and case
            -- D-23 : symétrique de l'événement.
            when private.is_managed_child(r.created_by) is true
              then m.role in ('admin', 'membre') and m.deleted_at is null
            else r.created_by is null or m.id = r.created_by
          end
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
  'Rappels dus dans la fenêtre, un couple (destinataire, rappel) par ligne. D-23 : si la cible est un enfant géré, les adultes du foyer reçoivent à sa place.';

-- ---------------------------------------------------------------------------
-- Anniversaires du jour — définition effective 0019 recopiée-modifiée.
-- ---------------------------------------------------------------------------
create or replace function private.push_birthday_notifications(p_now timestamptz)
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
declare
  v_today date := (coalesce(p_now, now()) at time zone 'Europe/Paris')::date;
begin
  return query
  select
    m.user_id,
    a.birthday_id,
    a.household_id,
    'Anniversaire',
    case
      when a.member_name is null then a.name
      else a.name || ' fête son anniversaire'
    end,
    '/anniversaires',
    'anniversaire-' || a.birthday_id,
    -- Aucun interrupteur dédié : la date du jour n'est pas un rappel, et
    -- couper les notifications doit aussi couper l'annonce du jour.
    null::text
  from private.household_birthday_alerts(null, v_today) a
  join public.household_members m
    on m.household_id = a.household_id
   and m.user_id is not null
   and case
         -- D-23 : l'anniversaire d'un enfant géré est annoncé aux adultes du
         -- foyer — avant 0147, la jointure sur une ligne sans compte ne
         -- rendait rien et l'alerte du jour était perdue sans erreur.
         when private.is_managed_child(a.linked_member_id) is true
           then m.role in ('admin', 'membre') and m.deleted_at is null
         -- Un enfant archivé ne matche plus is_managed_child (0146) : la
         -- jointure ne rend plus rien, la notification n'est pas produite.
         else (a.linked_member_id is not null and m.id = a.linked_member_id)
              or a.linked_member_id is null
       end
  where a.days_until = 0;
end;
$$;

comment on function private.push_birthday_notifications(timestamptz) is
  'Anniversaires du jour, destinataires résolus, tous foyers confondus. D-23 : l''anniversaire d''un enfant géré est annoncé aux adultes du foyer.';

-- ---------------------------------------------------------------------------
-- Privilèges — identiques à 0019/0023 ; `create or replace` recrée les ACL,
-- les re-grants idempotents sont donc obligatoires.
-- ---------------------------------------------------------------------------
revoke all on function private.push_reminder_notifications(timestamptz) from public, anon, authenticated;
grant execute on function private.push_reminder_notifications(timestamptz) to service_role;
revoke all on function private.push_birthday_notifications(timestamptz) from public, anon, authenticated;
grant execute on function private.push_birthday_notifications(timestamptz) to service_role;

commit;
