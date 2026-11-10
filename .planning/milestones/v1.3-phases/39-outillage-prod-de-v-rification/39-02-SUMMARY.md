---
phase: 39-outillage-prod-de-vérification
plan: 02
subsystem: testing
tags: [e2e, playwright, join-token, flux-31-03, run-séparé, secrets]

requires:
  - phase: 39-outillage-prod-de-vérification (plan 01)
    provides: scripts/lib-smoke-accounts.sh — bibliothèque comptes (create/purge/session), consommée telle quelle (CS-04)
  - phase: 31-inscriptions-ouvertes (31-03)
    provides: le flux join-token réel que la spec vérifie (D-03/D-06/D-07/D-08/D-09/D-17/D-20)
provides:
  - scripts/test-join-token-real.sh — wrapper du run séparé (refus sans stack, --project=chromium, trap de purge vérifiée)
  - app/e2e/join-token-real.spec.ts — les 6 points JT-02 contre la stack déployée
  - app/playwright.config.ts — routage testIgnore (run standard sans la spec réelle, JT-01)
affects: [phase-40-ardoise, gsd-verify-work, docs/EXPLOITATION.md (référence test-join-token-real.sh résolue)]

actuals:
  tokens: 6900    # chars/4 sur le diff réalisé (27 681 chars mesurés du ledger au HEAD)
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Run séparé e2e : la spec réelle vit hors du run standard via testIgnore clé E2E_BASE_URL — routage de run, pas un skip (JT-01/JT-03)"
    - "Le wrapper sh prépare comptes/foyer/token et exporte UNIQUEMENT des valeurs publiques/éphémères vers le processus Node (JT-04)"
    - "D-17 provoqué déterministement : token à courte durée de vie créé par la vraie Edge depuis la session UI — la preview réussit, le redeem échoue après expiration réelle (aucune horloge figée)"

key-files:
  created:
    - scripts/test-join-token-real.sh
    - app/e2e/join-token-real.spec.ts
  modified:
    - app/e2e/critical-paths.spec.ts
    - app/playwright.config.ts
    - .planning/phases/38-filet-de-tests-fiable/38-E2E-SIGNATURE.md (artefact gitignored, re-daté — jamais stage)

key-decisions:
  - "Routage par testIgnore dans playwright.config.ts (Rule 3, découvert au run standard) : la spec réelle tournée en mode démo échouait et cassait JT-01 — le standard reste 100 % vert sans elle, la spec est incluse dans son propre run par le wrapper"
  - "D-17 atteint sans horloge figée : token expiresAt = now + 6 s créé via la vraie Edge avec la session UI de l'invitante ; preview consultée avant expiration, redeem cliqué après (attente réelle de 9 s)"
  - "Purge élargie aux foyers : le cleanup liste les foyers de l'invitante (UI + RPC) via /rest/v1/households et les supprime avant la purge des comptes — un foyer survivrait à la suppression des comptes (created_by en on delete set null)"
  - "Exports Playwright étendus (E2E_INVITER_EMAIL/PASSWORD, E2E_JOIN_HOUSEHOLD_ID, E2E_API_URL, E2E_PUBLISHABLE_KEY) : même classe de valeurs publiques/éphémères, le secret ne quitte jamais le shell (JT-04)"
  - "Tests en mode serial : les comptes du run sont partagés et GoTrue limite les grants — l'ordre garantit que D-17/D-09 passe AVANT le redeem heureux (l'invité sans foyer atterrit sur /foyer)"

requirements-completed: [TEST-02]

