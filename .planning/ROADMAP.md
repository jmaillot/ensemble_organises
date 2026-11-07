# Roadmap: Ensemble & Organisés

## Milestones

🚧 **v1.2 Finition de la dette offline** — plus jamais d'effacement silencieux, la chaîne de mise à jour observée en conditions réelles, un filet de tests fiable
- v1.1 PWA durcie mobile-first (Shipped: 2026-11-07, phases 32-35)
- v1.0 Mise en ligne publique (Shipped: 2026-11-04, phases 25-31)
- v0.9.0 (Shipped: 2026-10-24, phases 16-24)

## Phases

- [x] **Phase 36: Outbox — plus jamais d'effacement silencieux** - Le rejeu de l'outbox classe tout échec (404, 400, 403 RLS, 42501, …) terminal/retryable et le surface avec un message visible (completed 2026-11-07)
- [ ] **Phase 37: Filet de tests fiable** - La dette tests de v1.1 est soldée : flocon épinglé, tests rouges verts, e2e offline-shared-device exécuté, clé GoTrue résiduelle éliminée

## Deferred / Hors jalon

- **GATE-01** (gate SW runtime « file vide » observée sur un vrai déploiement + rejeu des tests 32-UAT 7 et 35-UAT 2) : **délibérément hors jalon** — cet observatoire ne peut être satisfait qu'à la prochaine mise en production *naturelle* (déploiement réel avec utilisateurs actifs). Ce n'est pas une phase : le déclencheur est événementiel, pas planifiable. Consigné dans REQUIREMENTS.md (Future Requirements) ; à rejouer au moment du déploiement, pas dans ce cycle.
- **CACHE-01** (maxAge 24 h du cache) : décision produit reportée, le panneau diagnostic reste disponible comme support.

## Phase Details

### Phase 36: Outbox — plus jamais d'effacement silencieux

**Goal**: Toute écriture en outbox dont le rejeu échoue reçoit une classification explicite et un sort visible pour l'utilisateur — la décision 34 « jamais d'effacement silencieux » redevient vraie sans exception
**Depends on**: Nothing (première phase du jalon — la stack outbox v1.1 existe déjà)
**Requirements**: OBOX-01, OBOX-02
**Success Criteria** (what must be TRUE):
  1. Un utilisateur écrit hors-ligne un élément supprimé entre-temps sur le serveur : à la reconnexion, l'entrée d'outbox n'est ni évaporée ni en boucle — elle est classée terminale et l'utilisateur voit un message clair « cet élément a été supprimé entre-temps » (badge et panneau Paramètres cohérents)
  2. Chaque code d'erreur de rejeu (404, 400, 403 RLS, 42501, réseau, 5xx, …) est couvert par un audit consigné avec sa classification terminal/retryable — aucun code ne laisse l'entrée silencieusement disparaître ni rejouer indéfiniment
  3. Les échecs terminaux apparaissent dans le panneau avec l'action Abandonner (confirmation) et les retryables restent rejouables via Réessayer — le badge « N en attente / N bloquées » reflète fidèlement chaque catégorie
  4. Des tests automatisés prouvent la classification des nouveaux codes (rouge→vert sur le scénario 404 silencieux d'origine) et la chaîne de vérification §2.7 reste verte

**Plans**: 2/2 plans complete

Plans:
- [x] 36-01-PLAN.md — Catalogue de libellés français (FAILURE_FAMILIES + failureLabel), scénario 404 rouge→vert, audit matriciel D-05 (OBOX-01, OBOX-02)
- [x] 36-02-PLAN.md — Retrait du toast D-12, badge unique signal actif, chaîne §2.7 complète (OBOX-01/D-03)

### Phase 37: Filet de tests fiable

**Goal**: Le filet de tests redevient un instrument de confiance — chaque dette tests héritée de v1.1 est fermée, corrigée ou documentée honnêtement
**Depends on**: Phase 36 (la phase 36 peut faire bouger des tests d'outbox ; le filet se consolide après)
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04
**Success Criteria** (what must be TRUE):
  1. Le flocon auth-bootstrap test D (~1/367 sous charge) est soit corrigé soit sa cause racine documentée dans le dépôt avec les preuves de diagnostic — plus de rouge inexplicable
  2. Les 2 tests rouges anniversaires préexistants passent — la suite unitaire est 100 % verte
  3. L'e2e offline-shared-device (2 comptes réels sur un même appareil) est rédigé, dé-skipé et exécuté au vert — plus aucun `skip` par manque de comptes
  4. Une purge invité ne laisse plus de clé GoTrue résiduelle — vérifié par test (lecture brute du stockage après purge)

**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 36. Outbox — plus jamais d'effacement silencieux | 2/2 | Complete    | 2026-11-07 |
| 37. Filet de tests fiable | 0/0 | Not started | - |
