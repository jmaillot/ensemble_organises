# Phase 17 : Mode cuisine — Specification

**Created:** 2026-10-14
**Ambiguity score:** 0.10 (gate: ≤ 0.20)
**Requirements:** 5 locked

## Goal

Depuis une fiche recette, un toggle « Mode cuisine » (en haut à droite du panneau Étapes) bascule vers une vue épurée pour cuisiner : étapes numérotées avec cases à cocher, progression mémorisée sur l'appareil, écran maintenu allumé. Zéro changement serveur.

## Background

- `RecipeSteps` (`app/src/modules/recettes/components/recipe-steps.tsx`) affiche les étapes en bulles numérotées + DnD + édition, avec des cases « cuisson » en **état local seul** (D-12, 16-02). Le mode cuisine est une présentation dédiée par-dessus le même `steps`.
- `Panel` (`app/src/components/shared/module-shell.tsx`) expose une prop `action` rendue en haut à droite de l'en-tête — emplacement du toggle (même motif que le bouton « Favoris » `aria-pressed` de la grille recettes).
- Pattern mémoire appareil éprouvé : `eo:ardoise-code:`, `eo:trip:code:`, `eo:recipe:code:` (phases 15–16). Même régime ici, clé `eo:recette:cuisine:<recipeId>`.
- Wake Lock = API navigateur native (`navigator.wakeLock`), aucune dépendance.

## Requirements

1. **Toggle dans le panneau Étapes** : interrupteur « Mode cuisine » en haut à droite du `Panel` « Étapes » (prop `action`), `aria-pressed`, état actif visible. **OFF par défaut** à chaque ouverture de fiche (le mode ne persiste pas, seule la progression est mémorisée). OFF → `RecipeSteps` actuel (édition, drag, description « Glissez la pastille numérotée pour réordonner. ») ; ON → vue cuisine, description « Cochez au fur et à mesure. Progression mémorisée sur cet appareil. » Le reste de la fiche (ingrédients, actions) reste en place.
   - Current: panneau Étapes = édition seule, pas de vue cuisine.
   - Target: toggle `aria-pressed` dans `Panel action`, bascule d'affichage sans perdre la progression.
   - Acceptance: ouvrir une fiche → toggle OFF, vue édition ; activer → vue cuisine ; désactiver → retour édition, cases conservées.

2. **Liste simplifiée** : en mode ON, chaque étape = numéro + texte + case à cocher. Aucune affordance d'édition (pas d'ajout/modification/suppression, pas de drag, pas de monter/descendre). En-tête de vue : compteur « N/M » + barre de progression visuelle.
   - Current: rien.
   - Target: composant vue cuisine recevant `steps` (+ `readOnly`), cases ≥ 44px, clavier + lecteur d'écran (primitive `Checkbox` existante).
   - Acceptance: 3 étapes → 3 lignes numéro + texte + case, aucun bouton d'édition ; cocher 2 → « 2/3 » + barre à 2/3.

