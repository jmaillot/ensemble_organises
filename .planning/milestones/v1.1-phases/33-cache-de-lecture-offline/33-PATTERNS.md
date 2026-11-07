# Phase 33: Cache de lecture offline - Pattern Map

**Mapped:** 2026-11-04
**Files analyzed:** 13 (4 nouveaux code, 5 modifiés, 4 artefacts de preuve)
**Analogs found:** 13 / 13

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/src/lib/offline/query-persistence.ts` (nouveau) | service | file-I/O (IndexedDB) + CRUD | `app/src/lib/query-policy.ts` (fabrique/source unique) + `app/src/lib/sw-register.ts` (module de câblage hors-React) | role-match |
| `app/src/lib/query-policy.ts` (modifié : `OFFLINE_FAMILIES`, `gcTime` ↑) | config | transform | lui-même — étendre la source unique existante | exact |
| `app/src/hooks/use-auth.ts` (modifié : restore avant `setReady(true)`) | hook (bootstrap) | event-driven | `applySession` du même fichier (chaîne await existante) | exact |
| `app/src/stores/session-store.ts` (modifié : purge awaitée dans `signOut`) | store | event-driven | `signOut` du même fichier (ligne 46-49) | exact |
| `app/src/stores/household-store.ts` (modifié : purge au switch) | store | event-driven | `switchHousehold` du même fichier (ligne 68) | exact |
| `app/src/hooks/use-offline-stale-banner.ts` (nouveau) | hook | pub-sub (cache subscribe + onlineManager) | `app/src/hooks/use-online-status.ts` | role-match |
| `app/src/components/banners/offline-stale.tsx` (nouveau) | component | request-response | `app/src/components/banners/update-banner.tsx` | exact |
| `scripts/check-sw-api-cache.sh` (nouveau) | utility (contrôle statique §2.7) | batch | `scripts/check-precache-coverage.sh` | exact |
| `scripts/test-check-sw-api-cache.sh` + fixtures (nouveau) | test | batch | `scripts/test-check-sql-statique.py` (grammaire contre-preuve) | role-match |
| `app/src/lib/offline/query-persistence.test.ts` (nouveau) | test | file-I/O | `app/src/test/setup.ts` (fake-indexeddb) + tests store existants | role-match |
| `app/src/hooks/use-offline-stale-banner.test.ts` (nouveau) | test | unit | `app/src/components/banners/banner-store.test.ts` | role-match |
| `app/src/components/banners/offline-stale.test.tsx` (nouveau) | test (RTL) | unit | `app/src/components/banners/update-banner.test.tsx` | exact |
| `app/e2e/offline-shared-device.spec.ts` (nouveau) | test (e2e) | request-response | parcours e2e existants (`app/e2e/`) | role-match |

## Pattern Assignments

### `app/src/lib/offline/query-persistence.ts` (service, IndexedDB)

**Analog :** `app/src/lib/query-policy.ts` — le pattern **source unique + commentaire WHY en français** (AGENTS.md §2.7 E, pas de linter). Toute la logique offline (persister, clés, restore, purge, prune) vit dans ce module ; aucun site d'appel ne recopie les clés ni les préfixes.

**Imports pattern** (`query-policy.ts` lignes 1-2, forme du dépôt : alias `@/`, imports typés `type`) :
```typescript
import { QueryClient, type DefaultOptions } from '@tanstack/react-query';
```

**Shape à imiter** (`query-policy.ts` lignes 28-50) : constantes exportées documentées par un bloc `/** POURQUOI … */`, garde par test (Test E refuse tout `new QueryClient(` hors de ce fichier — même garde attendue pour les clés de cache : tout `eo-query-cache:` littéral hors de `query-persistence.ts` est un défaut de classe).

**API à câbler** (RESEARCH Pattern 1, doc TanStack) :
```typescript
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { createStore, get, set, del, entries } from 'idb-keyval';

const cacheStore = createStore('eo-offline-cache', 'query');
export function cacheKey(userId: string, householdId: string) {
  return `eo-query-cache:${userId}:${householdId}`; // D-03, source unique du format
}
```

### `app/src/lib/query-policy.ts` (modifié)

**Analog :** lui-même. Étendre sans casser la garde existante :

- Ajouter `OFFLINE_FAMILIES` **à côté** de `QUERY_POLICY` (D-07), même style de commentaire justifié.
- Monter `gcTime` (≥ 7 jours, Pitfall 1) — les tests qui surchargent `gcTime: 0` via `buildQueryClient(overrides)` restent verts grâce à la fusion un-niveau (lignes 60-68, à préserver tel quel).
- `networkMode: 'always'` (ligne 39) et `refetchOnReconnect: true` (ligne 44) : **ne pas toucher**.

Familles (préfixes = `queryKey[0]` réels, cf. `useResource.ts` lignes 13-15 : `[table, householdId, filter, selectKey]`) — RESEARCH Pattern 2 donne la liste : `shopping_lists`, `shopping_list_items`, `products`, `task_lists`, `tasks`, `routine_folders`, `routines`, `routine_completions` (24 h) + `household_members`, `profiles` (7 j, D-10).

### `app/src/hooks/use-auth.ts` + `app/src/stores/session-store.ts` (modifiés — restore & purge)

**Analog :** les chaînes `await` existantes du fichier.

**Point de restauration (OFFR-01)** — `use-auth.ts` lignes 166-194 : la restauration s'insère entre `await applySession(session.user)` (ligne 183) et `setReady(true)` (ligne 193). Le commentaire du fichier (lignes 189-192) énonce déjà le contrat : « session ET foyer posés avant le premier rendu » — le cache restauré rejoint le même contrat. Ne pas rendre les modules avant `pruneExpiredFamilies`.

**Point de purge (D-05)** — le goulot unique est `session-store.ts` lignes 46-49, **pas** seulement `use-auth.ts` lignes 307-315 :
```typescript
// session-store.ts (existant) — TOUS les chemins y passent :
signOut: async () => {
  set({ user: null, status: 'guest', householdLoaded: false });
  useHouseholdStore.getState().reset();
},
```
Chemins appelants vérifiés : `use-auth.ts` lignes 149 (branche local sans user), 176 (pas de session), 198-199 (listener `SIGNED_OUT`), 307-315 (`signOut()` exporté, avec `finally`). RESEARCH Pitfall 4 : purger uniquement dans `use-auth.ts` laisserait les 3 autres chemins sans purge. Forme à écrire (lire `user.id` AVANT d'effacer l'état, échec = throw, jamais avalé §2.7 F) :
```typescript
signOut: async () => {
  const userId = get().user?.id;                       // AVANT l'effacement
  try {
    await purgeUserCache(userId);
  } catch (cause) {
    throw cause; // D-05 : bloque la déconnexion, toast à l'appelant
  }
  set({ user: null, status: 'guest', householdLoaded: false });
  useHouseholdStore.getState().reset();
},
```
Pitfall 7 : `userId` peut être null (démo) — purge no-op explicitement commentée. Pitfall 6 : conserver l'`unsubscribe` de `persistQueryClient` et unsubscrire AVANT purge.

### `app/src/stores/household-store.ts` (modifié — D-04)

**Analog :** `switchHousehold` ligne 68 (setter zustand **sync**) :
```typescript
switchHousehold: (householdId, householdName) => set({ householdId, householdName }),
```
La purge est async : RESEARCH Pitfall 5 impose l'ordre strict `purge(await) → queryClient.clear() → switchHousehold(...)` dans une **action async encapsulante** (point d'appel : sélecteur de foyer des paramètres — le planner localise l'appelant). Ne pas rendre le setter async ; le setter reste la dernière étape.

### `app/src/hooks/use-offline-stale-banner.ts` (nouveau — hook pub-sub)

**Analog :** `app/src/hooks/use-online-status.ts` (lignes 21-27) — pattern complet à copier :
```typescript
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => onlineManager.subscribe(onStoreChange),
    () => onlineManager.isOnline(),
    () => true,
  );
}
```
Le bloc `/** POURQUOI CETTE SOURCE … */` (lignes 4-20) est la grammaire du dépôt pour un hook qui délègue à un store externe TanStack : le hook stale-banner applique la même discipline — `useOnlineStatus()` pour le réseau (jamais `navigator.onLine`), `queryCache.subscribe` + `queryClient.getQueryCache()` pour MIN(`dataUpdatedAt`) des familles Tier 1 vivantes (pas les annexes, D-12), et `useBannerStore.push/dismiss` pour le slot. Référence stable entre rendus (le commentaire du banner-store, lignes 29-32, explique pourquoi le tri se fait à l'écriture).

### `app/src/components/banners/offline-stale.tsx` (nouveau — component)

**Analog :** `app/src/components/banners/update-banner.tsx` (40 lignes, à copier presque tel quel) :
```tsx
import { Button } from '@/components/ui/button';
import { useBannerStore } from './banner-store';

