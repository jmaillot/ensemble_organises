---
phase: 36-outbox-plus-jamais-d-effacement-silencieux
plan: 02
status: complete
subsystem: outbox / offline
tags: [outbox, toast, badge, retrait, canal-unique]
requires:
  - use-outbox-replay-badge.ts (badge D-11/D-13, phase 34)
  - 36-01 (failureLabel / FAILURE_FAMILIES — inchangés, consommés par le panneau)
provides: []
affects:
  - use-outbox-replay-badge.ts (hook allégé)
  - use-outbox-replay-badge.test.ts (tests de régression badge)
key-files:
  created: []
  modified:
    - app/src/hooks/use-outbox-replay-badge.ts
    - app/src/hooks/use-outbox-replay-badge.test.ts
decisions:
  - "Retrait chirurgical (Pitfall 6) : seul le bloc toast D-12 retiré — badge (priorité 4) et OutboxBadgeWatcher intacts, montés une seule fois dans router.tsx"
  - "e2e « rejoindre un foyer / format du token » rouge PRÉEXISTANT (prouvé sur baseline b02e0a0) — consigné en deferred-items, non corrigé (hors périmètre)"
metrics:
  tasks: 2
  duration: "~40 min"
  completed: 2026-11-07
commits: 1
plan_head_before: 0eb74e2
plan_head_after: a297a8f
---

# Phase 36 Plan 02 : Retrait du toast d'échec terminal D-12 Summary

**One-liner :** Retrait chirurgical du toast D-12 (code + 3 tests + ToastProvider) — le badge « N en attente / N bloquées » devient l'unique signal actif, le panneau l'unique canal de détail (D-02/D-03), prouvé par les 4 tests badge conservés verts sans autre modification.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Retrait chirurgical du toast D-12 (D-03) | a297a8f | use-outbox-replay-badge.ts, use-outbox-replay-badge.test.ts |
| 2 | Chaîne de vérification §2.7 complète — porte de phase | (aucun fichier — vérification) | none |

## Détail Task 1 (a297a8f)

- **Hook** (`use-outbox-replay-badge.ts`, −98/+11 lignes net) : second `useEffect` toast (antirebond 400 ms), refs `previousFailed`/`toastTimer`, import `useToast` et `useRef` (devenu inutile) supprimés. CONSERVÉS intacts : premier `useEffect` badge (push banner-store priorité 4, payload `{ pending, failed }`), `OutboxBadgeWatcher` et son montage unique dans `router.tsx`. Doc-comment mis à jour : point (c) retiré, raison nommée (D-03 : badge = unique signal actif, le toast était du bruit redondant).
- **Tests** (`use-outbox-replay-badge.test.ts`) : describe « toast d'échec terminal (D-12) » (3 tests), helpers `toastRegion`/`toastTexts`, import `ToastProvider` et wrapping de l'App supprimés. CONSERVÉS intacts : `entry()`, `seed()`, mock react-router, describes badge D-13 (3 tests) et D-11 (1 test).
- **Preuve d'invariant (§2.7 F)** : `npm test -- --run use-outbox-replay-badge` → 4/4 verts SANS autre modification des tests badge. Zéro mention « toast » dans le rapport.

## Task 2 — Chaîne §2.7 (sorties)

| Étape | Commande | Résultat |
| ----- | -------- | -------- |
| 1a | `cd app && npm run typecheck` | 0 erreur |
| 1b | `cd app && npm test` | 243 fichiers, 1958 tests verts (3 tests toast retirés : 1961 → 1958, cohérent) |
| 1c | `cd app && npm run build` | OK — précache 152 entrées (2745 KiB), sw.js généré |
| 2 | `cd app && npm run test:e2e` | 165 passed, 9 skipped, **2 failed** — voir Deviations : rouge PRÉEXISTANT, prouvé hors périmètre |
| 3 | SQL | Non applicable — `git status supabase/migrations` vide (zéro SQL touché, preuve consignée) ; `check-sql-statique.py`/`test-db.sh` non déclenchés |
| 4 | `sh scripts/test-dispatch-push.sh` | Non requis — aucun changement Edge Function/cron |

## Deviations from Plan

### Rouge e2e préexistant — prouvé non imputable à la phase (non corrigé, consigné)

- **Found during :** Task 2, `npm run test:e2e`
- **Issue :** `e2e/critical-paths.spec.ts:134` « rejoindre un foyer valide le format du token » échoue (chromium + mobile) : en démo, `/foyer/rejoindre` affiche « Ce lien d'invitation n'est plus valable » au lieu du formulaire.
- **Enquête (preuve) :** le plan pose « un rouge ici serait une régression du plan 36-01 ». Vérifié par rejeu dans un worktree isolé : le test échoue **AUSSI** sur la baseline pré-phase-36 (`b02e0a0`, parent de `fabf9f7`, 2 failed). Il n'est donc **pas** une régression de 36-01/36-02 — la panne s'est introduite entre l'ancêtre `52c43a0` (où il passe, rejeu confirmé) et la baseline, hors phase 36. Cause probable : le pré-écran d'invitation (31-03/31-07) traite `token === null` comme un lien mort (`setPreview({ phase: 'dead' })`, `join-household-page.tsx`).
- **Décision :** NON corrigé — hors périmètre de la phase 36 (SCOPE BOUNDARY + AGENTS.md : pas de réparation opportuniste). Consigné dans `deferred-items.md` de la phase pour une phase dédiée. Tous les autres e2e (165) sont verts, y compris les parcours offline/outbox.

Aucun auto-fix Rule 1-3 sur les fichiers du plan ; le retrait s'est appliqué exactement comme écrit.

## Threat Flags

Aucune nouvelle surface : le plan retire un canal d'affichage, aucune donnée ne traverse une frontière. T-36-04 couvert : le badge reste l'unique signal actif (4 tests badge verts, OutboxBadgeWatcher intouché).

## Known Stubs

Aucun.

## Success Criteria

- [x] Toast D-12 inexistant du code et des tests (D-03) ; badge + panneau = un seul canal de vérité (D-02)
- [x] Badge « N en attente / N bloquées » inchangé et prouvé par ses 4 tests conservés verts sans modification
- [x] Chaîne §2.7 verte hors SQL (non applicable, preuve `git status supabase/migrations` vide) — l'e2e rouge restant est prouvé préexistant et consigné en deferred item

## Self-Check: PASSED

- Commit vérifié : a297a8f (git log) — 2 fichiers, +11/−109.
- `use-outbox-replay-badge.ts` ne contient plus `useToast`, `previousFailed` ni `toastTimer` (grep) ; `OutboxBadgeWatcher` toujours exporté et monté dans `router.tsx` (grep).
- 4/4 tests badge verts, zéro mention toast dans le rapport vitest.
