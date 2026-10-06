-- 0081_author_update_fix.sql
-- Les politiques UPDATE exigeaient `created_by = moi` dans le WITH CHECK :
-- cocher une tâche créée par un autre membre échouait avec
-- « new row violates row-level security policy for table "tasks" ».
-- Le WITH CHECK porte sur la NOUVELLE ligne entière, donc même un simple
-- changement de `status` était refusé quand `created_by` désignait autrui.
--
-- Correction : le WITH CHECK des UPDATE ne vérifie plus que le rôle
-- d'écriture (+ visibilité du dossier pour tasks/notes/routines).
-- L'anti-usurpation à l'INSERT est inchangée, et un trigger
-- `guard_author_immutable` interdit de changer la colonne d'auteur en UPDATE.
-- Les colonnes d'affectation (`loyalty_cards.member_id`,
-- `birthdays.linked_member_id`) restent modifiables : seule leur politique
-- est assouplie, sans trigger.

begin;

-- ---------------------------------------------------------------------------
-- Garde-fou : une colonne d'auteur ne change pas en UPDATE.
-- ---------------------------------------------------------------------------
create or replace function private.guard_author_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_column text := tg_argv[0];
  v_old text;
  v_new text;
begin
  if current_user in ('anon', 'authenticated') then
    v_old := to_jsonb(old) ->> v_column;
    v_new := to_jsonb(new) ->> v_column;
    if v_new is distinct from v_old then
      raise exception 'la colonne % n''est pas modifiable par le client', v_column
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

comment on function private.guard_author_immutable() is
  'Colonnes d''auteur immuables en UPDATE client ; la RLS autorise le contenu, le trigger fige l''auteur.';

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('shopping_lists',      'created_by'),
      ('shopping_list_items', 'added_by'),
      ('events',              'created_by'),
      ('notes',               'created_by'),
      ('tasks',               'created_by'),
      ('routines',            'created_by'),
      ('routine_completions', 'completed_by'),
      ('posts',               'author_id'),
      ('post_comments',       'author_id'),
      ('post_reactions',      'author_id')
    ) as t(table_name, column_name)
  loop
    execute format('drop trigger if exists guard_author_immutable on public.%I', r.table_name);
    execute format(
      'create trigger guard_author_immutable before update on public.%I'
      ' for each row execute function private.guard_author_immutable(%L)',
      r.table_name, r.column_name
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- UPDATE : même USING qu'avant, WITH CHECK sans condition d'auteur.
-- ---------------------------------------------------------------------------
drop policy if exists shopping_lists_update_household on public.shopping_lists;
create policy shopping_lists_update_household on public.shopping_lists
  for update using (private.can_write_household(household_id))
  with check (private.can_write_household(household_id));

drop policy if exists shopping_list_items_update_household on public.shopping_list_items;
create policy shopping_list_items_update_household on public.shopping_list_items
  for update using (private.can_write_household(household_id))
  with check (private.can_write_household(household_id));

drop policy if exists events_update_household on public.events;
create policy events_update_household on public.events
  for update using (private.can_write_household(household_id))
  with check (private.can_write_household(household_id));

drop policy if exists routine_completions_update_household on public.routine_completions;
create policy routine_completions_update_household on public.routine_completions
  for update using (private.can_write_household(household_id))
  with check (private.can_write_household(household_id));

drop policy if exists posts_update_household on public.posts;
create policy posts_update_household on public.posts
  for update using (private.can_write_household(household_id))
  with check (private.can_write_household(household_id));

drop policy if exists post_comments_update_household on public.post_comments;
create policy post_comments_update_household on public.post_comments
  for update using (private.can_write_household(household_id))
  with check (private.can_write_household(household_id));

drop policy if exists post_reactions_update_household on public.post_reactions;
create policy post_reactions_update_household on public.post_reactions
  for update using (private.can_write_household(household_id))
  with check (private.can_write_household(household_id));

-- Colonnes d'affectation modifiables : assouplissement seul, sans trigger.
drop policy if exists loyalty_cards_update_household on public.loyalty_cards;
create policy loyalty_cards_update_household on public.loyalty_cards
  for update using (private.can_write_household(household_id))
  with check (private.can_write_household(household_id));

drop policy if exists birthdays_update_household on public.birthdays;
create policy birthdays_update_household on public.birthdays
  for update using (private.can_write_household(household_id))
  with check (private.can_write_household(household_id));

-- Items à dossiers : USING et WITH CHECK gardent la visibilité du dossier.
drop policy if exists tasks_update_household on public.tasks;
create policy tasks_update_household on public.tasks
  for update using (
    private.can_write_household(household_id)
    and private.folder_visible('task_lists', folder_id, household_id)
  )
  with check (
    private.can_write_household(household_id)
    and private.folder_visible('task_lists', folder_id, household_id)
  );

drop policy if exists notes_update_household on public.notes;
create policy notes_update_household on public.notes
  for update using (
    private.can_write_household(household_id)
    and private.folder_visible('note_folders', folder_id, household_id)
  )
  with check (
    private.can_write_household(household_id)
    and private.folder_visible('note_folders', folder_id, household_id)
  );

drop policy if exists routines_update_household on public.routines;
create policy routines_update_household on public.routines
  for update using (
    private.can_write_household(household_id)
    and private.folder_visible('routine_folders', folder_id, household_id)
  )
  with check (
    private.can_write_household(household_id)
    and private.folder_visible('routine_folders', folder_id, household_id)
  );

commit;
