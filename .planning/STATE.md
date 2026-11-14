---
gsd_state_version: "1.0"
milestone: v1.5
milestone_name: Audit complet & durcissement
current_phase: 51
current_phase_name: Audit qualité transverse
status: executing
stopped_at: Completed 51-04-PLAN.md (plan 4/5)
last_updated: "2026-11-14T08:52:00Z"
last_activity: 2026-11-14
last_activity_desc: Plan 51-04 (revue modules) terminé
state_head: 5a3295ee532fec84ca661722ebeb0a3a87338683
progress:
  total_phases: 8
  completed_phases: 6
  total_plans: 25
  completed_plans: 24
  percent: 96
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-13)

**Core value:** PWA foyers
**Current focus:** Phase 51 — Audit qualité transverse

## Current Position

Phase: 51 (Audit qualité transverse) — EXECUTING
Plan: 5 of 5
Status: Ready to execute (plan 51-05 restant)
Last activity: 2026-11-14 — Plan 51-04 (revue modules) terminé — couverture roadmap critère 1 atteinte côté modules

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
| Phase 48 P01 | 35 min | 3 tasks | 1 files |
| Phase 48 P02 | 75 min | 3 tasks | 4 files |
| Phase 48 P03 | 25 min | 3 tasks | 2 files |
| Phase 49 P01 | 6 min | 2 tasks | 2 files |
| Phase 49 P02 | 35 min | 2 tasks | 3 files |
| Phase 49 P03 | 60 min | 3 tasks | 1 files (+6 preuves brut/) |
| Phase 50 P01 | 6 min | 2 tasks | 1 files |
| Phase 50 P02 | 4 min | 3 tasks | 1 files |
| Phase 50 P03 | ~20 min (session interrompue, reprise) | 3 tasks | 3 files |
| Phase 50 P04 | 20 min | 3 tasks | 2 files |
| Phase 50 P05 | 85 min | 3 tasks | 2 files |
| Phase 50 P06 | 10 min | 2 tasks | 2 files |
| Phase 51 P01 | 5 min | 3 tasks | 5 files |
| Phase 51 P02 | 60 min | 3 tasks | 1 file (+journal brut/) |
| Phase 51 P03 | ~2h | 4 tasks | 1 file |
| Phase 51 P04 | ~4h | 3 tasks | 1 file (51-AUDIT.md, 412 l.) |

## Accumulated Context

### Decisions (this milestone)

