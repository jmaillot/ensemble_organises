---
phase: 18-durcissement-frontend-correctifs-de-revue-de-code
plan: "02"
subsystem: data
tags: [rls, supabase, postgrest, indexeddb, dexie, data-adapter, wr-01, wr-03, keyless-tables, tests-sql]

requires:
  - phase: 18-durcissement-frontend-correctifs-de-revue-de-code
    provides: "18-01 (c2e655e, 34cd0de) : correctifs CR-01 et commits de revue"
provides:
  - "Contrat de suppression bruyant : `RemoveOptions` (défaut 'error'), comptage des lignes affectées dans les deux adaptateurs, `DataError` avec cause (table, id)"
  - "Preuve de contrat `remove-contract.test.ts` (zéro ligne ⇒ rejet, N ⇒ succès, `ignore` ⇒ succès, erreur ⇒ cause)"
  - "`ardoise_members` reconnue sans `id` (KEYLESS_TABLES) + garde `keys.test.ts` dérivé des migrations dans les deux sens"
  - "Tolérance déclarée `{ ifMissing: 'ignore' }` sur chaque suppression idempotente, tolérance non déclarée = strict par défaut"
  - "Preuve SQL `0123_rls_delete_zero_rows.sql` : non-admin ⇒ 0 ligne sans lever, admin ⇒ 1 ligne"
  - "Recensement exhaustif fichier:ligne des sites `remove`/`removeWhere` (production + tests)"
affects: [data-layer, ardoise, taches, routines, recettes, animaux, prestataires, notes, voyages, messages, supabase-tests]

actuals:
  tokens: 7835
  tasks: 3
  commits: 3
plan_head_before: 34cd0de6d18abff960ed7b9965c3bc0a61c88821
plan_head_after: 556a2128057aff6d5be6f89b4f61e6bfeaac4d7c

tech-stack:
  added: []
  patterns:
    - "Suppression sous RLS avec représentation : `.delete().eq(...).select()` puis comptage (jamais `count:'exact'`, qui rouvrirait une fenêtre de course)"
    - "Tolérance d'une suppression idempotente déclarée par option explicite `{ ifMissing: 'ignore' }`, jamais par un repli silencieux `.catch(() => undefined)`"
    - "Garde de rapprochement constante ↔ migrations dans les deux sens, borné à `supabase/migrations/**/*.sql`"
    - "Test SQL négatif borné par `testkit.affected` (jamais `testkit.count`) pour prouver « 0 ligne, aucune erreur »"

key-files:
  created:
    - app/src/lib/data/remove-contract.test.ts
    - app/src/lib/data/keys.test.ts
    - app/src/modules/ardoise/api.test.ts
    - supabase/tests/0123_rls_delete_zero_rows.sql
  modified:
    - app/src/lib/data/adapter.ts
    - app/src/lib/data/supabase-adapter.ts
    - app/src/lib/data/local-adapter.ts
    - app/src/lib/data/keys.ts
    - app/src/modules/ardoise/api.ts
    - app/src/modules/taches/api.ts
    - app/src/modules/routines/api.ts
    - app/src/modules/recettes/api.ts
    - app/src/modules/animaux/api.ts
    - app/src/modules/prestataires/api.ts
    - app/src/modules/notes/hooks/use-notes.ts
    - app/src/modules/voyages/api.ts
    - app/src/modules/voyages/components/trip-tasks-tab.tsx
    - app/src/modules/voyages/components/trip-notes-tab.tsx

