-- 0041_conversation_lifecycle.sql
-- Création de conversation en une transaction + création ouverte aux enfants.
--
-- Constat (audit, 30/09/2026) : un `membre` créait une conversation
-- (`conversations_insert` exige `can_write_household`, OK) sans pouvoir y
-- ajouter le moindre participant — `can_join_conversation` exige
-- `is_conversation_member OR admin`, faux pour tout le monde sur une
-- conversation vide. Ligne invisible (le `SELECT` exige aussi l'appartenance)
-- et non-rejoignable : seul un admin pouvait la peupler. Et l'`enfant` ne
-- pouvait même pas créer, alors que le produit veut qu'il converse.
--
-- Corrections, sur le modèle `create_household` (0016) / `create_expense`
-- (0035) : acteur = `auth.uid()`, jamais un paramètre ; une transaction ;
-- `EXECUTE` à `authenticated` seul :
--   * `public.create_conversation` : type/titre validés comme la contrainte
--     (0005), au moins un membre du même foyer, créateur inclus (pas de
--     conversation fantôme), insertion conversation + membres atomique ;
--   * l'appartenance exigée est `assert_household_member`, PAS écrivain :
--     les enfants créent et écrivent (décision produit) ;
--   * `conversations_insert` passe de `can_write_household` à
--     `is_household_member` pour la même raison — sans toucher à
--     `can_write_household` lui-même, qui reste la règle du reste du foyer ;
--   * l'ajout ultérieur par un participant est déjà couvert par
--     `can_join_conversation` (inchangé) ; `update`/`delete` restent admin.

begin;

create or replace function public.create_conversation(
  p_household_id text,
  p_type text default 'direct',
  p_title text default null,
  p_member_ids jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_self text;
  v_conversation_id text := private.new_id('conversation');
  v_member text;
  v_seen text[] := '{}';
  v_count integer := 0;
  v_out jsonb;
begin
  if v_actor is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_household_id is null then
    raise exception 'foyer obligatoire' using errcode = '22023';
  end if;
  -- Appartenance, pas rôle écrivain : les enfants conversent (décision).
  perform private.assert_household_member(p_household_id, v_actor);

  if p_type not in ('direct', 'groupe') then
    raise exception 'type de conversation invalide' using errcode = '22023';
  end if;
  if p_type = 'groupe' then
    if p_title is null or char_length(btrim(p_title)) not between 1 and 120 then
      raise exception 'un groupe exige un titre' using errcode = '22023';
    end if;
  elsif p_title is not null then
    raise exception 'un direct ne porte pas de titre' using errcode = '22023';
  end if;

  if p_member_ids is null or jsonb_typeof(p_member_ids) != 'array' or jsonb_array_length(p_member_ids) = 0 then
    raise exception 'au moins un membre doit participer à la conversation' using errcode = '22023';
  end if;

  select private.current_member_id(p_household_id) into v_self;
  if v_self is null then
    raise exception 'aucune ligne membre pour cet acteur dans ce foyer' using errcode = '42501';
  end if;

  insert into public.conversations (id, household_id, type, title)
  values (v_conversation_id, p_household_id, p_type, case when p_type = 'groupe' then btrim(p_title) else null end);

  for v_member in select * from jsonb_array_elements_text(p_member_ids) loop
    if v_member = any (v_seen) then
      continue;
    end if;
    v_seen := v_seen || v_member;
    if not private.member_in_household(v_member, p_household_id) then
      raise exception 'le membre % n''appartient pas au foyer de la conversation', v_member
        using errcode = '23514';
    end if;
    insert into public.conversation_members (conversation_id, member_id)
    values (v_conversation_id, v_member);
    v_count := v_count + 1;
  end loop;

  if not (v_self = any (v_seen)) then
    raise exception 'le créateur doit participer à sa conversation' using errcode = '22023';
  end if;

  select jsonb_build_object('id', v_conversation_id) into v_out;
  return v_out;
end;
$$;

comment on function public.create_conversation(text, text, text, jsonb) is
  'Crée une conversation et ses membres en une transaction. Appartenance exigée, enfants inclus. USAGE AUTHENTIFIÉ UNIQUEMENT.';

revoke all on function public.create_conversation(text, text, text, jsonb) from public, anon;
grant execute on function public.create_conversation(text, text, text, jsonb) to authenticated;

-- Création ouverte aux enfants : l'écriture du contenu reste régie par
-- `can_send_message`, inchangée.
drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations
  for insert with check (private.is_household_member(household_id));

-- Un message ne déménage pas : ni d'auteur, ni de conversation. Sans cela un
-- auteur réécrit l'historique d'une autre conversation où il est membre, le
-- trigger d'alignement suivant sans broncher.
create or replace function private.lock_message_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.conversation_id is distinct from new.conversation_id then
    raise exception 'un message ne change pas de conversation' using errcode = '23514';
  end if;
  if old.sender_id is distinct from new.sender_id then
    raise exception 'un message ne change pas d''auteur' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists lock_message_identity on public.messages;
create trigger lock_message_identity
  before update on public.messages
  for each row execute function private.lock_message_identity();

-- Garde-fous permanents (précédent 0016, 0035).
do $$
begin
  if has_function_privilege('anon', 'public.create_conversation(text, text, text, jsonb)', 'EXECUTE') then
    raise exception 'anon ne doit pas pouvoir créer une conversation par RPC';
  end if;
  if not has_function_privilege('authenticated', 'public.create_conversation(text, text, text, jsonb)', 'EXECUTE') then
    raise exception 'authenticated doit pouvoir créer une conversation par RPC';
  end if;
end;
$$;

commit;
