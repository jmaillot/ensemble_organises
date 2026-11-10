# Plan Check — Phase 41 « Gate SW simulable » (41-01-PLAN.md)

**Vérifié le :** 2026-11-10 — goal-backward, adversarial stance
**Sources :** 41-01-PLAN.md, 41-RESEARCH.md, 41-PATTERNS.md, ROADMAP.md §Phase 41 (Goal + 4 SC), REQUIREMENTS.md GATE-01/GATE-PROD, STATE.md l.68, AGENTS.md §2.7, plan de référence 40-01-PLAN.md, mesures live du dépôt (playwright.config.ts, existence des chemins, grep Dockerfile/compose.app.yaml).

**Verdict : PASS-with-concerns** — 0 blocker, 1 warning, 4 info.

---

## Dimension 1 — Requirement Coverage (goal-backward)

| SC | Preuve prévue par le plan | Verdict |
|----|---------------------------|---------|
| SC 1 : deux builds, hash precache distinct, même origin, contexte neuf, VITE_BUILD_ID, bandeau réel | Task 1 tracer : wrapper construit dist-v1/dist-v2 avec `VITE_BUILD_ID` distincts, `diff dist-v1/sw.js dist-v2/sw.js` non vide AVANT la spec (refus nommé si identiques), serveur Node natif no-cache + symlink relu à chaque requête, reload → revalidation réelle de /sw.js, `expect(banner).toBeVisible()`, buildId gate-a→gate-b | COVERED |
| SC 2 : gate prouvée séparément dans les deux conditions | Task 2 : cas 1 (file non vide + update → bouton « Mise à jour en préparation… » désactivé, aucun reload), cas 2 (file vidée → « Recharger » → buildId gate-b), cas 3 (OQ-1a : file seule sans update → aucun bandeau) | COVERED |
| SC 3 : harnais dev-only, injection store existant, pas de fork/mock | Task 1-2 : harnais flag-compilé `VITE_E2E_SW_HARNESS`, injecte via `queryClient` exporté (D-03) + stores `getState()` ; critères exigent **git diff nul** sur sw-register.ts, use-outbox-gate.ts, update-banner.tsx + grep anti-fork (`onNeedRefresh` une seule occurrence) + grep du bundle standard sans le harnais (A2) | COVERED |
| SC 4 : GATE-PROD observatoire, non confondu | Task 3 : section docs/EXPLOITATION.md (condition de déclenchement naturelle, 32-UAT 7 / 35-UAT 2, bornage prouvé/non prouvé) ; `git diff` vide exigé sur .planning/STATE.md ; HALT si la ligne Todos l.68 n'existe plus (§2.7 I) | COVERED |

GATE-01 est le seul requirement de la phase (ROADMAP l.85) et figure dans `requirements: [GATE-01]`. Aucun requirement relevant de la phase n'est silencieusement abandonné.

## Dimension 2 — Task Completeness

- Task 1 (tracer) : files/action/verify/done complets ; action spécifique en 16 sous-points avec chemins exacts.
- Task 2 (tdd) : behavior/action/verify/done complets ; 4 cas dont un contrôle négatif rouge-avant-vert.
- Task 3 (auto) : complet.
- Les 3 `<automated>` sont capables d'échouer (wrapper refuse, spec échoue, grep -c à 0 → exit 1). Pas de `2>/dev/null || echo`, pas d'ancres `^` sur sortie d'outil, pas de compte hard-codé non sourcé, pas de watch-mode, pas de directive linter, pas de test.skip/grepExclude.

## Dimension 3 — Dependencies / couplage

Un seul plan, `depends_on: []`, wave 1. Ordre interne cohérent : harnais câblé dès le tracer (Task 1 point 2), les deux builds construits avant tout lancement de spec (point 9-10), contrôle diff sw.js avant Playwright (point 10), commutation faite par la spec au moment requis (point 12). Rien à signaler.

## Dimension 3b — Couplage temporel

Sans objet (un seul plan).

## Dimension 4 — Key Links

Les trois key_links du frontmatter (wrapper→builds→diff, serveur→symlink→onNeedRefresh→banner-store→DOM, harnais→queryClient/stores→useOutboxGate→bouton) sont chacun implémentés par une action nommée (Task 1 points 4-5, 9-13, 16 ; Task 2 points 1-3). Le wiring est planifié, pas seulement les artefacts.

## Dimension 5 — Scope Sanity

3 tasks / ~7 fichiers — dans les seuils (2-3 tasks, ≤10 fichiers). estimate 90 000 tokens, confidence low (déclarée honnêtement, <3 phases avec actuals). OK.

