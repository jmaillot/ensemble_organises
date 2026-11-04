---
phase: 26-export-rgpd
verified: 2026-10-27T12:00:00Z
status: passed
score: 4/4 critères de succès vérifiés
covered_digest: "v2:sha256:1e91acd6c99ce5f1c7842d3439c64e4c0f18d613727750b2d3be3c91aa98f12f"
covered_files:
  - .planning/phases/26-export-rgpd/26-01-PLAN.md
  - .planning/phases/26-export-rgpd/26-01-SUMMARY.md
  - .planning/phases/26-export-rgpd/26-02-PLAN.md
  - .planning/phases/26-export-rgpd/26-02-SUMMARY.md
  - .planning/phases/26-export-rgpd/26-03-PLAN.md
  - .planning/phases/26-export-rgpd/26-03-SUMMARY.md
  - .planning/phases/26-export-rgpd/26-04-PLAN.md
  - .planning/phases/26-export-rgpd/26-04-SUMMARY.md
  - .planning/phases/26-export-rgpd/26-05-PLAN.md
  - .planning/phases/26-export-rgpd/26-05-SUMMARY.md
  - .planning/phases/26-export-rgpd/26-06-PLAN.md
  - .planning/phases/26-export-rgpd/26-06-SUMMARY.md
  - .planning/phases/26-export-rgpd/26-07-PLAN.md
  - .planning/phases/26-export-rgpd/26-07-SUMMARY.md
  - supabase/migrations/0158_gdpr_export.sql
  - supabase/migrations/0159_gdpr_export_fixes.sql
  - supabase/migrations/0160_gdpr_export_privileges.sql
  - supabase/migrations/0161_gdpr_extract_batch.sql
  - supabase/migrations/0162_gdpr_http_guard.sql
  - supabase/migrations/0163_gdpr_extract_batch_wrapper.sql
  - supabase/migrations/0164_gdpr_push_export.sql
  - supabase/migrations/0165_gdpr_export_batch_start.sql
  - supabase/functions/gdpr-export-run/index.ts
  - supabase/functions/gdpr-export-purge/index.ts
  - supabase/functions/push-notify/index.ts
  - app/src/modules/parametres/api.ts
  - app/src/modules/parametres/components/gdpr-export-panel.tsx
  - app/src/modules/parametres/parametres-page.tsx
  - supabase/tests/0158_gdpr_export.sql
  - supabase/tests/0161_gdpr_extract_batch.sql
  - supabase/tests/0164_gdpr_push_export.sql
  - supabase/tests/0165_gdpr_purge_cloture.sql
re_verification:
  previous_status: passed
  previous_score: 4/4
  gaps_closed: []
  gaps_remaining: []
  regressions: []
deferred:
  - truth: "Livraison push réellement reçue sur un appareil abonné (RGEX-01, volet notification)"
    addressed_in: "Phase 31 (OUV-07)"
    evidence: "scripts/test-dispatch-push.sh refuse lui-même un endpoint factice (« dropped » ≠ « delivered ») ; public.push_subscriptions = 0 ligne sur l'instance — absence nommée, consignée dans 26-07-SUMMARY.md et reprise à la porte 31"
---

# Phase 26 : Export RGPD — Rapport de vérification (re-vérification, digest régénéré)

**Goal :** archive complète des données personnelles (JSON structuré + médias, ZIP) par lien signé expirant sur bucket privé, sans blocage ni fuite inter-membre/inter-foyer ; portée multi-foyers tranchée en SPEC avant le SQL.
**Verified :** 2026-10-27
**Status :** passed
**Re-verification :** Oui — vérification précédente (2026-10-27, 4/4) signalée périmée par `phase complete` : digest non aligné sur l'arbre après les corrections de review `ac2dc3c` (CR-01), `05ec120` (HR-02), `85ca920` (MR-01), `e9be126` (MR-02). Les quatre critères ont été re-testés avec exécution réelle.

## Vérification but-à-tir (goal-backward)

| # | Critère de succès | Statut | Preuve |
|---|---|---|---|
| 1 | Déclenchement depuis l'app + statut du job + notification à l'achèvement | ✓ VÉRIFIÉ | RPC `public.request_gdpr_export` (0158:143) ; panneau `gdpr-export-panel.tsx` : polling `isActive` sur `en_attente`/`en_cours` (D-03, lignes 25-26, 46, 84-90), labels de statut (l.120, 199-200) ; notification push = migration `0164_gdpr_push_export.sql` (chaîne push existante réécrite, test `supabase/tests/0164_gdpr_push_export.sql` vert). Livraison sur appareil réel : deferred → phase 31 (0 abonnements, absence nommée). |
| 2 | Archive = JSON structuré + médias, URL signée `gdpr-exports` ≤ 24 h | ✓ VÉRIFIÉ | Bucket privé `gdpr-exports` créé en 0158:70 (lectures publiques interdites, mime restreint `application/zip`) ; fragments JSON paginés `part-<module>-<batch_start_offset>` (0165:10-48, tri entier côté Edge) ; médias copiés par `gdpr-export-run/index.ts` avec chemins préfixés par bucket (0165:41-48, `media_paths`) ; `app/src/modules/parametres/api.ts:463` — `createSignedUrl(storagePath, 86400)` = expiration exactement 86400 s = 24 h. |
| 3 | Tests SQL négatifs : jamais de débordement inter-foyer ni inter-membre | ✓ VÉRIFIÉ | `supabase/tests/0158_gdpr_export.sql` : scénario à 3 utilisateurs/2 foyers (alice/bob/charlie, lignes 38-54), `expect_denied` pour utilisateur d'un autre foyer et pour la reprise d'un job d'autrui (l.11-13, 149, 227) ; borne d'isolement vit dans le RPC `extract_next_batch` (0165:39-40 : « La borne d'isolement RGEX-03 vit ICI, en SQL ») ; `0161` prouve le curseur, le périmètre et le chemin `task_assignees` (MR-02 : l.58-62, 129, 160 — renvoi non tautologique). |
| 4 | Contenu `gdpr-exports` purgé à 7 jours par pg_cron — vérifié en base | ✓ VÉRIFIÉ | `expires_at default now() + interval '7 days'` (0158:105) ; table d'audit `gdpr_export_purge_log` (0158:126-135) ; garde pg_cron action `'purge'` ne POSTant que si des candidats existent (0158:371-382) ; job `eo-gdpr-export-purge` quotidien `27 4 * * *` (0158:409-441) ; Edge `gdpr-export-purge` avec clôture CR-01 (l.44-68, 240 : « Un job entièrement purgé est CLÔTURÉ », comptage sur ligne supprimée) ; test `supabase/tests/0165_gdpr_purge_cloture.sql` (129 lignes, insertion d'un job purgé + audit) vert en base. |

