-- supabase/tests/0145_convert_managed_children.sql
-- Conversion des comptes enfants en profils gérés (migration 0145, plan 25-02).
--
-- CE QUI EST VÉRIFIÉ :
-- (a) l'appel à public.convert_managed_children_to_profiles() est refusé
--     avec 42501 pour un acteur authentifié — par le GRANT (permission
--     refusée) et, seconde barrière T-25-03, par la garde d'acteur runtime
--     (service_role portant une session JWT : 'service' nommé dans le
--     message) ;
-- (b) la conversion est observable : un enfant-avec-compte (semé à l'état
--     hérité, l'invariant 0145 étant retiré le temps du semis) sort avec
--     user_id NULL, la ligne household_members conservée à l'identique
--     (D-04), la ligne profiles et le compte auth.users supprimés, la
--     tâche et son assignation INTACTES ; le rapport dit converted=1 ;
-- (c) l'invariant chk_members_managed_child se re-crée avec succès sur les
--     données converties ;
-- (d) multi-foyer : un enfant dont le compte est aussi membre adulte
--     (role <> 'enfant') d'un autre foyer est ignoré (skipped=1,
--     converted=0), son compte ET son profil survivent, sa ligne enfant
--     devient sans compte, sa ligne adulte garde le compte ;
-- (e) le chemin invitation est fermé : redeem_household_invite_token avec
--     p_role='enfant' refuse 22023 sous service_role (l'appelant Edge
--     légitime — le plan disait « sous as_user », mais authenticated
--     n'a pas d'EXECUTE depuis 0009 : l'appel y échouerait sur le
--     privilège, 42501, sans atteindre l'oracle 22023 ; les deux refus
--     sont testés) ;
-- (f) le chemin rôle est fermé : set_member_role refuse de transformer en
--     'enfant' une ligne porteuse d'un compte (22023), et la ligne ne
--     change pas de rôle.
--
-- PREUVE ROUGE : (a) tombe sans le revoke/garde de 0145, (b) sans l'ordre
-- update-avant-delete (la cascade 0002 détruirait la ligne membre et
-- l'assignation), (c) sans la conversion correcte (l'état converti
-- violerait la CHECK), (d) sans l'exclusion multi-foyer, (e) sans le refus
-- D-17a (l'échange aboutirait et créerait un enfant-avec-compte), (f) sans
-- la garde D-17b.
--
-- Bornes (AGENTS.md §2.7 D) : chaque comptage est porté par un identifiant
-- nommé via testkit.fx — jamais un total de table. Les oracles SQLSTATE
-- suivent la forme 0051 (begin/exception + testkit.ok sur SQLSTATE), plus
-- précise qu'un expect_denied muet : elle distingue le bon refus du mauvais
-- échec. Fichier autonome, rollback final.

begin;

-- L'invariant 0145 est appliqué avant la campagne (sinon, rien de ce qui
-- suit n'a de sens : le dire plutôt qu'échouer plus bas sans cause).
select testkit.eq(
  (select count(*) from pg_catalog.pg_constraint
    where conname = 'chk_members_managed_child'
      and conrelid = 'public.household_members'::regclass),
  1::bigint,
  'l''invariant chk_members_managed_child de 0145 est appliqué');

-- --------------------------------------------------------------------------
-- Sémis : Alice admin de A, Bob membre de A (avec compte), Carol admin de B.
-- --------------------------------------------------------------------------
do $t145$
declare
  alice uuid := testkit.auth_user('t145-alice@example.fr', 'Alice Cent Quarante Cinq');
  bob   uuid := testkit.auth_user('t145-bob@example.fr', 'Bob Cent Quarante Cinq');
  carol uuid := testkit.auth_user('t145-carol@example.fr', 'Carol Cent Quarante Cinq');
  home_a text := testkit.household(alice, 'Foyer Cent Quarante Cinq A');
  home_b text := testkit.household(carol, 'Foyer Cent Quarante Cinq B');
begin
  perform testkit.member(home_a, alice, 'Alice CQA', 'admin', 'accent');
  perform testkit.member(home_a, bob, 'Bob CQA', 'membre', 'ink');
  perform testkit.member(home_b, carol, 'Carol CQB', 'admin', 'violet');
  insert into testkit.fx (key, user_id) values
    ('t145-alice', alice), ('t145-bob', bob), ('t145-carol', carol);
  insert into testkit.fx (key, household_id) values
    ('t145-home-a', home_a), ('t145-home-b', home_b);
