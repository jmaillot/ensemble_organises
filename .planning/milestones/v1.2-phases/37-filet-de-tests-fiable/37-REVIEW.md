---
phase: 37-filet-de-tests-fiable
reviewed: 2026-11-08T12:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - app/e2e/offline-shared-device.spec.ts
  - app/src/hooks/__tests__/auth-bootstrap-offline.test.tsx
  - app/src/lib/supabase/session-cache.ts
  - app/src/modules/ardoise/api.ts
  - app/src/modules/ardoise/guest-ardoise-page.test.tsx
  - app/src/modules/ardoise/guest-ardoise-page.tsx
  - app/src/modules/landing/welcome-page.test.tsx
  - app/src/modules/landing/welcome-page.tsx
  - app/src/stores/session-store.test.ts
  - app/src/stores/session-store.ts
  - docs/RETROSPECTIVE.md
findings:
  critical: 0
  warning: 5
  info: 2
  total: 7
status: issues_found
---

# Phase 37: Code Review Report

**Reviewed:** 2026-11-08T12:00:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Scope: phase 37 changes since `fb6a27e^` — TEST-04 session purge (`purgerStockageSession` + chokepoint wiring + unit/e2e assertions), auth test hardening (waitFor bounds), gap G-37-2 (welcome-page real sign-out, guest ardoise join branch).

The core TEST-04 work is sound: `purgerStockageSession()` reuses `cleStockageSession()` (single naming source), the chunked-fragment loop mirrors the reader, the chokepoint ordering (stopPersisting → purgeUserCache → queryClient.clear → purge GoTrue key → state reset) is correct and covered by an order-proving test with a red-before-green capture. The welcome-page sign-out correctly goes through the D-17 `useSignOutWithConfirm` goulot with the dialog mounted once. Comments are in French and cite reasons; no linter directives found; no secret-key usage from client code (only publishable key in Edge calls, RLS remains the boundary).

All five warnings are in the G-37-2 guest ardoise join branch and its error paths — the new UI code got less verification rigor than the purge mechanism it ships alongside. No blockers.

## Warnings

### WR-01: La marche « bon compte » est gatée sur une heuristique de copie serveur

**File:** `app/src/modules/ardoise/guest-ardoise-page.tsx:196`
**Issue:** `{/foyer/i.test(joinError) ? …}` décide d'afficher l'aide « Connectez-vous avec le bon compte » en cherchant le mot « foyer » dans le message d'erreur. Le texte du message est détenu par l'Edge Function (`ardoise-invite`) : un rewording serveur (« Vous n'êtes pas membre… », « rattachement refusé ») fait disparaître l'aide sans aucun changement client, et inversement toute erreur non liée (500 dont le message cite le foyer, erreur réseau relayée) affiche un conseil de changement de compte trompeur. Le commentaire de la page affirme « le 403 … s'affiche tel quel, jamais maquillé » — or rien ne distingue un 403 d'un 500 ici.
**Fix:** Propager le statut HTTP (voir WR-02) et gater l'aide sur `status === 403`, ou faire renvoyer à l'Edge un code machine (`error_code: 'not_household_member'`) alongside the message.

### WR-02: `callArdoiseInvite` jette le statut HTTP ; toute erreur devient un message générique

**File:** `app/src/modules/ardoise/api.ts:306-309`
**Issue:** `if (!response.ok)` lit le corps JSON puis lève un `Error` sans le statut. Les appelants (join G-37-2, `link-view`) ne peuvent pas distinguer 403 (comportement correct du modèle binaire, documenté comme tel) d'un 500 ou d'un 401. Le module dispose déjà du pattern pour cela (`SettlementRequestError` porte un `status`, lignes 668-676) — la classe existe, elle n'est pas utilisée ici.
**Fix:**
```ts
if (!response.ok) {
  const detail = await response.json().catch(() => null);
  throw new SettlementRequestError(response.status, detail?.error ?? 'Partage impossible.');
}
```

### WR-03: Copie d'erreur « lien révoqué » affichée pour tout échec de `link-view`, garde `isSupabaseConfigured` contournée via l'URL

**File:** `app/src/modules/ardoise/guest-ardoise-page.tsx:41-44,127-133`
**Issue:** (a) Le chemin `openLink` garde `isSupabaseConfigured` (lignes 61-64) mais l'initialisation `activeCode` depuis `?code=` de l'URL ne le fait pas : en mode démo / non configuré, un deep link lance la query, `callArdoiseInvite` lève « Edge Function indisponible. », et la page affiche « Ce lien ne passe plus (code révoqué ou expiré) » — un diagnostic faux pour un échec d'environnement. (b) Même en configuré, une panne réseau ou un 5xx produit la même copie « révoqué ou expiré » : le message affirme une cause (révocation/expiration) que le code n'a pas déterminée (§2.7-I : une affirmation se vérifie).
**Fix:** Gater `activeCode` initial sur `isSupabaseConfigured` (même message « Connexion au serveur indisponible » que le formulaire), et distinguer au minimum l'erreur réseau/5xx de la réponse 404/410 du code invalide.

### WR-04: Le lien invité public expose les soldes des membres `enfant`, exclus partout ailleurs

**File:** `app/src/modules/ardoise/guest-ardoise-page.tsx:74` (cause racine : `app/src/modules/ardoise/api.ts:723`)
**Issue:** `toServerBalances(view.settlement, [])` est appelé avec un index de membres vide. Le filtre d'exclusion des enfants — `row.kind === 'membre' ? index.get(row.participant_id)?.role !== 'enfant' : true` — devient `undefined !== 'enfant'` → vrai : tout membre enfant passe. Dans le module Ardoise authentifié, les enfants sont exclus des soldes (commentaire lignes 713-719 : « les enfants en sont exclus ») ; sur la page PUBLIQUE par lien — accessible à un externe anonyme — leur nom et leur solde s'affichent. L'exclusion est une propriété d'affichage du produit ; le lien invité la contredit et vers l'extérieur, la surface la plus large.
**Fix:** Filtrer sans dépendre du store : si le payload serveur ne porte pas le rôle, exclure côté Edge dans `link-view`, ou passer au moins les membres du foyer quand la session le permet et documenter l'écart ; à défaut, faire porter `role` par les `balances` du contrat serveur.

### WR-05: État de join non réinitialisé au changement de code — message de succès égaré sur une autre ardoise

**File:** `app/src/modules/ardoise/guest-ardoise-page.tsx:58-71,188-216`
**Issue:** `openLink` (et le retour du `ErrorState` via `setActiveCode(null)`) ne remettent pas `joinState`/`joinMessage`/`joinError`. Scénario : un visiteur authentifié joint l'ardoise A (`joinState='done'`, message « Vous participez désormais… », lien « Ouvrir l'ardoise »), puis ouvre depuis le même onglet le lien d'une ardoise B et saisit son code — le panneau « Participer ? » affiche encore le succès de A et le lien `/ardoise` pour un join qui n'a jamais eu lieu sur B. Même mécanique pour un `joinError` périmé.
**Fix:** Dans `openLink`, après `setActiveCode(trimmed)`, réinitialiser `setJoinState('idle'); setJoinMessage(null); setJoinError(null);` (et idem dans le `onRetry`).

