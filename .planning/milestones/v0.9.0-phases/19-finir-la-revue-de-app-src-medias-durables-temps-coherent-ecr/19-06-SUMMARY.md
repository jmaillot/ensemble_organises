---
phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr
plan: 06
subsystem: testing
tags: [playwright, e2e, radix-ui, aria, switch, role-switch, accessibilite, require-auth]

requires: []

provides:
  - "critical-paths.spec.ts — le parcours de connexion nomme les deux chemins réels (Google, e-mail) et compte exactement les liens de l'accroche ; le parcours foyer mobile entre en session avant de mesurer le haut des écrans"
  - "voyage-workspace.spec.ts — la bascule « Afficher la rubrique Notes » est pilotée comme Radix la rend (role=switch + aria-checked), plus jamais comme une case à cocher"
  - "npm run test:e2e redevient un signal : 0 échec sur les deux projets, vérifié trois fois, dont deux fois sur l'arbre committé"

actuals:
  tokens: 1163
  tasks: 2
  commits: 3
  plan_head_before: 0335f8e0804176dcd99ecfb638f2f67ba41c3a96
  plan_head_after: 8cbe258bc1d32bdb5bcae1c5df60770879caebda

tech-stack:
  added: []
  patterns:
    - "Un compte positif de liens se cadre sur un repère (ici la première section de main) : `main` entier porte aussi les tuiles d'espaces et l'appel final, donc « deux » n'y décrirait plus le groupe de connexion"
    - "Un contrôle Radix se pilote par le rôle et l'attribut qu'il expose (role=switch + aria-checked), pas par le rôle de l'intention (checkbox)"

key-files:
  created: []
  modified:
    - app/e2e/critical-paths.spec.ts
    - app/e2e/voyage-workspace.spec.ts

key-decisions:
  - "Les deux specs décrivaient un app qui n'existe plus : c'est le spec qui est faux, pas le code. Facebook est retiré depuis le 2026-10-13 (AGENTS.md §2.5) et le contrôle de rubrique est un `Switch` Radix (role=switch) — aucun fichier applicatif n'est modifié."
  - "Le compte positif de la landing est cadré sur la première section de `main` : mesuré, `main` entier porte vingt liens (2 de connexion + 17 tuiles d'espaces + 1 appel final), donc la forme écrite au plan (`getByRole('main').getByRole('link')` → 2) ne pouvait pas passer. Le cadrage garde le compte exact plutôt que de l'abandonner."
  - "La bascule de rubrique lit `aria-checked` (forme prescrite par le plan et lisible par un lecteur d'écran). Nuance établie en lisant Playwright 1.63 : `kAriaCheckedRoles` inclut `switch`, donc `toBeChecked()` aurait aussi fonctionné — la justification du plan (« ne s'applique qu'à checkbox/radio ») est inexacte, le choix reste le bon car il nomme l'attribut réellement exposé."
  - "Le test mobile « les pages du parcours foyer démarrent en haut » échouait à cause de 19-04 (`4da252a`), pas d'un défaut préexistant de la phase : `/foyer/nouveau` et `/foyer/rejoindre` sont passés sous `RequireAuth`, donc un visiteur anonyme mesure le haut de `/connexion`. La garde est juste et couverte par `router.test.tsx` : c'est la spec qui ouvre désormais une session (via `openDemoSession`, comme le test « rejoindre un foyer » du même fichier)."
  - "La décision laissée ouverte par 19-CONTEXT — « les 4 échecs e2e préexistants sont corrigés ici ou dans une tâche dédiée » — est tranchée ici : corrigés en phase 19, dans un plan dédié (19-06), précisément pour que la chaîne de vérification de la phase soit verte avant sa clôture."
  - "La suite a montré un cinquième échec que le plan ne connaissait pas (celui de 19-04). C'est la démonstration de la thèse du plan : un rouge admis ne signale plus la régression qui l'accompagne."

patterns-established:
  - "Un contrôle accessible se nomme par ce qu'il rend : `role=switch` + `aria-checked` pour Radix, jamais le rôle de l'intention"

requirements-completed: []