key-decisions:
  - "Messages utilisateur partagés exportés depuis adapter.ts (REMOVE_MISSING_MESSAGE / REMOVE_WHERE_MISSING_MESSAGE) : les deux adaptateurs lèvent le MÊME DataError"
  - "Supabase : `.delete().eq(...).select()` puis comptage de la liste rendue ; pas de `count:'exact'` (représentation = vérité, pas de seconde requête en course)"
  - "`removeWhere` en `select()` sans nom de colonne : les tables de jointure n'ont pas d'`id`, un `select('id')` y échouerait"
  - "Le défaut reste strict ('error') ; chaque site qui accepte un zéro-ligne le déclare par `{ ifMissing: 'ignore' }`"
  - "Élargissement de la liste de fichiers autorisé par le plan (§E) : les replis silencieux non-règlementaires des cascades tolérantes (prestataires, notes, composants de voyage) deviennent l'option explicite, documenté fichier par fichier"
  - "`messages/api.ts` removeWhere('conversation_members') reste STRICT : c'est le site du défaut WR-01 lui-même, sa stricte vérité EST la correction"
  - "Les replis de ROLLBACK (`catch` d'une erreur en cours de propagation) sont laissés intacts : ils préservent l'erreur d'origine"

patterns-established:
  - "Comptage-de-suppression : un DELETE filtré par RLS affecte 0 ligne sans lever — l'adaptateur compte et lève, l'appelant tolérant déclare l'option"
  - "Garde anti-récidive dérivée des migrations, prouvée capable de rougir (retirer une entrée fait échouer le test)"

requirements-completed: [WR-01, WR-03]

coverage:
  - id: D1
    description: "Sous RLS, une suppression refusée lève au lieu de rendre un faux succès (remove/removeWhere comptent les lignes affectées)"
    requirement: WR-01
    verification:
      - kind: unit
        ref: "app/src/lib/data/remove-contract.test.ts#zéro ligne ⇒ DataError / N lignes ⇒ résolution / ignore ⇒ résolution / erreur ⇒ cause"
        status: pass
      - kind: integration
        ref: "app/src/modules/ardoise/api.ts removeArdoiseMember appelé de bout en bout rejette sur une cible absente (remove-contract.test.ts)"
        status: pass
    human_judgment: false
  - id: D2
    description: "La tolérance d'une suppression idempotente est déclarée par `{ ifMissing: 'ignore' }` ; le défaut strict est la règle"
    requirement: WR-01
    verification:
      - kind: unit
        ref: "app/src/lib/data/remove-contract.test.ts#{ ifMissing: 'ignore' } ⇒ résolution silencieuse (les deux modes)"
        status: pass
      - kind: automated_ui
        ref: "npm test (suite entière, 118 fichiers / 948 tests) verte après classification des sites"
        status: pass
    human_judgment: false
  - id: D3
    description: "Ajouter un membre d'ardoise écrit réellement la ligne : `ardoise_members` sans `id`, aucun identifiant injecté"
    requirement: WR-03
    verification:
      - kind: unit
        ref: "app/src/modules/ardoise/api.test.ts#write une ligne par membre, ardoise_id/member_id et aucun id + propage un échec"
        status: pass
    human_judgment: false
  - id: D4
    description: "Liste des tables à clé composite sans `id` dérivée des migrations et figée par un test (contre la récidive)"
    requirement: WR-03
    verification:
      - kind: unit
        ref: "app/src/lib/data/keys.test.ts#rapprochement KEYLESS_TABLES ↔ migrations (deux sens)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Preuve base : un non-admin affecte 0 ligne sans lever sur une suppression `*_delete_admin` ; l'admin en affecte 1"
    requirement: WR-01
    verification:
      - kind: integration
        ref: "supabase/tests/0123_rls_delete_zero_rows.sql (sh scripts/test-db.sh 0123)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Recensement exhaustif fichier:ligne des sites remove/removeWhere (production + tests) et de chaque tolérance"
    verification: []
    human_judgment: true
    rationale: "Le classement « strict / tolérant » de chaque site est un jugement d'exhaustivité qui ne se déduit pas d'une assertion automatique ; le verifier doit confronter la table au dépôt."

metrics:
  duration: 50min
  completed: 2026-10-15
status: complete
---

# Phase 18 Plan 02: Durcissement frontend — correctifs de revue de code Summary

