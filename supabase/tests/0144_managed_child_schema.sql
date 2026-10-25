-- supabase/tests/0144_managed_child_schema.sql
-- Socle schématique des profils enfants gérés par le parent (phase 25).
--
-- CE QUI EST VÉRIFIÉ, ET POURQUOI. `household_members` reçoit trois colonnes
-- (managed_modules, birth_date, deleted_at) dont la première porte le socle
-- D-06 : les espaces où l'enfant peut figurer. La contrainte CHECK réutilise
-- `private.has_valid_module_keys` (0140) pour rejeter les clés mal formées,
-- exactement comme `households.disabled_modules`. Le raisonnement côté test
-- est le même : la politique d'écriture est héritée (`household_members_update`,
-- 0007, admin-seul), donc le test doit PROUVER qu'elle s'applique, pas la
-- supposer.
--
-- (a) Le défaut socle D-06 : une ligne membre créée porte managed_modules
--     = '{taches,routines,anniversaires,menu}'. Le socle est par ENFANT
--     (restriction membre, D-05), pas un réglage de foyer.
-- (b) birth_date : NULL accepté ; une date valide acceptée.
-- (c) deleted_at : NULL par défaut ; un update posant now() est accepté.
-- (d) Validation de FORMAT (pas de catalogue) : une clé mal formée
--     ('Taches' majuscule, 'module-inconnu' tiret) est rejetée par la CHECK
--     en 23514 ; un doublon rejeté aussi. En revanche, une clé BIEN formée
--     mais absente du catalogue ('module_future') est ACCEPTÉE par la base —
--     assertion explicite qui documente que la validité sémantique reste au
--     client (0140:22-24).
-- (e) D-09 : insérer deux lignes membres role='enfant' du même foyer avec le
--     MÊME display_name réussit (aucune contrainte d'unicité).
-- (f) Distinction critique : affected=0 pour un UPDATE filtré par la RLS (ne
--     lève rien), expect_denied pour une erreur de contrainte — jamais
--     l'inverse.
--
-- PREUVE ROUGE : (a) échoue si le défaut n'est pas le socle D-06 ; (d)
-- échoue sans la contrainte CHECK ; (e) échoue s'il existe une contrainte
-- unique sur (household_id, display_name) qui n'est pas prévue par le plan ;
-- (f) échoue (affected=1) si la politique admin-seule `household_members_update`
-- de 0007 disparaissait.
--
-- Bornes (AGENTS.md §2.7) : chaque assertion porte sur le foyer du test
-- (`home`), jamais sur la table entière. Marques reconnaissables (t144-).
-- Fichier autonome, `rollback` final.

begin;

do $$
declare
  alice  uuid := testkit.auth_user('t144-alice@example.fr', 'Alice Parent');
  bob    uuid := testkit.auth_user('t144-bob@example.fr', 'Bob Parent');
  home   text := testkit.household(alice, 'Foyer Socle');
begin
  perform testkit.member(home, alice, 'Alice Parent', 'admin');
  perform testkit.member(home, bob, 'Bob Parent', 'membre');
  insert into testkit.fx (key, user_id) values ('alice', alice), ('bob', bob);
  insert into testkit.fx (key, household_id) values ('home', home);
end;
$$;

-- ---------------------------------------------------------------------------
-- (a) Le défaut socle D-06 : une ligne membre créée porte managed_modules
-- = '{taches,routines,anniversaires,menu}'. Le socle est PAR ENFANT
-- (restriction membre, D-05), PAS un réglage de foyer.
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't144-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

insert into public.household_members (household_id, display_name, role, user_id)
  values (
    (select household_id from testkit.fx where key = 'home'),
    'Noé Enfant',
    'enfant',
    null
  );

select testkit.eq(
  testkit.count($q$select 1 from public.household_members
                 where household_id = (select household_id from testkit.fx where key = 'home')
                   and display_name = 'Noé Enfant'
                   and managed_modules = '{taches,routines,anniversaires,menu}'::text[]$q$),
  1::bigint,
  'un profil enfant créé porte le socle D-06 par défaut');

-- ---------------------------------------------------------------------------
-- (b) birth_date : NULL accepté ; une date valide acceptée.
-- ---------------------------------------------------------------------------
select testkit.eq(
  testkit.count($q$select 1 from public.household_members
                 where household_id = (select household_id from testkit.fx where key = 'home')
                   and display_name = 'Noé Enfant'
                   and birth_date is null$q$),
  1::bigint,
  'birth_date est NULL par défaut');

select testkit.eq(
  testkit.affected($q$update public.household_members
                      set birth_date = '2016-03-15'::date
                    where household_id = (select household_id from testkit.fx where key = 'home')
                      and display_name = 'Noé Enfant'$q$),
  1::bigint,
  'update birth_date avec une date valide accepté');

select testkit.eq(
  testkit.count($q$select 1 from public.household_members
                 where household_id = (select household_id from testkit.fx where key = 'home')
                   and display_name = 'Noé Enfant'
                   and birth_date = '2016-03-15'::date$q$),
  1::bigint,
  'la date de naissance est relue à l''identique');

-- ---------------------------------------------------------------------------
-- (c) deleted_at : NULL par défaut ; un update posant now() est accepté.
-- ---------------------------------------------------------------------------
select testkit.eq(
  testkit.count($q$select 1 from public.household_members
                 where household_id = (select household_id from testkit.fx where key = 'home')
                   and display_name = 'Noé Enfant'
                   and deleted_at is null$q$),
  1::bigint,
  'deleted_at est NULL par défaut');

select testkit.eq(
  testkit.affected($q$update public.household_members
                      set deleted_at = now()
                    where household_id = (select household_id from testkit.fx where key = 'home')
                      and display_name = 'Noé Enfant'$q$),
  1::bigint,
  'update deleted_at posant now() accepté');

select testkit.eq(
  testkit.count($q$select 1 from public.household_members
                 where household_id = (select household_id from testkit.fx where key = 'home')
                   and display_name = 'Noé Enfant'
                   and deleted_at is not null$q$),
  1::bigint,
  'deleted_at est non NULL après archivage');

-- ---------------------------------------------------------------------------
-- (d) Validation de FORMAT (pas de catalogue) : une clé mal formée
-- ('Taches' majuscule, 'module-inconnu' tiret) est rejetée par la CHECK en
-- 23514 ; un doublon rejeté aussi. En revanche, une clé BIEN formée mais
-- absente du catalogue ('module_future') est ACCEPTÉE par la base —
-- assertion explicite qui documente que la validité sémantique reste au
-- client (0140:22-24).
-- ---------------------------------------------------------------------------

-- Rejet : clé en majuscule (format invalide)
select testkit.expect_denied(
  $q$update public.household_members
     set managed_modules = array['Taches']
   where household_id = (select household_id from testkit.fx where key = 'home')
     and display_name = 'Noé Enfant'$q$);

-- Rejet : clé avec tiret (format invalide)
select testkit.expect_denied(
  $q$update public.household_members
     set managed_modules = array['module-inconnu']
   where household_id = (select household_id from testkit.fx where key = 'home')
     and display_name = 'Noé Enfant'$q$);

-- Rejet : doublon
select testkit.expect_denied(
  $q$update public.household_members
     set managed_modules = array['taches', 'taches']
   where household_id = (select household_id from testkit.fx where key = 'home')
     and display_name = 'Noé Enfant'$q$);

-- Acceptation : clé bien formée mais hors catalogue (validité sémantique côté client)
select testkit.eq(
  testkit.affected($q$update public.household_members
                      set managed_modules = array['module_future']
                    where household_id = (select household_id from testkit.fx where key = 'home')
                      and display_name = 'Noé Enfant'$q$),
  1::bigint,
  'une clé bien formée hors catalogue est acceptée par la base');

select testkit.eq(
  testkit.count($q$select 1 from public.household_members
                 where household_id = (select household_id from testkit.fx where key = 'home')
                   and display_name = 'Noé Enfant'
                   and managed_modules = array['module_future']::text[]$q$),
  1::bigint,
  'la clé hors catalogue est relue à l''identique — la base ne valide que le format');

-- ---------------------------------------------------------------------------
-- (e) D-09 : insérer deux lignes membres role='enfant' du même foyer avec le
-- MÊME display_name réussit (aucune contrainte d'unicité).
-- ---------------------------------------------------------------------------
insert into public.household_members (household_id, display_name, role, user_id)
  values (
    (select household_id from testkit.fx where key = 'home'),
    'Noé Enfant',
    'enfant',
    null
  );

select testkit.eq(
  testkit.count($q$select 1 from public.household_members
                 where household_id = (select household_id from testkit.fx where key = 'home')
                   and display_name = 'Noé Enfant'
                   and role = 'enfant'$q$),
  2::bigint,
  'deux profils enfants du même foyer avec le même display_name sont acceptés (D-09)');

-- ---------------------------------------------------------------------------
-- (f) Distinction critique : un `update` filtré par la RLS NE LÈVE RIEN —
-- il ne touche simplement aucune ligne (affected = 0). `expect_denied`
-- réussirait ici pour une fausse raison. La politique
-- `household_members_update` (0007) est admin-seule : un membre du foyer
-- non-administrateur ne peut pas porter le socle D-06 sur une fiche.
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't144-bob@example.fr') from testkit.fx where key = 'bob';

select testkit.eq(
  testkit.affected($q$update public.household_members
                      set managed_modules = array['courses']
                    where household_id = (select household_id from testkit.fx where key = 'home')
                      and display_name = 'Noé Enfant'
                      and role = 'enfant'$q$),
  0::bigint,
  'un membre non-administrateur ne peut pas modifier les espaces d''une fiche enfant — la RLS filtre sans lever');

-- Et après ce refus silencieux, les fiches sont intactes : aucun refus n'a écrasé
-- les valeurs posées (première fiche : 'module_future' posé en (d) ; deuxième fiche :
-- socle D-06 par défaut) et rien ne porte la valeur refusée 'courses'.
select testkit.as_user(user_id, 't144-alice@example.fr') from testkit.fx where key = 'alice';

select testkit.eq(
  testkit.count($q$select 1 from public.household_members
                 where household_id = (select household_id from testkit.fx where key = 'home')
                   and display_name = 'Noé Enfant'
                   and role = 'enfant'
                   and managed_modules = array['module_future']::text[]$q$),
  1::bigint,
  'après le refus silencieux, la fiche modifiée par l''admin garde sa valeur');

select testkit.eq(
  testkit.count($q$select 1 from public.household_members
                 where household_id = (select household_id from testkit.fx where key = 'home')
                   and display_name = 'Noé Enfant'
                   and role = 'enfant'
                   and managed_modules = '{taches,routines,anniversaires,menu}'::text[]$q$),
  1::bigint,
  'l''autre fiche garde le socle D-06 — aucune ligne ne porte la valeur refusée');

select testkit.eq(
  testkit.count($q$select 1 from public.household_members
                 where household_id = (select household_id from testkit.fx where key = 'home')
                   and managed_modules @> array['courses']$q$),
  0::bigint,
  'le refus silencieux de (f) n''a rien écrit : aucune fiche ne porte ''courses''');

rollback;
