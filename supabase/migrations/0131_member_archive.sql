-- 0131_member_archive.sql
-- Trois gestes qui manquaient au membre : archiver **pour lui**, quitter même
-- en dernier, et effacer sa propre ligne d'appartenance.
--
-- Jusqu'ici, seul un admin pouvait « archiver », et c'était un départ de masse
-- (`0106`) : le membre restant après son départ ne pouvait ni partir (garde
-- d'interface) ni archiver (réservé à l'admin). L'archivage personnel est une
-- autre chose : le fil quitte la liste active du membre, les autres ne voient
-- rien changer, et il reste lisible. Écrire le désarchive — même règle que
-- partout : ce qui revient dans la liste est ce qui vient de bouger.
--
-- Décisions prises avec l'exploitant le 2026-10-19 :
--   * un fil archivé reste **écrivable** ; le premier message le désarchive ;
--   * un fil archivé **ne notifie plus** (ni cloche, ni push) tant qu'il l'est ;
--   * « supprimer pour moi » efface ma ligne d'appartenance, quel que soit son
--     état (active, archivée, tombée) — les autres ne perdent rien, et un fil
--     dont j'étais le dernier membre disparaît pour tout le monde, ce qui est
--     le sens de l'action.

begin;

-- ---------------------------------------------------------------------------
-- Marque personnelle, distincte de la pierre tombale (`left_at`).
-- ---------------------------------------------------------------------------
alter table public.conversation_members
  add column archived_at timestamptz;

comment on column public.conversation_members.archived_at is
  'Archive personnelle : le fil sort de la liste active du membre sans qu''il le quitte. Écrire le désarchive. NULL = visible.';

-- Réadhésion (0104 remet `left_at` à NULL) : un revenant n'hérite pas de
-- l'archive de son passage précédent.
create or replace function private.clear_archive_on_rejoin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.left_at is null and old.left_at is not null then
    new.archived_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists clear_archive_on_rejoin on public.conversation_members;
create trigger clear_archive_on_rejoin
  before update of left_at on public.conversation_members
  for each row execute function private.clear_archive_on_rejoin();

-- ---------------------------------------------------------------------------
-- Écrire désarchive : le fil revient de lui-même dans la liste de l'auteur.
-- ---------------------------------------------------------------------------
create or replace function private.unarchive_on_send()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversation_members cm
     set archived_at = null
   where cm.conversation_id = new.conversation_id
     and cm.member_id = new.sender_id
     and cm.archived_at is not null;
  return new;
end;
$$;

drop trigger if exists unarchive_on_send on public.messages;
create trigger unarchive_on_send
  after insert on public.messages
  for each row execute function private.unarchive_on_send();

-- ---------------------------------------------------------------------------
-- Archiver / désarchiver pour soi.
-- ---------------------------------------------------------------------------
create or replace function private.assert_active_membership(p_conversation_id text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_household_id text;
  v_self text;
begin
  select c.household_id into v_household_id
    from public.conversations c
   where c.id = p_conversation_id;
  if v_household_id is null then
    raise exception 'conversation inconnue' using errcode = '22023';
  end if;

  v_self := private.current_member_id(v_household_id);
  if v_self is null then
    raise exception 'aucune ligne membre pour cet acteur dans ce foyer' using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.conversation_members cm
     where cm.conversation_id = p_conversation_id
       and cm.member_id = v_self
       and cm.left_at is null
  ) then
    raise exception 'pas membre actif de cette conversation' using errcode = '42501';
  end if;

  return v_self;
end;
$$;

comment on function private.assert_active_membership(text) is
  'Garde commune des gestes personnels : acteur résolu côté serveur et ligne d''appartenance active.';

