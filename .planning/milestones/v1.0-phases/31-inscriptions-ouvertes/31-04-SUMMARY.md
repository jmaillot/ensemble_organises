---
phase: 31-inscriptions-ouvertes
plan: 04
subsystem: Panneau paramètres (admin) + lib invitations
tags: [invitations, admin-panel, liste-tokens, révocation, validation-formulaire, phase-31]
requires:
  - 31-02 (Edge household-invite : summary → liste anonymisée, action revoke-one, create exige expiresAt)
  - 0176_token_list_governance (RPC household_invite_tokens_list, revoke_household_invite_token)
provides:
  - listInviteTokens() / revokeInviteTokenById() / isRecallValid par tokenId (app/src/lib/invites.ts)
  - invitations-panel enrichi : liste anonymisée D-15, révocation individuelle D-16, formulaire durci D-14
affects: [31-05+ (mentions légales), documentation BACKEND §invitations]
tech-stack:
  added: []
  patterns: [TanStack Query liste + invalidateQueries, ConfirmDialog à cible dynamique (tokenId | 'all'), validation client avant Edge]
key-files:
  created:
    - app/src/modules/parametres/components/invitations-panel.test.tsx
  modified:
    - app/src/modules/parametres/components/invitations-panel.tsx
    - app/src/lib/invites.ts
    - app/src/lib/invites.test.ts
    - app/src/types/index.ts
    - app/src/modules/parametres/api.ts
    - app/src/modules/parametres/hooks/use-child-profiles.test.tsx
    - app/src/modules/parametres/parametres-page.test.tsx
decisions:
  - "InviteTokenSummary perd householdId, gagne tokenId — la liste Edge n'expose pas de foyer par ligne ; le foyer du rappel est vérifié par l'appelant contre son foyer courant"
  - "confirmRevokeId: string | null avec sentinelle 'all' : la révocation GLOBALE existante (action revoke) partage la même ConfirmDialog que les révocations individuelles (D-16), sans second dialog"
  - "isRecallValid matche par tokenId présent ET actif dans la liste (Pitfall 5) ; le rappel local mémorise tokenId, ancré sur le lien le plus récent de la liste fraîche après génération"
  - "Pitfall 6 : la contrainte 90 jours est affichée (hint + erreur « Le lien expire au plus tard dans 90 jours. ») au lieu du clamp silencieux de la base"
  - "Copy sans jargon : « Générer un nouveau lien » / « Révoquer tous les liens » / « Liens actifs » — le mot « token » disparaît de l'écran admin"
metrics:
  duration: ~25 min
  completed: 2026-11-03
  commits: 2
  plan_head_before: ce91c9111d3af751c819de680a5fb8d21a53cc1f
  plan_head_after: 8f6116f
actuals:
  tokens: 58000
  tasks: 2
  commits: 2
status: complete
---

# Phase 31 Plan 04 : Panneau invitations enrichi (liste, révocation individuelle, formulaire durci) Summary

**L'admin pilote sa gouvernance de liens depuis le panneau existant : création pré-remplie 30 j / 10 avec refus client strict avant l'Edge, liste anonymisée triée par création décroissante avec statuts honnêtes, révocation individuelle confirmée par modale, empty state après la migration « jetables ».**

## What Was Built

