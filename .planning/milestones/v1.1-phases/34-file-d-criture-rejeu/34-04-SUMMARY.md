---
phase: 34
plan: 04
subsystem: offline-outbox
tags: [outbox, offline, badge, replay, purge, signOut]
requires: [34-02, 34-03, 32-D10 gate]
provides: [useOutbox source unique, badge N en attente/N bloquées, toast D-12, panneau Réessayer/Abandonner, purge D-17]
affects: [use-outbox-gate, banner-slot, router, session-store, household-store, use-auth, offline-panel, profile-form, mobile-drawer]
tech-stack:
  added: []
  patterns: [setQueryData comme seul canal d'écriture de la file, scan-avertir-purger, hook confirm partagé]
key-files:
  created:
    - app/src/hooks/use-outbox.ts
    - app/src/hooks/use-outbox.test.ts
    - app/src/hooks/use-outbox-gate.test.ts
    - app/src/hooks/use-outbox-replay-badge.ts
    - app/src/hooks/use-outbox-replay-badge.test.ts
    - app/src/hooks/use-sign-out.ts
  modified:
    - app/src/hooks/use-outbox-gate.ts
    - app/src/components/banners/banner-slot.tsx
    - app/src/components/banners/banner-slot.test.tsx
    - app/src/app/router.tsx
    - app/src/lib/offline/outbox.ts
    - app/src/lib/offline/outbox-replay.ts
    - app/src/stores/session-store.ts
    - app/src/stores/session-store.test.ts
    - app/src/stores/household-store.ts
    - app/src/stores/household-store.test.ts
    - app/src/modules/parametres/components/offline-panel.tsx
    - app/src/modules/parametres/components/offline-panel.test.tsx
    - app/src/modules/parametres/components/profile-form.tsx
    - app/src/components/shared/mobile-drawer.tsx
decisions:
  - "Gate 32-D10 : isEmpty = pendingCount === 0 (les échecs terminaux ne bloquent pas la mise à jour SW — contrat de signature préservé)"
  - "Badge en priorité 4 du banner-store (au-dessus de sw-update=1, install=2, offline-stale=3), visible online comme offline"
  - "retryOutboxEntry vit dans outbox-replay.ts (pas outbox.ts) : un emplacement dans outbox.ts créerait un cycle d'imports"
  - "useSignOutWithConfirm : hook unique (createElement, .ts) portant la confirm-dialog D-17 pour les 3 chemins de déconnexion"
  - "Changement de foyer purge l'outbox SANS confirmation (D-17) : l'utilisateur a demandé le départ, preuve par test de la purge réelle"
metrics:
  duration: ~2h45
  completed: 2026-11-05
actuals:
  tasks: 3
  commits: 3
  plan_head_before: ee7d0a5def432257f5e9d3b2c019f7883a7f9a18
  plan_head_after: 3aa93c3
status: complete
---

# Phase 34 Plan 04: Badge, panneau Réessayer/Abandonner et purge D-17 Summary

**One-liner :** source unique `useOutbox` (D-03) branchée à la gate 32-D10 sans toucher la phase 32, badge « N en attente / N bloquées » priorité 4, toast d'échec terminal une fois par passe (D-12), panneau Paramètres avec Réessayer (rejeu FIFO) et Abandonner (confirm-dialog), purge D-17 scan-avertir-purger dans le goulot `signOut`.

## Tasks completed

| Task | Name | Commit |
|------|------|--------|
| 1 | use-outbox source unique (D-03) + gate 32-D10 | ad1296d |
| 2 | Badge « N en attente »/« N bloquées » + toast D-12 | a2f9b97 |
| 3 | Panneau Réessayer/Abandonner + purge D-17 | 3aa93c3 |

## What was built

- **useOutbox** (`app/src/hooks/use-outbox.ts`) : la file est une query TanStack (`[...OUTBOX_KEY, userId, householdId]`), `queryFn: []` (état client, jamais fetché), comptages dérivés par filter — aucune donnée stockée à part (D-03). Inactive sans couple (utilisateur, foyer).
- **Gate 32-D10** : `useOutboxGate` re-câblée sur `useOutbox` ; signature `{ isEmpty: boolean }` préservée, aucun composant de la phase 32 modifié.
- **Badge** (`use-outbox-replay-badge.ts`) : poussé au banner-store en priorité 4 à chaque changement de la file ; « 1 écriture bloquée » ouvre la bannière cliquable vers `/parametres`. Toast D-12 : antirebond 400 ms par passe, un seul toast par rafale d'échecs, aucun toast pour le pending seul, réaffichage seulement sur de NOUVEAUX échecs. Monté une fois dans `router.tsx` à côté d'`OutboxReplayWatcher`.
- **Panneau** (`offline-panel.tsx`) : section « Écritures en attente » — libellé `outboxEntryLabel` (opération en français + table), statut, message d'échec et code pour les bloquées. Réessayer → `retryOutboxEntry` (statut → pending, puis `replayOutbox`) ; Abandonner → confirm-dialog puis `abandonOutboxEntry`. Aucune `values` de ligne ne sort vers l'écran (T-34-08). État vide soigné.
- **Purge D-17** (`session-store.ts`) : `OutboxPendingError` typée ; `signOut` scanne le pendingCount AVANT `stopPersisting()` et rejette sans `{ acknowledgePendingWrites: true }`. `useSignOutWithConfirm` porte la confirm-dialog pour profile-form, mobile-drawer et le refuse d'attestation. Le changement de foyer purge l'outbox du foyer quitté SANS confirmation (commentaire documentaire + test de purge réelle via idb-keyval).

## Verification

- `npx vitest run src/modules/parametres src/stores` : 143 tests verts (13 fichiers)
- `npm run typecheck` : vert
- `npm test` : 1849/1851 — les 2 seuls échecs sont les 2 tests anniversaires PRÉ-EXISTANTS (documentés dans les SUMMARY 34-02/34-03, hors périmètre)
- `npm run build` : vert (précache SW régénéré)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Tests badge : notifications d'observateurs TanStack bloquées par les fake timers**
- **Found during:** Task 2
- **Issue:** `setQueryData` sous `vi.useFakeTimers()` n'atteint pas l'observateur déjà monté — `notifyManager` diffuse via `setTimeout`, jamais consommé.
- **Fix:** le helper `seed` du test consomme un micro-tick (`vi.advanceTimersByTime(0)`) après chaque écriture ; matchers regex pour textes multi-nœuds ; `waitFor` remplacé par avance de timers (il pend sous fake timers).
- **Files modified:** `use-outbox-replay-badge.test.ts`
- **Commit:** a2f9b97

**2. [Rule 1 - Bug] "Rendered more hooks" dans RequireAttestation**
- **Found during:** Task 3
- **Issue:** `useSignOutWithConfirm` était appelé après les retours anticipés du composant d'attestation — ordre des hooks variable.
- **Fix:** hook appelé en tête de composant, avant tout `return`.
- **Files modified:** `app/src/app/router.tsx`
- **Commit:** 3aa93c3

**3. [Rule 1 - Bug] banner-slot.test sans QueryClientProvider**
- **Found during:** Task 3
- **Issue:** depuis 34-D03, la gate lit la file via `useOutbox` (query) — le rendu du slot en test exigeait le provider.
- **Fix:** helper `renderSlot` enveloppé dans `QueryClientProvider`.
- **Files modified:** `app/src/components/banners/banner-slot.test.tsx`
- **Commit:** 3aa93c3

**4. [Rule 3 - Blocking] Montage du watcher badge hors liste de fichiers du plan**
- **Found during:** Task 2
- **Issue:** le badge n'existe pas si personne ne monte `OutboxBadgeWatcher` — `router.tsx` n'était pas dans la liste Task 2.
- **Fix:** montage à côté d'`OutboxReplayWatcher` (~ligne 630).
- **Files modified:** `app/src/app/router.tsx`
- **Commit:** a2f9b97

## Known Stubs

None — tous les canaux sont câblés : enfilage (MutationCache 34-02), rejeu (34-03), badge/panneau/purge (ce plan).

## Threat Model Compliance

- T-34-08 (purge déconnexion) : mitigé — scan-avertir-purger prouvé par 4 tests, purge utilisateur espionnée NON appelée sur file pendante.
- T-34-09 (abandon silencieux) : mitigé — confirm-dialog obligatoire, retrait explicite testé (file inchangée avant confirmation).
- T-34-10 (boucle Réessayer) : mitigé — `retryOutboxEntry` repasse à pending UNE fois par action ; le rejeu auto ne lit jamais 'failed'.

## Self-Check: PASSED

Fichiers créés présents, 3 commits vérifiés dans l'historique (ad1296d, a2f9b97, 3aa93c3).
