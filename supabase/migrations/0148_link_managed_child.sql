-- 0148_link_managed_child.sql
-- Fusion d'un enfant géré dans son compte : réattribution des traces (D-19/D-20/D-18bis).
--
-- POURQUOI CE RPC
--   D-22 fait de la ligne `household_members` la racine d'un profil enfant.
--   Quand la famille crée le compte Plus tard (invariant 0145 : un enfant
--   géré n'a jamais de session), les traces portées par la ligne enfant —
--   issues de la conversion 0145 ou des gardes 0146 — doivent suivre le
--   compte avant sa suppression. D-19/D-20 : un RPC unique, transactionnel,
--   rapporté par table. Le client D-21 l'appellera ; RGDP-06 (phase 27,
--   purge d'un membre) réutilisera la même mécanique — l'inventaire ci-
--   dessous lui sert de carte.
--
-- INVENTAIRE DES COLONNES DE TRACE (grep sur les migrations, 2026-10-25 ;
-- la source est le dépôt, jamais la mémoire) — tout `references
-- public.household_members` :
--   0003 : tasks/events/routines/notes.created_by (set null) ;
--     task_assignees.member_id (pk (task_id, member_id)) ;
--     routine_assignees.member_id (pk (routine_id, member_id)) ;
--     routine_completions.completed_by (unique (routine_id, occurrence_date)) ;
--     shopping_list_items.added_by (set null).
--   0004 : posts/post_comments/post_reactions.author_id (réactions : unique
--     (post_id, author_id, reaction_type)) ; messages.sender_id (not null,
--     cascade) ; expenses.paid_by (not null, restrict) ;
--     expense_participants.member_id (unique nulls not distinct
--     (expense_id, member_id)) ; birthdays.linked_member_id (set null) ;
--     gift_lists.owner_member_id (not null, cascade) ;
--     gift_items.reserved_by (set null) ;
--     gift_list_shares.shared_with_member_id (cascade) ;
--     conversation_members.member_id (pk (conversation_id, member_id)) ;
--     dashboard_widgets.member_id (unique (member_id, widget_type)) ;
--     loyalty_cards.member_id (set null).
--   0047 : event_categories.created_by (set null) ;
--     event_calendars.owner_member_id (perso, cascade).
--   0050 : task_lists / note_folders / routine_folders.owner_member_id
--     (not null, cascade).
--   0055 : ardoise_members.member_id (pk (ardoise_id, member_id)).
--   0071 : products.created_by (set null).
--   0076 : gift_ideas.created_by (set null).
--   0077 : contact_lists.owner_member_id (cascade) ;
--     contacts.linked_member_id (cascade).
--   0118 : trips.created_by (set null) ; trip_members.member_id
--     (pk (trip_id, member_id)).
--   0121 : expenses.created_by (set null).
--   0122 : recipes.created_by (set null) ; recipe_favorites.member_id
--     (pk (recipe_id, member_id)).
--   0141/0142/0143 : pantry_items / meal_entries / document_folders /
--     documents.created_by (set null) ; meal_entries.member_ids text[]
--     (array_replace).
--   0146 : tasks.assigned_by_member_id et
--     routine_completions.actor_member_id (ENF-03, set null).
--
-- TRACE DÉRIVÉE, JAMAIS ÉCRITE DIRECTEMENT
--   conversation_membership_periods (0105) est tenue par des déclencheurs
--   sur conversation_members (insert/update/delete). Réattribuer la ligne
--   conversation_members déplace les fenêtres de présence par déclencheur ;
--   écrire la table dérivée ici dupliquerait l'écriture. Aucune opération.
--
-- ORDRE STRICT (backstop A6)
--   Dédupliquer AVANT de réattribuer — la trace du compte fait foi. La ligne
--   profil est supprimée EN DERNIER. L'invariant 0145 n'est jamais violé :
--   la ligne sortante est role 'enfant' sans compte, et les cascades ne
--   trouvent plus rien à purger.
--
-- PRIVILÈGES : grant authenticated (surface client D-21), revoke public/anon.

begin;

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
  delete from public.task_assignees where member_id = p_child_member_id;

  delete from public.routine_assignees a
   using public.routine_assignees b
   where a.routine_id = b.routine_id
     and a.member_id = p_child_member_id
     and b.member_id = p_account_member_id;
  delete from public.routine_assignees where member_id = p_child_member_id;

  delete from public.routine_completions a
   using public.routine_completions b
   where a.routine_id = b.routine_id
     and a.occurrence_date = b.occurrence_date
     and a.completed_by = p_child_member_id
     and b.completed_by = p_account_member_id;
  delete from public.routine_completions where completed_by = p_child_member_id;

  delete from public.expense_participants a
   using public.expense_participants b
   where a.expense_id = b.expense_id
     and a.member_id = p_child_member_id
     and b.member_id = p_account_member_id;
  delete from public.expense_participants where member_id = p_child_member_id;

  delete from public.post_reactions a
   using public.post_reactions b
   where a.post_id = b.post_id
     and a.reaction_type = b.reaction_type
     and a.author_id = p_child_member_id
     and b.author_id = p_account_member_id;
  delete from public.post_reactions where author_id = p_child_member_id;

  delete from public.dashboard_widgets a
   using public.dashboard_widgets b
   where a.widget_type = b.widget_type
     and a.member_id = p_child_member_id
     and b.member_id = p_account_member_id;
  delete from public.dashboard_widgets where member_id = p_child_member_id;

  delete from public.recipe_favorites a
   using public.recipe_favorites b
   where a.recipe_id = b.recipe_id
     and a.member_id = p_child_member_id
     and b.member_id = p_account_member_id;
  delete from public.recipe_favorites where member_id = p_child_member_id;

  delete from public.trip_members a
   using public.trip_members b
   where a.trip_id = b.trip_id
     and a.member_id = p_child_member_id
     and b.member_id = p_account_member_id;
  delete from public.trip_members where member_id = p_child_member_id;

  delete from public.conversation_members a
   using public.conversation_members b
   where a.conversation_id = b.conversation_id
     and a.member_id = p_child_member_id
     and b.member_id = p_account_member_id;
  delete from public.conversation_members where member_id = p_child_member_id;

  -- -------------------------------------------------------------------------
  -- Réattribution (D-20, sans fenêtre temporelle) — inventaire en tête.
  -- L'enfant et le compte sont du même foyer (D-22) : la réattribution ne
  -- fuit pas vers un autre foyer.
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
  -- ligne sortante est role 'enfant' sans compte. Les cascades 0003 ne
  -- trouvent plus rien à purger ; les FK `on delete set null` (documents,
  -- pets, loyalty...) sont sans objet : plus rien ne pointe vers l'enfant.
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
  'D-19/D-20 : fusionne la ligne enfant dans le compte adulte du même foyer (même foyer obligatoire, D-22). Déduplique (A6) puis réattribue toutes les traces inventoriées en tête, supprime la ligne enfant EN DERNIER. Rapport jsonb par table, compteurs d''origine. USAGE AUTHENTIFIÉ UNIQUEMENT.';

-- D-21 (phase 25) et RGDP-06 (phase 27) en sont les clients.
revoke all on function public.link_managed_child(text, text) from public, anon;
grant execute on function public.link_managed_child(text, text) to authenticated;

commit;
