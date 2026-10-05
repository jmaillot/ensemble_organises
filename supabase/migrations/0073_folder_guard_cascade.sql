-- 0073_folder_guard_cascade.sql
-- La suppression d'un foyer (cascade) doit emporter TOUS ses dossiers, Général
-- compris — sans quoi aucun foyer n'est supprimable (ni par l'admin via la
-- politique `households_delete`, ni en SQL direct), ce que la confidentialité
-- (§5 : suppression intégrale) et les CGU (art. 9) promettent.
--
-- Le garde reste inchangé pour les suppressions directes : seule la cascade
-- passe, détectée au fait que le foyer parent est déjà supprimé quand ce
-- trigger BEFORE s'exécute (la cascade FK part après la suppression parente,
-- dans la même commande).

begin;

create or replace function private.guard_folder_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_default then
    if tg_op = 'DELETE' and not exists (
      select 1 from public.households h where h.id = old.household_id
    ) then
      return old;
    end if;
    raise exception 'le dossier Général ne peut ni être modifié ni supprimé'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if new.is_default <> old.is_default then
    raise exception 'is_default n''est pas modifiable' using errcode = '42501';
  end if;
  return new;
end;
$$;

commit;
