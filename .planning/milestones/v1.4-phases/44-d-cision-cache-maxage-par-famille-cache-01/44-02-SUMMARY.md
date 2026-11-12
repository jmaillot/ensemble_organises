---
phase: 44-d-cision-cache-maxage-par-famille-cache-01
plan: 02
subsystem: documentation
tags: [offline, cache, campagne-mesures, differe, consignation]

requires:
  - phase: 44-d-cision-cache-maxage-par-famille-cache-01
    provides: squelettes §7.1–7.6 de docs/MESURES-COLD-START-42.md (plan 44-01), protocole §1–§6 et critères §5 contraignants
provides:
  - Différé consigné de la campagne 44 (2026-11-12) en §7.1–7.5 : aucune valeur inventée, CACHE-01 NON tranchée, question ouverte §1 non tranchée
  - Chaîne §2.7 complète exécutée une fois à l'état final et consignée §7.6 avec bannière CHAINE-44-VERTE
affects: [campagne CACHE-01 future (méme protocole, sans modification), PROJECT.md]

actuals:
  tokens: 9800
  tasks: 3
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Repli différé : le checkpoint appareil résolu (disponibilité déclarée) n'imprime pas la campagne — l'absence de dictée est consignée à la forme 42-03, jamais maquillée (§2.7 I)"

key-files:
  created: []
  modified:
    - docs/MESURES-COLD-START-42.md

key-decisions:
  - "Repli différé honnête : l'utilisateur a déclaré la campagne impossible en session (« campagne impossible maintenant », environnement de production inaccessible) — aucun run, aucune valeur du panneau, CACHE-01 NON tranchée, PROJECT.md intouché (D-10/D-11 : section « Décision CACHE-01 » seulement avec données réelles)"
  - "Chaîne §2.7 exécutée quand même à l'état final (D-08) : aucun code modifié en phase 44, la chaîne verte consigne l'état de référence du différé"

requirements-completed: []

duration: 1h55 (dont chaîne §2.7 ≈ 11 min)
completed: 2026-11-12
status: complete
---

# Phase 44 Plan 02: Campagne on-device CACHE-01 et décision par famille Summary

**Différé consigné honnêtement (§7.1–7.5) — la campagne on-device n'a pas pu tourner, aucune valeur inventée, CACHE-01 NON tranchée, PROJECT.md intouché ; chaîne §2.7 complète verte à l'état final (§7.6, CHAINE-44-VERTE)**

## Performance

- **Duration:** ~1h55
- **Started:** 2026-11-12T07:13:59Z
- **Completed:** 2026-11-12T09:10Z
- **Tasks:** 3 (checkpoint Task 1 déjà résolu en session ; Task 2 exécutée en repli différé ; Task 3 chaîne + consignation)
- **Files modified:** 1

## Accomplishments
- Checkpoint Task 1 : résolu en session (appareil de référence déclaré disponible, même appareil que la campagne 42, purge §2.1 connue) — consigné dans le SUMMARY, non re-demandé
- Task 2 : sollicitation dictée Run 1 via le question tool — l'utilisateur a répondu « Campagne impossible maintenant » / « pas accès à la prod ». Aucun run réalisé, **aucune valeur inventée, aucune mesure d'émulateur** (§1, §2.7 I) : §7.1 (différé consigné daté 2026-11-12, question ouverte §1 explicitement non tranchée), §7.2 (aucune correction livrée — aucune valeur maxAge modifiée), §7.3 (aucune lecture panneau), §7.4 (CACHE-01 NON tranchée, critères §5 restent la grille de la campagne future) et §7.5 (écart consigné : l'appareil déclaré disponible n'a pas produit de mesures)
- Task 3 : chaîne §2.7 complète exécutée UNE fois à l'état final du dépôt et consignée §7.6 avec bannière **CHAINE-44-VERTE** ; commit de consignation DISTINCT (docs uniquement, aucun fichier app/src/)
- PROJECT.md : **intouché** — aucune section « Décision CACHE-01 » sans données réelles (D-10/D-11, §2.7 I)

## Task Commits

1. **Task 1: Checkpoint appareil** — résolu en session (aucun commit) : disponibilité déclarée, campagne lancée
2. **Task 2: Campagne §6 + grille §7.4** — repli différé : aucun commit de famille (D-07 sans objet, `OFFLINE_FAMILIES` inchangée, buster `v2` inchangé), dictée refusée consignée dans le document
3. **Task 3: Consignation différé + chaîne §2.7** - `592fa18` (docs — docs/MESURES-COLD-START-42.md seul, D-12 respecté)

