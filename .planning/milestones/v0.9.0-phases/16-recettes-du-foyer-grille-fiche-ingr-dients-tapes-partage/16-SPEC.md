# Phase 16 : Recettes du foyer — Specification

**Created:** 2026-10-14
**Ambiguity score:** 0.15 (gate: ≤ 0.20)
**Requirements:** 14 locked

## Goal

Le module Recettes passe d'un écran d'attente à un module complet : grille de recettes par catégorie, fiche cliquable (ingrédients + étapes), mise à l'échelle des quantités au nombre de personnes, partage invité lecture seule + export PDF, favoris/recherche et envoi vers Courses.

## Background

- `public.recipes` existe (0003) au schéma minimal : `id, household_id, title, created_at`. RLS activée, politiques en 0007 (accès foyer). Aucune table enfant (ingrédients, étapes, catégories, tags).
- `app/src/modules/recettes/recettes-page.tsx` affiche un EmptyState d'attente + liste des titres existants. Aucun formulaire, aucune fiche.
- Pattern de partage externe éprouvé : ardoises (`create/revoke/redeem_ardoise_invite`, Edge serveur seul, hash HMAC, oracle unique) et voyages (0118). À répliquer en lecture seule pour les recettes.
- Pattern photos éprouvé : bucket privé + chemin stocké + URL signée + cleanup (phase 13).
- Périmètre enfants (phase 14) : ardoises/cadeaux fermés aux enfants. Décision ici : recettes **visibles mais lecture seule** pour le rôle enfant.

## Requirements

1. **Grille petits carrés par catégorie** : les recettes s'affichent en grille de cartes (photo, nom, catégorie, tags, temps total, favori), groupées par catégorie, section « Recettes du foyer » en premier.
   - Current: liste texte verticale des titres, sans photo ni catégorie.
   - Target: grille responsive de cartes cliquables vers la fiche.
   - Acceptance: avec 3 recettes dans 2 catégories, la grille affiche 3 cartes groupées sous 2 en-têtes, chaque carte navigue vers sa fiche.

2. **Catégories** : une catégorie « Recettes du foyer » existe par défaut ; admins et membres peuvent créer/renommer des catégories du foyer.
   - Current: aucune table catégorie.
   - Target: `recipe_categories (id, household_id, name)` + `recipes.category_id` défaut = catégorie foyer ; création ouverte aux rôles admin/membre (pas enfant).
   - Acceptance: création d'une catégorie « Desserts » par un membre puis assignation d'une recette ; suppression d'une catégorie vide possible, suppression d'une catégorie pleine réassigne vers « Recettes du foyer ».

3. **Création recette** : formulaire avec nom (requis), photo couverture (optionnelle), tags, catégorie (défaut foyer), nombre de personnes de référence, temps prépa + cuisson (sélecteurs heure/minute, optionnels).
   - Current: aucun formulaire.
   - Target: dialogue/page de création avec ces 7 champs, validation nom 1–200.
   - Acceptance: créer une recette « Gratin » pour 4 avec 30 min prépa + 45 min cuisson affiche temps total 1h15 sur la carte.

4. **Étiquettes multi + seed + paramètres** : plusieurs tags par recette ; 14 tags seed ; création à la volée à la saisie ; gestion (renommer/supprimer) en paramètres.
   - Current: aucun tag.
   - Target: `recipe_tags (household_id, name)` seedés (Apéro, Entrée, Plat, Dessert, Goûter, Petit-déj, Boissons, Asie, Italien, Mexicain, Oriental, Pâtes, Végétarien, Poisson) + `recipe_tag_links` ; saisie libre crée le tag.
   - Acceptance: saisir « #Thermomix » crée le tag et l'assigne ; renommer un tag en paramètres se répercute sur les recettes liées.

5. **Fiche recette cliquable** : clic carte → fiche avec header (photo/nom/meta), scaler personnes, ingrédients recalculés, étapes numérotées.
   - Current: aucune fiche.
   - Target: route fiche par `recipe_id`, sections Ingrédients + Étapes.
   - Acceptance: clic sur chaque carte ouvre la fiche correspondante avec les bons ingrédients/étapes.

6. **Ingrédients structurés** : chaque ingrédient = nom (requis) + nombre (optionnel, décimal) + unité/texte (optionnel, ex. « cas », « g », « pincée(s) »).
   - Current: rien.
   - Target: `recipe_ingredients (recipe_id, name, quantity numeric nullable, unit text nullable, position)` ; « sel au goût » = nombre NULL.
   - Acceptance: « Farine / 500 / g » et « Sel / NULL / au goût » s'enregistrent et s'affichent correctement.

7. **Étapes numérotées reliées + drag** : contenu texte par étape ; numéro automatique en bulle à gauche ; point reliant 2 étapes consécutives ; réordonnancement par glisser-déposer sur la bulle.
   - Current: rien.
   - Target: `recipe_steps (recipe_id, content, position)` ; DnD via dnd-kit sur la poignée bulle ; renumérotation serveur.
   - Acceptance: 3 étapes affichent bulles 1-2-3 reliées par un point ; drag de 3→1 renumérote et persiste après rechargement.

