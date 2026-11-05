# Roadmap: Ensemble & Organisés

> **Jalon actif : v1.1 — PWA durcie mobile-first** (phases 32-35). Les phases 1-31 du v1.0 et des jalons précédents sont archivées dans `.planning/milestones/`.

## Phases

- [x] **Phase 32: Install & raccourcis** - Manifest durci (icônes maskable, display_override, apple-*), UX d'installation par OS, raccourcis « Tâches du jour » et « Courses », mises à jour SW sûres *(UAT 7 passées, 1 bloquée — re-test au prochain déploiement, cf. 32-UAT.md)*
- [x] **Phase 33: Cache de lecture offline** - Cache persisté TanStack Query (restauré avant premier rendu), bandeau stale horodaté, allowlist Tier 1, cache namespacé par utilisateur, SW denylist API prouvée (complète 2026-11-05)
- [ ] **Phase 34: File d'écriture & rejeu** - Idempotence serveur d'abord, outbox Tier 1 (Courses/Tâches/Routines) rejoué en foreground, classification terminal/retryable, badge « N en attente », réconciliation Realtime
- [ ] **Phase 35: Deep links & validation multi-OS** - Deep link déconnecté → login → retour à la cible, vue « Tâches du jour » dédiée, validation e2e de bout en bout sur desktop/Android/iOS

## Phase Details

### Phase 32: Install & raccourcis

**Goal** : L'app installée est joignable en un tap depuis l'écran d'accueil sur les trois OS, avec des raccourcis web vers les vues du quotidien, et un service worker dont les mises à jour ne détruisent jamais une session en cours.
**Depends on** : Nothing (first phase of v1.1)
**Requirements** : INST-01, INST-02, INST-03, DLNK-01
**Success Criteria** (what must be TRUE):
  1. Sur Android et desktop, l'utilisateur peut installer la PWA depuis l'app via l'invite native (cap `beforeinstallprompt`) ; sur iOS, un guide d'installation dans l'app lui montre les gestes Safari — aucun des trois ne se retrouve bloqué par des icônes ou du manifest incomplet
  2. Un appui long sur l'icône installée (Android/Chrome) propose les raccourcis « Tâches du jour » et « Courses » qui ouvrent directement les vues correspondantes (vues restant atteignables in-app sur iOS, qui ignore le champ shortcuts)
  3. Le manifest déclare les icônes maskable 192/512 (générées via `@vite-pwa/assets-generator`), `display_override` et les balises `apple-*` — l'installabilité est vérifiée on-device desktop et Android
  4. Quand une mise à jour du service worker est disponible, l'utilisateur la voit (état SW/version visible) et le rechargement attend que la file d'écriture soit vide — jamais de reload pendant un rejeu (`registerType: prompt`, gate file vide posée pour la phase 34)

**Plans**: 3 plans

Plans:
- [x] 32-01-PLAN.md — Manifest durci : icônes any/maskable générées (assets-generator), raccourcis /taches et /courses, display_override, categories, screenshots, balises apple-*
- [x] 32-02-PLAN.md — Mises à jour SW sûres : registerType prompt, slot de bandeaux hauts, bandeau de mise à jour avec gate stub file vide, panneau offline enrichi
- [x] 32-03-PLAN.md — UX d'installation : bannière deux niveaux (invite Chromium + guide iOS dépliable), enterrement 30 jours, détection à la volée

**Suivi UAT (2026-11-04)** : 7/8 passés. Deux défauts trouvés et corrigés en session (bannière jamais montée → `6d78688` ; UI brute → `b02fde7`), re-validés. Test 7 (bandeau de mise à jour réel) bloqué sur `release-build` : à rejouer au prochain déploiement — voir `32-UAT.md` § Tests.

### Phase 33: Cache de lecture offline

**Goal** : En avion, l'utilisateur relit le dernier état connu de ses données avec la certitude honnête de quand elles datent — sans qu'aucune donnée d'un utilisateur ne survive à un autre sur l'appareil, et sans que le service worker cache jamais une réponse API.
**Depends on** : Phase 32
**Requirements** : OFFR-01, OFFR-02, OFFR-03, OFFR-04, OFFR-05
**Success Criteria** (what must be TRUE):
  1. Passage en mode avion après consultation d'un module Tier 1 (Courses, Tâches, Routines) : la dernière vue reste lisible, rendue depuis le cache persisté restauré au démarrage avant le premier rendu des routes protégées — pas d'écran vide ni de page d'erreur réseau
  2. Toute donnée rendue depuis le cache porte un bandeau « dernier état connu le [horodatage] » — jamais présentée comme fraîche (D-10)
  3. Un module hors allowlist (ex. Ardoise, Messages) en mode avion affiche l'erreur d'origine honnête, jamais des données cachées ; l'allowlist porte un maxAge par famille de données
  4. Après déconnexion (ou changement de foyer), l'appareil ne garde aucune donnée de l'utilisateur pour un autre : cache namespacé par utilisateur, purge synchrone attendue avant navigation — prouvé par un test sur un appareil partagé simulé
  5. Le contrôle statique §2.7 prouve que le service worker ne met jamais en cache `/rest/`, `/auth/`, `/realtime/`, `/storage/`, `/functions/` — et il a été vu rouge sur un cas qui doit échouer