**La suppression sous RLS cesse de mentir : les deux adaptateurs comptent les lignes affectées et lèvent un `DataError` sur zéro ligne ; la tolérance des suppressions idempotentes est déclarée site par site, `ardoise_members` rejoint `KEYLESS_TABLES`, et un test SQL fige le silence du non-admin (0 ligne, aucune erreur).**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-10-15 (reprise après checkpoint de contexte)
- **Completed:** 2026-10-15
- **Tasks:** 3
- **Files modified:** 20 (607 insertions, 38 suppressions)

## Accomplishments

- **WR-01 — suppression bruyante, de bout en bout.** `RemoveOptions = { ifMissing?: 'error' | 'ignore' }` (défaut `'error'`) dans `adapter.ts` ; `SupabaseAdapter.remove`/`removeWhere` demandent la représentation (`.delete().eq(...).select()`) puis comptent — zéro ligne ⇒ `DataError` portant table + id en `cause` ; `LocalAdapter` se comporte **identiquement** en mode démo Dexie (sinon le défaut resterait invisible en CI, qui tourne sans RLS). Preuve de contrat sur les deux modes + un chemin réel jusqu'à `removeArdoiseMember` (module → adaptateur → contrat).
- **WR-03 (instance + cause).** `ardoise_members` (clé composite `(ardoise_id, member_id)`, aucune colonne `id`) rejointe à `KEYLESS_TABLES` : plus aucun `id` injecté à l'insertion, plus d'échec PostgREST masqué ; les deux replis silencieux d'`ardoise/api.ts` sont retirés. La cause est fermée par `keys.test.ts`, qui rapproche la constante des migrations **dans les deux sens** (`public_holidays` en exception justifiée, lecture seule).
- **La classe entière, pas l'instance (§E).** Chaque site `remove`/`removeWhere` est classé strict ou tolérant (table complète plus bas) ; `messages/api.ts` — le site du défaut WR-01 — reste strict. Les cascades tolérantes qui s'appuyaient sur un `catch(() => undefined)` sont converties à l'option explicite.
- **Preuve base.** `0123_rls_delete_zero_rows.sql` : un membre non admin obtient **0 ligne affectée sans exception** (`testkit.affected`), l'admin du même foyer **exactement 1** sur la même table.
- **CHAÎNE VERTE :** `npm run typecheck` ✓, `npm test` ✓ (118 fichiers / 948 tests), `npm run build` ✓, `python3 scripts/check-sql-statique.py` ✓ (0 défaut), `sh scripts/migrate.sh` ✓, `sh scripts/test-db.sh 0123` ✓.

## Task Commits

Chaque tâche a été committée atomiquement :

1. **Task 1 : Contrat de suppression bruyant — un seul chemin, de bout en bout** - `6727e73` (fix)
2. **Task 2 : WR-03 — `ardoise_members` sans `id`, et un garde qui empêche la récidive** - `5de0b17` (fix)
3. **Task 3 : La classe entière des sites — tolérance déclarée, recensement, preuve SQL non-admin** - `556a212` (fix)

**Plan metadata:** non committé (`commit_docs: false`) — voir plus bas.

_Base avant plan : `34cd0de` (`plan_head_before`) ; tête après plan : `556a212` (`plan_head_after`) ; comptage mesuré : 3 commits._

## Files Created/Modified

**Créés**
- `app/src/lib/data/remove-contract.test.ts` — preuve de contrat des deux adaptateurs (zéro/N/ignore/erreur) + chemin de bout en bout `removeArdoiseMember`.
- `app/src/lib/data/keys.test.ts` — rapprochement `KEYLESS_TABLES` ↔ `supabase/migrations/**/*.sql`, dans les deux sens.
- `app/src/modules/ardoise/api.test.ts` — preuve comportementale WR-03 (échec propagé, aucun `id` émis).
- `supabase/tests/0123_rls_delete_zero_rows.sql` — preuve SQL non-admin ⇒ 0 ligne / admin ⇒ 1.

