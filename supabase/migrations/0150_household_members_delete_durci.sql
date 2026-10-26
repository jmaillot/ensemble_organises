-- 0150_household_members_delete_durci.sql
-- CR-01 (relecture phase 25) : un admin peut supprimer directement la ligne
-- d'un enfant géré et purger en cascade tout son historique.
--
-- LE CONSTAT : la politique RLS `household_members_delete` (0007:288) n'a pas
-- été durcie par 0144–0149. Or les FK vers `household_members` sont presque
-- toutes `on delete cascade` (posts.author_id, messages.sender_id,
-- task_assignees, routine_assignees, conversation_members,
-- expense_participants, recipe_favorites, trip_members, gift_list_shares…).
-- Un `DELETE` direct (PostgREST) sur la ligne `role='enfant'` de l'admin
-- passait donc, et purgeait la totalité des contributions de l'enfant —
-- exactement ce que D-04 interdit (« ses messages et contributions restent
-- dans l'historique ») et ce que `link_managed_child` (0149) prend soin de
-- préserver en réattribuant. L'UI masque « Retirer » pour un enfant, mais la
-- RLS est la frontière d'autorisation finale (AGENTS.md §2.6).
--
-- LA CORRECTION : la politique exige désormais `role <> 'enfant'` — un enfant
-- géré ne sort JAMAIS par DELETE direct. Si un retrait d'enfant doit rester
-- possible un jour, il passera par une fonction SECURITY DEFINER
-- transactionnelle qui réattribue d'abord (la logique de 0149), jamais par le
-- DELETE brut. Le retrait d'un membre ADULTE reste possible (0002:539 et
-- 0037:304 prouvent déjà ce chemin) et la protection du dernier
-- administrateur est inchangée.
--
-- FORWARD-ONLY : 0007 n'est pas réécrite (AGENTS.md §2.7 A) — la définition
-- effective de la politique devient celle posée ici, sous le même nom.

begin;

drop policy if exists household_members_delete on public.household_members;
create policy household_members_delete on public.household_members
  for delete using (
    private.is_household_admin(household_id)
    and role <> 'enfant'
    and not (role = 'admin' and private.household_admin_count(household_id) = 1)
  );

comment on policy household_members_delete on public.household_members is
  'CR-01 : un admin retire un membre ADULTE (dernier admin protégé). Un enfant géré (role enfant, sans session) ne sort JAMAIS par DELETE direct : ses cascades purgeraient l''historique que D-04 protège. Un retrait éventuel passera par une fonction SECURITY DEFINER qui réattribue d''abord (forme 0149), jamais par le DELETE brut.';

commit;
