-- 0172_grouped_message_push.sql
-- Push de messages groupé par conversation et SANS contenu (MSG-04, D-06/D-07).
--
-- Constat : `private.push_message_notifications` (0042, retouchée 0100) mettait
-- `left(btrim(msg.content), 120)` dans le body du push — violation en
-- production de la règle verrouillée « les notifications ne portent jamais le
-- contenu d'un message ». Et chaque message provoquait sa propre
-- notification : trois messages dans un cycle = trois push empilés, alors que
-- le tag OS `message-<conversation_id>` (0042:85) était déjà la clé de
-- regroupement côté appareil.
--
-- Correction vers l'avant (0042 et 0100 ne sont JAMAIS réécrits, §2.7-A.1) :
--   * `push_message_notifications` groupe la file `message_notifications` par
--     (destinataire, conversation) : la file EST la fenêtre d'accumulation,
--     aucun état serveur nouveau (D-07). Une ligne par groupe, le compteur
--     dans le titre, `reminder_ids` = les ids de file du groupe, auteur exclu
--     par membre (`cm.member_id is distinct from msg.sender_id`), participants
--     actifs seuls (`left_at is null`, 0100), fenêtre 24 h inchangée.
--   * titre et corps audités ENSEMBLE — aucun extrait de contenu :
--     - directe  : « N nouveau(x) message(s) de {prénom} » / « Conversation
--       avec {prénoms des autres membres} » (gabarit conversation-list) ;
--     - groupe   : « N nouveau(x) message(s) dans {titre du fil} » / « dans
--       {titre du fil} » — le titre du fil est autorisé, le contenu d'un
--       message ne l'est jamais (T-29-04).
--     L'expéditeur affiché est celui du DERNIER message du groupe (le plus
--     récent), pas un max alphabétique.
--   * `due_push_notifications` ajoute `reminder_ids` (jsonb) en PLUS du
--     scalaire `reminder_id` ; les scopes rappels/anniversaires/test restent
--     inchangés (rétro-compatibilité A4).
--   * `consume_push_reminders` accepte `{kind:'message', ids:[...]}` pour
--     vider le groupe d'un coup ; la forme scalaire `{kind, id}` reste valide
--     pour tous les kinds ; un id absent est un no-op compté, pas une erreur.
--   * Le job `eo-push-messages` et sa garde `to_regclass('cron.job')` (0042)
--     sont inchangés : seul le contenu du dispatch change.

begin;

-- ---------------------------------------------------------------------------
-- Ventilateur groupé, sans contenu (T-29-04).
--
-- Le type de retour change (colonne `reminder_ids` ajoutée) : PostgreSQL
-- refuse `create or replace` sur un row type différent, la fonction est donc
-- recréée après un `drop function`. Elle est `private`, sans dépendance
-- persistante (seul `due_push_notifications` l'appelle, recréée dans la même
-- transaction), et la correction reste vers l'avant : 0042/0100 ne sont pas
-- réécrits.
-- ---------------------------------------------------------------------------
drop function if exists private.push_message_notifications(timestamptz);

