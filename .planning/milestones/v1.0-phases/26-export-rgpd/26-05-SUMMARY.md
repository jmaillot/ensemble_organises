---
phase: 26-export-rgpd
plan: "05"
subsystem: frontend/parametres
tags: [gdpr, rgpd, export, panneau, react-query, storage, signed-url]

requires:
  - phase: 26-export-rgpd
    plan: "02"
    provides: "Migration 0158 : RPC request_gdpr_export, table gdpr_export_jobs (RLS select propre), politique Storage gdpr_exports_read scellée <user_id>/"
  - phase: 26-export-rgpd
    plan: "03"
    provides: "Edge gdpr-export-run : machine en_attente→en_cours→pret|echec effective, storage_path=<uid>/<job>.zip"

provides:
  - "Panneau « Mes données (RGPD) » dans Paramètres : déclencheur, 3 états + durée écoulée, historique, téléchargement signé ≤ 24 h au clic, échec retentable"
  - "api.ts : requestGdprExport (RPC, aucun repli démo), fetchGdprExports (select RLS trié), signGdprExportDownload (createSignedUrl 86400 s au clic)"
  - "types.ts : StatutJobExport + statutJobExportLabels (convention roleLabels)"
  - "Tests Vitest 8 comportements du panneau"

affects:
  - 26-04 (la push annonce « votre archive est prête » et renvoie vers CE panneau, D-04)
  - 26-07 (UAT RGPD : la surface humaine RGEX-01/02 est ici)

actuals:
  tokens: 6200
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Job asynchrone vu de l'UI : useQuery + refetchInterval 4000 tant qu'un job est actif, horloge locale à la seconde qui ne mute QUE l'état du composant (jamais la requête)"
    - "Lien signé calculé au clic dans le handler : la valeur vit dans le handler, jamais dans un store ni un état persistant (D-04/T-26-15)"
    - "Libellés d'états SQL par Record exporté de types.ts (convention roleLabels) — jamais de valeur SQL dans le JSX"

key-files:
  created:
    - app/src/modules/parametres/components/gdpr-export-panel.tsx
    - app/src/modules/parametres/components/gdpr-export-panel.test.tsx
  modified:
    - app/src/modules/parametres/api.ts
    - app/src/modules/parametres/types.ts
    - app/src/modules/parametres/parametres-page.tsx

decisions:
  - "Déviation de tier assumée (consignée au plan) : createSignedUrl côté navigateur au clic, l'autorisation restant évaluée par la storage-api à la signature contre la politique scellée gdpr_exports_read (0158, testée en SQL par 26-02, menace T-26-15) — même signature qu'un déplacement futur dans un RPC"
  - "Polling 4000 ms + horloge locale : la seconde qui passe ne provoque jamais un re-fetch réseau, seule la ligne de job fait foi"
  - "Aucun garde admin (D-08) : le panneau ne touche ni useIsAdmin ni useHouseholdStore pour se conditionner — test 5 verrouille"

metrics:
  duration: ~15 min
  completed: 2026-10-27
status: complete
plan_head_before: e1f475d3ff8c82c2e8b97bd73f477210be6c25d8
plan_head_after: 587324923e593187fc982cc1d4a7e2038b37d7b7
commits: 2
requirements-completed: [RGEX-01, RGEX-02]
---

# Phase 26 Plan 05: Panneau RGPD « Mes données » Summary

**Panneau Paramètres qui déclenche l'export par RPC, suit les trois états avec durée écoulée (jamais de pourcentage), liste l'historique et télécharge par un lien signé de 24 h maximum calculé au clic — échec visible et retentable.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-10-27T09:43:33Z
- **Completed:** 2026-10-27T09:57:49Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- **Tracer (Task 1)** : test écrit EN PREMIER, vu ROUGE (import du module manquant), puis implémenté au minimum — 6 comportements verts : déclencheur `supabase.rpc('request_gdpr_export')`, état « en attente » après invalidation de la query, « en cours » + durée écoulée sans aucun pourcentage (D-03), « Télécharger » appelant `createSignedUrl(storage_path, 86400)` au clic sans jamais afficher l'URL dans le DOM (D-04/RGEX-01), échec avec message + « Réessayer » (D-02), rendu sans garde admin (D-08), historique plus récents d'abord (D-07).
- **Expansion (Task 2)** : bouton de téléchargement conditionné à un lien vivant (`storage_path` non null ET `created_at` < 24 h) — au-delà, « Lien expiré » + « Régénérer un export » qui relance un cycle complet ; aucune offre de téléchargement sans `storage_path` ; single-flight UI (boutons désactivés pendant la mutation, reflet de l'unicité D-06 tenue en base) ; erreurs inline (`role="alert"`) ET toast ; état vide soigné (texte d'invitation avant le premier export, §6).
- **Chaîne complète (Task 3)** : typecheck + 1636 tests Vitest (202 fichiers) + build Vite verts ; e2e **155 passed, 7 skipped, exit 0** — baseline 155 de la clôture 25-08 maintenue, zéro régression du montage. `parametres-page.test.tsx` déjà vert sans assouplissement.

