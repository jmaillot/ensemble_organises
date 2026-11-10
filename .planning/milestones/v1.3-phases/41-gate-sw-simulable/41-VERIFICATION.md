---
phase: 41-gate-sw-simulable
verified: 2026-11-10T00:00:00Z
status: passed
score: 7/7 must-haves verified
covered_files:
  - .planning/phases/41-gate-sw-simulable/41-01-PLAN.md
  - .planning/phases/41-gate-sw-simulable/41-01-SUMMARY.md
  - app/src/lib/e2e-sw-harness.ts
  - app/e2e/sw-gate-real.spec.ts
  - scripts/test-sw-gate.sh
  - scripts/e2e-sw-server.mjs
  - app/src/main.tsx
  - app/src/sw.ts
  - app/playwright.config.ts
  - docs/EXPLOITATION.md
covered_digest: "v2:sha256:5197c51cd134cd6c25ab725164c9b0d93a1c52d5bb7f63cd71c0f61aaf00af80"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 7/7
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 41: Gate SW « file vide » simulable — Verification Report

**Phase Goal:** Le chemin runtime complet de la gate de mise à jour « file vide » est prouvé au moins une fois contre un build+preview réel — GATE-01 devient planifiable au lieu d'observatoire.
**Verified:** 2026-11-10
**Status:** passed
**Re-verification:** Yes — digest only (previous verification 7/7 passed; no covered source file changed since — git log shows the last touches are the phase 41 commits themselves; digest stale-flag only)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Spec e2e : deux builds successifs (VITE_BUILD_ID distinct, precache distinct, même origin 127.0.0.1:4173), contexte Playwright neuf, worker B en attente réel, bandeau « Une mise à jour est disponible », « Recharger » applique le build B | ✓ VERIFIED (behavioral) | Cas 1 de `app/e2e/sw-gate-real.spec.ts:211` — **prouvé par run du vérificateur précédent** : `sh scripts/test-sw-gate.sh` → 4 passed (15.4 s), EXIT=0 (ré-exécuté au 2026-11-10 ~10:12 ; aucun fichier couvert modifié depuis — preuve toujours valable). Wrapper prouve `diff dist-v1/sw.js ≠ dist-v2/sw.js` avant le run ; buildId incrusté vérifié par grep des deux bundles |
| 2 | Gate fermée (file non vide : bouton « Mise à jour en préparation… » désactivé, aucun reload) ET ouverte (file vide : application du build B), prouvées séparément | ✓ VERIFIED (behavioral) | Cas 2 (`sw-gate-real.spec.ts:228`) : injectOutboxPending → bouton disabled + clic forcé sans changement de buildId, puis clearOutbox → buildId passe à gate-b. Note wording : le critère roadmap dit « bandeau absent » ; l'observable réel prouvé est « application impossible » (mapping documenté dans le PLAN, flagged_assumptions — les deux lectures OQ-1a/OQ-1b couvertes par les cas 2 et 3) |
| 3 | File seule sans mise à jour SW → aucun bandeau (OQ-1a) | ✓ VERIFIED (behavioral) | Cas 3 (`sw-gate-real.spec.ts:258`) — vert au run du vérificateur précédent |
| 4 | Simulation par harnais dev-only injectant dans les stores existants — sw-register.ts ni forké ni mocké | ✓ VERIFIED | `e2e-sw-harness.ts` : garde `VITE_E2E_SW_HARNESS === '1'`, écriture via `enqueueOutbox` sur le queryClient de l'app + `signInDemo()` ; **ré-vérifié cette passe** : `git log -1 -- sw-register.ts` → d76ebd8 (phase 32), `use-outbox-gate.ts`/`update-banner.tsx` → ad1296d (phase 34), aucun commit 41 sur les trois ; grep anti-prod du bundle standard : 0 occurrence (vérifié dans le run du vérificateur précédent) |
| 5 | Run e2e standard reste vert sans le wrapper (routage testIgnore à deux conditions) | ✓ VERIFIED | `app/playwright.config.ts` l.28-29 : ignoresSwGate + ignoresJoinToken coexistantes ; webServer désactivé sous E2E_SW_BASE_URL ; `npx playwright test --list` sans la variable → **0 test** (la spec sw-gate est exclue du run standard, preuve directe) |
| 6 | GATE-PROD consigné comme observatoire hors jalon, distinct de la validation simulée | ✓ VERIFIED | **Ré-vérifié cette passe** : `docs/EXPLOITATION.md:431` — section « GATE-PROD — re-test de la gate en conditions réelles (observatoire hors jalon) » : déclenchement naturel, renvoi à 32-UAT 7 / 35-UAT 2, bornage prouvé/non prouvé ; ligne STATE.md:68 (Todos) présente et inchangée |
| 7 | Contrôle négatif falsifiable (rouge-avant-vert) | ✓ VERIFIED | Cas 4 (`sw-gate-real.spec.ts:269`) vert à l'état committé (run du vérificateur précédent) ; preuve rouge consignée au SUMMARY avec sortie exacte (TEST_SW_GATE_CONTROLE_ROUGE=1 → 1 failed sur toHaveCount(0) du bandeau, rig E2E_SW_CONTROLE_ROUGE l.67/278) |

