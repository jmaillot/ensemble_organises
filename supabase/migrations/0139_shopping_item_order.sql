-- 0139_shopping_item_order.sql
-- L'ordre du foyer sur une liste de courses (migration 0139).
--
-- POURQUOI. Une liste de courses se suit dans l'ordre du MAGASIN : c'est
-- ainsi qu'on ne repasse pas trois fois devant le rayon frais. L'ordre
-- d'ajout ne dit rien de ça, et le foyer n'avait aucun moyen de l'exprimer.
--
-- LA COLONNE. `position` porte le rang de l'article DANS SA LISTE (0 =
-- premier). Le rang est global à la liste, pas au rayon : un article garde
-- son rang quand on change de regroupement à l'écran, et c'est la VUE qui
-- décide du regroupement (par rayon, ou dans l'ordre du foyer).
--
-- LE BACKFILL. Les lignes existantes reçoivent le rang de leur ordre de
-- création (`created_at`, puis `id` pour départager). Sans cela, toutes les
-- lignes porteraient 0 et l'ordre de départ serait indéfini.
--
-- LE BACKFILL EST UNE FONCTION, pas une suite d'instructions : c'est ainsi
-- qu'il reste vérifiable. Un test l'appelle sur ses propres lignes et
-- vérifie le rang obtenu — une instruction écrite en place ne se testerait
-- pas (la migration est appliquée avant que les tests ne s'exécutent).
--
-- AUCUNE POLITIQUE NOUVELLE. `shopping_list_items_update_household` (0081)
-- autorise déjà un membre du foyer à modifier un article : réordonner n'est
-- qu'un `update` de `position`. Le rôle `enfant` reste en lecture seule, par
-- `private.can_write_household`.
--
-- L'INDEX (list_id, position) sert le tri de la liste.

begin;

-- ---------------------------------------------------------------------------
-- La colonne
-- ---------------------------------------------------------------------------
alter table public.shopping_list_items
  add column if not exists position integer not null default 0;

comment on column public.shopping_list_items.position is
  'Rang manuel de l''article dans sa liste (0 = premier). Porté par le glisser-déposer.';

-- ---------------------------------------------------------------------------
-- Le backfill, en fonction : vérifiable, et rejouable sans effet de bord
-- (l'ordre de création est recalculé à l'identique).
-- ---------------------------------------------------------------------------
create or replace function private.backfill_shopping_item_positions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.shopping_list_items item
     set position = rang.rang
    from (
      select id,
             (row_number() over (partition by list_id order by created_at, id) - 1)::integer as rang
        from public.shopping_list_items
    ) rang
   where rang.id = item.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function private.backfill_shopping_item_positions() is
  'Rend à chaque article son rang de création dans sa liste. Idempotent.';

-- Le backfill est un geste de MIGRATION, pas une fonction de service : le
-- client n'a rien à y faire. Sans ce retrait, la fonction serait
-- exécutable par un navigateur, et le contrat de schéma (0001) le refuse.
revoke execute on function private.backfill_shopping_item_positions() from public, anon, authenticated;

select private.backfill_shopping_item_positions();

-- ---------------------------------------------------------------------------
-- L'index du tri
-- ---------------------------------------------------------------------------
create index if not exists shopping_list_items_list_position_idx
  on public.shopping_list_items (list_id, position);

commit;
