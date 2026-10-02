-- supabase/tests/0018_ardoises.sql
-- Phase 2 Ardoises : N ardoises indépendantes, invités externes, cycle de vie
-- des codes, settlement par ardoise, RLS inter-ardoise et inter-foyer.
--
-- Marque reconnaissable : suffixe 'aaaa' sur les noms seedés ici.

begin;

do $$
declare
  alice uuid := testkit.auth_user('ard-a-alice@example.fr', 'Alice Aaaa');
  bob uuid := testkit.auth_user('ard-a-bob@example.fr', 'Bob Aaaa');
  carol uuid := testkit.auth_user('ard-b-carol@example.fr', 'Carol Aaaa');

  home_a text := testkit.household(alice, 'Foyer Ard Aaaa');
  home_b text := testkit.household(carol, 'Foyer Ard Baaa');

  alice_m text := testkit.member(home_a, alice, 'Alice Aaaa', 'admin', 'accent');
  bob_m text := testkit.member(home_a, bob, 'Bob Aaaa', 'membre', 'ink');
  carol_m text := testkit.member(home_b, carol, 'Carol Aaaa', 'admin', 'coral');

  ard_coloc text;
  ard_weekend text;
  guest_id text;
  v_ticket text;
  v_hash text;
  v_settlement jsonb;
