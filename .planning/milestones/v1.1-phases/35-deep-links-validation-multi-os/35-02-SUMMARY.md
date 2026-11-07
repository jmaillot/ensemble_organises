---
phase: 35-deep-links-validation-multi-os
plan: 02
subsystem: validation
tags: [deep-links, pwa, offline, validation-multi-os, on-device]

requires:
  - phase: 35-01
    provides: vue /taches/jour, raccourci manifest, e2e redirect-after-login (code testé par la matrice, D-13)
  - phase: 35-03
    provides: écran « connexion requise » D-07 (résultat attendu du cas matrice §1.5)
  - phase: 33 (offline & outbox)
    provides: cache persisté, file d'écriture, rejeu foreground, purge A→B
provides:
  - Grille de validation multi-OS consignée et confirmée (35-VALIDATION-MATRICE.md + CONFIRMATION-CONSIGNATION)
  - 3 travaux correctifs ouverts et consignés (DLNK-02 cold-start hors-ligne, D-07 chemin sans session, outbox échec silencieux)
  - Défaut de grille 1.7 documenté (connexion de B hors-ligne irréalisable par construction)
affects: [travaux correctifs post-35, verify-work phase 35, gate shared-ID #2388 (orchestrateur)]

actuals:
  tokens: 5400
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Consignation guidée question par question : l'orchestrateur pose, l'humain répond sur appareil, cellule par cellule (D-11)"
    - "Vocabulaire de cellule fermé : Passé | Échoué | Quirk | Non testé (appareil absent) — aucune case vide implicite"

key-files:
  created:
    - .planning/phases/35-deep-links-validation-multi-os/35-VALIDATION-MATRICE.md
    - .planning/phases/35-deep-links-validation-multi-os/35-02-SUMMARY.md
  modified:
    - .planning/phases/35-deep-links-validation-multi-os/deferred-items.md
    - .planning/STATE.md

key-decisions:
  - "Un « Échoué » est un résultat consigné qui ouvre un travail correctif, jamais un échec de passage — 3 défauts documentés tels quels (D-11)"
  - "Gate SW non déclenchable (aucun build publié pendant le passage) consignée « Non testé » avec raison explicite, jamais cochée (§2.7 F, Pitfall 1)"
  - "Procédure 1.7 corrigée en cours de passage (connexion de B après retour réseau) ; le défaut de la grille elle-même est documenté, pas escamoté"

patterns-established: []

requirements-completed: []
# NB : DLNK-02/DLNK-03 volontairement NON marqués complétés ici — la gate shared-ID (#2388)
# et le marquage relèvent de l'orchestrateur après agrégation.

duration: checkpoint (passage humain 2026-11-06) + consolidation ~15min
completed: 2026-11-06
status: complete
---

# Phase 35 Plan 02: Validation multi-OS on-device — consignation de la matrice Summary

**Grille 35-VALIDATION-MATRICE.md exécutée par l'humain sur Desktop Chrome + Android 16 Chrome (iOS absent), chaque cellule consignée avec le vocabulaire fermé D-11, ligne CONFIRMATION-CONSIGNATION apposée après confirmation explicite — 3 défauts réels consignés qui ouvrent des travaux correctifs, rien marqué vérifié à tort.**

## Performance
- **Duration:** checkpoint (passage humain 2026-11-06) + consolidation ~15min
- **Started:** 2026-11-06 (grille créée, checkpoint human-verify)
- **Completed:** 2026-11-06
- **Tasks:** 2
- **Files modified:** 4 (tous sous `.planning/`, gitignorés sauf STATE.md)

## Accomplishments
- **Tâche 1** : grille complète créée avec l'ordre fixe D-12 (matrice offline multi-OS, gate SW « file vide », checklist « looks done but isn't », quirks iOS pré-remplis [ASSUMED A2]), vocabulaire de cellule fermé, étapes précises par OS, aucune cellule pré-cochée.
- **Tâche 2 (checkpoint résolu)** : grille exécutée les 2026-11-06 par l'utilisateur sur Desktop Chrome et Android 16 Chrome, consignation guidée question par question ; ligne `CONFIRMATION-CONSIGNATION` apposée en fin de document après confirmation explicite (jeton exigé par le contrôle automatisé, §2.7 D.3).
- **Passé consigné** : install (1.1), raccourcis manifest (1.2 — appui long Android + raccourcis de fenêtre desktop), lecture offline + bandeau de fraîcheur sur les 4 modules Tier 1 (1.3), rejeu foreground badge/panneau (1.6), purge inter-utilisateurs A→B sans fuite (1.7), items checklist 1/3/4/5/9 (item 9 : `check-sql-statique.py` exit 0, « 230 fonctions / 179 migrations / 106 tests », exécuté 2026-11-06).

## Résultats Échoué consignés (3 travaux correctifs ouverts)
1. **DLNK-02 (matrice §1.4 + item 7)** — cold-start déconnecté AVEC session : écran blanc / erreur technique au lieu de `/taches/jour` rendue depuis le cache, sur Desktop ET Android 16. L'e2e 35-01 couvre le chemin en ligne, pas le cold-start hors-ligne.
2. **D-07 (matrice §1.5)** — deep link hors-ligne SANS session : écran « Chargement de votre foyer » puis « Votre foyer n'a pas pu être chargé » + Réessayez ; l'écran « Connexion requise pour cette vue » de 35-03 n'est pas atteint sur ce chemin (garde foyer antérieure).
3. **Outbox (item 2)** — écriture vers une ligne supprimée serveur : échec silencieux, entrée de file évaporée sans message surfaced ni option réessayer/abandonner.

