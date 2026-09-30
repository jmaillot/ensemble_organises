-- supabase/tests/0010_member_role.sql
-- Changement de rôle par RPC (migration 0036) : administrateur requis, dernier
-- administrateur protégé, acteur extérieur et anonyme refusés.
--
-- Méthode : les appels RPC passent en `authenticated` (comme PostgREST), les
-- privilèges se vérifient sans rôle (comme 0001 §7).

begin;

-- Fixtures en propriétaire : deux comptes, un foyer, deux membres.
do $$
declare
  alice uuid := testkit.auth_user('role-alice@example.fr', 'Alice Martin');
  bob uuid := testkit.auth_user('role-bob@example.fr', 'Bob Martin');
  outsider uuid := testkit.auth_user('role-outsider@example.fr', 'Olivier Fantome');
  home text := testkit.household(alice, 'Foyer Rôles');
begin
  insert into testkit.fx (key, user_id) values
    ('alice', alice), ('bob', bob), ('outsider', outsider);
  insert into testkit.fx (key, household_id) values ('home', home);
  insert into testkit.fx (key, row_id) values
    ('alice_m', testkit.member(home, alice, 'Alice Martin', 'admin', 'accent')),
    ('bob_m', testkit.member(home, bob, 'Bob Martin', 'membre', 'ink'));
end;
$$;

-- Actes en `authenticated`, comme PostgREST les exécuterait.
select testkit.as_user(user_id, 'role-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

do $$
declare
  bob_m text;
  v_result jsonb;
begin
  select row_id into bob_m from testkit.fx where key = 'bob_m';

  -- Promotion : membre -> admin, par l'administratrice.
  v_result := public.set_member_role(bob_m, 'admin');
  perform testkit.eq(v_result ->> 'role', 'admin', 'la réponse porte le rôle attribué');

  -- Rétrogradation croisée : à deux admins, chacun peut rétrograder l'autre.
  v_result := public.set_member_role(bob_m, 'membre');
  perform testkit.eq(v_result ->> 'role', 'membre', 'la rétrogradation à deux admins passe');

  -- Rôle hors enum : refusé avant toute écriture.
  begin
    perform public.set_member_role(bob_m, 'superadmin');
    perform testkit.ok(false, 'un rôle hors enum doit être refusé');
  exception when others then
    perform testkit.ok(sqlerrm like '%rôle invalide%', 'le refus dit le rôle : ' || sqlerrm);
  end;

  -- Membre inexistant : introuvable, pas silencieux.
  begin
    perform public.set_member_role('member_introuvable', 'admin');
    perform testkit.ok(false, 'un membre inexistant doit être refusé');
  exception when others then
    perform testkit.ok(sqlerrm like '%introuvable%', 'le refus dit l''absence : ' || sqlerrm);
  end;

  -- Dernier administrateur : Alice, seule admin, ne peut pas être rétrogradée.
  begin
    perform public.set_member_role(
      (select row_id from testkit.fx where key = 'alice_m'), 'membre');
    perform testkit.ok(false, 'le dernier admin ne doit pas être rétrogradé');
  exception when others then
    perform testkit.ok(sqlerrm like '%dernier administrateur%', 'le refus dit le dernier admin : ' || sqlerrm);
  end;
end;
$$;

-- Acteur extérieur : ni promotion ni rétrogradation dans un foyer tiers.
select testkit.as_user(user_id, 'role-outsider@example.fr') from testkit.fx where key = 'outsider';

do $$
declare
  bob_m text;
begin
  select row_id into bob_m from testkit.fx where key = 'bob_m';

  begin
    perform public.set_member_role(bob_m, 'admin');
    perform testkit.ok(false, 'un extérieur ne promeut pas dans le foyer');
  exception when others then
    perform testkit.ok(sqlerrm like '%administrateurs%', 'le refus dit le rôle requis : ' || sqlerrm);
  end;
end;
$$;

reset role;

-- Le rôle de Bob est resté `membre` : les trois refus n'ont rien écrit.
do $$
declare
  home text;
  bob_m text;
begin
  select household_id into home from testkit.fx where key = 'home';
  select row_id into bob_m from testkit.fx where key = 'bob_m';

  perform testkit.eq(
    (select m.role from public.household_members m where m.id = bob_m), 'membre',
    'les refus n''ont modifié aucun rôle');
  perform testkit.eq(
    private.household_admin_count(home), 1,
    'le foyer a toujours exactement un administrateur');

  -- Privilèges d'exécution, sans changement de rôle (comme 0001 §7).
  perform testkit.eq(
    has_function_privilege('anon', 'public.set_member_role(text, text)', 'EXECUTE')::text, 'false',
    'anon ne doit pas pouvoir changer un rôle par RPC');
  perform testkit.eq(
    has_function_privilege('authenticated', 'public.set_member_role(text, text)', 'EXECUTE')::text, 'true',
    'authenticated doit pouvoir changer un rôle par RPC');
end;
$$;

rollback;
