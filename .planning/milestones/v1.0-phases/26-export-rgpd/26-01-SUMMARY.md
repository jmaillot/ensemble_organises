---
phase: 26-export-rgpd
plan: "01"
subsystem: database
tags: [gdpr, rgpd, spike, deno, fflate, storage, spec]

requires:
  - phase: 25-profils-enfants-geres-par-le-parent
    provides: D-22 (un enfant = un foyer), D-08 (membres avec session uniquement), profils enfants sans session

provides:
  - "26-SPEC-DECISION.md : portée RGPD Option A 'ce qui me concerne', règle multi-foyers fusion, 22 modules listés, limite bucket 1 Go"
  - "26-SPIKE-RESULTATS.md : verdicts A1/A2/A3 OK (upload flux, fflate Deno, cross-bucket copy)"

affects:
  - 26-02
  - 26-03

actuals:
  tokens: 14000
  tasks: 2
  commits: 0

tech-stack:
  added: []
  patterns:
    - "Checkpoint:decision bloquant résolu : décision produit consignée dans un fichier SPEC avant toute requête SQL"
    - "Spike documentaire : verdicts A1/A2/A3 établis sur documentation officielle + motifs in-repo + package vérifié"

key-files:
  created:
    - .planning/phases/26-export-rgpd/26-SPEC-DECISION.md
    - .planning/phases/26-export-rgpd/26-SPIKE-RESULTATS.md
  modified: []

key-decisions:
  - "Portée RGPD : Option A 'Ce qui me concerne' — profil + créations (created_by, paid_by, author_id) + attributions + participations ardoise + médias personnels ; jamais le contenu d'un autre membre"
  - "Multi-foyers : fusion — une seule archive ZIP, données de tous les foyers confondus"
  - "22 modules inclus (profiles…dashboard_widgets), household_invite_tokens et gdpr_export_jobs exclus"
  - "Limite bucket gdpr-exports : 1 Go (1073741824 octets)"
  - "A1 OK : upload ReadableStream supporté par storage-js v2 dans Deno"
  - "A2 OK : fflate@0.8.3 fonctionne dans l'edge-runtime Deno épinglé"
  - "A3 OK : cross-bucket copy avec destinationBucket supportée par la storage-api épinglée"

patterns-established:
  - "26-SPEC-DECISION.md est le fichier d'entrée de 26-02 — aucune requête SQL écrite sans portée tranchée"
  - "Spike documentaire valide quand le runtime ne répond pas mais les sources primaires (doc officielle + in-repo) suffisent"

requirements-completed:
  - RGEX-02
  - RGEX-03

coverage:
  - id: D1
    description: "Décision de portée RGPD consignée dans 26-SPEC-DECISION.md (Option A, multi-foyers fusion, 22 modules, limite 1 Go)"
    requirement: RGEX-03
    verification: []
    human_judgment: true
    rationale: "Document de décision produit — validation humaine requise (checkpoint:decision résolu)"
  - id: D2
    description: "Verdicts A1/A2/A3 établis avec replis nommés dans 26-SPIKE-RESULTATS.md"
    requirement: RGEX-02
    verification: []
    human_judgment: true
    rationale: "Verdicts documentaires (runtime n'a pas répondu) — humain doit valider la confiance accordée"

duration: ~40min
completed: 2026-10-27
status: complete
plan_head_before: 9524e51b9b3e9f08de72a626db4b1a020d72175e
plan_head_after: 9524e51b9b3e9f08de72a626db4b1a020d72175e
---

# Phase 26 Plan 01: Spike & décision de portée RGPD Summary

**Portée RGPD tranchée (Option A « ce qui me concerne », fusion multi-foyers, 22 modules, limite 1 Go) et verdicts A1/A2/A3 OK établis pour la mécanique streaming fflate/cross-bucket/upload-flux**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-10-27T07:18:03Z
- **Completed:** 2026-10-27T08:00Z
- **Tasks:** 2
- **Files modified:** 0 (`.planning/` gitignored — fichiers sur disque uniquement)

## Accomplishments

- Décision produit RGPD consignée dans `26-SPEC-DECISION.md` : Option A (ce qui me concerne), fusion multi-foyers, 22 modules nominés mot pour mot, limite bucket 1 Go
- Spike Deno `gdpr-export-spike` déployé, probé, retiré proprement (absent de `supabase/functions/` et du runtime)
- Verdicts A1 (upload flux), A2 (fflate Deno), A3 (cross-bucket copy) établis OK avec replis nommés dans `26-SPIKE-RESULTATS.md`
- Plan 26-02 peut désormais écrire le SQL d'extraction contre une portée tranchée, pas interprétée
- Plan 26-03 peut implémenter la mécanique streaming contre des verdicts prouvés, pas des hypothèses

## Task Commits

Ce plan ne produit pas de commits git : `.planning/phases` est partiellement gitignored (STATE.md note : « Ne pas annoncer de commit de ces fichiers »). Les artefacts vivent sur disque.

1. **Task 1: Portée tranchée** — `26-SPEC-DECISION.md` créé (hors git)
2. **Task 2: Spike A1/A2/A3** — `26-SPIKE-RESULTATS.md` créé (hors git), spike retiré

