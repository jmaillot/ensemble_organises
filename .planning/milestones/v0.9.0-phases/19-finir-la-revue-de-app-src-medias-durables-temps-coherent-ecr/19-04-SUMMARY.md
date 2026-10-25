---
phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr
plan: 04
subsystem: app
tags: [routes, gardes, attestation, frontiere-erreur, import-paresseux, gating-enfant, calendrier, cloche, memo, dependances, wr-17, wr-18, wr-19, d-12, d-13, d-14]

# Dependency graph
requires:
  - phase: 18-durcissement-frontend-correctifs-de-revue-de-code
    provides: "les constats WR-17 (« garde-fous de route et d'attestation »), WR-18 (« un `enfant` voit Modifier/Supprimer ») et WR-19 (« deps incomplètes ») tels que rédigés dans `18-REVIEW.md`"
provides:
  - "`app/src/app/router.tsx` — `RequireAttestation` ne conclut plus sur une lecture en échec ; `/foyer/nouveau` et `/foyer/rejoindre` passent sous `RequireAuth`"
  - "`app/src/components/ui/route-error.tsx` — deux causes séparées à la frontière : `ChunkLoadError` étiqueté à la source, `RenderErrorState` sans réessai"
  - "`app/src/modules/calendrier/calendrier-page.tsx` — `isChild` borne aussi l'édition et la suppression d'un événement existant, dans les deux rendus"
  - "`app/src/hooks/use-notifications.ts` — le memo `items` déclare `assigneesByTask` et `currentMember`"
affects: []

actuals:
  tokens: 6341
  tasks: 3
  commits: 6

plan_head_before: b5b6e111c23d437dd4e1eb7356157903d160eb3c
plan_head_after: 05366de999f64732cc8de69808280d3d44289e18

tech-stack:
  added: []
  patterns:
    - "une garde d'avis légal ne conclut que sur une lecture **réussie** : un échec de lecture laisse passer (D-12), parce qu'un blocage sur une lecture transitoire met un utilisateur conforme devant une modale dont l'action naturelle le déconnecte"
    - "une frontière d'erreur sépare ses causes **à la source** : l'étiquette `ChunkLoadError` est posée dans le chargeur, avant `lazy`, au lieu d'être devinée sur le message d'une `TypeError` de fetch"
    - "la classe d'erreur décide de l'action, pas le rendu : « Réessayer » (relance un `import()`) contre « Recharger l'application » (`window.location.reload()`), jamais les deux sur la même cause"
    - "une affordance conditionnelle ne se duplique pas dans le composant : la page pose `undefined` aux **deux** rendus, et `AgendaList` retire ses commandes quand les rappels sont absents"
    - "un test de correction d'invalidation se pose là où la dépendance manquante est la **seule** chose qui puisse faire recalculer — sinon il ne peut pas échouer, donc ne prouve rien (AGENTS.md §2.7D)"

key-files:
  created:
    - app/src/components/ui/route-error.test.tsx
  modified:
    - app/src/app/router.tsx
    - app/src/app/require-attestation.test.tsx
    - app/src/app/router.test.tsx
    - app/src/components/ui/route-error.tsx
    - app/src/modules/calendrier/calendrier-page.tsx
    - app/src/modules/calendrier/calendrier-page.test.tsx
    - app/src/hooks/use-notifications.ts
    - app/src/hooks/use-notifications.test.tsx