## Chaîne §2.7 à l'état final (§7.6, D-08)

| Étape | Résultat |
|---|---|
| `sh scripts/check-version-stamp.sh` | OK — canaux égaux au SHA `6ee99684…`, `unknown` sans, deux familles différentes |
| `sh scripts/test-sw-gate.sh` | 4/4 verts (deux builds réels, même origin) |
| `cd app && npm run typecheck` | OK |
| `cd app && npm test` | 2006 passed / 245 fichiers, 0 failed |
| `cd app && npm run build` | OK — precache 152 entrées (2751,51 KiB) |
| `cd app && npm run test:e2e` | 163 passed / 9 skipped (Docker disponible ; skips = baseline préexistante) |
| `python3 scripts/check-sql-statique.py` | aucun défaut — 231 fonctions / 182 migrations, 107 tests ; aucune migration ajoutée en phase 44, son absence de requête est un fait vérifié |
| `python3 scripts/test-check-sql-statique.py` | OK — 6 cas, tous verts |
| `npm test -- query-policy` (Tests F/G/H/I) | 12 passed — vert après consignation |

**CHAINE-44-VERTE**

## Decisions Made
- **Repli différé du checkpoint** (clause « Si NON » du plan, appliquée à un refus de dictée en session) : à la forme de la campagne 2026-11-10 (commit `6e1ca2d`) — mentions « Différé consigné » datées en §7.1–7.4, tableaux squelettes laissés vides, aucune décision §7.4, PROJECT.md intouché, clôture de la phase comme différée (critère de succès 1 satisfait).
- **Chaîne exécutée malgré le différé** : le D-08 exige une chaîne à l'état final ; l'état final du différé est le HEAD sans code modifié — la chaîne verte consigne cet état de référence plutôt qu'un succès muet.

## Deviations from Plan

**[Repli planifié — non une déviation] Campagne non réalisée.** Le plan prévoit explicitement le repli (Task 1 action « Si NON » : consigner le différé honnêtement, AUCUNE valeur inventée, AUCUNE décision §7.4, PROJECT.md intouché, clore la phase comme différée). La spécificité ici : le checkpoint appareil était résolu (disponibilité déclarée), mais la dictée des valeurs a été refusée par l'utilisateur en session (« je ne vais pas tout lister, tu n'as pas accès à la prod »). Aucune valeur n'a été fabriquée pour combler l'absence.

## Issues Encountered
- CACHE-01 et la question ouverte §1 (couverture suffisante des runs avant correction) restent ouvertes ; elles seront tranchées par une campagne ultérieure au même protocole, sans modification (D-04 : document réécrit à chaque campagne, historique dans git).

## User Setup Required

Aucune configuration externe requise pour ce plan. La campagne future exige : l'appareil de référence réel + un environnement de mesure accessible (production) + disponibilité de l'utilisateur pour dicter les 5 runs.

## Next Phase Readiness
- `docs/MESURES-COLD-START-42.md` : §7 porte le différé daté + la chaîne verte ; les squelettes du plan 44-01 restent en place pour la campagne suivante.
- `query-policy.ts` inchangé (valeurs maxAge en vigueur : 9 familles vivantes à 24 h, 2 annexes à 7 j) ; tests F/G/H/I verts ; buster `v2` inchangé ; outbox, bandeau offline, service worker : intouchés (aucune modification en phase 44).
- PROJECT.md : intouché (vérifié — pas de section « Décision CACHE-01 »).

---
*Phase: 44-d-cision-cache-maxage-par-famille-cache-01*
*Completed: 2026-11-12*

## Self-Check: PASSED

- `docs/MESURES-COLD-START-42.md` : présent (FOUND) — 4 occurrences « Différé consigné », bannière CHAINE-44-VERTE présente
- Commit vérifié : `592fa18` dans `git log` (consignation docs seule, aucun fichier app/src/ — D-12)
- PROJECT.md intouché : grep « Décision CACHE-01 » absent ; `git status` propre sur app/src/
- Chaîne citée ci-dessus avec ses résultats chiffrés (§2.7 F)
- Note : `.planning/phases` est gitignored dans ce dépôt — le SUMMARY vit sur disque mais hors historique git (skip légitime `skipped_gitignored`)
