-- supabase/tests/0140_household_disabled_modules.sql
-- Le menu des applications du foyer (migration 0140).
--
-- CE QUI EST VÉRIFIÉ, ET POURQUOI. `households.disabled_modules` porte les
-- espaces éteints du foyer. Rien ici ne crée de politique : l'autorité est
-- déjà celle de `households_update` (0007, administrateur-seul), et le test
-- doit le PROUVER plutôt que le supposer — un droit d'écriture hérité ne
-- vaut que si quelqu'un vérifie qu'il n'est pas tombé en chemin.
--
-- (a) le défaut est le tableau vide : tout foyer existant garde tout activé,
--     sans backfill ni effet de bord ;
-- (b) un administrateur écrit la colonne et relit ce qu'il a écrit ;
-- (c) un membre du foyer (rôle `membre`) ne peut PAS : un `update` filtré
--     par la RLS ne lève rien — le compteur à 0 est la seule preuve,
--     `expect_denied` réussirait ici pour une fausse raison ;
-- (d) un administrateur d'un AUTRE foyer ne peut pas davantage ;
-- (e) la garde de forme refuse une clé en majuscule, une clé avec espace et
--     un doublon : une clé mal écrite éteindrait un module qui n'existe pas,
--     et jamais celui visé ;
-- (f) NULL est refusé : la colonne est NOT NULL, l'absence de configuration
--     s'écrit `'{}'`, jamais NULL ;
-- (g) après tous les refus, la valeur écrite par l'admin est intacte — un
--     refus ne doit rien avoir écrasé.
--
-- PREUVE ROUGE : (b) échoue sans la politique `households_update` de 0007,
-- (c)/(d) y réussiraient à tort ; (e)/(f) échouent sans la contrainte de
-- forme et le NOT NULL de 0140.
--
-- Bornes (AGENTS.md §2.7) : chaque lecture porte sur le foyer du test
-- (`home`), jamais sur la table entière. Fichier autonome, `rollback` final.

begin;

do $$
declare
  alice  uuid := testkit.auth_user('t140-alice@example.fr', 'Alice Menu');
  bob    uuid := testkit.auth_user('t140-bob@example.fr', 'Bob Menu');
  zoe    uuid := testkit.auth_user('t140-zoe@example.fr', 'Zoe Ailleurs');
  home   text := testkit.household(alice, 'Foyer Menu');
  home2  text := testkit.household(zoe, 'Foyer Ailleurs');
begin
  perform testkit.member(home, alice, 'Alice Menu', 'admin');
  perform testkit.member(home, bob, 'Bob Menu', 'membre');
  perform testkit.member(home2, zoe, 'Zoe Ailleurs', 'admin');

  insert into testkit.fx (key, user_id) values ('alice', alice), ('bob', bob), ('zoe', zoe);
  insert into testkit.fx (key, household_id) values ('home', home), ('home2', home2);
end;
$$;

-- ---------------------------------------------------------------------------
-- (a) Le défaut est le tableau vide : tout est activé.
-- ---------------------------------------------------------------------------
select testkit.eq(
  testkit.count($q$select 1 from public.households where id = (select household_id from testkit.fx where key = 'home')
                 and disabled_modules = '{}'::text[]$q$),
  1::bigint,
  'le foyer du test démarre tout activé');

-- ---------------------------------------------------------------------------
-- (b) Un administrateur écrit la colonne et relit ce qu'il a écrit.
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't140-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(
  testkit.affected($q$update public.households
                     set disabled_modules = array['ardoise', 'prestataires', 'fidelite']
                   where id = (select household_id from testkit.fx where key = 'home')$q$),
  1::bigint,
  'un administrateur éteint trois espaces de son foyer');

select testkit.eq(
  testkit.count($q$select 1 from public.households
                 where id = (select household_id from testkit.fx where key = 'home')
                   and disabled_modules = array['ardoise', 'prestataires', 'fidelite']::text[]$q$),
  1::bigint,
  'les trois espaces éteints sont relus à l''identique');

-- ---------------------------------------------------------------------------
-- (c) Un membre du foyer ne peut pas changer la configuration. Le compteur
-- à 0 est la preuve : la RLS filtre sans lever.
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't140-bob@example.fr') from testkit.fx where key = 'bob';

select testkit.eq(
  testkit.affected($q$update public.households
                     set disabled_modules = '{}'
                   where id = (select household_id from testkit.fx where key = 'home')$q$),
  0::bigint,
  'un membre du foyer ne peut pas réactiver les espaces éteints');

-- ---------------------------------------------------------------------------
-- (d) Un administrateur d'un autre foyer non plus.
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't140-zoe@example.fr') from testkit.fx where key = 'zoe';

select testkit.eq(
  testkit.affected($q$update public.households
                     set disabled_modules = array['recettes']
                   where id = (select household_id from testkit.fx where key = 'home')$q$),
  0::bigint,
  'un administrateur étranger ne peut pas éteindre un espace du foyer');

-- ---------------------------------------------------------------------------
-- (e) La garde de forme : la base refuse une clé qui ne peut désigner
-- aucun module réel. Chaque refus est une erreur (contrainte check), donc
-- `expect_denied` est ici la bonne preuve — contrairement à (c)/(d).
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't140-alice@example.fr') from testkit.fx where key = 'alice';

select testkit.expect_denied(
  $q$update public.households
     set disabled_modules = array['Ardoise']
   where id = (select household_id from testkit.fx where key = 'home')$q$);

select testkit.expect_denied(
  $q$update public.households
     set disabled_modules = array['ardoise ']
   where id = (select household_id from testkit.fx where key = 'home')$q$);

select testkit.expect_denied(
  $q$update public.households
     set disabled_modules = array['ardoise', 'ardoise']
   where id = (select household_id from testkit.fx where key = 'home')$q$);

-- ---------------------------------------------------------------------------
-- (f) NULL est refusé : « sans configuration » s'écrit `'{}'`, jamais NULL.
-- ---------------------------------------------------------------------------
select testkit.expect_denied(
  $q$update public.households
     set disabled_modules = null
   where id = (select household_id from testkit.fx where key = 'home')$q$);

-- ---------------------------------------------------------------------------
-- (g) La valeur écrite par l'admin est intacte : aucun des refus ci-dessus
-- n'a écrasé la configuration.
-- ---------------------------------------------------------------------------
select testkit.eq(
  testkit.count($q$select 1 from public.households
                 where id = (select household_id from testkit.fx where key = 'home')
                   and disabled_modules = array['ardoise', 'prestataires', 'fidelite']::text[]$q$),
  1::bigint,
  'après les refus, la configuration de l''admin est intacte');

rollback;
