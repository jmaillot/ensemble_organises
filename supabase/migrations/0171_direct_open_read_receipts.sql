-- 0171_direct_open_read_receipts.sql
-- Messagerie v2, socle serveur (phase 29, plan 29-01) :
--   * open_direct_conversation : démarrer ou ROUVRIR une directe depuis le
--     member-picker (MSG-01, D-04/D-05), avec verrou consultatif anti-course ;
--   * conversation_read_receipts : watermarks de lecture des co-membres actifs
--     d'un fil (MSG-03), lisibles côté émetteur pour l'accusé (D-02).
--
-- Constat : le démarrage d'une directe passait par `create_conversation`
-- (0041) sans garde — deux taps sur la même personne créaient deux fils.
-- Et l'accusé de lecture exige de lire les `notification_reads` d'autrui,
-- que la RLS `notification_reads_select_own` (0046) interdit — d'où un RPC
-- SECURITY DEFINER borné au fil dont l'appelant est membre actif (T-29-01),
-- même forme que `leave_conversation` (0100) et les gestes 0131.
--
-- D-05 (rouverture) : « participation active » se lit sur `left_at is null`
-- (pierre tombale 0101) SEUL. L'archive personnelle (`archived_at`, 0131)
-- n'empêche pas d'écrire — écrire désarchive (`unarchive_on_send`) — donc un
-- fil archivé pour moi reste un fil qui existe et se rouvre. Si l'un des deux
-- a QUITTÉ, une NOUVELLE conversation est créée et la pierre reste.
--
-- Anti-course (T-29-02) : `pg_advisory_xact_lock` sur un hash de la paire
-- triée {appelant, autre} — deux démarrages simultanés de la même paire sont
-- sérialisés, le second rouvre.
--
-- Types : les identifiants du projet sont TEXTE (`private.new_id`, 0001) —
-- `household_members.id`, `conversations.id` et `notification_reads.scope_id`
-- sont text ; seul `user_id` est uuid. (Le plan annonçait des uuid : le schéma
-- fait foi, correction vers le type réel.)

begin;