export function UpdateBanner({ updateSW }: UpdateBannerProps) {
  const dismiss = useBannerStore((s) => s.dismiss);
  return (
    <div role="status"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-[inherit] py-3 text-sm">
      <p className="m-0">Une mise à jour est disponible</p>
      ...
      <Button variant="quiet" onClick={() => dismiss('sw-update')}>Plus tard</Button>
    </div>
  );
}
```
À transposer : `kind: 'offline-stale'`, `role="status"`, mêmes classes (`border-b border-border bg-surface px-[inherit] py-3 text-sm`), bouton « Fermer » (ou pas de bouton : le bandeau se retire seul au retour réseau via D-13 — décision planner). Horodatage : `format(date, "d MMM 'à' HH:mm", { locale: fr })` (date-fns v4 déjà présent). Priorité **supérieure** à celle du bandeau `sw-update` (D-11 : rendu dessous) — lire la priorité posée par le branchement dans `app/src/lib/sw-register.ts` et dépasser.

### `scripts/check-sw-api-cache.sh` (nouveau — contrôle statique §2.7)

**Analog :** `scripts/check-precache-coverage.sh` (49 lignes, copier la structure intégralement) :
```sh
#!/bin/sh
# commentaire POURQUOI en tête (3 lignes)
set -eu
cd "$(dirname "$0")/../app"
test -d dist || { echo "ECHEC: dist/ absent — lancer d'abord 'npm run build' dans app/."; exit 1; }
test -f dist/sw.js || { echo "ECHEC: dist/sw.js absent ..."; exit 1; }
# ... compteurs, messages "ECHEC:" explicites, message final "OK"
```
Vérifications attendues (RESEARCH Pattern 6) : (1) les cinq motifs de denylist présents dans `dist/sw.js` (`/^\/rest\//`, `/^\/auth\//`, `/^\/functions\//`, `/^\/realtime\//`, `/^\/storage\//`) ; (2) aucun `CacheFirst`/`StaleWhileRevalidate`/`NetworkFirst`/`CacheableResponsePlugin` dans `dist/sw.js` ; (3) aucun `registerRoute(` hors NavigationRoute dans `app/src/sw.ts` (lignes 137-141 = seul site légitime). Contre-preuve `scripts/test-check-sw-api-cache.sh` : fixture `sw-bon.js` doit passer, fixture `sw-mauvais.js` (CacheFirst sur `/rest/v1/`) doit échouer — grammaire `scripts/test-check-sql-statique.py` (« vu rouge avant vert »).

