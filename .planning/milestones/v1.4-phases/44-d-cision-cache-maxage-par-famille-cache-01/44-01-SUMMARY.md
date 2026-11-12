---
phase: 44-d-cision-cache-maxage-par-famille-cache-01
plan: 01
subsystem: documentation
tags: [offline, cache, tanstack-query, campagne-mesures, pwa, consignation]

requires:
  - phase: 42-cold-start-mesuré-puis-corrigé-décision-cache
    provides: protocole §1–§6 et tolérances produit §5 de docs/MESURES-COLD-START-42.md ; procédure de purge §2.1 et écart de reprise post-purge consigné
provides:
  - Squelettes de consignation complets §7.1–7.6 dans docs/MESURES-COLD-START-42.md (5 blocs par run avec validations froides §2.1, procédure de campagne + reprise post-purge, question ouverte §1 posée)
  - Verdict D-15 consigné : le panneau offline existant suffit pour les critères (a) et (c) par famille → tâche conditionnelle D-14 non déclenchée
  - Squelette de la chaîne finale §2.7 (bannière CHAINE-44-VERTE) prêt à être rempli au jour J
affects: [44-02 (campagne + décision CACHE-01), PROJECT.md, query-policy]

actuals:
  tokens: 4119
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Squelette de consignation : le document de mesures est réécrit à chaque campagne (D-04), l'oubli de champ rendu impossible par la forme (5 blocs de run avec cases à cocher froides)"

key-files:
  created: []
  modified:
    - docs/MESURES-COLD-START-42.md

key-decisions:
  - "Seuil D-15 évalué contre le code réel : le panneau offline affiche déjà ageMs/maxAgeMs/pruneEligible par famille (offline-panel.tsx:378-386) et le delta de prune global est la seule forme exposée par RestoreOutcome (query-persistence.ts:468-473) — le panneau suffit, observabilité conditionnelle NON déclenchée (D-13)"

patterns-established:
  - "Évaluation de seuil conditionnel consignée dans le document de preuve : seuil énoncé → faits de code cités (lignes) → conclusion binaire → conséquence"

requirements-completed: [CACHE-04]

coverage:
  - id: D1
    description: "Squelettes §7.1–7.5 complets : cinq blocs de tableau par run (estampille, branche auth, 4 segments, total) avec deux validations froides §2.1 à cocher, règle « un run non froid n'entre pas dans les médianes », procédure de reprise post-purge mot pour mot"
    requirement: CACHE-04
    verification:
      - kind: other
        ref: "grep -c '| Run |' docs/MESURES-COLD-START-42.md (6 occurrences) + marqueurs « Vider le cache », « reconnexion », règle froid — VERIFY-1 PASS"
      - kind: other
        ref: "! grep 'Différé consigné : CACHE-01 n'est PAS tranchée' — différés 42 remplacés (D-04)"
    human_judgment: false
  - id: D2
    description: "§7.6 en squelette de chaîne finale §2.7 avec bannière CHAINE-44-VERTE"
    requirement: CACHE-04
    verification:
      - kind: other
        ref: "grep -q CHAINE-44-VERTE docs/MESURES-COLD-START-42.md — pass"
    human_judgment: false
  - id: D3
    description: "Verdict D-15 consigné avec preuves de code et conclusion binaire (« le panneau suffit ») → tâche conditionnelle D-14 non déclenchée"
    requirement: CACHE-04
    verification:
      - kind: other
        ref: "grep « critères (a) et (c) par famille » + « D-15 » + conclusion binaire — VERIFY-2 PASS"
    human_judgment: false
  - id: D4
    description: "Régression : offline-panel.tsx inchangé, PROJECT.md intouché, chaîne typecheck + tests complète verte"
    requirement: CACHE-04
    verification:
      - kind: unit
        ref: "cd app && npm run typecheck (OK) ; npm test — 2006 passed / 245 fichiers, 0 failed"
    human_judgment: false

duration: 11 min
completed: 2026-11-11
status: complete
---

# Phase 44 Plan 01: Préparatoire campagne CACHE-01 Summary

**Squelettes de consignation §7.1–7.6 prêts à remplir dans docs/MESURES-COLD-START-42.md + verdict D-15 consigné : le panneau offline existant suffit pour les critères (a) et (c) par famille, l'observabilité conditionnelle n'est pas déclenchée**

## Performance