coverage:
  - id: D1
    description: "Wrapper run séparé : refus sans stack/E2E_BASE_URL, --project=chromium + cd app, purge vérifiée en trap, secret confiné au shell"
    requirement: TEST-02
    verification:
      - kind: other
        ref: "sh -n scripts/test-join-token-real.sh (pass) ; grep project=chromium / cd app (pass)"
      - kind: other
        ref: "grep -nE '\\-H \"[^\"]*SECRET_KEY' scripts/test-join-token-real.sh — sortie vide (pass)"
      - kind: manual_procedural
        ref: "sh scripts/test-join-token-real.sh depuis l'hôte de la stack (DS-01, run réel)"
        status: unknown
    human_judgment: true
    rationale: "Le run réel exige la stack déployée + SUPABASE_SECRET_KEY — indisponible sur la machine de travail (DS-01, user_setup)"
  - id: D2
    description: "Spec réelle : les 6 points JT-02 avec les sélecteurs réels (role=alert verbatim D-03/D-17, sessionStorage D-06, waitForURL > 3000 ms D-09), bornage documenté, aucun skip conditionnel"
    requirement: TEST-02
    verification:
      - kind: other
        ref: "npm run typecheck (pass) ; garde anti-skip/anti-grepExclude vert sur git diff HEAD -- app/e2e app/src (pass)"
      - kind: manual_procedural
        ref: "Run réel du wrapper contre la stack (DS-01) — les 6 points JT-2 verts attendus"
        status: unknown
    human_judgment: true
    rationale: "Même bornage que D1 : la spec exige la stack déployée"
  - id: D3
    description: "Run standard 0 rouge assumé + signature e2e 38 re-datée"
    requirement: TEST-02
    verification:
      - kind: other
        ref: "npm run test:e2e : 163 passed / 9 skipped / 0 failed (pass) — le rouge join-token historique est soldé"
      - kind: other
        ref: "38-E2E-SIGNATURE.md §5 re-datée 2026-11 : 2 rouges soldés, baseline 163-9-0 expliquée (Pitfall 6)"
    human_judgment: false

duration: 30min
completed: 2026-11-09
status: complete
plan_head_before: 59d6e158c1373211e2842520b2d81acb0ac42092
plan_head_after: 339a80b
commits: 3
---

# Phase 39 Plan 02: Spec e2e réelle join-token — run séparé contre la stack déployée Summary

**Spec Playwright réelle du flux 31-03 (les 6 points JT-02, sélecteurs DOM réels, D-17 provoqué par expiration réelle sans horloge figée), orchestrée par un wrapper qui crée/purge les comptes via la bibliothèque smoke du plan 01 — et le run standard soldé : 163 passed / 9 skipped / 0 failed, plus aucun rouge assumé.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-11-09T10:25Z (ledger à 59d6e15)
- **Completed:** 2026-11-09T10:55Z
- **Tasks:** 3/3
- **Files modified:** 4 + artefact signature 38 (gitignored)

## Accomplishments

- `scripts/test-join-token-real.sh` (analogue de test-dispatch-push.sh) : en-tête « ce que ça prouve / ne prouve pas », refus nommé sans stack joignable (sonde `/auth/v1/health`), sans URL de frontend (SITE_URL/E2E_BASE_URL) ni clé publiable ; comptes `e2e+<runid>-N@…` créés puis connectés par `lib-smoke-accounts.sh` (grant password, A1), foyer via `create_household`, token via la Edge `household-invite` — la même chaîne que le smoke ; exporte UNIQUEMENT des valeurs publiques/éphémères vers Playwright ; `--project=chromium` dans `(cd app && …)` (Pitfall 4 : jamais 2 runs, jamais 2× les comptes) ; trap de purge vérifiée re-delete→404 + détection résiduelle EE-02, code de sortie = celui de la spec, les deux verdicts rapportés (§2.7 F)
- `app/e2e/join-token-real.spec.ts` : les 6 points JT-02 — (1) foyer créé depuis l'UI (token copiable + QR), (2) pré-écran public nommant l'invitante (D-20), (3) traversée D-06 avec assert sessionStorage AVANT navigation, (4) redeem authentifié D-08 par CTA explicite avec retour D-07, (5) D-17 puis atterrissage D-09 (`waitForURL('/foyer', {timeout: 10_000})` > 3000 ms, Pitfall 7), (6) message uniforme D-03 verbatim sur token mort (public et authentifié) ; bornage email documenté en en-tête ; aucun marquage d'omission — échec nommé sans entrées (JT-03)
- `app/e2e/critical-paths.spec.ts` : les 2 tests périmés du mode démo pré-31-03 supprimés (JT-03), suppression consignée en commentaire
- `app/playwright.config.ts` : `testIgnore` clé sur `E2E_BASE_URL` — la spec réelle appartient à son run séparé (JT-01), le standard reste 100 % vert sans elle
- Signature e2e 38 re-datée (§5) : 2 rouges soldés, nouvelle baseline `163 passed / 9 skipped / 0 failed` expliquée (Pitfall 6)

