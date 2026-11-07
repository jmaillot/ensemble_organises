---
phase: 33-cache-de-lecture-offline
plan: 05
subsystem: offline-banniere
tags: [offline, banner, staleness, ui]
status: complete
requires: [33-03]
provides: [OFFR-02, bandeau offline-stale]
affects: [app-shell, banner-store (lecture seule)]
tech-stack:
  added: []
  patterns: [useSyncExternalStore sur queryCache.subscribe, push/dismiss banner-store, sous-module date-fns/locale/fr]
key-files:
  created:
    - app/src/hooks/use-offline-stale-banner.ts
    - app/src/hooks/use-offline-stale-banner.test.ts
    - app/src/components/banners/offline-stale.tsx
    - app/src/components/banners/offline-stale.test.tsx
  modified:
    - app/src/app/app-shell.tsx
decisions:
  - "Le hook est auto-porté par le composant (OfflineStaleBanner appelle useOfflineStaleBanner) et monté dans app-shell à côté de BannerSlot — le mapping kind → composant du slot reste inchangé, contract plan (BannerSlot/banner-store inchangés) respecté."
  - "Import date-fns par sous-module `date-fns/locale/fr` (pas le baril) : voir Deviations, Rule 1."
metrics:
  duration: ~24 min
  completed: 2026-11-04T22:37:54Z
actuals:
  tokens: 4676
  tasks: 2
  commits: 4
plan_head_before: 55e55f0
plan_head_after: 65f4489
---

# Phase 33 Plan 05: Bandeau « dernier état connu » (OFFR-02) Summary

**One-liner:** Hook `useOfflineStaleBanner` (MIN des dataUpdatedAt Tier 1 rendues du cache, annexes comprises) + bandeau ambre horodaté non-dismissable dans le slot bannières de la 32.

## What Was Built

- **`use-offline-stale-banner.ts`** : `useSyncExternalStore` sur `queryCache.subscribe` calcule le MIN des `dataUpdatedAt` de toutes les queries dont `queryKey[0]` ∈ `OFFLINE_FAMILIES` — **annexes `household_members`/`profiles` comprises** (D-12 lettre, D-10 ; l'annexe ancienne abaisse volontairement l'horodatage, jamais la plus flatteuse, T-33-15). Hors ligne uniquement via `useOnlineStatus()` (jamais `navigator.onLine`, D-13). Effect push `{kind:'offline-stale', priority:3, payload:{lastKnownAt}}` / dismiss au retour réseau. Détection cache : `dataUpdatedAt > 0` (hypothèse flaggée OFFR-02 commentée — la coïncidence `isError` est observée mais non exigée). Format date-fns `d MMM 'à' HH:mm` fr.
- **`offline-stale.tsx`** : pattern exact d'`update-banner.tsx` (`role="status"`, `flex-wrap`, `px-[inherit]`), famille ambre (`bg-amber-soft`, bordure `border-amber/30`, texte `text-amber-strong`) — jamais corail (T-33-17). Horodatage en `font-semibold`. Aucun bouton (D-13 : se retire seul, T-33-16). Tokens existants, aucun nouveau.
- **Branchement** : `<OfflineStaleBanner />` monté dans `app-shell.tsx` à côté de `<BannerSlot />` (le composant appelle le hook lui-même) — `banner-store.ts` et `banner-slot.tsx` inchangés (vérifié : git diff vide sur ces fichiers).

## Tasks Completed

| Task | Name | Commits |
|------|------|---------|
| 1 | Hook useOfflineStaleBanner (D-12, D-13) — TDD rouge puis vert, 5 tests | f0b86a0, bc79e0d |
| 2 | Composant OfflineStaleBanner + intégration slot (D-11) — TDD rouge puis vert, 4 tests | 2e952c0, 65f4489 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Import `date-fns/locale` par sous-module, pas par le baril**
- **Found during:** Task 2 (chaîne §2.7, `npm test`)
- **Issue:** le baril `date-fns/locale` évalue ~600 modules de locales ; cette latence d'évaluation de module faisait basculer en échec le test préexistant `use-auth.test.ts` « marque le foyer chargé … ne relit pas à la reprise » (race entre `householdLoaded` et `setReady`, aggravée par tout délai). Reproduit et prouvé avec un délai synchrone de 500 ms en évaluation de module dans un worktree de vérification ; passes à 3/3 au HEAD sans le diff, échec 3/3 avec.
- **Fix:** `import { fr } from 'date-fns/locale/fr'` (sous-module direct) dans le hook et le test du composant, avec commentaire POURQUOI.
- **Files modified:** `app/src/hooks/use-offline-stale-banner.ts`, `app/src/components/banners/offline-stale.test.tsx`
- **Commit:** 65f4489

**2. [Rule 3 - Blocking] Client de test du hook sans `gcTime: 0`**
- **Found during:** Task 1
- **Issue:** `createTestQueryClient()` (harnais) pose `gcTime: 0` : les queries semées étaient collectées pendant le test, le MIN tombait à 0 et le bandeau disparaissait (tests 1-2 rouges après un vert transitoire).
- **Fix:** le test dérive son client de `buildQueryClient({ queries: { retry: false } })` (politique réelle, gcTime par défaut), commenté.
- **Files modified:** `app/src/hooks/use-offline-stale-banner.test.ts`
- **Commit:** bc79e0d

## Verification (§2.7)

- `npx vitest run src/components/banners src/hooks/use-offline-stale-banner.test.ts` : 28 tests verts (bannières 32 incluses — pas de régression du slot)
- `npm run typecheck` : 0 erreur
- `npm test` : 1777/1779 verts — 2 échecs restants = `anniversaires-page.test.tsx`, préexistants documentés hors périmètre (l'échec `use-auth.test.ts` induit par le baril date-fns a été corrigé, voir Deviations)
- `npm run build` : OK (dist/sw.js généré)
- `git diff 55e55f0..HEAD -- app/src/components/banners/banner-store.ts app/src/components/banners/banner-slot.tsx` : vide

## Notes

- Interaction avec `OfflineBanner` corail : hors ligne, deux bandeaux empilés (corail global + ambre horodaté) — non fusionnés (idée v1.x, hors périmètre).
- L'annexe UI-SPEC ligne 155 (exclusion des annexes du MIN) est révoquée en révision de plan ; D-12 lettre appliquée (annexes comprises), conformément au must_have révisé du plan.

## Self-Check: PASSED

- 4 fichiers créés + 1 modifié : tous présents sur disque.
- 4 commits vérifiés dans `git log` : f0b86a0, bc79e0d, 2e952c0, 65f4489.
- SUMMARY non commitée volontairement (`.planning/` gitigné).