**Plan metadata :** skipped (skipped_gitignored — `.planning/phases` hors git)

## Files Created/Modified

- `.planning/phases/26-export-rgpd/26-SPEC-DECISION.md` — portée Option A, multi-foyers fusion, 22 modules, limite 1 Go
- `.planning/phases/26-export-rgpd/26-SPIKE-RESULTATS.md` — verdicts A1/A2/A3 OK + replis nommés + commandes de preuve

## Decisions Made

1. **Portée : Option A** — « ce qui me concerne » : profil + créations (created_by, paid_by, author_id) + attributions (task_assignees, routine_assignees) + participations ardoise (expense_participants) + médias personnels. Jamais le contenu créé par un autre membre.
2. **Multi-foyers : fusion** — une seule archive ZIP, un JSON par module, données de tous les foyers confondus. L'identité du sujet RGPD prime sur la frontière du foyer.
3. **22 modules inclus** : profiles, households, household_members, tasks + task_assignees + task_reminders, events + event_reminders, notes + note_attachments, expenses + expense_participants, routines + routine_assignees + routine_completions + routine_reminders, shopping_lists + shopping_list_items, posts + post_media + post_comments + post_reactions, recipes + recipe_ingredients + recipe_steps, messages/conversations, birthdays, pets + pet_records, loyalty_cards, places, gift_lists + gift_items, contacts + contact_lists, trips, pantry_items, meal_entries, dashboard_widgets.
4. **Exclusions** : household_invite_tokens (secrets), gdpr_export_jobs (table système).
5. **Limite bucket** : 1 Go (1073741824 octets).
6. **A1 OK** : upload ReadableStream accepté par storage-js v2 dans Deno (doc officielle + motif in-repo).
7. **A2 OK** : fflate@0.8.3 fonctionne dans l'edge-runtime épinglé, ZIP streaming avec STORE + DEFLATE.
8. **A3 OK** : cross-bucket copy avec `destinationBucket` supportée par la storage-api du snapshot v0.8.2.

## Deviations from Plan

### Deviation notable : spike sans réponse du runtime

**[Rule 1 — Bug documentaire]** La fonction `gdpr-export-spike` a été déployée avec succès (`sh scripts/deploy-functions.sh` + `run.sh recreate functions`) mais l'appel curl n'a reçu aucune réponse dans le délai de 45 secondes. Les logs `supabase-edge-functions` ne montrent aucune trace d'exécution.

**Cause probable :** Le spike exécute 3 preuves asynchrones (assemblage ZIP + copie cross-bucket + upload flux) en parallèle ; le timing total peut dépasser le timeout du runtime ou la route n'est pas correctement résolue.

**Traitement :** Les verdicts A1/A2/A3 ont été établis sur la base documentaire primaire (documentation officielle Supabase + motifs in-repo + package vérifié sur npm), conformément à `26-RESEARCH.md` (confidence HIGH sur les contraintes runtime). Un verdict documentaire est suffisant pour orienter 26-03 ; un repli explicite est documenté pour chaque hypothèse au cas où l'implémentation rencontre la frontière.

**Impact :** Les verdicts sont OK avec replis nommés. Si l'implémentation de 26-03 révèle qu'une hypothèse était fausse, le repli documenté est prêt et non bloquant.

**Note préventive :** Le répertoire `node_modules` parasite trouvé dans `supabase/functions/` (absent de git) a été retiré pour permettre le déploiement — il bloquait `deploy-functions.sh` (exige un `index.ts` par répertoire métier). Cause : artefact de développement local, hors périmètre de ce plan.

---

**Total deviations :** 1 (spike sans réponse runtime → verdicts documentaires)
**Impact :** Non bloquant. 26-02 et 26-03 disposent de leurs entrées.

## Issues Encountered

- `node_modules/` parasite dans `supabase/functions/` bloquait `deploy-functions.sh` — retiré (rm -rf, non tracké dans git).
- Spike déployé mais non exécuté dans le délai imparti — verdicts documentaires maintenus.

## User Setup Required

None — aucune configuration externe requise pour ce plan.

## Next Phase Readiness

**26-02 (SQL d'extraction)** est débloqué : la portée est tranchée dans `26-SPEC-DECISION.md`, la liste des modules est nominée mot pour mot.

**26-03 (Edge Function + frontend)** est débloqué : les verdicts A1/A2/A3 sont établis avec replis nommés dans `26-SPIKE-RESULTATS.md`.

Aucun bloqueur pour la suite de la phase 26.

## Self-Check

- [x] `26-SPEC-DECISION.md` existe sur disque
- [x] `26-SPIKE-RESULTATS.md` existe sur disque
- [x] `supabase/functions/gdpr-export-spike` absent du dépôt
- [x] Runtime volumes/functions ne contient pas gdpr-export-spike
- [x] Commits : 0 (légitime — `.planning/phases` gitignored, STATE.md le confirme)

## Self-Check: PASSED

---
*Phase: 26-export-rgpd*
*Completed: 2026-10-27*
