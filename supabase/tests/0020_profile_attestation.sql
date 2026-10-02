-- supabase/tests/0020_profile_attestation.sql
-- Attestation « 15 ans et plus » (0068, CGU art. 3) : NULL à la création,
-- modifiable par le seul propriétaire (politique `profiles_update` inchangée).

begin;

do $$
declare
  alice uuid := testkit.auth_user('att-alice@example.fr', 'Alice Att');
  bob uuid := testkit.auth_user('att-bob@example.fr', 'Bob Att');
begin
  -- 1. NULL à la création (le trigger ne renseigne pas la colonne).
  perform testkit.ok(
    (select p.age_attested_at is null from public.profiles p where p.id = alice),
    'attestation nulle a la creation');

  -- 2. Le propriétaire horodate sa propre attestation.
  perform testkit.as_user(alice, 'att-alice@example.fr');
  set local role authenticated;
  update public.profiles set age_attested_at = now() where id = alice;
  perform testkit.ok(
    (select p.age_attested_at is not null from public.profiles p where p.id = alice),
    'le proprietaire atteste');

  -- 3. Un tiers ne peut ni lire (hors foyer commun) ni modifier.
  perform testkit.as_user(bob, 'att-bob@example.fr');
  set local role authenticated;
  perform testkit.eq(
    testkit.count('select 1 from public.profiles'), 1::bigint,
    'Bob ne voit que son propre profil');
  perform testkit.eq(
    testkit.affected(format('update public.profiles set age_attested_at = now() where id = %L', alice)), 0::bigint,
    'Bob ne peut pas attester pour Alice');
end;
$$;

rollback;