key-decisions:
  - "`profileQuery.isError` est traité **avant** `age_attested_at` : sur échec, les enfants rendent. La garde porte un avis légal, pas une frontière d'autorisation (T-19-09) — le risque résiduel est assumé et écrit dans le code."
  - "Le branchement `isError` de la modale CGU a été **retiré**, pas conservé : une lecture en échec ne rend plus jamais la modale, donc la branche était devenue inatteignable. `saveError` reste — lui dit un échec d'**écriture**."
  - "`name = 'ChunkLoadError'` est posé à la source, dans `LazyChunk`, avant `lazy` : le navigateur rend sinon une `TypeError` de fetch, indiscernable d'une vraie erreur de code."
  - "Une erreur de rendu n'offre pas « Réessayer » : rejouer la même page fautive boucle sans fin. L'action est « Recharger l'application », délibérément distincte."
  - "Le réessai automatique au retour réseau (`online`) ne vaut que pour `ChunkLoadError` : une erreur de rendu ne dépend pas du réseau et ne doit pas se rejouer en boucle."
  - "`undefined` plutôt qu'un drapeau passé à `AgendaList` : le composant retire déjà ses deux commandes quand les deux rappels sont absents ; la page n'a qu'à ne pas les poser (deux appels, aucune logique dupliquée)."
  - "Le scénario WR-19 tourne en **session connectée** : c'est la seule condition où le memo ne se recalcule pas pour une raison étrangère, donc la seule où la dépendance manquante est observable (raison écrite au-dessus du test et en `deferred-items.md` §5)."
  - "Le budget du test WR-19 passe à 12 s, au-dessus de l'`asyncUtilTimeout` de 8 s du fichier : sans le correctif, l'échec doit **dire quelle assertion** n'a pas tenu, pas être coupé par le délai global de Vitest (5 s)."

patterns-established:
  - "Garde d'avis légal : elle conclut sur une lecture réussie, jamais sur une absence — `isError` et `!data` ne sont pas le même fait."
  - "Frontière d'erreur à deux causes : étiqueter à la source, décider sur l'étiquette, et donner à chaque cause l'action qui marche vraiment."
  - "Test d'une correction d'invalidation : poser l'environnement où la dépendance manquante est le seul déclencheur possible de recalcul, puis prouver par mutation (retirer la dépendance ⇒ rouge)."
  - "Un mock de `window.location.reload` s'installe par `Object.defineProperty` et se restaure en `finally` : jsdom n'offre pas de `reload` inscriptible."

requirements-completed: [WR-17, WR-18, WR-19]

coverage:
  - id: D1
    description: "Une lecture d'attestation en échec n'affiche plus la modale CGU : un utilisateur déjà attesté n'est plus mis devant une action qui le déconnecte (WR-17a, D-12)."
    requirement: WR-17
    verification:
      - kind: unit
        ref: "app/src/app/require-attestation.test.tsx#une lecture en échec laisse passer au lieu d'ouvrir la modale"
        status: pass
      - kind: unit
        ref: "app/src/app/require-attestation.test.tsx#lecture réussie « non attesté » ⇒ modale ; « attesté » ⇒ enfants"
        status: pass
    human_judgment: false
  - id: D2
    description: "`/foyer/nouveau` et `/foyer/rejoindre` écrivent sous `RequireAuth`, comme `/foyer` (WR-17b, D-12, T-19-10)."
    requirement: WR-17
    verification:
      - kind: unit
        ref: "app/src/app/router.test.tsx#`/foyer/nouveau` et `/foyer/rejoindre` non connecté ⇒ `/connexion` avec `state.from`"
        status: pass
      - kind: other
        ref: "`grep -n 'path=\"/foyer/nouveau\"|path=\"/foyer/rejoindre\"' -A 6 app/src/app/router.tsx` — les deux éléments portent `RequireAuth`"
        status: pass
    human_judgment: false
  - id: D3
    description: "Une erreur de rendu d'une page n'est plus présentée comme un problème de connexion, et « Réessayer » ne rejoue plus indéfiniment la même page fautive (WR-17c, D-12, T-19-11)."
    requirement: WR-17
    verification:
      - kind: unit
        ref: "app/src/components/ui/route-error.test.tsx#une erreur de rendu n'est pas imputée à la connexion et ne rejoue pas la page"
        status: pass
      - kind: unit
        ref: "app/src/components/ui/route-error.test.tsx#un import paresseux rejeté propose le réessai qui relance l'import"
        status: pass
    human_judgment: false
  - id: D4
    description: "Un `enfant` ne voit ni « Modifier » ni « Supprimer » sur un événement existant, dans l'agenda du jour comme dans la liste des 30 jours ; un `admin` les voit toujours (WR-18, D-13, T-19-12)."
    requirement: WR-18
    verification:
      - kind: unit
        ref: "app/src/modules/calendrier/calendrier-page.test.tsx#un enfant ne modifie ni ne supprime un événement existant (agenda du jour ET liste des 30 jours)"
        status: pass
      - kind: unit
        ref: "app/src/modules/calendrier/calendrier-page.test.tsx#un admin garde les deux commandes (agenda du jour ET liste des 30 jours)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Assigner à un autre membre une tâche présente dans la cloche la retire, et le compteur de la barre cesse de la compter : les deux nombres s'accordent (WR-19, D-14, T-19-13)."
    requirement: WR-19
    verification:
      - kind: unit
        ref: "app/src/hooks/use-notifications.test.tsx#retire de la cloche une tâche réassignée, et le compteur décroît d'autant (trois assertions sur le même rendu, session connectée)"
        status: pass
      - kind: other
        ref: "preuve rouge par mutation : `assigneesByTask` et `currentMember` retirés du tableau de dépendances ⇒ le test échoue (`expected true to be false`), restaurés ⇒ 14/14 verts (3 exécutions)"
        status: pass
    human_judgment: false