## Task Commits

1. **Task 1 (tracer): chemin mince testé** - `db38845` (feat)
2. **Task 2: expansion — lien vivant borné à 24 h** - `5873249` (test — le code de la tâche 2 était déjà dans le commit du tracer, exécuté à qualité production ; seuls les tests d'acceptance nouveaux ont un delta)
3. **Task 3: chaîne complète + e2e** — aucun delta de code (pure vérification, preuves ci-dessus)

## Decisions Made

1. **Déviation de tier assumée — `createSignedUrl` côté navigateur au clic** : la Responsibility Map de 26-RESEARCH assignait le tier primaire « Edge ou RPC » à la génération du lien signé ; le plan retient le tile secondaire (décision déclarée en tête de plan, engagée ici devant l'UAT). Quatre raisons : (1) la frontière d'autorisation ne bouge pas — la storage-api évalue la politique scellée `gdpr_exports_read` de 0158 (préfixe `<user_id>/`) à la signature, testée en SQL par 26-02 avec ses cas négatifs (RGEX-03) ; (2) précédent du dépôt — l'ardoise signe déjà ses URLs côté client, avec TTL réduit ici à 86 400 s (jamais les 30 j de l'ardoise) ; (3) la vraie garde produit est D-04 — un seul endroit où vit le lien (cet écran), aucune persistance, aucun envoi hors de l'écran (T-26-15/T-26-17) ; (4) contrôle job∩demandeur redondant — `createSignedUrl` n'est tenté que sur des lignes déjà filtrées par la RLS `gdpr_export_jobs` (`user_id = auth.uid()`). Un déplacement futur dans un RPC est un changement local de `api.ts`, sans changement de table ni de politique.
2. **Libellés d'états via `statutJobExportLabels`** (convention `roleLabels`) — aucune valeur SQL des quatre statuts dans le JSX.
3. **Horloge de suivi locale** : le timer de seconde ne mute que l'état du composant ; la requête réseau ne suit que la ligne de job (refetch 4000 ms tant qu'un job est actif, silence sinon).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test 1 du tracer : ordre mock/relecture inversé**
- **Found during:** Task 1
- **Issue:** Le mock retournant la ligne « en attente » était installé APRÈS le clic, alors que l'invalidation de la query déclenche la relecture immédiatement : la relecture s'exécutait sans implémentation.
- **Fix:** Réordonnancement du mock avant le clic (première lecture vide via `mockImplementationOnce`, relecture avec la ligne).
- **Files modified:** gdpr-export-panel.test.tsx
- **Committed in:** db38845

### Consolidation

- **Task 2 sans commit de code** : la robustesse exigée (lien vivant borné, retente, single-flight, erreurs, états vides) était déjà dans le commit du tracer, exécuté à qualité production (jamais un jetable). Le delta de la tâche est constitué des deux tests d'acceptance nouveaux (`5873249`). Vérifications passées : typecheck, 91 tests parametres, build.
- **Task 3 sans commit** : pure vérification (chaîne complète + e2e), aucun delta de code.

## Known Stubs

Aucun.

## Threat Flags

Aucune surface nouvelle hors du threat model du plan : la seule frontière touchée est `navigateur → storage-api (createSignedUrl)`, déjà inscrite avec T-26-15 (mitigé : calcul au clic, TTL 86400, aucune persistance) et T-26-17 (accepté : l'URL transite le temps du clic dans un anchor éphémère). Aucune dépendance npm ajoutée (T-26-SC inchangé).

## User Setup Required

None.

## Self-Check: PASSED

- [x] `app/src/modules/parametres/components/gdpr-export-panel.tsx` + `.test.tsx` existent (commit db38845)
- [x] Commits db38845 et 5873249 trouvés dans `git log`
- [x] Preuve ROUGE consignée : premier run du test en échec sur l'import du module inexistant, AVANT toute implémentation
- [x] `cd app && npm run typecheck && npm test && npm run build` verts (1636 tests / 202 fichiers)
- [x] `npm run test:e2e` : 155 passed, 7 skipped, exit 0 (baseline 155 tenue)
- [x] TTL et unicité du lien verrouillés par les tests (86400 au clic ; lien expiré sans bouton mort ; aucun Télécharger sans storage_path)
