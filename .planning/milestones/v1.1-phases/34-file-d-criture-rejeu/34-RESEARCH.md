# Phase 34: File d'écriture & rejeu - Research

**Researched:** 2026-11-05
**Domain:** TanStack Query v5 outbox (file d'écriture offline) + migration SQL d'idempotence PostgreSQL
**Confidence:** HIGH (code existant lu ce session ; APIs TanStack vérifiées via Context7)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (résumé — copie intégrale à lire dans `34-CONTEXT.md`)

- **D-01** : persistance de la file = **clé query dédiée dans le même persister** (`persistQueryClient` + `createAsyncStoragePersister`, phase 33). Pas de stockage séparé, pas de Dexie.
- **D-02** : enfilage = **`MutationCache` central installé par `buildQueryClient`** dans `query-policy.ts` — aucune branchement par vue.
- **D-03** : lecture = hook `use-outbox` sur la query persistée ; la gate `use-outbox-gate` (stub 32-D10) et le badge « N en attente » dérivent de cette source unique. **Aucun composant de la phase 32 ne change.**
- **D-04** : fusion par entité — une seule écriture pendante par entité (coche puis décoche = une écriture finale).
- **D-05** : annulation locale par clé client — le create génère l'UUID `client_key` côté client d'emblée ; create + delete partent ensemble.
- **D-06** : liste blanche d'écriture dans `query-policy.ts`, à côté de `OFFLINE_FAMILIES`.
- **D-07** : refus **upfront** des modules hors liste (avant tout départ réseau), toast clair, jamais enfilés.
- **D-08** : déclencheurs foreground = `online` ET `visibilitychange` via `onlineManager`/`useOnlineStatus`. Pas de polling.
- **D-09** : ordre de rejeu = FIFO + creates d'abord (par clé client).
- **D-10** : échec terminal (refus RLS, ligne supprimée) = surfacé + retiré de la file ; échec réseau/5xx = retryable. Jamais de retry en boucle.
- **D-11** : échecs terminaux consultables dans le panneau offline de Paramètres ; badge « N bloquées » cliquable.
- **D-12** : toast discret une fois par échec terminal ; les retards réseau ne tosant pas.
- **D-13** : badge « N en attente » visible tant que N > 0, en ligne comme hors ligne.
- **D-14** : **colonne `client_key uuid` par table Tier 1** (`shopping_list_items`, `tasks`, `task_assignees`, `routines`, `routine_completions`) + contrainte unique (household_id, client_key) + upsert `on conflict` au rejeu. **Pas de table outbox générique.** One-way.
- **D-15** : backfill `gen_random_uuid()` + NOT NULL immédiat dans la même migration. One-way.
- **D-16** : réconciliation Realtime par clé client — Realtime/invalidation priment TOUJOURS sur l'optimiste.
- **D-17** : déconnexion = scan AVANT purge → avertissement bloquant avec confirmation ; changement de foyer = purge sans confirmation.

### the agent's Discretion

- Format exact de l'entrée de file (table, operation, values, client_key, enfiled_at, status).
- Forme exacte du toast (libellé, icône, déduplication si plusieurs échecs en un rejeu).
- Placement précis du hook `use-outbox` et de son test.
- Détails du MutationCache (onError vs onSuccess selon les mutations) dans les limites de D-02.

### Deferred Ideas (OUT OF SCOPE)

- Background sync SW (foreground uniquement : `online` + `visibilitychange`).
- Écritures hors liste blanche (Ardoise, Messages, Cadeaux, Cercle, invitations/tokens).
- Deep links et vue « Tâches du jour » (phase 35).
- Retour du mode démo Dexie (D-10 jalon v1.1).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WRQ-01 | Migration SQL idempotence (client_key UUID, upsert/unicité) + tests SQL négatifs §2.7 | Modèle D-14/D-15 : colonne uuid, contrainte unique (household_id, client_key), backfill NOT NULL. PKs des tables Tier 1 sont `text` (`private.new_id(...)`) — `client_key` est une colonne NOUVELLE, distincte de `id`. `upsert` adapter existe déjà (onConflict). Tests : pattern testkit `_setup.sql` + tests négatifs inter-foyer. |
| WRQ-02 | Écriture Tier 1 hors-ligne enfilée puis rejouée au retour du réseau (foreground) | D-02 : MutationCache.onError → outbox (query persistée D-01). Rejeu via `adapter.upsert` (creates) / `adapter.update`/`remove` (autres) sur `onlineManager` subscribe + `visibilitychange`. |
| WRQ-03 | Liste blanche : écriture hors liste refusée côté client, test qui le prouve | D-06/D-07 : garde étendue dans `query-policy.ts`, refus avant départ réseau. Attention : `useLinkedRows` (tables-set keyless : task_assignees, routine_assignees) est un second chemin de mutation à couvrir. |
| WRQ-04 | Classification terminal (RLS/ligne supprimée) vs retryable (réseau/5xx) | Classification par code PostgREST + piège delete RLS (0 lignes, error null) — voir Pitfalls 3 et 4. |
| WRQ-05 | Badge « N en attente » + liste consultable, retombe à zéro | D-03/D-11/D-13 : hook `use-outbox` unique ; panneau offline existant (`offline-panel.tsx`) réceptacle ; badge via `banner-store`. |
| WRQ-06 | Réconciliation Realtime par clé client, Realtime priment sur l'optimiste | D-16 : le row serveur portant la même `client_key` remplace l'overlay optimiste et retire l'entrée de la file. Canal Realtime existant dans `supabase-adapter.ts` (subscribeRealtimeHealth). |
</phase_requirements>

## Summary

La phase 33 a posé le persister IndexedDB (`query-persistence.ts`) avec namespacing (user, foyer), purge awaitée et allowlist de lecture centralisée dans `query-policy.ts`. La phase 34 y ajoute l'écriture : un outbox persisté comme **clé query dédiée dans le même persister** (D-01), enfilé par un **`MutationCache.onError` central** (D-02) installé dans `buildQueryClient`, rejoué au retour du réseau (foreground) avec idempotence garantie côté base par `client_key uuid` (D-14/D-15).

Deux découvertes structurantes pour le plan :

1. **Le chemin TanStack « paused mutations » (`resumePausedMutations` + `shouldDehydrateMutation`) est incompatible avec la politique réseau du dépôt.** `QUERY_POLICY` pose `networkMode: 'always'` sur les mutations (`query-policy.ts:54`), donc une écriture hors ligne **échoue** immédiatement — elle n'est jamais mise en pause. L'API officielle `resumePausedMutations` ne rejoue que des mutations *pausées* (`defaultShouldDehydrateMutation` ne déshydrate que `mutation.state.isPaused`) [VERIFIED: Context7 /tanstack/query]. C'est exactement la question ouverte de STATE.md (« resumePausedMutations vs outbox pur ») : D-02 (verrouillé) tranche pour l'**outbox pur alimenté par `MutationCache.onError`** — le chemin paused exigerait de basculer les mutations en `networkMode: 'offlineFirst'`, ce qui violerait la sémantique d'honnêteté de la phase 33 (les écritures Tier 2 doivent continuer d'échouer honnêtement hors ligne). Ne PAS suivre l'exemple `setMutationDefaults` de la doc officielle.

