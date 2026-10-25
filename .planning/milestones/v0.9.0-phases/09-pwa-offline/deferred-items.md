# Deferred items — Phase 09 PWA offline

Out-of-scope discoveries logged per the executor scope boundary
(pre-existing issues in files no 09-07 task touches — not fixed here).

## 1. Time-of-day flake: `use-notifications.test.tsx` (3 tests)

- **Found during:** 09-07 Task 3 full-suite gate (2026-10-12, ~08:25 Paris).
- **Symptom:** 3/3 tests fail with `expected 1 to be 0` (a message stays
  unseen after `markRead`) when the suite runs in the morning (Paris time).
- **Root cause (proven, not suspected):** `demoMessages` seeds carry fixed
  wall-clock times (`at('10:42')`, `10:44`, `10:45`, `09:18`, `18:10` for
  today). A run before 10:45 Paris leaves messages 1–3 in the future, so a
  `readAt = now` mark can never cover them.
- **Innocence proof:** identical 3/3 failure on the pristine pre-09-07 tree
  (`5df6aa2`, separate worktree, same live backend) → not caused by the
  offline removal. Same file passes 3/3 under `TZ=Pacific/Kiritimati`
  (20:30 local, all seed times in the past) → purely the wall clock.
- **Why not fixed here:** file and code path untouched by 09-07 (scope
  boundary); making seeds time-robust touches demo data shared with e2e.
- **Suggested owner:** whoever next touches notifications/messages — use
  relative times (`now() - minutes`) for seed messages instead of fixed
  `at('HH:MM')`, or pin the clock in the test file.
- **Certificate note:** 09-06's closing run (17:45 Paris, past 10:45) was
  88/88 green; a post-10:45 Paris re-run of this suite is green with zero
  code change.

**Statut (passe de vérité du 2026-10-17) : CLOS** par `1f6eb50` (plan 19-15) —
le remède suggéré ici (« instants relatifs `now() - minutes` ») a été appliqué
**et** renforcé. Les cinq `created_at` de `demoMessages` sont désormais des
instants relatifs (`app/src/lib/data/seed.ts:75` définit `minutesAgo`, employé
en `:1281`, `:1290`, `:1299`, `:1308`, `:1317`), et une garde de **classe**
(`app/src/lib/seed-instants.test.ts`) refuse tout `created_at` ensemencé dans le
futur — sur **toutes** les tables de `seedRows()`, pas seulement les messages —
et **échoue** si elle ne trouve aucun champ (le « contrôle qui ne regarde
rien »). La suite `use-notifications` est verte dans la chaîne complète du
2026-10-17 (1275 tests / 149 fichiers, `npm test`). Le flake ne dépend donc plus
de l'heure d'exécution : la note de certificat ci-dessus (« verte après 10 h 45,
et re-vérifiée telle quelle ») est **périmée** — la garantie n'est plus
l'heure de la journée mais l'instant relatif, verrouillé par la garde.

*Ce registre est désormais entièrement balayé : son unique constat est fermé.*
