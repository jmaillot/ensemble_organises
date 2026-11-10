---
status: complete
phase: 40-ardoise-rejoindre-via-mon-compte
source: [40-VERIFICATION.md]
started: 2026-11-09T15:45:00Z
updated: 2026-11-09T16:32:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Parcours réel complet (invité connecté sans foyer)
expected: |
  Lien de partage ardoise avec ?code= valide → session utilisateur connectée
  sans foyer → « Rejoindre via mon compte » → dialog de confirmation →
  confirmation → /foyer/rejoindre?token=… → « Rejoindre le foyer » →
  atterrissage /ardoise. Le solde du foyer intègre les participations passées
  « invité » (réconciliation), sans double comptage.
result: pass

### 2. Observation produit — branche anonyme « Créer un compte »
expected: |
  Un visiteur NON connecté sur le lien ?code= voit « Créer un compte » qui
  pointe /connexion SANS state.from — le code est perdu après inscription
  (l'invité doit rouvrir le lien de partage). À arbitrer : acceptable, ou le
  lien doit préserver ?code= via state.from.
result: pass

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
