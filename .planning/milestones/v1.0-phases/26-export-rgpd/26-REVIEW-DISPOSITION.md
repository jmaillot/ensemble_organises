# Disposition — Review Phase 26 (Export RGPD)

**Date :** 2026-10-27 · **Décision utilisateur :** Fixer maintenant
**Review :** `26-REVIEW.md` (11 constats : 1 Critique, 4 Majeurs, 4 Moyens, 2 Mineurs)
**Fixes :** `26-REVIEW-FIX.md` — 4/4 corrigés, un commit chacun, preuves §2.7.

## Corrigés (cette phase)

| ID | Sévérité | Résumé | Commit |
|----|----------|--------|--------|
| CR-01 | Critique | Purge muette au 51ᵉ export (cap rempli de jobs déjà purgés) → clôture du job purge (delete + audit `set null`), test 0165 | `ac2dc3c` |
| HR-02 | Majeur | Fragments ZIP triés lexicographiquement → offset de départ pré-avance + tri numérique (migration 0165) | `05ec120` |
| MR-01 | Moyen | zip-slip clés médias client-contrôlées → `safeMediaPath()` sur les 4 points d'entrée, T-26-09 corrigé | `85ca920` |
| MR-02 | Moyen | Assertion tautologique 0158 §3d + isolement assignataire non testé → test 0161 étendu (Bob→Alice extrait, Charlie absent) | `e9be126` |

## Reportés au backlog (non bloquants pour la phase)

HR-01 (double distribution push `export` : branche 0164 appelle toute la table reminder), HR-03 (secondaires « module entier » dupliqués par lot), HR-04 (erreurs par-objet `storage.remove()` invisibles → audit potentiellement trop vert), MR-03 (pagination offset sous écritures concurrentes), MR-04 (`consume_push_reminders` aborte sur non-UUID), LR-01…LR-05, NT-01, NT-02.

→ À trier vers `.planning/todos` ou phase 27/28. **HR-01 est le plus substantiel** (notifications en double jusqu'à correction).

## Chaîne §2.7 après fixes

check-sql-statique 216 fn/165 migr/97 tests 0 défaut · test-check 6 verts · migrate 0165 OK · test-db full 95 fichiers verts · typecheck/test (1636)/build verts · Edge déployées + probe 400 (mode secret OK). e2e non relancé (front inchangé par les fixes ; dernier run 155 passed exit 0 lors de 26-07).

Caveat consigné : un export en vol pendant le déploiement pourrait mêler anciens/nouveaux noms de fragments ; tout export postérieur est correctement ordonné.
