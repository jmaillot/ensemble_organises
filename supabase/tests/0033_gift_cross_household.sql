-- supabase/tests/0033_gift_cross_household.sql
--
-- Réserve attribuée inter-foyers (0093, G-06-1b-bis) : un membre qui rejoint
-- une liste d'un autre foyer via un code (redeem) voit cette liste (partage
-- explicite, RLS inchangée) mais se heurte au garde 0083 s'il écrit
-- `reserved_by` en direct avec son id membre d'un autre foyer — c'est
-- l'impasse « redeem-into-a-wall ». La voie serveur `member_reserve_gift_item`
-- (service_role seul) attribue alors l'identité vérifiée, avec conflit propre
-- à nom... à membre différent et refus net sans partage.
--
-- Scénario : foyer A (Alice admin, Bob membre propriétaire des listes),
-- foyer B (Carol membre), Gwen sans foyer. Carol échange un code de la
-- liste privée A avec son e-mail (branche externe du redeem : elle n'est
-- pas membre de A) et détient un partage `reservation` par e-mail.
--
-- Sections serveur (rôle propriétaire, auth.uid() NULL — la voie serveur
-- réelle) d'abord, sections avec identité ensuite : les claims posées par
-- testkit.as_user persistent jusqu'à la fin de la transaction (motif 0029).

begin;

do $$
declare
  alice uuid := testkit.auth_user('alice33@example.fr', 'Alice Trente-Trois');
  bob uuid := testkit.auth_user('bob33@example.fr', 'Bob Trente-Trois');
  carol uuid := testkit.auth_user('carol33@example.fr', 'Carol Trente-Trois');
  gwen uuid := testkit.auth_user('gwen33@example.fr', 'Gwen Trente-Trois');

  home_a text := testkit.household(alice, 'Foyer 33 A');
  home_b text := testkit.household(carol, 'Foyer 33 B');

  alice_m text := testkit.member(home_a, alice, 'Alice Trente-Trois', 'admin', 'accent');
  bob_m text := testkit.member(home_a, bob, 'Bob Trente-Trois', 'membre', 'ink');
  carol_m text := testkit.member(home_b, carol, 'Carol Trente-Trois', 'membre', 'amber');
begin
  insert into public.gift_lists (id, household_id, owner_member_id, name, visibility)
  values ('gl33_part', home_a, bob_m, 'Noel 33 Partage', 'privee'),
         ('gl33_scellee', home_a, bob_m, 'Noel 33 Scellee', 'privee');

  insert into public.gift_items (id, list_id, household_id, name, price)
  values ('gitem33_a', 'gl33_part', home_a, 'Echarpe', 30),
         ('gitem33_b', 'gl33_part', home_a, 'Bonnet', 20),
         ('gitem33_u', 'gl33_scellee', home_a, 'Gants', 15);

  -- Bob (membre du foyer A) détient aussi un partage `reservation` : sa
  -- réserve via la voie serveur sur une tenue d'autrui prouve le conflit
  -- propre (§3), pas un refus d'autorisation.
  insert into public.gift_list_shares (id, list_id, shared_with_member_id, permission)
  values ('sh33_bob', 'gl33_part', bob_m, 'reservation');

  insert into testkit.fx (key, user_id, household_id, row_id) values
    ('alice', alice, home_a, alice_m),
    ('bob', bob, home_a, bob_m),
    ('carol', carol, home_b, carol_m),
    ('gwen', gwen, null, null);
end;
$$;

create table testkit.hashes ("h1" text);
insert into testkit.hashes values
  ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
grant select on testkit.hashes to anon, authenticated;

-- Bob (propriétaire) crée le code ; Carol (autre foyer) l'échange avec son
-- e-mail → partage `reservation` par e-mail (branche externe, 0082).
select public.create_gift_list_invite(
  p_actor_id => (select user_id from testkit.fx where key = 'bob'),
  p_list_id => 'gl33_part',
  p_token_hash => (select h1 from testkit.hashes),
  p_max_uses => 10
);
select testkit.eq(
  (public.redeem_gift_list_invite(
    p_token_hash => (select h1 from testkit.hashes),
    p_email => 'carol33@example.fr'
  ) ->> 'already_shared')::boolean,
  false,
  'carol (autre foyer) echange le code avec son e-mail');
