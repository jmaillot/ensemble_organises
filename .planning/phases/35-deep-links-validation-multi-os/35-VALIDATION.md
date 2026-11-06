---
phase: "35"
slug: "deep-links-validation-multi-os"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-06"
---

# Phase 35 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5 (unit) + Playwright (e2e, patron `offline-shared-device.spec.ts`) |
| **Config file** | `app/vitest.config.ts` / config e2e existante (phases 32–34) |
| **Quick run command** | `cd app && npx vitest run <chemins touchés>` |
| **Full suite command** | `cd app && npm run typecheck && npm test && npm run build` puis `cd app && npm run test:e2e` |
| **Estimated runtime** | ~60–180 s selon vague |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npx vitest run <chemins touchés>`
- **After every plan wave:** Run `cd app && npm run typecheck && npm test && npm run build`
- **Before `/gsd-verify-work`:** Full suite must be green (typecheck + tests + build + e2e)
- **Max feedback latency:** 180 s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 35-01-01 | 01 | 1 | DLNK-02 | — | N/A | e2e | `cd app && npx playwright test deep-link-redirect-auth` | ❌ W0 | ⬜ pending |
| 35-01-02 | 01 | 1 | DLNK-03 | — | N/A | unit | `cd app && npx vitest run src/modules/taches` | ❌ W0 | ⬜ pending |
| 35-01-03 | 01 | 1 | DLNK-03 | — | N/A | unit | `cd app && npx vitest run src/lib/offline` | ✅ | ⬜ pending |
| 35-02-01 | 02 | 1 | DLNK-03 | — | N/A | manual-checkpoint | checkpoint:human (matrice OS) | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/src/modules/taches/__tests__/jour-view.test.tsx` — stubs pour le rendu de `/taches/jour` (aujourd'hui + retards, D-02)
- [ ] e2e `app/e2e/deep-link-redirect-auth.spec.ts` — stub du scénario DLNK-02 (deep link → login → retour vue cible)

*Existing infra (Vitest, Playwright, patron spec offline) couvre le reste.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Install + raccourcis sur Android/iOS réels | DLNK-03 | Nécessite matériel réel + stores/manifest install | Installer la PWA sur chaque OS, taper chaque raccourci en cold-start déconnecté, consigner le résultat |
| Lecture hors-ligne avec bandeau + rejeu foreground | DLNK-03 | Comportement réseau réel à forcer (mode avion) | Activer mode avion, ouvrir app, vérifier bandeau, revenir en ligne, vérifier rejeu + badge |
| Purge inter-utilisateurs (appareil partagé) | DLNK-03 | Sessions réelles multi-comptes | Se déconnecter, connecter un autre utilisateur, vérifier absence de résidus cache du foyer précédent |
| Gate SW « file vide » : aucune mise à jour ne recharge pendant un rejeu | DLNK-03 | Comportement SW réel on-device | Déclencher un rejeu en cours, pousser une update SW, vérifier aucun reload tant que la file n'est pas vide (bouton désactivé) |
| Quirks iOS ITP/éviction du cache | DLNK-03 | Comportement Safari/iOS non reproductible en CI | Consigner comportement ITP (7/30 jours), éviction storage, résultats dans la grille de validation |

*Rien n'est marqué vérifié sans consignation : la grille produite par le Plan 02 (D-09/D-11) fait foi.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180 s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