## Task Commits

1. **Task 1: Tracer — wrapper + spec réelle, 2 tests périmés supprimés** — `2adfcd6` (feat)
2. **Task 2: Expansion — bornage documenté en en-tête** — `509ba61` (feat)
3. **Task 3: Clôture — routage testIgnore, run standard 0 rouge, signature re-datée** — `339a80b` (fix)

## Files Created/Modified

- `scripts/test-join-token-real.sh` — wrapper du run séparé (nouveau)
- `app/e2e/join-token-real.spec.ts` — les 6 points JT-02 (nouveau)
- `app/e2e/critical-paths.spec.ts` — 2 tests supprimés + commentaire de suppression
- `app/playwright.config.ts` — routage testIgnore (Rule 3)
- `.planning/phases/38-filet-de-tests-fiable/38-E2E-SIGNATURE.md` — §5 re-datée (artefact de phase, gitignored, jamais stage)

## Decisions Made

- **Routage testIgnore (Rule 3)** : le premier run standard a ramassé la spec réelle (testDir ./e2e) et échoué nommément — ce bruit aurait violé JT-01 (standard 100 % vert). Le testIgnore clé sur E2E_BASE_URL est du routage de run (le wrapper inclut la spec dans SON run), pas un skip : sans stack, la spec échoue nommément DANS son run. Consigné dans la config.
- **D-17 sans horloge figée** : la preview et le redeem partagent les mêmes bornes SQL (0176) — le seul état où la preview réussit et le redeem échoue est l'expiration entre les deux. Le test crée un token `expiresAt = now + 6 s` via la VRAIE Edge avec la session UI de l'invitante, consulte, attend 9 s réelles, clique : 410 → verbatim D-17 → atterrissage D-09.
- **Purge élargie aux foyers** : le foyer créé par l'UI de la spec (point 1) n'est pas connu du wrapper — le cleanup liste les foyers de l'invitante (`/rest/v1/households` + JWT) et les supprime AVANT la purge des comptes, sinon `created_by on delete set null` laisse un foyer orphelin.
- **Ordre serial** : D-17/D-09 passe avant le redeem heureux, pour que l'invité soit SANS foyer au moment de l'atterrissage `/foyer` (après le redeem heureux, la garde RequireNoHousehold redirigerait /foyer → /accueil).
- Exports Playwright étendus (invitante email/mot de passe, household id, URL API, clé publiable) : même classe de valeurs publiques/éphémères, un seul chemin vers `SUPABASE_SECRET_KEY` (JT-04 respecté — vérifié : aucun `-H "…SECRET…"` inline, le secret ne circule que via `-K` 0600 dans la bibliothèque).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Routage de la spec réelle hors du run standard**
- **Found during:** Task 3 (run standard)
- **Issue:** `testDir: './e2e'` ramasse la nouvelle spec dans le run standard (mode démo) où elle échoue nommément — le run standard n'était plus 100 % vert (JT-01 cassé)
- **Fix:** `testIgnore: ['**/join-token-real.spec.ts']` quand `E2E_BASE_URL` est absent, avec commentaire nommant la raison (routage de run, pas un skip)
- **Files modified:** app/playwright.config.ts (non déclaré dans files_modified du plan)
- **Commit:** 339a80b

### Structure note

