-- 0164_gdpr_push_export.sql
-- Notification push d'achèvement de l'export RGPD (phase 26, plan 26-06,
-- exigences RGEX-02, décisions D-01/D-02/D-04).
--
-- POURQUOI UNE NOUVELLE MIGRATION
--   0019, 0042 et 0147 sont appliquées. Aucune migration appliquée n'est
--   réécrite : les définitions effectives de `private.push_reminder_notifications`
--   (0147), `public.due_push_notifications` et `public.consume_push_reminders`
--   (0042) sont recopiées-modifiées ici sous le même contrat — signatures
--   identiques, les jobs `eo-push-dispatch` et le mode `test` de push-notify
--   appellent par leur nom et continuent de fonctionner sans redéploiement
--   SQL (le redéploiement Edge du scope 'export' est le plan 26-06 Task 2).
--
-- LA BOUCLE FERMÉE D-01/D-02
--   À l'achèvement d'un job d'export (succès `pret` comme échec `echec`),
--   le demandeur reçoit une notification push par la chaîne existante :
--
--     gdpr_export_jobs (status terminal, notified_push = false)
--       → private.push_reminder_notifications (branche `exports_dus`)
--       → public.due_push_notifications('export', …)
--       → private.dispatch_export_notifications (job cron `eo-push-exports`)
--       → private.post_push_dispatch('export') → Edge push-notify
--       → distribution réelle
--       → public.consume_push_reminders({kind: 'export', id: job_id})
--         → notified_push = true (dans le sillage de la consommation 0042 :
--           le marquage se fait APRÈS distribution, jamais avant — un échec
--           d'envoi retente au passage suivant, et un envoi distribué ne
--           repart jamais : pas de push en boucle, minute après minute).
--
--   L'échec est notifié comme le succès (D-02) : même chaîne, message
--   distinct, l'écran export reste retentable (l'index partiel D-06 de 0158
--   ne voit que les statuts actifs).
--
-- LA RÈGLE D-04 : RIEN DE TROP DANS LA PUSH
--   Le message traverse un service tiers. Il porte un titre générique
--   (« Votre export est prêt » / « Votre export a échoué… »), un corps
--   générique, et l'URL interne '/parametres' — JAMAIS le lien signé ni
--   `storage_path` (testé par assertion SQL sur les champs retournés, 0164).
--
-- POURQUOI UNE PRÉFÉRENCE `null`
--   Contrairement aux rappels (interrupteurs par type dans `profiles`),
--   l'achèvement d'un export demandé par le membre n'a pas d'interrupteur :
--   il vient de le demander lui-même, il veut la réponse. `preference null`
--   suit le motif des anniversaires (0019) : `coalesce(…, true)` dans
--   `due_push_notifications` laisse passer la ligne.
--
-- AUCUN NOM NON QUALIFIÉ : le `search_path` est vide et il doit le rester.
-- La projection finale qualifie les huit colonnes (ce sont des VARIABLES
-- plpgsql — défaut corrigé par 0023, le rappel vaut ici aussi).

begin;

