---
gsd_state_version: "1.0"
milestone: v1.5
milestone_name: Audit complet & durcissement
current_phase: 47
current_phase_name: Audit performance/requêtes
status: planning
stopped_at: Phase 46 complete, ready to plan Phase 47
last_updated: "2026-11-12T17:09:56.133Z"
last_activity: 2026-11-12
last_activity_desc: Phase 46 complete, transitioned to Phase 47
state_head: ee9af3738b78d1c1228f3ccc79a59d4fd935b36f
progress:
  total_phases: 8
  completed_phases: 2
  total_plans: 5
  completed_plans: 5
  percent: 25
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-12)

**Core value:** PWA foyers — l'app de poche du quotidien familial, fiable hors-ligne, joignable en un tap, sans store.
**Current focus:** Phase 47 — Audit performance/requêtes

## Current Position

Phase: 47 — Audit performance/requêtes
Plan: Not started
Status: Ready to plan
Last activity: 2026-11-12 — Phase 46 complete, transitioned to Phase 47

## Performance Metrics

- v1.1 : 4 phases, 25 plans, 17 tasks, 145 commits, audit tech_debt 16/16
- v1.2 : 2 phases, 5 plans, 6 exigences, audit tech_debt 6/6
- v1.3 : 5 phases (38-42), 12 exigences, 13 plans — audit tech_debt 10/12 (2 deferred : COLD-02, CACHE-01)
- v1.4 : 2 phases (43-44), 11 exigences — shipped 2026-11-12, CACHE-01 différée honnêtement
- v1.5 : 8 phases (45-52), 17 exigences (SEC, PERF, A11Y, QUA, TRA) — en cours

**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 45 P01 | 6 min | 3 tasks | 12 files |
| Phase 45 P02 | 13min | 3 tasks | 13 files |
| Phase 45 P03 | 105min | 3 tasks | 3 files |
| Phase 46 P01 | 15m | 4 tasks | 3 files |

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

**Last session:** 2026-11-12T17:01:40.892Z
**Stopped at:** Phase 46 complete, ready to plan Phase 47
**Resume file:** None

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

## Decisions

- [Phase 45]: Périmètre de schémas de l'audit tranché (A2) — Matrice et lints sur public (exposé API) ; lint 0011 sur toutes les fonctions SECURITY DEFINER quel que soit le schéma ; private.* hors matrice avec couverture indirecte par ses helpers (colonne statut D-07) ; auth/storage/extensions exclus sauf politiques storage écrites par nos migrations
- [Phase 45]: Provenance officielle des lints : dépôt supabase/splinter tag 2026.09.1 — supabase/postgres-meta supposé par RESEARCH.md ne contient aucune règle de lint ; splinter est la source citée par la doc officielle du database linter — provenance D-09 satisfaite
- [Phase 45]: auth.uid() lit request.jwt.claims — fixture JWT 0002 utilisable telle quelle — Preuve pg_get_functiondef datée 2026-11-12T11:09:12Z dans 45-AUDIT.md ; aucun changement requis dans le traversant du plan 03
- [Phase 45]: Lints pg-meta versionnés avec périmètre public explicite (SPEC §3) et motif 0015 adapté au dé-parse jwt() non qualifié (§2.7-D.6)
- [Phase 45]: 45-03 : racines households/members/profiles sondées par négatifs escalade + tests dédiés 0007 (sondes destructrices remplacées)
- [Phase 45]: 45-03 : 6 tables zéro-grant classées couverture indirecte — preuve par refus systématique + information_schema (SEC-45-02 reclasse mineur, verrouillé)
- [Phase 45]: 45-03 : birthdays.contact_id NULL dans le traversant — le déclencheur 0097 mirror_contact_birthday effaçait la fixture portant un contact_id
- [Phase 45]: 45-04 : 16/16 Edge Functions cohérentes — aucun mismatch mode déclaré vs comportement, aucune fonction en mode none ; secrets HMAC dédiés par fonction de partage, jamais réutilisés
- [Phase 45]: 45-04 : 3 buckets Storage tous privés — politiques portées par helpers private.* sur le chemin de foyer ; 212 helpers SECURITY DEFINER, 0 search_path mutable ; 1 seule fonction SD exécutable par anon (preview_household_invite_token, lecture seule)
- [Phase 45]: 45-04 : rapport consolidé — 2 fiches mineures (SEC-45-01 backlog, SEC-45-02 verrouillé), aucune fiche majeure ; audit secrets par noms/canaux, aucune valeur suivie par git
- [Phase 46]: SEC-03 clôturée par preuve d'absence datée du jour — zéro fiche majeure, zéro commit applicatif (D-01/D-04)
- [Phase 46]: SEC-45-01 au backlog (lint 0006 = 10 lignes reconfirmé) — fix = fusion politiques permissives, migration forward-only 0182+, candidat phase 52 (D-02/D-03)
- [Phase 46]: Régime git .planning/* gitigné (.gitignore:86) prévaut sur « commité » de D-06 — preuve par le contenu, jamais git add -f (A3 résolu)
- [Phase 46]: SEC-03 clôturée par preuve d'absence datée du jour — zéro fiche majeure, zéro commit applicatif (D-01/D-04)
- [Phase 46]: SEC-45-01 au backlog (lint 0006 = 10 lignes reconfirmé) — fix = fusion politiques permissives, migration forward-only 0182+, candidat phase 52 (D-02/D-03)
- [Phase 46]: Régime git .planning/* gitigné (.gitignore:86) prévaut sur « commité » de D-06 — preuve par le contenu, jamais git add -f (A3 résolu)
