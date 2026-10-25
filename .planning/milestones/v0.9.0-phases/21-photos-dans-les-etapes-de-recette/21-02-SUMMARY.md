---
phase: 21-photos-dans-les-etapes-de-recette
plan: 02
subsystem: recettes / Edge function invitée / média signé
tags: [supabase, edge-functions, storage, signed-url, ttl, vitest, fail-closed]

# Dependency graph
requires:
  - phase: 21-photos-dans-les-etapes-de-recette
    provides: "21-01 — colonne `recipe_steps.photo_path` et `view_recipe_share` recréée rendant la clé `photo_path` brute par étape (contrat de données consommé ici)"
  - phase: 16-recettes
    provides: "Edge `recipe-invite` (action `link-view`), motif de signature invité `resolveGuestCoverUrl` et bucket privé `household-media`"
  - phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr
    provides: "Doctrine « chemin de bucket en colonne, URL signée à la lecture, échec fermé » (D-01) et extraction d'un module PUR hors d'un `index.ts` d'Edge pour le rendre testable par Vitest (19-14, `child-guard.ts`)"
provides:
  - "supabase/functions/recipe-invite/guest-steps.ts — module PUR (aucun import Deno ni `npm:`) : HOUSEHOLD_MEDIA_BUCKET, GUEST_PHOTO_TTL_SECONDS, asTextOrNull, GuestMediaSigner (type structurel), resolveGuestMediaUrl, toGuestSteps"
  - "Un seul point de signature et un seul TTL pour la surface invitée : couverture (`coverPhotoUrl`) et photo d'étape (`steps[].photoUrl`) passent littéralement par `resolveGuestMediaUrl`"
  - "index.ts : importe `./guest-steps.ts`, supprime ses doublons locaux (resolveGuestCoverUrl, asTextOrNull, les deux constantes) et signe chaque étape via `toGuestSteps(admin, view.steps)`"
  - "Le chemin brut de bucket `photo_path` ne quitte jamais l'Edge : la valeur signée le REMPLACE (clé `photoUrl`), jamais ne l'accompagne (T-21-02)"
affects: [21-03, 21-04]

# Actuals (#2632) — pair with the plan's `estimate` (17k tokens / 2 tasks) to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff = `git diff <base>..HEAD | wc -c` / 4), never a harness token count.
actuals:
  tokens: 4735
  tasks: 2
  commits: 2
  plan_head_before: d325a03b1f9d7c425e89420d979b81dcd60b64fc
  plan_head_after: d167e58f0edaeaff9c824bb70f955196edb20bf3

tech-stack:
  added: []
  patterns:
    - "Un `index.ts` d'Edge n'est exécutable par AUCUNE chaîne du dépôt (deno absent, imports Deno/`npm:`) : la logique testable est extraite dans un module PUR voisin (`guest-steps.ts`), même doctrine que `child-guard.ts`"
    - "Le signeur est un type STRUCTUREL (`GuestMediaSigner`) décrivant seulement ce qui est consommé, jamais `SupabaseClient` — c'est ce qui garde le module libre de `npm:@supabase/supabase-js@2` et donc exécutable par Vitest"
    - "Un seul endroit signe, un seul endroit décide du TTL : la constante `GUEST_PHOTO_TTL_SECONDS` n'existe qu'une fois, donc le TTL invité ne peut pas diverger d'une surface à l'autre (D-16)"
    - "Échec fermé sans journal : toute valeur absente, forme inconnue, erreur de signature ou exception rend `null` — aucun chemin ni URL ne fuit dans les logs (T-21-02)"

key-files:
  created:
    - supabase/functions/recipe-invite/guest-steps.ts
    - supabase/functions/recipe-invite/guest-steps.test.ts
  modified:
    - supabase/functions/recipe-invite/index.ts

