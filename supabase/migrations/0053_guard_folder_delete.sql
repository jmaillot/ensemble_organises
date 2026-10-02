-- 0053_guard_folder_delete.sql
-- Correctif : sur DELETE, NEW est NULL et `RETURN NEW` annule silencieusement
-- la suppression (row_count = 0, sans erreur). Sur DELETE, renvoyer OLD.
-- Sans ce correctif, AUCUNE suppression de dossier n'aboutissait, y compris
-- légitime — le test 0017 l'a révélé (affected = 0 au lieu de 1).

begin;

create or replace function private.guard_folder_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_default then
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
