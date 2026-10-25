---
phase: 23-signature-media-invitee-bornee-au-foyer
plan: 01
subsystem: database
tags: [postgres, migration, supabase-edge-functions, vitest, storage, rls, plpgsql]

requires:
  - phase: 22-signature-media-invitee-bornee-au-foyer
    provides: "0126/0127 (contrainte + case borné) comme motif, et la consignation du résidu R3 avec file:line"
provides:
  - "public.guest_view_gift_list(text) : photo_url borné au foyer de la LISTE, foyer jamais rendu (0128)"
  - "supabase/functions/ardoise-invite/guest-media.ts : module pur (prédicat + résolution en échec fermé)"
  - "les deux surfaces invitées ne relaient plus la forme http(s) (D-03)"
  - "supabase/tests/0128_guest_media_household.sql : positif, trois refus, trois facettes AC 3, refus de privilège"
affects: [23-verify, 21-SECURITY R3, toute phase touchant les surfaces invitées cadeaux/ardoise]

actuals:
  tokens: 11954        # octets de patch (git diff d36359c..HEAD, 47814) / 4 — même échelle que `estimate`
  tasks: 3
  commits: 4           # MESURÉ : git rev-list --count d36359c..HEAD
  plan_head_before: d36359c0ae3feb3ab1337439b8732bdfecfb52f2
  plan_head_after: 23c4fb9f21db87d5ccb7962daa80c074b66bd693

tech-stack:
  added: []
  patterns:
    - "Verdict média prononcé là où le foyer est autoritaire (RPC pour les cadeaux, Edge pour l'ardoise)"
    - "Bornage prouvable sans deno : module PUR + suite Vitest découverte par app/vite.config.ts"
    - "Prédicat `startsWith(foyer + '/')` avec barre finale (ferme le foyer homonyme) + refus de tout `..`"

key-files:
  created:
    - supabase/migrations/0128_guest_media_household.sql
    - supabase/tests/0128_guest_media_household.sql
    - supabase/functions/ardoise-invite/guest-media.ts
    - supabase/functions/ardoise-invite/guest-media.test.ts
  modified:
    - supabase/tests/0032_guest_view_details.sql
    - supabase/functions/ardoise-invite/index.ts
    - supabase/functions/gift-list-invite/index.ts
    - app/src/modules/cadeaux/api.test.ts
    - app/src/modules/cadeaux/guest-cadeau-page.test.tsx
    - app/src/modules/cadeaux/guest-cadeau-page.tsx
    - app/src/modules/ardoise/api.test.ts

key-decisions:
  - "D-01 : le verdict cadeaux vit dans le RPC guest_view_gift_list — seul chemin par lequel l'Edge obtient une valeur à signer"
  - "D-02 : aucune contrainte d'écriture sur gift_items.photo_url ni ardoises.cover_url (formes héritées tolérées, client réécrit à chaque édition)"
  - "D-03 : la forme http(s) n'est plus relayée sur les deux surfaces invitées"
  - "D-04 : le bornage de l'ardoise vit dans un module PUR (deno absent de l'hôte)"
  - "D-05 : recipe-invite/guest-steps.ts laissé intact, son relais http(s) consigné comme résidu cosmétique inatteignable"
  - "Le prédicat isHouseholdBoundedPath est exercé À TRAVERS resolveGuestCoverUrl, pas par des assertions directes (le comportement, pas l'implémentation)"

requirements-completed: [R1, R2, R3, R4]

