# Deferred Items — Phase 33

## 33-01 — Échecs de test préexistant (hors périmètre, Rule SCOPE BOUNDARY)

**Découvert pendant :** Task 3 (tracer offline) — `npm test` complet.

- `app/src/modules/anniversaires/anniversaires-page.test.tsx` : 2 tests échouent
  (« bascule entre la vue liste et la vue calendrier », « garde le point d'un
  anniversaire d'origine anniversaire comme bouton d'édition (D-13, pendant) »).
- **Prouvé préexistant** : les mêmes 2 tests échouent au commit `d404ed0`
  (dernier à toucher ce fichier, antérieur à la phase 33), vérifié dans un
  worktree jetable. Le diff de 33-01 n'a touché aucun fichier du module.
- **Action :** non corrigé ici (hors périmètre 33-01). À traiter dans un plan
  de correctifs dédié — probablement un sélecteur de modale modifié par
  d404ed0 (« UI : corrections de la critique Impeccable ») sans mise à jour
  du test.
