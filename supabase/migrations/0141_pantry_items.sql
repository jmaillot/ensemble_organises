-- 0141_pantry_items.sql
-- Le frigo du foyer (migration 0141, vague 3.1).
--
-- POURQUOI. Savoir ce qu'il y a dans le réfrigérateur, le congélateur et le
-- garde-manger, et ce qui va périmer — avant de racheter ce qu'on avait déjà
-- ou de jeter ce qu'on avait oublié.
--
-- LA TABLE. Une ligne par article physique, pas par référence produit : deux
-- yaourts du même rayon sont deux lignes qui périment le même jour, et une
-- quantité unique suffit quand le foyer ne veut pas détailler. Trois
-- emplacements fermés (`frigo`, `congelateur`, `garde_manger`) : la vue en
-- onglets du module s'appuie dessus, et un article ne déménage que par un
-- `update` explicite.
--
-- LES DATES. `expires_on` porte la péremption, `opened_on` l'ouverture —
-- un produit ouvert se conserve moins longtemps, mais c'est le foyer qui
-- sait : la base borne seulement la cohérence (on n'ouvre pas après avoir
-- jeté). Les deux sont nullables : une bouteille de vin n'a pas de date,
-- l'article reste listable.
--
-- PAS DE PHOTO dans cette passe : la colonne existerait sans lecteur, et
-- une colonne jamais écrite est une affirmation mensongère (AGENTS.md §2.7 I).
-- Elle viendra avec l'upload, dans sa propre migration, comme les autres
-- médias du foyer (chemin du bucket, jamais une URL signée).
--
-- AUCUNE POLITIQUE SURPRISE. Le motif est celui du foyer plat (0007) :
-- lecture pour les membres, écriture pour `can_write_household` (admin et
-- membre, jamais enfant — phase 14), et la colonne d'auteur ne peut désigner
-- que le membre courant ou rester nulle : impossible d'ajouter ou de modifier
-- un article au nom d'autrui. La suppression reste membre : sortir un yaourt
-- mangé est un geste du quotidien, pas une décision d'administration.
--
-- LE TEST (tests/0141) prouve : l'écriture membre, le refus enfant
-- (compteur 0), le refus d'un autre foyer, le refus de l'auteur usurpé, les
-- bornes de forme (emplacement, quantité, cohérence des dates), et la
-- lecture bornée au foyer.

begin;

-- ---------------------------------------------------------------------------
-- La table
-- ---------------------------------------------------------------------------
create table public.pantry_items (
  id text primary key default private.new_id('pantry'),
  household_id text not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  category text not null default 'autre' check (category in (
    'produit_frais', 'surgele', 'epicerie', 'boisson', 'autre'
  )),
  quantity numeric not null default 1 check (quantity > 0),
  unit text check (unit is null or char_length(btrim(unit)) between 1 and 20),
  location text not null default 'frigo' check (location in (
    'frigo', 'congelateur', 'garde_manger'
  )),
  expires_on date,
  opened_on date,
  notes text check (notes is null or char_length(notes) <= 1000),
  created_by text references public.household_members (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint pantry_items_dates_check
    check (opened_on is null or expires_on is null or opened_on <= expires_on)
);

comment on table public.pantry_items is
  'Frigo, congélateur et garde-manger du foyer : une ligne par article, son emplacement et sa péremption.';

comment on column public.pantry_items.created_by is
  'Membre qui a ajouté l''article. Nul ou le membre courant (garde 0007) : on n''écrit pas au nom d''autrui.';

create index if not exists pantry_items_household_expires_idx
  on public.pantry_items (household_id, expires_on);

-- ---------------------------------------------------------------------------
-- Les politiques : motif foyer plat, écrites ici car la table est née après
-- la boucle génératrice de 0007.
-- ---------------------------------------------------------------------------
alter table public.pantry_items enable row level security;

create policy pantry_items_select_household on public.pantry_items
  for select using (private.is_household_member(household_id));

create policy pantry_items_insert_household on public.pantry_items
  for insert with check (
    private.can_write_household(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
  );

create policy pantry_items_update_household on public.pantry_items
  for update using (
    private.can_write_household(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
  )
  with check (
    private.can_write_household(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
  );

create policy pantry_items_delete_household on public.pantry_items
  for delete using (private.can_write_household(household_id));

commit;