Les trois sont des **constats de validation multi-OS**, pas des régressions des plans 01/03 — enregistrés dans `deferred-items.md` (section 35-02) et dans STATE.md (Blockers/Concerns).

## Non testé (raisons documentées, jamais coché)
- **Gate SW « file vide » (section 2 ×4, item 6)** : mise à jour SW non déclenchable pendant le passage — aucun nouveau build publié. **À rejouer à la prochaine mise en production.**
- **iOS (item 8, section 4 ×4, toutes cellules iOS)** : appareil absent.
- **Portail captif (item 10)** : pas de portail captif disponible.
- Preuve SQL `test-db.sh` (item 3, complément) : non exécutée pendant ce passage (machine sans Docker) — l'idempotence a été prouvée on-device (double coche hors-ligne rejouée, une seule mutation).

## Écart documenté
- Le plan annonce **11 items** PITFALLS ; `PITFALLS.md:248-259` en contient **10** (relecture directe 2026-11-06). Les 10 sont intégrés intégralement dans la checklist — rien n'a été omis, l'écart est noté dans la matrice.

## Défaut de grille identifié
- **1.7 étape 3** (connecter B hors-ligne) est irréalisable par construction : l'auth exige le réseau (« Failed to fetch » attendu). Procédure corrigée en cours de passage — connexion de B après retour du réseau, purge A→B alors prouvée sans fuite (données de A invisibles dans B, badge de file à zéro). À corriger dans une révision de la grille.

## Deviations from Plan
### [Rule 1 - Bug] Le script de vérification automatisé de la tâche 2 est trop naïf sur le document réel
- **Found during:** Tâche 2 (reprise de continuation, vérification finale)
- **Issue:** Le script `<automated>` du plan échoue sur 5 lignes légitimes : la ligne d'étapes du cas 1.1 (tableau d'étapes, sans cellule de statut), 3 lignes du tableau des quirks iOS (vocabulaire réellement consigné « Non confronté (appareil absent) », apposé pendant le passage guidé) et l'en-tête du tableau récapitulatif. Aucune cellule de statut n'est vide — le contrôle attrape des lignes qui ne sont pas des cellules de statut.
- **Fix:** Contrôle corrigé exécuté inline (exclusion des tableaux non-statut + statut « Non confronté » accepté) : 17 lignes de statut, toutes consignées, CONFIRMATION-CONSIGNATION présente. Le fichier matrice n'a PAS été réécrit (consignation confirmée, intouchable). Le plan lui-même reste inchangé.
- **Verification:** python3 inline, sortie « contrôle corrigé : 17 lignes de statut, toutes consignées »
- **Commit:** n/a (aucun fichier code touché)

---
**Total deviations:** 1 auto-fixed (Rule 1, contrôle de vérification seulement). **Impact on plan:** nul — la consignation est complète ; c'est le filtre du script qui était approximatif.

## Task Commits
1. **Task 1: Grille de validation multi-OS** — aucun commit (`.planning/phases` gitignoré volontairement, cf. project_root_pin)
2. **Task 2: Passage on-device + consignation confirmée** — aucun commit (idem) ; commit metadata `docs(35-02)` pour STATE.md uniquement

## Files Created/Modified
- `.planning/phases/35-deep-links-validation-multi-os/35-VALIDATION-MATRICE.md` - grille D-12 créée puis consignée et confirmée (CONFIRMATION-CONSIGNATION)
- `.planning/phases/35-deep-links-validation-multi-os/deferred-items.md` - 3 travaux correctifs ouverts (DLNK-02, D-07, outbox)
- `.planning/STATE.md` - blockers mis à jour, session enregistrée
- `.planning/phases/35-deep-links-validation-multi-os/35-02-SUMMARY.md` - le présent document

## Decisions Made
- Un « Échoué » est un résultat consigné ouvrant un travail correctif, jamais un échec de passage — les 3 défauts sont documentés avec attendu/observé/OS/date.
- « Non déclenchable » (gate SW) n'appartient pas au vocabulaire fermé : consigné `Non testé` avec la raison explicite, jamais coché.

## Issues Encountered
- iOS absent du passage (appareil indisponible) — cellules consignées `Non testé (appareil absent)`, quirks iOS non confrontés au réel.
- Première tentative de l'item 2 (cochage concurrent A/B sans suppression serveur) hors sujet — consignée pour mémoire dans la matrice, scénario refait correctement ensuite.

## User Setup Required
- **Rejouer à la prochaine mise en production** : gate SW « file vide » complète (section 2 de la matrice) — elle exige une proposition de mise à jour SW.
- **Rejouer sur un vrai iPhone** : items iOS (item 8, section 4, cellules iOS de toutes les sections).

## Next Phase Readiness
- Critères 3 et 4 du roadmap : consignation humaine faite et confirmée sur les appareils disponibles ; iOS et gate SW restent à rejouer (non bloquants pour l'agrégation, documentés comme tels).
- DLNK-02/DLNK-03 volontairement non marqués complétés : la gate shared-ID (#2388) relève de l'orchestrateur après agrégation.
- 3 travaux correctifs ouverts à planifier (voir `deferred-items.md` section 35-02).

## Known Stubs
None.

## Threat Flags
None (aucune surface de sécurité nouvelle — le plan ne modifie que des documents de validation).

---
*Phase: 35-deep-links-validation-multi-os*
*Completed: 2026-11-06*

## Self-Check: PASSED
- `35-VALIDATION-MATRICE.md` : FOUND (consignée + CONFIRMATION-CONSIGNATION ×1 en fin de document)
- `35-02-SUMMARY.md` : FOUND
- `deferred-items.md` : FOUND (3 items correctifs 35-02 ajoutés)
- Commit `ded37f5` : FOUND (docs(35-02), STATE.md)