select testkit.eq(testkit.count(
  'select 1 from public.gift_list_shares where list_id = ''gl33_part'' and shared_with_email = ''carol33@example.fr'' and permission = ''reservation'''),
  1::bigint,
  'le redeem cree un partage reservation par e-mail pour carol');

-- ===========================================================================
-- 1. État actuel : le garde 0083 refuse l'écriture directe d'un id membre
--    d'un autre foyer (l'impasse prouvée avant tout changement).
-- ===========================================================================
select testkit.as_user(user_id, 'carol33@example.fr') from testkit.fx where key = 'carol';
set local role authenticated;

-- Carol détient un partage : la politique UPDATE la laisse passer (USING
-- via has_gift_reservation, branche e-mail), c'est le TRIGGER qui refuse.
select testkit.expect_denied(format(
  'update public.gift_items set reserved_by = %L, purchased = true where id = ''gitem33_a''',
  (select row_id from testkit.fx where key = 'carol')),
  'carol ne reserve pas en direct avec son id membre d''un autre foyer (0083)');

do $$
declare
  v_carol_m text;
begin
  select row_id into v_carol_m from testkit.fx where key = 'carol';
  begin
    execute format(
      'update public.gift_items set reserved_by = %L, purchased = true where id = %L',
      v_carol_m, 'gitem33_a');
    perform testkit.ok(false, 'la reserve directe aurait du etre refusee');
  exception when others then
    perform testkit.ok(
      sqlerrm like '%autre membre%',
      'le refus vient du garde 0083, pas de la RLS : ' || sqlerrm);
  end;
end;
$$;

select testkit.eq(testkit.count(
  'select 1 from public.gift_items where id = ''gitem33_a'' and reserved_by is null and purchased = false'),
  1::bigint,
  'l''article reste libre apres le refus');

reset role;

-- ===========================================================================
-- 2. Visibilité cadrée par partage (RLS inchangée) : la liste partagée est
--    lisible par Carol, la liste scellée ne l'est pas, Gwen ne voit rien.
-- ===========================================================================
select testkit.as_user(user_id, 'carol33@example.fr') from testkit.fx where key = 'carol';
set local role authenticated;

select testkit.eq(testkit.count(
  'select 1 from public.gift_lists where id = ''gl33_part'''),
  1::bigint,
  'la liste partagee est lisible par carol (partage e-mail)');
select testkit.eq(testkit.count(
  'select 1 from public.gift_items where id = ''gitem33_a'''),
  1::bigint,
  'l''article de la liste partagee est lisible par carol');
select testkit.eq(testkit.count(
  'select 1 from public.gift_lists where id = ''gl33_scellee'''),
  0::bigint,
  'la liste non partagee reste invisible a carol');
select testkit.eq(testkit.count(
  'select 1 from public.gift_items where id = ''gitem33_u'''),
  0::bigint,
  'l''article de la liste non partagee reste invisible a carol');

reset role;

select testkit.as_user(user_id, 'gwen33@example.fr') from testkit.fx where key = 'gwen';
set local role authenticated;

select testkit.eq(testkit.count(
  'select 1 from public.gift_lists where id = ''gl33_part'''),
  0::bigint,
  'gwen (sans foyer, sans partage) ne voit pas la liste partagee');

reset role;

-- ===========================================================================
-- 3. Voie serveur (0093) : la réserve attribuée réussit pour la détentrice
--    du partage, sous son identité vérifiée — sans toucher au compteur.
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
  (public.member_reserve_gift_item(
    (select user_id from testkit.fx where key = 'carol'), 'gitem33_a'
  ) ->> 'already_reserved')::boolean,
  false,
  'carol reserve via la voie serveur (partage reservation par e-mail)');
select testkit.eq(testkit.count(
  'select 1 from public.gift_items where id = ''gitem33_a'' and reserved_by is null and reserved_by_name = ''Carol Trente-Trois'''),
  1::bigint,
  'la reserve porte le nom du profil verifie de carol, jamais un FK membre');
