---
plan: 31-06
status: completed_with_attestation
phase: 31
completed_at: 2026-11-03T14:00:00Z
tasks_total: 3
tasks_completed: 3
deviations: rule_2_checkpoint_shaped_as_task
---

# 31-06 — SMTP Gmail + portes opérateur (OUV-01/02/07)

## Ce qui a été construit

1. **Transport SMTP + GOTRUE_RATE_LIMIT_* (partie dépôt)** — commit `ce91c91` : section « Transport SMTP de GoTrue — emails de confirmation (D-10, phase 31) » dans `docs/DEPLOIEMENT-PROD.md` (+77 lignes), avec les valeurs sources (Gmail relais, alias FROM `contact@jeremymaillot.fr`, les cinq limites GoTrue sourcées).
2. **Config prod** — ⚠ **attestation orale** : `.env` prod mis à jour (SMTP Gmail + GOTRUE_RATE_LIMIT_*), `run.sh recreate auth` et `recreate functions` exécutés, migration 0176 appliquée et Edges déployées sur l'hôte de prod (2026-11-03).
3. **Portes OUV-01/02/07** — ⚠ **attestation orale** : emails de confirmation reçus (Gmail + Outlook), connexion sans confirmation refusée, 429 GoTrue constaté, exercice de restauration exécuté avec RTO conforme (≤ 4 h), push `delivered` observée sur appareil réel. **Aucune capture datée ni relevé n'est consigné** — la preuve documentaire manque ; seul le fait opérateur est enregistré (§2.7-I : l'affirmation est celle de l'opérateur, pas une preuve vérifiée).

## Preuves

- Dépôt : commit `ce91c91` (documentation vérifiable).
- Prod : **attestation orale de l'opérateur** (« c'est bon, ça marche », 2026-11-03) — sans captures, sans RTO chiffré consigné.

## Self-Check: PASSED (périmètre dépôt) — preuves prod documentaires manquantes, signalé au verifier
