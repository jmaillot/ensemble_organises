---
gsd_state_version: "1.0"
milestone: v1.4
milestone_name: Preuve & décision
current_phase: 44
current_phase_name: Décision cache maxAge par famille (CACHE-01)
status: planning
stopped_at: Phase 44 context gathered
last_updated: "2026-11-11T19:15:34.733Z"
last_activity: 2026-11-11
last_activity_desc: Phase 43 complete, transitioned to Phase 44
state_head: c78f9a2ca8f28389ea075e143bb430632f161ffc
progress:
  total_phases: 2
  completed_phases: 1
  total_plans: 1
  completed_plans: 1
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-11)

**Core value:** PWA foyers — l'app de poche du quotidien familial, fiable hors-ligne, joignable en un tap, sans store.
**Current focus:** Phase 44 — Décision cache maxAge par famille (CACHE-01)

## Current Position

Phase: 44 — Décision cache maxAge par famille (CACHE-01)
Plan: Not started
Status: Ready to plan
Last activity: 2026-11-11 — Phase 43 complete, transitioned to Phase 44

## Performance Metrics

- v1.1 : 4 phases, 25 plans, 17 tasks, 145 commits, audit tech_debt 16/16
- v1.2 : 2 phases, 5 plans, 6 exigences, audit tech_debt 6/6
- v1.3 : 5 phases (38-42), 12 exigences, 13 plans — audit tech_debt 10/12 (2 deferred : COLD-02, CACHE-01)
- v1.4 : 2 phases (43-44), 11 exigences (PROOF-01..07, CACHE-01..04) — en cours

**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 43 P01 | 5h | 3 tasks | 2 files |

## Accumulated Context

### Decisions (this milestone)

- Ordre des phases = ordre de **risque**, pas de dépendance : aucune dépendance croisée W1/CACHE-01. W1 en premier car aucune dépendance appareil (stack prod + accès SQL suffisent) ; CACHE-01 en second car bloquée sur la disponibilité physique de l'appareil de référence (différée deux fois en v1.3 pour cette raison). Parallélisable si l'appareil se libère tôt.
- Script sœur `scripts/test-ardoise-bridge-real.sh` (convention du dépôt : un script par preuve à ressource réelle) — recommandation tranchée par la recherche contre l'extension inline de `test-join-token-real.sh` (couplage des deux jambes rendrait le verdict ambigu, §2.7 F).
- Zéro nouveau paquet, zéro nouveau service : W1 = sh + curl -K + psql.sh stdin + lib-smoke-accounts.sh ; CACHE-01 = édition déclarative d'`OFFLINE_FAMILIES` dans `query-policy.ts`. `experimental_createQueryPersister` refusé (casserait outbox, namespacing D-03, throttle muté).
- Statu quo justifié = décision CACHE-01 valide (CA-03) ; les critères §5 (b)(c) tranchent, jamais la lecture du panneau seule (biais d'ordre — le maxAge en vigueur détermine le volume observé).
- Déféré au backlog : W2 (spec navigateur du flux bridge, si PROOF-07 révèle un seam au-delà du scénario déclenché), GATE-01 (observatoire), COLD-02 (périmètre distinct).

### Todos

- Rejouer GATE-01 (tests 32-UAT 7 et 35-UAT 2) lors de la prochaine mise en production naturelle — observatoire hors jalon.
- Purger à la main les 3 comptes e2e résiduels de runs antérieurs (e2e+1794223918703512-1/-2, e2e+1794223911703118-1) — signalés par le script, jamais supprimés par lui (borne : comptes du run uniquement).

### Blockers

- Phase 44 : machine on-device (appareil de référence) requise pour la campagne N=5 et toute décision maxAge — tant qu'elle manque, travail préparatoire seul (relecture des tolérances §5, vérification `inspectPersistedCache`), différé consigné honnêtement si report, jamais de valeur inventée.

## Session Continuity

**Last session:** 2026-11-11T19:15:34.697Z
**Stopped at:** Phase 44 context gathered
**Resume file:** .planning/phases/44-d-cision-cache-maxage-par-famille-cache-01/44-CONTEXT.md

- Phase 43 close (run 11 vert, gates tous passés) — voir PROJECT.md « État courant ».
- Prochain pas : `/gsd-plan-phase 44` (CACHE-01, requiert l'appareil de référence pour la campagne).
- Exigences : PROOF-01..07 ✓ Complete (Phase 43) ; CACHE-01..04 → Phase 44.

## Operator Next Steps

- `/gsd-plan-phase 44` — prévoir la disponibilité de l'appareil de référence (blocker consigné).

## Decisions

- [Phase 43]: Négatif replay épinglé à l'observable réel 410 « révoqué » (is_active vérifié avant use_count dans 0181)
- [Phase 43]: config_session à étiquette unique — aucun compteur global en substitution de commande (sous-shell)
- [Phase 43]: householdId explicite sur create-ardoise du foyer B (households[0] sinon)
