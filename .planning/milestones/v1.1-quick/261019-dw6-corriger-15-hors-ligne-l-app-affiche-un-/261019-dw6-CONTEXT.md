# Quick Task 261019-dw6: Corriger #15 — hors ligne, l'app affiche un état vide au lieu de dire qu'elle n'a pas pu lire — Context

**Gathered:** 2026-10-19
**Status:** Ready for planning

<domain>
## Task Boundary

Constat #15 de `docs/TODO.md`, ouvert le 2026-10-19 en rejouant l'UAT 09 (item 3,
réécrit — constat `G-09-etat-vide-mensonger` dans `09-UAT.md`).

Observation en usage réel, Firefox, app déployée, `F12` → Réseau → « Hors ligne » :

> « quand je vais dans courses, il me dit aucune liste pour ce foyer »

Ce n'est pas une liste vide : c'est une lecture qui n'a jamais été tentée. Courses
a pourtant l'erreur prévue (`app/src/modules/courses/courses-page.tsx:247`).

**Cause racine.** TanStack Query 5.103.2, `networkMode` **défaut** = `'online'`
(configuré nulle part dans le dépôt). Hors ligne, la requête ne part pas : elle
passe en `fetchStatus: 'paused'`. Or `isLoading = isPending && isFetching`, donc
`isLoading` vaut **false** en pause, et `isError` aussi. La garde
`!isLoading && !isError && rows.length === 0` s'ouvre et rend l'état vide
ordinaire. Le dépôt ne lit **jamais** `fetchStatus` ni `isPaused` (aucune
occurrence hors tests).

**Précision de reproduction, apportée par l'utilisateur le 2026-10-19** : le
défaut se manifeste au **démarrage à froid** (app ouverte hors ligne, ou section
jamais visitée). Si l'application est déjà chargée, son cache mémoire TanStack
suffit à naviguer et à afficher les éléments — seule l'actualisation échoue. Une
preuve qui ne rechargerait pas la page ne verrait donc **pas** le défaut.

</domain>

<decisions>
## Implementation Decisions

### Politique de réseau
- `networkMode: 'always'` posé globalement dans `QueryClient` (`app/src/app/router.tsx:19`).
  Dans ce mode, TanStack ne met plus rien en pause : la requête part, échoue, et
  toutes les pages affichent l'erreur qu'elles ont **déjà** prévue. Aucun des 10
  sites `!isLoading && !isError` n'a besoin d'être réécrit.
- `refetchOnReconnect` **explicite à `true`** : dans le mode `'always'`, TanStack
  le passe à `false` par défaut (source : `defaultQueryOptions`, `queryClient.ts`),
  donc l'omettre ferait perdre le rechargement automatique à la reconnexion.
- Le mode s'applique aussi aux **mutations** (mêmes `defaultOptions`).

### Bandeau hors ligne
- Un **bandeau global** annonce l'état hors ligne à l'utilisateur, en plus du
  passage en `'always'`. Il porte l'explication de la situation (coupure) sans
  attendre qu'une erreur apparaisse.
- **Décision liée : l'accueil ne reçoit aucune gestion d'erreur propre.** Ses
  widgets continueront d'afficher « rien » quand une lecture échoue ; c'est le
  bandeau qui porte l'explication. Choix explicite de l'utilisateur, à ne pas
  rejouer au planning : ce n'est pas un oubli, c'est un arbitrage.

### Écritures hors ligne
- **Laisser échouer et afficher le message d'origine.** Cohérent avec D-10
  (« chaque lecture et chaque écriture part directement, et une erreur réseau ou
  serveur s'affiche telle quelle »). Pas de désactivation préventive des boutons.
- C'est déjà le comportement de Courses (`runQuietly`,
  `app/src/modules/courses/courses-page.tsx:112-116`). **Le travail restant est de
  vérifier les autres modules d'écriture**, pas d'en ajouter.

### Périmètre annexe
- Corriger les deux commentaires qui parlent encore de la file de rejeu supprimée
  par D-10 : `app/src/modules/dashboard/hooks/use-dashboard.ts:229` (« la file
  rejouera ») et `app/src/app/route-preload.ts:71` (« la file de synchro »).
- Poser une **garde automatique** qui refuse une nouvelle garde d'état vide sans
  traitement du cas hors ligne — de sorte que le défaut ne puisse pas revenir par
  une page ajoutée plus tard.

### the agent's Discretion
- Formulation et emplacement du bandeau ; mécanisme d'écoute de l'état réseau
  (l'`onlineManager` de TanStack, ou les événements `online`/`offline` du
  navigateur) ; forme exacte de la garde automatique ; tests ajoutés.

</decisions>

<specifics>
## Specific Ideas

- **La preuve doit recharger la page.** Un test qui se contente de naviguer
  pendant que le cache mémoire est chaud ne verra pas le défaut — c'est mesuré,
  l'utilisateur l'a constaté lui-même. La non-régression doit monter une page
  **sans données en cache** avec le navigateur déclaré hors ligne.
- **Une garde de classe, pas une garde d'instance** (AGENTS.md §2.7 E) : le
  défaut a 10 occurrences. La leçon du dépôt est qu'une correction appliquée
  endroit par endroit revient par le onzième.
- **Le test doit échouer sur le code d'aujourd'hui.** Une garde qui n'a jamais
  rien refusé n'a pas été exercée (§2.7 B). À vérifier en la voyant rouge avant
  de la voir verte, comme `app/src/lib/no-eslint-directive.test.ts`.
- Étendue mesurée : 10 gardes `!isLoading && !isError` dans 5 modules (Courses,
  Recettes, Prestataires, Animaux, Voyages), plus l'accueil.

</specifics>

<canonical_refs>
## Canonical References

- `docs/TODO.md` #15 — le constat, sa cause racine, son critère de fin.
- `.planning/phases/09-pwa-offline/09-UAT.md` — constat `G-09-etat-vide-mensonger`,
  observation verbatim, artifacts.
- `.planning/phases/09-pwa-offline/09-CONTEXT.md:72-79` — décision **D-10** : le
  retrait de l'offline, et sa promesse « les erreurs réseau d'origine reviennent ».
  Le code ne tient pas cette promesse aujourd'hui ; c'est l'objet de la tâche.
- `AGENTS.md` §2.7 B (un contrôle se prouve sur un cas qui doit échouer),
  §2.7 E (corriger la classe, pas l'instance), §2.7 F (un succès muet est un échec
  inexpliqué), §2.7 I (une absence affirmée est une affirmation).
- Documentation TanStack Query, guide « Network Mode » (mode `always` :
  « Queries will never be `paused`… your Query will go to `error` state if it
  fails » ; `refetchOnReconnect` y passe à `false` par défaut).

</canonical_refs>
