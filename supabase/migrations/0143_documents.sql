-- 0143_documents.sql
-- Les documents du foyer (migration 0143, vague 3.2).
--
-- POURQUOI. Les papiers du foyer — factures, contrats, ordonnances, actes —
-- vivent aujourd'hui éparpillés : tiroir physique, boîte mail, photo dans la
-- galerie. Le module Documents les rassemble : un dossier coloré par thème,
-- un document photo ou PDF par papier, une date d'expiration pour ce qui
-- court (contrat, ordonnance, attestation), une note pour le détail.
--
-- LES DEUX TABLES. `document_folders` porte le classement (nom + teinte,
-- palette fermée de pastels déjà présente dans l'interface) et
-- `documents` le papier lui-même. Un document n'est JAMAIS un texte : il
-- porte toujours `storage_path` — le module Notes existe déjà pour les
-- mémoires, et un papier sans fichier serait une fiche fantôme. `mime` est
-- borné aux images et aux PDF : la colonne dit ce que le module affiche
-- réellement (aperçu des images, ouverture des PDF), rien de plus.
--
-- LE CLASSEMENT. `folder_id` est nullable : un document peut rester à la
-- racine du foyer. La suppression d'un dossier NE DESTRUIT PAS ses
-- documents — ils retombent à la racine (`on delete set null`) : détruire
-- des papiers d'un geste de rangement serait une perte de données. Un
-- déclencheur aligne `documents.household_id` sur le dossier parent : un
-- document suit TOUJOURS le foyer de son dossier, jamais l'inverse.
--
-- PAS D'URL SIGNÉE EN COLONNE. `storage_path` porte le chemin du bucket
-- privé (`household-media`) : l'URL signée naît à la lecture
-- (`resolveHouseholdMediaUrl`, phase 19), jamais stockée.
--
-- AUCUNE POLITIQUE SURPRISE. Le motif est celui du foyer plat (0007) :
-- lecture pour les membres, écriture pour `can_write_household` (admin et
-- membre, jamais enfant — phase 14), et la colonne d'auteur ne peut désigner
-- que le membre courant ou rester nulle. La suppression d'un document reste
-- un geste de membre : jeter un papier est un geste quotidien, pas une
-- décision d'administration. Côté dossiers, créer, renommer et supprimer un
-- dossier est un geste de classement — la suppression ne détruit que le
-- dossier, jamais les papiers qu'il contenait.
--
-- LE TEST (tests/0143) prouve : l'écriture membre (dossier + document),
-- le refus enfant (insert lève, delete filtre), le refus d'un autre foyer,
-- l'auteur usurpé refusé, le refus du dossier d'un autre foyer (alignement),
-- les bornes de forme (mime hors liste, taille nulle, teinte hors palette,
-- nom vide), et la lecture bornée au foyer dans les deux sens.

begin;

-- ---------------------------------------------------------------------------
-- Les dossiers colorés
-- ---------------------------------------------------------------------------
create table public.document_folders (
  id text primary key default private.new_id('docfolder'),
  household_id text not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  color text not null default 'sand' check (color in (
    'sage', 'blush', 'butter', 'sky', 'lilac', 'sand'
  )),
  created_by text references public.household_members (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint document_folders_name_unique unique (household_id, name)
);

comment on table public.document_folders is
  'Dossiers colorés du module Documents : le classement des papiers du foyer.';

comment on column public.document_folders.color is
  'Teinte du dossier, dans la palette de pastels de l''interface. Jamais une couleur libre : la colonne dit ce que l''écran peint.';

-- ---------------------------------------------------------------------------
-- Les documents eux-mêmes
-- ---------------------------------------------------------------------------
create table public.documents (
  id text primary key default private.new_id('doc'),
  household_id text not null references public.households (id) on delete cascade,
  folder_id text references public.document_folders (id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  mime text not null check (mime ~ '^(image/[a-z0-9.+-]+|application/pdf)$'),
  size bigint not null check (size > 0),
  storage_path text not null check (char_length(storage_path) between 1 and 500),
  expires_on date,
  notes text check (notes is null or char_length(notes) <= 1000),
  created_by text references public.household_members (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.documents is
  'Papiers du foyer : factures, contrats, ordonnances — toujours un fichier photo ou PDF du bucket privé, jamais un texte nu.';

comment on column public.documents.storage_path is
  'Chemin du bucket privé (household-media). L''URL signée naît à la lecture, jamais stockée (phase 19).';

comment on column public.documents.folder_id is
  'Dossier de classement, nullable. La suppression d''un dossier ne détruit pas ses documents : ils retombent à la racine.';

comment on column public.documents.created_by is
  'Membre qui a déposé le document. Nul ou le membre courant (garde 0007) : on ne dépose pas au nom d''autrui.';

-- Un document suit TOUJOURS le foyer de son dossier. `security definer` :
-- la lecture du dossier doit passer outre la RLS des dossiers — la fonction
-- n'est pas une surface d'appel client (revoke explicite, motif 0124).
create or replace function private.align_document_household()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
  as $$
begin
  if new.folder_id is not null then
    new.household_id := (
      select f.household_id from public.document_folders f where f.id = new.folder_id
    );
    if new.household_id is null then
      raise exception 'document: dossier introuvable %', new.folder_id;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.align_document_household() from public;

create trigger documents_align_household
  before insert or update of folder_id on public.documents
  for each row execute function private.align_document_household();

create index if not exists documents_household_folder_idx
  on public.documents (household_id, folder_id);
create index if not exists documents_household_expires_idx
  on public.documents (household_id, expires_on);
create index if not exists document_folders_household_idx
  on public.document_folders (household_id);

-- ---------------------------------------------------------------------------
-- Les politiques : motif foyer plat, écrites ici car les tables sont nées
-- après la boucle génératrice de 0007.
-- ---------------------------------------------------------------------------
alter table public.document_folders enable row level security;
alter table public.documents enable row level security;

create policy document_folders_select_household on public.document_folders
  for select using (private.is_household_member(household_id));

create policy document_folders_insert_household on public.document_folders
  for insert with check (
    private.can_write_household(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
  );

create policy document_folders_update_household on public.document_folders
  for update using (
    private.can_write_household(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
  )
  with check (
    private.can_write_household(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
  );

create policy document_folders_delete_household on public.document_folders
  for delete using (private.can_write_household(household_id));

create policy documents_select_household on public.documents
  for select using (private.is_household_member(household_id));

create policy documents_insert_household on public.documents
  for insert with check (
    private.can_write_household(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
  );

create policy documents_update_household on public.documents
  for update using (
    private.can_write_household(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
  )
  with check (
    private.can_write_household(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
  );

create policy documents_delete_household on public.documents
  for delete using (private.can_write_household(household_id));

commit;
