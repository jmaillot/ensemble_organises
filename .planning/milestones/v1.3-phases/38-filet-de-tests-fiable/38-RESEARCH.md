# Phase 38: Filet de tests fiable - Research

**Researched:** 2026-11-08
**Domain:** Déterminisme des semis de tests (dates), flake timing IndexedDB/persist, dette review 37 (code mort + requête service_role non bornée)
**Confidence:** HIGH (tout le périmètre est local au dépôt, piné par lecture de fichiers ce jour)

<user_constraints>
## User Constraints (from CONTEXT.md 38)

### Locked Decisions
- **S-01 — Toute la classe, pas seulement les 2 flakes.** Les semis menu-page et household-store WR-03 ET le semis démo `app/src/lib/data/seed.ts` (même pattern `day(offset)` relatif, l.98/l.161) sont recalibrés sur les helpers lundi-based — plus aucun `day()`/`new Date()` ad hoc dans les semis. `seed.test.ts` maintenu vert. (§2.7 E.)
- **S-02 — Preuve « quel que soit le jour » par 7 dates simulées.** Tests paramétriques injectant la date en entrée du helper (une exécution par jour de semaine) — jamais d'horloge figée.
- **S-03 — Helpers de production dans `lib/datetime.ts` existant**, exportés — `debutSemaineIso`/`jourSemaine` deviennent l'utilitaire de référence. Pas de module de test dédié.
- **J-01 — Exclusion explicite.** SC2 s'applique aux flakes corrigés en 38 ; la spec join-token reste le SEUL rouge connu, soldé en 39.
- **J-02 — La spec join-token continue de tourner dans le run e2e standard** avec son rouge documenté — pas de `test.skip`, pas de grepExclude, pas de renommage.
- **W-01 — Cause vérifiée avant fix ; corrigée dans la phase quelle que soit sa nature.** Si WR-03 n'est pas date-dépendante (timing, async, cache…), corrigée quand même dans 38.
- **W-02 — Protocole écrit type D-01 (37)** : reproduction avant fix (exécutions répétées, date forcée + charge), preuve d'innocence du code de production (même protocole sur l'arbre de base), correction test-only, diagnostic consigné dans `docs/RETROSPECTIVE.md`.
- **I-01 — Classe entière dans la fonction.** Borner `index.ts:656` ET balayer les autres selects `service_role` de la même fonction.
- **I-02 — Forme du bornage : LIMIT explicite + ordre déterministe (ORDER BY).** Le plan documente le besoin du consommateur avant de choisir la borne.
- **I-03 — `sh scripts/test-db.sh` obligatoire si du SQL est touché** (Docker dispo) ; sinon chaîne §2.7 standard.

### the agent's Discretion
- La cause exacte de WR-03 et la technique de correction.
- La liste exhaustive des semis couverts par S-01 (inventaire `day()`/`new Date()`).
- L'ordre des corrections (flakes vs IN — indépendantes).

### Deferred Ideas (OUT OF SCOPE)
- Spec join-token réécrite (TEST-02, phase 39) — elle reste rouge.
- Outillage prod du smoke-test (SMOKE-01, phase 39).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEST-01 | Les 2 flakes dimanche corrigés à la racine — semis lundi-based via `debutSemaineIso`/`jourSemaine` dans `lib/datetime.ts`, tests paramétriques 7 jours, jamais d'horloge figée ; aucun `new Date()` résiduel dans les semis | Mode d'échec du dimanche prouvé ci-dessous (seed.ts:70/161 + menu-page.tsx:53 + use-menu.ts:73) ; WR-03 diagnostiquée comme timing (pas date) ; helpers dessinés contre les conventions de `datetime.ts` |
| TEST-03 | La chaîne e2e est 100 % verte — plus aucun rouge préexistant assumé (sauf join-token, J-01/J-02) | Structure du run e2e confirmée : `critical-paths.spec.ts:134` est LE rouge join-token ; `menu.spec.ts` est le second flake, couvert par TEST-01 |
| DEBT-01 | IN-01 supprimée (pas commentée) ; IN-02 borné (LIMIT + ORDER BY, I-02) ; `test-db.sh` si SQL touché (I-03) | IN-01 = ardoise/api.ts:315, garde morte prouvée ; IN-02 = ardoise-invite/index.ts:655-656, deux lectures non bornées (`household_members` ET `expense_participants`) — schéma vérifié : `expense_participants` n'a PAS de `household_id`, le bornage passe par `expense_id` |
</phase_requirements>

