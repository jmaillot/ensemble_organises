-- supabase/tests/0152_meal_entries_dedup.sql
-- Déduplication du tableau meal_entries.member_ids dans la fusion (migration
-- 0152, finding WR-02 de la revue de phase 25).
--
-- CE QUI EST VERIFIE :
-- (a) collision : un repas où l'enfant ET le compte figurent déjà dans
--     member_ids -> après fusion, le tableau ne contient le compte qu'UNE
--     fois (avant 0152, array_replace laissait le compte en double) ;
-- (b) pas de sur-déduplication : un repas où seul l'enfant figure -> sa
--     participation est réattribuée au compte (array_replace inchangé) ;
-- (c) ordre préservé : les convives restent dans leur ordre d'ajout après
--     retrait de l'enfant (unnest with ordinality) ;
-- (d) un repas sans l'enfant n'est pas touché.
--
-- PREUVE ROUGE : (a) sans le bloc 0152, member_ids contenait
-- [compte, compte] — le compte apparaissait deux fois dans le même repas.
--
-- Bornes (AGENTS.md 2.7 D) : assertions portées par les ids du fixture
-- (clés t152-), jamais de total de table. Fichier autonome, rollback final.

begin;

-- ---------------------------------------------------------------------------
-- Semis (postgres) : Alice admin de A, Bob membre de A ; Noe et Paule,
-- enfants gérés de A.
-- ---------------------------------------------------------------------------
do $t152$
declare
  alice uuid := testkit.auth_user('t152-alice@example.fr', 'Alice Cent Cinquante Deux');
  bob   uuid := testkit.auth_user('t152-bob@example.fr', 'Bob Cent Cinquante Deux');
  home  text := testkit.household(alice, 'Foyer Cent Cinquante Deux');
begin
  perform testkit.member(home, alice, 'Alice CCD', 'admin', 'accent');
  perform testkit.member(home, bob, 'Bob CCD', 'membre', 'ink');

  insert into public.household_members (id, household_id, user_id, display_name, color_tag, role)
  values (private.new_id('member'), home, null, 'Noe CCD', 'amber', 'enfant');
  insert into public.household_members (id, household_id, user_id, display_name, color_tag, role)
  values (private.new_id('member'), home, null, 'Paule CCD', 'coral', 'enfant');

  insert into testkit.fx (key, user_id) values
    ('t152-alice', alice), ('t152-bob', bob);
  insert into testkit.fx (key, household_id) values ('t152-home', home);
end;
$t152$;

-- Résolution des lignes membres (postgres) : les enfants n'ont pas d'user_id.
insert into testkit.fx (key, row_id)
select 't152-alice_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't152-home')
   and m.user_id = (select user_id from testkit.fx where key = 't152-alice');

insert into testkit.fx (key, row_id)
select 't152-bob_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't152-home')
   and m.user_id = (select user_id from testkit.fx where key = 't152-bob');

insert into testkit.fx (key, row_id)
select 't152-noe_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't152-home')
   and m.display_name = 'Noe CCD';

insert into testkit.fx (key, row_id)
select 't152-paule_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't152-home')
   and m.display_name = 'Paule CCD';

select testkit.eq(
  testkit.count($q$select 1 from testkit.fx
                 where key in ('t152-alice_m','t152-bob_m','t152-noe_m','t152-paule_m')$q$),
  4::bigint,
  'les quatre lignes membres du fixture sont résolues');

-- ---------------------------------------------------------------------------
-- Semis des repas (postgres) :
--   meal-collision : member_ids = [bob, noe]        -> (a) déduplicaté.
--   meal-solo      : member_ids = [noe]             -> (b) réattribué.
--   meal-ordre     : member_ids = [alice, noe, bob] -> (c) ordre préservé.
--   meal-sans      : member_ids = [paule]           -> (d) intact.
-- ---------------------------------------------------------------------------
do $t152$
declare
  v_home text;
  v_alice_m text;
  v_bob_m text;
  v_noe_m text;
  v_paule_m text;
