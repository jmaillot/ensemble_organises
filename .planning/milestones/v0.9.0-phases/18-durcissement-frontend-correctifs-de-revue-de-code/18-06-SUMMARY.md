---
phase: 18-durcissement-frontend-correctifs-de-revue-de-code
plan: "06"
subsystem: frontend-data-auth
tags: [cr-01, wr-04, escalade-1, escalade-2, upsert, on-conflict, dashboard-widgets, session-store, amorcage-auth, vitest, dexie]
status: complete

requires:
  - phase: 18-durcissement-frontend-correctifs-de-revue-de-code
    provides: "18-01 (c2e655e, 34cd0de), 18-02 (6727e73, 5de0b17, 556a212), 18-03 (e7c5aea, 9d093e4, 80a4351), 18-04 (79c3e69, a184489), 18-05 (27b583d, 5241226, 9e6b9c4, f1b0026) : plans précédents de la phase"
provides:
  - "`DataAdapter.upsert(table, values, { onConflict })` : pendant de `create` quand l'unicité ne vient pas de la clé primaire — la cible de conflit reste un paramètre explicite, jamais déduite du payload (T-18-15)"
  - "`SupabaseAdapter.upsert` : `upsert(values, { onConflict }).select('*').single()`, aucun `id` injecté ; `LocalAdapter.upsert` : retrouve la ligne par les colonnes d'`onConflict` et la fusionne en conservant son `id` — symétrie du mode démo"
  - "`setWidgetOrder` : une seule écriture fusionnée par préférence, sans `id` ; plus de décision `update`/`create` prise d'après `widgets.rows`"
  - "`SessionState.householdLoaded` : témoin explicite « le foyer a été chargé », posé dès que la lecture aboutit (foyer trouvé, aucun foyer, ou foyers introuvables), remis à `false` au démarrage de session et à la déconnexion"
  - "`applySession` n'emprunte le raccourci de rafraîchissement que si `householdLoaded === true` : la reprise après un échec de `loadHousehold` repasse par le chemin complet"
affects: [dashboard-widgets, set-widget-order, session-store, amorcage-auth, use-auth, contrat-donnees, escalade-verification-phase-18]

actuals:
  tokens: 8150
  tasks: 2
  commits: 2
plan_head_before: f1b002682bb560d2046b7c6802002ed6a2359f25
plan_head_after: f79d553fe8f5887f25ab46ee9f10d6922f76ab35

tech-stack:
  added: []
  patterns:
    - "Écriture idempotente déléguée au serveur (`on conflict … do update`) plutôt qu'une lecture-puis-écriture, qui laisse une fenêtre où l'état lu n'est pas l'état de la base"
    - "La cible d'unicité est un paramètre explicite de l'appelant (`onConflict`), jamais déduite du payload — et jamais un `id` fourni, qui ferait échouer la fusion sur la clé primaire au lieu de la cible déclarée"
    - "Symétrie stricte des deux adaptateurs : sans contrainte unique en Dexie, un `upsert` local non fusionnant laisserait le doublon invisible en CI"
    - "Un témoin d'état explicite (`householdLoaded`) plutôt qu'un proxy (`status`) : un statut mis à `authenticated` avant la fin du chargement ne dit rien de l'issue de ce chargement"
    - "« Aucun résultat » est un résultat connu : la lecture aboutie marque le témoin, y compris quand elle ne trouve aucun foyer — sinon la reprise rejouerait indéfiniment"

key-files:
  created:
    - app/src/lib/data/upsert-contract.test.ts
  modified:
    - app/src/lib/data/adapter.ts
    - app/src/lib/data/supabase-adapter.ts
    - app/src/lib/data/local-adapter.ts
    - app/src/modules/dashboard/hooks/use-dashboard.ts
    - app/src/modules/dashboard/dashboard-page.test.tsx
    - app/src/stores/session-store.ts
    - app/src/hooks/use-auth.ts
    - app/src/hooks/use-auth.test.ts

