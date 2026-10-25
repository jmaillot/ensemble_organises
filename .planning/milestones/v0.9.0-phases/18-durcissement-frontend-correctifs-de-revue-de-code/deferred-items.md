# Phase 18 — éléments relevés hors périmètre (plan 18-01)

Rien de ce qui suit n'est corrigé ici : ces constats ont été faits pendant
l'exécution de `18-01-PLAN.md` et sortent de son périmètre (AGENTS.md §2.7E et
SCOPE BOUNDARY de l'exécuteur : on ne corrige que ce que le changement courant
casse).

## 1. `setWidgetOrder` insère une seconde série de widgets quand la lecture n'est pas chargée

- **Fichier :** `app/src/modules/dashboard/hooks/use-dashboard.ts:123-153`
- **Constat :** `existing = widgets.rows`. Si la lecture de `dashboard_widgets`
  n'a pas encore abouti (ou a échoué), `rows` vaut `[]` : la branche
  `data.create` est prise pour **chaque** préférence, avec
  `id: widget-<memberId>-<kind>`. Les lignes déjà présentes ne sont pas mises à
  jour, donc deux séries de lignes coexistent pour un même couple
  `(member_id, widget_type)`.
- **Conséquence observée (démo) :** `toWidgetPreferences` déduplique par
  `widget_type` en gardant la première ligne selon `(position_y, position_x)`.
  La ligne périmée peut gagner (la clé `dashboard_widgets:widget-1` trie avant
  `dashboard_widgets:widget-member-…`), donc masquer un widget ne « prend »
  pas. Reproduit en test unitaire pendant l'écriture du test de 18-01.
- **Conséquence probable en ligne :** l'insertion rencontre la contrainte
  `dashboard_widgets_member_type_key unique (member_id, widget_type)` → `23505`
  → `Promise.all` rejette → échec **silencieux** (l'appelant jette le rejet via
  `void`, `dashboard-page.tsx:175-176`). Même famille que CR-01.
- **Statut :** hors périmètre de 18-01 (D-01 impose le changement le plus petit
  côté contrainte ; Task 2 impose « aucun changement de comportement »).
  Correctif candidat : un vrai `upsert` (`on conflict`) ou une écriture
  sérialisée via `mutate`, à cadrer dans un plan dédié.
- **Statut (2026-10-17) : CLOS par `68b5427`** (plan 18-06) —
  `use-dashboard.ts:141-153` n'émet plus qu'une écriture
  `data.upsert('dashboard_widgets', …, { onConflict: 'member_id,widget_type' })`
  (contrat `lib/data/adapter.ts:56` ; implémentations `supabase-adapter.ts:110`
  et `local-adapter.ts:120`). Une lecture vide ne produit plus une seconde série
  de lignes.
- **Découvert pendant :** Task 2 — le test déterministe a dû être rendu
  indépendant de cet état (membre dédié, sans widget semé).

## 2. Tests e2e périmés (échecs préexistants, sans rapport avec 18-01)

Mesuré sur la chaîne complète : **4 échecs, 117 passés, 5 ignorés** (2 specs ×
chromium/mobile).

- `app/e2e/critical-paths.spec.ts:32` exige un lien « Continuer avec Facebook ».
  Facebook a été retiré le 2026-10-13 (AGENTS.md §2.5) et la chaîne est
  **absente** de `app/src`.
- `app/e2e/voyage-workspace.spec.ts:120` exige
  `getByRole('checkbox', { name: 'Afficher la rubrique Notes' })`, alors que
  l'affordance est rendue en `role="switch"`
  (`app/src/modules/voyages/trip-detail-page.tsx:433`, cf.
  `trip-parametres.test.tsx:141`).
- **Preuve de préexistence :** aucun des deux specs ne touche
  `dashboard_widgets`, la contrainte `width` ni `modules/dashboard/types.ts` ;
  et « Continuer avec Facebook » n'existe plus dans les sources — l'échec est
  indépendant du plan 18-01.
- **Statut :** hors périmètre (SCOPE BOUNDARY : échec préexistant dans des
  fichiers non touchés). À reprendre dans une tâche rapide de remise à jour e2e.
- **Statut (2026-10-17) : CLOS par `412ce99` et `44575c3`** (plan 19-06) —
  `critical-paths.spec.ts:31-38` ne demande plus « Continuer avec Facebook » (les
  deux chemins de connexion sont comptés et nommés) et `voyage-workspace.spec.ts:118`
  lit `getByRole('switch', …)`. La chaîne e2e est verte sur l'arbre courant
  (`d36359c` : 123 passés / 5 ignorés) ; cette passe n'a **pas** relancé la suite :
  c'est la cause exacte des 4 échecs qui est démontrée corrigée, pas le résultat
  global qui a été re-mesuré ici.