8. **Scaler personnes** : le curseur démarre à la valeur de référence saisie arrondie au pair le plus proche (ex. réf 3 → 4) ; valeurs = multiples de 2 (2–12) ; `qté_affichée = qté_réf × (cible / base)` ; affichage en **décimaux** avec **accord auto de l'unité** (ex. 1 œuf pour 4 → 0.5 œuf à 2 → 2 œufs à 8) ; lignes sans nombre inchangées.
   - Current: rien.
   - Target: stepper/curseur pair 2–12 initialisé à `servings` arrondi au pair ; recalcul client en décimaux + accord simple (+s/+x).
   - Acceptance: recette « 1 œuf pour 4 » affichée à 2 → « 0.5 œuf » ; à 8 → « 2 œufs » ; « sel au goût » inchangé à toutes les valeurs.

9. **Photo de couverture** : 1 photo de couverture par recette (bucket privé, URL signée, cleanup à la suppression). Photos d'étape : **différé** (décision discuss 2026-10-14).
   - Current: aucune photo recette.
   - Target: upload couverture, chemin stocké, URL signée éphémère.
   - Acceptance: upload couverture visible en carte + fiche ; suppression recette supprime l'objet Storage (aucun orphelin).

10. **Enfant lecture seule** : le rôle enfant voit recettes, catégories, tags, ingrédients, étapes mais aucun bouton créer/modifier/supprimer/partager.
    - Current: module visible sans gating (placeholder).
    - Target: RLS SELECT ouvert aux enfants du foyer, INSERT/UPDATE/DELETE refusés ; UI masque les actions + garde non-autorisé sur les routes d'édition.
    - Acceptance: connecté en enfant, création via UI absente et INSERT direct refusé (test négatif) ; lecture OK.

11. **Lien invité lecture seule** : partage externe sans compte, révocable, sur le pattern ardoise (hash HMAC serveur seul, expiration/max-uses, oracle unique).
    - Current: rien.
    - Target: `recipe_shares (recipe_id, share_hash, expires_at, max_uses, revoked)` + RPC serveur seuls + Edge `recipe-invite` ; page invitée lecture seule (fiche + scaler, sans édition).
    - Acceptance: lien généré visible sans compte ; révoqué → « lien invalide » ; compteur max-uses respecté.

12. **Export PDF** : bouton d'export de la fiche (mise en page print CSS, sans lib PDF en phase 1).
    - Current: rien.
    - Target: vue print (ingrédients à l'échelle courante + étapes numérotées) via CSS `@media print`.
    - Acceptance: aperçu avant impression contient nom, ingrédients recalculés et étapes, même sans photo.

13. **Favoris + recherche + filtres** : favori par membre, recherche nom/ingrédient, filtres catégorie/tags.
    - Current: rien.
    - Target: `recipe_favorites (recipe_id, member_id)` ; barre recherche + filtres combinables.
    - Acceptance: marquer 1 favori, rechercher « gratin » et filtrer `#Dessert` retournent les bonnes cartes ; recherche insensible aux accents.

14. **Envoi vers Courses** : bouton « Ajouter à une liste » → choix d'une `shopping_lists` du foyer → insère les ingrédients (quantités à l'échelle courante) dans `shopping_list_items`.
    - Current: rien (idée listée dans RECIPE_FEATURES).
    - Target: sélecteur de liste + insert groupé `nom + quantité × unité`.
    - Acceptance: envoi de 3 ingrédients à l'échelle 8 vers « Courses semaine » crée 3 lignes avec les bonnes quantités.

## Boundaries

**In scope:**
- Grille cartes + groupement catégorie + fiche ingrédients/étapes
- CRUD catégories (défaut foyer + créées par admin/membre), tags seed + volée + paramètres
- Ingrédients structurés + scaler pair 2–12 + fractions ½
- Étapes numérotées + liaison point + DnD sur bulle + photo d'étape optionnelle
- Enfant lecture seule (RLS + UI)
- Lien invité lecture seule révocable (pattern ardoise) + export print/PDF
- Favoris + recherche + filtres catégorie/tags
- Envoi vers Courses
- Migration SQL + suite de preuves + UI + e2e, chaîne §2.7

**Out of scope:**
- Valeurs nutritionnelles / calories — pas de source de données, phase ultérieure
- Import automatique depuis URL — parsing externe fragile, hors phase
- Commentaires/notes sur recettes — pas demandé, Cercle couvre le social
- Planning repas / menus semaine — module distinct à cadrer séparément
- Galerie multi-photos de couverture — 1 seule en phase 1
- Partage externe en écriture — lecture seule uniquement
- Notifications push dédiées recettes — push existant non étendu ici

## Constraints

- Migrations vers l'avant uniquement, `search_path = ''`, tables qualifiées `public.`, RLS + tests négatifs inter-foyer (2 foyers) et escalade enfant — conventions AGENTS.md §2.6/§2.7.
- Secret HMAC partage dans Vault/secret manager uniquement, jamais en base ni en clair dans `cron.job` ; token brut affiché une seule fois.
- dnd-kit modulaire (`@dnd-kit/core/sortable`) pour le DnD étapes, zones tactiles ≥ 44px, alternative clavier au drag.
- Photos : bucket privé, URLs signées, cleanup — pas de bucket public.

