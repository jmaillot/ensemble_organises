# Phase 02: Dossiers - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-06
**Phase:** 02-Dossiers (roadmap label « Phase 1b »)
**Areas discussed:** Scope-state gate (pre-built discovery) — no gray areas debated

---

## Scope-state gate

| Option | Description | Selected |
|--------|-------------|----------|
| Verify then close | Run verification on the existing dossiers implementation and mark Phase 1b complete if green | ✓ |
| Show me the proof | Present the file-by-file evidence mapping spec bullets to artifacts first | |
| Discuss anyway | Proceed with the gray-area discussion as if this were greenfield | |

**User's choice:** Verify then close
**Notes:** Codebase scout (migrations 0050-0053+0073, suite 0017_folders, folder-tabs partagé, activeFolderId ×3 modules, Général, filtre assigné, e2e critical-paths) showed every spec bullet already implemented. User opted to verify the existing work rather than re-discuss or re-prove mapping first. No gray-area questions were asked — asking « how to build dossiers » would have been fiction.

Verification run (2026-10-06, tree untouched, no commits by this session) :
- typecheck app : vert
- Vitest dossiers : folder-tabs + taches/notes/routines folders + 4 page suites = 35/35 verts (9 + 26)
- `check-sql-statique.py` : vert (132 fonctions effectives, aucun défaut)
- `test-db.sh` : 30/31 — `0017_folders.sql` OK ; seul échec `0016_calendrier_rls.sql` (fallout phase 01 : trigger auto-Perso 0085 vs insert manuel du test, contrainte `event_calendars_perso_owner_unique`), hors périmètre, reporté en deferred de CONTEXT.md
- e2e non rejoué (aucun fichier serveur touché ; couverture dossiers via critical-paths.spec.ts inchangée)

---

## the agent's Discretion

None — user chose a routing option, not a design delegation. CONTEXT.md records as-built decisions read from the code.

## Deferred Ideas

- `0016_calendrier_rls.sql` en échec (collision auto-Perso 0085) — à traiter côté phase calendrier, pas en 1b.
- Tooling gap : `init.phase-op` ne résout ni « 1b » ni « 02 » (label roadmap « Phase 1b » vs spec `PHASES/02-dossiers.md`) — phase adressée manuellement en « 02 ».
- Spec `PHASES/02-dossiers.md` périmée sur les numéros (0047-0050 → réel 0050-0053+0073) — périmètre seul fiable.
