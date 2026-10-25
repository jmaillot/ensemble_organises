---
phase: 16-recettes-du-foyer-grille-fiche-ingr-dients-tapes-partage
verified: 2026-10-14T11:35:00Z
status: human_needed
score: 14/14 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "En grille, cliquer au pointeur (souris/tactile) sur le coeur favori d'une carte"
    expected: "Le favori bascule sans naviguer vers la fiche ; cliquer ailleurs sur la carte navigue vers la fiche"
    why_human: "jsdom ne fait aucun hit-testing (REVIEW CR-01, fixe en 0a6a47c par relative z-10) et aucun e2e ne couvre le coeur de grille ; seul un pointeur reel prouve la superposition"
  - test: "Dans la fiche, cliquer Exporter puis ouvrir l'apercu avant impression du navigateur"
    expected: "Nom + ingredients recalcules a l'echelle courante + etapes numerotees, sans photo, sans chrome applicatif"
    why_human: "Le rendu @media print ne peut pas etre verifie par grep ; l'e2e ne constate que l'existence du noeud .recipe-print masque a l'ecran"
---

# Phase 16 : Recettes du foyer Verification Report

**Phase Goal :** Le module Recettes passe d'un écran d'attente à un module complet : grille de recettes par catégorie, fiche cliquable (ingrédients + étapes), mise à l'échelle des quantités au nombre de personnes, partage invité lecture seule + export PDF, favoris/recherche et envoi vers Courses.
**Verified :** 2026-10-14T11:35:00Z
**Status :** human_needed
**Re-verification :** No — initial verification

Note d'environnement : `gsd_run` indisponible dans cette session (command not found) — pas de `covered_digest` généré ; `covered_files` listés en fin de rapport. `test-db.sh` non relancé ici (exige Docker + stack locale) ; la preuve serveur repose sur le contenu audité de `0054` + gates établis (58/58).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Un membre crée Desserts, y assigne une recette, supprime une catégorie vide, suppression pleine réassigne vers Recettes du foyer | ✓ VERIFIED | `0054` §2 (affected/count bornés) + trigger BEFORE DELETE en `0122` ; migration 724 lignes |
| 2 | 14 tags seed par foyer ; saisir #Thermomix crée le tag et l'assigne | ✓ VERIFIED | `0054` §1 (14 seeds) + §3 (volée + rename propage) |
| 3 | Farine 500 g et Sel NULL s'enregistrent ; enfant lit tout mais tout INSERT/UPDATE/DELETE direct est refusé | ✓ VERIFIED | `0054` §4 (ingrédients) + §5 (`expect_denied` insert, affected=0 update/delete, lecture OK) |
| 4 | Lien invité généré côté serveur s'ouvre sans compte, révoqué/expiré invalide, max-uses respecté atomiquement | ✓ VERIFIED | `0054` §7-8 (RPC create/view/revoke, oracle `code invalide` uniforme, max-uses=1 épuisé) + Edge `recipe-invite/index.ts` 567 lignes (create/revoke/summary user, link-view publishable) |
| 5 | Aucune lecture invitée en PostgREST direct ; seul le hash HMAC persiste | ✓ VERIFIED | `0122:164-171` (RLS activée, `revoke all ... from anon, authenticated, public`, grant service_role seul) + `0054` `expect_denied(select ... recipe_shares)` ; colonnes = recipe_id/share_hash/expires/max_uses/use_count/revoked/is_active, aucun token brut |
| 6 | 3 recettes / 2 catégories → 3 cartes sous 2 en-têtes, Recettes du foyer en premier, clic → fiche | ✓ VERIFIED | `recettes-page.test.tsx` 3/3 + route `/recettes/:id` (router.tsx:311) ; Vitest recettes 33/33 vert (relancé ici) |
| 7 | Gratin pour 4 (30+45) affiche 1h15 ; Farine 500 g / Sel au goût ; 1 oeuf/4 → 0.5 à 2 → 2 oeufs à 8, sel inchangé | ✓ VERIFIED | `recettes-scaler.test.ts` 6/6 (scaleQuantity, formatTotalTime, agreeUnit + INVARIABLE_UNITS) ; `types.ts:107-145` audité |
| 8 | 3 étapes bulles 1-2-3 reliées par point ; drag 3→1 persiste ; boutons monter/descendre + cases cuisson au clavier | ✓ VERIFIED | `recipe-steps.test.tsx` 5/5 ; dnd-kit `useSortable` + `sortableKeyboardCoordinates` + boutons ≥44px (`recipe-steps.tsx:126-130,207`) ; renumérotation dense serveur via `reorderRecipeSteps` |
| 9 | Couverture visible carte+fiche ; suppression sans orphelin Storage ; recherche `gratin` insensible accents + filtres combinables | ✓ VERIFIED | `recipe-cover.test.ts` 7/7 ; `api.ts:230-233` cleanup `removeHouseholdFile` couplé à `deleteRecipe` ; `types.ts:158` NFD + `recettes-search.test.ts` 3/3 |
| 10 | Partager génère un lien copiable + révocation ; lien sans compte = fiche lecture seule avec scaler/cases, zéro édition | ✓ VERIFIED | `guest-recipe-page.test.tsx` 6/6 ; `guest-recipe-page.tsx` : seule donnée = Edge `link-view`, aucun `from()` PostgREST, seuls boutons = formulaire code ; route `/invitation/recette` (router.tsx:236) |
| 11 | Lien révoqué/expiré → lien invalide ; max-uses respecté | ✓ VERIFIED | Tests invitée (révoqué/expiré) + `0054` §8 oracle + compteur `FOR UPDATE` ; client affiche le compteur du `summary` (preuve serveur seule, assumé SPEC) |
| 12 | Export imprime nom + ingrédients à l'échelle + étapes, même sans photo | ✓ VERIFIED | `recipe-actions.test.ts` (`toRecipePrintModel`) + `recette-detail-page.tsx:321,411` (`window.print`, `.recipe-print`) + `recipe-export.css` `@media print` (écran masqué/print seul) |
| 13 | Envoi 3 ingrédients à l'échelle 8 vers Courses semaine → 3 lignes bonnes quantités | ✓ VERIFIED | `recipe-actions.test.ts` (1000 g / 2 oeufs / au goût) ; `api.ts:520` via `createShoppingItem` (import courses/api.ts:14) câblé au sélecteur `shopping_lists` (`recette-detail-page.tsx:57,123`) |
| 14 | Enfant : aucune action créer/modifier/supprimer/partager visible, routes édition gardées, lecture OK | ✓ VERIFIED | `canWrite = role !== 'enfant'` (use-recettes.ts:78) + throw uniforme + masquage grille/fiche/panneau Actions ; e2e enfant (`recettes.spec.ts:102`) ; serveur déjà refusé (T3) |

