---
phase: 26-export-rgpd
fixed_at: 2026-10-27T13:00:00Z
review_path: .planning/phases/26-export-rgpd/26-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
backlog: HR-01, HR-03, HR-04, MR-03, MR-04, LR-01, LR-02, LR-03, LR-04, LR-05, NT-01, NT-02
---

# Phase 26 : Code Review Fix Report

**Fixed at:** 2026-10-27
**Source review:** 26-REVIEW.md (11 findings — 4 corrigés sur périmètre approuvé, 7 + HR-01 renvoyés au backlog)

## Fixed Issues

### CR-01 : La purge RGPD s'arrête définitivement après 50 exports expirés — commit ac2dc3c

`supabase/functions/gdpr-export-purge/index.ts` : un job dont AUCUN chemin ne reste à traiter (rien trouvé en Storage, tout déjà loggé `removed=true`, ou suppression intégralement réussie dans le passage) est **clôturé** — sa ligne `gdpr_export_jobs` est supprimée. L'audit RGEX-04 survit (`on delete set null` sur `gdpr_export_purge_log.job_id`, 0158). Un échec partiel garde la ligne : la reprise du lendemain finit puis clôture. Nouveau test `supabase/tests/0165_gdpr_purge_cloture.sql` prouvant le cas qui échouait avant correction : 50 jobs déjà purgés + un 51ᵉ expiré → fenêtre des 50 candidats pleine et 51ᵉ exclu (état du bug reproduit) → clôture → le 51ᵉ redevient candidat, audit intact (50 lignes `removed=true`, `job_id` nullifié).

### HR-02 : Ordre des fragments JSON faux — commit 05ec120

Nouvelle migration `0165_gdpr_export_batch_start.sql` (0161 appliquée, jamais réécrite — §2.7A) : le RPC expose `batch_start_offset` = offset de DÉBUT du lot avant avance du curseur (signature et forme jsonb inchangées, `cursor_offset` conservé). Edge `gdpr-export-run` : fragment nommé `<module>-<batch_start_offset>` (repli défensif sur `cursor_offset`) et tri sur l'ENTIER (le lexical resterait faux : '1000' < '500'). Preuves : test SQL section 5 de `0161_gdpr_extract_batch.sql` (5 tâches de Bob, limite 2 → lots de débuts 0/2/4) + vérification unitaire du comparateur extrait du fichier livré ('tasks-0' < 'tasks-500' < 'tasks-1000' < 'tasks-1200').

### MR-01 : zip-slip sur les chemins de médias — commit 85ca920

Edge `gdpr-export-run` : `safeMediaPath()` valide chaque chemin de média (bucket connu, aucun segment vide / `.` / `..`) AVANT construction du chemin de staging ; garde identique dans `copyMediaToStaging` ; rejeu de manifeste et nom d'entrée ZIP protégés (un nom refusé n'entre jamais dans le central-directory). Valeurs refusées journalisées et comptées manquantes (§2.7F, jamais muet). Commentaire T-26-09 corrigé : il affirmait à tort qu'aucun nom ne dérive d'une chaîne client. Défense en code, pas en commentaire. Preuve : 10 cas unitaires (dont `../`, `//`, `./`, bucket inconnu, hérités http/data/blob) exécutés sur la fonction extraite du fichier livré.

### MR-02 : Assertion tautologique 0158 §3d — commit e9be126

`supabase/tests/0158_gdpr_export.sql` : §3d supprimé (renvoi en commentaire vers 0161, conformément à la revue). `supabase/tests/0161_gdpr_extract_batch.sql` : semis étendu (tâche de Charlie, tâche créée par Bob **assignée** à Alice) + 4 assertions réelles : tâche de Charlie JAMAIS extraite ; tâche partagée extraite exactement une fois via le chemin `task_assignees` ; son assignation à Alice extraite avec elle ; la tâche de Bob (créateur seul) toujours absente.

## Backlog (non corrigés — verdicts de 26-REVIEW.md inchangés)

HR-01 (double dispatch push export), HR-03 (secondaires « module entier » dupliqués dans les lots paginés), HR-04 (erreurs par-objet de `storage.remove()` invisibles), MR-03 (pagination par offset sous écriture concurrente), MR-04 (`consume_push_reminders` avorte sur id non-UUID), LR-01 à LR-05, NT-01, NT-02.

## Vérification (§2.7)

Ranée dans le worktree isolé sauf la chaîne app (node_modules du checkout principal) :

- `python3 scripts/check-sql-statique.py` : 216 fonctions / 165 migrations / 97 tests, aucun défaut.
- `python3 scripts/test-check-sql-statique.py` : 6 cas, tous verts.
- `sh scripts/migrate.sh` : 0165 appliquée (78 lignes).
- `sh scripts/test-db.sh` (complet) : **95 fichiers, tous verts** (dont 0158, 0161 enrichi, 0165 nouveau).
- `sh scripts/deploy-functions.sh` + `run.sh recreate functions` + sonde HTTP : `gdpr-export-run` et `gdpr-export-purge` répondent 400 (mode secret franchi, corps rejeté par le schéma — le handler sert).
- `cd app && npm run typecheck` : OK. `npm test` : 202 fichiers / **1636 tests passés**. `npm run build` : OK (précaché 138 entrées).
- Non exécuté (hors scope SQL/push inchangé) : `sh scripts/test-dispatch-push.sh`, e2e Playwright — chaîne e2e verte en 26-07 inchangée côté app.

_Note : un job RGPD en cours pendant le déploiement pourrait mélanger des fragments nommés ancienne/nouvelle façon (anciens lots nommés post-avance) — un export relancé après correction est correct ; aucun job actif détecté au moment du fix._
