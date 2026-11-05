---
phase: 34-file-d-criture-rejeu
fixed_at: 2026-11-05T18:00:00Z
review_path: .planning/phases/34-file-d-criture-rejeu/34-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 34 : Code Review Fix Report

**Fixed at:** 2026-11-05T18:00:00Z
**Source review:** .planning/phases/34-file-d-criture-rejeu/34-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (CR-01, CR-02, WR-01, WR-02, WR-03, WR-04)
- Fixed: 6
- Skipped: 0

**Vérification (§2.7) :** chaîne complète exécutée dans le worktree isolé
`.claude/worktrees/rf-34-1225801-…` (node_modules lié par symlink au checkout
principal, jamais copié ni supprimé) :
- `npm run typecheck` — vert ;
- `npm test` — 234 fichiers, 1874 tests, 0 échec ;
- `npm run build` — build PWA produit (précache 150 entrées).
Chaque correctif critique/porteur de logique est prouvé par un test VU ROUGE
sur l'état pré-fixe, puis vert après correctif (§2.7 B : un contrôle se
prouve sur un cas qui doit échouer).

## Fixed Issues

### CR-01: La query outbox est refetchable — un refetch écrase la file

**Files modified:** `app/src/hooks/use-outbox.ts`, `app/src/hooks/use-outbox.test.ts`
**Commit:** db32ce7
**Applied fix:** Double ceinture structurelle, plus forte que la suggestion initiale : (1) `staleTime: Infinity`, `gcTime: Infinity`, `refetchOnReconnect/refetchOnWindowFocus/retry` à `false` — la query ne peut plus devenir périmée ni partir au reconnect/focus ; (2) la `queryFn` rend désormais l'état ACTUEL de la file (`queryClient.getQueryData(queryKey) ?? []`) au lieu d'un `[]` constant — car la ceinture 1 est insuffisante : une `invalidateQueries()` sans filtre (bouton « Vider le cache local » du panneau) refetch les queries **actives même fraîches**. Même un refetch forcé ne peut plus détruire la file. Deux tests ajoutés (invalidation globale + refetchOnReconnect après péremption), **vus rouges sur l'état pré-fixe (2 failed)** avant d'être verts. La découverte « invalidateQueries refetch les queries actives même fraîches » invalide la suggestion littérale du reviewer — documentée dans les commentaires du hook.
**Statut : fixed: requires human verification** (logique de refetch — la preuve est testée, mais la garantie « aucune écriture pendante n'est perdue » mérite une relecture humaine).

### CR-02: La fusion D-04 remplace un create pendante par un update

**Files modified:** `app/src/lib/offline/outbox.ts`, `app/src/lib/offline/outbox.test.ts`
**Commit:** 6eaf9a2
**Applied fix:** Dans `enqueueOutbox`, quand l'écriture entrante est un `update` et que la pendante de même entité est un `create`, les valeurs de l'update sont fusionnées DANS le create (qui conserve son `client_key`, clé d'idempotence du rejeu) au lieu de remplacer l'entrée. Le cas update-sur-update et create-sur-pendente conserve le comportement D-04 existant. Test « create puis update = UN create fusionné » ajouté, **vu rouge sur l'état pré-fixe** avant d'être vert. Les 21 tests D-04/D-05 existants restent verts (aucune régression de la fusion).

### WR-01: signOut révoquait la session serveur avant le scan de la file

**Files modified:** `app/src/hooks/use-auth.ts`, `app/src/hooks/use-auth.test.ts`, `app/src/stores/session-store.ts`
**Commit:** 4add203
**Applied fix:** Nouvelle fonction exportée `assertSignOutAllowed(options)` dans `session-store.ts` (scan pur, aucune purge) — appelée par `use-auth.signOut` AVANT `supabase.auth.signOut()`. Si des écritures pendantes rejettent (`OutboxPendingError`), le jeton serveur est encore valide : annuler la dialog laisse une session réellement fonctionnelle. Le scan dans le goulot `session-store.signOut` reste en place (ceinture pour les chemins qui n'ont pas scanné : listener SIGNED_OUT, bootstrap). Deux tests ajoutés — le refus de révocation **vu rouge sur l'état pré-fixe (2 failed)**.
**Statut : fixed: requires human verification** (ordre de révocation — comportement auth sensible).

### WR-02: useResource.mutate annulait l'overlay optimiste d'un update même sur échec réseau

**Files modified:** `app/src/lib/data/useResource.ts`, `app/src/lib/data/useResource.test.ts`
**Commit:** 2233e84 (+ 10f3552 types du mock)
**Applied fix:** Symétrie avec la voie `create` (Pitfall 7) : le catch ne restaure le snapshot que si `!isNetworkFailure(error)` — sur échec réseau l'overlay reste peint (l'update est enfilé, le rejeu réconciliera), seul un refus métier (RLS…) remet l'écran en l'état. Deux tests (overlay conservé sur TypeError ; overlay retiré sur code 42501), le premier **vu rouge sur l'état pré-fixe**.

### WR-03: Commentaires affirmant une lecture « sans réseau » que le code ne tient plus

**Files modified:** `app/src/modules/courses/hooks/use-courses.ts`, `app/src/modules/courses/products-api.ts`
**Commit:** 57631fc
**Applied fix:** Les trois copies corrigées (§2.7 I) : `findProductByEan` et ses deux sites d'appel disent désormais « lecture directe via l'adaptateur — un appel réseau depuis le retrait du mode offline (D-10) ; hors ligne, un produit connu lève une DataError ; l'horizon offline du scan dépend du restore du cache de lecture (phase 33) ». Un `grep` sur les motifs (« Dexie pure », « aucun appel réseau », « sans jamais toucher au réseau ») confirme qu'aucune autre copie métier ne subsiste (les autres occurrences concernent des gardes clientes, hors sujet).

### WR-04: deleteShoppingList enfila les articles puis échouait sur la liste

**Files modified:** `app/src/modules/courses/api.ts`, `app/src/modules/courses/hooks/use-courses.ts`, `app/src/modules/courses/delete-shopping-list.test.ts`
**Commit:** f6446d4
**Applied fix:** Ordre inversé : `data.remove(SHOPPING_LISTS_TABLE, id)` d'abord, puis les articles — si la liste est refusée (D-07 hors ligne), rien n'est enfilé ; si elle part, les articles suivent. Commentaires mis à jour dans les deux fichiers. Nouveau test unitaire `delete-shopping-list.test.ts` avec adaptateur mocké — le harnais `courses-offline-writes.test.tsx` ne peut pas porter cette preuve (son faux client ignore l'op `delete`) ; le test « refus de la liste avant tout enfilage » est **vu rouge sur l'état pré-fixe** (removeItem appelé 2 fois) avant d'être vert.

## Skipped Issues

None — all in-scope findings were fixed. (IN-01..IN-04 hors périmètre `critical_warning`.)

---

_Fixed: 2026-11-05T18:00:00Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