**Score:** 7/7 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `scripts/test-sw-gate.sh` | wrapper deux builds, preuve diff, refus nommé, purge rapportée | ✓ VERIFIED | 198 lignes ; `cmp -s` l.116 → refus nommé si precache identique ; `kill -0` l.158 avant chaque curl ; purge rapportée (vue dans le run) |
| `scripts/e2e-sw-server.mjs` | serveur Node natif, no-cache, symlink relu à chaque requête | ✓ VERIFIED | `readlinkSync` par requête l.52, `Cache-Control: no-cache` l.99, zéro dépendance |
| `app/e2e/sw-gate-real.spec.ts` | 4 cas, verbatims D-17, refus nommé sans entrées | ✓ VERIFIED | 304 lignes, `variableRequise` l.47, verbatims l.72-74, attentes d'état nommé (poll), aucun waitForTimeout |
| `app/src/lib/e2e-sw-harness.ts` | harnais flag-compilé, `window.__eoSwHarness` | ✓ VERIFIED | Garde build-time l.46, enqueueOutbox sur queryClient l.75, session garantie par signInDemo l.59 |
| `app/src/main.tsx` | branchement du harnais | ✓ VERIFIED | l.83-84 : import dynamique derrière la même garde |
| `app/playwright.config.ts` | testIgnore à deux variables | ✓ VERIFIED | liste construite par condition, webServer conditionnel |
| `docs/EXPLOITATION.md` | section GATE-PROD | ✓ VERIFIED | l.431-459 (grep GATE-PROD ré-vérifié cette passe) |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| wrapper | deux builds | `VITE_BUILD_ID=gate-a|gate-b` + diff sw.js non vide avant run | ✓ WIRED | preuve affichée dans le run (« ✓ diff dist-v1/sw.js ≠ dist-v2/sw.js ») |
| serveur harnais | navigateur | no-cache + symlink `dist-current` → revalidation réelle de /sw.js → onNeedRefresh réel → bandeau DOM | ✓ WIRED | prouvé comportementalement : bandeau visible au cas 1-2, worker activated poll l.167-176 |
| harnais | outbox (source unique D-03) | `enqueueOutbox(queryClient, …)` + `outboxKeyFor` | ✓ WIRED | use-outbox-gate dérive réactivement (bouton disabled observé au cas 2) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| sw-gate-real.spec.ts | buildId servi | `import.meta.env.VITE_BUILD_ID` incrusté au build (grep vérifié par le wrapper) | Oui | ✓ FLOWING |
| harnais | file outbox | `enqueueOutbox` sur queryClient (D-03) | Oui | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Chaîne complète GATE-01 (4 cas) | `sh scripts/test-sw-gate.sh` | 4 passed (15.4 s), EXIT=0 — run vérificateur 2026-11-10, aucun fichier couvert modifié depuis | ✓ PASS |
| Anti-prod A2 | grep bundle standard (fait par le wrapper) | « ✓ … 0 occurrence de __eoSwHarness » | ✓ PASS |
| Routage standard | `npx playwright test e2e/sw-gate-real.spec.ts --list` (sans env) | 0 test (exclu du run standard) | ✓ PASS |

Cette re-verification est un digest-only : aucun fichier couvert n'a changé depuis le run vert du vérificateur précédent (confirmé par `git log` — les derniers touchers sont les commits 41 eux-mêmes : d0d44b5, 84b8a26, 9b99cbf). Le run `test-sw-gate.sh` n'est pas ré-exécuté ; la preuve comportementale du 2026-11-10 reste valable.

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| `scripts/test-sw-gate.sh` | `bash scripts/test-sw-gate.sh` | exit 0, 4/4 cas verts (run 2026-11-10, aucun fichier couvert modifié depuis) | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| GATE-01 | 41-01 | Chemin runtime complet de la gate « file vide » validé e2e contre build+preview réel ; re-test réel reste observatoire hors jalon | ✓ SATISFIED | Truths 1-6 ; GATE-PROD consigné (docs/EXPLOITATION.md:431) |

Aucune exigence orpheline : REQUIREMENTS.md mappe GATE-01 uniquement à la phase 41, couvert par le plan 41-01.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (aucun) | — | grep TODO/FIXME/XXX/TBD/PLACEHOLDER sur les 4 fichiers créés : 0 occurrence | — | — |

### Wording Note (documented deviation, not a gap)

Le critère roadmap 2 dit « file non vide (bandeau absent) » ; le code réel (sw-register.ts, phase 32) rend le bandeau dès `onNeedRefresh` sans condition sur la file — la gate porte sur le BOUTON (update-banner.tsx `disabled={!isEmpty}`, D-10). Le PLAN documente cet écart de wording en flagged_assumption et prouve les DEUX lectures : file+update → application bloquée (cas 2), file seule → aucun bandeau (cas 3). La substance du critère (la gate se referme quand la file n'est pas vide) est prouvée ; l'écart est un héritage de la phase 32, non de la 41.

### Human Verification Required

None — les 4 cas de la spec ont tourné au vert pendant la vérification initiale (run direct du vérificateur, 2026-11-10), aucun fichier couvert n'a changé depuis, et le bornage prod (GATE-PROD) est explicitement hors jalon et consigné comme observatoire.

### Gaps Summary

Aucun gap. Tous les must-haves sont vérifiés avec preuve comportementale directe (le vérificateur initial a exécuté `sh scripts/test-sw-gate.sh` : 4 cas verts, EXIT=0, purge des artefacts confirmée ; aucun fichier couvert modifié depuis — preuve toujours valable). La prohibition anti-fork est ré-prouvée cette passe par git log (sw-register.ts → d76ebd8 phase 32 ; use-outbox-gate.ts et update-banner.tsx → ad1296d phase 34). GATE-01 est planifiable.

---

_Verified: 2026-11-10_
_Verifier: the agent (gsd-verifier)_