decisions:
  - "CR-01 (escalade 1) : un `upsert` sur cible de conflit déclarée remplace la décision `update`/`create` prise d'après `widgets.rows` — la lecture vide au premier rendu faisait passer toutes les préférences par `create`, heurtant `dashboard_widgets_member_type_key` en ligne (23505 avalé) et dédoublant en démo"
  - "CR-01 : aucun `id` n'est injecté par `upsert` — `dashboard_widgets.id` a un défaut (`private.new_id('widget')`, 0004) et un `id` étranger ferait échouer la fusion sur la clé primaire au lieu de la cible déclarée"
  - "CR-01 : l'adaptateur local fusionne lui aussi sur `onConflict` (en conservant l'`id` de la ligne retrouvée) — sans cette symétrie, Dexie laisserait coexister deux lignes et le défaut resterait invisible en CI"
  - "WR-04 (escalade 2) : le témoin « foyer chargé » devient `householdLoaded`, distinct du statut — `signIn` pose `authenticated` avant d'attendre `loadHousehold`, donc le statut ne pouvait pas servir de proxy"
  - "WR-04 : `householdLoaded` passe à `true` même quand la lecture ne trouve aucun foyer (résultat connu, non un échec) — sinon la reprise rejouerait la lecture sans fin ; il est remis à `false` à `signIn` et à la déconnexion"
  - "WR-04 : la correction n'est PAS un retour de `status` à `initialising` avant la reprise (option écartée) — cela détruirait l'état « connecté » pendant la tentative et ferait clignoter la garde de route vers `/connexion`"

metrics:
  duration: "~70 min (exécution 16:35→16:45 ; vérification et preuves rouges par la reprise 17:37→17:45)"
  completed: 2026-10-15
---

# Phase 18 Plan 06: Un vrai `upsert` pour les préférences, et un témoin explicite pour le foyer — Summary

`DataAdapter.upsert` sur cible de conflit déclarée — le masquage d'un widget aboutit réellement en ligne au lieu d'un `23505` avalé — et un témoin `householdLoaded` distinct du statut, pour qu'une reprise d'amorçage recharge le foyer au lieu de retomber sur « Vous n'avez pas encore de foyer ».

## Objectif

Ce plan est un plan de **clôture d'escalades**. Il ferme les deux défauts que la vérification de
phase 18 avait relevés hors périmètre dans `deferred-items.md` §1 et §4, tous deux atteignant la
conséquence visible d'une promesse de la phase :

1. **Escalade 1 (chemin CR-01)** — `setWidgetOrder` décidait `update` ou `create` d'après
   `widgets.rows`. Quand la lecture n'a pas abouti, `rows` vaut `[]` et **toutes** les préférences
   passaient par `create` : en mode Supabase, l'insertion heurtait
   `dashboard_widgets_member_type_key unique (member_id, widget_type)` (0004) → `23505` →
   `Promise.all` rejette → rejet jeté via `void` par l'appelant (`dashboard-page.tsx`). Masquer un
   widget échouait donc **encore en silence**, exactement la classe de défaut que CR-01 devait
   fermer. L'`id` déterministe ne protégeait de rien : côté PostgREST il crée une seconde ligne ou
   une collision de clé primaire, et le commentaire qui l'affirmait était faux.