2. **La PK des tables Tier 1 est `text` (`private.new_id('item')`), pas uuid** [VERIFIED: supabase/migrations/0003_tables_daily.sql:18-32]. `client_key uuid` est donc une colonne NOUVELLE, orthogonale à `id` : le create hors-ligne génère à la fois un `id` (texte, via `randomId(table)` — l'adaptateur le fait déjà [VERIFIED: supabase-adapter.ts:126-133]) et un `client_key` (uuid, `crypto.randomUUID()`). Au rejeu, `adapter.upsert(table, payload, { onConflict: 'household_id,client_key' })` fusionne ou crée — l'adaptateur `upsert` existe et transmet `onConflict` tel quel à PostgREST [VERIFIED: supabase-adapter.ts:135-149].

**Primary recommendation:** outbox = une query `[OUTBOX_KEY, userId, householdId]` dont les `data` sont la liste d'entrées (table, operation, id?, values, clientKey?, enfiledAt, status) ; enfilage par `MutationCache.onError` filtré par la liste blanche d'écriture ; rejeu séquentiel FIFO creates-d'abord appelant les méthodes de l'adaptateur existant ; classification par code d'erreur PostgREST ; le tout couvert par tests Vitest (fake-indexeddb) + migration SQL avec tests négatifs testkit.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Idempotence serveur (WRQ-01) | Database/Storage (PostgreSQL) | — | La contrainte unique et l'upsert `on conflict` vivent dans la base ; le client ne fait que porter la clé. RLS reste la frontière (AGENTS.md §2.6). |
| Enfilage hors-ligne (WRQ-02) | Client (TanStack MutationCache) | Frontend store persisté (IndexedDB) | Le cache client enfile ; la persistance survit au reload via le persister existant. |
| Liste blanche d'écriture (WRQ-03) | Client (policy centrale) | — | Refus upfront, avant tout départ réseau ; un seul fichier nomme l'éligibilité. |
| Classification des échecs (WRQ-04) | Client (replay runner) | — | Le client interprète les codes PostgREST ; le serveur ne sait pas qu'une écriture était en file. |
| Badge/panneau (WRQ-05) | Client (UI) | — | Dérivé de la query outbox, zéro état séparé. |
| Réconciliation Realtime (WRQ-06) | API/Backend (Realtime) + Client | — | Le row serveur (via canal existant) remplace l'overlay optimiste par clé client. |

## Standard Stack

### Core (aucune nouvelle dépendance — la phase n'installe RIEN)

| Library | Version (dépôt) | Purpose | Why Standard |
|---------|-----------------|---------|--------------|
| @tanstack/react-query | v5 (déjà installé) | MutationCache.onError (enfilage central), `queryClient.getQueryData/setQueryData` (outbox), `onlineManager` (déclencheurs) | API vérifiée ce session via Context7 ; `onError` reçoit `(error, variables, onMutateResult, mutation, context)` avec `context.meta` disponible [VERIFIED: Context7 /tanstack/query] |
| @tanstack/react-query-persist-client + query-async-storage-persister | phase 33 | Persistance de l'outbox dans le même persister (D-01) | Déjà en place dans `query-persistence.ts` |
| idb-keyval | phase 33 | Store IndexedDB `eo-offline-cache` | Déjà en place |
| crypto.randomUUID() | natif navigateur | Génération de `client_key` uuid côté client | API Web standard, disponible partout où la PWA tourne (secure context). [VERIFIED: standard web — pas d'installation] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| testkit SQL (supabase/tests/_setup.sql) | existant | Tests SQL négatifs de la migration (§2.7 D) | WRQ-01 — `testkit.eq` (deux mêmes types), `testkit.count`, `expect_denied($q$...$q$)` |
| Vitest + fake-indexeddb | existant | Tests de la file, du rejeu, de la classification | Enfilage/rejeu/purge D-17 |

**Installation:** aucune — `crypto.randomUUID()` est natif, tout le reste est déjà dans le dépôt. **Audit de légitimité : n/a (aucun package installé).**

## Architecture Patterns

### System Architecture Diagram

```
 Vue (Courses/Tâches/Routines)
   │  create/update/remove via useResource / useLinkedRows
   ▼
 useMutation (networkMode 'always' — jamais en pause)
   │ échec réseau (offline)
   ▼
 MutationCache.onError  ──hors liste blanche──▶ refus UPFRONT (D-07) : toast, jamais enfilé
   │ (en liste)
   ▼
 Fusion par entité (D-04) / annulation create+delete (D-05)
   ▼
 OUTBOX = query [outbox, userId, householdId]  ──persisté──▶ IndexedDB (persister 33, D-01)
   │                                              ▲ restore au boot
   ▼
 Badge « N en attente » (banner-store) ◀── use-outbox (source unique D-03) ──▶ gate SW (32-D10)
 
 Déclencheurs : onlineManager('online') + visibilitychange (D-08)
   ▼
 Rejeu FIFO, creates d'abord (D-09) ──▶ adapter.upsert (onConflict household_id,client_key)
   │                                  ──▶ adapter.update / adapter.remove
   ├── succès ────▶ entrée retirée, invalidate [table]
   ├── retryable (réseau/5xx) ──▶ reste en file, rejeté plus tard
   └── terminal (RLS/ligne absente, D-10) ──▶ statut 'failed', badge « N bloquées », toast 1× (D-12)
                                              ▼
                                    Panneau offline Paramètres (D-11) : Réessayer / Abandonner
   ▼
 Realtime (canal existant) ── row avec même client_key ──▶ remplace overlay optimiste (D-16),
                                                            Realtime PRIME sur l'optimiste
```

### Recommended Project Structure (extensions du dépôt existant)

```
app/src/
├── lib/
│   ├── query-policy.ts              # + WRITE_ALLOWLIST (D-06) + MutationCache (D-02) dans buildQueryClient
│   └── offline/
│       ├── outbox.ts                # modèle d'entrée, add/fuse/cancel, rejeu, classification (discretion D-02/D-04/D-05)
│       └── query-persistence.ts     # extension shouldDehydrateQuery pour la clé outbox
├── hooks/
│   ├── use-outbox.ts                # lecture source unique (D-03)
│   ├── use-outbox-gate.ts           # branché sur la vraie file — signature { isEmpty } INCHANGÉE
│   └── use-auth.ts / session-store  # signOut : scan-avertir-purger (D-17)
└── stores/household-store.ts        # switchHousehold : purge sans confirmation (D-17)
supabase/migrations/0177_...sql      # client_key + backfill + NOT NULL + contrainte unique (D-14/D-15)
supabase/tests/0177_client_key.test.sql  # tests négatifs §2.7
```

### Pattern 1: Outbox comme query TanStack (D-01/D-03)

**What:** la file d'attente est une query dont `data` est la liste d'entrées ; toute mutation de la file passe par `queryClient.setQueryData(OUTBOX_KEY…)` — elle hérite donc GRATUITEMENT de la persistance, du namespacing, de la purge et du restore de la phase 33.

**Example:**

```typescript
// Source: conventions du dépôt (query-persistence.ts, queryKeys)
export const OUTBOX_KEY = ['outbox'] as const; // préfixe à porter dans le filtre de persist (voir Pitfall 5)

function setOutbox(client: QueryClient, userId: string, householdId: string,
                   update: (entries: OutboxEntry[]) => OutboxEntry[]) {
  client.setQueryData<OutboxEntry[]>([...OUTBOX_KEY, userId, householdId], update);
}
```

### Pattern 2: Enfilage central par MutationCache (D-02)

**What:** `buildQueryClient` installe un `new MutationCache({ onError })` [VERIFIED: Context7 — signature `onError(error, variables, onMutateResult, mutation, context)`]. Pour identifier la table et l'opération sans toucher les vues, chaque mutation de `useResource.ts` pose déjà des variables typées ; la façon la plus propre est `mutation.meta` (`MutationOptions.meta` : « payload to be stored on the mutation cache entry… read wherever the mutation is available, such as the onError callbacks of the MutationCache » [VERIFIED: Context7]) : `useResource.ts` ajoute `meta: { table, operation }` aux 3 mutations centralisées + aux 2 de `useLinkedRows`. **Aucun composant de vue ne change.**

```typescript
// Source: Context7 /tanstack/query (MutationCacheConfig, MutationOptions.meta)
const mutationCache = new MutationCache({
  onError: (error, variables, _onMutateResult, mutation, _context) => {
    const meta = mutation.options.meta as { table?: string; operation?: 'create'|'update'|'remove' } | undefined;
    if (!meta?.table) return;                    // mutation non marquée : rien à enfiler
    if (!isWriteAllowed(meta.table)) { toast(...); return; }  // D-07 refus upfront
    if (!isNetworkError(error)) return;          // RLS/validation : PAS d'enfilage (Pitfall 2)
    enqueue(meta.table, meta.operation, variables, mutation);
  },
});
```

### Pattern 3: Rejeu creates-d'abord par upsert idempotent (D-09/D-14)

```typescript
// Source: supabase-adapter.ts (upsert existe), migration D-14
// Create rejoué : l'id ET le client_key générés côté client voyagent dans le payload
await adapter.upsert('shopping_list_items', { ...values, id, client_key: clientKey },
                     { onConflict: 'household_id,client_key' });
// Update rejoué : naturellement idempotent (LWW sur le même id), client_key porté pour la contrainte
await adapter.update('tasks', id, { ...values, client_key: clientKey });
```

### Anti-Patterns to Avoid

- **Ne pas utiliser `setMutationDefaults` + `resumePausedMutations` + `shouldDehydrateMutation`** (l'exemple officiel de la doc offline) : sous `networkMode: 'always'` les mutations ne se mettent JAMAIS en pause — elles échouent. Ce chemin exigerait `networkMode: 'offlineFirst'` sur les mutations, ce qui mettrait en pause AUSSI les écritures Tier 2 (inacceptable : elles doivent échouer honnêtement, D-10 phase 33). [VERIFIED: Context7 — `defaultShouldDehydrateMutation` ne déshydrate que les mutations paused]
- **Ne pas enfiler une mutation dont l'échec n'est pas réseau** : un refus RLS (42501) ou une violation de check (23514) sur une écriture EN LIGNE ne doit pas partir en file — il échoue devant l'utilisateur immédiatement (D-07/D-10 : la file est pour le réseau, pas pour masquer un refus).
- **Ne pas stocker le comptage N séparément** : dérivé de la liste (D-03).
- **Ne pas toucher `app/src/sw.ts`** : ni cache API ni background sync (périmètre).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Détection réseau | listeners `window.ononline` maison | `onlineManager` (via `useOnlineStatus`) | Source unique déjà imposée (phase 33) ; TanStack écoute déjà ces événements [VERIFIED: use-online-status.ts] |
| Persistance de la file | Dexie/store IndexedDB dédié | le persister existant, clé query dédiée (D-01) | namespacing + purge + restore déjà prouvés par tests 33 |
| Génération d'UUID | encodeur maison de `randomId` | `crypto.randomUUID()` | natif, standard, conforme à `client_key uuid` côté base |
| Idempotence serveur | table outbox générique + RPC de rejeu | colonne `client_key` + upsert `on conflict` (D-14) | la RLS par table protège naturellement les lignes ; une table générique de payload jsonb échapperait à la RLS (raison D-14 verrouillée) |
| Assertions SQL | simulateur maison de SQL | testkit existant (`_setup.sql`) | chaîne de preuve §2.7 déjà en place |

## Runtime State Inventory

> Phase avec migration sur des tables en production (one-way D-14/D-15) — inventaire requis.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | 5 tables Tier 1 (`shopping_list_items`, `tasks`, `task_assignees`, `routines`, `routine_completions`) ont des lignes existantes sans `client_key` | Backfill `gen_random_uuid()` + NOT NULL dans la MÊME migration (D-15). Attention `task_assignees` : jointure keyless — vérifier si elle porte `household_id` (sinon la contrainte unique (household_id, client_key) n'a pas de sens dessus ; l'aligner sur sa structure réelle). |
| Live service config | Aucun — vérifié : la file est un état client, aucun service externe n'enregistre `client_key` | None |
| OS-registered state | Aucun (PWA pure, pas de scheduler OS impliqué) | None |
| Secrets/env vars | Aucune nouvelle variable — `client_key` n'est pas un secret | None |
| Build artifacts | Cache offline persisté `eo-offline-cache` des builds précédents : son buster `v1` ne connaît pas l'outbox | **Bumper `OFFLINE_CACHE_BUSTER`** dans `query-persistence.ts` (changement de FORME du cache persisté — commentaire du fichier l'exige explicitement), sinon l'outbox d'un ancien build n'est jamais restauré/mixé. |

## Common Pitfalls

### Pitfall 1: `networkMode: 'always'` → les mutations ne se mettent jamais en pause
**What goes wrong:** suivre l'exemple officiel TanStack d'offline mutations (`setMutationDefaults` + `resumePausedMutations`) ne rejouerait jamais rien : les mutations échouent au lieu de pauser.
**Why it happens:** la politique du dépôt (`query-policy.ts:54` : `mutations: { retry: 0, networkMode: 'always' }`) est exactement l'opposé du mode paused.
**How to avoid:** outbox pur alimenté par `MutationCache.onError` (D-02 verrouillé). Ne pas toucher au `networkMode`.
**Warning signs:** un test de rejeu qui passe avec un mock `isPaused` mais échoue en conditions réelles.

### Pitfall 2: enfiler un refus RLS ou de validation
**What goes wrong:** `MutationCache.onError` voit TOUTES les erreurs, y compris les 4xx de RLS (42501), de check (23514) ou de payload — les enfiler créerait une boucle de retry terminal masquée en « en attente ».
**How to avoid:** l'enfileur ne retient que les erreurs réseau (fetch failed / 5xx / absence de `code` PostgREST). Une écriture en ligne qui échoue pour une raison métier échoue devant l'utilisateur, point.
**Warning signs:** entrée en file avec un statut d'erreur contenant un code PG.

### Pitfall 3: delete RLS-refusé vs ligne-absente sont INDISTINGUABLES par HTTP
**What goes wrong:** côté PostgREST, un `delete` refusé par RLS et un `delete` d'une ligne déjà absente répondent tous deux « 0 lignes supprimées, error null ». Le code existant le sait : `remove` lève `REMOVE_MISSING_MESSAGE` sur 0 lignes précisément pour rendre le refus visible [VERIFIED: supabase-adapter.ts:188-202, commentaire WR-01].
**How to avoid:** pour la classification D-10, traiter « 0 lignes sur delete au rejeu » comme **terminal** (déjà appliqué OU refusé — dans les deux cas on retire de la file et on surfacera via rapprochement Realtime/invalidation qui montrera la vérité). Un `delete` en ligne reste dans le comportement actuel (échec visible). Ne PAS tenter de distinguer par pré-lecture : ce serait une course.
**Warning signs:** classification qui exige de savoir « pourquoi » le delete a supprimé 0 ligne.

### Pitfall 4: classification des erreurs PostgREST — utiliser le code, pas le message
**What goes wrong:** matcher sur le texte d'erreur casse à chaque reformulation PostgREST.
**How to avoid:** l'objet `error` de supabase-js porte `code` (PG error code : 42501 = RLS, 23505 = unicité, 23514 = check) et `status` HTTP. Terminal = codes 4xx PG sauf network ; retryable = fetch/network + 5xx. Vérifier le contrat `DataError` (`supabase-adapter.ts` transmet `error` en cause).
**Warning signs:** `String(error).includes('row-level')`.

### Pitfall 5: l'outbox et le filtre de persistance/prune
**What goes wrong:** `shouldDehydrateQuery` actuel ne laisse passer qu'une clé dont `queryKey[0]` est dans `OFFLINE_FAMILIES` — l'outbox ne serait jamais persistée ; et si on l'ajoutait comme famille avec maxAge, `pruneExpiredFamilies` pourrait la retirer (une entrée de file attend 3 jours, pas 24 h).
**How to avoid:** deux options à trancher au plan (discretion) : (a) préfixe outbox traité en cas particulier AVANT le test `familyOf` dans `shouldDehydrateQuery` ET exclu du prédicat de prune ; (b) famille dédiée `outbox` avec `maxAgeMs: Infinity`. L'option (a) respecte « une seule liste nomme l'offline » sans polluer la sémantique maxAge des données. Dans les deux cas : **bumper `OFFLINE_CACHE_BUSTER`** (Runtime State).
**Warning signs:** après reload, `use-outbox` retourne vide alors que des écritures pendaient.

### Pitfall 6: `useLinkedRows` est un deuxième chemin de mutation
**What goes wrong:** `task_assignees` (assignation d'une tâche) et `routine_assignees` passent par `useLinkedRows.add/remove` (`removeWhere`), pas par les 3 mutations de `useResource` — une garde limitée à `useResource` laisserait un chemin non enfilable (et WRQ-03 non couvert sur les tables-set).
**How to avoid:** marquer AUSSI les mutations de `useLinkedRows` avec `meta: { table, operation }`. Noter que `removeWhere` supprime par filtre — l'entrée de file doit sérialiser le filtre, pas un id.
**Warning signs:** un test WRQ-03 sur `task_assignees` qui réussit en enfilage mais échoue au rejeu (filtre perdu).

### Pitfall 7: optimiste sans id serveur pour le create hors-ligne
**What goes wrong:** le create optimiste actuel n'existe pas (create n'est pas optimiste dans `useResource`) ; le create hors-ligne doit peindre la ligne immédiatement avec l'`id` client, sinon la ligne disparaît à l'écran pendant la coupure.
**How to avoid:** pour les creates Tier 1, passer explicitement `id` (texte) + `client_key` (uuid) au payload ET poser l'overlay optimiste dans la query de la table (le serveur réutilisera cet `id` : l'adaptateur `create` transmet un `id` fourni tel quel [VERIFIED: supabase-adapter.ts:126-133]). Au rejeu, `upsert` sur (household_id, client_key) conserve l'`id` client → le rapprochement Realtime par `client_key` (D-16) fonctionne sans permutation d'identifiants.
**Warning signs:** ligne qui clignote ou double id après rejeu.

### Pitfall 8: la contrainte `testkit.count` non bornée (AGENTS.md §2.7 D)
**What goes wrong:** les tests SQL de la migration qui comptent des tables entières échouent (ou passent faux vert) sur une base avec données réelles.
**How to avoid:** en `postgres`, borner chaque assertion par `household_id` de la fixture ; en `authenticated`, la RLS borne déjà. Le backfill doit être testé : une ligne PRÉ-existante à la migration reçoit bien un uuid (assertion `client_key is not null` après backfill, pas seulement sur les nouvelles lignes).

## Code Examples

### Entrée de file (discretion — squelette)

```typescript
// Source: conventions du dépôt ; valeurs discrétionnaires D-04/D-05/D-10
export interface OutboxEntry {
  key: string;                 // identité d'entité (table + entityKey) pour la fusion D-04
  table: string;
  operation: 'create' | 'update' | 'remove' | 'removeWhere';
  id?: string;                 // pour create/update/remove
  filter?: Record<string, unknown>; // pour removeWhere (tables-set)
  values?: Record<string, unknown>;
  clientKey?: string;          // uuid — create/update (D-05, D-14)
  enfiledAt: number;
  status: 'pending' | 'failed';
  failure?: { kind: 'terminal'; code: string; message: string }; // D-10
}
```

### Déclencheurs de rejeu (D-08)

```typescript
// Source: use-online-status.ts (onlineManager déjà la source unique)
useEffect(() => {
  const replay = () => { if (onlineManager.isOnline()) void replayOutbox(); };
  const unsubOnline = onlineManager.subscribe(replay);
  const unsubVis = subscribeVisibility(replay); // visibilitychange → replay
  replay(); // au montage : des écritures peuvent dater du reload précédent
  return () => { unsubOnline(); unsubVis(); };
}, []);
```

### Migration (squelette D-14/D-15)

```sql
-- 0177_client_key.sql — vers l'avant uniquement (AGENTS.md §2.7 A)
alter table public.shopping_list_items add column client_key uuid;
alter table public.tasks            add column client_key uuid;
-- (idem task_assignees, routines, routine_completions — vérifier structure de task_assignees)
update public.shopping_list_items set client_key = gen_random_uuid();
-- (idem chaque table)
alter table public.shopping_list_items alter column client_key set not null;
alter table public.shopping_list_items
  add constraint shopping_list_items_client_key_key unique (household_id, client_key);
-- (idem chaque table) — l'index sert le upsert onConflict 'household_id,client_key'
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Dexie mode démo comme « base offline » | Cache de lecture TanStack persisté (phase 33) + outbox query (phase 34) | 2026-10-12 (D-10) | L'outbox n'emprunte JAMAIS le chemin Dexie |
| Mutations paused (`resumePausedMutations`) | Mutations `always` + outbox pur par MutationCache | Politique phase 33 | L'exemple offline officiel TanStack ne s'applique pas tel quel |
| `remove` muet sur 0 lignes (204 silencieux) | `remove` avec `.select()` — le refus devient visible | déjà en place (WR-01) | Base de la classification D-10 |

**Deprecated/outdated:** `dnd-kit` umbrella (n/a ici) ; Background Sync API = enrichissement Chromium différé (STATE.md).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `crypto.randomUUID()` est disponible dans tous les navigateurs cibles de la PWA (secure context, iOS Safari ≥ 15.4) | Standard Stack | Fallback simple (RFC4122 v4 maison) si un vieux WebKit visé — à confirmer au plan |
| A2 | `task_assignees` porte (ou non) un `household_id` — non vérifié dans la migration ; la forme exacte de la contrainte unique pour cette table dépend de sa structure réelle | Runtime State / Migration | Contrainte mal posée = migration échoue au déploiement ; à lire dans 0003/0033 au plan |
| A3 | Le rapprochement Realtime par `client_key` suffit sans re-fetch : le canal Realtime existant émet les rows avec leurs colonnes (y compris client_key) | WRQ-06 | Si Realtime n'expose pas client_key dans le payload, la réconciliation retombe sur l'invalidation (flash visuel, D-16 le refuse) — à vérifier dans le code de souscription Realtime au plan |
| A4 | Le `meta` de mutation est sérialisable et survit à un reload si on souhaitait le relire (non requis par D-01/D-02 : la file est sérialisée dans la query outbox, pas dans les mutations) | Pattern 2 | Nul si l'outbox est bien la seule persistance |
| A5 | La liste blanche d'écriture = les 5 tables de D-14 exactement (alignement allowlist lecture : ni `products`, ni `shopping_lists` elles-mêmes, ni `household_members`/`profiles`) | WRQ-03 | Mauvais périmètre = refus légitimes ou fuites ; le CONTEXT l'affirme (« aligné sur la allowlist de lecture, ni plus ni moins » pour D-14) mais la liste d'écriture peut différer de la liste de lecture pour les tables de jointure — à trancher au plan |

## Open Questions

1. **Structure exacte de `task_assignees`** (A2)
   - What we know: table de jointure créée en 0003 (l.94), keyless côté adaptateur (`removeWhere`).
   - What's unclear: porte-t-elle `household_id` ? La contrainte unique (household_id, client_key) s'y applique-t-elle telle quelle ?
   - Recommendation: lire la définition dans `0003_tables_daily.sql` avant d'écrire la migration ; si pas de household_id, contrainte unique sur (client_key) seul ou alignement sur la clé naturelle.

2. **Sortie `client_key` dans le payload Realtime** (A3)
   - Recommendation: vérifier la souscription Realtime existante (`supabase-adapter.ts`, `channels`) ; Realtime émet par défaut les nouvelles valeurs de ligne — confirmer sur une table Tier 1.

3. **Les `shopping_lists` / `products` entrent-ils dans la liste d'écriture ?** (A5)
   - What we know: D-14 énumère 5 tables ; la allowlist de lecture inclut `shopping_lists` et `products` (annexes).
   - Recommendation: trancher au plan — l'esprit du CONTEXT (alignement ni plus ni moins) dit 5 tables ; un test WRQ-03 doit prouver le refus de tout le reste.

4. **Purge outbox au changement de foyer (D-17) : confirmation du commentaire « purge sans confirmation »**
   - Already decided (D-17), mais l'implémentation doit passer par `stopPersisting()` avant purge (ordre imposé de `query-persistence.ts`) — à reprendre tel quel.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker (test-db.sh) | Tests SQL WRQ-01 | à vérifier à l'exécution | — | chaîne typecheck/tests/build + check-sql-statique suffisante hors Docker, mais test-db.sh reste obligatoire avant de dire « le SQL est bon » (AGENTS.md §2.7) |
| Vitest / fake-indexeddb | Tests file | ✓ (phase 33) | dépôt | — |
| scripts/check-sql-statique.py | Contrôle statique migration | ✓ | dépôt | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** Docker (voir ci-dessus).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 5 + React Testing Library (+ testkit SQL via scripts/test-db.sh) |
| Config file | config Vitest du dépôt (app/) ; `_setup.sql`/`_teardown.sql` pour le SQL |
| Quick run command | `cd app && npx vitest run src/lib/offline src/hooks` |
| Full suite command | `cd app && npm run typecheck && npm test && npm run build` puis `python3 scripts/check-sql-statique.py` + `sh scripts/test-db.sh` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WRQ-01 | client_key NOT NULL, backfill, unicité par foyer, refus doublon inter/infra-foyer | SQL (testkit, négatifs §2.7) | `sh scripts/test-db.sh` | ❌ Wave 0 (`supabase/tests/0177_client_key.test.sql`) |
| WRQ-02 | écriture offline enfilée, rejouée exactement une fois au retour réseau | unit (Vitest, MSW/mock adapter) | `npx vitest run src/lib/offline/outbox.test.ts` | ❌ Wave 0 |
| WRQ-02 | fusion par entité (D-04) + annulation create+delete (D-05) | unit | `npx vitest run src/lib/offline/outbox.test.ts` | ❌ Wave 0 |
| WRQ-03 | refus upfront hors liste (au moins 1 module de la liste des refus + tables-set) | unit | `npx vitest run src/lib/query-policy.test.ts` | ✅ étend (existe) |
| WRQ-04 | classification terminal vs retryable, pas de boucle | unit | `npx vitest run src/lib/offline/outbox.test.ts` | ❌ Wave 0 |
| WRQ-05 | badge N en attente / N bloquées, gate 32-D10 sans changement de composant | component | `npx vitest run src/hooks/use-outbox-gate.test.ts` | ✅ étend (existe) |
| WRQ-06 | réconciliation Realtime : Realtime prime sur l'optimiste | unit | `npx vitest run src/lib/offline/` | ❌ Wave 0 |
| D-17 | signOut scan-avertir-purger ; switchHousehold purge sans confirmation | unit | `npx vitest run src/hooks` | ❌ Wave 0 |
| — | garde de classe : aucun `new QueryClient(` hors query-policy ; REFUS hors liste prouvé par cas must-fail | statique (contrôle §2.7 E) | tests existants query-policy.test.ts (Tests D/E/H) | ✅ étend |
| — | contrôle statique SQL sur la migration | statique | `python3 scripts/check-sql-statique.py` + `python3 scripts/test-check-sql-statique.py` | ✅ existant |

### Sampling Rate

- **Per task commit:** quick Vitest sur le domaine touché
- **Per wave merge:** chaîne complète §2.7 (typecheck + test + build + check-sql-statique)
- **Phase gate:** test-db.sh vert (Docker) + e2e si disponibles avant `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `supabase/migrations/0177_client_key.sql` + `supabase/tests/0177_client_key.test.sql` — WRQ-01 (prérequis de TOUTE écriture en file, cf. STATE.md)
- [ ] `app/src/lib/offline/outbox.test.ts` — WRQ-02/04 (enfilage, fusion, annulation, classification, rejeu exactement-une-fois)
- [ ] Extension `app/src/lib/query-policy.test.ts` — WRQ-03 (liste blanche écriture + cas must-fail)
- [ ] Extension `app/src/hooks/use-outbox-gate.test.ts` — WRQ-05 (contrat { isEmpty } inchangé)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control (RLS) | yes | La migration ne touche AUCUNE politique ; l'upsert de rejeu passe par la RLS de la table (membre du foyer). Tests SQL négatifs : doublon inter-foyer refusé, RLS refusée pour un non-membre. |
| V5 Input Validation | yes | `client_key uuid` typé côté base ; payload de file sérialisé mais rejoué par les méthodes d'adaptateur typées (jamais de SQL construit). |
| V6 Cryptography | yes (léger) | `crypto.randomUUID()` natif — jamais d'UUID maison. |
| V2/V3 (auth/session) | no (déjà traité) | signOut purge awaitée existante (phase 33), étendue par D-17. |

### Known Threat Patterns for ce stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Écriture cross-foyer via client_key deviné (uuid v4 : impraticable) + contrainte unique (household_id, client_key) | Tampering | La contrainte inclut household_id ; la RLS borne l'upsert au foyer du membre ; test négatif SQL |
| Rejeu en boucle d'un refus RLS (boucle infinie de requêtes) | DoS (self) | D-10 : terminal → sortie de file, jamais rejoué ; test de non-boucle |
| Outbox persistée contenant des données personnelles (values de la ligne) | Information Disclosure | Même namespacing/purge que le cache (D-01/D-17) : purge awaitée à la déconnexion, purge sans confirmation au changement de foyer |
| Overlay optimiste trompeur (écriture jamais appliquée présentée comme faite) | Repudiation | D-10/D-12/D-13 : terminal surfacé (badge bloquées, panneau, toast), jamais d'effacement silencieux |

## Sources

### Primary (HIGH confidence)
- Code lu ce session : `app/src/lib/query-policy.ts` (1-110), `app/src/lib/offline/query-persistence.ts` (1-318), `app/src/lib/data/useResource.ts` (1-229), `app/src/lib/data/supabase-adapter.ts` (1-230), `app/src/hooks/use-outbox-gate.ts`, `app/src/hooks/use-online-status.ts`, `supabase/migrations/0003_tables_daily.sql` (1-40), `supabase/tests/_setup.sql` (1-60)
- CONTEXT.md phase 34 (décisions D-01…D-17, verbatim)
- `.planning/REQUIREMENTS.md` §WRQ, `.planning/STATE.md` (questions ouvertes, blocants)

### Secondary (MEDIUM-HIGH confidence)
- Context7 /tanstack/query : `MutationCacheConfig.onError` (signature + `context.meta`), `MutationOptions.meta`, `resumePausedMutations()`, `defaultShouldDehydrateMutation` (ne déshydrate que les mutations paused), guide offline mutations (`setMutationDefaults` — écarté pour ce dépôt, voir Pitfall 1)

### Tertiary (LOW confidence)
- A1/A2/A3/A5 — table Assumptions Log

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — aucune dépendance nouvelle, APIs TanStack vérifiées Context7
- Architecture: HIGH — D-01…D-17 verrouillés + code d'ancrage lu
- Pitfalls: HIGH — pitfalls 1/3/5/6/8 dérivés de la lecture directe du code et de la doc ; A2/A3 à confirmer au plan

**Research date:** 2026-11-05
**Valid until:** 2026-12-05 (stable — TanStack v5, code dépôt)
