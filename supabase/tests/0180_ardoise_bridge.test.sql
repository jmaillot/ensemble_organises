-- supabase/tests/0180_ardoise_bridge.test.sql
-- Phase 40 (ARD-02/ARD-03) : pont d'identité invité→foyer et réconciliation
-- `guest:` → `membre:` dans redeem_household_invite_token (0180/0180b/0181).
--
--   Cas 1 — POSITIF conversion : redeem avec pont → les parts guest des
--           guests pontés deviennent des parts membre du nouveau membre
--           (participant_type 'membre', member_id, guest_id null), part du
--           passé conservée (somme de la dépense inchangée).
--   Cas 2 — POSITIF part zéro du passé NON appliquée au bridge : le nouveau
--           membre porte les parts converties (il ne repart pas de zéro sur
--           l'ardoise pontée) — count borné par foyer.
--   Cas 3 — FUSION doublon (politique verrouillée) : membre existant (déjà
--           part membre sur une dépense) qui ponte son invité → la part
--           membre est GARDÉE (report de la part guest dessus), la part
--           guest disparaît, jamais 23505 — et la somme des parts reste
--           celle de la dépense (trigger différé 0008).
--   Cas 4 — NÉGATIF déjà admin : redeem pour un utilisateur déjà admin →
--           already_member sans seconde ligne household_members, sans
--           conversion (aucune ligne pont pour lui), use_count intact.
--   Cas 5 — NÉGATIF déjà membre : second redeem (autre token) pour un
--           utilisateur déjà membre → pas de doublon household_members, le
--           pont a été purgé : aucune part re-touchée.
--   Cas 6 — NÉGATIF double redemption du même token : second appel → refus
--           'épuisé' (22023), use_count inchangé, pas de seconde adhésion.
--   Cas 7 — NÉGATIF rôle forcé : p_role='enfant' → 22023 recopié de 0145,
--           le rôle attribué reste 'membre'.
--   Cas 8 — NÉGATIF grants bridge : en rôle authenticated,
--           create_household_bridge_token est refusé (42501) — le grant
--           service_role seul de 0180b.
--
-- Rappel AGENTS §2.7-D : assertions non tautologiques, comptages bornés par
-- foyer, types identiques de part et d'autre de testkit.eq. Vu ROUGE avant
-- vert : exécution du fichier contre la base AVANT application de 0181 —
-- les cas 1/2/3 échouent (le redeem effectif 0145 ne convertit rien), le
-- cas 8 prouve la table pont seule.

begin;

do $$
declare
  alice uuid := testkit.auth_user('bridge-alice@example.fr', 'Alice Pont');
  bob uuid := testkit.auth_user('bridge-bob@example.fr', 'Bob Pont');
  gaston uuid := testkit.auth_user('bridge-gaston@example.fr', 'Gaston Pont');
  felix uuid := testkit.auth_user('bridge-felix@example.fr', 'Felix Pont');
  home text := testkit.household(alice, 'Foyer Pont');
begin
  perform testkit.member(home, alice, 'Alice Pont', 'admin', 'accent');
  perform testkit.member(home, bob, 'Bob Pont', 'membre', 'coral');
  -- Felix est DEJA membre du foyer (chemin fusion, cas 3) et inscrit à
  -- l'ardoise avec une part zéro du passé (0070) — simulé par le semis.
  perform testkit.member(home, felix, 'Felix Pont', 'membre', 'amber');
  insert into testkit.fx (key, user_id) values ('alice', alice);
  insert into testkit.fx (key, user_id) values ('bob', bob);
  insert into testkit.fx (key, user_id) values ('gaston', gaston);
  insert into testkit.fx (key, user_id) values ('felix', felix);
  insert into testkit.fx (key, household_id) values ('home', home);
end;
$$;

-- ---------------------------------------------------------------------------
-- Semis : ardoise + membres + guests + dépenses + parts + pont + tokens.
-- Les ids de parts guest sont EXPLICITES et triés : le survivant du
-- dédoublonnage (cas 1, dépense e2) est défini par l'ordre des ids.
-- ---------------------------------------------------------------------------
do $$
declare
  home text;
  alice uuid;
  v_alice_m text;
  v_bob_m text;
  v_felix_m text;
begin
  home := (select household_id from testkit.fx where key = 'home');
  alice := (select user_id from testkit.fx where key = 'alice');
  select m.id into v_alice_m from public.household_members m
   where m.household_id = home and m.user_id = alice;
  select m.id into v_bob_m from public.household_members m
   where m.household_id = home
     and m.user_id = (select user_id from testkit.fx where key = 'bob');
  select m.id into v_felix_m from public.household_members m
   where m.household_id = home
     and m.user_id = (select user_id from testkit.fx where key = 'felix');
  insert into testkit.fx (key, row_id) values ('alice_m', v_alice_m);
  insert into testkit.fx (key, row_id) values ('bob_m', v_bob_m);
  insert into testkit.fx (key, row_id) values ('felix_m', v_felix_m);

  -- Ardoise a1 du foyer + ses membres du foyer.
  insert into public.ardoises (id, household_id, name, created_by)
  values ('ard-pont-1', home, 'Week-end Pont', v_alice_m);
  insert into public.ardoise_members (ardoise_id, member_id)
  values ('ard-pont-1', v_alice_m), ('ard-pont-1', v_bob_m), ('ard-pont-1', v_felix_m);

  -- Guests : g1 et g2 pontés vers gaston, g3 ponté vers felix.
  insert into public.ardoise_guests (id, ardoise_id, display_name, ticket_hash)
  values ('gst-pont-1', 'ard-pont-1', 'Invité Un',   md5('g1') || md5('g1-bis')),
         ('gst-pont-2', 'ard-pont-1', 'Invité Deux', md5('g2') || md5('g2-bis')),
         ('gst-pont-3', 'ard-pont-1', 'Invité Trois', md5('g3') || md5('g3-bis'));

  -- e1 (60) : alice 30 + guest g1 30 — conversion simple (cas 1).
  -- e2 (50) : bob 25 + guest g1 10 + guest g2 15 — dédoublonnage de deux
  --           guests pontés sur la même dépense (cas 1/2, survivant g1).
  -- e3 (20) : felix 0 (part zéro du passé, 0070) + guest g3 20 — fusion
  --           (cas 3) : la part membre est gardée, la guest reportée dessus.
  -- e4 (12) : guest g3 12 seule — conversion dans le chemin already_member.
  insert into public.expenses (id, household_id, ardoise_id, title, amount, paid_by)
  values ('exp-pont-1', home, 'ard-pont-1', 'Courses pont', 60, v_alice_m),
         ('exp-pont-2', home, 'ard-pont-1', 'Taxi pont', 50, v_bob_m),
         ('exp-pont-3', home, 'ard-pont-1', 'Resto pont', 20, v_bob_m),
         ('exp-pont-4', home, 'ard-pont-1', 'Glaces pont', 12, v_bob_m);
  insert into public.expense_participants (id, expense_id, participant_type, member_id, guest_id, share_amount)
  values ('epp-1-alice', 'exp-pont-1', 'membre', v_alice_m, null, 30),
         ('epp-1-g1', 'exp-pont-1', 'guest', null, 'gst-pont-1', 30),
         ('epp-2-bob', 'exp-pont-2', 'membre', v_bob_m, null, 25),
         ('epp-2-g1', 'exp-pont-2', 'guest', null, 'gst-pont-1', 10),
         ('epp-2-g2', 'exp-pont-2', 'guest', null, 'gst-pont-2', 15),
         ('epp-3-felix', 'exp-pont-3', 'membre', v_felix_m, null, 0),
         ('epp-3-g3', 'exp-pont-3', 'guest', null, 'gst-pont-3', 20),
         ('epp-4-g3', 'exp-pont-4', 'guest', null, 'gst-pont-3', 12);

  -- Pont d'identité (ce que 0180b écrit à l'émission bridge).
  insert into private.ardoise_bridge_identities (household_id, ardoise_id, guest_id, user_id)
  values (home, 'ard-pont-1', 'gst-pont-1', (select user_id from testkit.fx where key = 'gaston')),
         (home, 'ard-pont-1', 'gst-pont-2', (select user_id from testkit.fx where key = 'gaston')),
         (home, 'ard-pont-1', 'gst-pont-3', (select user_id from testkit.fx where key = 'felix'));

  -- Tokens foyer : gaston (cas 1/2/5/6), felix (cas 3), gaston 2e (cas 5),
  -- alice (cas 4/7). max_uses=1 comme l'émission bridge 0180b.
  insert into public.household_invite_tokens (household_id, token_hash, created_by, expires_at, max_uses, use_count, is_active)
  values (home, md5('t-gaston') || md5('t-gaston-bis'), null, now() + interval '15 minutes', 1, 0, true),
         (home, md5('t-felix') || md5('t-felix-bis'), null, now() + interval '15 minutes', 1, 0, true),
         (home, md5('t-gaston2') || md5('t-gaston2-bis'), null, now() + interval '15 minutes', 1, 0, true),
         (home, md5('t-alice') || md5('t-alice-bis'), null, now() + interval '15 minutes', 1, 0, true);
  insert into testkit.fx (key, row_id)
  values ('tok_gaston', md5('t-gaston') || md5('t-gaston-bis')),
         ('tok_felix', md5('t-felix') || md5('t-felix-bis')),
         ('tok_gaston2', md5('t-gaston2') || md5('t-gaston2-bis')),
         ('tok_alice', md5('t-alice') || md5('t-alice-bis'));
