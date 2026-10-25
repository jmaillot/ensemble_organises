---
phase: 05-cadeaux-contacts
plan: 05
subsystem: frontend-contacts-anniversaires
tags: [contacts, aggregation, e2e, verification-chain, deux-sources, d10]
requires:
  - phase: 05-01
    provides: [contact-lists-table, contact-seed]
  - phase: 05-02
    provides: [birthday-mirror-trigger, dedup-guard-0078, contact-cascade]
provides:
  - contacts-module-ui
  - anniversaires-aggregated-view
  - cadeaux-contacts-e2e
affects: [05-03-edge-ui]
tech-stack:
  added: []
  patterns: [fusion-key-display-merge, non-blocking-duplicate-warning, default-fk-after-async-load]
key-files:
  created:
    - app/src/modules/contacts/types.ts
    - app/src/modules/contacts/api.ts
    - app/src/modules/contacts/hooks/use-contacts.ts
    - app/src/modules/contacts/components/contact-form-dialog.tsx
    - app/src/modules/contacts/contacts-page.tsx
    - app/src/modules/contacts/contacts-page.test.tsx
    - app/src/modules/anniversaires/anniversaires-aggregation.test.tsx
    - app/e2e/cadeaux-contacts.spec.ts
  modified:
    - app/src/types/database.ts
    - app/src/lib/data/seed.ts
    - app/src/lib/modules.ts
    - app/src/app/router.tsx
    - app/src/components/shared/mobile-drawer.tsx
    - app/src/modules/anniversaires/types.ts
    - app/src/modules/anniversaires/hooks/use-anniversaires.ts
    - app/src/modules/anniversaires/components/birthday-form-dialog.tsx
    - app/src/modules/anniversaires/anniversaires-page.tsx
    - app/src/app/app-shell.test.tsx
    - app/src/modules/dashboard/dashboard-page.test.tsx
    - app/src/modules/calendrier/calendrier-page.test.tsx
    - app/e2e/critical-paths.spec.ts
key-decisions:
  - "Fusion purement affichage : chaque ligne reste chargée par sa RLS, la clé ne joint jamais inter-foyer (T-05-10)"
  - "Lignes contact seules liées vers /contacts au lieu d'ouvrir le dialogue birthday (pas de doublon par édition)"
  - "Suppression d'un miroir : seule la ligne birthday part, la fiche contact reste (ConfirmDialog le dit)"
  - "Aucune migration : le dispatch lit déjà tous les birthdays sans filtre contact_id (A2 vérifiée)"
patterns-established:
  - "Clé de fusion nom normalisé + MM-DD partagée (anniversaires/types, réexport contacts)"
  - "FK async après chargement : setValue ciblé, jamais de reset qui écraserait la saisie"
requirements-completed: [D-01, D-02, D-04, D-09, D-10, D-11, D-12, D-13, D-14]
coverage:
  - id: C1
    description: "L'onglet Contacts affiche chips de listes, fiches Nom/DN JJMMAAAA/Photo, alerte doublon sans bloquer"
    requirement: "D-01"
    verification:
      - kind: unit
        ref: "contacts-page.test.tsx (2 tests)"
        status: pass
      - kind: e2e
        ref: "cadeaux-contacts.spec.ts#créer un contact"
        status: pass
    human_judgment: false
  - id: C2
    description: "Anniversaires agrège birthdays + contacts dates, miroirs en une ligne, badge deux-sources, photo contact prioritaire"
    requirement: "D-09"
    verification:
      - kind: unit
        ref: "anniversaires-aggregation.test.tsx (4 tests)"
        status: pass
      - kind: e2e
        ref: "cadeaux-contacts.spec.ts#badge deux-sources"
        status: pass
    human_judgment: false
  - id: C3
    description: "Créer un anniversaire propose 'créer aussi un contact' coché par défaut ; suppression contact confirmée avec cascade miroir"
    requirement: "D-10"
    verification:
      - kind: unit
        ref: "anniversaires-aggregation.test.tsx#case D-10 crée la fiche"
        status: pass
    human_judgment: false
