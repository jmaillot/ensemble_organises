-- 0101_message_system_leave.sql
-- D-09 : le départ annonce le fil par une ligne système figée serveur.
--
-- Constat (UAT 08, 08-CONTEXT D-09) : le départ 0100 est muet — les restants
-- ne voient pas qui est parti. Décidé : chaque départ (volontaire par RPC
-- comme retrait admin) écrit exactement une ligne système dans le fil, figée
-- au nom du partant au moment du départ (les renommages ultérieurs ne
-- réécrivent jamais l'histoire), visible comme toute ligne (restants +
-- partant archivé), inactionnable (aucune écriture client) et silencieuse (ni
-- file push, ni non-lus — le fil lui-même est le signal).
--
-- Forme retenue : `sender_id NULL`. C'est la forme qui touche le moins aux
-- portes existantes :
--   * `validate_member_refs` (0008) saute déjà les références nulles
--     (`nullif`) : AUCUNE retouche.
--   * `align_child_household` (0008) n'aligne que `household_id` : AUCUNE.
--   * `lock_message_identity` (0041) verrouille auteur/fil à l'UPDATE : AUCUNE.
--   * Les RLS `messages_insert/update/delete` exigent toutes
--     `sender_id = membre courant` : NULL n'est jamais égal, donc tout faux
--     système est refusé sans retoucher une seule politique (prouvé en 0040).
--   * Seule retouche fonctionnelle : `enqueue_message_notification` (0042)
--     ignore les lignes système — sans elle la file recevrait une ligne par
--     départ (le ventilateur la filtrerait déjà par sa jointure auteur, mais
--     la file est la preuve « pas de bruit »).
-- Retouche schéma : `messages.sender_id` devient nullable (la forme système).
--
-- Exactement-une-fois : l'annonce part sur la transition NULL→horodaté de
-- `left_at` (re-départ idempotent muet) et sur la suppression d'une ligne
-- ACTIVE (retrait admin) ; la suppression d'une pierre (retrait des archives,
-- réadhésion admin) est muette. Garde-fou cascade : si le fil lui-même
-- disparaît (suppression admin du fil, cascade), l'annonce est abandonnée —
-- sans lui la suppression du fil échouerait en violation de clé étrangère.

begin;

-- ---------------------------------------------------------------------------
-- La forme système : un message sans auteur, écrit par le déclencheur seul.
-- ---------------------------------------------------------------------------
alter table public.messages
  alter column sender_id drop not null;

comment on column public.messages.sender_id is
  'Auteur membre du foyer ; NULL = ligne système serveur (départ D-09), écrite par le déclencheur seul, jamais par un client.';

-- ---------------------------------------------------------------------------
-- File push : les lignes système n'y entrent jamais (silence D-09).
-- ---------------------------------------------------------------------------
create or replace function private.enqueue_message_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sender_id is null then
    return new;
  end if;
  insert into public.message_notifications (message_id, household_id)
  values (new.id, new.household_id);
  return new;
end;
$$;

comment on function private.enqueue_message_notification() is
  'Remplit la file push à l''insertion d''un message normal ; les lignes système (départs D-09) n''y entrent jamais.';

-- ---------------------------------------------------------------------------
-- Annonce de départ : nom figé au moment du départ, une fois par départ.
-- ---------------------------------------------------------------------------
create or replace function private.announce_conversation_leave()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_leaver text;
  v_conversation text;
  v_household text;
  v_name text;
begin
  if TG_OP = 'DELETE' then
    if old.left_at is not null then
      return old;
    end if;
    v_leaver := old.member_id;
    v_conversation := old.conversation_id;
  else
    if old.left_at is not null or new.left_at is null then
      return new;
    end if;
    v_leaver := new.member_id;
    v_conversation := new.conversation_id;
  end if;

  select c.household_id into v_household
    from public.conversations c
   where c.id = v_conversation;
  if v_household is null then
    if TG_OP = 'DELETE' then
      return old;
    else
      return new;
    end if;
  end if;

  select m.display_name into v_name
    from public.household_members m
   where m.id = v_leaver;
  if v_name is null or btrim(v_name) = '' then
    v_name := 'Un membre';
  end if;

  -- Horodatage d'instruction, pas de transaction : dans une transaction qui
  -- écrit puis fait partir (cas des tests comme des RPC groupés), `now()`
  -- vaudrait le début de transaction et l'annonce ne fermerait pas
  -- l'historique. L'annonce naît au départ, elle le dit.
  insert into public.messages (id, conversation_id, household_id, sender_id, content, created_at)
  values (private.new_id('message'), v_conversation, v_household, null, v_name || ' a quitté la conversation', clock_timestamp());

  if TG_OP = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$$;

comment on function private.announce_conversation_leave() is
  'Annonce chaque départ (RPC volontaire, retrait admin) par une ligne système au nom figé, exactement une fois ; muet sur re-départ, nettoyage de pierre et suppression du fil.';

drop trigger if exists announce_conversation_leave_update on public.conversation_members;
create trigger announce_conversation_leave_update
  after update of left_at on public.conversation_members
  for each row execute function private.announce_conversation_leave();

drop trigger if exists announce_conversation_leave_delete on public.conversation_members;
create trigger announce_conversation_leave_delete
  after delete on public.conversation_members
  for each row execute function private.announce_conversation_leave();

revoke all on function private.announce_conversation_leave() from public, anon, authenticated;
revoke all on function private.enqueue_message_notification() from public, anon, authenticated;

commit;
