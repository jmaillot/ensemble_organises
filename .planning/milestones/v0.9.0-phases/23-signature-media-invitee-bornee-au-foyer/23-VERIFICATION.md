---
phase: 23-signature-media-invitee-bornee-au-foyer
verified: 2026-10-17T08:14:54Z
status: passed
verdict: passed_with_notes
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
covered_files:
  - .planning/phases/23-signature-media-invitee-bornee-au-foyer/23-01-PLAN.md
  - .planning/phases/23-signature-media-invitee-bornee-au-foyer/23-01-SUMMARY.md
  - app/src/modules/ardoise/api.test.ts
  - app/src/modules/cadeaux/api.test.ts
  - app/src/modules/cadeaux/guest-cadeau-page.test.tsx
  - app/src/modules/cadeaux/guest-cadeau-page.tsx
  - supabase/functions/ardoise-invite/guest-media.test.ts
  - supabase/functions/ardoise-invite/guest-media.ts
  - supabase/functions/ardoise-invite/index.ts
  - supabase/functions/gift-list-invite/index.ts
  - supabase/migrations/0128_guest_media_household.sql
  - supabase/tests/0032_guest_view_details.sql
  - supabase/tests/0128_guest_media_household.sql
covered_digest: "v2:sha256:99696edbf4ee220f4d2af699c8d1a8f157c8984d1843fa83ed42241f9cc68405"
notes:
  - "AC 3 du SPEC, lu mot à mot (« aucune occurrence de la chaîne du foyer »), n'est pas satisfait littéralement : un chemin légitime borné COMMENCE par l'identifiant du foyer (c'est l'objet rendu). L'assertion livrée porte donc sur l'égalité STRICTE d'une valeur entière plus l'absence de clé — l'interprétation que la phase revendique (R1 = « le foyer n'est dans AUCUNE clé »). Contradiction interne du SPEC (AC 1 rend le chemin, AC 3 interdirait toute occurrence), résolue et écrite dans le test, jamais passée sous silence."
  - "Le test « signe la CHAÎNE EXACTE … sans normalisation » n'attrape pas une normalisation des barres obliques : sa valeur sonde n'en contient ni en tête ni doublée. Aucune divergence observable n'existe (le verdict exige le préfixe `<foyer>/` et refuse tout `..`), donc l'assertion est suffisante pour le contrat, mais son nom promet plus que ce qu'elle détecte."
  - "Le comportement des Edge DÉPLOYÉES n'est exercé par aucune chaîne de cet hôte (deno absent, aucun test n'importe un index.ts, l'e2e tourne en démo). Le CÂBLAGE a été vérifié par LECTURE (sélection de household_id, garde typeof, transmission, clé de réponse) — c'est une limite de méthode déclarée, pas une preuve d'exécution."
---

# Phase 23 : Signature média invitée bornée au foyer (R3) — Verification Report

**Phase Goal (ROADMAP.md:285-288) :** Aucune référence média rendue à un visiteur invité par `gift-list-invite` ou `ardoise-invite` ne peut désigner un objet d'un autre foyer : la valeur sort `null` dès qu'elle n'est pas un chemin borné au foyer de la ressource, et la forme `http(s)` n'est plus relayée du tout.
**Verified:** 2026-10-17T08:14:54Z
**Status:** `passed` — **verdict : `passed_with_notes`** (3 notes, 3 limites déclarées, 0 blocage)
**Re-verification:** Non — vérification initiale (aucune `*-VERIFICATION.md` antérieure dans le répertoire de phase).