select testkit.eq(
  (select purchased from public.gift_items where id = 'gitem33_a'),
  true,
  'la reserve membre pose purchased (signal proprietaire, comme 0091)');
select testkit.eq(
  (select use_count from public.gift_list_invites where token_hash = (select h1 from testkit.hashes)),
  1,
  'la reserve attribuee ne consomme pas de jeton supplementaire');
select testkit.eq(
  (public.member_reserve_gift_item(
    (select user_id from testkit.fx where key = 'carol'), 'gitem33_a'
  ) ->> 'released')::boolean,
  true,
  'rejouer sa propre reserve la libere (G-06-23, 0096 : reserve-ou-libere)');
select testkit.eq(testkit.count(
  'select 1 from public.gift_items where id = ''gitem33_a'' and reserved_by is null and reserved_by_name is null and purchased = false'),
  1::bigint,
  'la liberation efface les deux formes d''auteur et le signal');
-- On retient à nouveau pour la suite (§4 : lecture propriétaire du signal,
-- libération organisatrice sur tenue inter-foyers) — inchangée.
select testkit.eq(
  (public.member_reserve_gift_item(
    (select user_id from testkit.fx where key = 'carol'), 'gitem33_a'
  ) ->> 'already_reserved')::boolean,
  false,
  'un article libere est tenable a nouveau par la voie serveur');
select testkit.eq(testkit.count(
  'select 1 from public.gift_items where id = ''gitem33_a'' and reserved_by is null and reserved_by_name = ''Carol Trente-Trois'' and purchased = true'),
  1::bigint,
  'la nouvelle tenue porte a nouveau le nom verifie de carol');

-- Second membre : conflit propre, pas de fuite CHECK.
do $$
begin
  begin
    perform public.member_reserve_gift_item(
      (select user_id from testkit.fx where key = 'bob'), 'gitem33_a');
    perform testkit.ok(false, 'bob aurait du etre en conflit');
  exception when others then
    perform testkit.ok(sqlerrm like '%article déjà réservé%', 'bob en conflit propre : ' || sqlerrm);
  end;
end;
$$;

-- Sans partage : refus net, sans donnee. Sans identite membre non plus.
do $$
begin
  begin
    perform public.member_reserve_gift_item(
      (select user_id from testkit.fx where key = 'gwen'), 'gitem33_b');
    perform testkit.ok(false, 'gwen aurait du etre refusee');
  exception when others then
    perform testkit.ok(sqlerrm like '%réservation non autorisée%', 'gwen refusee sans partage : ' || sqlerrm);
  end;
  begin
    perform public.member_reserve_gift_item(
      (select user_id from testkit.fx where key = 'carol'), 'gitem33_u');
    perform testkit.ok(false, 'carol aurait du etre refusee sur la liste scellee');
  exception when others then
    perform testkit.ok(sqlerrm like '%réservation non autorisée%', 'carol refusee sur liste non partagee : ' || sqlerrm);
  end;
  begin
    perform public.member_reserve_gift_item(
      (select user_id from testkit.fx where key = 'carol'), 'gitem_inexistant');
    perform testkit.ok(false, 'un article inconnu aurait du etre refuse');
  exception when others then
    perform testkit.ok(sqlerrm like '%réservation non autorisée%', 'article inconnu : meme refus, sans oracle : ' || sqlerrm);
  end;
end;
$$;

-- Partage `lecture` seul : lit, ne reserve pas (motif 0028 §4).
do $$
declare
  lec uuid := testkit.auth_user('lec33@example.fr', 'Lec Trente-Trois');
begin
  insert into public.gift_list_shares (id, list_id, shared_with_email, permission)
  values ('sh33_lec', 'gl33_part', 'lec33@example.fr', 'lecture');
  begin
    perform public.member_reserve_gift_item(lec, 'gitem33_b');
    perform testkit.ok(false, 'un partage lecture aurait du etre refuse');
  exception when others then
    perform testkit.ok(sqlerrm like '%réservation non autorisée%', 'partage lecture : reserve refusee : ' || sqlerrm);
  end;
end;
$$;

