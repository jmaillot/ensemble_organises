-- supabase/tests/0005_ardoise.sql
-- Ardoise : intégrité de la répartition et compensation des dettes.
--
-- Foyer Martin : Alice a avancé 60 € pour trois parts égales, Bob 30 € pour une
-- part de 10 € et Lina n'a rien dépensé. Attendu : Alice est créancière de
-- 40 €, Bob débiteur de 20 €, Lina débiteur de 20 € → deux transferts.

begin;

do $$
declare
  alice uuid := testkit.auth_user('alice@example.fr', 'Alice Martin');
  bob uuid := testkit.auth_user('bob@example.fr', 'Bob Martin');
  lina uuid := testkit.auth_user('lina@example.fr', 'Lina Leroy');

  home text := testkit.household(alice, 'Foyer Martin');
  alice_m text := testkit.member(home, alice, 'Alice Martin', 'admin', 'accent');
  bob_m text := testkit.member(home, bob, 'Bob Martin', 'membre', 'ink');
  lina_m text := testkit.member(home, lina, 'Lina Leroy', 'membre', 'coral');

  grocery text := private.new_id('expense');
  cinema text := private.new_id('expense');
begin
  insert into public.expenses (id, household_id, title, amount, paid_by, expense_date, split_type)
  values
    (grocery, home, 'Courses du samedi', 60.00, alice_m, current_date, 'egal'),
    (cinema, home, 'Cinéma', 30.00, lina_m, current_date, 'personnalise');

  insert into public.expense_participants (id, expense_id, participant_type, member_id, share_amount)
  values
    (private.new_id('expense-participant'), grocery, 'membre', alice_m, 20.00),
    (private.new_id('expense-participant'), grocery, 'membre', bob_m, 20.00),
    (private.new_id('expense-participant'), grocery, 'membre', lina_m, 20.00),
    (private.new_id('expense-participant'), cinema, 'membre', bob_m, 10.00),
    (private.new_id('expense-participant'), cinema, 'membre', lina_m, 20.00);

  -- --- Soldes ---------------------------------------------------------------
  -- Arithmétique du scénario, vérifiée à la main :
  --   Courses 60 € payés par Alice, parts 20/20/20 → elle a avancé 60, doit 20.
  --   Cinéma  30 € payés par Lina,  parts 10/20     → elle a avancé 30, doit 40.
  --   Bob n'a rien payé et doit 20 (courses) + 10 (cinéma) = 30.
  -- Soldes : Alice +40, Bob -30, Lina -10 ; somme nulle.
  --
  -- Le payeur du cinéma est Lina et non Bob pour que personne ne soit à zéro :
  -- un solde nul est écarté par `simplify_household_debts` (tolérance 0,005) et
  -- la compensation n'aurait alors produit qu'un seul transfert, sans exercer
  -- le glissement des deux plus grands soldes que la fonction annonce.
  perform testkit.eq(
    (select balance from private.household_balances(home) where member_id = alice_m), 40.00::numeric,
    'Alice a avancé 60 € pour 20 € de part : crédit de 40 €');
  perform testkit.eq(
    (select balance from private.household_balances(home) where member_id = bob_m), (-30.00)::numeric,
    'Bob n''a rien payé et doit 30 € : débit de 30 €');
  perform testkit.eq(
    (select balance from private.household_balances(home) where member_id = lina_m), (-10.00)::numeric,
    'Lina a avancé 30 € pour 40 € de parts : débit de 10 €');

  -- La somme des soldes est nulle : l'argent n'est ni créé ni détruit.
  perform testkit.eq(
    (select sum(balance) from private.household_balances(home)), 0::numeric,
    'la somme des soldes du foyer vaut zéro');

  -- --- Compensation --------------------------------------------------------
  perform testkit.eq(
    (select count(*) from private.simplify_household_debts(home)), 2::bigint,
    'deux transferts suffisent à solder un foyer à trois membres dont aucun '
    'solde n''est nul');
  perform testkit.eq(
    (select sum(amount) from private.simplify_household_debts(home) where creditor_id = alice_m), 40.00::numeric,
    'Alice reçoit au total 40 €');
  perform testkit.ok(
    not exists (
      select 1 from private.simplify_household_debts(home)
       where debtor_id = creditor_id
    ),
    'aucun transfert à soi-même');
  perform testkit.ok(
    not exists (
      select 1 from private.simplify_household_debts(home) where amount <= 0
    ),
    'aucun transfert de montant nul ou négatif');

  -- --- Intégrité de la répartition ----------------------------------------
  -- La somme des parts ne peut pas dépasser le montant de la dépense.
  -- La contrainte est DEFERRABLE : l'évaluation est forcée au commit.
  perform testkit.expect_denied_at_commit(format(
    'insert into public.expense_participants (id, expense_id, participant_type, member_id, share_amount)'
    ' values (%L, %L, ''membre'', %L, 5.00)',
    private.new_id('expense-participant'), cinema, lina_m));

  -- Un participant externe doit être rattaché au même foyer.
  perform testkit.expect_denied(format(
    'insert into public.expense_participants (id, expense_id, participant_type, external_participant_id, share_amount)'
    ' values (%L, %L, ''externe'', %L, 10.00)',
    private.new_id('expense-participant'), cinema, private.new_id('external')),
    'un participant externe doit exister dans le foyer de la dépense');

  -- Un membre ne peut pas être à la fois `membre` et `externe`.
  perform testkit.expect_denied(format(
    'insert into public.expense_participants (id, expense_id, participant_type, member_id, external_participant_id, share_amount)'
    ' values (%L, %L, ''membre'', %L, %L, 10.00)',
    private.new_id('expense-participant'), cinema, lina_m, private.new_id('external')),
    'les deux références ne peuvent pas être renseignées ensemble');

  -- Aucun solde ne doit être orphelin.
  perform testkit.eq(
    (select count(*) from private.household_balances(home) where member_id is null), 0::bigint,
    'tous les soldes sont rattachés à un membre');