**Méthode.** Chaque exigence est jugée sur l'ÉTAT COURANT de l'arbre (`23c4fb9`, base `d36359c` — HEAD réaccentué le 2026-10-17 avant publication, arbres identiques, voir `23-01-SUMMARY.md`). La définition EFFECTIVE du RPC est lue en base via `pg_get_functiondef`, jamais dans le texte de migration seul. Chaque assertion livrée a été **falsifiée** sur un cas qui doit échouer (AGENTS.md §2.7 B), puis la base a été laissée intacte (transaction de travail annulée — la définition effective est re-vérifiée bornée après expérience).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | **R1** — `guest_view_gift_list` ne rend `photo_url` que borné au foyer de la LISTE (`<foyerA>/…` traverse ; `<foyerB>/…`, `<foyerA>/../<foyerB>/x.webp`, `https://…` → `null`) et ne rend le foyer dans **aucune** clé. | ✓ VERIFIED | Définition effective : `case when i.photo_url is null then null when starts_with(i.photo_url, v_list_household \|\| '/') and strpos(i.photo_url, '..') = 0 then i.photo_url else null end` ; `return jsonb_build_object('list_id',…,'list_name',…,'items',…)` — trois clés, aucune de foyer. `sh scripts/test-db.sh 0128` vert. Falsifié : retirer le `case` rougit l'assertion « autre foyer » (sortie verbatim ci-dessous). Le préfixe de foyer est celui des chemins RÉELS : `app/src/lib/storage.ts:140` forge `${householdId}/${folder}/…`, photo cadeau `folder: 'cadeaux'` (`cadeaux-page.tsx:195`). |
| 2 | **R2** — La couverture invitée de l'ardoise n'est signée que si le chemin est borné au foyer ; le signeur **n'est pas appelé** sur un refus ; `buildGuestView` lit `household_id` et le transmet. | ✓ VERIFIED | `guest-media.ts:75-77` (`startsWith(foyer + '/') && !includes('..')`), `:95-97` (verdict AVANT le signeur), `:98-106` (échec fermé). `index.ts:635` sélectionne `household_id`, `:644-645` le garde par `typeof`, `:716-718` le transmet ; les deux appelants (`:601` ticket, `:754` link-view) héritent. Falsifié : prédicat neutralisé → 4 rouges ; signeur appelé sur refus → les assertions `calls` rougissent. |
| 3 | **R3** — La forme `http(s)` n'est plus relayée sur les deux surfaces invitées. | ✓ VERIFIED | `grep -nE 'https\?:.*test\(value\)'` = 0 sur `gift-list-invite/index.ts`, `ardoise-invite/index.ts` **et** `guest-media.ts` ; la ligne de relais retirée est visible au diff (`-  if (/^https?:\/\//i.test(value)) return value;`). Contre-épreuve positive : le même grep appariait `recipe-invite/guest-steps.ts:65` (intact, D-05). Falsifié : relais réintroduit dans une copie du module → l'assertion `http(s)` rougit avec `expected 'https://externe.example/photo.jpg' to be null`. |
| 4 | **R4** — Le verdict est prouvable automatiquement sur cet hôte : `sh scripts/test-db.sh 0128` vert **et** le fichier Vitest découvert. | ✓ VERIFIED | `test-db.sh 0128` : `1 fichier(s), tous verts` ; `npx vitest list` énumère les 11 tests de `guest-media.test.ts` ; suite complète `149 fichiers / 1275 tests, 0 échec`. **Les assertions tombent réellement** : 6 variantes SQL et 4 variantes Vitest ont rougi, chacune pour la bonne raison (voir Falsification). |
| 5 | **R3/AC** — Les assertions livrées ne passent pas « quoi qu'il arrive » (test qui ne peut pas échouer = trouvaille). | ✓ VERIFIED | Aucune assertion vacueuse détectée. Les deux greps du `<done>` d'origine (motifs impossibles) ont été corrigés en `grep -c 'i\.test'` et `grep -nE 'https\?:.*test\(value\)'`, tous deux exercés dans les DEUX sens (0 sur les surfaces fermées, appariement sur l'analogue `guest-steps.ts:65`). Le filtre « pas de Deno/npm » n'est pas aveugle : contrôle positif sur `index.ts` → `npm:@supabase/supabase-js@2`, `npm:zod@4.6.5`, `Deno.env.get`, `Deno.serve`. |

**Score:** 5/5 truths verified · `behavior_unverified` : 0

### Declared limits (verified as documented, not as executed)

| # | Limit | Evidence |
|---|-------|----------|
| L1 | **Le comportement des Edge DÉPLOYÉES n'est exercé par aucune chaîne ici.** `deno` est absent (`command -v deno` → rien) ; aucun test n'importe un `index.ts` d'Edge (le seul test qui lit `ardoise-invite/index.ts` le lit comme TEXTE : `app/src/lib/guest-media-contract.test.ts`) ; l'e2e tourne en mode démo, sans serveur. | `npx vitest list \| grep supabase/functions` ne liste que des modules PURS (`child-guard`, `web-push`, `guest-media`, `guest-steps`, `helpers`). Le SUMMARY (`D4`, `human_judgment: true`) et l'en-tête de `guest-media-contract.test.ts:18-37` déclarent la même limite. |
| L2 | Le **câblage** dans `index.ts` est prouvé par LECTURE, pas par exécution : sélection de `household_id` (`:635`), garde `typeof` (`:644-645`), transmission au résolveur (`:716-718`), charge sans clé de foyer (`:720-731`). | Lu intégralement ; cohérent. Un relecteur qui exige une preuve EXÉCUTÉE du déploiement doit traiter ce point comme un jugement humain (le SUMMARY le fait déjà). |
| L3 | `gsd_run` est absent (`command -v gsd_run` → rien), donc `check tdd-red-evidence` n'a pas pu être exécuté par son habillage habituel. `covered_digest` a en revanche été produit, par l'outil sous-jacent appelé directement : `node ~/.config/opencode/gsd-core/bin/gsd-tools.cjs query verification.fingerprint <phase_dir> <les 13 fichiers déclarés dans covered_files>` → `v2:sha256:99696edb…`, reporté dans l'en-tête et recalculé à l'identique le 2026-10-17. Les preuves RED ont été **observées** indépendamment par ce vérificateur (10 variantes). |

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `supabase/migrations/0128_guest_media_household.sql` | Recrée le RPC avec le `case` borné + privilèges ré-émis | ✓ VERIFIED | 166 l. ; `create or replace` seul ; aucun `alter table` ni `add constraint` ; `revoke/grant` + `do $$` de preuve ré-émis ; appliquée (`schema_migrations`), définitions effective vérifiée. |
| `supabase/tests/0128_guest_media_household.sql` | Positif + 3 refus + 3 facettes AC 3 + refus de privilège | ✓ VERIFIED | 155 l., `begin…rollback`, 7 assertions + 1 `expect_denied` ; bornées par `id` ou par `testkit.fx` ; `testkit.count` via sous-requêtes (pas de variable plpgsql — §2.7 D.5). |
| `supabase/functions/ardoise-invite/guest-media.ts` | Module PUR : prédicat + résolution en échec fermé | ✓ VERIFIED | 107 l. ; aucun import Deno/`npm:` (filtre vidé, contrôle positif sur `index.ts`) ; `GuestMediaSigner` structurel (jamais `SupabaseClient`). |
| `supabase/functions/ardoise-invite/guest-media.test.ts` | Vitest : positif + 3 refus + `calls` vide | ✓ VERIFIED | 180 l., 11 tests ; double de signeur enregistrant `(bucket, path, expiresIn)` et rendant une URL opaque (ne contient pas le chemin). Découvert par `app/vite.config.ts:71`. |
| `supabase/functions/ardoise-invite/index.ts` | `household_id` lu + transmis ; doublons supprimés | ✓ VERIFIED | Import `./guest-media.ts:57` ; aucun doublon local de `HOUSEHOLD_MEDIA_BUCKET`/`GUEST_PHOTO_TTL_SECONDS`/`asTextOrNull`/`resolveGuestCoverUrl` restant. |
| `supabase/tests/0032_guest_view_details.sql` | Aligné sans tautologie | ✓ VERIFIED | `gitem32_a` semé `home_a \|\| '/cadeaux/puzzle32-aaaa.jpg'` et asserté depuis `testkit.fx` (`key='alice'`, dont `household_id` = `home_a`) — jamais un littéral recopié ; `gitem32_c` (`https://…`) asserté `null`. |
| `supabase/functions/gift-list-invite/index.ts` | Relais retiré, commentaires vrais | ✓ VERIFIED | Diff = suppression de la seule ligne de relais + réécriture des commentaires (« CONTRAT DE RÉPONSE » compris). Aucun autre changement. |
| `app/src/modules/{cadeaux,ardoise}/*.test.*`, `guest-cadeau-page.tsx` | Assertions alignées sur la charge réellement servie | ✓ VERIFIED | Doublure cadeaux = URL signée ; `ardoise/api.test.ts` nomme la surface PROPRIÉTAIRE ; `guest-cadeau-page.tsx` = commentaire seul (diff vérifié). |
| `supabase/functions/recipe-invite/guest-steps.ts` | Intact (D-05) | ✓ VERIFIED | Hors de `git diff d36359c..HEAD --name-only` ; relais `:65` toujours présent ; asymétrie consignée en `guest-media.ts:26-31`. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `0128` (RPC) | `gift-list-invite/index.ts:902` | `admin.rpc('guest_view_gift_list', {p_token_hash})` → `resolveGuestPhotoUrl(item.photo_url)` | ✓ WIRED | Seul chemin par lequel l'Edge obtient une valeur à signer ; la valeur reçue est déjà bornée. |
| `ardoise-invite/index.ts` `buildGuestView` | `guest-media.ts` | `resolveGuestCoverUrl(admin, cover_url, householdId)` (`:716-718`) | ✓ WIRED | `household_id` sélectionné sur la MÊME ligne (`:635`), gardé `typeof` (`:645`), transmis ; les 2 appelants (`:601`, `:754`) en héritent sans changement de signature. |
| `app/vite.config.ts:71` | `guest-media.test.ts` | `include: ['src/**/*.test.{ts,tsx}', '../supabase/functions/**/*.test.ts']` | ✓ WIRED | `npx vitest list` énumère les 11 tests ; aucun enregistrement manuel. |
| `ardoises.cover_url` (colonne) | charge invitée `coverUrl` | `<foyerId>/ardoises/<file>` → signé | ✓ WIRED | Dépôt réel `folder: 'ardoises'` (`ardoise-page.tsx:145`, `ardoise-detail-page.tsx:532`) → le préfixe correspond au foyer exigé par le prédicat. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `gift-list-invite` `photoUrl` | `item.photo_url` → `resolveGuestPhotoUrl` | `guest_view_gift_list` (vraie requête `gift_items`) → bucket `household-media` signé | Oui | ✓ FLOWING |
| `ardoise-invite` `coverUrl` | `ardoise.cover_url` → `resolveGuestCoverUrl` | ligne `ardoises` (requête PostgREST réelle) → bucket signé | Oui | ✓ FLOWING |

Aucun retour statique, aucune valeur codée en dur : la chaîne se termine sur une requête réelle pour les deux surfaces.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Définition effective du RPC bornée | `printf "select pg_get_functiondef(oid) …" \| sh scripts/psql.sh` | `case … starts_with(i.photo_url, v_list_household \|\| '/') … strpos(…, '..') = 0 …` ; 3 clés | ✓ PASS |
| `0128` appliquée et vivante | `select version from schema_migrations` / `pg_proc` | `0128_guest_media_household.sql` journalisée ; `0129` absente | ✓ PASS |
| Test SQL du RPC | `sh scripts/test-db.sh 0128` | `Tests SQL : 1 fichier(s), tous verts.` (exit 0) | ✓ PASS |
| Suite SQL complète | `sh scripts/test-db.sh` | `Tests SQL : 65 fichier(s), tous verts.` (exit 0) | ✓ PASS |
| Contrôle statique SQL | `python3 scripts/check-sql-statique.py` | `181 fonction(s) effective(s) sur 128 migration(s) et 67 test(s), aucun défaut` (exit 0) | ✓ PASS |
| Module ardoise (Vitest ciblé) | `npx vitest run ../supabase/functions/ardoise-invite/guest-media.test.ts` | `Test Files 1 passed (1) / Tests 11 passed (11)` | ✓ PASS |
| Découverte par la suite | `npx vitest list \| grep ardoise-invite/guest-media` | 11 occurrences | ✓ PASS |
| Typecheck | `cd app && npm run typecheck` | exit 0 | ✓ PASS |
| Suite unitaire complète | `cd app && npm test` | `Test Files 149 passed (149) / Tests 1275 passed (1275)` | ✓ PASS |
| Build | `cd app && npm run build` | `✓ built` ; `precache 100 entries` | ✓ PASS |
| E2E | `cd app && npm run test:e2e` | `123 passed, 5 skipped` (0 échec), exit 0 | ✓ PASS |
| Idempotence de la migration | `sh scripts/migrate.sh` | `Toutes les migrations sont déjà appliquées.` (exit 0) | ✓ PASS |

### Falsification — « un contrôle se prouve sur un cas qui doit échouer » (AGENTS.md §2.7 B)

Chaque neutralisation a tourné dans une transaction de travail **annulée** ; la définition effective a été revérifiée bornée après coup.

**SQL — le `case` du RPC retiré (5 variantes, sortie verbatim) :**

| Variante | Sortie observée (tronquée au premier échec) |
| --- | --- |
| V1 — `case` entier remplacé par `i.photo_url` | `ERROR:  ASSERTION ÉCHOUÉE : un photo_url d'un autre foyer ne sort pas du RPC` (exit 3) |
| V2 — préfixe gardé, `strpos(…, '..') = 0` retiré | `ERROR:  ASSERTION ÉCHOUÉE : un photo_url qui remonte par un segment \`..\` ne sort pas du RPC` |
| V3 — `strpos` gardé, préfixe retiré | `ERROR:  ASSERTION ÉCHOUÉE : un photo_url d'un autre foyer ne sort pas du RPC` |
| V4 — `case` rend toujours `null` | `ERROR:  ASSERTION ÉCHOUÉE : un photo_url du foyer de la liste traverse le RPC inchangé (attendu household_43d7c91f-…/cadeaux/puzzle.webp, obtenu <NULL>)` |
| V5 — le foyer ajouté comme CLÉ de premier niveau | `ERROR:  ASSERTION ÉCHOUÉE : la charge invitee ne porte que ses trois cles, aucune cle de foyer (attendu {items,list_id,list_name}, obtenu {household_id,items,list_id,list_name})` |
| V6 — le foyer injecté en VALEUR seule (`list_name`) | `ERROR:  ASSERTION ÉCHOUÉE : aucune valeur de la charge invitee n'egale l'identifiant du foyer` |

Chaque clause du `case` est donc portante, l'assertion positive n'est pas vacueuse, et les trois facettes de l'AC 3 sont chacune capables d'échouer.

**Vitest — copie jetable du module (4 variantes, sortie verbatim) :**

| Variante | Sortie observée |
| --- | --- |
| W1 — `isHouseholdBoundedPath` rend `true` | `Tests 4 failed \| 7 passed` · `AssertionError: expected 'https://signe.example/objet-3f8a' to be null` (×4 : autre foyer, `..`, `http(s)`, homonyme) |
| W2 — relais `http(s)` de `guest-steps.ts:65` réintroduit | `Tests 1 failed \| 10 passed` · `AssertionError: expected 'https://externe.example/photo.jpg' to be null` |
| W3 — barre finale abandonnée (`startsWith(foyer)`) | `Tests 1 failed \| 10 passed` · homonyme : `expected 'https://signe.example/objet-3f8a' to be null` |
| W4 — le signeur appelé AVANT de rendre `null` | `Tests 4 failed \| 7 passed` · `expected [ { bucket: 'household-media', …(2) } ] to have a length of +0 but got 1` (le négatif porte bien sur le DOUBLE, pas seulement sur le retour) |

La copie jetable (`supabase/functions/_falsify_tmp/`) a été supprimée ; `git status` est propre.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| R1 | 23-01 | RPC cadeaux borné au foyer de la liste, foyer jamais rendu (aucune clé) | ✓ SATISFIED | Définition effective + `test-db.sh 0128` + V1–V6 |
| R2 | 23-01 | Couverture invitée de l'ardoise signée seulement si bornée | ✓ SATISFIED | `guest-media.ts` + `index.ts:635,644-645,716-718` + W1/W3/W4 |
| R3 | 23-01 | Forme `http(s)` plus relayée sur les deux surfaces | ✓ SATISFIED | greps vides + diff de retrait + W2 |
| R4 | 23-01 | Verdict prouvable automatiquement (test-db + Vitest, deno absent) | ✓ SATISFIED | `test-db.sh 0128` vert, fichier découvert, 10 variantes rouges |

Aucune exigence ORPHELINE : `ROADMAP.md:283-294` ne mappe que R1–R4, tous déclarés par le plan.

### Prohibitions (must-NOT)

| Prohibition | Status | Evidence |
| --- | --- | --- |
| MUST NOT relayer `http(s)` sur une surface invitée | ✓ RESPECTÉ (test) | grep 0 sur les 3 unités ; W2 rougit sur le relais réintroduit ; SQL `https://…` → `null`. |
| MUST NOT rendre le foyer de la ressource dans la charge invitée | ✓ RESPECTÉ (test, avec réserve AC 3 — voir note) | Clés de premier niveau exactement `items`/`list_id`/`list_name` (V5) ; aucun article ne porte de clé de foyer ; aucune VALEUR égale l'identifiant de foyer (V6). |
| MUST NOT ajouter de contrainte d'écriture sur les deux colonnes | ✓ RESPECTÉ (jugement) | `grep 'add constraint'`/`alter table` vide dans `0128` ; `pg_constraint` sur `gift_items`/`ardoises` inchangé (aucune contrainte sur `photo_url`/`cover_url`). |
| MUST NOT réécrire une migration appliquée | ✓ RESPECTÉ (jugement) | `git diff d36359c..HEAD --diff-filter=AM -- supabase/migrations/` : une seule entrée, `A 0128…` ; `0092` et `0122` absentes ; `0092`→`0128` = **exactement** trois additions (variable, colonne, `case`) + commentaires. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | Aucun `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` dans les 11 fichiers de la phase | — | — |
| — | — | Aucune directive de linter introduite (`app/src/lib/no-eslint-directive.test.ts` reste dans les 1275 verts) | — | — |

### Notes (à l'attention du relecteur humain)

1. **AC 3 du SPEC, mot à mot, n'est pas satisfait — et ne peut pas l'être.** Un chemin légitime borné `<foyerA>/cadeaux/x.webp` COMMENCE par l'identifiant du foyer, donc la chaîne du foyer apparaît bien dans la charge. Le SPEC contient là une contradiction interne (AC 1 rend le chemin, AC 3 interdirait toute occurrence). Le test livré résout la tension vers l'interprétation revendiquée par la phase (« R1 = le foyer n'est dans **aucune clé** ») et l'ÉCRIT (`0128_guest_media_household.sql:126-133`) au lieu de l'escamoter. Ce n'est pas une régression : l'état d'avant `0128` rendait le chemin BRUT, donc exposait la même information, sans borne. Aucune escalade : l'invité ne peut pas signer lui-même.
2. Le test « signe la CHAÎNE EXACTE … sans normalisation » (`guest-media.test.ts:95-103`) n'attrape pas une normalisation de barres obliques (sa valeur sonde n'en contient ni en tête, ni doublée). Aucune divergence observable n'existe — le verdict exige le préfixe `<foyer>/` et refuse tout `..` — donc l'assertion couvre le contrat, mais son intitulé promet plus que ce qu'elle détecte.
3. `python3 scripts/check-sql-statique.py` signale une **définition dépassée** (`0019_push_dispatch.sql`) et un motif DML→ALTER exempté (`0039:30`). Les deux sont **antérieurs** à cette phase et n'affectent pas le verdict (exit 0, aucun défaut).

### Human Verification Required

Aucun élément ne relève d'une vérification HUMAINE au sens de la règle de statut : les cinq vérités ont un test qui les exerce (RPC par `test-db.sh`, module pur par Vitest), et `behavior_unverified` vaut 0.

**En revanche, une limite de méthode doit être lue, pas contournée** (voir `Limites déclarées`) : le comportement des Edge DÉPLOYÉES — la signature réelle, le TTL réel, l'échec fermé réel, et le câblage dans `index.ts` — n'est exercé par aucune chaîne de cet hôte. Le câblage a été lu et vérifié ligne à ligne ; un relecteur qui exige une preuve EXÉCUTÉE du déploiement doit traiter ce point comme un jugement humain (le SUMMARY le déclare déjà `human_judgment: true`).

### Gaps Summary

Aucun écart bloquant. Les quatre exigences du ROADMAP, les dix critères d'acceptation du SPEC et les quatre prohibitions sont satisfaits sur l'arbre courant, avec des preuves falsifiables (10 variantes rouges pour la bonne raison) et la chaîne complète verte. Les trois notes ci-dessus sont des précisions de lecture, pas des manques : la plus substantielle (la formulation de l'AC 3) est une contradiction interne du SPEC, résolue, écrite et couverte par convention explicite.

---

_Verified: 2026-10-17T08:14:54Z_
_Verifier: gsd-verifier (goal-backward, adversarial)_
