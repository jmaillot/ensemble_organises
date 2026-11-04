---
phase: 26-export-rgpd
plan: 03
subsystem: backend/rgpd
tags: [gdpr, export, edge-function, multipasse, storage, zip-streaming]
requires: [0158_gdpr_export.sql (bucket, jobs, RPC squelette, cron), 26-01 verdicts A1/A2/A3]
provides: [Edge gdpr-export-run (RGEX-02), private.gdpr_export_extract_batch (corps effectif), public.gdpr_export_extract_batch (wrapper PostgREST)]
affects: [26-04 purge, 26-05 panneau frontend]
tech-stack:
  added: [fflate 0.8.3 (Zip/ZipDeflate/ZipPassThrough, streaming)]
  patterns: [multipasse à lease, claim atomique EvalPlanQual, staging idempotent, échec honnête D-02]
key-files:
  created:
    - supabase/functions/gdpr-export-run/index.ts
    - supabase/migrations/0161_gdpr_extract_batch.sql
    - supabase/migrations/0162_gdpr_http_guard.sql
    - supabase/migrations/0163_gdpr_extract_batch_wrapper.sql
    - supabase/tests/0161_gdpr_extract_batch.sql
  modified: []
decisions:
  - "PASS_CAP=60 au lieu du ~10 esquisse du plan : 22 modules + lots de 500 + médias + assemblage dépassent honnêtement 10 passes ; 60 ≈ 1 h max, boucle bornée (T-26-10)"
  - "Assemblage ZIP from-scratch idempotent (une passe relançable) : le central-directory d'un ZIP exige un unique écrivain séquentiel, reprendre « où on s'était arrêté » recréerait le problème mémoire qu'on évite"
  - "Wrapper public 0163 : PostgREST n'expose que public/graphql_public (PGRST_DB_SCHEMAS) — la logique reste en private, le wrapper est SECURITY DEFINER réservé à service_role (motif delete_household/0160)"
  - "Clé du déclencheur HTTP dans l'en-tête apikey, jamais Authorization: Bearer (motif 0025)"
metrics:
  duration: ~2 h (exécution reprise après checkpoint 0163)
  completed: 2026-10-27
status: complete
actuals:
  tokens: 18500
  tasks: 3
  commits: 1
plan_head_before: 32929d6
plan_head_after: bcd2272
commits: 1
---

# Phase 26 Plan 03: Edge Function gdpr-export-run — cœur multipasse de l'export RGPD Summary

**One-liner:** Job d'export RGPD multipasse prouvé de bout en bout sur la stack : claim atomique, extraction bornée par RPC (22 modules), médias copiés cross-bucket, ZIP assemblé en flux fflate et poussé sans jamais charger l'archive en mémoire — `en_attente → pret` en 2 passes avec preuve de téléchargement signé.

## Ce qui a été fait

### Task 1 (tracer) — le chemin mince, déployé et prouvé E2E

