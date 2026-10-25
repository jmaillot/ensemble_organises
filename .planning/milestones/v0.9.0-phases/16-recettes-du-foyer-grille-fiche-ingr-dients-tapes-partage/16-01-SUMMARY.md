---
phase: 16-recettes-du-foyer-grille-fiche-ingr-dients-tapes-partage
plan: '01'
subsystem: database
tags: [postgres, rls, supabase, edge-functions, hmac, deno, vitest]
requires:
  - phase: 15-voyage-espace
    provides: [trip-invite byte-motif HMAC + FOR UPDATE + oracle unique + child-guard]
  - phase: 06-cadeaux-partage
    provides: [gift-list-invite motif lien seul + cover signee + rate-limits]
provides:
  - Socle serveur Recettes prouve (schema + RLS + RPC + Edge recipe-invite)
  - Suite SQL 0054 verte (isolation, enfant negatif, reassignment, oracle, max-uses)
  - Secret RECIPE_INVITE_HMAC_SECRET cable local + prod (noms)
affects: [16-02-grille-fiche-ui, 16-03-partage-export-courses]
actuals:
  tokens: 20000
  tasks: 3
  commits: 2
tech-stack:
  added: []
  patterns: [align_household rewrite convention 0008, RPC service_role seuls + oracle unique, Edge user/publishable split + child-guard miroir]
key-files:
  created:
    - supabase/migrations/0122_recettes_full.sql
    - supabase/tests/0054_recettes_full.sql
    - supabase/functions/recipe-invite/index.ts
    - supabase/functions/recipe-invite/child-guard.ts
    - supabase/functions/recipe-invite/child-guard.test.ts
  modified:
    - supabase/tests/0001_schema_contract.sql
    - supabase-project/docker-compose.traefik.yml
key-decisions:
  - "Lien seul link-view (pas de redeem) : lecture externe sans inscription, compteur consomme atomiquement sous FOR UPDATE"
  - "household_id denormalise en REECRITURE via align_child_household (convention 0008), pas en rejet : le contrat 0001 §5 l'exige ; second parent verifie par check_recipe_link_scope"
  - "DELETE RLS via can_write_household (membre inclus), pas admin-seul : SPEC R2 confie la gestion categories aux membres"
  - "Secret genere localement (.env + secrets.yml gitignored, container recree) ; prod = nom seul en traefik.yml, valeur = operateur/Vault"
patterns-established:
  - "Recipe child tables: FK recipe_id cascade + household_id denormalise + align_household + RLS membre/writer"
  - "Recipe shares: zero policy + zero grant + 4 RPC service_role + Edge seule (prohibition R11)"
  - "Category delete: BEFORE trigger reassigne vers defaut du foyer, jamais de perte"
requirements-completed: [R2, R4, R6, R7, R10, R11]
coverage:
  - id: D1
    description: "Schema complet + RLS + RPC + seeds (defaut, 14 tags) prouves par suite SQL"
    requirement: "R2"
    verification:
      - kind: integration
        ref: "sh scripts/test-db.sh (58 fichiers, tous verts, dont 0054_recettes_full.sql)"
        status: pass
      - kind: other
        ref: "python3 scripts/check-sql-statique.py (180 fonctions, aucun defaut)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Lien invite cycle complet (creation, lecture fiche, revocation, expiration, max-uses=1, oracle uniforme)"
    requirement: "R11"
    verification:
      - kind: integration
        ref: "supabase/tests/0054_recettes_full.sql#section 8 (RPC + oracle + compteur)"
        status: pass
      - kind: integration
        ref: "live smoke local: link-view 200 fiche, inconnu 404, revoque 404, sans-session 401"
        status: pass
    human_judgment: false
  - id: D3
    description: "Enfant lecture seule (SELECT ok, INSERT/UPDATE/DELETE refuses serveur + garde Edge)"
    requirement: "R10"
    verification:
      - kind: integration
        ref: "supabase/tests/0054_recettes_full.sql#section 5 (preuves negatives RLS)"
        status: pass
      - kind: unit
        ref: "supabase/functions/recipe-invite/child-guard.test.ts (4 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Secret HMAC dedie : hash hex64 seul persiste, brut rendu une fois, secret hors base"
    requirement: "R11"
    verification:
      - kind: integration
        ref: "supabase/tests/0054_recettes_full.sql#hash seul persiste + 0001#recipe_shares sans politique ni grant"
        status: pass
    human_judgment: false
duration: 55min
completed: 2026-10-14
status: complete
---

# Phase 16 Plan 01 : Socle serveur Recettes Summary

**Migration 0122 (7 tables + RLS + 4 RPC HMAC) + suite 0054 verte + Edge recipe-invite fumée en live (200 fiche / 404 oracle / 401 garde)**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-10-14T07:55Z (approx)
- **Completed:** 2026-10-14T08:50Z (approx)
- **Tasks:** 3 (tracer + Edge + gate preuves)
- **Files modified:** 7 (5 created, 2 modified)

