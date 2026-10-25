---
phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr
plan: 15
subsystem: testing
tags: [seed, demo-mode, instants, timezone, postgres, pg_cron, garde-de-classe]

# Dependency graph
requires:
  - phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr
    provides: atInstant() déjà posé par 19-02 (le précédent de la bonne forme : un instant, pas une heure murale)
provides:
  - Les cinq created_at de messages de la graine sont des instants relatifs (minutesAgo), jamais des heures murales
  - Une garde de classe (seed-instants.test.ts) qui interdit tout created_at ensemencé dans le futur
  - Une glose de at() qui ne prétend plus couvrir created_at
  - supabase/tests/0004_cron.sql à base de date unique (v_today, Europe/Paris)
affects: [toute phase qui touche la graine de démonstration ou les tests SQL cron]

actuals:
  tokens: 2662
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Instant révolu (minutesAgo/now) pour un created_at, heure murale (at) réservée aux events à venir"
    - "Garde de classe bornée : vérifie tous les created_at ensemencés, échoue si elle n'en trouve aucun, ignore les remind_at (légitimement futurs)"

key-files:
  created:
    - app/src/lib/seed-instants.test.ts
  modified:
    - app/src/lib/data/seed.ts
    - app/src/hooks/use-notifications.test.tsx
    - supabase/tests/0004_cron.sql

key-decisions:
  - "Un created_at est un instant révolu (minutesAgo), pas une heure murale : un message envoyé ne peut pas être daté du futur (deferred-items §13)"
  - "La garde de classe est bornée aux created_at : un remind_at futur (event_reminders/task_reminders) est correct et ne doit pas être refusé"
  - "Une seule notion d'aujourd'hui dans 0004_cron.sql : v_today (Europe/Paris), alignée sur run_daily_routine_maintenance (deferred-items §14)"
  - "Preuve cron déterministe (session TZ Pacific/Midway) plutôt que fenêtrée : reproductible à toute heure, là où la fenêtre 22h-24h UTC était déjà fermée à l'exécution"

requirements-completed: []

coverage:
  - id: D1
    description: "La graine de démonstration date les messages d'instants révolus : plus de message 'envoyé demain' quelle que soit l'heure d'ouverture"
    verification:
      - kind: unit
        ref: "app/src/lib/seed-instants.test.ts > tout `created_at` ensemencé est dans le passé"
        status: pass
      - kind: unit
        ref: "app/src/lib/seed-instants.test.ts > les messages de la graine sont passés et gardent leur ordre"
        status: pass
    human_judgment: false
  - id: D2
    description: "npm test est vert à l'heure nocturne (4 cas rouges sur use-notifications.test.tsx avant correction)"
    verification:
      - kind: unit
        ref: "cd app && npm test (1168 passed, 137 files)"
        status: pass
    human_judgment: false
  - id: D3
    description: "supabase/tests/0004_cron.sql passe quand la date de session diffère de la date Europe/Paris"
    verification:
      - kind: integration
        ref: "session TZ Pacific/Midway, corps de 0004 exécuté via scripts/psql.sh"
        status: pass
      - kind: integration
        ref: "sh scripts/test-db.sh 0004"
        status: pass
    human_judgment: false

duration: 21min
completed: 2026-10-16
status: complete
---

# Phase 19 Plan 15: deux défauts de frontière de temps — datation de la graine et date unique du test cron

Fermer la **classe** des deux défauts de frontière de temps de la phase 19 : cinq `created_at` de messages posés à une heure murale fixe (futurs toute la matinée), et `0004_cron.sql` ensemencé sur la date de session mais affirmait sur la date Europe/Paris.

## Heure des exécutions décisives

Toutes les preuves rouges ont été prises entre **00:08 et 00:27 UTC** (02:08–02:27 CEST, fuseau Europe/Paris). La fenêtre nocturne de `npm test` (00:00–10:45 locale) était **ouverte** ; la fenêtre du test cron (22:00–24:00 UTC) était **déjà fermée** à l'arrivée (00:08 UTC) — d'où la preuve déterministe pour le cron.

| Exécution | Heure locale (CEST) | Heure UTC |
|-----------|---------------------|-----------|
| Rouge `npm test` (avant) | 02:13:58 | 00:13:58 |
| Rouge cron déterministe (avant) | 02:15:17 | 00:15:17 |
| Vert `npm test` (après) | 02:16:55 → 02:24:17 | 00:16:55 → 00:24:17 |
| Vert cron déterministe (après) | 02:26:02 | 00:26:02 |
| e2e | 02:27:07 → 02:29:00 | 00:27:07 → 00:29:00 |

