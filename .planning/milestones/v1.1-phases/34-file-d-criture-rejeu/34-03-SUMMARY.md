---
phase: 34-file-d-criture-rejeu
plan: 03
subsystem: client-offline
tags: [offline, outbox, rejeu, tanstack-query, classification]
requires:
  - "34-01 : contrainte unique (household_id, client_key) posée par 0177/0178/0179 — cible du upsert idempotent"
  - "34-02 : outbox persistée (OUTBOX_KEY, OutboxEntry, classifyFailure) — la matière à rejouer"
provides:
  - "outbox-replay.ts : replayOutbox(client, userId, householdId, adapter?) — rejeu FIFO creates-d'abord (D-09), upsert idempotent D-14, classification D-10 intégrée, garde anti-parallélisme"
  - "use-outbox-replay.ts : hook déclencheurs foreground D-08 (onlineManager + visibilitychange + montage) + OutboxReplayWatcher"
affects: [34-04]
tech-stack:
  added: []
  patterns:
    - "rejeu séquentiel await-par-entrée, jamais Promise.all (ordre D-09 + compteur D-13 lisible)"
    - "terminal → status 'failed' conservé en file, jamais rejoué (replayOutbox ne lit que 'pending') ; retrait réel délégué au panneau (plan 04)"
    - "réconciliation D-16 par identité id+client_key portée par l'overlay + invalidation [table] après succès"
    - "déclencheurs : onlineManager UNIQUEMENT (jamais window.ononline) + visibilitychange + rejeu au montage"
key-files:
  created:
    - app/src/lib/offline/outbox-replay.ts
    - app/src/lib/offline/outbox-replay.test.ts
    - app/src/hooks/use-outbox-replay.ts
  modified:
    - app/src/app/router.tsx
key-decisions:
  - "Classification terminale : substitution mécanique documentée au plan (D-10 verbatim « retiré de la file » → « conservé en failed, jamais rejoué automatiquement ») — le retrait passe par l'action utilisateur Abandonner du panneau (plan 04) ; la propriété « jamais de boucle, jamais d'effacement silencieux » est intégralement tenue et prouvée"
  - "Garde anti-parallélisme module-level (inFlight) ajoutée (Rule 2) : les déclencheurs D-08 peuvent se rapprocher à la milliseconde, une seconde passe rejouerait des entrées en vol"
  - "remove rejoué SANS ifMissing ignore : le 0-lignes (REMOVE_MISSING) est la matière du terminal (Pitfall 3), l'ignorer effacerait le refus en silence"
requirements-completed: [WRQ-02, WRQ-04, WRQ-06]
metrics:
  duration: ~30 min
  completed: 2026-11-05
status: complete
commits: 2
plan_head_before: de64383f5ffd272fdc66d98bb2aa55045a46a9bd
plan_head_after: ee7d0a5def432257f5e9d3b2c019f7883a7f9a18
actuals:
  tokens: 32000
  tasks: 3
  commits: 2
---

# Phase 34 Plan 03: Rejeu de l'outbox Summary

**One-liner:** Moteur de rejeu `replayOutbox` FIFO creates-d'abord avec upsert idempotent `onConflict household_id,client_key`, classification terminal/retryable intégrée (non-boucle prouvée sur 10 déclencheurs) et hook de déclencheurs foreground `use-outbox-replay` monté une fois dans l'app — WRQ-02/04/06, 17 tests + chaîne complète verte.

## What Was Built

