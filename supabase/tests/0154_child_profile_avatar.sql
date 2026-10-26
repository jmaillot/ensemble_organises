-- supabase/tests/0154_child_profile_avatar.sql
-- Avatar des fiches enfant : création sans perte + suppression explicite
-- (migration 0154, finding WR-04 de la revue de phase 25).
--
-- CE QUI EST VERIFIE :
-- (a) CREATE : l'avatar transmis est STOCKÉ (avant 0154 il était jeté) et
--     RENDU dans le jsonb retourné ;
-- (b) UPDATE : p_clear_avatar=true supprime l'avatar (avant 0154, le
--     coalesce rendait la suppression impossible) ;
-- (c) UPDATE : p_clear_avatar=false (ou omis) avec avatar null ne touche
--     pas l'avatar existant — comportement 0146 préservé ;
-- (d) UPDATE : un nouvel avatar non null écrase l'ancien (coalesce 0146) ;
-- (e) la surcharge 0146 à six arguments text est SUPPRIMÉE : l'appeler
--     échoue (42883 undefined function) ;
-- (f) l'UPDATE reste réservé aux adultes (42501 pour un enfant... hors
--     sujet ici — l'acteur adulte seul est testé, la garde est re-testée
--     par 0148).
--
-- PREUVE ROUGE : (a) sans la colonne dans l'insertion, avatar_url restait
-- null ; (b) sans le case, l'avatar restait en place ; (e) sans le drop,
-- l'appel à six arguments réussissait.
--
-- Bornes (AGENTS.md 2.7 D) : assertions portées par les ids du fixture
-- (clés t154-), jamais de total de table. Fichier autonome, rollback final.

begin;

-- ---------------------------------------------------------------------------
-- Semis (postgres) : Alice admin de A ; Bob membre de A ; Charlie, enfant
-- géré existant (créé par INSERT direct pour contrôler l'avatar initial).
-- ---------------------------------------------------------------------------
do $t154$
declare
  alice uuid := testkit.auth_user('t154-alice@example.fr', 'Alice Cent Cinquante Quatre');
  bob   uuid := testkit.auth_user('t154-bob@example.fr', 'Bob Cent Cinquante Quatre');
  home  text := testkit.household(alice, 'Foyer Cent Cinquante Quatre');
begin
  perform testkit.member(home, alice, 'Alice CCQ', 'admin', 'accent');
  perform testkit.member(home, bob, 'Bob CCQ', 'membre', 'ink');

  insert into public.household_members (id, household_id, user_id, display_name, color_tag, role, avatar_url)
  values (private.new_id('member'), home, null, 'Charlie CCQ', 'amber', 'enfant',
          'avatars/charlie-avant.png');

  insert into testkit.fx (key, user_id) values
    ('t154-alice', alice), ('t154-bob', bob);
  insert into testkit.fx (key, household_id) values ('t154-home', home);
end;
$t154$;

insert into testkit.fx (key, row_id)
select 't154-alice_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't154-home')
   and m.user_id = (select user_id from testkit.fx where key = 't154-alice');

insert into testkit.fx (key, row_id)
select 't154-charlie_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't154-home')
   and m.display_name = 'Charlie CCQ';

select testkit.eq(
  testkit.count($q$select 1 from testkit.fx
                 where key in ('t154-alice_m','t154-charlie_m')$q$),
  2::bigint,
  'les lignes membres du fixture sont résolues');

-- ---------------------------------------------------------------------------
-- (a) CREATE : l'avatar transmis est stocké et rendu. Acteur : Bob (membre,
--     D-03 : tout adulte, pas seulement l'admin).
-- ---------------------------------------------------------------------------
select testkit.as_user((select user_id from testkit.fx where key = 't154-bob'),
                       't154-bob@example.fr');
set local role authenticated;

do $t154$
declare
  v_report jsonb;
  v_home text;
begin
  select household_id into v_home from testkit.fx where key = 't154-home';

  v_report := public.create_managed_child_profile(
    v_home, 'Diane CCQ', 'coral', date '2017-05-02', 'avatars/diane-0154.png');

  perform testkit.eq((v_report ->> 'avatar_url'), 'avatars/diane-0154.png',
    'CREATE : le jsonb rendu porte l''avatar transmis');
  perform testkit.eq(
    (select count(*) from public.household_members
      where household_id = v_home and display_name = 'Diane CCQ'
        and avatar_url = 'avatars/diane-0154.png'),
    1::bigint,
    'CREATE : l''avatar transmis est stocké sur la ligne');
end;
$t154$;

reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

-- ---------------------------------------------------------------------------
-- (b)+(c)+(d) UPDATE sur Charlie : suppression explicite, absence d'effet,
-- remplacement.
-- ---------------------------------------------------------------------------
select testkit.as_user((select user_id from testkit.fx where key = 't154-alice'),
                       't154-alice@example.fr');
set local role authenticated;

do $t154$
declare
  v_charlie text;
begin
  select row_id into v_charlie from testkit.fx where key = 't154-charlie_m';

  -- (c) avatar null + clear false (défaut) : ne touche pas l'avatar.
  perform public.update_managed_child_profile(
    v_charlie, null, null, date '2016-03-15', null);
  perform testkit.eq(
    (select count(*) from public.household_members
      where id = v_charlie and avatar_url = 'avatars/charlie-avant.png'),
    1::bigint,
    'UPDATE : avatar null sans clear ne touche pas l''avatar existant');

  -- (d) nouvel avatar non null : il écrase l'ancien.
  perform public.update_managed_child_profile(
    v_charlie, null, null, date '2016-03-15', 'avatars/charlie-apres.png');
  perform testkit.eq(
    (select count(*) from public.household_members
      where id = v_charlie and avatar_url = 'avatars/charlie-apres.png'),
    1::bigint,
    'UPDATE : un nouvel avatar écrase l''ancien');

  -- (b) clear true : l'avatar est supprimé.
  perform public.update_managed_child_profile(
    v_charlie, null, null, date '2016-03-15', null, true);
  perform testkit.eq(
    (select count(*) from public.household_members
      where id = v_charlie and avatar_url is null),
    1::bigint,
    'UPDATE : p_clear_avatar=true supprime l''avatar');
end;
$t154$;

reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

-- ---------------------------------------------------------------------------
-- (e) La surcharge 0146 à six arguments text n'existe plus : undefined
-- function 42883 (forme oraculaire 0051). Discriminateur : un 6e argument
-- text[] explicite — l'ancienne signature (…, text[]) seule l'acceptait ;
-- la nouvelle (…, boolean) ne résout pas un tableau. Un appel à six
-- arguments « plats » ne prouverait rien : il résoudrait la nouvelle
-- fonction via le défaut du 7e paramètre.
-- ---------------------------------------------------------------------------
do $t154$
declare
  v_charlie text;
  v_state text;
  v_msg text;
begin
  select row_id into v_charlie from testkit.fx where key = 't154-charlie_m';

  begin
    perform public.update_managed_child_profile(
      v_charlie, null, null, date '2016-03-15', null,
      array['taches']::text[]);
    v_state := 'AUCUNE_ERREUR';
  exception
    when others then
      v_state := sqlstate;
      v_msg := sqlerrm;
  end;

  perform testkit.eq(v_state, '42883',
    'l''ancienne surcharge (…, text[]) n''existe plus : undefined function');
end;
$t154$;

rollback;
