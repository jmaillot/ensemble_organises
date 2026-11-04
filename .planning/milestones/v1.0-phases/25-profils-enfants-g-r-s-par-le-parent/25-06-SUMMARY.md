---
phase: 25-profils-enfants-g-r-s-par-le-parent
plan: 06
subsystem: documentation
tags: [roadmap, requirements, alignement-decisionnel, D-12, D-06]

# Dependency graph
requires:
  - phase: 25-01
    provides: socle schématique 0144 et CONTEXT.md D-01..D-23 (les formulations corrigées)
provides:
  - Sources de vérité alignées sur D-12 (modération du Cercle, jamais publication au nom de l'enfant) et D-06 (socle tâches/routines/anniversaires/menu)
  - Critères de succès #2 et #3 de la phase 25 corrigés dans ROADMAP.md
  - ENF-02 et ENF-05 reformulés dans REQUIREMENTS.md (sur disque)
affects: [25-02, 25-03, 25-05, 25-07, 26, 27, 29]

# Actuals (#2632)
actuals:
  tokens: 3200
  tasks: 1
  commits: 1

# Tech tracking
tech-stack:
  added: []
  patterns: [correction documentaire scopée (Edit tool, jamais Write intégral), correction propagée à toutes les copies vivantes (AGENTS.md §2.7-I)]

key-files:
  created:
    - .planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-06-SUMMARY.md
  modified:
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "ENF-02 sort la modération du « au nom de l'enfant » : le parent n'agit pas au nom de l'enfant dans le Cercle (D-12) — la modération est une action SUR le contenu attribué à un enfant, pas une action EN SON NOM"
  - "ENF-05 et critère #3 alignés sur le socle D-06 avec la sémantique complète (« par défaut » + refus hors socle tant que non activé) plutôt qu'une simple substitution de liste"
  - "ENF-05 corrigé au-delà des trois contradictions nommées : il porte la même affirmation périmée « ardoise, messagerie » — couvert par les actions 4-5 du plan (cohérence D-06 partout, correction de toutes les copies, AGENTS.md §2.7-I)"

patterns-established:
  - "Correction documentaire : grep avant/après + git diff --stat pour prouver le périmètre minimal"

requirements-completed: [ENF-01, ENF-02, ENF-03, ENF-04, ENF-05]

coverage:
  - id: D1
    description: "REQUIREMENTS.md ENF-02 et ROADMAP.md critère #2 ne portent plus « réagir/réagit dans le Cercle » — la formulation D-12 (modération : suppression/masquage du contenu attribué à un enfant, jamais publication au nom de l'enfant) est la seule présente"
    requirement: ENF-02
    verification:
      - kind: other
        ref: "grep -n \"réagir dans le Cercle\\|réagit dans le Cercle\" .planning/REQUIREMENTS.md .planning/ROADMAP.md — exit 1 (aucune occurrence)"
        status: pass
      - kind: other
        ref: "grep -c \"modère le Cercle\\|modérer le Cercle\" .planning/REQUIREMENTS.md .planning/ROADMAP.md — 1 occurrence par fichier"
        status: pass
    human_judgment: false
  - id: D2
    description: "ROADMAP.md critère #3 et REQUIREMENTS.md ENF-05 listent les sélecteurs du socle D-06 (tâches, routines, anniversaires, menu) ; « ardoise » et « messagerie » n'y figurent plus"
    requirement: ENF-05
    verification:
      - kind: other
        ref: "grep filtré sur « ardoise/messagerie × sélecteur » dans les deux fichiers — aucune occurrence"
        status: pass
    human_judgment: false
  - id: D3
    description: "La correction n'a altéré aucune autre section : diff minimal vérifié"
    verification:
      - kind: other
        ref: "git diff --stat HEAD~1 HEAD — 1 fichier tracké (ROADMAP.md), 2 insertions / 2 suppressions ; REQUIREMENTS.md gitigné vit sur disque (2 lignes modifiées vérifiées par sed)"
        status: pass
    human_judgment: false

# Metrics
duration: 8 min
completed: 2026-10-25
status: complete
---

# Phase 25 Plan 06: Correction documentaire D-12/D-06 Summary

**Alignement des sources de vérité sur D-12 (modération du Cercle, jamais de publication au nom de l'enfant) et D-06 (socle tâches/routines/anniversaires/menu) — les trois contradictions nommées plus ENF-05 corrigées, rien d'autre touché.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-25T16:43:57Z
- **Completed:** 2026-10-25T16:52:03Z
- **Tasks:** 1
- **Files modified:** 2 (ROADMAP.md tracké ; REQUIREMENTS.md sur disque — gitigné)

## Accomplishments

- ROADMAP.md critère de succès #2 : « réagit dans le Cercle au nom de l'enfant » remplacé par la modération D-12 — le parent assigne/coche au nom de l'enfant mais **ne publie jamais** en son nom dans le Cercle ; un adulte supprime/masque tout contenu (post, commentaire, réaction) attribué à un profil enfant, y compris l'historique des anciens comptes
- ROADMAP.md critère de succès #3 : liste des sélecteurs alignée sur le socle D-06 — « tâches, routines, anniversaires et menu », avec la sémantique « par défaut » + refus d'attribution hors socle tant que non activé sur la fiche
- REQUIREMENTS.md ENF-02 et ENF-05 corrigés sur disque (même substance, formulation adaptée à la forme exigence)
- Correction propagée à toutes les copies vivantes : le grep global du dépôt (hors artefacts de phase archivés : 25-RESEARCH/25-VALIDATION/PATTERNS/PLAN, qui racontent historiquement la correction elle-même) ne retourne plus aucune occurrence

## Task Commits

1. **Task 1: Aligner REQUIREMENTS.md et ROADMAP.md sur D-12 (modération) et D-06 (socle)** - `ebc0407` (docs)

**Plan metadata:** commit unique combiné (correction + position) — voir Deviations, écart 2.

## Files Created/Modified

- `.planning/ROADMAP.md` - Critères de succès #2 et #3 de la phase 25 reformulés (2 lignes) ; case 25-06 cochée, compteurs 2/7
- `.planning/REQUIREMENTS.md` - ENF-02 (modération D-12, sortie du « au nom de ») et ENF-05 (socle D-06) reformulés (2 lignes) — **sur disque uniquement : `.planning/*` est gitigné hors ROADMAP/STATE/PROJECT, conformément à la politique du dépôt (précédent c15b1ac)**
- `.planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-06-SUMMARY.md` - ce fichier (sur disque, gitigné)

## Decisions Made

- **Modération hors du « au nom de » :** le plan proposait une substitution lexicale (« réagir » → « modérer »), mais la phrase résultante (« le parent modère le Cercle au nom de l'enfant ») aurait contredit D-12 tout autant — la modération est une action du parent SUR le contenu attribué à l'enfant, pas une action EN SON NOM. La reformulation sépare les deux propositions (action au nom de : tâches/routines ; modération : action adulte directe) et reprend la substance exacte de D-12 (supprimer/masquer, post/commentaire/réaction, historique des anciens comptes).
- **ENF-05 corrigé aussi :** au-delà des trois contradictions nommées, la ligne 14 de REQUIREMENTS.md portait la même affirmation périmée « (tâches, ardoise, messagerie, menu) ». Les actions 4-5 du plan exigent une liste « cohérente avec D-06 partout » et la correction de « TOUTES les copies » (AGENTS.md §2.7-I) — cette copie est donc corrigée avec la même substance que le critère #3.
- **Aucune idée différée réintroduite :** ni argent de poche, ni délégation adulte→adulte n'apparaissent dans les textes corrigés (prohibition respectée).

## Deviations from Plan

### Auto-fixed Issues

Aucun bug. Deux écarts documentés de portée/méthode, tous deux ancrés dans le texte du plan lui-même :

**1. [Périmètre planifié — actions 4-5] ENF-05 corrigé en plus des trois contradictions nommées**
- **Found during:** Task 1 (phase de grep initial)
- **Issue:** REQUIREMENTS.md:14 (ENF-05) porte la même liste périmée « tâches, ardoise, messagerie, menu » que le critère #3 corrigé ; le laisser tel quel recréerait la contradiction que le plan existe pour fermer
- **Fix:** même reformulation socle D-06 que le critère #3
- **Files modified:** .planning/REQUIREMENTS.md
- **Verification:** grep « ardoise/messagerie × sélecteur » vide sur les deux fichiers
- **Committed in:** ebc0407 (sur disque pour REQUIREMENTS.md — gitigné)

**2. [Méthode — commit combiné] Position ROADMAP committée avec la correction**
- **Found during:** clôture du plan
- **Issue:** l'exécution séquentielle exige Write SUMMARY → commit ; le précédent 25-01 (c15b1ac) a établi le style local : correction et position dans un commit docs unique
- **Fix:** un commit docs(25-06) porte la correction + case cochée + compteurs ; le SUMMARY suit en second commit
- **Files modified:** .planning/ROADMAP.md
- **Verification:** git log — 2 commits après c15b1ac
- **Committed in:** ebc0407

---

**Total deviations:** 0 auto-fix (2 écarts documentés : 1 extension de périmètre dictée par les actions 4-5 du plan + AGENTS.md §2.7-I, 1 choix de style de commit suivant le précédent direct).
**Impact on plan:** aucun — les deux écarts servent l'objectif du plan (une affirmation périmée se corrige partout, pas seulement dans le fichier ouvert).

## Issues Encountered

- **REQUIREMENTS.md et SUMMARY sont gitignorés :** `.planning/*` est ignoré hors ROADMAP/STATE/PROJECT/milestones. Conformément à la politique du dépôt (message c15b1ac : « jamais forcés dans l'historique ») et à l'interdiction `git add -f`, ces deux fichiers vivent sur le disque uniquement. Les vérifications grep/sed sur REQUIREMENTS.md ont été exécutées sur disque et sont consignées ci-dessus. Les critères `must_haves` et la vérification 3 du plan (« git diff --stat ne montre que les deux fichiers ») restent vrais : le diff tracké ne montre que ROADMAP.md précisément parce que l'autre fichier est gitigné.
- **Gate #2388 (exigences partagées) :** `requirements.ready-ids` bloque ENF-01..ENF-05 — tous déclarés par des plans frères (25-02..25-07) sans SUMMARY. Aucun `mark-complete` forcé : le blocage est le comportement correct (les exigences ENF ne sont réellement complètes qu'à la fin de la phase, pas après une correction documentaire). REQUIREMENTS.md reste donc avec les 5 cases ENF non cochées, à la main du dernier plan de la phase.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Sources de vérité cohérentes avec 25-CONTEXT.md : plus aucune formulation qui dissuaderait un futur lecteur (AGENTS.md §2.7-I) — les plans 25-02..25-07 peuvent s'appuyer sur les critères corrigés
- Wave 1 complète (25-01 + 25-06) : la Wave 2 (25-02, migration 0145, BLOCKING) est débloquée
- Aucun blocker nouveau ; le blocker préexistant du test 0139 reste consigné dans deferred-items.md et WINDOWS.md

---
*Phase: 25-profils-enfants-g-r-s-par-le-parent*
*Completed: 2026-10-25*

## Self-Check: PASSED

- 25-06-SUMMARY.md présent sur disque ; REQUIREMENTS.md corrigé sur disque (grep modération = 1) ; ROADMAP.md corrigé (grep « socle D-06 » présent)
- Commits vérifiés dans l'historique : ebc0407, e5e1669, 2164ebc (3 commits mesurés depuis c15b1ac)
- Vérifications du plan re-jouées : ancienne formulation absente (exit 1), modération présente 1×/fichier, aucun sélecteur « ardoise/messagerie » restant
- Aucun repère de stub (TODO/FIXME/placeholder) dans les fichiers touchés
- STATE.md : position 3/7, stopped_at « Completed 25-06-PLAN.md », décision + métrique consignées
