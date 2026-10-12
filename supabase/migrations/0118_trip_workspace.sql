-- 0118_trip_workspace.sql
-- Phase 15 Espace voyage (plan 15-01, D-01/D-02/D-03/D-07/D-08) : fondation
-- serveur de l'espace voyage — schema, RLS, RPC atomiques, invites HMAC.
--
-- Modele (CONTEXT verrouille) : le voyage est un conteneur collaboratif SANS
-- visibilite foyer automatique. Participants = membres selectionnes
-- (admin/membre, enfants exclus comme ardoise) + invites externes via code
-- (motif HMAC des invites cadeaux/ardoise). Donnees propres au voyage :
-- `trip_id` nullable sur shopping_lists/notes/tasks/places + ardoise liee
-- via `ardoises.trip_id` UNIQUE (1 voyage = 1 ardoise max) ; les depenses
-- atteignent le voyage par leur ardoise, jamais de `trip_id` direct.
-- Fermeture douce (fige, reouvrable admin), jamais de cascade destructive.
-- Anciens voyages : table rase (DELETE, seed demo intacte).
-- Admins : voient tous les voyages (moderation) sans y participer.
--
-- Etape 1 (tracer, ce bloc) : colonnes, tables neuves, helpers, politiques
-- RLS reconjointes, triggers d'alignement, publication Realtime, DELETE
-- table rase. Etape 2 (bloc suivant, meme fichier, vers l'avant uniquement) :
-- RPC atomiques + invites.
--
-- Vers l'avant uniquement, aucune migration appliquee retouchee (AGENTS.md
-- §2.7A). Les politiques sont recoupees sous leurs NOMS existants (pas de
-- churn des dependants) ; seules trip_members/trip_guests gagnent des noms
-- neufs. Toute table s'ecrit `public.*` (search_path vide ne resout rien).

begin;

-- ---------------------------------------------------------------------------
-- A. Voyages : auteur, onglets, fermeture douce.
-- ---------------------------------------------------------------------------
alter table public.trips
  add column created_by text references public.household_members (id) on delete set null;
alter table public.trips
  add column tab_state jsonb not null default
    '{"infos": true, "courses": true, "notes": true, "taches": true, "adresses": true, "budget": true, "parametres": true}'::jsonb;
alter table public.trips
  add column is_closed boolean not null default false;

comment on column public.trips.created_by is
  'Membre createur du voyage (moderation). NULL si le membre a disparu.';
comment on column public.trips.tab_state is
  'Onglets de la fiche voyage. Desactiver = masquer, jamais supprimer.';
comment on column public.trips.is_closed is
  'Fermeture douce (D-08) : fige les ecritures, reouvrable admin, sans cascade.';

-- ---------------------------------------------------------------------------
-- B. Ardoise liee : un voyage = une ardoise max (UNIQUE), meme foyer exige.
-- ---------------------------------------------------------------------------
alter table public.ardoises
  add column trip_id text references public.trips (id) on delete set null;
alter table public.ardoises
  add constraint ardoises_trip_id_key unique (trip_id);

comment on column public.ardoises.trip_id is
  'Voyage proprietaire (D-02/D-03) : NULL = ardoise de foyer classique.';

-- ---------------------------------------------------------------------------
-- C. Lignes propres au voyage : `trip_id` nullable sur les 4 tables, jamais
--    sur expenses (qui n''atteignent le voyage que par leur ardoise, D-02).
-- ---------------------------------------------------------------------------
alter table public.shopping_lists
  add column trip_id text references public.trips (id) on delete set null;
alter table public.notes
  add column trip_id text references public.trips (id) on delete set null;
alter table public.tasks
  add column trip_id text references public.trips (id) on delete set null;
alter table public.places
  add column trip_id text references public.trips (id) on delete set null;

create index shopping_lists_trip_idx on public.shopping_lists (trip_id);
create index notes_trip_idx on public.notes (trip_id);
create index tasks_trip_idx on public.tasks (trip_id);
create index places_trip_idx on public.places (trip_id);

comment on column public.shopping_lists.trip_id is 'Voyage proprietaire, NULL = liste de foyer.';
comment on column public.notes.trip_id is 'Voyage proprietaire, NULL = note de foyer.';
comment on column public.tasks.trip_id is 'Voyage proprietaire, NULL = tache de foyer.';
comment on column public.places.trip_id is 'Voyage proprietaire, NULL = adresse de foyer.';