## Summary

Les deux flakes du dimanche ont des causes **différentes** et les deux sont prouvées ce jour. Le flake menu est **date-dépendant** : le semis place les repas à `day(0)`/`day(1)`/`day(2)` (relatifs à aujourd'hui) tandis que la page n'affiche que la semaine lundi→dimanche courante — le dimanche, 2 repas sur 3 tombent dans la semaine suivante et « Restes du frigo » disparaît. Le flake WR-03 est **timing, pas date** : le test attend un `setTimeout` fixe de 1 200 ms contre un throttle de persistance par défaut de **1 000 ms** (marge de 200 ms sous charge) sur un IndexedDB factice partagé — W-01 est levé : la correction sera timing (attendre un état, pas dormir), dans la phase 38.

La dette review 37 est précisément localisée. IN-01 : `app/src/modules/ardoise/api.ts:315`, le ternaire `typeof response.status === 'number'` est toujours vrai (`Response.status` est typé `number`). IN-02 : `supabase/functions/ardoise-invite/index.ts` — la lecture `household_members` (l.655) **et** celle de `expense_participants` (l.654, revue : « tout comme ligne 658 ») sont des lectures de table entière par requête publique ; le schéma SQL prouve que `expense_participants` n'a pas de `household_id`, donc son bornage passe par les `expense_id` de l'ardoise (réordonnancement de la lecture) — changement TypeScript uniquement, `test-db.sh` non requis (I-03).

**Primary recommendation:** Deux chantiers indépendants : (1) ajouter `debutSemaineIso`/`jourSemaine` (arithmétique UTC pure, style `weekStartOf` existant) à `lib/datetime.ts` + tests paramétriques 7 jours, puis convertir les semis de semaine (meals) et recalibrer la classe ; (2) corriger WR-03 par attente d'état au lieu de sommeil fixe. IN-01 et IN-02 sont des micro-correctifs de production à traiter séparément (pas des semis).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Helpers de semaine lundi-based | Frontend (`lib/datetime.ts`) | — | Dates pures ISO côté client, déjà le module de référence date |
| Semis démo menu (meal entries) | Frontend (`lib/data/seed.ts`) | — | Mode démo IndexedDB local, aucun backend |
| Persistance post-switch (WR-03) | Frontend (test seulement) | — | W-02 : correction test-only, le code de production est prouvé innocent (ou corrigé si le diagnostic le désigne) |
| Garde morte IN-01 | Frontend (`modules/ardoise/api.ts`) | — | Code client appelant l'Edge `ardoise-invite` |
| Bornage service_role IN-02 | Edge Function (`ardoise-invite/index.ts`) | — | Lecture `admin` (clé secrète) côté serveur ; RLS court-circuitée d'où le bornage explicite |
| Validation 7 jours | Tests (vitest paramétrique) | — | S-02 : la date est une entrée, jamais une horloge figée |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | 5.0.2 [VERIFIED: app/package.json:89] | Tests unitaires + `it.each` paramétrique (S-02) | Configuré (`vite.config.ts:102-108`, jsdom + `src/test/setup.ts` avec `fake-indexeddb/auto`) |
| @playwright/test | 1.63.0 [VERIFIED: app/package.json:70] | e2e, `timezoneId: 'Europe/Paris'` figé | Config existante, aucun changement requis |
| date-fns | 4.4.0 [VERIFIED: app/package.json:52] | Déjà importé par `datetime.ts` (`format`) | Stack AGENTS §2.1 |
| @date-fns/tz | 1.5.0 [VERIFIED: app/package.json:19] | Disponible mais **non requis** ici : arithmétique de dates ISO pures en UTC, comme `menu/types.ts:59-72` | Stack AGENTS §2.1 |

**Aucune installation nouvelle.** La phase ne touche aucune dépendance — audit de légitimité non applicable (aucun paquet externe ajouté).

## Architecture Patterns

### Mode d'échec du flake menu (prouvé, file:line)

**Chaîne complète du défaut** [VERIFIED : lectures ce jour] :

1. `app/src/lib/data/seed.ts:70` — `const day = (offset: number) => addDays(todayIso(), offset);` — le semis est relatif à **aujourd'hui**, quel que soit le jour de semaine.
2. `app/src/lib/data/seed.ts:160-164` — `demoMealEntries` : `entry_date: day(0)` (meal-1, soir), `day(1)` (meal-2, « Restes du frigo »), `day(2)` (meal-3).
3. `app/src/modules/menu/menu-page.tsx:53` — `weekStart(() => weekStartOf(new Date().toISOString().slice(0, 10)))` : la page n'affiche que la semaine **lundi→dimanche courante**.
4. `app/src/modules/menu/hooks/use-menu.ts:73` — `if (weekStartOf(entry.date) !== weekStartIso) continue;` : les repas hors semaine sont filtrés.
5. **Dimanche** : `weekStartOf(dimanche)` = lundi de la semaine en cours ; `day(0)` = dimanche (visible), mais `day(1)` et `day(2)` = lundi/mardi **suivants** → meal-2 « Restes du frigo » est filtré → `menu-page.test.tsx:19` (`getByText('Restes du frigo')`) et `e2e/menu.spec.ts:22` échouent. 6 jours sur 7 : day(0..2) reste dans la semaine → vert.

`weekStartOf` lui-même est **correct** (lundi-based, UTC pur, `menu/types.ts:67-72`) — le défaut est le semis, pas la page. Conformément à S-01/S-03, la correction est dans les semis via des helpers de production.

### Pattern 1 : helpers `debutSemaineIso` / `jourSemaine` (S-03)

**What :** deux fonctions pures dans `app/src/lib/datetime.ts`, même style que `weekStartOf` de `menu/types.ts` (arithmétique UTC sur ISO, aucune dépendance au fuseau local).

```typescript
// Style à suivre — calqué sur menu/types.ts:59-72 (module : arithmétique UTC,
// ISO en entrée et en sortie, jamais de Date locale).
export function debutSemaineIso(isoDate: string): string;
// → lundi de la semaine contenant isoDate (implémentation équivalente à weekStartOf,
//   factorisée : weekStartOf de menu/types.ts peut déléguer à debutSemaineIso —
//   recommandé, §2.7 E : une seule source)
export function jourSemaine(debutSemaineIso: string, index: number): string;
// → 0 = lundi … 6 = dimanche de la semaine débutant à debutSemaineIso
```

**Recommandation de factorisation :** `menu/types.ts:67-72` exporte déjà `weekStartOf` identique en sémantique. Le plan devrait faire de `menu/types.ts` un **consommateur** de `debutSemaineIso` (ré-export ou délégation) plutôt que de dupliquer — sinon deux sources de vérité pour la même règle.

### Pattern 2 : test paramétrique 7 jours (S-02)

```typescript
// it.each — la date est une ENTRÉE, jamais une horloge figée (S-02).
it.each([
  ['lundi', '2026-11-02'], ['mardi', '2026-11-03'], ['mercredi', '2026-11-04'],
  ['jeudi', '2026-11-05'], ['vendredi', '2026-11-06'], ['samedi', '2026-11-07'],
  ['dimanche', '2026-11-08'], // dimanche = jour qui cassait avant le fix
])('%s : les repas semés de la semaine sont visibles', (_jour, isoDuJour) => {
  const debut = debutSemaineIso(isoDuJour);
  expect(jourSemaine(debut, 0)).toMatch(/-1[1-9]|-0[1-9]/); // ≤ mercredi de la semaine
  // + le test du semis : demoMealEntries ancrées sur la semaine courante
  //   couvrent jourSemaine(debut, 0..2) pour TOUT iso du jour injecté.
});
```

Note : les helpers prennent l'ISO en argument — le **semis** appelle `jourSemaine(debutSemaineIso(todayIso()), n)`. Le « foyer vivant » est conservé : les repas sont toujours dans la semaine courante, mais **ancrés lundi**, donc 1er/2e/3e jours de la grille affichée, visibles quel que soit le jour.

### Inventory du semis seed.ts (périmètre S-01 — agent's discretion, fourni ici)

Usages `day()` / `new Date()` dans `app/src/lib/data/seed.ts` [VERIFIED : lecture complète] :

| Lignes | Usage | Semantique | Recommandation |
|--------|-------|------------|----------------|
| 69 | `now()` | horodatage audit | Conserver (jamais dans le futur, garde `seed-instants.test.ts`) |
| 70 | `day(offset)` = `addDays(todayIso(), offset)` | relatif à aujourd'hui | Conserver comme primitif ; **les lignes à structure de semaine** passent par les helpers |
| 77, 1154, 1161, 1171, 1186, 1194 | `minutesAgo`, `new Date(Date.now() - …)` | instants révolus (messages/posts) | Conserver — instants, pas dates de grille |
| 98 | `at(time)` = `${day(0)}T…` | heure murale du jour (events) | Conserver (legitime, WR-07 documenté l.92-97) |
| 105-109 | `atInstant(time, offset)` | instant timestamptz | Conserver |
| 147-152 | pantry `expires_on: day(4)`, `day(-2)`… | péremption relative | Conserver — un yaourt périmé « dans 4 jours » n'a pas d'ancrage semaine |
| **160-164** | **meal entries `day(0..2)`** | **structure de semaine affichée par la page** | **Convertir : `jourSemaine(debutSemaineIso(day(0)), n)`** |
| 324, 339 | events `day(4)`, `day(2)` | événements à venir relatifs | Conserver (aucune vue semaine ne les filtre) |
| 442-483, 543-565, 652-691, 989-1022 | tasks, completions, expenses, pet records `day(n)` | relatifs | Conserver |
| 880, 923-926 | `new Date().getFullYear()`, année scolaire | fériés/vacances annuels | Conserver (déjà conçu pour rester vivant) |

**Point de vigilance (lecture stricte vs sémantique de S-01).** S-01 dit « plus aucun `day()`/`new Date()` ad hoc dans les semis », mais le CONTEXT (l.84) exige aussi de conserver la propriété « foyer recalé sur aujourd'hui ». Un yaourt périmé `day(4)` est légitimement relatif au jour. Recommandation pour le plan : la classe à corriger est **« données dont la visibilité dépend d'une grille semaine »** (meal entries — aujourd'hui, et tout futur consommateur de `weekStartOf`) ; les relatifs au jour sans grille semaine sont conservés et documentés comme tels. Les meals deviennent `jourSemaine(debutSemaineIso(todayIso()), 0|1|2)` — plus aucun `day(n)` nu dans les données à structure de semaine. `seed.test.ts` (DET-03, couvertures recettes) ne teste aucune date — rien à y casser ; `seed-instants.test.ts` garde la classe des `created_at` bornée.

### WR-03 : diagnostic (W-01) — cause TIMING, pas date

**Le test** `app/src/stores/household-store.test.ts:316-335` [VERIFIED] :

```typescript
client.setQueryData(['tasks', 'h-new', {}, null], [{ id: 't1', name: 'post-switch' }]);
await new Promise((resolve) => setTimeout(resolve, 1200));   // l.330 — sommeil fixe
await expect(get(cacheKey('u1', 'h-new'), probeStore)).resolves.toContain('post-switch');
```

**Éléments de preuve :**
- `switchWithPurge` appelle `connectOfflineCache(client, userId, householdId)` **sans options** (`household-store.ts:116`) → le throttle du persister prend son défaut `throttleTime = 1000` ms [VERIFIED: `src/lib/offline/query-persistence.ts:71`].
- Le test attend 1 200 ms : marge de **200 ms** sur un timer réel. Sous charge (worker vitest occupé, GC, machine lente), la traîne du throttle n'a pas encore écrit à 1 200 ms → `get(...)` résout `undefined` → rouge. Aucune date n'intervient dans ce test (ids fixes `h-old`/`h-new`/`u1`) — la dépendance au jour de la semaine est exclue par lecture du code.
- IndexedDB : `fake-indexeddb/auto` global (`src/test/setup.ts:2`) et `createStore('eo-offline-cache', 'query')` créé localement dans le test (l.320) — base **partagée** entre les tests du fichier et les autres fichiers du worker (`pool: 'forks'` réutilise le worker, cf. `datetime.test.ts:8-12`). Deuxième cause candidate : résidu de la base entre tests (la clé `cacheKey('u1','h-new')` pourrait être écrite par un test antérieur ou une écriture en traîne du test précédent).
- Le commentaire du test (l.328) énonce lui-même le contrat : « Le throttle par défaut du persister est 1 s : la fenêtre couvre son échéance » — une **course assumée**, exactement le motif §2.7 F.

**Technique de correction candidate** (discretion W-01, à trancher par le protocole W-02) : remplacer le sommeil fixe par une **attente d'état** (poll `get(cacheKey, probeStore)` jusqu'à contenu ou timeout — `vi.waitFor` / boucle avec `expect.poll`), et/ou isoler la base du test (nom de base unique par test, ou purge avant assertion). **Correction test-only** tant que le protocole prouve l'innocence du code de production : `switchWithPurge`/`connectOfflineCache` sont corrects (c'est le WR-03 originel de revue 33 qui fut corrigé par la ré-subscription, `household-store.ts:110-116`). Si le protocole désigne le code de production (ex. throttle non injectable), la correction portera alors sur l'injectabilité — à décider après reproduction.

