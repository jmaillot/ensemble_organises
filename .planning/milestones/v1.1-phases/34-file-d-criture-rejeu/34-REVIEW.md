---
phase: 34-file-d-criture-rejeu
reviewed: 2026-11-05T12:00:00Z
depth: standard
files_reviewed: 43
files_reviewed_list:
  - app/src/app/router.tsx
  - app/src/components/banners/banner-slot.tsx
  - app/src/components/shared/mobile-drawer.tsx
  - app/src/hooks/use-auth.ts
  - app/src/hooks/use-outbox-gate.ts
  - app/src/hooks/use-outbox-replay-badge.ts
  - app/src/hooks/use-outbox-replay.ts
  - app/src/hooks/use-outbox.ts
  - app/src/hooks/use-sign-out.ts
  - app/src/lib/data/supabase-adapter.ts
  - app/src/lib/data/useResource.ts
  - app/src/lib/data/write-policy.ts
  - app/src/lib/offline/outbox-replay.ts
  - app/src/lib/offline/outbox.ts
  - app/src/lib/offline/query-persistence.ts
  - app/src/lib/query-policy.ts
  - app/src/modules/courses/api.ts
  - app/src/modules/courses/components/product-sheet.tsx
  - app/src/modules/courses/courses-page.tsx
  - app/src/modules/courses/hooks/use-courses.ts
  - app/src/modules/courses/products-api.ts
  - app/src/modules/parametres/components/offline-panel.tsx
  - app/src/modules/parametres/components/profile-form.tsx
  - app/src/modules/voyages/components/trip-courses-tab.tsx
  - app/src/stores/household-store.ts
  - app/src/stores/session-store.ts
  - app/src/lib/data/write-policy.test.ts
  - app/src/lib/data/supabase-adapter.test.ts
  - app/src/lib/offline/outbox-replay.test.ts
  - app/src/lib/offline/outbox.test.ts
  - app/src/lib/query-policy.test.ts
  - app/src/hooks/use-outbox-gate.test.ts
  - app/src/hooks/use-outbox-replay-badge.test.ts
  - app/src/hooks/use-outbox.test.ts
  - app/src/components/banners/banner-slot.test.tsx
  - app/src/modules/courses/courses-offline-writes.test.tsx
  - app/src/modules/courses/products-api.test.ts
  - app/src/modules/courses/product-sheet-cleanup.test.tsx
  - app/src/modules/courses/products-photo.test.ts
  - app/src/modules/courses/scan-flow.test.tsx
  - app/src/modules/parametres/components/offline-panel.test.tsx
  - app/src/stores/household-store.test.ts
  - app/src/stores/session-store.test.ts
findings:
  critical: 2
  warning: 4
  info: 4
  total: 10
status: issues_found
---

# Phase 34 : Code Review Report

**Reviewed:** 2026-11-05T12:00:00Z
**Depth:** standard
**Files Reviewed:** 43
**Status:** issues_found

## Summary

