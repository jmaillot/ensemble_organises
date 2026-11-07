# Code Review Disposition — Phase 35

**Source :** `35-REVIEW.md` (status: issues_found) — 3 findings : 0 critical, 1 medium (MED-1), 2 low (LOW-1, LOW-2).
**Date :** 2026-11-06 · **Gate :** advisory (jamais bloquant)

| Finding | Sévérité | Titre | Disposition | Source |
|---|---|---|---|---|
| MED-1 | medium | `sign-in-page.tsx:141` — `navigator.onLine` lu une fois au rendu, non réactif | **fixed** — commit `4d089f1` (2026-11-06) : `useOnlineStatus()` (source `onlineManager`, même source que le bootstrap 35-04) ; harnais de test basculé sur `onlineManager.setOnline` ; chaîne §2.7 verte (1895/1895) | code_review_gate 2026-11-06 |
| LOW-1 | low | `sign-in-page.tsx:185-272` — indentation JSX héritée trompeuse (repo sans formatter) | **fixed** — commit `4d089f1` : ré-indentation +2 du contenu du fragment (cosmétique) | code_review_gate 2026-11-06 |
| LOW-2 | low | `types.ts:202-204` — `tasksDuJour` ré-encode le prédicat de retard de `lateDaysFor`/`isLate` (risque de drift) | **deferred** — deferred-items.md (2026-11-06) : le partage de prédicat exigerait un nouveau helper (`dueOnOrBefore`) distinct de `lateDaysFor` (qui renvoie 0 aussi pour « pas de due date ») ; refactor de sémantique pendant une clôture d'écarts = risque de churn sur une vue fraîchement testée (9 tests verts). Reporté comme item correctif autonome. | code_review_gate 2026-11-06 |

Aucun finding critique ou bloquant. Les trois findings sont ouverts, à trier (fix immédiat, phase corrective ou report) — MED-1 est un candidat naturel pour la phase corrective déjà ouverte par les trois « Échoué » de la matrice de validation (écran hors-ligne concerné par le même chemin D-07).
