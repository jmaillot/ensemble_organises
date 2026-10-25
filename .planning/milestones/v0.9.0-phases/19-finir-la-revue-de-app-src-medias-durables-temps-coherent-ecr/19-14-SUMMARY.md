---
phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr
plan: 14
subsystem: api
tags: [supabase-edge-functions, storage-signed-url, react-router, open-redirect, source-contract-lock, media-path]

requires:
  - phase: 19
    provides: "19-09 (D-01 : ardoises.cover_url porte le chemin de bucket) et 19-12 (rattrapage des lignes héritées) — le plan ferme la régression que 19-09 a introduite en laissant la lecture invitée derrière elle"
provides:
  - "ardoise-invite : couverture invitée signée par le serveur (resolveGuestCoverUrl, TTL 1 h, échec fermé à null, valeur jamais journalisée), charge utile sous le nom coverUrl"
  - "guest-media-contract.test.ts : verrou de source anti-récidive sur la couverture invitée, positif d'abord, qui nomme le fichier fautif"
  - "RequireAuth conserve pathname + search ; sign-in-page.tsx honore state.from après authentification, garde anti-redirection ouverte (internalPathOf)"
affects: [ardoise, invit, route-guard, sign-in, verify-work]

actuals:
  tokens: 6496
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Signature de média invité côté serveur (troisième occurrence : recipe-invite, gift-list-invite, ardoise-invite) — échec fermé à null, valeur jamais journalisée, nom de champ qui dit la nature de la valeur (chemin en colonne, URL en charge utile)"
    - "Verrou de source à forme positive d'abord, avec en-tête qui déclare ce qu'il ne peut PAS prouver"
    - "Reprise de route post-connexion bornée à un chemin interne (résolution d'origine, refus de // et de /\\ )"

key-files:
  created:
    - app/src/lib/guest-media-contract.test.ts
  modified:
    - supabase/functions/ardoise-invite/index.ts
    - app/src/modules/ardoise/api.ts
    - app/src/modules/ardoise/guest-ardoise-page.tsx
    - app/src/modules/ardoise/guest-ardoise-page.test.tsx
    - app/src/app/router.tsx
    - app/src/modules/landing/sign-in-page.tsx
    - app/src/app/router.test.tsx

key-decisions:
  - "Task 2 : HONORER `from` (et non retirer l'état mort). Le plan laissait le choix ; honorer est compatible avec l'invariant d'amorçage parce que ce sont les gardes en aval (RequireHousehold / RequireNoHousehold) qui décident de la destination d'un utilisateur sans foyer, pas la page de connexion — un `from` vers `/accueil` retombe sur `/foyer` exactement comme avant."
  - "`from` n'accepte qu'un chemin interne, prouvé par une table de cas (URL absolue, forme protocole-relative, /\\…, schéma javascript, non-chaîne, chaîne vide) : sans ce bornage la connexion deviendrait une redirection ouverte (T-19-43)."
  - "`internalPathOf` est exportée pour être prouvée DIRECTEMENT : un test d'intégration de navigation rougit aussi bien pour la garde que pour le refus de même-origine de history.pushState, et une preuve qui ne distingue pas les deux ne prouve pas la garde."
  - "Le verrou de source porte une forme POSITIVE d'abord et une interdiction ANCRÉE (`cover_url: (ardoise as`) : le `select` de la fonction contient légitimement `cover_url` (la colonne doit rester un chemin), qu'une interdiction large aurait croisé (AGENTS.md §2.7D.6)."

patterns-established:
  - "Troisième média invité signé par le serveur : la fonction Edge est le seul signataire possible pour un anonyme (bucket privé, AGENTS.md §2.6) — la page cliente ne reconstruit jamais l'URL."
  - "Un verrou de source déclare son propre angle mort dans son en-tête plutôt que de laisser un vert passer pour une exécution."

requirements-completed: [WR-08, WR-17]

