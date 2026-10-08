-- 0098_contact_owner_only.sql
-- Phase 07 Contacts privés (plan 07-02, amendement OQ-2 UAT 2026-10-08) : les
-- listes personnelles deviennent strictement propriétaire-only en lecture ET
-- en écriture — les admins du foyer perdent l'accès aux listes d'autrui.
--
-- Correctif, vers l'avant uniquement (0077/0097 intouchées) :
--   1. `private.can_read_contact_list` et `private.can_write_contact_list`
--      perdent leur branche `is_household_admin` sur les listes personnelles
--      (`owner_member_id IS NOT NULL`) : seul le propriétaire passe. La
--      branche Famille (`owner_member_id IS NULL`) est à l'octet près.
--   2. les politiques `contact_lists_insert` et `contact_lists_update`
--      inlinent le même prédicat (elles n'appellent pas les portes) : leur
--      branche personnelle-admin est retirée elle aussi, sinon un admin
--      garderait l'écriture sur la ligne de liste elle-même. Branches Famille
--      et propriétaire inchangées.
--   3. `contact_lists_delete` et `contacts_delete` restent admin-only :
--      hygiène aveugle conservée (supprimer sans lire), documentée — pas un
--      oubli. Prouvée intacte en 0037.
--
-- RLS des fiches (`contacts_*`) inchangée dans sa forme : elle appelle les
-- portes, donc elle hérite du resserrement sans retouche.

begin;

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
            or l.owner_member_id = private.current_member_id(l.household_id))
  );
$$;

comment on function private.can_read_contact_list(text) is
  'Lecture : membres du foyer pour Famille, propriétaire seul pour une liste personnelle (OQ-2 amendée 0098). Réservée aux politiques SELECT.';

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
            or l.owner_member_id = private.current_member_id(l.household_id))
  );
$$;

comment on function private.can_write_contact_list(text) is
  'Écriture : rôle écrivain du foyer, et propriétaire seul sur une liste personnelle (OQ-2 amendée 0098). Réservée aux politiques WITH CHECK.';

drop policy if exists contact_lists_insert on public.contact_lists;
create policy contact_lists_insert on public.contact_lists
  for insert with check (
    private.can_write_household(household_id)
    and (
      (owner_member_id is null and private.is_household_admin(household_id))
      or owner_member_id = private.current_member_id(household_id)
    )
  );

drop policy if exists contact_lists_update on public.contact_lists;
create policy contact_lists_update on public.contact_lists
  for update using (
    private.can_write_household(household_id)
    and (
      (owner_member_id is null and private.is_household_admin(household_id))
      or owner_member_id = private.current_member_id(household_id)
    )
  )
  with check (
    private.can_write_household(household_id)
    and (
      (owner_member_id is null and private.is_household_admin(household_id))
      or owner_member_id = private.current_member_id(household_id)
    )
  );

commit;
