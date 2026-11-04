---
phase: 29-messagerie-v2
plan: 01
subsystem: messagerie (SQL serveur)
tags: [sql, rpc, rls, conversations, read-receipts]
requires:
  - "conversations/conversation_members (0004) + create_conversation (0041, garde enfant 0146)"
  - "notification_reads watermark (0046, RLS own-only)"
  - "pierre tombale left_at (0100/0101), archive personnelle archived_at (0131)"
  - "garde D-06 managed_child_module_allowed (0146)"
provides:
  - "public.open_direct_conversation(text) returns jsonb {id, created} — anti-doublon D-05, verrou pg_advisory_xact_lock"
  - "public.conversation_read_receipts(text) returns table(member_id, display_name, color_tag, read_at) — watermarks co-membres actifs"
affects:
  - "29-02 (push groupé) : indépendant"
  - "29-05 (frontend messages) : appellera les deux RPC"
tech-stack:
  added: []
  patterns:
    - "SECURITY DEFINER + set search_path = '' + noms public. qualifiés (§2.7-A)"
    - "pg_advisory_xact_lock sur hash de la paire triée (Pattern 1, T-29-02)"
    - "returns table : colonnes qualifiées (piège plpgsql §2.7-A.5)"
key-files:
  created:
    - supabase/migrations/0171_direct_open_read_receipts.sql
    - supabase/tests/0171_direct_open_read_receipts.test.sql
  modified: []
decisions:
  - "Types TEXTE réels (private.new_id), pas uuid : le plan annonçait p_other_member_id uuid et returns table(uuid) — le schéma fait foi (household_members.id, conversations.id, notification_reads.scope_id sont text ; seul user_id est uuid)"
  - "Garde D-06/0146 ajoutée à open_direct_conversation (Rule 2) : un enfant géré sans module 'messages' est refusé 22023 — sans elle le RPC serait un contournement de create_conversation"
  - "« Membre actif » ciblé = account_deleted_at is null (0166) ; participation active = left_at is null seul (D-05/A1 : archived_at n'empêche pas la rouverture)"
  - "conversation_read_receipts réutilise private.assert_active_membership (0131) et exclut l'appelant de sa propre liste d'accusés"
metrics:
  duration: ~14 min
  completed: 2026-10-29T13:52Z
  tasks: 2
  files: 2
status: complete
actuals:
  tokens: 2100
  tasks: 2
  commits: 2
commits: 2
plan_head_before: 00fc5c7cf4fac42388c031df8770bcad8dcd73ec
plan_head_after: 668d40d1ab3efbab12c870e286c05c5a8ac7c5d2
---

# Phase 29 Plan 01: Socle SQL — open_direct_conversation & conversation_read_receipts Summary

**One-liner:** RPC `open_direct_conversation` (rouverture anti-doublon D-05, verrou consultatif sur la paire, garde enfant D-06) et RPC `conversation_read_receipts` (watermarks `notification_reads` des co-membres actifs, MSG-03), migration 0171 + tests 0171 verts.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Migration 0171 — les deux RPC | 6f10c40 | supabase/migrations/0171_direct_open_read_receipts.sql |
| 2 | Tests SQL 0171 — positifs, négatifs, accusés | 668d40d | supabase/tests/0171_direct_open_read_receipts.test.sql |

## Verification (§2.7)

- `python3 scripts/check-sql-statique.py` : **vert** (227 fonctions effectives, aucun défaut) ; `test-check-sql-statique.py` vert.
- **Vu rouge avant vert (§2.7-B)** : le fichier 0171 exécuté AVANT `migrate.sh` → rouge (`function public.open_direct_conversation(text) does not exist`) ; après migration → vert.
- `sh scripts/migrate.sh` : 0171 appliquée proprement (1 appliquée, 170 connues, RLS complète 80/80).
- `sh scripts/test-db.sh` : **99/100 verts**, 0171 OK — Docker disponible, suite réellement exécutée.
- Échec préexistant hors périmètre : `0147_child_push_adults.sql` (anniversaires/push D-23), reproduit SANS les fonctions 0171 (drop + rollback : même échec) → consigné dans `deferred-items.md`.

## Deviations from Plan

**1. [Rule 1 - Bug plan] Types uuid → texte**
- **Found during:** Task 1 (lecture du schéma 0002/0004/0046 avant d'écrire)
- **Issue:** le plan annonçait `p_other_member_id uuid` et `returns table(member_id uuid …)` ; tous les identifiants métier du dépôt sont TEXTE (`private.new_id`), seuls `user_id`/`notification_reads.user_id` sont uuid.
- **Fix:** signatures en `text` conformes au schéma réel (la base fait foi, §2.7).
- **Files modified:** 0171 (migration et tests).

**2. [Rule 2 - Garde critique manquante] Parité D-06/0146**
- **Found during:** Task 2 (première exécution des tests : « cet enfant n'a pas accès à la messagerie » levé par create_conversation 0146)
- **Issue:** open_direct_conversation insère directement `conversation_members` en SECURITY DEFINER et contournait la garde enfant « messages » posée sur create_conversation.
- **Fix:** même garde 22023 (`is_managed_child` + `managed_child_module_allowed(id,'messages')`) dans le RPC ; test 4 et fixture ajustés (`managed_modules = array['messages']` sur l'enfant semé).
- **Commit:** 6f10c40.

**3. [Rule 3 - Blocage test] `select … into` d'un jsonb**
- **Issue:** la fixture capturait l'objet jsonb entier de `create_conversation` dans une variable text → id invalide → « conversation inconnue ».
- **Fix:** extraction `->> 'id'` dans le bloc de semure du groupe.

## Known Stubs

Aucun — les deux fonctions sont complètes, granted à `authenticated`, refusées à `anon` (garde-fous `has_function_privilege` en fin de migration).

## Threat Model — mitigations livrées

- T-29-01 : refus 42501 hors fil actif (`assert_active_membership`), retour borné aux co-membres actifs du fil, cas négatifs inter-foyer + membre parti dans le test. ✔
- T-29-02 : `pg_advisory_xact_lock` sur hash de la paire triée ; garde anti-doublon prouvée (created=false au second appel, recréation après départ, count bornés). ✔
- T-29-03 : `security definer` + `set search_path = ''` + noms `public.` qualifiés + piège `returns table` évité (colonnes qualifiées) + contrôle statique vert. ✔

## Notes

- Un fil archivé (0131) non quitté est ROUVERT par le RPC (A1) — prouvé par le test 3.
- L'appelant est exclu de sa propre liste d'accusés (co-membres seulement).
