-- 0136_note_couverture.sql
-- Photo de couverture d'une note : la photo existe déjà comme pièce jointe
-- (`0043`), la couverture est donc une **désignation**, pas une copie.
--
-- Pourquoi désigner plutôt que dupliquer :
--   * aucun second objet dans le bucket, donc aucun orphelin à traquer quand
--     la note ou la photo disparaît ;
--   * la même photo sert d'aperçu dans la liste des pièces jointes et de
--     bandeau sur la carte : une seule vérité ;
--   * supprimer la photo choisie ramène la couverture à `NULL`
--     (`on delete set null`), et l'application retombe sur la première image
--     restante — jamais d'image morte.
--
-- Ce que la base garantit, et que le client ne peut pas garantir seul :
--   * la pièce jointe désignée appartient **à cette note** — un `notes.id`
--     d'une note privée ne peut pas devenir la couverture d'une note partagée.
--     Un simple FK sur `note_attachments (id)` ne le dirait pas, d'où le
--     déclencheur `private.check_note_cover` ;
--   * le FK porte `on delete set null` : la ligne ne survit pas à sa photo.
--
-- RLS : aucune politique nouvelle. La colonne voyage avec la ligne `notes`,
-- dont les politiques d'écriture existent déjà (`0051`, `0118`).
--
-- Forward-only : `add column if not exists`, `create or replace`,
-- `drop ... if exists` avant chaque création. Aucun DML.

begin;

-- ---------------------------------------------------------------------------
-- La colonne et sa contrainte
-- ---------------------------------------------------------------------------
alter table public.notes
  add column if not exists cover_attachment_id text
    references public.note_attachments (id) on delete set null;

comment on column public.notes.cover_attachment_id is
  'Photo de couverture désignée parmi les pièces jointes de la note ; NULL = première image jointe, s''il y en a une.';

-- Le FK `on delete set null` cherche les notes qui désignent la pièce jointe
-- supprimée : sans index, chaque suppression balaie `notes` en entier.
create index if not exists notes_cover_attachment_idx
  on public.notes (cover_attachment_id)
  where cover_attachment_id is not null;

-- ---------------------------------------------------------------------------
-- La couverture doit être une pièce jointe DE CETTE NOTE
-- ---------------------------------------------------------------------------
create or replace function private.check_note_cover()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.cover_attachment_id is null then
    return new;
  end if;

  if not exists (
    select 1
      from public.note_attachments a
     where a.id = new.cover_attachment_id
       and a.note_id = new.id
  ) then
    raise exception 'La photo de couverture doit être jointe à cette note.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function private.check_note_cover() is
  'Refuse une couverture empruntée à une autre note : le FK seul ne vérifie que l''existence de la pièce jointe.';

drop trigger if exists check_note_cover on public.notes;
create trigger check_note_cover before insert or update of cover_attachment_id on public.notes
  for each row execute function private.check_note_cover();

commit;
