-- 0160_gdpr_export_privileges.sql
-- Correction vers l'avant : ajout des REVOKE/GRANT manquants sur les fonctions
-- GDPR (test 0001 section 7 bis exige que toute fonction private soit réservée
-- à service_role).
--
-- POURQUOI CETTE MIGRATION
--   0159 a créé les wrappers dispatch_gdpr_export_run() et
--   dispatch_gdpr_export_purge() mais n'a pas révoqué leurs privilèges. Le test
--   0001_schema_contract.sql section 7 bis (lignes 447-577) parcourt TOUTES les
--   fonctions de `private` et refuse celles qui restent exécutables par
--   authenticated/anon sans raison déclarée. La correction ajoute les
--   REVOKE/GRANT explicites.

begin;

-- Privilèges : fonctions privées réservées à service_role (conformité test 0001).
revoke all on function private.post_gdpr_export_http(text) from public, anon, authenticated;
grant execute on function private.post_gdpr_export_http(text) to service_role;

revoke all on function private.dispatch_gdpr_export_run() from public, anon, authenticated;
grant execute on function private.dispatch_gdpr_export_run() to service_role;

revoke all on function private.dispatch_gdpr_export_purge() from public, anon, authenticated;
grant execute on function private.dispatch_gdpr_export_purge() to service_role;

commit;
