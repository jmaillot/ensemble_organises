-- 0114_enfant_perimeter_complement.sql
-- Phase 14 perimetre enfants, complement de 0113 (Rule 1 : piece oubliee,
-- attrapee par la suite 0051 — `expense_participants` restait lisible a
-- l'enfant inscrit).
--
-- `expense_participants_select` (0007, inchangee) lit via
-- `private.can_read_expense`, qui n'exigeait que l'appartenance au foyer.
-- Le resserrement se fait DANS le helper (contexte SECURITY DEFINER,
-- appels imbriques en droits proprietaire — pas d'usage direct de
-- `parent_household_id`, revoque a `authenticated` en 0009) : ecrivain du
-- foyer ET (admin OU inscrit a l'ardoise). Membre/admin byte-identiques,
-- enfant exclu — meme forme que `expenses_select` (0113 §B), un seul point.
--
-- Vers l'avant uniquement : 0113 reste au depot et raconte ce qui s'est
-- passe, y compris cet oubli.

begin;

create or replace function private.can_read_expense(p_expense_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.expenses e
     where e.id = p_expense_id
       and private.can_write_household(e.household_id)
       and (
         private.is_household_admin(e.household_id)
         or private.is_ardoise_member(e.ardoise_id)
       )
  );
$$;

comment on function private.can_read_expense(text) is
  'Lecture des parts : ecrivain du foyer ET (admin OU inscrit a l''ardoise). 0114 : enfant exclu, comme expenses_select (0113). Reservee aux politiques SELECT.';

commit;
