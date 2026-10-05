-- 0074_household_delete.sql
-- Suppression d'un foyer par son administrateur, côté serveur.
--
-- Constat (audit juridique, 05/10/2026) : la politique de confidentialité
-- (§6) et les CGU (art. 9) promettent la suppression du foyer « depuis
-- l'application », mais aucun code ne l'implémentait — seule la politique
-- RLS `households_delete` existait. Cette fonction comble le manque.
--
-- Ordre de suppression : `expenses.paid_by … on delete restrict` (0004)
-- protège le retrait d'un simple membre payeur, donc les dépenses partent
-- AVANT les membres, dans la même transaction. Tout le reste suit par
-- cascades (`household_id … on delete cascade` partout, membres en cascade
-- vers leurs lignes). Toute future table sans cascade échouerait ici par
-- violation de clé — échec bruyant, jamais fuite silencieuse.
--
-- `EXECUTE` accordé à `service_role` seul (cf. 0009) : l'Edge Function
-- `household-delete` orchestre l'appel DB + le nettoyage Storage, et la
-- fonction revérifie le rôle de l'acteur en base.

begin;

create or replace function public.delete_household(p_actor_id uuid, p_household_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_expenses integer := 0;
begin
  if p_actor_id is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_household_id is null or btrim(p_household_id) = '' then
    raise exception 'foyer introuvable' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.households h where h.id = p_household_id) then
    raise exception 'foyer introuvable' using errcode = 'P0002';
  end if;

  perform private.assert_household_admin(p_household_id, p_actor_id);

  delete from public.expenses e where e.household_id = p_household_id;
  get diagnostics v_expenses = row_count;

  delete from public.households h where h.id = p_household_id;

  return jsonb_build_object('household_id', p_household_id, 'expenses', v_expenses);
end;
$$;

comment on function public.delete_household(uuid, text) is
  'Supprime un foyer et tout son contenu, administrateur requis. USAGE SERVEUR UNIQUEMENT : l''acteur est un paramètre vérifié en base, jamais auth.uid().';

-- `EXECUTE` par défaut à PUBLIC : retrait explicite, comme en 0009 et 0036.
revoke all on function public.delete_household(uuid, text) from public, anon, authenticated;
grant execute on function public.delete_household(uuid, text) to service_role;

do $$
begin
  if has_function_privilege('authenticated', 'public.delete_household(uuid, text)', 'EXECUTE') then
    raise exception 'authenticated ne doit pas pouvoir supprimer un foyer par RPC direct';
  end if;
  if not has_function_privilege('service_role', 'public.delete_household(uuid, text)', 'EXECUTE') then
    raise exception 'service_role doit pouvoir supprimer un foyer par RPC';
  end if;
end;
$$;

commit;
