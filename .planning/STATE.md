---
gsd_state_version: "1.0"
milestone: v1.4
milestone_name: Preuve & décision
current_phase: 43
current_phase_name: Preuve prod du bridge ardoise (W1)
status: verifying
stopped_at: Completed 43-01-PLAN.md (runs 9+10 verts, idempotence prouvée)
last_updated: "2026-11-11T12:45:59.900Z"
last_activity: 2026-11-11
last_activity_desc: Phase 43 execution started
state_head: d7c910edb52d8876c6f9b54df71ebe549a851070
progress:
  total_phases: 2
  completed_phases: 0
  total_plans: 1
  completed_plans: 1
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-11)

**Core value:** PWA foyers — l'app de poche du quotidien familial, fiable hors-ligne, joignable en un tap, sans store.
**Current focus:** Phase 43 — Preuve prod du bridge ardoise (W1)

## Current Position

Phase: 43 (Preuve prod du bridge ardoise (W1)) — EXECUTING
Plan: 1 of 1
Status: Phase complete — ready for verification
Last activity: 2026-11-11 — Phase 43 execution started

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
- Vérifier au plan-phase 43 : présence d'un job pg_cron sur le chemin bridge (sonde `net._http_response` hors sujet si jambes curl directes) ; colonnes max_uses/expiry sur la table pont 0180 (ne pas supposer, §2.7 I).

### Blockers

- Phase 44 : machine on-device (appareil de référence) requise pour la campagne N=5 et toute décision maxAge — tant qu'elle manque, travail préparatoire seul (relecture des tolérances §5, vérification `inspectPersistedCache`), différé consigné honnêtement si report, jamais de valeur inventée.

## Session Continuity

**Last session:** 2026-11-11T12:45:59.873Z
**Stopped at:** Completed 43-01-PLAN.md (runs 9+10 verts, idempotence prouvée)
**Resume file:** None

- Roadmap v1.4 créée le 2026-11-11 par gsd-roadmapper (subagent /gsd-new-project).
- Prochain pas : approbation, puis `/gsd-plan-phase 43`.
- Exigences : PROOF-01..07 → Phase 43 ; CACHE-01..04 → Phase 44 (traceability dans REQUIREMENTS.md).

## Operator Next Steps

- Approuver la roadmap, puis `/gsd-plan-phase 43`

## Decisions

- [Phase 43]: Négatif replay épinglé à l'observable réel 410 « révoqué » (is_active vérifié avant use_count dans 0181)
- [Phase 43]: config_session à étiquette unique — aucun compteur global en substitution de commande (sous-shell)
- [Phase 43]: householdId explicite sur create-ardoise du foyer B (households[0] sinon)
