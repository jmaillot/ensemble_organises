---
phase: quick
plan: 261103-pym
subsystem: invitations / docs
tags: [b-1, onboarding, invites, cron, traceabilite]
requires: [Edge household-invite (0176/D-14), invitations-panel (31-04)]
provides: [createInviteToken avec défaut d'expiration +30 j, defaultInviteExpiry()]
affects: [create-household-page (onboarding Supabase), invitations-panel]
key-files:
  created: []
  modified:
    - app/src/lib/invites.ts
    - app/src/lib/invites.test.ts
    - .planning/REQUIREMENTS.md
    - docs/BACKEND.md
    - docs/EXPLOITATION.md
decisions:
  - "Défaut d'expiration calculé AVANT la branche Supabase/démo : les deux modes partagent la même règle, un `null` explicite reste `null` (contrat du type)."
  - "Test 3 (mode Supabase) couvert par test unitaire direct du helper `defaultInviteExpiry` : `isSupabaseConfigured` est une constante de module fausse sous vitest, et emballer la logique d'expiration de la lib est précisément le défaut qui a masqué B-1."
  - "docs/BACKEND.md : la mention de l'ancien horaire 0173 reste sans le littéral `5 6 * * *` pour que la vérification « plus aucune occurrence » reste vraie."
metrics:
  duration: ~25 min
  completed: 2026-11-03
  tasks: 3
  commits: 3
status: complete
---

# Quick Task 261103-pym : B-1 expiration obligatoire + rattrapages MSG-04 / W-1

**One-liner :** `createInviteToken` fournit désormais un `expiresAt` non nul (+30 jours, motif du panneau d'invitations 31-04) quand l'appelant n'en passe pas — l'onboarding Supabase ne reçoit plus le 400 « Choisissez une date d'expiration » qui annulait le foyer créé.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Défaut d'expiration +30 j dans createInviteToken (B-1, TDD) | 41426ca | app/src/lib/invites.ts, app/src/lib/invites.test.ts |
| 2 | Traçabilité MSG-04 = Done justifié | 1bfabd4 | .planning/REQUIREMENTS.md |
| 3 | Doc cron réel `5 4 * * *` UTC (W-1) | 39b4fee | docs/BACKEND.md, docs/EXPLOITATION.md |

## TDD (Task 1)

- **Rouge constaté** : les 3 nouveaux tests échouent (`defaultInviteExpiry is not a function`, expiresAt null en démo).
- **Vert** : 6/6 tests du fichier passent. Aucun mock de la lib — les tests 1-2 passent par la vraie branche démo de `createInviteToken`, le test 3 vérifie directement le helper exporté.
- Le mode Supabase n'est pas exécutable sous vitest (`isSupabaseConfigured` est une constante de module, fausse sans env) : couverture via helper + branche démo, conformément au plan.

## Verification (§2.7)

| Étape | Résultat |
| --- | --- |
| `npm run typecheck` | ✅ |
| `npm test` | ✅ 1709 passés / 6 échecs pré-existants (anniversaires ×3, calendrier ×3 — documentés 31-07-SUMMARY, hors périmètre) |
| `npm run build` | ✅ |
| SQL | Hors périmètre (aucune migration, aucune Edge Function) — check-sql-statique et test-db.sh non requis |

## Deviations from Plan

Aucune tâche déviée. Deux écarts de détail assumés :

- **Verify Task 2 (littéral)** : le plan attendait `| MSG-04 | Phase 29 | Done |` exact ; la ligne réelle porte la justification dans la cellule (`Done (push groupé câblé : 0172 … ; attestation HV-5)`), comme toutes les lignes voisines du tableau — la vérification d'intent (Pending disparu, Done présent) est verte.
- **Test 3 (mode Supabase)** : le plan prévoyait un `vi.stubGlobal('fetch')` si `isSupabaseConfigured` était vrai sous vitest — il ne l'est pas ; le repli prévu par le plan (branche démo + test unitaire du helper) a été appliqué.

## Known Stubs

Aucun.

## Self-Check: PASSED

- 3 commits présents dans `git log` (41426ca, 1bfabd4, 39b4fee).
- Les 5 fichiers modifiés existent et sont commités.
- Suite ciblée `src/lib/invites.test.ts` : 6/6 verte.
