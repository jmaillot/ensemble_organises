-- supabase/tests/0155_update_child_profile_birth_date_doc.sql
-- Documentation du contrat birth_date (migration 0155, finding IN-01 de la
-- revue de phase 25). Le correctif EST le commentaire : la preuve vérifie
-- qu'il est bien porté par la définition effective — ancrée sur un littéral
-- précis, jamais sur l'identifiant de fonction (AGENTS §2.7-D.6).
--
-- PREUVE ROUGE : sans le comment de 0155, obj_description ne contenait pas
-- la marque « IN-01 » et l'assertion échouait.

begin;

select testkit.eq(
  (select count(*) from pg_catalog.pg_description
    where objoid = 'public.update_managed_child_profile(text,text,text,date,text,boolean,text[])'::regprocedure
      and description like '%CONTRAT DES ARGUMENTS (0155, IN-01)%'
      and description like '%birth_date est %CRAS%E sans coalesce%'
      and description like '%asym%trie est d%lib%r%e%'),
  1::bigint,
  'le commentaire du contrat birth_date est porté par la définition effective (0154)');

rollback;
