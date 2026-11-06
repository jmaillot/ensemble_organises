---
phase: "34"
slug: "file-d-criture-rejeu"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-05"
updated: "2026-11-06"
---

# Phase 34 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Réconciliée le 2026-11-06 par l'audit Nyquist post-exécution : les 6 lignes seedées
> pointaient des noms de fichiers devinés jamais créés — chacune est couverte par un
> test réel existant et vert (aucun trou, aucun test redondant généré).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5 + React Testing Library (frontend) ; testkit SQL in-container (test-db.sh) |
| **Config file** | `app/vite.config.ts` (vitest) — none for SQL tests |
| **Quick run command** | `cd app && npx vitest run src/lib/offline src/lib/data src/lib/query-policy.test.ts` |
| **Full suite command** | `cd app && npm run typecheck && npm test && npm run build` ; `sh scripts/test-db.sh` (Docker) ; `python3 scripts/check-sql-statique.py` |
| **Estimated runtime** | ~60 s (frontend suite) ; ~2 min (test-db.sh) |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npx vitest run src/lib/offline src/lib/data src/lib/query-policy.test.ts`
- **After every plan wave:** Run `cd app && npm run typecheck && npm test && npm run build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

Carte réconciliée par l'audit Nyquist du 2026-11-06 — remplace les lignes seedées
(fichiers devinés jamais créés, aucun ne constituait un trou réel).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 34-01-01 | 01 | 1 | WRQ-01 | T-34-01 | client_key non null, upsert borné au foyer (RLS inter-foyer expect_denied) | sql (Docker) | `sh scripts/test-db.sh` | ✅ `supabase/tests/0177_client_key.test.sql` | ✅ green (104/104, supabase/ inchangé depuis) |
| 34-01-02 | 01 | 1 | WRQ-01 | T-34-11 | client_key généré côté client ; upsert×2 = 1 ligne (idempotence) | unit + sql | `cd app && npx vitest run src/lib/offline/outbox.test.ts` ; `sh scripts/test-db.sh` | ✅ `outbox.test.ts` + `0177_client_key.test.sql` | ✅ green |
| 34-02-01 | 02 | 2 | WRQ-02 | T-34-03/T-34-04/T-34-05 | meta identifie table/op ; 42501 jamais enfilé ; prune namespacée | unit | `cd app && npx vitest run src/lib/offline/outbox.test.ts src/lib/query-policy.test.ts` | ✅ | ✅ green |
| 34-02-02 | 02 | 2 | WRQ-03 | T-34-05 | refus upfront hors allowlist ; garde inerte en ligne | unit | `cd app && npx vitest run src/lib/data/write-policy.test.ts src/lib/query-policy.test.ts` | ✅ | ✅ green |
| 34-03-01 | 03 | 2 | WRQ-02 | T-34-02/T-34-06/T-34-07 | rejeu FIFO exactement-une-fois, non-boucle, via adaptateur typé | unit | `cd app && npx vitest run src/lib/offline/outbox-replay.test.ts` | ✅ | ✅ green |
| 34-03-02 | 03 | 2 | WRQ-04 | T-34-02 | terminal → failed, jamais rejoué ; retryable repasse pending | unit | `cd app && npx vitest run src/lib/offline/outbox-replay.test.ts` | ✅ | ✅ green |
| 34-04-01 | 04 | 3 | WRQ-05 | T-34-08 | compteur d'écritures en attente visible (badge) | unit | `cd app && npx vitest run src/hooks/use-outbox.test.ts src/hooks/use-outbox-replay-badge.test.ts` | ✅ | ✅ green |
| 34-04-02 | 04 | 3 | WRQ-05 | T-34-09/T-34-10 | Réessayer/Abandonner : confirm-dialog, retry explicite unique | unit | `cd app && npx vitest run src/modules/parametres/components/offline-panel.test.tsx src/components/banners/banner-slot.test.tsx` | ✅ | ✅ green |
| 34-04-03 | 04 | 3 | WRQ-06 | T-34-08 | purge outbox au signOut / au changement de foyer (D-17, WR-01) | unit | `cd app && npx vitest run src/stores/session-store.test.ts src/hooks/use-auth.test.ts` | ✅ | ✅ green |
| 34-05-01 | 05 | 3 | WRQ-03 | T-34-13/T-34-12 | garde de classe à la frontière adaptateur, 0 fetch hors ligne | unit | `cd app && npx vitest run src/lib/data/write-policy.test.ts src/lib/data/supabase-adapter.test.ts` | ✅ | ✅ green |
| 34-05-02 | 05 | 3 | WRQ-02 | T-34-13 | écritures d'articles Courses routées Tier 1 (itemResource) | unit | `cd app && npx vitest run src/modules/courses/courses.test.tsx src/modules/courses/scan-flow.test.tsx` | ✅ | ✅ green |
| 34-05-03 | 05 | 3 | WRQ-02 | T-34-13 | régression (a)-(f) : enfilage sans fetch, réconciliation sans doublon | unit | `cd app && npx vitest run src/modules/courses/courses-offline-writes.test.tsx src/modules/courses/delete-shopping-list.test.ts` | ✅ | ✅ green |
| 34-06-01 | 06 | 4 | UAT-34-1 | T-34-14 | isEnqueuedFailure : échec enfilé absorbé, refus propagés | unit | `cd app && npx vitest run src/lib/data/useResource.test.tsx src/lib/data/useResource.test.ts` | ✅ | ✅ green |
| 34-06-02 | 06 | 4 | UAT-34-1 | T-34-15 | (g) : ajout hors-ligne résout, zéro toast, outbox pending | unit | `cd app && npx vitest run src/modules/courses/courses-offline-writes.test.tsx` | ✅ | ✅ green |
| 34-06-03 | 06 | 4 | — | — | chaîne complète post-34-06 | suite | `cd app && npm run typecheck && npm test && npm run build` | ✅ | ✅ green (234 fichiers / 1879 tests) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `app/src/lib/offline/` — outbox module (meta + classifier) créé avant les branchements (plan 01/02)
- [x] Aucune installation de framework — Vitest/RTL déjà en place (Phase 33)

