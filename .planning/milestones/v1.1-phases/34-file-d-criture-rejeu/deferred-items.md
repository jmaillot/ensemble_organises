# Deferred items — phase 34

## 2026-11-05 (plan 34-02)

- **2 tests préexistants en échec sur `app/src/modules/anniversaires/anniversaires-page.test.tsx`** (« bascule entre la vue liste et la vue calendrier », « garde le point d’un anniversaire d’origine anniversaire comme bouton d’édition (D-13, pendant) »).
  - Hors périmètre du plan 34-02 (aucun fichier du module anniversaires touché).
  - Preuve : les deux échecs sont identiques sur la baseline e14edef (HEAD avant le plan, vérifié dans un worktree jetable) — aucune régression introduite ici.
  - À corriger dans un chantier dédié (probable défaut de rendu/liste `byRole` dans la page, indépendant de l'offline).

## 34-03 (2026-11-05)

- `app/src/components/ui/route-error.tsx:128` garde un `window.addEventListener('online', …)` préexistant (retry d'ErrorBoundary, antérieur à la phase 33). Le plan 34-03 impose `onlineManager` comme source réseau unique pour le REJEU — hook conforme — mais ce listener historique subsiste hors périmètre (SCOPE BOUNDARY : pas créé par ce plan). À considérer si une campagne « source réseau unique » un jour consolide les listeners navigateur.
- Les 2 échecs de tests anniversaires (`anniversaires-page.test.tsx`) préexistent sur la baseline e14edef (déjà consignés au plan 34-02).
