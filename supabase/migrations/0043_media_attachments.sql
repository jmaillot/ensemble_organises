-- 0043_media_attachments.sql
-- Pièces jointes des animaux et des notes, et PDF autorisés dans le stockage.
--
-- Constat (retour produit, 30/09/2026) :
--   * la fiche animal n'accepte qu'une URL de photo saisie à la main, donc
--     l'illustration reste celle de démonstration quel que soit l'animal ;
--   * `pet_records.attachment_url` existe depuis 0004 mais n'est ni écrit ni
--     lu : aucun fichier (ordonnance, facture, compte rendu) ne peut être
--     joint au carnet de santé ;
--   * `notes` ne porte aucun média, contrairement au Cercle.
--
-- Contenu :
--   * `household-media` accepte désormais `application/pdf`, en plus des
--     images et vidéos déjà admises. Mise à jour idempotente : les autres
--     réglages du bucket sont préservés.
--   * `pet_attachments` : fichiers d'un animal, affichés dans une section
--     dédiée sous le carnet de santé (plusieurs fichiers par animal, là où
--     `attachment_url` n'en portait qu'un par ligne de suivi).
--   * `note_attachments` : fichiers d'une note, sur le modèle de
--     `post_media` (plusieurs fichiers par note).
--
-- Les deux tables suivent le motif « foyer plat » (0007) : `household_id`
-- dénormalisé, justifié par l'affichage sans jointure et contraint par le
-- déclencheur `align_household` (0008). Suppression en cascade depuis le
-- parent, RLS activée, quatre politiques explicites.

begin;

-- ---------------------------------------------------------------------------
-- PDF dans le bucket des médias du foyer
-- ---------------------------------------------------------------------------
update storage.buckets
   set allowed_mime_types = array_append(allowed_mime_types, 'application/pdf')
 where id = 'household-media'
   and not (allowed_mime_types @> array['application/pdf']);

-- ---------------------------------------------------------------------------
-- Table des pièces jointes d'un animal
-- ---------------------------------------------------------------------------
create table public.pet_attachments (
  id text primary key default private.new_id('pet-attachment'),
  pet_id text not null references public.pets (id) on delete cascade,
  -- `household_id` dénormalisé : justifié par la section « pièces jointes »
  -- de la fiche, sans jointure sur `pets`, et validé par trigger.
  household_id text not null references public.households (id) on delete cascade,
  file_url text not null check (char_length(btrim(file_url)) between 1 and 2000),
  file_name text not null check (char_length(btrim(file_name)) between 1 and 255),
  mime_type text not null check (char_length(btrim(mime_type)) between 1 and 127),
  size_bytes integer not null check (size_bytes >= 0),
  created_at timestamptz not null default now()
);
comment on table public.pet_attachments is 'Pièces jointes des fiches animaux : ordonnances, factures, comptes rendus.';

alter table public.pet_attachments enable row level security;

drop policy if exists pet_attachments_select_household on public.pet_attachments;
create policy pet_attachments_select_household on public.pet_attachments
  for select using (private.is_household_member(household_id));

drop policy if exists pet_attachments_insert_household on public.pet_attachments;
create policy pet_attachments_insert_household on public.pet_attachments
  for insert with check (private.can_write_household(household_id));

drop policy if exists pet_attachments_update_household on public.pet_attachments;
create policy pet_attachments_update_household on public.pet_attachments
  for update using (private.can_write_household(household_id))
  with check (private.can_write_household(household_id));

drop policy if exists pet_attachments_delete_admin on public.pet_attachments;
create policy pet_attachments_delete_admin on public.pet_attachments
  for delete using (private.is_household_admin(household_id));

drop trigger if exists align_household on public.pet_attachments;
create trigger align_household before insert or update on public.pet_attachments
  for each row execute function private.align_child_household('pets', 'pet_id');

-- ---------------------------------------------------------------------------
-- Table des pièces jointes d'une note
-- ---------------------------------------------------------------------------
create table public.note_attachments (
  id text primary key default private.new_id('note-attachment'),
  note_id text not null references public.notes (id) on delete cascade,
  -- `household_id` dénormalisé : justifié par l'affichage des vignettes sur
  -- les cartes de notes, sans jointure sur `notes`, et validé par trigger.
  household_id text not null references public.households (id) on delete cascade,
  file_url text not null check (char_length(btrim(file_url)) between 1 and 2000),
  file_name text not null check (char_length(btrim(file_name)) between 1 and 255),
  mime_type text not null check (char_length(btrim(mime_type)) between 1 and 127),
  size_bytes integer not null check (size_bytes >= 0),
  created_at timestamptz not null default now()
);
comment on table public.note_attachments is 'Pièces jointes des notes du foyer, sur le modèle de post_media.';

alter table public.note_attachments enable row level security;

drop policy if exists note_attachments_select_household on public.note_attachments;
create policy note_attachments_select_household on public.note_attachments
  for select using (private.is_household_member(household_id));

drop policy if exists note_attachments_insert_household on public.note_attachments;
create policy note_attachments_insert_household on public.note_attachments
  for insert with check (private.can_write_household(household_id));

drop policy if exists note_attachments_update_household on public.note_attachments;
create policy note_attachments_update_household on public.note_attachments
  for update using (private.can_write_household(household_id))
  with check (private.can_write_household(household_id));

drop policy if exists note_attachments_delete_admin on public.note_attachments;
create policy note_attachments_delete_admin on public.note_attachments
  for delete using (private.is_household_admin(household_id));

drop trigger if exists align_household on public.note_attachments;
create trigger align_household before insert or update on public.note_attachments
  for each row execute function private.align_child_household('notes', 'note_id');

-- ---------------------------------------------------------------------------
-- Realtime : les vignettes suivent les dépôts sans rechargement.
-- ---------------------------------------------------------------------------
do $$
declare
  r text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'Publication supabase_realtime absente : Realtime non activé sur cette stack.';
    return;
  end if;

  foreach r in array array['pet_attachments', 'note_attachments'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', r);
    exception when others then
      raise notice 'table % ignorée pour Realtime : %', r, sqlerrm;
    end;
  end loop;
end;
$$;

commit;