**Plans**: 6 plans (incl. 33-06 gap closure)
- [x] 33-01-PLAN.md — Socle persistance : dépendances épinglées (checkpoint légitimité) + tracer seed → persist IndexedDB → restore → lecture (OFFR-01, OFFR-04)
- [x] 33-02-PLAN.md — Contrôle statique SW : jamais de cache API, vu rouge (OFFR-05)
- [x] 33-03-PLAN.md — Allowlist Tier 1/maxAge/prune + restore avant premier rendu (OFFR-01, OFFR-03)
- [x] 33-04-PLAN.md — Purge attendue déconnexion/changement de foyer + preuve appareil partagé (OFFR-04)
- [x] 33-05-PLAN.md — Bandeau « dernier état connu le… » (OFFR-02)
- [x] 33-06-PLAN.md — Gap closure G-33-3 : isError cloisonné par présence de données, offline = lignes en cache + bandeau ambre, jamais d'ErrorState (OFFR-01, OFFR-03)

**Suivi UAT (2026-11-05)** : 4/4 passés. Le défaut du test 3 (G-33-3 : ErrorState après ~30 s hors ligne malgré le cache) a été corrigé par 33-06 (commits 8f8f37e→6a5ccc9) et re-validé sur appareil réel. Voir `33-UAT.md` § Tests, `33-VERIFICATION.md`.

### Phase 34: File d'écriture & rejeu

**Goal** : Une écriture simple effectuée hors-ligne sur un module Tier 1 atteint malgré tout le serveur — exactement une fois, sans doublon ni perte silencieuse — et l'utilisateur voit toujours combien d'écritures sont en attente et ce qui a échoué.
**Depends on** : Phase 33
**Requirements** : WRQ-01, WRQ-02, WRQ-03, WRQ-04, WRQ-05, WRQ-06
**Success Criteria** (what must be TRUE):
  1. La migration SQL d'idempotence (clé client UUID, upsert/unicité sur les écritures Tier 1) est posée avec tests SQL négatifs §2.7 — rejouer deux fois la même écriture client ne crée pas de doublon en base
  2. Un ajout/coche hors-ligne sur Courses, Tâches ou Routines est enfilé localement et rejoué automatiquement au retour du réseau (foreground : `online` + `visibilitychange`) — l'utilisateur retrouve son écriture appliquée sans rien refaire
  3. Toute écriture sur un module hors liste blanche (Ardoise, Messages, Cadeaux, Cercle, invitations/tokens) est refusée côté client — prouvé par un test qui fait échouer une tentative hors liste
  4. Un rejeu butant sur un refus RLS ou une ligne supprimée est classé terminal et surfacé à l'utilisateur (échec visible avec réessayer/abandonner, retrait de la file) ; seuls les échecs réseau/5xx sont rejoués — jamais de retry en boucle, jamais d'effacement silencieux
  5. Le badge « N en attente » est visible pendant la déconnexion et retombe à zéro après un rejeu complet ; une écriture rejouée ne crée jamais de doublon face à Realtime (réconciliation par clé client, Realtime/invalidation priment sur l'overlay optimiste)

**Plans**: 5/5 plans executed

Plans:
- [x] 34-05-PLAN.md

**Wave 1**
- [x] 34-01-PLAN.md — Migration SQL d'idempotence : client_key uuid + backfill + NOT NULL + unicité sur les 5 tables Tier 1, tests SQL négatifs §2.7 (WRQ-01)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 34-02-PLAN.md — Outbox : enfilage central MutationCache (D-02), liste blanche d'écriture + refus upfront (WRQ-02/03), fusion D-04, annulation D-05, persistance dans le persister 33

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 34-03-PLAN.md — Rejeu foreground FIFO creates-d'abord via upsert idempotent, classification terminal/retryable sans boucle (WRQ-02/04), réconciliation Realtime par clé client (WRQ-06)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 34-04-PLAN.md — Surface : use-outbox source unique, badge « N en attente / N bloquées », panneau Réessayer/Abandonner, toast une fois, purge D-17 (WRQ-05)

### Phase 35: Deep links & validation multi-OS

**Goal** : Un raccourci tapé en cold-start déconnecté mène toujours à la bonne vue après reconnexion, et l'expérience offline complète est validée de bout en bout sur les trois OS — l'app de poche est prête, prouvée, pas supposée.
**Depends on** : Phases 32, 33, 34
**Requirements** : DLNK-02, DLNK-03
**Success Criteria** (what must be TRUE):
  1. Un deep link de raccourci ouvert pendant une session expirée mène à l'écran de connexion, puis ramène l'utilisateur exactement à la vue cible (redirect-after-login) — prouvé par un e2e dédié
  2. La vue « Tâches du jour » dédiée existe comme cible du raccourci (créée si absente) et rend correctement depuis le cache persisté en cold-start hors-ligne
  3. La matrice de validation est passée sur desktop, Android et iOS réels : install, raccourcis, lecture hors-ligne avec bandeau, rejeu foreground, purge inter-utilisateurs — chaque résultat (y compris les quirks iOS ITP/éviction) est consigné, rien n'est marqué vérifié à tort
  4. La checklist « looks done but isn't » des PITFALLS est passée en revue et le gate de mise à jour SW « file vide » est vérifié : aucune mise à jour ne recharge pendant un rejeu

**Plans**: TBD
**UI hint**: yes

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 32. Install & raccourcis | 0/? | Not started | - |
| 33. Cache de lecture offline | 4/5 (33-05 termine la vague 3) | Executing | 2026-11-04 |
| 34. File d'écriture & rejeu | 5/5 | In Progress|  |
| 35. Deep links & validation multi-OS | 0/? | Not started | - |