create or replace function private.push_message_notifications(p_now timestamptz)
returns table (
  user_id uuid,
  reminder_id text,
  household_id text,
  title text,
  body text,
  url text,
  tag text,
  preference text,
  reminder_ids jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  select
    grp.user_id,
    grp.reminder_id,
    grp.household_id,
    grp.nb_text || case
      when grp.c_type = 'groupe'
        then ' dans ' || coalesce(nullif(btrim(grp.c_title), ''), 'votre conversation')
        else ' de ' || coalesce(split_part(ls.display_name, ' ', 1), 'Membre du foyer')
    end as title,
    case
      when grp.c_type = 'groupe'
        then 'dans ' || coalesce(nullif(btrim(grp.c_title), ''), 'votre conversation')
        else 'Conversation avec ' || grp.other_names
    end as body,
    '/messages'::text as url,
    'message-' || grp.conversation_id as tag,
    'message'::text as preference,
    grp.reminder_ids
  from (
    select
      m.user_id,
      msg.conversation_id,
      mn.household_id,
      max(mn.id) as reminder_id,
      jsonb_agg(mn.id order by mn.created_at, mn.id) as reminder_ids,
      count(*) as nb,
      case when count(*) = 1
        then '1 nouveau message'
        else count(*)::text || ' nouveaux messages'
      end as nb_text,
      (array_agg(msg.id order by mn.created_at desc, mn.id desc))[1] as last_message_id,
      c.type as c_type,
      c.title as c_title,
      coalesce((
        select string_agg(
                 split_part(m2.display_name, ' ', 1), ', '
                 order by split_part(m2.display_name, ' ', 1))
          from public.conversation_members cm2
          join public.household_members m2 on m2.id = cm2.member_id
         where cm2.conversation_id = msg.conversation_id
           and cm2.left_at is null
           and m2.user_id is not null
           and m2.user_id <> m.user_id
      ), 'votre conversation') as other_names
    from public.message_notifications mn
    join public.messages msg on msg.id = mn.message_id
    join public.conversations c on c.id = msg.conversation_id
    join public.conversation_members cm on cm.conversation_id = msg.conversation_id
    join public.household_members m on m.id = cm.member_id
   where m.user_id is not null
     and cm.left_at is null
     and cm.archived_at is null
     and cm.member_id is distinct from msg.sender_id
     and coalesce(p_now, now()) < mn.created_at + interval '24 hours'
   group by m.user_id, msg.conversation_id, mn.household_id, c.type, c.title
  ) grp
  left join public.messages last_msg on last_msg.id = grp.last_message_id
  left join public.household_members ls on ls.id = last_msg.sender_id;
end;
$$;

comment on function private.push_message_notifications(timestamptz) is
  'Messages non distribués, UNE ligne par (destinataire, conversation) : compteur au titre, reminder_ids du groupe, JAMAIS le contenu d''un message. Auteur exclu, participants actifs, fenêtre 24 h.';

-- ---------------------------------------------------------------------------
-- Scope `messages` : le groupe porte reminder_ids en plus du scalaire.
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
  if p_scope is null or p_scope not in ('rappels', 'anniversaires', 'messages', 'export', 'test') then
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
          'reminder_ids', n.reminder_ids,
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
          user_id uuid, reminder_id text, reminder_ids jsonb, household_id text,
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
  'Point d''entrée unique du dispatch push. Depuis 0172, le scope messages porte reminder_ids (jsonb) : le groupe entier se consume d''un coup.';

-- ---------------------------------------------------------------------------
-- Consommation : liste d'ids pour kind `message`, scalaire conservé ailleurs.
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
  v_ids jsonb;
  v_affected integer;
begin
  if p_reminders is null or jsonb_typeof(p_reminders) <> 'array' then
    return 0;
  end if;

  for v_row in select value from jsonb_array_elements(p_reminders) loop
    v_kind := v_row ->> 'kind';
    v_ids := v_row -> 'ids';

    if v_kind is null then
      continue;
    end if;

    -- 0172 : un groupe de messages se consume par LISTE d'ids de file.
    if v_ids is not null and jsonb_typeof(v_ids) = 'array' then
      for v_id in select x from jsonb_array_elements_text(v_ids) x loop
        if v_id is null or v_id = '' then
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
          -- même rôle que la tombée de la file pour les autres kinds. Un job
          -- déjà notifié compte zéro et ne fait pas croire à une double
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
    else
      -- Forme scalaire historique {kind, id} : rappels, anniversaires, test,
      -- export, et compatibilité avec toute Edge antérieure.
      v_id := v_row ->> 'id';
      if v_id is null then
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
        -- même rôle que la tombée de la file pour les autres kinds. Un job
        -- déjà notifié compte zéro et ne fait pas croire à une double
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
    end if;
  end loop;

  return v_deleted;
end;
$$;

comment on function public.consume_push_reminders(jsonb) is
  'Vide les lignes distribuées. {kind, id} scalaire pour rappels/anniversaires/test/export ; {kind, ids:[...]} pour les messages (0172, groupe entier). Un id absent est un no-op compté.';

-- ---------------------------------------------------------------------------
-- Privilèges : recréés comme en 0042 (retrait PUBLIC explicite).
-- ---------------------------------------------------------------------------
revoke all on function private.push_message_notifications(timestamptz) from public, anon, authenticated;
revoke all on function public.due_push_notifications(text, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.consume_push_reminders(jsonb) from public, anon, authenticated;

grant execute on function private.push_message_notifications(timestamptz) to service_role;
grant execute on function public.due_push_notifications(text, timestamptz, uuid) to service_role;
grant execute on function public.consume_push_reminders(jsonb) to service_role;

commit;