begin
  -- Deux ardoises du foyer A (seed postgres, RLS contournée).
  insert into public.ardoises (id, household_id, name, created_by)
  values ('ardoise_coloc_aaaa', home_a, 'Coloc Aaaa', alice_m),
         ('ardoise_weekend_aaaa', home_a, 'Week-end Aaaa', alice_m);
  ard_coloc := 'ardoise_coloc_aaaa';
  ard_weekend := 'ardoise_weekend_aaaa';

  -- Bob inscrit à Coloc seulement.
  insert into public.ardoise_members (ardoise_id, member_id)
  values (ard_coloc, alice_m), (ard_coloc, bob_m), (ard_weekend, alice_m);

  -- Dépenses : Coloc 60 € avancés par Alice, parts 30/30 ; Week-end 20 € par Alice, part Alice.
  insert into public.expenses (id, household_id, ardoise_id, title, amount, paid_by, expense_date, split_type)
  values ('expense_coloc_aaaa', home_a, ard_coloc, 'Courses Aaaa', 60.00, alice_m, current_date, 'egal'),
         ('expense_weekend_aaaa', home_a, ard_weekend, 'Essence Aaaa', 20.00, alice_m, current_date, 'egal');
  insert into public.expense_participants (id, expense_id, participant_type, member_id, share_amount)
  values (private.new_id('expense-participant'), 'expense_coloc_aaaa', 'membre', alice_m, 30.00),
         (private.new_id('expense-participant'), 'expense_coloc_aaaa', 'membre', bob_m, 30.00),
         (private.new_id('expense-participant'), 'expense_weekend_aaaa', 'membre', alice_m, 20.00);

  -- 1. Soldes indépendants, somme nulle par ardoise.
  perform testkit.eq(
    (select round(sum(balance), 2) from private.ardoise_balances(ard_coloc)), 0.00::numeric,
    'somme nulle sur Coloc');
  perform testkit.eq(
    (select balance from private.ardoise_balances(ard_coloc) where participant_id = alice_m), 30.00::numeric,
    'Alice +30 sur Coloc (60 avancés, 30 de parts)');
  perform testkit.eq(
    (select balance from private.ardoise_balances(ard_coloc) where participant_id = bob_m), (-30.00)::numeric,
    'Bob -30 sur Coloc');
  perform testkit.eq(
    (select count(*) from private.simplify_ardoise_debts(ard_coloc)), 1::bigint,
    'un seul transfert sur Coloc');
  perform testkit.eq(
    (select round(sum(balance), 2) from private.ardoise_balances(ard_weekend)), 0.00::numeric,
    'somme nulle sur Week-end');

  -- 2. RLS inter-ardoise : Bob (non inscrit à Week-end) ne voit rien de Week-end.
  perform testkit.as_user(bob, 'ard-a-bob@example.fr');
  set local role authenticated;
  perform testkit.eq(
    testkit.count('select 1 from public.expenses where ardoise_id = ''ardoise_weekend_aaaa'''),
    0::bigint, 'non-inscrit ne lit pas les dépenses de l''autre ardoise');
  perform testkit.eq(
    testkit.count('select 1 from public.expenses where ardoise_id = ''ardoise_coloc_aaaa'''),
    1::bigint, 'inscrit lit les dépenses de son ardoise');
  reset role;

  -- 3. RLS inter-foyer : Carol ne voit aucune ardoise de A.
  perform testkit.as_user(carol, 'ard-b-carol@example.fr');
  set local role authenticated;
  perform testkit.eq(
    testkit.count('select 1 from public.ardoises where household_id = ''' || home_a || ''''),
    0::bigint, 'foyer B ne lit aucune ardoise de A');
  reset role;

  -- 4. Invités : inscription via code, part + payeur invité, settlement inclus.
  perform testkit.eq(
    (public.create_ardoise_invite(alice, ard_coloc, repeat('a', 64), null, 10) ->> 'ardoise_id'),
    ard_coloc, 'création du code par l''admin');
  perform testkit.ok(
    (public.ardoise_invite_summary(alice, ard_coloc) ->> 'has_code')::boolean,
    'résumé sans empreinte, code présent');
  perform testkit.eq(
    (public.ardoise_invite_summary(alice, ard_coloc) ->> 'use_count'), '0',
    'compteur à zéro');

  -- Membre déjà inscrit : idempotent, sans ticket, sans consommation.
  perform testkit.eq(
    (public.redeem_ardoise_invite(repeat('a', 64), bob, null) ->> 'already_member'), 'true',
    'membre connu : idempotent');
  perform testkit.eq(
    (public.ardoise_invite_summary(alice, ard_coloc) ->> 'use_count'), '0',
    'idempotent ne consomme pas');

  -- Invité externe Gino : ticket rendu une seule fois.
  v_ticket := public.redeem_ardoise_invite(repeat('a', 64), null, 'Gino Aaaa') ->> 'guest_ticket';
  perform testkit.ok(v_ticket is not null and length(v_ticket) > 20, 'ticket brut rendu');
  v_hash := encode(extensions.digest(v_ticket, 'sha256'), 'hex');
  select g.id into guest_id from public.ardoise_guests g where g.ticket_hash = v_hash;
  perform testkit.ok(guest_id is not null, 'seul le HMAC est stocké, retrouvable');
  perform testkit.eq(
    (public.verify_ardoise_ticket(v_hash) ->> 'guest_id'), guest_id,
    'ticket vérifiable côté serveur');
  perform testkit.eq(
    (public.ardoise_invite_summary(alice, ard_coloc) ->> 'use_count'), '1',
    'invité consomme une utilisation');

  -- Dépense payée par l'invité, partagée avec Alice : Gino +20, Alice -20 sur Coloc.
  insert into public.expenses (id, household_id, ardoise_id, title, amount, paid_by, paid_by_guest, expense_date, split_type)
  values ('expense_gino_aaaa', home_a, ard_coloc, 'Apéro Aaaa', 20.00, null, guest_id, current_date, 'egal');
  insert into public.expense_participants (id, expense_id, participant_type, member_id, guest_id, share_amount)
  values (private.new_id('expense-participant'), 'expense_gino_aaaa', 'guest', null, guest_id, 10.00),
         (private.new_id('expense-participant'), 'expense_gino_aaaa', 'membre', alice_m, null, 10.00);
  perform testkit.eq(
    (select balance from private.ardoise_balances(ard_coloc) where participant_id = guest_id), 10.00::numeric,
    'Gino +10 (20 avancés, 10 de parts)');
  perform testkit.eq(
    (select round(sum(balance), 2) from private.ardoise_balances(ard_coloc)), 0.00::numeric,
    'somme toujours nulle avec invité');

  -- 5. Périmètre : part d'une autre ardoise refusée 23514, payeur sans payeur 22023.
  begin
    insert into public.expense_participants (id, expense_id, participant_type, member_id, share_amount)
    values (private.new_id('expense-participant'), 'expense_coloc_aaaa', 'membre', carol_m, 5.00);
    perform testkit.ok(false, 'part hors ardoise aurait dû lever 23514');
  exception when check_violation then
    perform testkit.ok(true, 'part hors ardoise refusée 23514');
  end;
  begin
    insert into public.expenses (id, household_id, ardoise_id, title, amount, paid_by, paid_by_guest, expense_date, split_type)
    values (private.new_id('expense'), home_a, ard_coloc, 'Sans payeur Aaaa', 5.00, null, null, current_date, 'egal');
    perform testkit.ok(false, 'sans payeur aurait dû lever une erreur');
  exception when others then
    perform testkit.ok(true, 'sans payeur refusé');
  end;

  -- 6. Révocation : le code ne passe plus, l'historique reste soldable.
  perform public.revoke_ardoise_invite(alice, ard_coloc);
  begin
    perform public.redeem_ardoise_invite(repeat('a', 64), null, 'Hugo Aaaa');
    perform testkit.ok(false, 'code révoqué aurait dû être refusé');
  exception when others then
    perform testkit.ok(sqlerrm like '%code invalide%', 'code révoqué refusé sans oracle : ' || sqlerrm);
  end;
  perform testkit.eq(
    (select round(sum(balance), 2) from private.ardoise_balances(ard_coloc)), 0.00::numeric,
    'historique intact et soldable après arrêt du partage');

  -- 7. Pont serveur : non-inscrit refusé 42501, inscrit servi.
  begin
    perform public.ardoise_settlement(carol, ard_coloc);
    perform testkit.ok(false, 'settlement hors ardoise aurait dû être refusé');
  exception when insufficient_privilege then
    perform testkit.ok(true, 'settlement hors ardoise refusé 42501');
  end;
  v_settlement := public.ardoise_settlement(bob, ard_coloc);
  perform testkit.eq(v_settlement ->> 'ardoise_id', ard_coloc, 'settlement servi à l''inscrit');
  perform testkit.eq(v_settlement ->> 'household_id', home_a, 'settlement porte le foyer');
end;
$$;

rollback;