-- Externe avec compte et partage `reservation` par e-mail, sans aucun foyer :
-- le partage EST l'autorisation (D-17), le nom attribué vient du profil.
do $$
declare
  ext uuid := testkit.auth_user('ext33@example.fr', 'Ext Trente-Trois');
begin
  insert into public.gift_list_shares (id, list_id, shared_with_email, permission)
  values ('sh33_ext', 'gl33_part', 'ext33@example.fr', 'reservation');
  insert into testkit.fx (key, user_id, household_id, row_id)
  values ('ext', ext, null, null);
end;
$$;
select testkit.eq(
  (public.member_reserve_gift_item(
    (select user_id from testkit.fx where key = 'ext'), 'gitem33_b'
  ) ->> 'already_reserved')::boolean,
  false,
  'un externe avec partage reservation reserve sous son nom de profil');
select testkit.eq(testkit.count(
  'select 1 from public.gift_items where id = ''gitem33_b'' and reserved_by is null and reserved_by_name = ''Ext Trente-Trois'''),
  1::bigint,
  'la reserve externe porte le nom verifie, sans FK membre');

-- Profil hors bornes : echec ferme, sans ecrire (ni troncature, ni CHECK).
do $$
declare
  longname uuid := testkit.auth_user('long33@example.fr', 'Long Trente-Trois');
begin
  insert into public.gift_list_shares (id, list_id, shared_with_email, permission)
  values ('sh33_long', 'gl33_scellee', 'long33@example.fr', 'reservation');
  update public.profiles set display_name = repeat('n', 81) where id = longname;
  begin
    perform public.member_reserve_gift_item(longname, 'gitem33_u');
    perform testkit.ok(false, 'un profil hors bornes aurait du etre refuse');
  exception when others then
    perform testkit.ok(sqlerrm like '%inexploitable%', 'profil de 81 caracteres : echec ferme : ' || sqlerrm);
  end;
end;
$$;

select testkit.eq(testkit.count(
  'select 1 from public.gift_items where id = ''gitem33_b'' and reserved_by is null and reserved_by_name = ''Ext Trente-Trois'' and purchased = true'),
  1::bigint,
  'gitem33_b tient sous nom attribue avec signal proprietaire');

-- ===========================================================================
-- 4. Effets de bord : le proprietaire lit le signal sans l'auteur, et la
--    liberation organisatrice fonctionne sur une tenue inter-foyers.
-- ===========================================================================
select testkit.as_user(user_id, 'bob33@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.count(
  'select 1 from public.gift_items_for_list where id = ''gitem33_a'' and reserved_by is null and reserved_by_name is null and purchased = true'),
  1::bigint,
  'le proprietaire lit reserve-sans-auteur via la vue (D-07, signal 0091)');

reset role;

select testkit.as_user(user_id, 'carol33@example.fr') from testkit.fx where key = 'carol';
set local role authenticated;

select testkit.eq(testkit.count(
  'select 1 from public.gift_items_for_list where id = ''gitem33_a'' and reserved_by_name = ''Carol Trente-Trois'''),
  1::bigint,
  'carol lit sa propre reserve attribuee via la vue');

reset role;

-- Bob, proprietaire : libere la tenue inter-foyers (voie gestionnaire
-- inchangee — un admin non proprietaire ne lit meme pas la privee d'autrui,
-- motif 0029 §8, donc la liberation d'une liste privee revient au
-- proprietaire). `expect_ok` ne prend qu'un argument : le message vit dans
-- le commentaire ci-dessus.
select testkit.as_user(user_id, 'bob33@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.expect_ok(
  'update public.gift_items set reserved_by = null, purchased = false, reserved_by_name = null where id = ''gitem33_a''');

-- Retour au contexte serveur (cf. §3) avant la voie service_role.
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;
reset role;

select testkit.eq(testkit.count(
  'select 1 from public.gift_items where id = ''gitem33_a'' and reserved_by is null and reserved_by_name is null and purchased = false'),
  1::bigint,
  'l''article libere redevient libre');
select testkit.eq(
  (public.member_reserve_gift_item(
    (select user_id from testkit.fx where key = 'carol'), 'gitem33_a'
  ) ->> 'already_reserved')::boolean,
  false,
  'un article libere est reservable a nouveau par la voie serveur');

rollback;