2. **Escalade 2 (chemin WR-04)** — `signIn` passait le statut à `authenticated` **avant**
   d'attendre `loadHousehold`. Quand l'échec d'amorçage venait du foyer, la reprise appelait
   `applySession`, qui sortait par la branche « session déjà établie » : le foyer n'était **jamais**
   relu (0 appel mesuré à `household_members`), et l'utilisateur atterrissait sur `/foyer`
   (« Vous n'avez pas encore de foyer ») alors que son foyer existait — message faux, et un second
   foyer pouvait être créé par erreur.

## Tâches

| # | Tâche | Type | Commit | Fichiers |
|---|-------|------|--------|----------|
| 1 | Un vrai `upsert` pour les préférences d'accueil (escalade 1) | auto | `68b5427` | `adapter.ts`, `supabase-adapter.ts`, `local-adapter.ts`, `upsert-contract.test.ts` (créé), `use-dashboard.ts`, `dashboard-page.test.tsx` |
| 2 | La reprise d'amorçage recharge le foyer quand il n'a jamais abouti (escalade 2) | auto | `f79d553` | `session-store.ts`, `use-auth.ts`, `use-auth.test.ts` |

**Tâche 1 — `upsert` sur cible de conflit déclarée.** Le défaut venait de décider `create` ou
`update` d'après une lecture qui peut être vide sans que la base le soit. La décision est supprimée :
`DataAdapter.upsert(table, values, { onConflict })` délègue la fusion au serveur
(`on conflict … do update`). Côté Supabase, `upsert(values, { onConflict }).select('*').single()`,
erreur remontée en `DataError`, **aucun `id` injecté** ; côté local, la ligne est retrouvée par les
colonnes d'`onConflict` (même mécanisme que `list`) et fusionnée en conservant son `id`, sinon créée.
`setWidgetOrder` n'émet plus qu'une écriture par préférence, avec
`onConflict: 'member_id,widget_type'`, et le commentaire faux sur l'identifiant déterministe a
disparu (`grep` : plus aucune occurrence de « déterministe », `widget-${`, `data.create` ou
`data.update` sur `dashboard_widgets`).

**Tâche 2 — témoin `householdLoaded`.** `SessionState` porte `householdLoaded: boolean` (initial
`false`), posé à `true` par un helper unique `markHouseholdLoaded()` appelé sur **les trois** issues
abouties de `loadHousehold` (foyer trouvé, aucun foyer, foyers introuvables), et remis à `false` par
`signIn` et `signOut`. `applySession` n'emprunte la branche de rafraîchissement que si
`store.status === 'authenticated' && store.householdLoaded && store.user?.id === sessionUser.id` ;
sinon elle reprend le chemin complet (profil + `loadHousehold`). L'intention du commentaire
d'origine est préservée : un `TOKEN_REFRESHED` sur un foyer déjà chargé ne relit rien.
Le mode démo pose `householdLoaded: true` dans `signInDemo`, et la branche de restauration
persistée le marque explicitement (`use-auth.ts:142`).

## Preuves rouges (exigées par le plan et par AGENTS.md §2.7.B / §2.7.D)

Chaque correctif a été mutilé, l'échec constaté, puis la mutation retirée. À l'issue des trois
expériences, `git diff` par rapport à `HEAD` est **vide** : l'état restauré est byte-identique à
l'état commité.

### Preuve rouge 1a — `onConflict` retiré de l'adaptateur Supabase

- **Mutation :** dans `supabase-adapter.ts`, `.upsert(values as never, { onConflict: options.onConflict })`
  → `.upsert(values as never)`.
- **Commande :** `npx vitest run src/lib/data/upsert-contract.test.ts`
- **Résultat :** `Tests 2 failed | 3 passed (5)` —
  `fusionne sur la cible déclarée, sans jamais émettre un insert ni injecter d'id` rougit
  (`TypeError: Cannot read properties of undefined (reading 'onConflict')`, l'adaptateur n'énonce plus
  sa cible) et `rend la ligne écrite et remonte l'erreur du client avec sa cause` rougit
  (promesse rejetée au lieu de résolue).
- **Signification :** le contrat ne peut plus être satisfait sans que l'adaptateur déclare sa cible de
  conflit — c'est bien la propriété que la correction apporte.
- **État restauré :** mutation retirée ; test de contrat de nouveau vert.

### Preuve rouge 1b — l'adaptateur local retombe sur `create` (plus profonde, comportementale)

- **Mutation :** dans `local-adapter.ts`, insertion d'un `if (true) return this.create<T>(table, values);`
  juste après la garde « ligne absente » — l'`upsert` local ne fusionne plus jamais, reproduisant
  exactement le comportement de l'ancien `setWidgetOrder` (une écriture créatrice par préférence,
  donc une seconde ligne pour un couple déjà existant).