duration: 34min
completed: 2026-10-15
status: complete
---

# Phase 19 Plan 04: Routes, gating enfant et dépendances du memo — trois endroits qui ne concluent plus à tort

**Une lecture de profil en échec laisse passer au lieu d'ouvrir la modale CGU, `/foyer/nouveau` et `/foyer/rejoindre` écrivent sous `RequireAuth`, la frontière d'erreur sépare enfin le morceau qui n'a pas pu se télécharger de la page qui a jeté au rendu (et ne rejoue plus la même page fautive), un `enfant` ne voit plus Modifier/Supprimer sur un événement existant dans les deux rendus de l'agenda, et le memo `items` de la cloche déclare `assigneesByTask` et `currentMember` — prouvé rouge par mutation, mais seulement dans un environnement où cette dépendance est le seul déclencheur possible.**

## Performance

- **Duration:** 34 min
- **Started:** 2026-10-15T17:37:26Z
- **Completed:** 2026-10-15T18:11:27Z
- **Tasks:** 3
- **Files modified:** 9 (1 créé, 8 modifiés) — 338 insertions, 20 suppressions
- **Commits:** 6 (3 RED + 3 GREEN)

## Accomplishments

- **Une garde ne conclut plus sur une lecture qui a échoué.** `RequireAttestation` testait `profileQuery.data?.age_attested_at` : sur `isError`, `data` est `undefined`, donc un utilisateur **déjà attesté** recevait la modale dont l'action naturelle le déconnecte. Le cas `isError` est maintenant traité avant, et rend les enfants. Le branchement `isError` de la modale a été **supprimé** parce qu'il était devenu inatteignable — garder du code mort en le commentant l'aurait laissé mentir sur ce qui se passe.
- **Les deux écrans de foyer qui écrivent sont authentifiés.** `/foyer/nouveau` et `/foyer/rejoindre` passent sous `RequireAuth`, exactement comme `/foyer` : la même redirection, le même `state.from`. `RequireNoHousehold` n'a **pas** été ajouté — un membre d'un foyer peut légitimement en créer un second, et ce n'est pas ce que le constat demande.
- **La frontière d'erreur ne confond plus deux causes.** L'import paresseux rejeté est étiqueté **à la source** (`name = 'ChunkLoadError'` dans `LazyChunk`, avant `lazy`) : le navigateur rend sinon une `TypeError` de fetch, indiscernable d'une vraie erreur de code. Cette cause garde son message de connexion et son « Réessayer » — qui fonctionne réellement, puisqu'un nouvel objet `lazy()` relance un `import()`. Toute autre erreur est une erreur de **rendu** : elle a son propre message, **aucun** bouton qui rejoue la page, et une action de rechargement réel de l'application.
- **Le gating `enfant` couvre ce qui existe déjà.** `isChild` bornait les entrées de création ; les deux rendus d'`AgendaList` passaient `onEdit`/`onDelete` inconditionnellement. Les deux passages posent désormais `undefined`. Le test couvre les **quatre** combinaisons (enfant/admin × agenda du jour/liste des 30 jours) parce qu'une assertion négative seule serait un test qui ne peut pas échouer pour la bonne raison.
- **Le memo de la cloche déclare ce qu'il lit.** `items` lisait `assigneesByTask` et `currentMember` sans les déclarer : `task_assignees` changeait sans que `tasks.rows` bouge, donc la cloche gardait la tâche réassignée alors que le compteur du module Tâches suivait déjà.
- **La preuve du WR-19 a demandé de trouver pourquoi elle ne pouvait pas échouer.** Elle est racontée ci-dessous : c'est le morceau le plus instructif de la planche.

