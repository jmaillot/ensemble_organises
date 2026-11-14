-- supabase/tests/0183_ardoise_single_permissive_policy.test.sql
-- Phase 52 (SEC-45-01 / D-02) — non-escalade prouvée après fusion des
-- politiques permissives de `ardoise_members`/`ardoise_guests` (0183).
--
--   Cas 1 — POSITIF SELECT membre : bob (simple membre) lit les lignes
--           ardoise de son foyer (RLS borne déjà le comptage, §2.7-D.2).
--   Cas 2 — NÉGATIFS écriture membre (§2.6, une assertion par commande et
--           par table) : insert, update, delete refusés 42501 sur LES DEUX
--           tables — ces assertions échoueraient si 0183 avait fusionné en
--           `for all` membre-OU-admin (Pitfall 1 du 52-RESEARCH).
--   Cas 3 — POSITIF admin : alice (admin) insert/update/delete sur les deux
--           tables — preuve que la fusion n'a pas retiré l'écriture admin.
--   Cas 4 — NÉGATIF sans foyer : zoe (utilisateur sans foyer) ne voit
--           aucune ligne des deux tables.
--
-- Rappel AGENTS §2.7-D : assertions non tautologiques, comptages bornés (en
-- `authenticated` la RLS borne déjà), types identiques de part et d'autre de
-- testkit.eq. Vu ROUGE avant vert : la suppression provisoire d'une policy
-- d'écriture admin fait échouer le cas 3 (preuve dans le message de commit).

begin;

-- ---------------------------------------------------------------------------
-- Fixtures : foyer + alice (admin) + bob et charlie (membres) + zoe (sans
-- foyer). Marque d'appartenance reconnaissable dans les données d'essai :
-- le nom du foyer porte le bloc « aaaa… » (§2.7-D.2).
-- ---------------------------------------------------------------------------
do $$
declare
  alice uuid := testkit.auth_user('t183-alice@example.fr', 'Alice Admin');
  bob uuid := testkit.auth_user('t183-bob@example.fr', 'Bob Membre');
  charlie uuid := testkit.auth_user('t183-charlie@example.fr', 'Charlie Membre');
  zoe uuid := testkit.auth_user('t183-zoe@example.fr', 'Zoe Sans Foyer');
  home text := testkit.household(alice, 'aaaa-foyer-ardoise-52-aaaa');
begin
  perform testkit.member(home, alice, 'Alice Admin', 'admin', 'accent');
  perform testkit.member(home, bob, 'Bob Membre', 'membre', 'coral');
  perform testkit.member(home, charlie, 'Charlie Membre', 'membre', 'amber');
  insert into testkit.fx (key, user_id) values ('alice', alice), ('bob', bob),
    ('charlie', charlie), ('zoe', zoe);
  insert into testkit.fx (key, household_id) values ('home', home);
end;
$$;

-- ---------------------------------------------------------------------------
-- Semis (rôle postgres) : ardoise + ses membres + un invité.
-- ---------------------------------------------------------------------------
do $$
declare
  v_alice_m text;
  v_bob_m text;
  v_charlie_m text;
begin
  select m.id into v_alice_m from public.household_members m
   where m.household_id = (select household_id from testkit.fx where key = 'home')
     and m.user_id = (select user_id from testkit.fx where key = 'alice');
  select m.id into v_bob_m from public.household_members m
   where m.household_id = (select household_id from testkit.fx where key = 'home')
     and m.user_id = (select user_id from testkit.fx where key = 'bob');
  select m.id into v_charlie_m from public.household_members m
   where m.household_id = (select household_id from testkit.fx where key = 'home')
     and m.user_id = (select user_id from testkit.fx where key = 'charlie');
  insert into testkit.fx (key, row_id) values ('alice_m', v_alice_m), ('bob_m', v_bob_m),
    ('charlie_m', v_charlie_m);

  insert into public.ardoises (id, household_id, name, created_by)
  values ('ard-52-1', (select household_id from testkit.fx where key = 'home'),
          'Ardoise 52', v_alice_m);
  insert into public.ardoise_members (ardoise_id, member_id)
  values ('ard-52-1', v_alice_m), ('ard-52-1', v_bob_m);
  insert into public.ardoise_guests (id, ardoise_id, display_name, ticket_hash)
  values ('gst-52-1', 'ard-52-1', 'Invité Semé', md5('g52') || md5('g52-bis'));