- **Commande :** `npx vitest run src/lib/data/upsert-contract.test.ts src/modules/dashboard/dashboard-page.test.tsx`
- **Résultat :** `Tests 3 failed | 12 passed (15)` —
  `deux écritures successives laissent une seule ligne par (member_id, widget_type)`,
  `fusionne sur la ligne semée du membre, sans ajouter de doublon`, **et**
  `enregistre les préférences sur une lecture vide, sans doubler les lignes (escalade 1)`
  (le test d'accueil exigé par le plan, dans l'état exact où le défaut se produisait) rougissent tous
  les trois.
- **Signification :** la preuve n'est pas seulement contractuelle — le test qui reproduit le scénario
  réel d'échec (lecture vide, deux enregistrements) détecte bien le retour du défaut. C'est ce test
  qui aurait dû attraper l'escalade.
- **État restauré :** mutation retirée ; les deux fichiers de test sont verts.

### Preuve rouge 2 — condition `householdLoaded` retirée d'`applySession`

- **Mutation :** dans `use-auth.ts:55`, `store.status === 'authenticated' && store.householdLoaded && store.user?.id === sessionUser.id`
  → `store.status === 'authenticated' && store.user?.id === sessionUser.id` (retour à la condition
  fautive d'avant ce plan).
- **Commande :** `npx vitest run src/hooks/use-auth.test.ts src/stores`
- **Résultat :** `Tests 1 failed | 24 passed (25)` — **exactement** un échec :
  `recharge le foyer à la reprise quand sa première lecture a échoué` (cas (a) exigé par le plan).
  Les cas (b) `ne relit pas le foyer sur TOKEN_REFRESHED quand il est déjà chargé` et (c)
  `marque le foyer chargé même sans foyer trouvé, et ne relit pas à la reprise` restent **verts**.
- **Signification :** la preuve est double. Le test (a) détecte bien le défaut visé ; et l'unicité de
  l'échec confirme que (b) et (c) gardent une propriété *différente* (la non-régression du
  renouvellement de jeton), donc qu'ils ne sont pas des doublons du même contrôle — critère
  AGENTS.md §2.7.D « un contrôle se prouve sur un cas qui doit échouer ».
- **État restauré :** mutation retirée ; `npm test -- src/hooks/use-auth src/stores` de nouveau vert
  (25 tests).

## Vérification

| Contrôle | Commande | Résultat |
|----------|----------|----------|
| Typecheck | `cd app && npm run typecheck` | ✅ vert (`tsc --noEmit`, aucune sortie) |
| Suite complète | `cd app && npm test` | ✅ **122 fichiers / 992 tests** (avant ce plan : 121 / 983 → **+1 fichier, +9 tests**) |
| Build | `cd app && npm run build` | ✅ vert (PWA `injectManifest`, 103 entrées précachées) |
| Contrôle SQL statique | `python3 scripts/check-sql-statique.py` | ✅ `180 fonction(s) effective(s) sur 123 migration(s) et 62 test(s), aucun défaut` — **aucune migration dans ce plan**, donc inchangé |
| Tâche 1 | `npm test -- src/lib/data src/modules/dashboard` | ✅ 8 fichiers / 60 tests |
| Tâche 2 | `npm test -- src/hooks/use-auth src/stores` | ✅ 2 fichiers / 25 tests |
| e2e | `npm run test:e2e` | ✅ **117 passés, 4 échoués (connus, préexistants), 5 ignorés** — 2,3 min |

### e2e

`npm run test:e2e` lancé après restauration des mutations : **117 passés / 4 échoués / 5 ignorés**,
soit exactement la mesure de référence documentée dans `deferred-items.md` §2 (4 échecs, 117 passés,
5 ignorés — 2 specs × chromium/mobile). **Aucun échec supplémentaire, donc aucune régression e2e.**

Les 4 échecs sont les deux specs périmés admis et **non corrigés ici** (hors périmètre,
`deferred-items.md` §2) :

