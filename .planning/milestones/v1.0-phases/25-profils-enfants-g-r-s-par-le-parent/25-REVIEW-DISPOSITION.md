---
phase: 25
review: 25-REVIEW.md
fix_report: 25-REVIEW-FIX.md
reconciled: 2026-10-26
decisions_source: "utilisateur, 2026-10-26 via orchestrateur : « oui je veux que les findings soient corrigés »"
---

# Phase 25 — Disposition des findings de code review

Une ligne par finding du REVIEW initial (10). Réconcilié avec `25-REVIEW-FIX.md` (9 fixés, 1 skippé).

| Finding | Sévérité initiale | Disposition | Preuve / Raison |
|---|---|---|---|
| CR-01 | Critical (blocker) | **fixed** | `12abce5` — migration `0150_household_members_delete_durci.sql` : DELETE direct refusé (42501) sur un enfant géré ; archivage RPC seul chemin. Test 0150 vu rouge puis vert. |
| WR-01 | Warning | **fixed** | `8700c5a` — 0151 : dédup `gift_list_shares` dans `link_managed_child`, fin du 23505. |
| WR-02 | Warning | **fixed** | `0d4f289` — 0152 : dédup `meal_entries.member_ids` avant `array_replace`, ordre préservé. |
| WR-03 | Warning | **fixed** | `0ab0636` — 0153 : self-join `routine_completions` mort supprimé (motif « contrôle qui ne regarde rien », §2.7-B, nommé en commentaire). |
| WR-04 | Warning | **fixed** | `ce4b1b7` — 0154 : avatar stocké au create + `p_clear_avatar` explicite à l'update. |
| WR-05 | Warning | **fixed** | `5fba638` — câblage UI `canDeleteComment` (hook → CommentsDialog/PostCard), preuve inverse exécutée (revert contrôlé → rouge → restauration). |
| WR-06 | Warning | **fixed** | `317a14e` — filtre `eligibleIds` du pré-remplissage `assigneeIds` (tâches + routines), fin du blocage 42501 après révocation. |
| IN-01 | Info | **fixed** | `2f9d132` — 0155 : `comment on function` documentant l'asymétrie `birth_date`. |
| IN-02 | Info | **fixed** | `9698497` — 0156 : garde conversationnelle 22023 sur la promotion d'un enfant géré. |
| IN-03 | Info | **skipped** | Le review lui-même conclut « aucune action requise » : le fichier 0148 dépassé est conservé comme trace historique (§2.7-A — jamais réécrire une migration appliquée). |

## Validation post-fix (re-prouvée sur `main`, 2026-10-26)

- `python3 scripts/check-sql-statique.py` — 209 fonctions / 156 migrations / 92 tests, aucun défaut
- `python3 scripts/test-check-sql-statique.py` — 6 cas verts
- `sh scripts/test-db.sh` (sans argument) — **90/90 verts** (7 fichiers de test nouveaux)
- `cd app && npm run typecheck` ✓ · `npm test` **1624/1624** ✓ · `npm run build` ✓ · `npm run test:e2e` **155 passed** ✓

## Notes

- Les artefacts de review vivent sur disque (`.planning/phases/` gitigné — convention du dépôt, committés à l'archivage milestone).
- Décision de correction prise par l'utilisateur (2026-10-26) ; périmètre : tous les findings, IN-03 skippé avec justification.
