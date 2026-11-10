---
phase: 38-filet-de-tests-fiable
secured: 2026-11-09
mode: artifacts (State B — aucun SECURITY.md préexistant, registre authored-at-plan-time)
asvs_level: 1
block_on: high
threats_total: 4
threats_closed: 4
threats_open: 0
verdict: SECURED
---

# Phase 38 — Sécurité : filet-de-tests-fiable

## Verdict : SECURED

Les 4 menaces du registre STRIDE sont fermées, chaque statut prouvé par grep/commande (profondeur L1, conforme au court-circuit : threats_open=0 ∧ registre à l'heure du plan ∧ ASVS L1).

## Registre vérifié

| Threat ID | Catégorie | Composant | Sévérité | Statut | Preuve |
|---|---|---|---|---|---|
| T-38-01 | Information Disclosure | `supabase/functions/ardoise-invite/index.ts` — `buildGuestView`, lectures `service_role` expense_participants/household_members | high | CLOSED | `index.ts:668` `.in('expense_id', expenseIds)` + `:672` `.eq('household_id', householdId).order('id')` — bornage dans la requête PostgREST (I-01/I-02), jamais de filtrage JS après lecture complète. Balayage I-01 des 16 `.from()` : toutes bornées. Commits `12fa95a`, `aacb209`. |
| T-38-SC | Tampering | npm/pip/cargo installs | high | CLOSED | `git log cd3fdf1..HEAD -- app/package.json app/package-lock.json` → 0 commit ; aucune installation nouvelle dans aucun plan (audit de légitimité non applicable, comme prévu au plan). |
| T-38-02 | Repudiation | `household-store.test.ts` — test qui ment (flake WR-03 corrigé sans diagnostic) | medium | CLOSED | Fix test-only par `vi.waitFor` après protocole W-02 exécuté (reproduction 1/30, preuve d'innocence du code de production, rétrospective v1.3 sections 12-15). Délegation synchrone par refs capturées (`household-store.test.ts:14-33`). Commit `3895197`. |
| T-38-03 | Repudiation | run e2e — rouges masqués par skip | medium | CLOSED | Gardes statiques 38-04 vertes : 0 ligne ajoutée `test.skip`/`test.fixme`/`grepExclude` dans le diff de phase ; `git diff cd3fdf1..HEAD -- app/e2e/critical-paths.spec.ts` → 0 ligne ; baseline 8 skips datée par preuve git (`a392392` ×7 viewport 2026-10-23, `55e55f0` ×1 credentials 2026-11-04 — antérieurs à la phase). Commit `3642e04`. |

## Risques acceptés

Aucun.

## Notes

- Le registre provient des blocs `<threat_model>` des 4 PLAN.md (authored at plan time) — pas de mode STRIDE rétroactif.
- La menace critique T-38-01 (service_role, high) était l'objet direct du plan 38-03 ; sa mitigation a été revue indépendamment par la review de phase (`38-REVIEW.md` : 0 Critical / 0 Warning, bornage IN-02 vérifié correct, y compris le cas tableau vide `.in()` → PostgREST ensemble vide sans erreur).
- Aucune surface de sécurité nouvelle n'a été introduite par 38-01/38-02/38-04 (tests, helpers purs, documentation).