### Protocole de reproduction (W-02, calqué sur D-01 de la phase 37)

1. **Menu (flake date)** : exécuter `npx vitest run src/modules/menu/menu-page.test.tsx` avec la date système forcée à un dimanche (ou preuve paramétrique : appeler la chaîne seed→`use-menu` avec les 7 ISO — le dimanche échoue sur l'arbre de base). Pour l'e2e : `TZ` ne suffit pas (Playwright fige déjà `Europe/Paris`) — reproduire en simulant le semis du jour courant par un test unitaire du semis, pas en attendant un dimanche. Le trick de phase 09 (`TZ=Pacific/Kiritimati`) reste disponible pour démontrer la sensibilité horaire si utile — mais la preuve finale est paramétrique (S-02).
2. **WR-03 (flake timing)** : `for i in $(seq 1 30); do npx vitest run src/stores/household-store.test.ts; done` avec charge CPU parallèle (ex. `stress-ng`/boucles `yes` si dispo, sinon exécutions en parallèle) — le rouge doit apparaître de façon intermittente sur l'arbre de base AVANT le fix (§2.7 B : vu rouge avant d'être vu vert). Consigner le taux de reproduction.
3. Preuve d'innocence production : même protocole après fix test-only → vert répété.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Attente d'une écriture async dans un test | `setTimeout` fixe + assertion unique | `vi.waitFor` / `expect.poll` (vitest 5) | Sommeil fixe = course assumée (motif §2.7 F déjà attrapé ici) |
| Arithmétique semaine lundi-based | Recoder un jour de semaine dans le semis | `debutSemaineIso`/`jourSemaine` (un seul module) | S-03 : une seule source ; `weekStartOf` existe déjà dans `menu/types.ts` |
| Réimplémenter la logique de semaine pour le menu | Dupliquer `weekStartOf` dans `datetime.ts` en parallèle | Déléguer/ré-exporter | Deux sources = divergence future garantie |
| Bornage SQL à la main dans le client | Filtrer les membres côté JS après lecture complète | `.eq('household_id', …)` / `.in('expense_id', …)` dans la requête | C'est l'objet même de IN-02 (minimisation §2.6) |

