---
phase: 26-export-rgpd
plan: 04
subsystem: backend/rgpd
tags: [gdpr, rgpd, purge, storage, cron, audit]
requires:
  - phase: 26-export-rgpd
    plan: "02"
    provides: "Migration 0158 : bucket gdpr-exports scellé, gdpr_export_jobs (expires_at 7 j), gdpr_export_purge_log, post_gdpr_export_http, cron eo-gdpr-export-purge"
  - phase: 26-export-rgpd
    plan: "03"
    provides: "Edge gdpr-export-run (staging <uid>/<job>/ + zip <uid>/<job>.zip), motifs withSupabase auth 'secret', déploiement deploy-functions.sh sérialisé"
provides:
  - "Edge gdpr-export-purge (auth 'secret') : purge 7 j des octets via API Storage, audit gdpr_export_purge_log par chemin, plafond 50 jobs/passage, idempotence, contrat 'partial'"
affects: [26-06, 26-07]
tech-stack:
  added: []
  patterns: ["suppression Storage par lots (motif household-delete), audit serveur comme preuve RGEX-04, cron quotidien comme retry naturel"]
key-files:
  created:
    - supabase/functions/gdpr-export-purge/index.ts
  modified: []
decisions:
  - "Zip visé via storage_path (chemin scellé 0158) et non re-listé : valeur hors du chemin scellé ignorée (T-26-09)"
  - "Idempotence = SAUT du chemin déjà removed=true (pas de re-log) : la ligne existante EST la preuve, la redire fausserait les comptages"
  - "Échec d'écriture d'audit = FATAL : la preuve RGEX-04 en base vaut plus que les octets supprimés (§2.7F)"
  - "Un job déjà entièrement purgé réapparaît comme candidat à 0 chemin : passage sans écriture, aucun coût hors listage — documenté dans le doc-comment"
metrics:
  duration: ~40 min
  completed: 2026-10-27
status: complete
actuals:
  tokens: 21000
  tasks: 3
  commits: 1
plan_head_before: ba39082a535b9ccce634a80a280afc747490b8af
plan_head_after: eee7890
commits: 1
---

# Phase 26 Plan 04: Edge gdpr-export-purge — purge 7 jours du bucket RGPD Summary

**One-liner:** La purge RGEX-04 est réelle : une Edge Function mode `secret` supprime les octets du bucket `gdpr-exports` (staging + zip) via l'API Storage pour les jobs terminaux dont `expires_at` est dépassé, consigne chaque chemin dans `gdpr_export_purge_log`, et le cron quotidien `eo-gdpr-export-purge` l'éveille via pg_net + Vault — preuve E2E et preuve réseau obtenues sur la stack.

## Ce qui a été fait

### Task 1 (tracer) — le chemin mince, déployé et prouvé E2E

`supabase/functions/gdpr-export-purge/index.ts` (`auth: ['secret']` exclusif, T-26-14) :

1. **Candidats** : `status in ('pret','echec')` ET `expires_at < now()`, ordre d'ancienneté, plafond **50 jobs/passage** — JAMAIS un job `en_attente`/`en_cours` (T-26-13).
2. **Chemins** : préfixe de staging `<uid>/<job>/` listé récursivement paginé (motif household-delete, profondeur bornée à 12) + zip `<uid>/<job>.zip` via `storage_path` (valeur hors du chemin scellé ignorée).
3. **Suppression** : `.remove()` par lots de 100 — l'échec d'un lot logge chaque chemin `removed=false` avec l'erreur et lève le drapeau `partial` (contrat 'partial' de household-delete, §2.7F), sans arrêter la boucle. **Aucun DELETE SQL de `storage.objects`** — les octets disque meurent uniquement par l'API Storage.
4. **Audit** : une ligne `gdpr_export_purge_log` par chemin traité (job_id, storage_path, removed, error). Échec d'écriture d'audit = FATAL (la preuve en base vaut plus que les octets).
5. **Réponse honnête** : `{ purged_jobs, removed_count, partial }` ; échec total Storage → 500 explicite, le cron du lendemain retente (pas de retry local, même philosophie que gdpr-export-run).

**Preuve de purge E2E (job sonde 970a459b-…, objet réel uploadé dans le bucket) :**

