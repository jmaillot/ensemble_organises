---
status: testing
phase: 34-file-d-criture-rejeu
source: [34-VERIFICATION.md]
started: 2026-11-05T14:30:00Z
updated: 2026-11-05T19:10:00Z
---

## Current Test

number: 1
name: Primauté Realtime réelle (D-16/WRQ-06)
expected: |
  Créer une écriture hors-ligne sur Courses, couper le réseau, revenir en ligne
  avec un second appareil connecté au même foyer, observer l'overlay se
  remplacer par les données serveur (id et client_key inchangés, pas de doublon
  ni flash d'ancien état). La ligne optimiste est remplacée par le row serveur ;
  aucune ligne dupliquée.
awaiting: user response

## Tests

> Reprise : les UAT étaient bloquées par G-34-1 (TypeError: NetworkError au
> create hors-ligne) — gap fermé par le plan 34-05 (write-policy + routage
> Tier 1 des écritures Courses, commit 0403e0b). Les 3 tests repartent de zéro.

### 1. Primauté Realtime réelle (D-16/WRQ-06)
expected: Créer une écriture hors-ligne sur Courses, couper le réseau, revenir en ligne avec un second appareil connecté au même foyer, observer l'overlay se remplacer par les données serveur (id et client_key inchangés, pas de doublon ni flash d'ancien état).
result: [issue] TypeError: NetworkError when attempting to fetch resource — toast d'erreur affiché à l'ajout d'un article Courses hors-ligne
diagnosis: |
  L'écriture EST enfilée dans l'outbox (MutationCache.onError, query-policy.ts:124-136)
  et l'overlay optimiste reste peint (useResource.ts:182-184) — la chaîne 34-05
  fonctionne. Le défaut est en AVAL, dans la couche UI : `useResource.create`
  re-jette l'échec réseau après enfilage, et l'appelant `runQuietly`
  (courses-page.tsx:146-150) toast le message brut de la TypeError comme une
  erreur. L'utilisateur voit une alarme pour une écriture qui, en réalité,
  partira au rejeu — contraire à D-11/D-12 (l'état d'attente se lit sur le
  badge, pas en toast d'erreur).
  CLASSE (§2.7 E) : tout appelant Tier 1 qui catch pour toast reproduira le
  symptôme (taches, routines). Le correctif doit porter sur `useResource`,
  pas sur chaque appelant.
severity: mineure (fonctionnel : l'écriture partira ; UX : signal d'erreur mensonger)

### 2. Rendu visuel badge/toast (D-11/D-12/D-13)
expected: Enfiler 2 écritures hors-ligne puis provoquer 1 échec terminal ; observer la bannière, le compteur, le toast. Badge visible online et offline, retombe à zéro après rejeu complet, « N bloquées » ouvre le panneau, un seul toast par passe d'échec.
result: [pending]

### 3. Parcours e2e appareil réel
expected: Mode avion → ajouter un article Courses + cocher une tâche → retour réseau → vérifier que le serveur contient exactement les 2 écritures et que le badge descend à 0. Exactement une écriture serveur par action, zéro doublon, zéro perte silencieuse.
result: [pending]

## Summary

total: 3
passed: 0
issues: 1
pending: 3
skipped: 0
blocked: 0

## Gaps
