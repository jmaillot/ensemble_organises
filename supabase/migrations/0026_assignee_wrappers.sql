-- 0026_assignee_wrappers.sql
-- Assignations de tâches et routines : enveloppes booléennes pour les
-- politiques d'insertion.
--
-- POURQUOI DES ENVELOPPES ET NON UN RE-GRANT
--   `task_assignees_insert` et `routine_assignees_insert` appelaient
--   `private.parent_household_id(…)` DIRECTEMENT dans leur `WITH CHECK`. Or
--   `0009` révoque `EXECUTE` sur cette fonction à `authenticated` — et une
--   expression de politique s'exécute avec les droits de l'appelant. Toute
--   assignation échouait donc en « permission denied for function
--   parent_household_id », tandis que les suites restaient vertes : `0002` ne
--   fait qu'`expect_denied` (même code 42501 dans les deux cas) et `0007`
--   insère avec le rôle propriétaire, hors RLS.
--
--   Re-granter `parent_household_id` contredirait la doctrine de `0009`
--   (« les helpers de politique ne renvoient que des booléens ») : elle rend
--   du texte interrogeable par RPC. Les deux enveloppes ci-dessous rendent du
--   booléen, portent la même garde (SECURITY DEFINER, search_path vide), et
--   sont les seules formes que le client peut exécuter.
--
--   `parent_household_id` reste révoquée : elle continue de servir les
--   helpers `can_*`, qui s'exécutent eux-mêmes en DEFINER.

begin;

create or replace function private.member_in_task_household(p_member_id text, p_task_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.member_in_household(p_member_id, private.parent_household_id('tasks', p_task_id));
$$;

comment on function private.member_in_task_household(text, text) is
  'Le membre appartient-il au foyer de la tâche : seule forme appelable par les politiques.';

create or replace function private.member_in_routine_household(p_member_id text, p_routine_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.member_in_household(p_member_id, private.parent_household_id('routines', p_routine_id));
$$;

comment on function private.member_in_routine_household(text, text) is
  'Le membre appartient-il au foyer de la routine : seule forme appelable par les politiques.';

drop policy if exists task_assignees_insert on public.task_assignees;
create policy task_assignees_insert on public.task_assignees
  for insert with check (
    private.can_write_task(task_id)
    and private.member_in_task_household(member_id, task_id)
  );

drop policy if exists routine_assignees_insert on public.routine_assignees;
create policy routine_assignees_insert on public.routine_assignees
  for insert with check (
    private.can_write_routine(routine_id)
    and private.member_in_routine_household(member_id, routine_id)
  );

-- `create or replace` recrée les ACL : même discipline que 0020. Les
-- enveloppes sont appelables par le client (politiques) et le serveur, par
-- personne d'autre.
revoke all on function private.member_in_task_household(text, text) from public, anon, authenticated;
revoke all on function private.member_in_routine_household(text, text) from public, anon, authenticated;

grant execute on function private.member_in_task_household(text, text) to authenticated, service_role;
grant execute on function private.member_in_routine_household(text, text) to authenticated, service_role;

commit;
