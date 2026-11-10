---
gsd_state_version: "1.0"
milestone: v1.3
milestone_name: Solde de la dette
current_phase: 41
current_phase_name: Gate SW simulable
status: executing
stopped_at: Completed 41-01-PLAN.md
last_updated: "2026-11-10T08:59:36.568Z"
last_activity: 2026-11-10
last_activity_desc: Phase 41 execution started
state_head: 9b99cbf3f84a11f3c41df19677e0d23b178ea1c3
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 10
  completed_plans: 9
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-08)

**Core value:** PWA foyers — l'app de poche du quotidien familial, fiable hors-ligne, joignable en un tap, sans store.
**Current focus:** Phase 41 — Gate SW simulable

## Current Position

Phase: 41 (Gate SW simulable) — EXECUTING
Plan: 1 of 1
Status: Executing Phase 41
Last activity: 2026-11-10 — Phase 41 execution started

## Performance Metrics

- v1.1 : 4 phases, 25 plans, 17 tasks, 145 commits, audit tech_debt 16/16
- v1.2 : 2 phases, 5 plans, 6 exigences, audit tech_debt 6/6
- v1.3 : 5 phases (38-42), 12 exigences — filet → outillage prod → ardoise → gate SW → cold start/cache

**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 38 P01 | 14min | 3 tasks | 5 files |
| Phase 38 P02 | 80min | 3 tasks | 2 files |
| Phase 38 P03 | 25m | 3 tasks | 2 files |
| Phase 38 P04 | 25min | 2 tasks | 1 files |
| Phase 39 P39-01 | 70m | 3 tasks | 3 files |
| Phase 39 P39-02 | 30m | 3 tasks | 4 files |
| Phase 40 P01 | 3h | 3 tasks | 8 files |
| Phase 40 P02 | 1h30 | 3 tasks | 2 files |
| Phase 40 P03 | 1h15 | 3 tasks | 5 files |
| Phase 41 P01 | 12m | 3 tasks | 8 files |

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

**Last session:** 2026-11-10T08:59:36.516Z
**Stopped at:** Completed 41-01-PLAN.md
**Resume file:** None

- Roadmap v1.3 créée le 2026-11-08 par gsd-roadmapper (subagent /gsd-new-project).
- Prochain pas : approbation, puis `/gsd-plan-phase 38`.
- Exigences : TEST-01, TEST-03, DEBT-01 → Phase 38 ; SMOKE-01, TEST-02 → Phase 39 ; ARD-01..03 → Phase 40 ; GATE-01 → Phase 41 ; COLD-01, COLD-02, CACHE-01 → Phase 42 (traceability dans REQUIREMENTS.md).

## Decisions

- [v1.3]: Ordre des phases = dépendance de preuve, pas de code : chaque phase utilise le filet de tests fiable de la 38, la 40 utilise les comptes prod de la 39, la 42 instrumente un système stabilisé.
- [v1.3]: Phase 38 corrige la CLASSE entière des flakes dimanche (helpers centralisés `debutSemaineIso`/`jourSemaine`, tests paramétriques 7 jours) — jamais d'horloge figée.
- [Phase 38]: Prédicat de la garde semaine paramétré par l'ancrage : le cas rouge du plan (jourSemaine(debutSemaineIso('2026-11-08'),1)) tombait DANS la semaine courante et ne prouvait rien ; la forme réelle du défaut (day(1) d'un dimanche = 2026-11-09, dates figées) est utilisée à la place. — Un cas-qui-doit-échouer qui ne peut pas échouer est une tautologie (§2.7 D.3) ; l'ancrage figé rend la preuve indépendante du jour d'exécution.
- [Phase 38]: Correction test-only des deux flocons timing du fichier household-store (protocole W-02) : WR-03 attend un etat via vi.waitFor au lieu d'un sommeil fixe de 1200 ms, harnais D-17 rendu fidele au contrat temporel de production (delegation synchrone des espions). — La reproduction 1/30 a frappe le test frere D-17, pas WR-03 accuse : sans reproduction avant fix, la correction WR-03 serait passee pour la guerison d'un mal qu'elle ne soignait pas. Un harnais qui delegue asynchronement a ce qui est synchrone en production ment sur la fenetre de course.
- [Phase 38]: Bornage IN-02 par expense_id (.in) car expense_participants n'a pas de household_id (migration 0004) — borne = besoin réel du consommateur ; aucun SQL touché, test-db.sh non requis (I-03)
- [Phase 38]: Signature e2e phase 38 consignée (38-E2E-SIGNATURE.md) : 165 passed / 9 skipped / 1 seul test rouge (join-token l.134 chromium+mobile, J-01, soldé en 39 via TEST-02) ; 8 skips préexistants datés par preuve git comme baseline légitime. — Un rouge documenté noir sur blanc reste une absence affirmée, pas un silence ; le baseline de skips daté par git log -S empêche toute confusion future avec un skip introduit.
- [Phase 39]: Wrapper test-join-token-real.sh routé par testIgnore sur E2E_BASE_URL (Rule 3, JT-01) — la spec réelle vit dans son run séparé, le run standard reste vert
- [Phase 39]: Secret SUPABASE_SECRET_KEY ne circule que via curl -K 0600 dans lib-smoke-accounts.sh (T-39-01/07) ; jamais en argv ni en env exportée
- [Phase 40]: 40-01: remplissage du pont d'identité descendu dans le RPC (0180b) — PostgREST n'expose pas private.*
- [Phase 40]: 40-02: fusion = report de part (trigger différé somme=montant) ; réconciliation aussi en already_member ; vocabulaire réel 'guest'
- [Phase 40]: 40-03: ConfirmDialog icon rétro-compatible (users pour l'adhésion) ; copy « rattachée au compte » ; e2e = backstop de l'atterrissage RTL
- [Phase 41]: Harnais e2e gate SW flag-compilé (VITE_E2E_SW_HARNESS), file écrite via enqueueOutbox sur le queryClient — jamais réimplémentée
- [Phase 41]: Attente d'état nommé : worker A « activated » avant tout reload de commutation (sans lui le build B s'active directement, aucun bandeau)
