---
phase: "33"
slug: "cache-de-lecture-offline"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-04"
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5 + React Testing Library + MSW (`app/`) ; contrôle statique Python `scripts/check-sql-statique.py` ; shell `sh scripts/*.sh` |
| **Config file** | `app/vitest.config.ts` (existante) |
| **Quick run command** | `cd app && npx vitest run src/lib/offline/` |
| **Full suite command** | `cd app && npm run typecheck && npm test && npm run build` |
| **Estimated runtime** | ~60–120 s (chaîne complète) |

---

## Sampling Rate

| Requirement | Behavior | Test Type | Automated Command (< 30 s) | Manual Justification |
|-------------|----------|-----------|---------------------------|----------------------|
| OFFR-01 | Restauration du cache persisté avant le premier rendu des routes protégées ; vue Tier 1 lisible en avion | integration (Vitest) | `npx vitest run src/lib/offline/restore.test.ts` | — |
| OFFR-02 | Bandeau « dernier état connu le [horodatage] » sur toute donnée rendue depuis le cache | component (Vitest/RTL) | `npx vitest run src/components/banners/stale-data-banner.test.tsx` | — |
| OFFR-03 | Module hors allowlist en avion → erreur d'origine honnête, jamais de données cachées ; maxAge par famille | unit + integration | `npx vitest run src/lib/offline/allowlist.test.ts` | — |
| OFFR-04 | Purge namespacée par utilisateur à la déconnexion / changement de foyer, attendue avant navigation | integration (Vitest, appareil partagé simulé) | `npx vitest run src/lib/offline/purge.test.ts` | — |
| OFFR-05 | Contrôle statique : le SW ne cache jamais `/rest/`, `/auth/`, `/realtime/`, `/storage/`, `/functions/` | static (shell/Python, vue rouge exigée) | `sh scripts/test-check-sw-denylist.sh` (contre-preuve) + `sh scripts/check-sw-denylist.sh` | — |
| Transverse | Chaîne de vérification §2.7 complète | e2e/local | `cd app && npm run typecheck && npm test && npm run build` | Mode avion réel sur appareil |

---

## Wave 0 Gaps

- Tests ciblés listés ci-dessus à créer (`src/lib/offline/*`, bannière stale) — aucun fichier de test offline n'existe encore.
- Scripts `scripts/check-sw-denylist.sh` + `scripts/test-check-sw-denylist.sh` à créer, **vus rouges avant d'être verts** (§2.7 B : un contrôle se prouve sur un cas qui doit échouer).
- `idb-keyval` à épingler dans `app/package-lock.json` avant tout test de persistance.
