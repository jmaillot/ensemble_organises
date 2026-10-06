-- 0088_products_shared_edit.sql
-- Meme classe que 0081 (taches) : le WITH CHECK de `products_update_household`
-- exigeait `created_by = moi`, donc modifier un produit du foyer cree par un
-- autre membre echouait avec
-- << new row violates row-level security policy for table "products" >>.
-- Le WITH CHECK porte sur la NOUVELLE ligne entiere, donc meme un simple
-- changement de `name` etait refuse quand `created_by` designait autrui.
--
-- Correction (decision produit 2026-10-06 : catalogue partage, D-09) : le
-- WITH CHECK des UPDATE ne verifie plus que le role d'ecriture.
-- L'anti-usurpation a l'INSERT est inchangee, et le trigger partage
-- `guard_author_immutable` (0081) fige `created_by` en UPDATE client.

begin;

drop trigger if exists guard_author_immutable on public.products;
create trigger guard_author_immutable before update on public.products
  for each row execute function private.guard_author_immutable('created_by');

drop policy if exists products_update_household on public.products;
create policy products_update_household on public.products
  for update using (private.can_write_household(household_id))
  with check (private.can_write_household(household_id));

commit;
