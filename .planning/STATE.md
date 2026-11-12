---
gsd_state_version: "1.0"
milestone: v1.5
milestone_name: Audit complet & durcissement
current_phase: 45
current_phase_name: Audit sécurité/RLS
status: planning
stopped_at: Phase 45 context gathered
last_updated: "2026-11-12T10:21:20.339Z"
last_activity: 2026-11-12
last_activity_desc: Roadmap v1.5 créé (phases 45-52)
state_head: f70ca2b11d5ea9a87499faa592413283247bce5b
progress:
  total_phases: 8
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-12)

**Core value:** PWA foyers — l'app de poche du quotidien familial, fiable hors-ligne, joignable en un tap, sans store.
**Current focus:** Jalon v1.5 « Audit complet & durcissement » — 8 phases (45-52), audit-first-per-axis, fixes majeurs uniquement, aucune nouvelle fonctionnalité.

## Current Position

Phase: 45 (Audit sécurité/RLS)
Plan: —
Status: Ready to plan
Last activity: 2026-11-12 — Roadmap v1.5 créé (phases 45-52)

## Performance Metrics

- v1.1 : 4 phases, 25 plans, 17 tasks, 145 commits, audit tech_debt 16/16
- v1.2 : 2 phases, 5 plans, 6 exigences, audit tech_debt 6/6
- v1.3 : 5 phases (38-42), 12 exigences, 13 plans — audit tech_debt 10/12 (2 deferred : COLD-02, CACHE-01)
- v1.4 : 2 phases (43-44), 11 exigences — shipped 2026-11-12, CACHE-01 différée honnêtement
- v1.5 : 8 phases (45-52), 17 exigences (SEC, PERF, A11Y, QUA, TRA) — en cours

## Accumulated Context

### Decisions (this milestone)

- Ordre des phases = audit-first-per-axis avec ordre de dépendance : RLS d'abord (risque dominant, la fuite de données de foyer doit être clos avant toute autre correction) → fixes RLS → audit perf sur le schéma post-fixes → fixes perf → audit a11y sur les composants finaux → fixes a11y → audit qualité en dernier (revue finale des fixes eux-mêmes) → fixes qualité + closing.
- Ancre des exigences transverses : TRA-01 (seuil majeur-vs-moyen) et TRA-02 (vérificateurs prouvés sur cas qui échouent) mappées à la phase 45 — première SPEC d'audit qui pose le seuil et introduit les premiers lints pg-meta ; TRA-03 (chaîne §2.7 verte consignée) mappée à la phase 52 (closing). Chaque SPEC d'audit porte néanmoins son propre seuil et sa stop-list.
- Séparation audit/fix stricte : les phases audit sont read-only (artefacts dans `.planning/phases/`, gitignoré), les fixes sont atomiques par constat.
- Anti-features verrouillées (outbox, bandeau offline, SW, buster `v2`) verify-only : toute observation est consignée « verrouillé — hors périmètre », jamais traitée comme un constat (SEC-04).
- Outillage : lints pg-meta SQL purs via `psql.sh` stdin ; une seule devDependency (`@axe-core/playwright@4.14.0`) ; knip/oxlint/source-map-explorer one-shot jetables ; no-linter inchangé (recommandation écrite au pire) ; re-renders et duplications = revue humaine.
- Fixes SQL = migrations forward-only 0182+ uniquement ; `test-db.sh` obligatoire pour tout changement SQL ; les migrations appliquées ne sont jamais réécrites.

### Todos

- Rejouer GATE-01 (tests 32-UAT 7 et 35-UAT 2) lors de la prochaine mise en production naturelle — observatoire hors jalon.
- Purger à la main les 3 comptes e2e résiduels de runs antérieurs (e2e+1794223918703512-1/-2, e2e+1794223911703118-1).

### Blockers

- Aucun bloquant au démarrage du jalon — la phase 45 est read-only (stack Docker + accès SQL suffisent).

## Session Continuity

**Last session:** 2026-11-12T10:21:20.314Z
**Stopped at:** Phase 45 context gathered
**Resume file:** .planning/phases/45-audit-s-curit-rls/45-CONTEXT.md

- Roadmap v1.5 créé : 8 phases, 17 exigences mappées, couverture 17/17.
- Prochain pas : `/gsd-plan-phase 45` (recherche plus profonde recommandée pour la méthode d'exécution des tests négatifs des 83 tables).

## Operator Next Steps

- Review the roadmap, then run /gsd-plan-phase 45

## Deferred Items

Items inherited from previous milestone close (see .planning/milestones/ archives):

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| deferred | CACHE-01 (campagne on-device maxAge) | différé consigné 2026-11-12, protocole prêt | 2026-11-12 | v1.4 |
| deferred | COLD-02 (corrections profilées cold start) | session dédiée avec appareil au jalon suivant | 2026-11-10 | v1.3 |
| deferred | W2 (spec navigateur flux bridge ardoise) | conditionné à un seam client révélé | 2026-11-10 | v1.3 |
| observatoire | GATE-01 (re-test gate SW) | à la première utilisation observée | 2026-11-08 | v1.2 |
