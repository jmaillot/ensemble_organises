-- supabase/tests/0151_gift_list_shares_dedup.sql
-- Déduplication gift_list_shares dans la fusion (migration 0151, finding
-- WR-01 de la revue de phase 25).
--
-- CE QUI EST VERIFIE :
-- (a) la contrainte d'unicite (list_id, shared_with_member_id) existe bien —
--     c'est elle qui rendait l'absence de deduplication un bug ;
-- (b) cas bloquant : un enfant gere et le compte adulte sont tous deux
--     destinateurs de la MEME liste. La fusion doit reussir SANS 23505 et
--     laisser une seule trace, celle du compte ;
-- (c) preuve d'absence de sur-deduplication : une trace de l'enfant sur une
--     autre liste (le compte n'en etant pas destinateur) est REATTRIBUEE,
--     pas supprimee — le dedup ne s'applique qu'a la cle dupliquee ;
-- (d) la ligne enfant est supprimee, comme dans tous les cas de fusion.
--
-- PREUVE ROUGE : (b) sans le bloc de deduplication 0151, l'UPDATE
-- gift_list_shares levait 23505 et la transaction de fusion echouait — le
-- rapport ne rendait pas 'merged' true.
--
-- Bornes (AGENTS.md 2.7 D) : assertions portees par les ids du fixture
-- (cles t151-), jamais de total de table. Fichier autonome, rollback final.

begin;

-- ---------------------------------------------------------------------------
-- (a) L'unicité porte le problème (le dire plutôt qu'échouer plus bas sans
--     cause). 0015 a remplacé la contrainte 0004 par des index uniques
--     partiels — c'est l'INDEX qui garantit l'unicité aujourd'hui.
-- ---------------------------------------------------------------------------
select testkit.eq(
  (select count(*) from pg_catalog.pg_indexes
    where indexname = 'gift_list_shares_member_unique'
      and tablename = 'gift_list_shares'),
  1::bigint,
  'l''index unique gift_list_shares_member_unique est applique (0015)');

-- ---------------------------------------------------------------------------
-- Semis (postgres) : Alice admin de A, Bob membre de A ; Noe et Paule,
-- enfants geres de A.
-- ---------------------------------------------------------------------------
do $t151$
declare
  alice uuid := testkit.auth_user('t151-alice@example.fr', 'Alice Cent Cinquante Et Un');
  bob   uuid := testkit.auth_user('t151-bob@example.fr', 'Bob Cent Cinquante Et Un');
  home  text := testkit.household(alice, 'Foyer Cent Cinquante Et Un');
begin
  perform testkit.member(home, alice, 'Alice CCUE', 'admin', 'accent');
  perform testkit.member(home, bob, 'Bob CCUE', 'membre', 'ink');

  insert into public.household_members (id, household_id, user_id, display_name, color_tag, role)
  values (private.new_id('member'), home, null, 'Noe CCUE', 'amber', 'enfant');
  insert into public.household_members (id, household_id, user_id, display_name, color_tag, role)
  values (private.new_id('member'), home, null, 'Paule CCUE', 'coral', 'enfant');

  insert into testkit.fx (key, user_id) values
    ('t151-alice', alice), ('t151-bob', bob);
  insert into testkit.fx (key, household_id) values ('t151-home', home);
end;
$t151$;

-- Resolution des lignes membres (postgres) : les enfants n'ont pas d'user_id.
insert into testkit.fx (key, row_id)
select 't151-alice_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't151-home')
   and m.user_id = (select user_id from testkit.fx where key = 't151-alice');

insert into testkit.fx (key, row_id)
select 't151-bob_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't151-home')
   and m.user_id = (select user_id from testkit.fx where key = 't151-bob');

insert into testkit.fx (key, row_id)
select 't151-noe_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't151-home')
   and m.display_name = 'Noe CCUE';

insert into testkit.fx (key, row_id)
select 't151-paule_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't151-home')
   and m.display_name = 'Paule CCUE';

select testkit.eq(
  testkit.count($q$select 1 from testkit.fx
                 where key in ('t151-alice_m','t151-bob_m','t151-noe_m','t151-paule_m')$q$),
  4::bigint,
  'les quatre lignes membres du fixture sont resolues');

-- ---------------------------------------------------------------------------
-- Semis des partages (postgres) :
--   liste-1 : destinee a Noe ET a Bob -> la cle dupliquee (cas bloquant).
--   liste-2 : destinee a Noe seul     -> doit etre reattribuee (cas c).
--   liste-3 : destinee a Bob seul     -> laisse telle quelle.
-- ---------------------------------------------------------------------------
do $t151$
declare
  v_home text;
  v_bob_m text;
  v_noe_m text;