duration: ~1h30
completed: 2026-10-05
status: complete
actuals:
  tokens: 20000
  tasks: 3
  commits: 3
plan_head_before: 2d588adc4a7fbde6c23a32e4ac288867fe67ab70
plan_head_after: 38361b73cf56d7b2f94a573d36727b07bda15bd7
commits: 3
---

# Phase 05 Plan 05: Contacts + agrégation Anniversaires Summary

**Module Contacts complet, vue Anniversaires agrégée avec badge deux-sources et case D-10, e2e vert et chaîne 2.7 documentée (dispatch-push explicitement non prouvé, sans Vault ni abonnement réel).**

## Performance

- **Duration:** ~1h30
- **Started:** 2026-10-05T19:50Z (wave 3 dispatch)
- **Completed:** 2026-10-05
- **Tasks:** 3
- **Files modified:** 21 (8 créés, 13 modifiés)

## Accomplishments

- **Module Contacts (D-01/D-02/D-04/D-14) :** chips Famille + personnelles, fiches Nom/DN JJMMAAAA/Photo, formulaires longs en sections repliables, 44px, états vides avec CTA. Alerte doublon probable non bloquante (clé nom normalisé + MM-DD, même normalisation que la garde serveur 0078). Photos via `depositHouseholdFile` dossier `contacts`, bucket privé. Suppression via ConfirmDialog mentionnant la cascade miroir.
- **Agrégation Anniversaires (D-09/D-11/D-12/D-13) :** `aggregateBirthdays` — paires miroir (`contact_id`) en une ligne, homonymes indépendants en une ligne badgée « 2 sources », photo contact prioritaire avec repli birthday, tri par prochaine échéance via le helper clamp partagé. Lignes contact seules liées vers /contacts.
- **Case D-10 :** « Créer aussi un contact » cochée par défaut à la création, fiche dans la liste Famille ; la garde serveur 0078 absorbe le double-miroir.
- **Chaîne 2.7 :** typecheck + 487/487 tests + build verts ; e2e 43/43 sur les specs concernées (chromium + mobile) ; statique vert (126 fonctions) ; test-db.sh 27/27 ; test-dispatch-push.sh NON EXÉCUTÉ — dit explicitement ci-dessous.

## Task Commits

Each task was committed atomically:

1. **Task 1: Module contacts** - `fe3f529` (feat)
2. **Task 2: Agrégation anniversaires + D-10** - `b361521` (feat)
3. **Task 3: E2E + chaîne 2.7** - `38361b7` (feat)

**Plan metadata:** skipped_gitignored — `.planning/` est gitignoré (`.gitignore:58`), le commit du SUMMARY a été refusé sans `git add -f` (interdit) ; le fichier est écrit sur disque pour l'orchestrateur.

## Files Created/Modified

- `app/src/modules/contacts/*` - module complet (types, api, hook, dialog, page, test)
- `app/src/modules/anniversaires/*` - agrégation (types, hook, dialog, page) + test dédié
- `app/e2e/cadeaux-contacts.spec.ts` - parcours idée → contact date → badge
- `app/src/types/database.ts` - `ContactListRow`, `ContactRow`, `birthdays.contact_id` (miroir 0078)
- `app/src/lib/data/seed.ts` - listes et fiches démo (paire miroir Noé, homonymes Maya/Paul, Léa contact seule)
- `app/src/lib/modules.ts`, `router.tsx`, `mobile-drawer.tsx` - enregistrement `/contacts` (catalogue, route, tiroir)

## Decisions Made

