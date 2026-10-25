---
phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr
plan: 12
subsystem: database
tags: [postgres, migration, backfill, storage, signed-url, rls, wr-08]

# Dependency graph
requires:
  - phase: 19 (19-01)
    provides: "householdMediaPathOf / storedValueOf — la convention « le chemin est la référence » (D-01)"
  - phase: 19 (19-07, 19-08, 19-09)
    provides: "le gel de l'écriture dans anniversaires/contacts/animaux, courses/cadeaux, ardoise : le rattrapage passe après, il ne se dégrade plus"
provides:
  - "supabase/migrations/0124_media_path_backfill.sql — rattrapage idempotent des URL signées héritées vers le chemin de bucket, sur dix colonnes média"
  - "private.media_path_from_signed_url(text) — extraction du chemin d'une URL signée du bucket household-media, non exécutable par authenticated"
  - "supabase/tests/0124_media_path_backfill.sql — preuve SQL (extraction, non-réécriture, lecture bornée, fermeture de la fonction)"
affects: [19-14, verify-work]

# Actuals (#2632) — pairs with the plan's estimate (46000 tokens).
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 5102
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Rattrapage de données idempotent : fonction d'extraction pure + `update` gardé par l'expression elle-même (la garde EST l'expression)"
    - "Rapport de migration par colonne (LEFT JOIN d'une liste de libellés → 10 lignes même sur base vide) puis auto-contrôle qui `raise exception` si l'état attendu n'est pas atteint"
    - "Fonction postérieure à 0009_grants.sql : `revoke all … from public` explicite, aucun grant à authenticated"

key-files:
  created:
    - supabase/migrations/0124_media_path_backfill.sql
    - supabase/tests/0124_media_path_backfill.sql
  modified: []

key-decisions:
  - "D-02 : une URL signée Supabase porte son chemin ; les valeurs non analysables (URL externe, chemin nu, null) sont laissées telles quelles et COMPTÉES dans le rapport — jamais converties à la devinette"
  - "Un seul bucket reconnu (`household-media`) : les six constantes du dépôt portent toutes cette chaîne ; une URL signée d'un autre bucket n'est pas un joker et reste intacte"
  - "`revoke all on function … from public` explicite : une fonction créée après 0009 reçoit l'EXECUTE par défaut, et le rattrapage n'est pas une surface d'appel client"

patterns-established:
  - "Garde = expression : `where col is distinct from private.media_path_from_signed_url(col)` sélectionne exactement les lignes réparables, la garde et la réécriture ne peuvent pas diverger"
  - "Rapport qui nomme TOUJOURS ses dix colonnes : liste de libellés LEFT JOINée au relevé, `count(v.x)` et non `count(*)` (un `group by` sur un relevé vide ne rend aucun groupe)"

requirements-completed: [WR-08]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Une ligne existante portant une URL signée du bucket porte, après rattrapage, le chemin extrait ; les valeurs non analysables restent intactes et sont comptées"
    requirement: WR-08
    verification:
      - kind: integration
        ref: "supabase/tests/0124_media_path_backfill.sql (sh scripts/test-db.sh 0124)"
        status: pass
    human_judgment: false
  - id: D2
    description: "private.media_path_from_signed_url n'est pas exécutable par authenticated — le rattrapage est une opération d'exploitation"
    requirement: WR-08
    verification:
      - kind: integration
        ref: "supabase/tests/0124_media_path_backfill.sql — testkit.expect_denied sous le rôle authenticated"
        status: pass
    human_judgment: false

# Metrics
duration: 17min
completed: 2026-10-16
status: complete
---

# Phase 19 Plan 12: rattrapage des médias hérités Summary

**Migration 0124 : extraction du chemin d'une URL signée du bucket `household-media` vers dix colonnes média, valeurs non analysables laissées intactes et comptées, auto-contrôle qui échoue bruyamment, fonction interne non exécutable par `authenticated`**

## Performance

- **Duration:** 17 min
- **Started:** 2026-10-15T22:38:30Z
- **Completed:** 2026-10-15T22:55:42Z
- **Tasks:** 2
- **Files modified:** 2 (1 migration + 1 test, tous deux créés)

## Accomplishments
- `private.media_path_from_signed_url(text)` — `language sql`, `immutable`, `set search_path = ''` ; trois branches : `null` → `null`, URL signée du bucket → chemin extrait (`split_part` pour la query string, puis `regexp_replace` greedy pour la dernière occurrence du segment de bucket), toute autre forme rendue telle quelle. C'est la branche `else` qui protège les valeurs non analysables.
- Les **dix réécritures gardées** (note_attachments.file_url, birthdays.photo_url, contacts.photo_url, pets.photo_url, pet_attachments.file_url, post_media.url, products.photo_url, gift_items.photo_url, gift_ideas.photo_url, ardoises.cover_url), chacune `where col is distinct from private.media_path_from_signed_url(col)` — la garde EST l'expression.
- **Rapport** colonne par colonne (« N réparée(s), M laissée(s) ») puis **auto-contrôle** qui `raise exception` si une URL signée du bucket subsiste. Les deux blocs posent deux questions différentes (« combien reste-t-il » / « en reste-t-il »).
- `revoke all on function private.media_path_from_signed_url(text) from public` : le rattrapage n'est pas une surface client.
- Test SQL : matrice d'extraction (5 cas), rejeu gardé sur 4 lignes `birthdays` réelles, comptage borné au foyer, lecture bornée par `id` sous `authenticated`, `expect_denied` sur la fonction interne.

## Task Commits

Each task was committed atomically:

1. **Task 1 : la migration de rattrapage** - `3b55805` (feat)
2. **Task 2 : le test SQL** - `c6cdc36` (test)

**Plan metadata:** non committé (`commit_docs: false`) — `19-12-SUMMARY.md` et les mises à jour `.planning/` restent non suivis.

## Files Created/Modified
- `supabase/migrations/0124_media_path_backfill.sql` — fonction d'extraction, rapport, dix `update` gardés, auto-contrôle.
- `supabase/tests/0124_media_path_backfill.sql` — preuve SQL du rattrapage (autonome, `begin;`/`rollback;`).

## Decisions Made
- **D-02 tenu à la lettre** : extraction depuis la forme `…/storage/v1/object/sign/<bucket>/<chemin>?token=…` ; valeurs non analysables laissées telles quelles ET comptées ; pas de conversion devinée.
- **Un seul bucket reconnu** (`household-media`) : les six constantes du dépôt portent la même chaîne — `app/src/lib/storage.ts:18`, `modules/cercle/api.ts:25`, `modules/voyages/api.ts:80`, `modules/prestataires/api.ts:16`, `modules/adresses/api.ts:16`, `modules/messages/api.ts:8` (vérifiées sur le fichier ; la ligne de `cercle/api.ts` est 25, la constante étant exportée une ligne sous son commentaire).
- **`messages.media_url` hors périmètre** : `modules/messages/api.ts:187` persiste aussi une URL signée, mais Messages n'est ni dans les cinq modules de WR-08 ni dans les six « modèle » de D-01. Réparer ici sans corriger l'écriture laisserait un demi-correctif qui se dégrade — remonté à l'orchestrateur, non absorbé.
- **Idempotence** : rejouée, la migration ne trouve plus rien à réécrire (0 réparée partout) — vérifié en supprimant la ligne de `schema_migrations` et en rejouant.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Le rapport n'imprimait aucune ligne sur une base vide, au lieu des dix attendues**
- **Found during:** Task 1, à la première exécution de `sh scripts/migrate.sh`.
- **Issue:** le plan demande `group by libelle` sur l'union des dix colonnes. Or `group by` sur un ensemble vide ne rend **aucun** groupe : le relevé étant vide (les tables média n'ont pas de ligne), la boucle n'itérait jamais et la sortie ne portait **aucune** des dix lignes du rapport — contredisant l'exigence explicite (« imprime les dix lignes du rapport »). L'unique NOTICE visible était celle de l'auto-contrôle, ce qui donnait un rapport vert sans une seule ligne de compte.
- **Fix:** la liste des dix libellés est posée à part (`values (…)`) et **LEFT JOINée** au relevé, avec `count(v.x)` et non `count(*)` (sans quoi la ligne de gauche d'un libellé sans correspondance se compterait elle-même). Dix lignes garanties, y compris sur base vide.
- **Files modified:** `supabase/migrations/0124_media_path_backfill.sql`
- **Verification:** `sh scripts/migrate.sh` imprime désormais les dix lignes (`note_attachments.file_url : 0 réparée(s), 0 laissée(s)`, …). Preuve que le correctif vise bien un état vide : la sortie avant était de zéro ligne.
- **Committed in:** `3b55805` (Task 1 commit).

---

**Total deviations:** 1 auto-fixé (1 bug).
**Impact on plan:** sans ce correctif, le rapport de migration — l'exigence centrale de D-02 — n'aurait rien affiché sur une base neuve. Le reste du plan a été exécuté tel qu'écrit.

## Verification (chaîne SQL + frontend)

- `python3 scripts/check-sql-statique.py 0124` → vert. Dépôt entier → **181 fonction(s) effective(s) sur 124 migration(s) et 63 test(s), aucun défaut**.
- `sh scripts/migrate.sh` → `0124_media_path_backfill.sql` appliquée ; **les dix lignes du rapport** puis `NOTICE: 0124 : aucune URL signée du bucket ne subsiste ; rattrapage effectif.`
- `sh scripts/test-db.sh 0124` → **OK**. Preuve rouge→vert (voir ci-dessous).
- `sh scripts/test-db.sh` (campagne) → **60 fichiers verts, 1 en échec** (`0004_cron.sql`, préexistant, voir *Issues Encountered*).
- `cd app && npm run typecheck` → vert. `npm run build` → **exit 0**.
- `npm test` → **1 failed | 133 passed (134)** fichiers, **4 failed | 1141 passed (1145)** cas — exactement les **4 cas connus et préexistants** de `app/src/hooks/use-notifications.test.tsx` (défaut de graine daté « heure murale du jour », rouge entre 00 h 00 et 10 h 45 locale ; mesuré ici à 00 h 46 locale). **Ce n'est pas causé par ce plan et il ne doit pas lui être attribué.**

### Preuve rouge → vert (exigée)

Neutralisation locale de la fonction (renommage), puis test :

```
alter function private.media_path_from_signed_url(text) rename to media_path_from_signed_url_x;
sh scripts/test-db.sh 0124
  →  ERROR:  function private.media_path_from_signed_url(text) does not exist
     QUERY: SELECT testkit.eq( private.media_path_from_signed_url( … ) , … )   -- assertion (a)
     ÉCHEC 0124_media_path_backfill.sql
Tests SQL : 1 fichier(s) en échec sur 1.
```

Restauration, puis test :

```
alter function private.media_path_from_signed_url_x(text) rename to media_path_from_signed_url;
sh scripts/test-db.sh 0124
  →  OK 0124_media_path_backfill.sql
Tests SQL : 1 fichier(s), tous verts.
```

### Idempotence (vérification §7)

`delete from public.schema_migrations where version = '0124_media_path_backfill.sql';` puis `sh scripts/migrate.sh` → les dix lignes affichent **0 réparée, 0 laissée** ; rien n'est réécrit.

## Issues Encountered

**`0004_cron.sql` en échec dans la campagne complète — préexistant, hors plan 19-12 (documenté en `deferred-items.md` §14).**
L'assertion `une occurrence validée n'est jamais touchée` (`0004_cron.sql:116-121`) attend 1, obtient 0. Cause prouvée : la graine date l'occurrence de `current_date - 20` (**UTC**) alors que l'assertion la cherche sur `v_today - 20` (`(now() at time zone 'Europe/Paris')::date`). Europe/Paris est en avance sur UTC ; entre 22 h et 24 h UTC les deux dates diffèrent d'un jour. Mesure au moment de la découverte : `utc_current_date = 2026-10-15`, `paris_today = 2026-10-16`, `seed_date = 2026-09-25`, `asserted_date = 2026-09-26`. 0124 ne référence les tables routinières **zéro** fois ; le défaut est donc indépendant de ce plan et **non attribué à 19-12**. À traiter dans la clôture de phase (`19-14`).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Le rattrapage est en base (migration appliquée) et prouvé ; la phase cesse de ne réparer que le futur.
- Reste à l'orchestrateur : `messages.media_url` (hors périmètre, cf. Decisions) et le défaut préexistant `0004_cron.sql` (frontière de date UTC/Paris) — tous deux hors `19-12`.

---
*Phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr*
*Completed: 2026-10-16*

## Self-Check: PASSED

- FOUND: supabase/migrations/0124_media_path_backfill.sql
- FOUND: supabase/tests/0124_media_path_backfill.sql
- FOUND: `.planning/phases/19-…/19-12-SUMMARY.md`
- FOUND: 3b55805 (Task 1)
- FOUND: c6cdc36 (Task 2)
- commits measured: `git rev-list --count 99bc8ce..c6cdc36` = 2