## Acceptance Criteria

- [ ] Grille de cartes groupées par catégorie, clic → fiche correcte
- [ ] Catégorie « Recettes du foyer » par défaut ; création admin+membre ; suppression pleine réassigne au défaut
- [ ] Création avec les 7 champs ; temps total affiché (prépa + cuisson)
- [ ] Tags multi, seed 14, création à la volée, gestion en paramètres
- [ ] Ingrédients nom + nombre + unité ; NULL accepté (« au goût »)
- [ ] Étapes bulles 1..n reliées par point ; DnD sur bulle persiste après reload
- [ ] Scaler démarre à la référence, valeurs paires 2–12, 1 œuf/4 → ½ œuf/2 → 2 œufs/8
- [ ] Couverture unique ; cleanup Storage sans orphelin (photos d'étape différées)
- [ ] Enfant : lecture OK, écriture refusée serveur + UI masquée
- [ ] Lien invité sans compte OK, révoqué/expiré → invalide, max-uses respecté
- [ ] Export print contient ingrédients à l'échelle + étapes
- [ ] Favoris + recherche (insensible accents) + filtres combinés
- [ ] Envoi vers Courses crée les lignes aux bonnes quantités
- [ ] Chaîne §2.7 verte : typecheck + tests + build + e2e + statique SQL + test-db

## Edge Coverage

**Coverage:** 7/8 applicable edges resolved · 1 unresolved

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| suppression catégorie pleine | R2 | ✅ covered | réassigne vers défaut — critère R2 |
| quantité NULL | R6/R8 | ✅ covered | affichée telle quelle — critère R8 |
| décimaux + accord auto | R8 | ✅ covered | 0.5 œuf / 2 œufs — critère R8 |
| lien révoqué/expiré | R11 | ✅ covered | « lien invalide » — critère R11 |
| écriture enfant | R10 | ✅ covered | refus serveur + UI masquée — critère R10 |
| orphelin Storage | R9 | ✅ covered | cleanup — critère R9 |
| servings référence impaire (ex. 3) | R8 | ✅ covered | arrondi au pair le plus proche (3→4) — critère R8 |
| max-uses = 1 + accès concurrent | R11 | ⚠ UNRESOLVED | planner traite en hypothèse : transaction atomique côté serveur |

## Prohibitions (must-NOT)

**Coverage:** 3/3 applicable prohibitions resolved · 0 unresolved

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT élargir la RLS pour les invités (lecture via Edge/RPC serveur seul, jamais de politique publique) | R11 | resolved | verification: test — suite SQL invité illisible en direct |
| MUST NOT stocker le token brut ou le secret HMAC en base | R11 | resolved | verification: judgment — revue migration (hash seul) |
| MUST NOT permettre l'écriture enfant via UI ou RLS (même masquée) | R10 | resolved | verification: test — test négatif INSERT enfant |

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                              |
|--------------------|-------|------|--------|------------------------------------|
| Goal Clarity       | 0.90  | 0.75 | ✓      | Grille→fic→scaler→partage mesurables |
| Boundary Clarity   | 0.85  | 0.70 | ✓      | In/out explicites, 7 exclusions    |
| Constraint Clarity | 0.80  | 0.65 | ✓      | RLS/HMAC/Storage/dnd-kit posés    |
| Acceptance Criteria| 0.80  | 0.70 | ✓      | 14 critères pass/fail              |
| **Ambiguity**      | 0.15  | ≤0.20| ✓      |                                    |

Status: ✓ = met minimum, ⚠ = below minimum (planner treats as assumption)

## Interview Log

| Round | Perspective    | Question summary         | Decision locked                    |
|-------|----------------|-------------------------|------------------------------------|
| 1     | Researcher     | Catégories : défaut vs vue ? qui crée ? | Catégorie réelle foyer + création admin/membre |
| 1     | Researcher     | Tags : un ou multi ? liste figée ? | Multi + 14 seeds + volée + paramètres |
| 1     | Simplifier     | Scaler : pas imposé ou libre ? non-proportionnels ? | Proportionnel strict, textes libres inchangés |
| 1     | Boundary Keeper| Partage externe : lien vs export ? | Lien lecture seule + export PDF |
| 1     | Boundary Keeper| Bonus phase 1 ? | Favoris+recherche, Courses ; difficulté/source exclus |
| 2     | Seed Closer    | Base scaler + plage ? ½ œuf ? | Démarre à réf arrondie au pair, paires 2–12, décimaux + accord auto |
| 2     | Seed Closer    | Photos couverture/étapes ? | Couverture seule, photos d'étape différées |
| 2     | Seed Closer    | Rôle enfant ? | Visible lecture seule |

---

*Phase: 16-recettes-du-foyer-grille-fiche-ingr-dients-tapes-partage*
*Spec created: 2026-10-14*
*Next step: /gsd-discuss-phase 16 — implementation decisions (how to build what's specified above)*