- **Fusion purement affichage :** `aggregateBirthdays` ne joint jamais inter-foyer ; chaque ligne est chargée par sa RLS d'origine (T-05-10). Les tests inter-foyer 0025 couvrent les lectures côté serveur.
- **Lignes contact seules → lien /contacts :** ouvrir le dialogue birthday depuis une ligne contact créerait un doublon ; la fiche s'édite dans Contacts.
- **Suppression d'un miroir :** seule la ligne `birthdays` est supprimée, la fiche contact reste suivie (le ConfirmDialog le dit) — la FK cascade ne joue que dans l'autre sens (D-14).
- **Aucune migration :** hypothèse A2 vérifiée par lecture — `household_birthday_alerts` (0012) lit `public.birthdays` sans filtre `contact_id`, donc les miroirs sont couverts ; cron 06h40 inchangé.
- **todayIso (A1) vérifiée :** `toIsoDate(new Date())` (date murale locale, sans figement TZ conformément à AGENTS §8.4) ; e2e en `Europe/Paris` ; tris par `daysUntil` issus du même helper des deux côtés.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Types DB et seed absents pour contacts + `contact_id`**
- **Found during:** Task 1 (la base 05-01/05-02 n'avait pas de `ContactRow`/`ContactListRow` côté frontend, ni `contact_id` sur `BirthdayRow`)
- **Issue:** L'api, le seed démo et l'agrégation ne compilaient pas sans ces types.
- **Fix:** Interfaces ajoutées à `database.ts` (alignées sur 0077/0078), seed démo + enregistrement `seedTables`.
- **Files modified:** `app/src/types/database.ts`, `app/src/lib/data/seed.ts`
- **Committed in:** `fe3f529`

**2. [Rule 2 - Missing Critical] Module `contacts` non routé, absent du tiroir mobile**
- **Found during:** Task 1 (ModuleShell exige un `ModuleKey`, le tiroir a un invariant de couverture testé)
- **Issue:** Page inatteignable sans entrée catalogue + route + groupe tiroir.
- **Fix:** `ModuleKey` + entrée catalogue, route `/contacts`, groupe « Le foyer » du tiroir.
- **Files modified:** `app/src/lib/modules.ts`, `app/src/app/router.tsx`, `app/src/components/shared/mobile-drawer.tsx`
- **Committed in:** `fe3f529` + `38361b7`

**3. [Rule 1 - Bug] Liste par défaut vide si le dialogue s'ouvre avant le chargement des listes**
- **Found during:** Task 3 (e2e chromium : `combobox Liste [invalid]`, alerte « Choisissez une liste »)
- **Issue:** `reset()` ne rejoue pas à l'arrivée des listes (deps sans `lists`, motif copié d'un dialogue sans défaut async) ; le `<select>` affiche Famille mais RHF vaut `''`.
- **Fix:** Effet ciblé posant `listId` à l'arrivée des listes, sans écraser un choix explicite ; test e2e durci (attente des chips).
- **Files modified:** `contact-form-dialog.tsx`, `cadeaux-contacts.spec.ts`
- **Committed in:** `38361b7`

**4. [Rule 1 - Bug] Compteurs d'espaces codés en dur (16/17) invalidés par le nouveau module**
- **Found during:** Task 3 (3 échecs : app-shell ×2, dashboard ×1)
- **Issue:** Le catalogue passe à 17 espaces ; les assertions `toHaveLength(16/17)` et le tiroir (17 liens) sont fausses.
- **Fix:** Compteurs à 17/18, assertion Contacts dans la grille, tiroir mobile couvrant `contacts`.
- **Files modified:** `app-shell.test.tsx`, `dashboard-page.test.tsx`, `mobile-drawer.tsx`, `critical-paths.spec.ts`
- **Committed in:** `38361b7`

**5. [Rule 3 - Blocking] Test calendrier rouge un jour par an (5 octobre)**
- **Found during:** Task 3 (J+2 = 7 octobre = anniversaire de Maya, « Journée libre » jamais affichée)
- **Issue:** Échec préexistant dépendant de la date, sans rapport avec le plan, mais bloquant la chaîne verte.
- **Fix:** Le test masque les anniversaires avant d'affirmer la journée libre (intention « suppression vide la journée » préservée).
- **Files modified:** `calendrier-page.test.tsx`
- **Committed in:** `38361b7`

