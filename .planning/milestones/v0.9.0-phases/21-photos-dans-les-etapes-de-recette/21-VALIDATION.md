---
phase: "21"
slug: "photos-dans-les-etapes-de-recette"
status: verified
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-16"
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 + Testing Library 16.3.3 (+ `user-event` 14.6.7), MSW 2.15.0, fake-indexeddb 6.2.5 ; Playwright 1.63.0 (e2e) |
| **Config file** | `app/vite.config.ts` (bloc `test:`, l.65-78) + `app/src/test/setup.ts` — `environment: 'jsdom'`, `include: ['src/**/*.test.{ts,tsx}', '../supabase/functions/**/*.test.ts']` |
| **Quick run command** | `cd app && npx vitest run src/modules/recettes/recipe-steps.test.tsx` |
| **Full suite command** | `cd app && npm test` |
| **E2E** | `cd app && npm run test:e2e` |
| **SQL (conteneur)** | `sh scripts/test-db.sh [nnnn]` — `DB_CONTAINER` attend le nom de **service** Compose (`db`), pas le nom de conteneur (`supabase-db`) : `DB_CONTAINER=supabase-db` sort en 1 (`service "supabase-db" is not running`) |
| **Contrôle statique SQL** | `python3 scripts/check-sql-statique.py` |
| **Estimated runtime** | ~90 s (unitaire) · ~5 min (e2e) · ~30 s (SQL) |

---

## Sampling Rate

- **After every task commit:** Run the touched test file then `cd app && npm run typecheck`
- **After every plan wave:** `cd app && npm run typecheck && npm test && npm run build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

> Task IDs are filled by the planner; the requirement → test mapping below is the
> contract the plans must satisfy. Wave 0 items are new/extended test files.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 1 | R1 | — | Au plus une photo par étape ; remplacement écrase et nettoie l'objet précédent | SQL + unit | `sh scripts/test-db.sh 0125` ; `cd app && npx vitest run src/modules/recettes/recipe-step-photo.test.ts` | ✅ livré | ✅ green |
| 21-01-02 | 01 | 1 | R2 | T-21-01 | Écriture réservée à `can_write_household` : un `enfant` ne peut pas déposer (cas négatif SQL) ; aucune commande rendue au `enfant` | SQL + component | `sh scripts/test-db.sh 0125` ; `cd app && npx vitest run src/modules/recettes/recipe-steps.test.tsx` | ✅ livré | ✅ green — clos par **21-06** (`b8db247`) : le cas négatif porte un chemin du **foyer** (`0125:106-122`), donc la contrainte de forme ne peut plus être la cause ; mutation prouvée (élargir la politique à `is_household_member` → `attendu 0, obtenu 1`) |
| 21-03-01 | 03 | 2 | R3 | — | Rendu sur les 4 surfaces ; étape sans photo = zéro élément média | Component ×4 | `cd app && npx vitest run src/modules/recettes/recette-detail-page.test.tsx src/modules/recettes/recipe-cuisine-photo.test.tsx src/modules/recettes/guest-recipe-page.test.tsx` | ✅ livré | ✅ green |
| 21-02-01 | 02 | 2 | R4 | T-21-02 | La vue invitée ne reçoit jamais un chemin brut : URL signée 1 h ou `null` (échec fermé) | Unit (Edge) + SQL (RPC) | `cd app && npx vitest run ../supabase/functions/recipe-invite/guest-steps.test.ts` ; `sh scripts/test-db.sh 0125` | ✅ livré | ✅ green |
| 21-01-03 | 01 | 2 | R5 | — | Nettoyage du bucket aux 3 niveaux ; cas sans photo = no-op sans erreur | Unit + contract | `cd app && npx vitest run src/modules/recettes/recipe-actions.test.ts src/lib/media-path-contract.test.ts` | ✅ livré | ✅ green — clos par **21-06** (`d33b3a1`) : `recette-detail-page.test.tsx:166-181` épingle `removeHouseholdFile` (point le plus haut du trajet) avec un chemin de bucket réel ; retirer l'argument à `recette-detail-page.tsx:464` compile (`stepPhotoPaths = []`) et rend le test rouge |
| 21-01-04 | 01 | 2 | R6 | — | Démo : aperçu `blob:` rendu ; aperçu mort masqué (`onError`), étape rendue sans média | Unit/Component | `cd app && npx vitest run src/modules/recettes/recipe-step-photo.test.ts` | ✅ livré | ✅ green |
| 21-01-05 | 01 | 3 | R1 (négatif) | T-21-03 | Après dépôt, la colonne porte un chemin de bucket, jamais une URL `http(s)://` | Contract | `cd app && npx vitest run src/lib/media-path-contract.test.ts` | ✅ livré | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · ⚠️ partiel (couverture réelle mais non isolante)*

