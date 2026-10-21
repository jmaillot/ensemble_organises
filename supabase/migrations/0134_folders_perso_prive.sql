-- 0134_folders_perso_prive.sql
-- Dossiers perso : privés au propriétaire, sans modération ; et suppression
-- qui efface leur contenu.
--
-- DÉCISION DU 2026-10-21, après UAT à deux comptes. `0051` laissait l'admin
-- voir les dossiers perso des autres (« modération »), et réservait la
-- suppression à l'admin — donc un membre ne pouvait pas supprimer le dossier
-- qu'il avait créé. Les deux sont corrigés ici :
--
--   * `folder_visible` perd sa branche admin. Un dossier `perso` n'est visible
--     que de son propriétaire, et comme les politiques des items passent toutes
--     par cette fonction, leur contenu cesse d'être visible à l'admin par la
--     même occasion. Un dossier `foyer` reste visible de tous ;
--   * `select` et `update` suivent la même règle : perso = propriétaire,
--     foyer = admin pour l'écriture ;
--   * `delete` autorise le propriétaire sur un perso, l'admin sur un foyer, et
--     jamais le dossier Général (`is_default`).
--
-- SUPPRESSION DU CONTENU. La FK `folder_id` est `on delete set null` (`0050`) :
-- supprimer un dossier range ses items dans Général, donc les rend visibles de
-- tout le foyer. C'est le bon comportement pour un dossier `foyer`, pas pour un
-- dossier perso, dont le contenu doit disparaître avec lui — sinon supprimer
-- « mes tâches privées » les publierait. La règle ne peut pas vivre dans la FK
-- (elle dépend de la visibilité de la ligne), et le client ne peut pas
-- l'appliquer : les politiques `DELETE` des tâches, notes et routines sont
-- admin-seules (`0051`). D'où `public.delete_folder`, une transaction qui
-- vérifie elle-même la propriété, efface le contenu d'un perso et supprime le
-- dossier.
--
-- Pourquoi une RPC et pas deux appels : même raison que `0133`. Un `delete`
-- des items qui réussit suivi d'un `delete` du dossier qui échoue laisserait un
-- dossier vide et des items perdus — ou l'inverse, un dossier orphelin.

begin;

-- ---------------------------------------------------------------------------
-- Visibilité : perso = propriétaire seul, foyer = tout le foyer.
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
    'or f.owner_member_id = private.current_member_id($2)))',
    p_folder_table
  ) into v_visible using p_folder_id, p_household_id;
  return coalesce(v_visible, false);
end;
$$;

comment on function private.folder_visible(text, text, text) is
  'Dossier visible de l''appelant : Général toujours, foyer pour tous, perso pour son propriétaire seul.';

-- ---------------------------------------------------------------------------
-- Politiques des trois tables de dossiers.
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
      'or owner_member_id = private.current_member_id(household_id)))',
      r || '_select', r
    );

    -- L'insertion ne bouge pas : owner = soi-même, rôle d'écriture.
    execute format('drop policy if exists %I on public.%I', r || '_update', r);
    execute format(
      'create policy %I on public.%I for update using ('
      'private.can_write_household(household_id) and ('
      'owner_member_id = private.current_member_id(household_id) '
      'or (visibility = ''foyer'' and private.is_household_admin(household_id)))) with check ('
      'private.can_write_household(household_id) '
      'and private.member_in_household(owner_member_id, household_id))',
      r || '_update', r
    );

    execute format('drop policy if exists %I on public.%I', r || '_delete', r);
    execute format(
      'create policy %I on public.%I for delete using ('
      'not is_default and ('
      '(visibility = ''perso'' and owner_member_id = private.current_member_id(household_id)) '
      'or (visibility = ''foyer'' and private.is_household_admin(household_id))))',
      r || '_delete', r
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Suppression d'un dossier, contenu compris.
-- ---------------------------------------------------------------------------
create or replace function public.delete_folder(p_kind text, p_folder_id text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_folder_table text;
  v_item_table text;
  v_household_id text;
  v_visibility text;
  v_owner_member_id text;
  v_is_default boolean;
  v_deleted integer := 0;
begin
  if p_folder_id is null then
    raise exception 'dossier obligatoire' using errcode = '22023';
  end if;

  v_folder_table := case p_kind
    when 'taches' then 'task_lists'
    when 'notes' then 'note_folders'
    when 'routines' then 'routine_folders'
  end;
  v_item_table := case p_kind
    when 'taches' then 'tasks'
    when 'notes' then 'notes'
    when 'routines' then 'routines'
  end;

  if v_folder_table is null then
    raise exception 'type de dossier inconnu : %', p_kind using errcode = '22023';
  end if;

  execute format(
    'select household_id, visibility, owner_member_id, is_default from public.%I where id = $1',
    v_folder_table
  ) into v_household_id, v_visibility, v_owner_member_id, v_is_default
    using p_folder_id;

  -- L'absence de ligne vaut refus : un identifiant d'un autre foyer ne se
  -- distingue pas d'un identifiant inexistant.
  if v_household_id is null then
    raise exception 'dossier introuvable' using errcode = '42501';
  end if;

  if v_is_default then
    raise exception 'le dossier Général ne se supprime pas' using errcode = '42501';
  end if;

  if v_visibility = 'perso' then
    if v_owner_member_id is distinct from private.current_member_id(v_household_id) then
      raise exception 'écriture refusée sur ce dossier' using errcode = '42501';
    end if;
  elsif private.is_household_admin(v_household_id) is not true then
    raise exception 'écriture refusée sur ce dossier' using errcode = '42501';
  end if;

  -- Le contenu d'un dossier perso disparaît avec lui ; celui d'un dossier
  -- foyer retombe dans Général par la FK `on delete set null`.
  if v_visibility = 'perso' then
    execute format('delete from public.%I where folder_id = $1', v_item_table)
      using p_folder_id;
    get diagnostics v_deleted = row_count;
  end if;

  execute format('delete from public.%I where id = $1', v_folder_table)
    using p_folder_id;

  return v_deleted;
end;
$$;

comment on function public.delete_folder(text, text) is
  'Supprime un dossier et, s''il est perso, son contenu ; un dossier foyer laisse ses items dans Général.';

revoke all on function public.delete_folder(text, text) from public, anon;
grant execute on function public.delete_folder(text, text) to authenticated;

commit;
