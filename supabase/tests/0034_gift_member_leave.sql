-- supabase/tests/0034_gift_member_leave.sql
--
-- Départ volontaire d'une liste rejointe inter-foyers (0095, G-06-1c) : un
-- membre invité quitte via `member_leave_gift_list` (service_role seul) —
-- EXACTEMENT ses parts (formes membre ET e-mail) sont supprimées, la liste
-- sort de son ensemble lisible, ses tenues attribuées sous nom vérifié
-- restent byte-identiques (style anonyme), les parts des autres survivent,
-- et le ré-échange du code recrée sa part (redeem 0082 intact).
--
-- Scénario : foyer A (Alice admin, Bob membre propriétaire des listes),
-- foyer B (Carol membre). Carol échange un code de la liste privée A avec
-- son e-mail (branche externe du redeem) et détient en plus une part forme
-- membre (second foyer / part pré-existante — la suppression couvre les deux
-- formes, T-06-14). Bob détient sa propre part `reservation` (les parts
-- d'autrui survivent au départ de Carol).
--
-- Sections serveur (rôle propriétaire, auth.uid() NULL — la voie serveur
-- réelle) d'abord, sections avec identité ensuite : les claims posées par
-- testkit.as_user persistent jusqu'à la fin de la transaction (motif 0029).

begin;

do $$
declare
  alice uuid := testkit.auth_user('alice34@example.fr', 'Alice Trente-Quatre');
  bob uuid := testkit.auth_user('bob34@example.fr', 'Bob Trente-Quatre');
  carol uuid := testkit.auth_user('carol34@example.fr', 'Carol Trente-Quatre');
  gwen uuid := testkit.auth_user('gwen34@example.fr', 'Gwen Trente-Quatre');

  home_a text := testkit.household(alice, 'Foyer 34 A');
  home_b text := testkit.household(carol, 'Foyer 34 B');

  alice_m text := testkit.member(home_a, alice, 'Alice Trente-Quatre', 'admin', 'accent');
  bob_m text := testkit.member(home_a, bob, 'Bob Trente-Quatre', 'membre', 'ink');
  carol_m text := testkit.member(home_b, carol, 'Carol Trente-Quatre', 'membre', 'amber');
begin
  insert into public.gift_lists (id, household_id, owner_member_id, name, visibility)
  values ('gl34_part', home_a, bob_m, 'Noel 34 Partage', 'privee'),
         ('gl34_scellee', home_a, bob_m, 'Noel 34 Scellee', 'privee');

  insert into public.gift_items (id, list_id, household_id, name, price)
  values ('gitem34_a', 'gl34_part', home_a, 'Echarpe', 30),
         ('gitem34_b', 'gl34_part', home_a, 'Bonnet', 20),
         ('gitem34_u', 'gl34_scellee', home_a, 'Gants', 15);

  -- Part `reservation` de Bob (autre membre) : elle doit survivre au départ
  -- de Carol (§3). Part forme membre de Carol : seconde forme d'identité
  -- couverte par la suppression (T-06-14) — `gift_list_shares` ne porte
  -- aucun trigger validate_member_refs (0008), seule la RLS d'insertion
  -- directe la refuserait à un client (prouvé §1).
  insert into public.gift_list_shares (id, list_id, shared_with_member_id, permission)
  values ('sh34_bob', 'gl34_part', bob_m, 'reservation'),
         ('sh34_carol_membre', 'gl34_part', carol_m, 'reservation');

  insert into testkit.fx (key, user_id, household_id, row_id) values
    ('alice', alice, home_a, alice_m),
    ('bob', bob, home_a, bob_m),
    ('carol', carol, home_b, carol_m),
    ('gwen', gwen, null, null);
end;
$$;

create table testkit.hashes ("h1" text);
insert into testkit.hashes values
  ('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
grant select on testkit.hashes to anon, authenticated;

-- Bob (propriétaire) crée le code ; Carol (autre foyer) l'échange avec son
-- e-mail → partage `reservation` par e-mail (branche externe, 0082).
select public.create_gift_list_invite(
  p_actor_id => (select user_id from testkit.fx where key = 'bob'),
  p_list_id => 'gl34_part',
  p_token_hash => (select h1 from testkit.hashes),
  p_max_uses => 10
);
select testkit.eq(
  (public.redeem_gift_list_invite(
    p_token_hash => (select h1 from testkit.hashes),
    p_email => 'carol34@example.fr'
  ) ->> 'already_shared')::boolean,
  false,
  'carol (autre foyer) echange le code avec son e-mail');
select testkit.eq(testkit.count(
  'select 1 from public.gift_list_shares where list_id = ''gl34_part'' and shared_with_email = ''carol34@example.fr'' and permission = ''reservation'''),
  1::bigint,
  'le redeem cree un partage reservation par e-mail pour carol');
select testkit.eq(testkit.count(
  'select 1 from public.gift_list_shares where list_id = ''gl34_part'''),
  3::bigint,
  'trois parts sur la liste avant tout depart (bob, carol membre, carol e-mail)');

-- Carol réserve via la voie serveur AVANT de quitter : sa tenue attribuée
-- sous nom vérifié doit survivre byte-identique à son départ (§3).
select testkit.eq(
  (public.member_reserve_gift_item(
    (select user_id from testkit.fx where key = 'carol'), 'gitem34_a'
  ) ->> 'already_reserved')::boolean,
  false,
  'carol reserve via la voie serveur avant de quitter');

-- ===========================================================================
-- 1. La RLS refuse les suppressions directes de parts à une non-gestionnaire
--    (le RPC serveur est la seule voie de départ — T-06-14).
-- ===========================================================================
select testkit.as_user(user_id, 'carol34@example.fr') from testkit.fx where key = 'carol';
set local role authenticated;

-- Carol lit ses parts (SELECT via can_read) mais ne les supprime pas
-- (DELETE exige can_manage) — ni les siennes, ni celles d'autrui. Un DELETE
select testkit.eq(testkit.count(
  'select 1 from public.gift_list_shares where list_id = ''gl34_part'''),
  3::bigint,
  'carol lit les trois parts de la liste partagee (le refus n''est pas de l''invisibilite)');
-- filtré par la RLS ne lève pas d'erreur : il touche zéro ligne (motif
-- filtré par la RLS ne lève pas d'erreur : il touche zéro ligne (motif
-- testkit.affected — la RLS refuse en silence, échec fermé). C'est la preuve
-- négative exacte de ce chemin sans trigger : 0 ligne + lignes intactes.
select testkit.eq(testkit.affected(
  'delete from public.gift_list_shares where id = ''sh34_carol_membre'''),
  0::bigint,
  'carol ne supprime pas sa propre part en direct (RLS : 0 ligne, echec ferme)');
select testkit.eq(testkit.affected(
  'delete from public.gift_list_shares where id = ''sh34_bob'''),
  0::bigint,
  'carol ne supprime pas la part d''un autre membre en direct (RLS : 0 ligne)');

select testkit.eq(testkit.count(
  'select 1 from public.gift_list_shares where list_id = ''gl34_part'''),
  3::bigint,
  'les refus directs ne suppriment rien');

reset role;

-- ===========================================================================
-- 2. Le départ supprime EXACTEMENT les parts de l'appelante (les deux
--    formes), et la liste sort de son ensemble lisible.
--
--    Les claims posées par testkit.as_user persistent jusqu'à la fin de la
--    transaction (motif 0029) : on restaure explicitement le contexte
--    serveur (uid NULL — la voie service_role réelle) avant ces assertions.
-- ===========================================================================
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;
reset role;
select testkit.eq(
  (public.member_leave_gift_list(
    (select user_id from testkit.fx where key = 'carol'), 'gl34_part'
  ) ->> 'left')::boolean,
  true,
  'carol quitte la liste rejointe');
