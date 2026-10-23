-- supabase/tests/0141_pantry_items.sql
-- Le frigo du foyer (migration 0141, vague 3.1).
--
-- CE QUI EST VÉRIFIÉ, ET POURQUOI. Le frigo est un espace PARTAGÉ où chaque
-- membre ajoute et retire au fil des courses et des repas — mais un enfant
-- reste en lecture seule (phase 14), et personne n'écrit au nom d'autrui.
--
-- (a) un membre du foyer ajoute un article et le relit ;
-- (b) le rôle `enfant` ne peut ni ajouter ni supprimer : l'INSERT viole la
--     WITH CHECK et LÈVE une erreur (expect_denied), le DELETE est filtré
--     en silence (compteur 0) ;
-- (c) un membre d'un AUTRE foyer n'y voit rien et n'y écrit rien ;
-- (d) l'auteur usurpé est refusé : `created_by` doit être nul ou le membre
--     courant — sinon Bob pourrait ajouter « au nom d'Alice » un article
--     qu'Alice ne pourra pas modifier elle-même (la politique d'update porte
--     la même garde) ;
-- (e) les bornes de forme : emplacement hors liste, quantité nulle ou
--     négative, ouverture après péremption — chaque refus est une erreur de
--     contrainte ;
-- (f) la lecture est bornée au foyer : Zoe ne compte aucune ligne du foyer
--     d'Alice, et Alice ne compte aucune ligne de Zoe.
--
-- PREUVE ROUGE : (b) réussirait sans le rôle `enfant` de can_write_household,
-- (d) sans la colonne d'auteur dans les politiques, (e) sans les contraintes.
--
-- Bornes (AGENTS.md §2.7D) : chaque comptage porte sur le foyer du test ou
-- un article nommé *_t141_*, jamais sur la table entière. Fichier autonome,
-- `rollback` final.

begin;

do $$
declare
  alice  uuid := testkit.auth_user('t141-alice@example.fr', 'Alice Frigo');
  bob    uuid := testkit.auth_user('t141-bob@example.fr', 'Bob Frigo');
  zoe    uuid := testkit.auth_user('t141-zoe@example.fr', 'Zoe Ailleurs');
  noe    uuid := testkit.auth_user('t141-noe@example.fr', 'Noé Enfant');
  home   text := testkit.household(alice, 'Foyer Frigo');
  home2  text := testkit.household(zoe, 'Foyer Ailleurs');
  alice_member text;
begin
  perform testkit.member(home, alice, 'Alice Frigo', 'admin');
  perform testkit.member(home, bob, 'Bob Frigo', 'membre');
  perform testkit.member(home, noe, 'Noé Enfant', 'enfant');
  perform testkit.member(home2, zoe, 'Zoe Ailleurs', 'admin');
  alice_member := (select id from public.household_members
                    where household_id = home and user_id = alice);

  insert into testkit.fx (key, user_id) values ('alice', alice), ('bob', bob), ('zoe', zoe), ('noe', noe);
  insert into testkit.fx (key, household_id) values ('home', home), ('home2', home2), ('alice_member', null);
  update testkit.fx set row_id = alice_member where key = 'alice_member';
end;
$$;

-- ---------------------------------------------------------------------------
-- (a) Un membre ajoute un article et le relit.
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't141-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.expect_ok(
  $q$insert into public.pantry_items (id, household_id, name, category, quantity, unit, location, expires_on, created_by)
    values ('item_t141_1', (select household_id from testkit.fx where key = 'home'),
            'Yaourts nature', 'produit_frais', 8, 'pots', 'frigo', current_date + 5,
            (select row_id from testkit.fx where key = 'alice_member'))$q$);

select testkit.eq(
  testkit.count($q$select 1 from public.pantry_items where id = 'item_t141_1'$q$),
  1::bigint,
  'l''article ajouté est relu par son auteure');

