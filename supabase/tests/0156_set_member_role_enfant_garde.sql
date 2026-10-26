-- supabase/tests/0156_set_member_role_enfant_garde.sql
-- Garde conversationnelle sur la promotion d'un enfant géré (migration 0156,
-- finding IN-02 de la revue de phase 25).
--
-- CE QUI EST VERIFIE :
-- (a) enfant géré -> 'membre' : 22023 avec le message traduit (avant 0156 :
--     23514 brut de la CHECK chk_members_managed_child) ;
-- (b) enfant géré -> 'admin' : 22023, même garde (l'oracle portait déjà sur
--     le SQLSTATE, la forme couvre les deux rôles) ;
-- (c) les refus légitimes restent possibles : membre avec compte -> 'membre'
--     réussit toujours, et D-17b (compte -> 'enfant') reste 22023 ;
-- (d) un enfant ARCHIVÉ (deleted_at) reste hors de portée : la ligne n'est
--     plus vivante, la garde ne la distingue pas — l'oracle vérifie que le
--     refus est bien levé aussi (pas de réanimation par changement de rôle).
--
-- PREUVE ROUGE : (a) sans la garde 0156, le SQLSTATE obtenu était 23514
-- (CHECK brute) et le message ne contenait pas « enfant géré ».
--
-- Bornes (AGENTS.md 2.7 D) : assertions portées par les ids du fixture
-- (clés t156-), jamais de total de table. Fichier autonome, rollback final.

begin;

-- ---------------------------------------------------------------------------
-- Semis (postgres) : Alice admin de A ; Bob membre avec compte ; Noe, enfant
-- géré ; Paule, enfant géré ARCHIVÉE.
-- ---------------------------------------------------------------------------
do $t156$
declare
  alice uuid := testkit.auth_user('t156-alice@example.fr', 'Alice Cent Cinquante Six');
  bob   uuid := testkit.auth_user('t156-bob@example.fr', 'Bob Cent Cinquante Six');
  home  text := testkit.household(alice, 'Foyer Cent Cinquante Six');
begin
  perform testkit.member(home, alice, 'Alice CCS', 'admin', 'accent');
  perform testkit.member(home, bob, 'Bob CCS', 'membre', 'ink');

  insert into public.household_members (id, household_id, user_id, display_name, color_tag, role)
  values (private.new_id('member'), home, null, 'Noe CCS', 'amber', 'enfant');
  insert into public.household_members (id, household_id, user_id, display_name, color_tag, role, deleted_at)
  values (private.new_id('member'), home, null, 'Paule CCS', 'coral', 'enfant', now());

  insert into testkit.fx (key, user_id) values
    ('t156-alice', alice), ('t156-bob', bob);
  insert into testkit.fx (key, household_id) values ('t156-home', home);
end;
$t156$;

insert into testkit.fx (key, row_id)
select 't156-alice_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't156-home')
   and m.user_id = (select user_id from testkit.fx where key = 't156-alice');

insert into testkit.fx (key, row_id)
select 't156-bob_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't156-home')
   and m.user_id = (select user_id from testkit.fx where key = 't156-bob');

insert into testkit.fx (key, row_id)
select 't156-noe_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't156-home')
   and m.display_name = 'Noe CCS' and m.deleted_at is null;

insert into testkit.fx (key, row_id)
select 't156-paule_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't156-home')
   and m.display_name = 'Paule CCS' and m.deleted_at is not null;

select testkit.eq(
  testkit.count($q$select 1 from testkit.fx
                 where key in ('t156-alice_m','t156-bob_m','t156-noe_m','t156-paule_m')$q$),
  4::bigint,
  'les quatre lignes membres du fixture sont résolues');

-- ---------------------------------------------------------------------------
-- (a)+(b) Refus de la promotion : 22023 conversationnel, acteur Alice admin.
-- ---------------------------------------------------------------------------
select testkit.as_user((select user_id from testkit.fx where key = 't156-alice'),
                       't156-alice@example.fr');
set local role authenticated;

do $t156$
declare
  v_noe_m text;
  v_state text;
  v_msg text;
begin
  select row_id into v_noe_m from testkit.fx where key = 't156-noe_m';

  begin
    perform public.set_member_role(v_noe_m, 'membre');
    v_state := 'AUCUNE_ERREUR';
  exception
    when others then
      v_state := sqlstate;
      v_msg := sqlerrm;
  end;

  perform testkit.eq(v_state, '22023',
    'enfant géré -> membre : 22023 conversationnel (pas le 23514 brut de la CHECK)');
  perform testkit.ok(v_msg like '%enfant géré%',
    'le message porte la traduction métier (obtenu : ' || v_msg || ')');

  begin
    perform public.set_member_role(v_noe_m, 'admin');
    v_state := 'AUCUNE_ERREUR';
  exception
    when others then
      v_state := sqlstate;
  end;

  perform testkit.eq(v_state, '22023',
    'enfant géré -> admin : même garde 22023');
end;
$t156$;

-- (d) L'enfant ARCHIVÉE est aussi refusée (la garde distingue deleted_at,
-- mais la ligne reste role 'enfant' sans compte : le refus tient).
do $t156$
declare
  v_paule_m text;
  v_state text;
begin
  select row_id into v_paule_m from testkit.fx where key = 't156-paule_m';

  begin
    perform public.set_member_role(v_paule_m, 'membre');
    v_state := 'AUCUNE_ERREUR';
  exception
    when others then
      v_state := sqlstate;
  end;

  perform testkit.eq(v_state, '22023',
    'enfant gérée ARCHIVÉE -> membre : refusée aussi (pas de réanimation par rôle)');
end;
$t156$;

-- (c) Les chemins légitimes restent ouverts : Bob (compte) confirmé
-- 'membre' sans erreur ; D-17b (compte -> enfant) reste 22023.
do $t156$
declare
  v_bob_m text;
  v_state text;
  v_out jsonb;
begin
  select row_id into v_bob_m from testkit.fx where key = 't156-bob_m';

  v_out := public.set_member_role(v_bob_m, 'membre');
  perform testkit.eq((v_out ->> 'role'), 'membre',
    'un adulte avec compte garde son rôle : le chemin légitime est intact');

  begin
    perform public.set_member_role(v_bob_m, 'enfant');
    v_state := 'AUCUNE_ERREUR';
  exception
    when others then
      v_state := sqlstate;
  end;

  perform testkit.eq(v_state, '22023',
    'D-17b intact : un membre avec compte ne devient pas enfant géré');
end;
$t156$;

reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

-- L'invariant de fond n'a pas bougé : Noe est resté 'enfant' sans compte.
do $t156$
declare
  v_noe_m text;
begin
  select row_id into v_noe_m from testkit.fx where key = 't156-noe_m';

  perform testkit.eq(
    (select count(*) from public.household_members
      where id = v_noe_m and role = 'enfant' and user_id is null),
    1::bigint,
    'la fiche enfant est intacte après les refus');
end;
$t156$;

rollback;