## Accomplishments

- `public.recipes` etendue vers l'avant (category_id, servings, prep/cook_minutes, cover_photo chemin prive, created_by) + 7 tables neuves : categories, tags + liens, ingredients (quantity NULL = au gout), etapes, favoris, partages HMAC
- RLS : SELECT membre (enfant inclus), ecritures writer seuls ; `recipe_shares` zero politique + zero grant (service_role seul)
- 4 RPC serveur seuls : create/revoke/summary + `view_recipe_share` (FOR UPDATE, oracle `code invalide` unique, compteur consomme atomiquement)
- Seeds : `Recettes du foyer` + 14 tags SPEC R4 par foyer existant + trigger a chaque creation de foyer
- Edge `recipe-invite` copie byte-motif : create/revoke/summary (user, child-guard `manage`) + `link-view` publishable (fiche + cover signee 1h, jamais d'acces PostgREST)
- Preuves : statique SQL vert, test-db 58/58 vert (dont 0054), Vitest garde 4/4, typecheck app vert, smoke live local complet, extensions unaccent/pg_trgm absentes (recherche 16-02 = NFD client, verrouille)

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer recette complete lue cote serveur** - `2fc6a4c` (feat)
2. **Task 2: Edge recipe-invite copie byte-motif trip-invite** - `23ce9a8` (feat)
3. **Task 3: Preuves DB + chaine phase gate serveur** - no commit (verification-only, zero file changes; gate re-run vert)

**Commits notes :** secure-sequential run sur l'arbre main par consigne orchestrateur (garde #3819 documentee N/A, voir deviations).

## Files Created/Modified

- `supabase/migrations/0122_recettes_full.sql` - Schema + RLS + triggers + RPC + seeds (724 lignes)
- `supabase/tests/0054_recettes_full.sql` - 8 sections bornees par foyer (388 lignes)
- `supabase/tests/0001_schema_contract.sql` - Contrat aligne : colonnes recipes, 7 tables, recipe_shares close (modifie)
- `supabase/functions/recipe-invite/index.ts` - Edge create/revoke/summary/link-view (567 lignes)
- `supabase/functions/recipe-invite/child-guard.ts` - Garde pure manage/code
- `supabase/functions/recipe-invite/child-guard.test.ts` - 4 preuves contrat Vitest
- `supabase-project/docker-compose.traefik.yml` - Nom `RECIPE_INVITE_HMAC_SECRET` seul (modifie ; valeur = operateur/Vault en prod)

## Decisions Made

- Lien seul `link-view`, pas de redeem : SPEC R11 = lecture seule sans inscription ; le compteur borne les lectures (hypothese SPEC max-uses=1 assumee via FOR UPDATE)
- `align_household` en reecriture (convention 0008 imposee par contrat 0001 §5), pas en rejet : le plan citait le rejet trip-invite, mais trip_id nullable = changement de scope, ici household_id NOT NULL = pure denormalisation ; second parent (tag/membre) garde en rejet via `check_recipe_link_scope`
- DELETE RLS via `can_write_household` (pas admin-seul comme le motif 0007 plat) : SPEC R2 confie creation/renommage/suppression-vide aux membres
- Secret : genere localement pour la fumee (precedent phase 15), prod = nom versionne + valeur operateur (user_setup du plan)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Ordre FK categorie dans la migration**
- **Found during:** Task 1 (redaction 0122)
- **Issue:** `ALTER recipes ADD category_id REFERENCES recipe_categories` placait avant le `CREATE TABLE recipe_categories` : la reference exige la table existante
- **Fix:** ALTER categorie deplace apres creation de la table (section B, rattachement tardif commente)
- **Files modified:** supabase/migrations/0122_recettes_full.sql
- **Verification:** migrate.sh applique 0122 du premier coup
- **Committed in:** 2fc6a4c (part of task commit)

**2. [Rule 1 - Bug] Collision rename tag avec seed en suite 0054**
- **Found during:** Task 1 (test-db 0054)
- **Issue:** Le test renommait `Thermomix` en `Dessert`, qui est deja un des 14 seeds : violation unique
- **Fix:** Cible de rename changee en `Robot` (hors seeds)
- **Files modified:** supabase/tests/0054_recettes_full.sql
- **Verification:** test-db 0054 vert
- **Committed in:** 2fc6a4c (part of task commit)

**3. [Rule 1 - Bug] UPDATE/DELETE RLS nies ne levent pas d'erreur**
- **Found during:** Task 1 (test-db 0054)
- **Issue:** `expect_denied` sur UPDATE/DELETE enfant : la RLS filtre silencieusement (0 lignes), pas d'erreur ; le test echouait a tort
- **Fix:** Assertions passees en `affected(...) = 0::bigint` (precedent 0051/0053 documente)
- **Files modified:** supabase/tests/0054_recettes_full.sql
- **Verification:** test-db 0054 vert
- **Committed in:** 2fc6a4c (part of task commit)

**4. [Rule 1 - Bug] Lecture shares = permission denied, pas 0 lignes**
- **Found during:** Task 1 (test-db 0054)
- **Issue:** `revoke all from public` retire le privilege table : le SELECT leve `permission denied`, `count` ne rend pas 0
- **Fix:** Preuve passee en `expect_denied('select 1 ...')` (precedent 0053 trip_invites)
- **Files modified:** supabase/tests/0054_recettes_full.sql
- **Verification:** test-db 0054 vert
- **Committed in:** 2fc6a4c (part of task commit)

**5. [Rule 2 - Missing critical] Contrat 0001 non aligne par le plan**
- **Found during:** Task 1 (analyse contrat avant ecriture)
- **Issue:** Le plan ne listait pas 0001 : colonnes recipes etendues + tables neuves + shares sans politique auraient fait echouer le contrat (§1 extra, §2-bis, §5 align_household, §6 grants)
- **Fix:** 0001 mis a jour (colonnes, 7 tables, recipe_shares aux 3 listes close + §5 align list)
- **Files modified:** supabase/tests/0001_schema_contract.sql
- **Verification:** test-db full 58/58 vert
- **Committed in:** 2fc6a4c (part of task commit)

**6. [Rule 3 - Blocking] Secret absent du container au runtime**
- **Found during:** Task 2 (precedent phase 15 : secret manque au container)
- **Issue:** `RECIPE_INVITE_HMAC_SECRET` ni en `.env` ni en secrets.yml : l'Edge aurait echoue fermee 500
- **Fix:** Secret genere (openssl 48, local-only gitignored) + nom en traefik.yml (prod) + secrets.yml ; container recree Healthy, presence verifiee sans afficher la valeur
- **Files modified:** supabase-project/docker-compose.traefik.yml (les fichiers a secrets sont gitignored, non versionnes)
- **Verification:** `SECRET-WIRED-len-64` + smoke live 200/404/401
- **Committed in:** 23ce9a8 (part of task commit)

---

**Total deviations:** 6 auto-fixed (3 bugs test, 1 bug migration, 1 missing critical contrat, 1 blocking secret)
**Impact on plan:** Tous necessaires a la validite/vert des preuves. Aucun elargissement de scope. Ecart volontaire documente : commits sur main par consigne orchestrateur (run sequentiel sur arbre main, pas de worktree) — la garde #3819 anti-drift ne s'applique pas a un run delibere sur main, et l'historique projet committe sur main ; aucun `--no-verify` utilise.

## Issues Encountered

- Edition inline via python heredoc a corrompu une ligne du test 0054 (`%L XX`) : reparee a l'Edit tool, rappel = ne jamais editer via shell (reserve au shell pour lecture/statut)
- `run.sh config | grep` muet : secret verifie directement dans le container plutot que via la config

## Auth Gates

None - aucun. Le secret HMAC local a ete genere par precedent phase 15 (dev local) ; la valeur prod reste devoir operateur (user_setup du plan, Vault/secret manager).

## Known Stubs

None - aucun marqueur TODO/FIXME/placeholder dans les fichiers crees ; verifie par grep.

## Threat Flags

None - aucune surface hors modele de menaces du plan : pas de nouvelle route, pas de nouveau paquet (T-16-SC tient, 0 installation), RLS/RPC/Edge exactement per T-16-01..05.

## User Setup Required

None - pas de USER-SETUP.md. Rappel operateur (deja dans le plan) : provisionner `RECIPE_INVITE_HMAC_SECRET` (≥ 256 bits, `openssl rand -base64 48`) dans Vault/secret manager avant tout deploiement prod ; la rotation invalide les liens actifs.

## Self-Check: PASSED

- Fichiers : 0122, 0054, index.ts, child-guard.ts, child-guard.test.ts existent ; 0001 + traefik.yml modifies
- Commits : 2fc6a4c + 23ce9a8 existent (`git log`)
- Preuves : statique vert, test-db 58/58, Vitest 4/4 recipe-invite, typecheck vert, smoke live nettoye (0 lignes smoke restantes)

## Next Phase Readiness

- Socle serveur pret : 16-02 (grille + fiche + scaler + DnD) peut construire sur `recipes` + enfants via PostgREST RLS, couverture via `cover_photo` + URL signee, partage via Edge `recipe-invite`
- Recherche 16-02 (R13) : NFD cote client verrouille (unaccent/pg_trgm absents, prouve)
- Aucun bloqueur

---
*Phase: 16-recettes-du-foyer-grille-fiche-ingr-dients-tapes-partage*
*Completed: 2026-10-14*
