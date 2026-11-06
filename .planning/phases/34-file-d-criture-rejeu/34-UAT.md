---
status: passed
phase: 34-file-d-criture-rejeu
source: [34-VERIFICATION.md]
started: 2026-11-05T14:30:00Z
updated: 2026-11-06T00:00:00Z
---

## Current Test

number: none
name: (session terminée — 3/3 passés)
expected: |
  Aucun test en attente.
awaiting: nothing

## Tests

> Reprise : les UAT étaient bloquées par G-34-1 (TypeError: NetworkError au
> create hors-ligne) — gap fermé par le plan 34-05 (write-policy + routage
> Tier 1 des écritures Courses, commit 0403e0b). Les 3 tests repartent de zéro.

### 1. Primauté Realtime réelle (D-16/WRQ-06)
expected: Créer une écriture hors-ligne sur Courses, couper le réseau, revenir en ligne avec un second appareil connecté au même foyer, observer l'overlay se remplacer par les données serveur (id et client_key inchangés, pas de doublon ni flash d'ancien état).
result: [pass]
note: |
  Passé après fermeture de UAT-34-1 par le plan 34-06 (absorption de l'échec
  enfilé dans useResource) : premier essai en issue (toast NetworkError, est 2026-11-06),
  rejeu vert après correctif.

### 2. Rendu visuel badge/toast (D-11/D-12/D-13)
expected: Enfiler 2 écritures hors-ligne puis provoquer 1 échec terminal ; observer la bannière, le compteur, le toast. Badge visible online et offline, retombe à zéro après rejeu complet, « N bloquées » ouvre le panneau, un seul toast par passe d'échec.
result: [pass]

### 3. Parcours e2e appareil réel
expected: Mode avion → ajouter un article Courses + cocher une tâche → retour réseau → vérifier que le serveur contient exactement les 2 écritures et que le badge descend à 0. Exactement une écriture serveur par action, zéro doublon, zéro perte silencieuse.
result: [pass]

## Summary

total: 3
passed: 3
issues: 1
pending: 0
skipped: 0
blocked: 0

> L'unique issue (UAT-34-1, toast NetworkError) a été diagnostiquée, planifiée
> (34-06), corrigée et son rejeu est passé. Les 3 tests sont verts au 2026-11-06.

## Gaps
