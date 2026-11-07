---
phase: 35-deep-links-validation-multi-os
plan: 08
subsystem: auth-bootstrap
tags: [auth, offline, deep-links, gap-closure, G-35-5]
requires: [35-06, 35-07]
provides:
  - "Chemin authentifié-hors-ligne : session GoTrue persistée valide rétablie depuis le cache au bootstrap (gardien 10 s, branche expires_at, rejets de chaîne)"
  - "Helper synchrone lireSessionPersistee — clé sb-<ref>-auth-token dérivée de l'URL, réassemblage du format chunké v2, parse défensif, marge MARGE_EXPIRATION_S = 60 s"
affects: [use-auth.ts, session-cache.ts]
tech-stack:
  added: []
  patterns:
    - "Helper de lecture seule du stockage GoTrue existant (D-08 : aucune écriture ajoutée)"
    - "Contrat reglee redérivé : le rappel de complétion tardive consulte le store avant de décider"
key-files:
  created:
    - app/src/lib/supabase/session-cache.ts
  modified:
    - app/src/hooks/use-auth.ts
    - app/src/hooks/__tests__/auth-bootstrap-watchdog.test.tsx
decisions:
  - "Le rappel :287 est un no-op quand le store est déjà authentifié (lecture de l'état du store, aucun drapeau annexe) — purge inchangée quand invité (T-35-06 tient sur ce chemin)"
  - "T-35-06 marqué SUPERSEDÉ : l'application hors-ligne d'une session VALIDE (expires_at > now + 60 s) devient le comportement conçu de G-35-5 ; la partie expirée reste prouvée (V2/V3)"
  - "La branche :259-266 est étendue à la marge (expires_at ≤ now + 60 s hors-ligne → purge) — même classe que le helper, pas seulement expires_at dépassé"
metrics:
  duration: ~35 min
  completed: 2026-11-07
status: complete
actuals:
  tokens: 8200   # 32 793 caractères de diff / 4
  tasks: 2
  commits: 2
plan_head_before: 3d60c4a2d6781f8de00173a40b92ae9e4872cb31
plan_head_after: 301236d
---

# Phase 35 Plan 08: Gap G-35-5 — chemin authentifié-hors-ligne Summary

**One-liner:** le gardien d'amorçage et les rejets hors-ligne consultent désormais la session GoTrue persistée (avec réassemblage du format chunké v2) avant de purger — une session valide (expires_at > now + 60 s) rétablit l'état authentifié depuis le cache, le foyer persisté est rendu via le repli 35-04, et la complétion tardive de la chaîne ne purge plus un état authentifié établi.

## Tasks Completed

| Task | Nom | Commit | Fichiers |
| ---- | --- | ------ | -------- |
| 1 | Cas V1–V6 rouges (TDD RED) | 8c6563f | app/src/hooks/__tests__/auth-bootstrap-watchdog.test.tsx |
| 2 | session-cache.ts + cheminHorsLigneValide (GREEN) | 301236d | app/src/lib/supabase/session-cache.ts, app/src/hooks/use-auth.ts, app/src/hooks/__tests__/auth-bootstrap-watchdog.test.tsx |

## What Was Built

- **session-cache.ts** (nouveau) : `lireSessionPersistee()` — dérive `sb-<ref>-auth-token` depuis `supabaseUrl` (premier segment du hostname), lit d'abord les fragments chunkés `.0`, `.1`… (format supabase-js v2 au-delà de la garde de taille — cas Google OAuth), joint et parse défensivement (try/catch, objet direct ou enveloppé en tableau, `expires_at` numérique + `user.id` string exigés, sinon null → purge). Lecture synchrone, zéro réseau, zéro écriture (D-08). `sessionPersisteeValide()` + `MARGE_EXPIRATION_S = 60` (constante nommée et commentée).
- **use-auth.ts** : `cheminHorsLigneValide(cause, sessionEnMain?)` branché sur les TROIS sites hors-ligne — gardien 10 s, branche expires_at (étendue à la marge, session en main), rejets de `applySession` et de la chaîne. Valide → `toSessionUser` + réparation du nom depuis la ligne membre persistée (règle mode local) + `signIn` → repli 35-04 du foyer persisté → restore best-effort `connectOfflineCache` → `setReady(true)`, avec `console.warn` nommant le chemin (§2.7 F). Invalide/absent/illisible → `cheminInvite()` inchangé.
- **Contrat reglee redérivé** : le rappel de complétion tardive (:287) consulte le store — no-op si `authenticated` (ni ré-application ni purge), purge T-35-06 si invité. D-07 sans-session, listener `onAuthStateChange`, outbox : intacts.

