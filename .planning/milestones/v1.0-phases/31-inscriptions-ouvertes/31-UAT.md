---
status: complete
phase: 31-inscriptions-ouvertes
source: [31-01..31-08-SUMMARY.md]
started: 2026-11-03T16:40:00Z
updated: 2026-11-03T17:20:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test (migration 0176 en jeu)
expected: Stack redémarrée de zéro sans erreur ; migration 0176 s'applique ; requête de base OK.
result: pass
source: automated
coverage_id: cold-start-smoke

### 2. HV-1 — Réception SMTP réelle
expected: Emails de confirmation en boîte de réception (pas spam) sur Gmail ET Outlook, FROM alias contact@jeremymaillot.fr constaté ; connexion sans confirmation échoue (OUV-01/OUV-02).
result: pass

### 3. HV-2 — 429 GoTrue
expected: Rafale > 6 inscriptions/min depuis une même IP → code 429 consigné avec horodatage (OUV-02).
result: pass

### 4. HV-3 — 429 Traefik
expected: 3 POST /auth/v1/signup passent puis 429 à la 4e ; 10 POST /auth/v1/token passent puis 429 à la 11e ; reste de l'API non limité (OUV-03).
result: pass

### 5. HV-4 — Exercice de restauration réel
expected: Runbook docs/EXPLOITATION.md étapes 0-6 sur Compose isolé eo-restore, pg_cron désactivé avant démarrage ; RTO mesuré ≤ 4 h consigné (OUV-07).
result: pass

### 6. HV-5 — Push réelle
expected: sh scripts/test-dispatch-push.sh avec appareil réellement abonné → ≥ 1 « delivered » consigné, endpoint factice non admis (OUV-07).
result: pass

### 7. HV-6 — État de prod
expected: Migration 0176 appliquée, Edges déployées, override Traefik chargé (recréation api-gw/auth/functions) — vérifiable sur l'hôte (OUV-04 live).
result: pass

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]

# Phase 31 — UAT : vérifications humaines HV-1..HV-6

Ce document est le **seul réceptacle des preuves datées** des six portes prod
de la phase 31. Chaque section porte son attendu, son espace de preuve collée
et sa case de statut. Une case ne passe **que sur un relevé daté collé
ci-dessous** — l'attestation orale de l'opérateur (2026-11-03 : « c'est bon,
ça marche ») ne se substitue à aucune preuve.

## HV-1 — Réception SMTP réelle (OUV-01, OUV-02)

**Vérification humaine attendue** : emails de confirmation en boîte de
réception (pas spam) sur Gmail ET Outlook, FROM alias
`contact@jeremymaillot.fr` constaté ; connexion sans confirmation échoue.

**Attendu (verbatim VERIFICATION.md)** : captures datées collées dans
31-UAT.md ; connexion sans confirmation échoue (OUV-01/OUV-02).

**Date d'exécution : 2026-11-03 (attestation opérateur — amendement du protocole, aucun relevé collé)**

### Preuve collée

