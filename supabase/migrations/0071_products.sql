-- 0071_products.sql
-- Phase 3 Courses scan (plan 04-01, tracer) : catalogue de produits du foyer.
--
-- Chaque foyer garde ses propres lignes (D-09, pas de catalogue global) :
-- `unique (household_id, ean)` autorise le meme EAN dans deux foyers mais
-- jamais deux fois dans le meme. `shopping_list_items.product_id` lie un
-- article a son produit, avec `on delete set null` : supprimer un produit
-- conserve l'article (D-04, re-scan +1 sur l'article existant).
--
-- Conventions : id text via private.new_id, household_id explicite, audit
-- created_at/updated_at, RLS foyer-plat (0007, meme motif), publication
-- Realtime (0010, meme motif), trigger updated_at et garde-fous membre
-- (0008, meme motif). Forward-only : 0007/0008/0010 ne sont pas modifies.

begin;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table public.products (
  id text primary key default private.new_id('product'),
  household_id text not null references public.households (id) on delete cascade,
  ean text not null check (ean ~ '^\d{8,14}$'),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  brand text,
  -- Rayon (contrainte applicative : RAYONS via normalizeRayon, repli Divers).
  category text,
  -- Photo LOCALE signee uniquement (D-05) : jamais un hotlink OpenFoodFacts.
  -- L'URL OFF reste un repli d'affichage transitoire dans `off_data`.
  photo_url text,
  -- Cliche OFF brut valide par zod a l'ingestion : code, product_name,
  -- brands, categories_tags, image_url (repli affichage), lang, fetched_at.
  off_data jsonb not null default '{}'::jsonb,
  created_by text references public.household_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_ean_per_household unique (household_id, ean)
);
comment on table public.products is
  'Catalogue de produits du foyer, enrichi par scan OpenFoodFacts.';

create index products_household_ean_idx on public.products (household_id, ean);

alter table public.shopping_list_items
  add column product_id text references public.products (id) on delete set null;

alter table public.products enable row level security;

-- ---------------------------------------------------------------------------
-- Horodatage : meme motif que 0008 (touch_updated_at).
-- ---------------------------------------------------------------------------
drop trigger if exists set_updated_at on public.products;
create trigger set_updated_at before update on public.products
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Garde-fou membre : `created_by` doit appartenir au foyer (0008, meme motif).
-- Complete la politique RLS : un client ne peut pas ecrire au nom d'un autre
-- membre (T-04-01).
-- ---------------------------------------------------------------------------
drop trigger if exists validate_member_refs on public.products;
create trigger validate_member_refs before insert or update on public.products
  for each row execute function private.validate_member_refs('created_by');

-- ---------------------------------------------------------------------------
-- RLS : motif foyer-plat de 0007 pour ('products', array['created_by']).
-- ---------------------------------------------------------------------------
drop policy if exists products_select_household on public.products;
create policy products_select_household on public.products
  for select using (private.is_household_member(household_id));

drop policy if exists products_insert_household on public.products;
create policy products_insert_household on public.products
  for insert with check (
    private.can_write_household(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
  );

drop policy if exists products_update_household on public.products;
create policy products_update_household on public.products
  for update using (private.can_write_household(household_id))
  with check (
    private.can_write_household(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
  );

drop policy if exists products_delete_admin on public.products;
create policy products_delete_admin on public.products
  for delete using (private.is_household_admin(household_id));

-- ---------------------------------------------------------------------------
-- Realtime : meme motif protege que 0010.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'Publication supabase_realtime absente : Realtime non active sur cette stack.';
    return;
  end if;

  begin
    execute 'alter publication supabase_realtime add table public.products';
  exception when others then
    raise notice 'table products ignoree pour Realtime : %', sqlerrm;
  end;
end;
$$;

commit;
