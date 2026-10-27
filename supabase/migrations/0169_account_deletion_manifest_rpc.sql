-- 0169_account_deletion_manifest_rpc.sql
-- Accès PostgREST au manifest de médias (phase 27, plan 03, task 1).
--
-- POURQUOI CETTE MIGRATION (§2.7 A — correction vers l'avant)
--   PostgREST n'expose que `public` et `graphql_public` (PGRST_DB_SCHEMAS du
--   snapshot épinglé) : l'Edge unifiée `household-delete` ne peut PAS lire
--   `private.account_deletion_media_manifest` (0168) via admin.rpc — erreur
--   « Could not find the function … in the schema cache ». Même échec que le
--   tracer 26-03, même correction : le motif du dépôt est partout le même —
--   la logique vit en `private`, et l'Edge appelle un wrapper `public`
--   SECURITY DEFINER aux privilèges restreints (0163 pour
--   gdpr_export_extract_batch, 0074 pour delete_household).
--
--   Deux wrappers, aucun état mutable en plus :
--     `deletion_media_claim(p_limit)`  — rend les chemins NON purgés (bornés)
--     `deletion_media_mark_purged(ids)` — pose `purged = true` sur des ids
--   Le SQL privé reste la seule source de vérité ; aucun client navigateur ne
--   peut appeler ces wrappers (REVOKE explicites, motif 0160).

begin;

create or replace function public.deletion_media_claim(p_limit integer default 500)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', m.id,
                 'household_id', m.household_id,
                 'storage_path', m.storage_path
               ) order by m.created_at asc, m.id asc)
        from private.account_deletion_media_manifest m
       where m.purged = false
       limit greatest(p_limit, 1)
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.deletion_media_claim(integer) is
  'Wrapper PostgREST du manifest de médias (motif 0163 : logique en private, point d''entrée public réservé à service_role). Rend au plus p_limit chemins NON purgés pour l''Edge unifiée household-delete — qui ne supprime QUE ces chemins (D-07, T-27-12).';

create or replace function public.deletion_media_mark_purged(p_ids uuid[])
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_marked integer;
begin
  update private.account_deletion_media_manifest m
     set purged = true
    where m.id = any(p_ids)
      and m.purged = false;
  get diagnostics v_marked = row_count;
  return v_marked;
end;
$$;

comment on function public.deletion_media_mark_purged(uuid[]) is
  'Marque purged = true sur les chemins du manifest effectivement supprimés par l''Edge unifiée (0168 : « purged est posé par elle »). Réservé à service_role.';

-- Réservé à service_role : un navigateur (authenticated/anon) est refusé,
-- et les fonctions SECURITY DEFINER ne laissent rien passer au-delà du
-- manifest (motif 0160/0163).
revoke all on function public.deletion_media_claim(integer)
  from public, anon, authenticated;
revoke all on function public.deletion_media_mark_purged(uuid[])
  from public, anon, authenticated;
grant execute on function public.deletion_media_claim(integer)
  to service_role;
grant execute on function public.deletion_media_mark_purged(uuid[])
  to service_role;

-- Preuve des privilèges (motif 0074).
do $$
begin
  if has_function_privilege('anon', 'public.deletion_media_claim(integer)', 'EXECUTE') then
    raise exception 'anon ne doit pas pouvoir lire le manifest de médias';
  end if;
  if has_function_privilege('authenticated', 'public.deletion_media_claim(integer)', 'EXECUTE') then
    raise exception 'authenticated ne doit pas pouvoir lire le manifest de médias';
  end if;
  if has_function_privilege('anon', 'public.deletion_media_mark_purged(uuid[])', 'EXECUTE') then
    raise exception 'anon ne doit pas pouvoir marquer le manifest de médias';
  end if;
  if has_function_privilege('authenticated', 'public.deletion_media_mark_purged(uuid[])', 'EXECUTE') then
    raise exception 'authenticated ne doit pas pouvoir marquer le manifest de médias';
  end if;
  if not has_function_privilege('service_role', 'public.deletion_media_claim(integer)', 'EXECUTE') then
    raise exception 'service_role doit pouvoir lire le manifest (Edge plan 03)';
  end if;
  if not has_function_privilege('service_role', 'public.deletion_media_mark_purged(uuid[])', 'EXECUTE') then
    raise exception 'service_role doit pouvoir marquer le manifest (Edge plan 03)';
  end if;
end;
$$;

commit;