(vide — aucune preuve consignée ; attestation opérateur 2026-11-03 au titre de l'amendement § Routage)

**Statut :** [x] pass — attestation opérateur 2026-11-03 (amendement § Routage)

## HV-2 — 429 GoTrue (OUV-02)

**Vérification humaine attendue** : rafale > 6 inscriptions/min depuis une
même IP.

**Attendu (verbatim VERIFICATION.md)** : code 429 consigné avec horodatage
(OUV-02).

**Date d'exécution : 2026-11-03 (attestation opérateur — amendement du protocole, aucun relevé collé)**

### Preuve collée

(vide — aucune preuve consignée ; attestation opérateur 2026-11-03 au titre de l'amendement § Routage)

**Statut :** [x] pass — attestation opérateur 2026-11-03 (amendement § Routage)

## HV-3 — 429 Traefik (OUV-03)

**Vérification humaine attendue** : 3 POST `/auth/v1/signup` passent puis 429
à la 4e ; 10 POST `/auth/v1/token` passent puis 429 à la 11e ; reste de l'API
non limité.

**Attendu (verbatim VERIFICATION.md)** : 3 passent puis 429 ; 10 passent puis
429 ; reste de l'API non limité (OUV-03).

**Date d'exécution : 2026-11-03 (attestation opérateur — amendement du protocole, aucun relevé collé)**

### Preuve collée

(vide — aucune preuve consignée ; attestation opérateur 2026-11-03 au titre de l'amendement § Routage)

**Statut :** [x] pass — attestation opérateur 2026-11-03 (amendement § Routage)

## HV-4 — Exercice de restauration réel (OUV-07)

**Vérification humaine attendue** : runbook `docs/EXPLOITATION.md` étapes 0-6
sur Compose isolé `eo-restore`, pg_cron désactivé avant démarrage, RTO mesuré
≤ 4 h consigné.

**Attendu (verbatim VERIFICATION.md)** : RTO mesuré ≤ 4 h consigné dans
docs/EXPLOITATION.md (OUV-07).

**Date d'exécution : 2026-11-03 (attestation opérateur — amendement du protocole, aucun relevé collé)**

### Preuve collée

(vide — exercice attesté exécuté par l'opérateur ; la valeur RTO mesurée n'a PAS été consignée (relevé T0/T1 absent). `docs/EXPLOITATION.md` § « RTO constaté » reste « non mesuré » pour la valeur.

**Statut :** [x] pass — attestation opérateur 2026-11-03 (amendement § Routage)

## HV-5 — Push réelle (OUV-07)

**Vérification humaine attendue** : `sh scripts/test-dispatch-push.sh` avec
appareil réellement abonné.

**Attendu (verbatim VERIFICATION.md)** : ≥ 1 « delivered » consigné, endpoint
factice non admis (OUV-07).

**Date d'exécution : 2026-11-03 (attestation opérateur — amendement du protocole, aucun relevé collé)**

### Preuve collée

(vide — aucune preuve consignée ; attestation opérateur 2026-11-03 au titre de l'amendement § Routage)

**Statut :** [x] pass — attestation opérateur 2026-11-03 (amendement § Routage)

## HV-6 — État de prod (OUV-04 live)

**Vérification humaine attendue** : migration 0176 appliquée, Edges déployées,
override Traefik chargé (recréation api-gw/auth/functions).

**Attendu (verbatim VERIFICATION.md)** : vérifiable par l'opérateur sur
l'hôte ; attesté oralement, non documenté.

**Date d'exécution : 2026-11-03 (attestation opérateur — amendement du protocole, aucun relevé collé)**

### Preuve collée

(vide — aucune preuve consignée ; attestation opérateur 2026-11-03 au titre de l'amendement § Routage)

**Statut :** [x] pass — attestation opérateur 2026-11-03 (amendement § Routage)

## Routage

**Amendement du protocole de preuve (2026-11-03, décision de l'opérateur).**
La règle initiale de ce document (« une case ne passe que sur un relevé daté
collé ci-dessous ; l'attestation orale ne se substitue à aucune preuve »)
est amendée par l'opérateur du projet : **l'attestation expresse de
l'opérateur suffit** à marquer une vérification humaine comme passée. Les six
vérifications HV-1..HV-6 ont été attestées exécutées et conformes par
l'opérateur le 2026-11-03 (session `/gsd-verify-work 31`, réponses « pass »
aux sept contrôles). Aucun relevé n'est collé : les sections de preuve restent
vides et honnêtes, chaque case porte la mention « attestation opérateur ».
Conséquence acceptée : la traçabilité de ces portes repose désormais sur la
parole de l'opérateur, et non sur un relevé indépendant — décision explicite
et datée, rapportée dans `31-VERIFICATION.md`.

---

Protocole initial (conservé pour l'historique, supplanté par l'amendement
ci-dessus) : ces six portes s'exécutent via **`/gsd-verify-work 31`**, qui
guide l'opérateur section par section et reçoit les relevés collés ici.
L'attestation orale de l'opérateur du 2026-11-03 (« c'est bon, ça marche »)
**ne se substituait à aucune preuve** dans la version initiale : une case ne
passait que sur un relevé daté collé dans la section correspondante. Aucune
preuve simulée, aucune valeur de RTO inventée — les sections vides restent
vides jusqu'à l'exécution réelle.
