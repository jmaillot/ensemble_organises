-- 0122_recettes_full.sql
-- Phase 16 Recettes du foyer (plan 16-01, tracer serveur) : socle serveur
-- complet — schema, RLS, RPC atomiques, partages HMAC.
--
-- Modele (SPEC/R2-R11, CONTEXT D-14) : `public.recipes` (0003) est ETENDUE
-- vers l'avant (ALTER, jamais de recreation) ; 7 tables neuves portent les
-- enfants (categories, tags + liens, ingredients, etapes, favoris, partages).
-- Chaque enfant porte `recipe_id ON DELETE CASCADE` + `household_id`
-- denormalise aligne sur la recette par le trigger conventionnel
-- `align_household` (motif 0008, reecriture), plus garde du second parent
-- (`check_recipe_link_scope` : tag et membre du meme foyer).
--
-- RLS : SELECT via `is_household_member` (enfant inclus, lecture seule R10),
-- INSERT/UPDATE/DELETE via `can_write_household` (admin/membre seuls, R10).
-- `recipe_shares` est structurellement invisible et inscriptible pour les
-- clients (aucune politique, GRANT service_role seuls — prohibition R11) :
-- la lecture invitee passe uniquement par le RPC `view_recipe_share`.
--
-- Partages : lien seul `link-view` (pas d'inscription externe en lecture
-- seule — RESEARCH OQ-2) ; le RPC verrouille `FOR UPDATE`, rend l'oracle
-- unique `code invalide` et consomme `use_count` atomiquement (hypothese
-- SPEC edge max-uses=1). Secret HMAC `RECIPE_INVITE_HMAC_SECRET` : cette
-- migration n'en stocke que le NOM — l'empreinte arrive calculee par l'Edge.
--
-- Seeds : categorie `Recettes du foyer` + 14 tags SPEC R4 par foyer existant,
-- et fonction `ensure_recipe_defaults` appelee par trigger a chaque creation
-- de foyer (idempotente, `on conflict do nothing`).
--
-- Vers l'avant uniquement, aucune migration appliquee retouchee (AGENTS.md
-- §2.7A). Toute table s'ecrit `public.*` (search_path vide ne resout rien).

begin;

-- ---------------------------------------------------------------------------
-- A. `recipes` : extension vers l'avant (colonnes R3 + couverture R9).
-- ---------------------------------------------------------------------------
alter table public.recipes
  add column servings integer check (servings is null or servings between 1 and 48);
alter table public.recipes
  add column prep_minutes integer check (prep_minutes is null or prep_minutes between 0 and 10080);
alter table public.recipes
  add column cook_minutes integer check (cook_minutes is null or cook_minutes between 0 and 10080);
alter table public.recipes
  add column cover_photo text;
alter table public.recipes
  add column created_by text references public.household_members (id) on delete set null;

comment on column public.recipes.servings is
  'Nombre de personnes de reference (R3/R8) : base du scaler client 2-12.';
comment on column public.recipes.cover_photo is
  'CHEMIN du bucket prive household-media (motif couverture 0118/voyages), jamais d''URL persistee.';
comment on column public.recipes.created_by is
  'Membre createur (moderation). NULL pour les lignes heritees.';

create index recipes_household_idx on public.recipes (household_id);

-- ---------------------------------------------------------------------------
-- B. Tables neuves.
-- ---------------------------------------------------------------------------
create table public.recipe_categories (
  id text primary key default private.new_id('recipe-category'),
  household_id text not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  created_at timestamptz not null default now(),
  constraint recipe_categories_household_name_key unique (household_id, name)
);
comment on table public.recipe_categories is
  'Categories d''un foyer (R2). `Recettes du foyer` existe par defaut ; la suppression d''une categorie pleine reassigne ses recettes vers le defaut (trigger serveur).';

-- Rattachement tardif : la reference exige la table ci-dessus (creee avant).
alter table public.recipes
  add column category_id text references public.recipe_categories (id) on delete set null;

comment on column public.recipes.category_id is
  'Categorie du foyer (NULL = Recettes du foyer par convention d''affichage). Reassignation serveur a la suppression d''une categorie pleine.';

create index recipes_category_idx on public.recipes (category_id);

create table public.recipe_tags (
  id text primary key default private.new_id('recipe-tag'),
  household_id text not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  created_at timestamptz not null default now(),
  constraint recipe_tags_household_name_key unique (household_id, name)
);
comment on table public.recipe_tags is
  'Etiquettes d''un foyer (R4) : 14 seeds + creation a la volee a la saisie.';

