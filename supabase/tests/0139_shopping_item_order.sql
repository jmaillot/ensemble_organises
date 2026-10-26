-- supabase/tests/0139_shopping_item_order.sql
-- L'ordre du foyer sur une liste de courses (migration 0139).
--
-- CE QUI EST VÉRIFIÉ, ET POURQUOI LE FK NE SUFFIT PAS. La colonne
-- `position` n'a pas de contrainte d'unicité : deux articles peuvent porter
-- le même rang, et l'ordre affiché resterait indécis. Ce qui est vérifié
-- ici est donc le RANG (le backfill numérote sans trou) et le DROIT
-- D'ÉCRIRE dessus — un `update` de `position` est-il accepté pour un
-- membre du foyer, refusé pour un autre foyer, refusé pour un enfant ?
--
-- (a) le backfill rend le rang de création, sans trou ni doublon ;
-- (b) un membre du foyer peut réordonner ;
-- (c) un membre d'un AUTRE foyer ne peut pas ;
-- (d) le rôle `enfant` ne peut pas — il est en lecture seule ;
-- (e) le rang est NOT NULL : un rang nul explicite est refusé.
--
-- PREUVE ROUGE : (c) et (d) échouent sans la politique `update` de 0081
-- (`shopping_list_items_update_household`), et (a) échoue sans la fonction
-- de backfill.
--
-- Bornes (AGENTS.md §2.7D) : chaque comptage porte sur `*_t139*`, jamais sur
-- la table entière. Fichier autonome, `rollback` final.

begin;

do $$
declare
  alice  uuid := testkit.auth_user('t139-alice@example.fr', 'Alice Ordre');
  bob    uuid := testkit.auth_user('t139-bob@example.fr', 'Bob Ordre');
  zoe    uuid := testkit.auth_user('t139-zoe@example.fr', 'Zoe Ailleurs');
  noe    uuid := testkit.auth_user('t139-noe@example.fr', 'Noé Enfant');
  home   text := testkit.household(alice, 'Foyer Ordre');
  home2  text := testkit.household(zoe, 'Foyer Ailleurs');
  list_a text;
  list_z text;
begin
  insert into public.shopping_lists (id, household_id, name)
  values ('list_t139_a', home, 'Liste du foyer'),
         ('list_t139_z', home2, 'Liste étrangère');

  list_a := 'list_t139_a';
  list_z := 'list_t139_z';

  -- Trois articles, trois dates distinctes : l'ordre de création est net.
  insert into public.shopping_list_items (id, list_id, household_id, name, created_at)
  values ('item_t139_1', list_a, home, 'Premier',  '2026-01-01T08:00:00'),
         ('item_t139_2', list_a, home, 'Deuxième', '2026-01-02T08:00:00'),
         ('item_t139_3', list_a, home, 'Troisième', '2026-01-03T08:00:00');

  insert into public.shopping_list_items (id, list_id, household_id, name, created_at)
  values ('item_t139_z', list_z, home2, 'Étranger', '2026-01-01T08:00:00');

  -- Les appartenances : sans elles, Bob n'est PAS membre du foyer et ses
  -- écritures seraient filtrées en silence (0 ligne, aucune erreur) — un
  -- test qui passerait pour une preuve.
  perform testkit.member(home, alice, 'Alice Ordre', 'admin');
  perform testkit.member(home, bob, 'Bob Ordre', 'membre');
  perform testkit.member(home2, zoe, 'Zoe Ailleurs', 'admin');

  insert into testkit.fx (key, user_id) values ('alice', alice), ('bob', bob), ('zoe', zoe), ('noe', noe);
  insert into testkit.fx (key, household_id) values ('home', home), ('home2', home2);
  insert into testkit.fx (key, row_id) values ('list_a', list_a), ('list_z', list_z);
end;
$$;

-- ---------------------------------------------------------------------------
-- (a) Le backfill rend le rang de création : 0, 1, 2 — sans trou.
-- ---------------------------------------------------------------------------
do $$
declare
  v_count integer;