coverage:
  - id: D1
    description: "Le parcours de connexion e2e vérifie les deux chemins réels de l'onboarding (Commencer avec Google, Continuer avec un email) et qu'il n'y en a pas d'autre dans l'accroche ; le lien Facebook retiré le 2026-10-13 n'est plus attendu"
    verification:
      - kind: e2e
        ref: "app/e2e/critical-paths.spec.ts:28 # la landing page présente les deux chemins de connexion"
        status: pass
      - kind: e2e
        ref: "cd app && npm run test:e2e (suites chromium + mobile, 121 passed / 0 failed)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Le test « masquer une rubrique » pilote le Switch Radix par son rôle réel (role=switch) et lit aria-checked pour l'état, au lieu d'un role=checkbox que la page ne rend jamais"
    verification:
      - kind: e2e
        ref: "app/e2e/voyage-workspace.spec.ts:110 # masquer une rubrique la retire sans supprimer son contenu"
        status: pass
      - kind: e2e
        ref: "cd app && npm run test:e2e -- --project=chromium --grep \"masquer une rubrique\""
        status: pass
    human_judgment: false
  - id: D3
    description: "La suite Playwright entière est verte sur les deux projets (chromium et mobile), sans --grep ni filtre : les quatre échecs préexistants ont disparu et aucune autre spec ne rougit"
    verification:
      - kind: e2e
        ref: "cd app && npm run test:e2e → 121 passed, 5 skipped, 0 failed, EXIT=0 (reproduit deux fois sur l'arbre committé)"
        status: pass
      - kind: unit
        ref: "cd app && npm run typecheck && npm test (130 fichiers, 1070 tests verts)"
        status: pass
      - kind: other
        ref: "python3 scripts/check-sql-statique.py → 180 fonctions effectives, aucun défaut"
        status: pass
    human_judgment: false
  - id: D4
    description: "Le test mobile « les pages du parcours foyer démarrent en haut » mesure de nouveau le haut des deux écrans visés — mais après authentification, alors qu'il visait à l'origine le parcours pré-connexion"
    rationale: "Le test a changé de ce qu'il observe : les deux écrans étant désormais derrière RequireAuth, il n'existe plus de version pré-connexion à mesurer. L'assertion (titre à moins de 200 px du haut) est inchangée, mais un relecteur doit confirmer qu'on accepte de perdre la couverture pré-connexion, ou qu'il faut une spec distincte pour /connexion."
    verification:
      - kind: e2e
        ref: "app/e2e/critical-paths.spec.ts:260 # les pages du parcours foyer démarrent en haut sur mobile"
        status: pass
    human_judgment: true

duration: 22min
completed: 2026-10-15
status: complete
---

# Phase 19 Plan 06 : la suite e2e redevient un signal

**Les deux specs périmés sont alignés sur le code réel (deux chemins de connexion, `role=switch`) et un troisième test, cassé par 19-04, est réparé : `npm run test:e2e` passe de 5 échecs à 0 sur les deux projets Playwright.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-10-15T18:39:15Z (mise en route de la suite de référence)
- **Completed:** 2026-10-15T19:01:15Z
- **Tasks:** 2 (+1 déviation committée à part)
- **Files modified:** 2 (`app/e2e/critical-paths.spec.ts`, `app/e2e/voyage-workspace.spec.ts`) — aucun fichier applicatif

## Accomplishments

- **`critical-paths.spec.ts`** : le test « trois chemins de connexion » devient « deux chemins de connexion » (même vocabulaire que `landing-page.test.tsx:10`), compte **exactement deux** liens dans l'accroche et vérifie les deux libellés réels. Le lien Facebook, retiré le 2026-10-13, n'est plus attendu — sans que le test se contente d'interdire un nom absent.
- **`voyage-workspace.spec.ts`** : la bascule de rubrique est interrogée par `getByRole('switch', …)` et son état lu par `toHaveAttribute('aria-checked', …)`. Le `role="checkbox"` d'origine ne correspondait à rien dans la page : Radix rend un `<button role="switch">`.
- **Un cinquième échec, invisible au plan, a été trouvé et réparé** : `[mobile] critical-paths.spec.ts › les pages du parcours foyer démarrent en haut sur mobile` — une régression introduite par **19-04** (`4da252a`), qui a passé `/foyer/nouveau` et `/foyer/rejoindre` sous `RequireAuth`.
- **La chaîne de la phase est verte** : `npm run test:e2e` → 121 passed / 0 failed, deux fois de suite sur l'arbre committé.