coverage:
  - id: D1
    description: "Un lien invité d'ardoise partagé affiche sa couverture : le serveur signe la couverture au moment de la réponse (TTL 1 h, échec fermé à null), la charge utile porte coverUrl, la page invitée la rend telle quelle"
    requirement: WR-08
    verification:
      - kind: unit
        ref: "app/src/modules/ardoise/guest-ardoise-page.test.tsx#rend la couverture servable de la charge utile, pas un chemin reconstruit"
        status: pass
      - kind: unit
        ref: "app/src/lib/guest-media-contract.test.ts#ardoise-invite signe la couverture invitée au lieu de rendre la colonne brute"
        status: pass
    human_judgment: true
    rationale: "La moitié page est prouvée par test, mais le comportement d'EXÉCUTION de la fonction Edge (signature réelle, échec fermé réel, TTL réel) n'est exercé par aucune chaîne : `deno` est absent de cet hôte et aucun test n'importe un `index.ts`. Un lien partagé réellement affiché demande un appel à la fonction déployée."
  - id: D2
    description: "Un test de contrat refuse la régression : remettre la colonne brute dans la charge utile invitée fait rougir la chaîne"
    requirement: WR-08
    verification:
      - kind: unit
        ref: "app/src/lib/guest-media-contract.test.ts (prouvé rouge par mutation, puis vert après restauration)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Un utilisateur déconnecté qui ouvre une route protégée y revient après connexion, chaîne de requête comprise (`/foyer/rejoindre?token=…`)"
    requirement: WR-17
    verification:
      - kind: unit
        ref: "app/src/app/router.test.tsx#ramène le visiteur sur la route visée après connexion, jeton compris"
        status: pass
    human_judgment: false
  - id: D4
    description: "Aucune redirection ouverte : `from` n'accepte qu'un chemin interne"
    requirement: WR-17
    verification:
      - kind: unit
        ref: "app/src/app/router.test.tsx#`from` : une URL absolue / une forme protocole-relative / une barre oblique inversée / un schéma javascript"
        status: pass
    human_judgment: false
  - id: D5
    description: "Le routage d'amorçage d'un utilisateur sans foyer est inchangé (ouvrir la page d'accueil déconnecté mène au même écran ; sans foyer, /accueil mène au choix créer/rejoindre)"
    requirement: WR-17
    verification:
      - kind: unit
        ref: "app/src/app/router.test.tsx#ouvrir la page d'accueil déconnecté mène toujours à /accueil après connexion ; #sans foyer, /accueil mène toujours au choix créer/rejoindre"
        status: pass
    human_judgment: false

duration: 26min
completed: 2026-10-16
plan_head_before: 498b3b99ea49c452d7004fe8df264e7a23754e1a
plan_head_after: 1126bc4fbda58d2cb1b0f1810065c10469e03ff8
status: complete
---

# Phase 19 Plan 14: couverture invitée signée par le serveur, et route visée reprise après connexion Summary

**Le bloqueur de 19-09 est fermé côté serveur — `ardoise-invite` signe la couverture invitée (TTL 1 h, échec fermé à `null`) au lieu de rendre un chemin de bucket — et `state.from` cesse de mentir : la route visée, chaîne de requête comprise, est reprise après connexion, bornée à un chemin interne.**

## Performance

- **Duration:** 26 min
- **Started:** 2026-10-16T01:44Z (approx.)
- **Completed:** 2026-10-16T02:10Z (approx.)
- **Tasks:** 2 / 2
- **Files modified:** 8 (7 modifiés, 1 créé)

## Accomplishments