begin
  select household_id into v_home from testkit.fx where key = 't151-home';
  select row_id into v_bob_m from testkit.fx where key = 't151-bob_m';
  select row_id into v_noe_m from testkit.fx where key = 't151-noe_m';

  insert into public.gift_lists (id, household_id, owner_member_id, name, visibility)
  values ('t151-liste-1', v_home, v_bob_m, 'Liste 1 CCUE', 'partagee'),
         ('t151-liste-2', v_home, v_bob_m, 'Liste 2 CCUE', 'partagee'),
         ('t151-liste-3', v_home, v_bob_m, 'Liste 3 CCUE', 'partagee');

  insert into public.gift_list_shares (id, list_id, shared_with_member_id, permission)
  values ('t151-share-a', 't151-liste-1', v_noe_m, 'lecture'),
         ('t151-share-b', 't151-liste-1', v_bob_m, 'lecture'),
         ('t151-share-c', 't151-liste-2', v_noe_m, 'lecture'),
         ('t151-share-d', 't151-liste-3', v_bob_m, 'lecture');
end;
$t151$;

-- ---------------------------------------------------------------------------
-- (b) Fusion Noe -> Bob. Avant 0151, l'UPDATE gift_list_shares levait 23505
-- ici et la transaction echouait ; l'oracle SQLSTATE prouve que le chemin est
-- bien pris et ne se tait pas.
-- ---------------------------------------------------------------------------
select testkit.as_user((select user_id from testkit.fx where key = 't151-bob'),
                       't151-bob@example.fr');
set local role authenticated;

do $t151$
declare
  v_report jsonb;
  v_bob_m text;
  v_noe_m text;
  v_state text;
begin
  select row_id into v_bob_m from testkit.fx where key = 't151-bob_m';
  select row_id into v_noe_m from testkit.fx where key = 't151-noe_m';

  begin
    v_report := public.link_managed_child(v_noe_m, v_bob_m);
    v_state := v_report ->> 'merged';
  exception
    when others then
      v_state := sqlstate || ':' || sqlerrm;
  end;

  perform testkit.eq(v_state, 'true',
    'fusion avec partage duplique : merged true (pas de violation d''unicite)');

  perform testkit.eq((v_report ->> 'gift_list_shares'), '2',
    'le rapport compte 2 partages d''origine de l''enfant');
end;
$t151$;

reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

do $t151$
declare
  v_bob_m text;
  v_noe_m text;
begin
  select row_id into v_bob_m from testkit.fx where key = 't151-bob_m';
  select row_id into v_noe_m from testkit.fx where key = 't151-noe_m';

  -- (b) La cle dupliquee : une seule trace, celle du compte.
  perform testkit.eq(
    (select count(*) from public.gift_list_shares where list_id = 't151-liste-1'),
    1::bigint,
    'liste-1 : une seule trace de partage reste apres deduplication');
  perform testkit.eq(
    (select count(*) from public.gift_list_shares
      where id = 't151-share-b' and shared_with_member_id = v_bob_m),
    1::bigint,
    'liste-1 : la trace restante est celle du compte Bob');
  perform testkit.eq(
    (select count(*) from public.gift_list_shares where shared_with_member_id = v_noe_m),
    0::bigint,
    'aucune trace ne pointe plus vers la ligne enfant');

  -- (c) Pas de sur-deduplication : la trace de Noe sur une autre liste est
  -- reattribuee, pas supprimee.
  perform testkit.eq(
    (select count(*) from public.gift_list_shares where list_id = 't151-liste-2'),
    1::bigint,
    'liste-2 : la trace de Noe n''est pas supprimee');
  perform testkit.eq(
    (select count(*) from public.gift_list_shares
      where id = 't151-share-c' and shared_with_member_id = v_bob_m),
    1::bigint,
    'liste-2 : la trace de Noe est reattribuee au compte Bob');
  perform testkit.eq(
    (select count(*) from public.gift_list_shares where id = 't151-share-d'),
    1::bigint,
    'liste-3 : la trace de Bob seule reste telle quelle');

  -- (d) La ligne enfant est supprimee, l'invariant 0145 demeurant intact.
  perform testkit.eq(
    (select count(*) from public.household_members where id = v_noe_m),
    0::bigint,
    'la ligne enfant Noe est supprimee');
  perform testkit.eq(
    (select count(*) from pg_catalog.pg_constraint
      where conname = 'chk_members_managed_child'
        and conrelid = 'public.household_members'::regclass),
    1::bigint,
    'l''invariant chk_members_managed_child de 0145 reste applique');
end;
$t151$;

rollback;
