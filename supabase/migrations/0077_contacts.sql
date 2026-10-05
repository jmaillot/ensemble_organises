-- 0077_contacts.sql
-- Phase 05 Cadeaux-Contacts (plan 05-01) : listes et contacts du foyer (D-01,
-- D-02), RLS foyer + listes personnelles, seed et garde-fous serveur.
--
-- Modèle :
--   * `contact_lists` : `owner_member_id` NULL = liste partagée « Famille »,
--     sinon liste personnelle du membre. `is_default` désigne la liste
--     d'usage (Famille + une par membre adulte) ; les listes créées ensuite
--     par les utilisateurs portent `is_default = false`.
--   * `contacts` : entrées d'une liste. `household_id` est DÉNORMALISÉ :
--     justifié par l'accès foyer direct sans jointure (même motif que
--     `gift_items.household_id` en 0004), contraint par le trigger
--     `align_household` et couvert par la RLS. `linked_member_id` relie un
--     contact à un membre du foyer (déclenche le masquage surprise D-08).
--
-- Choix OQ-2 (documenté ici) : une liste personnelle est lisible par son
-- propriétaire et par les admins du foyer, jamais par les autres membres.
-- L'écriture exige `can_write_household` (admin/membre, enfants exclus) et,
-- sur une liste personnelle, d'en être le propriétaire ou admin. La
-- suppression est réservée aux admins.
--
-- Seed (même motif que les dossiers Général en 0052, adapté au périmètre
-- par-membre) : un trigger `ensure_default_contact_list` sur
-- `household_members` garantit Famille + liste perso + contact pré-rempli à
-- chaque arrivée de membre adulte (couvre `create_household` comme les
-- rattachements par invitation) ; un backfill one-shot dans cette migration
-- couvre les foyers existants. Enfants (`enfant`) exclus des listes perso
-- et du pré-remplissage, même prédicat que le seed ardoise.
--
-- Garde : la suppression de la dernière liste par défaut d'un foyer est
-- refusée, sauf en cascade de suppression du foyer (le parent a déjà
-- disparu dans la transaction, cf. `delete_household` 0074).
--
-- Forward-only : 0008 n'est pas modifié ; les boucles d'alignement et de
-- validation ajoutent leurs entrées ici. Cette migration complète aussi
-- `private.can_read_gift_idea` (0076) avec sa branche surprise, devenue
-- résolvable maintenant que `public.contacts` existe.

