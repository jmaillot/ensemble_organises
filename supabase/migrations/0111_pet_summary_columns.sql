-- 0111_pet_summary_columns.sql
-- Phase 12 (D-10) : les informations libres et le prochain rappel de la fiche
-- vivent dans de vraies colonnes de `pets`, pas dans une ligne magique.
--
-- Constat : `savePetSummary` (client) portait `notes` et `next_due_date` dans
-- une entree `pet_records` de type `info` nommee 'Informations de la fiche'.
-- Le nom faisait office de cle fonctionnelle : fragile aux collisions (un
-- suivi utilisateur portant ce nom est adopte comme synthese), et la ligne
-- magique polluait les comptes d'onglets et la chronologie du carnet.
-- `pet_records.attachment_url` (0004), lui, n'a jamais ete ni ecrit ni lu
-- depuis que `pet_attachments` (0043) porte les fichiers : colonne morte.
--
-- Contenu, vers l'avant uniquement (les migrations appliquees ne sont jamais
-- retouchees) :
--   * `pets.notes` (text) et `pets.next_reminder_date` (date), NULL par
--     defaut : une fiche sans rappel reste une fiche valide ;
--   * recopie depuis les lignes magiques (`type = 'info'` ET nom magique —
--     un suivi utilisateur qui ne partage que le nom, sous un autre type,
--     n'est ni recopie ni supprime), la plus recente (`record_date`, puis
--     `id`) gagnant en cas de doublon ;
--   * suppression des lignes magiques, puis suppression de la colonne morte.
--
-- Ordre DML/ALTER : les colonnes sont ajoutees et la colonne morte retiree
-- AVANT les ecritures, donc aucun `alter table` ne suit un DML sur la meme
-- table dans cette transaction (`pets` et `pet_records` ne portent de toute
-- facon aucun trigger de contrainte differe — seuls `expenses` et
-- `expense_participants` en ont, 0008).

begin;

alter table public.pets
  add column if not exists notes text,
  add column if not exists next_reminder_date date;

comment on column public.pets.notes is
  'Informations libres de la fiche animal (D-10) : recopiees depuis les lignes magiques, lues sans passer par pet_records.';
comment on column public.pets.next_reminder_date is
  'Prochain rappel de la fiche animal (D-10) : recopie depuis les lignes magiques, NULL quand aucun rappel.';

-- La colonne morte part avant les ecritures (voir l'en-tete : aucun ALTER ne
-- suit un DML sur la meme table).
alter table public.pet_records
  drop column if exists attachment_url;

-- Recopie fidele : une seule ligne gagnante par animal, la plus recente.
update public.pets p
   set notes = m.notes,
       next_reminder_date = m.next_due_date
  from (
    select distinct on (r.pet_id) r.pet_id, r.notes, r.next_due_date
      from public.pet_records r
     where r.type = 'info'
       and r.name = 'Informations de la fiche'
     order by r.pet_id, r.record_date desc, r.id desc
  ) m
 where p.id = m.pet_id;

-- Les lignes magiques ont livre leur contenu : elles quittent le carnet, les
-- comptes d'onglets et la chronologie redeviennent des suivis reels.
delete from public.pet_records r
 where r.type = 'info'
   and r.name = 'Informations de la fiche';

commit;