## Common Pitfalls

### Pitfall 1: « Corriger le semis » en figeant une horloge
**What goes wrong:** `vi.setSystemTime` ou mock de `Date` dans les tests rend les semis « verts » mais reste fragile et interdit par S-02.
**How to avoid:** la date est une entrée des helpers et du semis (paramètre), jamais une horloge figée.

### Pitfall 2: Recaler les meals sur le LUNDI RÉEL sans garder le foyer vivant
**What goes wrong:** ancrer les meals sur une date fixe (« lundi 2026-11-02 ») rend le semis mort dans deux semaines (la page semaine courante devient vide).
**How to avoid:** `jourSemaine(debutSemaineIso(todayIso()), n)` — ancre semaine **et** recalage quotidien, la propriété l.68 de seed.ts est conservée.

### Pitfall 3: Bornage IN-02 impossible via `household_id` sur `expense_participants`
**What goes wrong:** ajouter `.eq('household_id', …)` sur `expense_participants` échoue — la colonne n'existe pas.
**How to avoid:** le schéma (migrations/0004, l.32-47) n'a que `expense_id`. Deux formes valides (I-02) : (a) réordonner la lecture — `expenses` d'abord, puis `.in('expense_id', ids)` pour les participants ; (b) dénormaliser `household_id` (migration SQL — alors `test-db.sh` obligatoire, I-03). Recommandation : forme (a), TypeScript only, aucune migration. Documenter dans le plan le besoin du consommateur : la vue invité ne consomme que les participants des dépenses de CETTE ardoise — un bornage par `expense_id` est exactement le besoin, pas une limite arbitraire.
**Warning signs:** une erreur PostgREST `column expense_participants.household_id does not exist` à l'exécution de l'Edge.

