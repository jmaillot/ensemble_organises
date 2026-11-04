---
status: complete
phase: 25-profils-enfants-g-r-s-par-le-parent
source: [25-VERIFICATION.md]
started: 2026-10-26T16:40:00+02:00
updated: 2026-10-26T19:20:00+02:00
---

## Current Test

[testing complete]

## Tests

### 1. Livraison push réelle (D-23)
expected: Une tâche/routine/anniversaire attribué à un enfant géré produit une notification délivrée aux adultes du foyer, jamais à l'enfant (0147).
result: pass
how: `sh scripts/test-dispatch-push.sh` sur une machine avec un appareil **réellement abonné** au push.
evidence: Exécuté le 2026-10-26 sur la machine de déploiement (ubuntu1:/docker/ensemble_organises) — abonnement réel Chrome/Win64, rapport `{"due":1,"dispatched":true}`, réponse `200 {"notifications":1,"delivered":3,"failed":0,"dropped":1,"consumed":1}`, rappel restant 0, nettoyage vérifié. `dropped:1` = abonnement périmé, pas un défaut. Le routage enfant→adultes (0147) est couvert par test-db.sh 0147 (vert) ; le script prouve le chaînon HTTP manual-only.

### 2. Rejeu D-15/D-16 sur préproduction avec un compte enfant réel
expected: `auth.users` vide côté enfant, sessions mortes, ligne `household_members` conservée (`role='enfant'`, `user_id IS NULL`), historique (tâches, complétions, messages, posts) intact et attribué à ce membre.
result: pass
how: Exécuter la migration 0145 sur un foyer de préproduction portant un compte enfant réel, puis lire `auth.users` et les sessions.
why_human: Le test SQL 0145 s'exécute dans la transaction annulée par `test-db.sh` et ne peut ni créer ni supprimer un vrai compte `auth`. La garde servante (42501, oracle SQLSTATE T-25-03) l'invariant CHECK et le refus sont prouvés ; la suppression effective d'un compte réel ne l'est pas.
evidence: Confirmé par l'utilisatrice le 2026-10-26 (rejeu D-15/D-16 sur préproduction, compte enfant réel).

### 3. Relecture visuelle — panneau membres et Cercle
expected: Le Select « Rôle » ne propose plus « Enfant » (refusé 22023 par 0156 pour un membre avec compte) ; la couleur reste éditable à l'édition de fiche ; la touche « Voyages » est visible dans le groupe « Espaces » ; l'upload de photo est absent comme report documenté ; la copie du ConfirmDialog suit le contrat de D-04 ; plus aucune valeur hors charte.
result: pass
how: Ouvrir l'écran de gestion des membres d'un foyer avec au moins une fiche enfant et une publication d'enfant dans le Cercle ; vérifier chaque point ci-dessus.
why_human: 25-UI-REVIEW.md est un audit de code sans capture ni serveur de développement. Les correctifs sont prouvés au niveau code + tests (50 tests ciblés verts), le verdict visuel reste humain.
evidence: Confirmé par l'utilisatrice le 2026-10-26 sur l'application rebuildée (build-app.sh).

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

Aucun — l'écart unique de la première vérification (SC3 clause 2 / Voyages vs D-06) est clos par les commits `62d5c43`→`ac39db5` (migration 0157 + gardes `trip_add_member` + périmètre activable + deux pickers filtrés), re-prouvé par le vérificateur. La vérité restante non exercée (n° 14 du rapport : suppression réelle du compte `auth`) est portée par le test n° 2 ci-dessus.
