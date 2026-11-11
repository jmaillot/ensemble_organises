---
phase: "43"
slug: "preuve-prod-du-bridge-ardoise-w1"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-11"
---

# Phase 43 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bash scripts sœurs (`scripts/test-*.sh`, shell strict) + contrôle statique SQL Python |
| **Config file** | `scripts/test-db.sh` (existant), `scripts/check-sql-statique.py` (existant) |
| **Quick run command** | `bash -n scripts/test-ardoise-bridge-real.sh` |
| **Full suite command** | `sh scripts/test-ardoise-bridge-real.sh` (prod — passage obligatoire avant de considérer un changement validé) |
| **Estimated runtime** | ~60–120 seconds (calls HTTP espacés : rate-limits 8/min/IP sur `household-token`, `redeem-guest`, `redeem`) |

---

## Sampling Rate

- **After every task commit:** Run `bash -n scripts/test-ardoise-bridge-real.sh` (syntax gate) + `python3 scripts/check-sql-statique.py` si SQL touché
- **After every plan wave:** Run `sh scripts/test-ardoise-bridge-real.sh` sur la prod
- **Before `/gsd-verify-work`:** Full suite must be green + `sh scripts/test-db.sh` (Docker) pour tout changement SQL
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| {N}-01-01 | 01 | 1 | PROOF-01 | T-{N}-SC | Preuve HTTP attribuable du happy path (méthode, statut, champs clés, estampille build) | smoke-e2e (HTTP) | `sh scripts/test-ardoise-bridge-real.sh` | ❌ W0 | ⬜ pending |
| {N}-01-02 | 01 | 1 | PROOF-02 | T-{N}-01/02/03 | Négatifs red-team vus rouges : replay → 410, token muté → 404, expiré → 410 | smoke-e2e (HTTP négatif) | `sh scripts/test-ardoise-bridge-real.sh` (section négatifs) | ❌ W0 | ⬜ pending |
| {N}-01-03 | 01 | 1 | PROOF-03 | — | Réconciliation participations `invite:` → `membre:` bornée par foyer, sans duplication ni orphelin | state-assert (HTTP + lecture bornée) | `sh scripts/test-ardoise-bridge-real.sh` (section réconciliation) | ❌ W0 | ⬜ pending |
| {N}-01-04 | 01 | 1 | PROOF-04 | T-{N}-04 | Secrets via `curl -K` fichier 0600 uniquement ; rien en ligne de commande ni processus | source-assert | `grep -n 'curl -K' scripts/test-ardoise-bridge-real.sh` + absence de secret littéral | ❌ W0 | ⬜ pending |
| {N}-01-05 | 01 | 1 | PROOF-05 | — | Comptes e2e via `lib-smoke-accounts.sh`, purge vérifiée (re-delete → 404), foyer éphémère purgé | smoke-e2e (teardown) | `sh scripts/test-ardoise-bridge-real.sh` (section teardown) | ❌ W0 | ⬜ pending |
| {N}-01-06 | 01 | 1 | PROOF-06 | — | Réexécution sans artifact accumulé (idempotence complète) | smoke-e2e (idempotence) | `sh scripts/test-ardoise-bridge-real.sh && sh scripts/test-ardoise-bridge-real.sh` | ❌ W0 | ⬜ pending |
| {N}-01-07 | 01 | 1 | PROOF-07 | — | Document de consignation daté dans `docs/` — aucun succès muet, verdict par étape | source-assert | `ls docs/*ardoise*bridge*` + structure de verdicts présente | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/test-ardoise-bridge-real.sh` — script sœur squelette (structure d'étapes, gestion `curl -K`, teardown) avant tout appel prod réel
- [ ] Fichier de config curl 0600 (chemin hors dépôt, documenté) — secrets Supabase prod
- [ ] Rappel projet (AGENTS.md §2.7) : un changement SQL éventuel passerait `sh scripts/test-db.sh` sur machine Docker — mais cette phase ne modifie a priori aucune migration

*La librairie `lib-smoke-accounts.sh` existe déjà (comptes e2e + purge vérifiée) — réutiliser, ne pas réécrire.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Estampille du build déployé (canal `/version.json`) | PROOF-01 | Le canal exact de l'estampille côté Edge n'est pas prouvé — si `/version.json` est le seul canal, la comparaison build/script est une vérification humaine de la sortie consignée | Lire la sortie du script, comparer l'estampille affichée à `https://app.votredomaine.fr/version.json` |
| Seam client du parcours invité (si suspecté) | PROOF-07 | Déclenché par besoin, pas par défaut — e2e navigateur réel du parcours invité si un seam est suspecté pendant la preuve | Suivre le parcours invité dans le navigateur sur prod, consigner le verdict dans le doc de consignation |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
