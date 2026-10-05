-- 0072_product_household_match.sql
-- Un article ne peut pointer que vers un produit de SON foyer : la clé
-- étrangère vérifie l'existence de la ligne, pas la co-appartenance, et la
-- RLS porte sur le foyer de l'article — un client devinant l'UUID d'un
-- produit d'un autre foyer pouvait donc lier les deux (relevé en revue 04,
-- CR-02). Déclencheur BEFORE, comme `validate_expense_payer` (0056).

begin;

create or replace function private.products_match_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.product_id is not null and not exists (
    select 1 from public.products p
     where p.id = new.product_id and p.household_id = new.household_id
  ) then
    raise exception 'le produit doit appartenir au même foyer que l''article'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists check_product_household on public.shopping_list_items;
create trigger check_product_household
  before insert or update of product_id on public.shopping_list_items
  for each row execute function private.products_match_household();

comment on function private.products_match_household() is
  'Cohérence foyer article-produit : complète la FK qui ne voit que l''existence.';

commit;