select testkit.eq(testkit.count(
  'select 1 from public.gift_list_shares where list_id = ''gl34_part'' and (shared_with_email = ''carol34@example.fr'' or shared_with_member_id = (select row_id from testkit.fx where key = ''carol''))'),
  0::bigint,
  'les deux formes de part de carol sont supprimees (membre et e-mail)');
select testkit.eq(testkit.count(
  'select 1 from public.gift_list_shares where list_id = ''gl34_part'''),
  1::bigint,
  'seule la part de bob survit au depart de carol');

-- La liste et ses articles sortent de l'ensemble lisible de Carol, mais
-- restent lisibles par Bob (autre membre, part intacte).
select testkit.as_user(user_id, 'carol34@example.fr') from testkit.fx where key = 'carol';
set local role authenticated;

select testkit.eq(testkit.count(
  'select 1 from public.gift_lists where id = ''gl34_part'''),
  0::bigint,
  'la liste quittee n''est plus lisible par carol');
select testkit.eq(testkit.count(
  'select 1 from public.gift_items where id = ''gitem34_a'''),
  0::bigint,
  'les articles de la liste quittee ne sont plus lisibles par carol');

reset role;

select testkit.as_user(user_id, 'bob34@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.count(
  'select 1 from public.gift_lists where id = ''gl34_part'''),
  1::bigint,
  'la liste reste lisible par bob (sa part survit)');