## Task Commits

Each task was committed atomically (TDD tasks carry their RED then GREEN):

1. **Task 1 — RED** : `5c0db84` (test) — une garde ne conclut pas sur une lecture en échec (WR-17)
2. **Task 1 — GREEN** : `4da252a` (fix) — la garde ne conclut que sur une lecture réussie (WR-17)
3. **Task 2 — RED** : `54dd572` (test) — un enfant ne modifie pas un événement existant (WR-18)
4. **Task 2 — GREEN** : `ea77471` (fix) — le gating enfant couvre l'édition d'un événement existant (WR-18)
5. **Task 3 — RED** : `3e5dda2` (test) — une tâche réassignée quitte la cloche (WR-19)
6. **Task 3 — GREEN** : `05366de` (fix) — les dépendances du memo disent ce qu'il lit (WR-19)

**Plan metadata:** aucun — `commit_docs: false` dans `.planning/config.json`, et `.planning/` est ignoré par git (`.gitignore:58`).

## Red proofs (assertion mutée → rouge, restaurée → vert)

| Preuve | Geste | Résultat observé |
|---|---|---|
| WR-17a, garde | `5c0db84` = `RequireAttestation` d'origine (seul `age_attested_at` testé) | **4 tests rouges** : la lecture en échec ouvrait la modale, et le cas `/foyer/nouveau` non connecté partait ailleurs que `/connexion` (« expected `/foyer/nouveau` to be `/connexion` ») |
| WR-17c, étiquette | étiquetage `ChunkLoadError` retiré de `LazyChunk`, puis restauré | **1 test rouge** (`Tests 1 failed \| 1 passed` : le rejet d'import retombait dans le message de rendu), puis vert |
| WR-18, gating | un seul des deux sites d'`AgendaList` remis en `onEdit={openEdit}` | **1 test rouge**, exactement la cible (`Tests 1 failed \| 14 passed`) — aucune cascade, puis restauré |
| WR-19, dépendances | `assigneesByTask` et `currentMember` retirés du tableau de dépendances de `items` | **1 test rouge** — `AssertionError: expected true to be false` (la tâche réassignée restait dans la cloche, le memo ne recalculait plus). Restaurés ⇒ **14/14 verts, 3 exécutions** |

**Le WR-19 mérite son récit.** `3e5dda2` (le RED commité) échouait, mais pour une **mauvaise raison** : ses trois assertions synchrones lisaient l'état avant que React n'ait commité le rendu du nouveau `task_assignees`. Passé en `waitFor`, le test devenait vert **avec et sans** le correctif — donc ne prouvait rien. L'instrumentation des identités de dépendances a montré pourquoi : en session **non** connectée, le memo se recalcule à **chaque** rendu. `useResource` rend `query.data ?? []` ; quand la lecture `notification_reads` est désactivée, `rows` est un tableau neuf à chaque rendu, dont dérivent `readMap`, puis `readAt`/`buildSummaries`, puis les feeds `cercle.feed` et `feed.conversations`. Le memo se recalculait donc pour une raison étrangère, et lisait au passage le `assigneesByTask` frais : le défaut était **invisible**. En session connectée, les feeds se stabilisent, et le rendu qui voit `assigneesByTask` changer ne change **que** lui (`changed: assigneesByTask`) — le memo ne peut alors recalculer que si la valeur est déclarée. C'est la preuve ci-dessus, et c'est écrit au-dessus du test comme en `deferred-items.md` §5 (l'instabilité amont, elle, n'est pas corrigée : hors `files_modified`).

## Files Created/Modified

- `app/src/components/ui/route-error.test.tsx` *(créé)* — 2 cas : import rejeté (message de connexion + « Réessayer » qui relance réellement l'import, prouvé par un second appel du chargeur) et page qui jette au rendu (message distinct, **aucun** « Réessayer », « Recharger l'application » appelle `window.location.reload`).
- `app/src/app/router.tsx` — `RequireAttestation` : `isError` avant `age_attested_at`, commentaire qui dit le choix et sa portée ; branche `isError` morte retirée de la modale ; `/foyer/nouveau` et `/foyer/rejoindre` sous `RequireAuth`.
- `app/src/components/ui/route-error.tsx` — `CHUNK_ERROR_NAME` + `tagChunkLoadError` (posée dans `LazyChunk`, avant `lazy`), `RenderErrorState` (message de rendu, rechargement réel), `handleOnline` borné à `ChunkLoadError`.
- `app/src/app/require-attestation.test.tsx` — le cas « lecture en échec ⇒ pas de modale », plus la lecture réussie « non attesté » et « attesté ».
- `app/src/app/router.test.tsx` — `/foyer/nouveau` et `/foyer/rejoindre` non connecté ⇒ `/connexion` avec `state.from`.
- `app/src/modules/calendrier/calendrier-page.tsx` — les deux sites d'`AgendaList` posent `undefined` quand `isChild`, comme les entrées de création. Commentaire JSX **au-dessus** de l'élément (`//` dans une balise ouvrante JSX est invalide).
- `app/src/modules/calendrier/calendrier-page.test.tsx` — le scénario enfant/admin sur les deux rendus, sélectionnés par la vue (`localStorage` `eo:calendrier:view`) plutôt qu'en cliquant un onglet, avec nettoyage `try/finally`.
- `app/src/hooks/use-notifications.ts` — `assigneesByTask` et `currentMember` ajoutés aux dépendances de `items`, avec le commentaire qui dit ce que `task_assignees` change sans `tasks.rows`.
- `app/src/hooks/use-notifications.test.tsx` — le scénario de réassignation (session connectée, budget 12 s, trois assertions dans un seul `waitFor`).

## Decisions Made

- **La garde d'attestation n'est pas une frontière d'autorisation.** C'est un avis légal (CGU, article 3). Laisser passer sur une lecture en échec est un risque résiduel **assumé et documenté** (T-19-09), préférable à un blocage qui pousse un utilisateur conforme vers la déconnexion.
- **La branche `isError` de la modale est supprimée, pas conservée.** Elle était devenue inatteignable ; `saveError` reste — il dit un échec d'écriture, qui est un autre fait.
- **L'étiquette d'erreur est posée à la source.** Décider de l'action d'une frontière d'erreur sur le texte d'une `TypeError` serait une heuristique qui casse au premier changement de message du navigateur.
- **Deux causes, deux actions, jamais les deux.** « Réessayer » n'a de sens que là où un nouvel `import()` retente quelque chose ; sur une erreur de rendu, il boucle. Le rechargement réel de l'application est volontairement un autre bouton, avec un autre mot.
- **`undefined` plutôt qu'un drapeau dans `AgendaList`.** Le composant avait déjà la propriété « pas de rappel ⇒ pas de commande » : la page n'a qu'à ne pas poser les rappels. Une option `readOnly` aurait ajouté une seconde façon de dire la même chose.
- **Le test WR-19 tourne en session connectée.** Un test qui passe avec **et** sans le correctif ne prouve rien (AGENTS.md §2.7D) : la session connectée est ce qui donne au défaut un environnement où il est la seule explication possible.
- **Le budget du test est passé à 12 s.** À 5 s (défaut de Vitest), l'échec du WR-19 était un « Test timed out », qui ne dit pas quelle assertion a lâché. À 12 s, l'`asyncUtilTimeout` de 8 s du fichier gagne, et l'échec dit `expected true to be false`.

## Deviations from Plan

### Auto-fixed / plan-authorised additions

**1. [Rule 2 - Une preuve qui ne peut pas échouer] Le scénario WR-19 exige une session connectée (Task 3)**
- **Found during:** Task 3, après que la mutation des dépendances a été **verte** (donc la preuve vide)
- **Issue:** le plan demande un scénario de réassignation ; il ne dit rien de la session. Or, en session non connectée, le memo `items` se recalcule à **chaque** rendu pour une raison étrangère (la lecture `notification_reads` désactivée rend un `[]` neuf par rendu, dont dérivent `cercle.feed` et `feed.conversations`), donc le test passe avec et sans le correctif. Un test qui ne peut pas échouer est un commentaire qui coûte une exécution.
- **Fix:** session connectée dans le scénario (avec `try/finally`, comme les autres tests du fichier), ce qui stabilise les feeds. La **raison** est écrite au-dessus du test ; la cause amont, hors périmètre, est en `deferred-items.md` §5.
- **Files modified:** `app/src/hooks/use-notifications.test.tsx`
- **Commit:** `05366de` — prouvé rouge par mutation des deux dépendances (`expected true to be false`), puis vert 14/14 sur 3 exécutions.

**2. [Interprétation - Le RED commité ne prouvait pas ce qu'il annonçait] Assertions passées de synchrones à `waitFor` (Task 3)**
- **Found during:** Task 3
- **Issue:** `3e5dda2` (RED) échouait sur un effet de bord de timing — ses assertions synchrones lisaient `result.current` avant que React n'ait commité le rendu portant le nouveau `task_assignees`. Il échouait donc avant que la donnée ne soit lisible : ce n'est pas « le memo n'a pas recalculé », c'est « le test n'a pas attendu ».
- **Fix:** les trois assertions vivent dans un seul `waitFor`, et le budget du test passe à 12 s pour que l'échec éventuel nomme l'assertion au lieu d'être coupé par le délai global. Le RED commité est laissé tel quel (pas d'amend, pas de rebase) ; la **vraie** preuve rouge est celle du tableau ci-dessus, établie par mutation sur la forme finale.
- **Files modified:** `app/src/hooks/use-notifications.test.tsx`
- **Commit:** `05366de`

**3. [Déviation de périmètre plan-authorisé] `calendrier-page.test.tsx` est touché sans figurer dans `files_modified`**
- **Found during:** Task 2
- **Issue:** `files_modified` du plan ne liste que `app/src/modules/calendrier/calendrier-page.tsx` (en plus des fichiers de la Task 1 et de la Task 3), mais l'action de la Task 2 demande explicitement de couvrir le cas dans « `app/src/modules/calendrier/calendrier-page.test.tsx` (ou le fichier de test du module qui l'exerce déjà) ».
- **Fix:** le fichier de test du module existait et exerçait déjà la page : il a été étendu, plutôt que d'en créer un second. Le test a été affiné dans le commit GREEN pour couvrir les deux rendus via la clé de vue `localStorage` (`eo:calendrier:view`) au lieu de cliquer un onglet, avec un `try/finally` qui remet la vue par défaut — un test qui échoue ne doit pas laisser la vue dans un état non standard pour les suivants.
- **Files modified:** `app/src/modules/calendrier/calendrier-page.test.tsx`
- **Commit:** `ea77471` (et `54dd572` pour le RED)