key-decisions:
  - "Le module PUR porte le signeur, le TTL et la projection : `index.ts` n'en garde plus qu'une copie d'import. La couverture et chaque étape partagent donc littéralement le même signeur, ce qui interdit au TTL invité de diverger (D-16)"
  - "`toGuestSteps` devient asynchrone (`Promise.all`) : la signature est asynchrone, la projection l'est aussi — un échec sur une étape rend `null` pour celle-là seulement, jamais une exception globale (arête empty de R4)"
  - "Le chemin brut est consommé, jamais recopié : la clé rendue est `photoUrl` (signée ou `null`), `photo_path` n'apparaît sous aucune clé de la projection (T-21-02)"
  - "Aucune dépendance ajoutée : le module reste pur, le signeur est structurel et `createSignedUrl` était déjà en place (T-21-SC non déclenché)"
  - "Le contrat de réponse de `index.ts` (en-tête `link-view`) nomme `steps[].photoUrl` à côté de `coverPhotoUrl` et écrit la même doctrine — URL éphémère d'une heure, jamais persistée, chemin brut jamais transmis"

patterns-established:
  - "Une logique d'Edge que Vitest doit exercer s'extrait en module PUR voisin, testé par la suite du dépôt ; le comportement de l'Edge DÉPLOYÉE reste une vérification manuelle assumée (VALIDATION.md « Manual-Only »)"
  - "Un contrôle se prouve sur un cas qui doit échouer : le signeur factice rend une URL qui NE CONTIENT PAS le chemin d'entrée, donc un signeur qui rendrait le chemin tel quel fait réellement tomber l'assertion (prouvé par mutation, voir ci-dessous)"

requirements-completed: [R4]  # Copié verbatim de `requirements:` du PLAN. R4 est AUSSI déclaré par 21-03 (non exécuté) : la porte des identifiants partagés interdit de le marquer « Complete » tant que 21-03 n'a pas son SUMMARY. Aucun REQUIREMENTS.md dans ce dépôt, donc aucune case à cocher.

# Coverage metadata (#1602) — drives DETERMINISTIC UAT routing in verify-work.
coverage:
  - id: D1
    description: "La charge `link-view` porte `steps[].photoUrl` — une URL signée d'une heure forgée par requête, ou `null` ; le bucket et le TTL ne sont déclarés qu'une fois, dans le module pur importé par `index.ts`."
    requirement: "R4"
    verification:
      - kind: unit
        ref: "supabase/functions/recipe-invite/guest-steps.test.ts#resolveGuestMediaUrl (R4, D-16) + #toGuestSteps (R4, D-15)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Le chemin brut de bucket ne sort jamais : la projection ne recopie pas `photo_path`, sa sérialisation JSON ne contient aucune sous-chaîne du chemin d'entrée, un échec de signature est local (`null`) et le TTL passé au signeur est exactement la constante exportée."
    requirement: "R4"
    verification:
      - kind: unit
        ref: "supabase/functions/recipe-invite/guest-steps.test.ts#Contrat de réponse : le chemin brut ne sort jamais (T-21-02, R4)"
        status: pass
    human_judgment: false
  - id: D3
    description: "La signature servie par l'Edge DÉPLOYÉE : ouvrir `/invitation/recette?code=…`, l'image d'étape s'affiche et le HTML ne contient aucun chemin de bucket."
    requirement: "R4"
    verification: []
    human_judgment: true
    rationale: "`deno` est absent et aucun test du dépôt n'importe un `index.ts` d'Edge (imports Deno/`npm:`) : le comportement d'exécution de l'Edge déployée n'est exercé par aucune chaîne. Vérification manuelle déclarée (VALIDATION.md « Manual-Only »)."

duration: ~30min
completed: 2026-10-16
status: complete
---

# Phase 21 Plan 02: La photo d'étape signée par l'Edge invitée — un seul signeur, un seul TTL, aucun chemin brut