**sw.ts à NE PAS toucher** : le contrôle prouve l'existant ; `injectManifest`, `skipWaiting`/`clientsClaim` verrouillés (RESEARCH, contrat v1.1).

## Shared Patterns

### Source unique + garde de classe (§2.7 E)
**Source :** `app/src/lib/query-policy.ts` (lignes 17-26, commentaire canonique) — « corriger la classe, pas l'instance ». **Apply to :** `query-persistence.ts` (clés de cache), `query-policy.ts` (allowlist). Chaque garde Test E existante s'étend : un littéral de clé ou de préfixe de famille recopié hors de son module est un défaut.

### Commentaire WHY en français, pas de directive de linter
**Source :** tous les analogs lus (`query-policy.ts`, `session-store.ts`, `banner-store.ts`, `use-online-status.ts`). **Apply to :** tout nouveau fichier. Un effet dont on omet une dépendance porte un commentaire qui **nomme la raison** (jamais « dépendances omises »).

### Purge awaitée, échec explicite (§2.7 F)
**Source :** `session-store.ts` lignes 46-49 (forme sync actuelle) + `use-auth.ts` lignes 307-315 (`finally` qui ne laisse jamais un état mensonger). **Apply to :** `signOut` (purge) et `switchHousehold` (ordre purge → clear → switch). Jamais `void purge()`.

### Bandeaux : store dédupliqué par kind, tri à l'écriture
**Source :** `app/src/components/banners/banner-store.ts` lignes 24-43 (`push` remplace le kind existant, `sorted` recalculé à l'écriture). **Apply to :** `use-offline-stale-banner.ts` — push/dismiss `kind: 'offline-stale'`, ne jamais recréer un second slot.

### Contrôle statique prouvé (§2.7 B)
**Source :** `scripts/check-precache-coverage.sh` (échecs explicites, `set -eu`) + `scripts/test-check-sql-statique.py` (cas qui doit échouer). **Apply to :** `check-sw-api-cache.sh` + `test-check-sw-api-cache.sh` + fixtures.

### État réseau unique
**Source :** `app/src/hooks/use-online-status.ts` / `seedOnlineStatus()` appelé au niveau module dans `main.tsx` ligne 25. **Apply to :** le hook du bandeau ; ne jamais écouter `window.ononline` soi-même.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `app/e2e/offline-shared-device.spec.ts` | test e2e | — | Premier test Playwright offline (`context.setOffline`) — suivre le shape des specs e2e existantes, la partie offline est neuve |

## Metadata

**Analog search scope:** `app/src/lib`, `app/src/hooks`, `app/src/stores`, `app/src/components/banners`, `scripts/`
**Files scanned:** 9 en lecture complète + globs `app/e2e/`
**Pattern extraction date:** 2026-11-04