**Score :** 4/4 critères vérifiés (0 comportement non exercé)

## Exécution réelle (preuve vive, cette re-vérification)

| Contrôle | Commande | Résultat | Statut |
|---|---|---|---|
| Chaîne §2.7 front | `cd app && npm run typecheck && npm test && npm run build` | typecheck 0 erreur ; suite vitest complète verte ; build OK (`dist/sw.js` généré) | ✓ PASS |
| Contrôle statique SQL | `python3 scripts/check-sql-statique.py` | exit 0 — 216 fonctions effectives sur 165 migrations, 97 tests, aucun défaut | ✓ PASS |
| Auto-preuve du contrôle | `python3 scripts/test-check-sql-statique.py` | 6 cas, tous verts | ✓ PASS |
| Tests SQL en base | `sh scripts/test-db.sh` | 95 fichier(s), tous verts — dont `0158_gdpr_export.sql`, `0161_gdpr_extract_batch.sql`, `0164_gdpr_push_export.sql`, `0165_gdpr_purge_cloture.sql` explicitement listés en fin de rapport | ✓ PASS |

## Corrections de review re-vérifiées sans régression

| Commit | Correction | Spot-check | Verdict |
|---|---|---|---|
| `ac2dc3c` | CR-01 — clôture des jobs entièrement purgés (la purge ne cale plus après 50 exports) | `gdpr-export-purge/index.ts:44-68, 240` : job purgé = ligne supprimée = clôturé, comptage sur `purged_jobs` corrigé ; test `0165_gdpr_purge_cloture.sql` vert en base | ✓ |
| `05ec120` | HR-02 — ordre des fragments JSON (`batch_start_offset` exposé, tri entier côté Edge) | 0165:10-48 (justification + forme du lot), retour jsonb enrichi l.104-105, 633-641 ; commentaire de fonction à jour | ✓ |
| `85ca920` | MR-01 — `safeMediaPath` côté Edge (anti zip-slip) | `gdpr-export-run/index.ts:114-123` : bucket connu + aucun segment vide/`.`/`..`, normalisation ; utilisée l.366 ; passe finale exclut les `*.zip` (l.413-414) | ✓ |
| `e9be126` | MR-02 — assertion tautologique 0161 remplacée par un renvoi au chemin `task_assignees` | `supabase/tests/0161_gdpr_extract_batch.sql:58-62` (tâche créée par Bob, assignée à Alice), l.129, 160 — l'insertion prouve le chemin, l'assertion le compte | ✓ |

## Couverture des exigences

| Exigence | Statut | Preuve |
|---|---|---|
| RGEX-01 (demande + suivi + notification) | ✓ SATISFAIT | RPC 0158:143, panneau `gdpr-export-panel.tsx` (polling D-03), push 0164 — livraison réelle deferred phase 31 |
| RGEX-02 (ZIP JSON + médias, lien signé ≤ 24 h) | ✓ SATISFAIT | api.ts:463 (86400 s), bucket 0158:70, fragments + médias 0161/0165, Edge `gdpr-export-run` |
| RGEX-03 (jamais la donnée d'un autre foyer/membre) | ✓ SATISFAIT | Borne dans le RPC (0165:39-40), tests négatifs `0158` §3 (expect_denied l.149, 227), `0161` MR-02 |
| RGEX-04 (purge 7 jours par pg_cron) | ✓ SATISFAIT | 0158:105, 126-135, 371-441 ; Edge purge CR-01 ; test 0165 vert |

## Éléments différés (Step 9b)

| # | Élément | Différé vers | Preuve du rattachement |
|---|---|---|---|
| 1 | Livraison push sur appareil abonné (volet notification de RGEX-01) | Phase 31 (OUV-07) | `scripts/test-dispatch-push.sh` exige un abonnement réel (« dropped » ≠ « delivered ») ; `public.push_subscriptions` = 0 sur l'instance — absence nommée et assumée (§2.7), reprise au backlog 26-REVIEW-DISPOSITION.md |

Accepté comme non-échec (mandat de re-vérification) : cette livraison push, et les items backlog consignés dans 26-REVIEW-DISPOSITION.md.

## Verdict

Aucune régression des quatre corrections de review : les fichiers touchés portent bien les correctifs, la chaîne §2.7 complète est verte avec exécution réelle (base Docker incluse). Le goal de la phase 26 est atteint dans le code actuel.

---

_Verified: 2026-10-27T12:00:00Z_
_Verifier: the agent (gsd-verifier)_