- **0161** `private.gdpr_export_extract_batch` (corps effectif du squelette 0158) : 22 modules dans l'ordre nominal, remet UN lot par appel, curseur `cursor_module`/`cursor_offset` avancé transactionnellement, `rows` en objet `{table: [...]}`, `media_paths` préfixés par bucket (`household-media/...`, `household-avatars/...`), `done=true` à l'épuisement. Borne RGEX-03 : toute lecture filtre par l'acteur demandeur (fusion multi-foyers, Option A de 26-SPEC-DECISION.md).
- **0162** garde HTTP du déclencheur corrigée : `to_regproc` (et non `to_regclass`) pour tester l'existence de la fonction, et clé passée dans l'en-tête `apikey` — `Authorization: Bearer` renvoie 401 UNUSABLE_CREDENTIAL (motifs 0024/0025, régression 0158).
- **0163** wrapper `public.gdpr_export_extract_batch(uuid, integer)` : PostgREST n'expose que `public` et `graphql_public`, l'Edge ne peut donc pas appeler la fonction privée via `admin.rpc`. Wrapper SECURITY DEFINER, `search_path=''`, délégation pure, REVOKE public/anon/authenticated + GRANT service_role — la borne RGEX-03 reste dans le corps privé.
- **Edge `gdpr-export-run`** (`auth: ['secret']`) : claim atomique (UPDATE conditionnel re-vérifié, EvalPlanQual, aucune fenêtre SELECT→UPDATE), lease `pass_started_at` grâce 5 min + cron-minute `eo-gdpr-export-run`, extraction par lots via le RPC, manifeste par lot (`manifest/<module>-<offset>.txt`) garantissant la complétude des médias, copies cross-bucket `storage.copy(..., {destinationBucket})` (verdict A3), assemblage ZIP en flux fflate (`ZipDeflate` DEFLATE niveau 6 pour `donnees-rgpd.json`, `ZipPassThrough` STORE pour les médias) poussé DIRECTEMENT dans `upload()` (verdicts A1/A2), plafond 60 passes → `echec` lisible (D-02), zip-slip sûr (noms construits d'identifiants serveur uniquement), aucune URL signée jamais écrite (§2.6).

**Preuve E2E (job réel f5ab3904-c8bb-42c3-b1fb-c5082e9eeef0) :**
1. Job créé par `public.request_gdpr_export` (compte camille@test.local) → `en_attente`
2. Passe 1 : extraction complète (11 objets staging : 9 parts JSON, 1 manifeste, 1 média PNG copié) → `staging_ready=true`
3. Passe 2 : assemblage from-scratch → upload flux → `pret` avec `storage_path=<uid>/<job>.zip`
4. URL signée (POST sign, expiresIn 3600) → ZIP téléchargé (2 387 o) : `donnees-rgpd.json` valide — enveloppe `{"exporte_le", "modules"}` avec les 22 modules dans l'ordre nominal, la tâche « Tâche export e2e 26-03 » présente, fragments par module enveloppés en tableaux
5. `medias/household-media/household_a095bbf3…/notes/test-export-e2e.png` extrait : PNG 1×1 valide, octets intacts

### Task 2 — expansion robuste (absorbée dans le commit du tracer)

Le tracer a été exécuté à qualité production (jamais un jetable) : lease, plafond, échec honnête, replis A1/A2/A3 nommés en commentaires, exclusion `*.zip` du listing, budget 45 s rendu entre les étapes étaient déjà dans le code de la tâche 1. Vérifications de la tâche passées : `sh scripts/deploy-functions.sh` OK, 3 références `ZipPassThrough` (le STORE n'a pas été remplacé par un assemblage mémoire). Aucun delta de code → aucun commit séparé (consigné en déviations).

### Task 3 — preuves de résistance sur la stack

| Scénario | Preuve | Résultat |
|---|---|---|
| Crash + reprise | Passe tuée en cours d'isolate (log `early termination has been triggered` observé en réel pendant la mise au point) + lease expiré simulé (`pass_started_at = now() - 6 min`) → redrive | `pret` en reprenant le claim (pass_count incrémenté, pas doublé), assemblage from-scratch |
| Plafond → echec | `pass_count=61` forcé → déclenchement | `status='echec'`, `error = « export abandonné après 62 passes (plafond atteint). »` — lisible, jamais muet (D-02) |
| Retente après echec (D-06) | `public.request_gdpr_export` en session authenticated (camille) ALORS que l'ancien job est `echec` | Nouveau job `6bc942b2` accepté → `pret` en 2 passes, ZIP propre `<uid>/<job>.zip` |

Chaîne §2.7 : `sh scripts/test-db.sh 0158` vert (exit 0), `sh scripts/test-db.sh 0161` vert (exit 0 — périmètre, curseur sans répétition, préfixe média, P0002), `python3 scripts/check-sql-statique.py` — « 215 fonction(s) effective(s) sur 163 migration(s) et 95 test(s), aucun défaut ». La preuve réseau (téléchargement réel via lien signé) a été exécutée ci-dessus sur la stack locale avec appareil/stack disponibles ; rien n'est passé sous silence.

## Deviations from Plan

1. **[Rule 1 - Bug] Migration 0162** — la garde HTTP de 0158 testait `to_regclass('net.http_post')` (une fonction, pas une relation) et passait la clé dans `Authorization: Bearer` (401). Corrigé vers l'avant, motifs 0024/0025 cités.
2. **[Rule 1 - Bug] Migration 0163** — le tracer a révélé que PostgREST n'expose que `public`/`graphql_public` : le RPC privé était injoignable depuis l'Edge (« Could not find the function … in the schema cache »). Wrapper public réservé à service_role créé (motif delete_household/0160).
3. **[Rule 1 - Bug] Double-slash dans `listAll`** — l'appel passait un préfixe à slash final (`${root}/`), produisant des chemins `uid/job//parts` que les filtres `includes('/parts/')` ne reconnaissaient jamais : le ZIP d'assemblage était vide (modules `{}`). Corrigé (préfixe sans slash final + commentaire).
4. **[Consolidation] Tasks 2 et 3 sans commit séparé** — la robustesse (lease, plafond, D-02, replis, zip-slip) était déjà dans le commit du tracer (bcd2272, exécuté à qualité production) ; les deux tâches ont été VÉRIFIÉES et leurs preuves consignées ci-dessus, sans delta de code à committer.
5. **[Écart assumé] PASS_CAP=60** au lieu du ~10 du plan — raison documentée dans le doc-comment et la décision ci-dessus.
6. **Brouillon 0161 obsolète supprimé** — un squelette `0161_gdpr_export_extract_impl.sql` non suivi (types uuid/text faux) a été écarté au profit de `0161_gdpr_extract_batch.sql` écrit et appliqué.

## Auth Gates

Aucun — stack locale, secrets déjà dans Vault (UAT 2026-10-06).

## Known Stubs

Aucun. (Le PNG de test est désormais référencé par une vraie note + pièce jointe — l'objet orphelin initial n'aurait de toute façon jamais dû apparaître dans l'export, comportement correct du RPC.)

## Threat Flags

Aucun nouveau surface hors du threat model du plan : la fonction est déclarée `auth: ['secret']` (T-26-08), ne lit jamais les tables métier directement (RGEX-03), ne persiste aucune URL signée (§2.6), noms d'archive construits d'identifiants serveur (T-26-09).

## Self-Check: PASSED

- `supabase/functions/gdpr-export-run/index.ts` : présent (commit bcd2272)
- Migrations 0161/0162/0163 + test 0161 : présents (commit bcd2272), appliquées en base
- Commit bcd2272 : trouvé dans `git log`
- Tests 0158 + 0161 : exit 0 ; contrôle statique : aucun défaut
- Job E2E : `pret`, ZIP vérifié (enveloppe PK + média intact)
