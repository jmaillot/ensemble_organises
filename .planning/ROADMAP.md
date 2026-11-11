# Roadmap: Ensemble & Organisés

## Milestones

- ✅ **v1.0 Mise en ligne publique** (phases 25-31, shipped 2026-11-04)
- ✅ **v1.1 PWA durcie mobile-first** (phases 32-35, shipped 2026-11-07)
- ✅ **v1.2 Finition de la dette offline** (phases 36-37, shipped 2026-11-08)
- ✅ **v1.3 Solde de la dette** (phases 38-42, shipped 2026-11-10) — [archive](milestones/v1.3-ROADMAP.md)
- 🚧 **v1.4 Preuve & décision** (phases 43-44, in progress)

## Phases

<details>
<summary>✅ v1.3 Solde de la dette (Phases 38-42) — SHIPPED 2026-11-10</summary>

- [x] Phase 38: Filet de tests fiable (4 plans) — completed 2026-11-08
- [x] Phase 39: Outillage prod de vérification (2 plans) — completed 2026-11-09
- [x] Phase 40: Ardoise « Rejoindre via mon compte » (3 plans) — completed 2026-11-10
- [x] Phase 41: Gate SW simulable (1 plan) — completed 2026-11-10
- [x] Phase 42: Cold start mesuré puis corrigé + décision cache (3 plans) — completed 2026-11-10

Détail complet : [milestones/v1.3-ROADMAP.md](milestones/v1.3-ROADMAP.md)

</details>

### 🚧 v1.4 Preuve & décision (In Progress)

**Milestone Goal:** Fermer les deux dettes priorisées de v1.3 — la surface bridge ardoise devient prouvée en prod et la décision de cache maxAge est tranchée famille par famille. Aucune nouvelle surface produit.

Ordre de risque, pas de dépendance : aucune dépendance croisée entre les deux phases. W1 d'abord (aucune dépendance appareil — stack prod + accès SQL suffisent) ; CACHE-01 ensuite (bloquée sur la disponibilité physique de l'appareil de référence — travail préparatoire seul tant que l'appareil manque, différé consigné honnêtement si report, jamais de valeur inventée). Peuvent s'exécuter en parallèle si l'appareil se libère tôt.

- [x] **Phase 43: Preuve prod du bridge ardoise (W1)** - Script sœur `scripts/test-ardoise-bridge-real.sh` prouvant la surface bridge sur le fil HTTP réel (happy path attribuable, ≥ 3 négatifs red-team, réconciliation lue après coup, consignation datée) (completed 2026-11-11)
- [ ] **Phase 44: Décision cache maxAge par famille (CACHE-01)** - Campagne on-device selon le protocole MESURES-COLD-START-42 §6, décision tranchée par les critères §5, au plus un commit par famille modifiée d'`OFFLINE_FAMILIES`, décision consignée dans PROJECT.md

## Phase Details

### Phase 43: Preuve prod du bridge ardoise (W1)

**Goal**: La surface bridge ardoise (Edge `ardoise-invite` action `household-token` → RPC `create_household_bridge_token` service_role → redeem 0181 réconciliant les participations) est prouvée en production réelle par un script sœur réexécutable — la preuve traverse le chemin HTTP complet, jamais SQL seul.
**Depends on**: Nothing (first phase du jalon)
**Requirements**: PROOF-01, PROOF-02, PROOF-03, PROOF-04, PROOF-05, PROOF-06, PROOF-07
**Success Criteria** (what must be TRUE):
  1. `scripts/test-ardoise-bridge-real.sh` exécuté sur la prod prouve le happy path du bridge étape par étape avec preuve HTTP attribuable (méthode, statut, champs clés, estampille du build déployé) — un observateur peut relire la sortie et suivre chaque appel, du token bridge jusqu'à l'adhésion foyer et à la conversion des participations
  2. Les négatifs red-team (replay du token consommé, token forgé/muté HMAC, token expiré ou cross-household) échouent réellement sur le fil HTTP — chaque négatif a été vu rouge avant d'être vert, et le refus de ré-redemption (single-use) est un assert positif du script
  3. La réconciliation des participations (`invite:` → `membre:`) est prouvée par lecture d'état après coup bornée par foyer : participations converties sans duplication ni orphelin
  4. Le script est discipliné et propre : secrets uniquement via `curl -K` fichier 0600, comptes e2e via `lib-smoke-accounts.sh` avec purge vérifiée (re-delete → 404), foyer éphémère créé et purgé, et une réexécution après déploiement ne laisse aucun artifact accumulé (teardown automatique)
  5. Un document de consignation daté dans `docs/` (forme 38-E2E-SIGNATURE.md) écrit ce qui est prouvé, ce qui ne l'est pas, et le verdict de chaque étape — aucun succès muet ; si un seam client est suspecté pendant la preuve, un e2e navigateur réel du parcours invité est ajouté par besoin déclenché