-- Un article sans date ni auteur explicites : les défauts suffisent.
select testkit.expect_ok(
  $q$insert into public.pantry_items (id, household_id, name)
    values ('item_t141_2', (select household_id from testkit.fx where key = 'home'), 'Confiture maison')$q$);

-- ---------------------------------------------------------------------------
-- (b) L'enfant est en lecture seule : ni ajout, ni suppression.
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't141-noe@example.fr') from testkit.fx where key = 'noe';

-- INSERT : une violation de WITH CHECK lève une erreur (contrairement aux
-- UPDATE/DELETE, qui filtrent silencieusement) — donc expect_denied.
select testkit.expect_denied(
  $q$insert into public.pantry_items (id, household_id, name)
    values ('item_t141_n', (select household_id from testkit.fx where key = 'home'), 'Bonbons')$q$);

select testkit.eq(
  testkit.affected($q$delete from public.pantry_items where id = 'item_t141_1'$q$),
  0::bigint,
  'un enfant ne peut pas retirer d''article du frigo');

-- ---------------------------------------------------------------------------
-- (c) Un membre d'un autre foyer n'y voit rien et n'y écrit rien.
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't141-zoe@example.fr') from testkit.fx where key = 'zoe';

select testkit.eq(
  testkit.count($q$select 1 from public.pantry_items where id = 'item_t141_1'$q$),
  0::bigint,
  'l''article du foyer d''Alice est invisible pour Zoe');

select testkit.expect_denied(
  $q$insert into public.pantry_items (id, household_id, name)
    values ('item_t141_z', (select household_id from testkit.fx where key = 'home'), 'Camembert')$q$);

-- ---------------------------------------------------------------------------
-- (d) L'auteur usurpé est refusé : Alice n'ajoute pas au nom de Bob.
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't141-alice@example.fr') from testkit.fx where key = 'alice';

select testkit.expect_denied(
  $q$insert into public.pantry_items (id, household_id, name, created_by)
    values ('item_t141_f', (select household_id from testkit.fx where key = 'home'), 'Pizza surgelée',
            (select id from public.household_members
              where household_id = (select household_id from testkit.fx where key = 'home')
                and user_id = (select user_id from testkit.fx where key = 'bob')))$q$);

-- ---------------------------------------------------------------------------
-- (e) Les bornes de forme : chaque refus est une erreur de contrainte.
-- ---------------------------------------------------------------------------
select testkit.expect_denied(
  $q$insert into public.pantry_items (id, household_id, name, location)
    values ('item_t141_x', (select household_id from testkit.fx where key = 'home'), 'Mystère', 'cave')$q$);

select testkit.expect_denied(
  $q$insert into public.pantry_items (id, household_id, name, quantity)
    values ('item_t141_y', (select household_id from testkit.fx where key = 'home'), 'Rien', 0)$q$);

select testkit.expect_denied(
  $q$insert into public.pantry_items (id, household_id, name, expires_on, opened_on)
    values ('item_t141_o', (select household_id from testkit.fx where key = 'home'), 'Tarte',
            current_date - 1, current_date)$q$);

-- ---------------------------------------------------------------------------
-- (f) La lecture est bornée au foyer, dans les DEUX sens.
-- ---------------------------------------------------------------------------
select testkit.eq(
  testkit.count($q$select 1 from public.pantry_items
                 where household_id = (select household_id from testkit.fx where key = 'home')$q$),
  2::bigint,
  'Alice voit exactement les deux articles de son foyer');

select testkit.eq(
  testkit.count($q$select 1 from public.pantry_items
                 where household_id = (select household_id from testkit.fx where key = 'home2')$q$),
  0::bigint,
  'Alice ne voit aucune ligne du foyer de Zoe');

-- ---------------------------------------------------------------------------
-- (g) Un membre du foyer supprime un article consommé.
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't141-bob@example.fr') from testkit.fx where key = 'bob';

select testkit.eq(
  testkit.affected($q$delete from public.pantry_items where id = 'item_t141_2'$q$),
  1::bigint,
  'n''importe quel membre retire un article consommé');

rollback;
