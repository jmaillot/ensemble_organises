-- 0102_archive_frozen_window.sql
-- D-10 : archives figées au départ — le partant relit jusqu'à son `left_at`,
-- jamais au-delà, borne évaluée côté serveur par ligne.
--
-- Constat (UAT 08, 08-CONTEXT D-10) : la tombe 0100 admet le partant en
-- lecture sur tout le fil, y compris les messages postés après son départ —
-- les archives sont vivantes, et rien ne le dit. Décidé : les lectures d'un
-- membre tombé sont bornées à sa propre pierre (`created_at <= left_at`),
-- évaluées serveur par ligne (jamais un filtre client, jamais un horodatage
-- global, jamais une valeur fournie par le client).
--
-- Trois retouches, vers l'avant uniquement, aucun fichier appliqué retouché :
--   1. `leave_conversation` horodate à l'heure d'instruction
--      (`clock_timestamp`, pas `now()`) : dans une transaction qui écrit puis
--      fait partir, `now()` vaudrait le début de transaction et la pierre ne
--      fermerait pas l'historique.
--   2. L'annonce 0101 naît à `NEW.left_at` (cas du départ volontaire) : elle
--      est dans la fenêtre par construction (`<=`), au lieu de la dépasser
--      de quelques microsecondes. Cas du retrait admin (DELETE, sans pierre)
--      inchangé : le retiré est aveugle de toute façon, l'annonce ne sert
--      qu'aux restants.
--   3. `messages_select` borne les tombés à leur pierre ; les actifs voient
--      tout, comme avant.
--
-- Audit des autres portes de lecture (on ne change que ce qui fuit du
-- contenu de message) :
--   * `conversations_select` : métadonnées du fil (titre/type) conservées —
--     la section archives a besoin de la ligne pour lister le fil.
--   * `conversation_members_select` : registre conservé — participants et
--     pierres restent lisibles pour l'affichage.
--   * Seule `messages_select` fuit du contenu post-départ : seule changée.
--
-- Fenêtre mobile : la réadhésion supprime la pierre puis ré-insère la ligne
-- (0100, inchangé) ; le nouveau départ horodate une pierre neuve, donc une
-- borne neuve — prouvé en 0041. Le retrait des archives (suppression de sa
-- propre pierre) reste aveugle : sans ligne, `exists` est faux.
-- Écritures, annonces, ventilateur push : intacts (0041 le prouve).

begin;

-- ---------------------------------------------------------------------------
-- Le départ horodate à l'heure d'instruction, pas de transaction.
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

  -- Heure d'instruction (D-10) : dans une transaction qui écrit puis fait
  -- partir, `now()` vaudrait le début de transaction et la pierre ne
  -- fermerait pas l'historique — la borne `created_at <= left_at` doit
  -- tomber après les écrits qui la précèdent.
  update public.conversation_members cm
     set left_at = coalesce(cm.left_at, clock_timestamp())
   where cm.conversation_id = p_conversation_id
     and cm.member_id = v_self;
  if not found then
    raise exception 'pas membre de cette conversation' using errcode = '42501';
  end if;

  return jsonb_build_object('conversation_id', p_conversation_id, 'member_id', v_self);
end;
$$;

comment on function public.leave_conversation(text) is
  'Départ volontaire en pierre tombale (D-08), idempotent, horodaté à l''heure d''instruction (D-10). USAGE AUTHENTIFIÉ UNIQUEMENT.';

revoke all on function public.leave_conversation(text) from public, anon;
grant execute on function public.leave_conversation(text) to authenticated;

-- ---------------------------------------------------------------------------
-- L'annonce naît dans la fenêtre : `created_at = NEW.left_at` au départ
-- volontaire (incluse par `<=` par construction), horloge conservée au
-- retrait admin (sans pierre, le retiré est aveugle de toute façon).
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
  v_at timestamptz;
begin
  if TG_OP = 'DELETE' then
    if old.left_at is not null then
      return old;
    end if;
    v_leaver := old.member_id;
    v_conversation := old.conversation_id;
    v_at := clock_timestamp();
  else
    if old.left_at is not null or new.left_at is null then
      return new;
    end if;
    v_leaver := new.member_id;
    v_conversation := new.conversation_id;
    -- Dans la fenêtre par construction (D-10) : l'annonce du départ porte
    -- l'instant du départ, pas quelques microsecondes de plus.
    v_at := new.left_at;
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

  insert into public.messages (id, conversation_id, household_id, sender_id, content, created_at)
  values (private.new_id('message'), v_conversation, v_household, null, v_name || ' a quitté la conversation', v_at);

  if TG_OP = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$$;

comment on function private.announce_conversation_leave() is
  'Annonce chaque départ (RPC volontaire, retrait admin) par une ligne système au nom figé, exactement une fois ; muet sur re-départ, nettoyage de pierre et suppression du fil. L''annonce volontaire naît dans la fenêtre du partant (D-10).';

revoke all on function private.announce_conversation_leave() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Garde-fous permanents (précédent 0016, 0035, 0041, 0100).
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

-- ---------------------------------------------------------------------------
-- D-10 : les tombés ne relisent que jusqu'à leur pierre, évalué serveur.
--
-- Forme retenue : une porte `SECURITY DEFINER` à paramètres explicites,
-- pas un `EXISTS` corrélé inline. Dans un sous-requête, un nom non qualifié
-- se résout à la portée interne : `conversation_id` y vaudrait
-- `cm.conversation_id` (tautologie qui ouvre les fils voisins) et
-- `created_at` y vaudrait `c.created_at` (la naissance du fil, pas celle du
-- message). Les paramètres `p_*` lèvent toute ambiguïté ; au niveau de la
-- politique, `conversation_id`/`created_at` désignent sans concurrence la
-- ligne de `messages` (même idiome que les portes 0100).
-- ---------------------------------------------------------------------------
create or replace function private.can_read_message(p_conversation_id text, p_created_at timestamptz)
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
       and (cm.left_at is null or p_created_at <= cm.left_at)
  );
$$;

comment on function private.can_read_message(text, timestamptz) is
  'Porte de lecture des messages (D-10) : actif = tout le fil, tombé = jusqu''à sa pierre (created_at <= left_at), évalué serveur par ligne.';

-- Pas de REVOKE : la porte est appelée par la politique RLS avec les droits
-- de l'appelant — `authenticated` doit pouvoir l'exécuter (comme
-- `is_conversation_member_any` en 0100, jamais révoquée). Le corps reste
-- `SECURITY DEFINER` à `search_path` vide. GRANT explicite : un
-- `CREATE OR REPLACE` conserve les privilèges existants et ne répare donc
-- pas une révocation antérieure.
grant execute on function private.can_read_message(text, timestamptz) to authenticated;

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (private.can_read_message(conversation_id, created_at));

commit;
