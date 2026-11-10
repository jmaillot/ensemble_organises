# Requirements — Milestone v1.3 : Solde de la dette

**Defined:** 2026-11-08
**Core Value:** PWA foyers fiable — aucune dette consignée ne survit au jalon ; une seule surface utilisateur nouvelle (adhésion via le lien ardoise), tout le reste est fiabilité.

**Source de vérité recherche :** `.planning/research/SUMMARY.md` (+ STACK/FEATURES/ARCHITECTURE/PITFALLS).

**Philosophie directrice :** « réutiliser, pas créer » — aucune nouvelle dépendance runtime ; le parcours ardoise se branche sur le flux d'invitation foyer existant ; les décisions données d'abord (CACHE-01, cold start) se tranchent avec des mesures réelles, jamais au doigt mouillé.

## Milestone v1.3 Requirements

### Ardoise — adhésion via le lien de partage

- [x] **ARD-01** : Un invité sans foyer qui clique « Rejoindre via mon compte » sur le lien de partage ardoise rejoint le foyer via le flux d'invitation foyer existant (token HMAC, transaction serveur) — confirmation explicite du foyer (jamais d'adhésion implicite au clic), atterrissage dans l'ardoise partagée après adhésion, `?code=` préservé via le pattern `state.from` existant
- [x] **ARD-02** : La réconciliation des participations `invite:` → `membre:` à l'adhésion est tranchée en discuss-phase (implémentée transactionnellement, ou refusée avec justification produit consignée) — plus d'orphelin silencieux
- [x] **ARD-03** : Espaces de clés distincts (partage ardoise ≠ invitation foyer, jamais de colonne `household_id` ajoutée au modèle de partage) et tests SQL négatifs obligatoires : déjà admin, déjà membre, double redemption concurrente (`FOR UPDATE`), rôle forcé côté serveur uniquement

### Gate SW (GATE-01 planifiable)

- [x] **GATE-01** : Le chemin runtime complet de la gate « file vide » est validé e2e au moins une fois contre build+preview réel (deux builds successifs, hash de precache distinct, contexte Playwright neuf, build ID injecté `VITE_BUILD_ID`) — le re-test en conditions réelles à la prochaine utilisation observée reste un observatoire consigné hors jalon

### Cache & amorçage offline