## Preuves rouges

| Moment | Commande | Résultat |
|---|---|---|
| Référence (avant toute écriture, HEAD `0335f8e`) | `cd app && npm run test:e2e` | **5 failed**, 5 skipped, 116 passed — `Continuer avec Facebook` introuvable (×2 projets), `getByRole('checkbox', { name: 'Afficher la rubrique Notes' })` introuvable (×2 projets), timeout de 45 s sur le test mobile de mise en page |
| Avant le correctif du 5ᵉ échec | `npm run test:e2e -- --project=mobile --grep "démarrent en haut sur mobile"` | **1 failed** — il échoue aussi en isolation : déterministe, ce n'est pas un flottement de charge |
| Après | `cd app && npm run test:e2e` | **0 failed**, 121 passed, 5 skipped, EXIT=0 (rejoué deux fois sur l'arbre committé) |

Les messages du rapport d'échec citent `toBeChecked()` et `Continuer avec Facebook`, c'est-à-dire **le code d'origine** : la capture de référence est bien celle du dépôt d'avant l'exécution.

## Task Commits

Chaque tâche est committée atomiquement :

1. **Task 1 : Le parcours de connexion décrit les deux chemins qui existent** — `412ce99` (test)
2. **Task 2 : La bascule de rubrique est pilotée comme Radix la rend** — `44575c3` (test)
3. **Déviation [Rule 1] : le parcours foyer entre en session avant de mesurer son haut** — `8cbe258` (fix)

**Métadonnées de plan :** aucune — `commit_docs: false` (`.planning/` est gitignoré, `.gitignore:58`). Le SUMMARY et `deferred-items.md` restent non committés, comme demandé.

## Files Created/Modified

- `app/e2e/critical-paths.spec.ts` — Task 1 (test de connexion) + déviation (entrée en session du test mobile de mise en page).
- `app/e2e/voyage-workspace.spec.ts` — Task 2 (bascule de rubrique).
- Aucun fichier applicatif : `landing-page.tsx`, `primitives.tsx` et `trip-detail-page.tsx` sont restés intacts, comme le plan l'exigeait.

## Decisions Made

- **Les specs étaient faux, pas le code.** Vérifié en lisant la source : `landing-page.tsx:56-63` ne rend que Google et l'e-mail, et `primitives.tsx:17` construit son `Switch` sur `@radix-ui/react-switch`, dont j'ai lu le rendu (`role: "switch"`, `aria-checked: checked`). Le test unitaire `landing-page.test.tsx:10` et `router.test.tsx:146` portaient déjà la vérité.
- **Le compte positif est cadré sur l'accroche.** La forme écrite au plan — `page.getByRole('main').getByRole('link')` à `toHaveCount(2)` — ne pouvait pas passer : `main` porte vingt liens (2 de connexion + les 17 tuiles de `modules` + l'appel final « Commencer »). J'ai gardé le compte exact en le bornant à la première section, plutôt que de le supprimer. C'est mesuré : le test passe avec le cadrage sur les deux projets.
- **`aria-checked` plutôt que `toBeChecked()`**, comme le plan le prescrit — avec une réserve écrite : la justification du plan (« `toBeChecked()` ne s'applique qu'à checkbox/radio ») est **inexacte** pour Playwright 1.63, dont `kAriaCheckedRoles` inclut `switch` (`node_modules/playwright-core/lib/coreBundle.js`). Le choix reste le bon — il nomme l'attribut que la primitive expose — mais il n'était pas le seul possible, et la raison écrite au plan ne doit pas être recopiée telle quelle.
- **Le 5ᵉ échec appartient bien à ce plan.** Le plan interdit de toucher les autres tests du fichier ; mais sa propre promesse est « `npm run test:e2e` est vert, sans `--grep` ni filtre », et l'échec est causé par un plan **de la même phase** (19-04), pas par un défaut hérité. Le laisser aurait reproduit exactement le mal que le plan dénonce : un rouge admis sous lequel une régression de la phase se cache. Déviation documentée ci-dessous.
- **La question de 19-CONTEXT est tranchée :** les échecs e2e sont corrigés **en phase 19**, dans ce plan dédié.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `les pages du parcours foyer démarrent en haut sur mobile` mesurait `/connexion`**

