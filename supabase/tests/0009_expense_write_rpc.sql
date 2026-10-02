-- supabase/tests/0009_expense_write_rpc.sql
-- RPC d'écriture de l'Ardoise (migration 0035) : dépense + parts en UNE
-- transaction, appelables par un membre connecté.
--
-- Reproduit le défaut constaté en usage le 30/09/2026 : 30 € partagés en deux
-- parts de 15 € via N appels PostgREST échouaient à la deuxième part
-- (« la somme des parts (15.00)… », 23514), le contrôle différé étant vérifié
-- au COMMIT de chaque transaction. Seules les dépenses à part unique
-- passaient, ce qui a masqué le défaut jusqu'au premier partage réel.
--
-- Méthode : les appels RPC passent en `authenticated` (comme PostgREST), les
-- assertions de soldes en propriétaire (les fonctions privées de calcul ne
-- sont pas exécutables par un client, cf. 0009). Les identifiants transitent
-- par `testkit.fx`, lisible des deux rôles.

begin;

-- Fixtures en propriétaire : trois comptes, un foyer, deux membres.
do $$
declare
  alice uuid := testkit.auth_user('rpc-alice@example.fr', 'Alice Martin');
  bob uuid := testkit.auth_user('rpc-bob@example.fr', 'Bob Martin');
  kid uuid := testkit.auth_user('rpc-kid@example.fr', 'Noé Martin');
  outsider uuid := testkit.auth_user('rpc-outsider@example.fr', 'Olivier Fantome');
  home text := testkit.household(alice, 'Foyer RPC');
  alice_m text;
  bob_m text;
  kid_m text;
  victime text := private.new_id('expense');
begin
  alice_m := testkit.member(home, alice, 'Alice Martin', 'admin', 'accent');
  bob_m := testkit.member(home, bob, 'Bob Martin', 'membre', 'ink');
  kid_m := testkit.member(home, kid, 'Noé Martin', 'enfant', 'amber');
  insert into testkit.fx (key, user_id) values
    ('alice', alice), ('bob', bob), ('kid', kid), ('outsider', outsider);
  insert into testkit.fx (key, household_id) values ('home', home);
  insert into testkit.fx (key, row_id) values
    ('alice_m', alice_m),
    ('bob_m', bob_m),
    ('kid_m', kid_m);

  -- Ardoise du foyer + inscription des deux membres (le monde 0055+ exige une
  -- ardoise par dépense et des parts dans son périmètre).
  insert into public.ardoises (id, household_id, name, created_by)
  values ('ardoise_rpc', home, 'Foyer RPC', alice_m);
  insert into public.ardoise_members (ardoise_id, member_id)
  values ('ardoise_rpc', alice_m), ('ardoise_rpc', bob_m);
  insert into testkit.fx (key, row_id) values ('ardoise', 'ardoise_rpc');

  -- Dépense « victime » pour le test outsider-update : payée par Alice pour
  -- sa seule part, donc solde nul et sans effet sur les assertions finales.
  insert into public.expenses (id, household_id, ardoise_id, title, amount, paid_by, expense_date, split_type)
  values (victime, home, 'ardoise_rpc', 'Victime', 10.00, alice_m, current_date, 'egal');
  insert into public.expense_participants (id, expense_id, participant_type, member_id, share_amount)
  values (private.new_id('expense-participant'), victime, 'membre', alice_m, 10.00);
  insert into testkit.fx (key, row_id) values ('victime', victime);
end;
$$;

