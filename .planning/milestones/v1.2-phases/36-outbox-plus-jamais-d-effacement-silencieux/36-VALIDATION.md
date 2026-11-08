---
phase: "36"
slug: "outbox-plus-jamais-d-effacement-silencieux"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-07"
---

# Phase 36 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5 + React Testing Library (`app/`) |
| **Config file** | `app/vitest.config.*` (existing v1.1 suite) |
| **Quick run command** | `cd app && npm test -- --run outbox-replay outbox offline-panel` |
| **Full suite command** | `cd app && npm run typecheck && npm test -- --run && npm run build` |
| **Estimated runtime** | ~30–60 s (quick), ~5 min (full) |

La chaîne §2.7 s'applique : SQL statique + test-db.sh uniquement si une migration est touchée (RESEARCH.md : aucune migration prévue — `supabase/migrations` hors périmètre sauf surprise).

---

## Sampling Rate

- **After every task commit:** Run `cd app && npm test -- --run outbox-replay outbox offline-panel`
- **After every plan wave:** Run full suite (typecheck + test + build)
- **Before `/gsd-verify-work`:** Full suite must be green + chaîne §2.7 complète
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

> Alignée sur les plans réels (D-08 : tests dans les fichiers existants, jamais de nouveaux fichiers de test).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 36-01 tâche 1 | 01 | 1 | OBOX-01 | T-36-02 | Scénario 404 : PGRST116 → terminal, entrée non rejouée, non-boucle (2e passe sans appel adaptateur) | integration (rouge documenté d'abord, D-09) | `cd app && npm test -- --run outbox-replay` | ✅ (`src/lib/offline/outbox-replay.test.ts`, tests nouveaux) | ⬜ pending |
| 36-01 tâche 2 | 01 | 1 | OBOX-02 | T-36-02 | Matrice D-05 via `it.each(FAILURE_FAMILIES)` : classification + libellé, 2× par code, défaut terminal (D-06 + Q2) | unit (table-driven) | `cd app && npm test -- --run outbox.test` | ✅ (`src/lib/offline/outbox.test.ts`, tests nouveaux) | ⬜ pending |
| 36-01 tâche 3 | 01 | 1 | OBOX-01 | T-36-01 | Rendu panneau : libellé français dérivé du seul `code`, `failure.message` brut jamais dans le DOM, états vides, entrée ancienne forme | component | `cd app && npm test -- --run offline-panel` | ✅ (`src/modules/parametres/components/offline-panel.test.tsx`) | ⬜ pending |
| 36-02 tâche 1 | 02 | 2 | OBOX-01 | — | Toast D-12 retiré, badge « N en attente / N bloquées » intact | regression | `cd app && npm test -- --run use-outbox-replay-badge` | ✅ (`src/hooks/use-outbox-replay-badge.test.ts`) | ⬜ pending |
| 36-02 tâche 2 | 02 | 2 | OBOX-01, OBOX-02 | — | Porte de phase : chaîne §2.7 complète verte | gate | `cd app && npm run typecheck && npm test -- --run && npm run build` | ✅ (chaîne existante) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test d'intégration rouge du scénario 404 dans `app/src/lib/offline/outbox-replay.test.ts` (fichier existant, D-08) — échoue AVANT correctif, comportement observé consigné
- [ ] Tests matriciels `it.each(FAILURE_FAMILIES)` dans `app/src/lib/offline/outbox.test.ts` (fichier existant)
- [ ] Tests de rendu panneau dans `app/src/modules/parametres/components/offline-panel.test.tsx` (fichier existant)

Aucun nouveau fichier de test : D-08 verrouille l'emplacement des tests dans les fichiers existants. Infrastructure déjà en place.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Message « cet élément a été supprimé entre-temps » à la reconnexion réelle (offline→online sur appareil) | OBOX-01 | Requiert un vrai cycle offline/online navigateur + IndexedDB réel | Déconnecter le réseau, écrire une entrée, supprimer l'élément côté serveur, reconnecter, vérifier badge + panneau + libellé |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60 s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
