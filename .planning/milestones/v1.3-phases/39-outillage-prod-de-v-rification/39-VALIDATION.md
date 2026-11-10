---
phase: "39"
slug: "outillage-prod-de-v-rification"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-09"
---

# Phase 39 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Validé le 2026-11-09 par l'audit Nyquist (voir `39-NYQUIST-AUDIT.md`) — commandes de la carte ré-exécutées le jour de l'audit.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5 (unités, existant) + Playwright (e2e, existant) + chaîne scripts §2.7 |
| **Config file** | `app/playwright.config.ts`, `app/vitest.config.*` |
| **Quick run command** | `cd app && npm run typecheck && npx vitest run` |
| **Full suite command** | `cd app && npm run typecheck && npm test && npm run build && npm run test:e2e` |
| **Estimated runtime** | ~90 s (quick ~30 s ; la chaîne complète inclut build + e2e) |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npm run typecheck && npm test` (aucun changement app sauf suppression des 2 tests — la suite standard doit rester verte)
- **After every plan wave:** Run `cd app && npm run typecheck && npm test && npm run build && npm run test:e2e` (chaîne complète §2.7)
- **Before `/gsd-verify-work`:** Full suite must be green + run réel du smoke et de la spec contre la stack (documenté, DS-03) + signature e2e mise à jour
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 39-01-01 | 01 | 1 | SMOKE-01 | T-39-01, T-39-03 | Bibliothèque comptes (`-K` 0600), sonde `mailer_autoconfirm`, purge vérifiée re-delete→404, emails `e2e+<runid>@` | statique (`sh -n`, garde anti-secret-argv) + run réel documenté | `sh -n scripts/lib-smoke-accounts.sh && sh -n scripts/smoke-test.sh && [ -z "$(grep -nE '\-H "[^"]*SECRET_KEY' scripts/smoke-test.sh scripts/lib-smoke-accounts.sh)" ]` | ❌ le script livré est le livrable ; run réel : `sh scripts/smoke-test.sh` (DS-01) | ✅ green (statique ré-exécuté 2026-11-09 ; run réel 17/17, 39-UAT.md test 1, a85db2a) |
| 39-01-02 | 01 | 1 | SMOKE-01 | T-39-02, T-39-04, T-39-05 | Refus sans secret, 429→1 retry/422→échec nommé, résidus signalés (EE-02), parcours 5 étapes inchangé (CS-03) | statique + run réel documenté | `! grep -q 'example\.fr' scripts/smoke-test.sh && [ -z "$(grep -nE '\-H "[^"]*SECRET_KEY' scripts/smoke-test.sh scripts/lib-smoke-accounts.sh)" ]` ; run réel : `sh scripts/smoke-test.sh` | ❌ livrable | ✅ green (statique ré-exécuté 2026-11-09 ; run réel 17/17, 39-UAT.md test 1, a85db2a) |
| 39-01-03 | 01 | 1 | SMOKE-01 | T-39-04 | Section « smoke-test prod » (DS-03), run manuel documenté (DS-01), `E2E_MAIL_DOMAIN` (EE-01) | statique | `grep -q 'Smoke-test prod' docs/EXPLOITATION.md && grep -q 'E2E_MAIL_DOMAIN' docs/EXPLOITATION.md` | ✅ docs/EXPLOITATION.md existant | ✅ green (ré-exécuté 2026-11-09 ; commandes l.411-412 présentes) |
| 39-02-01 | 02 | 2 | TEST-02 | T-39-07, T-39-06 | Wrapper run séparé (refus sans stack, `--project=chromium`, trap purge vérifiée), spec chemin heureux 5 points JT-02, 2 anciens tests supprimés (JT-03) | statique (`sh -n`, typecheck, garde) + e2e réel (wrapper, run documenté) | `sh -n scripts/test-join-token-real.sh && (cd app && npm run typecheck) && grep -q "project=chromium" scripts/test-join-token-real.sh && grep -q "cd app" scripts/test-join-token-real.sh` ; run réel : `sh scripts/test-join-token-real.sh` | ❌ Wave 0 = le livrable | ✅ green (statique + typecheck ré-exécutés ; run réel Playwright 6/6 en 46,5 s, 39-UAT.md test 3, 5618352) |
| 39-02-02 | 02 | 2 | TEST-02 | T-39-09 | Message uniforme D-03/D-17 sur token mort (6e point JT-02), aucun skip conditionnel ajouté (JT-03) | statique (typecheck + garde anti-skip/anti-grepExclude, diff exécuté depuis la racine du dépôt) | `(cd app && npm run typecheck) && [ -z "$(git diff HEAD -- app/e2e | grep -E '^\+.*test\.(skip|fixme)' )" ]` | ❌ livrable | ✅ green (typecheck + garde anti-skip ré-exécutés : diff vide, 6 `test()`, 0 skip/fixme/grepExclude) |
| 39-02-03 | 02 | 2 | TEST-02 | T-39-08 | Chaîne §2.7 verte, run standard 0 rouge assumé, signature e2e 38 re-datée (Pitfall 6) | chaîne complète | `cd app && npm run typecheck && npm test && npm run build && npm run test:e2e` | ✅ existant | ✅ green avec réserve (run consigné plan 02 : 163 passed / 9 skipped / 0 failed, signature 38 re-datée ; à l'audit : typecheck + sous-ensemble unitaire re-verdis — l'échec préexistant `calendrier-page.test.tsx` corrigé en phase 40, 9a656b3 ; chaîne complète non rejouée le jour de l'audit) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*(Task IDs recalés sur les plans réels 39-01/39-02 — 2026-11-09.)*

---

## Wave 0 Requirements

- None — aucun framework à installer ; les « tests » de cette phase SONT les scripts/spec livrés (`scripts/smoke-test.sh` modifié, `scripts/test-join-token-real.sh`, spec e2e réelle).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Run réel smoke : création Admin (`email_confirm: true`), purge vérifiée (re-delete → 404), 422/429 gérés | SMOKE-01 | Nécessite la stack réelle déployée + `SUPABASE_SECRET_KEY` dans le `.env` de l'hôte de la stack (jamais sur la machine de travail) | `sh run.sh logs` santé, puis `sh scripts/smoke-test.sh` depuis l'hôte de la stack ; vérifier la ligne « purge vérifiée (re-delete → 404) » |
| Run réel spec join-token contre le flux 31-03 | TEST-02 | Nécessite la stack réelle + navigateur contre `app.*` | `sh scripts/test-join-token-real.sh` depuis l'hôte (ou machine avec accès) ; les 6 points JT-02 doivent être verts avec le bornage documenté (pas d'accès email) |
| Discipline secrets (`grep` + relecture) | SMOKE-01 | Vérification statique par relecture, pas exécutable | `grep -n "SECRET_KEY" scripts/*.sh` — aucun `-H "…SECRET…"` inline ; clé uniquement via fichier `-K` 0600 supprimé en sortie |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (bilan audit : 2 COVERED, 0 PARTIAL, 0 MISSING)
- [x] No watch-mode flags
- [x] Feedback latency < 90s (quick ~30 s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-09 (audit Nyquist — commandes de la carte ré-exécutées, voir 39-NYQUIST-AUDIT.md ; G-1 rescorpé dans la ligne 39-01-02)