- `critical-paths.spec.ts:28` (chromium + mobile) — exige un lien « Continuer avec Facebook »,
  retiré le 2026-10-13 (AGENTS.md §2.5) ; la chaîne est absente de `app/src`.
- `voyage-workspace.spec.ts:110` (chromium + mobile) — exige
  `getByRole('checkbox', { name: 'Afficher la rubrique Notes' })` là où l'affordance est rendue en
  `role="switch"`.

Ni l'un ni l'autre ne touche `dashboard_widgets`, `use-dashboard`, `local-adapter`,
`session-store` ou `use-auth` — les fichiers de ce plan.

## Deviations from Plan

**Aucune déviation de code.** Le plan a été exécuté tel qu'écrit. Les trois mutations des preuves
rouges sont des expériences temporaires, retirées avant la fin — `git diff` vide par rapport à `HEAD`
le confirme.

Deux points à consigner, sans effet sur le code :

### 1. [Constat de continuation] Les deux commits de tâche préexistaient, le SUMMARY manquait

Les commits `68b5427` et `f79d553` avaient été créés par une exécution antérieure qui n'a pas produit
`18-06-SUMMARY.md` ni mis à jour `STATE.md` / `ROADMAP.md` (STATE indiquait encore « Completed
18-05-PLAN.md », et la table des métriques s'arrêtait à P05). Cette reprise **n'a donc pas rejoué les
tâches** : elle a relu l'implémentation contre le plan, rejoué les deux `<verify>`, exécuté les trois
preuves rouges exigées, puis écrit ce SUMMARY et rattrapé l'état. Le périmètre de code livré est
celui des deux commits existants.

### 2. [Constat, non corrigé] Le message de commit de la tâche 2 porte « escalade CR-04 »

`f79d553` s'intitule `fix(auth): charger le foyer sur un témoin explicite, non le statut (escalade
CR-04)` alors que l'escalade visée est celle du **chemin WR-04** (`deferred-items.md` §4, plan 18-04).
`CR-04` n'existe pas dans `18-REVIEW.md` (un seul critical : CR-01). C'est une coquille dans un
message de commit déjà poussé : elle n'est pas amendée (AGENTS.md §2.7.G — un message fautif poussé
puis amendé impose un `--force-with-lease`), et elle est consignée ici pour que la trace reste
lisible.

## Authentification

Aucune porte d'authentification rencontrée.

## Known Stubs

Aucun. Les fichiers modifiés ne portent ni valeur vide codée en dur, ni texte de remplissage, ni
`TODO` / `FIXME`, ni composant sans source de données (vérifié : les seuls littéraux `[]` présents
sont ceux de la lecture simulée du test — une entrée de test, pas un état rendu).

## Threat Flags

Aucun. Aucune surface nouvelle : `upsert` ne fait qu'ajouter une méthode au contrat existant, sur la
table `dashboard_widgets` déjà couverte par la RLS, et `householdLoaded` est un champ de store client.
Le registre du plan (T-18-15 à T-18-17, T-18-SC) est couvert : la cible de conflit reste un paramètre
explicite et littéral (`'member_id,widget_type'`), la cible est bien la contrainte réelle de `0004`,
aucune politique RLS n'est touchée, un `upsert` refusé remonte en `DataError` au lieu d'être avalé, et
un `TOKEN_REFRESHED` sur foyer chargé conserve la sortie par rafraîchissement (prouvé par le test (b)).

## Self-Check: PASSED

Commandes du self-check : les deux artefacts sont présents, les deux commits sont dans
l'historique, et `git diff` vs `HEAD` est vide (aucun résidu des trois mutations).

- [x] `app/src/lib/data/upsert-contract.test.ts` créé et présent
- [x] `68b5427` (tâche 1) et `f79d553` (tâche 2) présents dans l'historique
- [x] `git diff f1b0026..HEAD` = 9 fichiers, +465/−28 (mesuré)
- [x] suite complète verte après restauration des trois mutations
- [x] `git diff` vs `HEAD` vide après les preuves rouges
