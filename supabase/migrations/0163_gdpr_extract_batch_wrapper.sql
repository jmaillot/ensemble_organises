-- 0163_gdpr_extract_batch_wrapper.sql
-- Phase 26 Plan 03 Task 1 (tracer) : accès PostgREST au RPC d'extraction.
--
-- POURQUOI CETTE MIGRATION (§2.7A — correction vers l'avant)
--   Le tracer a montré la seconde couche du même échec : PostgREST n'expose
--   que `public` et `graphql_public` (PGRST_DB_SCHEMAS du snapshot épinglé),
--   donc l'Edge Function ne peut PAS appeler `private.gdpr_export_extract_batch`
--   via admin.rpc — erreur « Could not find the function … in the schema cache ».
--
--   Le motif du dépôt est partout le même : la logique vit en `private`, et
--   l'Edge appelle un RPC `public` SECURITY DEFINER aux privilèges restreints
--   (`delete_household`, `due_push_notifications`, …). Ce fichier crée le
--   wrapper `public.gdpr_export_extract_batch(uuid, integer)` qui délègue à la
--   fonction privée — même signature, même contrat, exécutable par
--   `service_role` UNIQUEMENT (la borne RGEX-03 reste dans le SQL privé, et
--   aucun client navigateur ne peut appeler ce wrapper : REVOKE explicites,
--   motif 0160).

begin;

create or replace function public.gdpr_export_extract_batch(
  p_job_id uuid,
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Délégation pure : la borne d'isolement RGEX-03 vit dans le corps privé
  -- (0161), ce wrapper ne fait que le rendre joignable depuis PostgREST.
  return private.gdpr_export_extract_batch(p_job_id, p_limit);
end;
$$;

comment on function public.gdpr_export_extract_batch(uuid, integer) is
  'Wrapper PostgREST du RPC d''extraction RGPD (motif delete_household : logique en private, point d''entrée public réservé à service_role). La borne RGEX-03 reste dans le corps privé (0161).';

-- Réservé à service_role : un navigateur (authenticated/anon) est refusé, et
-- la fonction SECURITY DEFINER ne laisse rien passer au-delà (motif 0160).
revoke all on function public.gdpr_export_extract_batch(uuid, integer) from public, anon, authenticated;
grant execute on function public.gdpr_export_extract_batch(uuid, integer) to service_role;

commit;
