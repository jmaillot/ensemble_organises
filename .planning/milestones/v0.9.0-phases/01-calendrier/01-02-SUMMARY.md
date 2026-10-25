---
phase: 01-calendrier
plan: 02
subsystem: database
tags: [postgres, trigger, edge-function, pg-cron, vault, calendrier]

# Dependency graph
requires:
  - phase: 01-01
    provides: "Socle Perso invisible-total Option B + trigger Perso auto (0084/0085)"
provides:
  - "Garde categories en usage cote serveur, errcode 23514 (0086, D-08)"
  - "Edge refresh-calendrier-ref secret-only fail-open + helpers testes (D-13/D-15)"
  - "Dispatch Vault + jobs cron janvier/septembre 04h Paris (0087, D-14)"
affects: [01-03, 01-04]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 5082
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns: [trigger-garde-23514, edge-secret-only-fail-open, dispatch-Vault-apikey, cron-GMT-shift]

key-files:
  created:
    - supabase/migrations/0086_calendrier_category_guard.sql
    - supabase/migrations/0087_calendrier_refresh_cron.sql
    - supabase/functions/refresh-calendrier-ref/index.ts
    - supabase/functions/refresh-calendrier-ref/ref-days.ts
    - supabase/functions/refresh-calendrier-ref/helpers.test.ts
  modified: []

key-decisions:
  - "cron.timezone=GMT verifie sur la stack : jobs decales (jan 03h00 GMT, sept 02h00 GMT) pour viser 04h00 Europe/Paris, documente en entete de 0087"
  - "Helpers Edge purs isoles dans ref-days.ts (convention push-notify/web-push.ts) plutot qu'importer index.ts sous Vitest"
  - "Commande verify du plan adaptee : deploy-functions.sh n'a pas de --dry-run, --list fait foi"

patterns-established:
  - "Garde 23514 : BEFORE UPDATE OF name + BEFORE DELETE, test OLD.id contre table enfant, seed inclus sans exception"
  - "Dispatch Vault effectif : to_regproc pour net.http_post, messages pg_net/Vault separes, cle en apikey jamais Bearer (motifs 0024/0025)"

requirements-completed: [D-08, D-13, D-14, D-15]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Renommer/supprimer une categorie utilisee refuse 23514 cote serveur, seed inclus ; categories libres modifiables par un adulte"
    requirement: "D-08"
    verification:
      - kind: other
        ref: "psql tracer transactionnel (rename/delete used -> 23514, rename/delete free OK, rollback)"
        status: pass
      - kind: other
        ref: "python3 scripts/check-sql-statique.py (aucun defaut)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Edge refresh-calendrier-ref secret-only : upsert feries/vacances via client privilegie, 200 refreshed:false en panne"
    requirement: "D-13"
    verification:
      - kind: unit
        ref: "supabase/functions/refresh-calendrier-ref/helpers.test.ts (4 tests)"
        status: pass
      - kind: other
        ref: "sh scripts/deploy-functions.sh --list + deploiement reel (runtime cite la fonction, main/hello preserves)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Deux jobs cron janvier/septembre 04h Paris via dispatch Vault, commandes nues sans secret"
    requirement: "D-14"
    verification:
      - kind: other
        ref: "psql catalogue (2 jobs, planifications, base courante, 0 secret, def dispatch lit Vault + apikey)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Panne API au refresh : ancien cache conserve, reponse 200 non bloquante"
    requirement: "D-15"
    verification:
      - kind: other
        ref: "relecture contrat fail-open index.ts (catch -> json refreshed:false 200) ; preuve reseau reelle due au plan 01-04/e2e"
        status: unknown
    human_judgment: true
    rationale: "Le contrat fail-open est relu mais jamais exerce contre une source en panne ; seul un appel reel en echec le prouverait."

# Metrics
duration: 30min
completed: 2026-10-06
status: complete
---

# Phase 01 Plan 02: Expansion serveur calendrier Summary

**Garde categories 23514 cote serveur, Edge refresh-calendrier-ref secret-only fail-open, et dispatch Vault + cron janvier/septembre cales sur 04h Paris**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-10-06T11:00:00Z (approx.)
- **Completed:** 2026-10-06T11:16:55Z
- **Tasks:** 3/3
- **Files modified:** 5 (5 creees, 0 modifiees)

## Accomplishments