> **Audit Nyquist du 2026-10-16** (`gsd-nyquist-auditor`, lecture seule) : 4/6
> exigences pleinement couvertes, R2 et R5 partielles pour les deux raisons
> ci-dessus — **closes par le plan `21-06`** (`b8db247`, `d33b3a1`), chacune
> prouvée par mutation. Aucun test n'a été généré pendant l'audit : la phase
> était déjà vérifiée (`21-VERIFICATION.md`, 31/31) au HEAD `75850b1`, et des
> tests ajoutés après coup auraient rendu cette vérification périmée sans
> nouvelle passe. La re-vérification déclenchée par le digest périmé (#4682)
> confirme **31/31** avec R2 et R5 désormais isolantes (`G1`, `G2`).

---

## Wave 0 Requirements

- [ ] `supabase/tests/0125_recipe_step_photos.sql` — R1 (colonne + remplacement), R4 (RPC rend `photo_path` brut), R5 (cascade), et l'insertion Storage sous RLS (forme `0038_conversation_matrix.sql:80-100`). **Prouver le cas qui doit échouer** : un `enfant` (hors `can_write_household`) ne peut pas déposer.
- [ ] `app/src/modules/recettes/recipe-step-photo.test.ts` — R1 (résolution chemin/`null`), R6 (aperçu `blob:` rendu, aperçu mort masqué).
- [ ] `app/src/modules/recettes/recette-detail-page.test.tsx` — R3 (surface fiche + impression via `toRecipePrintModel`).
- [ ] `supabase/functions/recipe-invite/guest-steps.test.ts` — R4 (projection `steps[].photoUrl` signée ou `null`). **Raffinement justifié (supplante `index.test.ts`)** : `index.ts` porte des imports Deno/`npm:` (`@supabase/server`, `npm:@supabase/supabase-js@2`, `npm:zod@4.6.5`) et n'est exécutable par aucune chaîne du dépôt — la logique de signature est donc extraite dans le module PUR `guest-steps.ts` (même doctrine que `child-guard.ts`), seul testable par Vitest. Le comportement de l'Edge **déployée** reste vérifié manuellement (voir « Manual-Only »).
- [ ] Étendre `ALIGNED_WRITE_SITES` dans `app/src/lib/media-path-contract.test.ts:75-89` **si** un nouveau fichier devient un site d'écriture de chemin.
- [ ] Framework : déjà installé — aucune installation requise.

*Existing infrastructure covers the tooling; the gaps are new/extended test files.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Signature invitée servie par l'Edge **déployée** | R4 | Aucun test du dépôt n'importe un `index.ts` d'Edge (deno absent) : le comportement d'exécution n'est exercé par aucune chaîne | Déployer, ouvrir `/invitation/recette?code=…`, vérifier que l'image d'étape s'affiche et que le HTML ne contient aucun chemin de bucket |
| Impression d'une recette photographiée | R3 | `window.print()` n'est pas exerçable en jsdom ; le rendu papier réel dépend du navigateur | Ouvrir la fiche, `window.print()`, vérifier que l'image sort sous sa ligne et que la recette tient sur une page |

*Les autres comportements ont une vérification automatisée.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** verified 2026-10-16 — 6/6 exigences couvertes, R2 et R5 isolantes (`21-06`), re-vérification 31/31