coverage:
  - id: D1
    description: "guest_view_gift_list ne rend qu'un photo_url borné au foyer de la LISTE ; foyer d'un autre foyer, segment `..` et forme http(s) rendent null ; aucune clé de foyer dans la charge"
    requirement: R1
    verification:
      - kind: integration
        ref: "supabase/tests/0128_guest_media_household.sql (sh scripts/test-db.sh 0128)"
        status: pass
    human_judgment: false
  - id: D2
    description: "La couverture invitée de l'ardoise n'est signée que si le chemin est borné au foyer ; le signeur n'est pas appelé sur un refus"
    requirement: R2
    verification:
      - kind: unit
        ref: "supabase/functions/ardoise-invite/guest-media.test.ts#resolveGuestCoverUrl (R2, R3)"
        status: pass
    human_judgment: false
  - id: D3
    description: "La forme http(s) n'est plus relayée par les deux surfaces invitées"
    requirement: R3
    verification:
      - kind: integration
        ref: "supabase/tests/0128_guest_media_household.sql#une forme http(s) héritée ne sort pas du RPC"
        status: pass
      - kind: unit
        ref: "supabase/functions/ardoise-invite/guest-media.test.ts#rend null SANS appeler le signeur pour une forme http(s) héritée (D-03)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Le câblage du verdict DANS les Edge déployées (ardoise-invite/index.ts, gift-list-invite/index.ts) sert bien la valeur bornée"
    requirement: R4
    verification: []
    human_judgment: true
    rationale: "`deno` est absent de cet hôte et aucun test du dépôt n'importe un `index.ts` d'Edge : le comportement DÉPLOYÉ n'est exercé par aucune chaîne automatique (plan, section <verification>). Ce qui est prouvé automatiquement est le verdict lui-même (RPC par test-db.sh, module pur par Vitest) ; le câblage est vérifié par lecture."

metrics:
  duration: 33min
  started: "2026-10-17T07:24:00Z"
  completed: "2026-10-17T07:57:00Z"
  tasks: 3
  files: 11
status: complete
---

# Phase 23 Plan 01 : Signature média invitée bornée au foyer — Summary

**Le RPC cadeaux ne rend un `photo_url` que borné au foyer de la liste (`0128`), le bornage de la couverture invitée de l'ardoise vit dans un module pur prouvé par Vitest, et les deux surfaces ne relaient plus la forme `http(s)` — fermant le résidu R3 de `21-SECURITY.md`.**

## Performance

- **Duration :** ~33 min (lecture des analogues comprise)
- **Started :** 2026-10-17T07:24:00Z
- **Completed :** 2026-10-17T07:57:00Z
- **Tasks :** 3 / 3
- **Files modified :** 11 (4 créés, 7 modifiés)

## Accomplishments

- `0128_guest_media_household.sql` recrée `public.guest_view_gift_list(text)` — recopie byte-identique de la définition effective de `0092` plus **trois** additions : `v_list_household text`, `household_id` ajouté à la requête EXISTANTE (une requête, pas deux) et un `case` à trois branches sur `photo_url`. Le foyer de la **LISTE** sert au verdict et n'apparaît dans **aucune** clé de la réponse. `0092` n'est pas réécrite (correction vers l'avant), aucune contrainte d'écriture n'est ajoutée (D-02).
- `supabase/tests/0128_guest_media_household.sql` : 7 assertions + 1 refus de privilège — le positif du foyer de la liste, les trois refus (autre foyer / segment `..` / forme `http(s)`), et les **trois facettes** de l'AC 3 (clés de premier niveau exactement `items`/`list_id`/`list_name`, aucune clé de foyer par article, aucune valeur égale à l'identifiant du foyer via `jsonb_path_exists`).
- `supabase/functions/ardoise-invite/guest-media.ts` : module PUR sans import Deno ni `npm:`, exposant `isHouseholdBoundedPath` (barre finale exigée — le foyer homonyme est fermé) et `resolveGuestCoverUrl` qui prononce le verdict **avant** de signer, signe la **chaîne exacte** jugée, et échoue fermement.
- `supabase/functions/ardoise-invite/index.ts` : `buildGuestView` sélectionne `household_id` dans la requête existante et le transmet ; les doublons locaux (deux constantes, `asTextOrNull`, le résolveur) sont supprimés au profit du module partagé. Les deux appelants (ticket, `link-view`) héritent du verdict par construction.
- Les deux surfaces ne relaient plus `http(s)` ; `recipe-invite/guest-steps.ts` est laissé intact (D-05) et son relais devenu inatteignable est consigné comme résidu cosmétique.

## Task Commits

Chaque tâche a été committée atomiquement (la tâche TDD produit un commit RED puis un commit GREEN) :

1. **Task 1 : Tracer — migration `0128`, test `0128`, alignement de `0032`** — `e844552` (feat)
2. **Task 2 (RED) : le verdict média de la couverture invitée rougit sans bornage** — `3f6f7d3` (test)
3. **Task 2 (GREEN) : la couverture invitée n'est signée que si elle est bornée au foyer** — `b5c5b1b` (feat)
4. **Task 3 : la surface cadeaux ne relaie plus la forme `http(s)` héritée** — `23c4fb9` (feat)

