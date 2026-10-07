-- supabase/tests/0035_gift_member_release.sql
--
-- Réserve-ou-libère inter-foyers (0096, G-06-23) : `member_reserve_gift_item`
-- (service_role seul) tient un article libre au nom vérifié de l'appelant,
-- LIBÈRE une tenue à son nom vérifié (ou à une de ses lignes membre — même
-- définition du « mien » que l'idempotence 0094), et refuse proprement la
-- tenue d'autrui (`article déjà réservé`, sans donnée d'auteur — T-06-23).
-- Le contrôle de partage est inchangé : sans partage `reservation`, ni tenue
-- ni libération (D-04 amendée intacte) ; les écritures directes clientes
-- restent refusées par le garde/RLS (négatives).
--
-- Scénario : foyer A (Alice admin, Bob membre propriétaire des listes),
-- foyer B (Carol membre), Gwen sans foyer. Carol échange un code de la
-- liste privée A avec son e-mail (branche externe du redeem) et détient un
-- partage `reservation` par e-mail ; Bob détient un partage `reservation`
-- forme membre (il prouve le conflit propre, pas un refus d'autorisation).
--
-- Sections serveur (rôle propriétaire, auth.uid() NULL — la voie serveur
-- réelle) d'abord, sections avec identité ensuite : les claims posées par
-- testkit.as_user persistent jusqu'à la fin de la transaction (motif 0029).

begin;

do $$
declare
  alice uuid := testkit.auth_user('alice35@example.fr', 'Alice Trente-Cinq');
  bob uuid := testkit.auth_user('bob35@example.fr', 'Bob Trente-Cinq');
  carol uuid := testkit.auth_user('carol35@example.fr', 'Carol Trente-Cinq');
  gwen uuid := testkit.auth_user('gwen35@example.fr', 'Gwen Trente-Cinq');

  home_a text := testkit.household(alice, 'Foyer 35 A');
  home_b text := testkit.household(carol, 'Foyer 35 B');

  alice_m text := testkit.member(home_a, alice, 'Alice Trente-Cinq', 'admin', 'accent');
  bob_m text := testkit.member(home_a, bob, 'Bob Trente-Cinq', 'membre', 'ink');
  carol_m text := testkit.member(home_b, carol, 'Carol Trente-Cinq', 'membre', 'amber');
begin
  insert into public.gift_lists (id, household_id, owner_member_id, name, visibility)
  values ('gl35_part', home_a, bob_m, 'Noel 35 Partage', 'privee'),
         ('gl35_scellee', home_a, bob_m, 'Noel 35 Scellee', 'privee');

  insert into public.gift_items (id, list_id, household_id, name, price)
  values ('gitem35_a', 'gl35_part', home_a, 'Echarpe', 30),
         ('gitem35_b', 'gl35_part', home_a, 'Bonnet', 20),
         ('gitem35_c', 'gl35_part', home_a, 'Foulard', 25),
         ('gitem35_u', 'gl35_scellee', home_a, 'Gants', 15);

  -- Bob (membre du foyer A) détient un partage `reservation` forme membre :
  -- ses appels prouvent le conflit propre (§3) et la libération d'une tenue
  -- membre directe (§5), pas un refus d'autorisation.
  insert into public.gift_list_shares (id, list_id, shared_with_member_id, permission)
  values ('sh35_bob', 'gl35_part', bob_m, 'reservation');

  insert into testkit.fx (key, user_id, household_id, row_id) values
    ('alice', alice, home_a, alice_m),
    ('bob', bob, home_a, bob_m),
    ('carol', carol, home_b, carol_m),
    ('gwen', gwen, null, null);
end;
$$;

create table testkit.hashes ("h1" text);
insert into testkit.hashes values
  ('cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc');
grant select on testkit.hashes to anon, authenticated;

-- Bob (propriétaire) crée le code ; Carol (autre foyer) l'échange avec son
-- e-mail → partage `reservation` par e-mail (branche externe, 0082).
select public.create_gift_list_invite(
  p_actor_id => (select user_id from testkit.fx where key = 'bob'),
  p_list_id => 'gl35_part',
  p_token_hash => (select h1 from testkit.hashes),
  p_max_uses => 10
);
select testkit.eq(
  (public.redeem_gift_list_invite(
    p_token_hash => (select h1 from testkit.hashes),
    p_email => 'carol35@example.fr'
  ) ->> 'already_shared')::boolean,
  false,
  'carol (autre foyer) echange le code avec son e-mail');

-- ===========================================================================
-- 1. Libre → tenue au nom vérifié (G-06-23 : inchangé, 0094). Un seul appel
--    (bloc DO) : chaque `select` rejouerait le RPC, et rejouer sa tenue la
--    libère désormais (§2) — on lit donc les deux champs d'un même retour.
-- ===========================================================================
do $$
declare
  v_out jsonb;
begin
  v_out := public.member_reserve_gift_item(
    (select user_id from testkit.fx where key = 'carol'), 'gitem35_a');
  perform testkit.eq((v_out ->> 'already_reserved')::boolean, false,
    'carol tient un article libre via la voie serveur');
  perform testkit.eq((v_out ->> 'released')::boolean, false,
    'une tenue neuve ne se dit pas liberee');
end;
$$;
select testkit.eq(testkit.count(
  'select 1 from public.gift_items where id = ''gitem35_a'' and reserved_by is null and reserved_by_name = ''Carol Trente-Cinq'' and purchased = true'),
  1::bigint,
  'la tenue porte le nom du profil verifie de carol, jamais un FK membre');
select testkit.eq(
  (select use_count from public.gift_list_invites where token_hash = (select h1 from testkit.hashes)),
  1,
  'tenir ne consomme pas de jeton supplementaire');

-- ===========================================================================
-- 2. Mienne → libération (G-06-23) : rejouer sa propre tenue la libère —
--    les deux formes d'auteur sont effacées et le signal retombe.
-- ===========================================================================
select testkit.eq(
  (public.member_reserve_gift_item(
    (select user_id from testkit.fx where key = 'carol'), 'gitem35_a'
  ) ->> 'released')::boolean,
  true,
  'carol libere sa propre tenue attribuee en la rejouant');
select testkit.eq(testkit.count(
  'select 1 from public.gift_items where id = ''gitem35_a'' and reserved_by is null and reserved_by_name is null and purchased = false'),
  1::bigint,
  'la liberation efface les deux formes d''auteur et le signal proprietaire');
select testkit.eq(
  (select use_count from public.gift_list_invites where token_hash = (select h1 from testkit.hashes)),
  1,
  'liberer ne touche pas au compteur d''invitation');

-- Un article libéré est tenable à nouveau par la voie serveur.
select testkit.eq(
  (public.member_reserve_gift_item(
    (select user_id from testkit.fx where key = 'carol'), 'gitem35_a'
  ) ->> 'already_reserved')::boolean,
  false,
  'un article libere est tenable a nouveau par la voie serveur');
select testkit.eq(testkit.count(
  'select 1 from public.gift_items where id = ''gitem35_a'' and reserved_by_name = ''Carol Trente-Cinq'' and purchased = true'),
  1::bigint,
  'la nouvelle tenue porte a nouveau le nom verifie de carol');

-- ===========================================================================
-- 3. Tenue d'autrui → conflit propre, données inchangées, sans donnée
--    d'auteur dans le refus (T-06-23).
-- ===========================================================================
-- Bob tient l'article libre restant sous son nom vérifié (partage membre).
select testkit.eq(
  (public.member_reserve_gift_item(
    (select user_id from testkit.fx where key = 'bob'), 'gitem35_b'
  ) ->> 'already_reserved')::boolean,
  false,
  'bob tient un article libre via son partage membre');
do $$
declare
  v_conflit text;
begin
  -- Carol sur la tenue de Bob : conflit, pas libération.
  begin
    perform public.member_reserve_gift_item(
      (select user_id from testkit.fx where key = 'carol'), 'gitem35_b');
    perform testkit.ok(false, 'carol aurait du etre en conflit sur la tenue de bob');
  exception when others then
    v_conflit := sqlerrm;
    perform testkit.ok(sqlerrm like '%article déjà réservé%', 'conflit propre sur tenue d''autrui : ' || sqlerrm);
  end;
  -- Le refus ne porte aucune donnée d'auteur (T-06-23) : ni le nom tenu,
  -- ni une forme qui le révélerait.
  perform testkit.ok(v_conflit not like '%Bob Trente-Cinq%', 'le conflit ne revele pas le nom du tenant');

  -- Miroir : Bob sur la tenue de Carol.
  begin
    perform public.member_reserve_gift_item(
      (select user_id from testkit.fx where key = 'bob'), 'gitem35_a');
    perform testkit.ok(false, 'bob aurait du etre en conflit sur la tenue de carol');
  exception when others then
    perform testkit.ok(sqlerrm like '%article déjà réservé%', 'conflit miroir propre : ' || sqlerrm);
    perform testkit.ok(sqlerrm not like '%Carol Trente-Cinq%', 'le conflit miroir ne revele pas le nom de la tenante');
  end;
end;
$$;

select testkit.eq(testkit.count(
  'select 1 from public.gift_items where id = ''gitem35_b'' and reserved_by is null and reserved_by_name = ''Bob Trente-Cinq'' and purchased = true'),
  1::bigint,
  'le conflit ne change pas la tenue de bob');
select testkit.eq(testkit.count(
  'select 1 from public.gift_items where id = ''gitem35_a'' and reserved_by_name = ''Carol Trente-Cinq'' and purchased = true'),
  1::bigint,
  'le conflit miroir ne change pas la tenue de carol');

-- ===========================================================================
-- 4. Sans partage `reservation` : ni tenue ni libération — refus net, sans
--    donnée (D-04 amendée intacte). Partage `lecture` seul : lit, ne touche
--    pas (motif 0028 §4).
-- ===========================================================================
do $$
declare
  lec uuid := testkit.auth_user('lec35@example.fr', 'Lec Trente-Cinq');
begin
  insert into public.gift_list_shares (id, list_id, shared_with_email, permission)
  values ('sh35_lec', 'gl35_part', 'lec35@example.fr', 'lecture');
  -- Gwen (sans foyer, sans partage) : refus sur le libre comme sur le tenu.
  begin
    perform public.member_reserve_gift_item(
      (select user_id from testkit.fx where key = 'gwen'), 'gitem35_c');
    perform testkit.ok(false, 'gwen aurait du etre refusee sur article libre');
  exception when others then
    perform testkit.ok(sqlerrm like '%réservation non autorisée%', 'gwen refusee sans partage (libre) : ' || sqlerrm);
  end;
  begin
    perform public.member_reserve_gift_item(
      (select user_id from testkit.fx where key = 'gwen'), 'gitem35_a');
    perform testkit.ok(false, 'gwen aurait du etre refusee sur article tenu');
  exception when others then
    perform testkit.ok(sqlerrm like '%réservation non autorisée%', 'gwen refusee sans partage (tenu) : ' || sqlerrm);
  end;
  -- Carol sur la liste scellée (aucun partage) et sur l'inconnu : même refus.
  begin
    perform public.member_reserve_gift_item(
      (select user_id from testkit.fx where key = 'carol'), 'gitem35_u');
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
  -- Partage `lecture` : lit, ne tient pas — et ne libère pas non plus.
  begin
    perform public.member_reserve_gift_item(lec, 'gitem35_c');
    perform testkit.ok(false, 'un partage lecture aurait du etre refuse (tenue)');
  exception when others then
    perform testkit.ok(sqlerrm like '%réservation non autorisée%', 'partage lecture : tenue refusee : ' || sqlerrm);
  end;
  begin
    perform public.member_reserve_gift_item(lec, 'gitem35_a');
    perform testkit.ok(false, 'un partage lecture aurait du etre refuse (liberation)');
  exception when others then
    perform testkit.ok(sqlerrm like '%réservation non autorisée%', 'partage lecture : liberation refusee : ' || sqlerrm);
  end;
  -- Sans session : refus distinct (401 côté Edge, jamais l'oracle).
  begin
    perform public.member_reserve_gift_item(null, 'gitem35_c');
    perform testkit.ok(false, 'sans session aurait du etre refuse');
  exception when others then
    perform testkit.ok(sqlerrm like '%session requise%', 'sans session : session requise : ' || sqlerrm);
  end;
end;
$$;

select testkit.eq(testkit.count(
  'select 1 from public.gift_items where id = ''gitem35_c'' and reserved_by is null and reserved_by_name is null and purchased = false'),
  1::bigint,
  'les refus laissent l''article libre intact');
select testkit.eq(
  (select use_count from public.gift_list_invites where token_hash = (select h1 from testkit.hashes)),
  1,
  'seul l''echange consomme le compteur (redeem 0082 intact)');

-- ===========================================================================
-- 5. Tenue membre directe (même foyer) : le « mien » couvre aussi
--    `reserved_by` — la voie serveur la libère en effaçant les trois
--    colonnes. Les écritures directes clientes sur `reserved_by_name`
--    restent refusées par le garde (négatives).
-- ===========================================================================
select testkit.as_user(user_id, 'bob35@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

-- Bob tient en direct avec sa ligne membre (garde 0083 : son seul nom).
select testkit.expect_ok(
  'update public.gift_items set reserved_by = (select row_id from testkit.fx where key = ''bob''), purchased = true where id = ''gitem35_c''');

-- Carol, en direct, ne touche pas à `reserved_by_name` — ni pour tenir, ni
-- pour libérer la tenue de Bob (le garde refuse tout client présentant une
-- identité sur cette colonne, motif 0089).
select testkit.as_user(user_id, 'carol35@example.fr') from testkit.fx where key = 'carol';

do $$
begin
  begin
    execute 'update public.gift_items set reserved_by_name = ''Carol Trente-Cinq'', purchased = true where id = ''gitem35_c''';
    perform testkit.ok(false, 'tenir en direct aurait du etre refuse');
  exception when others then
    perform testkit.ok(sqlerrm like '%invitee uniquement%', 'tenir en direct refuse par le garde : ' || sqlerrm);
  end;
  begin
    execute 'update public.gift_items set reserved_by_name = null, purchased = false where id = ''gitem35_b''';
    perform testkit.ok(false, 'liberer en direct aurait du etre refuse');
  exception when others then
    perform testkit.ok(sqlerrm like '%invitee uniquement%', 'liberer en direct refuse par le garde : ' || sqlerrm);
  end;
end;
$$;

-- Retour au contexte serveur (motif 0029/0033 §3) avant la voie service_role.
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;
reset role;

-- La tenue membre directe de Bob est « sienne » : la voie serveur la libère.
select testkit.eq(
  (public.member_reserve_gift_item(
    (select user_id from testkit.fx where key = 'bob'), 'gitem35_c'
  ) ->> 'released')::boolean,
  true,
  'bob libere sa tenue membre directe via la voie serveur');
select testkit.eq(testkit.count(
  'select 1 from public.gift_items where id = ''gitem35_c'' and reserved_by is null and reserved_by_name is null and purchased = false'),
  1::bigint,
  'la liberation d''une tenue membre efface les trois colonnes');

-- Les refus directs n'ont rien changé aux tenues serveur.
select testkit.eq(testkit.count(
  'select 1 from public.gift_items where id = ''gitem35_b'' and reserved_by_name = ''Bob Trente-Cinq'' and purchased = true'),
  1::bigint,
  'la tenue serveur de bob survit aux tentatives directes de carol');
select testkit.eq(testkit.count(
  'select 1 from public.gift_items where id = ''gitem35_a'' and reserved_by_name = ''Carol Trente-Cinq'' and purchased = true'),
  1::bigint,
  'la tenue serveur de carol survit aux tentatives directes');

rollback;