## Task 1 — la graine dit un instant pour un message, garde de classe à l'appui

**Commit :** `1f6eb50` — `fix(19-15): dater les messages de la graine en instants relatifs`

**Rouge (avant) — `npx vitest run src/hooks/use-notifications.test.tsx`, 02:13:58 CEST / 00:13:58 UTC :**

```
 ❯ src/hooks/use-notifications.test.tsx (14 tests | 4 failed) 21303ms
   × agrège non lus et restes à faire, puis solde les marquables
   × expose lus récents, masquage et effacement sans suppression
   × isole le feed messages : marquage direct de conversation-1
   × ouvrir le fil cache sa ligne partout (auto-masquage à la lecture)
 Test Files  1 failed (1)
      Tests  4 failed | 10 passed (14)
```

**Mécanisme exact** (au-delà de la glose du plan) : les messages 1–3 de `conversation-1` (10:42/10:44/10:45) n'étaient **pas** recalés par le `beforeEach` du banc, seulement message-4 et message-5. Avant 10 h 45, `conversation-1` restait donc non lue après « tout marquer », et les `waitFor` des quatre cas ne se soldaient jamais (timeout 5000 ms).

**Changements :**
- `seed.ts` : helper `minutesAgo(n)` posé près de `now()`, glosé sur le **pourquoi** (un message a été envoyé, donc révolu). Les cinq `created_at` de `demoMessages` passent de `at('…')` à `minutesAgo(…)`, ordre préservé — `conversation-3` (12 min) > `conversation-1` (40/38/37 min) > `conversation-2` (180 min).
- `seed.ts:83` : glose de `at()` corrigée — elle ne sert plus que les heures murales des `events`, légitimement à venir.
- `seed-instants.test.ts` (nouveau) : garde de **classe** — parcourt `seedRows()`, vérifie **tout** `created_at` ≤ maintenant, **compte** ce qu'elle vérifie et échoue si elle n'en trouve aucun ; bornée aux `created_at` (un `remind_at` futur reste correct) ; asserte en plus que les cinq messages sont strictement passés et ordonnés.
- `use-notifications.test.tsx` : quatre commentaires périmés (18h10 / 09h18) remplacés par le **vrai** mécanisme (`beforeEach` recale message-4 passé, message-5 futur).

**Vert (après) — `npm test`, 02:16:55 → 02:24:17 CEST / 00:16:55 → 00:24:17 UTC :**

```
 Test Files  137 passed (137)
      Tests  1168 passed (1168)
```

**Preuve rouge de la garde (mutation, 02:24:44 CEST / 00:24:44 UTC)** — `message-3` remis à `${at('23:59')}` (heure murale future) :

```
FAIL src/lib/seed-instants.test.ts > les messages de la graine sont passés et gardent leur ordre
AssertionError: message-3 doit être un instant révolu: expected 1792187940000 to be less than 1792110288019
 Tests  2 failed (2)
```

La première assertion nomme aussi le champ : `messages[message-3] = 2026-10-16T23:59:00`. **Restauration** via `git checkout -- app/src/lib/data/seed.ts` → `npx vitest run src/lib/seed-instants.test.ts` → `Tests 2 passed (2)` (02:24:51 CEST).

## Task 2 — le test cron n'a qu'une seule notion d'« aujourd'hui »

**Commit :** `15458ef` — `fix(19-15): une seule notion d'aujourd'hui dans le test cron`

**Preuve cron — déterministe, non fenêtrée.** À l'arrivée (00:08 UTC) la fenêtre 22h–24h UTC était fermée : `sh scripts/test-db.sh 0004` était déjà **vert**. La preuve rouge a donc été obtenue en forçant la date de session à différer de Paris, ce qui reproduit à toute heure l'écart de la fenêtre. Commande exacte :

```bash
sh scripts/psql.sh -q < supabase/tests/_setup.sql
{ echo "set time zone 'Pacific/Midway';"; cat supabase/tests/0004_cron.sql; } | sh scripts/psql.sh -f -
sh scripts/psql.sh -q -c "drop schema if exists testkit cascade;"
```

`Pacific/Midway` (UTC−11) donne `current_date = 2026-10-15` là où Paris vaut `2026-10-16` — exactement le décalage de la fenêtre.

**Rouge (avant), 02:15:17 CEST / 00:15:17 UTC :**

```
psql:<stdin>:126: ERROR:  ASSERTION ÉCHOUÉE : une occurrence validée n'est jamais touchée (attendu 1, obtenu 0)
```

