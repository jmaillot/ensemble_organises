---
phase: 43-preuve-prod-du-bridge-ardoise-w1
verified: 2026-11-11T18:20:00Z
status: passed
score: 6/6 must-haves verified
covered_files:
  - .planning/phases/43-preuve-prod-du-bridge-ardoise-w1/43-01-PLAN.md
  - .planning/phases/43-preuve-prod-du-bridge-ardoise-w1/43-01-SUMMARY.md
  - .planning/phases/43-preuve-prod-du-bridge-ardoise-w1/43-REVIEW.md
  - .planning/phases/43-preuve-prod-du-bridge-ardoise-w1/43-REVIEW-DISPOSITION.md
  - .planning/phases/43-preuve-prod-du-bridge-ardoise-w1/43-SECURITY.md
  - .planning/phases/43-preuve-prod-du-bridge-ardoise-w1/43-VALIDATION.md
  - scripts/test-ardoise-bridge-real.sh
  - scripts/lib-smoke-accounts.sh
  - docs/BRIDGE-ARDOISE-PREUVE.md
covered_digest: "v2:sha256:6b77690d1baa065f11230f9ed8fc2643ecf4ffcaac8063721ec0c1ebfd7c1fbb"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 6/6
  gaps_closed:
    - "WR-01 cause réelle : extraction jq du champ racine (4027d2c) — la duplication des résiduels venait de user_metadata.email, pas de la pagination ; fix vérifié fonctionnellement sur body GoTrue synthétique"
  gaps_remaining: []
  regressions: []
human_verification: []
---

# Phase 43 : Preuve prod du bridge ardoise — W1 Verification Report

**Phase Goal:** Prouver en production réelle la surface bridge ardoise par le script sœur `scripts/test-ardoise-bridge-real.sh` (PROOF-01..07), preuve sur le fil HTTP complet — jamais SQL seul.
**Verified:** 2026-11-11T18:20:00Z
**Status:** passed
**Re-verification:** Yes — re-verification #2, after dcb3f70 (WR-01/WR-02) + 4027d2c (WR-01 cause réelle)

## Re-verification Scope (#2)

Deux commits de review, aucun code produit (`app/`, `supabase/` intacts) :

1. **dcb3f70** — déjà re-vérifié au cycle précédent ; spot-check de non-régression uniquement : le clamp `cmp -s` et le message WR-02 sont toujours en place (l.296-300 et ~l.454), syntaxe OK.
2. **4027d2c — WR-01 cause réelle** : `scripts/lib-smoke-accounts.sh` l.287-293. L'ancien `grep -o '"email": *"[^"]*"'` matchait la copie `user_metadata.email` en plus du champ racine GoTrue → chaque résiduel listé 2x (runs 10/11). Le code courant extrait par `jq -r '.users[]?.email // empty'` (champ racine seul), avec commentaire qui nomme la cause ET invalide l'hypothèse pagination du review ; le clamp `cmp -s` est conservé comme défense avec commentaire corrigé. **Vérifié fonctionnellement** : sur un body GoTrue synthétique contenant `users[].email` + `users[].user_metadata.email`, le jq renvoie 2 emails uniques là où l'ancien grep en renvoyait 4 — la classe de défaut est corrigée, pas l'instance. `jq` était déjà utilisé par `seed-test-accounts.sh`. Aucun secret introduit.

**Précision d'évidence (honnêteté, §2.7 F)** : le run 11 (log 19:12, run id 1794419621-1499372, EXIT=200, tous négatifs rouges, 9 asserts SQL exacts, purge verte) a tourné ~3 minutes AVANT le commit 4027d2c (19:15) — il valide le run post-review dcb3f70, pas le state jq committé, sur le fil complet. La correction 4027d2c est prouvée par reproduction diagnostique locale (run 11 : 3 emails uniques, `uniq -d` vide sur le corps réel) et confirmée ici par test synthétique jq vs grep. Le doc `docs/BRIDGE-ARDOISE-PREUVE.md` en working tree (non committé, mtime 19:12) est la réécriture du run 11 — il liste donc encore les résiduels doublés (6 lignes, 3 uniques), ce qui est l'enregistrement honnête du run 11 pré-fix ; le mécanisme le réécrira à chaque run futur avec l'extraction corrigée.

## Goal Achievement