reset role;

-- ===========================================================================
-- 3. Les tenues attribuées de la partante survivent byte-identiques (style
--    anonyme) : quitter n'est pas libérer — seule la libération
--    organisatrice (D-08) efface une tenue.
-- ===========================================================================
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;
reset role;
select testkit.eq(testkit.count(
  'select 1 from public.gift_items where id = ''gitem34_a'' and reserved_by is null and reserved_by_name = ''Carol Trente-Quatre'' and purchased = true'),
  1::bigint,
  'la tenue attribuee de carol survit byte-identique a son depart');
select testkit.eq(testkit.count(
  'select 1 from public.gift_items where id = ''gitem34_b'' and reserved_by is null and reserved_by_name is null and purchased = false'),
  1::bigint,
  'l''article libre reste libre (aucun effet de bord)');
select testkit.eq(
  (select use_count from public.gift_list_invites where token_hash = (select h1 from testkit.hashes)),
  1,
  'le depart ne touche pas au compteur d''invitation');

-- ===========================================================================
-- 4. Oracle uniforme : sans part propre, liste inconnue, liste du propre
--    foyer — le même `quitter impossible`, jamais d'existence révélée
--    (T-06-15). Sans session : `session requise` (401 côté Edge).
-- ===========================================================================
do $$
declare
  v_carol uuid;
  v_bob uuid;
  v_gwen uuid;
  v_sans_part text;
  v_inconnue text;
  v_foyer text;
