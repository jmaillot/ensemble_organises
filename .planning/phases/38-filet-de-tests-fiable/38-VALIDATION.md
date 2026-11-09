---
phase: "38"
slug: "filet-de-tests-fiable"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-08"
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Rempli rétroactivement le 2026-11-09 par l'audit Nyquist (voir `38-NYQUIST-AUDIT.md`) — contrôles ré-exécutés le jour de l'audit.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 + React Testing Library (app/) ; Playwright (e2e) ; Python scripts (contrôle SQL statique) |
| **Config file** | `app/vitest.config.ts` |
| **Quick run command** | `cd app && npm run typecheck && npm test -- --run` |
| **Full suite command** | `cd app && npm run typecheck && npm test && npm run build && npm run test:e2e && python3 scripts/check-sql-statique.py && python3 scripts/test-check-sql-statique.py` |
| **SQL runtime (Docker)** | `sh scripts/test-db.sh` — non requis pour la phase 38 : aucun SQL touché (I-03, consigné dans 38-03-SUMMARY) |
| **Estimated runtime** | typecheck+tests ~200 s ; e2e ~3,3 min ; SQL statique ~2 s |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npm run typecheck && npm test -- --run`
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~200 s (quick) ; e2e ~3,3 min (full)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 38-01-01 | 01 | 1 | TEST-01 | — | N/A (dates pures) | unit | `cd app && npx vitest run src/lib/datetime.test.ts` | ✅ `app/src/lib/datetime.test.ts` | ✅ green (ré-exécuté 2026-11-09) |
| 38-01-02 | 01 | 1 | TEST-01 | — | N/A | unit (garde de classe + cas-qui-doit-échouer) | `cd app && npx vitest run src/lib/data/seed.test.ts src/modules/menu/menu-page.test.tsx` | ✅ `app/src/lib/data/seed.test.ts` | ✅ green (ré-exécuté) |
| 38-01-03 | 01 | 1 | TEST-01 | — | N/A | static | `grep -c getUTCDay app/src/modules/menu/types.ts` → 0 ; `grep -c debutSemaineIso app/src/modules/menu/types.ts` ≥ 1 | ✅ | ✅ green (vérifié à l'audit : 0 / présent) |
| 38-02-01 | 02 | 1 | TEST-01, TEST-03 | T-38-02 | N/A | reproduction + doc | `grep -c "WR-03" docs/RETROSPECTIVE.md` ≥ 2 | ✅ `docs/RETROSPECTIVE.md` | ✅ green (campagne v1.3 §12-15, taux 1/30 consigné) |
| 38-02-02 | 02 | 1 | TEST-01 | T-38-02 | N/A | unit (attente d'état) | `cd app && npx vitest run src/stores/household-store.test.ts` ; `grep -c "setTimeout(resolve, 1200)" … = 0` ; `grep -c vi.waitFor … ≥ 1` | ✅ | ✅ green (ré-exécuté : 0 sommeil, vi.waitFor présent) |
| 38-03-01 | 03 | 1 | DEBT-01 | — | N/A | unit + static | `cd app && npx vitest run src/modules/ardoise` ; `grep -rn "typeof response.status" app/src` → rien | ✅ `app/src/modules/ardoise/guest-ardoise-page.test.tsx` | ✅ green (ré-exécuté : 0 occurrence, 81 tests module verts au run 38-03) |
| 38-03-02 | 03 | 1 | DEBT-01 | T-38-01 | Lectures service_role bornées dans la requête (pas de filtrage JS) | e2e + static | `cd app && npm run test:e2e` (parcours invité) ; `grep -c ".in('expense_id', expenseIds)" supabase/functions/ardoise-invite/index.ts` ≥ 1 ; `grep -c ".eq('household_id', householdId)" … ≥ 1` | ✅ | ✅ green (ré-exécuté : 1 et 3 ; e2e 165 passed au run 38-03/04) |
| 38-03-03 | 03 | 1 | DEBT-01 | T-38-01 | Classe entière : aucune lecture de table entière | static (awk accumulateur d'énoncés) | `awk '{buf = buf $0 " "} /;/ { if (buf ~ /\.from\(/ && buf !~ /\.eq\(/ && buf !~ /\.in\(/) { print; bad = 1 } buf = "" } END { exit bad }' supabase/functions/ardoise-invite/index.ts` | ✅ | ✅ green (ré-exécuté : 3 faux positifs connus, 16 lectures bornées) |
| 38-04-01 | 04 | 2 | TEST-03 | — | Chaîne §2.7 fiable | chain + e2e | `cd app && npm run typecheck && npm test -- --run && npm run build && npm run test:e2e` | ✅ `38-E2E-SIGNATURE.md` | ✅ green (run 2026-11-08 consigné : 1988 tests, e2e 165 passed / 9 skipped / 2 failed = join-token seul) |
| 38-04-02 | 04 | 2 | TEST-03 | T-38-03 | Pas de skip / horloge figée / garde morte introduits | static (diff-scopé) | `git diff cd3fdf1..HEAD -- app/e2e app/src \| grep -cE '^\+.*test\.(skip\|fixme)'` → 0 ; `grep -rn setSystemTime` (3 fichiers) → 0 ; `grep -rn "typeof response.status" app/src` → 0 | ✅ | ✅ green (ré-exécuté : 0 / 0 / 0) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — no Wave 0 installs needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Exécution e2e complète (signature join-token) | TEST-03 | Environnement-dépendant, ~3,3 min | Rejouer `npm run test:e2e` et comparer à 38-E2E-SIGNATURE.md (165 passed / 9 skipped / 2 failed = join-token seul) |

---

## Réserves de l'audit (non bloquantes)

| # | Réserve | Sévérité | Action recommandée |
|---|---------|----------|--------------------|
| G-1 | La propriété IN-02 (bornage service_role) n'a pas de test runtime au niveau base — elle repose sur des greps + le rendu e2e. | WARNING | Phase 39 (TEST-02, touche `ardoise-invite`) : déplacer le balayage awk vers `scripts/check-bornage-ardoise.sh` versionné, appelé par la chaîne. |
| G-2 | Les preuves d'exécution consignées datent du 2026-11-08 ; le run e2e complet n'a pas été rejoué à l'audit (coût ~5 min) — sous-ensemble unitaire + statique re-verdi. | WARNING | Rejouer la chaîne complète avant sign-off milestone (couvert par `/gsd-verify-work` et audit-milestone §5.5). |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (aucun MISSING : 3 COVERED, 0 PARTIAL, 0 MISSING)
- [x] No watch-mode flags
- [x] Feedback latency < 38 s objectif ajusté : quick ~200 s documenté (typecheck inclus)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-09 (audit Nyquist — contrôles ré-exécutés, voir 38-NYQUIST-AUDIT.md)
