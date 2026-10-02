-- 0052_folders_triggers_seed.sql
-- Triggers dossiers + seed Général (create_household + backfill) + rattrapage
-- seed calendrier pour les foyers créés après 0047.
--
-- FK folder_id ON DELETE SET NULL : supprimer un dossier range son contenu
-- dans Général, jamais de perte (testé en 0017).

begin;

-- ---------------------------------------------------------------------------
-- Alignement foyer du dossier : le dossier doit appartenir au foyer de l'item.
-- Signature : private.validate_item_folder('<table dossiers>').
-- ---------------------------------------------------------------------------
create or replace function private.validate_item_folder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_folder_table text := tg_argv[0];
  v_folder_household text;
begin
  if new.folder_id is null then
    return new;
  end if;
  execute format('select household_id from public.%I where id = $1', v_folder_table)
    into v_folder_household using new.folder_id;
  if v_folder_household is null then
    raise exception 'dossier introuvable' using errcode = '23503';
  end if;
  if v_folder_household <> new.household_id then
    raise exception 'dossier d''un autre foyer' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_item_folder on public.tasks;
create trigger validate_item_folder
  before insert or update of folder_id, household_id on public.tasks
  for each row execute function private.validate_item_folder('task_lists');

drop trigger if exists validate_item_folder on public.notes;
create trigger validate_item_folder
  before insert or update of folder_id, household_id on public.notes
  for each row execute function private.validate_item_folder('note_folders');

drop trigger if exists validate_item_folder on public.routines;
create trigger validate_item_folder
  before insert or update of folder_id, household_id on public.routines
  for each row execute function private.validate_item_folder('routine_folders');

-- ---------------------------------------------------------------------------
-- Garde Général : is_default/name/visibility immuables, suppression refusée
-- même pour un admin (défense en profondeur derrière la RLS).
-- ---------------------------------------------------------------------------
create or replace function private.guard_folder_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_default then
    raise exception 'le dossier Général ne peut ni être modifié ni supprimé'
      using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.is_default <> old.is_default then
    raise exception 'is_default n''est pas modifiable' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_folder_default on public.task_lists;
create trigger guard_folder_default
  before update or delete on public.task_lists
  for each row execute function private.guard_folder_default();

drop trigger if exists guard_folder_default on public.note_folders;
create trigger guard_folder_default
  before update or delete on public.note_folders
  for each row execute function private.guard_folder_default();

drop trigger if exists guard_folder_default on public.routine_folders;
create trigger guard_folder_default
  before update or delete on public.routine_folders
  for each row execute function private.guard_folder_default();

revoke all on function private.validate_item_folder() from public, anon, authenticated;
revoke all on function private.guard_folder_default() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Références de membre : étendre aux nouvelles tables (et aux tables
-- calendrier 0047 qui n'y figuraient pas).
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('event_categories', array['created_by']::text[]),
      ('event_calendars',  array['owner_member_id']::text[]),
      ('task_lists',       array['owner_member_id']::text[]),
      ('note_folders',     array['owner_member_id']::text[]),
      ('routine_folders',  array['owner_member_id']::text[])
    ) as t(table_name, member_columns)
  loop
    execute format('drop trigger if exists validate_member_refs on public.%I', r.table_name);
    execute format(
      'create trigger validate_member_refs before insert or update on public.%I'
      ' for each row execute function private.validate_member_refs(%L)',
      r.table_name, array_to_string(r.member_columns, ',')
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Seed : create_household sème 3× Général + calendrier Commun + 4 catégories.
-- Même signature, mêmes grants (OR REPLACE les conserve), retour inchangé.
-- ---------------------------------------------------------------------------
create or replace function public.create_household(
  p_name text,
  p_avatar_color text default 'accent'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_household_id text;
  v_member_id text;
  v_display_name text;
begin
  if v_actor is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 120 then
    raise exception 'nom de foyer invalide' using errcode = '22023';
  end if;
  if p_avatar_color is null or not private.is_member_color(p_avatar_color) then
    raise exception 'couleur invalide' using errcode = '22023';
  end if;

  v_household_id := private.new_id('household');
  v_member_id := private.new_id('member');

  select p.display_name into v_display_name
    from public.profiles p
   where p.id = v_actor;

  insert into public.households (id, name, avatar_color, created_by)
  values (v_household_id, btrim(p_name), p_avatar_color, v_actor);

  insert into public.household_members (
    id, household_id, user_id, display_name, color_tag, role
  ) values (
    v_member_id,
    v_household_id,
    v_actor,
    coalesce(nullif(btrim(v_display_name), ''), 'Nouveau foyer'),
    p_avatar_color,
    'admin'
  );

  insert into public.task_lists (household_id, name, visibility, owner_member_id, is_default)
  values (v_household_id, 'Général', 'foyer', v_member_id, true);
  insert into public.note_folders (household_id, name, visibility, owner_member_id, is_default)
  values (v_household_id, 'Général', 'foyer', v_member_id, true);
  insert into public.routine_folders (household_id, name, visibility, owner_member_id, is_default)
  values (v_household_id, 'Général', 'foyer', v_member_id, true);

  insert into public.event_calendars (household_id, name, visibility, owner_member_id)
  values (v_household_id, 'Commun', 'commun', null);

  insert into public.event_categories (household_id, name, color, is_default)
  values (v_household_id, 'Repas', '#E8930C', true),
         (v_household_id, 'Médical', '#D64545', true),
         (v_household_id, 'École', '#3E7CB1', true),
         (v_household_id, 'Sport', '#4CAF50', true);

  return jsonb_build_object(
    'household', jsonb_build_object(
      'id', v_household_id,
      'name', btrim(p_name),
      'avatar_color', p_avatar_color,
      'created_by', v_actor
    ),
    'member', jsonb_build_object(
      'id', v_member_id,
      'household_id', v_household_id,
      'user_id', v_actor,
      'display_name', coalesce(nullif(btrim(v_display_name), ''), 'Nouveau foyer'),
      'color_tag', p_avatar_color,
      'role', 'admin'
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill idempotent : Général ×3 + Commun + 4 catégories pour les foyers
-- existants qui n'en ont pas (créés entre 0047 et aujourd'hui, ou cas
-- historiques). Owner = plus ancien admin du foyer.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_owner text;
begin
  for r in select id as household_id from public.households loop
    select m.id into v_owner
      from public.household_members m
     where m.household_id = r.household_id and m.role = 'admin'
     order by m.created_at asc
     limit 1;
    if v_owner is null then
      continue;
    end if;

    insert into public.task_lists (household_id, name, visibility, owner_member_id, is_default)
    values (r.household_id, 'Général', 'foyer', v_owner, true)
    on conflict do nothing;
    insert into public.note_folders (household_id, name, visibility, owner_member_id, is_default)
    values (r.household_id, 'Général', 'foyer', v_owner, true)
    on conflict do nothing;
    insert into public.routine_folders (household_id, name, visibility, owner_member_id, is_default)
    values (r.household_id, 'Général', 'foyer', v_owner, true)
    on conflict do nothing;

    insert into public.event_calendars (household_id, name, visibility, owner_member_id)
    values (r.household_id, 'Commun', 'commun', null)
    on conflict do nothing;
    insert into public.event_categories (household_id, name, color, is_default)
    values (r.household_id, 'Repas', '#E8930C', true),
           (r.household_id, 'Médical', '#D64545', true),
           (r.household_id, 'École', '#3E7CB1', true),
           (r.household_id, 'Sport', '#4CAF50', true)
    on conflict do nothing;
  end loop;
end;
$$;

commit;
