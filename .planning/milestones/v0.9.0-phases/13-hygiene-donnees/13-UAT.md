---
status: complete
phase: 13-hygiene-donnees
source: [13-01-SUMMARY.md, 13-02-SUMMARY.md]
started: 2026-10-13T00:00:00Z
updated: 2026-10-13T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Pièces des prestataires
expected: Fichier joint visible ; suppression sans orphelin ; ré-affichage plus tard sans lien mort.
result: pass
note: "Confirmed by user 2026-10-13."

### 2. Photos des adresses
expected: Photo téléversée affichée sur la fiche ; photo héritée (URL/data) rendue telle quelle ; suppression de l’adresse sans orphelin.
result: pass
note: "Confirmed by user 2026-10-13."

### 3. Visité préservé + intitulés honnêtes
expected: Modifier une adresse (nom, ville…) ne réinitialise jamais « déjà visité » ; libellé de groupe ville honnête.
result: pass
note: "Confirmed by user 2026-10-13."

### 4. Garde de rattachement (foyer)
expected: Un prestataire ne propose que les types du foyer courant (jamais ceux d’un autre foyer) ; sans type = « Sans type » affiché.
result: pass
note: "Confirmed by user 2026-10-13."

### 5. Textes honnêtes (fidélité, landing, connexion)
expected: Libellés fidélité/landing/connexion conformes au mode réel (en ligne d’abord, pas de promesse hors-ligne).
result: pass
note: "Confirmed by user 2026-10-13."

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
