---
phase: 42
plan: 01
subsystem: startup-instrumentation
tags: [performance, offline, diagnostics, tdd]
requires:
  - app/src/modules/parametres/components/offline-panel.tsx (existant, cible PD-01)
  - app/src/hooks/use-auth.ts (branches connectOfflineCache, OQ-1)
  - app/src/lib/sw-register.ts (callback onRegisteredSW)
provides:
  - app/src/lib/boot-marks.ts (marquerSegmentDebut/Fin, useBootMarks)
  - Section « Amorçage » du panneau offline (4 segments + total)
affects:
  - Plan 02 (protocole de mesure) — consomme la section Amorçage on-device
  - Plan 03 (corrections) — consomme les segments désignés par le profil
tech-stack:
  added: []
  patterns:
    - store zustand hors-React, patron sw-register.ts ( getState()/setState() )
    - performance.mark + performance.now, total borne à borne (jamais la somme)
key-files:
  created:
    - app/src/lib/boot-marks.ts
    - app/src/lib/boot-marks.test.ts
  modified:
    - app/src/main.tsx
    - app/src/lib/sw-register.ts
    - app/src/hooks/use-auth.ts
    - app/src/modules/parametres/components/offline-panel.tsx
    - app/src/modules/parametres/components/offline-panel.test.tsx
decisions:
  - Les bornes de début des segments sw et auth sont la borne entry commune (convention posée en commentaire dans boot-marks.ts)
  - Seul boot-marks.ts touche `performance` — les bornes idb entourent l'APPEL de connectOfflineCache dans use-auth.ts (recommandation RESEARCH)
  - Le garde PD-02 vise des identifiants précis (persistQueryClientSave, idb-keyval, createStore, openDB, dexie), jamais un préfixe ambigu qui croiserait les commentaires français
metrics:
  duration: ~35 min
  completed: 2026-11-10
  tasks: 2
  commits: 2
  plan_head_before: b74707e4aa8a8391179a7d4e030e87915f3e0bd5
  plan_head_after: 99add6773eed4a9db371fcf8f29478162641c415
actuals:
  tokens: 48000
  tasks: 2
  commits: 2
status: complete
---

# Phase 42 Plan 01: Instrumentation du démarrage (4 segments + section Amorçage) Summary

**One-liner:** Marks `performance.mark`/`now` aux 4 segments de démarrage (entry chunk, activation SW, restore IndexedDB, auth bootstrap) agrégés dans un store zustand session seule, et section « Amorçage » (4 lignes + total borne à borne) dans le panneau offline — en prod réel, sans flag de build.

## Tasks Delivered

| Task | Type | Commit | Contenu |
|------|------|--------|---------|
| 1 | tracer | 9c78e2a | boot-marks.ts + marks posés dans la séquence réelle (main.tsx, sw-register.ts, use-auth.ts ×2 branches) + section Amorçage du panneau |
| 2 | auto (tdd) | 99add67 | boot-marks.test.ts (4 comportements + garde PD-02) + extension offline-panel.test.tsx (peuplé/vide) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Mark `boot:done` absent de la première écriture de boot-marks.ts**
- **Found during:** Task 2 (le test « total borne à borne » a refusé : `mark` appelé avec `boot:auth:fin` mais jamais `boot:done`)
- **Fix:** `marquerSegmentFin('auth')` pose explicitement `poserMark('boot:done')` avant le calcul du total — le contrat du plan (« pose aussi le mark boot:done ») est maintenant tenu, et le test le prouve par l'espion.
- **Files modified:** app/src/lib/boot-marks.ts
- **Commit:** (inclus dans 99add67 via le fichier déjà modifié — le correctif a été re-créé après un revert accidentel par le cycle rouge/vert de la preuve PD-02, voir preuve §2.7 B ci-dessous)

Aucun autre écart — plan exécuté tel qu'écrit.

## Preuves §2.7 (un succès muet est un échec inexpliqué)

- **Chaîne complète :** `cd app && npm run typecheck && npm test && npm run build` — typecheck OK, **2006 tests / 245 fichiers passés**, build Vite OK (precache 152 entrées).
- **Garde PD-02 vu ROUGE avant d'être VERT (§2.7 B) :** ligne interdite `import { persistQueryClientSave } from './offline/query-persistence';` injectée temporairement dans boot-marks.ts → test « le source ne contient aucun identifiant d'écriture IndexedDB » **échoué** (1 failed | 5 passed), puis ligne retirée → vert. Le test vise des IDENTIFIANTS précis, jamais le préfixe « persist » qui croiserait les commentaires français du même fichier (§2.7 D.4).
- **Asserts de plan :** `grep -c "performance.mark" boot-marks.ts` = 3 ; occurrences `marquerSegment` : main.tsx 3, sw-register.ts 2, use-auth.ts 7 (import + 2×(début+fin idb) + 2×fin auth) ; **aucune** occurrence de `performance.` hors boot-marks.ts ; aucune occurrence de `VITE_` conditionnant un appel `marquerSegment` (PD-03).
- **e2e :** non exécutés (Docker non requis pour ce plan — aucune route ni intégration réseau nouvelle ; les tests e2e n'exercent pas le panneau Amorçage).

## Trace des conventions posées (reprises par le protocole, Plan 02)

- **Bornes communes :** `boot:entry:debut` est posé au niveau module dans main.tsx AVANT `seedOnlineStatus()` ; les segments `sw` et `auth` n'ont pas de début propre — leur durée se mesure depuis la borne entry (convention commentée dans boot-marks.ts).
- **Pitfall 3 consigné :** le comment de `onRegisteredSW` nomme le fait que le mark fin-SW peut être absent ou ~0 ms au cold start hors ligne — l'écart entre runs est un fait à consigner, jamais lissé.
- **Pitfall 4 :** les deux `marquerSegmentFin('auth')` sont placés APRÈS le garde `if (!active) return;` — hors ligne, le segment auth absorbe les délais de repli (sonde 4 s / gardien 10 s) : le protocole doit consigner la branche réellement empruntée.
- **Total :** toujours `boot:done − boot:entry:debut`, jamais la somme des 4 segments (idb imbriqué dans auth, sw partage la borne entry). Sans borne entry (passage partiel), total = `null` → repli honnête du panneau.

## Known Stubs

Aucun — aucune valeur fictive, aucun placeholder : valeur `null` = repli honnête « Pas encore mesuré sur ce démarrage » affiché par le panneau.

## Threat Flags

Aucune nouvelle surface de sécurité : la section Amorçage n'affiche que des durées (discipline D-11/T-35-18), aucune donnée ne sort du navigateur ; aucune installation de package (T-42-SC respecté).

## Notes pour le plan suivant (42-02)

- Le panneau Amorçage est la source on-device de mesure : le protocole PM-01/PM-02/PM-03 peut être rédigé contre ces 5 lignes affichées.
- Le store est session seule (PD-02) : la référence de mesure reste le doc mesures versionné, l'app ne persiste rien.

## Self-Check: PASSED

- Fichiers créés/modifiés vérifiés sur disque (boot-marks.ts, boot-marks.test.ts, SUMMARY).
- Commits vérifiés dans l'historique : 9c78e2a (Task 1), 99add67 (Task 2).
- Commit docs du SUMMARY : sauté — `.planning/` est gitignored dans ce dépôt (chemin intentionnel `skipped_gitignored`, jamais forcé).
