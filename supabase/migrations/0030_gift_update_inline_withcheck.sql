-- 0030_gift_update_inline_withcheck.sql
-- Contournement ciblé : WITH CHECK de gift_lists_update sans appel de fonction.
--
-- CONSTAT (28/09/2026, prouvé par sondes, pas déduit)
--   Dans le même txn, même rôle, mêmes claims, mêmes valeurs :
--   `can_write_gift_list(X)` rend t, `member_in_household(Y, Z)` rend t,
--   et `UPDATE … WITH CHECK (can_write AND member)` lève 42501.
--   Le divergent n'est donc ni la logique (vraie dans les deux cas isolés),
--   ni les données, mais l'évaluation d'appels de fonctions SECURITY DEFINER
--   imbriqués dans le WITH CHECK sur cette version (17.6).
--
-- CHOIX
--   Prédicats directs sur NEW + EXISTS sur household_members (lignes commises
--   d'autres tables, jamais de relecture de gift_lists) : aucune fonction
--   appelée, sémantique STRICTEMENT identique à l'expression remplacée
--   (propriétaire, admin, ou liste non privée + rédacteur ; membre du foyer).
--   `USING` et les autres politiques gardent les helpers : un seul point de
--   divergence, réversible en restaurant l'expression d'origine.
--   Si un jour la cause moteur est identifiée, revenir à l'expression
--   d'origine et garder le test 0002 comme témoin.

begin;

drop policy if exists gift_lists_update on public.gift_lists;
create policy gift_lists_update on public.gift_lists
  for update using (private.can_write_gift_list(id))
  with check (
    exists (
      select 1
        from public.household_members m
       where m.household_id = household_id
         and m.user_id = auth.uid()
         and (
           m.id = owner_member_id
           or m.role = 'admin'
           or (
             (select l.visibility from public.gift_lists l where l.id = id)
             <> 'privee'
             and m.role in ('admin', 'membre')
           )
         )
    )
    and exists (
      select 1
        from public.household_members m2
       where m2.id = owner_member_id
         and m2.household_id = household_id
    )
  );

commit;
