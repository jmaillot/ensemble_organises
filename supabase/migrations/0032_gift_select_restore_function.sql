-- 0032_gift_select_restore_function.sql
-- Restaure gift_lists_select sur can_read_gift_list (état 0007).
--
-- CHRONIQUE (27→28/09/2026)
--   Le chemin supporté est : INSERT sans représentation, puis SELECT (c'est
--   ce que fait désormais createGiftList côté app). La 0028 avait réécrit le
--   SELECT en prédicats directs pour rendre INSERT…RETURNING possible, mais sa
--   relecture par id reste invisible dans la même commande (MVCC) ; de plus,
--   sa présence a coïncidé avec l'échec du transfert en UPDATE, sans cause
--   moteur élucidée (composants vrais isolément, échec en conjonction). La 0029 corrigeait
--   une corrélation perdue dans cette réécriture (s.list_id = s.id).
--   Retour à la version historiquement verte sur tous les chemins supportés :
--   INSERT…RETURNING sur gift_lists reste non supporté par construction MVCC,
--   l'app ne le demande plus.

begin;

drop policy if exists gift_lists_select on public.gift_lists;
create policy gift_lists_select on public.gift_lists
  for select using (private.can_read_gift_list(id));

commit;
