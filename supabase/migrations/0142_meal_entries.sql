-- 0142_meal_entries.sql
-- Le menu de la semaine (migration 0142, vague 3.1).
--
-- POURQUOI. Planifier les repas de la semaine, et transformer le plan en
-- liste de courses — sans tableur ni post-it sur le frigo.
--
-- UNE TABLE, PAS DEUX. Le benchmark esquissait `meal_plans` + `meal_entries` ;
-- une ligne de plan n'a rien à porter dans ce MVP (pas de titre, pas de
-- statut) : la « semaine » est un regroupement dérivé de `entry_date`
-- (lundi au dimanche, calculé côté client). Une table de moins, une politique
-- de moins, un test de moins — et aucune perte de capacité.
--
-- LE CONTENU. Chaque entrée est soit une RECETTE (`recipe_id`), soit un
-- TEXTE LIBRE (`free_text` — « restes du frigo »), au moins l'un des deux :
-- la contrainte `meal_entries_content_check` refuse la ligne vide. La
-- recette disparaît avec sa fiche (`on delete cascade`) : un menu ne garde
-- pas de recette fantôme, et l'entrée partielle violerait la contrainte.
--
-- LES PORTIONS ET LES GOURMETS. `servings` porte la mise à l'échelle de la
-- recette pour la génération des courses (× portions, via le même moteur que
-- l'envoi Recettes → Courses). `member_ids` liste « qui mange » ; un tableau
-- sans FK : le client le remplit depuis les membres réels du foyer, et une
-- ligne périmée ne doit pas empêcher de quitter un foyer (les membres
-- supprimés y restent comme texte, la ligne reste lisible).
--
-- AUCUNE POLITIQUE SURPRISE. Motif foyer plat (0141/0007) : lecture membre,
-- écriture `can_write_household`, auteur nul ou soi-même.
--
-- LE TEST (tests/0142) prouve : l'écriture membre, le refus enfant, le refus
-- d'un foyer étranger, la contrainte de contenu (ni recette ni texte), les
-- bornes (slot, servings), et la disparition en cascade avec la recette.

begin;

-- ---------------------------------------------------------------------------
-- La table
-- ---------------------------------------------------------------------------
create table public.meal_entries (
  id text primary key default private.new_id('meal'),
  household_id text not null references public.households (id) on delete cascade,
  entry_date date not null,
  slot text not null check (slot in ('matin', 'midi', 'soir')),
  recipe_id text references public.recipes (id) on delete cascade,
  free_text text check (free_text is null or char_length(btrim(free_text)) between 1 and 200),
  servings integer not null default 2 check (servings between 1 and 50),
  member_ids text[] not null default '{}',
  created_by text references public.household_members (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint meal_entries_content_check
    check (recipe_id is not null or nullif(btrim(free_text), '') is not null)
);

comment on table public.meal_entries is
  'Menu du foyer : un repas par date et par moment de la journée, recette ou texte libre.';

comment on column public.meal_entries.member_ids is
  '« Qui mange » : identifiants de household_members saisis par le client, sans FK — un membre quitté ne doit pas verrouiller son historique de repas.';

create index if not exists meal_entries_household_date_idx
  on public.meal_entries (household_id, entry_date);

-- ---------------------------------------------------------------------------
-- Les politiques : motif foyer plat.
-- ---------------------------------------------------------------------------
alter table public.meal_entries enable row level security;

create policy meal_entries_select_household on public.meal_entries
  for select using (private.is_household_member(household_id));

create policy meal_entries_insert_household on public.meal_entries
  for insert with check (
    private.can_write_household(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
  );

create policy meal_entries_update_household on public.meal_entries
  for update using (
    private.can_write_household(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
  )
  with check (
    private.can_write_household(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
  );

create policy meal_entries_delete_household on public.meal_entries
  for delete using (private.can_write_household(household_id));

commit;