begin
  select user_id into v_carol from testkit.fx where key = 'carol';
  select user_id into v_bob from testkit.fx where key = 'bob';
  select user_id into v_gwen from testkit.fx where key = 'gwen';

  -- Carol a déjà quitté : plus aucune part propre sur la liste.
  begin
    perform public.member_leave_gift_list(v_carol, 'gl34_part');
    perform testkit.ok(false, 'un second depart aurait du etre refuse');
  exception when others then
    v_sans_part := sqlerrm;
    perform testkit.ok(sqlerrm like '%quitter impossible%', 'second depart refuse : ' || sqlerrm);
  end;

  -- Liste inconnue : même refus, sans distinguer.
  begin
    perform public.member_leave_gift_list(v_carol, 'gl34_inexistante');
    perform testkit.ok(false, 'quitter l''inconnu aurait du etre refuse');
  exception when others then
    v_inconnue := sqlerrm;
    perform testkit.ok(sqlerrm like '%quitter impossible%', 'liste inconnue refusee : ' || sqlerrm);
  end;

  -- Liste du propre foyer : hors périmètre, même refus (le bouton ne s'y
  -- affiche jamais — G-06-1c). Bob détient pourtant une part : c'est bien
  -- le foyer, pas l'absence de part, qui refuse ici.
  begin
    perform public.member_leave_gift_list(v_bob, 'gl34_part');
    perform testkit.ok(false, 'quitter son foyer aurait du etre refuse');
  exception when others then
    v_foyer := sqlerrm;
    perform testkit.ok(sqlerrm like '%quitter impossible%', 'liste du propre foyer refusee : ' || sqlerrm);
  end;

  -- Les trois refus sont byte-identiques : aucune fuite d'existence.
  perform testkit.eq(v_sans_part, v_inconnue, 'sans-part et inconnue : meme message');
  perform testkit.eq(v_inconnue, v_foyer, 'inconnue et propre-foyer : meme message');

  -- Gwen (sans foyer, sans part) : même refus uniforme.
  begin
    perform public.member_leave_gift_list(v_gwen, 'gl34_part');
    perform testkit.ok(false, 'gwen aurait du etre refusee');
  exception when others then
    perform testkit.ok(sqlerrm like '%quitter impossible%', 'gwen sans part refusee : ' || sqlerrm);
  end;

  -- Sans session : refus distinct (401 côté Edge, jamais l'oracle).
  begin
    perform public.member_leave_gift_list(null, 'gl34_part');
    perform testkit.ok(false, 'sans session aurait du etre refuse');
  exception when others then
    perform testkit.ok(sqlerrm like '%session requise%', 'sans session : session requise : ' || sqlerrm);
  end;
end;
$$;

select testkit.eq(testkit.count(
  'select 1 from public.gift_list_shares where list_id = ''gl34_part'''),
  1::bigint,
  'les refus uniformes ne suppriment rien (seule la part de bob demeure)');
select testkit.eq(testkit.count(
  'select 1 from public.gift_items where id = ''gitem34_a'' and reserved_by_name = ''Carol Trente-Quatre'''),
  1::bigint,
  'les refus uniformes ne touchent pas aux tenues');

-- ===========================================================================
-- 5. Le lien rejoint normalement : le ré-échange recrée la part (redeem
--    0082 intact — `already_shared` faux puis vrai, compteur +1).
-- ===========================================================================
select testkit.eq(
  (public.redeem_gift_list_invite(
    p_token_hash => (select h1 from testkit.hashes),
    p_email => 'carol34@example.fr'
  ) ->> 'already_shared')::boolean,
  false,
  'carol re-echange le meme code apres son depart (nouvelle part)');
select testkit.eq(testkit.count(
  'select 1 from public.gift_list_shares where list_id = ''gl34_part'' and shared_with_email = ''carol34@example.fr'' and permission = ''reservation'''),
  1::bigint,
  'le re-echange recree le partage reservation par e-mail');
select testkit.eq(
  (public.redeem_gift_list_invite(
    p_token_hash => (select h1 from testkit.hashes),
    p_email => 'carol34@example.fr'
  ) ->> 'already_shared')::boolean,
  true,
  'rejouer l''echange est idempotent (already_shared)');
select testkit.eq(
  (select use_count from public.gift_list_invites where token_hash = (select h1 from testkit.hashes)),
  2,
  'seuls les deux echanges consomment le compteur (redeem 0082 intact)');

select testkit.as_user(user_id, 'carol34@example.fr') from testkit.fx where key = 'carol';
set local role authenticated;

select testkit.eq(testkit.count(
  'select 1 from public.gift_lists where id = ''gl34_part'''),
  1::bigint,
  'la liste rejointe est de nouveau lisible par carol');

reset role;

rollback;
