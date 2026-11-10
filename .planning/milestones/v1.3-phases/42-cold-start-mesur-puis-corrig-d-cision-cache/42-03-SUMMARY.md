---
phase: 42
plan: 03
subsystem: measurement-campaign
tags: [cold-start, offline, cache, deferred, protocol]
requires:
  - docs/MESURES-COLD-START-42.md (protocole Plan 02 — critères CA-02)
  - app/src/lib/boot-marks.ts (instrumentation Plan 01)
  - appareil Android réel (user_setup — NON RENCONTRÉ)
provides:
  - docs/MESURES-COLD-START-42.md (§2.1 purge réelle consignée, §7.1-7.6 remplis honnêtement)
  - Chaîne §2.7 verte prouvée à l'état final (§7.6)
affects:
  - Campagne de mesure future (remplit §7.1-7.4 au même protocole)
  - CACHE-01 — décision par famille encore ouverte, critères écrits et contraignants
tech-stack:
  added: []
  patterns:
    - différé consigné honnêtement (§2.7 I) — absence affirmée vérifiée par grep
    - consignation de purge alternative avec critères de validation de froid
key-files:
  created: []
  modified:
    - docs/MESURES-COLD-START-42.md
    - app/src/lib/boot-marks.ts (dette boot:done soldée en tête de plan)
    - .planning/PROJECT.md (état CACHE-01 documenté, hors git — .planning/ gitignored)
decisions:
  - L'utilisateur a répondu « pass » à la dictée des 5 runs → branche « appareil indisponible » du plan appliquée : différé consigné, aucune valeur inventée, COLD-02 et CACHE-01 ouverts avec état documenté
  - Purge réelle de la campagne = « vider le cache » paramètres Android (alternative documentée §2.1) avec critères de froid à deux faits (panneau « rien de persisté » + SW absent/~0 ms), sinon écart §7.5 et purge renforcée
  - query-policy.ts NON touché — le statu quo de fait n'est pas une décision CA-03 (elle exige la lecture du panneau) ; vérifié par grep : 9 familles à 24 h, 2 à 7 j, git status propre
metrics:
  duration: ~50 min
  completed: 2026-11-10
  tasks: 1 (Task 1 branche différé + Task 3 chaîne ; Task 2 non exécutée — dépend des données)
  commits: 5
  plan_head_before: faa1716756d59df0cd2e20d86afb53bd323531a6
  plan_head_after: 2914608
actuals:
  tokens: 30000
  tasks: 2
  commits: 5
status: complete
---

# Phase 42 Plan 03: Boucle mesure → correction → décision CACHE-01 Summary

**One-liner:** Campagne de mesure on-device close en **différé consigné honnêtement** — les 5 runs n'ont pas été dictés (« pass »), aucune valeur inventée (§2.7 I), la purge réelle par paramètres Android est documentée avec ses critères de froid, la dette `boot:done` de 42-01 est soldée, et la chaîne §2.7 complète est verte à l'état final (163 e2e passed, Docker disponible) — COLD-02 et CACHE-01 restent ouverts avec leur état documenté.

## Tasks Delivered

| Task | Type | Commit | Contenu |
|------|------|--------|---------|
| préparation | auto | 17bbca0 | Dette boot:done héritée de 42-01 soldée (Rule 1) — le total borne à borne du panneau en dépend |
| 1 (partie consignation) | checkpoint → différé | a31e965 | §2.1 purge réelle par paramètres Android + écart §7.5 (critères de froid à deux faits) |
| 1 (branche différé) + 3 | checkpoint → différé + auto | 6e1ca2d | §7.1-7.4 remplis comme différés motivés (aucune valeur inventée) + §7.6 bilan chaîne §2.7 verte |
| 2 | checkpoint | — | **Non exécutée** : décision CACHE-01 exige la lecture du panneau on-device — reste ouverte, état documenté dans PROJECT.md |

## Deviations from Plan

### Différé d'appareil (branche prévue par le plan)

Le plan prévoit explicitement la branche « appareil indisponible » (Task 1 : « HALTER le plan ici et consigner le différé honnêtement… puis clore le plan avec ce différé explicite ; CACHE-01 et COLD-02 restent alors ouverts avec leur état documenté »). C'est cette branche qui a été appliquée :

