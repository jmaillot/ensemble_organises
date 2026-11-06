---
gsd_state_version: "1.0"
milestone: v1.1
current_phase: 35
current_phase_name: Deep links & validation multi-OS
status: executing
stopped_at: "35-02 terminé : matrice consignée et confirmée, SUMMARY écrit, 3 travaux correctifs enregistrés"
last_updated: "2026-11-06T15:38:06.429Z"
last_activity: 2026-11-06
last_activity_desc: Phase 35 execution started
state_head: 65e916774dfada9540d0d0f928434cab9820df60
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 20
  completed_plans: 17
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-04)

**Core value:** PWA foyers — l'app de poche du quotidien familial, fiable hors-ligne, joignable en un tap, sans store.
**Current focus:** Phase 35 — Deep links & validation multi-OS

## Current Position

Phase: 35 — READY TO EXECUTE
Plan: 3 of 3
Status: Ready to execute
Last activity: 2026-11-06 — Phase 35 execution started

Progress: [█░░░░░░░░░] 25% (1/4 phases v1.1)

## Performance Metrics

**Velocity:**
- Total plans completed: 0 (jalon v1.1)
- Jalon précédent v1.0 : 44 plans, 7 phases

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 32 | 0 | - | - |
| 33 | 6 | - | - |
| 34 | 0 | - | - |
| 35 | 0 | - | - |
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 34 P01 | 50min | 3 tasks | 25 files |
| Phase 34 P01 | 50min | 3 tasks | 25 files |
| Phase 34 P01 | 50min | 3 tasks | 25 files |
| Phase 34 P02 | 25min | 3 tasks | 7 files |
| Phase 34 P03 | ~30 min | 3 tasks | 4 files |
| Phase 34 P04 | 2h45 | 3 tasks | 16 files |
| Phase 34 P04 | 2h45 | 3 tasks | 16 files |
| Phase 35 P35-03 | 14min | 1 tasks | 2 files |
| Phase 35 P35-01 | 27min | 2 tasks | 12 files |
| Phase 35 P35-02 | checkpoint (passage 2026-11-06) + ~15min | 2 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Decisions structurantes v1.1 :

