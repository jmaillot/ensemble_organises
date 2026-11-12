# Deferred items — Phase 32

## Hors périmètre (pré-existants, non touchés par 32-01)

- **2 tests rouges dans `app/src/modules/anniversaires/anniversaires-page.test.tsx`** (« bascule entre la vue liste et la vue calendrier », « garde le point d'un anniversaire d'origine anniversaire comme bouton d'édition (D-13, pendant) ») — échouent à HEAD `64c6ff1` (introduits avant le plan 32-01, sans modification locale du module ; introduit vraisemblablement par d404ed0 « corrections de la critique Impeccable »). Non liés au manifeste/PWA ; à corriger dans un plan dédié ou une passe fix.
  status: acknowledged
