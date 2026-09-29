-- 0034_profiles_city.sql
-- Ville du profil, source de vérité du widget météo de l'accueil.
--
-- POURQUOI
--   La ville était stockée dans `dashboard_widgets.settings` (-> 'city') du
--   widget météo de chaque membre, et en double dans le store local
--   (`household-store.city`). Une ville est la propriété d'une personne, pas
--   d'un widget : un membre sans widget météo n'avait pas de ville, et deux
--   appareils pouvaient diverger. Le formulaire de profil (`parametres/api.ts`)
--   lisait déjà le profil en premier, il ne lui manquait que la colonne.
--
--   Nullable sans défaut : le repli reste `DEFAULT_CITY` ('Lyon') côté
--   interface, comme avant pour un membre sans ville. La contrainte reprend la
--   validation du formulaire (2 à 60 caractères après trim).
--   Aucune reprise des anciennes valeurs : `settings.city` est par membre
--   (`member_id`) quand `profiles.city` est par utilisateur (`auth.users.id`),
--   et un membre `enfant` n'a pas d'utilisateur. Le formulaire réécrit les
--   deux pendant la transition, la lecture privilégie le profil.
--
--   RLS inchangée : `profiles_update` (`id = auth.uid()`) couvre déjà la
--   colonne, le client ne modifie que sa propre ville.

begin;

alter table public.profiles
  add column city text;

alter table public.profiles
  add constraint profiles_city_length
  check (city is null or char_length(btrim(city)) between 2 and 60);

comment on column public.profiles.city is
  'Ville du profil, pilote le widget météo de l''accueil. NULL : repli interface (Lyon).';

commit;