end;
$$;

-- ---------------------------------------------------------------------------
-- Cas 1 — POSITIF conversion (gaston, premier redeem). L'appel se fait sous
-- service_role (l'appelant Edge légitime) ; les assertions après reset role.
-- ---------------------------------------------------------------------------
do $$
declare
  v_home text;
  v_res jsonb;
  v_state text;
  v_msg text;
  v_tok text;
  v_user uuid;
begin
  v_home := (select household_id from testkit.fx where key = 'home');
  v_tok := (select row_id from testkit.fx where key = 'tok_gaston');
  v_user := (select user_id from testkit.fx where key = 'gaston');
  set local role service_role;
  begin
    v_res := public.redeem_household_invite_token(v_tok, v_user, 'Gaston Reconcilie', null, 'membre');
    v_state := 'AUCUNE_ERREUR';
  exception when others then
    v_state := SQLSTATE;
    v_msg := sqlerrm;
  end;
  reset role;

  perform testkit.eq(v_state, 'AUCUNE_ERREUR'::text,
    'Cas 1 : le redeem avec pont réussit (sinon : ' || coalesce(v_msg, '?') || ')');
  perform testkit.eq(v_res ->> 'already_member', 'false'::text,
    'Cas 1 : gaston adhère (pas already_member)');
end;
$$;

-- Conversion effective : la part guest de g1 sur e1 est devenue une part
-- membre du nouveau membre de gaston, guest_id purgé. Comptage BORNÉ au
-- foyer (rôle postgres : RLS court-circuitée, AGENTS §2.7-D.2).
select testkit.eq(
  testkit.count($t$
    select 1
      from public.expense_participants ep
      join public.expenses e on e.id = ep.expense_id
      join public.household_members m on m.id = ep.member_id
     where e.household_id = (select household_id from testkit.fx where key = 'home')
       and ep.participant_type = 'membre'
       and ep.guest_id is null
       and m.user_id = (select user_id from testkit.fx where key = 'gaston')
       and e.id = 'exp-pont-1'
  $t$),
  1::bigint, 'Cas 1 : la part guest de g1 sur e1 est devenue une part membre de gaston');

-- La part du passé est CONSERVÉE : la somme des parts de e1 vaut toujours
-- le montant (30 alice + 30 convertie). Sinon le trigger différé 0008
-- aurait annulé la transaction.
select testkit.eq(
  testkit.count($t$
    select 1
      from public.expense_participants ep
      join public.expenses e on e.id = ep.expense_id
     where e.household_id = (select household_id from testkit.fx where key = 'home')
       and e.id = 'exp-pont-1'
       and ep.share_amount = 30::numeric
  $t$),
  2::bigint, 'Cas 1 : la part convertie conserve son montant (30) — somme de e1 intacte');

-- ---------------------------------------------------------------------------
-- Cas 2 — POSITIF part zéro du passé NON appliquée au bridge : gaston porte
-- DEUX parts membre issues de la conversion (e1 via g1, e2 via g1 après
-- dédoublonnage avec g2). Un invité ponté ne repart pas de zéro.
-- ---------------------------------------------------------------------------
select testkit.eq(
  testkit.count($t$
    select 1
      from public.expense_participants ep
      join public.expenses e on e.id = ep.expense_id
      join public.household_members m on m.id = ep.member_id
     where e.household_id = (select household_id from testkit.fx where key = 'home')
       and m.user_id = (select user_id from testkit.fx where key = 'gaston')
       and ep.participant_type = 'membre'
  $t$),
  2::bigint, 'Cas 2 : gaston porte les 2 parts converties (e1 + e2) — pas de part zéro du passé');

-- Dédoublonnage de la dépense e2 (g1 10 + g2 15) : le survivant (plus petit
-- id = epp-2-g1) porte 25, l'autre a disparu, la somme de e2 reste 50.
select testkit.eq(
  testkit.count($t$
    select 1
      from public.expense_participants ep
     where ep.expense_id = 'exp-pont-2'
       and ep.participant_type = 'membre'
       and ep.share_amount = 25::numeric
       and ep.guest_id is null
       and exists (select 1 from public.household_members m
                    where m.id = ep.member_id
                      and m.user_id = (select user_id from testkit.fx where key = 'gaston'))
  $t$),
  1::bigint, 'Cas 2 : dédoublonnage e2 — le survivant porte 10+15=25 (somme de e2 intacte)');

-- ---------------------------------------------------------------------------
-- Cas 3 — FUSION doublon (felix, déjà membre avec part zéro sur e3). La part
-- membre est GARDÉE et la part guest (20) est reportée dessus ; la part
-- isolée de g3 sur e4 est convertie normalement.
-- ---------------------------------------------------------------------------
do $$
declare
  v_res jsonb;
  v_state text;
  v_msg text;
  v_tok text;
  v_user uuid;
begin
  v_tok := (select row_id from testkit.fx where key = 'tok_felix');
  v_user := (select user_id from testkit.fx where key = 'felix');
  set local role service_role;
  begin
    v_res := public.redeem_household_invite_token(v_tok, v_user, 'Felix Reconcilie', null, 'membre');
    v_state := 'AUCUNE_ERREUR';
  exception when others then
    v_state := SQLSTATE;
    v_msg := sqlerrm;
  end;
  reset role;

  perform testkit.eq(v_state, 'AUCUNE_ERREUR'::text,
    'Cas 3 : le redeem déjà-membre avec pont réussit (sinon : ' || coalesce(v_msg, '?') || ')');
  perform testkit.eq(v_res ->> 'already_member', 'true'::text,
    'Cas 3 : felix était déjà membre (already_member)');
end;
$$;

select testkit.eq(
  testkit.count($t$
    select 1
      from public.expense_participants ep
     where ep.expense_id = 'exp-pont-3'
       and ep.participant_type = 'membre'
       and ep.member_id = (select row_id from testkit.fx where key = 'felix_m')
  $t$),
  1::bigint, 'Cas 3 : fusion e3 — UNE SEULE part membre pour felix (pas de doublon 23505)');

select testkit.eq(
  testkit.count($t$
    select 1
      from public.expense_participants ep
     where ep.expense_id = 'exp-pont-3'
       and ep.participant_type = 'membre'
       and ep.member_id = (select row_id from testkit.fx where key = 'felix_m')
       and ep.share_amount = 20::numeric
  $t$),
  1::bigint, 'Cas 3 : la part guest (20) a été REPORTÉE sur la part membre de felix (0+20)');

select testkit.eq(
  testkit.count($t$
    select 1
      from public.expense_participants ep
      join public.household_members m on m.id = ep.member_id
     where ep.expense_id = 'exp-pont-3'
       and m.user_id = (select user_id from testkit.fx where key = 'felix')
  $t$),
  1::bigint, 'Cas 3 : la part guest de e3 a disparu (une seule ligne felix)');

-- e4 : la part isolée de g3 est convertie même dans le chemin already_member.
select testkit.eq(
  testkit.count($t$
    select 1
      from public.expense_participants ep
     where ep.expense_id = 'exp-pont-4'
       and ep.participant_type = 'membre'
       and ep.member_id = (select row_id from testkit.fx where key = 'felix_m')
       and ep.share_amount = 12::numeric
  $t$),
  1::bigint, 'Cas 3 : conversion de e4 dans le chemin already_member (part 12 conservée)');

-- ---------------------------------------------------------------------------
-- Cas 4 — NÉGATIF déjà admin (alice) : already_member, pas de seconde ligne,
-- use_count du token intact, aucune conversion (aucune ligne pont pour elle).
-- ---------------------------------------------------------------------------
do $$
declare
  v_res jsonb;
  v_state text;
  v_tok text;
  v_user uuid;
begin
  v_tok := (select row_id from testkit.fx where key = 'tok_alice');
  v_user := (select user_id from testkit.fx where key = 'alice');
  set local role service_role;
  begin
    v_res := public.redeem_household_invite_token(v_tok, v_user, 'Alice Again', null, 'membre');
    v_state := 'AUCUNE_ERREUR';
  exception when others then
    v_state := SQLSTATE;
  end;
  reset role;
  insert into testkit.fx (key, row_id) values ('cas4_res', v_res ->> 'already_member');
  perform testkit.eq(v_state, 'AUCUNE_ERREUR'::text, 'Cas 4 : le redeem déjà-admin réussit');
end;
$$;

select testkit.eq(
  testkit.count($t$
    select 1 from public.household_members m
     where m.household_id = (select household_id from testkit.fx where key = 'home')
       and m.user_id = (select user_id from testkit.fx where key = 'alice')
  $t$),
  1::bigint, 'Cas 4 : alice garde UNE seule ligne household_members');

select testkit.eq(
  testkit.count($t$
    select 1 from public.household_invite_tokens t
     where t.token_hash = (select row_id from testkit.fx where key = 'tok_alice')
       and t.use_count = 0
  $t$),
  1::bigint, 'Cas 4 : use_count du token non incrémenté (idempotence 0145)');

-- ---------------------------------------------------------------------------
-- Cas 5 — NÉGATIF déjà membre, second token (gaston) : pas de doublon, pont
-- purgé au premier redeem → aucune part re-touchée.
-- ---------------------------------------------------------------------------
do $$
declare
  v_res jsonb;
  v_state text;
  v_tok text;
  v_user uuid;
begin
  v_tok := (select row_id from testkit.fx where key = 'tok_gaston2');
  v_user := (select user_id from testkit.fx where key = 'gaston');
  set local role service_role;
  begin
    v_res := public.redeem_household_invite_token(v_tok, v_user, 'Gaston Again', null, 'membre');
    v_state := 'AUCUNE_ERREUR';
  exception when others then
    v_state := SQLSTATE;
  end;
  reset role;
  perform testkit.eq(v_state, 'AUCUNE_ERREUR'::text, 'Cas 5 : le second redeem réussit (idempotent)');
  perform testkit.eq(v_res ->> 'already_member', 'true'::text, 'Cas 5 : already_member');
end;
$$;

select testkit.eq(
  testkit.count($t$
    select 1 from public.household_members m
     where m.household_id = (select household_id from testkit.fx where key = 'home')
       and m.user_id = (select user_id from testkit.fx where key = 'gaston')
  $t$),
  1::bigint, 'Cas 5 : gaston garde UNE seule ligne household_members');

select testkit.eq(
  testkit.count($t$
    select 1 from private.ardoise_bridge_identities bi
     where bi.household_id = (select household_id from testkit.fx where key = 'home')
       and bi.user_id = (select user_id from testkit.fx where key = 'gaston')
  $t$),
  0::bigint, 'Cas 5 : le pont de gaston a été purgé au premier redeem');

select testkit.eq(
  testkit.count($t$
    select 1
      from public.expense_participants ep
      join public.expenses e on e.id = ep.expense_id
      join public.household_members m on m.id = ep.member_id
     where e.household_id = (select household_id from testkit.fx where key = 'home')
       and m.user_id = (select user_id from testkit.fx where key = 'gaston')
       and ep.participant_type = 'membre'
  $t$),
  2::bigint, 'Cas 5 : les parts converties ne sont pas re-touchées (toujours 2)');

-- ---------------------------------------------------------------------------
-- Cas 6 — NÉGATIF double redemption du MÊME token (gaston) : le verrou
-- FOR UPDATE + use_count >= max_uses refuse le second appel (22023 'épuisé').
-- La simultanéité vraie ne tient pas dans une session ; la preuve séquentielle
-- est le refus d'épuisé, la sérialisation venant du FOR UPDATE recopié.
-- ---------------------------------------------------------------------------
do $$
declare
  v_state text;
  v_msg text;
  v_tok text;
  v_user uuid;
begin
  v_tok := (select row_id from testkit.fx where key = 'tok_gaston');
  v_user := (select user_id from testkit.fx where key = 'gaston');
  set local role service_role;
  begin
    perform public.redeem_household_invite_token(v_tok, v_user, 'Gaston Bis', null, 'membre');
    v_state := 'AUCUNE_ERREUR';
  exception when others then
    v_state := SQLSTATE;
    v_msg := sqlerrm;
  end;
  reset role;

  perform testkit.eq(v_state, '22023'::text,
    'Cas 6 : second redeem du même token refusé 22023 (sinon : ' || coalesce(v_msg, '?') || ')');
end;
$$;

select testkit.eq(
  testkit.count($t$
    select 1 from public.household_invite_tokens t
     where t.token_hash = (select row_id from testkit.fx where key = 'tok_gaston')
       and t.use_count = 1
  $t$),
  1::bigint, 'Cas 6 : use_count du token resté à 1 (une seule consommation)');

select testkit.eq(
  testkit.count($t$
    select 1 from public.household_members m
     where m.household_id = (select household_id from testkit.fx where key = 'home')
       and m.user_id = (select user_id from testkit.fx where key = 'gaston')
  $t$),
  1::bigint, 'Cas 6 : toujours UNE seule adhésion pour gaston');

-- ---------------------------------------------------------------------------
-- Cas 7 — NÉGATIF rôle forcé : p_role='enfant' → 22023 (recopié de 0145),
-- avant toute autre écriture ; le rôle attribué reste 'membre'.
-- ---------------------------------------------------------------------------
do $$
declare
  v_state text;
  v_msg text;
  v_tok text;
  v_user uuid;
begin
  v_tok := (select row_id from testkit.fx where key = 'tok_alice');
  v_user := (select user_id from testkit.fx where key = 'alice');
  set local role service_role;
  begin
    perform public.redeem_household_invite_token(v_tok, v_user, 'Alice Enfant?', null, 'enfant');
    v_state := 'AUCUNE_ERREUR';
  exception when others then
    v_state := SQLSTATE;
    v_msg := sqlerrm;
  end;
  reset role;

  perform testkit.eq(v_state, '22023'::text,
    'Cas 7 : p_role=enfant refusé 22023 (sinon : ' || coalesce(v_msg, '?') || ')');
  perform testkit.eq(
    (select m.role from public.household_members m
      where m.household_id = (select household_id from testkit.fx where key = 'home')
        and m.user_id = (select user_id from testkit.fx where key = 'alice')),
    'admin'::text, 'Cas 7 : le rôle d''alice est intact (admin)');
end;
$$;

-- ---------------------------------------------------------------------------
-- Cas 8 — NÉGATIF grants bridge : authenticated n'a pas d'EXECUTE sur
-- create_household_bridge_token (grant service_role seul, 0180b).
-- ---------------------------------------------------------------------------
do $$
declare
  v_state text;
  v_home text;
  v_user uuid;
begin
  v_home := (select household_id from testkit.fx where key = 'home');
  v_user := (select user_id from testkit.fx where key = 'gaston');
  set local role authenticated;
  begin
    perform public.create_household_bridge_token(v_home, md5('pirate') || md5('pirate-bis'), 'ard-pont-1', v_user);
    v_state := 'AUCUNE_ERREUR';
  exception when others then
    v_state := SQLSTATE;
  end;
  reset role;

  perform testkit.eq(v_state, '42501'::text,
    'Cas 8 : authenticated est refusé 42501 sur create_household_bridge_token');
end;
$$;

rollback;
