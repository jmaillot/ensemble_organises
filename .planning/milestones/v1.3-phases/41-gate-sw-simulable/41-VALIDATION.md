---
phase: "41"
slug: "gate-sw-simulable"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-10"
---

# Phase 41 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (chromium, workers: 1) via wrapper `scripts/test-sw-gate.sh` + serveur harnais Node natif `scripts/e2e-sw-server.mjs` ; Vitest 5 (chaîne §2.7 standard) |
| **Config file** | `app/playwright.config.ts` (testIgnore à deux variables : `E2E_SW_BASE_URL` ↔ sw-gate, `E2E_BASE_URL` ↔ join-token) |
| **Quick run command** | `sh scripts/test-sw-gate.sh` (~30 s : 2 builds + 4 cas) |
| **Full suite command** | `cd app && npm run typecheck && npm test && npm run build && npm run test:e2e && python3 scripts/check-sql-statique.py && sh scripts/test-sw-gate.sh` |
| **Estimated runtime** | ~30 s (wrapper) ; ~10 min (chaîne complète, aucun segment Docker — pas de SQL touché) |

---

## Sampling Rate

- **After every task commit:** `sh scripts/test-sw-gate.sh` (les 4 cas échouent sans leurs entrées — JT-03)
- **After every plan wave:** chaîne §2.7 sans le segment Docker + `TEST_SW_GATE_CONTROLE_ROUGE=1 sh scripts/test-sw-gate.sh` (contrôle négatif vu rouge)
- **Before `/gsd-verify-work`:** Full suite must be green + purge des artefacts rapportée par le wrapper
- **Max feedback latency:** 30 s (wrapper autonome)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 41-01-01 | 01 | 1 | GATE-01 | T-41-01 | Deux builds réels (VITE_BUILD_ID gate-a/b), precache distinct prouvé avant run (`cmp -s sw.js` → refus nommé), même origin, worker B en attente réel, bandeau, « Recharger » applique B | e2e réel | `sh scripts/test-sw-gate.sh` (cas 1, spec l.211) | ✅ `app/e2e/sw-gate-real.spec.ts` | ✅ green |
| 41-01-02 | 01 | 1 | GATE-01 | — | Gate fermée (file non vide → bouton « Mise à jour en préparation… » désactivé, aucun reload) puis ouverte (file vide → buildId passe à B) ; file seule sans mise à jour → aucun bandeau (OQ-1a) | e2e réel | `sh scripts/test-sw-gate.sh` (cas 2 l.228 + cas 3 l.258) | ✅ même spec | ✅ green |
| 41-01-02 | 01 | 1 | GATE-01 | T-41-02 | Harnais flag-compilé jamais en prod : grep bundle standard = 0 occurrence de `__eoSwHarness`/`e2e-sw-harness` (preuve A2, wrapper l.86-93) ; aucun fork de sw-register.ts/use-outbox-gate.ts/update-banner.tsx | statique (par le wrapper) | `sh scripts/test-sw-gate.sh` (pre-run) | ✅ `scripts/test-sw-gate.sh` | ✅ green |
| 41-01-03 | 01 | 1 | GATE-01 | — | Contrôle négatif falsifiable : servir deux fois le même build ne propose aucune mise à jour ; vu rouge sous `TEST_SW_GATE_CONTROLE_ROUGE=1` (§2.7 B) | e2e réel | `sh scripts/test-sw-gate.sh` (cas 4 l.269) + `TEST_SW_GATE_CONTROLE_ROUGE=1 sh scripts/test-sw-gate.sh` | ✅ même spec + wrapper l.175 | ✅ green |
| 41-01-03 | 01 | 1 | GATE-01 | — | Run e2e standard 100 % vert sans le wrapper : sw-gate exclue hors `E2E_SW_BASE_URL` | smoke | `cd app && npx playwright test e2e/sw-gate-real.spec.ts --list` (sans env → 0 test) | ✅ `app/playwright.config.ts` | ✅ green |
| 41-01-03 | 01 | 1 | GATE-01 | — | GATE-PROD consigné observatoire hors jalon, distinct de la validation simulée | revue | grep `GATE-PROD` docs/EXPLOITATION.md (l.431) | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `scripts/test-sw-gate.sh` — wrapper deux builds, preuve diff precache (`cmp -s`, l.116), preuve anti-prod A2 (grep bundle standard), serveur vérifié vivant (`kill -0`, l.158) avant chaque curl, purge rapportée
- [x] `scripts/e2e-sw-server.mjs` — serveur Node natif, no-cache, symlink `dist-current` relu à chaque requête
- [x] `app/e2e/sw-gate-real.spec.ts` — 4 cas, verbatims D-17, attentes d'état nommé (aucun waitForTimeout), refus nommé sans entrées
- [x] `app/src/lib/e2e-sw-harness.ts` — harnais flag-compilé `VITE_E2E_SW_HARNESS=1`, file écrite via `enqueueOutbox` sur le queryClient (D-03, jamais réimplémentée)