-- ---------------------------------------------------------------------------
-- Rappels de tâche, d'événement, de routine — définition effective 0147
-- recopiée-modifiée (signature et contrat 0019 inchangés), plus la branche
-- `exports_dus` : les jobs d'export RGPD terminaux non encore notifiés.
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
  -- Les requêtes s'appellent `rappels_*` / `exports_dus` : un CTE masque la
  -- table du même nom, et `join tasks t` à l'intérieur du CTE `tasks`
  -- aurait joint le CTE à lui-même. Toutes les tables sont qualifiées.
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
  ), exports_dus as (
    -- 0164 : achèvement de l'export RGPD. Succès comme échec (D-02) —
    -- le demandeur a déclenché l'export, il attend la réponse. Le tag
    -- `export-<job_id>` porte l'identifiant du job : la consommation
    -- (notified_push) se fera par `consume_push_reminders` APRÈS
    -- distribution. Aucun foyer derrière un export (il porte sur un
    -- utilisateur, tous foyers confondus) : household_id null.
    select
      j.user_id,
      j.id::text as reminder_id,
      null::text as household_id,
      case
        when j.status = 'pret'
          then 'Votre export est prêt'
        else 'Votre export a échoué — réessayez depuis l''écran export'
      end as title,
      case
        when j.status = 'pret'
          then 'Votre archive est prête à être téléchargée depuis les paramètres.'
        else 'L''export n''a pas abouti. Vous pouvez le relancer depuis les paramètres.'
      end as body,
      '/parametres'::text as url,
      'export-' || j.id as tag,
      null::text as preference
    from public.gdpr_export_jobs j
    where j.status in ('pret', 'echec')
      and j.notified_push = false
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
  from rappels_routines
  union all
  select
    exports_dus.user_id,
    exports_dus.reminder_id,
    exports_dus.household_id,
    exports_dus.title,
    exports_dus.body,
    exports_dus.url,
    exports_dus.tag,
    exports_dus.preference
  from exports_dus;
end;
$$;

comment on function private.push_reminder_notifications(timestamptz) is
  'Rappels dus dans la fenêtre, un couple (destinataire, rappel) par ligne. D-23 : si la cible est un enfant géré, les adultes du foyer reçoivent à sa place. 0164 : branche exports_dus — achèvement de l''export RGPD (succès et échec), marqué consommé par notified_push après distribution.';

-- ---------------------------------------------------------------------------
-- Point d'entrée unique — définition effective 0042 recopiée-modifiée
-- (signature et contrat 0019 inchangés), garde `p_scope` étendue à 'export'.
-- ---------------------------------------------------------------------------
create or replace function public.due_push_notifications(
  p_scope text,
  p_now timestamptz default null,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, now());
  v_notifications jsonb;
begin
  if p_scope is null or p_scope not in ('rappels', 'anniversaires', 'messages', 'test', 'export') then
    raise exception 'portée inconnue : %', p_scope using errcode = '22023';
  end if;

  if p_scope = 'test' then
    if p_user_id is null then
      raise exception 'utilisateur obligatoire pour un test' using errcode = '22023';
    end if;
    v_notifications := jsonb_build_array(
      jsonb_build_object(
        'user_id', p_user_id,
        'reminder_id', null,
        'household_id', null,
        'title', 'Notifications activées',
        'body', 'Voici un rappel de test. Les rappels du foyer arriveront ici.',
        'url', '/parametres',
        'tag', 'test-' || left(p_user_id::text, 8),
        'preference', null
      )
    );
  elsif p_scope = 'anniversaires' then
    select coalesce(jsonb_agg(n), '[]'::jsonb) into v_notifications
      from private.push_birthday_notifications(v_now) n;
  elsif p_scope = 'messages' then
    select coalesce(jsonb_agg(n), '[]'::jsonb) into v_notifications
      from private.push_message_notifications(v_now) n;
  elsif p_scope = 'export' then
    -- 0164 : achèvement de l'export RGPD, par la même fonction que les
    -- rappels (elle porte désormais la branche exports_dus).
    select coalesce(jsonb_agg(n), '[]'::jsonb) into v_notifications
      from private.push_reminder_notifications(v_now) n;
  else
    select coalesce(jsonb_agg(n), '[]'::jsonb) into v_notifications
      from private.push_reminder_notifications(v_now) n;
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'user_id', n.user_id,
          'reminder_id', n.reminder_id,
          'household_id', n.household_id,
          'title', n.title,
          'body', n.body,
          'url', n.url,
          'tag', n.tag,
          'subscriptions', coalesce(
            (select jsonb_agg(
              jsonb_build_object(
                'id', s.id,
                'endpoint', s.endpoint,
                'p256dh', s.p256dh,
                'auth_secret', s.auth_secret
              ) order by s.created_at
            )
             from public.push_subscriptions s
             where s.user_id = n.user_id),
            '[]'::jsonb
          )
        ) order by n.title
      )
      from jsonb_to_recordset(v_notifications)
        as n(
          user_id uuid, reminder_id text, household_id text,
          title text, body text, url text, tag text, preference text
        )
      join public.profiles p on p.id = n.user_id
      where coalesce(
        case n.preference
          when 'task' then p.task_reminders_enabled
          when 'event' then p.event_reminders_enabled
          when 'routine' then p.routine_reminders_enabled
          when 'message' then p.message_notifications_enabled
        end,
        true
      )
    ),
    '[]'::jsonb
  );
end;
$$;

comment on function public.due_push_notifications(text, timestamptz, uuid) is
  'Point d''entrée unique des scopes push : rappels, anniversaires, messages, export (0164), test. Chaque scope délègue à sa fonction privée ; un scope inconnu lève 22023.';