**Empreinte mesurée :** `git rev-list --count d36359c..HEAD` = **4** (`plan_head_before` = `d36359c`, `plan_head_after` = `23c4fb9`). Aucun commit de métadonnées : `.planning/` est gitignoré (`commit_docs: false`) — ce SUMMARY est écrit mais jamais committé, et `git add -f` sur `.planning/` est proscrit.

> **Note du 2026-10-17 (reformulation avant publication).** Trois des quatre
> sujets de commit n'étaient pas accentués (« media », « invitee », « signee »,
> « bornee », « heritee »), contre la convention du dépôt (`arrêté`, `média`,
> `bornée`, `aperçu`). Le push n'ayant pas encore eu lieu, les trois messages ont
> été réécrits (`git rebase -i` avec `reword`, AGENTS.md §2.7 G : le message se
> relit AVANT le push) : `ff0038d`, `4d88595` et `e2f76ed` sont devenus
> `3f6f7d3`, `b5c5b1b` et `23c4fb9`. Les **arbres sont identiques** —
> `git log --format=%T d36359c..HEAD` rend la même suite de quatre empreintes
> avant et après — donc seul le message a changé, aucun octet de code.
> `e844552`, déjà conforme, a gardé son SHA.

## Files Created/Modified

- `supabase/migrations/0128_guest_media_household.sql` — (créé) recopie de la définition effective + `case` borné ; en-tête de doctrine, `comment on function` et bloc de privilèges ré-émis ; aucun `add constraint`.
- `supabase/tests/0128_guest_media_household.sql` — (créé) deux foyers, une liste, quatre articles (un par verdict), assertions bornées par `id`.
- `supabase/functions/ardoise-invite/guest-media.ts` — (créé) module pur : constantes, `asTextOrNull`, interface structurelle `GuestMediaSigner`, `isHouseholdBoundedPath`, `resolveGuestCoverUrl`.
- `supabase/functions/ardoise-invite/guest-media.test.ts` — (créé) 11 tests ; le signeur double enregistre `(bucket, path, expiresIn)` et rend une URL opaque qui ne contient PAS le chemin.
- `supabase/tests/0032_guest_view_details.sql` — (modifié) `gitem32_a` semé comme chemin BORNÉ et asserté depuis `testkit.fx` (jamais un littéral recopié) ; `gitem32_c` (`https://…`) asserté `null` ; en-tête et commentaires de fixtures corrigés.
- `supabase/functions/ardoise-invite/index.ts` — (modifié) import `./guest-media.ts`, `household_id` au `select`, lecture avec garde `typeof`, verdict transmis ; doublons locaux supprimés ; doctrine mise à jour.
- `supabase/functions/gift-list-invite/index.ts` — (modifié) relais `http(s)` retiré, commentaire du résolveur et contrat de réponse réécrits.
- `app/src/modules/cadeaux/api.test.ts` — (modifié) la doublure modélise une URL **signée** ; en-tête ajouté.
- `app/src/modules/cadeaux/guest-cadeau-page.test.tsx` — (modifié) l'assertion `data:` conservée, commentaire borné (garde cliente, pas verdict serveur).
- `app/src/modules/cadeaux/guest-cadeau-page.tsx` — (modifié) commentaire seul : la parenthèse « passage hérité ou signée https » était devenue fausse.
- `app/src/modules/ardoise/api.test.ts` — (modifié) la surface PROPRIÉTAIRE est nommée dans le titre et un commentaire.

## Decisions Made

