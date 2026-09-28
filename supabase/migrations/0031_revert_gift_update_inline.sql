-- 0031_revert_gift_update_inline.sql
-- Annule la 0030 : sa relecture inlinée de gift_lists est refusée au plan
-- (« infinite recursion detected in policy »), y compris sur des cas qui
-- passaient (auto-assignation refusée silencieusement avant, en erreur
-- bruyante après). Restauration à l'identique de l'expression d'origine.
--
-- L'anomalie du transfert (WITH CHECK vrai en appel direct, 42501 dans
-- l'UPDATE) reste ouverte et indépendante : ni la 0028, ni la 0029, ni la
-- 0030 ne l'expliquent. Voir docs/TODO.md #7 et l'historique des sondes.

begin;

drop policy if exists gift_lists_update on public.gift_lists;
create policy gift_lists_update on public.gift_lists
  for update using (private.can_write_gift_list(id))
  with check (private.can_write_gift_list(id) and private.member_in_household(owner_member_id, household_id));

commit;
