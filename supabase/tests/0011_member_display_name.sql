-- supabase/tests/0011_member_display_name.sql
-- Renommage de sa propre ligne membre (migration 0040) : un membre renomme
-- SA ligne, personne d'autre, display_name seul, jamais par RLS directe
-- (réservée aux admins) mais par RPC authentifié.

begin;

do $$
declare
  alice uuid := testkit.auth_user('nom-alice@example.fr', 'Alice Martin');
  bob uuid := testkit.auth_user('nom-bob@example.fr', 'Bob Martin');
  kid uuid := testkit.auth_user('nom-kid@example.fr', 'Noé Martin');
  outsider uuid := testkit.auth_user('nom-outsider@example.fr', 'Olivier Fantome');
  home text := testkit.household(alice, 'Foyer Nom');
  alice_m text;
  bob_m text;
  kid_m text;
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
end;
$$;

-- Membre ordinaire : renomme sa ligne, rien d'autre.
select testkit.as_user(user_id, 'nom-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

do $$
declare
  bob_m text;
  v_out jsonb;
begin
  select row_id into bob_m from testkit.fx where key = 'bob_m';

  v_out := public.rename_own_member_name(bob_m, 'Bobby Martin');
  perform testkit.eq(v_out ->> 'display_name', 'Bobby Martin', 'le RPC renvoie la ligne renommée');

  begin
    perform public.rename_own_member_name((select row_id from testkit.fx where key = 'alice_m'), 'Alice Détournée');
    perform testkit.ok(false, 'un membre ne renomme pas la ligne d''un autre');
  exception when others then
    perform testkit.ok(sqlerrm like '%autre que vous%', 'le refus dit la propriété : ' || sqlerrm);
  end;

  begin
    perform public.rename_own_member_name(bob_m, 'X');
    perform testkit.ok(false, 'un nom trop court est refusé');
  exception when others then
    perform testkit.ok(sqlerrm like '%deux caractères%', 'le refus dit la longueur : ' || sqlerrm);
  end;
end;
$$;

reset role;

-- Enfant géré : depuis 0145, l'enfant n'a plus de compte ni de session — il
-- ne renomme pas sa ligne lui-même (l'uid ne résout aucun membre : « autre
-- que vous »). Le seul chemin enfant est la fiche tenue par un adulte.
select testkit.as_user(user_id, 'nom-kid@example.fr') from testkit.fx where key = 'kid';
set local role authenticated;

do $$
declare
  kid_m text;
begin
  select row_id into kid_m from testkit.fx where key = 'kid_m';
  begin
    perform public.rename_own_member_name(kid_m, 'Noé Moderne');
    perform testkit.ok(false, 'un enfant sans session ne renomme pas sa ligne');
  exception when others then
    perform testkit.ok(sqlerrm like '%autre que vous%', 'le refus dit la propriété : ' || sqlerrm);
  end;
end;
$$;

reset role;

-- Le seul chemin : un adulte du foyer met à jour la fiche (0146).
select testkit.as_user(user_id, 'nom-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

do $$
declare
  kid_m text;
begin
  select row_id into kid_m from testkit.fx where key = 'kid_m';
  perform public.update_managed_child_profile(kid_m, 'Noé Moderne', 'amber', null, null, null);
  perform testkit.ok(true, 'l''adulte met à jour la fiche enfant par le RPC dédié');
end;
$$;

reset role;

-- Extérieur : rien à lui.
select testkit.as_user(user_id, 'nom-outsider@example.fr') from testkit.fx where key = 'outsider';
set local role authenticated;

do $$
declare
  bob_m text;
begin
  select row_id into bob_m from testkit.fx where key = 'bob_m';
  begin
    perform public.rename_own_member_name(bob_m, 'Bob Détourné');
    perform testkit.ok(false, 'un extérieur ne renomme aucune ligne');
  exception when others then
    perform testkit.ok(sqlerrm like '%autre que vous%', 'le refus dit la propriété : ' || sqlerrm);
  end;
end;
$$;

reset role;

-- Le nom est réellement en base, pas seulement dans la réponse.
select testkit.eq(
  (select display_name from public.household_members where id = (select row_id from testkit.fx where key = 'bob_m')),
  'Bobby Martin',
  'la ligne membre porte le nouveau nom');

-- La ligne enfant aussi : le nom vient de la fiche tenue par l'adulte.
select testkit.eq(
  (select display_name from public.household_members where id = (select row_id from testkit.fx where key = 'kid_m')),
  'Noé Moderne',
  'la ligne enfant porte le nom donné par la fiche adulte');

rollback;
