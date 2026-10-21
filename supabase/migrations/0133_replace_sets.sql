-- 0133_replace_sets.sql
-- Remplacement atomique des ensembles rattachés à un parent.
--
-- POURQUOI DES FONCTIONS. Six endroits du client remplaçaient un ensemble
-- (« les assignataires de cette tâche », « les rappels de cette routine ») par
-- un `delete` suivi d'un `insert` : deux requêtes PostgREST sans transaction
-- commune. Si la seconde échoue (réseau, session expirée, refus RLS), la
-- première a déjà supprimé l'ensemble précédent, et la perte est réelle — un
-- rappel perdu ne se voit pas. En mode démo, la même séquence laissait un
-- intervalle où l'ensemble paraissait vide.
--
-- CHOIX D'AUTORISATION, ET IL DIFFÈRE SELON LES TABLES :
--
--   * `task_assignees`, `task_reminders`, `routine_assignees`,
--     `routine_reminders` : SECURITY DEFINER, avec la condition de leur
--     politique d'INSERTION (`can_write_task` / `can_write_routine`, plus
--     `member_in_*_household` pour les assignataires). Leur politique de
--     SUPPRESSION est réservée aux administrateurs (`can_admin_task`,
--     `can_admin_routine`), alors que l'insertion est ouverte aux membres
--     depuis 0026. En INVOKER, un membre ne pourrait donc pas remplacer
--     l'ensemble : la suppression ne retirerait rien et le `insert` des lignes
--     restantes échouerait sur la clé primaire. Un remplacement est UNE
--     écriture de l'ensemble, il suit le droit d'écriture. Les politiques
--     directes ne bougent pas : supprimer une ligne une par une reste
--     réservé aux administrateurs.
--
--   * `recipe_tag_links` : SECURITY INVOKER. Ses politiques (0122) donnent la
--     même condition à l'insertion et à la suppression (`can_write_household`),
--     donc la RLS suffit et il n'y a aucune règle à recopier. Le foyer est
--     dérivé de la recette, jamais fourni par le client.
--
-- Un ensemble n'a pas de doublon : `select distinct` est la sémantique
-- attendue, identique côté démo.
--
-- Les gardes s'écrivent `is not true` et jamais `not (…)` : les aides de 0007
-- renvoient NULL pour un appelant qui n'appartient pas au foyer, et `not NULL`
-- vaut NULL. Une condition NULL ne déclenche pas le `raise`, donc un garde
-- écrit `if not …` laisserait passer un inconnu — la RLS le ferait échouer, un
-- SECURITY DEFINER non. Un test l'a montré : un membre d'un autre foyer
-- remplaçait l'ensemble d'autrui.

begin;

