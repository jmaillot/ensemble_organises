-- 0068_profile_age_attestation.sql
-- Attestation « 15 ans et plus » (CGU art. 3) : horodatée à la première
-- confirmation post-connexion, NULL tant que non attesté. Colonne propre au
-- profil : la politique `profiles_update` (propre ligne) la couvre sans
-- changement RLS. Aucun DML : aucun risque `pending trigger events`.

begin;

alter table public.profiles add column age_attested_at timestamptz;

comment on column public.profiles.age_attested_at is
  'Attestation 15 ans et plus (CGU art. 3), NULL tant que non attestée.';

commit;
