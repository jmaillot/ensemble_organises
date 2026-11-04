---
phase: 25-profils-enfants-g-r-s-par-le-parent
plan: 07
subsystem: app-frontend
tags: [enfants, d06-eligibilite, routines, rpc-0146, pickers, delegation]
requires:
  - 25-05 (profils enfants gérés, fiche, useIsAdult — D-04/D-05)
  - 0146 (RPC complete_routine_occurrence, garde 42501 D-13)
provides:
  - app/src/lib/member-eligibility.ts — la garde D-06 pure en un point unique
  - « Cocher pour » sur la carte de routine (D-08/D-11 côté UI)
  - markOccurrenceDone branché sur le RPC complete_routine_occurrence
affects:
  - taches/routines/menu/ardoise (pickers d'enfants)
  - routine-card / routines-page / use-routines / routines/api
tech-stack:
  added: []
  patterns:
    - fonction pure de garde (paramètre, jamais le store) consommée par N surfaces
    - self = cas particulier de la délégation (un seul chemin d'écriture)
key-files:
  created:
    - app/src/lib/member-eligibility.ts
    - app/src/lib/member-eligibility.test.ts
    - app/src/modules/taches/components/task-form-dialog.test.tsx
    - app/src/modules/routines/components/routine-form-dialog.test.tsx
    - app/src/modules/menu/components/meal-dialog.test.tsx
    - app/src/modules/ardoise/ardoise-members-child-guard.test.tsx
    - app/src/modules/routines/occurrence-rpc.test.ts
    - app/src/modules/routines/hooks/use-routines-occurrence.test.tsx
    - app/src/modules/routines/components/routine-card.test.tsx
  modified:
    - app/src/modules/taches/components/task-form-dialog.tsx
    - app/src/modules/routines/components/routine-form-dialog.tsx
    - app/src/modules/menu/components/meal-dialog.tsx
    - app/src/modules/ardoise/components/ardoise-members-dialog.tsx
    - app/src/modules/routines/components/routine-card.tsx
    - app/src/modules/routines/routines-page.tsx
    - app/src/modules/routines/hooks/use-routines.ts
    - app/src/modules/routines/api.ts
decisions:
  - "Ardoise : le filtre de rôle (admin|membre) cède à la règle fiduciaire D-05 — une fiche enfant qui sert 'ardoise' figurera, le serveur 0146 reste l'autorité (la base n'accepte une telle fiche que si 0146 évolue)."
  - "Self-toggle délègue à toggleFor : self = cas particulier de la délégation, un seul chemin d'écriture (p_member_id = membre courant)."
  - "toggleFor porte la garde d'éligibilité en plus des gardes foyer/adulte — la garde UI précède le RPC, le serveur 0146 revalide."
  - "markOccurrenceMissed (décocher) reste sur l'écriture directe : 0146 ne pose pas de RPC pour le statut « manque » et la délégation ne concerne que la complétion — comportement préexistant inchangé."
metrics:
  duration: "≈ 35 min"
  completed: 2026-10-26
  tasks: 3
  commits: 6
  plan_head_before: 598d5bea3f36647aabdaabf30c433de532cfbeef
  plan_head_after: 01855d4f04e641eeb3744a41a9244ba090a67a1a
actuals:
  tokens: 12800   # ≈ 51 090 caractères de diff / 4 (estimate : 52 000)
  tasks: 3
  commits: 6
status: complete
---

# Phase 25 Plan 07: Garde UI D-06 + délégation « Cocher pour » + RPC 0146 Summary

**One-liner :** la garde d'éligibilité D-06 vit désormais dans une fonction pure (`member-eligibility.ts`) consommée par les quatre pickers, et cocher une routine AU NOM d'un enfant passe par le RPC `complete_routine_occurrence` (0146) depuis le menu « Cocher pour » de la carte.

## What Was Built

- **`app/src/lib/member-eligibility.ts`** — `eligibleMembersForModule(members, moduleKey)` : adultes toujours listés ; enfant servi ssi sa fiche (`managed_modules`, D-05) porte la clé ET `deleted_at` null (double filet sur le filtre du store, D-04). Aucune liste de clés en dur — l'absence refuse par défaut, même sémantique que la base (0146).
- **Quatre pickers branchés** (tâches, routines, menu, ardoise) : un enfant hors-module est ABSENT des options (pas désactivé, UI-SPEC). L'ardoise abandonne son filtre de rôle pour la même règle — zéro divergence d'espace possible (T-25-22).
- **« Cocher pour »** (routine-card) : menu Radix listant les enfants éligibles '`routines`' (calculés par la page via la fonction pure, filtrés aux enfants), zone tactile 44px, noms tronqués (A5). Absent pour un acteur enfant (readOnly).
- **`routines/api.ts`** — `markOccurrenceDone` passe par `supabase.rpc('complete_routine_occurrence', { p_routine_id, p_occurrence_date, p_member_id })` en mode Supabase ; l'acteur est résolu par auth.uid() côté serveur (jamais un paramètre client, ENF-03) ; le refus 42501 (D-13) remonte en Error. Plus AUCUNE écriture directe `routine_completions` sur ce chemin ; le repli démo garde l'upsert local.
- **`use-routines.ts`** — `toggleFor(routine, memberId)` avec gardes foyer + adulte + éligibilité D-06 de la cible ; `toggleOccurrence` délègue (self = cas particulier, non-régression testée).

## Verification

- `npm run typecheck` ✓ — `npm test` ✓ **1617 tests verts (201 fichiers)** — `npm run build` ✓
- grep : `eligibleMembersForModule` importé par les quatre pickers + les trois consommateurs légitimes (hook, page, carte) ; `complete_routine_occurrence` présent dans `routines/api.ts` ; les écritures directes restantes ne sont que le repli démo et les chemins préexistants hors périmètre (décocher, suppression, cascade).
- Rouges attestés avant chaque vert : `4d12133` → `88c46c8`, `a89a62c` → `829a25f`, `5cc1e98` → `01855d4`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `role` manquant dans les fixtures `baseMember` des sept fichiers de tests**
- **Found during:** Tasks 2-3 (au typecheck du vert de Task 3)
- **Issue:** les littéraux `baseMember` omettaient la propriété requise `role` (TS2741) et la fixture de routine-card dupliquait `id` (TS2783)
- **Fix:** `role: 'membre'` porté par chaque `baseMember` (surchargé par les enfants) ; `id` retiré du corps avant spread
- **Files modified:** les 7 fichiers de tests du plan
- **Commit:** 01855d4

**2. [Rule 1 - Test] Le test ardoise initial ne pouvait pas rougir**
- **Found during:** Task 2 (le test passait avant branchement — le filtre de rôle excluait déjà les enfants)
- **Issue:** un test vert avant sa règle n'est pas un test (AGENTS §2.7-D)
- **Fix:** ajout de l'assertion du vrai delta : une fiche enfant qui SERT 'ardoise' figure désormais (fiduciaire D-05), attestée rouge au commit a89a62c
- **Commit:** a89a62c (rouge amende) / 829a25f (vert)

Aucune autre déviation — le plan a été exécuté tel qu'écrit.

## Security Notes

- L'acteur n'est JAMAIS un paramètre client : le RPC 0146 résout `auth.uid()` côté serveur (T-25-21 mitigé).
- La garde UI (picker, toggleFor) n'ouvre aucun chemin que la base n'autorise pas : l'UI falsifiée n'octroie rien (T-25-20 accepté).
- La règle D-06 en un point unique interdit structurellement une divergence entre espaces (T-25-22 mitigé).

## Known Behavior Boundaries (pas des stubs)

- `markOccurrenceMissed` (décocher) et les suppressions d'occurrences écrivent toujours directement via l'adaptateur : 0146 ne pose pas de RPC pour ces éléments et la délégation parentale ne concerne que la complétion. Comportement préexistant, hors périmètre du plan.
- L'ardoise reste non-servable côté base (0146) : l'UI suit la fiche, le serveur revalide ; tant que la base refuse la clé, aucune fiche enfant ne la porte.

## Self-Check: PASSED

- 9 fichiers créés / 8 modifiés : tous présents.
- 6 commits mesurés du ledger (`598d5be..01855d4`) : tous dans `git log`.
- Suite vitest 1617/1617 (deux suites de ce plan portent le comptage de 1595 à 1617), typecheck et build verts.
