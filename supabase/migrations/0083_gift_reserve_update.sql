-- supabase/migrations/0083_gift_reserve_update.sql
--
-- Correctif vers l'avant : un invité en partage `reservation` (membre coché
-- ou e-mail externe, D-17) peut réserver sur une liste privée, ce que la
-- politique `gift_items_update` (owner/admin/non-privée seuls) interdisait —
-- d'où « Mise à jour impossible » au clic sur « acheté ». La RLS ne filtrant
-- pas les colonnes, un trigger borne les non-gestionnaires aux seules
-- colonnes `reserved_by`/`purchased` (avec `reserved_by` = soi ou NULL).

-- ---------------------------------------------------------------------------
-- Helper : l'acteur détient-il un partage `reservation` sur la liste ?
-- ---------------------------------------------------------------------------
create or replace function private.has_gift_reservation(p_list_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.gift_lists l
     where l.id = p_list_id
       and exists (
         select 1
           from public.gift_list_shares s
          where s.list_id = l.id
            and s.permission = 'reservation'
            and (
              s.shared_with_member_id = private.current_member_id(l.household_id)
              or s.shared_with_email = (
                select p.email from public.profiles p where p.id = auth.uid()
              )
            )
       )
  );
$$;

comment on function private.has_gift_reservation(text) is
  'Vrai si l''acteur détient un partage reservation (membre ou e-mail) sur la liste (D-17).';

-- ---------------------------------------------------------------------------
-- Politique : les invités en `reservation` passent le USING/WITH CHECK.
-- ---------------------------------------------------------------------------
drop policy if exists gift_items_update on public.gift_items;
create policy gift_items_update on public.gift_items
  for update
  using (private.can_write_gift_list(list_id) or private.has_gift_reservation(list_id))
  with check (private.can_write_gift_list(list_id) or private.has_gift_reservation(list_id));

-- ---------------------------------------------------------------------------
-- Garde : un non-gestionnaire ne touche qu'à reserved_by/purchased, et ne
-- réserve qu'à son nom (ou libère). Toute autre colonne → 42501.
-- ---------------------------------------------------------------------------
create or replace function private.guard_gift_item_reserve()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id text;
  v_me text;
begin
  if private.can_write_gift_list(NEW.list_id) then
    return NEW;
  end if;

  if NEW.id is distinct from OLD.id
     or NEW.list_id is distinct from OLD.list_id
     or NEW.household_id is distinct from OLD.household_id
     or NEW.name is distinct from OLD.name
     or NEW.price is distinct from OLD.price
     or coalesce(NEW.comment, '') is distinct from coalesce(OLD.comment, '')
     or coalesce(NEW.photo_url, '') is distinct from coalesce(OLD.photo_url, '')
     or coalesce(NEW.url, '') is distinct from coalesce(OLD.url, '')
     or coalesce(NEW.idea_id, '') is distinct from coalesce(OLD.idea_id, '') then
    raise exception 'modification non autorisee sur cet article' using errcode = '42501';
  end if;

  if NEW.reserved_by is distinct from OLD.reserved_by then
    select l.household_id into v_household_id
      from public.gift_lists l where l.id = NEW.list_id;
    v_me := private.current_member_id(v_household_id);
    if NEW.reserved_by is not null and NEW.reserved_by is distinct from v_me then
      raise exception 'reservation au nom d''un autre membre interdite' using errcode = '42501';
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_guard_gift_item_reserve on public.gift_items;
create trigger trg_guard_gift_item_reserve
  before update on public.gift_items
  for each row execute function private.guard_gift_item_reserve();

comment on function private.guard_gift_item_reserve() is
  'Borne les non-gestionnaires (invités reservation) aux colonnes reserved_by/purchased, à leur seul nom (0083).';