- **Duration:** 11 min
- **Started:** 2026-11-11T20:34:11Z
- **Completed:** 2026-11-11T20:45:13Z
- **Tasks:** 3 (2 exécutées, 1 conditionnelle non déclenchée)
- **Files modified:** 1

## Accomplishments
- §7.1–7.5 du document MESURES réécrits en squelettes complets : cinq blocs de tableau par run avec estampille quatre canaux, branche auth, 4 segments, total borne à borne, et deux validations « froid » §2.1 à cocher par run (règle « un run non froid n'entre pas dans les médianes » en commentaire)
- Procédure de campagne résumée + chaîne de reprise post-purge de l'écart 42 portée mot pour mot (reconnexion réseau → connexion → mode avion → « Vider le cache » seul → run froid comparable) ; question ouverte du protocole §1 posée en une ligne visible
- Verdict D-15 évalué contre le code réel et consigné avec références de lignes : conclusion « le panneau suffit » → tâche conditionnelle D-14 explicitement non déclenchée (D-13 respecté)
- §7.6 remplacé par le squelette de la chaîne finale §2.7 avec bannière CHAINE-44-VERTE ; différés « 2026-11-10 » remplacés (D-04, historique dans git)

## Task Commits

1. **Task 1: Squelettes de consignation §7.1–7.5 dans le document MESURES** - `4bc0ea1` (docs)
2. **Task 2: Évaluation explicite du seuil D-15 contre le panneau existant** - `4e65b24` (docs)
3. **Task 3: Section repliée « détail par famille » (CONDITIONNELLE)** - non déclenchée — verdict D-15 « le panneau suffit » consigné en Task 2 ; offline-panel.tsx inchangé (git diff vide sur le fichier), conformément à D-13/D-14/D-15 et à la clause « Si le verdict est "le panneau suffit" : ne RIEN faire dans ce fichier » du plan.

**Plan metadata:** voir commit final (docs: complete plan)

## Files Created/Modified
- `docs/MESURES-COLD-START-42.md` - §7.1–7.6 réécrits : squelettes de campagne 44, verdict D-15, squelette de chaîne finale (sections §1–§6 du protocole contraignant intouchées)

## Decisions Made
- Évaluation D-15 fondée sur le code réel, pas sur la seule RESEARCH : le critère (a) §5 définit opérationnellement le volume réhydraté comme « ageMs/maxAgeMs/pruneEligible par famille + delta de prune via getRestoreOutcome » — exactement ce que le panneau expose déjà (rendu par famille offline-panel.tsx:378-386) ; le delta de prune global (:94-97) est la seule forme que `RestoreOutcome` expose (comptes globaux, query-persistence.ts:468-473), donc aucun « détail par famille » supplémentaire n'est nécessaire sans toucher des données que l'outil ne produit pas. Conclusion : statu quo du panneau (décision correcte, Finding 5 confirmé par lecture).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Le document MESURES est prêt pour la campagne : le jour J (plan 44-02, checkpoint appareil), l'utilisateur dicte uniquement les valeurs mesurées depuis les panneaux « Amorçage » et « Cache hors-ligne » — la forme rend l'oubli de champ impossible.
- PROJECT.md, outbox, bandeau offline, service worker : intouchés (vérifiés).
- Chaîne §2.7 partielle déjà verte à cet état : typecheck OK, 2006/2006 tests (245 fichiers) ; la chaîne complète (build, e2e, SQL statique) reste à exécuter à l'état final de la phase (D-08).

---
*Phase: 44-d-cision-cache-maxage-par-famille-cache-01*
*Completed: 2026-11-11*

## Self-Check: PASSED

- `docs/MESURES-COLD-START-42.md` : présent (FOUND) — marqueurs VERIFY-1 et VERIFY-2 verts, différés 42 remplacés
- Commits vérifiés : `4bc0ea1` (Task 1), `4e65b24` (Task 2), `1f472af` (metadata SUMMARY/STATE), `6ee9968` (STATE/ROADMAP/REQUIREMENTS) — tous dans `git log`
- offline-panel.tsx inchangé (Task 3 non déclenchée, git diff vide) ; `git diff --stat .planning/PROJECT.md` vide
- Chaîne : `cd app && npm run typecheck` OK ; `npm test` 2006 passed / 245 fichiers, 0 failed
- Note : `.planning/phases` est gitignored dans ce dépôt — le SUMMARY vit sur disque mais hors historique git (skip légitime `skipped_gitignored`)
