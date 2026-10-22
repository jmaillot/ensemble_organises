-- supabase/tests/0142_meal_entries.sql
-- Le menu de la semaine (migration 0142, vague 3.1).
--
-- CE QUI EST VÉRIFIÉ, ET POURQUOI. Le menu planifie les repas du foyer :
-- même motif foyer plat que le frigo (0141) — écriture admin/membre, enfant
-- en lecture seule, auteur nul ou soi-même — plus les bornes propres au
-- domaine : un repas porte SOIT une recette SOIT un texte libre (jamais une
-- ligne vide), un moment de journée fermé (matin/midi/soir), des portions
-- entre 1 et 50, et il disparaît AVEC sa recette (cascade) : un menu ne
-- garde pas de recette fantôme.
--
-- (a) un membre du foyer écrit un repas-recette et un repas-texte, et les
--     relit ;
-- (b) le rôle `enfant` ne peut ni ajouter ni supprimer ;
-- (c) un foyer étranger n'y voit rien et n'y écrit rien ;
-- (d) la contrainte de contenu : ni recette ni texte → refus ;
-- (e) les bornes de forme : slot hors liste, servings hors plage → refus ;
-- (f) supprimer la recette supprime l'entrée du menu (cascade).
--
-- Bornes (AGENTS.md §2.7D) : chaque comptage porte sur le foyer du test.
-- Fichier autonome, `rollback` final.

begin;

do $$
declare
  alice  uuid := testkit.auth_user('t142-alice@example.fr', 'Alice Menu');
  bob    uuid := testkit.auth_user('t142-bob@example.fr', 'Bob Menu');
  zoe    uuid := testkit.auth_user('t142-zoe@example.fr', 'Zoe Ailleurs');
  noe    uuid := testkit.auth_user('t142-noe@example.fr', 'Noé Enfant');
  home   text := testkit.household(alice, 'Foyer Menu');
  home2  text := testkit.household(zoe, 'Foyer Ailleurs');
begin
  perform testkit.member(home, alice, 'Alice Menu', 'admin');
  perform testkit.member(home, bob, 'Bob Menu', 'membre');
  perform testkit.member(home, noe, 'Noé Enfant', 'enfant');
  perform testkit.member(home2, zoe, 'Zoe Ailleurs', 'admin');

  insert into testkit.fx (key, user_id) values ('alice', alice), ('bob', bob), ('zoe', zoe), ('noe', noe);
  insert into testkit.fx (key, household_id) values ('home', home), ('home2', home2);
end;
$$;

-- Une recette du foyer, pour les repas-recette et la cascade.
insert into public.recipes (id, household_id, title, servings)
values ('recipe_t142_1', (select household_id from testkit.fx where key = 'home'), 'Lasagnes du dimanche', 4);

-- ---------------------------------------------------------------------------
-- (a) Un membre écrit les deux formes de repas et les relit.
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't142-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.expect_ok(
  $q$insert into public.meal_entries (id, household_id, entry_date, slot, recipe_id, servings, member_ids)
    values ('meal_t142_1', (select household_id from testkit.fx where key = 'home'),
            current_date, 'midi', 'recipe_t142_1', 4, '{}')$q$);

select testkit.expect_ok(
  $q$insert into public.meal_entries (id, household_id, entry_date, slot, free_text)
    values ('meal_t142_2', (select household_id from testkit.fx where key = 'home'),
            current_date, 'soir', 'Restes du frigo')$q$);

select testkit.eq(
  testkit.count($q$select 1 from public.meal_entries
                 where household_id = (select household_id from testkit.fx where key = 'home')
                   and slot = 'midi' and recipe_id = 'recipe_t142_1'$q$),
  1::bigint,
  'le repas-recette est relu');

-- ---------------------------------------------------------------------------
-- (b) L'enfant est en lecture seule.
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't142-noe@example.fr') from testkit.fx where key = 'noe';

select testkit.expect_denied(
  $q$insert into public.meal_entries (id, household_id, entry_date, slot, free_text)
    values ('meal_t142_n', (select household_id from testkit.fx where key = 'home'),
            current_date, 'midi', 'Bonbons')$q$);

select testkit.eq(
  testkit.affected($q$delete from public.meal_entries where id = 'meal_t142_2'$q$),
  0::bigint,
  'un enfant ne peut pas retirer un repas');

-- ---------------------------------------------------------------------------
-- (c) Un foyer étranger n'y voit rien et n'y écrit rien.
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't142-zoe@example.fr') from testkit.fx where key = 'zoe';

select testkit.eq(
  testkit.count($q$select 1 from public.meal_entries where id = 'meal_t142_1'$q$),
  0::bigint,
  'le menu du foyer d''Alice est invisible pour Zoe');

select testkit.expect_denied(
  $q$insert into public.meal_entries (id, household_id, entry_date, slot, free_text)
    values ('meal_t142_z', (select household_id from testkit.fx where key = 'home'),
            current_date, 'midi', 'Pique-nique')$q$);

-- ---------------------------------------------------------------------------
-- (d) La contrainte de contenu : ni recette ni texte → refus.
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't142-alice@example.fr') from testkit.fx where key = 'alice';

select testkit.expect_denied(
  $q$insert into public.meal_entries (id, household_id, entry_date, slot)
    values ('meal_t142_e', (select household_id from testkit.fx where key = 'home'), current_date, 'midi')$q$);

-- Un texte d'espaces seuls ne compte pas comme contenu.
select testkit.expect_denied(
  $q$insert into public.meal_entries (id, household_id, entry_date, slot, free_text)
    values ('meal_t142_e2', (select household_id from testkit.fx where key = 'home'), current_date, 'soir', '   ')$q$);

-- ---------------------------------------------------------------------------
-- (e) Les bornes de forme : slot et servings.
-- ---------------------------------------------------------------------------
select testkit.expect_denied(
  $q$insert into public.meal_entries (id, household_id, entry_date, slot, free_text)
    values ('meal_t142_s', (select household_id from testkit.fx where key = 'home'), current_date, 'gouter', 'Crêpes')$q$);

select testkit.expect_denied(
  $q$insert into public.meal_entries (id, household_id, entry_date, slot, free_text, servings)
    values ('meal_t142_v', (select household_id from testkit.fx where key = 'home'), current_date, 'midi', 'Soupe', 0)$q$);

select testkit.expect_denied(
  $q$insert into public.meal_entries (id, household_id, entry_date, slot, free_text, servings)
    values ('meal_t142_v2', (select household_id from testkit.fx where key = 'home'), current_date, 'midi', 'Soupe', 60)$q$);

-- ---------------------------------------------------------------------------
-- (f) La recette emporte son repas : cascade à la suppression.
-- ---------------------------------------------------------------------------
select testkit.eq(
  testkit.count($q$select 1 from public.meal_entries where recipe_id = 'recipe_t142_1'$q$),
  1::bigint,
  'l''entrée-recette existe avant la suppression');

delete from public.recipes where id = 'recipe_t142_1';

select testkit.eq(
  testkit.count($q$select 1 from public.meal_entries where recipe_id = 'recipe_t142_1'$q$),
  0::bigint,
  'la recette supprimée emporte son repas du menu (cascade)');

select testkit.eq(
  testkit.count($q$select 1 from public.meal_entries
                 where household_id = (select household_id from testkit.fx where key = 'home')$q$),
  1::bigint,
  'il reste le repas-texte du foyer');

rollback;
