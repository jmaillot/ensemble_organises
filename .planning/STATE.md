---
gsd_state_version: "1.0"
milestone: v1.3
milestone_name: Solde de la dette
status: planning
last_updated: "2026-11-08T12:00:00.000Z"
last_activity: 2026-11-08
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-08)

**Core value:** PWA foyers — l'app de poche du quotidien familial, fiable hors-ligne, joignable en un tap, sans store.
**Current focus:** Phase 38 — Filet de tests fiable

## Current Position

Phase: 38 (Filet de tests fiable) — not started
Plan: —
Status: Roadmap v1.3 créée, en attente d'approbation
Last activity: 2026-11-08 — Roadmap v1.3 créée (5 phases, 12 exigences, couverture 12/12)

## Performance Metrics

- v1.1 : 4 phases, 25 plans, 17 tasks, 145 commits, audit tech_debt 16/16
- v1.2 : 2 phases, 5 plans, 6 exigences, audit tech_debt 6/6
- v1.3 : 5 phases (38-42), 12 exigences — filet → outillage prod → ardoise → gate SW → cold start/cache

## Accumulated Context

### Decisions (this milestone)

- Roadmap v1.3 dérivée de l'ordre de recherche convergent (ARCHITECTURE §Suggested Build Order + PITFALLS) : filet de tests d'abord (tout le jalon en dépend pour prouver), outillage prod ensuite (comptes e2e réels servant l'ardoise), surface produit (ardoise), gate SW, instrumentation cold start en DERNIER (mesures invalidées par tout changement d'imports antérieur).
- Phase 40 (ardoise) exige une décision produit en discuss-phase AVANT plan-phase : parcours exact de conversion + réconciliation `invite:`→`membre:` transactionnelle ou refusée avec justification consignée.
- CACHE-01 tranchée avec les données du panneau diagnostic on-device (jamais l'émulateur) ; biais d'ordre connu : le maxAge influence le volume réhydraté mesuré — l'ordre instrumentation/décision sera consigné.
- Anti-features refusées : adhésion foyer implicite au clic, réactivation autoconfirm pour tests, gate SW en autoUpdate, maxAge global 30 jours.

### Todos

- Rejouer GATE-01 (tests 32-UAT 7 et 35-UAT 2) lors de la prochaine mise en production naturelle — observatoire hors jalon (GATE-PROD).

### Blockers

- Phase 42 : machine on-device requise pour les mesures cold start et la décision CACHE-01 (le protocole l'exige ; consigner si différé).
- Phase 40 : decision produit ardoise ouverte — passer `--discuss-phase` avant `--plan-phase`.

## Session Continuity

**Last session:** 2026-11-08T12:00:00.000Z
**Stopped at:** Roadmap v1.3 écrite — en attente d'approbation utilisateur
**Resume file:** None

- Roadmap v1.3 créée le 2026-11-08 par gsd-roadmapper (subagent /gsd-new-project).
- Prochain pas : approbation, puis `/gsd-plan-phase 38`.
- Exigences : TEST-01, TEST-03, DEBT-01 → Phase 38 ; SMOKE-01, TEST-02 → Phase 39 ; ARD-01..03 → Phase 40 ; GATE-01 → Phase 41 ; COLD-01, COLD-02, CACHE-01 → Phase 42 (traceability dans REQUIREMENTS.md).

## Decisions

- [v1.3]: Ordre des phases = dépendance de preuve, pas de code : chaque phase utilise le filet de tests fiable de la 38, la 40 utilise les comptes prod de la 39, la 42 instrumente un système stabilisé.
- [v1.3]: Phase 38 corrige la CLASSE entière des flakes dimanche (helpers centralisés `debutSemaineIso`/`jourSemaine`, tests paramétriques 7 jours) — jamais d'horloge figée.