begin
  -- 0139 était erroné : cette assertion portait sur la VALEUR DE RETOUR
  -- GLOBALE de `backfill_shopping_item_positions()` (row_count sur TOUTE
  -- `shopping_list_items`) — dès qu'un article réel existe en base, elle
  -- dépasse les fixtures et l'assertion casse sans rien dire de notre
  -- semis. Conformément à AGENTS.md §2.7 D, on renonce à affirmer sur le
  -- global : la preuve est confiée aux comptages bornés qui suivent — après
  -- le backfill, plus aucun article du test n'est sans rang.
  v_count := private.backfill_shopping_item_positions();
  perform testkit.eq(
    testkit.count($q$select 1 from public.shopping_list_items
                    where id like 'item_t139_%' and position is null$q$),
    0::bigint,
    'le backfill a numéroté les quatre articles du test');

  perform testkit.eq(
    testkit.count($q$select 1 from public.shopping_list_items
                    where id = 'item_t139_1' and position = 0$q$),
    1::bigint,
    'le premier créé est rang 0');
  perform testkit.eq(
    testkit.count($q$select 1 from public.shopping_list_items
                    where id = 'item_t139_2' and position = 1$q$),
    1::bigint,
    'le deuxième créé est rang 1');
  perform testkit.eq(
    testkit.count($q$select 1 from public.shopping_list_items
                    where id = 'item_t139_3' and position = 2$q$),
    1::bigint,
    'le troisième créé est rang 2');
  perform testkit.eq(
    testkit.count($q$select 1 from public.shopping_list_items
                    where list_id = 'list_t139_a'
                      and position not between 0 and 2$q$),
    0::bigint,
    'aucun rang hors de la plage de la liste');
end;
$$;

-- ---------------------------------------------------------------------------
-- (b) Un membre du foyer réordonne sa liste.
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't139-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.expect_ok(
  $q$update public.shopping_list_items set position = 5 where id = 'item_t139_2'$q$);

select testkit.eq(testkit.affected($q$update public.shopping_list_items
                                     set position = 1 where id = 'item_t139_2'$q$), 1::bigint,
  'un membre du foyer peut réordonner un article de la liste');

-- ---------------------------------------------------------------------------
-- (c) Un membre d'un autre foyer ne peut pas y toucher.
--
-- ATTENTION AU COMPTEUR, PAS À L'ERREUR : un `update` filtré par la RLS ne
-- LÈVE rien — il ne touche simplement aucune ligne. C'est le compteur qui
-- prouve que rien n'a été écrit ; `expect_denied` aurait ici réussi pour
-- une raison fausse (aucune ligne visée, aucune erreur levée).
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't139-zoe@example.fr') from testkit.fx where key = 'zoe';

select testkit.eq(testkit.affected($q$update public.shopping_list_items
                                     set position = 9 where id = 'item_t139_2'$q$), 0::bigint,
  'un membre d''un autre foyer ne peut pas réordonner la liste');

-- La VÉRIFICATION se fait sous un rôle qui voit la ligne : un compte rendu
-- lu par Zoe ne verrait rien de cette liste, et « 0 ligne » y serait la
-- preuve de rien.
select testkit.as_user(user_id, 't139-alice@example.fr') from testkit.fx where key = 'alice';
select testkit.eq(testkit.count($q$select 1 from public.shopping_list_items
                                  where id = 'item_t139_2' and position = 1$q$), 1::bigint,
  'le rang est resté celui de l''écriture autorisée');

-- ---------------------------------------------------------------------------
-- (d) Le rôle `enfant` est en lecture seule.
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't139-noe@example.fr') from testkit.fx where key = 'noe';
select testkit.member(
  (select household_id from testkit.fx where key = 'home'),
  (select user_id from testkit.fx where key = 'noe'),
  'Noé Enfant',
  'enfant');

select testkit.eq(testkit.affected($q$update public.shopping_list_items
                                     set position = 7 where id = 'item_t139_2'$q$), 0::bigint,
  'un enfant ne peut pas réordonner la liste');

select testkit.as_user(user_id, 't139-alice@example.fr') from testkit.fx where key = 'alice';
select testkit.eq(testkit.count($q$select 1 from public.shopping_list_items
                                  where id = 'item_t139_2' and position = 1$q$), 1::bigint,
  'le rang est resté celui de l''écriture autorisée');

-- ---------------------------------------------------------------------------
-- (e) Le rang est NOT NULL.
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't139-alice@example.fr') from testkit.fx where key = 'alice';

select testkit.expect_denied(
  $q$update public.shopping_list_items set position = null where id = 'item_t139_2'$q$,
  'un rang ne peut pas être nul');

select testkit.eq(testkit.count($q$select 1 from public.shopping_list_items
                                  where id = 'item_t139_2' and position is null$q$), 0::bigint,
  'le rang de l''article est resté écrit');

rollback;