- 0086 : `guard_event_category` (rename + delete refuses 23514 si un event reference la categorie, seed inclus) — prouve sur stack locale : rename/delete used -> 23514, rename/delete free OK.
- Edge `refresh-calendrier-ref` : `withSupabase secret-seul`, fetch feries metropole + vacances par zone (3 zones x 2 annees scolaires), upsert `public_holidays` (conflit date) + `school_holidays` (conflit zone+bornes), fail-open 200 `refreshed:false`, rate-limit memoire `refresh:10`, aucun HMAC reutilise.
- 0087 : `dispatch_calendrier_refresh` (Vault a l'execution, `to_regproc`, messages separes, header `apikey` jamais Bearer) + jobs `eo-calendrier-refresh-jan`/`-sept` decales GMT pour 04h00 Paris, commandes nues, base courante.
- Chaine verte : `migrate.sh` (0086/0087 appliquees), statique vert (132 fonctions effectives), `typecheck` vert, Vitest helpers 4/4, deploy reel (10 fonctions, main/hello preserves), test-db 29/30 (0016 obsolete documente, inchange).

## Task Commits

Chaque tache a ete commise atomiquement :

1. **Task 1: Garde categorie en usage cote serveur** - `2703820` (feat)
2. **Task 2: Edge refresh-calendrier-ref secret-only fail-open** - `4cc9d85` (feat)
3. **Task 3: Dispatch Vault et jobs cron janvier septembre** - `daafbf7` (feat)

**Plan metadata:** pas de commit docs separe (l'orchestrateur possede STATE/ROADMAP).

## Files Created/Modified

- `supabase/migrations/0086_calendrier_category_guard.sql` — trigger garde rename/delete per D-08 (fonction + 2 triggers + REVOKE).
- `supabase/migrations/0087_calendrier_refresh_cron.sql` — dispatch Vault + 2 jobs per D-14 (fonction + bloc jobs + REVOKE/GRANT service_role).
- `supabase/functions/refresh-calendrier-ref/index.ts` — entree secret-only fail-open per D-13/D-15.
- `supabase/functions/refresh-calendrier-ref/ref-days.ts` — helpers purs (URLs, schoolYearFor, parseVacationRecords).
- `supabase/functions/refresh-calendrier-ref/helpers.test.ts` — 4 tests helpers (Vitest, inclus via `supabase/functions/**/*.test.ts`).

## Decisions Made

- **Decalage GMT des jobs (planifie par le plan, verifie ici) :** `show cron.timezone` = GMT sur la stack, donc `0 3 1 1 *` (janvier, CET) et `0 2 1 9 *` (septembre, CEST) pour viser 04h00 Europe/Paris. Documente en entete de 0087 avec consigne de retour a `0 4 ...` si `cron.timezone` passe a Europe/Paris. Ce n'est pas un ecart : le plan ordonnait cette verification-then-align.
- **Helpers Edge isoles dans `ref-days.ts`** : importer `index.ts` sous Vitest chargerait `Deno.serve` + `@supabase/server` (convention `push-notify/web-push.ts`). Le plan ne l'imposait pas mais la suite Vitest l'exige pour tourner.
- **Aucune modification de `scripts/deploy-functions.sh`** : le script balaie deja `supabase/functions` dynamiquement (seuls `main`/`hello` sont exclus) — prouve par `--list` + deploiement reel.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Commande verify tache 2 inexistante (`--dry-run`)**
- **Found during:** Task 2 (verification)
- **Issue:** Le plan demandait `sh scripts/deploy-functions.sh --dry-run | grep refresh-calendrier-ref`, mais le script ne connait que `--list` (verifie : seul `--list` est branche ; `--dry-run` lancerait un deploiement reel). Affirmation verifiee par lecture du script (§2.7I), pas supposee.
- **Fix:** Verification par `sh scripts/deploy-functions.sh --list | grep refresh-calendrier-ref` (1 ligne) + deploiement reel prouvant la copie (main/hello preserves, 0 obsolete supprimee).
- **Files modified:** aucune (script inchange, a raison)
- **Verification:** `--list` cite la fonction ; runtime contient `refresh-calendrier-ref` + `main` + `hello`
- **Committed in:** `4cc9d85` (preuve en SUMMARY, pas de commit supplementaire)

---

**Total deviations:** 1 auto-fix (Rule 3, commande de verification du plan).
**Impact on plan:** Aucun scope creep. Le script de deploiement reste intact ; seule la commande de preuve change.

## Issues Encountered

- **Suite SQL 0016 en echec (`test-db.sh` : 29/30)** — meme echec documente en 01-01 (obsolescence forward-only : insertion manuelle d'un second Perso violee par `event_calendars_perso_owner_unique` du trigger 0085, ligne 161). Inchange par 0086/0087 ; la preuve du nouveau monde reste due au plan 01-04 (suite 0017).
- **Commit sur `main` (branche protegee)** : meme situation qu'en 01-01 — dispatch explicite de l'orchestrateur (`sequential executor on main working tree, normal git commits`), historique du depot entierement sur `main`. Procede et trace ; aucun force-push, hooks executes normalement.
- **Commit sibling `31aff14` (plan 01-03) intercale** entre mes commits : vague parallele sur le meme arbre, hors de mon scope, laisse intact.

## User Setup Required

None - no external service configuration required.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: cron-tz-drift | supabase/migrations/0087_calendrier_refresh_cron.sql | Les planifications sont codees en GMT pour viser 04h Paris. Si `cron.timezone` change un jour, les jobs deriveront silencieusement (05h/06h Paris) — l'entete de migration porte la consigne, mais aucun test ne surveille `cron.timezone`. |

## Next Phase Readiness

- Pret pour 01-04 (suite 0017 : preuves D-01/D-02/D-05/D-08/D-14, qui levera l'echec 0016 attendu) et 01-03 (use-ref-days sur cache base, deja en cours en parallele — aucune collision : ce plan n'a touche aucun fichier applicatif).
- Pre-condition 01-04 a noter : 0016 reste rouge jusqu'a 0017 ; ne pas "reparer" 0016 (histoire forward-only).

---
*Phase: 01-calendrier*
*Completed: 2026-10-06*

## Self-Check: PASSED

- `supabase/migrations/0086_calendrier_category_guard.sql` FOUND (commis en 2703820)
- `supabase/migrations/0087_calendrier_refresh_cron.sql` FOUND (commis en daafbf7)
- `supabase/functions/refresh-calendrier-ref/index.ts` FOUND (commis en 4cc9d85)
- `supabase/functions/refresh-calendrier-ref/ref-days.ts` FOUND (commis en 4cc9d85)
- `supabase/functions/refresh-calendrier-ref/helpers.test.ts` FOUND (commis en 4cc9d85)
- Commits `2703820` + `4cc9d85` + `daafbf7` FOUND via `git log`
- Verifications : migrate 0086/0087 appliquees, statique vert, typecheck vert, Vitest helpers 4/4, deploy cite la fonction, jobs prouves au catalogue, test-db 29/30 (0016 obsolete documente)