-- ---------------------------------------------------------------------------
-- 1. open_direct_conversation : rouvrir ou créer, jamais doubler.
-- ---------------------------------------------------------------------------
create or replace function public.open_direct_conversation(p_other_member_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_household text;
  v_self text;
  v_existing text;
  v_new text;
begin
  if v_actor is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_other_member_id is null then
    raise exception 'membre obligatoire' using errcode = '22023';
  end if;

  -- Le foyer visé est celui du membre ciblé ; il doit exister et être actif
  -- (les profils enfants gérés n'ont pas de compte et restent ciblables, D-04).
  select hm.household_id into v_household
    from public.household_members hm
   where hm.id = p_other_member_id
     and hm.account_deleted_at is null;
  if v_household is null then
    raise exception 'membre introuvable ou inactif' using errcode = '22023';
  end if;

  -- L'appelant doit appartenir au MÊME foyer (sinon 22023 : ciblage inter-foyer).
  v_self := private.current_member_id(v_household);
  if v_self is null then
    raise exception 'cette personne n''appartient pas à votre foyer' using errcode = '22023';
  end if;
  if v_self = p_other_member_id then
    raise exception 'on ne démarre pas une conversation avec soi-même' using errcode = '22023';
  end if;

  -- Garde D-06 (0146) : un enfant géré n'entre dans une conversation que si
  -- 'messages' est ouvert sur sa fiche — même règle que create_conversation,
  -- que ce RPC remplace pour les directes (sinon il serait un contournement).
  if private.is_managed_child(p_other_member_id) is true
     and private.managed_child_module_allowed(p_other_member_id, 'messages') is not true then
    raise exception 'cet enfant n''a pas accès à la messagerie' using errcode = '22023';
  end if;

  -- Verrou consultatif sur la paire triée : deux appels simultanés sont
  -- sérialisés, le second trouve l'existant et rouvre (T-29-02).
  perform pg_advisory_xact_lock(
    ('x' || md5(least(v_self, p_other_member_id) || '>' || greatest(v_self, p_other_member_id)))::bit(64)::bigint
  );

  -- Garde D-05 : une directe du foyer où les DEUX participations sont actives
  -- (`left_at is null`). `archived_at` n'entre pas — un fil archivé se rouvre.
  select c.id into v_existing
    from public.conversations c
    join public.conversation_members a
      on a.conversation_id = c.id
     and a.member_id = v_self
     and a.left_at is null
    join public.conversation_members b
      on b.conversation_id = c.id
     and b.member_id = p_other_member_id
     and b.left_at is null
   where c.type = 'direct'
     and c.household_id = v_household
   limit 1;

  if v_existing is not null then
    return jsonb_build_object('id', v_existing, 'created', false);
  end if;

  insert into public.conversations (id, household_id, type)
  values (private.new_id('conversation'), v_household, 'direct')
  returning id into v_new;

  insert into public.conversation_members (conversation_id, member_id)
  values (v_new, v_self), (v_new, p_other_member_id);

  return jsonb_build_object('id', v_new, 'created', true);
end;
$$;

comment on function public.open_direct_conversation(text) is
  'Démarre ou rouvre la conversation directe entre l''appelant et le membre visé (même foyer). USAGE AUTHENTIFIÉ UNIQUEMENT.';

revoke all on function public.open_direct_conversation(text) from public, anon;
grant execute on function public.open_direct_conversation(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. conversation_read_receipts : watermarks des co-membres actifs (MSG-03).
--    Piège §2.7-A.5 : `member_id`/`read_at`… sont des VARIABLES plpgsql sous
--    `returns table` — chaque colonne est qualifiée (public.notification_reads).
-- ---------------------------------------------------------------------------
create or replace function public.conversation_read_receipts(p_conversation_id text)
returns table (
  member_id text,
  display_name text,
  color_tag text,
  read_at timestamptz
)
language plpgsql
stable
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

  -- Appelant membre ACTIF du fil (garde commune 0131) — jamais de lecture
  -- hors de son fil, jamais global (T-29-01).
  v_self := private.assert_active_membership(p_conversation_id);

  return query
  select cm.member_id,
         m.display_name,
         m.color_tag,
         nr.read_at
    from public.conversation_members cm
    join public.household_members m
      on m.id = cm.member_id
    left join public.notification_reads nr
      on nr.scope = 'conversation'
     and nr.scope_id = cm.conversation_id
     and nr.user_id = m.user_id
   where cm.conversation_id = p_conversation_id
     and cm.left_at is null
     and cm.member_id <> v_self
   order by nr.read_at nulls last;
end;
$$;

comment on function public.conversation_read_receipts(text) is
  'Watermark de lecture (notification_reads, scope conversation) de chaque co-membre actif du fil ; read_at NULL = pas encore lu. USAGE AUTHENTIFIÉ UNIQUEMENT.';

revoke all on function public.conversation_read_receipts(text) from public, anon;
grant execute on function public.conversation_read_receipts(text) to authenticated;

-- Garde-fous permanents (précédent 0041).
do $$
begin
  if has_function_privilege('anon', 'public.open_direct_conversation(text)', 'EXECUTE') then
    raise exception 'anon ne doit pas pouvoir ouvrir une directe par RPC';
  end if;
  if not has_function_privilege('authenticated', 'public.open_direct_conversation(text)', 'EXECUTE') then
    raise exception 'authenticated doit pouvoir ouvrir une directe par RPC';
  end if;
  if has_function_privilege('anon', 'public.conversation_read_receipts(text)', 'EXECUTE') then
    raise exception 'anon ne doit pas pouvoir lire les accusés par RPC';
  end if;
  if not has_function_privilege('authenticated', 'public.conversation_read_receipts(text)', 'EXECUTE') then
    raise exception 'authenticated doit pouvoir lire les accusés par RPC';
  end if;
end;
$$;

commit;
