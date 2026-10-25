---
phase: 18-durcissement-frontend-correctifs-de-revue-de-code
verified: 2026-10-15T14:20:48Z
status: human_needed
score: 7/7 must-haves verified
covered_files:
  - .planning/phases/18-durcissement-frontend-correctifs-de-revue-de-code/18-01-PLAN.md
  - .planning/phases/18-durcissement-frontend-correctifs-de-revue-de-code/18-01-SUMMARY.md
  - .planning/phases/18-durcissement-frontend-correctifs-de-revue-de-code/18-02-PLAN.md
  - .planning/phases/18-durcissement-frontend-correctifs-de-revue-de-code/18-02-SUMMARY.md
  - .planning/phases/18-durcissement-frontend-correctifs-de-revue-de-code/18-03-PLAN.md
  - .planning/phases/18-durcissement-frontend-correctifs-de-revue-de-code/18-03-SUMMARY.md
  - .planning/phases/18-durcissement-frontend-correctifs-de-revue-de-code/18-04-PLAN.md
  - .planning/phases/18-durcissement-frontend-correctifs-de-revue-de-code/18-04-SUMMARY.md
  - .planning/phases/18-durcissement-frontend-correctifs-de-revue-de-code/18-05-PLAN.md
  - .planning/phases/18-durcissement-frontend-correctifs-de-revue-de-code/18-05-SUMMARY.md
  - app/src/components/shared/folder-tabs.test.tsx
  - app/src/components/shared/folder-tabs.tsx
  - app/src/hooks/use-auth.test.ts
  - app/src/hooks/use-auth.ts
  - app/src/lib/data/adapter.ts
  - app/src/lib/data/keys.test.ts
  - app/src/lib/data/keys.ts
  - app/src/lib/data/local-adapter.ts
  - app/src/lib/data/remove-contract.test.ts
  - app/src/lib/data/supabase-adapter.ts
  - app/src/main.test.tsx
  - app/src/main.tsx
  - app/src/modules/adresses/api.test.ts
  - app/src/modules/adresses/api.ts
  - app/src/modules/adresses/components/place-form-dialog.test.tsx
  - app/src/modules/adresses/components/place-form-dialog.tsx
  - app/src/modules/adresses/hooks/use-adresses.ts
  - app/src/modules/adresses/types.ts
  - app/src/modules/animaux/api.test.ts
  - app/src/modules/animaux/api.ts
  - app/src/modules/ardoise/api.test.ts
  - app/src/modules/ardoise/api.ts
  - app/src/modules/ardoise/components/expense-form-dialog.test.tsx
  - app/src/modules/ardoise/components/expense-form-dialog.tsx
  - app/src/modules/ardoise/spent.test.ts
  - app/src/modules/ardoise/types.ts
  - app/src/modules/dashboard/dashboard-page.test.tsx
  - app/src/modules/dashboard/types.ts
  - app/src/modules/notes/hooks/use-notes.test.tsx
  - app/src/modules/notes/hooks/use-notes.ts
  - app/src/modules/notes/notes-page.tsx
  - app/src/modules/prestataires/api.test.ts
  - app/src/modules/prestataires/api.ts
  - app/src/modules/recettes/api.ts
  - app/src/modules/routines/api.ts
  - app/src/modules/routines/components/routine-history.tsx
  - app/src/modules/routines/hooks/use-routines.ts
  - app/src/modules/routines/routines-page.test.tsx
  - app/src/modules/routines/routines-page.tsx
  - app/src/modules/taches/api.ts
  - app/src/modules/taches/components/task-row.tsx
  - app/src/modules/taches/hooks/use-taches.ts
  - app/src/modules/taches/taches-page.test.tsx
  - app/src/modules/taches/taches-page.tsx
  - app/src/modules/voyages/api.ts
  - app/src/modules/voyages/components/trip-notes-tab.tsx
  - app/src/modules/voyages/components/trip-tasks-tab.tsx
  - supabase/migrations/0123_dashboard_widget_width_zero.sql
  - supabase/tests/0122_dashboard_widget_width.sql
  - supabase/tests/0123_rls_delete_zero_rows.sql