**Modifiés**
- `app/src/lib/data/adapter.ts` — `RemoveOptions`, `REMOVE_MISSING_MESSAGE`, `REMOVE_WHERE_MISSING_MESSAGE`, signatures `remove`/`removeWhere`.
- `app/src/lib/data/supabase-adapter.ts` / `local-adapter.ts` — suppression avec représentation + comptage + `DataError`.
- `app/src/lib/data/keys.ts` — `ardoise_members` dans `KEYLESS_TABLES`, commentaire de règle.
- `app/src/modules/ardoise/api.ts` — replis silencieux retirés (`createArdoise`, `addArdoiseMembers`) ; commentaire de `removeArdoiseMember`.
- `app/src/modules/taches/api.ts`, `routines/api.ts`, `recettes/api.ts`, `animaux/api.ts` — tolérance déclarée sur les sites idempotents.
- `app/src/modules/prestataires/api.ts`, `notes/hooks/use-notes.ts`, `voyages/api.ts`, `voyages/components/trip-tasks-tab.tsx`, `voyages/components/trip-notes-tab.tsx` — élargissements documentés (voir Deviations).
- `app/src/modules/animaux/api.test.ts`, `app/src/modules/prestataires/api.test.ts` — assertions mises à jour pour l'option explicite.

## Recensement exhaustif des sites `remove` / `removeWhere` (§E, D-02)

Légende : **S** = strict (défaut, inchangé) · **T** = tolérant → déclaré dans ce plan · **É** = élargissement documenté (tolérant, même classe) · **R** = repli de rollback (laissé intact).

### Production

