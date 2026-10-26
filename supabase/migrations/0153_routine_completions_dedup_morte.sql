-- 0153_routine_completions_dedup_morte.sql
-- Correction vers l'avant trouvée par la revue de code de la phase 25
-- (finding WR-03) — 0149 recopié-modifié, aucune migration appliquée n'est
-- réécrite :
--
--    Le self-join de déduplication sur routine_completions était du code
--    mort : la contrainte routine_completions_unique_occurrence
--    unique (routine_id, occurrence_date) (0003:151) interdit deux lignes de
--    même (routine_id, occurrence_date), donc le join ne matchait jamais et
--    le delete ne supprimait jamais rien — le motif « un contrôle qui ne
--    regarde rien » (AGENTS §2.7-B). Le bloc est supprimé et remplacé par un
--    commentaire qui nomme la raison ; l'update de réattribution ne peut pas
--    violer la contrainte. Si la contrainte devenait un jour
--    (routine_id, occurrence_date, completed_by), la déduplication
--    redeviendrait nécessaire — le commentaire le rappelle.
--
-- Le garde messages et les politiques Cercle D-12 de 0149 sont recopiés tels
-- quels (create or replace / drop-create : ni l'un ni l'autre n'est additif).

begin;

-- ---------------------------------------------------------------------------
-- 1. Le garde messages — 0149 recopié (inchangé, voir tête de 0149).
-- ---------------------------------------------------------------------------
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
    -- D-20 (fusion 0148) : la trace d'un enfant géré suit son identité
    -- réelle à la liaison du compte. Toute autre réécriture d'auteur reste
    -- refusée (23514), adulte compris.
    if private.is_managed_child(old.sender_id) is not true then
      raise exception 'un message ne change pas d''auteur' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

comment on function private.lock_message_identity() is
  'Un message ne déménage pas : ni d''auteur, ni de conversation (0041). Exception D-20 : la réattribution des messages d''un enfant géré vers son compte à la fusion (0148) — l''historique suit l''identité.';

-- ---------------------------------------------------------------------------
-- 2. Le RPC de fusion — 0149 recopié-modifié ; seule différence : le bloc de
--    déduplication routine_completions est supprimé (code mort, contrainte
--    0003), remplacé par le commentaire qui nomme la raison.
-- ---------------------------------------------------------------------------
create or replace function public.link_managed_child(
  p_child_member_id text,
  p_account_member_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_row_first public.household_members;
  v_row_second public.household_members;
  v_child_row public.household_members;
  v_account_row public.household_members;
  v_counts jsonb;
begin
  if v_actor is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_child_member_id is null or p_account_member_id is null
     or p_child_member_id = p_account_member_id then
    raise exception 'enfant et compte obligatoires et distincts' using errcode = '22023';
  end if;

  -- Verrous `for update` sur les deux lignes, TOUJOURS dans l'ordre des id :
  -- deux fusions concurrentes prennent les verrous dans le même ordre, aucun
  -- interblocage (forme servante 0132, généralisée à deux lignes).
  select * into v_row_first
    from public.household_members
   where id = least(p_child_member_id, p_account_member_id)
     for update;
  select * into v_row_second
    from public.household_members
   where id = greatest(p_child_member_id, p_account_member_id)
     for update;
  -- Affectation sémantique : v_child_row = la ligne enfant demandée.
  if p_child_member_id < p_account_member_id then
    v_child_row := v_row_first;
    v_account_row := v_row_second;
  else
    v_child_row := v_row_second;
    v_account_row := v_row_first;
  end if;

  -- Garde D-18bis, forme `is not true` (jamais `not (…)`, piège NULL 0133) :
  -- ligne adulte, déjà fusionnée, absente ou archivée → refus.
  if private.is_managed_child(p_child_member_id) is not true then
    raise exception 'la ligne visée n''est pas un enfant géré' using errcode = '22023';
  end if;

  -- La ligne compte existe et est un adulte réel : avec compte, role
  -- distinct de 'enfant'.
  if v_account_row.id is null then
    raise exception 'la ligne compte est introuvable' using errcode = '22023';
  end if;
  if v_account_row.role = 'enfant' or v_account_row.user_id is null then
    raise exception 'la ligne compte n''est pas un adulte avec un compte' using errcode = '22023';
  end if;

  -- D-22 : même foyer obligatoire. Un enfant de deux foyers est deux lignes
  -- indépendantes ; on ne fusionne jamais inter-foyers.
  if v_child_row.household_id is distinct from v_account_row.household_id then
    raise exception 'l''enfant et le compte ne sont pas du même foyer' using errcode = '22023';
  end if;

  -- D-01/D-08 : l'acteur est un adulte du foyer de la ligne enfant (admin OU
  -- membre, can_write_household), résolu depuis la session — jamais un
  -- paramètre (précédents 0036/0041/0132).
  if private.can_write_household(v_child_row.household_id) is not true then
    raise exception 'action réservée aux adultes du foyer' using errcode = '42501';
  end if;

  -- Rapport : compteurs d'ORIGINE par table, mesurés AVANT toute écriture.
  select jsonb_build_object(
    'tasks_created_by',      (select count(*) from public.tasks where created_by = p_child_member_id),
    'tasks_assigned_by',     (select count(*) from public.tasks where assigned_by_member_id = p_child_member_id),
    'task_assignees',        (select count(*) from public.task_assignees where member_id = p_child_member_id),
    'events_created_by',     (select count(*) from public.events where created_by = p_child_member_id),
    'event_categories',      (select count(*) from public.event_categories where created_by = p_child_member_id),
    'event_calendars_owned', (select count(*) from public.event_calendars where owner_member_id = p_child_member_id),
    'routines_created_by',   (select count(*) from public.routines where created_by = p_child_member_id),
    'routine_assignees',     (select count(*) from public.routine_assignees where member_id = p_child_member_id),
    'routine_completions',   (select count(*) from public.routine_completions
                               where completed_by = p_child_member_id
                                  or actor_member_id = p_child_member_id),
    'notes_created_by',      (select count(*) from public.notes where created_by = p_child_member_id),
    'posts_author',          (select count(*) from public.posts where author_id = p_child_member_id),
    'post_comments_author',  (select count(*) from public.post_comments where author_id = p_child_member_id),
    'post_reactions_author', (select count(*) from public.post_reactions where author_id = p_child_member_id),
    'conversation_members',  (select count(*) from public.conversation_members where member_id = p_child_member_id),
    'messages_sender',       (select count(*) from public.messages where sender_id = p_child_member_id),
    'expenses_paid_by',      (select count(*) from public.expenses where paid_by = p_child_member_id),
    'expenses_created_by',   (select count(*) from public.expenses where created_by = p_child_member_id),
    'expense_participants',  (select count(*) from public.expense_participants where member_id = p_child_member_id),
    'ardoise_members',       (select count(*) from public.ardoise_members where member_id = p_child_member_id),
    'birthdays_linked',      (select count(*) from public.birthdays where linked_member_id = p_child_member_id),
    'contacts_linked',       (select count(*) from public.contacts where linked_member_id = p_child_member_id),
    'gift_lists_owned',      (select count(*) from public.gift_lists where owner_member_id = p_child_member_id),
    'gift_items_reserved',   (select count(*) from public.gift_items where reserved_by = p_child_member_id),
    'gift_ideas_created_by', (select count(*) from public.gift_ideas where created_by = p_child_member_id),
    'gift_list_shares',      (select count(*) from public.gift_list_shares where shared_with_member_id = p_child_member_id),
    'products_created_by',   (select count(*) from public.products where created_by = p_child_member_id),
    'task_lists_owned',      (select count(*) from public.task_lists where owner_member_id = p_child_member_id),
    'note_folders_owned',    (select count(*) from public.note_folders where owner_member_id = p_child_member_id),
    'routine_folders_owned', (select count(*) from public.routine_folders where owner_member_id = p_child_member_id),
    'contact_lists_owned',   (select count(*) from public.contact_lists where owner_member_id = p_child_member_id),
    'trips_created_by',      (select count(*) from public.trips where created_by = p_child_member_id),
    'trip_members',          (select count(*) from public.trip_members where member_id = p_child_member_id),
    'recipes_created_by',    (select count(*) from public.recipes where created_by = p_child_member_id),
    'recipe_favorites',      (select count(*) from public.recipe_favorites where member_id = p_child_member_id),
    'pantry_items_created',  (select count(*) from public.pantry_items where created_by = p_child_member_id),
    'meal_entries_created',  (select count(*) from public.meal_entries where created_by = p_child_member_id),
    'meal_entries_member',   (select count(*) from public.meal_entries where p_child_member_id = any (member_ids)),
    'document_folders',      (select count(*) from public.document_folders where created_by = p_child_member_id),
    'documents_created',     (select count(*) from public.documents where created_by = p_child_member_id),
    'shopping_items_added',  (select count(*) from public.shopping_list_items where added_by = p_child_member_id),
    'loyalty_cards',         (select count(*) from public.loyalty_cards where member_id = p_child_member_id)
  ) into v_counts;

  -- -------------------------------------------------------------------------
  -- Backstop A6 : dédupliquer AVANT de réattribuer — la trace du compte fait
  -- foi. Chaque paire : (1) supprimer les lignes de l'enfant dont la clé
  -- existe déjà côté compte, (2) le reste partira en réattribution.
  -- -------------------------------------------------------------------------
  delete from public.task_assignees a
   using public.task_assignees b
   where a.task_id = b.task_id
     and a.member_id = p_child_member_id
     and b.member_id = p_account_member_id;

  delete from public.routine_assignees a
   using public.routine_assignees b
   where a.routine_id = b.routine_id
     and a.member_id = p_child_member_id
     and b.member_id = p_account_member_id;

  -- routine_completions : pas de déduplication nécessaire — la contrainte
  -- routine_completions_unique_occurrence (0003) interdit deux occurrences
  -- (routine_id, occurrence_date), donc l'update de réattribution ci-dessous
  -- ne peut pas violer la contrainte. 0149 portait ici un self-join de
  -- déduplication mort (il ne pouvait jamais matcher) ; supprimé en 0153.
  -- Si la contrainte devenait (routine_id, occurrence_date, completed_by),
  -- la déduplication redeviendrait nécessaire.

  delete from public.expense_participants a
   using public.expense_participants b
   where a.expense_id = b.expense_id
     and a.member_id = p_child_member_id
     and b.member_id = p_account_member_id;

  delete from public.post_reactions a
   using public.post_reactions b
   where a.post_id = b.post_id
     and a.reaction_type = b.reaction_type
     and a.author_id = p_child_member_id
     and b.author_id = p_account_member_id;

  delete from public.dashboard_widgets a
   using public.dashboard_widgets b
   where a.widget_type = b.widget_type
     and a.member_id = p_child_member_id
     and b.member_id = p_account_member_id;

  delete from public.recipe_favorites a
   using public.recipe_favorites b
   where a.recipe_id = b.recipe_id
     and a.member_id = p_child_member_id
     and b.member_id = p_account_member_id;

  delete from public.trip_members a
   using public.trip_members b
   where a.trip_id = b.trip_id
     and a.member_id = p_child_member_id
     and b.member_id = p_account_member_id;

  delete from public.conversation_members a
   using public.conversation_members b
   where a.conversation_id = b.conversation_id
     and a.member_id = p_child_member_id
     and b.member_id = p_account_member_id;

  -- 0149 (A6, complément) : ardoise_members, pk (ardoise_id, member_id).
  delete from public.ardoise_members a
   using public.ardoise_members b
   where a.ardoise_id = b.ardoise_id
     and a.member_id = p_child_member_id
     and b.member_id = p_account_member_id;

  -- 0151 (A6, complément) : gift_list_shares, index unique
  -- gift_list_shares_member_unique (list_id, shared_with_member_id), 0004/0015.
  delete from public.gift_list_shares a
   using public.gift_list_shares b
   where a.list_id = b.list_id
     and a.shared_with_member_id = p_child_member_id
     and b.shared_with_member_id = p_account_member_id;

  -- 0152 (A6, complément) : meal_entries.member_ids est un tableau — pas de
  -- clé composite à dédupliquer par jointure. Si le compte y figure déjà, on
  -- en retire l'enfant AVANT la réattribution : array_replace laisserait
  -- sinon le compte en double. L'ordre est préservé (unnest with ordinality).
  update public.meal_entries m
     set member_ids = (
       select coalesce(array_agg(u.x order by u.ord), '{}'::text[])
         from unnest(m.member_ids) with ordinality as u(x, ord)
        where u.x <> p_child_member_id
     )
   where p_account_member_id = any (m.member_ids)
     and p_child_member_id = any (m.member_ids);

  -- -------------------------------------------------------------------------
  -- Réattribution (D-20, sans fenêtre temporelle) — inventaire en tête de
  -- 0148 (inchangé).
  -- -------------------------------------------------------------------------
  update public.tasks set created_by = p_account_member_id where created_by = p_child_member_id;
  update public.tasks set assigned_by_member_id = p_account_member_id where assigned_by_member_id = p_child_member_id;
  update public.task_assignees set member_id = p_account_member_id where member_id = p_child_member_id;
  update public.events set created_by = p_account_member_id where created_by = p_child_member_id;
  update public.event_categories set created_by = p_account_member_id where created_by = p_child_member_id;
  update public.event_calendars set owner_member_id = p_account_member_id where owner_member_id = p_child_member_id;
  update public.routines set created_by = p_account_member_id where created_by = p_child_member_id;
  update public.routine_assignees set member_id = p_account_member_id where member_id = p_child_member_id;
  update public.routine_completions set completed_by = p_account_member_id where completed_by = p_child_member_id;
  update public.routine_completions set actor_member_id = p_account_member_id where actor_member_id = p_child_member_id;
  update public.notes set created_by = p_account_member_id where created_by = p_child_member_id;
  update public.posts set author_id = p_account_member_id where author_id = p_child_member_id;
  update public.post_comments set author_id = p_account_member_id where author_id = p_child_member_id;
  update public.post_reactions set author_id = p_account_member_id where author_id = p_child_member_id;
  update public.messages set sender_id = p_account_member_id where sender_id = p_child_member_id;
  update public.expenses set paid_by = p_account_member_id where paid_by = p_child_member_id;
  update public.expenses set created_by = p_account_member_id where created_by = p_child_member_id;
  update public.expense_participants set member_id = p_account_member_id where member_id = p_child_member_id;
  update public.ardoise_members set member_id = p_account_member_id where member_id = p_child_member_id;
  update public.birthdays set linked_member_id = p_account_member_id where linked_member_id = p_child_member_id;
  update public.contacts set linked_member_id = p_account_member_id where linked_member_id = p_child_member_id;
  update public.gift_lists set owner_member_id = p_account_member_id where owner_member_id = p_child_member_id;
  update public.gift_items set reserved_by = p_account_member_id where reserved_by = p_child_member_id;
  update public.gift_ideas set created_by = p_account_member_id where created_by = p_child_member_id;
  update public.gift_list_shares set shared_with_member_id = p_account_member_id where shared_with_member_id = p_child_member_id;
  update public.products set created_by = p_account_member_id where created_by = p_child_member_id;
  update public.task_lists set owner_member_id = p_account_member_id where owner_member_id = p_child_member_id;
  update public.note_folders set owner_member_id = p_account_member_id where owner_member_id = p_child_member_id;
  update public.routine_folders set owner_member_id = p_account_member_id where owner_member_id = p_child_member_id;
  update public.contact_lists set owner_member_id = p_account_member_id where owner_member_id = p_child_member_id;
  update public.trips set created_by = p_account_member_id where created_by = p_child_member_id;
  update public.trip_members set member_id = p_account_member_id where member_id = p_child_member_id;
  update public.recipes set created_by = p_account_member_id where created_by = p_child_member_id;
  update public.recipe_favorites set member_id = p_account_member_id where member_id = p_child_member_id;
  update public.pantry_items set created_by = p_account_member_id where created_by = p_child_member_id;
  update public.meal_entries set created_by = p_account_member_id where created_by = p_child_member_id;
  update public.meal_entries set member_ids = array_replace(member_ids, p_child_member_id, p_account_member_id)
   where p_child_member_id = any (member_ids);
  update public.document_folders set created_by = p_account_member_id where created_by = p_child_member_id;
  update public.documents set created_by = p_account_member_id where created_by = p_child_member_id;
  update public.shopping_list_items set added_by = p_account_member_id where added_by = p_child_member_id;
  update public.loyalty_cards set member_id = p_account_member_id where member_id = p_child_member_id;
  update public.conversation_members set member_id = p_account_member_id where member_id = p_child_member_id;

  -- -------------------------------------------------------------------------
  -- Suppression de la ligne profil EN DERNIER — toutes les traces sont
  -- réattribuées ou dédupliquées. L'invariant 0145 n'est jamais violé : la
  -- ligne sortante est role 'enfant' sans compte. Les cascades ne trouvent
  -- plus rien à purger.
  -- -------------------------------------------------------------------------
  delete from public.household_members where id = p_child_member_id;

  return v_counts || jsonb_build_object(
    'merged', true,
    'child', p_child_member_id,
    'account', p_account_member_id
  );
end;
$$;

comment on function public.link_managed_child(text, text) is
  'D-19/D-20 : fusionne la ligne enfant dans le compte adulte du même foyer (même foyer obligatoire, D-22). Déduplique (A6, y compris ardoise_members 0149, gift_list_shares 0151 et le tableau meal_entries.member_ids 0152 ; le self-join routine_completions mort de 0149 est supprimé en 0153 — contrainte routine_completions_unique_occurrence, 0003) puis réattribue toutes les traces inventoriées en tête de 0148, supprime la ligne enfant EN DERNIER. Rapport jsonb par table, compteurs d''origine. USAGE AUTHENTIFIÉ UNIQUEMENT.';

-- Privilèges : identiques à 0148 (create or replace recrée les ACL).
revoke all on function public.link_managed_child(text, text) from public, anon;
grant execute on function public.link_managed_child(text, text) to authenticated;


-- V2 : les politiques Cercle D-12 de 0149, recopiées (une politique n'est pas
-- additive — la redéfinir est la seule façon de la conserver).

drop policy if exists posts_delete_admin on public.posts;
create policy posts_delete_admin on public.posts
  for delete using (
    author_id = private.current_member_id(household_id)
    or (
      private.can_write_household(household_id)
      and private.is_managed_child(author_id)
    )
  );

drop policy if exists post_comments_delete_admin on public.post_comments;
create policy post_comments_delete_admin on public.post_comments
  for delete using (
    author_id = private.current_member_id(household_id)
    or (
      private.can_write_household(household_id)
      and private.is_managed_child(author_id)
    )
  );

drop policy if exists post_reactions_delete_admin on public.post_reactions;
create policy post_reactions_delete_admin on public.post_reactions
  for delete using (
    author_id = private.current_member_id(household_id)
    or (
      private.can_write_household(household_id)
      and private.is_managed_child(author_id)
    )
  );

commit;
