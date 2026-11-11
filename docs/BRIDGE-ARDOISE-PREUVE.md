# BRIDGE-ARDOISE-PREUVE — Preuve prod du bridge ardoise (phase 43)

**Run du :** 2026-11-11 12:44:17 (UTC, run 1794399940-766728)
**Estampille du build frontend :** indisponible
**Exigences couvertes :** PROOF-01..07

Document réécrit par `scripts/test-ardoise-bridge-real.sh` à CHAQUE run
(D-07/D-08) — historique dans git. L'attribution PROOF-04 est portée par
la sortie curl par appel (méthode, statut, champs clés, estampille), pas
par la sonde `net._http_response` : aucun pg_net sur le chemin bridge.

## 1. Chaîne HTTP, dans l'ordre, chaque étape citée

```
ESTAMPILLE INDISPONIBLE | http://localhost:3000/version.json → HTTP 000
VERDICT VERT | 2 comptes e2e créés et sessions obtenues (payeur, invité)
ÉTAPE 1 | POST /rest/v1/rpc/create_household | HTTP 200 | création du foyer éphémère du payeur | estampille: estampille indisponible
VERDICT VERT | foyer éphémère créé : household_id=household_83f69f27-402c-40f5-ac72-43af9e816db8, payeur admin (membre member_d25825a9-7ec3-4708-b259-963017e395a9)
ÉTAPE 2 | POST /functions/v1/ardoise-invite | HTTP 200 | create-ardoise — création de l'ardoise du foyer | estampille: estampille indisponible
VERDICT VERT | ardoise créée : ardoise_id=ardoise_9dce9588-3d2c-4a5b-8777-b9c3f25d5290
ÉTAPE 3 | POST /functions/v1/ardoise-invite | HTTP 200 | create — émission du code de partage ardoise (expiration +2 jours) | estampille: estampille indisponible
VERDICT VERT | code de partage émis et scellé en fichier 0600 (jamais imprimé)
ÉTAPE 4 | POST /functions/v1/ardoise-invite | HTTP 200 | redeem-guest — adhésion invitée sans compte (clé publiable seule) | estampille: estampille indisponible
VERDICT VERT | invité adhéré, guest_ticket scellé en fichier 0600
ÉTAPE 5 | GET /rest/v1/ardoise_guests | HTTP 200 | lecture du guest_id par le payeur (canal app) | estampille: estampille indisponible
ÉTAPE 6 | POST /rest/v1/rpc/create_expense | HTTP 200 | dépense 24,00 € participant guest AVANT household-token (D-05) | estampille: estampille indisponible
VERDICT VERT | dépense créée : expense_id=expense_c39a83b9-7587-4670-8fb8-570e8cb99ba9, participant guest=ardoise-guest_df8f81a8-19f2-47b1-8b0e-dfe926875f92
VERDICT VERT | identifiants du pont capturés avant redeem : foyer=household_83f69f27-402c-40f5-ac72-43af9e816db8 guest=ardoise-guest_df8f81a8-19f2-47b1-8b0e-dfe926875f92
ÉTAPE 7 | POST /functions/v1/ardoise-invite | HTTP 200 | household-token — échange code → token foyer (JWT invité) | estampille: estampille indisponible
VERDICT VERT | token foyer reçu et scellé en fichier 0600
ÉTAPE 8 | POST /functions/v1/household-invite | HTTP 200 | redeem — redemption du token foyer : adhésion + réconciliation guest | estampille: estampille indisponible
VERDICT VERT | redeem vert : invité membre du foyer household_83f69f27-402c-40f5-ac72-43af9e816db8, réconciliation déclenchée
ÉTAPE 9 | POST /functions/v1/household-invite | HTTP 410 | redeem — négatif replay : même token re-présenté (410 attendu) | estampille: estampille indisponible
VERDICT VERT | replay refusé : HTTP 410 « Ce token a été révoqué. » (usage unique prouvé)
ÉTAPE 10 | POST /functions/v1/household-invite | HTTP 404 | redeem — négatif token muté : 1 caractère changé (404 « introuvable » attendu) | estampille: estampille indisponible
VERDICT VERT | token muté refusé : HTTP 404 « Ce token est introuvable. »
ÉTAPE 11 | POST /functions/v1/ardoise-invite | HTTP 200 | household-token — ré-émission d'un token frais pour le négatif d'expiration | estampille: estampille indisponible
VERDICT VERT | token frais ré-émis pour le négatif d'expiration
ÉTAPE 12 | POST /functions/v1/household-invite | HTTP 410 | redeem — négatif token expiré : attente réelle 1020 s puis re-redeem (410 « expiré » attendu) | estampille: estampille indisponible
VERDICT VERT | token expiré refusé : HTTP 410 « Ce token est expiré. » après l'attente réelle
ÉTAPE 13 | POST /rest/v1/rpc/create_household | HTTP 200 | fixture cross-household : second foyer, invité payeur/admin | estampille: estampille indisponible
ÉTAPE 14 | POST /functions/v1/ardoise-invite | HTTP 200 | create-ardoise — ardoise du second foyer | estampille: estampille indisponible
ÉTAPE 15 | POST /functions/v1/ardoise-invite | HTTP 200 | create — code de partage du second foyer | estampille: estampille indisponible
ÉTAPE 16 | POST /functions/v1/ardoise-invite | HTTP 200 | redeem-guest — invité sans compte du second foyer | estampille: estampille indisponible
ÉTAPE 17 | GET /rest/v1/ardoise_guests | HTTP 200 | lecture du guest_id du second foyer | estampille: estampille indisponible
ÉTAPE 18 | POST /rest/v1/rpc/create_expense | HTTP 200 | dépense participant guest du second foyer (borne cross-household) | estampille: estampille indisponible
VERDICT VERT | fixture cross-household en place : foyer B=household_a508765b-faac-418b-b788-2b33458d3b47 avec une part guest vivante
VERDICT VERT | SQL après coup : parts_guest_pontees_restantes = 0 (attendu 0)
VERDICT VERT | SQL après coup : depenses_dupliquees_membre = 0 (attendu 0)
VERDICT VERT | SQL après coup : parts_membre_converties = 1 (attendu 1)
VERDICT VERT | SQL après coup : token_consomme_use_count = 1 (attendu 1)
VERDICT VERT | SQL après coup : token_consomme_max_uses = 1 (attendu 1)
VERDICT VERT | SQL après coup : token_consomme_inactif = 0 (attendu 0)
VERDICT VERT | SQL après coup : token_reemis_propre = 1 (attendu 1)
VERDICT VERT | SQL après coup : parts_guest_restantes_foyer_b = 1 (attendu 1)
VERDICT VERT | SQL après coup : parts_membre_converties_foyer_b = 0 (attendu 0)
VERDICT VERT | Tous les verdicts sont verts : happy path, 4 négatifs, réconciliation bornée
VERDICT VERT | foyer household_83f69f27-402c-40f5-ac72-43af9e816db8 supprimé (cascade)
VERDICT VERT | foyer household_83f69f27-402c-40f5-ac72-43af9e816db8 : 0 ligne résiduelle (expenses/ardoises/tokens)
VERDICT VERT | foyer household_a508765b-faac-418b-b788-2b33458d3b47 supprimé (cascade)
VERDICT VERT | foyer household_a508765b-faac-418b-b788-2b33458d3b47 : 0 ligne résiduelle (expenses/ardoises/tokens)
VERDICT VERT | filet purge foyers des comptes du run : DELETE 0
VERDICT VERT | comptes purgés, purge prouvée (re-delete → 404)
```

