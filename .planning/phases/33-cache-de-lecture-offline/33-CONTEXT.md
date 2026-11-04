# Phase 33: Cache de lecture offline - Context

**Gathered:** 2026-11-04
**Status:** Ready for planning

<domain>
## Phase Boundary

En avion, l'utilisateur relit le dernier état connu de ses données Tier 1 (Courses, Tâches, Routines) depuis un cache TanStack Query **persisté** (IndexedDB), restauré au démarrage **avant le premier rendu des routes protégées**, avec un bandeau honnête « dernier état connu le [horodatage] ». Une allowlist (dans `query-policy.ts`) nomme les familles éligibles avec un maxAge par famille ; hors allowlist, l'erreur d'origine s'affiche (comportement `networkMode: 'always'` existant). Le cache est namespacé par (utilisateur, foyer) et purgé de manière attendue (await) à la déconnexion et au changement de foyer — preuve par test d'appareil partagé simulé. Le service worker ne cache jamais une réponse API — contrôle statique §2.7 prouvé sur un cas qui doit échouer.

**Hors périmètre :** la file d'écriture et son rejeu (phase 34 — la gate stub `use-outbox-gate` de la 32-02 est déjà posée), les deep links et la vue « Tâches du jour » dédiée (phase 35), le retour du mode démo Dexie (retiré du prod en phase 09, D-10 — l'offline ici passe par la persistance TanStack Query, pas par Dexie), toute écriture offline.

</domain>

<decisions>
## Implementation Decisions

### Mécanisme de persistance
- **D-01:** Mécanisme = **`persistQueryClient` + `createAsyncStoragePersister`** (TanStack v5), restauré via `restoreQueries` avant le premier rendu des routes protégées (OFFR-01). La restriction par allowlist se fait **au moment de la sérialisation** (filtre dehydrate/persist), pas au moment de la lecture. — **Reversibility:** reversible.
- **D-02:** Support de stockage = **IndexedDB** (idb-keyval ou wrapper léger), pas localStorage — quota confortable, asynchrone natif, cohérent avec une restauration déjà « attendue » dans ce schéma. — **Reversibility:** reversible.

### Namespacing & purge (OFFR-04)
- **D-03:** Une **clé de stockage par couple (user_id, household_id)** : chaque foyer d'un utilisateur multi-foyers a son cache séparé. La déconnexion purge **toutes** les clés de l'utilisateur. — **Reversibility:** reversible.
- **D-04:** Purge **systématique** au changement de foyer (clé persistée du foyer quitté + `queryClient.clear()`), pas de rétention inter-foyers — le plus sûr sur appareil partagé ; coût accepté = refetch complet au retour sur un foyer. — **Reversibility:** reversible.
- **D-05:** La purge est **awaitée dans `signOut()`** (`use-auth.ts`, qui vide déjà les stores session D-07 de la phase 25) **avant** la navigation vers la landing ; un échec de purge bloque la déconnexion avec toast d'erreur. Pas de fire-and-forget. — **Reversibility:** reversible.
- **D-06:** Preuve d'appareil partagé simulé (OFFR-04) = **test automatisé avec fake-indexeddb** (déjà dans la chaîne pour Dexie) : user A consulte, déconnexion attendue, user B se connecte, lecture du stockage brut prouvant qu'aucune entrée de A ne survit. Rejouable dans `npm test`. — **Reversibility:** reversible.

### Allowlist & maxAge (OFFR-03)
- **D-07:** La allowlist vit **dans `query-policy.ts`**, à côté de `QUERY_POLICY` — même logique de source unique (un test refuse déjà tout `new QueryClient(` en ligne ailleurs). Familles = préfixes de queryKey existants de `useResource`. — **Reversibility:** reversible.
- **D-08:** maxAge **par famille** (pas par table) — lisible et prévisible ; suffisant pour l'honnêteté OFFR-02/03. — **Reversibility:** reversible.
- **D-09:** maxAge dépassé hors ligne → **cache ignoré, état vide honnête** (« données non disponibles hors ligne »), jamais de données jugées trop vieilles rendues comme si de rien n'était. Cohérent avec D-10 (erreur d'origine) et `networkMode: 'always'`. — **Reversibility:** reversible.
- **D-10:** La allowlist Tier 1 comprend les **familles annexes de rendu** : `household_members`, `profiles` (maxAge long, ~7 j) — sans elles, les listes Courses/Tâches s'affichent avec des trous d'avatars/noms d'assignés. — **Reversibility:** reversible.