## 3. Classe WR-02 hors périmètre : les autres corbeilles admin-seules (relevé pendant 18-03)

Le plan 18-03 ferme la classe pour les politiques que D-03 cite
(`tasks_delete_admin`, `routine_completions_delete_admin`, `routines_delete_admin`)
et pour les trois dossiers (`task_lists` / `note_folders` / `routine_folders`,
0051:82-87). `18-CONTEXT.md` demande par ailleurs de **recenser** tous les sites
de la classe (§E). Le relevé suit.

**Ce qui est prouvé** (lecture des migrations, pas d'inférence) : en état final,
ces politiques `*_delete_admin` existent littéralement et réservent la
suppression à `is_household_admin` —

`event_categories_delete_admin`, `events_delete_admin`,
`note_attachments_delete_admin`, `notes_delete_admin`,
`pet_attachments_delete_admin`, `places_delete_admin`,
`post_comments_delete_admin`, `post_reactions_delete_admin`, `posts_delete_admin`,
`products_delete_admin`, `provider_attachments_delete_admin`,
`shopping_lists_delete_admin`, `tasks_delete_admin`, `trips_delete_admin`.

S'y ajoutent les politiques **générées par boucle** (invisibles au `grep` car
composées par `format()`) : `0007:237-241` pour les tables « foyer plat »
(`shopping_lists`, `shopping_list_items`, `events`, `notes`, `tasks`, `routines`,
`routine_completions`, `recipes`, `external_participants`, `pets`, `pet_records`,
`provider_types`, `providers`, `loyalty_cards`, `birthdays`, `places`, `trips`,
`post_media`, `posts`, `post_comments`, `post_reactions`) et `0051:82-87` pour
les dossiers.

**Ce qui reste à vérifier** (relevé d'affordances, **pas** un verdict : la garde
de chaque appelant n'a pas été relue, et certaines tables ont leur propre
politique de suppression légitime pour un membre) — fichiers portant une
affordance `Supprimer …` dans un module dont la table de tête est admin-seule :

- `notes` → `app/src/modules/notes/notes-page.tsx` (`notes_delete_admin`)
- `events` → `app/src/modules/calendrier/components/agenda-list.tsx`
  (`events_delete_admin`)
- `posts` / `post_comments` → `app/src/modules/cercle/components/post-card.tsx`,
  `comments-dialog.tsx`
- `shopping_lists` → `app/src/modules/courses/components/shopping-group-card.tsx`
- `places` → `app/src/modules/voyages/components/trip-places-tab.tsx`
- les quatre volets de voyage → `trip-tasks-tab.tsx`, `trip-notes-tab.tsx`,
  `trip-courses-tab.tsx`
- `anniversaires`, `contacts`, `prestataires`, `animaux`, `ardoise`, `messages`,
  `parametres` : à trancher au cas par cas (`notification_reads_delete_own` et
  `messages_delete` sont explicitement des suppressions de ses propres lignes,
  donc hors classe).

**Statut :** **DÉCIDÉ le 2026-10-16 — ASSUMÉ, NON TRAITÉ.** Décision prise après
la phase 22 : on **ne** masque pas la suppression aux membres, et on **n'ouvre
pas** la RLS. La classe reste telle quelle — et elle est écrite ici pour ne pas
devenir une dette muette.

**Ce qui est assumé, précisément.** Un membre peut voir une affordance
« Supprimer… » sur un module dont la table de tête est admin-seule ; l'écriture
est refusée par la RLS (`*_delete_admin`), donc **rien n'est détruit** : le membre
reçoit un refus, jamais un effacement. Le contrôle de sécurité n'est pas en
cause — la RLS est la barrière, l'interface ne l'est pas (§2.6).

**Pourquoi ne pas l'avoir corrigé.** Les deux corrections possibles sont des
changements de portée, pas des correctifs d'exécution : aligner l'interface sur
la RLS demanderait un plan dédié (capacité `canDelete` distincte de `canWrite`,
alimentée par `useIsAdmin()`, patron WR-02 retenu par 18-03) ; ouvrir la RLS
serait une décision produit. Aucune des deux n'a été retenue.

