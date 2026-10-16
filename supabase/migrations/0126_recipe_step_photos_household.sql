-- supabase/migrations/0126_recipe_step_photos_household.sql
-- Phase 21 — Bornage de `recipe_steps.photo_path` au foyer de la ligne
-- (plan 21-05, revue WR-01a, T-21-06/T-21-08).
--
-- `photo_path` est un texte écrit par un membre (politique d'écriture
-- `can_write_household`, 0122). L'Edge `recipe-invite` (21-02) signe ensuite
-- N'IMPORTE QUEL chemin avec le client service-role, qui contourne la politique
-- du bucket `(storage.foldername(name))[1]`. Sans contrainte, un membre peut
-- donc persister le chemin d'un objet d'un AUTRE foyer et en obtenir une URL
-- signée — fuite inter-foyers (WR-01a) ; la même valeur non bornée sert aussi
-- d'image distante arbitraire au navigateur d'un invité (WR-01b, T-21-08).
--
-- La contrainte ferme la CLASSE à l'écriture : tout chemin écrit commence par le
-- foyer de la ligne. `recipe_steps.household_id` est rattaché au foyer de la
-- recette par le déclencheur `align_household` (0122:368-371,
-- `private.align_child_household('recipes', 'recipe_id')`) : la contrainte
-- s'appuie sur cette dénormalisation, elle ne la suppose pas.
--
-- Correction VERS L'AVANT : `0125_recipe_step_photos.sql` est APPLIQUÉE, elle
-- n'est jamais réécrite (AGENTS.md §2.7 A.1).
--
-- Le prédicat est `starts_with`, et non `like household_id || '/%'` : la revue
-- proposait le `like`, mais `household_id` est un TEXTE de la forme
-- `household_<uuid>` (`private.new_id('household')`, 0001:36-43), donc il
-- CONTIENT un `_` — un métacaractère `like` qui matcherait un caractère
-- quelconque. `starts_with` compare un préfixe LITTÉRAL, sans métacaractère, ce
-- qui dit exactement ce que la contrainte veut dire. Toutes les valeurs écrites
-- viennent de `storedValueOf`
-- (`<householdId>/recipes/<recipeId>/steps/<stepId>/…`, `api.ts` →
-- `storage.ts`) et les lignes préexistantes ont `photo_path` à `null` : aucune
-- donnée existante ne viole la contrainte.

begin;

alter table public.recipe_steps
  add constraint recipe_steps_photo_path_household
  check (photo_path is null or starts_with(photo_path, household_id || '/'));

comment on constraint recipe_steps_photo_path_household on public.recipe_steps is
  'Borne `photo_path` au foyer de la ligne : un chemin d''un autre foyer est refusé à l''écriture, donc l''Edge `recipe-invite` (service-role) ne peut plus signer qu''un objet du foyer de la recette (WR-01a, T-21-06).';

commit;