- L'utilisateur a préparé la purge mais a répondu « pass » à la dictée des 5 runs.
- **Aucune valeur de mesure n'a été inventée** ; aucune valeur d'émulateur (PM-01 : l'émulateur est exclu).
- `query-policy.ts` n'a PAS été modifié — vérifié §2.7 I : `git status` propre sur le fichier, 9 familles à 24 h / 2 à 7 j par grep.
- Task 2 (checkpoint:human-verify) n'a pas pu être franchie : sa matière (données du panneau) n'existe pas sans mesure.

### Auto-fixed Issues

**1. [Rule 1 - Bug, héritée 42-01] Dette `boot:done` non commitée**
- **Found during:** préparation (plan_state_note — diff décrit dans 42-01-SUMMARY mais jamais commité)
- **Fix:** pose explicite de `poserMark('boot:done')` dans `marquerSegmentFin('auth')`, commentée — commitée en tête du plan (17bbca0), avant les mesures futures.
- **Files modified:** app/src/lib/boot-marks.ts
- **Commit:** 17bbca0

## Preuves §2.7

- **Chaîne complète à l'état final (§7.6 du doc, chaque étape citée avec son résultat)** : `check-version-stamp.sh` OK (4 canaux égaux au SHA a31e965…), `test-sw-gate.sh` 4/4 verts, `typecheck` OK, `npm test` **2006 passed / 245 fichiers**, `npm run build` OK (precache 152 entrées), **e2e 163 passed / 9 skipped — Docker DISPONIBLE**, `check-sql-statique` 0 défaut (231 fonctions / 182 migrations — son absence de requête en phase 42 est un fait vérifié), auto-exercice du contrôle OK. **CHAINE-42-VERTE.**
- **Absences affirmées vérifiées (§2.7 I)** : `grep "Médiane"` → lignes d'en-tête de tableau uniquement (aucune médiane calculée — cohérent avec le différé) ; `git status app/src/lib/query-policy.ts` → propre ; sections §7.1-7.4 portent chacune un paragraphe de différé motivé, jamais un chiffre.
- **9 skips e2e** = baseline préexistante datée par 38-E2E-SIGNATURE.md (aucun skip nouveau).

## Known Stubs

Aucun stub de code. Les sections §7.1-7.4 du doc mesures sont des emplacements **intentionnellement vides** : le plan les interdit sans mesure réelle, et le différé est l'issue prévue par la branche « appareil indisponible » du Task 1.

**Exigences ouvertes (report hors plan, consigné) :**
- **COLD-02** : ouverte — aucune correction désignée par le profil n'a pu être livrée (le profil n'existe pas sans mesure). Aucun fix hors profil n'a été livré non plus : la section écarts §7.5 ne porte que le différé et la purge.
- **CACHE-01** : ouverte — critères CA-01/CA-02 écrits et contraignants (doc §5), décision en attente de la lecture du panneau. Le « statu quo de fait » de query-policy.ts n'est PAS une décision CA-03 (elle exige les données) — PROJECT.md documente cet état.

## Broken-windows ledger

Tentative `gsd_run windows append` — CLI `gsd_run` indisponible dans cet environnement (rc=127, défense citée). Registre best-effort non écrit ; les deux exigences ouvertes ci-dessus sont visibles dans PROJECT.md et STATE.md (orchestrator-owned).

## Threat Flags

Aucune nouvelle surface de sécurité : aucune frontière de confiance touchée, aucune installation de package (T-42-SC respecté — audit vide par conception), aucune donnée ne quitte l'appareil (T-42-03 : aucune décision rendue, donc rien de post-hoc).

## Notes pour la campagne de mesure future

1. Le protocole et les critères n'ont PAS bougé (PM-03, T-42-02 : toute modification post-hoc serait visible dans l'historique git) — la campagne applique le protocole sans le modifier.
2. La purge réelle est §2.1 : valider le froid à chaque run par les deux faits, sinon purge renforcée + écart §7.5.
3. Le mark `boot:done` est maintenant commité (17bbca0) — le total borne à borne du panneau est fiable.
4. Remplir §7.1 → corrections CU-02 si désignées → §7.2 → §7.3 → §7.4 + section « Décision CACHE-01 » de PROJECT.md (elle attend ses données).

## Self-Check: PASSED

- `docs/MESURES-COLD-START-42.md` modifié et versionné (commits a31e965, 6e1ca2d vérifiés dans l'historique).
- `app/src/lib/boot-marks.ts` commité (17bbca0 vérifié) — aucun diff résiduel (`git status` propre sur les fichiers du plan).
- Commits mesurés faa1716..HEAD : 4 (17bbca0, a31e965, 6e1ca2d, 25f0d5e).
- Commits mesurés faa1716..HEAD : 5 (17bbca0, a31e965, 6e1ca2d, 25f0d5e, 2914608).
- Commit SUMMARY du plan : `.planning/phases/` est gitignore dans ce dépôt (précision sur 42-01 : `.planning/PROJECT.md` racine est tracké et commité en 2914608, mais `phases/` est ignoré — le SUMMARY vit sur disque, jamais forcé).
