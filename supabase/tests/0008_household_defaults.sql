-- supabase/tests/0008_household_defaults.sql
-- Création de foyer : premier administrateur et types de prestataires par
-- défaut.
--
-- Couvre la porte d'entrée `public.create_household` en `authenticated`
-- (acteur = `auth.uid()`, jamais un paramètre) : le foyer existe, son
-- créateur en est administrateur, et les dix types par défaut sont semés.
-- Le rattrapage des foyers antérieurs (backfill de 0027) tourne une fois, à
-- la migration : il n'est pas rejouable ici.

begin;

do $$
declare
  u uuid := testkit.auth_user('neuf@example.fr', 'Neuf Martin');
begin
  insert into testkit.fx (key, user_id, household_id, row_id) values
    ('neuf', u, null, null);
end;
$$;

select testkit.as_user(user_id, 'neuf@example.fr') from testkit.fx where key = 'neuf';
set local role authenticated;

-- La RPC elle-même est appelable en authenticated : sans le GRANT, elle lève
-- 42501 et le fichier échoue ici, bruyamment.
select testkit.ok(
  (select public.create_household('Foyer Neuf')) is not null,
  'un utilisateur connecté crée son foyer par la RPC');

select testkit.eq(
  (select count(*) from public.household_members
    where household_id = (select id from public.households
                           where created_by = (select user_id from testkit.fx where key = 'neuf'))
      and role = 'admin'),
  1::bigint,
  'le créateur est administrateur de son foyer');

select testkit.eq(
  (select count(*) from public.provider_types
    where household_id = (select id from public.households
                           where created_by = (select user_id from testkit.fx where key = 'neuf'))),
  10::bigint,
  'les dix types par défaut sont semés à la création');

select testkit.ok(
  exists (select 1 from public.provider_types
           where household_id = (select id from public.households
                                  where created_by = (select user_id from testkit.fx where key = 'neuf'))
             and name in ('Médecin', 'Plombier', 'Banque')),
  'les types semés couvrent les métiers courants');

select testkit.eq(testkit.affected(format(
  'insert into public.provider_types (id, household_id, name) values (%L, %L, %L)',
  'pt_perso',
  (select id from public.households where created_by = (select user_id from testkit.fx where key = 'neuf')),
  'Serrurier')), 1::bigint,
  'un type personnalisé s''ajoute à côté des types semés');

select testkit.expect_denied(format(
  'insert into public.provider_types (id, household_id, name) values (%L, %L, %L)',
  'pt_doublon',
  (select id from public.households where created_by = (select user_id from testkit.fx where key = 'neuf')),
  'Médecin'),
  'l''unicité (foyer, nom) tient malgré la semence');
