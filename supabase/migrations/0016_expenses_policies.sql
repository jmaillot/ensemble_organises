-- 0016_expenses_policies.sql
-- Donne enfin des politiques RLS à `public.expenses`.
--
-- Constat (campagne de tests du 25/09/2026) : l'isolation entre foyers a
-- échoué sur « Alice ne voit pas les dépenses du foyer B — attendu 1, obtenu
-- 0 ». `expenses` n'avait AUCUNE politique. La RLS étant activée et le GRANT
-- `… on all tables in schema public to authenticated` ouvert (0009), la table
-- était donc inaccessible : non seulement Alice ne voyait pas la dépense du
-- foyer B, elle ne voyait RIEN et ne pouvait rien créer non plus. L'Ardoise
-- était entièrement inutilisable depuis un client, et l'erreur remontait à
-- l'utilisateur sous la forme d'une liste vide — le pire mode de panne.
--
-- Le motif est celui des tables « foyer plat » de 0007, dont `expenses` a été
-- omise de la liste alors que sa table fille `expense_participants` recevait
-- bien ses quatre politiques.
--
-- Une divergence mérite d'être justifiée : sur toutes les autres tables, les
-- colonnes d'auteur doivent désigner le membre courant, pour interdire d'écrire
-- au nom d'un autre. Ici, `paid_by` est une ATTRIBUTION FACTUELLE et non une
-- signature : le formulaire de l'Ardoise propose tous les membres du foyer
-- dans « Payé par », pour qu'un membre saisisse une dépense réglée par un
-- autre. Contraindre `paid_by` au membre courant casserait ce parcours — et
-- surtout le ferait échouer par une erreur RLS brute, sans message.
--
-- Ce que la politique garantit réellement :
--   * seul un membre du foyer voit ses dépenses, et un seul membre du foyer
--     peut les écrire ;
--   * `paid_by` désigne nécessairement un membre DU MÊME foyer — sans quoi un
--     membre pourrait rattacher une dette à un membre d'une autre famille, et
--     fausser le calcul des soldes. Le trigger `validate_member_refs` le
--     vérifie déjà (0008) ; la politique le dit aussi, en première ligne ;
--   * seule une personne administratrice supprime, comme partout ailleurs.
--
-- Le garde-fou permanent qui empêche cette omission de revenir est dans
-- `supabase/tests/0001_schema_contract.sql` : RLS activée ET au moins une
-- politique sur chaque table de `public`, la seule exception documentée étant
-- `household_invite_tokens`, qui n'en doit avoir aucune.

begin;

drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses
  for select using (private.is_household_member(household_id));

drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses
  for insert with check (
    private.can_write_household(household_id)
    and private.member_in_household(paid_by, household_id)
  );

drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses
  for update using (private.can_write_household(household_id))
  with check (
    private.can_write_household(household_id)
    and private.member_in_household(paid_by, household_id)
  );

drop policy if exists expenses_delete on public.expenses;
create policy expenses_delete on public.expenses
  for delete using (private.is_household_admin(household_id));

comment on policy expenses_insert on public.expenses is
  'Membre du foyer, et payeur appartenant au même foyer — l''attribution reste libre, la frontière ne l''est pas.';

commit;