create or replace function public.archive_conversation_for_me(p_conversation_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_self text;
  v_at timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_conversation_id is null then
    raise exception 'conversation obligatoire' using errcode = '22023';
  end if;

  v_self := private.assert_active_membership(p_conversation_id);

  update public.conversation_members cm
     set archived_at = coalesce(cm.archived_at, v_at)
   where cm.conversation_id = p_conversation_id
     and cm.member_id = v_self;

  return jsonb_build_object('conversation_id', p_conversation_id, 'member_id', v_self, 'archived_at', v_at);
end;
$$;

comment on function public.archive_conversation_for_me(text) is
  'Archive personnelle, idempotente. USAGE AUTHENTIFIÉ UNIQUEMENT.';

create or replace function public.unarchive_conversation_for_me(p_conversation_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_self text;
begin
  if auth.uid() is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_conversation_id is null then
    raise exception 'conversation obligatoire' using errcode = '22023';
  end if;

  v_self := private.assert_active_membership(p_conversation_id);

  update public.conversation_members cm
     set archived_at = null
   where cm.conversation_id = p_conversation_id
     and cm.member_id = v_self
     and cm.archived_at is not null;

  return jsonb_build_object('conversation_id', p_conversation_id, 'member_id', v_self);
end;
$$;

comment on function public.unarchive_conversation_for_me(text) is
  'Retire l''archive personnelle, idempotente. USAGE AUTHENTIFIÉ UNIQUEMENT.';

-- ---------------------------------------------------------------------------
-- Supprimer pour soi : ma ligne d'appartenance, quel que soit son état.
-- Le déclencheur de périodes (0105) ferme la fenêtre, comme pour un départ.
-- ---------------------------------------------------------------------------
create or replace function public.delete_conversation_for_me(p_conversation_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_household_id text;
  v_self text;
  v_deleted integer := 0;
begin
  if auth.uid() is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_conversation_id is null then
    raise exception 'conversation obligatoire' using errcode = '22023';
  end if;

  select c.household_id into v_household_id
    from public.conversations c
   where c.id = p_conversation_id;
  if v_household_id is null then
    raise exception 'conversation inconnue' using errcode = '22023';
  end if;

  v_self := private.current_member_id(v_household_id);
  if v_self is null then
    raise exception 'aucune ligne membre pour cet acteur dans ce foyer' using errcode = '42501';
  end if;

  delete from public.conversation_members cm
   where cm.conversation_id = p_conversation_id
     and cm.member_id = v_self;
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('conversation_id', p_conversation_id, 'member_id', v_self, 'deleted', v_deleted);
end;
$$;

comment on function public.delete_conversation_for_me(text) is
  'Efface ma ligne d''appartenance (active, archivée ou tombée) : le fil me devient invisible, les autres le gardent. USAGE AUTHENTIFIÉ UNIQUEMENT.';

-- ---------------------------------------------------------------------------
-- Push : un fil archivé ne réveille plus son archiviste.
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
     and cm.left_at is null
     and cm.archived_at is null
     and coalesce(p_now, now()) < mn.created_at + interval '24 hours';
end;
$$;

-- ---------------------------------------------------------------------------
-- Privilèges : mêmes règles que les gestes voisins (0100, 0106).
-- ---------------------------------------------------------------------------
revoke all on function private.assert_active_membership(text) from public, anon, authenticated;
revoke all on function private.unarchive_on_send() from public, anon, authenticated;
revoke all on function private.clear_archive_on_rejoin() from public, anon, authenticated;
revoke all on function private.push_message_notifications(timestamptz) from public, anon, authenticated;
revoke all on function public.archive_conversation_for_me(text) from public, anon;
revoke all on function public.unarchive_conversation_for_me(text) from public, anon;
revoke all on function public.delete_conversation_for_me(text) from public, anon;

grant execute on function private.push_message_notifications(timestamptz) to service_role;
grant execute on function public.archive_conversation_for_me(text) to authenticated;
grant execute on function public.unarchive_conversation_for_me(text) to authenticated;
grant execute on function public.delete_conversation_for_me(text) to authenticated;

commit;
