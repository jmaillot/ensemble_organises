# BRIDGE-ARDOISE-PREUVE — Preuve prod du bridge ardoise (phase 43)

**Run du :** 2026-11-11 18:12:19 (UTC, run 1794419621-1499372)
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
VERDICT VERT | foyer éphémère créé : household_id=household_afef2890-f4d5-4521-b0e5-9cb757ea1583, payeur admin (membre member_3ddbe7ca-0d30-4025-a441-7ad5f700f383)
ÉTAPE 2 | POST /functions/v1/ardoise-invite | HTTP 200 | create-ardoise — création de l'ardoise du foyer | estampille: estampille indisponible
VERDICT VERT | ardoise créée : ardoise_id=ardoise_70f14d05-6c86-4d2f-9455-fc49c2b1e16b
ÉTAPE 3 | POST /functions/v1/ardoise-invite | HTTP 200 | create — émission du code de partage ardoise (expiration +2 jours) | estampille: estampille indisponible
VERDICT VERT | code de partage émis et scellé en fichier 0600 (jamais imprimé)
ÉTAPE 4 | POST /functions/v1/ardoise-invite | HTTP 200 | redeem-guest — adhésion invitée sans compte (clé publiable seule) | estampille: estampille indisponible
VERDICT VERT | invité adhéré, guest_ticket scellé en fichier 0600
ÉTAPE 5 | GET /rest/v1/ardoise_guests | HTTP 200 | lecture du guest_id par le payeur (canal app) | estampille: estampille indisponible
ÉTAPE 6 | POST /rest/v1/rpc/create_expense | HTTP 200 | dépense 24,00 € participant guest AVANT household-token (D-05) | estampille: estampille indisponible
VERDICT VERT | dépense créée : expense_id=expense_671b3ff9-44f3-4103-934e-e582b045970e, participant guest=ardoise-guest_ccdb025e-3309-47d8-95aa-997610a52ad6
VERDICT VERT | identifiants du pont capturés avant redeem : foyer=household_afef2890-f4d5-4521-b0e5-9cb757ea1583 guest=ardoise-guest_ccdb025e-3309-47d8-95aa-997610a52ad6
ÉTAPE 7 | POST /functions/v1/ardoise-invite | HTTP 200 | household-token — échange code → token foyer (JWT invité) | estampille: estampille indisponible
VERDICT VERT | token foyer reçu et scellé en fichier 0600
ÉTAPE 8 | POST /functions/v1/household-invite | HTTP 200 | redeem — redemption du token foyer : adhésion + réconciliation guest | estampille: estampille indisponible
VERDICT VERT | redeem vert : invité membre du foyer household_afef2890-f4d5-4521-b0e5-9cb757ea1583, réconciliation déclenchée
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
VERDICT VERT | fixture cross-household en place : foyer B=household_c1b20423-6b66-4001-b4d8-0be35cb23e24 avec une part guest vivante
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
VERDICT VERT | foyer household_afef2890-f4d5-4521-b0e5-9cb757ea1583 supprimé (cascade)
VERDICT VERT | foyer household_afef2890-f4d5-4521-b0e5-9cb757ea1583 : 0 ligne résiduelle (expenses/ardoises/tokens)
VERDICT VERT | foyer household_c1b20423-6b66-4001-b4d8-0be35cb23e24 supprimé (cascade)
VERDICT VERT | foyer household_c1b20423-6b66-4001-b4d8-0be35cb23e24 : 0 ligne résiduelle (expenses/ardoises/tokens)
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