**4. [Rule 1 - Code mort] La branche `isError` de la modale CGU est retirée (Task 1)**
- **Found during:** Task 1, écriture du correctif (a)
- **Issue:** après avoir traité `isError` **avant** `age_attested_at`, la branche de la modale qui testait `profileQuery.isError` ne pouvait plus s'exécuter : une lecture en échec rend les enfants avant d'y arriver. La laisser aurait été du code qui ment sur ce qui se passe.
- **Fix:** branche supprimée de l'alerte de la modale ; `saveError` conservé (échec d'**écriture** de l'attestation, une autre cause).
- **Files modified:** `app/src/app/router.tsx`
- **Commit:** `4da252a`

**Total deviations:** 4 — une preuve rendue réelle, une preuve rendue honnête, un fichier de test plan-authorisé touché hors liste, un code mort retiré. Aucun changement de comportement hors du périmètre WR-17/WR-18/WR-19.

## Issues Encountered

- **La preuve rouge du WR-19 a demandé deux détours.** Le RED commité échouait pour un mauvais motif (timing), puis le test passé en `waitFor` passait sans le correctif. C'est une instrumentation temporaire des identités de dépendances (journal du nom des dépendances qui changent à chaque rendu, plus un marqueur dans le memo) qui a montré que le memo se recalculait **à chaque** rendu, et donc que la dépendance manquante n'était jamais la cause du recalcul. L'instrumentation a été retirée : le diff final du fichier ne contient que les deux dépendances et leur commentaire.
- **Les gestionnaires d'état du harnais GSD ne savent pas lire ce `STATE.md`.** `state advance-plan` échoue (`plan_position_unreadable`) et pointe la phase `04-courses-scan` ; `state update-progress` avertit qu'il n'y a aucune ligne `Progress:` dans le corps à mettre à jour. La position d'état de cette phase n'est donc pas avancée par l'outil — voir « Next Phase Readiness ». `state sync --verify` annonce `synced: false, changes: []` : le frontmatter est cohérent avec le disque tel qu'il le calcule.