**Ce qu'un futur lecteur doit savoir.** Si un rapport dit « le bouton Supprimer
ne fait rien » sur l'un de ces écrans, c'est **attendu** et le diagnostic est
ici — ce n'est pas une régression, et ce n'est pas un oubli. Rouvrir la question
demande un plan dédié, pas un correctif d'urgence.
- **Découvert pendant :** Task 3 — en cherchant si `use-notes.deleteFolder`
  était le dernier site de la classe (il l'était pour les dossiers, corrigé dans
  18-03 par `Rule 2`), le relevé des politiques a montré que la classe dépasse
  largement les trois modules traités.

## 4. La reprise d'amorçage rétablit la session mais pas le foyer (relevé pendant 18-04)

- **Fichiers :** `app/src/stores/session-store.ts:24-27` (`signIn`),
  `app/src/hooks/use-auth.ts` (`applySession`), le garde `RequireHousehold`
  (`app/src/app/router.tsx`).
- **Constat (mesuré, pas déduit) :** quand l'échec d'amorçage vient du
  **chargement du foyer** et non de `getSession`, la reprise de 18-04 rend
  `status = authenticated` et `error = null` **sans recharger le foyer** :
  `householdId` reste `null` et `data.list('household_members')` n'est **jamais**
  rappelé (0 appel mesuré). Cause : `store.signIn` pose `status =
  'authenticated'` **avant** `await loadHousehold()`, donc la seconde tentative
  entre dans la branche « session déjà établie » d'`applySession` (simple
  `refreshUser`) et sort sans relire le foyer.
