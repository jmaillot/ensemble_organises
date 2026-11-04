---
phase: 31-inscriptions-ouvertes
plan: 03
subsystem: frontend (landing / invitations)
tags: [invitations, pre-ecran, session-storage, preview, phase-31]
requires:
  - 31-02 (Edge household-invite-preview, réponses { householdName, inviterFirstName? } / 404 uniforme)
  - 31-01 (redeem, messages serveur translateRpcError)
provides:
  - Pré-écran d'invitation public /foyer/rejoindre (D-18/D-19/D-20) — route sortie de RequireAuth
  - previewHouseholdInvite(token) publishable sans Bearer (app/src/lib/invites.ts)
  - Traversée D-06/D-07 : setPendingInviteToken/getPendingInviteToken/clearPendingInviteToken (sessionStorage)
  - translateRedeemError — messages D-17 + atterrissage D-09
affects: [31-04 (panneau admin), verification phase 31]
tech-stack:
  added: []
  patterns: [pré-écran public consultatif sans écriture, sessionStorage « confort pas requis » (try/catch), message uniforme anti-énumération D-03]
key-files:
  created: []
  modified:
    - app/src/modules/landing/join-household-page.tsx
    - app/src/modules/landing/join-household-page.test.tsx
    - app/src/app/router.tsx
    - app/src/app/router.test.tsx
    - app/src/lib/invites.ts
    - app/src/modules/landing/sign-in-page.tsx
decisions:
  - "sign-in-page accepte state.mode='inscription' (hors files_modified du plan) : le CTA « Continuer vers l'inscription » doit ouvrir le bon mode — Rule 3, écart documenté"
  - "démonstration (backend absent) : pas d'Edge à interroger (même sonde D-10) — pré-écran sans nom de foyer, redeem LOCAL préservé, le mode démo ne régresse pas"
  - "arrivée sans token (URL ni sessionStorage) : message uniforme D-03 — ni redirect, ni second message public, rien ne fuit"
  - "state.from pose le lien d'origine en plus de sessionStorage : une session immédiate (SSO/existante) revient au pré-écran ; un compte à confirmer réadopte le token via sessionStorage au retour générique du mail"
  - "échec redeem : verbatim lisible 3 s puis navigation D-09 vers l'état normal (gardes de route : /foyer sans foyer, /accueil sinon) — jamais bloquant"
metrics:
  duration: ~70 min
  completed: 2026-11-03
  commits: 2
  plan_head_before: 8fc7756e5dc9ac7dae5d3b1f547fa5cc796879ac
  plan_head_after: a0731ce
actuals:
  tokens: 62000
  tasks: 2
  commits: 2
status: complete
---

# Phase 31 Plan 03 : Pré-écran d'invitation pré-auth Summary