| Étape | Résultat |
|---|---|
| Upload sonde : `<uid>/<job>/parts/probe.json` + `<uid>/<job>.zip` via API Storage (clé secrète) | HTTP 200 ×2 |
| 1er appel purge (storage_path NULL : seul le staging est visé) | 200 `{"purged_jobs":1,"removed_count":1,"partial":false}` ; `probe.json` → 404 NoSuchKey (disparu), audit : 1 ligne `removed=t` |
| `storage_path` posé puis 2e appel | 200 `removed_count:1` ; zip → 404 NoSuchKey (disparu) |
| Idempotence relecture | audit : 2 lignes (staging + zip), **aucun doublon** du `probe.json` déjà `removed=true` — sauté comme documenté |

Job sonde supprimé après preuve (les lignes d'audit restent, FK `on delete set null`).

### Task 2 — expansion robuste (absorbée dans le commit du tracer)

Le tracer a été écrit directement à qualité production (jamais un jetable) : plafond 50 jobs/passage, idempotence d'audit (chemins `removed=true` sautés, choix documenté en commentaire), profondeur de listage bornée (12, dépassement signalé non avalé), échec total Storage → 500 + reprise par cron. Vérifications passées : `sh scripts/deploy-functions.sh` OK + `run.sh recreate functions`, `grep -q "partial"` OK. Aucun delta de code → aucun commit séparé (consigné en déviations, même forme que 26-03).

### Task 3 — preuves RGEX-04 en base + déclaration réseau

| Preuve | Commande | Résultat |
|---|---|---|
| Suite SQL 0158 (candidats purge, politiques, machine à états) | `sh scripts/test-db.sh 0158` | **Vert, exit 0** |
| Contrôle statique | `python3 scripts/check-sql-statique.py` | 215 fonctions / 163 migrations / 95 tests, aucun défaut |
| Job cron présent | `cron.job` | `eo-gdpr-export-purge`, `27 4 * * *`, command `select private.dispatch_gdpr_export_purge()` (aucun secret, §2.7H) |
| Historique cron | `cron.job_run_details` du job purge | **0 ligne — ABSENCE DÉCLARÉE** : le job a été installé aujourd'hui (2026-10-27), sa première exécution planifiée est le 28/10 à 4h27 ; rien n'est présumé (§2.7I) |
| Preuve réseau bout-en-bout (modèle `test-dispatch-push.sh`) | `select private.dispatch_gdpr_export_purge();` puis `net._http_response` | **PROUVÉE** : avec un candidat expiré présent, `dispatched: true` → `net._http_response` id 22 : `status_code 200`, body `{"purged_jobs":0,"removed_count":0,"partial":false}` — l'Edge `gdpr-export-purge` a été réellement éveillée par la chaîne pg_net+Vault et a répondu. Sans candidat, le garde SQL répond `dispatched: false` (comptage conditionnel 0158, conforme). |

## Deviations from Plan

1. **[Consolidation] Tasks 2 et 3 sans commit séparé** — la robustesse (plafond, idempotence, bornes, 500) était déjà dans le commit du tracer (eee7890, exécuté à qualité production) ; les deux tâches ont été VÉRIFIÉES (grep `partial`, deploy OK, test-db 0158 exit 0) et leurs preuves consignées ci-dessus, sans delta de code à committer.
2. **[Écart assumé] Zip visé uniquement via `storage_path`** (le plan parlait de « connexion via storage_path » — appliqué tel quel) : un job terminal sans `storage_path` (impossible pour un job `pret` produit par 26-03, possible seulement pour des lignes de test) verrait son staging purgé et son éventuel zip ignoré — comportement documenté dans le doc-comment.

## Auth Gates

Aucun — stack locale, clé secrète déjà dans Vault, utilisée pour les sondes depuis le `.env` de la stack (jamais versionnée, §2.7H).

## Known Stubs

Aucun. Aucun chemin mort, aucune valeur fantôme : les cas sans candidat et sans objet répondent des zéros explicites.

## Threat Flags

Aucun nouveau surface hors du threat model du plan : `auth: ['secret']` exclusif (T-26-14), filtre strict statut terminal + `expires_at` (T-26-13), audit serveur systématique (T-26-12), aucune nouvelle dépendance (T-26-SC inchangé).

## Self-Check: PASSED

- `supabase/functions/gdpr-export-purge/index.ts` : présent (commit eee7890)
- Commit eee7890 : trouvé dans `git log`
- `sh scripts/test-db.sh 0158` : exit 0 ; contrôle statique : aucun défaut
- Purge réelle : staging + zip disparus (404 NoSuchKey), 2 lignes d'audit `removed=t`, reprise sans doublon
- Preuve réseau : `net._http_response` id 22, HTTP 200 de l'Edge purge
- `cron.job` : `eo-gdpr-export-purge` installé ; `cron.job_run_details` vide (absence déclarée, première exécution le 28/10)
