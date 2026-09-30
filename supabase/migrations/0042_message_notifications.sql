-- 0042_message_notifications.sql
-- Notifications push à la réception d'un message (décision phase C).
--
-- Principe, identique aux rappels (0019) : une file `message_notifications`
-- remplie par trigger à l'insertion d'un `messages`, lue par
-- `public.due_push_notifications('messages', …)`, consommée après envoi par
-- `public.consume_push_reminders` (genre `message`). Le ventilateur
-- (destinataires = participants sauf l'auteur, avec compte, préférence
-- `message`) est résolu à la lecture, pas à l'écriture : un membre qui
-- rejoint après l'envoi ne reçoit pas le passé. Le `tag` porte la
-- conversation : les notifications d'un même fil se regroupent côté client.
-- Un job `eo-push-messages` toutes les 5 minutes appelle le dispatch.

begin;

-- ---------------------------------------------------------------------------
-- File d'envoi : une ligne par message, consommée après distribution.
-- ---------------------------------------------------------------------------
create table public.message_notifications (
  id text primary key default private.new_id('message-notification'),
  message_id text not null references public.messages (id) on delete cascade,
  household_id text not null references public.households (id) on delete cascade,
  created_at timestamptz not null default now()
);
comment on table public.message_notifications is
  'File des messages à notifier. USAGE SERVEUR UNIQUEMENT : remplie par trigger, lue par due_push_notifications, vidée par consume_push_reminders.';

alter table public.message_notifications enable row level security;

create or replace function private.enqueue_message_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.message_notifications (message_id, household_id)
  values (new.id, new.household_id);
  return new;
end;
$$;

drop trigger if exists enqueue_message_notification on public.messages;
create trigger enqueue_message_notification
  after insert on public.messages
  for each row execute function private.enqueue_message_notification();

-- ---------------------------------------------------------------------------
-- Préférence par membre, défaut activé comme les rappels (0018).
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column message_notifications_enabled boolean not null default true;

comment on column public.profiles.message_notifications_enabled is
  'Recevoir une notification push à chaque message d''une conversation suivie.';

-- ---------------------------------------------------------------------------
-- Lecture : destinataires = participants sauf l'auteur, avec compte.
-- ---------------------------------------------------------------------------
create or replace function private.push_message_notifications(p_now timestamptz)
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
  select
    m.user_id,
    mn.id as reminder_id,
    mn.household_id,
    'Message de ' || split_part(sender.display_name, ' ', 1) as title,
    left(btrim(msg.content), 120) as body,
    '/messages'::text as url,
    'message-' || msg.conversation_id as tag,
    'message'::text as preference
    from public.message_notifications mn
    join public.messages msg on msg.id = mn.message_id
    join public.conversation_members cm
      on cm.conversation_id = msg.conversation_id
    join public.household_members m
      on m.id = cm.member_id
    join public.household_members sender
      on sender.id = msg.sender_id
   where m.user_id is not null
     and m.user_id <> sender.user_id
     and coalesce(p_now, now()) < mn.created_at + interval '24 hours';
end;
$$;

comment on function private.push_message_notifications(timestamptz) is
  'Messages non distribués (file de moins de 24 h), un couple (destinataire, message) par ligne, auteur exclu.';

-- ---------------------------------------------------------------------------
-- Scope `messages` dans le point d'entrée unique + préférence + consommation.
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
  if p_scope is null or p_scope not in ('rappels', 'anniversaires', 'messages', 'test') then
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
    else
      continue;
    end if;
    get diagnostics v_affected = row_count;
    v_deleted := v_deleted + v_affected;
  end loop;

  return v_deleted;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dispatch dédié (5 minutes : une conversation n'attend pas un quart d'heure)
-- ---------------------------------------------------------------------------
create or replace function private.dispatch_message_notifications()
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
    from jsonb_array_elements(public.due_push_notifications('messages')) as n(notification jsonb)
   where jsonb_array_length(n.notification -> 'subscriptions') > 0;

  if v_due = 0 then
    return jsonb_build_object('due', 0, 'dispatched', false, 'generated_at', now());
  end if;

  v_sent := private.post_push_dispatch('messages');

  return jsonb_build_object('due', v_due, 'dispatched', v_sent, 'generated_at', now());
end;
$$;

comment on function private.dispatch_message_notifications() is
  'Messages en file : n''appelle la fonction d''envoi que s''il y a des destinataires.';

do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron absent : job d''envoi des messages non installé.';
    return;
  end if;

  if exists (select 1 from cron.job where jobname = 'eo-push-messages') then
    perform cron.unschedule('eo-push-messages');
  end if;

  perform cron.schedule_in_database(
    'eo-push-messages', '*/5 * * * *',
    'select private.dispatch_message_notifications()',
    current_database()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Privilèges : recréés comme en 0019 (retrait PUBLIC explicite).
-- ---------------------------------------------------------------------------
revoke all on function private.push_message_notifications(timestamptz) from public, anon, authenticated;
revoke all on function private.dispatch_message_notifications() from public, anon, authenticated;
revoke all on function private.enqueue_message_notification() from public, anon, authenticated;
revoke all on function public.due_push_notifications(text, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.consume_push_reminders(jsonb) from public, anon, authenticated;

grant execute on function private.push_message_notifications(timestamptz) to service_role;
grant execute on function private.dispatch_message_notifications() to service_role;
grant execute on function public.due_push_notifications(text, timestamptz, uuid) to service_role;
grant execute on function public.consume_push_reminders(jsonb) to service_role;

commit;