**Score :** 14/14 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/0122_recettes_full.sql` | Schéma + RLS + RPC + seeds | ✓ VERIFIED | 724 lignes, search_path vide, tables qualifiées `public.` |
| `supabase/tests/0054_recettes_full.sql` | Suite preuves serveur | ✓ VERIFIED | 388 lignes, 8 sections bornées par foyer |
| `supabase/functions/recipe-invite/index.ts` + `child-guard.ts` | Edge partage HMAC | ✓ VERIFIED | 567 + 40 lignes, motif trip-invite, garde enfant |
| `app/src/modules/recettes/recette-detail-page.tsx` | Fiche + Actions + print | ✓ VERIFIED | 431 lignes, câblée Edge/Courses/print |
| `app/src/modules/recettes/components/recipe-card.tsx` | Carte grille | ✓ VERIFIED | CR-01 fixé (z-10, commit 0a6a47c) — reste preuve pointeur humaine |
| `app/src/modules/recettes/components/ingredient-list.tsx` | Scaler + CRUD ingrédients | ✓ VERIFIED | Curseur pair 2-12, NULL intact |
| `app/src/modules/recettes/components/recipe-steps.tsx` | Étapes DnD | ✓ VERIFIED | dnd-kit + a11y (poignée hors aria-hidden) |
| `app/src/modules/recettes/components/recipe-share-dialog.tsx` | Dialogue partage | ✓ VERIFIED | Via Edge JWT user, jamais PostgREST shares |
| `app/src/modules/recettes/guest-recipe-page.tsx` | Page invitée | ✓ VERIFIED | link-view seul, zéro édition |
| `app/e2e/recettes.spec.ts` | 7 parcours × 2 viewports | ✓ VERIFIED | 7 tests, 14/14 au gate établi |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Edge recipe-invite | RPC SECURITY DEFINER service_role | create/revoke/summary/link-view | ✓ WIRED | Jamais PostgREST direct invité |
| Tables enfants | recipes | recipe_id CASCADE + household_id dénormalisé | ✓ WIRED | align_household + check_recipe_link_scope |
| Écritures RLS | can_write_household | admin/membre ; SELECT enfant inclus | ✓ WIRED | recipe_shares zéro politique |
| Carte grille | route fiche | `/recettes/:id` | ✓ WIRED | router.tsx:311 |
| Scaler client | recalcul décimal + accord unité | scaleQuantity/agreeUnit | ✓ WIRED | Fiche + invitée + print + Courses |
| Suppression recette | Storage | removeHouseholdFile couplé à data.remove | ✓ WIRED | api.ts:230-233 |
| Dialogue partage | Edge create/revoke/summary | JWT user | ✓ WIRED | share-dialog + api.ts:387-401 |
| Page invitée | Edge link-view | ticket seul | ✓ WIRED | Aucun from() dans guest-recipe-page |
| Fiche | shopping_list_items | createShoppingItem aux quantités courantes | ✓ WIRED | api.ts:520-537 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| recettes-page.tsx (grille) | recipes + categories + tags + favorites | useRecettes → PostgREST RLS | ✓ | ✓ FLOWING |
| recette-detail-page.tsx | ingredients/steps à l'échelle | useQuery enfants + scaleQuantity | ✓ | ✓ FLOWING |
| guest-recipe-page.tsx | view (recette + enfants + tags + cover signée) | Edge link-view RPC | ✓ | ✓ FLOWING |
| recipe-share-dialog.tsx | code/summary | Edge create/summary | ✓ | ✓ FLOWING |
| Courses send | ShoppingListItemRow[] | scaleQuantity × cible/base | ✓ | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Vitest recettes | `npx vitest run src/modules/recettes` | 7 fichiers / 33 tests passés (relancé ici) | ✓ PASS |
| e2e recettes | `npm run test:e2e -- recettes` (gate établi) | 14/14 (7 parcours × chromium + mobile) | ✓ PASS (gate) |
| test-db 0054 | `sh scripts/test-db.sh` (gate établi) | 58/58 dont 0054 | ✓ PASS (gate) |
| Statique SQL | `check-sql-statique.py` (gate établi) | 180 fns, 0 défaut | ✓ PASS (gate) |
| typecheck + build | gates établis | verts (precache 103) | ✓ PASS (gate) |

### Requirements Coverage (R1–R14 croisés contre 16-SPEC.md)

Tous les IDs R1–R14 apparaissent dans au moins un frontmatter `requirements:` de plan (16-01 : R2 R4 R6 R7 R10 R11 ; 16-02 : R1 R2 R3 R4 R5 R6 R7 R8 R9 R13 ; 16-03 : R5 R10 R11 R12 R14) — aucun orphelin, aucun ID SPEC non réclamé.

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| R1 | 16-02 | Grille cartes par catégorie | ✓ SATISFIED | T6 |
| R2 | 16-01 + 16-02 | Catégories + défaut + réassignation | ✓ SATISFIED | T1 + recipe-settings |
| R3 | 16-02 | Création 7 champs + temps total | ✓ SATISFIED | T7 + recipe-form-dialog |
| R4 | 16-01 + 16-02 | Tags multi + 14 seeds + volée + paramètres | ✓ SATISFIED | T2 + settings |
| R5 | 16-02 + 16-03 | Fiche cliquable | ✓ SATISFIED | T6 + T10 |
| R6 | 16-01 + 16-02 | Ingrédients structurés NULL | ✓ SATISFIED | T3 + T7 |
| R7 | 16-01 + 16-02 | Étapes bulles + DnD | ✓ SATISFIED | T8 |
| R8 | 16-02 | Scaler pair + décimaux + accord | ✓ SATISFIED | T7 |
| R9 | 16-02 | Couverture + cleanup | ✓ SATISFIED | T9 |
| R10 | 16-01 + 16-03 | Enfant lecture seule | ✓ SATISFIED | T3 + T14 |
| R11 | 16-01 + 16-03 | Lien invité lecture seule | ✓ SATISFIED | T4 + T5 + T10 + T11 |
| R12 | 16-03 | Export print | ✓ SATISFIED | T12 |
| R13 | 16-02 | Favoris + recherche + filtres | ✓ SATISFIED | T9 (cœur : preuve pointeur → humaine) |
| R14 | 16-03 | Envoi Courses | ✓ SATISFIED | T13 |

Prohibitions SPEC : (1) pas de RLS invitée — test-tier, prouvé `expect_denied` 0054 ✓ ; (2) pas de token brut/secret en base — jugement, vérifié par inspection (colonnes 0122 + secret Vault/traefik nom seul) ✓ non-autoritaire ; (3) pas d'écriture enfant — test-tier, prouvé 0054 + garde UI ✓.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | grep TODO/FIXME/placeholder (hors `placeholder=` HTML) vide sur recettes + 0122 + Edge | — | Aucun stub |
| tests uniquement | — | `() => {}` dans recipe-steps.test.tsx (mocks) | ℹ️ Info | Légitime |
| ingredient-list / form-dialog | 42 / 68 | `return null` gardes parse (quantité invalide → NULL, champ non numérique) | ⚠️ Warning | WR-01 review : typo `-500` enregistrée « au goût » sans feedback — backlog assumé, pas de corruption ni fuite |

### Review Disposition Check

16-REVIEW.md (1 critical + 9 warnings + 7 info) vs 16-REVIEW-DISPOSITION.md : CR-01 fixed vérifié en code (`recipe-card.tsx:51` `relative z-10`, commit 0a6a47c présent au log). WR-01..WR-09 / IN-01..IN-07 ouverts/backlog : robustness (non-atomicité, collisions position, curseur inter-recettes, clés print, scope category_id, audit forgeable) — aucun n'ouvre un accès (serveur RLS+RPC fait foi) ni ne corrompt le parcours nominal ; pas bloquants pour le goal. Dérive WR-08 (garde scope `category_id` absente côté serveur) notée : un writer A peut pointer une catégorie B (pas de fuite lecture, isolation nominale rompue en écriture de référence) — à trancher en phase ultérieure, ne casse aucune truth.

### Human Verification Required

### 1. Coeur favori grille au pointeur

**Test :** En grille, cliquer au pointeur sur le coeur d'une carte, puis cliquer sur le corps de la carte.
**Expected :** Le coeur bascule sans navigation ; le corps navigue vers la fiche.
**Why human :** jsdom sans hit-testing + aucun e2e sur le coeur (cf. CR-01) ; le fix z-10 n'est prouvé qu'en lecture de code.

### 2. Aperçu avant impression de la fiche

**Test :** Fiche → changer l'échelle → Exporter → aperçu print du navigateur (avec puis sans couverture).
**Expected :** Nom + ingrédients à l'échelle + étapes numérotées, sans chrome applicatif.
**Why human :** Rendu `@media print` non vérifiable par grep ; e2e constate seulement le noeud masqué.

### Gaps Summary

Aucun gap bloquant : 14/14 truths vérifiées en code + preuves (Vitest 33/33 relancé ici ; gates établis e2e 14/14, test-db 58/58, typecheck/build/statique verts). Dette assumée : 16 findings review ouverts en backlog (WR/IN) + 2 échecs e2e hors scope prouvés pré-existants. Seules 2 vérifications exigent un humain (hit-testing pointeur post-CR-01, rendu print réel).

### Covered Files

Plans/Summaries : 16-01-PLAN.md, 16-02-PLAN.md, 16-03-PLAN.md, 16-01-SUMMARY.md, 16-02-SUMMARY.md, 16-03-SUMMARY.md, 16-SPEC.md, 16-REVIEW.md, 16-REVIEW-DISPOSITION.md. Impl : supabase/migrations/0122_recettes_full.sql, supabase/tests/0054_recettes_full.sql, supabase/functions/recipe-invite/index.ts, supabase/functions/recipe-invite/child-guard.ts, app/src/modules/recettes/{api,types,recettes-page,recette-detail-page,guest-recipe-page}.tsx, components/{recipe-card,recipe-form-dialog,ingredient-list,recipe-steps,recipe-settings,recipe-share-dialog}.tsx, recipe-export.css, hooks/use-recettes.ts, app/e2e/recettes.spec.ts. (covered_digest non généré : `gsd_run` absent de la session.)

---

_Verified: 2026-10-14T11:35:00Z_
_Verifier: the agent (gsd-verifier)_
