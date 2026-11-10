---
status: complete
phase: 42-cold-start-mesur-puis-corrig-d-cision-cache
source: [42-VERIFICATION.md]
started: 2026-11-10T15:30:00Z
updated: 2026-11-10T15:30:00Z
---

## Current Test

number: 1
name: Campagne de mesure on-device COLD-02
expected: |
  Sur l'appareil Android de référence, exécuter le protocole du doc mesures (purge §2 avec critères de froid à deux faits, réseau coupé, N = 5 runs), lire la section « Amorçage » du panneau offline (4 segments + total borne à borne) et consigner les valeurs dans docs/MESURES-COLD-START-42.md §7.1. Attendu : 5 runs consignés avec estampille, branche auth, 4 segments et total ; médiane par segment calculée ; aucune valeur inventée.
awaiting: user response

## Tests

### 1. Campagne de mesure on-device COLD-02
expected: 5 runs au protocole (purge §2.1, mode avion, N=5), section « Amorçage » lue, §7.1 rempli avec estampille + branche auth + 4 segments + total, médianes par segment.
result: [skipped]
reason: "Deferred follow-up: campagne interrompue puis runs 3/4/5 abandonnés (décision produit 2026-11-10) — 2 runs dictés (v1.2-71-, hors ligne) consignés §7.1 du doc mesures, aucune médiane ni conclusion (protocole N=5), écart procédure purge complète §7.5 ; COLD-02 reporté hors phase, état consigné PROJECT.md."

### 2. Décision CACHE-01 par famille
expected: Après la campagne, appliquer les critères §5 du doc mesures aux 11 familles OFFLINE_FAMILIES avec les volumes réhydratés du panneau, et documenter la décision (statu quo justifié ou nouvelle valeur) dans PROJECT.md — une valeur + justification par famille ; si un maxAge change, query-policy.ts + Test H verts dans le même commit.
result: [skipped]
reason: "Deferred follow-up: dépend des données du panneau issues de la campagne complète (test 1), abandonnée par décision produit — décision CACHE-01 non prise, query-policy.ts inchangé (statu quo de fait, pas une décision CA-03) ; critères §5 du doc mesures restants contraignants pour une campagne future, état consigné PROJECT.md."

## Summary

total: 2
passed: 0
issues: 0
pending: 0
skipped: 2
blocked: 0

## Gaps
