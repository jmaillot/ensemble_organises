-- supabase/tests/0021_ardoise_open_settlement.sql
-- Chemin ouvert du settlement (0069, lecture anonyme par lien) : mêmes
-- soldes que le chemin membre, sans acteur ni ticket.

begin;

do $$
declare
  alice uuid := testkit.auth_user('open-alice@example.fr', 'Alice Open');
  bob uuid := testkit.auth_user('open-bob@example.fr', 'Bob Open');

  home_o text := testkit.household(alice, 'Foyer Open');
  alice_m text := testkit.member(home_o, alice, 'Alice Open', 'admin', 'accent');
  bob_m text := testkit.member(home_o, bob, 'Bob Open', 'membre', 'ink');

  v_ard text := (public.create_ardoise(alice, home_o, 'Coloc Open') ->> 'id');
begin
  insert into public.expenses (id, household_id, ardoise_id, title, amount, paid_by, expense_date, split_type)
  values ('expense_open', home_o, v_ard, 'Courses Open', 60.00, alice_m, current_date, 'egal');
  insert into public.expense_participants (expense_id, participant_type, member_id, share_amount)
  values ('expense_open', 'membre', alice_m, 30.00),
         ('expense_open', 'membre', bob_m, 30.00);

  perform testkit.eq(
    (select (b ->> 'amount')::numeric from jsonb_array_elements(
      (public.ardoise_settlement(null, v_ard, null, true) -> 'balances')) as b
     where (b ->> 'participant_id') = alice_m), 30.00::numeric,
    'ouvert : Alice +30 comme en chemin membre');
  perform testkit.eq(
    (select round(sum((b ->> 'amount')::numeric), 2) from jsonb_array_elements(
      (public.ardoise_settlement(null, v_ard, null, true) -> 'balances')) as b), 0.00::numeric,
    'ouvert : somme nulle');

  begin
    perform public.ardoise_settlement(null, 'ardoise-inconnue-open', null, true);
    perform testkit.ok(false, 'ardoise inconnue aurait dû être refusée');
  exception when others then
    perform testkit.ok(true, 'ardoise inconnue refusée');
  end;
end;
$$;

rollback;