Les deux cas de token mort (6a public / 6b authentifié) sont livrés dans le commit du Task 1 plutôt que dans celui du Task 2 (rédigés avec le chemin heureux pour un seul passage de typecheck) ; le commit du Task 2 porte le bornage en-tête exigé par son action et ses critères. Aucun critère d'acceptation n'est perdu.

## Issues Encountered

- **Échec unitaire préexistant, hors périmètre** : `npm test` → 1 échec (`calendrier-page.test.tsx` l.165), 243/244 fichiers et 1987/1988 tests verts — même défaut que celui consigné par le plan 39-01 dans deferred-items.md. Non corrigé (scope boundary), ajouté au deferred-items.md.
- **Run réel non exécuté ici (DS-01, par conception)** : la machine de travail n'a ni stack joignable ni `SUPABASE_SECRET_KEY`. Passages obligatoires avant `/gsd-verify-work` : `sh scripts/test-join-token-real.sh` depuis l'hôte de la stack — les 6 points JT-02 verts + la ligne « comptes purgés, purge prouvée (re-delete → 404) » du trap.

## Run réel, A1 et domaine e2e (consignés, Task 3)

- **Run réel du wrapper (DS-01, manual-only)** : NON exécuté sur cette machine — dit ici, jamais passé sous silence (§2.7 F). `sh scripts/test-join-token-real.sh` reste le passage obligatoire depuis l'hôte de la stack avant `/gsd-verify-work`.
- **A1 (grant_type=password sur compte admin-créé)** : implémenté et consommé des deux côtés (le smoke du plan 01 connecte Alice et Bob ainsi ; le wrapper connecte ses deux comptes ainsi) — la preuve réelle reste le run manuel sur la stack ; fallback documenté si échec au premier run : `generate_link` Admin (chemin non représentatif, à consigner avant adoption).
- **Domaine e2e (EE-01, Open Question 1)** : défaut `ensemble.jeremymaillot.fr` (variable `E2E_MAIL_DOMAIN`, lisible du `.env` de la stack) — techniquement aucun DNS requis puisque les comptes admin-créés n'envoient JAMAIS d'email ; à remplacer si un sous-domaine est réservé.

## User Setup Required

Oui — DS-01, déjà posé par le plan 01 :

- **Service** : stack Supabase déployée joignable + frontend déployé (SITE_URL ou E2E_BASE_URL).
- **Variable** : `SUPABASE_SECRET_KEY` dans le `.env` de la stack (l'hôte) — jamais sur la machine de travail.
- **Optionnel** : `E2E_MAIL_DOMAIN=<sous-domaine>` dans le `.env` de la stack si un sous-domaine e2e est réservé (EE-01).

## Known Stubs

None — aucun stub : le wrapper et la spec sont intégralement câblés ; la seule preuve en suspens est le run réel manuel (DS-01), tracé dans coverage D1/D2 et la section ci-dessus.

## Next Phase Readiness

- `docs/EXPLOITATION.md` (section smoke-test prod du plan 01) référence `sh scripts/test-join-token-real.sh` : la référence est désormais RÉSOLUE (le fichier existe).
- `/gsd-verify-work` : chaîne verte (hors l'échec unitaire préexistant consigné), run réel du smoke + du wrapper à exécuter sur l'hôte de la stack.
- Phase 40 (ardoise « Rejoindre via mon compte ») peut consommer `lib-smoke-accounts.sh` + le pattern du wrapper.

---
*Phase: 39-outillage-prod-de-vérification*
*Completed: 2026-11-09*

## Self-Check: PASSED

- `scripts/test-join-token-real.sh`, `app/e2e/join-token-real.spec.ts`, `app/e2e/critical-paths.spec.ts`, `app/playwright.config.ts`, SUMMARY : présents sur disque
- Commits `2adfcd6`, `509ba61`, `339a80b` : présents dans l'historique, arbre propre sur les fichiers du plan
- `commits: 3` mesuré depuis le ledger (`59d6e15..339a80b`) ; `.planning/` gitignored → commit de métadonnées sauté (chemin intentionnel)