end;
$$;

-- ---------------------------------------------------------------------------
-- Cas 1 — POSITIF SELECT membre : bob lit les lignes de son ardoise.
-- ---------------------------------------------------------------------------
select testkit.as_user((select user_id from testkit.fx where key = 'bob'), 't183-bob@example.fr');
set local role authenticated;

select testkit.eq(
  testkit.count($t$
    select 1 from public.ardoise_members where ardoise_id = 'ard-52-1'
  $t$),
  2::bigint, 'Cas 1 : bob (membre) voit les 2 lignes ardoise_members de son foyer');

select testkit.eq(
  testkit.count($t$
    select 1 from public.ardoise_guests where ardoise_id = 'ard-52-1'
  $t$),
  1::bigint, 'Cas 1 : bob (membre) voit l''invité de son ardoise');

reset role;

-- ---------------------------------------------------------------------------
-- Cas 2 — NÉGATIFS écriture membre : insert/update/delete refusés sur les
-- DEUX tables (§2.6 — un cas par commande). PostgreSQL ne lève PAS d'erreur
-- sur un update/delete dont la ligne ne passe pas le USING de la policy :
-- il fait « UPDATE 0 » silencieux. La preuve de non-escalade est donc
-- COMPORTEMENTALE : si la fusion avait donné l'écriture aux simples membres
-- (for all membre-OU-admin, Pitfall 1), les mutations s'appliqueraient et
-- les comptages d'après-coup seraient différents.
-- ---------------------------------------------------------------------------
select testkit.as_user((select user_id from testkit.fx where key = 'bob'), 't183-bob@example.fr');
set local role authenticated;

select testkit.expect_denied(format(
  'insert into public.ardoise_members (ardoise_id, member_id) values (%L, %L)',
  'ard-52-1', (select row_id from testkit.fx where key = 'bob_m')),
  'Cas 2 : bob NE peut PAS INSERT dans ardoise_members');

update public.ardoise_members set member_id = (select row_id from testkit.fx where key = 'charlie_m')::text
 where ardoise_id = 'ard-52-1';

select testkit.eq(
  testkit.count($t$
    select 1 from public.ardoise_members
     where ardoise_id = 'ard-52-1'
       and member_id = (select row_id from testkit.fx where key = 'charlie_m')
  $t$),
  0::bigint, 'Cas 2 : bob NE peut PAS UPDATE ardoise_members (aucune ligne réécrite en charlie)');

delete from public.ardoise_members where ardoise_id = 'ard-52-1';

select testkit.eq(
  testkit.count($t$
    select 1 from public.ardoise_members where ardoise_id = 'ard-52-1'
  $t$),
  2::bigint, 'Cas 2 : bob NE peut PAS DELETE dans ardoise_members (les 2 lignes sont intactes)');

select testkit.expect_denied(format(
  'insert into public.ardoise_guests (id, ardoise_id, display_name, ticket_hash) values (%L, %L, %L, %L)',
  'gst-52-pirate', 'ard-52-1', 'Pirate', md5('pirate') || md5('pirate-bis')),
  'Cas 2 : bob NE peut PAS INSERT dans ardoise_guests');

update public.ardoise_guests set display_name = 'Pirate' where ardoise_id = 'ard-52-1';

select testkit.eq(
  testkit.count($t$
    select 1 from public.ardoise_guests where display_name = 'Pirate'
  $t$),
  0::bigint, 'Cas 2 : bob NE peut PAS UPDATE ardoise_guests (aucun renommage appliqué)');

delete from public.ardoise_guests where ardoise_id = 'ard-52-1';

select testkit.eq(
  testkit.count($t$
    select 1 from public.ardoise_guests where ardoise_id = 'ard-52-1'
  $t$),
  1::bigint, 'Cas 2 : bob NE peut PAS DELETE dans ardoise_guests (l''invité est intact)');

reset role;

