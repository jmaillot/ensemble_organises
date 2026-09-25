-- 0007_rls_policies.sql
-- RLS : la frontière d'autorisation finale.
--
-- Toutes les tables métier ont RLS activée depuis leur migration de création.
-- Deux familles de politiques :
--
--   1. Les tables « foyer plat » (household_id + rôle de l'auteur) suivent le
--      même motif, généré ici pour éviter 200 déclarations divergentes :
--        SELECT  -> private.is_household_member(household_id)
--        INSERT  -> private.can_write_household(household_id) + auteur = moi
--        UPDATE  -> private.can_write_household(household_id) + auteur = moi
--        DELETE  -> private.is_household_admin(household_id)
--
--   2. Les tables à visibilité propre (foyers, membres, profils, cadeaux,
--      conversations, messages, widgets, tables enfants) ont des politiques
--      explicites, écrites à la main juste après.
--
-- Le rôle `enfant` est en lecture seule : `can_write_household` n'accepte que
-- `admin` et `membre`.

begin;

-- ---------------------------------------------------------------------------
-- Utilitaires d'accès par parent (tables enfants sans household_id)
-- ---------------------------------------------------------------------------
create or replace function private.parent_household_id(p_parent_table text, p_parent_id text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_household_id text;
begin
  execute format(
    'select household_id from public.%I where id = $1',
    p_parent_table
  ) into v_household_id using p_parent_id;
  return v_household_id;
end;
$$;

create or replace function private.can_read_event(p_event_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_household_member(private.parent_household_id('events', p_event_id));
$$;

create or replace function private.can_write_event(p_event_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_write_household(private.parent_household_id('events', p_event_id));
$$;

create or replace function private.can_admin_event(p_event_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_household_admin(private.parent_household_id('events', p_event_id));
$$;

create or replace function private.can_read_task(p_task_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_household_member(private.parent_household_id('tasks', p_task_id));
$$;

create or replace function private.can_write_task(p_task_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_write_household(private.parent_household_id('tasks', p_task_id));
$$;

create or replace function private.can_admin_task(p_task_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_household_admin(private.parent_household_id('tasks', p_task_id));
$$;

create or replace function private.can_read_routine(p_routine_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_household_member(private.parent_household_id('routines', p_routine_id));
$$;

create or replace function private.can_write_routine(p_routine_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_write_household(private.parent_household_id('routines', p_routine_id));
$$;

create or replace function private.can_admin_routine(p_routine_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_household_admin(private.parent_household_id('routines', p_routine_id));
$$;

create or replace function private.can_read_expense(p_expense_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_household_member(private.parent_household_id('expenses', p_expense_id));
$$;

create or replace function private.can_write_expense(p_expense_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_write_household(private.parent_household_id('expenses', p_expense_id));
$$;

create or replace function private.conversation_household_id(p_conversation_id text)
returns text language sql stable security definer set search_path = '' as $$
  select c.household_id from public.conversations c where c.id = p_conversation_id;
$$;

create or replace function private.can_admin_conversation(p_conversation_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_household_admin(private.conversation_household_id(p_conversation_id));
$$;

-- Participer à une conversation : membre déjà présent, ou administrateur du
-- foyer qui peut faire entrer quelqu'un.
create or replace function private.can_join_conversation(p_conversation_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_conversation_member(p_conversation_id)
     or private.is_household_admin(private.conversation_household_id(p_conversation_id));
$$;

create or replace function private.can_send_message(
  p_conversation_id text,
  p_sender_id text,
  p_household_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_conversation_member(p_conversation_id)
     and private.member_in_household(p_sender_id, p_household_id)
     and p_sender_id = private.current_member_id(p_household_id)
     and private.conversation_household_id(p_conversation_id) = p_household_id;
$$;

-- Un foyer vient d'être créé : son créateur n'est pas encore membre.
create or replace function private.is_household_creator(p_household_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.households h
     where h.id = p_household_id and h.created_by = auth.uid()
  );
$$;

create or replace function private.gift_list_household_id(p_list_id text)
returns text language sql stable security definer set search_path = '' as $$
  select l.household_id from public.gift_lists l where l.id = p_list_id;
$$;

create or replace function private.can_manage_gift_list(p_list_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.gift_lists l
     where l.id = p_list_id
       and (
         l.owner_member_id = private.current_member_id(l.household_id)
         or private.is_household_admin(l.household_id)
       )
  );
$$;

-- ---------------------------------------------------------------------------
-- 1. Tables « foyer plat » : motif commun, politiques générées.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_ref_cond text;
begin
  for r in
    select *
    from (values
      ('shopping_lists',        array['created_by']::text[]),
      ('shopping_list_items',   array['added_by']::text[]),
      ('events',                array['created_by']::text[]),
      ('notes',                 array['created_by']::text[]),
      ('tasks',                 array['created_by']::text[]),
      ('routines',              array['created_by']::text[]),
      ('routine_completions',   array['completed_by']::text[]),
      ('recipes',               array[]::text[]),
      ('external_participants', array[]::text[]),
      ('pets',                  array[]::text[]),
      ('pet_records',           array[]::text[]),
      ('provider_types',        array[]::text[]),
      ('providers',             array[]::text[]),
      ('loyalty_cards',         array['member_id']::text[]),
      ('birthdays',             array['linked_member_id']::text[]),
      ('places',                array[]::text[]),
      ('trips',                 array[]::text[]),
      ('post_media',            array[]::text[]),
      ('posts',                 array['author_id']::text[]),
      ('post_comments',         array['author_id']::text[]),
      ('post_reactions',        array['author_id']::text[])
    ) as t(table_name, ref_columns)
  loop
    -- Les colonnes d'auteur doivent être nulles ou désigner le membre courant :
    -- impossible d'écrire au nom d'un autre membre du foyer.
    if coalesce(cardinality(r.ref_columns), 0) > 0 then
      v_ref_cond := ' and (' || array_to_string(
        array(
          select format('%I is null or %I = private.current_member_id(household_id)', c, c)
            from unnest(r.ref_columns) as c
        ),
        ' and '
      ) || ')';
    else
      v_ref_cond := '';
    end if;

    execute format('drop policy if exists %I on public.%I', r.table_name || '_select_household', r.table_name);
    execute format(
      'create policy %I on public.%I for select using (private.is_household_member(household_id))',
      r.table_name || '_select_household', r.table_name
    );

    execute format('drop policy if exists %I on public.%I', r.table_name || '_insert_household', r.table_name);
    execute format(
      'create policy %I on public.%I for insert with check (private.can_write_household(household_id)%s)',
      r.table_name || '_insert_household', r.table_name, v_ref_cond
    );

    execute format('drop policy if exists %I on public.%I', r.table_name || '_update_household', r.table_name);
    execute format(
      'create policy %I on public.%I for update using (private.can_write_household(household_id))'
      ' with check (private.can_write_household(household_id)%s)',
      r.table_name || '_update_household', r.table_name, v_ref_cond
    );

    execute format('drop policy if exists %I on public.%I', r.table_name || '_delete_admin', r.table_name);
    execute format(
      'create policy %I on public.%I for delete using (private.is_household_admin(household_id))',
      r.table_name || '_delete_admin', r.table_name
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Foyers, membres, profils, invitations
-- ---------------------------------------------------------------------------
drop policy if exists households_select on public.households;
create policy households_select on public.households
  for select using (private.is_household_member(id));

drop policy if exists households_insert on public.households;
create policy households_insert on public.households
  for insert with check (created_by = auth.uid());

drop policy if exists households_update on public.households;
create policy households_update on public.households
  for update using (private.is_household_admin(id))
  with check (private.is_household_admin(id));

drop policy if exists households_delete on public.households;
create policy households_delete on public.households
  for delete using (private.is_household_admin(id));

-- Les membres d'un foyer sont visibles par les autres membres du même foyer.
drop policy if exists household_members_select on public.household_members;
create policy household_members_select on public.household_members
  for select using (private.is_household_member(household_id));

-- Deux cas d'insertion autorisés :
--   * je crée mon foyer et j'en suis le premier administrateur ;
--   * je suis administrateur d'un foyer existant et j'ajoute un membre.
drop policy if exists household_members_insert on public.household_members;
create policy household_members_insert on public.household_members
  for insert with check (
    (user_id = auth.uid() and role = 'admin' and private.is_household_creator(household_id))
    or (auth.uid() is not null and private.is_household_admin(household_id))
  );

-- Seul un administrateur change un rôle : aucun auto-attribut de privilège.
drop policy if exists household_members_update on public.household_members;
create policy household_members_update on public.household_members
  for update using (private.is_household_admin(household_id))
  with check (private.is_household_admin(household_id));

-- Le dernier administrateur d'un foyer ne peut pas être supprimé.
drop policy if exists household_members_delete on public.household_members;
create policy household_members_delete on public.household_members
  for delete using (
    private.is_household_admin(household_id)
    and not (role = 'admin' and private.household_admin_count(household_id) = 1)
  );

-- Profils : lecture de son propre profil et des profils d'un foyer commun.
-- Aucune politique d'insertion : le profil est créé par le trigger de 0008.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1
        from public.household_members mine
        join public.household_members other
          on other.household_id = mine.household_id
       where mine.user_id = auth.uid()
         and other.user_id = profiles.id
    )
  );

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());

-- Invitations ciblées : gérées par les administrateurs du foyer.
drop policy if exists invitations_select on public.invitations;
create policy invitations_select on public.invitations
  for select using (private.is_household_member(household_id));

drop policy if exists invitations_insert on public.invitations;
create policy invitations_insert on public.invitations
  for insert with check (private.is_household_admin(household_id));

drop policy if exists invitations_update on public.invitations;
create policy invitations_update on public.invitations
  for update using (private.is_household_admin(household_id))
  with check (private.is_household_admin(household_id));

drop policy if exists invitations_delete on public.invitations;
create policy invitations_delete on public.invitations
  for delete using (private.is_household_admin(household_id));

-- household_invite_tokens : aucune politique, donc aucun accès client possible
-- (ni lecture, ni écriture, ni inférence). Vérifié par supabase/tests.

-- ---------------------------------------------------------------------------
-- 3. Tables enfants : accès dérivé du parent
-- ---------------------------------------------------------------------------
drop policy if exists event_reminders_select on public.event_reminders;
create policy event_reminders_select on public.event_reminders
  for select using (private.can_read_event(event_id));

drop policy if exists event_reminders_insert on public.event_reminders;
create policy event_reminders_insert on public.event_reminders
  for insert with check (private.can_write_event(event_id));

drop policy if exists event_reminders_update on public.event_reminders;
create policy event_reminders_update on public.event_reminders
  for update using (private.can_write_event(event_id))
  with check (private.can_write_event(event_id));

drop policy if exists event_reminders_delete on public.event_reminders;
create policy event_reminders_delete on public.event_reminders
  for delete using (private.can_admin_event(event_id));

drop policy if exists task_assignees_select on public.task_assignees;
create policy task_assignees_select on public.task_assignees
  for select using (private.can_read_task(task_id));

drop policy if exists task_assignees_insert on public.task_assignees;
create policy task_assignees_insert on public.task_assignees
  for insert with check (
    private.can_write_task(task_id)
    and private.member_in_household(
      member_id, private.parent_household_id('tasks', task_id)
    )
  );

drop policy if exists task_assignees_update on public.task_assignees;
create policy task_assignees_update on public.task_assignees
  for update using (private.can_write_task(task_id))
  with check (private.can_write_task(task_id));

drop policy if exists task_assignees_delete on public.task_assignees;
create policy task_assignees_delete on public.task_assignees
  for delete using (private.can_admin_task(task_id));

drop policy if exists task_reminders_select on public.task_reminders;
create policy task_reminders_select on public.task_reminders
  for select using (private.can_read_task(task_id));

drop policy if exists task_reminders_insert on public.task_reminders;
create policy task_reminders_insert on public.task_reminders
  for insert with check (private.can_write_task(task_id));

drop policy if exists task_reminders_update on public.task_reminders;
create policy task_reminders_update on public.task_reminders
  for update using (private.can_write_task(task_id))
  with check (private.can_write_task(task_id));

drop policy if exists task_reminders_delete on public.task_reminders;
create policy task_reminders_delete on public.task_reminders
  for delete using (private.can_admin_task(task_id));

drop policy if exists routine_assignees_select on public.routine_assignees;
create policy routine_assignees_select on public.routine_assignees
  for select using (private.can_read_routine(routine_id));

drop policy if exists routine_assignees_insert on public.routine_assignees;
create policy routine_assignees_insert on public.routine_assignees
  for insert with check (
    private.can_write_routine(routine_id)
    and private.member_in_household(
      member_id, private.parent_household_id('routines', routine_id)
    )
  );

drop policy if exists routine_assignees_update on public.routine_assignees;
create policy routine_assignees_update on public.routine_assignees
  for update using (private.can_write_routine(routine_id))
  with check (private.can_write_routine(routine_id));

drop policy if exists routine_assignees_delete on public.routine_assignees;
create policy routine_assignees_delete on public.routine_assignees
  for delete using (private.can_admin_routine(routine_id));

drop policy if exists routine_reminders_select on public.routine_reminders;
create policy routine_reminders_select on public.routine_reminders
  for select using (private.can_read_routine(routine_id));

drop policy if exists routine_reminders_insert on public.routine_reminders;
create policy routine_reminders_insert on public.routine_reminders
  for insert with check (private.can_write_routine(routine_id));

drop policy if exists routine_reminders_update on public.routine_reminders;
create policy routine_reminders_update on public.routine_reminders
  for update using (private.can_write_routine(routine_id))
  with check (private.can_write_routine(routine_id));

drop policy if exists routine_reminders_delete on public.routine_reminders;
create policy routine_reminders_delete on public.routine_reminders
  for delete using (private.can_admin_routine(routine_id));

drop policy if exists expense_participants_select on public.expense_participants;
create policy expense_participants_select on public.expense_participants
  for select using (private.can_read_expense(expense_id));

drop policy if exists expense_participants_insert on public.expense_participants;
create policy expense_participants_insert on public.expense_participants
  for insert with check (private.can_write_expense(expense_id));

drop policy if exists expense_participants_update on public.expense_participants;
create policy expense_participants_update on public.expense_participants
  for update using (private.can_write_expense(expense_id))
  with check (private.can_write_expense(expense_id));

drop policy if exists expense_participants_delete on public.expense_participants;
create policy expense_participants_delete on public.expense_participants
  for delete using (private.can_write_expense(expense_id));

-- ---------------------------------------------------------------------------
-- 4. Cadeaux : visibilité par liste
-- ---------------------------------------------------------------------------
drop policy if exists gift_lists_select on public.gift_lists;
create policy gift_lists_select on public.gift_lists
  for select using (private.can_read_gift_list(id));

drop policy if exists gift_lists_insert on public.gift_lists;
create policy gift_lists_insert on public.gift_lists
  for insert with check (
    private.can_write_household(household_id)
    and private.member_in_household(owner_member_id, household_id)
  );

drop policy if exists gift_lists_update on public.gift_lists;
create policy gift_lists_update on public.gift_lists
  for update using (private.can_write_gift_list(id))
  with check (private.can_write_gift_list(id) and private.member_in_household(owner_member_id, household_id));

drop policy if exists gift_lists_delete on public.gift_lists;
create policy gift_lists_delete on public.gift_lists
  for delete using (private.can_manage_gift_list(id));

drop policy if exists gift_items_select on public.gift_items;
create policy gift_items_select on public.gift_items
  for select using (private.can_read_gift_list(list_id));

drop policy if exists gift_items_insert on public.gift_items;
create policy gift_items_insert on public.gift_items
  for insert with check (
    private.can_write_gift_list(list_id)
    and private.member_in_household(
      coalesce(reserved_by, private.current_member_id(private.gift_list_household_id(list_id))),
      private.gift_list_household_id(list_id)
    )
  );

drop policy if exists gift_items_update on public.gift_items;
create policy gift_items_update on public.gift_items
  for update using (private.can_write_gift_list(list_id))
  with check (private.can_write_gift_list(list_id));

drop policy if exists gift_items_delete on public.gift_items;
create policy gift_items_delete on public.gift_items
  for delete using (private.can_write_gift_list(list_id));

drop policy if exists gift_list_shares_select on public.gift_list_shares;
create policy gift_list_shares_select on public.gift_list_shares
  for select using (private.can_read_gift_list(list_id));

drop policy if exists gift_list_shares_insert on public.gift_list_shares;
create policy gift_list_shares_insert on public.gift_list_shares
  for insert with check (
    private.can_manage_gift_list(list_id)
    and (
      shared_with_member_id is null
      or private.member_in_household(
        shared_with_member_id, private.gift_list_household_id(list_id)
      )
    )
  );

drop policy if exists gift_list_shares_update on public.gift_list_shares;
create policy gift_list_shares_update on public.gift_list_shares
  for update using (private.can_manage_gift_list(list_id))
  with check (private.can_manage_gift_list(list_id));

drop policy if exists gift_list_shares_delete on public.gift_list_shares;
create policy gift_list_shares_delete on public.gift_list_shares
  for delete using (private.can_manage_gift_list(list_id));

-- ---------------------------------------------------------------------------
-- 5. Conversations et messages
-- ---------------------------------------------------------------------------
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select using (private.is_conversation_member(id));

drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations
  for insert with check (private.can_write_household(household_id));

drop policy if exists conversations_update on public.conversations;
create policy conversations_update on public.conversations
  for update using (private.is_household_admin(household_id))
  with check (private.is_household_admin(household_id));

drop policy if exists conversations_delete on public.conversations;
create policy conversations_delete on public.conversations
  for delete using (private.is_household_admin(household_id));

drop policy if exists conversation_members_select on public.conversation_members;
create policy conversation_members_select on public.conversation_members
  for select using (private.is_conversation_member(conversation_id));

drop policy if exists conversation_members_insert on public.conversation_members;
create policy conversation_members_insert on public.conversation_members
  for insert with check (
    private.can_join_conversation(conversation_id)
    and private.member_in_household(
      member_id, private.conversation_household_id(conversation_id)
    )
  );

drop policy if exists conversation_members_delete on public.conversation_members;
create policy conversation_members_delete on public.conversation_members
  for delete using (
    private.can_admin_conversation(conversation_id)
    or (
      private.is_conversation_member(conversation_id)
      and member_id = private.current_member_id(private.conversation_household_id(conversation_id))
    )
  );

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (private.is_conversation_member(conversation_id));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (
    private.can_send_message(conversation_id, sender_id, household_id)
  );

drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages
  for update using (sender_id = private.current_member_id(household_id))
  with check (
    sender_id = private.current_member_id(household_id)
    and private.can_send_message(conversation_id, sender_id, household_id)
  );

drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages
  for delete using (
    private.can_admin_conversation(conversation_id)
    or sender_id = private.current_member_id(household_id)
  );

-- ---------------------------------------------------------------------------
-- 6. Widgets du tableau de bord : préférences strictement personnelles
-- ---------------------------------------------------------------------------
drop policy if exists dashboard_widgets_select on public.dashboard_widgets;
create policy dashboard_widgets_select on public.dashboard_widgets
  for select using (member_id = private.current_member_id(household_id));

drop policy if exists dashboard_widgets_insert on public.dashboard_widgets;
create policy dashboard_widgets_insert on public.dashboard_widgets
  for insert with check (
    private.can_write_household(household_id)
    and member_id = private.current_member_id(household_id)
  );

drop policy if exists dashboard_widgets_update on public.dashboard_widgets;
create policy dashboard_widgets_update on public.dashboard_widgets
  for update using (member_id = private.current_member_id(household_id))
  with check (member_id = private.current_member_id(household_id));

drop policy if exists dashboard_widgets_delete on public.dashboard_widgets;
create policy dashboard_widgets_delete on public.dashboard_widgets
  for delete using (member_id = private.current_member_id(household_id));

commit;