- **Le verdict cadeaux vit dans le RPC, pas dans l'Edge** (D-01) : `v_invite.list_id` → `gift_lists.household_id` est le savoir autoritaire, et `handleGuestView` est le seul chemin par lequel l'Edge obtient une valeur à signer. Filtrer là où le savoir est, comme `0127` pour la recette.
- **Aucune contrainte d'écriture** sur `gift_items.photo_url` ni `ardoises.cover_url` (D-02) : colonnes antérieures à toute borne, formes héritées tolérées, client réécrivant la valeur existante à chaque édition. `grep -n 'add constraint' supabase/migrations/0128_*.sql` est vide.
- **La forme `http(s)` n'est plus relayée** (D-03) : elle ne satisfait pas le préfixe de foyer et tombe dans l'échec fermé, côté RPC comme côté module.
- **Le bornage de l'ardoise vit dans un module pur** (D-04) : `deno` absent, donc seul un module sans import Deno/`npm:` est exécutable par la suite Vitest.
- **`isHouseholdBoundedPath` est exercé à travers `resolveGuestCoverUrl`**, pas par des assertions directes : les tests portent sur le comportement rendu (et sur le double de signeur), pas sur l'implémentation.
- **RED du TDD matérialisé par une extraction fidèle** : le commit RED porte le module dans son état d'avant (une copie du code en ligne de `index.ts:637-651`) ; les quatre assertions de refus échouent alors réellement, chacune sur une assertion — le commit GREEN ajoute le prédicat et retire le relais.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Le contrat de réponse de `gift-list-invite/index.ts` affirmait encore le relais `http(s)`**
- **Found during :** Task 3
- **Issue :** le plan prescrivait de réécrire le commentaire de `resolveGuestPhotoUrl` (`:849-856`), mais l'en-tête `CONTRAT DE RÉPONSE` (`:111-114`) affirmait aussi que `photoUrl` pouvait être « l'URL http(s) héritée telle quelle ». Laisser cette ligne aurait été une **affirmation fausse** de la classe même que la phase existe pour fermer (AGENTS.md §2.7 I : une limite périmée dissuade et coûte plus cher qu'une limite absente).
- **Fix :** le contrat de réponse dit désormais que `photoUrl` provient d'un chemin **déjà borné** par le RPC (`0128`) et que la forme héritée rend `null`.
- **Files modified :** `supabase/functions/gift-list-invite/index.ts`
- **Verification :** `grep -n "http(s)\|héritée" supabase/functions/gift-list-invite/index.ts` ne rend plus d'affirmation de relais ; `npm run typecheck` vert.
- **Committed in :** `23c4fb9` (Task 3)

**Total deviations :** 1 auto-fixé (Rule 2).
**Écart sanctionné par le plan (pas une déviation) :** `app/src/modules/cadeaux/guest-cadeau-page.tsx` est hors de la liste de fichiers du SPEC mais DANS le `files_modified` du plan ; le plan le motive explicitement par AGENTS.md §2.7 I (commentaire seulement, aucun changement de comportement).
**Impact on plan :** aucun élargissement de périmètre. Le seul écart non planifié est documentaire et ferme une affirmation fausse.

## Issues Encountered

- **`gsd_run` est absent de cet hôte** (`command -v gsd_run` → rien). Trois conséquences, toutes déclarées plutôt que passées sous silence :
  1. `gsd_run check tdd-red-evidence` n'a pas pu être exécuté. La preuve RED est **observée** : `npx vitest run ../supabase/functions/ardoise-invite/guest-media.test.ts` a rendu `Tests 4 failed | 7 passed (11)`, les quatre échecs nommant exactement les quatre refus (`AssertionError: expected … to be null`) — ni découverte nulle, ni plantage de chargement, ni vert inattendu. La suite a été rejouée à l'identique pour persister la sortie.
  2. `git.base-branch --is-protected` n'a pas pu être interrogé ; `.planning/config.json` porte `git.allow_default_branch_commits: true` et les tâches ont été committées sur `main`, comme les phases précédentes (`22-02` = `d36359c`).
  3. `gsd_run windows append` n'a pas pu être appelé : `WINDOWS.md` n'a reçu aucune entrée. Le résidu D-05 est une **décision assumée**, non un défaut ouvert — l'inscrire `open` bloquerait `/gsd-ship` pour un état délibérément accepté.
- **Registre de plan écrit à la main** : `<git-dir>/gsd-plan-head-before-23-01` = `d36359c…`, ce qui rend `commits:` **mesuré** (`git rev-list --count`) et non narré.

## Limites déclarées (AGENTS.md §2.7 I)

- **Le comportement des Edge DÉPLOYÉES n'est exercé par aucune chaîne automatique** : `deno` est absent et aucun test du dépôt n'importe un `index.ts` d'Edge. Ce qui est prouvé automatiquement est le **verdict** — le RPC par `test-db.sh`, le prédicat et la résolution de l'ardoise par Vitest sur le module pur. Le **câblage** dans `ardoise-invite/index.ts` (sélection de `household_id`, garde `typeof`, transmission) est vérifié **par lecture**, pas par exécution.
- **Asymétrie D-05, résidu cosmétique et non protection** : trois signeurs subsistent (`gift-list-invite/index.ts:871`, `ardoise-invite/guest-media.ts:56,101`, `recipe-invite/guest-steps.ts:41,70`). Un seul — `guest-steps.ts:65` — porte encore un relais `http(s)` désormais **inatteignable** (`0127` n'émet plus la forme). `guest-steps.ts` n'est pas modifié et n'apparaît pas dans `git diff --name-only`.
- **La normalisation d'un `..` par Storage n'est pas observable sur cet hôte** et n'est pas supposée : le verdict tombe avant la signature, comme `0127`.

## Vérification (chaîne complète, ordre AGENTS.md §2.7)

| # | Commande | Résultat observé |
|---|----------|------------------|
| 1 | `cd app && npm run typecheck && npm test && npm run build` | typecheck vert · **1275 passés / 149 fichiers, 0 échec** · build vert (`PWA 100 entrées précachées`) |
| 2 | `python3 scripts/check-sql-statique.py` | **aucun défaut** (181 fonctions, 128 migrations, 67 tests) |
| 3 | `sh scripts/test-db.sh` | **65 fichier(s), tous verts** (64 + `0128`) |
| 4 | `cd app && npm run test:e2e` | **123 passés, 5 skipped, 0 échec** (2.1 min) |

Contrôles de forme (les deux sens exercés) :
- `sh scripts/migrate.sh` applique `0128` avant `test-db.sh 0128` ; `git diff --name-only d36359c..HEAD` cite **11** fichiers et **aucune** migration appliquée (`0092`, `0122` intactes) ; `grep -n 'add constraint' supabase/migrations/0128_guest_media_household.sql` est vide.
- `grep -c 'i\.test'` rend **0** dans `gift-list-invite/index.ts` **et** dans `ardoise-invite/index.ts`.
- `grep -rn createSignedUrl supabase/functions/ | grep -v '\.test\.ts'` rend **cinq** lignes : `gift-list-invite/index.ts:871` (1), `recipe-invite/guest-steps.ts:41,70` (2), `ardoise-invite/guest-media.ts:56,101` (2) — et **aucune** dans `ardoise-invite/index.ts`. Soit **trois surfaces signataires**. Le grep non filtré en ajoute quatre (doubles de test), qui ne sont pas des sites de signature.
- `grep -vE '^[[:space:]]*(\*|/\*|//)' …/guest-media.ts | grep -nE 'from .(npm:|jsr:|https?:)|Deno\.'` est **vide**, tandis que le même filtre sur l'analogue `guest-steps.ts` apparie `:65` — le motif a donc été exercé dans les deux directions.
- `grep -nE 'https\?:.*test\(value\)' supabase/functions/ardoise-invite/guest-media.ts` est vide ; sur `guest-steps.ts` il apparie `:65`.
- Rouge→vert prouvé : en réappliquant la définition de `0092` dans une transaction de travail, `test-db.sh 0128` rougit sur « un photo_url d'un autre foyer ne sort pas du RPC » ; la base migrée est verte.
- Aucune directive de linter introduite (`app/src/lib/no-eslint-directive.test.ts` reste vert dans les 1275).

## Next Phase Readiness

- Le résidu **R3** de `21-SECURITY.md` est fermé pour les deux surfaces invitées ; il ne reste que le résidu cosmétique `guest-steps.ts:65` (D-05).
- Le motif `0128` (verdict de lecture borné dans le RPC, foyer jamais rendu) et le module `guest-media.ts` sont réutilisables pour toute nouvelle surface invitée — la classe de défaut est désormais outillée des deux côtés (SQL et pendant pur testable).
- Aucun blocage. À la charge de l'orchestrateur : avancement de `STATE.md` et de `ROADMAP.md`.

---
*Phase: 23-signature-media-invitee-bornee-au-foyer*
*Completed: 2026-10-17*

## Self-Check: PASSED

Fichiers créés : les 5 présents (`0128` migration et test, `guest-media.ts` et
son test, ce SUMMARY). Commits : les 4 présents (`e844552`, `3f6f7d3`,
`b5c5b1b`, `23c4fb9`). Arbre de travail propre après les commits ; `.planning/`
gitignoré, aucune écriture forcée.