-- ---------------------------------------------------------------------------
-- Cas 3 — POSITIF admin : alice écrit les deux tables (insert, update,
-- delete) — la fusion n'a rien retiré à l'admin. Chaque étape est prouvée
-- par un comptage borné (jamais un succès muet, §2.7-F).
-- ---------------------------------------------------------------------------
select testkit.as_user((select user_id from testkit.fx where key = 'alice'), 't183-alice@example.fr');
set local role authenticated;

-- a. ardoise_guests : insert → update → delete de l'invité admin.
insert into public.ardoise_guests (id, ardoise_id, display_name, ticket_hash)
values ('gst-52-2', 'ard-52-1', 'Invité Admin', md5('a52') || md5('a52-bis'));

select testkit.eq(
  testkit.count($t$
    select 1 from public.ardoise_guests
     where ardoise_id = 'ard-52-1' and id = 'gst-52-2'
       and display_name = 'Invité Admin'
  $t$),
  1::bigint, 'Cas 3 : alice (admin) a INSÉRÉ un invité');

update public.ardoise_guests set display_name = 'Invité Admin Modifié' where id = 'gst-52-2';

select testkit.eq(
  testkit.count($t$
    select 1 from public.ardoise_guests
     where id = 'gst-52-2' and display_name = 'Invité Admin Modifié'
  $t$),
  1::bigint, 'Cas 3 : alice (admin) a MODIFIÉ l''invité');

delete from public.ardoise_guests where id = 'gst-52-2';

select testkit.eq(
  testkit.count($t$
    select 1 from public.ardoise_guests where id = 'gst-52-2'
  $t$),
  0::bigint, 'Cas 3 : alice (admin) a SUPPRIMÉ l''invité');

-- b. ardoise_members : insert → delete → update avec vraie mutation
--    (l'update neutre `set member_id = member_id` serait indistinguable d'un
--    « UPDATE 0 » silencieux — on prouve par le déplacement effectif d'une ligne).
insert into public.ardoise_members (ardoise_id, member_id)
values ('ard-52-1', (select row_id from testkit.fx where key = 'charlie_m'));

select testkit.eq(
  testkit.count($t$
    select 1 from public.ardoise_members
     where ardoise_id = 'ard-52-1'
       and member_id = (select row_id from testkit.fx where key = 'charlie_m')
  $t$),
  1::bigint, 'Cas 3 : alice (admin) a INSCRIT charlie à l''ardoise');

delete from public.ardoise_members
 where member_id = (select row_id from testkit.fx where key = 'bob_m');

select testkit.eq(
  testkit.count($t$
    select 1 from public.ardoise_members
     where member_id = (select row_id from testkit.fx where key = 'bob_m')
  $t$),
  0::bigint, 'Cas 3 : alice (admin) a RETIRÉ la ligne de bob');

update public.ardoise_members set member_id = (select row_id from testkit.fx where key = 'bob_m')::text
 where ardoise_id = 'ard-52-1'
   and member_id = (select row_id from testkit.fx where key = 'charlie_m');

select testkit.eq(
  testkit.count($t$
    select 1 from public.ardoise_members
     where ardoise_id = 'ard-52-1'
       and member_id = (select row_id from testkit.fx where key = 'bob_m')
  $t$),
  1::bigint, 'Cas 3 : alice (admin) a DÉPLACÉ la ligne charlie → bob (policy UPDATE passée)');

reset role;

-- ---------------------------------------------------------------------------
-- Cas 4 — NÉGATIF sans foyer : zoe ne voit aucune ligne des deux tables
-- (RLS : sa garde de foyer ne matche rien).
-- ---------------------------------------------------------------------------
select testkit.as_user((select user_id from testkit.fx where key = 'zoe'), 't183-zoe@example.fr');
set local role authenticated;

select testkit.eq(
  testkit.count($t$ select 1 from public.ardoise_members $t$),
  0::bigint, 'Cas 4 : zoe (sans foyer) ne voit aucune ligne ardoise_members');

select testkit.eq(
  testkit.count($t$ select 1 from public.ardoise_guests $t$),
  0::bigint, 'Cas 4 : zoe (sans foyer) ne voit aucune ligne ardoise_guests');

reset role;

rollback;
