# Phase 43: Preuve prod du bridge ardoise (W1) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-11
**Phase:** 43-Preuve prod du bridge ardoise (W1)
**Areas discussed:** Négatifs red-team, Scénario happy path & foyer éphémère, Consignation PROOF-05, Critère PROOF-07

---

## Négatifs red-team

| Option | Description | Selected |
|--------|-------------|----------|
| Les 4, attente réelle | Replay + HMAC muté + expiré (15 min réelles) + cross-household ; script ~20 min, 2ᵉ fixture foyer | ✓ |
| 3 négatifs, expiré exclu | Replay + HMAC muté + cross-household ; « expiré » noté non prouvé dans la consignation | |
| 3 négatifs, expiré accéléré en SQL | expires_at falsifié avant redemption — prouve la mauvaise couche | |

**User's choice:** Les 4, attente réelle.
**Notes:** Suivi d'une 2ᵉ question : ordre des négatifs fixe documenté par commentaire français (✓) vs fonctions réordonnables.

---

## Scénario happy path & foyer éphémère

| Option | Description | Selected |
|--------|-------------|----------|
| 2 comptes, 1 ardoise, 1 dépense | Payeur admin + invité (redeem-guest anonyme puis authentifié) ; chemin minimal traversant tout le bridge | ✓ |
| 2 comptes + invité de contrôle | 2 invités sur la même ardoise — prouve le remplissage d'identités multiple | |
| 2 comptes, 2 dépenses | Réconciliation sur plusieurs lignes de participations | |

**User's choice:** 2 comptes, 1 ardoise, 1 dépense.
**Notes:** Contrainte du code : les participations `invite:` existent avant l'émission du token (remplissage 0180b à l'appel household-token). Question suivante : canal de redemption — Edge `join`, tout HTTP (✓) vs RPC direct PostgREST (refusé : n'exerce pas la couche Edge de l'app réelle).

---

## Consignation PROOF-05

| Option | Description | Selected |
|--------|-------------|----------|
| Script auto-rédige | Le script écrit lui-même le document daté à chaque run — jamais de divergence sortie/consignation | ✓ |
| Document écrit après run | Agent rédige à partir de la sortie structurée — plus lisible, risque de divergence | |

| Option | Description | Selected |
|--------|-------------|----------|
| Un document réécrit | docs/BRIDGE-ARDOISE-PREUVE.md, date du run en tête, historique dans git | ✓ |
| Un fichier par run | Fichier daté par run — accumulation | |

**User's choice:** Script auto-rédige + un document réécrit.
**Notes:** La consignation listera explicitement les seams non couverts (✓) — esprit 38-E2E-SIGNATURE.

---

## Critère PROOF-07 — détection du seam

| Option | Description | Selected |
|--------|-------------|----------|
| Heuristique script + verdict humain | Signal mécanique dans la sortie (statut inattendu, CORS absent, redirect non suivi) ; verdict humain tranche l'e2e navigateur | (après correction) |
| Verdict humain seul | Aucun signal mécanique — risque de succès muet | |
| Détection automatique navigateur | Moteur navigateur dans le script sœur | (choix initial, rétracté) |

**User's choice:** Détection automatique navigateur d'abord, puis retour à « heuristique + verdict humain » après signal de conflit.
**Notes:** Le choix initial contredit la décision verrouillée STATE.md « zéro nouveau paquet, zéro nouveau service » (W1 = sh + curl -K + psql.sh stdin + lib-smoke-accounts.sh) et rendrait préventif l'e2e navigateur que PROOF-07 veut déclenché par besoin. Le conflit a été présenté à l'utilisateur, qui a rétracté le choix navigateur. La décision verrouillée tient.

---

## the agent's Discretion

- Nom et contenu du fichier de secrets `curl -K` 0600.
- Libellés des étapes et format de sortie du script (attribuabilité verrouillée par PROOF-01, mise en forme libre).
- Champs clés affichés par appel HTTP dans la sortie.

## Deferred Ideas

- W2 (déjà au backlog) : spec navigateur Playwright du flux bridge — lieu de l'e2e navigateur si PROOF-07 conclut à un seam. Aucune idée nouvelle hors périmètre.
