---
phase: 02-dossiers
verified: 2026-10-06T15:45:00Z
status: passed
score: 8/8 must-haves verified
covered_files:
  - .planning/phases/02-dossiers/02-CONTEXT.md
  - supabase/migrations/0050_folders.sql
  - supabase/migrations/0051_folders_rls.sql
  - supabase/migrations/0052_folders_triggers_seed.sql
  - supabase/migrations/0053_guard_folder_delete.sql
  - supabase/migrations/0054_create_household_seeds.sql
  - supabase/migrations/0073_folder_guard_cascade.sql
  - supabase/tests/0017_folders.sql
  - app/src/components/shared/folder-tabs.tsx
  - app/src/components/shared/folder-tabs.test.tsx
  - app/src/modules/taches/api.ts
  - app/src/modules/taches/hooks/use-taches.ts
  - app/src/modules/taches/taches-page.tsx
  - app/src/modules/taches/folders.test.ts
  - app/src/modules/taches/taches-page.test.tsx
  - app/src/modules/notes/api.ts
  - app/src/modules/notes/hooks/use-notes.ts
  - app/src/modules/notes/notes-page.tsx
  - app/src/modules/notes/folders.test.ts
  - app/src/modules/notes/notes-page.test.tsx
  - app/src/modules/routines/api.ts
  - app/src/modules/routines/hooks/use-routines.ts
  - app/src/modules/routines/routines-page.tsx
  - app/src/modules/routines/folders.test.ts
  - app/src/modules/routines/routines-page.test.tsx
  - app/e2e/critical-paths.spec.ts
covered_digest: "v2:sha256:27833ed16705366b4992360c7d4fdb1c79e23090f8234b65a8c58f6350ec4db7"
behavior_unverified: 0
overrides_applied: 0
gaps: []
advisory:
  - finding: "0016_calendrier_rls.sql en échec (duplicate key event_calendriers_perso_owner_unique)"
    category: other
    reason: "Fallout phase 01 : trigger auto-Perso 0085 vs insert manuel du test ; hors périmètre dossiers, à traiter côté calendrier"
    evidence_status: "test-db.sh 2026-10-06 : 30/31, seul 0016 en échec, 0017_folders OK"
---

# Phase 02 (1b): Dossiers Verification Report

As-built verification (2026-10-06) — implementation predates discussion, tree untouched by this session.

## Must-haves (from PHASES/02-dossiers.md, all verified against code + tests)

1. Tables task_lists/note_folders/routine_folders — `0050_folders.sql:11,24,37` ✓
2. Items folder_id SET NULL, delete → Général — `0052:6`, toast + `use-taches.ts:76`, 0017 ✓
3. RLS foyer/perso/enfant lecture seule — `0051`, 0017 (Alice/Bob/Noé vs Carol) ✓
4. Triggers validate/guard + seed create_household + backfill — `0052:55-66,122-230`, `0054` ✓
5. Général unique partiel immuable — `0050:51-53`, garde `raise exception` ✓
6. Frontend CRUD/move + activeFolderId + filtres combinés + folder-tabs tablist + Select assigné + enfant sans CTA — folder-tabs.tsx:27, use-taches.ts:87,94, 3 modules ✓
7. Tests — 0017_folders OK (test-db), folders.test ×3 + folder-tabs.test + 4 page suites 35/35 Vitest, e2e critical-paths inchangé ✓
8. Chaîne §2.7 non-Docker — typecheck vert, statique vert (132 fonctions, aucun défaut) ✓

## Automated checks (this session)
- `npm run typecheck` (app) : vert
- Vitest dossiers : 7 fichiers, 35/35 verts
- `check-sql-statique.py` : vert
- `test-db.sh` : 30/31 — `0017_folders.sql` OK ; `0016_calendrier_rls.sql` ÉCHEC (hors scope, voir advisory)
- e2e : non rejoué (aucun fichier touché par cette session)
