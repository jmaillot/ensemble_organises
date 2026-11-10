---
phase: 38-filet-de-tests-fiable
verified: 2026-11-08T20:05:00Z
status: passed
score: 7/7 must-haves verified
covered_files:
  - .planning/phases/38-filet-de-tests-fiable/38-01-PLAN.md
  - .planning/phases/38-filet-de-tests-fiable/38-01-SUMMARY.md
  - .planning/phases/38-filet-de-tests-fiable/38-02-PLAN.md
  - .planning/phases/38-filet-de-tests-fiable/38-02-SUMMARY.md
  - .planning/phases/38-filet-de-tests-fiable/38-03-PLAN.md
  - .planning/phases/38-filet-de-tests-fiable/38-03-SUMMARY.md
  - .planning/phases/38-filet-de-tests-fiable/38-04-PLAN.md
  - .planning/phases/38-filet-de-tests-fiable/38-04-SUMMARY.md
  - app/src/lib/data/seed.test.ts
  - app/src/lib/data/seed.ts
  - app/src/lib/datetime.test.ts
  - app/src/lib/datetime.ts
  - app/src/modules/ardoise/api.ts
  - app/src/modules/menu/types.ts
  - app/src/stores/household-store.test.ts
  - docs/RETROSPECTIVE.md
  - supabase/functions/ardoise-invite/index.ts
covered_digest: "v2:sha256:69b2586ff023aeed3ca8c9d88af649e12383542305204a33d04115397eead827"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: none
  note: "Initial verification. Note de traçabilité : REQUIREMENTS.md Traceability affiche encore DEBT-01 « TBD/Pending » (mise à jour gitignorée, cf. 3642e04) — l'implémentation 38-03 est pourtant prouvée ci-dessous ; cosmétique, à rattraper."
---

# Phase 38 : Filet de tests fiable — Rapport de vérification

**Phase Goal (ROADMAP.md) :** La chaîne de vérification §2.7 est redevenue un instrument de confiance — aucun test qui ment, aucune dette de review 37 — pour que toutes les phases suivantes puissent prouver leurs changements.
**Verified :** 2026-11-08T19:21:25Z
**Status :** PASSED
**Re-verification :** Non — vérification initiale

## Goal Achievement

### Observable Truths (SC roadmap + must_haves des plans)