begin
  select household_id into v_home from testkit.fx where key = 't152-home';
  select row_id into v_alice_m from testkit.fx where key = 't152-alice_m';
  select row_id into v_bob_m from testkit.fx where key = 't152-bob_m';
  select row_id into v_noe_m from testkit.fx where key = 't152-noe_m';
  select row_id into v_paule_m from testkit.fx where key = 't152-paule_m';

  insert into public.meal_entries (id, household_id, entry_date, slot, free_text, member_ids)
  values ('t152-meal-collision', v_home, current_date, 'midi', 'Pâtes CCD',
          array[v_bob_m, v_noe_m]),
         ('t152-meal-solo', v_home, current_date, 'soir', 'Soupe CCD',
          array[v_noe_m]),
         ('t152-meal-ordre', v_home, current_date, 'matin', 'Tartines CCD',
          array[v_alice_m, v_noe_m, v_bob_m]),
         ('t152-meal-sans', v_home, current_date, 'midi', 'Salade CCD',
          array[v_paule_m]);
end;
$t152$;

-- ---------------------------------------------------------------------------
-- Fusion Noe -> Bob (acteur Bob, forme authentifiée canonique).
-- ---------------------------------------------------------------------------
select testkit.as_user((select user_id from testkit.fx where key = 't152-bob'),
                       't152-bob@example.fr');
set local role authenticated;

do $t152$
declare
  v_report jsonb;
  v_bob_m text;
  v_noe_m text;
  v_state text;
begin
  select row_id into v_bob_m from testkit.fx where key = 't152-bob_m';
  select row_id into v_noe_m from testkit.fx where key = 't152-noe_m';

  begin
    v_report := public.link_managed_child(v_noe_m, v_bob_m);
    v_state := v_report ->> 'merged';
  exception
    when others then
      v_state := sqlstate || ':' || sqlerrm;
  end;

  perform testkit.eq(v_state, 'true',
    'fusion avec repas partagé : merged true');
  perform testkit.eq((v_report ->> 'meal_entries_member'), '3',
    'le rapport compte 3 repas où l''enfant figurait dans member_ids');
end;
$t152$;

reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

do $t152$
declare
  v_alice_m text;
  v_bob_m text;
  v_noe_m text;
  v_paule_m text;
begin
  select row_id into v_alice_m from testkit.fx where key = 't152-alice_m';
  select row_id into v_bob_m from testkit.fx where key = 't152-bob_m';
  select row_id into v_noe_m from testkit.fx where key = 't152-noe_m';
  select row_id into v_paule_m from testkit.fx where key = 't152-paule_m';

  -- (a) Collision : le compte n'apparaît qu'une fois.
  perform testkit.eq(
    (select member_ids from public.meal_entries where id = 't152-meal-collision'),
    array[v_bob_m]::text[],
    'repas partagé : member_ids ne contient le compte qu''une fois');

  -- (b) Pas de sur-déduplication : la participation solo est réattribuée.
  perform testkit.eq(
    (select member_ids from public.meal_entries where id = 't152-meal-solo'),
    array[v_bob_m]::text[],
    'repas solo : la participation de l''enfant est réattribuée au compte');

  -- (c) Ordre préservé : alice, puis bob (l'enfant retiré, sans déplacer
  -- les convives restants).
  perform testkit.eq(
    (select member_ids from public.meal_entries where id = 't152-meal-ordre'),
    array[v_alice_m, v_bob_m]::text[],
    'repas à trois : l''ordre des convives restants est préservé');

  -- (d) Un repas sans l'enfant n'est pas touché.
  perform testkit.eq(
    (select member_ids from public.meal_entries where id = 't152-meal-sans'),
    array[v_paule_m]::text[],
    'repas sans l''enfant : member_ids inchangé');

  -- La ligne enfant est supprimée, l'invariant 0145 demeurant intact.
  perform testkit.eq(
    (select count(*) from public.household_members where id = v_noe_m),
    0::bigint,
    'la ligne enfant Noe est supprimée');
  perform testkit.eq(
    (select count(*) from pg_catalog.pg_constraint
      where conname = 'chk_members_managed_child'
        and conrelid = 'public.household_members'::regclass),
    1::bigint,
    'l''invariant chk_members_managed_child de 0145 reste appliqué');
end;
$t152$;

rollback;