- Ordre des phases = audit-first-per-axis avec ordre de dépendance : RLS d'abord (risque dominant, la fuite de données de foyer doit être clos avant toute autre correction) → fixes RLS → audit perf sur le schéma post-fixes → fixes perf → audit a11y sur les composants finaux → fixes a11y → audit qualité en dernier (revue finale des fixes eux-mêmes) → fixes qualité + closing.
- Ancre des exigences transverses : TRA-01 (seuil majeur-vs-moyen) et TRA-02 (vérificateurs prouvés sur cas qui échouent) mappées à la phase 45 — première SPEC d'audit qui pose le seuil et introduit les premiers lints pg-meta ; TRA-03 (chaîne §2.7 verte consignée) mappée à la phase 52 (closing). Chaque SPEC d'audit porte néanmoins son propre seuil et sa stop-list.
- Séparation audit/fix stricte : les phases audit sont read-only (artefacts dans `.planning/phases/`, gitignoré), les fixes sont atomiques par constat.
- Anti-features verrouillées (outbox, bandeau offline, SW, buster `v2`) verify-only : toute observation est consignée « verrouillé — hors périmètre », jamais traitée comme un constat (SEC-04).
- Outillage : lints pg-meta SQL purs via `psql.sh` stdin ; une seule devDependency (`@axe-core/playwright@4.14.0`) ; knip/oxlint/source-map-explorer one-shot jetables ; no-linter inchangé (recommandation écrite au pire) ; re-renders et duplications = revue humaine.
- Harnais axe (49-02) : collecte sans échec (D-04), aucune assertion sur les violations ; exports étiquetés avec les règles exécutées (passes+inapplicable) pour prouver que `target-size` a tourné ; tiroir mobile scanné sur l'app-shell seul (le pré-écran /foyer/rejoindre n'a ni barre basse ni tiroir) ; 3 échecs vitest pré-existants en calendrier-page.test.tsx (vérifiés sur HEAD~1), hors périmètre read-only.
- Fixes SQL = migrations forward-only 0182+ uniquement ; `test-db.sh` obligatoire pour tout changement SQL ; les migrations appliquées ne sont jamais réécrites.
- Phase 50 P06 (classement D-06) : zéro bloquant nouveau — critère 4 VRAI, prouvé par 18 scans finaux à règles par défaut (≥ 89 règles incl. target-size) ; 47 nœuds restants = 8 allowlistés A11Y-49-10 (faux positif d'animation) + 39 informatifs A11Y-49-05 hérités vers QUA-04, aucun fix opportuniste.

### Todos

- Rejouer GATE-01 (tests 32-UAT 7 et 35-UAT 2) lors de la prochaine mise en production naturelle — observatoire hors jalon.
- Purger à la main les 3 comptes e2e résiduels de runs antérieurs (e2e+1794223918703512-1/-2, e2e+1794223911703118-1).

### Blockers

- Aucun bloquant au démarrage du jalon — la phase 45 est read-only (stack Docker + accès SQL suffisent).

## Session Continuity

**Last session:** 2026-11-14T08:52:00Z
**Stopped at:** Completed 51-04-PLAN.md (plan 4/5)
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

- [Phase 49]: 49-SPEC verrouillée (49-01) — seuil hérité par citation de 45-SPEC §1 avec transposition §2.6→§6 (D-12) ; stop-list fermée 7 entrées (4 surfaces 45-SPEC §2 + photo-overlay D-07 + démo + rôle enfant D-06) ; classification bloquant/informatif/design-verrouillé (phase 50 / QUA-04 / verify-only) ; `withRules(['target-size'])` obligatoire sur chaque scan + 2 hypothèses flaggées énoncées (D-13/D-14)

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
- [Phase 48]: Fix PERF-47-09 : helper privé ardoise_settlement_data lit les soldes UNE fois (boucle recopiée — simplify garde sa signature (text) pour 0018)
- [Phase 48]: 48-03 : aucun memo posé — aucun majeur re-renders au seuil TRA-01 (ligne « Alimente le plan 48-03 : aucune ») ; PERF-03 clôturée par le fix SQL 48-02 ; éligibilité de démonstration courses : props instables (handlers inline non useCallback, Pitfall 6)
- [Phase 49]: 49-03 — une seule fiche bloquant (A11Y-49-01 : cibles < 44 px des pages publiques /connexion et /foyer/rejoindre, règle AGENTS.md §6, preuve de mesure datée) ; 7 fiches informatif → backlog QUA-04 ; 1 design-verrouillé (faux positif d'animation prouvé par re-mesure + D-07)
- [Phase 49]: 49-03 — découverte : `withRules(['target-size'])` LIMITE axe à cette règle (les 18 exports du plan 02 n'ont pas fait tourner les règles par défaut) ; scans complémentaires à règles par défaut exécutés par 49-03 (20 scans, 89–90 règles chacun) — correction du harnais reportée phase 50 (read-only)
- [Phase 50]: Correction du harnais axe par options.rules (règles WCAG 2.2 réactivées sans limiter les règles par défaut) — withRules/withTags LIMITENT l'analyse — Doc officielle axe-core-npm : withRules comme withTags restreignent l'analyse ; seule options({rules:{...enabled:true}}) réactive target-size en conservant les 89–90 règles par défaut. Limite L1 de 49-AUDIT corrigée sans nouveau withRules.
- [Phase 50]: Fix A11Y-49-02 par focus-visible:outline-solid ajouté à outline-none dans la classe de base partagée input.tsx — une seule classe réparant tous les formulaires (§2.7-E), preuve rouge→vert par getComputedStyle
- [Phase 50]: Fix A11Y-49-07 par piste (b) — miroir aria-hidden Radix sur le skip-link (MutationObserver sous-arbre body, closest depuis le skip-link : Radix marque les descendants individuels, pas la racine du shell) ; le piège de focus Radix intercepte Tab donc la preuve rouge exige axe sous voile, la navigation seule est verte avant fix
- [Phase 50]: Classement D-06 scans finaux : zero bloquant nouveau, critere 4 VRAI (47 noeuds restants : 8 allowlistes A11Y-49-10 faux positif animation, 39 informatifs A11Y-49-05 herites vers QUA-04) — 18 exports a regles par defaut (>=89 incl. target-size) prouvent le critere 4 ; aucun fix opportuniste (D-06)
- [Phase 51]: 51-01 : SPEC verrouillée (seuil cité 45-SPEC §1, stop-list D-11 à 9 entrées, versions épinglées knip@6.45.1 / oxlint@1.93.0, listes fermées datées — 23 répertoires modules ≠ 24 de RESEARCH, 21 fichiers data/ ≠ 20) — Les compteurs de prose divergent du disque (Pitfall 4) ; le ls daté fait foi pour les plans 02-05
- [Phase 51]: 51-01 : quatre câblages invisibles prouvés à l'exécution (CABL-51-01..04) — test-db.sh 105 fichiers tous verts le 2026-11-14, cron.job 14 jobs sans secret + 50548 runs réussis, deploy-functions --list 16 fonctions, Dexie câblé au barrel data/index.ts avec 10 suites contrat — Docker disponible → preuve réelle (D-10), jamais grep seul ; toute fiche de code mort des plans 02-04 citera ces fiches (D-03)
- [Phase 51]: 51-01 : instruments one-shot tournés sans rien persister — knip 306 lignes de pistes en brut/, oxlint 0 erreur / warnings seulement, garde no-eslint-directive verte (3 passed) ; pistes NON classées (triage D-03 au plan 02) — D-07/D-08 : npx épinglé jetable, aucune devDependency ; knip jamais preuve primaire
- [Phase 51]: 51-04 : aucune nouvelle fiche QUA-51-07+ — code mort voyages `useVoyages().remove` rattaché à la surface QUA-51-06 existante (grep daté 08:37Z, câblages D-09 cités) ; observations sous le seuil consignées au journal sans fiche (messages media_url TTL 30 j, prestataires prose guide, notes color-column, recettes anglicismes/label invité, routines/taches libellés, voyages typo+nuance guide)
- [Phase 51]: 51-04 : couverture modules complète (22 relus + documents verrouillé D-11 + racines) — journal Axe 4 en 3 sections, écriture incrémentale, `git status --porcelain app/` vide après chaque tâche ; critère de réussite 1 roadmap (transverse + modules) atteint