end;
$t145$;

insert into testkit.fx (key, row_id)
select 't145-alice_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't145-home-a')
   and m.user_id = (select user_id from testkit.fx where key = 't145-alice');

insert into testkit.fx (key, row_id)
select 't145-bob_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't145-home-a')
   and m.user_id = (select user_id from testkit.fx where key = 't145-bob');

-- --------------------------------------------------------------------------
-- (a) Refus d'acteur — 1re barrière : authenticated n'a pas d'EXECUTE.
-- --------------------------------------------------------------------------
select testkit.as_user((select user_id from testkit.fx where key = 't145-alice'), 't145-alice@example.fr');
set local role authenticated;
do $t145$
begin
  begin
    perform public.convert_managed_children_to_profiles();
    perform testkit.ok(false, 'un acteur authentifié n''exécute pas la conversion');
  exception when others then
    perform testkit.ok(SQLSTATE = '42501', 'refus 42501 attendu (grant), obtenu ' || SQLSTATE || ' — ' || sqlerrm);
  end;
end;
$t145$;
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

-- (a) Refus d'acteur — 2e barrière : service_role portant une session JWT
-- (garde runtime auth.uid() → 42501, T-25-03). testkit n'est pas accessible
-- à service_role (pas d'USAGE sur le schéma) : les refus sont capturés sous
-- ce rôle et affirmés après le retour au rôle propriétaire.
select testkit.as_user((select user_id from testkit.fx where key = 't145-alice'), 't145-alice@example.fr');
do $t145$
declare
  v_state text;
  v_msg text;
begin
  set local role service_role;
  begin
    perform public.convert_managed_children_to_profiles();
    v_state := 'AUCUNE_ERREUR';
  exception when others then
    v_state := SQLSTATE;
    v_msg := sqlerrm;
  end;
  reset role;
  perform testkit.ok(v_state = '42501', 'garde d''acteur : 42501 attendu, obtenu ' || v_state || ' — ' || v_msg);
  perform testkit.ok(v_msg like '%service%', 'la garde parle du service serveur : ' || v_msg);
end;
$t145$;
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

-- --------------------------------------------------------------------------
-- (b) Conversion observée : semis de l'état hérité (l'invariant est retiré
-- le temps du semis — c'est en soi la preuve qu'il interdit cet état), puis
-- conversion sous service_role, l'appelant légitime.
-- --------------------------------------------------------------------------
do $t145$
declare
  kid uuid;
  kid_m text;
  home_a text;
  alice_m text;
