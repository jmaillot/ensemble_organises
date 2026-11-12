# Deferred items — phase 37 (filet de tests fiable)

## 1. Flocon sibling découvert en clôture — household-store.test.ts WR-03 (hors périmètre TEST-01)

- **Découvert pendant :** plan 37-02, re-vérification finale de la chaîne §2.7 (après édition de docs/RETROSPECTIVE.md)
- **Symptôme :** `switchWithPurge — ordre purge → clear → switch (OFFR-04, D-04) > rétablit la persistance sur le nouveau couple après le switch (WR-03)` — `expected '{"buster":"v2",…}' to contain 'post-switch'` (household-store.test.ts:331). 2 échecs dans la première exécution, 1 dans la seconde, 13/13 verts deux fois en isolation.
- **Nature :** flocon temporel sous charge parallèle (243 fichiers) — attente fixe de 1200 ms (l.330) pas toujours suffisante sous contention worker, même famille que le flocon test D corrigé en `b0c9c3d`.
- **Périmètre :** test non modifié par la phase 37, aucune cause dans ses diffs (les seuls changements de la phase touchent auth-bootstrap-offline.test.tsx, session-cache/store, e2e spec et docs). Out-of-scope → non corrigé (§2.7, périmètre).
- **Re-test proposé :** même traitement que TEST-01 (options explicites sur l'attente, bornées au test), ou investigation de `isolate: false` signalée par Vitest. Candidat naturel pour une future passe « filet de tests » si le jalon v1.3 contient de la dette test.
  status: acknowledged