**L'Edge `recipe-invite` transforme le `photo_path` brut rendu par le RPC en URL signée d'une heure (ou `null` en échec fermé), via un module PUR extrait `guest-steps.ts` qui porte le signeur, le TTL et la projection — donc exerçable par la suite Vitest, et un chemin de bucket qui ne quitte jamais la fonction.**

## Performance

- **Duration:** ~30 min (15:34 → 16:04 +02:00 ; le gros du plan — les deux tâches — a été committé en 3 min par une exécution antérieure interrompue avant le SUMMARY ; cette exécution est la clôture : vérification, preuve par mutation, SUMMARY, état)
- **Started:** 2026-10-16T13:34:25Z
- **Completed:** 2026-10-16T14:04:00Z
- **Tasks:** 2
- **Files modified:** 3 (2 créés, 1 modifié)

## Accomplishments

- **Module PUR `guest-steps.ts`** : `HOUSEHOLD_MEDIA_BUCKET`, `GUEST_PHOTO_TTL_SECONDS = 3600`, `asTextOrNull`, le type structurel `GuestMediaSigner` (jamais `SupabaseClient`), `resolveGuestMediaUrl` (jumelle exacte de l'ancien `resolveGuestCoverUrl`) et `toGuestSteps` (projection asynchrone par `Promise.all`). Aucun import Deno ni `npm:` — même doctrine que `child-guard.ts`, donc exécutable par Vitest.
- **Un seul point de signature** : `index.ts` importe `./guest-steps.ts` et **supprime** ses doublons locaux (`HOUSEHOLD_MEDIA_BUCKET`, `GUEST_PHOTO_TTL_SECONDS`, `asTextOrNull`, `resolveGuestCoverUrl`). La couverture (`coverPhotoUrl`) et chaque étape (`steps[].photoUrl`) passent désormais littéralement par `resolveGuestMediaUrl(admin, …)` — le TTL invité ne peut plus diverger (D-16).
- **Chemin brut jamais transmis** : le type local de `view.steps` gagne `photo_path?: unknown`, le `steps.map` synchrone devient `toGuestSteps(admin, view.steps)`, et la clé rendue est `photoUrl` (signée ou `null`). `photo_path` n'apparaît sous aucune clé de la projection (T-21-02).
- **Contrat de réponse documenté** : l'en-tête `link-view` de `index.ts` nomme `steps[].photoUrl` à côté de `coverPhotoUrl` et écrit la doctrine (URL éphémère d'une heure, jamais persistée, chemin brut jamais transmis, la ligne de texte reste la référence si l'image ne charge pas).
- **12 preuves vertes** (`guest-steps.test.ts`) : bucket + TTL uniques vérifiés (pas supposés), forme `http(s)://` rendue telle quelle sans appel au signeur, `null`/`''`/`'   '`/non-`string` rendent `null` sans appel, échec fermé (`error` et exception), projection d'étape normalisée, et les quatre cas du contrat de réponse (chemin brut absent de la projection ET de sa sérialisation, échec local, TTL lu depuis la constante exportée).

## Task Commits

Chaque tâche a été committée atomiquement (par l'exécution antérieure ; cette exécution les a vérifiées et a produit la clôture) :

1. **Task 1 : `guest-steps.ts` — extraire le signeur, signer l'étape de bout en bout** (tracer) - `a670e19` (feat)
2. **Task 2 : Le contrat de réponse, et la preuve que le chemin brut ne sort jamais** - `d167e58` (test)

**Plan metadata:** `skipped_gitignored` — `.planning/` est gitignoré (`.gitignore:74`), aucun commit de métadonnées n'est possible ni souhaité (jamais de `git add -f`).

_Note : le plan nomme la Task 2 `tdd="true"`. La séparation RED/GREEN n'était pas possible ici — la Task 1 (tracer) implémente déjà le module ET ses preuves `(a)–(e)`, donc les quatre preuves de contrat de la Task 2 s'exercent sur un comportement déjà présent. Elles ont été committées comme preuves (`test`), vertes, et leur capacité à échouer est **prouvée par mutation** (voir « Issues Encountered »)._

## Files Created/Modified

- `supabase/functions/recipe-invite/guest-steps.ts` — module PUR : bucket, TTL, `asTextOrNull`, `GuestMediaSigner`, `resolveGuestMediaUrl`, `toGuestSteps` (créé)
- `supabase/functions/recipe-invite/guest-steps.test.ts` — 12 preuves : signature, TTL, forme http, échec fermé, projection, contrat « le chemin brut ne sort jamais » (créé)
- `supabase/functions/recipe-invite/index.ts` — importe `./guest-steps.ts`, supprime les doublons locaux, route couverture et étapes sur le même signeur, documente `steps[].photoUrl` (modifié)

## Decisions Made

Toutes les décisions D-15 et D-16 du plan ont été appliquées à la lettre (voir `key-decisions` en frontmatter). Deux points méritent d'être notés :

- **Le module est PUR par nécessité, pas par goût** : `index.ts` porte des imports Deno/`npm:` (`@supabase/server`, `npm:@supabase/supabase-js@2`, `npm:zod@4.6.5`) et n'est exécutable par aucune chaîne du dépôt. Extraire le signeur dans un module voisin sans import Deno/`npm:` est la seule façon de l'exercer par Vitest — exactement la doctrine de `child-guard.ts`.
- **Le type du signeur est structurel** : décrire `storage.from(bucket).createSignedUrl(path, expiresIn)` au lieu de `SupabaseClient` évite la dépendance à `npm:@supabase/supabase-js@2`, qui ferait retomber le module dans l'inexerçable. Le client privilégié de l'Edge le satisfait par structure.

## Deviations from Plan

### Auto-fixed Issues

Aucune déviation de code : le plan a été exécuté à la lettre.

### Écarts de chaîne (non-déviations de code)

- **`gsd_run` / `gsd-tools` absents de cet hôte** : les verbes `state.advance-plan`, `state.record-metric`, `roadmap.update-plan-progress`, `commit` et `windows.append` ne sont pas disponibles. STATE.md et ROADMAP.md sont mis à jour **manuellement** ; le commit de métadonnées est de toute façon `skipped_gitignored` (`.planning/` est gitignoré).
- **Task 2 `tdd="true"` sans RED séparé** : la Task 1 (tracer) implémente déjà le comportement et ses preuves, donc les quatre preuves de contrat de la Task 2 ne peuvent pas échouer d'abord. Elles ont été committées vertes (`test`) et leur pouvoir de refus est prouvé par mutation (voir ci-dessous).

---

**Total deviations:** 0 auto-fixed (0 code) + 2 écarts de chaîne documentés
**Impact on plan:** Aucun écart de périmètre. Le code livré suit le plan à la lettre.

## Issues Encountered

- **Exécution antérieure interrompue avant le SUMMARY** : les deux tâches de ce plan ont été trouvées **déjà committées** (`a670e19`, `d167e58`) au démarrage de cette exécution, sans SUMMARY — l'état « production committée, SUMMARY absent » que la porte de clôture atomique interdit. Cette exécution a donc **vérifié** l'état livré (aucune réécriture), puis produit le SUMMARY et l'état. Aucune tâche n'a été refaite.
- **Preuve par mutation du contrat « le chemin brut ne sort jamais » (§2.7 B)** : pour établir que les assertions de la Task 2 peuvent réellement échouer, `resolveGuestMediaUrl` a été temporairement modifié pour rendre `value` (le chemin brut) au lieu de `data.signedUrl`. Le fichier a été exécuté **rouge : 5 échecs / 7 passés**, dont `expected 'foyer-1/recipes/r-1/steps/s-2/file.jpg' to be 'https://signe.example/step-a7f3'`. Le fichier a été restauré (`git checkout -- guest-steps.ts`), `git diff` vide, puis **12/12 verts** de nouveau. Le contrôle se prouve donc sur le cas qu'il doit refuser.

## Known Stubs

- `app/src/modules/recettes/guest-recipe-page.tsx` (`photoPath: null` dans la projection invitée) — **stub intentionnel déclaré en 21-01** : la surface invitée cliente ne consomme pas encore la charge signée ; elle est livrée par **21-03**. Non modifié par ce plan (l'Edge est prêt, le client ne l'est pas encore). Déjà enregistré dans `.planning/WINDOWS.md` (`kind: stub`, phase 21).

## User Setup Required

None - no external service configuration required. (Aucune dépendance ajoutée ; la signature passe par `createSignedUrl` déjà en place. `RECIPE_INVITE_HMAC_SECRET` est inchangé et reste provisionné hors dépôt.)

## Next Phase Readiness

- **21-03** (surface invitée cliente) peut consommer `steps[].photoUrl` : la charge signée est posée, échec fermé prouvé ; il reste à remplacer le `photoPath: null` de `guest-recipe-page.tsx` par la carte d'URLs et à aligner les fixtures.
- **21-04** (mode cuisine + impression) est indépendant de ce plan (chemins client) — aucun couplage.
- Aucun bloqueur. La vérification manuelle différée (Edge déployée, image affichée, aucun chemin de bucket dans le HTML) reste ouverte et déclarée (VALIDATION.md « Manual-Only »).

---

## Verification Chain (plan-level)

- `cd app && npx vitest run ../supabase/functions/recipe-invite/guest-steps.test.ts` — **vert** (12/12).
- `cd app && npm run typecheck` — **vert** (`tsc --noEmit`, aucune sortie).
- `grep -rho 'const HOUSEHOLD_MEDIA_BUCKET' supabase/functions/recipe-invite | wc -l` = **1** ; idem `const GUEST_PHOTO_TTL_SECONDS` = **1**.
- `grep -c "from './guest-steps.ts'" supabase/functions/recipe-invite/index.ts` = **1**.
- `cd app && npm test` — **vert** (1235/1235 sur 145 fichiers ; +12 tests / +1 fichier vs 21-01).
- `cd app && npm run build` — **vert** (PWA `injectManifest`, 100 entrées précachées).
- `python3 scripts/check-sql-statique.py` — **vert** (181 fonctions effectives, 0 défaut ; aucun SQL touché par ce plan).
- Aucune directive de linter introduite (`grep -rn eslint-disable supabase/functions/recipe-invite/` vide) et **aucune suppression de fichier** (`git diff --diff-filter=D d325a03..HEAD` vide).
- **Mutation** : chemin brut rendu au lieu de l'URL signée → 5 échecs (contrat prouvé capable d'échouer), puis restauré → 12/12 verts.
- Vérification manuelle différée (VALIDATION.md, « Manual-Only ») : après déploiement, ouvrir `/invitation/recette?code=…` et confirmer que l'image d'étape s'affiche et que le HTML ne contient aucun chemin de bucket.

---

*Phase: 21-photos-dans-les-etapes-de-recette*
*Completed: 2026-10-16*

---

## Self-Check: PASSED

- Fichiers créés vérifiés présents : `supabase/functions/recipe-invite/guest-steps.ts`, `supabase/functions/recipe-invite/guest-steps.test.ts`, `21-02-SUMMARY.md`.
- Fichier modifié vérifié présent : `supabase/functions/recipe-invite/index.ts`.
- Commits vérifiés présents : `a670e19` (feat), `d167e58` (test).
- `commits` mesuré par ledger (`git rev-list --count d325a03..HEAD` = 2), `plan_head_before`/`plan_head_after` écrits.
- Commit de métadonnées : `skipped_gitignored` (`.planning/` est dans `.gitignore:74`) — chemin de succès intentionnel, aucun `git add -f`.