## Verification

| Contrôle | Résultat |
|---|---|
| `cd app && npm run typecheck` | vert (`tsc --noEmit`, aucun diagnostic) |
| `cd app && npm test` | **129 fichiers / 1053 tests**, tous verts (base mesurée : 128 / 1046) — 424 s |
| `cd app && npm test -- src/app src/components/ui/route-error.test.tsx src/modules/calendrier src/hooks/use-notifications.test.tsx` | **14 fichiers / 129 tests**, verts |
| `cd app && npm test -- src/hooks/use-notifications.test.tsx` (×3) | **14/14**, vert à chaque exécution |
| `cd app && npm run typecheck && npm run build` | vert (Vite + `sw.ts` injectManifest, **104 entrées** de précache) |
| `python3 scripts/check-sql-statique.py` | `aucun défaut` — 180 fonctions effectives, 123 migrations, 62 tests |
| `grep -n "path=\"/foyer/nouveau\"\|path=\"/foyer/rejoindre\"" -A 6 app/src/app/router.tsx` | les deux éléments portent `<RequireAuth>` (lignes 216‑229) |
| `grep -n "openEdit\|setPendingDelete\|openCreate" app/src/modules/calendrier/calendrier-page.tsx` | `openEdit` : 2 appelants, tous deux gardés. `setPendingDelete` : 2 appelants, tous deux gardés. `openCreate` : 2 appelants gardés (boutons) **et 1 non gardé** (`onLongPress`) → `deferred-items.md` §3 |