*Infrastructure Vitest/Playwright existante ; aucun SQL touché → test-db.sh hors périmètre (chaîne §2.7 sans segment Docker).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GATE-PROD : gate en conditions réelles de production (déclenchement naturel) | GATE-01 | Exige le premier déploiement prod réel ; hors jalon par construction, consigné docs/EXPLOITATION.md:431 | Suivre la section GATE-PROD (renvois 32-UAT 7 / 35-UAT 2) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** verified 2026-11-10

---

## Validation Audit 2026-11-10 (ré-verification Nyquist)

| # | Truth (VERIFICATION.md) | Instrument | Échantillonnage au bon rythme ? | Verdict |
|---|--------------------------|------------|--------------------------------|---------|
| 1 | Deux builds successifs, precache distinct, même origin, bandeau réel, « Recharger » applique B | Spec cas 1 (l.211) via wrapper | Oui — les 4 cas tournent à chaque invocation du wrapper, refus nommé sans entrées (JT-03) | COVERED |
| 2 | Gate fermée (bouton désactivé, aucun reload) ET ouverte (buildId A→B), prouvées séparément | Spec cas 2 (l.228) | Oui — cas 2 exécuté à chaque run ; wording roadmap documenté (flagged_assumption, OQ-1a/1b couverts par cas 2-3) | COVERED |
| 3 | File seule sans mise à jour → aucun bandeau (OQ-1a) | Spec cas 3 (l.258) | Oui | COVERED |
| 4 | Harnais dev-only, aucun fork/mock de la gate | Preuve A2 du wrapper (grep bundle standard, l.86-93) + git diff nul sur les 3 fichiers protégés | Oui — grep exécuté avant tout lancement, à chaque run | COVERED |
| 5 | Run e2e standard vert sans le wrapper | testIgnore à deux variables + sonde `--list` | Oui — sonde directe : `npx playwright test e2e/sw-gate-real.spec.ts --list` sans env → 0 test | COVERED |
| 6 | GATE-PROD consigné hors jalon, distinct de la validation simulée | docs/EXPLOITATION.md:431 + STATE.md:68 inchangé | Oui — preuve statique suffisante (consignation) | COVERED |
| 7 | Contrôle négatif falsifiable (rouge-avant-vert) | Spec cas 4 (l.269) + mode `TEST_SW_GATE_CONTROLE_ROUGE=1` (wrapper l.175) | Oui — sortie rouge consignée au SUMMARY avec log exact | COVERED |

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

**Preuves d'exécution de cette passe :** `sh scripts/test-sw-gate.sh` ré-exécuté par l'auditeur le 2026-11-10 → **4 passed (30,2 s), EXIT=0**, preuves wrapper vues dans le log : « ✓ grep du bundle standard : 0 occurrence de __eoSwHarness / e2e-sw-harness », « ✓ VITE_BUILD_ID incrusté dans les deux bundles », « ✓ diff dist-v1/sw.js ≠ dist-v2/sw.js (precache distinct, preuve SC1) », « ✓ purge des artefacts du run » ; sonde routage `cd app && npx playwright test e2e/sw-gate-real.spec.ts --list` → « Total: 0 tests in 0 files » ; contrôle négatif rouge déjà prouvé (SUMMARY, `/tmp/opencode/rouge-run2.log`, 1 failed sur toHaveCount(0)). Aucun nouveau fichier de test nécessaire — les instruments existants échantillonnent chaque truth au bon rythme (falsifiables, refus nommés, vus rouge avant vert).
