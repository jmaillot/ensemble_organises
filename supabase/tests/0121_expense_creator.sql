-- supabase/tests/0121_expense_creator.sql
-- Fiche voyage (0121) : `expenses.created_by` retient le créateur —
-- l'onglet Budget propose « Modifier » à l'admin et au créateur.
-- `update_expense` ne touche jamais au créateur ; les lignes héritées
-- (sans créateur) restent admin-seules côté client.
--
-- Bornes (AGENTS.md §2.7D) : comptages bornés à l'ardoise via testkit.fx.
-- Rôle `postgres` pour les fixtures, `authenticated` + testkit.as_user
-- pour les appels RPC (motif 0009). Fichier autonome, `rollback` final.

begin;

do $$
declare
  alice uuid := testkit.auth_user('t21-alice@example.fr', 'Alice Créatrice');
  bob uuid := testkit.auth_user('t21-bob@example.fr', 'Bob Voyage');
  home text := testkit.household(alice, 'Foyer Créateur');
  alice_m text;
  bob_m text;
begin
  alice_m := testkit.member(home, alice, 'Alice Créatrice', 'admin', 'accent');
  bob_m := testkit.member(home, bob, 'Bob Voyage', 'membre', 'ink');
  insert into testkit.fx (key, user_id) values ('alice', alice), ('bob', bob);
  insert into testkit.fx (key, household_id) values ('home', home);
  insert into testkit.fx (key, row_id) values ('alice_m', alice_m), ('bob_m', bob_m);

  insert into public.ardoises (id, household_id, name, created_by)
  values ('ardoise_createur', home, 'Foyer Créateur', alice_m);
  insert into public.ardoise_members (ardoise_id, member_id)
  values ('ardoise_createur', alice_m), ('ardoise_createur', bob_m);
  insert into testkit.fx (key, row_id) values ('ardoise', 'ardoise_createur');

  -- Ligne héritée : sans créateur, NULL admis.
  insert into public.expenses (id, household_id, ardoise_id, title, amount, paid_by, expense_date, split_type)
  values ('expense_heritage', home, 'ardoise_createur', 'Héritage', 10.00, alice_m, current_date, 'egal');
  insert into testkit.fx (key, row_id) values ('heritage', 'expense_heritage');
end;
$$;

-- Appels RPC en `authenticated`, comme PostgREST les exécuterait.
select testkit.as_user(user_id, 't21-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

do $$
declare
  home text;
  alice_m text;
  bob_m text;
  v_result jsonb;
  v_depense text;
begin
  select household_id into home from testkit.fx where key = 'home';
  select row_id into alice_m from testkit.fx where key = 'alice_m';
  select row_id into bob_m from testkit.fx where key = 'bob_m';

  -- Création par Bob : le créateur est résolu en base, jamais fourni.
  v_result := public.create_expense(home, 'ardoise_createur', 'Pique-nique', 24.00, bob_m, null, current_date, 'egal',
    jsonb_build_array(
      jsonb_build_object('participant_type', 'membre', 'member_id', bob_m, 'share_amount', 12),
      jsonb_build_object('participant_type', 'membre', 'member_id', alice_m, 'share_amount', 12)));
  v_depense := v_result ->> 'id';
  perform testkit.eq(v_result ->> 'created_by', bob_m, 'la création retient le créateur (résolu en base)');

  -- Modification : nouveau montant, créateur inchangé.
  v_result := public.update_expense(v_depense, 'Pique-nique copieux', 30.00, bob_m, null, current_date, 'egal',
    jsonb_build_array(
      jsonb_build_object('participant_type', 'membre', 'member_id', bob_m, 'share_amount', 15),
      jsonb_build_object('participant_type', 'membre', 'member_id', alice_m, 'share_amount', 15)));
  perform testkit.eq(v_result ->> 'created_by', bob_m, 'la modification ne touche pas au créateur');
end;
$$;

reset role;

-- Ligne héritée : créateur NULL, colonne admise sans valeur.
select testkit.eq(
  (select created_by from public.expenses where id = 'expense_heritage'),
  null::text,
  'les lignes héritées restent sans créateur');

rollback;