begin;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.contact_lists (
  id text primary key default private.new_id('contact-list'),
  household_id text not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  owner_member_id text references public.household_members (id) on delete cascade,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.contact_lists is
  'Listes de contacts du foyer. owner_member_id NULL = liste partagée « Famille », sinon liste personnelle du membre.';

create table public.contacts (
  id text primary key default private.new_id('contact'),
  list_id text not null references public.contact_lists (id) on delete cascade,
  household_id text not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  birth_date date,
  photo_url text,
  -- Membre retiré du foyer → ses fiches liées disparaissent avec lui (même
  -- motif que gift_lists.owner_member_id en 0004 : CASCADE). SET NULL est
  -- exclu ici : il entrerait en collision avec la cascade de la liste
  -- personnelle sur la même ligne (la fiche seedée vit dans la liste du
  -- membre ET lui est liée) et ferait échouer le retrait du membre dans
  -- align_household. Les idées cadeau survivent via leur propre SET NULL.
  linked_member_id text references public.household_members (id) on delete cascade
);
comment on table public.contacts is
  'Contacts d''une liste. household_id dénormalisé (accès foyer direct), aligné par trigger. linked_member_id relie au membre (surprise D-08).';

create index contact_lists_household_idx on public.contact_lists (household_id);
create unique index contact_lists_default_per_owner_uidx
  on public.contact_lists (household_id, coalesce(owner_member_id, ''))
  where is_default;
create index contacts_list_idx on public.contacts (list_id);
create index contacts_household_idx on public.contacts (household_id);
create index contacts_linked_member_idx on public.contacts (linked_member_id);

alter table public.contact_lists enable row level security;
alter table public.contacts enable row level security;

-- ---------------------------------------------------------------------------
-- Lecture/écriture d'une liste : partage Famille, perso au propriétaire et
-- aux admins (OQ-2). Utilisé par les politiques des deux tables, source
-- unique du prédicat (même motif que can_read_gift_list en 0075).
-- ---------------------------------------------------------------------------
create or replace function private.can_read_contact_list(p_list_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.contact_lists l
     where l.id = p_list_id
       and private.is_household_member(l.household_id)
       and (l.owner_member_id is null
            or l.owner_member_id = private.current_member_id(l.household_id)
            or private.is_household_admin(l.household_id))
  );
$$;

comment on function private.can_read_contact_list(text) is
  'Lecture : membres du foyer pour Famille, propriétaire + admins pour une liste personnelle (OQ-2). Réservée aux politiques SELECT.';

create or replace function private.can_write_contact_list(p_list_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.contact_lists l
     where l.id = p_list_id
       and private.can_write_household(l.household_id)
       and (l.owner_member_id is null
            or l.owner_member_id = private.current_member_id(l.household_id)
            or private.is_household_admin(l.household_id))
  );
$$;

comment on function private.can_write_contact_list(text) is
  'Écriture : rôle écrivain du foyer, et propriétaire ou admin sur une liste personnelle. Réservée aux politiques WITH CHECK.';

-- ---------------------------------------------------------------------------
-- Surprise D-08, définition effective : 0076 ne cadrait que le foyer,
-- cette version ajoute la branche `not exists` sur public.contacts.
-- ---------------------------------------------------------------------------
create or replace function private.can_read_gift_idea(p_idea_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.gift_ideas g
     where g.id = p_idea_id
       and private.is_household_member(g.household_id)
       and not exists (
         select 1
           from public.contacts c
          where c.id = g.giftee_contact_id
            and c.linked_member_id = private.current_member_id(g.household_id)
       )
  );
$$;

comment on function private.can_read_gift_idea(text) is
  'Lecture : membres du même foyer sauf le destinataire (contact lié au membre courant). Réservée aux politiques SELECT.';

-- ---------------------------------------------------------------------------
-- RLS contact_lists : SELECT foyer + perso owner/admin, écriture écrivain +
-- perso owner/admin, suppression admin.
-- ---------------------------------------------------------------------------
drop policy if exists contact_lists_select on public.contact_lists;
create policy contact_lists_select on public.contact_lists
  for select using (private.can_read_contact_list(id));

drop policy if exists contact_lists_insert on public.contact_lists;
create policy contact_lists_insert on public.contact_lists
  for insert with check (
    private.can_write_household(household_id)
    and (
      (owner_member_id is null and private.is_household_admin(household_id))
      or owner_member_id = private.current_member_id(household_id)
      or (owner_member_id is not null and private.is_household_admin(household_id))
    )
  );

drop policy if exists contact_lists_update on public.contact_lists;
create policy contact_lists_update on public.contact_lists
  for update using (
    private.can_write_household(household_id)
    and (
      (owner_member_id is null and private.is_household_admin(household_id))
      or owner_member_id = private.current_member_id(household_id)
      or (owner_member_id is not null and private.is_household_admin(household_id))
    )
  )
  with check (
    private.can_write_household(household_id)
    and (
      (owner_member_id is null and private.is_household_admin(household_id))
      or owner_member_id = private.current_member_id(household_id)
      or (owner_member_id is not null and private.is_household_admin(household_id))
    )
  );

drop policy if exists contact_lists_delete on public.contact_lists;
create policy contact_lists_delete on public.contact_lists
  for delete using (private.is_household_admin(household_id));

-- ---------------------------------------------------------------------------
-- RLS contacts : lecture via la lisibilité de la liste, écriture écrivain
-- sur liste accessible, suppression admin.
-- ---------------------------------------------------------------------------
drop policy if exists contacts_select on public.contacts;
create policy contacts_select on public.contacts
  for select using (
    private.is_household_member(household_id)
    and private.can_read_contact_list(list_id)
  );

drop policy if exists contacts_insert on public.contacts;
create policy contacts_insert on public.contacts
  for insert with check (
    private.can_write_household(household_id)
    and private.can_write_contact_list(list_id)
  );

drop policy if exists contacts_update on public.contacts;
create policy contacts_update on public.contacts
  for update using (
    private.can_write_household(household_id)
    and private.can_write_contact_list(list_id)
  )
  with check (
    private.can_write_household(household_id)
    and private.can_write_contact_list(list_id)
  );

drop policy if exists contacts_delete on public.contacts;
create policy contacts_delete on public.contacts
  for delete using (private.is_household_admin(household_id));

-- ---------------------------------------------------------------------------
-- Garde-fous membre (0008, même motif, boucle forward-only) : owner et
-- linked_member_id appartiennent au foyer de la ligne.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('contact_lists', array['owner_member_id']::text[]),
      ('contacts',      array['linked_member_id']::text[])
    ) as t(table_name, member_columns)
  loop
    execute format('drop trigger if exists validate_member_refs on public.%I', r.table_name);
    execute format(
      'create trigger validate_member_refs before insert or update on public.%I'
      ' for each row execute function private.validate_member_refs(%L)',
      r.table_name, array_to_string(r.member_columns, ',')
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Alignement du household_id dénormalisé de contacts (0008, boucle
-- forward-only) : la colonne suit contact_lists.list_id, sans divergence.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('contacts', 'contact_lists', 'list_id')
    ) as t(child_table, parent_table, parent_column)
  loop
    execute format('drop trigger if exists align_household on public.%I', r.child_table);
    execute format(
      'create trigger align_household before insert or update on public.%I'
      ' for each row execute function private.align_child_household(%L, %L)',
      r.child_table, r.parent_table, r.parent_column
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lien surprise 0076 → contacts : SET NULL (supprimer un contact lève le
-- masquage au lieu de détruire l'idée).
-- ---------------------------------------------------------------------------
alter table public.gift_ideas
  add constraint gift_ideas_giftee_contact_fk
  foreign key (giftee_contact_id) references public.contacts (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Seed : Famille partagée + liste perso et contact pré-rempli par adulte.
-- Idempotent (NOT EXISTS partout) : le trigger le rejoue à chaque arrivée
-- de membre, le backfill ci-dessous le joue une fois pour l'existant.
-- ---------------------------------------------------------------------------
create or replace function private.ensure_household_contact_lists(p_household_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_famille text;
  r record;
  v_perso text;
  v_contact text;
begin
  select l.id into v_famille
    from public.contact_lists l
   where l.household_id = p_household_id
     and l.owner_member_id is null
     and l.is_default
   limit 1;
  if v_famille is null then
    v_famille := private.new_id('contact-list');
    insert into public.contact_lists (id, household_id, name, owner_member_id, is_default)
    values (v_famille, p_household_id, 'Famille', null, true);
  end if;

  for r in
    select m.id as member_id, m.display_name as display_name
      from public.household_members m
     where m.household_id = p_household_id
       and m.role in ('admin', 'membre')
  loop
    select l.id into v_perso
      from public.contact_lists l
     where l.household_id = p_household_id
       and l.owner_member_id = r.member_id
       and l.is_default
     limit 1;
    if v_perso is null then
      v_perso := private.new_id('contact-list');
      insert into public.contact_lists (id, household_id, name, owner_member_id, is_default)
      values (v_perso, p_household_id, r.display_name, r.member_id, true);
    end if;

    select c.id into v_contact
      from public.contacts c
     where c.list_id = v_perso
       and c.linked_member_id = r.member_id
     limit 1;
    if v_contact is null then
      insert into public.contacts (list_id, household_id, name, linked_member_id)
      values (v_perso, p_household_id, r.display_name, r.member_id);
    end if;
  end loop;
end;
$$;

comment on function private.ensure_household_contact_lists(text) is
  'Seed idempotent : liste Famille + une liste perso et un contact lié par membre adulte. Appelé par trigger et backfill.';

create or replace function private.ensure_default_contact_list()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ensure_household_contact_lists(NEW.household_id);
  return NEW;
end;
$$;

drop trigger if exists ensure_default_contact_list on public.household_members;
create trigger ensure_default_contact_list
  after insert or update on public.household_members
  for each row execute function private.ensure_default_contact_list();

-- ---------------------------------------------------------------------------
-- Garde dernière-liste-par-défaut : refusée sauf en cascade de suppression
-- du foyer (parent déjà disparu dans la transaction).
-- ---------------------------------------------------------------------------
create or replace function private.guard_last_default_contact_list()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if OLD.is_default then
    if exists (select 1 from public.households h where h.id = OLD.household_id) then
      if not exists (
        select 1
          from public.contact_lists l
         where l.household_id = OLD.household_id
           and l.is_default
           and l.id <> OLD.id
      ) then
        raise exception 'impossible de supprimer la derniere liste de contacts par defaut du foyer'
          using errcode = '42501';
      end if;
    end if;
  end if;
  return OLD;
end;
$$;

drop trigger if exists guard_last_default_contact_list on public.contact_lists;
create trigger guard_last_default_contact_list
  before delete on public.contact_lists
  for each row execute function private.guard_last_default_contact_list();

revoke all on function private.ensure_household_contact_lists(text) from public, anon, authenticated;
revoke all on function private.ensure_default_contact_list() from public, anon, authenticated;
revoke all on function private.guard_last_default_contact_list() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime : même motif protégé que 0010/0071.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'Publication supabase_realtime absente : Realtime non active sur cette stack.';
    return;
  end if;

  begin
    execute 'alter publication supabase_realtime add table public.contact_lists';
  exception when others then
    raise notice 'table contact_lists ignoree pour Realtime : %', sqlerrm;
  end;
  begin
    execute 'alter publication supabase_realtime add table public.contacts';
  exception when others then
    raise notice 'table contacts ignoree pour Realtime : %', sqlerrm;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill one-shot : foyers existants (créés avant cette migration).
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select id as household_id from public.households loop
    perform private.ensure_household_contact_lists(r.household_id);
  end loop;
end;
$$;

commit;