begin
  select household_id into home_a from testkit.fx where key = 't145-home-a';
  select row_id into alice_m from testkit.fx where key = 't145-alice_m';

  alter table public.household_members drop constraint chk_members_managed_child;

  kid := testkit.auth_user('t145-noe@example.fr', 'Noé Cent Quarante Cinq');
  kid_m := testkit.member(home_a, kid, 'Noé CQA', 'enfant', 'amber');

  -- Le testkit ignore le user_id des enfants (l'invariant produit). Le
  -- scénario décrit l'état HÉRITÉ d'avant 0145 — un enfant porteur d'un
  -- compte — semé ici à la main pendant que l'invariant est retiré.
  update public.household_members set user_id = kid where id = kid_m;

  with ins as (
    insert into public.tasks (household_id, name, created_by)
    values (home_a, 'Ranger la chambre t145', alice_m)
    returning id
  )
  insert into public.task_assignees (task_id, member_id)
  select id, kid_m from ins;

  insert into testkit.fx (key, user_id) values ('t145-kid', kid);
  insert into testkit.fx (key, row_id)
  select 't145-kid_m', m.id from public.household_members m
   where m.household_id = home_a and m.user_id = kid;

  insert into testkit.fx (key, row_id)
  select 't145-task', t.id from public.tasks t
   where t.household_id = home_a and t.name = 'Ranger la chambre t145';
end;
$t145$;

-- Pré-assertions : l'état hérité est bien celui qu'on croit semer.
select testkit.eq(
  (select count(*) from public.profiles
    where id = (select user_id from testkit.fx where key = 't145-kid')),
  1::bigint,
  'le profil enfant existe avant conversion (déclencheur 0008)');
select testkit.eq(
  (select count(*) from auth.users
    where id = (select user_id from testkit.fx where key = 't145-kid')),
  1::bigint,
  'le compte enfant existe avant conversion');
select testkit.eq(
  (select count(*) from public.household_members
    where id = (select row_id from testkit.fx where key = 't145-kid_m')
      and user_id = (select user_id from testkit.fx where key = 't145-kid')
      and role = 'enfant'),
  1::bigint,
  'la ligne enfant porte le compte avant conversion');

do $t145$
declare
  v_kid uuid;
  v_kid_m text;
  v_task text;
  v_report jsonb;
begin
  select user_id into v_kid from testkit.fx where key = 't145-kid';
  select row_id into v_kid_m from testkit.fx where key = 't145-kid_m';
  select row_id into v_task from testkit.fx where key = 't145-task';

  set local role service_role;
  v_report := public.convert_managed_children_to_profiles();
  reset role;

  perform testkit.ok((v_report ->> 'converted')::int = 1,
    'le rapport dit converted=1, obtenu ' || coalesce(v_report::text, '<null>'));
  perform testkit.ok((v_report ->> 'skipped')::int = 0,
    'le rapport dit skipped=0, obtenu ' || coalesce(v_report::text, '<null>'));

  perform testkit.eq(
    (select count(*) from public.household_members where id = v_kid_m),
    1::bigint, 'la ligne membre survit à la conversion (D-04)');
  perform testkit.eq(
    (select count(*) from public.household_members
      where id = v_kid_m and user_id is null and role = 'enfant'),
    1::bigint, 'elle ressort sans compte et toujours enfant');
  perform testkit.eq(
    (select count(*) from public.profiles where id = v_kid),
    0::bigint, 'la ligne profiles est partie');
  perform testkit.eq(
    (select count(*) from auth.users where id = v_kid),
    0::bigint, 'le compte auth.users est parti');
  perform testkit.eq(
    (select count(*) from public.task_assignees where member_id = v_kid_m),
    1::bigint, 'l''assignation de tâche survit (D-04, cascade neutralisée)');
  perform testkit.eq(
    (select count(*) from public.tasks where id = v_task),
    1::bigint, 'la tâche survit');
end;
$t145$;

-- --------------------------------------------------------------------------
-- (c) Ré-invariant : il se re-crée sur les données converties (l'état de
-- sortie respecte l'invariant). Un échec icisignifierait une conversion
-- incomplète — jamais contourné.
-- --------------------------------------------------------------------------
alter table public.household_members
  add constraint chk_members_managed_child
  check ((user_id is null) = (role = 'enfant'));

-- --------------------------------------------------------------------------
-- (d) Multi-foyer : Lila est enfant dans A et membre adulte dans B — son
-- compte est ignoré par la conversion (skipped) et survit.
-- --------------------------------------------------------------------------
do $t145$
declare
  kid2 uuid;
  kid2_a text;
  kid2_e text;
  home_a text;
  home_b text;
begin
  select household_id into home_a from testkit.fx where key = 't145-home-a';
  select household_id into home_b from testkit.fx where key = 't145-home-b';

  alter table public.household_members drop constraint chk_members_managed_child;

  kid2 := testkit.auth_user('t145-lila@example.fr', 'Lila Cent Quarante Cinq');
  kid2_a := testkit.member(home_b, kid2, 'Lila adulte CQB', 'membre', 'ink');
  kid2_e := testkit.member(home_a, kid2, 'Lila enfant CQA', 'enfant', 'amber');

  -- Même état hérité qu'en (b) : la ligne enfant porte le compte, semé à la
  -- main pendant que l'invariant est retiré — c'est lui que la conversion
  -- doit IGNOREN (le compte est partagé par la ligne adulte d'un autre foyer).
  update public.household_members set user_id = kid2 where id = kid2_e;

  insert into testkit.fx (key, user_id) values ('t145-kid2', kid2);
  insert into testkit.fx (key, row_id) values
    ('t145-kid2_a', kid2_a), ('t145-kid2_e', kid2_e);
end;
$t145$;

select testkit.eq(
  (select count(*) from auth.users
    where id = (select user_id from testkit.fx where key = 't145-kid2')),
  1::bigint,
  'le compte de Lila existe avant la seconde conversion');

do $t145$
declare
  v_kid2 uuid;
  v_a text;
  v_e text;
  v_report jsonb;
begin
  select user_id into v_kid2 from testkit.fx where key = 't145-kid2';
  select row_id into v_a from testkit.fx where key = 't145-kid2_a';
  select row_id into v_e from testkit.fx where key = 't145-kid2_e';

  set local role service_role;
  v_report := public.convert_managed_children_to_profiles();
  reset role;

  perform testkit.ok((v_report ->> 'converted')::int = 0,
    'rien à convertir : converted=0, obtenu ' || coalesce(v_report::text, '<null>'));
  perform testkit.ok((v_report ->> 'skipped')::int = 1,
    'le compte partagé est compté skipped=1, obtenu ' || coalesce(v_report::text, '<null>'));

  perform testkit.eq(
    (select count(*) from auth.users where id = v_kid2),
    1::bigint, 'le compte de Lila survit (membre adulte d''un autre foyer)');
  perform testkit.eq(
    (select count(*) from public.profiles where id = v_kid2),
    1::bigint, 'son profil survit');
  perform testkit.eq(
    (select count(*) from public.household_members
      where id = v_e and user_id is null and role = 'enfant'),
    1::bigint, 'sa ligne enfant devient sans compte');
  perform testkit.eq(
    (select count(*) from public.household_members
      where id = v_a and user_id = v_kid2),
    1::bigint, 'sa ligne adulte garde le compte');
end;
$t145$;

-- Ré-invariant après le scénario multi-foyer : l'état de sortie le
-- respecte aussi.
alter table public.household_members
  add constraint chk_members_managed_child
  check ((user_id is null) = (role = 'enfant'));

-- --------------------------------------------------------------------------
-- (e) Chemin invitation fermé (D-17a). 1re passe : authenticated est refusé
-- sur le privilège (42501, pas d'EXECUTE depuis 0009). 2e passe : sous
-- service_role, l'appelant Edge légitime, le refus métier est 22023.
-- --------------------------------------------------------------------------
select testkit.as_user((select user_id from testkit.fx where key = 't145-alice'), 't145-alice@example.fr');
set local role authenticated;
do $t145$
begin
  begin
    perform public.redeem_household_invite_token(repeat('a', 64), auth.uid(), 'Invité t145', null, 'enfant');
    perform testkit.ok(false, 'authenticated n''échange pas de token d''invitation');
  exception when others then
    perform testkit.ok(SQLSTATE = '42501', 'invitation : refus 42501 (grant) attendu, obtenu ' || SQLSTATE);
  end;
end;
$t145$;
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

do $t145$
declare
  v_parent uuid;
  v_state text;
  v_msg text;
begin
  select user_id into v_parent from testkit.fx where key = 't145-alice';

  set local role service_role;
  begin
    perform public.redeem_household_invite_token(repeat('b', 64), v_parent, 'Invité t145', null, 'enfant');
    v_state := 'AUCUNE_ERREUR';
  exception when others then
    v_state := SQLSTATE;
    v_msg := sqlerrm;
  end;
  reset role;

  perform testkit.ok(v_state = '22023', 'invitation enfant : 22023 attendu, obtenu ' || v_state || ' — ' || v_msg);
  perform testkit.ok(v_msg like '%enfant%', 'le refus nomme l''enfant : ' || v_msg);
end;
$t145$;

-- --------------------------------------------------------------------------
-- (f) Chemin rôle fermé (D-17b) : sous l'admin authentifié (EXECUTE accordé
-- par 0036), transformer Bob — membre AVEC compte — en 'enfant' refuse
-- 22023, et Bob reste membre.
-- --------------------------------------------------------------------------
select testkit.as_user((select user_id from testkit.fx where key = 't145-alice'), 't145-alice@example.fr');
set local role authenticated;
do $t145$
declare
  v_bob_m text;
begin
  select row_id into v_bob_m from testkit.fx where key = 't145-bob_m';

  begin
    perform public.set_member_role(v_bob_m, 'enfant');
    perform testkit.ok(false, 'un membre disposant d''un compte ne devient pas un enfant géré');
  exception when others then
    perform testkit.ok(SQLSTATE = '22023', 'rôle enfant sur compte : 22023 attendu, obtenu ' || SQLSTATE || ' — ' || sqlerrm);
    perform testkit.ok(sqlerrm like '%compte%', 'le refus parle du compte : ' || sqlerrm);
  end;
end;
$t145$;
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

select testkit.eq(
  (select count(*) from public.household_members
    where id = (select row_id from testkit.fx where key = 't145-bob_m')
      and role = 'membre'),
  1::bigint,
  'Bob reste membre : le refus n''a rien changé');

rollback;