- **Found during:** vérification finale (suite entière, après Tasks 1 et 2)
- **Issue:** le test visite `/foyer/rejoindre` puis `/foyer/nouveau` **sans session** et attend leurs titres (`Rejoindre un foyer`, `Créer mon foyer`). Depuis 19-04 (`4da252a`), ces deux routes sont sous `RequireAuth` (`router.tsx:216-228`) : un visiteur anonyme est redirigé vers `/connexion`, le titre attendu n'arrive jamais et le test expire à 45 s (le snapshot d'échec montre la page « Ravi de vous revoir »). Échec **déterministe**, reproduit en isolation (`--project=mobile --grep "démarrent en haut sur mobile"`), donc pas un flottement de charge.
- **Fix:** `await openDemoSession(page)` avant la boucle — le test « rejoindre un foyer valide le format du token », dans le même fichier, fait exactement cela, et le test « créer un foyer génère un token copiable » entre en session de la même façon (il clique l'entrée de démonstration, sans passer par le helper). L'assertion de mise en page est inchangée (`top < 200`). La garde applicative, elle, n'est pas touchée : elle est juste (ces écrans écrivent) et couverte par `router.test.tsx:146`.
- **Files modified:** `app/e2e/critical-paths.spec.ts`
- **Verification:** `npm run test:e2e -- --project=mobile --grep "démarrent en haut sur mobile"` → 1 passed ; puis suite entière → 0 failed.
- **Committed in:** `8cbe258` (commit dédié, séparé des deux tâches)

---

**Total des déviations :** 1 corrigée d'office (1 Rule 1 - Bug)
**Impact sur le plan :** la déviation est **nécessaire** à la promesse du plan (suite verte). Elle reste strictement dans un des deux fichiers `files_modified`, ne touche aucun fichier applicatif et n'élargit ni la dépendance ni le périmètre technique. Elle déplace en revanche ce qu'observe le test mobile (post-connexion au lieu de pré-connexion) : c'est l'objet de la couverture D4, marquée `human_judgment: true`.

## Issues Encountered

- **Un test instable sans rapport avec le plan.** `[mobile] recettes.spec.ts:181` a rougi sur une exécution de la suite (bouton « Ajouter une étape » resté `disabled` pendant 45 s sous la charge des 120 tests parallèles), alors qu'il était vert à l'exécution de référence et à la suivante, et qu'il passe en 2,8 s en isolation. Hors `files_modified` : relevé en `deferred-items.md` (entrée 6) au lieu d'être corrigé à l'aveugle.
- **Trois constats relevés hors périmètre**, dans `deferred-items.md` : la redirection de `RequireAuth` perd la requête et rien ne lit `?token=` (entrée 7) ; l'accroche de la landing annonce « Seize espaces » et en rend dix-sept (entrée 8) ; trois fichiers non suivis traînent à la racine (entrée 9).
- **Rien d'autre** : ni gate d'authentification, ni dépendance ajoutée (`@playwright/test` 1.63.0 était déjà là), ni blocage.

## User Setup Required

None — aucune configuration de service externe. La preuve demande seulement `npm run build && npm run preview`, que la configuration Playwright démarre elle-même.

## Next Phase Readiness

- La chaîne de vérification de la phase (AGENTS.md §2.7) est de nouveau exploitable : `test:e2e` signale une régression au lieu de porter un rouge permanent.
- Les cinq plans suivants de la phase (19-07 → 19-13) peuvent s'appuyer dessus sans craindre de confondre leur propre casse avec un échec hérité.
- Point de vigilance transmis : le test mobile de mise en page ne couvre plus le parcours **pré-connexion** (couverture D4) ; si cette couverture manque, elle demande une spec dédiée à `/connexion`.

---

*Phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr*
*Completed: 2026-10-15*

## Self-Check: PASSED

- FOUND: `.planning/phases/19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr/19-06-SUMMARY.md`
- FOUND: `app/e2e/critical-paths.spec.ts`
- FOUND: `app/e2e/voyage-workspace.spec.ts`
- FOUND: `412ce99` (Task 1)
- FOUND: `44575c3` (Task 2)
- FOUND: `8cbe258` (déviation Rule 1)
- Frontmatter YAML : valide (`status: complete`, `actuals.commits: 3`, couverture D1–D4)
