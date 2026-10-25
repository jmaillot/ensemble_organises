# Phase 19 — éléments relevés hors périmètre (exécution du plan 19-01)

Rien de ce qui suit n'est corrigé ici : ces constats ont été faits pendant
l'exécution de `19-01-PLAN.md` et sortent de son périmètre (AGENTS.md §2.7E et
SCOPE BOUNDARY de l'exécuteur : on ne corrige que ce que le changement courant
casse).

## 1. `compressImage` refuse un fichier dont le `type` est vide, même quand sa seule extension l'identifie

- **Fichier :** `app/src/modules/cercle/lib/media.ts:76`
  (`compressImage`), partagé par le Cercle, `lib/storage.ts` et les modules média.
- **Constat :** le garde d'entrée est `if (!file.type.startsWith('image/')) throw`.
  Un JPEG mobile (`type` vide, nom `ordonnance.JPG`) — précisément le cas que D-04
  demande de reconnaître par l'extension — est donc **refusé** par la compression
  alors que le dépôt vient de l'identifier comme image. Le module média et la
  couche de dépôt ne s'accordent pas sur ce qu'« être une image » veut dire.
- **Ce qui a été fait (19-01) :** `depositHouseholdFile` présente à `compressImage`
  une copie du fichier portant le type résolu (`new File([file], name, { type })`)
  quand `file.type` est vide. Le dépôt fonctionne, et c'est prouvé ; le garde de
  `compressImage`, lui, reste tel quel.
- **Statut :** hors périmètre — `modules/cercle/lib/media.ts` n'est dans le
  `files_modified` d'aucun plan de la phase, et `modules/cercle` a son propre plan
  (19-10) pour l'écriture des médias. Correctif candidat : lire le type résolu
  (`file.type || extension`) dans `compressImage`, ou accepter un paramètre de type
  explicite, une fois décidé si `lib/storage.ts` doit rester le seul à résoudre un
  type.
- **Découvert pendant :** Task 2 — l'écriture du cas « un JPEG mobile part en
  image/jpeg » a montré que sans le réemballage, `compressImage` levait
  « Sélectionnez une image (JPEG, PNG ou HEIC). »

**Statut (passe de vérité du 2026-10-17) : CLOS** par `d36359c` (22-02 (a)) — `cercle/lib/media.ts:82` n'écarte plus qu'un type DÉCLARÉ non-image (`file.type !== '' && !file.type.startsWith('image/')`) ; le refus tombe au décodage (`:100-106`), avec le même message.


## 2. Deux consommateurs de `NoteAttachment.url` n'appartiennent à aucun plan de la phase

- **Fichiers :** `app/src/modules/notes/notes-page.tsx`,
  `app/src/modules/notes/components/note-form-dialog.tsx`.
- **Constat :** ces deux composants lisent `attachment.url`, qui devient
  `string | null` avec l'échec fermé de D-01. Ils ne figurent dans le
  `files_modified` d'aucun des treize plans de la phase (vérifié sur les treize) :
  le typecheck rougissait sans qu'un plan en porte la propriété.
- **Ce qui a été fait (19-01) :** garde explicite sur `href`/`src` (motif déjà en
  place côté prestataires), committée avec la Task 1 et documentée comme déviation
  bloquante dans `19-01-SUMMARY.md`.
- **Statut :** relevé d'**ordonnancement**, pas de code — la couverture
  `files_modified` d'une phase devrait inclure chaque fichier dont le type change,
  sinon une vague parallèle peut se retrouver bloquée sur un fichier que personne
  ne possède.
- **Découvert pendant :** Task 1 (`npm run typecheck`).

---

**Statut (passe de vérité du 2026-10-17) : CLOS** par `d6854f4` (Task 1 de 19-01) — `notes/types.ts:74` déclare `url: string | null`, et les deux consommateurs gardent : `notes-page.tsx:266,271` (`href={attachment.url ?? undefined}`) et `note-form-dialog.tsx:198`.


# Phase 19 — éléments relevés hors périmètre (exécution du plan 19-04)

Même règle que ci-dessus : ces constats ont été faits pendant l'exécution de
`19-04-PLAN.md` et sortent de son périmètre.

## 3. Un `enfant` peut encore ouvrir le dialogue de création par un appui long sur la grille