## Info

### IN-01: Scan outbox dupliqué entre `signOut` et `assertSignOutAllowed`

**File:** `app/src/stores/session-store.ts:83-93,149-161`
**Issue:** Le même bloc (lecture user/household → import dynamique de `@/app/router` → `outboxKeyFor` → comptage pending → throw `OutboxPendingError`) est écrit deux fois. Les commentaires documentent bien la redondance volontaire (ceinture pour les chemins qui n'ont pas scanné), mais c'est une duplication copiée : une évolution de la sémantique de comptage (ex. compter aussi `failed`) devra être faite deux fois.
**Fix:** Extraire un `async function scanPendingCount(): Promise<number>` partagé, les deux sites appelant puis décidant du throw.

### IN-02: Deux imports dynamiques de `@/app/router` dans un même `signOut`

**File:** `app/src/stores/session-store.ts:86,119`
**Issue:** Quand le scan s'exécute (couple user/household établi), le module est importé deux fois dans le même appel. Sans conséquence fonctionnelle (cache de modules), mais le second `await import` peut réutiliser le résultat du premier.
**Fix:** Réaffecter `const { queryClient } = …` du scan quand il a tourné, ou extraire `importerQueryClient()`.

## Vérifications sans finding

- **TEST-04** (`session-cache.ts`, `session-store.ts`, tests unitaires + e2e) : dérivation unique de clé, fragments chunkés traités symétriquement en lecture et purge, gardes `localStorage` absents, ordre anti-résurrection prouvé par test d'ordre (`session-store.test.ts:180-200`) et preuve rouge capturée (retrospective §TEST-04). Conforme §2.7 (cas qui doit échouer, session seed sans identifiant réel, lecture brute bornée).
- **Hardening TEST-01** (`auth-bootstrap-offline.test.tsx:96-99`) : tolérance bornée à CE test avec la raison nommée, pas de directive de linter, bloc global intact.
- **e2e offline-shared-device** : skip conditionnel correct (il ne se déclare pas vert), `clesStockageBrutes` cohérente avec `OFFLINE_IDB_NAME`/store, l'assertion `startsWith('eo-query-cache:')` est sûre — le store `query` ne contient que des clés `cacheKey` (source unique, `query-persistence.ts:26-27`).
- **Conventions** : aucun linter directive dans les 11 fichiers ; commentaires en français portant des raisons ; aucune clé secrète côté client.

---

_Reviewed: 2026-11-08T12:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
