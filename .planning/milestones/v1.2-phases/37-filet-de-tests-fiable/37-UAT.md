---
status: passed
phase: 37-filet-de-tests-fiable
source: [37-01-SUMMARY.md, 37-02-SUMMARY.md]
started: 2026-11-08T00:00:00Z
updated: 2026-11-08T00:00:00Z
audit_acknowledged:
  milestone: v1.4
  at: 2026-11-12
  gap_snapshot: "passed::scenarios=0"
---

## Current Test

[testing complete]

## Tests

### 1. Purge de la clé de session GoTrue à la déconnexion

expected: |
  Connecté avec un compte A sur un appareil, déconnexion via l'app → le Local Storage
  ne contient plus AUCUNE clé `sb-*-auth-token*` (base ni chunks .0/.1/…).
result: pass

### 2. Purge invité (chock point commun)

expected: |
  Toute purge de session invité convergeant vers session-store.signOut élimine aussi
  la clé GoTrue — même vérification Local Storage après une purge invité.
result: pass
re_tested: 2026-11-08 (build déployé v1.1-34-g20bbcbd+)
resolution: |
  Corrigé par 37-03 (G-37-2, commits f4c4824/acc3e8a/7d89cf6/b2ec826) : bouton
  « Se déconnecter » réel sur /foyer (visiteur connecté sans foyer), branche
  authentifiée « Rejoindre via mon compte » sur la page d'invitation ardoise.
  Re-test utilisateur confirmé après déploiement (UAT test 2 ok).
complements: |
  1. Sans compte : lecture seule OK (attendu).
  2. Avec un compte non-membre du foyer : branche authentifiée affichée ; le clic
     reçoit le 403 serveur « n'appartenez pas au foyer » — COMPORTEMENT ATTENDU
     (modèle binaire, plan 37-03 : rattachement réservé aux membres du foyer ;
     l'utilisateur observé était connecté avec un compte hors du foyer de
     l'ardoise). Observation produit à part : permettre à un compte de rejoindre
     le foyer via le lien = extension du modèle, hors phase 37.
  3. Compteur use_count à 0/10 après consultation : NORMAL — il compte les
     rachats (redeem invité), pas les consultations ni le join (redeem retourne
     avant l'incrément pour un membre). Note ajoutée au panneau (plan 37-03).

### 3. Robustesse du test D auth-bootstrap hors ligne

expected: |
  La suite de tests ne présente plus de flocon sur le test D auth-bootstrap :
  `cd app && npx vitest run src/hooks/__tests__/auth-bootstrap-offline.test.tsx`
  passe de façon stable (vert isolé comme sous charge).
result: pass

### 4. E2E appareil partagé avec 2 comptes réels (TEST-03)

expected: |
  `offline-shared-device` exécuté au vert avec deux comptes réels : A et B partagent
  l'appareil, B voit SES lignes hors ligne, et aucune clé GoTrue ne survit à la
  déconnexion (lecture localStorage brute). Nécessite les 4 variables
  E2E_SHARED_USER_{A,B}_{EMAIL,PASSWORD}.
result: pass
evidence: |
  Comptes réels créés sur le backend local (e2e-shared-a/b@ensemble-organises.test,
  foyers semés) ; spec exécuté au vert — 1 passed (37,3 s), commit b8295a3 — puis
  REPRODUIT INDÉPENDAMMENT par le vérificateur (mots de passe réinitialisés via API
  Admin, 2 passed chromium+mobile 37,8 s). Voir 37-VERIFICATION.md § Re-verification.

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-37-2
  truth: "Toute purge de session invité convergeant vers session-store.signOut élimine aussi la clé GoTrue — même vérification Local Storage après une purge invité."
  status: resolved
  resolved: 2026-11-08 (commits f4c4824, acc3e8a, c290944, 7d89cf6, b2ec826 — plan 37-03)
  reason: "Corrigé par 37-03 : déconnexion réelle sur /foyer + branche join ardoise. Re-test utilisateur confirmé le 2026-11-08 après déploiement (build v1.1-34-g20bbcbd+). Diagnostic initial conservé ci-dessous."
  reason_initial: "User reported: je ne vois pas comment purger, lorsque je suis invité par exemple juste sur une ardoise mais que je n'ai pas de foyer, je n'ai pas de bouton pour deconnecter"
  severity_at_diagnosis: major
  test: 2
  diagnosed: 2026-11-08
  root_cause: |
    Vrai bug : un utilisateur CONNECTÉ sans foyer (arrivé via « Créer un compte » depuis la page
    d'invitation ardoise, ou cadeau Option A) porte la clé sb-*-auth-token mais n'a AUCUN chemin
    de déconnexion : les seuls UI signOut (profile-form.tsx:49, mobile-drawer.tsx:103) sont derrière
    la gate RequireHousehold ; la welcome-page ne propose que « Changer de compte » = Link vers
    /connexion sans signOut (welcome-page.tsx:51-53) ; /connexion n'a pas de garde déjà-authentifié.
    purgerStockageSession() est correctement branchée sur signOut mais inatteignable pour ce profil.
    Qualification des 3 observations : (1) invité sans compte = sans session Supabase, par design
    (link-view publishable-only, rien à purger) ; (2) lecture seule avec compte = conforme au
    contrat du lien, mais branche « rejoindre » authentifiée absente sur guest-ardoise-page
    (présente sur cadeaux/voyages, 55-59/164) et handleJoin 403 les non-membres du foyer ; (3)
    compteur 0/10 = par design (use_count n'est incrémenté que par redeem_ardoise_invite,
    0113:1125-1127 ; link-view le préserve volontairement, index.ts:734-737) — conséquence de (2) :
    un lien de partage ne peut jamais consommer son max_uses via l'UI actuelle.
  artifacts:
    - app/src/modules/landing/welcome-page.tsx (Changer de compte sans signOut, 51-53)
    - app/src/app/router.tsx (RequireHousehold 156-176, routes publiques 246-269)
    - app/src/modules/parametres/components/profile-form.tsx (seul signOut UI, gate foyer)
    - app/src/components/shared/mobile-drawer.tsx (seul signOut mobile, gate foyer)
    - app/src/modules/ardoise/guest-ardoise-page.tsx (pas de branche isAuthenticated, 19-27)
    - app/src/modules/cadeaux/guest-cadeau-page.tsx (branche join à répliquer, 55-59/164)
    - supabase/functions/ardoise-invite/index.ts (link-view sans compteur 734-737, join 403 485-487)
    - supabase/migrations/0113_enfant_perimeter.sql (redeem_ardoise_invite, use_count 1125-1127)
  missing:
    - Bouton « Se déconnecter » réel (useSignOutWithConfirm) sur welcome-page.tsx (et /foyer/nouveau, /foyer/rejoindre) — élimine le sb-*-auth-token résiduel
    - Branche authentifiée « rejoindre » sur guest-ardoise-page.tsx à l'image de cadeaux/voyages — rend use_count/max_uses atteignables depuis le lien
  missing_note: Les comportements 1 et 3 sont par design (documentés en code) — seuls le signOut inaccessible et la branche join manquante sont des écarts.
