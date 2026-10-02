-- 0051_folders_rls.sql
-- RLS des dossiers (politiques explicites : le motif « foyer plat » généré
-- exposerait les dossiers perso à tout le foyer) + resserrement des
-- politiques des items sur la visibilité du dossier.
--
-- Les politiques des items relisent les tables dossiers (autre table, motif
-- existant type can_read_task) : jamais leur propre table (leçon 0028-0032).

begin;

-- ---------------------------------------------------------------------------
-- Helper : dossier visible pour l'appelant (NULL = Général, toujours visible).
-- ---------------------------------------------------------------------------
create or replace function private.folder_visible(
  p_folder_table text,
  p_folder_id text,
  p_household_id text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_visible boolean;
begin
  if p_folder_id is null then
    return true;
  end if;
  execute format(
    'select exists (select 1 from public.%I f where f.id = $1 and f.household_id = $2 '
    'and (f.visibility = ''foyer'' '
    'or f.owner_member_id = private.current_member_id($2) '
    'or private.is_household_admin($2)))',
    p_folder_table
  ) into v_visible using p_folder_id, p_household_id;
  return coalesce(v_visible, false);
end;
$$;

grant execute on function private.folder_visible(text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Dossiers : select foyer+owner+admin, insert owner=soi writer,
-- update owner|admin, delete admin sauf Général.
-- ---------------------------------------------------------------------------
do $$
declare
  r text;
begin
  foreach r in array array['task_lists', 'note_folders', 'routine_folders'] loop
    execute format('drop policy if exists %I on public.%I', r || '_select', r);
    execute format(
      'create policy %I on public.%I for select using ('
      'private.is_household_member(household_id) and (visibility = ''foyer'' '
      'or owner_member_id = private.current_member_id(household_id) '
      'or private.is_household_admin(household_id)))',
      r || '_select', r
    );

    execute format('drop policy if exists %I on public.%I', r || '_insert', r);
    execute format(
      'create policy %I on public.%I for insert with check ('
      'private.can_write_household(household_id) '
      'and private.member_in_household(owner_member_id, household_id) '
      'and owner_member_id = private.current_member_id(household_id))',
      r || '_insert', r
    );

    execute format('drop policy if exists %I on public.%I', r || '_update', r);
    execute format(
      'create policy %I on public.%I for update using ('
      'private.can_write_household(household_id) and ('
      'owner_member_id = private.current_member_id(household_id) '
      'or private.is_household_admin(household_id))) with check ('
      'private.can_write_household(household_id) '
      'and private.member_in_household(owner_member_id, household_id))',
      r || '_update', r
    );

    execute format('drop policy if exists %I on public.%I', r || '_delete', r);
    execute format(
      'create policy %I on public.%I for delete using ('
      'private.is_household_admin(household_id) and not is_default)',
      r || '_delete', r
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Items : mêmes politiques que 0007 + prédicat dossier. Les politiques
-- DELETE (admin seul) sont inchangées.
-- ---------------------------------------------------------------------------
drop policy if exists tasks_select_household on public.tasks;
create policy tasks_select_household on public.tasks
  for select using (
    private.is_household_member(household_id)
    and private.folder_visible('task_lists', folder_id, household_id)
  );

drop policy if exists tasks_insert_household on public.tasks;
create policy tasks_insert_household on public.tasks
  for insert with check (
    private.can_write_household(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
    and private.folder_visible('task_lists', folder_id, household_id)
  );

drop policy if exists tasks_update_household on public.tasks;
create policy tasks_update_household on public.tasks
  for update using (
    private.can_write_household(household_id)
    and private.folder_visible('task_lists', folder_id, household_id)
  )
  with check (
    private.can_write_household(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
    and private.folder_visible('task_lists', folder_id, household_id)
  );

drop policy if exists notes_select_household on public.notes;
create policy notes_select_household on public.notes
  for select using (
    private.is_household_member(household_id)
    and private.folder_visible('note_folders', folder_id, household_id)
  );

drop policy if exists notes_insert_household on public.notes;
create policy notes_insert_household on public.notes
  for insert with check (
    private.can_write_household(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
    and private.folder_visible('note_folders', folder_id, household_id)
  );

drop policy if exists notes_update_household on public.notes;
create policy notes_update_household on public.notes
  for update using (
    private.can_write_household(household_id)
    and private.folder_visible('note_folders', folder_id, household_id)
  )
  with check (
    private.can_write_household(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
    and private.folder_visible('note_folders', folder_id, household_id)
  );

drop policy if exists routines_select_household on public.routines;
create policy routines_select_household on public.routines
  for select using (
    private.is_household_member(household_id)
    and private.folder_visible('routine_folders', folder_id, household_id)
  );

drop policy if exists routines_insert_household on public.routines;
create policy routines_insert_household on public.routines
  for insert with check (
    private.can_write_household(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
    and private.folder_visible('routine_folders', folder_id, household_id)
  );

drop policy if exists routines_update_household on public.routines;
create policy routines_update_household on public.routines
  for update using (
    private.can_write_household(household_id)
    and private.folder_visible('routine_folders', folder_id, household_id)
  )
  with check (
    private.can_write_household(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
    and private.folder_visible('routine_folders', folder_id, household_id)
  );

commit;
