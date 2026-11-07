---
phase: 35-deep-links-validation-multi-os
reviewed: 2026-11-06T00:00:00Z
depth: deep
files_reviewed: 14
files_reviewed_list:
  - app/e2e/deep-link-redirect.spec.ts
  - app/src/app/route-preload.test.tsx
  - app/src/app/route-preload.ts
  - app/src/app/router.tsx
  - app/src/lib/query-policy.test.ts
  - app/src/lib/query-policy.ts
  - app/src/modules/landing/__tests__/connexion-requise.test.tsx
  - app/src/modules/landing/sign-in-page.tsx
  - app/src/modules/taches/__tests__/jour-view.test.tsx
  - app/src/modules/taches/components/task-row.tsx
  - app/src/modules/taches/taches-jour-page.tsx
  - app/src/modules/taches/types.ts
  - app/src/pwa/manifest.test.ts
  - app/vite.config.ts
findings:
  critical: 0
  high: 0
  medium: 1
  low: 2
  total: 3
status: issues_found
---

# Phase 35 : Code Review Report (Deep links & validation multi-OS)

**Reviewed:** 2026-11-06
**Depth:** deep (traces cross-files : router → RequireAuth → sign-in-page ; types.ts → utils.daysBetween ; query-policy → taches/api ; hooks/use-taches → taches-jour-page)
**Files Reviewed:** 14
**Status:** issues_found (aucun bloquant)

## Summary

Vérification exécutée : `npm run typecheck` → passe. Lecture croisée de tous les fichiers du diff avec leurs dépendances (`daysBetween`/`todayIso` dans `utils.ts`, `RequireAuth`/`internalPathOf`, `useTaches`, `sortTasks`, `lateDaysFor`).

Le cœur de la phase est solide :

- `tasksDuJour` (types.ts:202-204) utilise une comparaison de **date** pure (`daysBetween(todayIso(), dueDate) <= 0`), pas un instant UTC — cohérent avec `lateDaysFor`, aucune décalage de fuseau. Le jour même est inclus (`= 0`), demain exclu (`> 0`), les faites exclues, la sémantique est correcte.
- La route `/taches/jour` est déclarée avant `/taches/aide` et n'entre en conflit avec aucune route paramétrée (aucun `/taches/:id` n'existe).
- `internalPathOf` filtre `state.from` (origine même uniquement) avant affichage — pas d'injection de chemin arbitraire dans l'écran « connexion requise » ; rendu React, pas de `dangerouslySetInnerHTML`.
- La garde D-08 est respectée : `state.from` via l'historique uniquement, `navigator.onLine` est une lecture, le test e2e prouve le redirect par le comportement (URL finale), pas par une lecture de stockage.
- L'ajout `task_assignees` à `OFFLINE_FAMILIES` est cohérent : préfixe sans collision avec `tasks`/`task_lists`, testé contre `TASK_ASSIGNEES_TABLE` réel (pas de dérivation des deux côtés).
- TaskRow optionnel : les boutons d'édition/suppression disparaissent proprement quand les callbacks sont absents — pas de bouton mort.

## Findings

### Medium

**[MED-1] `navigator.onLine` lu au rendu, non réactif — file:line `app/src/modules/landing/sign-in-page.tsx:141`**
L'écran « connexion requise » dépend de `!navigator.onLine` évalué une fois au rendu. Si l'utilisateur arrive sur `/connexion` hors ligne puis que le réseau revient (Wi-Fi rétabli, avion désactivé), l'écran « hors ligne » reste affiché tant qu'aucun re-render n'a lieu — le formulaire n'apparaît pas alors que la connexion est de nouveau possible. Le bouton « Se reconnecter » fournit une échappatoire manuelle, mais l'état affiché ment sur la réalité du réseau, et l'inverse est pire : revenir en ligne ne relance rien automatiquement vers la vue visée. Aucun test ne couvre le basculement de connectivité pendant l'affichage.
**Fix suggéré :** souscrire aux événements `online`/`offline` (`useSyncExternalStore` ou un petit hook projet, cohérent avec `OfflineBanner` s'il en expose un), et re-rendre à chaque changement — voire naviguer automatiquement vers la vue visée quand la reconnexion réussit.

### Low

**[LOW-1] Indentation cassée du bloc conditionnel inséré — file:line `app/src/modules/landing/sign-in-page.tsx:185-272`**
Le JSX original (depuis `<Link to="/">` jusqu'au fragment fermant) a été conservé à son indentation d'origine sous le nouveau `{offlineWithoutSession ? (...) : (<> … </>)}`. Le projet n'a pas de formateur par choix, mais le code environnant est indenté de façon constante ; un lecteur croit voir un bloc de niveau `section` alors qu'il est imbriqué à trois niveaux.
**Fix suggéré :** réindenter le corps du fragment d'un niveau supplémentaire, sans changer un seul token.

**[LOW-2] Le prédicat « en retard » existe désormais en deux endroits — file:line `app/src/modules/taches/types.ts:202-204` vs `types.ts:102-104`**
`tasksDuJour` réécrit `status !== 'fait' && dueDate !== null && daysBetween(today, dueDate) <= 0` alors que `lateDaysFor` encode déjà la notion d'échéance atteinte/dépassée (`-daysBetween(...) >= 0`). Les deux diffèrent subtilement (jour même inclus des deux côtés, mais `lateDaysFor` borne par `Math.max(0, …)`) et le commentaire de `tasksDuJour` promet que le tri « épingle le retard en tête » en relisant `sortTasks` → `lateDaysFor` : si la définition de « retard » change un jour dans `lateDaysFor`, `tasksDuJour` dérivera silencieusement (une tâche « en retard » au sens du tri mais absente de la vue, ou l'inverse). C'est exactement la classe « corriger la classe, pas l'instance » (AGENTS.md §2.7 E).
**Fix suggéré :** exprimer `tasksDuJour` en réutilisant le champ dérivé déjà présent sur chaque `Task` : `task.status !== 'fait' && task.dueDate !== null && task.lateDays >= 0 && task.dueDate <= todayIso()` — ou, plus simple, `task.status !== 'fait' && task.dueDate !== null && (task.isLate || task.dueDate === todayIso())`, de sorte que la définition du jour vive à un seul endroit.

## Points vérifiés sans finding

- `daysBetween` : `Math.round((to-from)/86_400_000)` — exact y compris DST, car les deux instants sont construits en heure locale (`toLocalDate`).
- `RouteChunkCount` mis à jour à 62 avec commentaire daté ; `OFFLINE_FAMILIES` à 11 avec justification D-04 — les deux compteurs sont tenus au bon endroit.
- Le test D-08 (`connexion-requise.test.tsx:73-85`) espionne `Storage.prototype.setItem` pour les deux protos ; les espions sont restaurés en `finally`, `Object.defineProperty(navigator,'onLine')` restauré en `afterEach` — pas de fuite entre tests.
- Le test e2e simule l'expiration par purge des clés de session réelles ; si un nom de clé dérive, l'étape 3 échoue bruyamment (pas de faux vert).
- Pas de secret, pas d'`eval`, pas de directive de linter, pas de `transition: all`, pas de courbe d'easing inventée dans le diff. Les commentaires nomment les raisons en français, conformes aux règles du projet.

---

_Reviewed: 2026-11-06_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