### Bandeau stale (OFFR-02)
- **D-11:** Le bandeau « dernier état connu le [horodatage] » vit dans le **slot bannières hauts** (`banner-store` de la 32-02), priorité sous le bandeau de mise à jour. Un seul bandeau global, pas de bandeau inline par vue. — **Reversibility:** reversible.
- **D-12:** L'horodatage affiché = **MIN des `dataUpdatedAt`** des queries Tier 1 rendues depuis le cache — la date la plus prudente, jamais la plus flatteuse. — **Reversibility:** reversible.
- **D-13:** Bandeau visible **uniquement hors ligne** (`useOnlineStatus`, qui lit `onlineManager` — source réseau unique) quand des données Tier 1 sont rendues depuis le cache. En ligne, pas de bandeau : ce serait du bruit. — **Reversibility:** reversible.

### the agent's Discretion
- OFFR-05 (preuve statique que le SW ne cache jamais l'API) : l'agent choisit la forme du contrôle statique §2.7 — étendre la denylist de navigation existante (`src/sw.ts`) en preuve couvrant le runtime cache (aucun `registerRoute` cacheable sur les routes API), avec un cas qui doit échouer vu rouge avant vert.
- Valeurs précises de maxAge par famille (ordre de grandeur proposé : données vivantes 24 h, annexes 7 j) — l'agent affine.
- Choix du package IndexedDB (idb-keyval vs wrapper maison) — l'agent décide selon la taille d'empreinte.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requis & roadmap
- `.planning/ROADMAP.md` §Phase 33 — Goal, Success Criteria 1-5 (dont OFFR-05 : contrôle statique vu rouge)
- `.planning/REQUIREMENTS.md` — OFFR-01 à OFFR-05 (Phase 33) ; WRQ-01…06 (Phase 34, hors périmètre mais la frontière de composant compte)

### Convictions projet
- `AGENTS.md` §2.7 — chaîne de vérification avant commit ; contrôle statique prouvé sur un cas qui doit échouer ; « un succès muet est un échec inexpliqué »
- `AGENTS.md` §2.6 — données sensibles : aucun média public, RLS frontière finale (le cache client n'affaiblit pas la RLS)

### Phase 32 (infra posée, à consommer)
- `.planning/phases/32-install-raccourcis/32-CONTEXT.md` — D-04 (slot bannières hauts partagé avec le bandeau stale), D-10 (gate outbox stub), D-11/D-12 (panneau offline)
- `app/src/lib/query-policy.ts` — QUERY_POLICY source unique + garde de classe (Test E)
- `app/src/hooks/use-outbox-gate.ts` — stub posé, la phase 34 le remplira

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/src/lib/query-policy.ts` — `buildQueryClient` fabrique unique ; le persister et la allowlist s'y raccrochent
- `app/src/hooks/use-online-status.ts` — état réseau unique via `onlineManager`, prêt pour le bandeau
- `app/src/components/banners/banner-store.ts` — slot de bandeaux hauts empilables/priorisés (32-02), réceptacle du bandeau stale
- `app/src/hooks/use-auth.ts` — `signOut()` vide déjà les stores (D-07) : point d'ancrage de la purge
- `app/src/lib/data/useResource.ts` — queryKeys structurés `[table, householdId, filter, selectKey]` : les préfixes de famille pour la allowlist existent déjà
- fake-indexeddb — déjà dans la chaîne de test (pour Dexie), réutilisable pour la preuve OFFR-04

### Established Patterns
- Source unique + garde de classe (`query-policy.ts`, AGENTS.md §2.7 E) : corriger la classe, pas l'instance
- `networkMode: 'always'` : hors ligne, une lecture échoue honnêtement → `ErrorState` ; le offline cache ne doit PAS changer ce réseauMode, il offre des données restaurées AVANT l'échec
- Le SW est en `injectManifest` avec denylist de navigation API — ne jamais passer en generateSW, ne jamais toucher `skipWaiting`/`clientsClaim` hors décision explicite

### Integration Points
- `app/src/main.tsx` — point de restauration (`restoreQueries`) avant montage des routes protégées
- `app/src/app/router.tsx` — `QueryClientProvider` client unique
- `app/src/hooks/use-auth.ts` — `signOut()` (purge awaitée)
- `app/src/stores/household-store.ts` — `switchHousehold` (purge au changement de foyer)
- `app/src/sw.ts` — denylist à prouver (OFFR-05), ne rien y cacher d'API

</code_context>

<specifics>
## Specific Ideas

- L'honnêteté est le fil conducteur : une donnée rendue du cache n'est JAMAIS présentée comme fraîche (bandeau horodaté), une donnée trop vieille n'est pas rendue du tout (état vide honnête), un module hors allowlist garde son erreur d'origine.
- Le point dur d'OFFR-04 est la purge **attendue avant navigation** — pas « vite fait après ». L'échec de purge bloque la déconnexion plutôt que de laisser des données.
- Frontière de composant avec la phase 34 : cette phase ne pose QUE la lecture ; la gate `use-outbox-gate` reste un stub, la file d'écriture n'est pas touchée.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 33-Cache de lecture offline*
*Context gathered: 2026-11-04*