-- ---------------------------------------------------------------------------
-- D. Tables neuves : membres, invites externes, codes d''invitation.
-- ---------------------------------------------------------------------------
create table public.trip_members (
  trip_id text not null references public.trips (id) on delete cascade,
  member_id text not null references public.household_members (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (trip_id, member_id)
);
comment on table public.trip_members is
  'Participants du voyage : membres admin/membre du foyer (enfants exclus, D-01). Acces derive du voyage.';

create table public.trip_guests (
  id text primary key default private.new_id('trip-guest'),
  trip_id text not null references public.trips (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  ticket_hash text check (ticket_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  constraint trip_guests_ticket_key unique (ticket_hash)
);
comment on table public.trip_guests is
  'Invites externes d''un voyage (sans compte, miroir ardoise_guests). ticket_hash NULL = payeur nomme sans acces (motif 0067) ; sinon seul le HMAC du ticket est stocke.';
comment on column public.trip_guests.ticket_hash is
  'Empreinte du ticket d''acces, NULL pour un payeur nomme sans acces.';

create table public.trip_invites (
  id text primary key default private.new_id('trip-invite'),
  trip_id text not null references public.trips (id) on delete cascade,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz,
  max_uses integer not null default 20 check (max_uses between 1 and 100),
  use_count integer not null default 0 check (use_count >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint trip_invites_hash_key unique (token_hash),
  constraint trip_invites_uses_check check (use_count <= max_uses)
);
comment on table public.trip_invites is
  'Empreinte HMAC-SHA-256 des codes de partage d''un voyage (miroir gift_list_invites, secret dedie TRIP_INVITE_HMAC_SECRET). Le code brut n''est jamais persiste.';

create index trip_members_member_idx on public.trip_members (member_id);
create index trip_guests_trip_idx on public.trip_guests (trip_id);
create index trip_invites_trip_idx on public.trip_invites (trip_id, is_active);

alter table public.trip_members enable row level security;
alter table public.trip_guests enable row level security;
alter table public.trip_invites enable row level security;

-- Codes : structurellement invisibles et inscriptibles pour les clients
-- (motif 0002/0009/0079) — seuls les RPC service_role y touchent, eux-memes
-- appeles par l'Edge trip-invite.
revoke all on table public.trip_invites from anon, authenticated;
revoke all on table public.trip_invites from public;
grant all on table public.trip_invites to service_role;

-- ---------------------------------------------------------------------------
-- E. Helpers : foyer du voyage, appartenance, ouverture. SECURITY DEFINER :
--    ils contournent la RLS comme leurs aines (0006/0057) et portent la
--    frontiere d'autorisation.
-- ---------------------------------------------------------------------------
create or replace function private.trip_household_id(p_trip_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select t.household_id from public.trips t where t.id = p_trip_id;
$$;

-- Membre OU participant du voyage, OU admin du foyer (D-07 : les admins
-- voient tous les voyages sans y participer). NULL = jamais membre.
create or replace function private.is_trip_member(p_trip_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_trip_id is null then false
    else exists (
      select 1
        from public.trip_members tm
        join public.trips t on t.id = tm.trip_id
       where tm.trip_id = p_trip_id
         and (
           tm.member_id = private.current_member_id(t.household_id)
           or private.is_household_admin(t.household_id)
         )
    )
  end;
$$;

-- Un voyage fige n'accepte plus d'ecritures (D-08) mais reste lisible.
create or replace function private.trip_is_open(p_trip_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.trips t
     where t.id = p_trip_id
       and not t.is_closed
  );
$$;

grant execute on function private.trip_household_id(text) to authenticated, service_role;
grant execute on function private.is_trip_member(text) to authenticated, service_role;
grant execute on function private.trip_is_open(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- F. RLS : le conjonct `is_trip_member` rejoint chaque politique des voyages
--    et des 4 tables (un conjonct oublie fait echouer la suite 0053, pas la
--    production — T-15-05). Les conditions foyer existantes sont conservees
--    telles quelles (les deux doivent tenir) ; les lignes de foyer
--    (trip_id NULL) gardent leur regime historique.
-- ---------------------------------------------------------------------------

-- Voyages : visibles aux participants + admins (D-07), creation directe
-- reservee aux admins (les membres passent par create_trip_atomic, qui
-- inscrit les participants et cree l'ardoise liee dans la meme transaction).
drop policy if exists trips_select_household on public.trips;
create policy trips_select_household on public.trips
  for select using (
    private.is_household_member(household_id)
    and private.is_trip_member(id)
  );

drop policy if exists trips_insert_household on public.trips;
create policy trips_insert_household on public.trips
  for insert with check (
    private.can_write_household(household_id)
    and private.is_household_admin(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
  );

drop policy if exists trips_update_household on public.trips;
create policy trips_update_household on public.trips
  for update using (
    private.can_write_household(household_id)
    and private.is_trip_member(id)
    and private.trip_is_open(id)
  )
  with check (
    private.can_write_household(household_id)
    and private.is_trip_member(id)
    and private.trip_is_open(id)
  );

drop policy if exists trips_delete_admin on public.trips;
create policy trips_delete_admin on public.trips
  for delete using (
    private.is_household_admin(household_id)
    and private.is_trip_member(id)
    and private.trip_is_open(id)
  );

-- Listes de courses.
drop policy if exists shopping_lists_select_household on public.shopping_lists;
create policy shopping_lists_select_household on public.shopping_lists
  for select using (
    private.is_household_member(household_id)
    and (trip_id is null or private.is_trip_member(trip_id))
  );

drop policy if exists shopping_lists_insert_household on public.shopping_lists;
create policy shopping_lists_insert_household on public.shopping_lists
  for insert with check (
    private.can_write_household(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
    and (trip_id is null or (private.is_trip_member(trip_id) and private.trip_is_open(trip_id)))
  );

drop policy if exists shopping_lists_update_household on public.shopping_lists;
create policy shopping_lists_update_household on public.shopping_lists
  for update using (
    private.can_write_household(household_id)
    and (trip_id is null or (private.is_trip_member(trip_id) and private.trip_is_open(trip_id)))
  )
  with check (
    private.can_write_household(household_id)
    and (trip_id is null or (private.is_trip_member(trip_id) and private.trip_is_open(trip_id)))
  );

drop policy if exists shopping_lists_delete_admin on public.shopping_lists;
create policy shopping_lists_delete_admin on public.shopping_lists
  for delete using (
    private.is_household_admin(household_id)
    and (trip_id is null or (private.is_trip_member(trip_id) and private.trip_is_open(trip_id)))
  );

-- Notes (clauses dossier 0051/0081 conservees).
drop policy if exists notes_select_household on public.notes;
create policy notes_select_household on public.notes
  for select using (
    private.is_household_member(household_id)
    and private.folder_visible('note_folders', folder_id, household_id)
    and (trip_id is null or private.is_trip_member(trip_id))
  );

drop policy if exists notes_insert_household on public.notes;
create policy notes_insert_household on public.notes
  for insert with check (
    private.can_write_household(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
    and private.folder_visible('note_folders', folder_id, household_id)
    and (trip_id is null or (private.is_trip_member(trip_id) and private.trip_is_open(trip_id)))
  );

drop policy if exists notes_update_household on public.notes;
create policy notes_update_household on public.notes
  for update using (
    private.can_write_household(household_id)
    and private.folder_visible('note_folders', folder_id, household_id)
    and (trip_id is null or (private.is_trip_member(trip_id) and private.trip_is_open(trip_id)))
  )
  with check (
    private.can_write_household(household_id)
    and private.folder_visible('note_folders', folder_id, household_id)
    and (trip_id is null or (private.is_trip_member(trip_id) and private.trip_is_open(trip_id)))
  );

drop policy if exists notes_delete_admin on public.notes;
create policy notes_delete_admin on public.notes
  for delete using (
    private.is_household_admin(household_id)
    and (trip_id is null or (private.is_trip_member(trip_id) and private.trip_is_open(trip_id)))
  );

-- Taches (clauses dossier + auteur 0051/0081 conservees).
drop policy if exists tasks_select_household on public.tasks;
create policy tasks_select_household on public.tasks
  for select using (
    private.is_household_member(household_id)
    and private.folder_visible('task_lists', folder_id, household_id)
    and (trip_id is null or private.is_trip_member(trip_id))
  );

drop policy if exists tasks_insert_household on public.tasks;
create policy tasks_insert_household on public.tasks
  for insert with check (
    private.can_write_household(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
    and private.folder_visible('task_lists', folder_id, household_id)
    and (trip_id is null or (private.is_trip_member(trip_id) and private.trip_is_open(trip_id)))
  );

drop policy if exists tasks_update_household on public.tasks;
create policy tasks_update_household on public.tasks
  for update using (
    private.can_write_household(household_id)
    and private.folder_visible('task_lists', folder_id, household_id)
    and (trip_id is null or (private.is_trip_member(trip_id) and private.trip_is_open(trip_id)))
  )
  with check (
    private.can_write_household(household_id)
    and private.folder_visible('task_lists', folder_id, household_id)
    and (trip_id is null or (private.is_trip_member(trip_id) and private.trip_is_open(trip_id)))
  );

drop policy if exists tasks_delete_admin on public.tasks;
create policy tasks_delete_admin on public.tasks
  for delete using (
    private.is_household_admin(household_id)
    and (trip_id is null or (private.is_trip_member(trip_id) and private.trip_is_open(trip_id)))
  );

-- Adresses.
drop policy if exists places_select_household on public.places;
create policy places_select_household on public.places
  for select using (
    private.is_household_member(household_id)
    and (trip_id is null or private.is_trip_member(trip_id))
  );

drop policy if exists places_insert_household on public.places;
create policy places_insert_household on public.places
  for insert with check (
    private.can_write_household(household_id)
    and (trip_id is null or (private.is_trip_member(trip_id) and private.trip_is_open(trip_id)))
  );

drop policy if exists places_update_household on public.places;
create policy places_update_household on public.places
  for update using (
    private.can_write_household(household_id)
    and (trip_id is null or (private.is_trip_member(trip_id) and private.trip_is_open(trip_id)))
  )
  with check (
    private.can_write_household(household_id)
    and (trip_id is null or (private.is_trip_member(trip_id) and private.trip_is_open(trip_id)))
  );

drop policy if exists places_delete_admin on public.places;
create policy places_delete_admin on public.places
  for delete using (
    private.is_household_admin(household_id)
    and (trip_id is null or (private.is_trip_member(trip_id) and private.trip_is_open(trip_id)))
  );

-- Participants : lisibles par les participants + admins du voyage (pas de
-- visibilite foyer automatique). Aucune politique d'ecriture : inscription
-- par RPC seuls (create_trip_atomic, redeem_trip_invite), depart par
-- trip_leave — jamais en PostgREST direct.
drop policy if exists trip_members_select on public.trip_members;
create policy trip_members_select on public.trip_members
  for select using (
    private.is_household_member(private.trip_household_id(trip_id))
    and private.is_trip_member(trip_id)
  );

-- Invites : lisibles par les participants + admins (la surprise du partage
-- cadeau ne s'applique pas ici — le voyage est collaboratif). Aucune ecriture
-- directe : l'Edge seule delivre les tickets.
drop policy if exists trip_guests_select on public.trip_guests;
create policy trip_guests_select on public.trip_guests
  for select using (
    private.is_household_member(private.trip_household_id(trip_id))
    and private.is_trip_member(trip_id)
  );

-- ---------------------------------------------------------------------------
-- G. Triggers : anti-forge trip_id→household (T-15-03), dossiers hors voyage,
--    assignes dans le voyage, lien ardoise meme foyer, foyer du voyage fige.
-- ---------------------------------------------------------------------------

-- Un trip_id forge dans un autre foyer est REJETE, jamais reecrit : reecrire
-- deplacerait silencieusement la ligne dans un foyer que l'appelant ne voit
-- pas. Sans trip_id, la ligne garde son regime de foyer classique.
create or replace function private.align_trip_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id text;
begin
  if new.trip_id is null then
    return new;
  end if;
  select t.household_id into v_household_id
    from public.trips t
   where t.id = new.trip_id;
  if v_household_id is null then
    raise exception 'voyage introuvable : %', new.trip_id using errcode = '23503';
  end if;
  if new.household_id <> v_household_id then
    raise exception 'voyage d''un autre foyer' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Variante taches/notes : en plus, une ligne de voyage ne vit dans aucun
-- dossier (CONTEXT : task_lists/note_folders restent foyer, folder_id NULL).
create or replace function private.align_trip_item_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id text;
begin
  if new.trip_id is null then
    return new;
  end if;
  select t.household_id into v_household_id
    from public.trips t
   where t.id = new.trip_id;
  if v_household_id is null then
    raise exception 'voyage introuvable : %', new.trip_id using errcode = '23503';
  end if;
  if new.household_id <> v_household_id then
    raise exception 'voyage d''un autre foyer' using errcode = '23514';
  end if;
  if new.folder_id is not null then
    raise exception 'une ligne de voyage ne vit dans aucun dossier' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists align_trip_scope on public.shopping_lists;
create trigger align_trip_scope
  before insert or update of trip_id, household_id on public.shopping_lists
  for each row execute function private.align_trip_scope();

drop trigger if exists align_trip_scope on public.places;
create trigger align_trip_scope
  before insert or update of trip_id, household_id on public.places
  for each row execute function private.align_trip_scope();

drop trigger if exists align_trip_item_scope on public.tasks;
create trigger align_trip_item_scope
  before insert or update of trip_id, household_id, folder_id on public.tasks
  for each row execute function private.align_trip_item_scope();

drop trigger if exists align_trip_item_scope on public.notes;
create trigger align_trip_item_scope
  before insert or update of trip_id, household_id, folder_id on public.notes
  for each row execute function private.align_trip_item_scope();

-- Le foyer d'un voyage ne change jamais : le deplacer re-parenteraient
-- silencieusement membres, lignes et ardoise liee (T-15-03).
create or replace function private.forbid_trip_household_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.household_id <> old.household_id then
    raise exception 'le foyer d''un voyage ne change pas' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists forbid_trip_household_change on public.trips;
create trigger forbid_trip_household_change
  before update of household_id on public.trips
  for each row execute function private.forbid_trip_household_change();

-- Assigne d'une tache de voyage ∈ membres du voyage (CONTEXT ranges).
create or replace function private.check_trip_task_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip_id text;
begin
  select t.trip_id into v_trip_id
    from public.tasks t
   where t.id = new.task_id;
  if v_trip_id is null then
    return new;
  end if;
  if not exists (
    select 1
      from public.trip_members tm
     where tm.trip_id = v_trip_id
       and tm.member_id = new.member_id
  ) then
    raise exception 'l''assigné n''est pas membre du voyage' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists check_trip_task_assignee on public.task_assignees;
create trigger check_trip_task_assignee
  before insert or update of task_id, member_id on public.task_assignees
  for each row execute function private.check_trip_task_assignee();

-- Une ardoise = un voyage = un foyer : le lien est refuse quand les foyers
-- different (garde contre le melange inter-voyages via l'ardoise).
create or replace function private.check_ardoise_trip_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id text;
begin
  if new.trip_id is null then
    return new;
  end if;
  select t.household_id into v_household_id
    from public.trips t
   where t.id = new.trip_id;
  if v_household_id is null then
    raise exception 'voyage introuvable : %', new.trip_id using errcode = '23503';
  end if;
  if new.household_id <> v_household_id then
    raise exception 'ardoise et voyage de foyers différents' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists check_ardoise_trip_link on public.ardoises;
create trigger check_ardoise_trip_link
  before insert or update of trip_id, household_id on public.ardoises
  for each row execute function private.check_ardoise_trip_link();

revoke all on function private.align_trip_scope() from public, anon, authenticated;
revoke all on function private.align_trip_item_scope() from public, anon, authenticated;
revoke all on function private.forbid_trip_household_change() from public, anon, authenticated;
revoke all on function private.check_trip_task_assignee() from public, anon, authenticated;
revoke all on function private.check_ardoise_trip_link() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- H. Realtime : publication additive uniquement (motif 0110) — jamais
--    reconstruite. trip_invites RESTE hors publication (empreintes HMAC).
-- ---------------------------------------------------------------------------
do $$
declare
  r text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'Publication supabase_realtime absente : Realtime non active sur cette stack.';
    return;
  end if;

  foreach r in array array['trip_members', 'trip_guests'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', r);
    exception when others then
      raise notice 'table % ignoree pour Realtime : %', r, sqlerrm;
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- I. Table rase (D-06) : les voyages d'avant le conteneur collaboratif sont
--    supprimes — leurs lignes trip_id sont toutes NULL a ce stade, donc
--    aucune ligne metier n'est touchee. La seed demo (Dexie locale, id
--    'trip-1' « Week-end a Lisbonne ») ne vit jamais en SQL mais est
--    preservee defensivement si elle y apparaissait un jour.
-- ---------------------------------------------------------------------------
delete from public.trips where id <> 'trip-1';

commit;