L'assertion `:118` (`occurrence_date = v_today - 20`) ne trouvait pas la complétion que la graine `:58` avait posée à `current_date - 20`.

**Vert (après), 02:26:02 CEST / 00:26:02 UTC :** le même bloc atteint `ROLLBACK` sans erreur.

**Changement :** `v_today date := (now() at time zone 'Europe/Paris')::date` déclaré dans le bloc de la section 2 (glosé), et la graine `:58` passe de `current_date - 20` à `v_today - 20`. La doctrine (Europe/Paris) gagne, et elle est déjà celle de `run_daily_routine_maintenance` (`generate_routine_occurrences(v_today - 14, v_today)`).

**Bornes de fenêtre vérifiées (`:60, 62, 64, 77`) :** laissées sur `current_date` conformément au plan. L'écart ne les rend pas fausses — l'insert dupliqué `:77` vise `current_date`, qui reste dans la fenêtre générée `[current_date-14, current_date]` dans les deux cas, et les assertions de la section 3 portent sur des fenêtres relatives à `v_today - 7` que l'écart d'un jour ne vide pas. Prouvé : la preuve déterministe passe avec la seule ligne 58 changée.

## Vérification (chaîne complète, après)

| Commande | Résultat |
|----------|----------|
| `cd app && npm test` | 137 files, 1168 passed — **vert** |
| `cd app && npm run typecheck` | **vert** |
| `cd app && npm run build` | **vert** (PWA 100 entries précachées) |
| `python3 scripts/check-sql-statique.py` | « 181 fonction(s) effective(s) … aucun défaut » — **vert** |
| `sh scripts/migrate.sh` | « Toutes les migrations sont déjà appliquées » — **rien de neuf** (ce plan n'ajoute aucune migration) |
| `sh scripts/test-db.sh` | 61 fichiers, tous verts |
| `sh scripts/test-db.sh 0004` | **vert** (avant correction, en fenêtre : échec) |
| `cd app && npm run test:e2e` | 121 passed, 5 skipped — **vert** |

## Deviations from Plan

**1. [Rule 1 - Bug] Le plan attribuait le timeout des 4 cas au mauvais message**

- **Found during :** Task 1, lecture de `use-notifications.test.tsx` et de `use-messages.ts`
- **Issue :** le plan (et la glose existante) décrivait le `beforeEach` comme recalant « message-5 après tout marquage ». Le vrai mécanisme du rouge nocturne est que les messages 1–3 de `conversation-1` ne sont recalés par **personne** : avant 10 h 45, ils restent futurs, `conversation-1` reste non lue après « tout marquer », et les `waitFor` ne se soldent jamais (timeout). Corriger seulement message-4/5 n'aurait pas suffi.
- **Fix :** les cinq `created_at` sont passés en instants relatifs (le plan le demandait déjà), et les commentaires nomment le vrai mécanisme.
- **Files modified :** `app/src/lib/data/seed.ts`, `app/src/hooks/use-notifications.test.tsx`
- **Commit :** `1f6eb50`

**2. [Rule 3 - Blocking] Preuve cron déterministe au lieu de fenêtrée**

- **Found during :** Task 2, à l'ouverture (00:08 UTC — fenêtre 22h–24h UTC fermée)
- **Issue :** la preuve rouge fenêtrée n'était plus disponible ; une preuve « de jour » n'aurait rien prouvé.
- **Fix :** preuve déterministe via `SET TIME ZONE 'Pacific/Midway'` (date de session un jour derrière Paris), reproductible à toute heure. Commande exacte consignée ci-dessus.
- **Files modified :** `supabase/tests/0004_cron.sql`
- **Commit :** `15458ef`

**3. [Rule 2 - Auto-add] Les bornes de fenêtre restent `current_date` (décision documentée, pas un changement)**

- Le plan autorisait à ne changer `:60/62/64/77` que si l'écart les rendait fausses. Vérifié et prouvé qu'il ne les rend pas fausses → laissées telles quelles, et le motif écrit ici. Ce n'est donc **pas** une déviation, mais une décision tracée.

## Auth gates

Aucune.

## Known Stubs

Aucun. Les fichiers touchés n'introduisent ni valeur vide codée en dur, ni texte de remplacement, ni composant sans source de données.

## Threat Flags

Aucun. Aucune surface nouvelle (endpoint, chemin d'auth, accès fichier, schéma) — la graine de démonstration et un test SQL seulement.

## Self-Check

- `app/src/lib/seed-instants.test.ts` — FOUND
- Commit `1f6eb50` — FOUND
- Commit `15458ef` — FOUND

## Self-Check: PASSED