`migrate.sh` / `test-db.sh` n'ont **pas** été exécutés, et ne l'auraient pas pu valider ce plan : il n'ajoute ni migration, ni fonction SQL, ni test de base. Docker est disponible mais n'a **aucune prise** ici — le dire autrement serait une preuve fausse.

`npm run test:e2e` n'a **pas** été relancé : les 4 échecs préexistants appartiennent au plan 19-06, et aucun scénario e2e ne couvre les gardes de route, le gating `enfant` du calendrier ou la cloche de notifications. Les parcours e2e existants (`critical-paths`, `calendrier`) ne traversent pas ces chemins — mais le plan 19-06 reste le propriétaire de ces échecs, et c'est lui qui doit les faire tomber.

## Threat Flags

Aucun. Le plan ne crée aucune surface nouvelle : il ferme des affordances (deux routes d'écriture sous garde, un verrou d'édition pour `enfant`) et retire un risque de boucle. Aucun nouvel accès réseau, aucun schéma touché, aucune donnée supplémentaire exposée. Les quatre menaces du registre sont traitées comme prévu : T-19-10/11/12/13 **mitigées** (vérifiées en code ci-dessus), T-19-09 **acceptée** avec son risque résiduel écrit dans le code.

## Known Stubs

Aucun. Aucune valeur vide codée en dur, aucun texte d'attente, aucun composant sans source de données (recherche `TODO|FIXME|placeholder|coming soon|not available` sur les 9 fichiers du plan : rien). Les deux seuls états « vides » introduits sont des états d'erreur délibérés (`RenderErrorState`, message de morceau), alimentés par des erreurs réelles et couverts par un test chacun.

