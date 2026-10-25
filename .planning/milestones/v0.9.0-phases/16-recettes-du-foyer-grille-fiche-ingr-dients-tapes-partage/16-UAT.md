---
status: complete
phase: 16-recettes-du-foyer-grille-fiche-ingr-dients-tapes-partage
source: [16-VERIFICATION.md]
started: 2026-10-14T11:45:00Z
updated: 2026-10-19T00:00:00Z
---

## Current Test

number: 5
name: Catégories et étiquettes depuis l'engrenage
expected: |
  Un bouton portant l'engrenage ouvre un dialogue, sans panneau inline en bas de
  page.
awaiting: none — les 5 items sont passés le 2026-10-19.

## Tests

### 1. Coeur favori grille au pointeur (fix CR-01)
expected: le coeur bascule le favori sans naviguer ; clic carte navigue vers la fiche
result: pass
note: "Confirmed by user 2026-10-18. Demande d'arbitrage traitée : le coeur virait au jaune, seul jaune du dépôt et seul favori hors couleur de l'app → 29ecda8 (`text-amber-300` → `text-coral-strong` sur la carte ; la fiche garde `text-coral`). Chaîne verte : typecheck, 1275 tests unit, build, e2e 123/123 (5 sautés)."

### 2. Aperçu print de la fiche
expected: après mise à l'échelle → Exporter → aperçu d'impression navigateur : nom + ingrédients à l'échelle + étapes numérotées, sans chrome applicatif, avec et sans couverture
result: pass
note: "Confirmed by user 2026-10-18, avec et sans couverture."

### 3. Partage conserve QR + lien à la réouverture
expected: générer un lien, fermer Partager, rouvrir → QR + lien réaffichés sans régénérer ; Arrêter le partage coupe et purge
result: pass
note: "Rejoué en usage le 2026-10-19 (étapes 1→5) : génération, fermeture, réouverture → QR + lien réaffichés avec « Régénérer », aucun message « Lien actif créé ailleurs », donc la mémoire `eo:recipe:code:<id>` est bien relue ; puis « Arrêter le partage » ramène à « Générer un lien » sans QR. Correctif b867382 confirmé en usage."

### 4. Envoyer vers Courses : fusion, pas duplication, listes du foyer seulement
expected: une ligne existante est incrémentée (nom + unité normalisés, quantités sommées) au lieu d'être dupliquée ; le sélecteur ne propose que les listes du foyer
result: pass
note: "Rejoué en usage réel le 2026-10-19. **Le chemin recette → Courses fusionne** (« cela fusionne bien ») : `sendRecipeIngredientsToCourses` lit la liste puis fusionne sur (nom normalisé, unité singularisée). C'était le critère exact du gap G-16-courses-fusion, corrigé par 8269d72. **Sélecteur** : uniquement les listes du foyer, aucune liste « Test » fantôme ni liste de voyage — gap G-16-courses-liste-fantome confirmé corrigé.\nObservation relevée au passage, **hors périmètre de ce gap** : l'ajout *manuel* passe par `shopping-group-card.tsx:88`, qui compare avec `normalizeSearchText` (`courses/types.ts:56`) — casse/accents/ligatures retirés, **pluriel conservé**. Taper `oeufs` quand `oeuf` existe crée donc une ligne de plus, là où taper `oeuf` exactement propose la quantité (comportement voulu, test `courses-page.test.tsx:260`). C'est **délibéré** : le commentaire (:99-101) veut que « Marss » crée une ligne à part plutôt que d'écraser « Mars ». Même limite héritée côté fusion recette (`normalizeItemName`, `recettes/api.ts:732`). Aucun constat ouvert à ce stade."

### 5. Catégories et étiquettes depuis l'engrenage
expected: un bouton engrenage ouvre un dialogue ; plus de panneau inline en bas de page
result: pass
note: "Rejoué en usage le 2026-10-19 : le dialogue s'ouvre bien et **le panneau inline en bas de page a disparu** (gap G-16-settings-dialogue, corrigé par 0d77842). Réserve d'affordance signalée par l'utilisateur : il lit le bouton comme **un bouton texte**, pas comme une icône engrenage. Vérification : le bouton demande bien `icon=\"settings\"` (`recettes-page.tsx:101`), le nom existe au registre (`icon.tsx:35`) et `Button` rend l'icône (`button.tsx:58`) — l'engrenage est donc présent, mais petit (size sm) à gauche d'un libellé en gras, donc peu lisible comme affordance d'icône. **Aucun écart fonctionnel** ; préférence d'affichage à trancher si l'utilisateur veut un bouton icône seule."


## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

Close le 2026-10-19 : les cinq items sont rejoués en usage réel, dont les trois
correctifs de la grille (partage mémorisé, fusion Courses, réglages en dialogue).
Deux réserves d'affichage, aucune fonctionnelle : le coeur favori (traité par
`29ecda8`) et l'affordance du bouton « Catégories et étiquettes » (engrenage présent
mais discret) — à trancher si l'utilisateur veut un bouton icône seule.

## Gaps

- gap_id: G-16-partage-memoire
  truth: "Rouvrir Partager reaffiche QR + lien sans regenerer (comme ardoise/voyage)"
  status: fixed
  reason: "User reported: le mode partager ne conserve pas le qr code et le lien, oblige de regenerer"
  severity: major
  test: 3
  root_cause: "recipe-share-dialog effacait lastCode a la fermeture sans memoire appareil ; ardoise (eo:ardoise-code) et voyage (eo:trip:code) memorisent le brut en localStorage"
  artifacts:
    - path: "app/src/modules/recettes/api.ts"
      issue: "pas de memoire locale du code brut"
    - path: "app/src/modules/recettes/components/recipe-share-dialog.tsx"
      issue: "fermeture purge lastCode, reouverture ne restaure jamais"
  missing:
    - "Memoire eo:recipe:code:<recipeId> posee a la generation, relue a l'ouverture, purgee a la revocation"
  debug_session: ""
  resolved_by: "b867382 (fix 16-03 + recipe-share-dialog.test.tsx 3/3, recettes 36/36, typecheck + build verts)"

- gap_id: G-16-courses-fusion
  truth: "Envoyer vers Courses incremente les lignes existantes au lieu de dupliquer"
  status: fixed
  reason: "User reported: 1 oeuf existant + ajout de 3 = nouvelle ligne au lieu de 4"
  severity: major
  test: 4
  root_cause: "sendRecipeIngredientsToCourses creait aveuglement ; de plus l'accord d'unite (oeuf/oeufs) et la ligature OE (NFD ne decompose pas) empechaient la comparaison"
  artifacts:
    - path: "app/src/modules/recettes/api.ts"
      issue: "creation sans lecture prealable"
    - path: "app/src/modules/courses/api.ts"
      issue: "pas de helper lecture d'articles"
  missing:
    - "Lire la liste, fusionner nom+unite normalises sur lignes non cochees, quantites sommees"
  debug_session: ""
  resolved_by: "8269d72 (listShoppingItems + fusion + recipe-actions.test.ts, recettes 38/38, courses 138/138, typecheck + build verts)"

- gap_id: G-16-courses-liste-fantome
  truth: "Le selecteur d'envoi ne propose que les listes du foyer"
  status: fixed
  reason: "User reported: le selecteur propose une liste 'Test' qui n'existe pas"
  severity: major
  test: 4
  root_cause: "recette-detail-page listait shopping_lists sans filtre trip_id, incluant les fourches voyage (Courses filtre trip_id NULL, use-courses.ts:95)"
  artifacts:
    - path: "app/src/modules/recettes/recette-detail-page.tsx"
      issue: "selecteur sans filtre trip_id"
  missing:
    - "Filtrer trip_id NULL + repli si l'id memorise sort du perimetre"
  debug_session: ""
  resolved_by: "8269d72 (householdShoppingLists + validCoursesListId)"

- gap_id: G-16-settings-dialogue
  truth: "Categories et etiquettes geres depuis un bouton engrenage, pas en bas de page"
  status: fixed
  reason: "User requested: deplacer Categories et etiquettes dans un onglet parametres ou icone engrenage"
  severity: minor
  test: 5
  root_cause: "RecipeSettings rendu en ligne en bas de grille (16-02)"
  artifacts:
    - path: "app/src/modules/recettes/recettes-page.tsx"
      issue: "panneau inline"
    - path: "app/src/modules/recettes/components/recipe-settings.tsx"
      issue: "wrapper Panel inline"
  missing:
    - "Bouton engrenage + dialogue, motif provider-type-dialog"
  debug_session: ""
  resolved_by: "0d77842 (dialogue + preuve ouverture, recettes 38/38, typecheck + build verts)"
