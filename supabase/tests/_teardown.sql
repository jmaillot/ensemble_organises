-- supabase/tests/_teardown.sql
-- Retire l'outillage de test. À exécuter après les fichiers numérotés.

begin;

drop schema if exists testkit cascade;

commit;