## Dimension 6 — must_haves Derivation

Truths observables par l'utilisateur/réel (« le bandeau apparaît », « le bouton est désactivé », « le buildId passe de A à B »), pas des détails d'implémentation. flagged_assumptions honnêtes (A4/A5 imposés comme prérequis HALT avant code — bien). Un truth (l.25) est un long condensé technique mais reste ancré sur des observables DOM/réels.

## Dimension 7 — Context Compliance

Pas de CONTEXT.md pour cette phase — sans objet. Les décisions verrouillées existantes (D-03, D-10, D-17) sont citées et respectées ; aucune idée différée n'est implémentée (GATE-PROD reste observatoire, conforme PROJECT.md l.98).

## Dimension 7b — Scope Reduction

Aucun langage de réduction (« v1 », « stub », « future enhancement »). L'écart de wording SC2 (« bandeau absent » vs réalité « bandeau présent, application fermée ») est consigné explicitement comme flagged_assumption avec les DEUX lectures (OQ-1a/1b) prouvées par les cas 3 et 1 — c'est un écart documenté, pas une réduction silencieuse. Non blocker.

## Dimension 7c — Architectural Tier

RESEARCH a une Responsibility Map : détection SW = navigateur, gate = frontend React, injection = frontend flag-build, service = serveur statique. Le plan respecte la carte (le harnais écrit dans l'état client existant, jamais côté gate).

## Dimension 8 — Nyquist / 8f

Chaque task a `<automated>` + `<fails_when>` nommant les sorties d'échec. Rouge-avant-vert planifié : cas 4 (contrôle négatif « deux fois le même build ») doit être vu rouge puis vert, preuve commandes+sortie exigée dans le résumé ; le diff sw.js est un contrôle prouvé sur son entrée (refus si identiques). Conforme §2.7 B.

## Dimension 9 — Cross-Plan Data Contracts

Sans objet (un seul plan). Interne : le harnais n'a qu'un canal d'écriture de la file (helper outbox.ts sur le queryClient exporté, grep exigé), pas de transformation conflictuelle.

## Dimension 10 — AGENTS.md §2.7

Chaîne de vérification reproduite dans les 3 verify (typecheck, tests, build, e2e standard, check-sql-statique) ; test-db.sh explicitement non requis (aucun SQL — vérifié : files_modified ne contient aucune entrée supabase/). Pas de directive linter. Secrets : aucune valeur sensible, `VITE_BUILD_ID` valeur de test (T-41-02). Français qui nomme les raisons exigé partout.

## Dimension 11 — Research Resolution

RESEARCH Open Questions : OQ-1 (les deux lectures de SC2) → résolu dans le plan (cas 1 + cas 3). OQ-3/A5 → affecté au Task 2 point 0 avec HALT si non établissable. OQ-2 (chromium seul) → tranché (`--project=chromium`). La section n'a pas de suffixe `(RESOLVED)` dans le fichier RESEARCH, mais chaque question a reçu une résolution exécutable dans le plan — info, pas blocker.

## Dimension 12 — Pattern Compliance

PATTERNS.md affecte un analogue à chaque fichier ; le plan cite les analogues par chemin + lignes dans les read_first (join-token-real l.3-36/40-52/64-71, test-join-token-real.sh l.8-28/56-64/283-293, nginx.conf, update-banner.tsx l.25-32). Conformes.

## Verify Command Format Sanity

Pas d'anti-pattern bloquant. `grep -c "GATE-PROD"` échoue proprement à 0 occurrence (exit 1). Aucun comptage hard-codé non sourcé.

## Verify Command Path Resolvability

Tous les chemins cités existent (mesuré live) : app/src/lib/sw-register.ts, app/src/hooks/use-outbox-gate.ts, use-outbox.ts, app/src/components/banners/update-banner.tsx, app/src/main.tsx, app/playwright.config.ts, app/vite.config.ts, app/src/lib/query-policy.ts, app/src/lib/offline/outbox.ts, scripts/test-join-token-real.sh, scripts/check-precache-coverage.sh, docs/EXPLOITATION.md, app/e2e/join-token-real.spec.ts, critical-paths.spec.ts. `testIgnore` actuel = ternaire `E2E_BASE_URL ? [] : ['**/join-token-real.spec.ts']` (l.14), `webServer` désactivé seulement par E2E_BASE_URL (l.33) — voir warning W1.

---

## Issues

### Warnings

**W1. [task_completeness] Le `webServer` de playwright.config.ts doit être désactivé par `E2E_SW_BASE_URL`, et aucune action du plan ne l'écrit**
- Plan: 41-01, Task: 1
- Evidence: Le truth l.29, l'action (11) et le `fails_when` du Task 1 affirment « webServer Playwright désactivé par E2E_SW_BASE_URL ». Mais la seule modification de playwright.config.ts décrite est l'action (6), qui remplace uniquement `testIgnore` — le `webServer` actuel (l.33-40) n'est désactivé que par `E2E_BASE_URL`, qui n'est PAS posé par le run sw-gate (action 11 ne pose que `E2E_SW_BASE_URL`, `E2E_SW_BUILD_ID_1/2`). En l'état planifié, le run sw-gate démarrerait `npm run build && npm run preview --strictPort` sur 4173 : collision strictPort avec le serveur harnais déjà démarré, ou (localement, `reuseExistingServer: !CI`) réutilisation silencieuse du serveur harnais par ordre de démarrage — fragile et faux en CI. Les acceptance criteria du Task 1 ne couvrent pas ce point.
- Example fix (non-binding) : étendre l'action (6) pour que la condition de `webServer: undefined` porte sur `E2E_BASE_URL || E2E_SW_BASE_URL`, et l'ajouter aux acceptance criteria du Task 1 (vérifiable au grep de la config).

### Advisories (info)

**I1. [requirement_coverage] Écart de wording SC2 non tranché par le roadmap**
- Plan: 41-01
- Evidence: SC2 dit « file non vide (bandeau absent) » ; le code réel (update-banner.tsx) rend le bandeau avec bouton désactivé. Le plan consigne l'écart et couvre les deux lectures (cas 1 + cas 3). Reste une divergence documentée roadmap↔réalité à faire valider côté humain si le wording du roadmap doit être corrigé.
- Example fix (non-binding) : corriger le wording de SC2 dans ROADMAP.md au verify-phase (« application fermée » au lieu de « bandeau absent »).

**I2. [task_completeness] `files_modified` omet `app/vite.config.ts` alors que le recours A1 (`define` dans vite.config.ts) peut le modifier**
- Plan: 41-01, Task: 1
- Evidence: flagged_assumptions A1 prévoit « recours documenté : define dans vite.config.ts » si `import.meta.env.VITE_BUILD_ID` n'est pas peuplé, mais le frontmatter ne liste pas ce fichier. L'exécuteur devrait mettre à jour files_modified dans ce cas.
- Example fix (non-binding) : ajouter une note dans le plan ou laisser l'exécuteur mettre à jour le frontmatter si le recours est activé.

**I3. [task_completeness] Le verify du Task 2 omet `check-sql-statique.py`**
- Plan: 41-01, Task: 2
- Evidence: Task 1 (l.141) et Task 3 (l.215) incluent `python3 ../scripts/check-sql-statique.py`, Task 2 (l.185) non. Aucun SQL n'est touché donc non bloquant, mais la chaîne est incohérente entre tasks ; le Task 3 la rejoue sur l'arbre final, ce qui rattrape.
- Example fix (non-binding) : aligner les trois verify sur la même chaîne.

**I4. [research_resolution] La section `## Open Questions` de 41-RESEARCH.md n'a pas le suffixe `(RESOLVED)`**
- Plan: null (phase-level)
- Evidence: OQ-1, OQ-2, OQ-3 sont chacun résolus dans le plan (cas 1/3, `--project=chromium`, Task 2 point 0), mais le marqueur machine fait défaut — un re-checker futur relira « open » à tort.
- Example fix (non-binding) : marquer la section `## Open Questions (RESOLVED)` avec les résolutions en une ligne.

---

## Conclusion

Le plan atteint le GOAL de la phase : les 3 tasks exécutées produisent les 4 SC (nominal deux-builds, gate fermée/ouverte séparées + branche OQ-1a, harnais non-fork prouvé par diff nul + grep bundle, GATE-PROD observatoire avec STATE.md intact). La discipline §2.7 est appliquée (rouge-avant-vert planifié, refus nommé, pas de skip silencieux, chaîne sans SQL, aucun secret). Le seul défaut d'exécution plausible est W1 (webServer non désactivé dans le run sw-gate) : une ligne de config à ajouter à l'action (6) avant exécution. Les I1-I4 sont advisory.

**Verdict : PASS-with-concerns** — corriger W1 (warning) avant `/gsd-execute-phase 41` ; les 4 info ne forcent pas de révision.
