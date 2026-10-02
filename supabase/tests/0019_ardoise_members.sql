-- supabase/tests/0019_ardoise_members.sql
-- Sélection des membres à la création (0066) + ajout/retrait PostgREST (RLS admin).
--
-- Marque reconnaissable : suffixe 'bbbb' sur les noms seedés ici.

begin;

do $$
declare
  alice uuid := testkit.auth_user('ard-b-alice@example.fr', 'Alice Bbbb');
  bob uuid := testkit.auth_user('ard-b-bob@example.fr', 'Bob Bbbb');
  kid uuid := testkit.auth_user('ard-b-kid@example.fr', 'Kid Bbbb');

  home_a text := testkit.household(alice, 'Foyer Ard Bbbb');

  alice_m text := testkit.member(home_a, alice, 'Alice Bbbb', 'admin', 'accent');
  bob_m text := testkit.member(home_a, bob, 'Bob Bbbb', 'membre', 'ink');
  kid_m text := testkit.member(home_a, kid, 'Kid Bbbb', 'enfant', 'amber');

  v_all text;
  v_subset text;
  v_filtre text;
begin
  -- 1. Défaut (NULL) : admin + membre, enfant exclu.
  v_all := (public.create_ardoise(alice, home_a, 'Coloc Bbbb') ->> 'id');
  perform testkit.eq(
    (select count(*) from public.ardoise_members where ardoise_id = v_all), 2::bigint,
    'creation defaut : admin + membre');
  perform testkit.ok(
    not exists (select 1 from public.ardoise_members where ardoise_id = v_all and member_id = kid_m),
    'creation defaut : enfant exclu');

  -- 2. Sélection explicite : seul Bob.
  v_subset := (public.create_ardoise(alice, home_a, 'Duo Bbbb', null, null, null, array[bob_m]) ->> 'id');
  perform testkit.eq(
    (select array_agg(member_id order by member_id) from public.ardoise_members where ardoise_id = v_subset),
    array[bob_m],
    'selection : seul le membre choisi');

  -- 3. Inconnus et enfant ignorés, pas d'erreur.
  v_filtre := (public.create_ardoise(alice, home_a, 'Filtre Bbbb', null, null, null, array[bob_m, kid_m, 'membre-fantome-bbbb']) ->> 'id');
  perform testkit.eq(
    (select count(*) from public.ardoise_members where ardoise_id = v_filtre), 1::bigint,
    'selection : inconnu et enfant ignores');

  -- 4. Tableau vide : ardoise sans membre, ajout ultérieur possible.
  perform testkit.eq(
    (select count(*) from public.ardoise_members where ardoise_id =
      (public.create_ardoise(alice, home_a, 'Vide Bbbb', null, null, null, array[]::text[]) ->> 'id')), 0::bigint,
    'selection vide : aucun membre initial');
  insert into public.ardoise_members (ardoise_id, member_id)
  values (v_filtre, alice_m)
  on conflict do nothing;
  perform testkit.eq(
    (select count(*) from public.ardoise_members where ardoise_id = v_filtre), 2::bigint,
    'ajout ulterieur : membre ajoute apres creation');

  -- 5. Retrait : la ligne disparaît, l'historique (aucune dépense ici) est intact.
  delete from public.ardoise_members where ardoise_id = v_filtre and member_id = alice_m;
  perform testkit.eq(
    (select count(*) from public.ardoise_members where ardoise_id = v_filtre), 1::bigint,
    'retrait : ligne supprimee');
end;
$$;

rollback;