- **Conséquence :** au lieu de la page d'erreur, l'utilisateur atterrit sur
  `/foyer` (« Vous n'avez pas encore de foyer ») alors que son foyer existe —
  message faux, et un second foyer peut être créé par erreur.
- **Mesure :** test jetable (harnais de `use-auth.test.ts`, `data.list` rejetant
  sur `household_members` au premier essai puis répondant), supprimé après
  mesure. `status = authenticated`, `householdId = null`, 0 appel à
  `household_members` après reprise.
- **Statut :** hors périmètre de 18-04 (D-05 demande un échec **visible et
  rejouable** ; il l'est — le rechargement du foyer à la reprise est une
  correction distincte, qui touche `signIn`/`applySession`). Correctif candidat :
  ne poser `status = 'authenticated'` qu'après le chargement du foyer, ou
  rejouer `loadHousehold()` quand l'utilisateur est authentifié mais sans foyer.
- **Statut (2026-10-17) : CLOS par `f79d553`** (plan 18-06) —
  `stores/session-store.ts:27` porte le témoin `householdLoaded` (faux dans
  `signIn` `:43`, vrai sur chaque chemin abouti de `loadHousehold` :
  `:69`/`:86`/`:107`) et `hooks/use-auth.ts:55` n'emprunte le raccourci de
  rafraîchissement que si `store.householdLoaded`. La reprise relit donc le foyer
  au lieu de sortir sans le charger.
- **Découvert pendant :** Task 2 — en cherchant quel état la reprise laissait
  derrière elle quand l'échec ne venait pas de `getSession`.

## 5. `placePhotoPathOf` ne normalise pas une valeur blanche (relevé pendant 18-05)

- **Fichiers :** `app/src/modules/adresses/api.ts` (`placePhotoPathOf`,
  appelée aussi par `deletePlacePhoto` et `resolvePlacePhotoUrl`).
- **Constat :** `placePhotoPathOf('  ')` rend `'  '` — `isPlacePhotoPath` ne
  juge que le préfixe (`!^(https?://|blob:|data:|/)`), donc une valeur
  exclusivement blanche passe pour un chemin bucket. La chaîne vide, elle, est
  déjà couverte (`if (!stored) return null`). Deux effets hors du plan :
  `deletePlacePhoto('  ')` tente `removeHouseholdFile('  ')`, et
  `resolvePlacePhotoUrl('  ')` tente `createSignedUrl('  ')` puis rend `null`
  en échec fermé (donc invisible à l'écran).
- **Ce qui a été fait :** la décision **de ce plan** normalise désormais sa
  valeur précédente (`shouldRemovePreviousPlacePhoto`), ce que le cas (d) de
  `api.test.ts` prouve ; les deux autres appelants restent inchangés.
- **Statut :** hors périmètre — `places.photo_url` ne peut recevoir une valeur
  blanche que d'une saisie héritée (`toPlacePayload` reçoit déjà la valeur
  rognée du dialogue, `nullable()`), et corriger les autres appelants
  étendrait la surface du correctif sans cas réel observé. Correctif candidat :
  rogner dans `placePhotoPathOf` elle-même, une fois décidé si les autres
  modules partageant ce motif (`prestataires`, `recettes`, `voyages`) doivent
  suivre.
- **Découvert pendant :** Task 2 — l'assertion « valeur précédente blanche »
  ajoutée au cas (d) a montré que la fonction de décision, elle, ne pouvait pas
  se contenter de `placePhotoPathOf` tel quel.
- **Mise à jour (phase 19, plan 19-01) :** le correctif candidat de ce constat
  est appliqué au helper **partagé** de la famille média —
  `lib/storage.ts:householdMediaPathOf` rogne la valeur avant de juger — et
  `resolveHouseholdMediaUrl('  ')` rend `null` sans tenter de signature (prouvé
  par `storage.test.ts`, cas « normalise une valeur blanche »). Ce qui reste
  ouvert ici : `placePhotoPathOf`, `deletePlacePhoto` et `resolvePlacePhotoUrl`
  d'`adresses/api.ts` gardent leur copie locale non rognée ; le plan 19-13 doit
  faire basculer cet appelant sur le helper partagé.
- **Statut (2026-10-17) : CLOS par `d36359c`** (plan 22-02) — **pas** par 19-13,
  contrairement à ce que cette entrée annonçait : `a0cce83` (19-13) n'avait
  basculé que `resolvePlacePhotoUrl`, en laissant `placePhotoPathOf` et
  `isPlacePhotoPath` en copie locale non rognée. `d36359c` fait déléguer
  `placePhotoPathOf` à `householdMediaPathOf` (`adresses/api.ts:89-91` →
  `lib/storage.ts:194-199`, blanc → `null`) et `resolvePlacePhotoUrl` à
  `resolveHouseholdMediaUrl` (`:119-124` → `:216`) ; `deletePlacePhoto`
  (`:147-150`) en hérite, donc plus de `removeHouseholdFile('  ')` ni de
  `createSignedUrl('  ')`.

## 6. L'en-tête de `STATE.md` porte encore un pointeur global périmé (relevé pendant 18-06)

- **Fichier :** `.planning/STATE.md`, frontmatter YAML (`progress`, `current_phase`,
  `current_phase_name`, `status`).
- **Constat (mesuré) :** le bloc `progress` annonce `total_phases: 3`,
  `completed_phases: 3`, `total_plans: 13`, `completed_plans: 13`, `percent: 100`,
  `current_phase: 4`, `current_phase_name: "cadeaux/contacts (phases/05 cadeaux
  contacts.md) : gift_ideas + invites code + contacts."` — alors que le projet
  exécute la **phase 18** (les plans 18-01…18-06 ont tous leur SUMMARY). Le corps
  narratif du fichier, lui, est à jour jusqu'à la phase 06. Seul `stopped_at`,
  `last_updated` et `state_head` sont suivis correctement par les verbes d'état.
- **Conséquence :** `state.advance-plan` a répondu « Current Plan: 3 » /
  « Total Plans in Phase: 3 » (contexte de la phase périmée) et n'a **rien écrit**
  (mtime inchangé). Un lecteur qui se fie au frontmatter croit que le projet est
  à la phase 4 ; un outil qui s'y fie calcule sur un mauvais contexte.
- **Preuve d'inertie de ce plan :** `state.record-metric` et
  `state.record-session` ont, eux, écrit correctement (`last_updated`,
  `state_head`, ligne « Phase 18 P06 » dans la table des métriques,
  `stopped_at: Completed 18-06-PLAN.md`) — la détection du plan, elle, passe par
  le nom de fichier du SUMMARY, pas par le pointeur.
- **Statut :** hors périmètre — reconstruire `progress`/`current_phase` est une
  décision de gestion de projet (quelle phase est « courante » : 18, ou la
  prochaine à planifier ?), pas un correctif d'exécution. À traiter par
  `/gsd-health` (réparation) ou à la main une fois la phase 18 clôturée.
- **Statut (2026-10-17) : PARTIELLEMENT PÉRIMÉ, le reste OUVERT.** Relu sur
  l'arbre courant, ce constat se décompose :
  - **Les compteurs du bloc `progress` restent faux** (`STATE.md:8-12` :
    `total_phases: 8`, `completed_phases: 3`, `total_plans: 46`,
    `completed_plans: 46`, `percent: 38` — incohérents entre eux et avec les
    phases closes du ROADMAP), et `status: unknown` (`:3`) n'est pas un statut.
    L'avertissement `:17-21` les déclare vestige et renvoie au ROADMAP : c'est un
    pansement assumé, pas une réparation. Le corps narratif, lui, s'arrête à la
    phase 2 (`:25`).
  - **Mais `current_phase: 8` n'est PAS un pointeur faux**, contrairement à ce que
    ce constat laissait entendre : `stopped_at: "Phase 23 complete, ready to plan
    Phase 8"` (`:4`) et `query phase.complete 23` → `next_phase: 8` désignent la
    même phase — la première case non cochée du ROADMAP. Depuis que ces verbes
    écrivent `stopped_at`, un lecteur du frontmatter ne se trompe plus de phase.
  - **Résidu introduit le 2026-10-17 :** `state_head` (`:6`) pointait
    `e2f76ed9…`, devenu **injoignable** après la réaccentuation des messages de la
    phase 23 (`code content` inchangé, SHA nouveaux). Corrigé vers `23c4fb9f…`
    dans le même mouvement.

## 7. Script de mesure Playwright non suivi à la racine de `app/` (relevé pendant 18-06)

- **Fichier :** `app/shot-toggle-on.mjs` (39 lignes, non suivi par git).
- **Constat :** script jetable de mesure de mise en page (`chromium.launch()` sur
  `http://127.0.0.1:4173`, navigation vers `/recettes/recipe-1`, relevé de
  `boundingBox` du bouton « Mode cuisine »). Antérieur à ce plan (présent dans
  `git status` dès son ouverture) ; il n'appartient ni à 18-06 ni à ses deux
  tâches.
- **Conséquence :** aucune — le fichier n'est pas suivi, donc il ne peut pas être
  livré. Mais il salit `git status` et peut être pris pour un test par un lecteur
  qui liste `app/`.
- **Statut :** hors périmètre (SCOPE BOUNDARY : artefact non suivi, non produit
  par la tâche courante). À supprimer ou à déplacer dans un répertoire ignoré lors
  du prochain passage de nettoyage.
- **Statut (2026-10-17) : CLOS par `7437f51`** (plan 20-02) — `.gitignore:71`
  ignore nommément `app/shot-toggle-on.mjs` (vérifié par `git check-ignore -v`) et
  `git status --porcelain --untracked-files=all` est vide. Le fichier est conservé
  à dessein (39 lignes, travail de l'auteur), hors du champ d'un `git add -A`.

## Clôture des escalades §1 et §4 (plan 18-06)

Les deux escalades qui motivaient ce registre sont **fermées** par le plan 18-06,
et par lui seul :

- **§1 (`setWidgetOrder` insère une seconde série de widgets)** → fermé par
  `68b5427` : `DataAdapter.upsert(table, values, { onConflict })`, deux
  implémentations, et un `setWidgetOrder` qui n'émet plus qu'une écriture
  fusionnée par préférence. Le `23505` avalé et la seconde série de lignes ne
  peuvent plus se produire.
- **§4 (la reprise d'amorçage rétablit la session mais pas le foyer)** → fermé par
  `f79d553` : témoin explicite `SessionState.householdLoaded`, distinct du statut,
  et `applySession` qui ne sort par le raccourci de rafraîchissement que si le
  foyer est déjà chargé.

Les entrées §2 (specs e2e périmés), §3 (corbeilles admin-seules hors périmètre de
18-03), §5 (`placePhotoPathOf` et les valeurs blanches), §6 et §7 restaient
**ouvertes** à la clôture de 18-06 : elles étaient hors du périmètre de ce plan.

**Passe de vérité du 2026-10-17** — chaque statut rouvert dans le code, jamais
recopié : §2 est fermé par `412ce99`/`44575c3` (19-06), §5 par `d36359c` (22-02 —
**pas** par 19-13, qui l'annonçait à tort), §7 par `7437f51` (20-02). §6 reste
**ouvert pour ses compteurs `progress` et son corps narratif** — mais son
`current_phase: 8` s'est révélé *juste* (c'est la première case non cochée du
ROADMAP, la phase que `phase.complete 23` et `stopped_at` désignent tous deux) :
le constat d'origine est donc à lire en deux parties, comme le détaille §6. §3
reste **assumé, non traité** (décision du 2026-10-16). §1 et §4 sont fermés par
`68b5427` et `f79d553`, comme la clôture de 18-06 l'annonçait.