- **Le bloqueur introduit par la phase est fermé.** `supabase/functions/ardoise-invite/index.ts` copie le motif de `recipe-invite` (et de `gift-list-invite`, second précédent) : `HOUSEHOLD_MEDIA_BUCKET`, `GUEST_PHOTO_TTL_SECONDS = 3600`, `asTextOrNull`, `resolveGuestCoverUrl`. Une URL `http(s)` héritée passe telle quelle ; un chemin est signé avec la clé secrète (un invité anonyme ne peut pas signer — bucket privé, AGENTS.md §2.6) ; toute autre forme ou toute erreur rend `null`, et **rien de la valeur n'est journalisé** (T-19-41). La charge utile porte `coverUrl` : le nom dit que la valeur est une URL servable, plus un chemin.
- **La page invitée rend ce que le serveur a forgé**, sans rien reconstruire, et le cas de test qui manquait existe : une couverture **non nulle**. Le cas existant ne posait que `coverUrl: null` — c'est précisément pourquoi le trou n'a pas été vu.
- **Un verrou de source refuse la récidive**, prouvé **rouge par mutation puis vert** après restauration, et son en-tête déclare son propre angle mort.
- **`state.from` est honoré**, chaîne de requête comprise : `/foyer/rejoindre?token=…` n'est plus nu après connexion. Le jeton est le contrôle d'accès (AGENTS.md §4).
- **Aucune redirection ouverte** : `internalPathOf` refuse tout ce qui change d'origine (URL absolue, `//…`, `/\\…`, `javascript:`), prouvé par une table de cas et par une mutation.
- **L'invariant d'amorçage est prouvé inchangé** : sans `from`, `/accueil` reste la destination ; sans foyer, `/accueil` mène toujours au choix « créer / rejoindre ».

## Task Commits

Chaque tâche a été committée atomiquement :

1. **Task 1 : la couverture invitée est signée par le serveur, jamais la colonne brute** — `39b0c6d` (fix)
2. **Task 2 : la route visée survit à la connexion, chaîne de requête comprise** — `1126bc4` (fix)

**Plan metadata:** non committé (`commit_docs: false`) — le présent SUMMARY et `deferred-items.md` restent hors de git, par choix du projet.

## Files Created/Modified

