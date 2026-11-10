---
phase: 42-cold-start-mesur-puis-corrig-d-cision-cache
verified: 2026-11-10T15:20:00Z
status: passed
score: 6/8 must-haves verified
covered_files:
  - .planning/phases/42-cold-start-mesur-puis-corrig-d-cision-cache/42-01-PLAN.md
  - .planning/phases/42-cold-start-mesur-puis-corrig-d-cision-cache/42-02-PLAN.md
  - .planning/phases/42-cold-start-mesur-puis-corrig-d-cision-cache/42-03-PLAN.md
  - .planning/phases/42-cold-start-mesur-puis-corrig-d-cision-cache/42-01-SUMMARY.md
  - .planning/phases/42-cold-start-mesur-puis-corrig-d-cision-cache/42-02-SUMMARY.md
  - .planning/phases/42-cold-start-mesur-puis-corrig-d-cision-cache/42-03-SUMMARY.md
  - app/src/lib/boot-marks.ts
  - app/src/lib/boot-marks.test.ts
  - app/src/main.tsx
  - app/src/lib/sw-register.ts
  - app/src/hooks/use-auth.ts
  - app/src/modules/parametres/components/offline-panel.tsx
  - app/src/modules/parametres/components/offline-panel.test.tsx
  - docs/MESURES-COLD-START-42.md
  - .planning/PROJECT.md

covered_digest: "v2:sha256:4418c648ff899e49e34c6d225ce893f9f35efdac05361846a61017399a21da06"
covered_digest_note: "Empreinte v2 calculée par l'orchestrateur (gsd_run verification fingerprint) sur les 14 fichiers couverts hachables — les 6 artefacts 42-0x-{PLAN,SUMMARY}.md de la phase + les 8 fichiers code/doc. `.planning/PROJECT.md` est un document repo-wide : il n'entre jamais dans le digest (comportement du verb fingerprint) ; il reste listé dans covered_files pour la traçabilité. Les fichiers de phase sont gitignorés (.planning/*) mais hachés depuis le disque."
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 6/8
  gaps_closed: []
  gaps_remaining:
    - "COLD-02 — campagne on-device (human verification)"
    - "CACHE-01 — décision par famille (human verification)"
  regressions: []
human_verification:
  - test: "Campagne de mesure on-device COLD-02 : sur l'appareil Android de référence, exécuter le protocole du doc mesures (purge §2 avec critères de froid à deux faits, réseau coupé, N = 5 runs), lire la section « Amorçage » du panneau offline (4 segments + total) et consigner les valeurs dans docs/MESURES-COLD-START-42.md §7.1"
    expected: "5 runs consignés avec estampille, branche auth, 4 segments et total ; médiane par segment calculée ; aucune valeur inventée"
    why_human: "La mesure exige un appareil physique (désinstallation PWA, coupure réseau, lecture à l'écran) — automatisable par aucun grep ni test"
  - test: "Décision CACHE-01 par famille : après la campagne, lire les volumes réhydratés (inspectPersistedCache via panneau) et appliquer les critères §5 du doc mesures aux 11 familles OFFLINE_FAMILIES, puis documenter la décision (statu quo justifié ou nouvelle valeur) dans PROJECT.md"
    expected: "Une valeur + justification par famille dans PROJECT.md, cohérente avec les critères CA-01..CA-04 ; si un maxAge change, query-policy.ts + Test H verts dans le même commit"
    why_human: "La décision produit exige les données du panneau on-device, inexistantes sans la campagne — les critères sont écrits mais la matière à arbitrer n'existe pas encore"
---

# Phase 42: Cold start mesuré puis corrigé + décision cache — Verification Report (regenerated)

