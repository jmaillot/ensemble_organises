---
gsd_state_version: "1.0"
milestone: v1.2
milestone_name: Finition de la dette offline
current_phase: 37
current_phase_name: Filet de tests fiable
status: executing
stopped_at: Completed 37-02-PLAN.md — TEST-03 différé (e2e 2 comptes réels, checkpoint skip)
last_updated: "2026-11-07T20:24:55.719Z"
last_activity: 2026-11-07
last_activity_desc: Phase 37 execution started
state_head: 49829ea0371a36848445ebb8e27d150f00a45e4b
progress:
  total_phases: 2
  completed_phases: 1
  total_plans: 4
  completed_plans: 4
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-07)

**Core value:** PWA foyers — l'app de poche du quotidien familial, fiable hors-ligne, joignable en un tap, sans store.
**Current focus:** Phase 37 — Filet de tests fiable

## Current Position

Phase: 37 (Filet de tests fiable) — EXECUTING
Plan: 2 of 2
Status: Plans exécutés — TEST-03 en attente d'identifiants réels (dette assumée)
Last activity: 2026-11-07 — plan 37-02 terminé, TEST-03 différé au checkpoint

**Progress bar:**

```
[■■■■■■■■■■] Phase 36 (Outbox) + Phase 37 (Filet de tests) plans 2/2 — TEST-03 en attente d'identifiants réels
```

## Performance Metrics

- v1.1 : 4 phases, 25 plans, 17 tasks, 145 commits, audit tech_debt 16/16
- v1.2 : 2 phases planifiées, 6 exigences, dette/fiabilité uniquement (zéro nouvelle surface produit hors messages d'échec outbox)

**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 37 P01 | 6 min | 3 tasks | 4 files |
| Phase 37 P02 | ~25 min | 3 tasks (T3 différée) | 2 files |

## Accumulated Context

### Decisions (this milestone)

- Jalon volontairement 100 % dette : pas de phase de features, deux phases seulement (OBOX, TEST) — la granularité naturelle du travail.
- GATE-01 (gate SW runtime) hors jalon : observatoire événementiel lié au prochain déploiement naturel, pas planifiable. Consigné dans ROADMAP (Deferred) et REQUIREMENTS (Future).
- CACHE-01 (maxAge 24 h) et matrice iOS : hors jalon assumé (voir PROJECT.md).
- Phase 36 : le toast d'échec terminal D-12 est retiré — le badge est l'unique signal actif, le panneau l'unique canal de détail (36-02).
- Phase 36 : libellés d'échec dérivés d'un catalogue code→famille→libellé dans `outbox.ts`, jamais d'un message PostgREST brut (36-01).

### Todos

- Rejouer GATE-01 (tests 32-UAT 7 et 35-UAT 2) lors de la prochaine mise en production — hors cycle de ce jalon.

### Blockers

- e2e offline-shared-device (TEST-03) : nécessite 2 comptes réels avec données Tier 1 — différé au checkpoint du plan 37-02 ; véhicule de re-test prêt (spec étendu plan 37-01), skip conditionnel D-04 conservé. Planifier la disponibilité de l'humain.
- Flocon sibling household-store WR-03 (household-store.test.ts:331) : échoue ~1–2/243 sous charge parallèle, vert en isolation — découvert en clôture 37-02, hors périmètre phase 37 ; consigné dans deferred-items.md de la phase 37. Traitement suggéré : même recette que TEST-01.
- ⚠️ [Phase 36] 2 échecs e2e préexistants « rejoindre un foyer / format du token » (prouvés sur baseline b02e0a0) — consignés dans `deferred-items.md` de la phase 36 ; à traiter en phase 37 (filet de tests).

## Session Continuity

**Last session:** 2026-11-07T20:24:55.685Z
**Stopped at:** Completed 37-02-PLAN.md — TEST-03 différé (e2e 2 comptes réels, checkpoint skip)
**Resume file:** None

- Roadmap v1.2 créée le 2026-11-07 par gsd-roadmapper (subagent /gsd-new-project).
- Prochain pas : `/gsd-plan-phase 36`.
- Exigences : OBOX-01, OBOX-02 → Phase 36 ; TEST-01..04 → Phase 37 (traceability dans REQUIREMENTS.md).

## Decisions

- [Phase 37]: TEST-04 : purgerStockageSession() (clé GoTrue + chunks, dérivation cleStockageSession D-07) branchée au chokepoint signOut après les purges disque/mémoire ; preuve rouge-avant-vert D-09 capturée
- [Phase 37]: TEST-01 : flocon test D (~1/367) traité par waitFor à options explicites { timeout: 5_000, interval: 50 } bornées au seul test D — jamais de tolérance globale dans vite.config.ts (D-01, b0c9c3d)
- [Phase 37]: TEST-03 différé assumé : e2e offline-shared-device non exécuté faute de 2 comptes réels — aucune credential inventée, skip conditionnel D-04 conservé, dette tracée dans REQUIREMENTS/RETROSPECTIVE (checkpoint plan 37-02)
