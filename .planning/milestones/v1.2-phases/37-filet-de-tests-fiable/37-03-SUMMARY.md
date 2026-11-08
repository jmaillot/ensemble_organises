---
phase: 37-filet-de-tests-fiable
plan: 03
subsystem: frontend
tags: [ardoise, landing, auth, uat-gap]
requires: [37-01]
provides: [deconnexion-reachable-sans-foyer, ardoise-join-authentifie]
affects: [welcome-page, guest-ardoise-page]
tech-stack:
  added: []
  patterns: [branche-authentifiee-page-invitation]
key-files:
  created:
    - app/src/modules/landing/welcome-page.test.tsx
  modified:
    - app/src/modules/landing/welcome-page.tsx
    - app/src/modules/ardoise/guest-ardoise-page.tsx
    - app/src/modules/ardoise/guest-ardoise-page.test.tsx
    - app/src/modules/ardoise/api.ts
key-decisions:
  - "Déconnexion réelle sur /foyer via useSignOutWithConfirm — un Link vers /connexion ne purge rien (G-37-2, D-07)"
  - "Le 403 d'un non-membre ardoise s'affiche tel quel : comportement correct du modèle binaire, jamais maquillé"
  - "Type joinArdoise élargi à already_member (déjà renvoyé par l'Edge) — aucun changement serveur"
  - "Note compteur (max_uses = rachats, pas consultations) ajoutée dans la description du panneau, éclaircissement bon marché"
requirements-completed: []
coverage:
  - deliverable: "Bouton « Se déconnecter » réel sur /foyer pour l'utilisateur connecté sans foyer"
    verification:
      - kind: tests
        ref: "app/src/modules/landing/welcome-page.test.tsx"
        status: pass
    human_judgment: false
  - deliverable: "Navigation vers /connexion après signOut, dialog D-17 monté une fois"
    verification:
      - kind: tests
        ref: "app/src/modules/landing/welcome-page.test.tsx#au-clic"
        status: pass
    human_judgment: false
  - deliverable: "Branche authentifiée « Rejoindre via mon compte » : succès / déjà membre / 403 explicite"
    verification:
      - kind: tests
        ref: "app/src/modules/ardoise/guest-ardoise-page.test.tsx"
        status: pass
    human_judgment: false
  - deliverable: "Re-test UAT manuel test 2 (déconnexion invitée sur appareil partagé, purge sb-*-auth-token visible)"
    human_judgment: true
    rationale: "Le véhicule (purgerStockageSession, 37-01) est désormais atteignable depuis l'UI ; la preuve localStorage sur appareil réel reste à l'utilisateur via /gsd-verify-work 37"
duration: 35 min
completed: 2026-11-08
---

# Phase 37 Plan 03: Déconnexion atteignable + branche ardoise authentifiée Summary

**Fermeture du gap G-37-2 (UAT test 2, majeur) :** un utilisateur connecté SANS foyer dispose
d'un bouton « Se déconnecter » réel sur /foyer qui purge la clé `sb-*-auth-token`
(chaîne TEST-04 de 37-01, désormais atteignable), et la page d'invitation ardoise traite
explicitement le visiteur authentifié — rattachement si membre du foyer, message serveur 403
honnête sinon — sans rien changer au modèle de partage binaire.

## Accomplishments

1. **welcome-page.tsx** : le faux « Changer de compte » (Link vers /connexion) est remplacé
   par un vrai bouton « Se déconnecter » piloté par `useSignOutWithConfirm` avec `onDone` →
   navigate('/connexion'). Le dialog D-17 (écritures pendantes) est monté une seule fois.
   /connexion, /foyer/nouveau et /foyer/rejoindre restent intouchés.
2. **guest-ardoise-page.tsx** : le panneau « Participer ? » gère le visiteur connecté —
   bouton « Rejoindre via mon compte » → `joinArdoise(code)` (goulot Edge `join`) ;
   succès → confirmation + lien vers /ardoise ; `already_member` → message idempotent ;
   rejet 403 → message serveur affiché TEL QUEL (role="alert") + aide « bon compte ».
   Note compteur ajoutée : max_uses compte les rachats (redeem), pas les consultations.
3. **api.ts** : le type de retour de `joinArdoise` déclare désormais `already_member`
   (déjà renvoyé par `ardoise-invite`, jamais lu côté client avant — aucun changement serveur).

## TDD

- **RED** `test(37-03)` ×2 : welcome-page (3 tests rouges — aucune déconnexion réelle),
  guest-ardoise (3 tests rouges sur 4 — le cas anonyme passe et garde le modèle binaire).
- **GREEN** `fix(37-03)` ×2 : 3/3 + 8/8 tests verts, typecheck propre à chaque tâche.

## Deviations from Plan

- **[Rule 2 - missing critical] `already_member` déclaré côté client** — Found during: Tâche 2 |
  L'Edge retourne déjà `{ ardoise_id, already_member }` (ardoise-invite:34, :500) mais le type
  client ne le déclarait pas, rendant le message idempotent impossible | Fix : type élargi
  (`already_member?: boolean`) | Files: app/src/modules/ardoise/api.ts (hors files_modified du
  plan, même module ardoise) | Verification: test « déjà membre » vert | Commit: 7d89cf6.
- **Correction des tests RED hérités de l'exécuteur interrompu** — le sous-agent bloqué avait
  laissé un test assertant `window.location.pathname` (impossible sous MemoryRouter) et un
  `getByRole('status', { name: '' })` invalide. Corrigés en sonde `useLocation` et
  `getAllByRole('status')` avant le commit RED — le rouge reste authentique (aucune
  implémentation n'existait).

## Issues Encountered

**2 tests préexistants échouent dans `menu-page.test.tsx`, indépendants de ce plan** :
`affiche les repas semés de la semaine` et `le retrait d'un repas...` cherchent
« Restes du frigo », semé à `day(1)` (seed.ts:162) alors que la page affiche la semaine
lundi→dimanche. **Dimanche uniquement**, demain sort de la semaine affichée → rouge.
Cause : flake dépendant de la date dans le semis démo, préexistant (aucun fichier menu
touché par ce plan — l'ancien exécuteur, resté sans commit, ne peut pas en être la cause
non plus). Hors périmètre : pas de réparation opportuniste (AGENTS.md). À traiter en gap
ou todo dédié si souhaité.

## Verification (chaîne §2.7)

| Étape | Résultat |
|---|---|
| `npm run typecheck` | ✓ propre |
| `npm test` | 1965/1967 ✓ — 2 échecs préexistants date-dépendants (menu, cf. Issues) |
| `npm run build` | ✓ (precache 152 entrées, sw.js généré) |
| Tests du plan | 11/11 ✓ (3 welcome + 8 ardoise) |
| Contrôle SQL statique | Non concerné — aucune migration touchée (constaté, non supposé) |
| Relecture §2.7 I | welcome-page ne contourne jamais session-store.signOut (hook unique) ; guest-ardoise n'appelle que le chemin publishable `callArdoiseInvite` |

## Authentication Gates

None.

## Self-Check: PASSED

- key-files.created vérifiés sur disque ✓
- Commits `git log --grep="37-3"` : f4c4824, acc3e8a, c290944, 7d89cf6 ✓
- Tous les `<verify>` de tâche ré-exécutés et verts ✓
