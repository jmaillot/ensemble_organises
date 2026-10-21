-- 0137_note_verrou.sql
-- Verrou d'une note : la note reste lisible par tout le foyer, mais son
-- contenu ne peut plus être modifié tant que le verrou n'est pas levé.
--
-- Pourquoi un déclencheur et pas une politique RLS. Une politique d'`update`
-- décide **si** la ligne est modifiable ; elle ne sait pas distinguer « lever
-- le verrou » de « réécrire le contenu », puisque les deux sont des `update`.
-- Le verrou doit donc être levé par une modification de la ligne elle-même,
-- et seulement par qui y a droit — ce que seul un déclencheur `before update`
-- peut arbitrer en comparant `old` et `new`.
--
-- Les pièces jointes sont des modifications de la note au même titre que son
-- texte : leurs politiques portent donc aussi le refus. Une suppression de la
-- note emporte ses pièces jointes par cascade, et les actions référentielles
-- de PostgreSQL ne passent pas par la RLS — d'où aucune cascade cassée ici.
--
-- Forward-only : `add column if not exists`, `create or replace`,
-- `drop ... if exists` avant chaque `create policy`.

begin;

-- ---------------------------------------------------------------------------
-- La colonne
-- ---------------------------------------------------------------------------
alter table public.notes
  add column if not exists is_locked boolean not null default false;

comment on column public.notes.is_locked is
  'Verrou de la note : contenu figé pour tous, y compris son auteur, tant qu''il n''est pas levé.';

-- ---------------------------------------------------------------------------
-- Ce que le verrou interdit, et qui peut le lever
-- ---------------------------------------------------------------------------
create or replace function private.enforce_note_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Note non verrouillée : rien à arbitrer, le droit d'écrire est déjà celui
  -- des politiques de `public.notes`.
  if not old.is_locked then
    return new;
  end if;

  if not new.is_locked then
    -- Lever le verrou est réservé à l'auteur et à l'administrateur : sans
    -- cette borne, le premier membre venu pourrait défaire le verrou posé par
    -- un autre. Les autres colonnes peuvent changer dans le même `update` :
    -- celui qui a le droit de lever le verrou a celui de modifier ensuite.
    if old.created_by is distinct from private.current_member_id(old.household_id)
       and not private.is_household_admin(old.household_id) then
      raise exception 'Seul l''auteur de la note ou un administrateur peut lever son verrou.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- Verrou maintenu : toute autre colonne doit rester identique. `is_locked`
  -- est comparé aussi, une bascule sans changement de valeur étant permise.
  if new.title is distinct from old.title
     or new.content is distinct from old.content
     or new.category is distinct from old.category
     or new.color is distinct from old.color
     or new.folder_id is distinct from old.folder_id
     or new.trip_id is distinct from old.trip_id
     or new.cover_attachment_id is distinct from old.cover_attachment_id
     or new.household_id is distinct from old.household_id
     or new.created_by is distinct from old.created_by
     or new.is_locked is distinct from old.is_locked then
    raise exception 'Cette note est verrouillée : levez le verrou avant de la modifier.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function private.enforce_note_lock() is
  'Fige le contenu d''une note verrouillée ; seule une levée du verrou par son auteur ou un administrateur change la note.';

drop trigger if exists enforce_note_lock on public.notes;
create trigger enforce_note_lock before update on public.notes
  for each row execute function private.enforce_note_lock();

-- ---------------------------------------------------------------------------
-- Les pièces jointes suivent le verrou
-- ---------------------------------------------------------------------------
-- Une note verrouillée n'accepte ni nouvelle pièce jointe, ni retrait, ni
-- renommage de fichier : ce sont des changements de la note.
drop policy if exists note_attachments_insert_household on public.note_attachments;
create policy note_attachments_insert_household on public.note_attachments
  for insert with check (
    private.can_write_household(household_id)
    and not exists (
      select 1 from public.notes n
       where n.id = note_id
         and n.is_locked
    )
  );

drop policy if exists note_attachments_update_household on public.note_attachments;
create policy note_attachments_update_household on public.note_attachments
  for update using (
    private.can_write_household(household_id)
    and not exists (
      select 1 from public.notes n
       where n.id = note_id
         and n.is_locked
    )
  )
  with check (private.can_write_household(household_id));

drop policy if exists note_attachments_delete_admin on public.note_attachments;
create policy note_attachments_delete_admin on public.note_attachments
  for delete using (
    private.is_household_admin(household_id)
    and not exists (
      select 1 from public.notes n
       where n.id = note_id
         and n.is_locked
    )
  );

commit;
