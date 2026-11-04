---
phase: 31-inscriptions-ouvertes
plan: 02
subsystem: Edge Functions (Deno, runtime Supabase auto-hébergé)
tags: [invitations, preview, edge-functions, rate-limit, phase-31]
requires:
  - 0176_token_list_governance (RPC preview_household_invite_token, household_invite_tokens_list, revoke_household_invite_token)
  - 31-01 (modèle liste de tokens)
provides:
  - Edge household-invite-preview (publishable, POST { token } → { householdName, inviterFirstName? }, 404 uniforme)
  - household-invite action summary → liste anonymisée { tokenId, createdAt, expiresAt, maxUses, useCount, isActive }
  - household-invite action revoke-one (tokenId) → { revoked: 0|1 }
  - household-invite action create exige expiresAt (400 Edge si absent)
affects: [31-03 (pré-écran), 31-04 (panneau admin)]
tech-stack:
  added: []
  patterns: [withSupabase auth publishable, rate-limit gabarit (LIMITS/WINDOW_MS/purge), réponse d'erreur uniforme anti-énumération]
key-files:
  created:
    - supabase/functions/household-invite-preview/index.ts
  modified:
    - supabase/functions/household-invite/index.ts
decisions:
  - preview renvoie la 404 uniforme MÊME sur erreur interne (500g mécanique absorbée par D-03) — le détail ne vit qu'en console.error
  - "limite preview: 8/min/IP (≤ redeem), même gabarit mémoire WINDOW_MS/purge que household-invite (D-04, pas de Traefik)"
  - "un household_name absent du RPC → 404 uniforme (et non un 200 vide) : le résultat vide est un échec, jamais un succès muet (§2.7 F)"
  - create Edge refuse l'absence d'expiresAt (400 « Choisissez une date d'expiration pour ce lien. ») ; une date passée reste du ressort base (22023, traduit par translateRpcError inchangé)
metrics:
  duration: ~35 min
  completed: 2026-11-03
  commits: 2
  plan_head_before: 538beaee2b48bf4059954b4bf7ab609bf719c75d
  plan_head_after: 8fc7756
actuals:
  tokens: 26000
  tasks: 2
  commits: 2
status: complete
---

# Phase 31 Plan 02 : Edge preview + household-invite enrichi Summary

**Surface serveur de la consultation pré-auth : Edge dédiée household-invite-preview (publishable, réponse 2 champs, 404 uniforme anti-énumération, rate-limit 8/min) et household-invite enrichi (liste anonymisée D-15, révocation individuelle D-16, expiration exigée à la création) — les deux déployées dans volumes/functions.**

## What Was Built

**Task 1 (tracer) — Edge household-invite-preview** (`e3d2018`) :
- `supabase/functions/household-invite-preview/index.ts` sur le gabarit household-invite :
  `Deno.serve(withSupabase({ auth: ['publishable'] }, ...))` — aucun JWT requis (D-01), OPTIONS → 204 CORS, POST uniquement (405 sinon).
- Règle Zod token EXACTE de redeem : trim, min 22 (« Un token fait au moins 22 caractères. »), max 512, regex `^[A-Za-z0-9_-]+$`.
- `enforceRateLimit(request, 'preview')`, `LIMITS['preview'] = 8`, même WINDOW_MS (60 s), compteurs IP et purge opportuniste que le gabarit (D-04).
- HMAC calculé en JS, comparaison JAMAIS : `rpc('preview_household_invite_token', { p_token_hash })` — la base fait foi (0176, `private.token_hash_matches`).
- Succès → 200 `{ householdName, inviterFirstName? }` uniquement (D-02) ; tout motif d'échec (RPC vide, erreur, exception interne) → UNE réponse 404 « Ce lien d'invitation n'est plus valable. » (D-03) ; le détail ne vit que dans `console.error('household-invite-preview: ...')`.
- Aucune écriture SQL — le D-05 est posé par le test 0176 cas (d) (31-01), le contrôle local grep = 0 occurrence d'« update » dans le fichier déployé.
- Import `@supabase/server` en bare specifier (épinglage den.jsonc du runtime).

**Task 2 (auto) — household-invite enrichi** (`8fc7756`) :
- Action `summary` réécrite vers `rpc('household_invite_tokens_list')` : tableau anonymisé camelCase `{ tokenId, createdAt, expiresAt, maxUses, useCount, isActive }` — l'empreinte ne quitte jamais la base (D-15). L'interface `TokenSummaryRow` (ancien contrat objet unique) supprimée.
- Nouvelle action `revoke-one` dans la discriminated union (`tokenId: z.string().trim().min(1).max(128)`) → `rpc('revoke_household_invite_token', { pActorId, pHouseholdId, pTokenId })` ; `LIMITS['revoke-one']: 20` (D-16).
- Action `create` : `expiresAt` passe de `.nullish()` à requis dans le schéma Zod ET un garde InviteError 400 (« Choisissez une date d'expiration pour ce lien. ») avant tout appel RPC ; `p_expires_at: body.expiresAt` sans coalescing null.
- `translateRpcError` et les quatre messages redeem (introuvable 404 / révoqué 410 / expiré 410 / épuisé 410) : INCHANGÉS — diff vide sur ce bloc (D-17 côté client).
- En-têtes de contrat mis à jour (liste des actions, table des réponses).

**Déploiement** : `sh scripts/deploy-functions.sh` → 16 fonctions recopiées, `household-invite-preview` présente dans `supabase-project/volumes/functions/`. Rappel (§2.7 F) : la copie ne recharge pas le runtime — `run.sh recreate functions` reste à l'orchestration de la pile (déjà le cas pour les redeployments précédents).

## Verification

- `sh scripts/deploy-functions.sh` : exit 0, deux Edge dans volumes/functions.
- Preview déployée : `preview_household_invite_token` ×2, `update` ×0 (contrôle rapide ; D-05 fait foi par le test SQL 0176 cas d).
- household-invite déployé : `revoke-one`/`household_invite_tokens_list` ×11 occurrences, `household_invite_token_summary` ×0.
- `translateRpcError` non modifié (diff inspecté : aucun hunk dans le bloc).
- `cd app && npm run typecheck` : exit 0 (aucun fichier app modifié, contrôle de non-régression).
- Tracer feedback gate : vérification automatisée ré-exécutée après Task 2 → verte, expansion autorisée.

## Deviations from Plan

**[Rule 1 - Bug] Commentaire d'en-tête corrigé après le contrôle statique**
- **Found during:** Task 1 (verify)
- **Issue:** le commentaire « cette fonction ne contient aucun update » faisait échouer le contrôle grep `-ci update` = 0 demandé par le plan — un faux positif de l'instrument, mais l'instrument est le contrat.
- **Fix:** commentaire reformulé (« aucune écriture ») ; le fichier déployé passe le contrôle tel qu'écrit.
- **Files modified:** supabase/functions/household-invite-preview/index.ts
- **Commit:** e3d2018

## Known Stubs

Aucun. (Le runtime n'est PAS recréé par ce plan : `run.sh recreate functions` relève de l'orchestration — même statut que les autres Edge déjà déployées.)

## Notes for Next Plans

- 31-03 (pré-écran) : `previewHouseholdInvite(token)` appelle `/functions/v1/household-invite-preview` en publishable sans Bearer ; le 404 uniforme doit s'afficher sans distinction de motif (D-03).
- 31-04 (panneau) : consommer la LISTE de `summary` (l'ancien objet unique n'existe plus) ; `revoke-one` prend `tokenId` ; la création exige désormais une date d'expiration (l'UI doit l'imposer — « Choisissez une date dans le futur. » pour le passé).
- Changer `LIMITS['preview']` est un choix de discretion D-04 : 8/min/IP actuel, aligné sur redeem.
