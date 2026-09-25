-- 0005_indexes_and_constraints.sql
-- Index deFK, index de filtrage RLS (household_id) et unicités métier.

begin;

-- ---------------------------------------------------------------------------
-- Index sur les clés étrangères (jointures fréquentes + suppression en cascade)
-- ---------------------------------------------------------------------------
create index household_members_user_id_idx on public.household_members (user_id);
create index household_members_household_role_idx on public.household_members (household_id, role);
create index household_invite_tokens_household_idx on public.household_invite_tokens (household_id, is_active);

create index shopping_list_items_list_idx on public.shopping_list_items (list_id);
create index event_reminders_event_idx on public.event_reminders (event_id);
create index task_assignees_member_idx on public.task_assignees (member_id);
create index task_reminders_task_idx on public.task_reminders (task_id);
create index routine_assignees_member_idx on public.routine_assignees (member_id);
create index routine_reminders_routine_idx on public.routine_reminders (routine_id);
create index routine_completions_household_date_idx on public.routine_completions (household_id, occurrence_date desc);
create index routine_completions_status_idx on public.routine_completions (status);

create index expense_participants_expense_idx on public.expense_participants (expense_id);
create index expense_participants_member_idx on public.expense_participants (member_id);
create index gift_items_list_idx on public.gift_items (list_id);
create index gift_list_shares_member_idx on public.gift_list_shares (shared_with_member_id);
create index pet_records_pet_idx on public.pet_records (pet_id);
create index pet_records_next_due_idx on public.pet_records (household_id, next_due_date);
create index providers_type_idx on public.providers (provider_type_id);
create index loyalty_cards_member_idx on public.loyalty_cards (member_id);
create index places_household_type_idx on public.places (household_id, type);
create index post_media_post_idx on public.post_media (post_id);
create index post_comments_post_idx on public.post_comments (post_id);
create index post_reactions_post_idx on public.post_reactions (post_id);
create index conversation_members_member_idx on public.conversation_members (member_id);
create index messages_conversation_idx on public.messages (conversation_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Index de filtrage RLS : chaque politique parcourt `household_id`.
-- ---------------------------------------------------------------------------
create index events_household_start_idx on public.events (household_id, start_at);
create index notes_household_updated_idx on public.notes (household_id, updated_at desc);
create index tasks_household_due_idx on public.tasks (household_id, due_date);
create index routines_household_idx on public.routines (household_id);
create index shopping_lists_household_idx on public.shopping_lists (household_id);
create index shopping_list_items_household_idx on public.shopping_list_items (household_id);
create index expenses_household_date_idx on public.expenses (household_id, expense_date desc);
create index external_participants_household_idx on public.external_participants (household_id);
create index gift_lists_household_idx on public.gift_lists (household_id);
create index gift_items_household_idx on public.gift_items (household_id);
create index birthdays_household_idx on public.birthdays (household_id, birth_date);
create index pets_household_idx on public.pets (household_id);
create index pet_records_household_idx on public.pet_records (household_id);
create index provider_types_household_idx on public.provider_types (household_id);
create index providers_household_idx on public.providers (household_id);
create index loyalty_cards_household_idx on public.loyalty_cards (household_id);
create index posts_household_created_idx on public.posts (household_id, created_at desc);
create index post_media_household_idx on public.post_media (household_id);
create index post_comments_household_idx on public.post_comments (household_id);
create index post_reactions_household_idx on public.post_reactions (household_id);
create index trips_household_idx on public.trips (household_id, start_date desc);
create index conversations_household_idx on public.conversations (household_id);
create index messages_household_idx on public.messages (household_id, created_at desc);
create index dashboard_widgets_member_idx on public.dashboard_widgets (member_id, position_y, position_x);
create index routine_completions_lookup_idx on public.routine_completions (routine_id, occurrence_date);

-- ---------------------------------------------------------------------------
-- Unicités métier complémentaires
-- ---------------------------------------------------------------------------
-- Un foyer ne porte qu'une liste de courses de même nom.
alter table public.shopping_lists
  add constraint shopping_lists_name_unique
  unique (household_id, name);
-- Un événement est identifiable par foyer + titre + début.
create index events_identity_idx on public.events (household_id, start_at, title);
-- Une conversation de groupe porte un titre, une conversation directe non.
alter table public.conversations
  add constraint conversations_title_check
  check ((type = 'groupe') = (title is not null));

commit;