### Pitfall 4: Supprimer la garde IN-1 et casser les tests d'erreur
**What goes wrong:** `guest-ardoise-page.test.tsx` teste les chemins d'erreur via `callArdoiseInvite` ; un mauvais refactor du throw peut changer le statut porté.
**How to avoid:** le fix est `throw new InviteRequestError(response.status, …)` (37-REVIEW-FIX.md l.48) — un seul argument change, aucun comportement nouveau. Relancer `npx vitest run src/modules/ardoise/guest-ardoise-page.test.tsx` (11 tests) après.

### Pitfall 5: IN-02 balayage incomplet de la fonction (I-01)
**What goes wrong:** borner `household_members` (l.655) et oublier `expense_participants` (l.654) — c'est pourtant la LIGNE LA PLUS GROSSE (table entière, sans filtre du tout).
**How to avoid:** la fonction `buildGuestView` contient 4 lectures dans un `Promise.all` (l.647-657) : `expenses` (bornée par `ardoise_id`, ordonnée), `expense_participants` (**non bornée**), `household_members` (**non bornée**), `ardoise_guests` (bornée). C'est l'inventaire complet de la fonction ; vérifier aussi les autres lectures `admin.` du fichier (elles sont toutes filtrées par id ou ticket selon la lecture du fichier — balayage à refaire au plan sur le fichier entier).