La phase 34 (file d'écriture hors-ligne + rejeu) est bien structurée : garde upfront D-07 posée à trois niveaux (hooks, MutationCache, adaptateur), classification d'échecs par code PG plutôt que par fragment de message, conventions du dépôt (commentaires en français, aucune directive de linter, §2.7 F) respectées. Deux défauts bloquants subsistent néanmoins, tous deux sur la garantie centrale « aucune écriture pendante n'est perdue » :

1. la query outbox est une query TanStack **refetchable** dont la `queryFn` rend `[]` — tout refetch (reconnect, invalidation globale, montage d'une query périmée) écrase la file et détruit les écritures pendantes ;
2. la fusion D-04 remplace un `create` pendante par un `update` de même entité — le rejeu de cet update sur une ligne qui n'existe pas côté serveur échoue de façon terminale et la ligne n'est jamais créée (perte de données).

Les deux scénarios sont atteignables par des parcours utilisateur ordinaires (couper le réseau, créer puis modifier un article, revenir sur l'onglet).

## Critical Issues

### CR-01: La query outbox est refetchable — un refetch écrase la file d'écritures pendantes

**File:** `app/src/hooks/use-outbox.ts:28-32` (interagi avec `app/src/lib/query-policy.ts:29-56`, `app/src/modules/parametres/components/offline-panel.tsx:242`)

**Issue:** La file est portée par une `useQuery` dont la `queryFn` rend `[]`. Le commentaire affirme « la file n'est JAMAIS fetchée », mais rien ne l'interdit : la query hérite de la politique globale (`staleTime: 30_000`, `refetchOnReconnect: true`, `networkMode: 'always'`). Dès que la query est périmée (30 s après le dernier `setQueryData` — donc après toute coupure réseau d'une durée réaliste), TanStack la refetch à la première occasion :

- au **retour du réseau** (`refetchOnReconnect: true`, explicite dans QUERY_POLICY) — exactement au moment où le rejeu devrait partir ; la `queryFn` rend `[]` et `setQueryData` remplace la file en attente par un tableau vide ;
- à l'**invalidation globale** — `queryClient.invalidateQueries()` sans filtre (offline-panel.tsx:242, bouton « Vider le cache local ») invalide aussi la query outbox active et la refetch ;
- au **montage d'une query restaurée périmée** — après un reload, `restoreOfflineCache` hydrate une file datée ; le premier observateur (`OutboxBadgeWatcher`, monté en permanence) déclenche le refetch de fond.

Dans les trois cas, les écritures pendantes (le seul état qui justifie la phase 34) sont détruites côté client avant leur rejeu. Les tests (`use-outbox.test.ts`) vérifient l'absence de fetch uniquement dans la seconde qui suit l'ensemencement — la fenêtre où la query est fraîche — donc le scénario n'est couvert par aucun test. Le cas « bouton Vider le cache local » est le plus court à reproduire : la file est vidée par la même action que le cache.

**Fix:** Rendre la query structurellement inrefetchable, pas disciplinaire :

```ts
const query = useQuery({
  queryKey: [...OUTBOX_KEY, userId, householdId],
  enabled: Boolean(userId && householdId),
  staleTime: Infinity,
  gcTime: Infinity, // ou valeur couvrant l'horizon de persistance, comme les annexes
  refetchOnReconnect: false,
  refetchOnWindowFocus: false,
  retry: false,
  queryFn: () => [] as OutboxEntry[],
});
```

Et ajouter un test qui doit échouer sur l'état actuel : ensemencer la file, avancer au-delà de `staleTime`, appeler `client.invalidateQueries()` (ou `onlineManager.setOnline(true)`), et vérifier que les entrées survivent. Une seconde ceinture : dans `query-persistence.ts`, exclure les clés `[table]` `outbox` du restore-puis-refetch est insuffisant seul — la garde doit vivre dans le hook.

### CR-02: La fusion D-04 remplace un `create` pendante par un `update` — l'entité n'est jamais créée côté serveur

**File:** `app/src/lib/offline/outbox.ts:143-150` (interagi avec `app/src/lib/offline/outbox-replay.ts:155-161` et `app/src/lib/data/supabase-adapter.ts:190-198`)

**Issue:** Hors ligne, un utilisateur crée un article (`prepareCreate` injecte un `id` client, l'entrée `create` part en file avec la clé `table:id`), puis modifie ce même article. L'échec réseau de l'`update` déclenche `enqueueOutbox` : la fusion D-04 filtre les entrées pendantes de même `table` + `key` — donc **retire le `create`** — et n'insère que l'`update`. Au rejeu, `replayEntry` appelle `adapter.update(table, id, values)` sur un `id` qui n'existe pas côté serveur : 0 ligne modifiée, `.select('*').single()` lève `PGRST116`, `classifyFailure` classe l'erreur terminale, l'entrée passe en `failed`. Résultat : la ligne n'est jamais créée, jamais rejouée, et le seul indice est un badge « 1 bloquée » — perte de données silencieuse sur un parcours banal (créer puis corriger une coquille avant le retour du réseau).

Le commentaire de `replayOutbox` (D-09, « un create avant son update ») suppose que les deux entrées coexistent ; la fusion les fait disparaître avant la passe.

**Fix:** Ne jamais faire disparaître un `create` pendante derrière un `update` de même entité — fusionner les valeurs dans le `create` :

```ts
// enqueueOutbox, branche create/update
const superseded = entries.find(
  (entry) => entry.status === 'pending' && entry.table === incoming.table && entry.key === incoming.key,
);
if (incoming.operation === 'update' && superseded?.operation === 'create') {
  client.setQueryData(key, [
    ...entries.filter((entry) => entry !== superseded),
    { ...superseded, values: { ...superseded.values, ...incoming.values }, enqueuedAt: incoming.enqueuedAt },
  ]);
  return;
}
```

(Le `client_key` du `create` est conservé : il reste la clé d'idempotence du rejeu.) Alternativement, faire replier `replayEntry` sur un `upsert` quand l'`update` cible 0 ligne — mais la fusion côté file est plus honnête : elle maintient l'invariant « une écriture finale par entité » sans brancher le moteur de rejeu sur un cas particulier.

## Warnings

### WR-01: `signOut` révoque la session serveur AVANT la vérification des écritures pendantes

**File:** `app/src/hooks/use-auth.ts:350-366` (avec `app/src/hooks/use-sign-out.ts:31-48`)

**Issue:** `signOut` appelle `supabase.auth.signOut()` dans le `try`, puis `session-store.signOut(options)` dans le `finally`. Si le goulot jette `OutboxPendingError` (écritures pendantes, sans acknowledgment), le jeton est **déjà révoqué côté serveur**. Si l'utilisateur annule la confirm-dialog, l'app reste `status: 'authenticated'` avec un jeton mort : chaque lecture/écriture suivante échoue 401, et le rejeu de la file ne peut plus partir. La protection D-17 crée l'état qu'elle prétend éviter.

**Fix:** Interroger la file AVANT la révocation — passer l'acknowledgment à un seul goulot, ou scanner la file avant `supabase.auth.signOut()` :

```ts
export async function signOut(options?: { acknowledgePendingWrites?: boolean }) {
  // D-17 : le scan précède la révocation — annuler la dialog laisse une session VALIDE.
  await useSessionStore.getState().assertSignOutAllowed(options); // jette OutboxPendingError
  try {
    if (supabase) await supabase.auth.signOut();
  } finally {
    await useSessionStore.getState().signOut({ ...options, skipPendingCheck: true });
  }
}
```

### WR-02: `useResource.mutate` annule l'overlay optimiste d'un update même quand l'écriture part en file

**File:** `app/src/lib/data/useResource.ts:199-212`

**Issue:** Sur échec de l'`update`, le catch restaure le snapshot sans distinguer refus métier et incident réseau (contrairement au chemin `create`, lignes 178-185, qui garde l'overlay sur échec réseau via `isNetworkFailure`). Hors ligne, l'update est pourtant enfilé dans l'outbox par le MutationCache : l'utilisateur voit son changement disparaître à l'écran + un toast d'erreur, alors que l'écriture s'appliquera au rejeu — et l'overlay absent tant que la ligne n'a pas été invalidée la fera diverger de la file jusqu'au rejeu. Incohérence de contrat entre les deux voies de la même couche.

**Fix:** Symétrie avec `create` :

```ts
} catch (error) {
  if (!isNetworkFailure(error)) queryClient.setQueryData<T[]>(key, snapshot);
  throw error;
}
```

### WR-03: Commentaires affirmant un « lecture Dexie pure / aucun appel réseau » que le code ne tient plus

**File:** `app/src/modules/courses/hooks/use-courses.ts:439-441`, `app/src/modules/courses/products-api.ts:124-125, 262-267`

**Issue:** Depuis le retrait du mode offline (D-10, phase 09/33), `findProductByEan` passe par `data.list` → adaptateur Supabase → réseau. Hors ligne, le re-scan d'un EAN connu lève une `DataError` réseau avant toute écriture d'article — le comportement « D-06 : re-scan hors ligne de produit connu » décrit par les commentaires n'existe plus. §2.7 I du dépôt : une documentation qui affirme une absence (ici, l'absence d'appel réseau) est une affirmation, elle se vérifie — et un lecteur qui y croit ne cherchera pas le chemin d'écriture mort.

**Fix:** Corriger les commentaires dans les trois copies (« lecture directe, échec réseau hors ligne — l'horizon offline du scan dépend du restore du cache de lecture, pas de cette fonction »), ou rétablir la lecture depuis le cache hydraté si le parcours scan hors ligne est toujours visé.

### WR-04: `deleteShoppingList` hors ligne enfille les suppressions d'articles puis échoue sur la liste

**File:** `app/src/modules/courses/api.ts:120-131` (avec `app/src/modules/courses/hooks/use-courses.ts:513-522`)

**Issue:** Hors ligne, les articles (allowlistés) sont supprimés via le mutateur Tier 1 et **enfilés** ; puis `data.remove(SHOPPING_LISTS_TABLE, id)` est refusé par la garde D-07 (table hors liste). À l'écran : « suppression impossible ». Au rejeu suivant : les articles partent, la liste vide reste côté serveur. L'utilisateur voit un échec alors que la moitié de sa demande s'appliquera quand même — et un état final (liste fantôme vide) qu'aucun écran ne confirme.

**Fix:** Ordonner l'inverse (liste d'abord : si elle part, les articles suivent ; si elle est refusée, rien n'est enfilé) :

```ts
await data.remove(SHOPPING_LISTS_TABLE, id);
await Promise.all(items.map((item) => removeItem(item.id)));
```

Et étendre la guard : si `removeItem` est allowlisté, la liste devrait l'être aussi ou le parcours entier devrait être refusé upfront quand la liste ne peut pas partir (sinon l'utilisateur coche « supprimer la liste » et garde une coquille vide).

## Info

### IN-01: Condition morte dans le contrôle de type photo

**File:** `app/src/modules/courses/components/product-sheet.tsx:155`

**Issue:** `!PHOTO_MIMES.includes(file.type) || file.type === 'image/svg+xml'` — `image/svg+xml` n'est pas dans `PHOTO_MIMES`, la seconde clause ne peut jamais changer le verdict. Le commentaire du tableau dit déjà « le SVG est refusé ».

**Fix:** Supprimer la clause redondante (le refus par liste fermée suffit), ou la documenter comme double ceinture explicite.

### IN-02: Chemins d'écriture brutes de l'onglet voyage hors de la file d'écriture

**File:** `app/src/modules/voyages/components/trip-courses-tab.tsx:124-139, 145-153`

**Issue:** `toggleItem`/`removeItem`/`deleteShoppingList` passent par des appels adaptateur bruts sans marque `meta` : hors ligne, l'échec remonte au toast sans enfilage, alors que la même action sur la page foyer s'enfile. Documenté « hors périmètre 34-05 » (api.ts:164-177), mais l'utilisateur ne voit pas la différence entre les deux listes.

**Fix:** À rattacher au chantier Tier 1 annoncé ; en attendant, un commentaire côté UI (pas seulement dans api.ts) éviterait qu'un contributeur y voie une régression.

### IN-03: Fusion d'options redondante dans `buildQueryClient`

**File:** `app/src/lib/query-policy.ts:138-143`

**Issue:** `...QUERY_POLICY, ...overrides` est immédiatement recouvert par les fusions explicites `queries:`/`mutations:` — le spread de premier niveau n'apporte rien (les deux seules clés de `DefaultOptions` sont justement ces deux blocs).

**Fix:** Conserver uniquement les deux fusions explicites ; le commentaire au-dessus décrit déjà exactement leur sémantique.

### IN-04: `serializePairs` réduit toute valeur non scalaire à `[object Object]`

**File:** `app/src/lib/offline/outbox.ts:97-103`

**Issue:** `String(value)` sur un objet (par ex. une valeur `jsonb` dans un `create` sans `id`) produit une clé d'identité constante : deux écritures aux valeurs objets différentes fusionneraient à tort. Aucune table allowlistée n'en porte aujourd'hui, mais la liste blanche est extensible et la fusion D-04 est destructrice (cf. CR-02).

**Fix:** Sérialiser les objets par `JSON.stringify` avec clés triées, et rejeter (ou hacher) les valeurs non sérialisables plutôt que de les aplatir silencieusement.

---

_Reviewed: 2026-11-05T12:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