- **Fichiers :** `app/src/modules/calendrier/calendrier-page.tsx` (le `onLongPress={openCreate}` passé à `CalendarGrid`, et le texte « Maintenez une date dans la grille pour créer un événement directement. ») et `app/src/modules/calendrier/components/calendar-grid.tsx` (son `onLongPress` requis, et « Maintenez une date pour créer un événement. »).
- **Constat :** WR-18/D-13 bornent la création par les entrées de la page (`isChild`) et, depuis ce plan, l'édition et la suppression des événements **existants**. Mais l'appui long sur une case de la grille mène à `openCreate` sans passer par `isChild` : un `enfant` ouvre donc le dialogue de création.
- **Pourquoi ce n'est pas corrigé ici :** le constat WR-18 porte sur les affordances `onEdit`/`onDelete` — l'action du plan ne parle pas de la création, dont le gating est déjà fait aux entrées de la page. La correction demande en plus `components/calendar-grid.tsx` (son `onLongPress` **et** son texte d'aide), **hors** `files_modified` : l'élargir aurait dépassé la planche. Le module Calendrier n'a d'ailleurs plus de plan propriétaire dans la phase qui couvrirait ce fichier.
- **Statut :** hors périmètre — constat d'exécution, à traiter avec le module Calendrier (aucun plan de la phase 19 ne possède `calendar-grid.tsx`).
- **Découvert pendant :** Task 2 — l'inventaire `grep -n "openEdit\|setPendingDelete\|openCreate"` demandé par l'action a montré que `openCreate` a un appelant hors garde.

**Statut (passe de vérité du 2026-10-17) : CLOS** par `d36359c` (22-02 (b)) — `calendrier-page.tsx:467` passe `onLongPress={isChild ? undefined : openCreate}`, le texte d'aide devient conditionnel (`:254`, `calendar-grid.tsx:214`) et `calendar-grid.tsx:34,73` rend le geste facultatif. Assertion : `calendrier-page.test.tsx:298`.


## 4. Une ligne de `use-notifications.ts` porte deux instructions (défaut de forme préexistant)

- **Fichier :** `app/src/hooks/use-notifications.ts:147`.
- **Constat :** `}, [taskAssigneesQuery.data]);  const profilesResource = useResource<ProfileRow>('profiles', {` — la fermeture du memo `assigneesByTask` et la déclaration de `profilesResource` tiennent sur une seule ligne.
- **Ce qui a été fait (19-04) :** rien. Le plan ne touche que le tableau de dépendances du memo `items`. Mêler une retouche de forme à une correction d'invalidation aurait rendu le diff du correctif illisible, et ce fichier n'est concerné que par WR-19.
- **Statut :** hors périmètre (forme, pas comportement) — une passe de formatage du fichier le réglera.
- **Découvert pendant :** Task 3, lecture du corps du memo (l'inventaire des dépendances part de la ligne 233).

**Statut (passe de vérité du 2026-10-17) : CLOS** par `d36359c` (22-02 (c)) — `use-notifications.ts:146` et `:148` sont deux instructions distinctes (la ligne 147 est vide).


## 5. Le memo `items` se recalcule à chaque rendu quand la session n'est pas connectée (cause amont, préexistante)

- **Fichiers :** `app/src/lib/notification-reads.ts` (`useSyncedReads`), consommé par `modules/messages/hooks/use-messages.ts` et `modules/cercle/hooks/use-cercle.ts`.
- **Constat :** `useResource` rend `query.data ?? []` ; quand la lecture `notification_reads` est **désactivée** (aucun utilisateur de session), `rows` est un tableau neuf à **chaque** rendu. `serverMap` puis `readMap` en dérivent (chacun un `useMemo` sur cet identifiant), `readAt` et `buildSummaries` aussi, donc les feeds `cercle.feed` et `feed.conversations` changent d'identité à **chaque** rendu — et le memo `items` de la cloche se recalcule pour cette raison étrangère.
- **Pourquoi ce n'est pas corrigé ici :** `lib/notification-reads.ts` n'est dans le `files_modified` d'aucun plan de la phase 19, et WR-19 porte sur les dépendances **déclarées** du memo, pas sur la stabilité d'une dépendance amont. Corriger la classe (rendre `rows` stable, par exemple en mémoïsant sur `query.data`) est un correctif de prévisibilité à part entière.
- **Effet mesuré :** c'est précisément cette instabilité qui **masquait** le défaut WR-19 : le test de réassignation ne pouvait pas échouer sans le correctif, puisqu'un rendu quelconque recalculait le memo de toute façon. Le test tourne donc en session **connectée**, où les feeds se stabilisent et où le rendu qui voit `assigneesByTask` changer ne change **que** lui — seule condition où la dépendance manquante devient observable.
- **Statut :** hors périmètre — constat d'exécution, et c'est la justification écrite de la session connectée dans le test.
- **Découvert pendant :** Task 3, instrumentation temporaire des identités de dépendances (le memo se recalculait à chaque rendu, y compris sans changement de données).

---

**Statut (passe de vérité du 2026-10-17) : CLOS, clause racine** par `d36359c` (22-02 (d)) — `useResource.ts:72` définit la constante de module `NO_ROWS`, rendue en `:157`/`:214` au lieu de `query.data ?? []` ; `rows` garde donc son identité quand la requête est désactivée, et `notification-reads.ts:87-102` se stabilise.

> La fermeture porte sur **`useResource`**, pas sur toute la classe : un survivant
> subsiste hors de ce module — `app/src/modules/voyages/hooks/use-voyages.ts:96`
> (`const tripRows = tripsQuery.data ?? [];`, produit au rendu et consommé comme
> dépendance de l'effet suivant). Il est consigné avec `file:line` par 22-02
> (`22-VERIFICATION.md:107`, `22-02-SUMMARY.md:71`) et **délibérément non
> corrigé** : ce n'est pas un défaut de correction, seulement un effet qui se
> rejoue à vide. Ne pas lire ce statut comme « plus aucune occurrence ».


# Phase 19 — éléments relevés hors périmètre (exécution du plan 19-06)

Même règle que ci-dessus : ces constats ont été faits pendant l'exécution de
`19-06-PLAN.md`, dont le `files_modified` se limite aux deux specs e2e.

## 6. `recettes.spec.ts:181` est instable sous la charge de la suite entière

- **Fichier :** `app/e2e/recettes.spec.ts:181` (« enfant : toggle visible et cases
  cochables, rien d'autre »), via son assistant `seedTwoSteps` (`:155`).
- **Constat :** sur une exécution complète de `npm run test:e2e` (120 tests en
  parallèle), le bouton « Ajouter une étape » est resté `disabled` pendant les
  45 s du délai, après le `fill('#recette-etape-nouvelle', …)`. La même suite, un
  autre jour, l'a fait passer ; en isolation (`--project=mobile --grep "toggle
  visible et cases cochables"`) il passe en 2,8 s.
- **Pourquoi ce n'est pas corrigé ici :** `e2e/recettes.spec.ts` n'est pas dans le
  `files_modified` du plan, et le test est vert hors saturation — le classer
  demanderait d'abord de mesurer la cause (attente d'une écriture de démo sous
  charge ? état de formulaire non propagé ?).
- **Effet :** un rouge de charge sur un test qui n'a rien à voir avec le plan rend
  le critère « zéro échec » dépendant de la machine, pas du code.
- **Statut :** hors périmètre — à classer (test instable à instrumenter, ou app à
  durcir) par un plan qui possède ce fichier.
- **Découvert pendant :** la vérification finale (2ᵉ exécution de la suite entière ;
  vert à la 1ʳᵉ et à la 3ᵉ).

**Statut (passe de vérité du 2026-10-17) : CLOS** — la course nommée est retirée par `75850b1` (21-05) : `e2e/recettes.spec.ts:158` attend que le champ soit vidé (`await expect(input).toHaveValue('')`) avant le remplissage suivant, parce que `submitAdd` remet le brouillon à vide **après** son `await onAdd` ; `recipe-steps.tsx:168` porte en plus la garde `disabled={isSaving || draft.trim() === ''}`. Ce commit s'est vérifié lui-même par `--repeat-each=4` → 80 passés. **La condition d'apparition a été rejouée le 2026-10-17** : `cd app && npm run test:e2e` (suite entière, parallèle) rend **123 passés / 5 sautés, zéro échec**, deux exécutions consécutives, et le test cité — désormais `:186` — y passe (3,0 s puis 2,7 s). Deux verts consécutifs ne prouvent pas l'absence de toute instabilité, mais la course nommée a une cause écrite et cette cause est hors du code : la condition qui la révélait ne se reproduit plus.


## 7. La redirection de `RequireAuth` perd la requête, et rien ne lit `?token=`

- **Fichiers :** `app/src/app/router.tsx:34` (`state={{ from: location.pathname }}`),
  `app/src/modules/parametres/components/invitations-panel.tsx:71` (lien partagé
  `${origin}/foyer/rejoindre?token=…`), `app/src/modules/landing/join-household-page.tsx`
  (formulaire à saisie manuelle).
- **Constat :** le lien d'invitation porte le token en paramètre d'URL, mais
  `join-household-page.tsx` ne lit **aucun** paramètre de requête (ni
  `useSearchParams`, ni `location.search` — vérifié par `grep` sur
  `src/modules/landing/` et `src/app/`). Depuis 19-04, un visiteur anonyme qui suit
  ce lien est de plus renvoyé vers `/connexion` avec `from = location.pathname`,
  donc sans le token : après connexion il revient sur `/foyer/rejoindre` nu.
- **Ce qui n'est PAS affirmé ici :** que le token survivait avant 19-04 (il n'était
  déjà lu par personne), ni quelle correction est attendue — préremplir le champ
  depuis l'URL, ou renvoyer `pathname + search` dans `from`, sont deux décisions
  produit distinctes.
- **Statut :** hors périmètre — `router.tsx` et `invitations-panel.tsx` n'appartiennent
  à aucun `files_modified` du plan ; le constat vient de la lecture faite pour
  justifier le correctif du test mobile (entrée 8 du présent fichier, committée).
- **Découvert pendant :** Task 3 (déviation) — rechercher qui consomme `state.from`
  a montré que personne ne le lit, et que le token d'URL n'a pas de lecteur.

**Statut (passe de vérité du 2026-10-17) : CLOS**, les deux moitiés, par `1126bc4` (19-14) puis `79e0fbd` (19-16) — `router.tsx:38` porte `state={{ from: location.pathname + location.search }}`, `sign-in-page.tsx:83` honore `from`, et `join-household-page.tsx:26,36` lit `?token=`.


## 8. L'accroche de la landing annonce « Seize espaces » et en rend dix-sept

- **Fichier :** `app/src/modules/landing/landing-page.tsx:124` (titre) et `:128`
  (`{modules.map(…)}`, sans filtre) contre `app/src/lib/modules.ts` (17 entrées).
- **Constat :** la grille rend une tuile par entrée de `modules` — dix-sept — sous un
  titre qui en annonce seize. Aucun test ne fixe ce nombre, donc rien ne l'a
  signalé.
- **Pourquoi ce n'est pas corrigé ici :** le plan interdit explicitement de modifier
  un fichier applicatif (`landing-page.tsx` et `modules.ts` sont hors
  `files_modified`), et le corriger demanderait de trancher entre corriger le titre
  et reclasser une entrée.
- **Statut :** hors périmètre — copie à aligner (constat vérifié : 17 entrées
  `key:` dans `modules`, une tuile par entrée).
- **Découvert pendant :** Task 1 — écrire le compte positif du groupe de connexion a
  demandé de compter les liens de `main`, ce qui a fait apparaître l'écart.

**Statut (passe de vérité du 2026-10-17) : CLOS** par `d36359c` (22-02 (f)) — `landing-page.tsx:124` lit `{modules.length}` (17 entrées, `modules.ts:50-68`), verrouillé par `landing-page.test.tsx:49` : le nombre ne peut plus dériver.


## 9. Trois fichiers non suivis traînent à la racine du dépôt

- **Fichiers :** `.claude/`, `.gsd/`, `app/shot-toggle-on.mjs`.
- **Constat :** présents dans `git status --short` en `??` à la fin de l'exécution de
  `19-06` ; ils ne sont ni créés ni modifiés par ce plan (aucune écriture de
  l'exécuteur ne les touche) et n'apparaissent dans aucun `files_modified` de la
  phase.
- **Pourquoi ce n'est pas traité ici :** décider s'ils doivent être versionnés ou
  ignorés appartient au dépôt : les committer depuis un plan de specs e2e
  mélangerait deux sujets, et les ajouter au `.gitignore` sans savoir s'ils sont
  jetables serait une affirmation non vérifiée.
- **Statut :** hors périmètre — à trancher (`.gitignore` ou versionnement), et
  `app/shot-toggle-on.mjs` ressemble à un utilitaire de capture laissé par un
  chantier antérieur.
- **Découvert pendant :** Task 3 (déviation) — le contrôle d'après-commit des
  fichiers non suivis exigé par le protocole.

---

**Statut (passe de vérité du 2026-10-17) : CLOS** par `7437f51` (20-02) — `.gitignore:62` (`.claude/worktrees/`), `:66` (`.gsd/`) et `:71` (`app/shot-toggle-on.mjs`) ; `git status --short` est vide et `git check-ignore` nomme ces entrées.


# Phase 19 — éléments relevés hors périmètre (exécution du plan 19-09)

Même règle que ci-dessus : ce constat a été fait pendant l'exécution de
`19-09-PLAN.md`, dont le `files_modified` se limite aux six fichiers d'`app/src/modules/ardoise`.

## 10. Le parcours invité de l'Ardoise servait `cover_url` brut — **CLOS par 19-14** (2026-10-16)

> **CLOS le 2026-10-16 (plan 19-14, `39b0c6d`).** Le constat ci-dessous — titre
> et corps — décrit l'état **au moment où il a été relevé** (Task 2 du plan
> 19-09), et il est rédigé au présent : il annonçait une image cassée qui n'a
> pas eu lieu. La régression a été **traitée dans la même phase** :
> `ardoise-invite` signe désormais la couverture côté serveur
> (`resolveGuestCoverUrl`, appelé en `index.ts:737`, TTL 1 h, échec fermé à
> `null`), la charge utile porte `coverUrl`, et
> `app/src/lib/guest-media-contract.test.ts` verrouille la non-régression.
> `19-VERIFICATION.md:192,253,303` enregistre la fermeture, spot-check à l'appui.
>
> Les phrases « l'Edge `ardoise-invite` **ne signe rien** » et
> `**Statut : hors périmètre**` ci-dessous sont donc **périmées** : elles sont
> conservées comme trace de ce qui a été relevé, jamais lues comme un état
> courant. C'est le mode de défaillance que §2.7 I interdit de laisser traîner —
> une absence affirmée qui dissuade de chercher.

- **Fichiers :** `app/src/modules/ardoise/guest-ardoise-page.tsx:100-102` (rend
  `view.ardoise.cover_url` directement dans un `<img src>`) et
  `supabase/functions/ardoise-invite/index.ts` (lecture `select('id,name,description,cover_url,is_active')`
  en `:615`, restitution `cover_url: … .cover_url` en `:689`, réception `p_cover_url`
  en `:393`).
- **Constat :** depuis 19-09, une ardoise **créée ou modifiée** porte un CHEMIN de
  bucket dans `ardoises.cover_url` (D-01). L'Edge `ardoise-invite` ne signe rien :
  elle rend la colonne telle quelle à l'invité. Le lien invité affichera donc
  `<img src="foyer-1/ardoises/….webp">` — une image cassée. Avant ce plan, la colonne
  portait l'URL signée du dépôt (30 jours) et le lien invité fonctionnait ce temps-là.
- **Ce qui n'est PAS affirmé ici :** que la RLS Storage laisserait un invité signer
  lui-même l'objet (l'accès au bucket est borné au foyer et par le chemin de l'objet :
  c'est justement le point à trancher). Aucune migration de rattrapage n'existe non plus
  pour `ardoises.cover_url` — vérifié : aucune migration ne référence `storage/v1/object`
  ni `object/sign`, donc les lignes déjà mortes (URL expirée) le restent.
- **Pourquoi ce n'est pas corrigé ici :** les deux fichiers sont hors du
  `files_modified` du plan (et l'Edge est hors de `app/`), et la correction demande une
  décision d'architecture — signer côté serveur avec la clé secrète (l'invité n'a pas de
  session foyer), ou exposer l'objet par une route dédiée : **Rule 4**, pas un correctif
  d'exécuteur. Un exécuteur qui aurait touché `supabase/functions/` de sa propre
  initiative aurait franchi une frontière de plan.
- **Effet :** régression fonctionnelle **introduite par 19-09** sur un parcours non
  couvert par les tests de ce plan (aucun test e2e ni unitaire n'exerce la couverture
  d'une ardoise côté invité).
- **Statut :** **CLOS** — porté par le plan 19-14, seul à posséder `guest-ardoise-page.tsx`
  **et** `supabase/functions/ardoise-invite/index.ts` (voir l'encadré en tête de
  section). Ce « hors périmètre » décrivait l'état du 19-09 et n'est plus vrai.
- **Découvert pendant :** Task 2 — la recherche des lecteurs restants de `cover_url`
  (`grep -rn "cover_url" app/src/modules/ardoise`) a montré que le troisième écran du
  module, l'invité, lit la même colonne depuis une autre provenance.

## 11. `use-notifications.test.tsx` échoue par expiration (4 cas) — préexistant, hors plan 19-11

- **Fichier :** `app/src/hooks/use-notifications.test.tsx` (14 cas, 4 en échec :
  `isole le feed messages…`, `ouvrir le fil cache sa ligne partout…`, et deux autres
  du même bloc).
- **Constat :** `npm test` rapporte `1 failed | 133 passed` avec ces 4 échecs, tous
  `Test timed out in 5000ms` (aucune assertion fausse : les cas n'atteignent jamais
  leur `waitFor`). Reproduit **en isolation** (`npx vitest run src/hooks/use-notifications.test.tsx`),
  donc pas un effet de charge.
- **Preuve de préexistence :** lancé sur `HEAD` = **86944da** (avant tout commit de
  19-11, dans un worktree jetable) : **mêmes 4 échecs**, identiques. Aucun fichier de
  ce plan ne touche `use-notifications`, ses dépendances (`memo items`), ni le harnais.
- **Ce qui a été fait (19-11) :** rien — hors périmètre. La chaîne de 19-11 est
  néanmoins verte sur ses propres périmètres : `npm test -- src/modules/{voyages,recettes,anniversaires,landing}`
  (176 + 51 + 101 cas) + `typecheck` + `build` + `test:e2e` (121) +
  `check-sql-statique`. Les 4 échecs sont étrangers au plan.
- **Statut :** hors périmètre — à porter par la phase/plan qui possède
  `app/src/hooks/use-notifications.ts`. Piste : les cas semblent dépendre de
  l'heure (les seeds recalent les dates sur `todayIso()`), et le passage de date
  du 2026-10-15 au 2026-10-16 pendant la session n'a peut-être fait qu'exposer
  une instabilité latente (motif identique à §6).
- **Découvert pendant :** la vérification finale de 19-11 (`npm test` complet).

**Statut (passe de vérité du 2026-10-17) : CLOS** par `1f6eb50` (19-15) — les cinq `created_at` de messages passent à `minutesAgo` (`seed.ts:75`, `:1281…1314`, plus aucun instant futur), `seed-instants.test.ts` interdit la récidive, et `use-notifications.test.tsx:35-43` fixe la bascule passé/futur (plus d'horloge).


## 12. Décompte de `npm test` : 4 échecs préexistants, à ne pas attribuer à 19-11

- **Base au commit 86944da :** conforme au plan, **132 fichiers / 1133 cas**.
- **Delta de 19-11 :** **+2 fichiers** (`use-anniversaires.test.tsx`,
  `create-household-page.test.tsx`) et **+12 cas** (2 anniversaires + 2 foyer +
  4 budget + 2 recettes + 2 voyages) → **134 fichiers / 1145 cas**.
- **Résultat de `npm test` (19-11) :** `4 failed | 1141 passed (1145)` — les 4
  échecs sont les cas préexistants de `use-notifications.test.tsx` (§11),
  étrangers au plan. Sur ses propres périmètres, 19-11 est entièrement vert.
- **Statut :** consigné pour que le décompte de la phase ne soit pas lu comme une
  régression de 19-11. Aucune correction ici.

**Statut (passe de vérité du 2026-10-17) : PÉRIMÉ** — les « 4 échecs préexistants » sont fermés par `1f6eb50` (19-15) et le décompte (134 fichiers / 1145 cas) est dépassé (cf. `d36359c` : 148 fichiers / 1264 cas).


## 13. §11 : cause PROUVÉE (la piste « dépend de l'heure » est confirmée et localisée)

La cause n'est plus une hypothèse. Ce qui suit a été mesuré le 2026-10-16 vers
00 h 30, heure locale.

**Le défaut préexiste à la phase 19.** Exécuté à cet instant, sur un arbre de
travail séparé au commit `f79d553` (tête de la phase 18, avant tout commit de la
phase 19) : `4 failed | 9 passed (13)` sur le même fichier. La phase 19 n'a donc
rien introduit ; elle a ajouté un cas (13 → 14) qui passe.

**Il est horaire, dans le même arbre.** Même commit courant, deux fuseaux :

| `TZ` | heure locale vue | `use-notifications.test.tsx` |
|---|---|---|
| `Europe/Paris` | 2026-10-16 00:27 | **4 échoués**, 10 passés |
| `Pacific/Midway` | 2026-10-15 11:23 | **14 passés**, 4,4 s |

**Ce n'est pas de la lenteur.** Avec `--testTimeout=30000`, le fichier échoue
toujours (4/4) : le `waitFor` ne retombe jamais. `vitest` annonce bien
`Test timed out in 5000ms` alors que le fichier se configure à
`asyncUtilTimeout: 8000` — le délai de cas (5 s) est donc plus court que celui
d'attente (8 s), ce qui **masque la nature** de l'échec derrière un
« timed out » au lieu de rendre l'assertion fautive.

**Localisation exacte** (test « agrège non lus et restes à faire », rejoué pas à
pas avec traces ; les 3 autres cas partagent la même attente) :

```
STEP 4 marque, before = 7 marks = {"conversation-1":…,"conversation-3":…,"conversation-2":…}
STEP 5 remaining = ["message:conversation-1","message:conversation-3"]   ← attendu : conversation-3 seule
```

`markAllRead()` marque lu à l'instant courant (00 h 28). Or la graine date les
messages de `conversation-1` à **10:42, 10:44, 10:45 « aujourd'hui »**
(`app/src/lib/data/seed.ts:1269,1278,1287`). Avant 10 h 45, ces instants sont
donc **dans le futur** : `isUnseen(10:45, readAt=00:28)` est vrai, la
conversation reste non lue, reste marquable, et l'assertion attendue ne tombe
jamais. `message-4` (« 09:18 », `:1296`) est dans le même cas ; seul le
`beforeEach` du fichier le recale, et seulement pour ce fichier.

**La classe, pas l'instance.** La doctrine est explicite au-dessus du helper
(`seed.ts:84`) : `at()` est une « heure **murale** du jour (`events`,
`created_at`) ». C'est juste pour `events.start_at`/`end_at` — un événement « à
19 h 30 » est une notion murale qui peut légitimement être à venir. C'est faux
pour `created_at` : un message **a été envoyé** à un instant, il ne peut pas être
daté de demain. Les cinq `created_at` de messages sont les seuls `at(...)`
restants sur un champ d'instant (`events` en ont deux, légitimes). Un correctif
qui ne toucherait que `conversation-1` réparerait l'instance et laisserait
`message-4`/`message-5` être datés du futur devant l'utilisateur du mode démo.

**Conséquence, au-delà du test.** Entre 00 h 00 et 10 h 45 locale, la suite est
rouge : 4 échecs, un fichier. Tous les rapports d'exécution de cette session
(19-01 … 19-11) annoncent `npm test` vert — ils ont couru le jour et c'est
**exact**. À toute heure nocturne, la même phase est rouge. C'est exactement le
motif « un succès muet est un échec inexpliqué » (AGENTS.md §2.7F) : le vert de
la journée ne prouvait rien sur l'état réel, et une vraie régression nocturne
aurait été noyée dans un rouge connu que personne ne relit. La suite complète
mesurée à 00 h 29 est `1 failed | 133 passed (134)` fichiers,
`4 failed | 1141 passed (1145)` cas — le reste est sain, la portée est contenue.

**Statut :** à corriger dans une clôture de phase 19 (plan `19-14`), pas ici.
La garde à poser est de classe : aucun instant ensemencé ne doit être postérieur
à l'instant de lecture.

---

**Statut (passe de vérité du 2026-10-17) : CAUSE LEVÉE** — cette analyse prouvait la cause de §11 ; `1f6eb50` (19-15) a changé les cinq `created_at` en instants relatifs et ajouté `seed-instants.test.ts`, donc la cause n'existe plus. Le « à corriger » ci-dessus est supersédé par 19-15.


## 14. `0004_cron.sql` échoue par frontière de date UTC/Paris — préexistant, hors plan 19-12

Découvert en exécutant la campagne SQL complète pour le plan `19-12`
(`sh scripts/test-db.sh`, 2026-10-16 à 00 h 46 locale) : **1 fichier en échec**
sur 61. C'est `0004_cron.sql`, et il ne touche pas aux médias — 0124 ne
référence les tables routinières zéro fois (`grep -c "routine_completions\|routines"
supabase/migrations/0124_media_path_backfill.sql` → 0). L'échec n'est donc pas
imputable à 0124.

**L'assertion qui échoue** (`supabase/tests/0004_cron.sql:116-121`) :

```
ASSERTION ÉCHOUÉE : une occurrence validée n'est jamais touchée (attendu 1, obtenu 0)
```

**La cause, prouvée, est une frontière de date.** La graine insère l'occurrence
avec `current_date - 20` (ligne 58), où `current_date` est la date **UTC** du
serveur ; l'assertion la cherche sur `v_today - 20`, où `v_today` est
`(now() at time zone 'Europe/Paris')::date` (ligne 87). Europe/Paris est en
avance sur UTC (CEST, UTC+2, tant que l'heure d'été dure) : entre 22 h 00 et
24 h 00 UTC — soit 00 h 00 à 02 h 00 heure de Paris — les deux dates diffèrent
d'un jour, et la ligne semée n'est pas celle que l'assertion compte.

Mesure au moment de la découverte :

```
            utc_now            | utc_current_date | paris_today | seed_date  | asserted_date
-------------------------------+------------------+-------------+------------+---------------
 2026-10-15 22:46:18.284942+00 | 2026-10-15       | 2026-10-16  | 2026-09-25 | 2026-09-26
```

**La classe, pas l'instance.** La graine et l'assertion du même fichier ne
mesurent pas le temps au même fuseau : l'une prend `current_date` (UTC), l'autre
`v_today` (Paris). Le même défaut de classe que §11/§13 — « un instant mesuré à
deux horloges » — cette fois côté SQL et entre 22 h et 24 h UTC. Le plan `19-12`
n'a ni été chargé du corriger, ni autorisé à toucher `0004_cron.sql`.

**Statut :** préexistant, hors périmètre de `19-12`. À traiter dans la clôture
de phase (`19-14`) avec §11 : faire lire à la graine le même fuseau que
l'assertion (`(now() at time zone 'Europe/Paris')::date - 20`, et non
`current_date - 20`).

**Statut (passe de vérité du 2026-10-17) : CLOS** par `15458ef` (19-15) — `0004_cron.sql:55` mesure le temps en `Europe/Paris` (`v_today`), et la graine (`:64`) comme l'assertion (`:93`, `:124`) s'y accordent.


## 15. Le formulaire « Rejoindre un foyer » ne lit toujours pas `?token=` — reste de §7

- **Fichiers :** `app/src/modules/landing/join-household-page.tsx` (formulaire à
  saisie manuelle, aucun `useSearchParams`), lien émis par
  `app/src/modules/parametres/components/invitations-panel.tsx:71`.
- **Constat :** `19-14` a fermé la **première** moitié de §7 — `RequireAuth` porte
  désormais `pathname + search` dans `from`, et `sign-in-page.tsx` honore `from`
  (le plan visait `modules/auth/connexion-page.tsx`, qui n'existe pas : le lecteur
  réel est `modules/landing/sign-in-page.tsx`). Après connexion, l'utilisateur
  revient donc bien sur `/foyer/rejoindre?token=…`, jeton compris.
  La **seconde** moitié de §7 reste ouverte : la page d'arrivée ne lit toujours
  aucun paramètre de requête, donc le jeton est dans la barre d'adresse mais le
  champ « Token d'invitation » reste vide — l'utilisateur doit le recopier à la
  main. L'affordance n'est donc restaurée qu'à moitié.
- **Pourquoi ce n'est pas corrigé ici :** `join-household-page.tsx` n'est dans
  aucun `files_modified` du plan `19-14`, et la correction est une décision
  produit (préremplir le champ, ou soumettre directement après connexion) —
  **Rule 4**, pas un correctif d'exécuteur. Le plan `19-15` ne le possède pas
  non plus.
- **Statut :** hors périmètre — reste à porter par un plan qui possède
  `join-household-page.tsx`.
- **Découvert pendant :** Task 2 de `19-14` — vérifier que la cible
  `/foyer/rejoindre?token=…` est réellement *émise* (`grep -rn "foyer/rejoindre"`
  → `invitations-panel.tsx:71`) puis *consommée* (aucun `useSearchParams` dans
  `modules/landing/`).

**Statut (passe de vérité du 2026-10-17) : CLOS** par `79e0fbd` (19-16) — `join-household-page.tsx:2,26,36,41` lit `?token=` et préremplit le champ.


## 16. `recettes.spec.ts:159` instable sous la charge de la suite e2e entière (classe de §6)

- **Fichier :** `app/e2e/recettes.spec.ts:159` (« membre : toggle, cocher,
  recharger, reprise, retour édition », projet `mobile`).
- **Constat :** `npm run test:e2e` (2026-10-16, ~01 h 55 locale) a rendu
  **1 échec / 120 passés / 5 sautés** : `Ajouter une étape` restait `not enabled`
  après `fill('#recette-etape-nouvelle', …)`. Relancé seul
  (`npx playwright test e2e/recettes.spec.ts` → 18 passés) puis en suite entière
  (→ **121 passés, 5 sautés**, la référence attendue), il est vert : c'est
  l'instabilité **sous la charge** décrite en §6, pas une régression.
- **Pourquoi ce n'est pas corrigé ici :** `19-14` ne touche ni `recettes` ni le
  mode cuisine ; le fichier est hors de son `files_modified`.
- **Statut :** préexistant, classe §6 (à traiter avec elle).
- **Découvert pendant :** vérification finale de `19-14`.

**Statut (passe de vérité du 2026-10-17) : CLOS** — même classe que §6, même remède : le helper `seedTwoSteps` attend le champ vide avant la saisie suivante (`e2e/recettes.spec.ts:158`) depuis `75850b1` (21-05), et la course qu'il retirait est la seule cause nommée de cette instabilité. **Condition d'apparition rejouée le 2026-10-17** : `cd app && npm run test:e2e` → **123 passés / 5 sautés, zéro échec**, deux exécutions consécutives, et le test cité — désormais `:164` — y passe (3,3 s puis 3,1 s). Il avait échoué le 2026-10-16 sous la même charge : la référence attendue est retrouvée et tenue deux fois de suite.