covered_digest: "v3:sha256:fb2b2bdb197677d157d555f0c42fec7fa11e1a94987751e3171496ca5a3a7068"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Réglage d'accueil : masquer un widget quand la lecture de `dashboard_widgets` n'est pas chargée (ou a échoué), puis recharger."
    expected: "Le widget masqué reste masqué après rechargement (aucune seconde série de lignes pour le couple (member_id, widget_type), aucun 23505 silencieux)."
    why_human: "Le défaut documenté (deferred-items.md §1) se déclenche uniquement quand `widgets.rows` est vide au moment de `setWidgetOrder` — une course d'état que ni le test démo (Dexie, sans contrainte unique ni CHECK) ni le test SQL de CR-01 n'exerce. En mode Supabase, l'issue probable est un 23505 rejeté en silence (`void` dans dashboard-page.tsx). Non couvert par un test ; décision in/out-of-scope à prendre (le correctif candidat — un vrai `upsert` — est une décision de planification)."
  - test: "Amorçage d'auth : provoquer un échec de `loadHousehold` (réseau/5xx sur `household_members`), voir l'écran d'erreur, cliquer « Réessayer »."
    expected: "L'utilisateur atteint son tableau de bord (foyer rechargé)."
    why_human: "`retry` relance l'effet mais `signIn` pose `status='authenticated'` avant `await loadHousehold()` (session-store.ts:24-27), donc la seconde tentative prend la branche « session déjà établie » d'`applySession` et ne relit jamais le foyer (deferred-items.md §4, 0 appel à `household_members` mesuré) : l'utilisateur atterrit sur `/foyer` « Vous n'avez pas encore de foyer » alors que son foyer existe. Le test de `use-auth.test.ts` verrouille « l'échec rendu, la reprise, la non-fuite du détail » mais pas la restauration du foyer à la reprise. Décision in/out-of-scope à prendre."
---

# Phase 18: Durcissement frontend — correctifs de revue de code — Verification Report

**Phase Goal:** Rendre bruyants les silences serveur et corriger les pertes de données révélées par la revue de `app/src` : masquage de widget conforme à la contrainte SQL (CR-01), suppression qui échoue visiblement au lieu de mentir (WR-01/WR-02), `ardoise_members` correctement traitée comme table sans clé (WR-03), amorçage d'auth sans écran bloqué (WR-04), édition de lieu qui ne détruit plus sa photo (WR-05), parts d'ardoise bornées (WR-06).
**Verified:** 2026-10-15T14:20:48Z
**Status:** human_needed
**Re-verification:** No — initial verification

