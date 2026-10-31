-- supabase/tests/0174_folder_default_dedup.test.sql
-- Ceinture de sécurité 0174 (gap G-30-2) : une seule ligne is_default par
-- foyer sur task_lists, note_folders et routine_folders.
--
--   Test A — semis sain : après semis d'un dossier Général par table, un seul
--            is_default par table pour le foyer d'essai (diagnostic borné).
--   Test B — cas négatif : une deuxième insertion is_default même foyer DOIT
--            échouer sur l'index unique partiel de 0050. Ce test prouve la
--            garde ; s'il passe sans échec, la garde n'existe pas (§2.7-B).
--   Test C — dédoublonnage : sur un foyer volontairement peuplé d'un doublon
--            is_default (index partielle retirée LE TEMPS de l'insertion, ce
--            qui simule une base où 0050 aurait été appliquée partiellement —
--            le test ne passe JAMAIS par la migration elle-même pour créer
--            l'état fautif, sinon il serait tautologique, §2.7-D.3) + une
--            routine pointant le doublon : private.dedup_folder_defaults()
--            repointe la routine vers le survivant (created_at le plus
--            ancien, tie-break id) et supprime le doublon, malgré le garde
--            guard_folder_default de 0052. Deuxième appel : la fonction est
--            idempotente, rien ne bouge.

begin;

do $$
declare
  alice uuid := testkit.auth_user('dedup-alice@example.fr', 'Alice Dédupe');
  home text := testkit.household(alice, 'Foyer Dédupe');
  alice_m text;
begin
  alice_m := testkit.member(home, alice, 'Alice Dédupe', 'admin', 'accent');
  insert into testkit.fx (key, user_id) values ('alice', alice);
  insert into testkit.fx (key, household_id) values ('home', home);
  insert into testkit.fx (key, row_id) values ('alice_m', alice_m);
end;
$$;

-- ---------------------------------------------------------------------------
-- Semis sain : un Général par table, deux dossiers personnalisés sur les
-- routines pour que le filtre de dédoublonnage soit prouvé sélectif.
-- ---------------------------------------------------------------------------
insert into public.task_lists (household_id, name, visibility, owner_member_id, is_default)
select (select household_id from testkit.fx where key = 'home'), 'Général', 'foyer',
       (select row_id from testkit.fx where key = 'alice_m'), true;
insert into public.note_folders (household_id, name, visibility, owner_member_id, is_default)
select (select household_id from testkit.fx where key = 'home'), 'Général', 'foyer',
       (select row_id from testkit.fx where key = 'alice_m'), true;
insert into public.routine_folders (household_id, name, visibility, owner_member_id, is_default)
select (select household_id from testkit.fx where key = 'home'), 'Général', 'foyer',
       (select row_id from testkit.fx where key = 'alice_m'), true;
insert into public.routine_folders (household_id, name, visibility, owner_member_id)
select (select household_id from testkit.fx where key = 'home'), 'Maison', 'foyer',
       (select row_id from testkit.fx where key = 'alice_m');

-- La marque reconnaissable du survivant (§2.7-D.2) : le Général est créé en
-- premier, donc created_at le plus ancien ; le doublon de Test C viendra après.
insert into testkit.fx (key, row_id)
select 'gen_survivant', id from public.routine_folders
 where household_id = (select household_id from testkit.fx where key = 'home')
   and is_default;

-- ---------------------------------------------------------------------------
-- Test A — diagnostic borné au foyer d'essai : exactement un is_default par
-- table après semis sain.
-- ---------------------------------------------------------------------------
select testkit.eq(
  testkit.count($t$select 1 from public.task_lists
                 where household_id = (select household_id from testkit.fx where key = 'home')
                   and is_default$t$),
  1::bigint, 'Test A : un seul Général task_lists après semis sain');
select testkit.eq(
  testkit.count($t$select 1 from public.note_folders
                 where household_id = (select household_id from testkit.fx where key = 'home')
                   and is_default$t$),
  1::bigint, 'Test A : un seul Général note_folders après semis sain');
select testkit.eq(
  testkit.count($t$select 1 from public.routine_folders
                 where household_id = (select household_id from testkit.fx where key = 'home')
                   and is_default$t$),
  1::bigint, 'Test A : un seul Général routine_folders après semis sain');

-- ---------------------------------------------------------------------------
-- Test B — cas négatif : une deuxième ligne is_default même foyer doit être
-- refusée par l'index unique partiel routine_folders_default_unique (0050).
-- ---------------------------------------------------------------------------
select testkit.expect_denied(
  format(
    'insert into public.routine_folders (household_id, name, visibility, owner_member_id, is_default)
     values ((select household_id from testkit.fx where key = ''home''), ''Général'', ''foyer'',
             (select row_id from testkit.fx where key = ''alice_m''), true)'),
  'Test B : une deuxième insertion is_default même foyer doit échouer (index partiel 0050)');

-- ---------------------------------------------------------------------------
-- Test C — dédoublonnage sur un état fautif simulé.
-- 1. Retirer l'index partiel ET la contrainte name_unique LE TEMPS d'insérer
--    le doublon : la DDL de 0050 interdit l'état fautif (les deux gardes), il
--    ne peut être atteint que sur une base où la migration aurait été
--    appliquée partiellement. Le tout vit dans la transaction du fichier,
--    annulée en sortie — la contrainte n'a pas besoin d'être recréée ici.
-- 2. Insérer le doublon « Général » (la garde guard_folder_default ne voit
--    que UPDATE/DELETE, l'INSERT passe), puis recréer l'index.
-- 3. Une routine d'essai pointe le DOUBLON, pas le survivant.
-- ---------------------------------------------------------------------------
drop index if exists public.routine_folders_default_unique;
alter table public.routine_folders drop constraint routine_folders_name_unique;

insert into public.routine_folders (household_id, name, visibility, owner_member_id, is_default)
select (select household_id from testkit.fx where key = 'home'), 'Général', 'foyer',
       (select row_id from testkit.fx where key = 'alice_m'), true;

-- La garde d'unicité est recréée SEULEMENT APRÈS le dédoublonnage (c'est ce
-- que fait la migration : dédupe puis crée l'index s'il manque) ; son succès
-- prouve que la fonction laisse un état indexable.

insert into testkit.fx (key, row_id)
select 'gen_doublon', id from public.routine_folders
 where household_id = (select household_id from testkit.fx where key = 'home')
   and is_default
   and id <> (select row_id from testkit.fx where key = 'gen_survivant');

insert into public.routines (id, household_id, name, created_by)
values (private.new_id('routine'),
        (select household_id from testkit.fx where key = 'home'),
        'MARQUEDEDUPE routine sur le doublon',
        (select row_id from testkit.fx where key = 'alice_m'));
update public.routines
   set folder_id = (select row_id from testkit.fx where key = 'gen_doublon')
 where name = 'MARQUEDEDUPE routine sur le doublon';

-- L'état fautif est bien en place (sinon la suite serait tautologique).
select testkit.eq(
  testkit.count($t$select 1 from public.routine_folders
                 where household_id = (select household_id from testkit.fx where key = 'home')
                   and is_default$t$),
  2::bigint, 'Test C : le doublon is_default est bien présent avant dédoublonnage');

-- La logique de 0174 : repointage + suppression malgré le garde 0052.
select testkit.ok(
  (private.dedup_folder_defaults() -> 'routine_folders' ->> 'duplicates_removed')::bigint = 1,
  'Test C : un doublon routine_folders supprimé');

-- Recréation de l'index unique partiel : elle ne réussit que si le
-- dédoublonnage a laissé un état propre (miroir du bloc DO de 0174).
create unique index routine_folders_default_unique
  on public.routine_folders (household_id) where is_default;

select testkit.eq(
  testkit.count($t$select 1 from public.routine_folders
                 where household_id = (select household_id from testkit.fx where key = 'home')
                   and is_default$t$),
  1::bigint, 'Test C : un seul is_default restant après dédoublonnage');

select testkit.ok(
  exists (
    select 1 from public.routines
     where name = 'MARQUEDEDUPE routine sur le doublon'
       and folder_id = (select row_id from testkit.fx where key = 'gen_survivant')),
  'Test C : la routine repointe le survivant (created_at le plus ancien)');

select testkit.ok(
  not exists (
    select 1 from public.routine_folders
     where id = (select row_id from testkit.fx where key = 'gen_doublon')),
  'Test C : le doublon est supprimé');

select testkit.ok(
  exists (
    select 1 from public.routine_folders
     where household_id = (select household_id from testkit.fx where key = 'home')
       and name = 'Maison'),
  'Test C : les dossiers personnalisés ne sont pas touchés');

-- Idempotence : un second appel ne repointe ni ne supprime rien.
select testkit.ok(
  (private.dedup_folder_defaults() -> 'routine_folders' ->> 'duplicates_removed')::bigint = 0,
  'Test C : second appel — 0 doublon (idempotent)');
select testkit.ok(
  exists (
    select 1 from public.routines
     where name = 'MARQUEDEDUPE routine sur le doublon'
       and folder_id = (select row_id from testkit.fx where key = 'gen_survivant')),
  'Test C : second appel — la routine reste sur le survivant');

commit;