3. **Progression mémorisée par appareil** : cases persistées en `localStorage` (clé exacte `eo:recette:cuisine:<recipeId>` → ids d'étapes cochées). Réouverture (même fiche, même appareil) → reprise où on s'était arrêté ; ids obsolètes (étapes supprimées entre-temps) purgés silencieusement. Bouton « Tout réinitialiser » avec confirmation inline simple (aucune donnée serveur en jeu).
   - Current: cases D-12 réinitialisées à la fermeture.
   - Target: lecture/écriture/purge locale par `recipeId` (clé `eo:recette:cuisine:<recipeId>`), purge à la suppression de recette (même cycle que le cleanup existant si applicable, sinon entrée orpheline inoffensive).
   - Acceptance: cocher 2 étapes, fermer la fiche, rouvrir → 2 cases cochées + « 2/N » ; « Tout réinitialiser » → 0 case.

4. **Écran allumé avec interrupteur** : Wake Lock demandé à l'activation du mode cuisine (si supporté), **interrupteur visible dans la vue cuisine près du compteur** pour couper/rallumer, verrou relâché automatiquement à la sortie du mode / démontage. Si non supporté : pas d'erreur, mention discrète « veille non bloquée sur cet appareil ».
   - Current: rien.
   - Target: `navigator.wakeLock.request('screen')` gardé (/feature-detect), état réacquis sur `visibilitychange` visible (même esprit que les garde-fous existants).
   - Acceptance: sur navigateur supporté, activation → écran maintenu allumé, interrupteur coupe ; sortie du mode → verrou relâché (pas de maintien fantôme).

5. **Page invitée incluse** : même toggle + même vue cuisine sur `/invitation/recette`, alimentés par les étapes de la vue `link-view` déjà chargée. Zéro appel PostgREST supplémentaire, zéro édition.
   - Current: page invitée = fiche lecture seule avec étapes éditables visuellement (composant partagé en `readOnly`).
   - Target: toggle dans le panneau Étapes invité, composant cuisine partagé.
   - Acceptance: lien invité → toggle visible → vue cuisine fonctionnelle (cases + mémoire locale) ; aucun `from()` PostgREST dans le chemin.

## Boundaries

**In scope:**
- Toggle `aria-pressed` en `Panel action` (fiche membre + page invitée)
- Vue cuisine (numéro + texte + case, compteur, barre, réinitialiser)
- Mémoire locale par recette + purge ids obsolètes
- Wake Lock + interrupteur + repli non supporté
- Enfant : toggle visible, cases cochables, rien d'autre (cohérent `readOnly` actuel)
- Tests Vitest + e2e, typecheck + build (chaîne §2.7 hors SQL/DB : aucun SQL)

**Out of scope:**
- Scaler dans le mode cuisine (les quantités ne s'y affichent pas — étapes seules ; scaler reste sur la fiche)
- Minuteur par étape — pas demandé, phase ultérieure
- Photos d'étape — différées depuis la phase 16
- Persistance serveur de la progression — interdite (voir prohibitions)
- Synthèse vocale / mains-libres audio — pas demandé

## Constraints

- Frontend only : aucune migration, aucune RLS, aucune Edge Function. `data`/PostgREST non touchés par ce mode (lecture `steps` déjà chargés par la fiche).
- Aucune nouvelle dépendance (Wake Lock natif, primitive `Checkbox` existante, zones ≥ 44px).
- Conventions AGENTS.md §6/§2.7 : chaîne `cd app && npm run typecheck && npm test && npm run build` + e2e recettes.

## Acceptance Criteria

- [ ] Toggle OFF par défaut, `aria-pressed`, en haut à droite du panneau Étapes (membre + invité)
- [ ] ON → numéros + textes + cases seules, compteur « N/M » + barre, sans édition
- [ ] Cases mémorisées par appareil et par recette, reprise à la réouverture, purge des ids obsolètes
- [ ] « Tout réinitialiser » remet à zéro (confirmation inline)
- [ ] Wake Lock actif en mode ON (supportés), interrupteur coupe/rallume, relâché à la sortie, repli discret sinon
- [ ] Invité : même comportement, zéro PostgREST, zéro édition
- [ ] Enfant : cases cochables, rien d'autre
- [ ] Chaîne verte : typecheck + Vitest + build + e2e recettes

## Edge Coverage

**Coverage:** 6/6 applicable edges resolved · 0 unresolved

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| navigateur sans Wake Lock | R4 | ✅ covered | feature-detect + mention discrète, jamais d'erreur |
| verrou fantôme après sortie | R4 | ✅ covered | release à la sortie/démontage — critère dédié |
| étape supprimée depuis (id coché orphelin) | R3 | ✅ covered | purge silencieuse au chargement — critère dédié |
| recette supprimée (entrée locale orpheline) | R3 | ✅ covered | inoffensive (clé par id, jamais lue) — pas de migration |
| onglet masqué puis visible (verrou perdu) | R4 | ✅ covered | réacquisition sur `visibilitychange` si toggle ON |
| enfant sur le toggle | R1 | ✅ covered | cases seules, cohérent `readOnly` — critère dédié |

## Prohibitions (must-NOT)

**Coverage:** 3/3 applicable prohibitions resolved · 0 unresolved

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT persister la progression côté serveur (état appareil seul, comme D-12) | R3 | resolved | verification: test — aucun appel réseau dans le composant (journal fetch) |
| MUST NOT ajouter de dépendance pour le Wake Lock ou la vue (API native + primitives existantes) | R1/R4 | resolved | verification: judgment — revue lockfile inchangé |
| MUST NOT exposer d'édition en mode cuisine, y compris côté invité (vue lecture seule stricte) | R2/R5 | resolved | verification: test — aucun handler d'écriture câblé en mode ON |

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                              |
|--------------------|-------|------|--------|------------------------------------|
| Goal Clarity       | 0.95  | 0.75 | ✓      | Toggle + vue + mémoire + veille mesurables |
| Boundary Clarity   | 0.90  | 0.70 | ✓      | In/out explicites, 5 exclusions    |
| Constraint Clarity | 0.95  | 0.65 | ✓      | Frontend-only, zéro serveur posé  |
| Acceptance Criteria| 0.90  | 0.70 | ✓      | 8 critères pass/fail               |
| **Ambiguity**      | 0.10  | ≤0.20| ✓      |                                    |

Status: ✓ = met minimum, ⚠ = below minimum (planner treats as assumption)

## Interview Log

| Round | Perspective | Question summary | Decision locked |
|-------|-------------|-----------------|-----------------|
| 1 | User | Présentation : une étape à la fois ou liste ? | Liste simplifiée (numéro + texte + case) |
| 1 | User | Progression : session ou mémorisée ? | Mémorisée par appareil + réinitialiser |
| 1 | User | Wake Lock ? | Oui, avec interrupteur |
| 1 | User | Invités inclus ? | Oui, même composant lecture seule |
| 2 | User | Emplacement du toggle ? | Haut à droite du panneau Étapes (`Panel action`) |
| 2 | User | Toggle persistant ? | OFF par défaut à chaque ouverture |
| 2 | Agent | Interrupteur veille : où ? | Dans la vue cuisine près du compteur (défaut agent, validé) |

---

*Phase: 17-mode-cuisine-recette*
*Spec created: 2026-10-14*
*Next step: /gsd-discuss-phase 17 — implementation decisions (how to build what's specified above)*