-- ---------------------------------------------------------------------------
-- Tâches
-- ---------------------------------------------------------------------------
create or replace function public.replace_task_assignees(p_task_id text, p_member_ids text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  if p_task_id is null then
    raise exception 'tâche obligatoire' using errcode = '22023';
  end if;
  if p_member_ids is null then
    raise exception 'liste d''assignataires obligatoire' using errcode = '22023';
  end if;

  if private.can_write_task(p_task_id) is not true then
    raise exception 'écriture refusée sur cette tâche' using errcode = '42501';
  end if;

  if exists (
    select 1
      from unnest(p_member_ids) as m
     where private.member_in_task_household(m, p_task_id) is not true
  ) then
    raise exception 'membre hors du foyer de la tâche' using errcode = '42501';
  end if;

  delete from public.task_assignees where task_id = p_task_id;

  insert into public.task_assignees (task_id, member_id)
  select distinct p_task_id, m
    from unnest(p_member_ids) as m;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

comment on function public.replace_task_assignees(text, text[]) is
  'Remplace en une transaction les assignataires d''une tâche (droit d''écriture, membres du foyer seulement).';

create or replace function public.replace_task_reminders(p_task_id text, p_remind_ats timestamptz[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  if p_task_id is null then
    raise exception 'tâche obligatoire' using errcode = '22023';
  end if;
  if p_remind_ats is null then
    raise exception 'liste de rappels obligatoire' using errcode = '22023';
  end if;

  if private.can_write_task(p_task_id) is not true then
    raise exception 'écriture refusée sur cette tâche' using errcode = '42501';
  end if;

  delete from public.task_reminders where task_id = p_task_id;

  insert into public.task_reminders (task_id, remind_at)
  select distinct p_task_id, r
    from unnest(p_remind_ats) as r;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

comment on function public.replace_task_reminders(text, timestamptz[]) is
  'Remplace en une transaction les rappels d''une tâche (droit d''écriture).';

-- ---------------------------------------------------------------------------
-- Routines
-- ---------------------------------------------------------------------------
create or replace function public.replace_routine_assignees(p_routine_id text, p_member_ids text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  if p_routine_id is null then
    raise exception 'routine obligatoire' using errcode = '22023';
  end if;
  if p_member_ids is null then
    raise exception 'liste d''assignataires obligatoire' using errcode = '22023';
  end if;

  if private.can_write_routine(p_routine_id) is not true then
    raise exception 'écriture refusée sur cette routine' using errcode = '42501';
  end if;

  if exists (
    select 1
      from unnest(p_member_ids) as m
     where private.member_in_routine_household(m, p_routine_id) is not true
  ) then
    raise exception 'membre hors du foyer de la routine' using errcode = '42501';
  end if;

  delete from public.routine_assignees where routine_id = p_routine_id;

  insert into public.routine_assignees (routine_id, member_id)
  select distinct p_routine_id, m
    from unnest(p_member_ids) as m;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

comment on function public.replace_routine_assignees(text, text[]) is
  'Remplace en une transaction les assignataires d''une routine (droit d''écriture, membres du foyer seulement).';

create or replace function public.replace_routine_reminders(p_routine_id text, p_remind_ats timestamptz[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  if p_routine_id is null then
    raise exception 'routine obligatoire' using errcode = '22023';
  end if;
  if p_remind_ats is null then
    raise exception 'liste de rappels obligatoire' using errcode = '22023';
  end if;

  if private.can_write_routine(p_routine_id) is not true then
    raise exception 'écriture refusée sur cette routine' using errcode = '42501';
  end if;

  delete from public.routine_reminders where routine_id = p_routine_id;

  insert into public.routine_reminders (routine_id, remind_at)
  select distinct p_routine_id, r
    from unnest(p_remind_ats) as r;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

comment on function public.replace_routine_reminders(text, timestamptz[]) is
  'Remplace en une transaction les rappels d''une routine (droit d''écriture).';

-- ---------------------------------------------------------------------------
-- Recettes : liens recette <-> étiquettes
-- ---------------------------------------------------------------------------
create or replace function public.replace_recipe_tag_links(p_recipe_id text, p_tag_ids text[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_household_id text;
  v_inserted integer;
begin
  if p_recipe_id is null then
    raise exception 'recette obligatoire' using errcode = '22023';
  end if;
  if p_tag_ids is null then
    raise exception 'liste d''étiquettes obligatoire' using errcode = '22023';
  end if;

  -- La RLS des recettes fait la moitié du travail : l'absence de ligne
  -- signifie « introuvable ou invisible pour cet appelant ».
  select r.household_id into v_household_id
    from public.recipes r
   where r.id = p_recipe_id;

  if v_household_id is null then
    raise exception 'recette introuvable' using errcode = '42501';
  end if;

  delete from public.recipe_tag_links where recipe_id = p_recipe_id;

  insert into public.recipe_tag_links (recipe_id, household_id, tag_id)
  select distinct p_recipe_id, v_household_id, t
    from unnest(p_tag_ids) as t;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

comment on function public.replace_recipe_tag_links(text, text[]) is
  'Remplace en une transaction les étiquettes d''une recette ; le foyer est dérivé de la recette.';

-- ---------------------------------------------------------------------------
-- Privilèges : `EXECUTE` est accordé à PUBLIC par défaut à la création.
-- ---------------------------------------------------------------------------
revoke all on function public.replace_task_assignees(text, text[]) from public, anon;
revoke all on function public.replace_task_reminders(text, timestamptz[]) from public, anon;
revoke all on function public.replace_routine_assignees(text, text[]) from public, anon;
revoke all on function public.replace_routine_reminders(text, timestamptz[]) from public, anon;
revoke all on function public.replace_recipe_tag_links(text, text[]) from public, anon;

grant execute on function public.replace_task_assignees(text, text[]) to authenticated;
grant execute on function public.replace_task_reminders(text, timestamptz[]) to authenticated;
grant execute on function public.replace_routine_assignees(text, text[]) to authenticated;
grant execute on function public.replace_routine_reminders(text, timestamptz[]) to authenticated;
grant execute on function public.replace_recipe_tag_links(text, text[]) to authenticated;

commit;