---

**Total deviations:** 5 auto-fixed (2 missing-critical, 2 bugs, 1 blocking)
**Impact on plan:** Aucun élargissement de périmètre : chaque fix garantit la correction sans table, RPC ou politique hors plan. Aucune migration ajoutée.

## Issues Encountered

- **E2E desktop vs mobile :** le test badge passait sur mobile et échouait sur chromium — pas un flake mais la race n°3 (timing de chargement différent). La preuve par le DOM capturé (`combobox [invalid]`) a évité un retry aveugle.
- **test-db.sh depuis le worktree :** le runtime `supabase-project/docker-compose.yml` n'y existe pas (snapshot non versionné) — exécuté depuis le checkout principal, SQL identique (aucune migration dans ce plan), 27/27 verts.

## Threat Flags

T-05-10 (fusion sans joint inter-foyer : `aggregateBirthdays` ne groupe que des lignes déjà filtrées par foyer, tests unitaires + 0025) et T-05-11 (ConfirmDialog mentionnant la cascade + FK 0078, D-14) mitigées. Aucune surface nouvelle hors plan : pas de endpoint, pas de changement RLS, pas de secret.

## Known Stubs

Aucun.

## Chaîne 2.7 — résultat détaillé

| Étape | Résultat |
|---|---|
| `cd app && npm run typecheck && npm test && npm run build` | ✅ vert (487/487, 72 fichiers ; build PWA 82 entrées) |
| `cd app && npm run test:e2e` | ✅ 43/43 sur `cadeaux-contacts` + `critical-paths` (chromium + mobile) ; `courses-scan` vert au run précédent, non touché |
| `python3 scripts/check-sql-statique.py` | ✅ vert (126 fonctions effectives, 81 migrations, 29 tests) |
| `sh scripts/test-db.sh` | ✅ 27/27 verts (exécuté depuis le checkout principal, SQL identique — aucune migration dans ce plan) |
| `sh scripts/test-dispatch-push.sh` | ⚠️ **NON EXÉCUTÉ — dispatch non prouvé, et c'est dit :** Vault sans `project_url` ni `service_role_key` (0/2) et aucun abonnement push réel sur cette machine. Un endpoint factice serait `dropped`, pas `delivered` : il prouverait un chiffre, pas l'envoi. Ce plan ne touche ni au SQL, ni à Vault, ni à l'Edge Function : la jambe HTTP→push reste à prouver sur une instance équipée avant merge. |

## Parcours non couverts en e2e (dits, pas tus)

- **Réservation par un non-propriétaire** et **génération de code d'invitation** : UI portée par le plan 05-03 (hors périmètre, fichiers disjoints) — parcours manuel à rejouer à l'intégration. Le spec `cadeaux-contacts` couvre idée → contact date → badge ; son en-tête le documente.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- UI 05-05 complète et verte ; le plan 05-03 (Edge + UI cadeaux) peut intégrer les parcours réservation/code en s'appuyant sur `gift_items_for_list` et les RPC 0079.
- Avant merge : rejouer `test-dispatch-push.sh` sur une instance avec Vault provisionné (`set-push-secrets.sh`) et un appareil abonné ; `test-db.sh` reste le passage obligatoire pour tout changement SQL futur.
- Attention merge wave 3 : fichiers tous nouveaux sauf extensions anniversaires — le worker sibling 05-03 est disjoint par construction, mais vérifier `database.ts`/`seed.ts` en cas d'édition concurrente.

## Self-Check

**PASSED** — les 8 fichiers créés existent sur disque, les 3 commits (`fe3f529`, `b361521`, `38361b7`) existent sur `worktree-agent-p05-1791222864`, typecheck + 487 tests + build + e2e 43/43 + statique + test-db 27/27 verts, SUMMARY écrit (commit refusé : `.planning/` gitignoré — `skipped_gitignored` explicite, aucun `git add -f`).

---
*Phase: 05-cadeaux-contacts*
*Completed: 2026-10-05*