- `supabase/functions/ardoise-invite/index.ts` — `resolveGuestCoverUrl` + constantes + `asTextOrNull` (motif `recipe-invite`) ; la charge utile rend `coverUrl` signé. Le `select` garde `cover_url` : c'est la colonne, elle doit rester un chemin.
- `app/src/modules/ardoise/api.ts` — `GuestArdoiseView.ardoise.coverUrl` (type `string | null`), avec le commentaire qui dit pourquoi on n'applique PAS `resolveHouseholdMediaUrl` ici.
- `app/src/modules/ardoise/guest-ardoise-page.tsx` — `<img src={view.ardoise.coverUrl}>` ; même `<img>`, même `alt`, mêmes classes.
- `app/src/modules/ardoise/guest-ardoise-page.test.tsx` — `mockViewFetch` accepte une charge utile ; cas à couverture non nulle (rend la valeur telle quelle, et c'est une URL absolue).
- `app/src/lib/guest-media-contract.test.ts` — **nouveau** : verrou de source (forme positive d'abord), mécanique reprise de `media-path-contract.test.ts` (`node:fs`, remontée depuis `process.cwd()`, échec bruyant si la racine est introuvable).
- `app/src/app/router.tsx` — `state={{ from: location.pathname + location.search }}`.
- `app/src/modules/landing/sign-in-page.tsx` — `internalPathOf` (exportée) + `navigate(requestedPath ?? '/accueil')`.
- `app/src/app/router.test.tsx` — `renderAt` accepte un état de navigation ; 5 cas ajoutés (chaîne conservée, retour effectif, table de refus de la garde, invariant d'amorçage ×2).

## Decisions Made

- **Task 2 — HONORER `from`, et non retirer l'état mort.** Le plan laissait les deux options. Honorer est retenu parce que l'invariant d'amorçage n'est pas porté par la page de connexion mais par les gardes en aval : `RequireHousehold` / `RequireNoHousehold` décident de la destination d'un utilisateur sans foyer. Un `from` vers `/accueil` retombe donc sur `/foyer` exactement comme avant, et un `from` vers `/foyer/rejoindre` est précisément la route visée. L'invariant est prouvé par deux cas de test, pas affirmé.
- **`from` borné à un chemin interne** (T-19-43) : résolution contre l'origine courante, refus de tout changement d'origine. Le bornage est exporté et prouvé directement — un test de navigation ne peut pas distinguer la garde du refus de même-origine de `history.pushState`.
- **Le verrou de source nomme le fichier fautif dans ses messages d'échec**, et interdit une forme **ancrée** (`cover_url: (ardoise as`) plutôt que le mot `cover_url`, que le `select` contient légitimement.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Le lecteur de `state.from` n'est pas `modules/auth/connexion-page.tsx` — ce fichier n'existe pas**

- **Found during:** Task 2, à la lecture du `<context>` du plan.
- **Issue:** le plan désigne `app/src/modules/auth/connexion-page.tsx` comme site de lecture et le liste dans `files_modified`. Le fichier n'existe pas (aucun `git log --all` ne le trouve, aucun `find` ne le rend) : la page de connexion est `app/src/modules/landing/sign-in-page.tsx` (montée par `route-preload.ts` → `signIn: () => import('@/modules/landing/sign-in-page')`). Le plan lui-même l'indique indirectement : `grep -rn "state.from" app/src` ne rend qu'un site, le site d'écriture.
- **Fix:** la reprise de `from` est implémentée dans `sign-in-page.tsx`, au point exact où la connexion décide de sa destination (`run()`, qui faisait `navigate('/accueil')`). `files_modified` est donc honoré **à un chemin près**, celui du fichier réel ; aucun fichier hors du plan n'a été touché.
- **Files modified:** `app/src/modules/landing/sign-in-page.tsx`
- **Verification:** `grep -n "signIn" app/src/app/route-preload.ts` → `@/modules/landing/sign-in-page` ; `npm run typecheck` vert ; les 42 cas de `router.test.tsx` verts.
- **Committed in:** `1126bc4` (Task 2).

**2. [Rule 1 - Bug] Mon propre cas de test portait une assertion fausse — supprimée plutôt que raffinée**

- **Found during:** Task 1, premier passage du nouveau cas à couverture non nulle.
- **Issue:** j'avais écrit `expect(cover.getAttribute('src')).not.toContain('household-media/foyer-1')` pour « prouver » que la page ne rend pas un chemin de bucket. L'assertion est fausse : une URL signée de Supabase contient légitimement le chemin du bucket dans son propre segment (`/object/sign/household-media/<chemin>?token=…`). Le test a échoué sur ma propre assertion, pas sur le code.
- **Fix:** l'assertion est **supprimée**, pas raffinée (AGENTS.md §2.7D.6 : « si la propriété ne s'exprime pas ainsi, supprime l'assertion »). Elle est remplacée par celle qui exprime la propriété — la valeur est servable parce qu'elle est **absolue** (`toMatch(/^https:\/\//)`) — et par l'égalité stricte au `src` attendu, qui est la preuve forte.
- **Files modified:** `app/src/modules/ardoise/guest-ardoise-page.test.tsx`
- **Verification:** `npx vitest run src/modules/ardoise` → 12 fichiers, 77 cas verts.
- **Committed in:** `39b0c6d` (Task 1).

**3. [Rule 3 - Blocking] `supabase/functions/**/*.test.ts` SONT branchés sur `npm test` — la prémisse du plan est inexacte, l'en-tête du verrou dit la version vraie**

- **Found during:** Task 1, rédaction de l'en-tête du verrou (le plan demande d'y écrire que ces tests ne sont branchés sur aucune chaîne).
- **Issue:** le plan affirme que les six fichiers de test de `supabase/functions` « ne sont exécutés par aucune chaîne ». C'est faux : `app/vite.config.ts:71` les inclut (`include: ['src/**/*.test.{ts,tsx}', '../supabase/functions/**/*.test.ts']`) et ils tournent bien dans `npm test` (vérifié : 136 fichiers exécutés, 135 verts). Ce qui est vrai — et qui est la seule chose qui compte pour ce verrou — c'est qu'**aucun de ces six tests n'importe un `index.ts`** : ce sont des tests de modules purs (`child-guard`, `web-push`, `ref-days`), et `index.ts` importe `@supabase/server` (spécificateur BARE résolu par la table d'importation du runtime épinglé), donc aucun runner Node/Vitest ne peut le charger. La conclusion du plan reste juste ; sa prémisse ne l'était pas.
- **Fix:** l'en-tête du verrou écrit la version vérifiable : `deno` absent **et** aucun test n'importe un `index.ts` (les six fichiers tournent, mais ne portent que sur des modules purs). Ne pas recopier une prémisse fausse dans un artefact durable (AGENTS.md §2.7I : une affirmation non vérifiée ne s'écrit pas).
- **Files modified:** `app/src/lib/guest-media-contract.test.ts`
- **Verification:** `grep -n "supabase/functions" app/vite.config.ts` → ligne 71 ; `for f in $(find supabase/functions -name '*test*'); do grep "^import" $f; done` → aucun `index.ts`.
- **Committed in:** `39b0c6d` (Task 1).

---

**Total deviations :** 3 auto-corrigées (1 bug, 2 bloquantes)
**Impact on plan :** aucun élargissement de périmètre. La déviation 1 corrige un chemin de fichier du plan (le fichier réel existe, sous un autre nom) ; la 2 retire une assertion fausse que j'avais écrite ; la 3 corrige une prémisse inexacte du plan dans l'artefact durable qui la portait.

## Ce que la chaîne n'a PAS pu exercer — à lire avant de se fier aux verts

- **Le comportement d'exécution de la fonction Edge `ardoise-invite` n'est exercé par RIEN ici.** `deno` n'est pas installé sur cet hôte (`command -v deno` → vide), et aucun test n'importe un `index.ts` (voir déviation 3). La signature réelle, l'échec fermé réel et le TTL réel de `resolveGuestCoverUrl` sont donc **non vérifiés par exécution** : le verrou de source empêche la récidive de la *forme* fautive, il ne remplace pas une exécution. La seule preuve comportementale de bout en bout possible sur cet hôte serait un appel à la fonction déployée contre la pile locale ; il n'a pas été fait, et un scan de source ne doit pas passer pour lui (AGENTS.md §2.7D). **D1 est classé `human_judgment: true` pour cette raison.** **Supplantée le 2026-10-17 (reproduction) :** ce constat est daté — vrai à l'écriture de ce SUMMARY, faux comme état courant. Le chemin a été **exercé** (`19-VERIFICATION.md:253`, puis reproduit le 2026-10-17 par une sonde `link-view` via Envoy sur la pile locale : objet présent → `coverUrl` signé, `exp − iat` = exactement 3600 s, scope `download` ; objet absent → `coverUrl: null`, échec fermé). Ce qui reste vrai est la **couverture automatisée** : `deno` absent et aucun test n'importe un `index.ts` — c'est la fenêtre #4 de `WINDOWS.md`, à lire comme un trou de couverture, jamais comme un comportement inconnu.
- **`sh scripts/migrate.sh` et `sh scripts/test-db.sh` n'ont AUCUN levier sur ce plan** : il ne touche ni migration ni SQL. `test-db.sh` a tout de même été lancé pour le rapport, et il est **vert** (61 fichiers) — mais vert **parce qu'il a tourné à 00 h 06 UTC**, hors de la fenêtre 22 h–24 h UTC du défaut préexistant `0004_cron.sql` (§14). Ce vert ne contredit donc pas le défaut connu et ne valide rien de ce plan. `migrate.sh` n'a pas été lancé : il n'aurait rien appliqué de neuf.
- **`sh scripts/test-dispatch-push.sh` n'a pas été lancé** : le plan ne touche ni `pg_cron`, ni Vault, ni `pg_net`, ni les Edge de push — le script n'a aucun levier ici, et il exige un abonnement de push **réel** (un endpoint factice rendrait `dropped` et non `delivered`, donc un chiffre juste et une preuve fausse). Son absence est dite, pas passée sous silence (AGENTS.md §2.7).

## Verification

| Étape | Résultat |
|---|---|
| `npm run typecheck` | vert |
| `npm test` | **136 fichiers : 135 verts, 1 en échec** — `use-notifications.test.tsx`, **4 cas**, 1162 passés / 4 échoués. Défaut **préexistant** (§11/§13), fenêtre 00 h 00–10 h 45 locale : l'exécution a eu lieu à **01 h 52 locale**, donc il s'applique. Aucun autre échec — y compris les tests de `supabase/functions`, qui tournent bien |
| `npm run build` | vert (précache 100 entrées, 2193,11 KiB) |
| `python3 scripts/check-sql-statique.py` | **aucun défaut** — 181 fonctions effectives sur 124 migrations et 63 tests |
| `sh scripts/deploy-functions.sh` | **12 fonctions déployées** ; la fonction éditée a bien atteint le runtime épinglé (`grep -n "resolveGuestCoverUrl(admin,\|coverUrl," supabase-project/volumes/functions/ardoise-invite/index.ts` → lignes 737 et 744). Le runtime est gitignoré (`.gitignore:34`), donc aucun déchet non suivi |
| `npm run test:e2e` | **121 passés, 5 sautés** — la référence attendue, confirmée au second passage. Premier passage : 1 échec flaky (`recettes.spec.ts:159`, projet `mobile`, « Ajouter une étape » `not enabled`) ; vert en isolation (18/18) puis vert en suite entière. Hors périmètre → `deferred-items.md` §16 (classe §6) |
| `sh scripts/test-db.sh` | vert (61 fichiers) — **sans levier** (aucun SQL touché) et vert **hors fenêtre** du défaut `0004_cron.sql` ; voir ci-dessus |

### Preuves rouges (mutation → échec → restauration)

| # | Mutation | Résultat | Restauration |
|---|---|---|---|
| 1 | `ardoise-invite` : `coverUrl,` → `cover_url: (ardoise as { cover_url: string \| null }).cover_url,` | `guest-media-contract.test.ts` **échoue**, en nommant le fichier : « `supabase/functions/ardoise-invite/index.ts` : la charge utile invitée ne porte pas de champ `coverUrl` » | restaurée depuis une copie hors git ; `grep -c "cover_url: (ardoise as"` → **0**, puis vert (12 fichiers, 77 cas) |
| 2 | `router.tsx` : `location.pathname + location.search` → `location.pathname` | **2 cas** de `router.test.tsx` échouent : « conserve la chaîne de requête dans `from` » (`expected { from: '/foyer/rejoindre' }`) et « ramène le visiteur sur la route visée après connexion » (`expected '/foyer/rejoindre'`) | restaurée ; 42 cas verts |
| 3 | `sign-in-page.tsx` : `navigate(requestedPath ?? '/accueil')` → `navigate('/accueil')` | **1 cas** échoue : « ramène le visiteur sur la route visée après connexion, jeton compris » (`expected '/accueil' to be '/foyer/rejoindre?token=…'`) | restaurée ; 42 cas verts |
| 4 | `internalPathOf` : corps remplacé par `return value` | **5 cas** échouent, dont les 4 attendus de la table (`expected 'https://externe.example/pwned' to be null`, `'//externe.example/pwned'`, `'/\\externe.example/pwned'`, `'javascript:alert(1)'`) | restaurée ; 42 cas verts |

La preuve 4 est la raison pour laquelle `internalPathOf` est exportée : au premier passage, la garde retirée ne faisait rougir que le test d'intégration, et pour une mauvaise raison (jsdom refuse lui-même une poussée hors origine). La table de cas rend la preuve **précise sur la garde**, pas sur le filet du navigateur.

## Issues Encountered

- **Un `git checkout -- <fichier>` a effacé mes éditions de Task 1.** Le plan prescrit de restaurer la mutation par `git checkout -- ../supabase/functions/ardoise-invite/index.ts` ; exécuté après une mutation, il restaure l'état **HEAD**, donc il jette aussi les éditions non committées de la tâche en cours. Rattrapé sans perte parce qu'une copie hors git (`/tmp/opencode/`) avait été prise avant la mutation ; les restaurations suivantes sont passées par cette copie, jamais par `git checkout`. **Le protocole du plan est fautif sur ce point** : `git checkout --` ne restaure une mutation que si le fichier est committé avant la mutation.
- **Le premier passage e2e a rendu 1 échec flaky** (`recettes.spec.ts:159`), sans rapport avec les fichiers du plan ; vert en isolation et au second passage complet. Documenté en `deferred-items.md` §16.

## Known Stubs

Aucun. Aucune valeur vide codée en dur ne remonte au rendu, aucun texte de remplissage, aucun composant sans source de données. Le `null` de `resolveGuestCoverUrl` est un **échec fermé voulu** (une couverture illisible ne casse pas la page : le `<img>` n'est simplement pas rendu), pas un bouchon.

## Threat Flags

Aucun. Les surfaces introduites sont exactement celles du `<threat_model>` du plan : la signature courte par requête et l'échec fermé de `resolveGuestCoverUrl` (T-19-41), la charge utile invitée qui ne rend plus le chemin de bucket (T-19-42), et le bornage de `state.from` à un chemin interne (T-19-43). Aucune nouvelle surface hors registre. T-19-44 et T-19-45 restent `accept` comme prévu.

## Next Phase Readiness

- Le bloqueur de `19-VERIFICATION.md` est fermé dans le code et verrouillé contre la récidive. **Il reste à vérifier en exécution** : `deno` absent empêche d'exercer la fonction Edge ici (voir « Ce que la chaîne n'a PAS pu exercer ») — c'est la seule dette de preuve de ce plan, et elle est déclarée.
- **Dette résiduelle, hors périmètre** (`deferred-items.md` §15) : `join-household-page.tsx` ne lit toujours pas `?token=` ; la seconde moitié de §7 reste ouverte. Le jeton survit désormais à la connexion (dans l'URL), mais l'utilisateur doit encore le recopier à la main. Aucun plan de la phase ne possède ce fichier.
- **Défauts préexistants, non imputables à ce plan** : `use-notifications.test.tsx` (§11/§13, fenêtre 00 h 00–10 h 45 locale) et `0004_cron.sql` (§14, fenêtre 22 h–24 h UTC) — les deux appartiennent à `19-15`.

---

*Phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr*
*Completed: 2026-10-16*

## Self-Check: PASSED

- Fichiers créés/modifiés : 8/8 présents (`guest-media-contract.test.ts`, `ardoise-invite/index.ts`, `ardoise/api.ts`, `guest-ardoise-page.tsx`, `guest-ardoise-page.test.tsx`, `router.tsx`, `sign-in-page.tsx`, `router.test.tsx`).
- Commits : `39b0c6d` et `1126bc4` présents dans l'historique.
- Comptage des commits **mesuré** (jamais narré) : `git rev-list --count 498b3b9..HEAD` → **2**, conforme à `actuals.commits`.
- Aucun fichier supprimé par les commits (`git diff --diff-filter=D` vide sur les deux).
- `git status --short` ne porte que des non-suivis préexistants (`.claude/`, `.gsd/`, `app/shot-toggle-on.mjs`), hors périmètre.