**Plans:** 1/1 plans complete

Plans:
- [x] 43-01-PLAN.md — Script sœur `scripts/test-ardoise-bridge-real.sh` : happy path HTTP attribuable + 4 négatifs red-team + réconciliation bornée + purge vérifiée + consignation auto-rédigée

### Phase 44: Décision cache maxAge par famille (CACHE-01)

**Goal**: Le maxAge du cache offline est tranché famille par famille selon les critères §5 contraignants de `docs/MESURES-COLD-START-42.md`, sur la campagne on-device prescrite §6 — la lecture du panneau précède toute décision, un statu quo justifié est une décision valide, et chaque famille modifiée est livrée en un commit atomique.
**Depends on**: Nothing (aucune dépendance avec Phase 43 — ordre de risque : bloquée sur la disponibilité de l'appareil de référence, travail préparatoire seul tant qu'elle manque)
**Requirements**: CACHE-01, CACHE-02, CACHE-03, CACHE-04
**Plans:** 2 plans

Plans:
**Wave 1**
- [ ] 44-01-PLAN.md — Préparatoire : squelettes §7.1–7.5 du document MESURES, procédure de campagne, évaluation du seuil D-15, observabilité conditionnelle (CACHE-04)

**Wave 2** *(blocked on Wave 1 completion)*
- [ ] 44-02-PLAN.md — Checkpoint appareil → campagne §6, grille §7.4 à chaud, commits de famille atomiques, chaîne §2.7 finale, report PROJECT.md (CACHE-01/02/03)

**Success Criteria** (what must be TRUE):
  1. La campagne on-device suit le protocole §6 : appareil de référence, purge froide comparable §2.1, N=5 runs avec médiane — ou un différé honnêtement consigné (jamais l'émulateur, jamais de valeur inventée) ; la lecture du panneau « Amorçage » précède toute décision (les critères b/c tranchent, jamais la lecture a seule — biais d'ordre)
  2. La grille de décision §7.4 est remplie famille par famille avec la justification (a)(b)(c) AVANT toute édition de code, et la décision (y compris un statu quo justifié) est consignée dans PROJECT.md
  3. Chaque famille modifiée d'`OFFLINE_FAMILIES` dans `query-policy.ts` arrive en au plus un commit contenant valeur + Test H vert + commentaire ; `gcTime` (7 j) reste ≥ au maxAge le plus long ; l'outbox, le bandeau offline et le SW restent intouchables
  4. Si l'observabilité avant/après devient nécessaire pour trancher, un détail cache par famille en lecture seule apparaît dans le panneau diagnostic — ajout déclenché par besoin, jamais préventif

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 43 → 44 (aucune dépendance croisée — parallélisable si l'appareil de référence est disponible pendant la Phase 43)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 43. Preuve prod du bridge ardoise (W1) | v1.4 | 1/1 | Complete    | 2026-11-11 |
| 44. Décision cache maxAge par famille (CACHE-01) | v1.4 | 0/? | Not started | - |
