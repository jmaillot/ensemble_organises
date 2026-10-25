---
status: complete
phase: 15-voyage-espace
source: [15-01-SUMMARY.md, 15-02-SUMMARY.md, 15-03-SUMMARY.md, 15-04-SUMMARY.md]
started: 2026-10-13T00:00:00Z
updated: 2026-10-13T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Création puis fiche
expected: Créer un voyage (enfant coché) ouvre sa fiche avec les 7 onglets.
result: pass
note: "Confirmed by user 2026-10-13."

### 2. Liste et navigation
expected: Liste ordonnée par date de départ ; chaque carte a « Ouvrir » ; la fiche a « Retour aux voyages » et « Ouvrir la fiche ».
result: pass
note: "Confirmed by user 2026-10-13."

### 3. Onglets étanches et compteurs
expected: Tâches/notes/courses/adresses du voyage seul (jamais du foyer) ; carte « tâches du voyage à préparer » avec le bon compte.
result: pass
note: "Confirmed by user 2026-10-13."

### 4. Rubrique Membres (admins seuls)
expected: Paramètres liste foyer + invités ; cochage/décochage admin ; enfant marqué « sans budget » ; Infos affiche la liste ; voyage vidé = bandeau visible.
result: pass
note: "Confirmed by user 2026-10-13."

### 5. Partage par code
expected: Générer affiche code + lien + QR ; rouvrir les réaffiche sans régénérer ; un proche rejoint (compte ou invité).
result: pass
note: "Confirmed by user 2026-10-13."

### 6. Budget et répartition
expected: Dépense ajoutée ; édition (admin partout, créateur sur ses lignes) ; camembert « Qui a dépensé quoi » ; légende « on vous doit / vous devez ».
result: pass
note: "Confirmed by user 2026-10-13."

### 7. Contenus enrichis
expected: Note avec photo ; tâche modifiable ; adresse avec photo + interrupteur visité ; création d’adresse sans note acceptée.
result: pass
note: "Confirmed by user 2026-10-13."

### 8. Cycle de vie
expected: Figer rend lecture seule ; rouvrir répare (admin) ; quitter retire et ramène à la liste.
result: pass
note: "Confirmed by user 2026-10-13."

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