**Base/head:** `abdca4f` → `f1b0026` (14 commits, 5 plans exécutés sur `main`).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | **CR-01** — Masquer un widget écrit `width = 0` et le serveur l'accepte (plus de `check_violation` 23514) ; la sémantique `visible = width > 0` est inchangée ; la contrainte reste bornée (5 refusé). | ✓ VERIFIED | `supabase/migrations/0123_dashboard_widget_width_zero.sql` — `drop constraint dashboard_widgets_width_check` puis `add constraint … check (width between 0 and 4)`. Contrainte **vivante** confirmée : `dashboard_widgets_width_check \| CHECK (((width >= 0) AND (width <= 4)))`. Écriture client : `use-dashboard.ts:134,147` `width: preference.visible ? (routines?2:1) : 0`. Lecture : `dashboard/types.ts:64-74` `visible: row.width > 0`. Test SQL `supabase/tests/0122_dashboard_widget_width.sql` (passé, `sh scripts/test-db.sh 0122`) prouve width=0 accepté et width=5 → 23514. |
| 2 | **WR-01** — Une suppression refusée par la RLS ne rend plus un faux succès : `remove`/`removeWhere` lèvent quand zéro ligne a été supprimée ; un appelant tolérant le déclare par `{ ifMissing: 'ignore' }` (défaut = erreur). | ✓ VERIFIED | `adapter.ts:18-27` `RemoveOptions {ifMissing?: 'error'|'ignore'}` + `REMOVE_MISSING_MESSAGE`/`REMOVE_WHERE_MISSING_MESSAGE`. `supabase-adapter.ts:143-171` : `.delete().eq(...).select()` (représentation) puis `throw new DataError(REMOVE_MISSING_MESSAGE, …)` si `(removed ?? []).length === 0`. `local-adapter.ts:164-187` : symétrie (leve aussi en démo). `messages/api.ts` conserve volontairement `removeWhere('conversation_members', …)` strict (site d'origine du défaut). Test de contrat `remove-contract.test.ts` (0 ligne → throw ; N lignes → ok ; erreur → remonte). |
| 3 | **WR-02** — Un membre non admin ne voit plus les affordances de suppression réservées à l'admin (tâche, dossier, routine, occurrence) ; un admin voit exactement les mêmes actions qu'avant. | ✓ VERIFIED | `use-taches.ts:125` / `use-routines.ts:143` / `use-notes.ts:100` exposent `isAdmin = useIsAdmin()` (`household-store.ts:74-76`). `task-row.tsx:23,31,110` `canDelete` gouverne la corbeille ; `taches-page.tsx:195,263,295` passent `canDelete={isAdmin}`. `folder-tabs.tsx:38,55,271` `canDelete` distinct de `canManage` (défaut `canManage`) ; `routines-page.tsx:134,298,324` et `notes-page.tsx:129` passent `isAdmin`. `routine-history.tsx:50,65,111` : conjonction `canDelete && entry.canDelete`. `use-notes.ts:233-246` `deleteFolder` : garde `canWrite` **et** `isAdmin`. Tests : `taches-page.test.tsx`, `routines-page.test.tsx`, `folder-tabs.test.tsx`, `use-notes.test.tsx`. |
| 4 | **WR-03** — Ajouter un membre d'ardoise écrit réellement la ligne : `ardoise_members` reconnue comme table sans `id` (aucun identifiant injecté) ; la liste des tables composites est dérivée des migrations et figée par test. | ✓ VERIFIED | `keys.ts:13` `KEYLESS_TABLES` inclut `ardoise_members`. `keys.test.ts` rapproche migrations ↔ constante **dans les deux sens** (exception justifiée `public_holidays` ; le test échouerait si `ardoise_members` était retiré). `ardoise/api.ts:199-214` : `addArdoiseMembers` **sans** `.catch` (le refus remonte) ; `removeArdoiseMember` via `removeWhere` strict. Test SQL `0123_rls_delete_zero_rows.sql` (`testkit.affected`) : DELETE non-admin → 0 ligne sans erreur ; admin → 1. |
| 5 | **WR-04** — Un échec d'amorçage n'enferme plus dans « Chargement… » : `setReady(true)` sur tous les chemins y compris l'échec, écran d'erreur + action de reprise, message générique (aucun détail serveur/jeton). | ✓ VERIFIED | `use-auth.ts:78-201` retourne `{ready, error, retry}` ; `fail` pose `setError` **et** `setReady(true)` (respect du garde `active`) ; `.catch(fail)` sur la chaîne `getSession`, `try/catch` autour d'`applySession`. `retry = () => setAttempt(c=>c+1)` relance l'effet ([setStatus, attempt]). `main.tsx:17-39` : `if (error)` → message fixe « Votre foyer n'a pas pu être chargé. » + bouton « Réessayer » (jamais le détail brut). Commentaire dupliqué (IN-11) supprimé. Tests : `use-auth.test.ts` (échec rendu, reprise, non-fuite du détail), `main.test.tsx`. |
| 6 | **WR-05** — Éditer un lieu sans toucher à sa photo ne supprime plus l'objet du bucket et ne réécrit plus la colonne avec une URL signée ; la comparaison porte sur la valeur stockée, jamais sur l'URL résolue. | ✓ VERIFIED | `adresses/types.ts:52,110` : `photoStored = toNullable(row.photo_url)` (valeur de colonne), distinct de `photoUrl` (URL signée forgée à la lecture). `api.ts:102-112` `shouldRemovePreviousPlacePhoto(previousStored, nextStored)` : exige que la valeur précédente soit un **chemin bucket** (rogne + `placePhotoPathOf`) et diffère de la suivante. `use-adresses.ts:129-147` `editPlace` compare `rows.find(...)?.photo_url` (stocké) à la valeur transportée. `place-form-dialog.tsx:65,89` : aperçu = `photoUrl`, `defaultValues.photoUrl = place?.photoStored ?? ''`. Tests : `adresses/api.test.ts` (cas a-d), `place-form-dialog.test.tsx`. |
| 7 | **WR-06** — Un partage personnalisé dont la somme diffère du montant est refusé avec un message expliquant l'écart ; aucune part négative ne peut être persistée (le calcul refuse, pas seulement le formulaire). | ✓ VERIFIED | `ardoise/types.ts:150-164` `normalizeShares` : lève sur part `< 0` (avant absorption) **et** sur somme excédentaire (après absorption du reliquat sur le dernier). `customSharesTotal`/`SHARE_TOLERANCE` exportés. `expense-form-dialog.tsx:56-78` `superRefine` : `|amount - total| > SHARE_TOLERANCE` → message « La somme des parts doit égaler le montant… ». Barrière API : `api.ts:363` (`createExpense`) et `429` (`updateExpense`) appellent `normalizeShares` **avant** écriture. Tests : `spent.test.ts`, `expense-form-dialog.test.tsx`. |

**Score:** 7/7 truths verified (0 present-but-behavior-unverified)

Each of the 25 plan-level `must_haves.truths` (18-01:4, 18-02:6, 18-03:5, 18-04:5, 18-05:5) is subsumed by the requirement-level truths above and shares their evidence; all 25 resolve to ✓ VERIFIED. Notably 18-01's "test SQL rouge→vert" holds by construction: `0122` asserts `width = 0` is **accepted** and `width = 5` **rejected**, so against the pre-0123 constraint (`1..4`) the same test fails — the green-after run (`test-db.sh 0122`) plus the live constraint shape establish the transition.

### Deferred Items

None. ROADMAP has no phase numbered greater than 18 except `999.1` (BACKLOG, a Phase-17 UAT follow-up unrelated to these defects). No deferred item is covered by a later milestone phase — see Out-of-Scope Observations.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `supabase/migrations/0123_dashboard_widget_width_zero.sql` | assouplit la borne basse de la contrainte | ✓ VERIFIED | drop + add `check (width between 0 and 4)` ; `not null default 1` et `member_type_key` intacts |
| `supabase/tests/0122_dashboard_widget_width.sql` | preuve SQL width=0 accepté / 5 refusé | ✓ VERIFIED | vert (`test-db.sh 0122`) ; échoue pré-migration par construction |
| `app/src/lib/data/adapter.ts` | contrat `remove`/`removeWhere` + `RemoveOptions` | ✓ VERIFIED | lignes 18-43 |
| `app/src/lib/data/supabase-adapter.ts` | compte les lignes via `.select()` et lève sur 0 | ✓ VERIFIED | lignes 143-171 |
| `app/src/lib/data/local-adapter.ts` | symétrie démo du contrat | ✓ VERIFIED | lignes 164-187 |
| `app/src/lib/data/keys.ts` | `ardoise_members` dans `KEYLESS_TABLES` | ✓ VERIFIED | ligne 13 |
| `app/src/lib/data/keys.test.ts` | rapprochement migrations ↔ constante | ✓ VERIFIED | les deux sens + exception justifiée |
| `app/src/lib/data/remove-contract.test.ts` | preuve de contrat des deux adaptateurs | ✓ VERIFIED | module `@/lib/data` réel, client simulé |
| `supabase/tests/0123_rls_delete_zero_rows.sql` | cas négatif non-admin → 0 ligne | ✓ VERIFIED | via `testkit.affected` |
| `app/src/hooks/use-auth.ts` | `{ready, error, retry}` + `setReady` sur l'échec | ✓ VERIFIED | lignes 78-201 |
| `app/src/main.tsx` | écran d'erreur + « Réessayer » | ✓ VERIFIED | lignes 17-39 |
| `app/src/modules/adresses/api.ts` | `shouldRemovePreviousPlacePhoto` | ✓ VERIFIED | lignes 102-112 |
| `app/src/modules/adresses/types.ts` | `photoStored` séparé de `photoUrl` | ✓ VERIFIED | lignes 52, 110 |
| `app/src/modules/ardoise/types.ts` | `normalizeShares` borné + `SHARE_TOLERANCE` | ✓ VERIFIED | lignes 150-164 |
| `app/src/components/shared/folder-tabs.tsx` | `canDelete` distinct de `canManage` | ✓ VERIFIED | lignes 38, 55, 271 |
| `app/src/modules/taches/components/task-row.tsx` | corbeille gouvernée par `canDelete` | ✓ VERIFIED | lignes 23, 31, 110 |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `use-dashboard.ts:134,147` (`width: 0`) | `dashboard_widgets_width_check` (0123) | contrainte SQL 0..4 | ✓ WIRED | contrainte vivante = `(width >= 0) AND (width <= 4)` |
| `dashboard/types.ts:64` (`visible = width > 0`) | même contrainte | contrat d'encodage | ✓ WIRED | commentaire de contrat + test `dashboard-page.test.tsx` |
| `supabase-adapter.remove/removeWhere` | politiques `*_delete_admin` | comptage `.select()` → `DataError` sur 0 | ✓ WIRED | `remove-contract.test.ts` + `0123_rls_delete_zero_rows.sql` |
| `KEYLESS_TABLES` (`keys.ts:13`) | `SupabaseAdapter.create` (injection d'`id`) | appartenance à la constante | ✓ WIRED | `keys.test.ts` (deux sens) |
| `useIsAdmin()` (`household-store.ts:74`) | gating corbeilles (tâches/dossiers/routines/notes) | prop `canDelete`/`isAdmin` | ✓ WIRED | `folder-tabs.tsx`, `task-row.tsx`, `routine-history.tsx`, `use-notes.deleteFolder` |
| `useAuthBootstrap` (`use-auth.ts`) | `Root` (`main.tsx`) | `{ready, error, retry}` | ✓ WIRED | échec rendu + reprise |
| `Place.photoStored` | `shouldRemovePreviousPlacePhoto` → `deletePlacePhoto` | comparaison sur valeur stockée | ✓ WIRED | `use-adresses.ts:129-147` |
| `normalizeShares` (`ardoise/types.ts`) | refine du formulaire + `createExpense`/`updateExpense` | barrière calcul + API | ✓ WIRED | `expense-form-dialog.tsx:56-78`, `api.ts:363,429` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `dashboard/types.ts` | `visible` | `row.width` (ligne `dashboard_widgets`) | Oui — dérivée de la colonne persistée | ✓ FLOWING |
| `adresses/hooks/use-adresses.ts` | `photoStored` / `photoUrl` | `row.photo_url` (colonne) + URL signée forgée | Oui | ✓ FLOWING |
| `ardoise/api.ts` | `shares` | `normalizeShares(amount, participants, customShares)` | Oui — calcul, pas de littéral | ✓ FLOWING |
| `lib/data/supabase-adapter.ts` | `removed` | réponse PostgREST `.select()` après DELETE | Oui | ✓ FLOWING |

No static return / hardcoded literal / mock substitutes a real source in the changed paths.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| CR-01 SQL : width=0 accepté, width=5 refusé | `sh scripts/test-db.sh 0122` (repo root) | green | ✓ PASS |
| WR-01/WR-03 SQL : non-admin DELETE → 0 ligne | `sh scripts/test-db.sh 0123` | green | ✓ PASS |
| CR-01/WR-01/WR-02/WR-03/WR-04/WR-05/WR-06 JS | `cd app && npx vitest run keys remove-contract ardoise/api adresses/api place-form-dialog spent use-auth main dashboard` | 76 passed | ✓ PASS |
| Contrainte vivante | `echo "select conname, pg_get_constraintdef(oid) from pg_constraint where conname='dashboard_widgets_width_check';" \| sh scripts/psql.sh` | `(width >= 0) AND (width <= 4)` | ✓ PASS |
| Full suite (reported) | `cd app && npm test` | 121 files / 983 tests green | ✓ PASS (rapporté) |
| typecheck / build | `cd app && npm run typecheck && npm run build` | green | ✓ PASS (rapporté) |
| e2e (reported) | `cd app && npm run test:e2e` | 117 passés / 5 ignorés / 4 échecs préexistants | ⚠️ 4 échecs préexistants, hors périmètre (voir deferred-items §2) |

### Probe Execution

No probes declared in PLAN/SUMMARY, and no `scripts/*/tests/probe-*.sh` exist in this repo. Step 7c: N/A.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| CR-01 | 18-01 | Masquage de widget conforme à la contrainte SQL (`width = 0`) | ✓ SATISFIED | migration 0123 + test SQL 0122 + client `width: 0` / lecture `width > 0` |
| WR-01 | 18-02 | Suppression refusée par RLS ne rend plus un faux succès | ✓ SATISFIED | `RemoveOptions` + comptage `.select()` + `remove-contract.test.ts` |
| WR-02 | 18-03 | Affordances de suppression alignées sur les politiques admin | ✓ SATISFIED | `isAdmin`/`canDelete` sur 3 modules + dossiers + `deleteFolder` gardé |
| WR-03 | 18-02 | `ardoise_members` traitée comme table sans clé | ✓ SATISFIED | `KEYLESS_TABLES` + `keys.test.ts` (deux sens) + API bruyante |
| WR-04 | 18-04 | Amorçage d'auth sans écran bloqué, échec visible et rejouable | ✓ SATISFIED | `{ready, error, retry}` + `main.tsx` + tests |
| WR-05 | 18-05 | Édition de lieu qui ne détruit plus sa photo | ✓ SATISFIED | `photoStored` + `shouldRemovePreviousPlacePhoto` + `editPlace` |
| WR-06 | 18-05 | Parts d'ardoise bornées par la somme | ✓ SATISFIED | `normalizeShares` + `superRefine` + barrière API |

**Orphaned requirements:** none. No `REQUIREMENTS.md` exists; the phase's requirements are the seven findings of `18-REVIEW.md` (CR-01, WR-01…WR-06), and each is claimed by exactly one plan's `requirements:` field. The remaining review findings (WR-07…WR-20, IN-01…IN-14) are explicitly outside this phase's goal (the ROADMAP goal enumerates only the seven).

### Test Quality Audit

| Test File | Linked Req | Active | Skipped | Circular | Assertion Level | Verdict |
| --------- | ---------- | ------ | ------- | -------- | --------------- | ------- |
| `supabase/tests/0122_dashboard_widget_width.sql` | CR-01 | ✓ | 0 | no | Behavioral (insert accepté / refus attendu 23514) | OK |
| `app/src/lib/data/remove-contract.test.ts` | WR-01 | ✓ | 0 | no | Behavioral (client simulé, résultat 0/N/erreur) | OK |
| `app/src/lib/data/keys.test.ts` | WR-03 | ✓ | 0 | no | Behavioral (dérivation bidirectionnelle des migrations) | OK |
| `supabase/tests/0123_rls_delete_zero_rows.sql` | WR-01/WR-02 | ✓ | 0 | no | Behavioral (`testkit.affected`) | OK |
| `app/src/hooks/use-auth.test.ts` + `main.test.tsx` | WR-04 | ✓ | 0 | no | Behavioral | OK |
| `app/src/modules/adresses/api.test.ts` + `place-form-dialog.test.tsx` | WR-05 | ✓ | 0 | no | Behavioral | OK |
| `app/src/modules/ardoise/spent.test.ts` + `expense-form-dialog.test.tsx` | WR-06 | ✓ | 0 | no | Behavioral | OK |
| `app/src/modules/{taches,routines}/**page.test.tsx`, `folder-tabs.test.tsx`, `use-notes.test.tsx` | WR-02 | ✓ | 0 | no | Behavioral | OK |

**Disabled tests on requirements:** 0 → no blocker. **Circular patterns detected:** 0 → no blocker. **Insufficient assertions:** 0 → no warning.

### Decision Coverage

All trackable CONTEXT.md decisions are honored by shipped artifacts. (7/7 — `check.decision-coverage-verify`: `honored: 7`, `not_honored: []`.)

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | none | — | Aucun `TBD`/`FIXME`/`XXX`/`HACK`/`PLACEHOLDER` dans les fichiers modifiés (`git diff abdca4f..f1b0026`). Aucun `return null/{}/[]` ni prop câblée vide introduits. Les `catch(() => undefined)` restants sont des chemins de **rollback** (ardoise `createExpense`/`restoreExpense`, média cercle, création de voyage, branche démo de `addTripMember`) ou des lectures `.list(...).catch(() => [])`, pas des suppressions silencieuses de premier chemin. |

### Human Verification Required

#### 1. CR-01 — Masquer un widget quand la lecture n'est pas chargée (deferred-items.md §1)

**Test :** Ouvrir l'accueil, provoquer l'état « `dashboard_widgets` non chargé / lecture en échec » (ou masquer un widget juste avant que la ressource n'ait répondu), puis recharger.
**Expected :** Le widget masqué reste masqué ; aucune seconde série de lignes pour `(member_id, widget_type)` ; aucun 23505 rejeté en silence.
**Why human :** `setWidgetOrder` (`use-dashboard.ts:123-153`) prend la branche `create` pour **chaque** préférence quand `widgets.rows` est vide (id `widget-<memberId>-<kind>`), et non un `update`. En mode Supabase l'insertion heurte `dashboard_widgets_member_type_key` → 23505 → `Promise.all` rejette → rejet jeté via `void` (`dashboard-page.tsx`). Ni le test démo (Dexie sans contrainte unique/CHECK) ni le test SQL de CR-01 n'exercent cette course. Le maintien du masquage n'est donc pas prouvé dans ce scénario de timing ; c'est un choix de planification (correctif candidat : `upsert`/écriture sérialisée).

#### 2. WR-04 — Reprise quand l'échec vient du chargement du foyer (deferred-items.md §4)

**Test :** Provoquer un échec de `loadHousehold` (réseau/5xx sur `household_members`), voir l'écran d'erreur, cliquer « Réessayer ».
**Expected :** Atteindre le tableau de bord avec le foyer rechargé.
**Why human :** `signIn` pose `status = 'authenticated'` **avant** `await loadHousehold()` (`session-store.ts:24-27`), donc la reprise entre dans la branche « session déjà établie » d'`applySession` (simple `refreshUser`) et ne rappelle jamais `data.list('household_members')` (0 appel mesuré). L'utilisateur atterrit sur `/foyer` « Vous n'avez pas encore de foyer » alors que son foyer existe — message faux, création d'un second foyer possible. L'écran n'est plus **bloqué** (WR-04 tel qu'énoncé est satisfait) mais la **reprise** ne rétablit pas l'application pour cette classe d'échec. Test de reprise existant mais non couvrant ce chemin.

### Out-of-Scope Observations (documented in `deferred-items.md`)

Relevé pendant l'exécution, hors du périmètre des sept correctifs. Aucun ne couvre un must-have de la phase (jugés : **pas** des exigences en périmètre manquées → pas de `gaps`). Reportés pour visibilité :

- **§2 — 4 échecs e2e préexistants** (lien « Continuer avec Facebook » retiré le 2026-10-13 ; `voyage-workspace` attend `role=checkbox` là où l'affordance est `role=switch`). Fichiers non touchés par la phase ; indépendants. Remise à jour e2e à planifier séparément.
- **§3 — Classe WR-02 plus large** : au moins 14 autres politiques `*_delete_admin` (+ politiques générées par boucle `0007:237-241`, `0051:82-87`) portent la même affordance (calendrier, cercle, courses, voyages, notes). Le plan 18-03 borne la correction aux politiques qu'il cite (D-03) ; étendre est un changement de portée → décision de planification.
- **§5 — `placePhotoPathOf` ne normalise pas une valeur blanche** (`'  '`). Cas non observable aujourd'hui (`toPlacePayload` reçoit une valeur déjà rognée). La décision du plan (`shouldRemovePreviousPlacePhoto`) rogne en revanche sa valeur précédente ; les autres appelants restent inchangés.

### Gaps Summary

**Aucun must-have n'a échoué.** Les sept exigences de la phase sont vérifiées dans le code, câblées et couvertes par des preuves comportementales (tests SQL rouges→verts, tests de contrat adaptateur, tests de composant/hook). Le statut n'est **pas** `gaps_found` : rien de FAILED, aucun artifact STUB/MISSING, aucun lien NOT_WIRED, aucun marqueur de dette.

Le statut est `human_needed` parce que **deux défauts réels, non couverts par un test, partagent l'issue visible de deux exigences de la phase** — le masquage de widget (CR-01) et la reprise d'amorçage (WR-04). Ils sont documentés hors périmètre avec un raisonnement valable (AGENTS.md §2.7E : ne corriger que ce que le changement courant casse), et aucun item `deferred-items.md` ne correspond à une exigence **en périmètre** manquée. Mais la décision « accepter la dérogation ou exiger un plan de suivi » est humaine, et le ROADMAP n'a aucune phase ultérieure qui les couvrirait — d'où l'escalade plutôt qu'un `passed` silencieux.

---

_Verified: 2026-10-15T14:20:48Z_
_Verifier: the agent (gsd-verifier)_