end;
$$;

-- Une dépense sans répartition est imputée en totalité à son payeur.
do $$
declare
  carol uuid := testkit.auth_user('carol@example.fr', 'Carol Durand');
  dave uuid := testkit.auth_user('dave@example.fr', 'Dave Durand');
  home text := testkit.household(carol, 'Foyer Carol');
  carol_m text := testkit.member(home, carol, 'Carol Durand', 'admin', 'coral');
  dave_m text := testkit.member(home, dave, 'Dave Durand', 'membre', 'violet');
begin
  insert into public.expenses (id, household_id, title, amount, paid_by, expense_date)
  values (private.new_id('expense'), home, 'Casse', 50.00, carol_m, current_date);

  perform testkit.eq(
    (select balance from private.household_balances(home) where member_id = carol_m), 0::numeric,
    'une dépense sans parts ne crée aucune dette');
  perform testkit.eq(
    (select count(*) from private.simplify_household_debts(home)), 0::bigint,
    'aucun transfert n’est proposé');
end;
$$;

-- ---------------------------------------------------------------------------
-- Pont serveur : `public.expense_settlement()` (migration 0013)
--
-- C'est le seul point d'entrée de l'algorithme côté client, via l'Edge Function
-- `expense-settlement`. Le contrat de réponse y est figé.
-- ---------------------------------------------------------------------------
do $$
declare
  -- Emails distincts des blocs précédents : `auth.users` peut porter une
  -- contrainte d'unicité sur l'adresse.
  alice uuid := testkit.auth_user('pont-alice@example.fr', 'Alice Martin');
  bob uuid := testkit.auth_user('pont-bob@example.fr', 'Bob Martin');
  outsider uuid := testkit.auth_user('outsider@example.fr', 'Olivier Fantome');
  home text := testkit.household(alice, 'Foyer Pont');
  alice_m text := testkit.member(home, alice, 'Alice Martin', 'admin', 'accent');
  bob_m text := testkit.member(home, bob, 'Bob Martin', 'membre', 'ink');
  grocery text := private.new_id('expense');
  v_result jsonb;
  v_rows record;
begin
  insert into public.expenses (id, household_id, title, amount, paid_by, expense_date, split_type)
  values (grocery, home, 'Courses', 60.00, alice_m, current_date, 'egal');

  insert into public.expense_participants (id, expense_id, participant_type, member_id, share_amount)
  values
    (private.new_id('expense-participant'), grocery, 'membre', alice_m, 40.00),
    (private.new_id('expense-participant'), grocery, 'membre', bob_m, 20.00);

  v_result := public.expense_settlement(alice, home);

  perform testkit.eq(v_result ->> 'household_id', home, 'la réponse porte le foyer demandé');
  perform testkit.ok(v_result ? 'generated_at', 'la réponse est horodatée');
  perform testkit.eq(
    jsonb_array_length(v_result -> 'balances'), 2,
    'un solde par membre du foyer'
  );
  perform testkit.eq(
    (select sum((b ->> 'amount')::numeric) from jsonb_array_elements(v_result -> 'balances') b),
    0::numeric,
    'la somme des soldes renvoyés vaut zéro'
  );
  perform testkit.eq(
    jsonb_array_length(v_result -> 'settlements'), 1,
    'un seul transfert suffit entre deux membres'
  );

  select s ->> 'from_member_id' as from_id,
         s ->> 'to_member_id' as to_id,
         (s ->> 'amount')::numeric as amount
    into v_rows
    from jsonb_array_elements(v_result -> 'settlements') s;

  perform testkit.eq(v_rows.from_id, bob_m, 'le débiteur est celui qui doit au foyer');
  perform testkit.eq(v_rows.to_id, alice_m, 'le créancier est celui que le foyer doit');
  perform testkit.eq(v_rows.amount, 20.00::numeric, 'le montant du transfert est exact');

  -- Un acteur qui n'est pas membre du foyer est refusé, même par la base.
  perform testkit.expect_denied(format(
    'select public.expense_settlement(%L::uuid, %L)', outsider, home));
  perform testkit.expect_denied(format(
    'select public.expense_settlement(null::uuid, %L)', home));
  perform testkit.expect_denied(format(
    'select public.expense_settlement(%L::uuid, null::text)', alice));
end;
$$;

-- Le pont n'est pas appelable par un client : c'est l'Edge Function qui l'est.
do $$
declare
  r text;
  v_functions text[] := array[
    'public.expense_settlement(uuid,text)',
    'public.routine_maintenance(uuid,text)',
    'private.assert_household_member(text,uuid)'
  ];
begin
  foreach r in array v_functions loop
    perform testkit.eq(
      has_function_privilege('authenticated', r, 'EXECUTE')::text, 'false',
      'authenticated ne doit pas pouvoir exécuter ' || r
    );
    perform testkit.eq(
      has_function_privilege('anon', r, 'EXECUTE')::text, 'false',
      'anon ne doit pas pouvoir exécuter ' || r
    );
    perform testkit.eq(
      has_function_privilege('service_role', r, 'EXECUTE')::text, 'true',
      'service_role doit pouvoir exécuter ' || r
    );
  end loop;
end;
$$;

rollback;