**Task 1 (tracer) — liste + révocation individuelle** (`3274231`) :
- `app/src/lib/invites.ts` : `getInviteTokenSummary` → `listInviteTokens(): Promise<InviteTokenSummary[]>` (action `summary` 31-02, mode local retombant sur l'adaptateur démo) ; nouveau `revokeInviteTokenById(tokenId)` (action `revoke-one`) ; `revokeInviteToken` (globale, action `revoke`) conservée telle quelle.
- `isRecallValid(saved, tokens)` matche par `tokenId` présent ET actif dans la liste (Pitfall 5) ; `RememberedInviteToken` porte `tokenId` (plus `createdAt`) ; après génération, le rappel s'ancre sur le lien le plus récent de la liste refetchée.
- `InviteTokenSummary` (types) : `householdId` retiré, `tokenId` ajouté — consommateurs adaptés (`api.ts` `giveChildAccess`, tests `use-child-profiles` / `parametres-page`).
- Panneau : bloc « Token en cours » remplacé par la liste « Liens actifs » — lignes denses 13px wrap, « Créé le / Expire le / n / m utilisations / statut », tri client création décroissante, JAMAIS le brut ni le HMAC (assertion négative de test). Statut honnête : `isActive && useCount < maxUses && non expiré` → « Actif », sinon « Révoqué » (test avec un token `is_active=true` mais épuisé).
- Révocation individuelle : bouton par ligne → `ConfirmDialog` « Révoquer ce lien ? » (corps UI-SPEC, Annuler/Révoquer) ; `confirmRevokeId: string | null` (sentinelle `'all'` pour la révocation globale conservée) ; pattern invalidateQueries + toast + erreur existant recopié.
- Empty state `EmptyState` « Aucun lien d’invitation actif » + « Générez un lien pour inviter un nouveau membre. » + CTA « Générer un lien » ; toast de génération au pluriel « Nouveau lien généré. Les liens précédents sont invalidés. » (le singulier est grep = 0).

**Task 2 (auto) — formulaire durci** (`8f6116f`) :
- Expiration obligatoire : `hint="Laissez vide…"` et flag `optional` retirés ; label « Expire le ». Validation AVANT l'Edge : vide ou passée → « Choisissez une date dans le futur. » ; > 90 jours → « Le lien expire au plus tard dans 90 jours. » (Pitfall 6, la base clampe en silence).
- `maxUses` : entier ≥ 1 sinon « Indiquez au moins 1 utilisation. » (le clamp `Math.max(1,…)` de l'onChange est retiré — il masquait la soumission invalide) ; > 100 → « Indiquez au plus 100 utilisations. » ; label « Utilisations maximum ».
- Erreurs inline via le gabarit `Field` (`error` prop, sous le champ) — jamais d'accent ; le serveur (31-01/31-02) reste la barrière finale.
- Défauts au montage : expiration = aujourd'hui + 30 jours, utilisations = 10 (assertés par test).

## Verification

- `cd app && npm run typecheck` : exit 0.
- `npx vitest run invitations-panel invites.test` : 13/13 verts (5 liste/révocation/empty + 5 formulaire + 3 rappel local).
- `npm run build` : vert.
- `grep "Le précédent est invalidé" app/src` : 0 occurrence.
- Aucun token brut hors le bloc de rappel : assertion négative dans le test + le rendu de liste ne mappe aucune donnée non déclarée dans `InviteTokenSummary`.
- Suite complète : 1696/1704 — les 6 échecs restants (anniversaires ×2, birthday-confetti ×1, calendrier ×3) sont **pré-existants à HEAD ce91c91**, prouvé par exécution des mêmes fichiers dans un worktree jetable à HEAD avant mes changements (6 failed identiques). Hors périmètre — voir Deviations.

## Deviations from Plan

**[Rule 3 - Blocking] Consommateurs du modèle summary-liste adaptés hors fichiers du plan**
- **Found during:** Task 1 (typecheck + suite)
- **Issue:** le changement de `getInviteTokenSummary` vers `listInviteTokens` cassait `parametres/api.ts` (`giveChildAccess`), `use-child-profiles.test.tsx` et `parametres-page.test.tsx` (libellés du panneau renommés, contrat rappel modifié).
- **Fix:** adaptation minimale de ces trois consommateurs au nouveau contrat (liste + tokenId) ; aucun changement de comportement métier.
- **Files modified:** app/src/modules/parametres/api.ts, app/src/modules/parametres/hooks/use-child-profiles.test.tsx, app/src/modules/parametres/parametres-page.test.tsx
- **Commit:** 3274231

**[TDD - Note] Task 2 : phase RED non observable**
- Les comportements du formulaire durci étaient déjà implémentés dans le commit Task 1 (le validateForm a suivi le même chantier). Les tests Task 2 sont passés verts à leur première exécution ; le RED a été démontré pour Task 1 (7 failed → green) mais pas isolé pour Task 2. Aucun comportement non testé : les cinq cas du formulaire sont couverts.

## Known Stubs

Aucun.

## Known Issues (hors périmètre)

6 échecs de tests pré-existants à HEAD (anniversaires : dialog/calendrier ; calendrier : dialogue événement, appui long, sélection de date) — non liés aux invitations (aucune dépendance d'import), laissés intacts conformément à la frontière de périmètre.

## Notes for Next Plans

- Le panneau n'affiche jamais le brut hors du bloc de rappel : toute future évolution de la liste doit continuer à ne mapper que `InviteTokenSummary` (D-15, T-31-09).
- `use-child-profiles.test.tsx` moque maintenant `listInviteTokens` (anciennement `getInviteTokenSummary`).
- La révocation globale reste disponible (« Révoquer tous les liens ») — utile après rotation de `INVITE_TOKEN_HMAC_SECRET`.

## Self-Check: PASSED

- Fichiers clés présents (invitations-panel.tsx/.test.tsx, invites.ts, types, api.ts)
- Commits 3274231 et 8f6116f vérifiés dans git log
- commits mesurés (rev-list ce91c91..HEAD) : 2