## Code Examples

### Forme attendue du bornage IN-02 (I-02 : ordre déterministe inclus)

```typescript
// buildGuestView — expenses déjà ordonnée (index.ts:652-653) : ORDER BY
// expense_date DESC, created_at DESC. La borne est le besoin réel du
// consommateur (participants des dépenses de CETTE ardoise), pas une limite
// arbitraire — I-02 satisfait sans pagination.
const { data: expenses } = await admin
  .from('expenses')
  .select('id,title,amount,expense_date,paid_by,paid_by_guest')
  .eq('ardoise_id', ardoiseId)
  .order('expense_date', { ascending: false })
  .order('created_at', { ascending: false });
const expenseIds = ((expenses ?? []) as { id: string }[]).map((e) => e.id);

const [{ data: parts }, { data: members }, { data: guests }] = await Promise.all([
  admin.from('expense_participants')
    .select('expense_id,participant_type,member_id,guest_id,share_amount')
    .in('expense_id', expenseIds),                    // bornage par besoin réel
  admin.from('household_members')
    .select('id,display_name,role')
    .eq('household_id', householdId)                  // householdId disponible l.645
    .order('id', { ascending: true }),                // ordre déterministe (I-02)
  admin.from('ardoise_guests').select('id,display_name').eq('ardoise_id', ardoiseId),
]);
```

### Suppression IN-01 (ardoise/api.ts:314-316 actuel)

