-- supabase/tests/0023_household_delete.sql
-- Suppression d'un foyer par RPC serveur (migration 0074) : administrateur
-- requis, dépenses d'abord (paid_by restrict), cascades ensuite, autre foyer
-- et profils intacts, appel direct refusé.
--
-- Méthode : les refus client passent en `authenticated` (comme PostgREST),
-- les appels serveur en propriétaire (EXECUTE réservé à service_role).

begin;

-- Fixtures en propriétaire : trois comptes, deux foyers, une dépense payée
-- par l'admin (le cas qui casserait un DELETE naïf : paid_by restrict).
do $$
declare
  alice uuid := testkit.auth_user('del-alice@example.fr', 'Alice Martin');
  bob uuid := testkit.auth_user('del-bob@example.fr', 'Bob Martin');
  outsider uuid := testkit.auth_user('del-outsider@example.fr', 'Olivier Fantome');
  home_a text := testkit.household(alice, 'Foyer Supprimé');
  home_b text := testkit.household(bob, 'Foyer Survivant');
  alice_m text;
  bob_m text;
  carol_m text;
begin
  alice_m := testkit.member(home_a, alice, 'Alice Martin', 'admin', 'accent');
  bob_m := testkit.member(home_a, bob, 'Bob Martin', 'membre', 'ink');
  carol_m := testkit.member(home_b, bob, 'Bob Martin', 'admin', 'accent');
  insert into testkit.fx (key, user_id) values
    ('alice', alice), ('bob', bob), ('outsider', outsider);
  insert into testkit.fx (key, household_id) values ('home_a', home_a), ('home_b', home_b);
  insert into testkit.fx (key, row_id) values
    ('alice_m', alice_m), ('bob_m', bob_m), ('carol_m', carol_m);

  insert into public.ardoises (id, household_id, name, created_by)
  values ('ardoise_del', home_a, 'Foyer Supprimé', alice_m);
  insert into public.ardoise_members (ardoise_id, member_id)
  values ('ardoise_del', alice_m), ('ardoise_del', bob_m);
  insert into public.expenses (id, household_id, ardoise_id, title, amount, paid_by, expense_date, split_type)
  values ('expense_del', home_a, 'ardoise_del', 'Courses', 42.50, alice_m, current_date, 'egal');
  insert into public.expense_participants (id, expense_id, participant_type, member_id, share_amount)
  values (private.new_id('expense-participant'), 'expense_del', 'membre', alice_m, 21.25),
         (private.new_id('expense-participant'), 'expense_del', 'membre', bob_m, 21.25);
  insert into public.household_invite_tokens (household_id, token_hash, created_by, max_uses)
  values (home_a, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', alice, 10);
end;
$$;

-- ===========================================================================
-- 1. Un client ne peut pas appeler la suppression directement
-- ===========================================================================
select testkit.as_user(user_id, 'del-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.expect_denied(format(
  'select public.delete_household(%L, %L)',
  (select user_id from testkit.fx where key = 'alice'),
  (select household_id from testkit.fx where key = 'home_a')),
  'la suppression directe est refusée même à une admin');

reset role;

-- ===========================================================================
-- 2. Acteur non autorisé : membre simple, extérieur, sans session, inconnu
-- ===========================================================================
do $$
declare
  v_bob uuid;
  v_outsider uuid;
  v_home_a text;
begin
  select user_id into v_bob from testkit.fx where key = 'bob';
  select user_id into v_outsider from testkit.fx where key = 'outsider';
  select household_id into v_home_a from testkit.fx where key = 'home_a';

  begin
    perform public.delete_household(v_bob, v_home_a);
    perform testkit.ok(false, 'un membre simple ne doit pas supprimer le foyer');
  exception when others then
    perform testkit.ok(sqlerrm like '%réservée aux administrateurs%', 'le refus dit le rôle : ' || sqlerrm);
  end;

  begin
    perform public.delete_household(v_outsider, v_home_a);
    perform testkit.ok(false, 'un extérieur ne doit pas supprimer le foyer');
  exception when others then
    perform testkit.ok(sqlerrm like '%réservée aux administrateurs%', 'le refus dit le rôle : ' || sqlerrm);
  end;

  begin
    perform public.delete_household(null, v_home_a);
    perform testkit.ok(false, 'sans session, pas de suppression');
  exception when others then
    perform testkit.ok(sqlerrm like '%session requise%', 'le refus dit la session : ' || sqlerrm);
  end;

  begin
    perform public.delete_household(v_bob, 'household_introuvable');
    perform testkit.ok(false, 'un foyer inexistant doit être refusé');
  exception when others then
    perform testkit.ok(sqlerrm like '%foyer introuvable%', 'le refus dit l''absence : ' || sqlerrm);
  end;

  perform testkit.eq(
    (select count(*) from public.households where id = v_home_a),
    1::bigint,
    'les refus ne suppriment rien');
end;
$$;

-- ===========================================================================
-- 3. L'administratrice supprime : tout le foyer part, le reste demeure
-- ===========================================================================
do $$
declare
  v_alice uuid;
  v_home_a text;
  v_home_b text;
  v_result jsonb;
begin
  select user_id into v_alice from testkit.fx where key = 'alice';
  select household_id into v_home_a from testkit.fx where key = 'home_a';
  select household_id into v_home_b from testkit.fx where key = 'home_b';

  v_result := public.delete_household(v_alice, v_home_a);
  perform testkit.eq(v_result ->> 'household_id', v_home_a, 'la réponse porte le foyer supprimé');
  perform testkit.eq((v_result ->> 'expenses')::int, 1, 'la réponse compte la dépense effacée');

  perform testkit.eq(
    (select count(*) from public.households where id = v_home_a),
    0::bigint,
    'le foyer est parti');
  perform testkit.eq(
    (select count(*) from public.household_members where household_id = v_home_a),
    0::bigint,
    'les membres sont partis');
  perform testkit.eq(
    (select count(*) from public.expenses where household_id = v_home_a),
    0::bigint,
    'les dépenses sont parties malgré paid_by restrict');
  perform testkit.eq(
    (select count(*) from public.expense_participants where expense_id = 'expense_del'),
    0::bigint,
    'les parts sont parties en cascade');
  perform testkit.eq(
    (select count(*) from public.household_invite_tokens where household_id = v_home_a),
    0::bigint,
    'les tokens sont partis');

  perform testkit.eq(
    (select count(*) from public.households where id = v_home_b),
    1::bigint,
    'l''autre foyer survit');
  perform testkit.eq(
    (select count(*) from public.household_members where household_id = v_home_b),
    1::bigint,
    'ses membres survivent');
  perform testkit.eq(
    (select count(*) from public.profiles where id in (v_alice, (select user_id from testkit.fx where key = 'bob'))),
    2::bigint,
    'les profils survivent (compte ≠ foyer)');

  -- Seconde suppression : introuvable, pas silencieuse.
  begin
    perform public.delete_household(v_alice, v_home_a);
    perform testkit.ok(false, 'supprimer deux fois doit être refusé');
  exception when others then
    perform testkit.ok(sqlerrm like '%foyer introuvable%', 'le refus dit l''absence : ' || sqlerrm);
  end;
end;
$$;

rollback;