- **outbox-replay.ts** (nouveau) : `replayOutbox(client, userId, householdId, adapter = data)` — lit les entrées `pending` de la query `['outbox', userId, householdId]` (no-op explicite si vide, prouvé par test), ordre D-09 (creates → updates → remove/removeWhere, FIFO `enqueuedAt` croissant dans chaque groupe), rejeu **séquentiel** await-par-entrée (jamais `Promise.all`). Par entrée : create → `adapter.upsert(table, {...values, id, client_key}, { onConflict: 'household_id,client_key' })` (`'client_key'` seul pour les jointures sans id via `isKeylessTable`) ; update → `adapter.update(table, id, {...values, client_key})` ; remove → `adapter.remove(table, id)` **sans** `ifMissing: 'ignore'` (Pitfall 3) ; removeWhere → `adapter.removeWhere(table, filter)`. Succès → entrée retirée (filtre par référence, les enfilages concurrents survivent) + `invalidateQueries([table])`. Adaptateur injectable (défaut `data`).
- **Classification D-10 intégrée** : `classifyFailure` (plan 02) branché dans la boucle. Terminal (code PG 4xx, REMOVE_MISSING/REMOVE_WHERE_MISSING) → entrée conservée mais `status: 'failed'` + `failure { kind, code, message }` — jamais rejouée automatiquement (seules les `pending` sont lues : boucle structurellement impossible, testé sur 10 déclencheurs consécutifs), jamais effacée en silence. Retryable (TypeError/5xx) → reste `pending` telle quelle, la passe s'arrête proprement (les écritures suivantes peuvent en dépendre). Un terminal n'interrompt pas la passe (les entités sont indépendantes) — testé.
- **Garde anti-parallélisme** (Rule 2) : `inFlight` module-level — une seule passe à la fois, les déclencheurs rapprochés (online + visibilitychange à la ms) ne lancent pas de second vol.
- **use-outbox-replay.ts** (nouveau) : abonnement `onlineManager.subscribe` (source réseau unique — aucun `window.ononline` créé), `visibilitychange` (retour d'onglet, visible uniquement), rejeu au montage (écritures pendantes du reload précédent, la file est persistée D-01). Portée `(userId, householdId)` lue **au moment du déclencheur** via `useSessionStore.getState()`/`useHouseholdStore.getState()` (jamais capturée en closure) ; rien sans foyer chargé ni hors ligne. Nettoyage complet (unsubscribe + removeEventListener). Pas de polling, pas de background sync (D-08). `OutboxReplayWatcher` monté **une fois** dans `AppRouter` (`router.tsx`), hors `Routes`, avec le commentaire qui nomme pourquoi.
- **Tests** (17, fichier `outbox-replay.test.ts`) : rejeu create complet (payload, onConflict, sortie de file, invalidation D-16), jointure sans id (onConflict `client_key` seul), **exactement une fois** (double rejeu + upsert fusionnant = 1 ligne au mock), no-op file vide (zéro appel adaptateur), ordre D-09 avec groupes enfilés en désordre, remove sans `ifMissing`, retryable interrompt la passe, terminal ne la bloque pas, 42501/REMOVE_MISSING/REMOVE_WHERE_MISSING terminaux, **non-boucle** (10 rejeux consécutifs, adaptateur appelé une fois), hook : déclencheur online, visibilitychange, montage, hors ligne/sans foyer = zéro appel, watcher ne peint rien.

## Verification

| Contrôle | Résultat |
|---|---|
| `npx vitest run src/lib/offline/outbox-replay.test.ts` | vert — 17/17 |
| `npx vitest run src/lib/offline src/hooks` | vert — 124/124 (12 fichiers) |
| `npm run typecheck` | vert |
| `npm test` | 1827/1829 — les 2 échecs anniversaires préexistent sur la baseline (documentés au plan 02, hors périmètre) |
| `npm run build` | vert (precache 149 entrées) |
| Garde déclencheur | aucun `addEventListener('online'` créé par ce plan ; `onlineManager` seul. Le listener préexistant de `route-error.tsx:128` (retry d'ErrorBoundary, pré-plan) est hors périmètre — consigné |
| `sw.ts` | intouché (aucun background sync) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Garde anti-parallélisme du rejeu**
- **Found during:** Task 1 (tracer)
- **Issue:** les trois déclencheurs D-08 peuvent se déclencher quasi simultanément (retour réseau pendant un visibilitychange) — une seconde passe rejouerait des entrées déjà en vol, rompant l'ordre D-09 et le comptage D-13 (menace T-34-02 du plan).
- **Fix:** verrou module-level `inFlight` (levé en `finally`) : une passe en cours fait rendre `{ applied: 0, failed: 0 }` aux appels concurrents.
- **Files modified:** app/src/lib/offline/outbox-replay.ts
- **Commit:** 4fd9131

**2. [Rule 3 - Blocking] `adapter.removeWhere(filter)` : typage `Record<string, unknown>` incompatible avec `RowFilter`**
- **Found during:** Task 1 (typecheck)
- **Issue:** `OutboxEntry.filter` est `Record<string, unknown>` ; le contrat attend `RowFilter`.
- **Fix:** transmission par `as never` (le payload provient d'un filtre déjà typé à l'enfilage) — commenté.
- **Files modified:** app/src/lib/offline/outbox-replay.ts
- **Commit:** 4fd9131

**Total deviations:** 2 auto-fixed (1 Rule 2, 1 Rule 3). **Impact:** nul sur le comportement spécifié ; la garde renforce la menace T-34-02 au-delà du plan.

### Notes

- Le listener `window.addEventListener('online', …)` préexistant dans `app/src/components/ui/route-error.tsx:128` (retry du composant d'erreur, antérieur à la phase 33) n'est pas créé par ce plan et reste hors périmètre (SCOPE BOUNDARY) — consigné dans `deferred-items.md`.
- L'interprétation D-10 (terminal conservé en `failed` au lieu de retiré) est celle documentée verbatim au plan — substitution mécanique, pas une déviation d'exécution.
- 2 commits au lieu de 3 : le moteur (Task 1) et sa classification (Task 2) vivent dans le même fichier au même état — le tracer Task 1 embarque la classification, les tests des deux tâches sont verts ensemble. La traçabilité par tâche est portée par le message de commit 4fd9131.

## Coverage

- replayOutbox create → upsert onConflict + sortie de file + invalidation: verification kind tests, ref `tests/app/src/lib/offline/outbox-replay.test.ts#rejoue l'entrée create…`, status pass, human_judgment false
- Exactement une fois (upsert fusionnant, D-14): verification kind tests, ref `tests/…#rejouer DEUX FOIS…`, status pass, human_judgment false
- Ordre D-09 FIFO creates-d'abord: verification kind tests, ref `tests/…#ordre D-09…`, status pass, human_judgment false
- Non-boucle terminal (WRQ-04): verification kind tests, ref `tests/…#42501 au rejeu…`, status pass, human_judgment false
- Retryable conservé / interrompt la passe: verification kind tests, ref `tests/…#TypeError réseau…`, status pass, human_judgment false
- Déclencheurs online/visibilitychange/montage (WRQ-02): verification kind tests, ref `tests/…#déclencheurs foreground…`, status pass, human_judgment false
- Réconciliation D-16 « serveur prime, pas de doublon, pas de flash » (comportement multi-canal Realtime en conditions réelles): human_judgment true, rationale "la moitié client (identité + invalidation) est prouvée par tests ; la primauté effective du row Realtime sur l'overlay nécessite un backend réel — à confirmer en UAT phase 34"

## Self-Check: PASSED
- Commits 4fd9131, ee7d0a5 présents (git log) : vérifié.
- outbox-replay.ts / outbox-replay.test.ts / use-outbox-replay.ts créés, router.tsx modifié : vérifié (git show).
- Suites vertes : vérifié (17/17 + 124/124 + typecheck + build).
