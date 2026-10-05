-- 0076_gift_ideas.sql
-- Phase 05 Cadeaux-Contacts (plan 05-01) : table `gift_ideas` et lien depuis
-- `gift_items`.idea_id.
--
-- `gift_ideas` est le catalogue d'idées cadeau du foyer (géré côté foyer), à
-- différencier des `gift_items` qui sont des articles dans une liste de cadeaux
-- particulière. Un `gift_item` peut référencer une idée via `idea_id` (ON DELETE
-- SET NULL) : supprimer une idée conserve l'article, mais dissocie le lien.
--
-- Surprise (D-08) : une idée destinée à un membre du foyer (giftee_contact_id →
-- contact lié à ce membre) est invisible pour ce membre, visible pour le reste
-- du foyer. Le masquage est centralisé dans `private.can_read_gift_idea`.

begin;

-- ---------------------------------------------------------------------------
-- Table gift_ideas
-- ---------------------------------------------------------------------------
create table public.gift_ideas (
  id text primary key default private.new_id('gift-idea'),
  household_id text not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  price numeric(12, 2) check (price is null or price >= 0),
  url text,
  comment text,
  photo_url text,
  status text not null default 'a_offrir' check (status in ('a_offrir', 'offert')),
  giftee_text text,
  -- FK vers contacts ajouté par 0077 : contacts n'existe pas encore à cette
  -- migration. La colonne est nullable et validée par la contrainte ajoutée
  -- plus tard, jusque-là contrôlée par la politique can_read_gift_idea.
  giftee_contact_id text,
  created_by text references public.household_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.gift_ideas is
  'Idées cadeau du foyer. status « a_offrir » = idée non réalisée, « offert » = réalisée.';

create index gift_ideas_household_idx on public.gift_ideas (household_id);
create index gift_ideas_giftee_idx on public.gift_ideas (giftee_contact_id);

-- Lien depuis gift_items : nullable, ON DELETE SET NULL (D-04).
alter table public.gift_items
  add column idea_id text references public.gift_ideas (id) on delete set null;

create index gift_items_idea_idx on public.gift_items (idea_id);

alter table public.gift_ideas enable row level security;

-- ---------------------------------------------------------------------------
-- Horodatage : même motif que 0008 (touch_updated_at).
-- ---------------------------------------------------------------------------
drop trigger if exists set_updated_at on public.gift_ideas;
create trigger set_updated_at before update on public.gift_ideas
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Garde-fou membre : created_by doit appartenir au foyer (0008, même motif).
-- ---------------------------------------------------------------------------
drop trigger if exists validate_member_refs on public.gift_ideas;
create trigger validate_member_refs before insert or update on public.gift_ideas
  for each row execute function private.validate_member_refs('created_by');

-- ---------------------------------------------------------------------------
-- Surprise (D-08) : une idée destinée à un membre (giftee_contact_id → contact
-- lié à ce membre) est invisible pour ce membre, visible pour le reste du
-- foyer. Copie de private.can_read_gift_list (0075) + branche surprise.
-- 0076 ne peut pas porter la branche surprise : public.contacts n'existe
-- qu'en 0077 et PostgreSQL résout les tables du corps à la création (jamais
-- de référence à une table inexistante). Cette version 0076 ne cadre donc que
-- le foyer ; 0077 la REMPLACE par la version complète avec la branche
-- `not exists` sur public.contacts. Réservée aux politiques SELECT (jamais
-- de relecture directe).
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
  );
$$;

comment on function private.can_read_gift_idea(text) is
  'Lecture : membres du même foyer sauf le destinataire (contact lié au membre courant). Réservée aux politiques SELECT.';

-- ---------------------------------------------------------------------------
-- RLS : foyer-plat (0007) + masquage surprise (can_read_gift_idea).
-- ---------------------------------------------------------------------------
drop policy if exists gift_ideas_select on public.gift_ideas;
create policy gift_ideas_select on public.gift_ideas
  for select using (
    private.is_household_member(household_id)
    and private.can_read_gift_idea(id)
  );

drop policy if exists gift_ideas_insert on public.gift_ideas;
create policy gift_ideas_insert on public.gift_ideas
  for insert with check (
    private.can_write_household(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
  );

drop policy if exists gift_ideas_update on public.gift_ideas;
create policy gift_ideas_update on public.gift_ideas
  for update using (
    private.can_write_household(household_id)
    and private.can_read_gift_idea(id)
  )
  with check (
    private.can_write_household(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
  );

drop policy if exists gift_ideas_delete on public.gift_ideas;
create policy gift_ideas_delete on public.gift_ideas
  for delete using (private.is_household_admin(household_id));

-- ---------------------------------------------------------------------------
-- Realtime : même motif que 0010/0071.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'Publication supabase_realtime absente : Realtime non active sur cette stack.';
    return;
  end if;

  begin
    execute 'alter publication supabase_realtime add table public.gift_ideas';
  exception when others then
    raise notice 'table gift_ideas ignoree pour Realtime : %', sqlerrm;
  end;
end;
$$;

commit;
