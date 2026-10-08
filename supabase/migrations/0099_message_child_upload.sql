-- 0099_message_child_upload.sql
-- Dépôt d'images messages par les enfants (08-CONTEXT D-01).
--
-- Constat (audit phase 08) : un enfant converse en texte — `create_conversation`
-- et `can_send_message` (0041) exigent l'appartenance, pas le rôle — mais son
-- dépôt d'image échoue en 403 : `household_media_insert` (0010) exige
-- `can_write_household` (admin/membre). Prouvé rouge par
-- supabase/tests/0038_conversation_matrix.sql avant cette migration.
--
-- Correction, vers l'avant uniquement : un dépôt est autorisé sur le seul
-- préfixe `household-media/<foyer>/messages/<fil>/<fichier>` quand l'auteur
-- appartient à CE fil — enfant inclus, puisque `is_conversation_member` ne
-- regarde pas le rôle. La conversation est dérivée du chemin de l'objet côté
-- serveur (`private.can_deposit_message_media`) : aucun identifiant fourni
-- par le client n'est cru sans revérification d'appartenance.
--
-- Périmètre volontairement étroit :
--   * `insert` seul — le client dépose avec `upsert: false` (api.ts
--     depositMessageImage), il ne réécrit jamais ; `update`/`delete` et la
--     lecture restent inchangés (la lecture exige déjà la simple
--     appartenance au foyer, que l'enfant possède) ;
--   * `household-avatars` inchangé — rien n'y passe par un fil ;
--   * admin/membre à l'octet près : ils passent déjà par la première branche,
--     le `or` ne change rien pour eux ; extérieurs, membres hors fil et
--     préfixes hors messages/ restent refusés (prouvé par 0038).

begin;

create or replace function private.can_deposit_message_media(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    -- Chemin exact du dépôt client : <foyer>/messages/<fil>/<fichier>.
    -- `foldername` rend les dossiers sans le nom de fichier : [1] foyer,
    -- [2] préfixe, [3] fil. Un chemin trop court donne NULL, donc refusé.
    (storage.foldername(p_object_name))[2] = 'messages'
    and exists (
      select 1
        from public.conversations c
       where c.id = (storage.foldername(p_object_name))[3]
         and c.household_id = (storage.foldername(p_object_name))[1]
    )
    and private.is_conversation_member((storage.foldername(p_object_name))[3])
$$;

comment on function private.can_deposit_message_media(text) is
  'Dépôt d''image messages : l''auteur appartient au fil désigné par le chemin. Enfant inclus, préfixe messages/ seul.';

drop policy if exists household_media_insert on storage.objects;
create policy household_media_insert on storage.objects
  for insert with check (
    bucket_id in ('household-media', 'household-avatars')
    and (
      private.can_write_household((storage.foldername(name))[1])
      or (
        bucket_id = 'household-media'
        and private.can_deposit_message_media(name)
      )
    )
  );

commit;