create table public.recipe_tag_links (
  recipe_id text not null references public.recipes (id) on delete cascade,
  tag_id text not null references public.recipe_tags (id) on delete cascade,
  household_id text not null references public.households (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (recipe_id, tag_id)
);
comment on table public.recipe_tag_links is
  'Lien recette <-> tag (R4, multi-tags). Supprimer un tag ne detruit que ses liens.';

create table public.recipe_ingredients (
  id text primary key default private.new_id('recipe-ingredient'),
  recipe_id text not null references public.recipes (id) on delete cascade,
  household_id text not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  quantity numeric(10, 2),
  unit text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
comment on table public.recipe_ingredients is
  'Ingredients structures (R6) : quantity NULL = « au gout », affiche tel quel a toutes les echelles (R8).';
comment on column public.recipe_ingredients.quantity is
  'Nombre decimal optionnel (numeric 10,2 comme shopping_list_items). NULL = sans nombre (« au gout »).';

create table public.recipe_steps (
  id text primary key default private.new_id('recipe-step'),
  recipe_id text not null references public.recipes (id) on delete cascade,
  household_id text not null references public.households (id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 5000),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
comment on table public.recipe_steps is
  'Etapes numerotees (R7) : numero = rang par position, persistance serveur du DnD.';

create table public.recipe_favorites (
  recipe_id text not null references public.recipes (id) on delete cascade,
  member_id text not null references public.household_members (id) on delete cascade,
  household_id text not null references public.households (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (recipe_id, member_id)
);
comment on table public.recipe_favorites is
  'Favoris par membre (R13).';

create table public.recipe_shares (
  id text primary key default private.new_id('recipe-share'),
  recipe_id text not null references public.recipes (id) on delete cascade,
  household_id text not null references public.households (id) on delete cascade,
  share_hash text not null check (share_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz,
  max_uses integer not null default 20 check (max_uses between 1 and 100),
  use_count integer not null default 0 check (use_count >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint recipe_shares_hash_key unique (share_hash),
  constraint recipe_shares_uses_check check (use_count <= max_uses)
);
comment on table public.recipe_shares is
  'Empreinte HMAC-SHA-256 des liens de partage d''une recette (secret dedie RECIPE_INVITE_HMAC_SECRET). Le code brut n''est jamais persiste. Lecture invitee via RPC service_role seul (prohibition R11).';

create index recipe_tag_links_tag_idx on public.recipe_tag_links (tag_id);
create index recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id, position);
create index recipe_steps_recipe_idx on public.recipe_steps (recipe_id, position);
create index recipe_favorites_member_idx on public.recipe_favorites (member_id);
create index recipe_shares_recipe_idx on public.recipe_shares (recipe_id, is_active);

alter table public.recipe_categories enable row level security;
alter table public.recipe_tags enable row level security;
alter table public.recipe_tag_links enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps enable row level security;
alter table public.recipe_favorites enable row level security;
alter table public.recipe_shares enable row level security;

-- Partages : structurellement invisibles et inscriptibles pour les clients
-- (motif trip_invites 0118) — seuls les RPC service_role y touchent, eux-memes
-- appeles par l'Edge recipe-invite.
revoke all on table public.recipe_shares from anon, authenticated;
revoke all on table public.recipe_shares from public;
grant all on table public.recipe_shares to service_role;

-- ---------------------------------------------------------------------------
-- C. Helpers : alignement foyer, reassignment categorie, seeds.
-- ---------------------------------------------------------------------------
-- Garde du second parent (apres `align_household`, qui a deja reecrit
-- NEW.household_id sur le foyer de la recette) : le tag d'un lien et le
-- membre d'un favori appartiennent au meme foyer que la recette.
create or replace function private.check_recipe_link_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_other_household text;
begin
  if TG_TABLE_NAME = 'recipe_tag_links' then
    select t.household_id into v_other_household
      from public.recipe_tags t
     where t.id = NEW.tag_id;
    if v_other_household is null then
      raise exception 'etiquette introuvable' using errcode = '23503';
    end if;
    if v_other_household <> NEW.household_id then
      raise exception 'etiquette d''un autre foyer' using errcode = '23514';
    end if;
  elsif TG_TABLE_NAME = 'recipe_favorites' then
    if not private.member_in_household(NEW.member_id, NEW.household_id) then
      raise exception 'membre d''un autre foyer' using errcode = '23514';
    end if;
  end if;
  return NEW;
end;
$$;

comment on function private.check_recipe_link_scope() is
  'Second parent des liens et favoris de recette : tag et membre du meme foyer que la recette (complete align_household).';

revoke all on function private.check_recipe_link_scope() from public, anon, authenticated;

-- Suppression d'une categorie : ses recettes rejoignent la categorie
-- `Recettes du foyer` du meme foyer (R2) ; si le defaut manque (c'est lui
-- qu'on supprime), elles passent a NULL.
create or replace function private.reassign_recipe_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_default_id text;
begin
  select c.id into v_default_id
    from public.recipe_categories c
   where c.household_id = OLD.household_id
     and c.name = 'Recettes du foyer'
     and c.id <> OLD.id
   limit 1;
  if v_default_id is not null then
    update public.recipes
       set category_id = v_default_id
     where category_id = OLD.id;
  else
    update public.recipes
       set category_id = null
     where category_id = OLD.id;
  end if;
  return OLD;
end;
$$;

comment on function private.reassign_recipe_category() is
  'Suppression d''une categorie pleine (R2) : reassigne ses recettes vers `Recettes du foyer`, jamais de perte ni de blocage.';

revoke all on function private.reassign_recipe_category() from public, anon, authenticated;

-- Seeds idempotents (R2/R4) : defaut + 14 tags, pour les foyers existants
-- (section G) comme pour chaque foyer cree (trigger households).
create or replace function private.ensure_recipe_defaults(p_household_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_household_id is null then
    return;
  end if;
  insert into public.recipe_categories (household_id, name)
  values (p_household_id, 'Recettes du foyer')
  on conflict do nothing;
  insert into public.recipe_tags (household_id, name)
  select p_household_id, seed.tag_name
    from (values
      ('Apéro'), ('Entrée'), ('Plat'), ('Dessert'), ('Goûter'), ('Petit-déj'),
      ('Boissons'), ('Asie'), ('Italien'), ('Mexicain'), ('Oriental'),
      ('Pâtes'), ('Végétarien'), ('Poisson')
    ) as seed(tag_name)
  on conflict do nothing;
end;
$$;

comment on function private.ensure_recipe_defaults(text) is
  'Cree la categorie `Recettes du foyer` + les 14 tags R4 manquants (idempotent).';

revoke all on function private.ensure_recipe_defaults(text) from public, anon, authenticated;
grant execute on function private.ensure_recipe_defaults(text) to service_role;

create or replace function private.seed_recipe_defaults_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ensure_recipe_defaults(NEW.id);
  return NEW;
end;
$$;

comment on function private.seed_recipe_defaults_trigger() is
  'Seed recettes a la creation de chaque foyer (categories + tags R2/R4).';

revoke all on function private.seed_recipe_defaults_trigger() from public, anon, authenticated;

drop trigger if exists seed_recipe_defaults on public.households;
create trigger seed_recipe_defaults
  after insert on public.households
  for each row execute function private.seed_recipe_defaults_trigger();

-- ---------------------------------------------------------------------------
-- D. RLS : SELECT membre (enfant inclus, R10), ecritures writer seuls.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select *
    from (values
      ('recipe_categories'),
      ('recipe_tags'),
      ('recipe_tag_links'),
      ('recipe_ingredients'),
      ('recipe_steps'),
      ('recipe_favorites')
    ) as t(table_name)
  loop
    execute format('drop policy if exists %I on public.%I', r.table_name || '_select_household', r.table_name);
    execute format(
      'create policy %I on public.%I for select using (private.is_household_member(household_id))',
      r.table_name || '_select_household', r.table_name
    );

    execute format('drop policy if exists %I on public.%I', r.table_name || '_insert_household', r.table_name);
    execute format(
      'create policy %I on public.%I for insert with check (private.can_write_household(household_id))',
      r.table_name || '_insert_household', r.table_name
    );

    execute format('drop policy if exists %I on public.%I', r.table_name || '_update_household', r.table_name);
    execute format(
      'create policy %I on public.%I for update using (private.can_write_household(household_id))'
      ' with check (private.can_write_household(household_id))',
      r.table_name || '_update_household', r.table_name
    );

    execute format('drop policy if exists %I on public.%I', r.table_name || '_delete_household', r.table_name);
    execute format(
      'create policy %I on public.%I for delete using (private.can_write_household(household_id))',
      r.table_name || '_delete_household', r.table_name
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- E. Triggers d'alignement : `align_household` conventionnel (0008,
-- reecriture sur le foyer de la recette) + garde du second parent sur
-- liens et favoris. L'ordre d'execution suit l'ordre alphabetique :
-- align_household d'abord, check_recipe_link_scope ensuite.
drop trigger if exists align_household on public.recipe_tag_links;
create trigger align_household
  before insert or update of recipe_id, tag_id, household_id on public.recipe_tag_links
  for each row execute function private.align_child_household('recipes', 'recipe_id');

drop trigger if exists check_recipe_link_scope on public.recipe_tag_links;
create trigger check_recipe_link_scope
  before insert or update of recipe_id, tag_id, household_id on public.recipe_tag_links
  for each row execute function private.check_recipe_link_scope();

drop trigger if exists align_household on public.recipe_ingredients;
create trigger align_household
  before insert or update of recipe_id, household_id on public.recipe_ingredients
  for each row execute function private.align_child_household('recipes', 'recipe_id');

drop trigger if exists align_household on public.recipe_steps;
create trigger align_household
  before insert or update of recipe_id, household_id on public.recipe_steps
  for each row execute function private.align_child_household('recipes', 'recipe_id');

drop trigger if exists align_household on public.recipe_favorites;
create trigger align_household
  before insert or update of recipe_id, member_id, household_id on public.recipe_favorites
  for each row execute function private.align_child_household('recipes', 'recipe_id');

drop trigger if exists check_recipe_link_scope on public.recipe_favorites;
create trigger check_recipe_link_scope
  before insert or update of recipe_id, member_id, household_id on public.recipe_favorites
  for each row execute function private.check_recipe_link_scope();

drop trigger if exists align_household on public.recipe_shares;
create trigger align_household
  before insert or update of recipe_id, household_id on public.recipe_shares
  for each row execute function private.align_child_household('recipes', 'recipe_id');

drop trigger if exists reassign_recipe_category on public.recipe_categories;
create trigger reassign_recipe_category
  before delete on public.recipe_categories
  for each row execute function private.reassign_recipe_category();

-- ---------------------------------------------------------------------------
-- F. RPC atomiques + partages (USAGE SERVEUR UNIQUEMENT : EXECUTE au seul
--    `service_role`, motif 0079/0118). L'Edge recipe-invite les appelle sous
--    l'identite de l'appelant (p_actor_id).
-- ---------------------------------------------------------------------------
create or replace function public.create_recipe_share(
  p_actor_id uuid,
  p_recipe_id text,
  p_share_hash text,
  p_expires_at timestamptz default null,
  p_max_uses integer default 20
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_household_id text;
  v_max_uses integer;
  v_expires_at timestamptz;
  v_share_id text;
begin
  if p_actor_id is null or p_recipe_id is null then
    raise exception 'acteur et recette obligatoires' using errcode = '22023';
  end if;
  select r.household_id into v_household_id
    from public.recipes r
   where r.id = p_recipe_id;
  if v_household_id is null then
    raise exception 'recette introuvable' using errcode = 'P0002';
  end if;
  perform private.assert_household_writer(v_household_id, p_actor_id);
  if p_share_hash is null or p_share_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'empreinte de partage invalide' using errcode = '22023';
  end if;

  v_max_uses := coalesce(p_max_uses, 20);
  if v_max_uses < 1 or v_max_uses > 100 then
    raise exception 'nombre d''utilisations invalide' using errcode = '22023';
  end if;

  if p_expires_at is null then
    v_expires_at := now() + interval '90 days';
  else
    if p_expires_at <= now() or p_expires_at > now() + interval '90 days' then
      raise exception 'expiration invalide' using errcode = '22023';
    end if;
    v_expires_at := p_expires_at;
  end if;

  -- Regeneration : le lien precedent DE CETTE RECETTE est desactive aussitot.
  update public.recipe_shares
     set is_active = false
   where recipe_id = p_recipe_id
     and is_active;

  insert into public.recipe_shares (
    recipe_id, household_id, share_hash, created_by, expires_at, max_uses, use_count, is_active
  ) values (
    p_recipe_id, v_household_id, p_share_hash, p_actor_id, v_expires_at, v_max_uses, 0, true
  )
  returning id into v_share_id;

  return jsonb_build_object(
    'share_id', v_share_id,
    'recipe_id', p_recipe_id,
    'expires_at', v_expires_at,
    'max_uses', v_max_uses
  );
end;
$$;

comment on function public.create_recipe_share(uuid, text, text, timestamptz, integer) is
  'USAGE SERVEUR UNIQUEMENT. Cree un lien de partage lecture seule (HMAC RECIPE_INVITE_HMAC_SECRET calcule par l''Edge) et desactive le precedent de la recette. Gestion : admin ou membre.';

create or replace function public.revoke_recipe_share(
  p_actor_id uuid,
  p_recipe_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_household_id text;
  v_revoked integer;
begin
  if p_actor_id is null or p_recipe_id is null then
    raise exception 'acteur et recette obligatoires' using errcode = '22023';
  end if;
  select r.household_id into v_household_id
    from public.recipes r
   where r.id = p_recipe_id;
  if v_household_id is null then
    raise exception 'recette introuvable' using errcode = 'P0002';
  end if;
  perform private.assert_household_writer(v_household_id, p_actor_id);

  update public.recipe_shares
     set is_active = false
   where recipe_id = p_recipe_id
     and is_active;

  get diagnostics v_revoked = row_count;

  return jsonb_build_object('recipe_id', p_recipe_id, 'revoked', v_revoked);
end;
$$;

comment on function public.revoke_recipe_share(uuid, text) is
  'USAGE SERVEUR UNIQUEMENT. Revoque tous les liens actifs de la recette. Gestion : admin ou membre.';

create or replace function public.recipe_share_summary(
  p_actor_id uuid,
  p_recipe_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_household_id text;
  v_out jsonb;
begin
  if p_actor_id is null or p_recipe_id is null then
    raise exception 'acteur et recette obligatoires' using errcode = '22023';
  end if;
  select r.household_id into v_household_id
    from public.recipes r
   where r.id = p_recipe_id;
  if v_household_id is null then
    raise exception 'recette introuvable' using errcode = 'P0002';
  end if;
  -- Gestion reverifyee ici : appelee en service_role, l'acteur est le
  -- parametre, jamais auth.uid() qui serait NULL (motif 0079/0118).
  perform private.assert_household_writer(v_household_id, p_actor_id);

  select jsonb_build_object(
           'share_id', s.id,
           'recipe_id', s.recipe_id,
           'is_active', s.is_active,
           'expires_at', s.expires_at,
           'max_uses', s.max_uses,
           'use_count', s.use_count,
           'created_at', s.created_at
         )
    into v_out
    from public.recipe_shares s
   where s.recipe_id = p_recipe_id
   order by s.created_at desc
   limit 1;

  return v_out;
end;
$$;

comment on function public.recipe_share_summary(uuid, text) is
  'USAGE SERVEUR UNIQUEMENT. Resume du dernier lien de la recette, sans son empreinte.';

-- Lecture invitee par lien (R11) : aucun JWT requis, compteur consomme
-- atomiquement sous verrou (hypothese SPEC max-uses=1). Toute forme de lien
-- invalide rend l'oracle unique `code invalide`.
create or replace function public.view_recipe_share(p_share_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_share public.recipe_shares%rowtype;
  v_recipe_title text;
  v_recipe_servings integer;
  v_recipe_prep integer;
  v_recipe_cook integer;
  v_recipe_cover text;
  v_category_name text;
  v_ingredients jsonb;
  v_steps jsonb;
  v_tags jsonb;
begin
  if p_share_hash is null or p_share_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'code invalide' using errcode = '22023';
  end if;

  -- Verrou pessimiste : deux lectures simultanees ne franchissent pas
  -- `use_count < max_uses` (motif 0017/0079/0118).
  select s.* into v_share
    from public.recipe_shares s
   where s.share_hash = p_share_hash
     and private.token_hash_matches(s.share_hash, p_share_hash)
    for update;
  if not found then
    raise exception 'code invalide' using errcode = 'P0002';
  end if;
  if not v_share.is_active
     or (v_share.expires_at is not null and v_share.expires_at <= now())
     or v_share.use_count >= v_share.max_uses then
    raise exception 'code invalide' using errcode = 'P0002';
  end if;

  select r.title, r.servings, r.prep_minutes, r.cook_minutes, r.cover_photo
    into v_recipe_title, v_recipe_servings, v_recipe_prep, v_recipe_cook, v_recipe_cover
    from public.recipes r
   where r.id = v_share.recipe_id;
  -- Recette disparue entre-temps (cascade) : oracle uniforme.
  if v_recipe_title is null then
    raise exception 'code invalide' using errcode = 'P0002';
  end if;

  select c.name into v_category_name
    from public.recipes r
    left join public.recipe_categories c on c.id = r.category_id
   where r.id = v_share.recipe_id;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', i.id,
             'name', i.name,
             'quantity', i.quantity,
             'unit', i.unit,
             'position', i.position
           )
           order by i.position, i.id
         ), '[]'::jsonb)
    into v_ingredients
    from public.recipe_ingredients i
   where i.recipe_id = v_share.recipe_id;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', st.id,
             'content', st.content,
             'position', st.position
           )
           order by st.position, st.id
         ), '[]'::jsonb)
    into v_steps
    from public.recipe_steps st
   where st.recipe_id = v_share.recipe_id;

  select coalesce(jsonb_agg(t.name order by t.name), '[]'::jsonb)
    into v_tags
    from public.recipe_tag_links l
    join public.recipe_tags t on t.id = l.tag_id
   where l.recipe_id = v_share.recipe_id;

  update public.recipe_shares
     set use_count = use_count + 1,
         is_active = (use_count + 1 < max_uses)
   where id = v_share.id;

  return jsonb_build_object(
    'recipe_id', v_share.recipe_id,
    'title', v_recipe_title,
    'servings', v_recipe_servings,
    'prep_minutes', v_recipe_prep,
    'cook_minutes', v_recipe_cook,
    'cover_photo', v_recipe_cover,
    'category', v_category_name,
    'ingredients', v_ingredients,
    'steps', v_steps,
    'tags', v_tags
  );
end;
$$;

comment on function public.view_recipe_share(text) is
  'USAGE SERVEUR UNIQUEMENT. Lecture d''une fiche par lien pour un visiteur sans compte (R11) : fiche + ingredients + etapes + tags, oracle `code invalide` unique, compteur consomme atomiquement.';

-- ---------------------------------------------------------------------------
-- Privileges : RPC serveur au seul `service_role` (motif 0009/0058/0079/0118).
-- ---------------------------------------------------------------------------
revoke all on function public.create_recipe_share(uuid, text, text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.revoke_recipe_share(uuid, text) from public, anon, authenticated;
revoke all on function public.recipe_share_summary(uuid, text) from public, anon, authenticated;
revoke all on function public.view_recipe_share(text) from public, anon, authenticated;
grant execute on function public.create_recipe_share(uuid, text, text, timestamptz, integer) to service_role;
grant execute on function public.revoke_recipe_share(uuid, text) to service_role;
grant execute on function public.recipe_share_summary(uuid, text) to service_role;
grant execute on function public.view_recipe_share(text) to service_role;

do $$
begin
  if has_function_privilege('authenticated', 'public.create_recipe_share(uuid,text,text,timestamptz,integer)', 'EXECUTE') then
    raise exception 'authenticated ne doit pas pouvoir creer un lien de recette';
  end if;
  if has_function_privilege('authenticated', 'public.view_recipe_share(text)', 'EXECUTE') then
    raise exception 'authenticated ne doit pas pouvoir lire une fiche invitee en direct';
  end if;
  if not has_function_privilege('service_role', 'public.view_recipe_share(text)', 'EXECUTE') then
    raise exception 'service_role doit pouvoir lire une fiche invitee';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- G. Seeds : defaut + tags pour chaque foyer existant (les foyers futurs
--    passent par le trigger seed_recipe_defaults).
-- ---------------------------------------------------------------------------
insert into public.recipe_categories (household_id, name)
select h.id, 'Recettes du foyer'
  from public.households h
 where not exists (
   select 1
     from public.recipe_categories c
    where c.household_id = h.id
      and c.name = 'Recettes du foyer'
 );

insert into public.recipe_tags (household_id, name)
select h.id, seed.tag_name
  from public.households h
  cross join (values
    ('Apéro'), ('Entrée'), ('Plat'), ('Dessert'), ('Goûter'), ('Petit-déj'),
    ('Boissons'), ('Asie'), ('Italien'), ('Mexicain'), ('Oriental'),
    ('Pâtes'), ('Végétarien'), ('Poisson')
  ) as seed(tag_name)
 where not exists (
   select 1
     from public.recipe_tags t
    where t.household_id = h.id
      and t.name = seed.tag_name
 );

commit;