-- Appels RPC en `authenticated`, comme PostgREST les exécuterait.
select testkit.as_user(user_id, 'rpc-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

do $$
declare
  home text;
  alice_m text;
  bob_m text;
  v_result jsonb;
  v_repas text;
begin
  select household_id into home from testkit.fx where key = 'home';
  select row_id into alice_m from testkit.fx where key = 'alice_m';
  select row_id into bob_m from testkit.fx where key = 'bob_m';

  -- Le cas du 30/09 : 30 €, deux parts de 15 €, en UN appel.
  -- L'identifiant créé reste en variable : `testkit.fx` n'est pas inscriptible
  -- en `authenticated` (lecture seule, cf. _setup.sql).
  v_result := public.create_expense(home, 'ardoise_rpc', 'Repas', 30.00, alice_m, null, current_date, 'egal',
    jsonb_build_array(
      jsonb_build_object('participant_type', 'membre', 'member_id', alice_m, 'share_amount', 15),
      jsonb_build_object('participant_type', 'membre', 'member_id', bob_m, 'share_amount', 15)));
  v_repas := v_result ->> 'id';

  perform testkit.ok(v_repas like 'expense\_%', 'la réponse porte l''identifiant créé');
  perform testkit.eq(v_result ->> 'title', 'Repas', 'la réponse reprend le libellé');
  perform testkit.eq(v_result ->> 'household_id', home, 'la réponse porte le foyer');

  -- Modification : nouveau montant, nouvelles parts, mêmes deux lignes.
  v_result := public.update_expense(
    v_repas,
    'Repas corrigé', 40.00, bob_m, null, current_date, 'egal',
    jsonb_build_array(
      jsonb_build_object('participant_type', 'membre', 'member_id', alice_m, 'share_amount', 30),
      jsonb_build_object('participant_type', 'membre', 'member_id', bob_m, 'share_amount', 10)));

  perform testkit.eq(v_result ->> 'title', 'Repas corrigé', 'la réponse reprend le libellé modifié');
  perform testkit.eq(v_result ->> 'paid_by', bob_m, 'le payeur est modifiable');

  -- Somme partielle : refusée avec le message du trigger, pas un autre.
  begin
    perform public.create_expense(home, 'ardoise_rpc', 'Raté', 30.00, alice_m, null, current_date, 'egal',
      jsonb_build_array(
        jsonb_build_object('participant_type', 'membre', 'member_id', alice_m, 'share_amount', 15)));
    perform testkit.ok(false, 'une somme partielle doit être refusée');
  exception when others then
    perform testkit.ok(sqlerrm like '%somme des parts%', 'le refus dit la somme : ' || sqlerrm);
  end;

  -- Sans parts : refusé avant même la somme.
  begin
    perform public.create_expense(home, 'ardoise_rpc', 'Seul', 10.00, alice_m, null, current_date, 'egal', '[]'::jsonb);
    perform testkit.ok(false, 'une dépense sans parts doit être refusée');
  exception when others then
    perform testkit.ok(sqlerrm like '%au moins une personne%', 'le refus dit le minimum : ' || sqlerrm);
  end;

  -- Montant nul : refusé par la fonction, pas seulement par la contrainte.
  begin
    perform public.create_expense(home, 'ardoise_rpc', 'Gratuit', 0.00, alice_m, null, current_date, 'egal',
      jsonb_build_array(
        jsonb_build_object('participant_type', 'membre', 'member_id', alice_m, 'share_amount', 0)));
    perform testkit.ok(false, 'un montant nul doit être refusé');
  exception when others then
    perform testkit.ok(sqlerrm like '%supérieur à zéro%', 'le refus dit le montant : ' || sqlerrm);
  end;

  -- Dépense inexistante : introuvable, pas silencieuse.
  begin
    perform public.update_expense('expense_introuvable', 'X', 10.00, alice_m, null, current_date, 'egal',
      jsonb_build_array(
        jsonb_build_object('participant_type', 'membre', 'member_id', alice_m, 'share_amount', 10)));
    perform testkit.ok(false, 'une dépense inexistante doit être refusée');
  exception when others then
    perform testkit.ok(sqlerrm like '%introuvable%', 'le refus dit l''absence : ' || sqlerrm);
  end;

  -- Part externe : refusée (membres uniquement depuis 0039).
  begin
    perform public.create_expense(home, 'ardoise_rpc', 'Avec un ami', 20.00, alice_m, null, current_date, 'egal',
      jsonb_build_array(
        jsonb_build_object('participant_type', 'externe', 'member_id', null, 'external_participant_id', 'external_x', 'share_amount', 20)));
    perform testkit.ok(false, 'une part externe doit être refusée par le RPC');
  exception when others then
    perform testkit.ok(sqlerrm like '%type de participant invalide%', 'le refus dit le type : ' || sqlerrm);
  end;
end;
$$;

-- Enfant du foyer : lecture seule, y compris par RPC (0037).
select testkit.as_user(user_id, 'rpc-kid@example.fr') from testkit.fx where key = 'kid';

do $$
declare
  home text;
  alice_m text;
begin
  select household_id into home from testkit.fx where key = 'home';
  select row_id into alice_m from testkit.fx where key = 'alice_m';

  begin
    perform public.create_expense(home, 'ardoise_rpc', 'Goûter', 10.00, alice_m, null, current_date, 'egal',
      jsonb_build_array(
        jsonb_build_object('participant_type', 'membre', 'member_id', alice_m, 'share_amount', 10)));
    perform testkit.ok(false, 'un enfant ne crée pas de dépense par RPC');
  exception when others then
    perform testkit.ok(sqlerrm like '%rôle insuffisant%', 'le refus dit le rôle : ' || sqlerrm);
  end;

  begin
    perform public.update_expense(
      (select row_id from testkit.fx where key = 'victime'),
      'Goûter détourné', 10.00, alice_m, null, current_date, 'egal',
      jsonb_build_array(
        jsonb_build_object('participant_type', 'membre', 'member_id', alice_m, 'share_amount', 10)));
    perform testkit.ok(false, 'un enfant ne modifie pas de dépense par RPC');
  exception when others then
    perform testkit.ok(sqlerrm like '%rôle insuffisant%', 'le refus dit le rôle : ' || sqlerrm);
  end;
end;
$$;

reset role;

-- Acteur extérieur au foyer : création comme modification sont refusées.
select testkit.as_user(user_id, 'rpc-outsider@example.fr') from testkit.fx where key = 'outsider';

do $$
declare
  home text;
  alice_m text;
begin
  select household_id into home from testkit.fx where key = 'home';
  select row_id into alice_m from testkit.fx where key = 'alice_m';

  begin
    perform public.create_expense(home, 'ardoise_rpc', 'Intrus', 10.00, alice_m, null, current_date, 'egal',
      jsonb_build_array(
        jsonb_build_object('participant_type', 'membre', 'member_id', alice_m, 'share_amount', 10)));
    perform testkit.ok(false, 'un extérieur ne crée pas dans le foyer');
  exception when others then
    perform testkit.ok(sqlerrm like '%appartenez%', 'le refus dit l''appartenance : ' || sqlerrm);
  end;

  begin
    perform public.update_expense(
      (select row_id from testkit.fx where key = 'victime'),
      'Détourné', 10.00, alice_m, null, current_date, 'egal',
      jsonb_build_array(
        jsonb_build_object('participant_type', 'membre', 'member_id', alice_m, 'share_amount', 10)));
    perform testkit.ok(false, 'un extérieur ne modifie pas le foyer');
  exception when others then
    perform testkit.ok(sqlerrm like '%appartenez%', 'le refus dit l''appartenance : ' || sqlerrm);
  end;
end;
$$;

reset role;

-- Soldes et remplacement des parts, en propriétaire : le « Repas » est passé à
-- 40 € payés par Bob pour 30 € de parts Alice et 10 € de parts Bob. Les deux
-- parts d'origine (15/15) ont disparu : le remplacement ne duplique pas.
do $$
declare
  home text;
  alice_m text;
  bob_m text;
  repas text;
begin
  select household_id into home from testkit.fx where key = 'home';
  select row_id into alice_m from testkit.fx where key = 'alice_m';
  select row_id into bob_m from testkit.fx where key = 'bob_m';
  select e.id into repas from public.expenses e where e.title = 'Repas corrigé';

  perform testkit.eq(
    testkit.count(format('select 1 from public.expense_participants where expense_id = %L', repas)),
    2::bigint,
    'la modification remplace les parts sans les dupliquer');
  perform testkit.eq(
    (select balance from private.household_balances(home) where member_id = alice_m), (-30.00)::numeric,
    'Alice doit 30 € de parts sans avoir avancé : débit de 30 €');
  perform testkit.eq(
    (select balance from private.household_balances(home) where member_id = bob_m), 30.00::numeric,
    'Bob a avancé 40 € pour 10 € de parts : crédit de 30 €');
end;
$$;

rollback;