**Parcours étranger de bout en bout : lien public `/foyer/rejoindre?token=…` sorti de RequireAuth, pré-écran nommant l'inviteur et le foyer via la preview Edge, token traversant l'inscription par sessionStorage (jamais dans l'email), puis redeem authentifié avec messages D-17 et atterrissage non bloquant D-09.**

## What Was Built

**Task 1 (tracer, TDD) — pré-écran, route publique, traversée (D-18/D-19/D-20/D-06/D-07)** (`7a32322`) :
- `router.tsx` : `/foyer/rejoindre` quitté `RequireAuth` — un étranger voit le pré-écran, jamais une redirection vers `/connexion`. Le commentaire « le jeton EST le contrôle d'accès » est porté par la nouvelle route publique ; la préservation `state.from` est intacte pour les routes gatées restantes (`/foyer/nouveau`).
- `join-household-page.tsx` réécrit en page d'invitation (gabarit `max-w-[620px]` conservé, aucune primitive nouvelle) : token résolu au montage (Zod min 22, même règle serveur) puis `previewHouseholdInvite` (Edge 31-02) — titre « {Prénom} t'invite à rejoindre {Nom} » ou « Vous avez été invité à rejoindre {Nom} » (D-20), Skeleton sur la ligne du foyer + CTA désactivé pendant le chargement, message UNIFORME D-03 pour mort/réseau (« Ce lien d'invitation n'est plus valable… »), vocabulaire technique absent de l'écran (testé).
- Un gabarit, deux actions (D-19) : étranger → « Continuer vers l'inscription » (token posé en sessionStorage AVANT navigation, D-06 ; `state.mode`+`state.from` transmis) ; connecté → « Rejoindre le foyer » (redeem explicite, jamais au chargement — D-08, testé).
- D-07 : au retour générique du mail (pas de `redirectTo` porteur du token — grep `use-auth.ts` : signUp sans redirectTo), le pré-écran réadopte le token en attente ; nettoyage après application OU abandon (testés).
- `invites.ts` : `previewHouseholdInvite` (POST publishable, **sans Bearer**, commentaires de contrat) + trois helpers sessionStorage sur le gabarit remember/recall/forget (« le stockage est un confort », try/catch partout).

**Task 2 (auto) — messages D-17 + atterrissage D-09** (`a0731ce`) :
- `translateRedeemError` dans `invites.ts` : motif serveur 31-02 → verbatim UI-SPEC — introuvable **et** révoqué → « Ce lien est invalide. » (pas de distinction exposant la révocation), expiré → « Ce lien a expiré. Demandez-en un nouveau à l'administrateur. », épuisé → « Ce lien a atteint sa limite d'utilisations. Demandez-en un nouveau à l'administrateur. » ; défaut = invalide.
- Page : échec de redeem → verbatim inline `role="alert"` `text-coral-text` 11px, sessionStorage nettoyée, puis navigation après 3 s vers `/foyer` (les gardes routent vers le choix créer/rejoindre ou l'accueil selon le foyer — D-09, jamais bloquant).
- Quatre correspondances D-17 testées + assertion de navigation post-échec.

**Écart Rule 3** : `sign-in-page.tsx` lit `state.mode` pour s'ouvrir directement en mode inscription — indispensable au contrat D-19 du CTA étranger, impossible sans toucher ce fichier (hors `files_modified` du plan).

## Verification

- `npm run typecheck` : exit 0.
- `vitest run join-household-page.test.tsx router.test.tsx` : **62/62** (RED→GREEN pour Task 1 : 13 tests rouges avant implémentation) ; stabilité confirmée sur 8 exécutions consécutives (un flake 1/8 du test router « pré-écran public » a été éliminé : findByRole unique remplacé par des waitFor sur les marqueurs de page).
- `npm test` : 1692/1699 — les 7 échecs restants (anniversaires ×2, birthday-confetti, calendrier ×3, off-client) sont **préexistants** : reproduits au commit de base `8fc7756` dans un worktree jetable, hors périmètre (voir `deferred-items.md`).
- `npm run build` : vert (précache 141 entrées).
- `check-sql-statique` : vert (aucune migration touchée).
- T-31-07 : aucun `redirectTo` porteur du token dans le parcours d'inscription (grep `use-auth.ts` : les deux redirectTo sont `/accueil` et `/parametres`, aucun signUp). T-31-08 : message uniforme testé pour les deux causes (mort/réseau). T-31-SC : zéro dépendance ajoutée.

## Deviations from Plan

**1. [Rule 3 - Blocking] sign-in-page : lecture de `state.mode`**
- **Found during:** Task 1
- **Issue:** le CTA « Continuer vers l'inscription » doit ouvrir le MODE inscription de sign-in (D-19) ; sans lecture de `state.mode`, l'étranger atterrissait en mode connexion.
- **Fix:** initialisation de `mode` depuis `location.state.mode` (4 lignes, comportement par défaut inchangé).
- **Files modified:** app/src/modules/landing/sign-in-page.tsx
- **Commit:** 7a32322

**2. [Décision] Route publique sans token affiche le message uniforme D-03**
- **Found during:** Task 1
- **Issue:** non couvert par l'UI-SPEC (visite de `/foyer/rejoindre` sans token ni token en attente).
- **Fix:** message uniforme + liens « Pas de lien sous la main ? » / « Créer le vôtre » — ni redirection ni second message public (anti-énumération).

## Known Stubs

Aucun. Le runtime Edge n'est pas recréé par ce plan (orchestration de la pile, même statut que 31-02).

## Notes for Next Plans

- 31-04 : le panneau admin n'est pas touché ici ; `invitations-panel.tsx` doit consommer la LISTE de `summary` (31-02).
- Le flake éliminé dans `router.test.tsx` avait pour symptôme un échec à 317 ms du `findByRole` unique — préférer les `waitFor` sur des marqueurs stables pour les routes paresseuses.

## Self-Check: PASSED

- Commits vérifiés : `7a32322` (Task 1), `a0731ce` (Task 2), `1081e3c` (docs) — tous présents dans l'historique.
- `31-03-SUMMARY.md`, `deferred-items.md`, tests et sources : présents sur disque.
- `git rev-list --count 8fc7756..HEAD` = 3 (2 tâches + 1 docs).
- Durée réelle : ~40 min (11:13 → 11:52 UTC).
