---
status: complete
phase: 44-Décision cache maxAge par famille (CACHE-01)
source: [44-VERIFICATION.md]
started: 2026-11-11T20:53:53Z
updated: 2026-11-12T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. 44-02 Task 1 checkpoint — disponibilité de l'appareil de référence (D-05)
expected: Réponse « appareil disponible » → campagne §6 dans la même session ; sinon « différé » → mentions « Différé consigné » datées dans §7.1–7.4, aucune valeur inventée, PROJECT.md intouché
result: pass

### 2. 44-02 Task 2 — campagne on-device N=5 (runs froids validés §2.1), grille §7.4 remplie à chaud, commits de famille atomiques (D-07), Tests F/G/H/I verts après chaque commit
expected: §7.1/§7.3 remplis par dictée du panneau, 11 décisions §7.4 justifiées (a)(b)(c), valeurs en expressions de ms, gcTime ≥ maxAge max
result: pass

### 3. 44-02 Task 3 — chaîne §2.7 complète à l'état final, report PROJECT.md « Décision CACHE-01 », commit de consignation distinct (D-12)
expected: §7.6 citant chaque étape chiffrée + CHAINE-44-VERTE ; verdict par famille dans PROJECT.md avec renvoi §7.4 ; commit de consignation sans fichier app/src/
result: pass

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
