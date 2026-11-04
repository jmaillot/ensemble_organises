---
phase: 30-hygi-ne-du-jalon-dettes-et-r-sidus
plan: 03
subsystem: recettes / assets démo
tags: [dettes, semis-demo, recettes, assets, tdd]
requires: [DET-03]
provides:
  - photo locale créditée pour la recette du semis démo (tartiflette.jpg, CC0)
  - contrat de test seed.test.ts « toute recette du semis a une photo publique »
affects: []
tech-stack:
  added: []
  patterns:
    - test de contrat rouge-avant-vert sur le semis (D-03 méthode générale)
key-files:
  created:
    - app/src/lib/data/seed.test.ts
    - app/public/assets/recettes/tartiflette.jpg
  modified:
    - app/src/lib/data/seed.ts
    - app/public/assets/ATTRIBUTION.md
key-decisions:
  - "Photo choisie CC0 (Wikimedia « Une tartiflette sortie du four ») plutôt que CC BY — domaine public, crédit conservé par rigueur au gabarit lisbonne.jpg."
  - "Arbitrage D-08 appliqué à la mesure réelle : 1 recette dans le semis (seed.ts:568) = 1 photo, pas 12 ; gabarit réutilisable pour toute recette future."
requirements-completed: [DET-03]
duration: ~15 min
completed: 2026-10-31
commits: 2
plan_head_before: 8fa0d1b0499b462556ac2c4a6c0593b1ea8b4c07
plan_head_after: 2448a8206a90dfb60f10b9e9dc2d7b08e8dbf801
actuals:
  tokens: 38000
  tasks: 2
  commits: 2
---

# Phase 30 Plan 03: DET-03 — photo du semis démo Summary

La recette du semis démo (tartiflette) porte désormais une photo locale du bundle crédité (CC0 Wikimedia, 109 Ko, `/assets/recettes/tartiflette.jpg`), prouvée par un test de contrat rouge-avant-vert — plus aucune tuile nue dans la démonstration (D-08/D-09/D-10).

## Accomplishments

- Test de contrat écrit AVANT le semis (`seed.test.ts`, 30 lignes) : chaque `demoRecipes[].cover_photo` doit matcher `/^\/assets\/recettes\/[a-z0-9-]+\.jpg$/`, et le fichier référencé doit exister sur disque (garde anti-chemin mort). Rouge observé et consigné (`cover_photo` undefined) avant toute modification de `seed.ts`.
- Photo libre de droits téléchargée depuis Wikimedia Commons (CC0, « Une tartiflette sortie du four »), recadrée 16:10, réduite à 900 px de large, 109 453 octets — dans la cible 100-200 Ko (D-08). Posée dans `app/public/assets/recettes/tartiflette.jpg`.
- Ligne de crédit ajoutée dans `app/public/assets/ATTRIBUTION.md` au gabarit exact de `lisbonne.jpg` (fichier, titre, auteur, licence, mention recadrage/réduction, URL source).
- `demoRecipes` semé avec `cover_photo: '/assets/recettes/tartiflette.jpg'` (gabarit voyages l.1206) — chemin public du bundle, jamais d'URL distante ni de chemin de bucket (D-10).
- `resolveRecipeCoverUrl` non touché (0 diff sur `api.ts`) : le pass-through `/assets/` existant rend le chemin tel quel, déjà testé par `recipe-cover.test.ts`.

## Verification

- Rouge Task 1 : `npm test -- seed recipe-cover` → 1 failed (cover_photo undefined), 12 passed.
- Vert Task 2 : `cd app && npm run typecheck && npm test && npm run build` → tout vert, `dist/assets/recettes/tartiflette.jpg` présent dans le bundle (141 entrées precache).
- Prohibition D-08/D-10 : les seuls « http » de `seed.ts` sont des `url` de cadeaux démo (`exemple.fr`, lignes 758/834), hors `demoRecipes` ; les couvertures du semis sont toutes des chemins `/assets/`.
- Prohibition T-16-07 : `git diff 8fa0d1b..HEAD -- app/src/modules/recettes/api.ts` vide.

## Deviations from Plan

None - plan executed exactly as written. Note : le plan frontmatter `files_modified` mentionnait la création de `seed.test.ts` (nouveau fichier, pas une modification) — conforme à l'intention.

## Coverage

- deliverable: Contrat « toute recette du semis a une photo publique »
  human_judgment: false
  verification:
    - kind: tests
      ref: tests/src/lib/data/seed.test.ts#Semis démo — couvertures recettes (DET-03)
      status: pass
    - kind: tests
      ref: tests/src/modules/recettes/recipe-cover.test.ts#Couverture recettes (R9)
      status: pass
- deliverable: Photo locale crédité (100-200 Ko, ATTRIBUTION.md)
  human_judgment: false
  verification:
    - kind: command
      ref: "ls -la app/public/assets/recettes/tartiflette.jpg (109453 octets) + grep tartiflette app/public/assets/ATTRIBUTION.md"
      status: pass
    - kind: command
      ref: "ls dist/assets/recettes/tartiflette.jpg après npm run build"
      status: pass
- deliverable: Aucune tuile nue dans la démo (constat visuel du rendu)
  human_judgment: true
  rationale: "La présence du fichier + du contrat garantit le chemin ; l'appréciation visuelle de la tuile dans l'app démo reste à l'opérateur (cohérent avec le constat hors ligne du 30-02)."

## Commits

- 57c5f2e — test(30-03): contrat rouge - toute recette du semis doit porter une photo publique
- 2448a82 — feat(30-03): la tartiflette du semis porte sa photo locale creditee (DET-03)

## Self-Check: PASSED

- [x] app/src/lib/data/seed.test.ts existe
- [x] app/public/assets/recettes/tartiflette.jpg existe (109 Ko)
- [x] app/public/assets/ATTRIBUTION.md contient la ligne recettes/tartiflette.jpg
- [x] Commits 57c5f2e et 2448a82 vérifiés dans git log
- [x] Chaîne typecheck/tests/build verte après le vert