| #  | Truth                                                                                                                        | Status     | Evidence |
|----|------------------------------------------------------------------------------------------------------------------------------|------------|----------|
| 1  | SC1/TEST-01 — semis menu-page insensible au jour de la semaine : tests paramétriques 7 jours, aucun `new Date()` résiduel dans les semis repas | ✓ VERIFIED | `app/src/lib/datetime.test.ts:134,138` — deux blocs `it.each` (7 ISO + 7 offsets). `seed.ts` : `demoMealEntries` ancrée 4× via `jourSemaine(debutSemaineIso(todayIso()), 0..2)` (grep = 4). `grep "new Date()" seed.ts` → 3 hits, tous hors `demoMealEntries` (`now()`, `currentYear`, semis pantry — lignes 69/889/932). Garde anti-récidive `seed.test.ts:26` + cas-qui-doit-échouer l.44 (§2.7 B). Suite 38-04 : menu.spec.ts entièrement vert. |
| 2  | SC2/TEST-03 — chaîne §2.7 complète verte, rouge join-token seul et documenté (J-01/J-02)                                      | ✓ VERIFIED | 38-E2E-SIGNATURE.md : typecheck ✓ / 244 fichiers, 1988 tests ✓ / build ✓ / e2e 165 passed, 9 skipped, 2 failed = 1 test ×2 projets (critical-paths.spec.ts:134, chromium+mobile) / check-sql-statique 230 fonctions ✓ / test-check-sql-statique 6 cas ✓. Spot-check indépendant : `npm run typecheck` → **TYPECHECK_GREEN** (ce run). Garde : `git diff cd3fdf1..HEAD -- app/e2e/critical-paths.spec.ts` → **0 lignes** (spec intacte, tourne toujours, aucun skip ajouté). |
| 3  | SC3/DEBT-01/IN-01 — garde morte `api.ts:315` supprimée (pas commentée)                                                        | ✓ VERIFIED | `grep -rn "typeof response.status" app/src` → **0 occurrence** (exit 1). `api.ts:313` transmet `response.status` directement à `InviteRequestError`. Le `typeof response?.status` restant (`api.ts:712`) est le site settlement distinct (response optionnelle de `functions.invoke`), légitime et hors IN-01. |
| 4  | SC3/DEBT-01/IN-02 — select `service_role` borné dans la requête                                                               | ✓ VERIFIED | `supabase/functions/ardoise-invite/index.ts:668` `.in('expense_id', expenseIds)` (participants) et l.672 `.eq('household_id', householdId)` (members), avec `.order('id')` (I-02) — filtrage DANS la requête PostgREST, pas en JS. Balayage I-01 du fichier entier consigné (38-03-SUMMARY l.51-69 : 16 lectures `.from()`, toutes bornées). |
| 5  | SC3 — `test-db.sh` vert si SQL touché, sinon absence de Docker/SQL consignée                                                  | ✓ VERIFIED | Aucune migration touchée (`git diff cd3fdf1..HEAD -- supabase/migrations` vide — aucun commit de la phase ne porte un fichier SQL). Consignation explicite : 38-03-SUMMARY l.20 et l.114 « Aucune migration, aucun SQL modifié… test-db.sh non requis (I-03)… pas un silence » + 38-E2E-SIGNATURE.md §1. |
| 6  | SC4 — `debutSemaineIso`/`jourSemaine` de `lib/datetime.ts` seule source de l'arithmétique semaine (classe corrigée)            | ✓ VERIFIED | `datetime.ts:66,78` exports. `menu/types.ts:73` `weekStartOf` délègue à `debutSemaineIso`. `seed.ts` ancré 4× via les helpers, zéro `day()` nu dans `demoMealEntries` (signature §3). Preuve paramétrique 7 jours verte. |
| 7  | 38-02 — WR-03 attend un ÉTAT (`vi.waitFor`), reproduction W-02 avant fix, diagnostic consigné, test vert en répétition          | ✓ VERIFIED | `household-store.test.ts:344` `await vi.waitFor(...)` (plus de sommeil de 1 200 ms). Diagnostic W-02 présent : docs/RETROSPECTIVE.md l.762-788 (reproduction 1/30 sous charge, preuve d'innocence, cause timing). Spot-check comportemental : `npx vitest run datetime.test.ts seed.test.ts household-store.test.ts` → **3 fichiers, 45/45 passés** (ce run). |

**Score :** 7/7 truths verified (0 present-behavior-unverified)

### Commits vérifiés

Les 9 commits annoncés existent : 4f88b89, 8dace2c, 4f45e83 (38-01) ; 3eb42c1, 3895197, b4a19ef (38-02) ; 12fa95a, aacb209 (38-03) ; 3642e04 (38-04). Base cd3fdf1 confirmée.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `app/src/lib/datetime.ts` | exports debutSemaineIso/jourSemaine | ✓ VERIFIED | l.66, l.78 |
| `app/src/lib/datetime.test.ts` | 7 cas paramétriques | ✓ VERIFIED | it.each ×2, 14 tests |
| `app/src/lib/data/seed.ts` | demoMealEntries ancrées lundi | ✓ VERIFIED | 4× helper, 3 repas sur jours 0-2 |
| `app/src/lib/data/seed.test.ts` | garde anti-récidive semaine | ✓ VERIFIED | l.26 + cas-qui-doit-échouer l.44 |
| `app/src/modules/menu/types.ts` | weekStartOf = délégation | ✓ VERIFIED | l.73 |
| `app/src/stores/household-store.test.ts` | vi.waitFor, l.316-335 | ✓ VERIFIED | l.344 |
| `app/src/modules/ardoise/api.ts` | IN-01 supprimée | ✓ VERIFIED | l.313 direct |
| `supabase/functions/ardoise-invite/index.ts` | buildGuestView borné | ✓ VERIFIED | l.668, l.672 |
| `docs/RETROSPECTIVE.md` | diagnostic W-02 campagne v1.3 | ✓ VERIFIED | l.762-788 |
| `.planning/.../38-E2E-SIGNATURE.md` | signature run e2e + gardes | ✓ VERIFIED | chaîne + 6 gardes chiffrées |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| seed.ts demoMealEntries | datetime.ts | `jourSemaine(debutSemaineIso(todayIso()), n)` | ✓ WIRED | 4 occurrences |
| menu/types.ts weekStartOf | datetime.ts | délégation `return debutSemaineIso(isoDate)` | ✓ WIRED | une seule source |
| household-store.test.ts | vi.waitFor | attente d'état (patron route-error.test.tsx) | ✓ WIRED | l.344 |
| buildGuestView | requêtes bornées | `.in('expense_id')` / `.eq('household_id')` | ✓ WIRED | filtrage PostgREST, pas JS |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| typecheck | `cd app && npm run typecheck` | exit 0 | ✓ PASS |
| datetime + seed + household-store (WR-03, semis, garde) | `npx vitest run` sur les 3 fichiers | 45/45 passés, 3.82 s | ✓ PASS |
| IN-01 absente | `grep -rn "typeof response.status" app/src` | 0 occurrence | ✓ PASS |
| Spec join-token intacte | `git diff cd3fdf1..HEAD -- app/e2e/critical-paths.spec.ts \| wc -l` | 0 | ✓ PASS |

La chaîne complète (tests complets, build, e2e, contrôles SQL) a été exécutée et citée dans 38-E2E-SIGNATURE.md lors du plan 38-04 ; conformément à la règle « au plus un run complet par vérification », seul le spot-check ciblé a été relancé ici.

### Probe Execution

Aucun probe `scripts/*/tests/probe-*.sh` déclaré par la phase — SKIPPED. Les contrôles §2.7 (`check-sql-statique.py`, `test-check-sql-statique.py`) ont tourné au vert dans le run 38-04 (230 fonctions, 6 cas).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| TEST-01 | 38-01, 38-02 | Flocons dimanche corrigés à la racine (helpers lundi, 7 jours, pas d'horloge figée) | ✓ SATISFIED | Truths 1, 6, 7 |
| TEST-03 | 38-02, 38-04 | Chaîne e2e 100 % verte (join-token documenté J-01, soldé phase 39) | ✓ SATISFIED | Truth 2 |
| DEBT-01 | 38-03 | IN-01 supprimée + IN-02 borné + test-db.sh si SQL | ✓ SATISFIED | Truths 3, 4, 5 |

Aucune exigence orpheline : les 3 IDs du frontmatter des plans couvrent exactement les IDs assignés à la phase 38 dans REQUIREMENTS.md (TEST-02/SMOKE-01 appartiennent à la phase 39, hors périmètre).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | Aucun TBD/FIXME/XXX/placeholder introduit par la phase | ℹ️ Info | Aucun marqueur de dette ajouté (`git diff cd3fdf1..HEAD` ne contient aucun marqueur) |

Note ℹ️ : le site `api.ts:712` (`typeof response?.status`) ressemble à IN-01 mais est un site distinct et légitime (response de `functions.invoke` optionnelle, erreur settlement) — pas une récidive.

### Human Verification Required

Aucune — tous les must-haves ont une preuve comportementale exécutable (tests unitaires relancés, e2e signé dans 38-E2E-SIGNATURE.md avec signature exacte obtenue : 1 rouge documenté sur les 2 d'avant phase).

### Gaps Summary

Aucun gap. Le flake menu du dimanche est éradiqué par correction de classe (helpers de production + preuve paramétrique 7 jours + garde anti-récidive avec cas-qui-doit-échouer), le flake WR-03 par correction test-only après reproduction documentée, la dette review 37 est soldée (IN-01 supprimée, IN-02 borné dans la requête, balayage de classe consigné), et la chaîne §2.7 est verte hors le rouge join-token explicitement exclu (J-01/J-02, porté par TEST-02 en phase 39, sans skip ni masquage).

---

_Verified: 2026-11-08T19:21:25Z_
_Verifier: the agent (gsd-verifier)_