- [ ] **CACHE-01** : Le maxAge 24 h est tranché par famille offline avec les données du panneau diagnostic on-device (jamais l'émulateur) — décision documentée dans PROJECT.md (valeur + justification), tests de politique à jour si `OFFLINE_FAMILIES` change, purge outbox indépendante du maxAge gardée verte
  - *État réel : DEFERRÉE hors phase 42 (décision produit 2026-11-10 — campagne interrompue après 2 runs). Critères §5 du doc mesures contraignants pour la campagne future ; query-policy.ts inchangé (statu quo de fait, pas une décision).*
- [x] **COLD-01** : Le cold start est mesuré avec un protocole écrit d'abord (build prod, cache froid, réseau coupé, marks `performance.mark` aux 4 segments : entry chunk, activation SW, restore IndexedDB, auth bootstrap) alimentant le panneau diagnostic existant — instrumentation en DERNIER, après tout changement d'imports
- [ ] **COLD-02** : Les corrections désignées par le profilage sont livrées (jamais de correction au doigt mouillé avant la trace) — l'amorçage mesuré après correction est documenté
  - *État réel : DEFERRÉ hors phase 42 (décision produit 2026-11-10 — pas de campagne complète, donc pas de profilage, donc pas de correction désignée). Instrumentation et protocole livrés et vérifiés.*

### Filet de tests

- [x] **TEST-01** : Les 2 flakes dimanche (menu-page + household-store WR-03) sont corrigés à la racine dans la même phase — semis lundi-based via helpers centralisés `debutSemaineIso`/`jourSemaine` dans `lib/datetime.ts` (tests paramétriques 7 jours), jamais d'horloge figée ; aucun `new Date()` résiduel dans les semis
- [x] **TEST-02** : La spec e2e join-token périmée (depuis refonte 31-03) est réécrite contre le flux actuel ou supprimée avec la couverture perdue consignée — jamais « réparée au vert » par tatillage
- [x] **TEST-03** : La chaîne e2e est 100 % verte — plus aucun rouge préexistant assumé dans le jalon

### Smoke-test prod

- [x] **SMOKE-01** : Le smoke-test crée ET purge ses comptes e2e via l'API Admin GoTrue (`createUser` avec `email_confirm: true`) en mode prod — `ENABLE_EMAIL_AUTOCONFIRM` reste `false`, secrets lus depuis `.env` stack/Vault (jamais argv ni ARG frontend), comptes préfixés `e2e+<runid>@`, purge vérifiée (re-delete → 404), rate limits GoTrue gérés explicitement (422/429)

### Dette review 37

- [x] **DEBT-01** : IN-01 (garde morte `api.ts:315`) supprimée et IN-02 (select `service_role` non borné `index.ts:656`) borné — `sh scripts/test-db.sh` obligatoire si du SQL est touché

## Future Requirements (hors jalon)

- **GATE-PROD** : re-test des tests 32-UAT 7 et 35-UAT 2 à la première utilisation observée d'un déploiement naturel (observatoire événementiel, non planifiable)
- **Réconciliation générale des données invité** si l'adhésion ne révèle pas de données orphelines
- **Budget de perf cold start en CI**
- **Matrice iOS réelle** — blocage matériel, pas logiciel

## Out of Scope

| Feature | Reason |
|---------|--------|
| Toute autre nouvelle fonctionnalité produit | Jalon dette : la seule surface utilisateur est l'ardoise (ARD-01..03) |
| Adhésion foyer implicite au clic | Anti-feature confirmée en questionnement |
| Réactiver `ENABLE_EMAIL_AUTOCONFIRM` « pour les tests » | Anti-feature : le mode prod doit être testé en prod |
| Passer la gate SW en `autoUpdate` | Contredit la décision v1.1 « file vide » |
| maxAge global de 30 jours | Anti-feature de la recherche ; décision par famille seulement |

## Traceability

| Requirement | Phase | Plans | Statut |
|-------------|-------|-------|--------|
| TEST-01 | Phase 38 — Filet de tests fiable | 38-01 | Complete |
| TEST-03 | Phase 38 — Filet de tests fiable | 38-02 | Complete |
| DEBT-01 | Phase 38 — Filet de tests fiable | 38-03 | Complete |
| SMOKE-01 | Phase 39 — Outillage prod de vérification | 39-01 | Done |
| TEST-02 | Phase 39 — Outillage prod de vérification | 39-02 | Done |
| ARD-01 | Phase 40 — Ardoise « Rejoindre via mon compte » | 40-01/02/03 | Done |
| ARD-02 | Phase 40 — Ardoise « Rejoindre via mon compte » | 40-01/02/03 | Done |
| ARD-03 | Phase 40 — Ardoise « Rejoindre via mon compte » | 40-01/02/03 | Done |
| GATE-01 | Phase 41 — Gate SW simulable | 41-01 | Done |
| COLD-01 | Phase 42 — Cold start + décision cache | Instrumentation 4 segments (boot-marks.ts, panneau « Amorçage ») + protocole versionné — vérifié 42-VERIFICATION.md | Done |
| COLD-02 | Phase 42 — Cold start + décision cache | Campagne partielle (2 runs on-device consignés §7.1) puis abandon runs 3/4/5 — décision produit, corrections non profilées | Deferred |
| CACHE-01 | Phase 42 — Cold start + décision cache | Décision non prise — dépend d'une campagne complète ; critères §5 restants contraignants, statu quo query-policy.ts | Deferred |

**Coverage:** 12/12 exigences v1.3 mappées ✓ (aucune orpheline, aucun doublon)
