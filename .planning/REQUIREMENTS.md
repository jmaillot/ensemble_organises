# Milestone v1.1 — PWA durcie mobile-first

**Goal :** la PWA installée devient une vraie app de poche — fiable hors-ligne, joignable en un tap depuis l'écran d'accueil, sans aucun store.

**Thème :** PWA durcie (offline lecture + file d'écriture, raccourcis web, installabilité). Aucun store, aucun APK, aucun wrapper natif — arbitrages du 2026-11-04.

**Source de vérité recherche :** `.planning/research/SUMMARY.md` (+ STACK/FEATURES/ARCHITECTURE/PITFALLS).

**Philosophie directrice (D-10, réaffirmée) :** l'offline est un cache de la vérité du serveur avec un overlay d'écritures en attente, jamais une seconde base. Donnée cachée = toujours étiquetée stale, jamais présentée comme fraîche. Le service worker ne cache jamais les réponses API.

---

## Requirements (v1.1)

### Offline lecture (OFFR)

- [ ] **OFFR-01** : La dernière vue consultée d'un module offline-éligible reste lisible en avion (données rendues depuis le cache persisté, restauré au démarrage avant le premier rendu des routes protégées)
- [ ] **OFFR-02** : Toute donnée rendue depuis le cache porte un bandeau « dernier état connu le [horodatage] » — jamais présentée comme fraîche (D-10)
- [ ] **OFFR-03** : Une allowlist nomme les modules offline-éligibles avec un maxAge par famille de données (Tier 1 : Courses, Tâches, Routines) — les modules hors allowlist affichent l'erreur d'origine honnête, pas du cache
- [ ] **OFFR-04** : Le cache est namespacé par utilisateur et purgé de manière synchrone (attendue) à la déconnexion et au changement de foyer — aucune donnée d'un utilisateur ne survit pour un autre sur un appareil partagé
- [ ] **OFFR-05** : Le service worker ne met jamais en cache les réponses API (`/rest/`, `/auth/`, `/realtime/`, `/storage/`, `/functions/`) — contrôle statique prouvé sur un cas qui doit échouer (§2.7)

### File d'écriture (WRQ)

- [ ] **WRQ-01** : Migration SQL d'idempotence : clé client UUID sur les écritures Tier 1 (upsert/unicité) avec tests SQL négatifs §2.7 — prérequis de toute écriture en file
- [ ] **WRQ-02** : Une écriture simple effectuée hors-ligne sur un module Tier 1 (ajout/coche Courses, Tâches, Routines) est enfilée localement et rejouée automatiquement au retour du réseau (foreground)
- [ ] **WRQ-03** : La file est une liste blanche : toute écriture sur un module hors liste (Ardoise, Messages, Cadeaux, Cercle, invitations/tokens) est refusée côté client avec un test qui le prouve
- [ ] **WRQ-04** : Un rejeu qui bute sur un refus RLS ou une ligne supprimée est classé terminal (surfacer à l'utilisateur, retirer de la file) vs retryable (réseau) — jamais de retry en boucle, jamais d'effacement silencieux
- [ ] **WRQ-05** : Un badge « N en attente » est visible (offline-banner) avec la liste consultable des écritures pendantes ; il retombe à zéro après rejeu complet
- [ ] **WRQ-06** : Le rejeu est réconcilié avec Realtime : une écriture rejouée ne crée jamais de doublon (réconciliation par clé client, Realtime/invalidation priment sur l'overlay optimiste)

### Raccourcis & deep links (DLNK)

- [ ] **DLNK-01** : Le manifest déclare des raccourcis « Tâches du jour » et « Courses » vers des URLs existantes (Android/Chrome natifs ; vues restant atteignables in-app pour iOS qui ignore le champ)
- [ ] **DLNK-02** : Un deep link ouvert pendant une session expirée mène au login puis revient à la vue cible (redirect-after-login, e2e dédié)
- [ ] **DLNK-03** : Une vue « Tâches du jour » dédiée existe comme cible du raccourci (à vérifier en plan ; créer si absente)

### Installabilité (INST)

- [ ] **INST-01** : Le manifest est complet : icônes maskable + raccourcis générées (`@vite-pwa/assets-generator`), `display_override`, balises `apple-*` iOS — installabilité vérifiée desktop/Android
- [ ] **INST-02** : L'utilisateur dispose d'une UX d'installation claire : cap `beforeinstallprompt` (Chromium) et guide d'installation iOS dans l'app
- [ ] **INST-03** : Les mises à jour du service worker sont sûres : `registerType: prompt` avec gate « file vide » — jamais de reload pendant un rejeu, état SW/version visible

---

## Future Requirements (différés)

- Tier 2 offline (Notes, Frigo) — après retour d'usage du Tier 1
- Background Sync API (rejeu « app fermée » sur Android) — enrichissement Chromium v1.x, jamais le mécanisme principal
- Widgets d'écran d'accueil natifs — sortis du périmètre (arbitrage 2026-11-04 : raccourcis web)
- Push iOS installée sur appareil — la chaîne serveur existe (v1.0), le test on-device reste à faire

## Out of Scope (exclusions explicites)

- **Store / APK / wrapper natif (Capacitor)** — arbitrage produit 2026-11-04 : PWA pure, tous OS
- **Retour du mode démo Dexie en prod (D-10)** — l'offline v1.1 est cache + overlay, jamais une seconde base ; la file n'emprunte jamais le chemin de données du mode démo
- **Écritures hors-ligne sur modules à logique serveur** (Ardoise : répartition calculée serveur ; Cadeaux : surprise serveur ; Messages : push groupées ; invitations/tokens : transactionnels) — la cohérence vient du serveur, pas du client
- **Résolution de conflits collaboratifs avancée** (merge multi-éditeurs) — LWW par ligne suffit pour le Tier 1

---

## Traceability

*(remplie par le roadmap : chaque exigence mappée à exactement une phase)*

| Requirement | Phase | Status |
|-------------|-------|--------|
