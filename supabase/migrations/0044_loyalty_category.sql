-- 0044_loyalty_category.sql
-- Catégorie d'enseigne sur les cartes de fidélité (filtre « Alimentaire… »).
--
-- POURQUOI
--   La grille Fidélité mélange supermarchés, librairies et stations-service
--   sans regroupement possible. Une catégorie fermée (11 valeurs + NULL)
--   suffit : le périmètre est stable et partagé par tout le foyer, sans
--   table de configuration comme `provider_types`.
--
--   Nullable sans défaut : les cartes existantes restent sans catégorie et
--   l'interface affiche « Non renseignée ». La contrainte reprend les slugs
--   de `loyaltyCategories` (`fidelite/types.ts`) ; toute valeur hors liste
--   est rejetée côté base comme côté formulaire (zod).
--   RLS inchangée : colonne de la table, politiques `loyalty_cards` existantes.

begin;

alter table public.loyalty_cards
  add column category text;

alter table public.loyalty_cards
  add constraint loyalty_cards_category_check
  check (category is null or category in (
    'alimentaire', 'vetements', 'beaute_sante', 'maison_brico',
    'culture_loisirs', 'hightech', 'sport', 'jouets_enfants',
    'auto_carburant', 'animalerie', 'autre'
  ));

comment on column public.loyalty_cards.category is
  'Catégorie d''enseigne (filtre Fidélité). NULL : non renseignée.';

commit;