### Observable Truths (must_haves du PLAN frontmatter)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Un observateur relit la sortie du script et suit chaque appel HTTP du happy path sans jamais voir une valeur secrète | ✓ VERIFIED | (re-spot-check) Doc run 11 : 18 étapes `ÉTAPE n \| POST/GET <url> \| HTTP <status>` ; aucun secret en clair ; WR-02 message d'échec générique sans secret |
| 2 | Les 4 négatifs red-team échouent réellement sur le fil HTTP | ✓ VERIFIED | (re-spot-check) Run 11 : replay 410, muté 404, expiré 410 après 1020 s réelles, cross-household `parts_membre_converties_foyer_b = 0` |
| 3 | Réconciliation `guest:` → `membre:` prouvée par lecture psql bornée par foyer, identifiants captés AVANT redeem | ✓ VERIFIED | (re-spot-check) Doc run 11 : identifiants capturés avant redeem (ÉTAPE 6-8), 9 asserts SQL exacts bornés |
| 4 | Réexécution sans artifact accumulé — foyer purgé cascade → 0 ligne, comptes re-delete → 404 | ✓ VERIFIED | Run 11 : `foyers → 0 lignes résiduelles`, `comptes purgés, purge prouvée (re-delete → 404)`, EXIT=200 ; 4027d2c corrige la liste résiduelle hors run (EE-02) sans toucher la purge |
| 5 | `docs/BRIDGE-ARDOISE-PREUVE.md` réécrit à chaque run, verdicts par étape, estampille, section « ce qui n'est PAS prouvé » | ✓ VERIFIED | (re-vérifié) Working tree = réécriture run 11 : 5 sections (1 Chaîne HTTP / 2 Négatifs / 3 Lecture SQL / 4 PAS prouvé / 5 Verdict+self-check), estampille INDISPONIBLE nommée, limites honnêtes (UI non couverte, e2e W2 déclenché par besoin, estampille Edge sans canal) |
| 6 | PROOF-07 : verdict humain du seam client — signal D-10 émis, jamais préventif | ✓ VERIFIED (verdict humain) | (re-spot-check) 43-UAT.md l.21 : `- [x] **PASS**` daté 2026-11-11, inchangé |

**Score:** 6/6 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `scripts/test-ardoise-bridge-real.sh` | Script sœur POSIX sh, preuve prod | ✓ VERIFIED | `bash -n` OK ; sonde résiduelle nommée (WR-02) intacte ; aucun marqueur de dette réel |
| `scripts/lib-smoke-accounts.sh` | Comptes e2e + purge vérifiée | ✓ VERIFIED | `bash -n` OK ; extraction jq champ racine (4027d2c), clamp cmp -s conservé en défense, re-vérification par email intacte |
| `docs/BRIDGE-ARDOISE-PREUVE.md` | Doc auto-rédigé, 5 sections | ✓ VERIFIED | Réécriture run 11 en working tree (non committé — mécanisme par run) ; 5 sections, limites honnêtes |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Syntaxe lib post-4027d2c | `bash -n scripts/lib-smoke-accounts.sh` | OK | ✓ PASS |
| Syntaxe script | `bash -n scripts/test-ardoise-bridge-real.sh` | OK | ✓ PASS |
| Fix jq vs ancien grep (synthétique) | body GoTrue fake, 2 users avec user_metadata.email | jq : 2 uniques ; ancien grep : 4 | ✓ PASS |
| Run 11 post-review | /tmp/opencode/43-01-run11-postreview.log | EXIT=200, 4 négatifs rouges, 9 asserts exacts, purge verte | ✓ PASS (log de record) |
| Verdict humain UAT-1 | lecture 43-UAT.md | `- [x] PASS` daté 2026-11-11 (l.21) | ✓ PASS |

### Review / Security / Validation artifacts

- 43-REVIEW.md + 43-REVIEW-DISPOSITION.md : WR-01 (clôturé par 4027d2c, cause réelle documentée) + WR-02 + IN-01..05 — disposition à jour.
- 43-SECURITY.md : SECURED, 4/4 menaces T-43-* fermées, threats_open=0 — inchangé, aucun secret introduit par 4027d2c.
- 43-VALIDATION.md : présent (finalisé par l'auditeur Nyquist concurrent) — inclus au digest.

### Gaps Summary

Aucun gap. Le fix 4027d2c est vérifié dans le code courant et prouvé fonctionnellement (test synthétique jq vs grep : 2 uniques vs 4). Précision conservée dans le rapport : le run 11 valide le state dcb3f70 sur le fil complet ; le state jq committé est prouvé par reproduction diagnostique + test synthétique, et le doc de preuve sera réécrit à son prochain run. Les 6 vérités restent vérifiées, aucune régression. Phase 43 complète.

---

_Verified: 2026-11-11T18:20:00Z_
_Verifier: the agent (gsd-verifier)_