## Test Results

- TDD RED : V1/V4/V5/V6 vus rouges sur l'assertion métier (`status` 'guest' vs 'authenticated' — session valide purgée / état hors-ligne purgé / session chunkée non réassemblée) ; V2/V3 verts dès le départ (purge T-35-06 inchangée).
- Suite finale : typecheck 0 erreur ; **1914 tests passés** (240 fichiers) dont V1–V6 + W1–W4 verts ; `npm run build` OK ; e2e `deep-link-redirect` **6/6** ; aucune modification SQL (check-sql-statique et test-db non requis).

## Deviations from Plan

**1. [Rule 1 - Bug] W2 ajusté au contrat reglee redérivé (contradiction interne du plan résolue en faveur du contrat, binding)**
- **Found during:** Task 2
- **Issue:** le plan affirmait « W1–W4 restent verts sans modification », mais W2 (complétion tardive après purge du gardien, SANS session en cache) voit sa chaîne tardive établir elle-même l'authentification depuis la session valide qu'elle porte — sous le contrat redérivé (no-op si le store est authentifié, lecture de l'état réel, aucun drapeau annexe), cette fin d'état est authentifiée, pas purgée. Garder W2 vert aurait exigé un drapeau annexe, explicitement proscrit.
- **Fix:** W2 retitré et ré-asserté sur le nouveau contrat (complétion tardive ne re-purge pas la session que la chaîne vient d'établir, `user.id` conservé, `householdLoaded` true) ; la garantie T-35-06 reste prouvée en amont par V2/V3 et par la garde expires_at/marge étendue. Commentaire de contrat dans le test.
- **Files modified:** app/src/hooks/__tests__/auth-bootstrap-watchdog.test.tsx
- **Commit:** 301236d

**2. [Harness] V1 semé à expires_at = now + 80 s au lieu de + 3600 s**
- **Found during:** Task 1
- **Issue:** avec une session à +3600 s, le VRAI GoTrueClient 2.117.2 ne tente jamais de rafraîchissement (sa marge `EXPIRY_MARGIN_MS` = 90 s) : `getSession` résoudrait sans réseau, V1 passerait par la chaîne normale et serait vert avant correctif (test qui ne teste rien).
- **Fix:** seeder paramétrable (`semerSessionValide(secondes = 3600)`) ; V1 sème à +80 s — dans la fenêtre (60 s, 90 s) : au-delà de NOTRE marge de validité (session VALIDE pour le helper) mais dans la marge supabase-js (`_recoverAndRefresh` pend sur le fetch mort, H2 — le défaut Android exact). Commenté dans le test ; les autres cas gardent +3600 s.
- **Files modified:** app/src/hooks/__tests__/auth-bootstrap-watchdog.test.tsx
- **Commit:** 8c6563f

**3. [Harness] V5 : second tour d'act (avance de 3 s) après l'échéance**
- **Issue:** sous minuteries factices, le restore best-effort (`connectOfflineCache` → persister TanStack) planifie une relance à 1 s qui ne se résout pas dans le tour d'act de l'échéance — artefact de harnais, pas du code sous test.
- **Fix:** `advanceTimersByTimeAsync(3000)` supplémentaire, commenté. Commit 301236d.

**4. [Observation] une exécution isolée de `auth-bootstrap-offline` (test D, 35-04) a échoué une fois sous charge parallèle (35 workers), puis verte en isolement, en suite ciblée et dans la chaîne complète (1914/1914)** — flocon de `waitFor` sous charge, hors périmètre (fichier non modifié).

## Known Stubs

Aucun — aucune donnée factice rendue à l'UI, aucun TODO/FIXME introduit.

## Threat Flags

Aucune nouvelle surface hors threat model : le helper est en lecture seule du stockage GoTrue existant (D-08), aucun endpoint, aucune écriture, aucun schéma. T-35-15 (rejeu de session périmée) : mitigé in-code (parse défensif + marge + purge), prouvé par V2/V3/V6. T-35-16 : identité lue de la même entrée persistée qui a motivé la décision (V1). T-35-17 : accepté (dégradation documentée du plan). T-35-06 : superseded, sémantique mise à jour dans le registre du plan.

## Self-Check: PASSED

- `app/src/lib/supabase/session-cache.ts` : présent (créé).
- Commits vérifiés dans l'historique : `8c6563f` (test 35-08), `301236d` (feat 35-08) — 2 commits depuis `plan_head_before` 3d60c4a.
- Chaîne complète exécutée : typecheck, vitest (1914), build, playwright deep-link-redirect (6/6).