```typescript
// AVANT (garde morte — Response.status est typé number, le ternaire est mort) :
throw new InviteRequestError(
  typeof response.status === 'number' ? response.status : 0,
  (detail as { error?: string | null }).error ?? 'Partage impossible.',
);
// APRÈS (37-REVIEW-FIX.md l.48) :
throw new InviteRequestError(response.status, (detail as { error?: string | null }).error ?? 'Partage impossible.');
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Semis relatif `day(0..2)` pour données à grille semaine | Semis ancré `jourSemaine(debutSemaineIso(today), n)` | Phase 38 (S-01) | Flake dimanche éradiqué pour la classe |
| Sommeil fixe 1200 ms contre throttle 1 s | Attente d'état (`vi.waitFor`/poll) | Phase 38 (W-01) | Flake timing éradiqué |
| Lecture service_role de table entière | `.eq`/`.in` borné au besoin du consommateur | Phase 38 (I-01/I-02) | Minimisation §2.6 sur l'endpoint public |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | La cause première de WR-03 est le sommeil fixe 1200 ms vs throttle 1000 ms (timing), et non une dépendance de date | WR-03 diagnostic | Si le protocole W-02 désigne une autre cause (résidu IndexedDB, ordre de tests), la correction change — W-01 couvre ce cas, la phase corrige quelle que soit la cause |
| A2 | Le balayage des autres lectures `admin.` du fichier `ardoise-invite/index.ts` (hors `buildGuestView`) ne révèle pas d'autre lecture non bornée | Pitfall 5 | Un select non borné résiduel échapperait au balayage I-01 — le plan doit refaire le balayage sur le fichier entier (847 lignes) |
| A3 | La lecture stricte de S-1 (« plus aucun `day()` ») peut être appliquée à la classe des données à grille semaine seulement, les relatifs au jour étant conservés et documentés | Inventory seed.ts | Si l'utilisateur veut une lecture intégrale, le chantier s'élargit — à confirmer au plan ou en checkpoint si ambigu |
| A4 | Docker est disponible localement (test-db.sh exécutable) mais NON REQUIS : aucun SQL/migration n'est touché par les correctifs recommandés | Validation | Si une migration était choisie pour IN-02 (forme b), `test-db.sh` redevient obligatoire (I-03) |

## Open Questions (RESOLVED — marquées au passage en révision du plan, 2026-11-08)

Les deux questions ci-dessous sont **résolues sur le fond par les plans 01 et 02** ; les résolutions adoptées sont consignées ici.

1. **Factorisation `weekStartOf` (menu/types.ts) ↔ `debutSemaineIso` (datetime.ts)** — **(RESOLVED : délégation, plan 38-01)**
   - What we know: les deux ont la même sémantique (lundi, UTC pur).
   - What's unclear: délégation (menu consomme datetime) vs coexistence.
   - **Résolution adoptée :** délégation — `weekStartOf` de `menu/types.ts` délègue à `debutSemaineIso` de `lib/datetime.ts` (une seule source, §2.7 E) ; le menu ré-exporte pour ne pas casser ses imports. Implémentée par le plan 38-01.

2. **Injection du throttle pour le test WR-03** — **(RESOLVED : attente d'état d'abord, plan 38-02)**
   - What we know: `connectOfflineCache` accepte `options.throttleTime` (query-persistence.ts:188-201) mais `switchWithPurge` ne le transmet pas.
   - What's unclear: attente d'état seule suffit-elle, ou faut-il injecter un throttle court par `switchWithPurge` ?
   - **Résolution adoptée :** commencer par l'attente d'état (correction test-only, `vi.waitFor` dans `household-store.test.ts`) ; n'injecter un paramètre de production que si le protocole W-02 le désigne explicitement (Task 2 du plan 38-02 porte cette clause). Implémentée par le plan 38-02.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 24 / npm | chaîne §2.7 | ✓ (stack du projet) | — | — |
| Docker + `sh scripts/test-db.sh` | SEULEMENT si SQL touché (I-03) | non requis ici | — | Aucun SQL touché → chaîne standard ; consigner l'absence de Docker si la forme (b) était choisie |
| Playwright browsers | e2e | ✓ (config existante) | 1.63.0 | — |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 + @playwright/test 1.63.0 |
| Config file | `app/vite.config.ts` (vitest, jsdom, setup `src/test/setup.ts` avec `fake-indexeddb/auto`) + `app/playwright.config.ts` |
| Quick run command | `cd app && npx vitest run src/modules/menu src/stores src/lib/datetime.test.ts src/lib/data` |
| Full suite command | `cd app && npm run typecheck && npm test && npm run build && npm run test:e2e` puis `python3 scripts/check-sql-statique.py` (+ `test-check-sql-statique.py`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-01 (menu) | Les repas semés sont visibles quel que soit le jour de la semaine (7 dates injectées) | unit paramétrique | `cd app && npx vitest run src/lib/datetime.test.ts src/modules/menu/menu-page.test.tsx` | ❌ Wave 0 (datetime.test.ts existe ; les cas 7 jours + test semis sont nouveaux) |
| TEST-01 (seed) | `demoMealEntries` ancrées sur la semaine courante lundi-based, quel que soit le jour | unit | `cd app && npx vitest run src/lib/data` (seed.test.ts ou nouveau cas) | ❌ Wave 0 |
| TEST-01 (WR-03) | L'écriture post-switch atteint la clé du nouveau foyer, sans course (attente d'état, N répétitions) | unit timing-durci | `cd app && npx vitest run src/stores/household-store.test.ts` | ✅ (durcissement du test existant l.316-335) |
| TEST-03 | La suite e2e est verte hors join-token (rouge documenté J-01/J-02) | e2e | `cd app && npm run test:e2e` — signature attendue : 2 rouges AVANT fix (critical-paths join-token l.134 + menu.spec), 1 rouge APRÈS (join-token seul, consigné) | ✅ |
| DEBT-01 (IN-01) | Aucun `typeof response.status` résiduel ; les 11 tests du module restent verts | unit + garde de classe | `cd app && npx vitest run src/modules/ardoise/guest-ardoise-page.test.ts` + `grep -rn "typeof response.status" app/src` = 0 | ✅ (tests existants) |
| DEBT-01 (IN-02) | Les lectures service_role de `buildGuestView` sont bornées ; la vue invité rend les mêmes données | e2e/contrat | `cd app && npm run test:e2e` (parcours ardoise invité existant) + revue du diff | ✅ (parcours e2e existant, cadeaux-contacts/critical-paths couvrent l'ardoise) |

### Sampling Rate
- **Per task commit:** quick run (vitest des fichiers touchés) + `npm run typecheck`
- **Per wave merge:** chaîne §2.7 complète (typecheck → tests → build → e2e → check-sql-statique)
- **Phase gate:** chaîne §2.7 verte, avec le rouge join-token documenté noir sur blanc (J-01) ; `sh scripts/test-db.sh` NON requis (aucun SQL touché — forme (a) recommandée) ; en revanche `python3 scripts/test-check-sql-statique.py` reste au programme s'il y a la moindre édition SQL (aucune attendue)

### Wave 0 Gaps
- [ ] Cas paramétriques 7 jours dans `app/src/lib/datetime.test.ts` (S-02, TEST-01)
- [ ] Cas de classe sur le semis : aucun `day(n)` nu dans les données à structure de semaine (garde anti-récidive, même esprit que `seed-instants.test.ts`) — fichier cible `app/src/lib/data/seed.test.ts`
- [ ] Durcissement WR-03 : attente d'état remplaçant le `setTimeout(1200)` (`household-store.test.ts:330`)

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | yes (IN-02) | Bornage explicite des lectures service_role (`.eq`/`.in`) — la RLS est court-circuitée par la clé secrète |
| V5 Input Validation | no (aucune entrée nouvelle) | — |
| V6 Cryptography | no | — |
| V1 Limitation exposée (minimisation) | yes | Lire seulement les lignes consommées par la réponse (esprit §2.6) |

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Lecture de table entière par endpoint public (service_role) | Information Disclosure | `.eq('household_id', …)` / `.in('expense_id', ids)` côté requête, jamais côté JS |
| Flake masquant une vraie régression (test qui ment) | Repudiation | Protocole W-02 écrit + diagnostic consigné dans `docs/RETROSPECTIVE.md` |

## Sources

### Primary (HIGH confidence)
- Lecture directe des fichiers du dépôt ce jour (2026-11-08) : `app/src/lib/data/seed.ts` (l.63-164), `app/src/modules/menu/{types.ts:54-107, menu-page.tsx:53, hooks/use-menu.ts:73, menu-page.test.tsx}`, `app/src/stores/{household-store.ts:88-121, household-store.test.ts:271-335}`, `app/src/lib/{datetime.ts, datetime.test.ts:1-40, seed-instants.test.ts, offline/query-persistence.ts:71}`, `app/e2e/{menu.spec.ts, critical-paths.spec.ts:134-201, config}`, `app/vite.config.ts:102-108`, `app/package.json`, `supabase/functions/ardoise-invite/index.ts:620-759`, `supabase/migrations/0004_tables_shared.sql:32-49`
- `.planning/milestones/v1.2-phases/37-filet-de-tests-fiable/37-REVIEW-FIX.md` (IN-01 l.44-48, IN-02 l.50-55) et `37-VERIFICATION.md` (les 2 rouges e2e préexistants, l.32/59)
- `.planning/phases/38-filet-de-tests-fiable/38-CONTEXT.md` (décisions verrouillées)

### Secondary (MEDIUM confidence)
- `docs/RETROSPECTIVE.md` (format des campagnes — cité par W-02, non relu intégralement ce jour)

### Tertiary (LOW confidence)
- Taux de reproduction exact de WR-3 sous charge (non mesuré ce jour — c'est le travail du protocole W-02, pas de la recherche)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — aucune dépendance nouvelle, versions lues dans package.json
- Architecture (semis/flakes): HIGH — mode d'échec du dimanche prouvé file:line ; cause WR-3 timing prouvée par lecture (marge 200 ms)
- Pitfalls: HIGH — tirés des garde-fous §2.7 du projet et du schéma SQL relu

**Research date:** 2026-11-08
**Valid until:** 2026-12-08 (code local stable, aucune dépendance externe)
