-- 0010_storage_and_realtime.sql
-- Stockage privé (médias du foyer) et publication Realtime.
--
-- Les buckets sont privés par défaut. Le nom de l'objet commence par
-- l'identifiant du foyer : `<household_id>/<dossier>/<fichier>`, et les
-- politiques vérifient l'appartenance avant tout accès.

begin;

-- ---------------------------------------------------------------------------
-- Buckets
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('household-media', 'household-media', false, 26214400,
   array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'video/mp4', 'video/quicktime']),
  ('household-avatars', 'household-avatars', false, 2097152,
   array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Politiques Storage
-- ---------------------------------------------------------------------------
drop policy if exists household_media_read on storage.objects;
create policy household_media_read on storage.objects
  for select using (
    bucket_id in ('household-media', 'household-avatars')
    and private.is_household_member((storage.foldername(name))[1])
  );

drop policy if exists household_media_insert on storage.objects;
create policy household_media_insert on storage.objects
  for insert with check (
    bucket_id in ('household-media', 'household-avatars')
    and private.can_write_household((storage.foldername(name))[1])
  );

drop policy if exists household_media_update on storage.objects;
create policy household_media_update on storage.objects
  for update using (
    bucket_id in ('household-media', 'household-avatars')
    and private.can_write_household((storage.foldername(name))[1])
  )
  with check (
    bucket_id in ('household-media', 'household-avatars')
    and private.can_write_household((storage.foldername(name))[1])
  );

drop policy if exists household_media_delete on storage.objects;
create policy household_media_delete on storage.objects
  for delete using (
    bucket_id in ('household-media', 'household-avatars')
    and (private.can_write_household((storage.foldername(name))[1])
         or private.is_household_admin((storage.foldername(name))[1]))
  );

-- ---------------------------------------------------------------------------
-- Realtime
--
-- Le frontend s'abonne avec `.on('postgres_changes', { table })`. Une table
-- absente de la publication ne produit aucun événement : le Cercle et les
-- commentaires ne se rafraîchiraient pas en temps réel.
-- ---------------------------------------------------------------------------
do $$
declare
  r text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'Publication supabase_realtime absente : Realtime non activé sur cette stack.';
    return;
  end if;

  foreach r in array array[
    'posts', 'post_media', 'post_comments', 'post_reactions',
    'messages', 'conversations', 'conversation_members',
    'tasks', 'task_assignees', 'events', 'notes',
    'expenses', 'expense_participants', 'routines', 'routine_completions',
    'shopping_lists', 'shopping_list_items', 'dashboard_widgets'
  ] loop
    -- `ALTER PUBLICATION … ADD TABLE` n'échoue pas si la table est déjà
    -- membre ; le bloc reste protégé pour que la migration soit rejouable sur
    -- une publication déjà peuplée.
    begin
      execute format('alter publication supabase_realtime add table public.%I', r);
    exception when others then
      raise notice 'table % ignorée pour Realtime : %', r, sqlerrm;
    end;
  end loop;
end;
$$;

commit;
