---
phase: 40
plan: 01
subsystem: ardoise, foyer, edge-functions
tags: [ardoise, bridge-token, invitation, foyer, edge-function, rtl]
requires: [0145 (ardoise_guests), 0180 (table pont + RPC), household_invite_tokens, INVITE_TOKEN_HMAC_SECRET]
provides: [action Edge household-token, RPC create_household_bridge_token 4-args, chemin invité→foyer→ardoise]
affects: [40-02 (réconciliation redeem), 40-03 (polish UI)]
tech-stack:
  added: []
  patterns: [action Edge discriminée, RPC SECURITY DEFINER transactionnel, marqueur d'atterrissage sessionStorage]
key-files:
  created:
    - supabase/migrations/0180_ardoise_bridge_token.sql
    - supabase/migrations/0180b_ardoise_bridge_fill.sql
  modified:
    - supabase/functions/ardoise-invite/index.ts
    - app/src/modules/ardoise/api.ts
    - app/src/lib/invites.ts
    - app/src/modules/ardoise/guest-ardoise-page.tsx
    - app/src/modules/landing/join-household-page.tsx
    - app/src/modules/ardoise/guest-ardoise-page.test.tsx
decisions:
  - "0180b : le remplissage du pont descend DANS le RPC (PostgREST n'expose pas private.*, l'Edge service_role ne peut pas y écrire)"
  - "Types SQL text (pas uuid) alignés sur le schéma réel 0002/0055 (private.new_id)"
  - "Le clic n'ouvre QUE le dialog ; l'échange ne part qu'à la confirmation (anti adhésion implicite)"
  - "404 uniforme « Lien invalide. » pour inconnu/révoké/expiré (D-03), token jamais journalisé"
metrics:
  duration: "~3h (session reprise après déviation)"
  completed: 2026-11-09
status: complete
commits: 3
plan_head_before: dfadc9aa794ff9d370a685ef6182a1e74293c89d
plan_head_after: 48a1812
---

# Phase 40 Plan 01 : Bridge token ardoise → foyer Summary

**Pont invité→foyer pour l'Ardoise : table `private.ardoise_bridge_identities` + RPC transactionnel qui émet un token foyer à usage unique (15 min) en rattachant l'identité invité, et chemin frontend complet dialog → échange → `/foyer/rejoindre` → atterrissage `/ardoise`.**

## Commits

| Tâche | Description | Commit |
|---|---|---|
| 1 | Migration 0180 — table pont d'identité + RPC d'émission bridge token | `6eb5111` |
| 2 | 0180b — remplissage du pont descend dans le RPC (signature 4-args) | `b40a3cd` |
| 3 | Edge household-token + chemin frontend complet + tests RTL | `48a1812` |

## Ce qui a été livré

1. **Migration 0180** (Task 1) : table `private.ardoise_bridge_identities` (unique `(user_id, guest_id)`) + RPC `create_household_bridge_token` SECURITY DEFINER, `search_path = ''`, grants `service_role` uniquement.
2. **Migration 0180b** (Task 2) : signature étendue `(p_household_id text, p_token_hash text, p_ardoise_id text, p_user_id uuid)` ; le RPC vérifie la cohérence foyer↔ardoise, upserte le pont et émet le token (`max_uses=1`, expiration 15 min) dans la même transaction. Appliquée via `migrate.sh` ; `test-db.sh` 104/104 vert ; refus négatif prouvé en `authenticated` (« permission denied »).
3. **Edge `ardoise-invite`** (Task 3) : action `household-token` (garde session, 404 uniforme, appel RPC, HMAC ≥32 exigé), `householdName` exposée dans la vue invitée. Déployée (`deploy-functions.sh` + `recreate functions`) ; smoke test : 401 attendu sans session.
4. **Frontend** (Task 3) : `exchangeArdoiseCodeForHouseholdToken` (api), marqueur d'atterrissage (`lib/invites`), dialog de confirmation (le clic n'ouvre QUE le dialog, l'échange ne part qu'à la confirmation), navigation `/foyer/rejoindre?token=…`, atterrissage conditionnel sur `/ardoise`. 11 tests RTL verts.

## Déviations du plan

### [Rule 3 - Bloquant] Le remplissage du pont est descendu dans le RPC (0180b)

- **Découverte (Task 2) :** PostgREST n'expose que `public,graphql_public` (`PGRST_DB_SCHEMAS`) — l'Edge avec `service_role` ne peut PAS écrire dans `private.ardoise_bridge_identities` comme le plan le prévoyait.
- **Correctif :** migration **0180b** (jamais de réécriture de 0180 appliquée) : le RPC reçoit désormais `p_token_hash` et fait l'upsert du pont de façon transactionnelle avec l'émission du token. Ancienne signature 3-args supprimée.
- **Preuves :** `prosecdef=t`, `search_path=""`, grants vérifiés, refus négatif en `authenticated`, `test-db.sh` 104/104.

### [Rule 1 - Types] Types SQL `text`, pas `uuid`

Le plan écrivait `uuid` pour `household_id`/`ardoise_id`/`guest_id` ; le schéma réel (0002/0055, `private.new_id`) utilise `text`. Seul `user_id` reste `uuid`. Corrigé dans 0180/0180b.

### [Rule 1 - Tests] Tests RTL adaptés au nouveau flux + fix dialog Radix

Les 6 tests verrouillant l'ancien flux `joinArdoise` ont été réécrits. Le test « changement de code » a révélé que `dom-accessibility-api` renvoie un nom vide pour un bouton sous `aria-hidden` Radix (même avec `hidden: true`, timing de pose de l'attribut) — remplacé par `getByText` + `fireEvent` (scénario voulu : navigation pendant un dialog ouvert), avec le reset du dialog sur changement de code (WR-05) vérifié.

### Échec préexistant hors périmètre (non corrigé)

`calendrier-page.test.tsx > « supprime un événement après confirmation »` échoue de façon déterministe (probablement dépendant de la date courante) — module intact, aucun fichier partagé touché. Consigné dans `deferred-items.md`. Chaîne : typecheck vert, build vert, 1987/1989 tests.

## Vérifications

- Contrôle statique SQL vert (`check-sql-statique.py` + ses propres cas).
- `test-db.sh` : 104/104.
- Typecheck + build : verts. Tests RTL ardoise/landing : 123/123.
- Edge déployée et recréée ; smoke 401 sans session (garde attendue).
- Aucun log du token ; `household-invite` intact (`git diff` vide).

## Self-Check: PASSED

- Commits `6eb5111`, `b40a3cd`, `48a1812` présents dans `git log` (3 commits depuis `dfadc9a`).
- Fichiers clés sur disque : migrations 0180/0180b, Edge modifiée, page invitée + tests adaptés.