-- ---------------------------------------------------------------------------
-- Consommation — définition effective 0042 recopiée-modifiée, branche
-- `export` ajoutée : c'est ICI que `notified_push` bascule, dans le sillage
-- exact du patron 0042/0147 (push-notify n'appelle la consommation que
-- lorsqu'au moins UN appareil a reçu la notification — jamais un marquage
-- anticipé qui perdrait la notification en cas d'échec d'envoi).
-- ---------------------------------------------------------------------------
create or replace function public.consume_push_reminders(p_reminders jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_deleted integer := 0;
  v_row jsonb;
  v_kind text;
  v_id text;
  v_affected integer;
begin
  if p_reminders is null or jsonb_typeof(p_reminders) <> 'array' then
    return 0;
  end if;

  for v_row in select value from jsonb_array_elements(p_reminders) loop
    v_kind := v_row ->> 'kind';
    v_id := v_row ->> 'id';

    if v_id is null or v_kind is null then
      continue;
    end if;

    v_affected := 0;
    if v_kind = 'tache' then
      delete from public.task_reminders where id = v_id;
    elsif v_kind = 'evenement' then
      delete from public.event_reminders where id = v_id;
    elsif v_kind = 'routine' then
      delete from public.routine_reminders where id = v_id;
    elsif v_kind = 'message' then
      delete from public.message_notifications where id = v_id;
    elsif v_kind = 'export' then
      -- 0164 : pas de suppression — le marquage `notified_push` joue le
      -- même rôle que la tombée de la file pour les autres kinds. L'id
      -- porté par le tag `export-<job_id>` est l'identifiant du job.
      -- `v_affected = row_count` : un job déjà notifié (course entre deux
      -- passages) compte zéro et ne fait pas croire à une double
      -- consommation.
      update public.gdpr_export_jobs
         set notified_push = true
       where id = v_id::uuid
         and notified_push = false;
    else
      continue;
    end if;
    get diagnostics v_affected = row_count;
    v_deleted := v_deleted + v_affected;
  end loop;

  return v_deleted;
end;
$$;

comment on function public.consume_push_reminders(jsonb) is
  'Retire (ou marque, pour l''export 0164) les rappels distribués. push-notify n''y recourt qu''après un envoi réellement reçu par au moins un appareil.';

-- ---------------------------------------------------------------------------
-- Dispatch dédié (motif 0042 : dispatch_message_notifications) — n'appelle
-- la fonction d'envoi que s'il y a des destinataires (comptage conditionnel,
-- `pg_net` n'est pas sollicité pour rien). Le job cron est sans paramètre
-- (contrat test 0004), les secrets vivent dans Vault via post_push_dispatch.
-- ---------------------------------------------------------------------------
create or replace function private.dispatch_export_notifications()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_due integer;
  v_sent boolean;
begin
  select count(*)::integer into v_due
    from jsonb_array_elements(public.due_push_notifications('export')) as n
   where jsonb_array_length(n.value -> 'subscriptions') > 0;

  if v_due = 0 then
    return jsonb_build_object('due', 0, 'dispatched', false, 'generated_at', now());
  end if;

  v_sent := private.post_push_dispatch('export');

  return jsonb_build_object('due', v_due, 'dispatched', v_sent, 'generated_at', now());
end;
$$;

comment on function private.dispatch_export_notifications() is
  'Exports terminés non notifiés : n''appelle la fonction d''envoi que s''il y a des destinataires avec au moins un appareil.';

do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron absent : job d''envoi des notifications d''export non installé.';
    return;
  end if;

  if exists (select 1 from cron.job where jobname = 'eo-push-exports') then
    perform cron.unschedule('eo-push-exports');
  end if;

  perform cron.schedule_in_database(
    'eo-push-exports', '*/5 * * * *',
    'select private.dispatch_export_notifications()',
    current_database()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Privilèges — re-grants idempotents obligatoires : `create or replace`
-- recrée les ACL (motif 0147 lignes 281-285, test 0001 section 7 bis).
-- ---------------------------------------------------------------------------
revoke all on function private.push_reminder_notifications(timestamptz) from public, anon, authenticated;
grant execute on function private.push_reminder_notifications(timestamptz) to service_role;
revoke all on function public.due_push_notifications(text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.due_push_notifications(text, timestamptz, uuid) to service_role;
revoke all on function public.consume_push_reminders(jsonb) from public, anon, authenticated;
grant execute on function public.consume_push_reminders(jsonb) to service_role;
revoke all on function private.dispatch_export_notifications() from public, anon, authenticated;
grant execute on function private.dispatch_export_notifications() to service_role;

commit;