**Phase Goal:** Cold start mesuré puis corrigé + décision cache (exigences COLD-01, COLD-02, CACHE-01)
**Verified:** 2026-11-10T15:20:00Z
**Status:** human_needed
**Re-verification:** Yes — re-run after stale digest (#4682) : toutes les conclusions du rapport précédent ont été re-falsifiées contre l'état ACTUEL du dépôt, pas reprises telles quelles.

## Goal Achievement

Le goal est un artefact à deux moitiés : la moitié **instrumentation + protocole** est livrée et vérifiée dans le code ; la moitié **campagne on-device** (COLD-02 boucle mesure→correction→re-mesure, CACHE-01 décision par famille) a été **explicitement différée par l'utilisateur** (blocage protocole étape 4 puis « pass »). Ce différé est consigné honnêtement dans le doc mesures (§7.1/§7.5) et PROJECT.md (l.89), et applique la branche « appareil indisponible » prévue par le plan 42-03 lui-même. Conformément à la consigne d'orchestration, ces deux exigences ouvertes sont routées en **human_verification explicite**, pas en gap silencieux.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Les 4 segments de démarrage sont mesurés par performance.mark/measure en prod réel, sans flag de build (PD-03) | ✓ VERIFIED | Re-vérifié ce run : boot-marks.ts (6 occ. `performance.`), marks câblés : main.tsx l.34/110, sw-register.ts l.43, use-auth.ts 7 occ. réparties sur les DEUX branches connectOfflineCache ; `grep -rln "performance\."` hors boot-marks/test → vide ; aucun `VITE_` ne conditionne un mark (VITE_E2E_SW_HARNESS main.tsx l.97 gate le render, pas les marks) ; 6 tests boot-marks verts (re-exécutés ce run) |
| 2 | Le panneau offline affiche une section « Amorçage » : 4 segments + total borne à borne | ✓ VERIFIED | offline-panel.tsx l.280 `title="Amorçage"`, 5 rangées (l.286-302) avec repli honnête ; store lu via `useBootMarks()` l.114 ; total = `boot:done − boot:entry:debut` (boot-marks.ts l.112-116), jamais la somme ; test composant présent (27 tests verts re-exécutés) |
| 3 | L'instrumentation n'écrit RIEN dans IndexedDB au démarrage (PD-02) — store session seule | ✓ VERIFIED | boot-marks.ts : aucun identifiant d'écriture IndexedDB (`persistQueryClientSave`, `idb-keyval`, `createStore`, `openDB`, `dexie`) — 0 hit ; store zustand mémoire ; test de garde présent et vert (vu rouge avant vert selon SUMMARY 42-01) |
| 4 | Le total reste honnête même si le segment SW manque ou est à 0 ms (Pitfall 3) | ✓ VERIFIED | boot-marks.ts : convention commentée, segment absent reste `null`, repli honnête du panneau ; test « fin sans début tolérée » couvert (6/6 verts) |
| 5 | Le protocole de mesure est écrit AVANT toute mesure (PM-01/PM-02, N=5, médiane) | ✓ VERIFIED | docs/MESURES-COLD-START-42.md versionné (`git ls-files --error-unmatch` OK ce run) ; l.18-19 : appareil Android réel, émulateur explicitement exclu, N = 5, médiane, min/max jamais consignés comme référence |
| 6 | Les critères CACHE-01 par famille (CA-02) sont écrits dans le protocole | ✓ VERIFIED | doc §5 (l.80-86) : arbitrage PAR famille (CA-01), 11 familles OFFLINE_FAMILIES nommées via query-policy.ts, trois critères (a)(b)(c), règle de décision, statu quo justifié valide (CA-03) ; ordre instrumentation→lecture→décision consigné §6 (CA-04) |
| 7 | COLD-02 — boucle mesure → correction → re-mesure exécutée et documentée | ? UNCERTAIN — human verification | Campagne non exécutée (différé d'appareil, doc §7.1/§7.5, PROJECT.md l.89). Re-vérifié ce run : tableaux §7.1/§7.2 vides (« Médiane — » en-têtes seulement), aucune valeur inventée (§2.7 I). La branche différé est celle prévue par le plan 42-03 Task 1. Exige l'appareil — routé en human_verification |
| 8 | CACHE-01 — décision tranchée par famille documentée dans PROJECT.md | ? UNCERTAIN — human verification | Non tranchée : PROJECT.md l.89 documente l'état ouvert ; re-vérifié ce run : `git status` — query-policy.ts NON modifié (aucune entrée modifiée hors .planning/40-*), OFFLINE_FAMILIES intacte, tests query-policy 12/12 verts. Le statu quo de fait n'est pas une décision CA-03. Exige les données du panneau — routé en human_verification |

**Score:** 6/8 truths verified (2 exigent l'appareil — human verification, pas des gaps de code)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `app/src/lib/boot-marks.ts` | Store session + marquerSegmentDebut/Fin + total borne à borne | ✓ VERIFIED | Substantiel, commenté (conventions PD-02/PD-03/Pattern 2/Pitfalls), exports vérifiés ce run |
| `app/src/lib/boot-marks.test.ts` | 4 comportements + garde PD-02 | ✓ VERIFIED | 6 passed re-exécutés ce run |
| `app/src/main.tsx` (modifié) | mark entry début module-scope avant seedOnlineStatus, fin après render | ✓ VERIFIED | l.34 et l.110, import statique l.10 |
| `app/src/lib/sw-register.ts` (modifié) | marquerSegmentFin('sw') dans onRegisteredSW | ✓ VERIFIED | l.43, import l.9 |
| `app/src/hooks/use-auth.ts` (modifié) | marks idb autour des DEUX branches connectOfflineCache + fin auth ×2 | ✓ VERIFIED | 7 occurrences ; les deux branches : debut/fin idb entourent chaque `await connectOfflineCache`, fin auth après le garde `if (!active) return` sur les deux chemins |
| `app/src/modules/parametres/components/offline-panel.tsx` | Section « Amorçage » (4 segments + total, repli honnête) | ✓ VERIFIED | l.280-302, useBootMarks l.114 |
| `docs/MESURES-COLD-START-42.md` | Protocole 7 sections + critères 11 familles + sections résultats (vides ou différées) | ✓ VERIFIED | 7 sections dans l'ordre ; versionné (git ls-files OK) ; aucune valeur inventée |
| `.planning/PROJECT.md` | État CACHE-01 consigné | ✓ VERIFIED | l.89 : état ouvert documenté avec justification |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| main.tsx | boot-marks.ts | import statique + mark module-scope | ✓ WIRED | l.10, l.34 (avant seedOnlineStatus), l.110 |
| sw-register.ts | boot-marks.ts | marquerSegmentFin('sw') dans callback | ✓ WIRED | l.9, l.43 |
| use-auth.ts | boot-marks.ts | marks autour des 2 branches connectOfflineCache | ✓ WIRED | 7 occurrences, les 2 branches couvertes (OQ-1), fin auth après garde `!active` |
| offline-panel.tsx | boot-marks store | useBootMarks() au montage | ✓ WIRED | l.23, l.114, rendu l.286-302 |
| docs mesures §5 | Plan 03 décision | critères CA-02 → décision future | ✓ WIRED (en attente de données) | §5 renvoie à query-policy.ts / Test H ; §7.4 emplacement décision préparé |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| offline-panel section Amorçage | amorcage.{entry,sw,idb,auth,totalMs} | performance.now() réel aux points de démarrage réels | Oui (mesures runtime réelles ; null = repli honnête) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Comportements boot-marks (total borne à borne, dernier gagne, fin sans début, garde PD-02) | `npm test -- boot-marks` | 6 passed (6) | ✓ PASS |
| Section Amorçage peuplée + vide | `npm test -- offline-panel` | 27 passed (27) | ✓ PASS |
| Régression politique cache (Test H, purge outbox) | `npx vitest run query-policy` | 12 passed (12) | ✓ PASS |
| Prohibition PD-02 | grep identifiants d'écriture IndexedDB dans boot-marks.ts | 0 hit | ✓ PASS |
| Prohibition PD-03 | grep VITE_ conditionnant un mark | 0 hit (harnais gate le render, pas les marks) | ✓ PASS |

### Probe Execution

Aucun probe script déclaré par cette phase (aucune migration, aucun CLI probe). La chaîne §2.7 complète a été exécutée par le plan 42-03 et consignée dans le doc §7.6 — non re-exécutée ici (le vérificateur prouve les comportements ciblés ci-dessus).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| COLD-01 | 42-01, 42-02 | Cold start mesuré avec protocole écrit d'abord + marks aux 4 segments alimentant le panneau diagnostic | ✓ SATISFIED (partie livrable) | Instrumentation + panneau vérifiés (truths 1-4) ; protocole versionné avant toute mesure (truths 5-6) |
| COLD-02 | 42-03 | Corrections désignées par le profilage livrées, re-mesure documentée | ? NEEDS HUMAN | Boucle non exécutée — différé d'appareil consigné honnêtement (doc §7.1/§7.5, PROJECT.md l.89) ; aucune correction livrée (section écarts cohérente) |
| CACHE-01 | 42-03 | maxAge tranché par famille avec données panneau, décision dans PROJECT.md | ? NEEDS HUMAN | Décision non rendue — critères écrits et contraignants (doc §5), état ouvert documenté PROJECT.md l.89, query-policy.ts intact (re-vérifié ce run, tests verts) |

**Orphelins :** aucun — les 3 exigences sont mappées à la phase 42 dans REQUIREMENTS.md (l.72-74) et réclamées par les plans (42-01/02 : COLD-01 ; 42-03 : les trois).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (aucun) | — | grep TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER sur les fichiers modifiés (re-exécuté ce run) | — | 0 hit — aucun debt marker |

Note §2.7 I : les absences affirmées du doc (« aucune valeur inventée », « query-policy non modifié ») ont été re-vérifiées par grep/git-status ce run — exactes.

### Human Verification Required

Voir frontmatter `human_verification` — 2 items (campagne COLD-02, décision CACHE-01). Les deux sont les exigences explicitement différées par l'utilisateur ; le protocole (doc versionné) et les critères sont prêts à les recevoir sans réinvention.

### Gaps Summary

Aucun gap de code : tous les artifacts sont présents, substantiels, câblés et testés ; les prohibitions PD-02/PD-03 sont tenues ; le protocole est versionné avant toute mesure. Les exigences COLD-02 et CACHE-01 ne sont pas « échouées » — leur matière (mesures on-device) n'existe pas sans l'appareil, et le plan 42-03 a appliqué sa branche différé prévue, consignée honnêtement (§2.7 I re-vérifié). Status `human_needed` : la phase est complète au titre de ce qui est automatisable ; la clôture du goal exige la campagne on-device (2 items humains).

Note fingerprint (#4682) : `gsd_run` reste absent de cet environnement (re-vérifié ce run : `which gsd_run gsd-tools` vide) — `covered_digest` non calculable par l'outil ; la liste `covered_files` est complète ci-dessus.

---

_Verified: 2026-11-10T15:20:00Z_
_Verifier: the agent (gsd-verifier)_