| Fichier:ligne | Site | Classe |
|---|---|---|
| `lib/data/useResource.ts:77` | `data.remove(table, id)` (mutation générique d'une ressource) | S |
| `lib/data/useResource.ts:156` | `data.removeWhere(table, values)` (mutation générique) | S |
| `modules/recettes/api.ts:54` | `remove(RECIPE_CATEGORIES_TABLE, id)` | S |
| `modules/recettes/api.ts:67` | `remove(RECIPE_TAGS_TABLE, id)` | S |
| `modules/recettes/api.ts:91` | `removeWhere(RECIPE_TAG_LINKS_TABLE, …)` | T |
| `modules/recettes/api.ts:163` | `removeWhere(RECIPE_FAVORITES_TABLE, …)` | T |
| `modules/recettes/api.ts:197,219,235` | `remove(RECIPE_INGREDIENTS/STEPS/RECIPES, id)` | S |
| `modules/ardoise/api.ts:184` | `remove('ardoises', id)` | S |
| `modules/ardoise/api.ts:213` | `removeWhere('ardoise_members', …)` (`removeArdoiseMember`) | S (voulu bruyant) |
| `modules/ardoise/api.ts:403` | `remove('expenses', id).catch` (rollback création) | R |
| `modules/ardoise/api.ts:412,413` | `remove(EXPENSE_PARTICIPANTS/EXPENSES, …)` (`deleteExpense`) | S |
| `modules/ardoise/api.ts:458` | `remove('expense_participants', …)` (`updateExpense`) | S |
| `modules/ardoise/api.ts:487` | `remove('expense_participants', …).catch` (`restoreExpense`) | R |
| `modules/routines/hooks/use-routines.ts:275` | `remove(ROUTINE_FOLDERS_TABLE, id)` | S |
| `modules/routines/api.ts:103` | `removeWhere(ROUTINE_ASSIGNEES_TABLE, …)` | T |
| `modules/routines/api.ts:118` | `removeWhere(ROUTINE_REMINDERS_TABLE, …)` | T |
| `modules/routines/api.ts:181` | `remove(ROUTINE_COMPLETIONS_TABLE, existing.id)` (`deleteOccurrence`) | S |
| `modules/routines/api.ts:194,195` | `removeWhere(ROUTINE_ASSIGNEES/REMINDERS_TABLE, …)` (cascade) | T |
| `modules/routines/api.ts:196` | `remove(ROUTINE_COMPLETIONS_TABLE, completion.id)` | S |
| `modules/courses/api.ts:105,106,133` | `remove(SHOPPING_ITEMS/LISTS, …)` | S |
| `modules/notes/hooks/use-notes.ts:204` | `removeWhere('note_attachments', …)` (cascade) | É |
| `modules/notes/hooks/use-notes.ts:234` | `remove(NOTE_FOLDERS_TABLE, id)` | S |
| `modules/notes/api.ts:72` | `remove('note_attachments', id)` | S |
| `modules/cercle/api.ts:111` | `remove(POSTS, postId).catch` (rollback média) | R |
| `modules/cercle/api.ts:124,125,126,127,165,186` | `remove(MEDIA/COMMENTS/REACTIONS/POSTS, …)` | S |
| `modules/cadeaux/api.ts:129,181,244,245,247,281` | `remove(GIFT_*, …)` | S |
| `modules/voyages/api.ts:69` | `remove('trips', id)` | S |
| `modules/voyages/api.ts:318-321` | `remove/removeWhere(...).catch` (rollback création voyage) | R |
| `modules/voyages/api.ts:393` | `removeWhere('trip_members', …)` (`removeTripMember`) | S |
| `modules/voyages/api.ts:397` | `removeWhere('ardoise_members', {ardoise_id, member_id})` | É |
| `modules/voyages/components/trip-tasks-tab.tsx:110` | `removeWhere('task_assignees', …)` (remplacement) | É |
| `modules/voyages/components/trip-tasks-tab.tsx:176,177` | `removeWhere('task_assignees/reminders', …)` (cascade) | É |
| `modules/voyages/components/trip-tasks-tab.tsx:178` | `remove('tasks', target.id)` | S |
| `modules/voyages/components/trip-notes-tab.tsx:136` | `removeWhere('note_attachments', …)` (cascade) | É |
| `modules/voyages/components/trip-places-tab.tsx:141` | `remove('places', target.id)` | S |
| `modules/prestataires/api.ts:47` | `removeWhere('provider_attachments', …)` (cascade) | É |
| `modules/prestataires/api.ts:48,128,156` | `remove('providers'/'provider_attachments'/'provider_types', id)` | S |
| `modules/taches/hooks/use-taches.ts:266` | `remove(TASK_LISTS_TABLE, id)` | S |
| `modules/taches/api.ts:53` | `removeWhere(TASK_ASSIGNEES_TABLE, …)` | T |
| `modules/taches/api.ts:63` | `removeWhere(TASK_REMINDERS_TABLE, …)` | T |
| `modules/contacts/api.ts:43` | `remove(CONTACTS, id)` | S |
| `modules/animaux/api.ts:45` | `removeWhere('pet_records', …)` (cascade) | T |
| `modules/animaux/api.ts:48` | `removeWhere('pet_attachments', …)` (cascade) | T |
| `modules/animaux/api.ts:49` | `remove('pets', id)` | S (voulu strict) |
| `modules/animaux/api.ts:65,96` | `remove('pet_records'/'pet_attachments', id)` | S |
| `modules/parametres/api.ts:118` | `remove('household_members', memberId)` | S |
| `modules/messages/api.ts:118` | `remove('messages', messageId)` | S |
| `modules/messages/api.ts:136,150,288,317` | `removeWhere('conversation_members', …)` | **S (site WR-01, ne pas affaiblir)** |
| `modules/messages/api.ts:240` | `remove('conversations', row.id).catch` (rollback) | R |
| `modules/calendrier/api.ts:90,147,161,162` | `remove(CALENDARS/REMINDERS/EVENTS, …)` | S |
| `modules/anniversaires/api.ts:31` | `remove(BIRTHDAYS, id)` | S |
| `lib/storage.ts:109` | `supabase.storage.from(...).remove([path])` | hors contrat (`DataAdapter`) |

### Tests

Les tests emploient massivement `.remove(...).catch(() => undefined)` en **nettoyage de fixtures** (courses, voyages, cadeaux, notifications, etc.) : nettoyage strict-par-défaut mais gardé par un `catch`, donc inchangé. Les seuls sites de tests qui portent une assertion de contrat sont `lib/data/remove-contract.test.ts` (preuves T/S nouvelles) et `modules/messages/messages-page.test.tsx` (`removeWhere('conversation_members', …)` strict). `modules/voyages/trip-members-section.test.tsx`, `trip-create-dialog.test.tsx`, `trip-detail.test.tsx`, `trip-*-tab.test.tsx`, `hooks/use-notifications.test.tsx`, `courses/*.test.ts*` — **S** (gardés par `catch`, aucun changement).

## Decisions Made

- **Même `DataError` dans les deux adaptateurs** : les messages utilisateur sont exportés depuis `adapter.ts` (`REMOVE_MISSING_MESSAGE`, `REMOVE_WHERE_MISSING_MESSAGE`) plutôt que dupliqués — le plan exige « le même `DataError` ».
- **Représentation plutôt que `count:'exact'`** : `.delete().eq(...).select()` renvoie les lignes réellement retirées ; une seconde requête de comptage serait une fenêtre de course. `removeWhere` utilise `.select()` sans nom de colonne (les tables de jointure n'ont pas d'`id`).
- **Défaut strict, tolérance opt-in** : `RemoveOptions.ifMissing` vaut `'error'` par défaut ; chaque site qui accepte un zéro-ligne le déclare explicitement.
- **`messages/api.ts` reste strict** : `removeWhere('conversation_members', …)` est le site du défaut WR-01 — sa stricte vérité est la correction, pas une tolérance.
- **Rollbacks laissés intacts** : les `.catch(() => undefined)` qui accompagnent une erreur en cours de propagation (création de dépense, de média Cercle, de voyage) préservent l'erreur d'origine ; les convertir ferait perdre l'erreur d'origine au profit d'une erreur de nettoyage.

## Deviations from Plan

### Auto-fixed / élargissements documentés

**1. [Rule 2 – Missing Critical / §E] Élargissement de la liste de fichiers : replis silencieux des cascades tolérantes convertis à l'option explicite**
- **Found during:** Task 3 (porte empirique = suite entière + §E « corriger la classe »).
- **Issue:** Cinq sites de production hors `files_modified` avalaient l'erreur d'une suppression pourtant légitimement idempotente via `.catch(() => undefined)`. Après WR-01, ce repli aurait **avalé le nouveau `DataError` strict** : le silence de WR-01 aurait survécu dans ces chemins (cascade prestataire, cascade note + composants de voyage). Le motif est exactement celui que le plan interdit (« jamais un repli qui avale tout »).
- **Fix:** Conversion à `{ ifMissing: 'ignore' }` (option explicite ; une erreur réelle remonte désormais).
- **Files modified:** `app/src/modules/prestataires/api.ts:47` ; `app/src/modules/notes/hooks/use-notes.ts:204` ; `app/src/modules/voyages/api.ts:397` ; `app/src/modules/voyages/components/trip-tasks-tab.tsx:110,176,177` ; `app/src/modules/voyages/components/trip-notes-tab.tsx:136`.
- **Justification vs plan:** le plan autorise l'élargissement « sur ce seul motif, en documentant chaque ajout » et nomme lui-même « composants de voyage, Note/Cercle/Prestataires » parmi les catégories attendues ; T-18-06 (mitigate) exige que *chaque* suppression légitimement idempotente soit déclarée.
- **Verification:** suite entière verte après conversion ; `typecheck` ✓.
- **Committed in:** `556a212` (Task 3).

**2. [Rule 1 – Bug] Deux assertions de test mises à jour pour la nouvelle signature**
- **Found during:** Task 3 (suite entière).
- **Issue:** `app/src/modules/animaux/api.test.ts:128` et `app/src/modules/prestataires/api.test.ts:157` assertaient `removeWhere(...)` **sans** troisième argument ; l'ajout de `{ ifMissing: 'ignore' }` (mandaté pour animaux `pet_records`, élargissement pour prestataires) faisait échouer l'assertion exacte.
- **Fix:** assertion mise à jour pour inclure `{ ifMissing: 'ignore' }` — plus précise qu'avant (elle affirme désormais la tolérance déclarée).
- **Files modified:** `app/src/modules/animaux/api.test.ts`, `app/src/modules/prestataires/api.test.ts`.
- **Verification:** suite entière verte (948 tests).
- **Committed in:** `556a212` (Task 3).

**3. [Rule 1 – Bug] Typo de commentaire corrigée**
- **Found during:** Task 3.
- **Issue:** commentaire « transformrait » dans `taches/api.ts`.
- **Fix:** « transformerait ».
- **Committed in:** `556a212` (Task 3).

---

**Total deviations:** 3 auto-fixées (1 missing critical/§E, 2 bugs). **Impact on plan :** aucun écart de périmètre ; l'élargissement est circonscrit aux cascades tolérantes et chaque ajout est documenté (fichier:ligne ci-dessus). Aucun paquet installé (pas de porte de légitimité déclenchée).

## Issues Encountered

- **4 échecs pré-existants de la suite, tous causés par la strictness de Task 1, tous résolus par la déclaration de tolérance de Task 3** (`recettes-page` « creer Gratin… », `routines-page` ×2, `taches-page` « ajoute une tâche depuis le dialogue »). Le plan l'anticipait (« la suite entière est la porte empirique ») ; jamais résolus en retirant le comptage.
- **Le contrôle statique a d'abord refusé le test SQL** (dollar-quote nommé `$do$` multi-ligne ⇒ faux « littéral non fermé »). Corrigé en gardant `do $$ … $$` (tag vide, multiligne autorisé) et des littéraux SQL à quotes doublées, sans dollar-quote imbriqué.
- **4 échecs e2e notoires, non liés** (`critical-paths.spec.ts:32`, `voyage-workspace.spec.ts:120`) : hors périmètre, non touchés.

## Known Stubs

Aucun. Scan des fichiers créés/modifiés : pas de valeur vide codée en dur alimentant l'UI, pas de « à venir »/`TODO`/`FIXME` introduit, pas de composant sans source de données. Ledger `.planning/WINDOWS.md` : rien à ajouter.

## Threat Flags

Aucun. Les fichiers modifiés n'introduisent aucune surface nouvelle au-delà du `<threat_model>` du plan (aucun endpoint, chemin d'auth, accès fichier ou schéma nouveau). Les mitigations T-18-03 / T-18-04 / T-18-06 sont implémentées et prouvées (comptage + `DataError`, `ardoise_members` + garde, tolérance déclarée) ; T-18-05 est accepté (RLS inchangée) et prouvé par `0123`.

## Auth Gates

Aucune.

## User Setup Required

None — aucune configuration de service externe.

## Next Phase Readiness

- Contrat de suppression bruyant en place pour toute la couche data (les phases suivantes héritent du défaut strict).
- Preuve base reproductible : `sh scripts/test-db.sh 0123` (Docker disponible sur cette machine — SQL **VALIDÉ**, pas seulement appliqué).
- **Point de vigilance :** tout nouvel appelant qui supprime légitimement zéro ligne devra déclarer `{ ifMissing: 'ignore' }` ; `keys.test.ts` rougira pour toute table composite oubliée.
- `18-02-SUMMARY.md` est **volontairement laissé non committé** (`commit_docs: false`).

---

## Self-Check: PASSED

- `app/src/lib/data/remove-contract.test.ts` — FOUND
- `app/src/lib/data/keys.test.ts` — FOUND
- `app/src/modules/ardoise/api.test.ts` — FOUND
- `supabase/tests/0123_rls_delete_zero_rows.sql` — FOUND
- Commit `6727e73` — FOUND
- Commit `5de0b17` — FOUND
- Commit `556a212` — FOUND

---
*Phase: 18-durcissement-frontend-correctifs-de-revue-de-code*
*Completed: 2026-10-15*
