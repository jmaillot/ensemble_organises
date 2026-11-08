---
phase: 36-outbox-plus-jamais-d-effacement-silencieux
reviewed: 2026-11-07T20:30:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - app/src/lib/offline/outbox.ts
  - app/src/modules/parametres/components/offline-panel.tsx
  - app/src/lib/offline/outbox-replay.test.ts
  - app/src/lib/offline/outbox.test.ts
  - app/src/modules/parametres/components/offline-panel.test.tsx
  - app/src/hooks/use-outbox-replay-badge.ts
  - app/src/hooks/use-outbox-replay-badge.test.ts
findings:
  critical: 0
  major: 1
  minor: 3
  total: 4
status: issues_found
---

# Phase 36 : Code Review Report

**Reviewed:** 2026-11-07T20:30:00Z
**Depth:** standard (diffs des commits fabf9f7, 56be727, 4f2affb, 4e7d432, a297a8f)
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Revue adversariale de la phase 36 (catalogue `FAILURE_FAMILIES` + `failureLabel` dérivé au rendu, retrait du toast D-12). L'implémentation est fidèle aux plans 36-01/36-02 : matching exact sur le code (`===`, pas de `startsWith`), libellé PGRST116 verrouillé mot pour mot, fonction pure sans extension de la forme persistée, message PostgREST banni du DOM, retrait chirurgical du toast avec `OutboxBadgeWatcher` intact et toujours monté une seule fois dans `router.tsx:647`. Les suites touchées passent (re-exécution locale : 89/89 sur outbox, outbox-replay, offline-panel, use-outbox-replay-badge). Aucun bug correctif ni vulnérabilité introduits. Un avertissement de robustesse sur l'audit D-04 et trois observations mineures.

Note de vérification : le rouge e2e « rejoindre un foyer / format du token » (2 tests) documenté dans 36-02-SUMMARY est prouvé préexistant sur baseline `b02e0a0` par l'exécutant (rejeu worktree) ; hors périmètre de cette revue, consigné en deferred-items.

## Critical Issues

Aucun.

## Major Issues

### MAJ-01 : l'audit D-04 duplique la chaîne générique au lieu de l'importer — une divergence silencieuse est possible

**File:** `app/src/lib/offline/outbox.test.ts:340`
**Issue:** Le describe « matrice d'audit » redéfinit localement `const LIBELLE_GENERIQUE = 'cette écriture a été refusée par le serveur'` au lieu d'importer la constante de `outbox.ts` (qui n'est pas exportée). C'est en contradiction avec le principe D-04 énoncé en commentaire du même test (« le test itère la CONSTANTE exportée, jamais une copie »). Si `LIBELLE_GENERIQUE` change un jour dans `outbox.ts` et qu'une famille reçoit par erreur ce nouveau libellé, l'assertion `not.toBe(LIBELLE_GENERIQUE)` compare contre l'ANCIENNE chaîne et reste verte — l'audit aveugle exactement le défaut qu'il prétend attraper (§2.7 B : un contrôle qui ne regarde rien).
**Fix:** Exporter `LIBELLE_GENERIQUE` depuis `outbox.ts` et l'importer dans le test :

```ts
// outbox.ts
export const LIBELLE_GENERIQUE = 'cette écriture a été refusée par le serveur';
// outbox.test.ts
import { FAILURE_FAMILIES, LIBELLE_GENERIQUE, failureLabel } from './outbox';
```

## Minor Issues

### MIN-01 : les codes terminaux connus `REMOVE_MISSING` / `REMOVE_WHERE_MISSING` reçoivent le libellé générique

**File:** `app/src/lib/offline/outbox.ts:364-369`
**Issue:** `classifyFailure` produit deux codes terminaux nommés (`REMOVE_MISSING`, `REMOVE_WHERE_MISSING` — suppression de 0 ligne) qui ne figurent pas dans `FAILURE_FAMILIES`. Le repli D-06 les couvre (pas de boucle, pas de silence), mais l'utilisateur voit « cette écriture a été refusée par le serveur » pour un cas pourtant identifiable (« cet élément a déjà été supprimé » serait le libellé naturel, cousin de PGRST116). Décision de matrice fermée défendable, mais à l'UAT ce cas produira probablement une demande de libellé dédié.
**Fix:** Si l'UAT le confirme, ajouter une famille `{ codes: ['REMOVE_MISSING', 'REMOVE_WHERE_MISSING'], label: '…' }` — le `it.each` l'auditera automatiquement.

### MIN-02 : la famille « 403 » dépend d'une cause portant `code: '403'`, hypothèse non prouvée côté adaptateur

**File:** `app/src/lib/offline/outbox.ts:344`
**Issue:** L'entrée `{ codes: ['42501', '403'] }` suppose que le `DataError.cause` porte un champ `code` égal à `'403'`. Or `classifyFailure` ignore `status` : un refus HTTP 403 arrivant sans code PostgREST (`{ status: 403, message }`) est classé **retryable** et rejeté en boucle — la famille ne s'applique que si l'adaptateur matérialise le code. Le comportement est préexistant à la phase (non introduit ici), et aucun chemin d'`supabase-adapter.ts` ne produit `code: '403'` à ce jour ; l'entrée de matrice est donc du code défensif non joint.
**Fix:** Soit documenter dans `FAILURE_FAMILIES` que `'403'` n'est atteint que si une cause future le porte, soit étendre `classifyFailure` à un refus de type `{ status: 403 }` sans code (hors périmètre phase 36 — à trancher en phase dédiée).

### MIN-03 : `failureLabel` exige un champ `message` qu'elle ignore

**File:** `app/src/lib/offline/outbox.ts:364`
**Issue:** La signature `failureLabel(failure: { code: string; message: string })` rend `message` obligatoire alors qu'il n'est jamais lu (dérivation du seul `code`, T-36-01). C'est un choix documenté (compatibilité avec la forme persistée `OutboxEntry.failure`), mais il impose un argument fantôme à tout nouvel appelant.
**Fix:** Acceptable en l'état ; alternative : `failureLabel({ code }: Pick<OutboxEntryFailure, 'code'>)` — la compatibilité reste assurée par structuring.

## Points vérifiés sans finding

- Matching exact `===` sur le code, aucun `startsWith` (Pitfall 1, sonde « encoding » testée : `PGRST10`/`PGRST1` → générique).
- Non-boucle prouvée par 10 passes de rejeu sans second appel adaptateur (`outbox-replay.test.ts`).
- Aucune extension de la forme persistée ; entrée « ancienne forme » rendue sans migration (test dédié).
- `document.body.textContent` asserté sans message PostgREST brut (T-36-01) — le panneau dérive bien du seul code (`offline-panel.tsx:273`).
- Retrait du toast : `useToast`, `previousFailed`, `toastTimer`, 3 tests et `ToastProvider` disparus ; effet badge et doc-comment à jour ; `OutboxBadgeWatcher` toujours exporté et monté une seule fois (`router.tsx:647`).
- Suites re-exécutées localement : `npm test -- --run outbox outbox-replay offline-panel use-outbox-replay-badge` → 6 fichiers, 89/89 verts.

---

_Reviewed: 2026-11-07T20:30:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
