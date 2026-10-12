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
-- Etape 1 (tracer) : sections A a I — colonnes, tables neuves, helpers,
-- politiques RLS reconjointes, triggers d'alignement, publication Realtime,
-- DELETE table rase. Etape 2 (section J, meme transaction ci-dessous) : RPC
-- atomiques + invites.
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
-- voient tous les voyages sans y participer — la branche admin ne depend
-- d'aucune ligne de participants, sinon un voyage sans membres serait
-- invisible meme a l'admin). NULL = jamais membre.
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
        from public.trips t
       where t.id = p_trip_id
         and private.is_household_admin(t.household_id)
    ) or exists (
      select 1
        from public.trip_members tm
        join public.trips t on t.id = tm.trip_id
       where tm.trip_id = p_trip_id
         and tm.member_id = private.current_member_id(t.household_id)
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
-- J. RPC atomiques + invites (etape 2, meme transaction : un defaut de
--    RPC annule aussi le schema — le journal ne retient que le tout-vert).
--    USAGE SERVEUR UNIQUEMENT : EXECUTE au seul `service_role` (motif 0009/0058/0079) — un client `authenticated`
--    se voit refuser l'appel direct, ce que la suite 0053 verifie. L'Edge
--    trip-invite les appelle sous l'identite de l'appelant (p_actor_id).
-- ---------------------------------------------------------------------------

-- Gestion d'un voyage : admin du foyer OU participant (le createur non
-- participant et non admin ne gere pas — documente, pas d'oracle).
create or replace function private.assert_trip_manager(
  p_trip_id text,
  p_actor_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_household_id text;
  v_member_id text;
  v_role text;
begin
  select t.household_id into v_household_id
    from public.trips t
   where t.id = p_trip_id;
  if v_household_id is null then
    raise exception 'voyage introuvable' using errcode = 'P0002';
  end if;
  select m.id, m.role into v_member_id, v_role
    from public.household_members m
   where m.household_id = v_household_id and m.user_id = p_actor_id
   limit 1;
  if v_role = 'admin' then
    return v_household_id;
  end if;
  if v_member_id is not null and exists (
    select 1
      from public.trip_members tm
     where tm.trip_id = p_trip_id and tm.member_id = v_member_id
  ) then
    return v_household_id;
  end if;
  raise exception 'gestion du voyage réservée' using errcode = '42501';
end;
$$;

revoke all on function private.assert_trip_manager(text, uuid) from public, anon, authenticated;
grant execute on function private.assert_trip_manager(text, uuid) to service_role;

-- Creation atomique : voyage + participants + ardoise liee + inscriptions
-- ardoise, en UNE transaction (tout echec annule tout — D-01/D-02/D-03).
-- p_member_ids NULL = tous les admin/membre (motif 0066) ; sinon restreint
-- aux admin/membre du foyer (enfants, inconnus et autres foyers ignores).
create or replace function public.create_trip_atomic(
  p_actor_id uuid,
  p_household_id text,
  p_name text,
  p_destination text,
  p_start_date date,
  p_end_date date,
  p_notes text default null,
  p_member_ids text[] default null,
  p_tab_state jsonb default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_member_id text;
  v_trip_id text := private.new_id('trip');
  v_ardoise_id text := private.new_id('ardoise');
  v_out jsonb;
begin
  if p_actor_id is null or p_household_id is null then
    raise exception 'acteur et foyer obligatoires' using errcode = '22023';
  end if;
  perform private.assert_household_writer(p_household_id, p_actor_id);
  if p_name is null or char_length(btrim(p_name)) not between 1 and 200 then
    raise exception 'nom de voyage invalide' using errcode = '22023';
  end if;
  if p_destination is null or char_length(btrim(p_destination)) = 0 then
    raise exception 'destination obligatoire' using errcode = '22023';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'dates de voyage invalides' using errcode = '22023';
  end if;

  select m.id into v_member_id
    from public.household_members m
   where m.household_id = p_household_id and m.user_id = p_actor_id
   limit 1;

  insert into public.trips (
    id, household_id, name, destination, start_date, end_date,
    notes, created_by, tab_state
  ) values (
    v_trip_id, p_household_id, btrim(p_name), btrim(p_destination),
    p_start_date, p_end_date, p_notes, v_member_id,
    coalesce(
      p_tab_state,
      '{"infos": true, "courses": true, "notes": true, "taches": true, "adresses": true, "budget": true, "parametres": true}'::jsonb
    )
  );

  if p_member_ids is null then
    insert into public.trip_members (trip_id, member_id)
    select v_trip_id, m.id
      from public.household_members m
     where m.household_id = p_household_id
       and m.role in ('admin', 'membre');
  else
    insert into public.trip_members (trip_id, member_id)
    select v_trip_id, m.id
      from public.household_members m
     where m.household_id = p_household_id
       and m.role in ('admin', 'membre')
       and m.id = any (p_member_ids)
    on conflict do nothing;
  end if;

  -- Ardoise liee (nom du voyage) + inscriptions miroirs : un voyage = une
  -- ardoise = un foyer, participants synchronises (D-03).
  insert into public.ardoises (id, household_id, name, created_by, trip_id)
  values (v_ardoise_id, p_household_id, btrim(p_name), v_member_id, v_trip_id);

  insert into public.ardoise_members (ardoise_id, member_id)
  select v_ardoise_id, tm.member_id
    from public.trip_members tm
   where tm.trip_id = v_trip_id
  on conflict do nothing;

  return jsonb_build_object('trip_id', v_trip_id, 'ardoise_id', v_ardoise_id);
end;
$$;

comment on function public.create_trip_atomic(uuid, text, text, text, date, date, text, text[], jsonb) is
  'USAGE SERVEUR UNIQUEMENT (Edge trip-invite). Cree voyage + participants + ardoise liee en une transaction.';

-- Depart volontaire : retire des participants ET de l'ardoise liee, histoire
-- intacte. Soi-meme uniquement (l'identite vient de la session).
create or replace function public.trip_leave(
  p_actor_id uuid,
  p_trip_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_household_id text;
  v_member_id text;
  v_ardoise_id text;
begin
  if p_actor_id is null or p_trip_id is null then
    raise exception 'quitter impossible' using errcode = 'P0002';
  end if;
  select t.household_id into v_household_id
    from public.trips t
   where t.id = p_trip_id;
  if v_household_id is null then
    raise exception 'quitter impossible' using errcode = 'P0002';
  end if;
  select m.id into v_member_id
    from public.household_members m
   where m.household_id = v_household_id and m.user_id = p_actor_id
   limit 1;
  if v_member_id is null then
    raise exception 'quitter impossible' using errcode = 'P0002';
  end if;

  delete from public.trip_members tm
   where tm.trip_id = p_trip_id and tm.member_id = v_member_id;
  if not found then
    raise exception 'quitter impossible' using errcode = 'P0002';
  end if;

  select a.id into v_ardoise_id
    from public.ardoises a
   where a.trip_id = p_trip_id;
  if v_ardoise_id is not null then
    delete from public.ardoise_members am
     where am.ardoise_id = v_ardoise_id and am.member_id = v_member_id;
  end if;

  return jsonb_build_object('trip_id', p_trip_id, 'left', true);
end;
$$;

comment on function public.trip_leave(uuid, text) is
  'USAGE SERVEUR UNIQUEMENT. Depart volontaire : retire du voyage ET de l''ardoise liee. Oracle uniforme `quitter impossible`.';

-- Fermeture douce : fige sans detruire (D-08). Participant ecrivain OU admin.
create or replace function public.trip_close(
  p_actor_id uuid,
  p_trip_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_household_id text;
begin
  v_household_id := private.assert_trip_manager(p_trip_id, p_actor_id);
  perform private.assert_household_writer(v_household_id, p_actor_id);

  update public.trips t
     set is_closed = true
   where t.id = p_trip_id;

  return jsonb_build_object('trip_id', p_trip_id, 'is_closed', true);
end;
$$;

comment on function public.trip_close(uuid, text) is
  'USAGE SERVEUR UNIQUEMENT. Fige le voyage (ecritures refusees, lignes conservees).';

-- Reouverture : admin du foyer seul (D-08).
create or replace function public.trip_reopen(
  p_actor_id uuid,
  p_trip_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_household_id text;
begin
  if p_actor_id is null or p_trip_id is null then
    raise exception 'acteur et voyage obligatoires' using errcode = '22023';
  end if;
  select t.household_id into v_household_id
    from public.trips t
   where t.id = p_trip_id;
  if v_household_id is null then
    raise exception 'voyage introuvable' using errcode = 'P0002';
  end if;
  perform private.assert_household_admin(v_household_id, p_actor_id);

  update public.trips t
     set is_closed = false
   where t.id = p_trip_id;

  return jsonb_build_object('trip_id', p_trip_id, 'is_closed', false);
end;
$$;

comment on function public.trip_reopen(uuid, text) is
  'USAGE SERVEUR UNIQUEMENT. Reouvre un voyage fige (admin du foyer seul).';

-- ---------------------------------------------------------------------------
-- Invitations a code (miroir 0079 : bornes, oracle uniforme, idempotence).
-- Secret HMAC `TRIP_INVITE_HMAC_SECRET` : comme en 0079, cette migration n'en
-- stocke que le NOM — l'empreinte arrive calculee par l'Edge (Vault).
-- ---------------------------------------------------------------------------
create or replace function public.create_trip_invite(
  p_actor_id uuid,
  p_trip_id text,
  p_token_hash text,
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
  v_max_uses integer;
  v_expires_at timestamptz;
  v_invite_id text;
begin
  if p_actor_id is null or p_trip_id is null then
    raise exception 'acteur et voyage obligatoires' using errcode = '22023';
  end if;
  perform private.assert_trip_manager(p_trip_id, p_actor_id);
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'empreinte d''invitation invalide' using errcode = '22023';
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

  -- Regeneration : le code precedent DE CE VOYAGE est desactive aussitot.
  update public.trip_invites
     set is_active = false
   where trip_id = p_trip_id
     and is_active;

  insert into public.trip_invites (
    trip_id, token_hash, created_by, expires_at, max_uses, use_count, is_active
  ) values (
    p_trip_id, p_token_hash, p_actor_id, v_expires_at, v_max_uses, 0, true
  )
  returning id into v_invite_id;

  return jsonb_build_object(
    'invite_id', v_invite_id,
    'trip_id', p_trip_id,
    'expires_at', v_expires_at,
    'max_uses', v_max_uses
  );
end;
$$;

comment on function public.create_trip_invite(uuid, text, text, timestamptz, integer) is
  'USAGE SERVEUR UNIQUEMENT. Cree un code de partage (HMAC TRIP_INVITE_HMAC_SECRET calcule par l''Edge) et desactive le precedent du voyage. Gestion : admin ou participant.';

create or replace function public.revoke_trip_invite(
  p_actor_id uuid,
  p_trip_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_revoked integer;
begin
  if p_actor_id is null or p_trip_id is null then
    raise exception 'acteur et voyage obligatoires' using errcode = '22023';
  end if;
  perform private.assert_trip_manager(p_trip_id, p_actor_id);

  update public.trip_invites
     set is_active = false
   where trip_id = p_trip_id
     and is_active;

  get diagnostics v_revoked = row_count;

  return jsonb_build_object('trip_id', p_trip_id, 'revoked', v_revoked);
end;
$$;

comment on function public.revoke_trip_invite(uuid, text) is
  'USAGE SERVEUR UNIQUEMENT. Revoque tous les codes actifs du voyage. Gestion : admin ou participant.';

-- Resume sans jamais rendre l'empreinte.
create or replace function public.trip_invite_summary(
  p_actor_id uuid,
  p_trip_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  if p_actor_id is null or p_trip_id is null then
    raise exception 'acteur et voyage obligatoires' using errcode = '22023';
  end if;
  -- Gestion revérifiée ici : appelée en service_role, l'acteur est le
  -- paramètre, jamais auth.uid() qui serait NULL (motif 0079).
  perform private.assert_trip_manager(p_trip_id, p_actor_id);

  select jsonb_build_object(
           'invite_id', t.id,
           'trip_id', t.trip_id,
           'is_active', t.is_active,
           'expires_at', t.expires_at,
           'max_uses', t.max_uses,
           'use_count', t.use_count,
           'created_at', t.created_at
         )
    into v_out
    from public.trip_invites t
   where t.trip_id = p_trip_id
   order by t.created_at desc
   limit 1;

  return v_out;
end;
$$;

comment on function public.trip_invite_summary(uuid, text) is
  'USAGE SERVEUR UNIQUEMENT. Resume du dernier code du voyage, sans son empreinte.';

-- Echange : membre → inscription idempotente (+ ardoise liee) ; externe →
-- invite + ticket (rendu une fois). Oracle unique `code invalide`.
create or replace function public.redeem_trip_invite(
  p_token_hash text,
  p_actor_id uuid default null,
  p_display_name text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_invite public.trip_invites%rowtype;
  v_household_id text;
  v_member_id text;
  v_role text;
  v_ticket text := encode(extensions.gen_random_bytes(24), 'base64');
  v_guest_id text := private.new_id('trip-guest');
  v_ardoise_id text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'code invalide' using errcode = '22023';
  end if;

  -- Verrou pessimiste : deux echanges simultanes ne franchissent pas
  -- `use_count < max_uses` (motif 0017/0079).
  select t.* into v_invite
    from public.trip_invites t
   where t.token_hash = p_token_hash
     and private.token_hash_matches(t.token_hash, p_token_hash)
   for update;
  if not found then
    raise exception 'code invalide' using errcode = 'P0002';
  end if;
  if not v_invite.is_active
     or (v_invite.expires_at is not null and v_invite.expires_at <= now())
     or v_invite.use_count >= v_invite.max_uses then
    raise exception 'code invalide' using errcode = 'P0002';
  end if;

  select t.household_id into v_household_id
    from public.trips t where t.id = v_invite.trip_id;
  -- Le voyage a pu disparaitre entre-temps : oracle uniforme.
  if v_household_id is null then
    raise exception 'code invalide' using errcode = 'P0002';
  end if;

  -- Membre du foyer : inscription idempotente, sans consommer le compteur.
  if p_actor_id is not null then
    select m.id, m.role into v_member_id, v_role
      from public.household_members m
     where m.household_id = v_household_id and m.user_id = p_actor_id
     limit 1;
    if v_member_id is not null then
      -- D-01 : un enfant n'entre pas dans un voyage — meme oracle que tout
      -- code inconnu (le foyer vient du code, pas du client).
      if v_role = 'enfant' then
        raise exception 'code invalide' using errcode = 'P0002';
      end if;
      if exists (
        select 1
          from public.trip_members tm
         where tm.trip_id = v_invite.trip_id and tm.member_id = v_member_id
      ) then
        return jsonb_build_object('trip_id', v_invite.trip_id, 'already_member', true);
      end if;

      insert into public.trip_members (trip_id, member_id)
      values (v_invite.trip_id, v_member_id)
      on conflict do nothing;

      select a.id into v_ardoise_id
        from public.ardoises a
       where a.trip_id = v_invite.trip_id;
      if v_ardoise_id is not null then
        insert into public.ardoise_members (ardoise_id, member_id)
        values (v_ardoise_id, v_member_id)
        on conflict do nothing;
      end if;

      update public.trip_invites
         set use_count = use_count + 1,
             is_active = (use_count + 1 < max_uses)
       where id = v_invite.id;

      return jsonb_build_object('trip_id', v_invite.trip_id, 'already_member', false);
    end if;
  end if;

  -- Invite externe : ticket brut rendu une seule fois, HMAC stocke.
  if p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 120 then
    raise exception 'pseudonyme invalide' using errcode = '22023';
  end if;
  insert into public.trip_guests (id, trip_id, display_name, ticket_hash)
  values (v_guest_id, v_invite.trip_id, btrim(p_display_name),
          encode(extensions.digest(v_ticket, 'sha256'), 'hex'));

  -- Miroir payeur nomme sur l'ardoise liee (motif 0067, ticket NULL : le
  -- ticket du voyage reste la SEULE credence, utilisable via l'Edge seule).
  -- Meme identifiant des deux cotes : la depense invite s'y rattache sans
  -- resolution fragile par nom.
  select a.id into v_ardoise_id
    from public.ardoises a
   where a.trip_id = v_invite.trip_id;
  if v_ardoise_id is not null then
    insert into public.ardoise_guests (id, ardoise_id, display_name, ticket_hash)
    values (v_guest_id, v_ardoise_id, btrim(p_display_name), null)
    on conflict (id) do nothing;
  end if;

  update public.trip_invites
     set use_count = use_count + 1,
         is_active = (use_count + 1 < max_uses)
   where id = v_invite.id;

  return jsonb_build_object('trip_id', v_invite.trip_id, 'guest_ticket', v_ticket);
end;
$$;

comment on function public.redeem_trip_invite(text, uuid, text) is
  'USAGE SERVEUR UNIQUEMENT. Echange un code contre une inscription membre (idempotente, + ardoise) ou un ticket invite, oracle `code invalide` unique.';

-- Verification d'un ticket invite (chemin guest de l'Edge).
create or replace function public.verify_trip_ticket(p_ticket_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_guest_id text;
  v_trip_id text;
  v_display_name text;
begin
  if p_ticket_hash is null or p_ticket_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'ticket invalide' using errcode = '22023';
  end if;
  select g.id, g.trip_id, g.display_name into v_guest_id, v_trip_id, v_display_name
    from public.trip_guests g
   where g.ticket_hash = p_ticket_hash;
  if v_guest_id is null then
    raise exception 'ticket invalide' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'guest_id', v_guest_id,
    'trip_id', v_trip_id,
    'display_name', v_display_name
  );
end;
$$;

comment on function public.verify_trip_ticket(text) is
  'USAGE SERVEUR UNIQUEMENT. Resout un ticket invite en (guest, voyage).';

-- Depense d'un invite sur l'ardoise liee, sous ticket verifie (D-03/D-04 :
-- les invites creent leurs depenses via l'Edge dediee, jamais en PostgREST).
-- Les parts sont validees par private.insert_expense_parts (perimetre
-- ardoise : membres inscrits + invites de l'ardoise).
create or replace function public.create_trip_guest_expense(
  p_ticket_hash text,
  p_title text,
  p_amount numeric,
  p_expense_date date default null,
  p_split_type text default 'egal',
  p_parts jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_guest_id text;
  v_trip_id text;
  v_household_id text;
  v_ardoise_id text;
  v_is_closed boolean;
  v_expense_id text := private.new_id('expense');
  v_out jsonb;
begin
  if p_ticket_hash is null or p_ticket_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'ticket invalide' using errcode = '22023';
  end if;
  select g.id, g.trip_id into v_guest_id, v_trip_id
    from public.trip_guests g
   where g.ticket_hash = p_ticket_hash;
  if v_guest_id is null then
    raise exception 'ticket invalide' using errcode = 'P0002';
  end if;

  select t.household_id, t.is_closed into v_household_id, v_is_closed
    from public.trips t
   where t.id = v_trip_id;
  if v_household_id is null then
    raise exception 'ticket invalide' using errcode = 'P0002';
  end if;
  if v_is_closed then
    raise exception 'voyage figé, dépense impossible' using errcode = '22023';
  end if;

  select a.id into v_ardoise_id
    from public.ardoises a
   where a.trip_id = v_trip_id;
  if v_ardoise_id is null then
    raise exception 'ardoise du voyage introuvable' using errcode = 'P0002';
  end if;

  if p_title is null or char_length(btrim(p_title)) not between 1 and 200 then
    raise exception 'libellé de dépense invalide' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'le montant doit être supérieur à zéro' using errcode = '22023';
  end if;
  if p_split_type not in ('egal', 'personnalise') then
    raise exception 'type de partage invalide' using errcode = '22023';
  end if;

  insert into public.expenses (
    id, household_id, ardoise_id, title, amount,
    paid_by, paid_by_guest, expense_date, split_type
  ) values (
    v_expense_id, v_household_id, v_ardoise_id, btrim(p_title), round(p_amount, 2),
    null, v_guest_id, coalesce(p_expense_date, current_date), p_split_type
  );

  perform private.insert_expense_parts(v_expense_id, v_household_id, round(p_amount, 2), p_parts);

  select to_jsonb(e) into v_out from public.expenses e where e.id = v_expense_id;
  return v_out;
end;
$$;

comment on function public.create_trip_guest_expense(text, text, numeric, date, text, jsonb) is
  'USAGE SERVEUR UNIQUEMENT. Depense payee par un invite (ticket verifie) sur l''ardoise liee au voyage.';

-- ---------------------------------------------------------------------------
-- Privileges : RPC serveur au seul `service_role` (motif 0009/0058/0079).
-- ---------------------------------------------------------------------------
revoke all on function public.create_trip_atomic(uuid, text, text, text, date, date, text, text[], jsonb) from public, anon, authenticated;
revoke all on function public.trip_leave(uuid, text) from public, anon, authenticated;
revoke all on function public.trip_close(uuid, text) from public, anon, authenticated;
revoke all on function public.trip_reopen(uuid, text) from public, anon, authenticated;
revoke all on function public.create_trip_invite(uuid, text, text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.revoke_trip_invite(uuid, text) from public, anon, authenticated;
revoke all on function public.trip_invite_summary(uuid, text) from public, anon, authenticated;
revoke all on function public.redeem_trip_invite(text, uuid, text) from public, anon, authenticated;
revoke all on function public.verify_trip_ticket(text) from public, anon, authenticated;
revoke all on function public.create_trip_guest_expense(text, text, numeric, date, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_trip_atomic(uuid, text, text, text, date, date, text, text[], jsonb) to service_role;
grant execute on function public.trip_leave(uuid, text) to service_role;
grant execute on function public.trip_close(uuid, text) to service_role;
grant execute on function public.trip_reopen(uuid, text) to service_role;
grant execute on function public.create_trip_invite(uuid, text, text, timestamptz, integer) to service_role;
grant execute on function public.revoke_trip_invite(uuid, text) to service_role;
grant execute on function public.trip_invite_summary(uuid, text) to service_role;
grant execute on function public.redeem_trip_invite(text, uuid, text) to service_role;
grant execute on function public.verify_trip_ticket(text) to service_role;
grant execute on function public.create_trip_guest_expense(text, text, numeric, date, text, jsonb) to service_role;

do $$
begin
  if has_function_privilege('authenticated', 'public.create_trip_atomic(uuid,text,text,text,date,date,text,text[],jsonb)', 'EXECUTE') then
    raise exception 'authenticated ne doit pas pouvoir creer un voyage atomique';
  end if;
  if has_function_privilege('authenticated', 'public.redeem_trip_invite(text,uuid,text)', 'EXECUTE') then
    raise exception 'authenticated ne doit pas pouvoir echanger un code de voyage';
  end if;
  if has_function_privilege('authenticated', 'public.create_trip_guest_expense(text,text,numeric,date,text,jsonb)', 'EXECUTE') then
    raise exception 'authenticated ne doit pas pouvoir depenser en invite';
  end if;
  if not has_function_privilege('service_role', 'public.redeem_trip_invite(text,uuid,text)', 'EXECUTE') then
    raise exception 'service_role doit pouvoir echanger un code de voyage';
  end if;
end;
$$;

commit;
begin;

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

begin;

-- ---------------------------------------------------------------------------
-- K. Garde-fou flags serveur (durcissement 15-01, revue d'etape 2) : sans
--    lui, tout ecrivain du voyage basculait `is_closed` en PostgREST direct
--    et contournait la reouverture admin (trip_reopen). Comme
--    guard_author_immutable (0081), le trigger ne frappe que le chemin
--    client (`current_user` anon/authenticated) : les RPC SECURITY DEFINER
--    (current_user service_role/postgres) gardent la main.
-- ---------------------------------------------------------------------------
create or replace function private.guard_trip_server_flags()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.is_closed is distinct from old.is_closed then
      raise exception 'la fermeture d''un voyage passe par le serveur'
        using errcode = '42501';
    end if;
    if new.created_by is distinct from old.created_by then
      raise exception 'la colonne created_by n''est pas modifiable par le client'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

comment on function private.guard_trip_server_flags() is
  'Flags serveur des voyages (is_closed, created_by) : immuables en UPDATE client ; seuls les RPC les font bouger.';

drop trigger if exists guard_trip_server_flags on public.trips;
create trigger guard_trip_server_flags
  before update of is_closed, created_by on public.trips
  for each row execute function private.guard_trip_server_flags();

revoke all on function private.guard_trip_server_flags() from public, anon, authenticated;

commit;
