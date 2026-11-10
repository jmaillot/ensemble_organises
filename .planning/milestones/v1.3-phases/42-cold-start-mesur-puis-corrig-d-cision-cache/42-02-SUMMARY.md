---
phase: 42
plan: 02
subsystem: measurement-protocol
tags: [protocol, cold-start, offline, cache, documentation]
requires:
  - .planning/phases/42-.../42-CONTEXT.md (décisions PM-01/02/03, CU-01/02/03, CA-01..04)
  - .planning/phases/42-.../42-RESEARCH.md (Pitfall 3 purge PWA, Pitfall 4 segment auth, axes candidats, N=5 OQ-2)
  - app/src/lib/query-policy.ts (OFFLINE_FAMILIES — 11 familles)
  - app/src/lib/offline/query-persistence.ts (inspectPersistedCache, getRestoreOutcome)
provides:
  - docs/MESURES-COLD-START-42.md (protocole + critères CACHE-01 + sections de résultats vides)
affects:
  - Plan 03 (mesures on-device + corrections + décision CACHE-01) — applique les critères §5 sans les réinventer
tech-stack:
  added: []
  patterns:
    - discipline de preuve §2.7 (analog 38-E2E-SIGNATURE.md)
    - critères écrits avant lecture des données (CA-02)
key-files:
  created:
    - docs/MESURES-COLD-START-42.md
  modified: []
decisions:
  - N = 5 runs par condition, médiane consignée (recommandation RESEARCH OQ-2, consignée avant les mesures)
  - Purge = désinstallation complète de la PWA ; wipe « site data » Chrome documenté comme alternative si résidu (recours consigné en écarts)
  - Tolérance produit énoncée famille par famille (une phrase chacune) AVANT toute lecture du panneau ; le volume réhydraté est un fait d'instrumentation, pas un critère de décision à lui seul
metrics:
  duration: ~20 min
  completed: 2026-11-10
  tasks: 1
  commits: 1
  plan_head_before: 99add6773eed4a9db371fcf8f29478162641c415
  plan_head_after: 8dede27
actuals:
  tokens: 26000
  tasks: 1
  commits: 1
status: complete
---

# Phase 42 Plan 02: Protocole de mesure cold start + critères CACHE-01 Summary

**One-liner:** Protocole de mesure versionné `docs/MESURES-COLD-START-42.md` — séquence de purge PWA exacte (Pitfall 3), N = 5 runs / médiane, définition des 4 segments et du total borne à borne, et critères d'arbitrage CACHE-01 écrits famille par famille (les 11 familles, tolérance énoncée avant lecture du panneau) — écrit AVANT toute mesure (CA-02), sans valeur inventée ni cible chiffrée.

## Tasks Delivered

| Task | Type | Commit | Contenu |
|------|------|--------|---------|
| 1 | auto | 8dede27 | `docs/MESURES-COLD-START-42.md` : protocole PM-01/PM-02, séquence purge §2, segments §3, axes CU-02 §4, critères CACHE-01 §5, biais d'ordre §6, sections de résultats vides §7 |

## Deviations from Plan

Aucun écart — plan exécuté tel qu'écrit.

## Preuves §2.7

- **Asserts du plan `<automated>`** (tous verts) : fichier présent ; greps `OFFLINE_FAMILIES` / `N = 5` / `statu quo` trouvés ; `git ls-files` versionné après commit.
- **11 familles nommées** dans la section critères : boucle grep par prefix — 0 manquant.
- **Émulateur explicitement exclu** (§1, PM-01) ; « médiane » présent ; **aucune valeur de mesure chiffrée** dans les sections 1-6 (grep `ms` ne retourne que le constat qualitatif Pitfall 3 « ~0 ms » exigé par le plan, et les libellés de tableaux — aucune valeur de résultat).
- **T-42-02** respecté : le protocole est versionné AVANT les mesures — toute modification postérieure de critère serait visible dans l'historique git. **T-42-SC** respecté : aucune installation de package.

## Interdits vérifiables du plan

- Aucune valeur de durée inventée dans les sections 1-6 ✅
- Aucune cible chiffrée de fin de boucle (CU-01 : §4 énonce explicitement que la fin est désignée par le profil, pas par un seuil) ✅
- L'émulateur nommé explicitement comme exclu (PM-01) ✅
- Aucune persistance des mesures dans l'app (PM-03 : le doc est la référence, PD-02 rappelé en tête de doc) ✅

## Observation hors périmètre (à l'attention de l'orchestrateur)

`app/src/lib/boot-marks.ts` présente un **diff non commité hérité du plan 42-01** (pose de `poserMark('boot:done')` — le correctif Rule 1 décrit dans 42-01-SUMMARY, re-appliqué après revert accidentel mais jamais commité). Non touché par ce plan (hors périmètre, §AGENTS.md pas de réparation opportuniste) : à faire solder par le plan 42-01/orchestrateur avant les mesures du Plan 03, car le total borne à borne du panneau dépend de ce mark.

## Known Stubs

Aucun — les sections de résultats §7 sont des emplacements **intentionnellement vides** à remplir au Plan 03 (le plan interdit toute valeur de mesure dans ce plan).

## Threat Flags

Aucune nouvelle surface de sécurité : document markdown du dépôt, aucune frontière de confiance nouvelle (threat model du plan).

## Self-Check: PASSED

- `docs/MESURES-COLD-START-42.md` présent sur disque et versionné (commit 8dede27 vérifié).
- Commit task vérifié dans l'historique : 8dede27.
- Commit docs du SUMMARY : sauté — `.planning/` est gitignored dans ce dépôt (chemin intentionnel `skipped_gitignored`, jamais forcé).
