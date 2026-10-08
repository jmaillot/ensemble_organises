-- 0100_message_sender_delete_tombstone.sql
-- Suppression d'un message par son auteur seul (D-07) + départ en pierre
-- tombale (D-08). Vers l'avant uniquement, aucun fichier appliqué retouché.
--
-- Constat (UAT 08, 08-CONTEXT D-07/D-08) : l'admin voyait « Supprimer » sur
-- les bulles d'autrui (`messages_delete` l'y autorisait), et quitter un fil
-- supprimait la ligne d'appartenance (le partant perdait tout l'historique).
-- Décidé : un message seul ne se supprime que par son auteur — la suppression
-- admin du fil entier reste le levier de modération — et le départ pose une
-- pierre tombale (`left_at`) : le partant relit en lecture seule, ne réécrit
-- plus, et retire le fil de ses archives en supprimant sa propre pierre.
--
-- Sémantique retenue :
--   * `messages_delete` : auteur seul ET membre actif du fil. La suppression
--     admin d'un fil (`conversations_delete` + cascade FK, qui ne passe pas
--     par la RLS ligne à ligne) est intacte — prouvée par 0039.
--   * `is_conversation_member` : actif seul (`left_at is null`). Les trois
--     lectures (conversations, membres, messages) admettent en plus les
--     tombées via `is_conversation_member_any` ; toutes les écritures
--     (envoi, édition, suppression, dépôt image, ajout) exigent l'actif.
--   * `conversation_members_delete` : soi-même ne supprime que sa propre
--     pierre (retrait des archives) ; l'admin supprime les lignes d'autrui
--     (retrait dur, sémantique existante conservée) et sa propre pierre.
--     Le départ d'une ligne active passe par `leave_conversation`, jamais
--     par un DELETE direct.
--   * `public.leave_conversation` : le partant tombe sa propre ligne,
--     idempotent (re-départ = succès sans effet). Réadhésion « comme avant »
--     (D-08) : un admin supprime la pierre puis ré-insère la ligne — les deux
--     opérations restent autorisées par les politiques ci-dessus ; le partant
--     seul ne se ré-ajoute pas (aucune politique UPDATE, UPDATE refusé).
--   * Ventilateur push (`push_message_notifications`) : destinataires actifs
--     seuls — les partants ne sont plus notifiés, les restants sans changement.

begin;

-- ---------------------------------------------------------------------------
-- Pierre tombale : le départ n'efface plus la ligne.
-- ---------------------------------------------------------------------------
alter table public.conversation_members
  add column left_at timestamptz;

comment on column public.conversation_members.left_at is
  'Départ en pierre tombale (D-08) : le partant relit en lecture seule, ne réécrit plus. NULL = membre actif.';

-- ---------------------------------------------------------------------------
-- Appartenance active (écritures) vs appartenance y compris tombée (lectures).
-- ---------------------------------------------------------------------------
create or replace function private.is_conversation_member(p_conversation_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.conversation_members cm
      join public.conversations c on c.id = cm.conversation_id
     where cm.conversation_id = p_conversation_id
       and cm.member_id = private.current_member_id(c.household_id)
       and cm.left_at is null
  );
$$;

comment on function private.is_conversation_member(text) is
  'Membre ACTIF du fil (pierre tombale exclue). Porte des écritures : envoi, ajout, suppression.';

create or replace function private.is_conversation_member_any(p_conversation_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.conversation_members cm
      join public.conversations c on c.id = cm.conversation_id
     where cm.conversation_id = p_conversation_id
       and cm.member_id = private.current_member_id(c.household_id)
  );
$$;

comment on function private.is_conversation_member_any(text) is
  'Membre du fil, pierre tombale comprise. Porte des lectures seules (D-08) : le partant relit l''historique.';

-- ---------------------------------------------------------------------------
-- Lectures : les tombées relisent (conversations, registre, messages).
-- ---------------------------------------------------------------------------
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select using (private.is_conversation_member_any(id));

drop policy if exists conversation_members_select on public.conversation_members;
create policy conversation_members_select on public.conversation_members
  for select using (private.is_conversation_member_any(conversation_id));

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (private.is_conversation_member_any(conversation_id));

-- ---------------------------------------------------------------------------
-- D-07 : un message seul ne se supprime que par son auteur, membre actif.
-- La branche admin est retirée ; le fil entier reste supprimable par un admin
-- (`conversations_delete` + cascade, prouvé par 0039).
-- ---------------------------------------------------------------------------
drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages
  for delete using (
    sender_id = private.current_member_id(household_id)
    and private.is_conversation_member(conversation_id)
  );

-- ---------------------------------------------------------------------------
-- Départs et retraits : soi-même ne supprime que sa pierre ; l'admin retire
-- autrui (dur, sémantique existante) et nettoie sa propre pierre.
-- ---------------------------------------------------------------------------
drop policy if exists conversation_members_delete on public.conversation_members;
create policy conversation_members_delete on public.conversation_members
  for delete using (
    (
      member_id = private.current_member_id(private.conversation_household_id(conversation_id))
      and left_at is not null
    )
    or (
      private.can_admin_conversation(conversation_id)
      and (
        member_id <> private.current_member_id(private.conversation_household_id(conversation_id))
        or left_at is not null
      )
    )
  );

-- Pas de politique UPDATE sur le registre : l'appartenance ne se réécrit pas
-- (ni auteur, ni fil, ni retour unilatéral). Le départ passe par le RPC
-- ci-dessous, la réadhésion par un admin (suppression de la pierre puis
-- ré-insertion, toutes deux autorisées ci-dessus).

-- ---------------------------------------------------------------------------
-- D-08 : départ volontaire en pierre tombale, idempotent.
-- Acteur = `auth.uid()`, jamais un paramètre (modèle 0016/0035/0041).
-- ---------------------------------------------------------------------------
create or replace function public.leave_conversation(p_conversation_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_household_id text;
  v_self text;
begin
  if v_actor is null then
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

  update public.conversation_members cm
     set left_at = coalesce(cm.left_at, now())
   where cm.conversation_id = p_conversation_id
     and cm.member_id = v_self;
  if not found then
    raise exception 'pas membre de cette conversation' using errcode = '42501';
  end if;

  return jsonb_build_object('conversation_id', p_conversation_id, 'member_id', v_self);
end;
$$;

comment on function public.leave_conversation(text) is
  'Départ volontaire en pierre tombale (D-08), idempotent. USAGE AUTHENTIFIÉ UNIQUEMENT.';

revoke all on function public.leave_conversation(text) from public, anon;
grant execute on function public.leave_conversation(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Ventilateur push : actifs seuls (les partants ne sont plus notifiés).
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
     and coalesce(p_now, now()) < mn.created_at + interval '24 hours';
end;
$$;

comment on function private.push_message_notifications(timestamptz) is
  'Messages non distribués aux membres ACTIFS du fil (pierre tombale exclue), auteur exclu.';

revoke all on function private.push_message_notifications(timestamptz) from public, anon, authenticated;
grant execute on function private.push_message_notifications(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Garde-fous permanents (précédent 0016, 0035, 0041).
-- ---------------------------------------------------------------------------
do $$
begin
  if has_function_privilege('anon', 'public.leave_conversation(text)', 'EXECUTE') then
    raise exception 'anon ne doit pas pouvoir quitter une conversation par RPC';
  end if;
  if not has_function_privilege('authenticated', 'public.leave_conversation(text)', 'EXECUTE') then
    raise exception 'authenticated doit pouvoir quitter une conversation par RPC';
  end if;
end;
$$;

commit;
