---
gsd_state_version: "1.0"
milestone: v1.0
milestone_name: Mise en ligne publique
status: planning
last_updated: "2026-10-25T07:01:12.771Z"
last_activity: 2026-10-25
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

---
gsd_state_version: "1.0"
status: entre-jalons — tous les plans exécutés, UAT et jalon suivant à arbitrer
stopped_at: "2026-10-24 : passe qualité UI complète sur la vague design melimelo. Critique Impeccable exécutée deux fois (matin 30/40 → après-midi 33/40, rapports dans .impeccable/critique/) avec corrections livrées au fil : contraste corail, mur de zéros (widgets, héros Anniversaires, stats Courses — c92cb55), titres h1→h2, glyphe Google officiel, bandeau ambre Realtime, menu mobile unifié (feuille basse animée, 05c08e4), illustrations générées des 21 objets de tuiles (9a81f01, a41df8b, docs/OBJETS-TUILES-GEN.md), notifications alignées (7838001), e2e remis au vert 147/147 (52c43a0). Prod rebuildée et validée par l'utilisateur le 24/10. Poussé sur main jusqu'à c92cb55."
last_updated: "2026-10-24T18:15:00Z"

progress:
  # Vestige désynchronisé — la source de vérité est .planning/ROADMAP.md.
  total_phases: 24
  completed_phases: 24
  percent: 100

# ATTENTION — RÉÉCRITURE DU 24/10/2026 : le corps historique de ce fichier

# (journal des phases 1 à 24, incident migrate 0055, récits de vérification)

# a été écrasé lors d'une mise à jour maladroite ; seules les ~60 premières

# lignes, capturées dans la session avant l'écrasement, ont pu être

# restaurées ci-dessous. La queue du journal est PERDUE. Les récits

# complets restent disponibles dans les fichiers de phase

# (.planning/phases/*/ *-SUMMARY.md, *-VERIFICATION.md) et dans

# docs/RETROSPECTIVE.md — relire ceux-ci plutôt que ce fichier pour

# l'historique. Leçon : `.planning/` n'est pas versionné ; proposer son

# versionnement (ou au minimum une sauvegarde avant réécriture).

# En attente d'arbitrage utilisateur :

# 1. UAT des phases récentes (21-24) + du travail design hors cycle ;

# 2. clôture du jalon courant (complete-milestone + summary) ;

# 3. ouverture du jalon suivant (vague 4 ?) — décisions produit ouvertes

#    listées dans AGENTS.md §9.

# Reste UI mineur : césures « Anniver-saires » dans la feuille mobile

# (décision de feel), animations de sortie des feuilles (forceMount).

# STATE

Statut : Phase 2 Ardoises — TERMINÉE et testable le 2026-10-02.
- SQL : 0055→0065 appliquées, 19/19 suites vertes (0001 + 0018), statique vert.
- Edge : ardoise-invite (create-ardoise/create/revoke/summary/join/redeem-guest)
  + settlement (membre + invité), validées en direct sur la stack locale.
- Frontend : liste + rejoindre (membre/invité) + détail 3 onglets + formulaire
  invités + partage (Copier/Partager/Régénérer/Arrêter) + couverture Storage.
- Vérifié : typecheck vert, build vert, Vitest ardoise 25/25, e2e ardoise 2/2.
- En cours : suite Vitest complète (fond).
- Suivi : lecture invité complète via Edge ; INVITE_TOKEN_HMAC_SECRET absent
  du .env local (household-invite KO en local, préexistant).
- Commit 2b3f278 poussé sur origin/main le 2026-10-02 (phases 1/1b/2 +
  correctifs UI + camembert shares-pie ; Vitest 347/347, SQL 19/19).
- À faire côté test réel : restaurer app/.env.local depuis
  /tmp/opencode/env.local.stack, `npm run dev`, comptes alice-cal/bob-cal.
- Incident migrate distant 2026-10-03 : 0055 (backfill puis SET NOT NULL même
  txn) rejetée `pending trigger events` — table pleine en réel, vide en
  recette. Corrigée par découpe `commit; begin;` (issue identique), contrôle
  statique n°8 ajouté et prouvé rouge→vert, repro mécanisme sur schéma local
  (lignes zz_repro_*, zéro résidu). Récit : docs/RETROSPECTIVE.md §11.
  Relance distante attendue : `sh scripts/migrate.sh` (0055 non journalée,
  0056→0065 en attente).
- Prochain : Phase 3 Courses scan (04-courses-scan.md).
- Membres d'ardoise 2026-10-03 (f5af746) : sélection à la création
  (0066 p_member_ids, Edge create-ardoise memberIds), dialogue ajout/retrait
  via bouton Inviter (RLS admin déjà en place). Vitest ardoise 31/31,
  test-db 20/20. Relance distante : migrate + deploy-functions +
  recreate functions + rebuild frontend.
- Phase 3 Courses scan PLANIFIÉE le 2026-10-05 : CONTEXT (D-01…D-09 verrouillées,
  catalogue par foyer, pas de proxy Edge, attribution jeremymaillot@gmail.com),
  RESEARCH (OFF v2 direct, 404 = création manuelle, 15 req/min, X-User-Agent),
  3 plans en 3 vagues (.planning/phases/04-courses-scan/04-0{1,2,3}-PLAN.md),
  vérification OK (0 bloquant, 2 infos). Prêt à exécuter.
- Phase 3 EXÉCUTÉE et CLÔTURÉE le 2026-10-05 : 7 commits (tracer 0071, scan UI,
  photos privées), vérification PASSED (D-01…D-09 livrées), revue 5 critiques
  corrigées (0072 trigger foyer + allowlist images + off-by-one + liste
  destinataire + écriture atomique ; WR-01/04/10/11 aussi), chaîne complète
  [fin de la partie restaurée — la suite du journal (phases 4 à 24) est
  perdue ; se référer aux SUMMARY/VERIFICATION de chaque phase.]

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-10-25 — Milestone v1.0 started
