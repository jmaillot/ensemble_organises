-- 0112_flat_tables_guards.sql
-- Phase 13 hygiene donnees (D-02, plan 13-01) : un prestataire ne reference
-- jamais le type d'un autre foyer.
--
-- Constat (sonde RED 13-01, supprimee apres preuve) : un redacteur attachait
-- sa ligne `providers` au `provider_type` d'un autre foyer — 1 ligne inseree,
-- aucune barriere. La FK garantit l'existence du type, pas son foyer.
--
-- Vers l'avant uniquement, aucun fichier applique retouche :
--   * fonction + trigger siblings (`validate_member_refs` de 0008 ni deplace
--     ni reconstruit) ;
--   * aucune politique RLS touchee (le motif foyer-plat de 0007 est inchange).
-- Meme forme d'erreur que les gardes de references de membre (0008) :
-- `la reference <colonne> (<valeur>) n'appartient pas au foyer`, code 23514.
-- `provider_type_id` NULL reste autorise (colonne nullable, suppression d'un
-- type passe a NULL par `on delete set null`). Aucune reparation de donnees :
-- une reference existante en ecart leve a la prochaine ecriture, elle n'est
-- jamais reecrite en silence (base dev controlee le 2026-10-12 : 0 orphelin).

begin;

create or replace function private.guard_provider_type_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type_household text;
begin
  if new.provider_type_id is null then
    return new;
  end if;

  select t.household_id into v_type_household
    from public.provider_types t
   where t.id = new.provider_type_id;

  if v_type_household is null then
    raise exception 'type de prestataire introuvable : %', new.provider_type_id
      using errcode = '23503';
  end if;

  if new.household_id <> v_type_household then
    raise exception 'la reference provider_type_id (%) n''appartient pas au foyer', new.provider_type_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function private.guard_provider_type_household() is
  'Phase 13 D-02 : providers.provider_type_id exige un type du meme foyer (NULL autorise) ; meme forme d''erreur que validate_member_refs (0008).';

drop trigger if exists guard_provider_type_household on public.providers;
create trigger guard_provider_type_household
  before insert or update on public.providers
  for each row execute function private.guard_provider_type_household();

commit;