*(Le stub `client-key.test.ts` seedé n'a pas été créé : la couverture WRQ-01 vit dans
`outbox.test.ts` et le testkit SQL `0177` — l'audit n'a pas généré de doublon.)*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Primauté Realtime réelle (overlay remplacé par le row serveur) | WRQ-06, D-16 | backend réel + canal Realtime + deux clients | UAT 1 — **passé 2026-11-06** |
| Rendu visuel badge/bannière/toast (discrétion, compteur) | WRQ-05, D-11/D-12/D-13 | perception visuelle non vérifiable par test | UAT 2 — **passé 2026-11-06** |
| Parcours e2e appareil réel (avion → 2 écritures → retour → exactement une fois) | WRQ-01..06 | vrai device + coupure réseau réelle + IndexedDB persistante | UAT 3 — **passé 2026-11-06** |

Session UAT complète : `34-UAT.md` (3/3 passés).

---

## Validation Audit 2026-11-06

| Metric | Count |
|--------|-------|
| Gaps found (draft seedé) | 6 lignes pointant des fichiers inexistants |
| Real gaps | 0 |
| Tests created | 0 (couverture réelle trouvée pour chaque ligne) |
| Escalated | 0 |

**Preuve d'exécution (audit, cette machine) :** 14 fichiers phase-34 / 143 tests verts ;
`supabase-adapter.test.ts` 4/4 ; contrôle SQL statique vert (230 fonctions / 179 migrations / 106 tests).

**Caveats (warning-class, documentés) :**
- `0177_client_key.test.sql` est vert-par-immuabilité, non re-exécuté ici (Docker absent) ;
  dernier passage vert 104/104, aucun fichier sous `supabase/` modifié depuis `e6b0c89` (34-01 lui-même).
- `useLinkedRows` partage le potentiel de défaut d'absorption de UAT-34-1, hors périmètre
  (observation consignée dans 34-06-SUMMARY.md) — à couvrir dans un plan ultérieur.

---

## Validation Sign-Off

- [x] All tasks have automated verification (map réconciliée ci-dessus)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (aucun MISSING réel)
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-11-06 (audit Nyquist, verdict GAPS FILLED — 0 trou réel)