## Deferred / non couvert

Consignés dans `deferred-items.md` (sections 3, 4 et 5) :

- **§3** — l'`enfant` peut encore ouvrir le dialogue de création par un appui long sur la grille (`onLongPress={openCreate}`, non gardé), et deux textes d'aide l'annoncent sans condition. Hors périmètre du constat WR-18 (qui porte sur `onEdit`/`onDelete`), et la correction demande `components/calendar-grid.tsx`, hors `files_modified` — aucun plan de la phase ne possède ce fichier.
- **§4** — `use-notifications.ts:147` porte deux instructions sur une seule ligne (défaut de forme préexistant, laissé tel quel pour ne pas mêler une retouche de forme à la correction d'invalidation).
- **§5** — le memo `items` se recalcule à chaque rendu tant que la session n'est pas connectée (`useSyncedReads` : `rows` neuf par rendu quand la lecture `notification_reads` est désactivée). Préexistant, hors `files_modified` ; c'est la raison pour laquelle le test WR-19 exige une session connectée.

## Next Phase Readiness

- **Position d'état non avancée automatiquement.** `state advance-plan` ne peut pas lire ce `STATE.md` (`plan_position_unreadable`) : il n'y a pas de ligne `Current Plan: N` dans `## Current Position` et son frontmatter désigne la phase `04-courses-scan`. La progression de la phase 19 n'est donc reflétée que par les SUMMARY sur disque et par la ligne de `ROADMAP.md`. À réparer par un `state sync`/`rebuild` sur un `STATE.md` proprement étiqueté, ou à la main si l'on veut que `/gsd-verify-work` lise une position fiable.
- **Aucun blocage.** Les fichiers de ce plan ne croisent aucun autre plan de la vague 1 : `19-05` (médias) et `19-06` (e2e) ne touchent ni `app/src/app/router.tsx`, ni `components/ui/route-error.tsx`, ni `modules/calendrier/calendrier-page.tsx`, ni `hooks/use-notifications.ts`.
- **`requirement mark-complete`** appliqué sur `WR-17`, `WR-18`, `WR-19`.
- **Attention pour la suite du calendrier** : le gating `enfant` est complet sur les événements **existants** mais reste ouvert sur la **création** par appui long (§3). Le module Calendrier n'a plus de plan propriétaire dans cette phase.

---
*Phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr*
*Completed: 2026-10-15*

## Self-Check: PASSED

- Fichiers créés : le fichier de test neuf présent (`app/src/components/ui/route-error.test.tsx`), ce SUMMARY présent.
- Commits : les 6 présents (`5c0db84`, `4da252a`, `54dd572`, `ea77471`, `3e5dda2`, `05366de`) ; `git rev-list --count b5b6e11..HEAD` = **6** (mesuré, pas raconté).
- `plan_head_before` = `b5b6e111c23d437dd4e1eb7356157903d160eb3c`, `plan_head_after` = `05366de999f64732cc8de69808280d3d44289e18` — tous deux inscrits au frontmatter.
- Working tree : aucune modification non commitée hors plan. Seuls des fichiers **non suivis** préexistants : `.claude/`, `.gsd/`, `app/shot-toggle-on.mjs` (non touchés).
- Aucune suppression accidentelle : `git diff --diff-filter=D --name-only HEAD~1 HEAD` ne renvoie rien.
