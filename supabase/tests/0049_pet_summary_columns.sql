-- supabase/tests/0049_pet_summary_columns.sql
-- Phase 12 (D-10, plan 12-02) : preuves de la migration 0111 — les
-- informations libres et le prochain rappel de la fiche vivent dans
-- `pets.notes` / `pets.next_reminder_date`, les lignes magiques ont disparu
-- et `pet_records.attachment_url` n'existe plus.
--
-- Forme 0002 : fixtures bornees par objet via testkit.fx (jamais de total
-- nu), `affected = 0/1` et `count = 0/1` ancres sur nos animaux, rollback
-- final. Les assertions sont ecrites en `postgres` (RLS contournee, comme
-- en 0048) : ce fichier prouve le CONTENU de la migration, pas les
-- politiques (prouvees en 0048).
--
-- La migration 0111 a deja tourne au moment des tests : les fixtures
-- magiques inserees ici sont des lignes NOUVELLES, et les deux ordres
-- UPDATE/DELETE ci-dessous en sont la recopie VERBATIM (ils doivent rester
-- synchronises avec 0111). Le test prouve donc que ces ordres recopient
-- fidelement, suppriment les lignes magiques et epargnent la collision —
-- et la section 0 prouve que 0111 a bien livre le schema effectif.

begin;

-- ===========================================================================
-- Section 0 — Contrat de schema effectif (0111), lu au catalogue
-- ===========================================================================
-- Forme positive et bornee : les deux colonnes exactes doivent exister, la
-- colonne morte ne doit plus exister. Un compte borne a la liste ne suppose
-- aucune base vide et ne peut pas etre vert par accident.
select testkit.eq(
  (select count(*)
     from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pets'
      and column_name in ('notes', 'next_reminder_date')),
  2::bigint,
  'pets porte notes et next_reminder_date (0111)');
select testkit.eq(
  (select count(*)
     from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pet_records'
      and column_name = 'attachment_url'),
  0::bigint,
  'pet_records.attachment_url a disparu (0111)');

do $$
declare
  alice uuid := testkit.auth_user('sommaire-alice@example.fr', 'Alice Sommaire');
  home_a text := testkit.household(alice, 'Foyer Sommaire A');
  alice_m text := testkit.member(home_a, alice, 'Alice Sommaire', 'admin', 'accent');

  pet_rich text := private.new_id('pet');
  pet_bare text := private.new_id('pet');
  pet_collide text := private.new_id('pet');
begin
  insert into public.pets (id, household_id, name, species)
  values (pet_rich, home_a, 'Nala', 'Chien'),
         (pet_bare, home_a, 'Mimine', 'Chat'),
         (pet_collide, home_a, 'Rio', 'Oiseau');

  -- Deux lignes magiques sur le meme animal : la plus recente doit gagner.
  insert into public.pet_records (id, pet_id, household_id, type, name, record_date, next_due_date, notes)
  values (private.new_id('pet-record'), pet_rich, home_a, 'info', 'Informations de la fiche',
          date '2026-01-10', date '2026-02-01', 'Ancien contenu'),
         (private.new_id('pet-record'), pet_rich, home_a, 'info', 'Informations de la fiche',
          date '2026-05-01', date '2026-06-15', 'Contenu gagnant');

  -- Collision : le meme nom magique, mais un VRAI suivi produit — pas une
  -- synthese. La migration ne doit ni le recopier ni le supprimer.
  insert into public.pet_records (id, pet_id, household_id, type, name, record_date, next_due_date, notes)
  values (private.new_id('pet-record'), pet_collide, home_a, 'produit', 'Informations de la fiche',
          date '2026-04-01', null, 'Contenu utilisateur');

  insert into testkit.fx (key, user_id, household_id, row_id) values
    ('alice', alice, home_a, alice_m),
    ('pet_rich', null, home_a, pet_rich),
    ('pet_bare', null, home_a, pet_bare),
    ('pet_collide', null, home_a, pet_collide);
end;
$$;

-- ===========================================================================
-- Rejeu VERBATIM des ordres de 0111 (voir l'en-tete : la migration a deja
-- tourne, ces ordres s'appliquent aux fixtures neuves).
-- ===========================================================================
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

delete from public.pet_records r
 where r.type = 'info'
   and r.name = 'Informations de la fiche';

-- ===========================================================================
-- Recopie fidele : la ligne magique la plus recente atterrit sur le bon
-- animal, avec ses deux champs.
-- ===========================================================================
select testkit.eq(testkit.count(format(
  'select 1 from public.pets where id = %L and notes = %L and next_reminder_date = %L',
  (select row_id from testkit.fx where key = 'pet_rich'), 'Contenu gagnant', '2026-06-15')), 1::bigint,
  'la synthese la plus recente est recopiee sur le bon animal (notes + rappel)');

-- --- Animal sans ligne magique : colonnes intactes (NULL), jamais ecrasees --
select testkit.eq(testkit.count(format(
  'select 1 from public.pets where id = %L and notes is null and next_reminder_date is null',
  (select row_id from testkit.fx where key = 'pet_bare'))), 1::bigint,
  'un animal sans synthese garde des colonnes NULL');

-- --- Lignes magiques parties : entrees du carnet assainies ------------------
select testkit.eq(testkit.count(format(
  'select 1 from public.pet_records where pet_id = %L and type = %L and name = %L',
  (select row_id from testkit.fx where key = 'pet_rich'), 'info', 'Informations de la fiche')), 0::bigint,
  'les lignes magiques ont quitte le carnet');
select testkit.eq(testkit.count(format(
  'select 1 from public.pet_records where pet_id = %L',
  (select row_id from testkit.fx where key = 'pet_rich'))), 0::bigint,
  'le carnet ne compte plus que des suivis reels (ici : aucun)');

-- --- Collision sans detournement : le suivi utilisateur survit intact, et sa
-- --- fiche ne recoit rien -----------------------------------------------
select testkit.eq(testkit.count(format(
  'select 1 from public.pet_records where pet_id = %L and type = %L and name = %L and notes = %L',
  (select row_id from testkit.fx where key = 'pet_collide'), 'produit', 'Informations de la fiche', 'Contenu utilisateur')), 1::bigint,
  'un suivi utilisateur partageant le nom magique survit intact');
select testkit.eq(testkit.count(format(
  'select 1 from public.pets where id = %L and notes is null and next_reminder_date is null',
  (select row_id from testkit.fx where key = 'pet_collide'))), 1::bigint,
  'la collision ne detourne aucun contenu vers la fiche');

reset role;

rollback;