- Ordre de build (consensus recherche) : install/shortcuts (risque nul) → cache lecture → file écriture → validation multi-OS
- WRQ-01 (migration idempotence) précède toute écriture en file — seule dépendance de schéma du jalon
- OFFR-05 (denylist SW API, contrôle statique prouvé sur cas must-fail) livrée dans la même phase que le premier rendu caché
- Rejeu foreground-first : Background Sync = Chromium-only, iOS = cible de design ; enrichissement v1.x seulement
- Aucun store, aucun APK, aucun wrapper natif (arbitrage 2026-11-04) ; pas de retour du mode démo Dexie (D-10)
- [Phase 34]: 34-01 : client_key uuid NOT NULL + unicité (household_id, client_key) sur les 5 tables Tier 1 ; task_assignees unicité sur client_key seul ; pas de DEFAULT (refus = signal client buggé), fonctions serveur (cron/RPC) alimentées en gen_random_uuid() (0178/0179)
- [Phase 34]: 34-01 : client_key uuid NOT NULL + unicité (household_id, client_key) sur les 5 tables Tier 1 ; task_assignees unicité sur client_key seul ; pas de DEFAULT (refus = signal client buggé), fonctions serveur (cron/RPC) alimentées en gen_random_uuid() (0178/0179)
- [Phase 34]: 34-01 : client_key uuid NOT NULL + unicité (household_id, client_key) sur les 5 tables Tier 1 ; task_assignees unicité sur client_key seul ; pas de DEFAULT (refus = signal client buggé), fonctions serveur (cron/RPC) alimentées en gen_random_uuid() (0178/0179)
- [Phase 34]: 34-02 : outbox = query TanStack persistée dans le persister 33 (D-01), enfilage par MutationCache.onError central (D-02, pas de resumePausedMutations) ; WRITE_ALLOWLIST = les 5 tables D-14 exactement ; la garde upfront D-07 ne refuse que HORS LIGNE (en ligne, les modules hors liste fonctionnent) ; portée outbox via setOutboxScopeProvider enregistré par session-store (cycle d'imports évité) ; buster cache v2
- [Phase 34]: Rejeu D-10 : l'entrée terminale reste en file en status failed (jamais rejouée automatiquement) ; le retrait passe par l'action Abandonner du panneau (plan 04) — Substitution mécanique documentée au plan 34-03 ; jamais de boucle ni d'effacement silencieux, prouvé par test
- [Phase 34]: Garde anti-parallélisme module-level sur replayOutbox : une seule passe à la fois — Les déclencheurs D-08 peuvent se rapprocher à la ms ; une seconde passe rejouerait des entrées en vol (T-34-02)
- [Phase 34]: Gate 32-D10 branchée sur useOutbox : isEmpty = pendingCount === 0, échecs terminaux hors comptage (34-04)
- [Phase 34]: Purge D-17 scan-avertir-purger dans le goulot signOut ; changement de foyer purge l'outbox sans confirmation (34-04)
- [Phase 35]: 35-03 : écran D-07 hors-ligne sans session dans sign-in-page.tsx ; vue visée affichée comme chemin interne filtré par internalPathOf (pas de table de libellés), révocation formulaire par useState non persisté (D-08)
- [Phase 35]: Preuve de state.from par le comportement post-connexion dans l'e2e (jamais une lecture de stockage, D-08)
- [Phase 35]: TaskRow : onEdit/onDelete optionnels — une action non passée ne rend pas son bouton (vue jour D-03)
- [Phase 35]: Grille 35-VALIDATION-MATRICE.md créée : ordre fixe D-12, vocabulaire de cellule fermé (D-11), quirks iOS pré-remplis [ASSUMED A2] ; écart documenté : PITFALLS contient 10 items, pas 11
- [Phase 35]: 35-02 : matrice consignée et confirmée (CONFIRMATION-CONSIGNATION, Desktop + Android 16, iOS absent) ; un « Échoué » ouvre un travail correctif (3 ouverts : DLNK-02, D-07, outbox silencieux) ; gate SW et iOS = Non testé raisonné, à rejouer ; défaut de grille 1.7 documenté (connexion de B hors-ligne impossible par construction)

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 34 : décision ouverte store de la file (`idb` vs Dexie `version(3)`) — compatible D-10 dans les deux cas, à trancher en plan-phase (`--research-phase` recommandé)
- Phase 34 : sémantique de rejeu TanStack (`resumePausedMutations` vs outbox pur) — une seule voie de mutation par type d'opération, à trancher en plan
- Phase 35 : comportement iOS réel (éviction ITP ~7 j, install, pas de raccourcis manifest) — MEDIUM confidence, validation on-device
- Phase 34 : comportement purge file à la déconnexion avec N en attente (purge directe vs confirmation) — décision produit de phase
- e2e préexistant en échec (critical-paths « rejoindre un foyer valide le format du token », chromium+mobile) — constaté sur la base 36ac215, consigné deferred-items.md
- [35-02, matrice 2026-11-06] DLNK-02 : cold-start déconnecté AVEC session → écran blanc/erreur technique au lieu de /taches/jour, Desktop + Android 16 (matrice §1.4 + item 7) — travail correctif ouvert, constat multi-OS pas une régression 35-01
- [35-02, matrice 2026-11-06] D-07 : deep link hors-ligne SANS session → écran « foyer n'a pas pu être chargé » au lieu de l'écran « connexion requise » 35-03, non atteint sur ce chemin, Desktop + Android 16 (matrice §1.5) — travail correctif ouvert
- [35-02, matrice 2026-11-06] Outbox : écriture vers une ligne supprimée serveur = échec silencieux, entrée de file évaporée sans message surfaced (checklist item 2) — travail correctif ouvert, contredit la décision 34 « jamais d'effacement silencieux » sur ce scénario
- [35-02] Gate SW « file vide » (matrice §2) et items iOS non testés (build non publié / appareil absent) — à rejouer à la prochaine mise en production et sur un vrai iPhone

## Session Continuity

Last session: 2026-11-06
Stopped at: 35-02 terminé : matrice consignée et confirmée, SUMMARY écrit, 3 travaux correctifs enregistrés
Resume file: None