## 2. Négatifs red-team (PROOF-02)

Ordre fixe D-01/D-02 : replay → token muté → token expiré → cross-household.

```
NÉGATIF replay | OK | HTTP 410 + « Ce token a été révoqué. »
NÉGATIF token-mute | OK | HTTP 404 + « Ce token est introuvable. »
NÉGATIF token-expires | OK | HTTP 410 + « Ce token est expiré. » (après attente réelle 1020 s)
NÉGATIF sql-parts_guest_pontees_restantes | OK | parts_guest_pontees_restantes = 0 (attendu 0)
NÉGATIF sql-depenses_dupliquees_membre | OK | depenses_dupliquees_membre = 0 (attendu 0)
NÉGATIF sql-parts_membre_converties | OK | parts_membre_converties = 1 (attendu 1)
NÉGATIF sql-token_consomme_use_count | OK | token_consomme_use_count = 1 (attendu 1)
NÉGATIF sql-token_consomme_max_uses | OK | token_consomme_max_uses = 1 (attendu 1)
NÉGATIF sql-token_consomme_inactif | OK | token_consomme_inactif = 0 (attendu 0)
NÉGATIF sql-token_reemis_propre | OK | token_reemis_propre = 1 (attendu 1)
NÉGATIF sql-parts_guest_restantes_foyer_b | OK | parts_guest_restantes_foyer_b = 1 (attendu 1)
NÉGATIF sql-parts_membre_converties_foyer_b | OK | parts_membre_converties_foyer_b = 0 (attendu 0)
```

## 3. Lecture SQL après coup (PROOF-03)

Lectures psql.sh (stdin, rôle postgres) bornées par foyer du run.

```
parts_guest_pontees_restantes|0
depenses_dupliquees_membre|0
parts_membre_converties|1
token_consomme_use_count|1
token_consomme_max_uses|1
token_consomme_inactif|0
token_reemis_propre|1
parts_guest_restantes_foyer_b|1
parts_membre_converties_foyer_b|0
```

## 4. Ce qui n'est PAS prouvé (D-09)

- Le dialog de copie du lien et le rendu du panneau invité : surfaces UI
  non couvertes — le script traverse le fil HTTP, pas le navigateur.
- L'e2e navigateur du parcours invité (W2) : déclenché par besoin
  (PROOF-07), jamais préventif — le verdict humain tranche si un seam
  apparaît via les signaux DÉCALAGE CHEMIN APP.
- L'estampille de l'Edge Function : pas de canal dédié — seule
  l'estampille frontend (/version.json) est capturée. INDISPONIBLE sur ce run (canal non joignable — nommé plus haut).
- Les signaux DÉCALAGE CHEMIN APP émis sur ce run : 0

## 5. Verdict + self-check

**Verdict du run : VERT** — tous les verdicts d'étape sont verts.

Self-check purge (PROOF-06) : purgé et prouvé (foyers → 0 lignes résiduelles, comptes re-delete → 404)

Comptes e2e résiduels hors de ce run (signalés, non supprimés — EE-02, à traiter à la main) :
- e2e+1794223918703512-2@ensemble.jeremymaillot.fr
- e2e+1794223918703512-2@ensemble.jeremymaillot.fr
- e2e+1794223918703512-1@ensemble.jeremymaillot.fr
- e2e+1794223918703512-1@ensemble.jeremymaillot.fr
- e2e+1794223911703118-1@ensemble.jeremymaillot.fr
- e2e+1794223911703118-1@ensemble.jeremymaillot.fr

---
*Phase 43 — généré automatiquement, aucune main humaine n'édite ce fichier.*
