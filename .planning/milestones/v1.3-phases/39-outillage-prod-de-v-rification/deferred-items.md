# Phase 39 — Deferred items (hors périmètre du plan 39-01)

## 2026-11-09 — plan 39-01

- **Échec unitaire préexistant** (hors périmètre, non corrigé) :
  `app/src/modules/calendrier/calendrier-page.test.tsx` l.165 — « Anniversaires » :
  `findByText('Journée libre')` échoue. 243/244 fichiers verts, 1987/1988 tests verts.
  Le plan 39-01 ne touche aucun fichier `app/` (scripts + docs uniquement), le défaut
  est donc préexistant au plan. À traiter dans un chantier dédié.
  status: acknowledged

## 2026-11-09 — plan 39-02

- **Échec unitaire préexistant, inchangé** (hors périmètre, non corrigé) :
  `app/src/modules/calendrier/calendrier-page.test.tsx` l.165 — même défaut que
  celui consigné par le plan 39-01. 243/244 fichiers verts, 1987/1988 tests
  verts. La chaîne §2.7 du plan 39-02 est verte partout ailleurs : typecheck ✅,
  build ✅, e2e standard 163 passed / 9 skipped / 0 failed ✅.
- **Run réel du wrapper non exécuté ici (DS-01, par conception)** : la machine
  de travail n'a ni stack joignable ni SUPABASE_SECRET_KEY. Passage obligatoire
  avant /gsd-verify-work : `sh scripts/test-join-token-real.sh` depuis l'hôte de
  la stack — les 6 points JT-02 doivent être verts avec la ligne « comptes
  purgés, purge prouvée (re-delete → 404) » du trap.
  status: acknowledged
