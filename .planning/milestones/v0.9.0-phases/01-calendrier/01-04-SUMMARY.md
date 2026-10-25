---
phase: 01-calendrier
plan: 04
subsystem: testing
tags: [postgres, rls, playwright, vitest, calendrier, pg-cron, vault]

# Dependency graph
requires:
  - phase: 01-calendrier-01
    provides: "Socle Perso invisible-total Option B + trigger Perso auto (0084/0085)"
  - phase: 01-calendrier-02
    provides: "Garde catégories 23514 (0086) + dispatch Vault et jobs cron (0087) + Edge refresh"
  - phase: 01-calendrier-03
    provides: "Frontend verrouillé (couches ref, choix explicite, mapping cache base) + unitaires 39/39"
provides:
  - "Suite SQL 0017 : preuves D-01/D-02/D-05/D-08/D-14 (admin-denied Perso, auto, garde, catalogue cron)"
  - "Spec e2e calendrier : 12 tests deux contextes, couches ref, choix explicite"
  - "Chaîne §2.7 complète verte et datée (0016 obsolète excepté)"
affects: [01-verify, 02-ardoise]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 5400
  tasks: 3
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns: [sql-negative-proof-with-positive-witness, demo-mode-two-context-e2e, prefix-anchored-aria-label]

key-files:
  created:
    - supabase/tests/0017_calendrier_phase.sql
    - app/e2e/calendrier.spec.ts
  modified: []

key-decisions:
  - "Filet de modération 0084 INERTE en pratique : PostgreSQL conditionne UPDATE/DELETE au passage des politiques SELECT, donc l'admin ne supprime pas ce qu'il ne voit pas — prouvé par des 0, pas des +1"
  - "Unitaires use-ref-days déjà complets en 01-03 : aucun edit, constat documenté"
  - "e2e calendrier en mode démo (convention du dépôt) : l'invisibilité serveur reste prouvée par 0017, le spec prouve l'observable"

patterns-established:
  - "Preuve négative avec témoin positif : l'owner lit son event (count 1) avant que l'admin compte 0 — un zéro sans témoin serait une absence, pas une invisibilité"
  - "Assertion lue sur l'implémentation : les planifications 0087 réelles (0 3 / 0 2 GMT) et le cran SELECT-gating ont été lus en base avant d'être assertés"

requirements-completed: [D-01, D-02, D-05, D-08, D-09, D-10, D-14]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Perso invisible à l'admin en lecture/modification/suppression effective + témoin owner (D-01)"
    requirement: "D-01"
    verification:
      - kind: other
        ref: "sh scripts/test-db.sh 0017_calendrier_phase (OK, 2026-10-06)"
        status: pass
      - kind: e2e
        ref: "app/e2e/calendrier.spec.ts#le perso du contexte A est invisible dans les vues et filtres de B"
        status: pass
    human_judgment: false
  - id: D2
    description: "Perso auto par adulte (existant + dynamique), aucun pour enfant (D-02/D-05)"
    requirement: "D-02"
    verification:
      - kind: other
        ref: "sh scripts/test-db.sh 0017_calendrier_phase (OK, 2026-10-06)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Garde catégories 23514 explicite (rename/delete utilisée), libre modifiable (D-08)"
    requirement: "D-08"
    verification:
      - kind: other
        ref: "sh scripts/test-db.sh 0017_calendrier_phase (OK, 2026-10-06)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Catalogue cron : 2 jobs base courante, planifications GMT réelles, Vault + apikey, commandes nues (D-14)"
    requirement: "D-14"
    verification:
      - kind: other
        ref: "sh scripts/test-db.sh 0017_calendrier_phase (OK, 2026-10-06)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Couches ref sans interrupteur + férié visible, appui long et + avec date pré-remplie, vide refusé (D-09/D-10/D-03/D-11)"
    requirement: "D-09"
    verification:
      - kind: e2e
        ref: "app/e2e/calendrier.spec.ts (6/6 chromium + 6/6 mobile, 2026-10-06)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Mapping lignes base vers objets métier + maintien des dernières données en panne (D-13/D-15)"
    requirement: "D-13"
    verification:
      - kind: unit
        ref: "app/src/modules/calendrier/hooks/use-ref-days.test.tsx (8 tests, 2026-10-06)"
        status: pass
    human_judgment: false

# Metrics
duration: 20min
completed: 2026-10-06
status: complete
---

# Phase 01 Plan 04: Preuves et gate Summary

**Suite SQL 0017 prouvant le Perso invisible, l'auto et la garde côté serveur, spec e2e 12 tests deux contextes, et chaîne §2.7 complète verte — la phase calendrier est prouvée, pas déclarée**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-10-06T11:44:32Z
- **Completed:** 2026-10-06T12:01:13Z
- **Tasks:** 3/3 (tâche 3 vérification seule, sans commit — précédent 01-01 tâche 1)
- **Files modified:** 2 (2 créés, 0 modifiés)

## Accomplishments

- `supabase/tests/0017_calendrier_phase.sql` — 20+ assertions : admin-denied Perso select/update/delete-effectif + témoin owner, Perso auto existant et dynamique (adulte 1/enfant 0), garde 23514 explicite, catalogue cron complet (jobs GMT réels, Vault, apikey).
- `app/e2e/calendrier.spec.ts` — 6 tests × 2 projets (chromium + mobile) : toggles ref absents, férié visible sans interrupteur, appui long et bouton + avec date pré-remplie, vide refusé à 2 calendriers, Perso du contexte A invisible en B.
- Chaîne §2.7 datée : typecheck vert, Vitest 544/544, build vert, e2e 63 passed/5 skipped, statique vert (132 fonctions), test-db 30/31 (seul 0016 rouge, obsolète documenté).
- Unitaires `use-ref-days` vérifiés complets sans edit : helpers, mapping, stale-en-panne, zéro fetch direct.

## Task Commits

Chaque tâche à changement a été commise atomiquement :

1. **Task 1: Suite SQL 0017 preuves D-01 D-02 D-05 D-08 D-14** - `03e0ba0` (test)
2. **Task 2: Spec e2e deux comptes et extensions unitaires mapping** - `ed4002d` (test)
3. **Task 3: Chaine complete de verification avant cloture** - sans commit (vérification seule, aucun fichier touché)

**Plan metadata:** commit docs de ce SUMMARY (voir log).

## Files Created/Modified

- `supabase/tests/0017_calendrier_phase.sql` — preuves serveur per D-01/D-02/D-05/D-08/D-14, marque `Zzzz`, rollback sans résidu, 0016 inchangé.
- `app/e2e/calendrier.spec.ts` — preuve observable per D-01/D-09/D-10/D-03/D-11, convention démo du dépôt, 12/12 vert.

## Decisions Made

- **Filet de modération 0084 INERTE, prouvé par des 0 (découverte §2.7D.1) :** ma première assertion (`affected = 1` pour le delete admin d'un event Perso) a échoué ; le plan EXPLAIN montre le filtre réel `USING-du-delete AND SELECT` — PostgreSQL conditionne tout UPDATE/DELETE au passage des politiques SELECT. L'admin ne supprime donc pas ce qu'il ne voit pas, bien que `events_delete_admin` / `event_calendars_delete` l'autorisent sur le papier. La suite assert 0 affecté pour les deux suppressions, avec le mécanisme documenté en entête. Rendre la modération réelle exigerait un RPC SECURITY DEFINER dédié : hors plan (comportement décidé en gate 01-01), à trancher en phase suivante — ni implémenté ni « réparé » ici (forward-only, Rule 4 respectée par abstention).
- **Libellé du plan corrigé par l'implémentation, pas l'inverse :** le plan demandait « l'admin se voit refuser suppression » puis une garde 0086-compatible ; l'implémentation 0084 voulait un filet. L'observable tranche : suppression refusée *en effet*. Le SUMMARY 01-01 et l'entête 0084 restent historiquement exacts sur l'intention, faux sur l'effet — signalé ici plutôt que tu.
- **Unitaires sans edit (constat, pas écart) :** le plan supposait `use-ref-days.test.ts` à étendre ; 01-03 l'a déjà fait (`.tsx`, mapping + stale + garde réseau, 8 tests). Vérifié (grep : zéro fetch direct, que le garde-fou « réseau coupé »), rien à ajouter.
- **`test-dispatch-push.sh` non joué :** il cible le dispatch push-notify (pg_net/Vault/live), inchangé par cette phase ; le dispatch calendrier est couvert au catalogue par 0017 (Vault lu, apikey, commandes nues).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Assertion de modération inversée par l'observable (témoin EXPLAIN)**
- **Found during:** Task 1 (premier run 0017 : `filet de moderation … attendu 1, obtenu 0`)
- **Issue:** Le plan affirmait une suppression admin possible ; l'implémentation + PostgreSQL disent le contraire (SELECT-gating).
- **Fix:** Debug en 6 itérations (uid OK, is_admin=t, USING=t à la main, EXPLAIN décisif), assertion corrigée vers `0` affecté pour events ET event_calendars, mécanisme documenté en entête de suite.
- **Files modified:** supabase/tests/0017_calendrier_phase.sql (nouveau fichier, pas de migration touchée)
- **Verification:** `sh scripts/test-db.sh 0017_calendrier_phase` OK ; full 30/31 (0016 seul rouge, attendu)
- **Committed in:** `03e0ba0` (commit de tâche 1)

**2. [Rule 3 - Blocking] Locators e2e sur libellés exacts + build démo sans backend**
- **Found during:** Task 2 (6/6 rouges d'abord, puis 3/6)
- **Issue:** (a) `getByLabel('Calendrier', exact)` introuvable : Field suffixe le nom (`*`, `· optionnel`) ; (b) les `.env.*.local` gitignorés embarquent un backend `localhost:8000` dans le build preview, ce qui masque le bouton démo — les specs pré-existantes échouaient aussi (prouvé sur critical-paths).
- **Fix:** (a) `getByLabel(/^Calendrier/)` ancré préfixe ; (b) `.local` déplacés hors `app/` le temps du run (sauvegardés sous `/tmp/opencode`, restaurés et vérifiés après), serveur 4173 tué pour forcer le rebuild démo.
- **Files modified:** app/e2e/calendrier.spec.ts (a) ; environnement restauré à l'identique (b, hors git)
- **Verification:** 6/6 chromium + 6/6 mobile ; `.env.*.local` restaurés (`ls` + `git status` propre)
- **Committed in:** `ed4002d` (commit de tâche 2 ; (b) sans trace versionnée, documenté ici)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Aucun scope creep : une assertion alignée sur l'observable, des locators et un environnement de run corrigés. Aucune migration/Edge/frontend touché. Aucun package installé (registre T-01-SC sans objet).

## Issues Encountered

- **Suite 0016 toujours rouge (attendu, documenté 01-01/01-02/01-03) :** insertion manuelle d'un second Perso violant `event_calendriers_perso_owner_unique` du trigger 0085. Non réécrite (forward-only) ; 0017 la supersède comme preuve du nouveau monde.
- **Commit sur `main` (garde #3819) :** même situation qu'en 01-01/01-02/01-03 — dispatch explicite « sequential executor on main working tree, normal git commits », historique entier sur `main`. Procédé avec hooks, sans force-push.
- **Faux suspect initial (delete admin à 0) :** uid, is_admin et USING isolés tous vrais avant l'EXPLAIN décisif — leçon §2.7E : lire le plan d'exécution plutôt que d'empiler les hypothèses. Debugs temporaires sous `/tmp/opencode`, jamais commités.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: moderation-net-inerte | supabase/migrations/0084_calendrier_perso_total.sql (commentaire d'entête) | L'entête 0084 affirme un filet de modération admin (delete events/calendriers Perso) ; le SELECT-gating PostgreSQL le rend inerte pour les lignes invisibles (prouvé au plan EXPLAIN + suite 0017). Risque : contenu Perso problématique inexpurgeable en pratique. Option : RPC modération SECURITY DEFINER dédié, ou correction du commentaire 0084 vers l'avant — à trancher en phase suivante, pas ici. |
| threat_flag: none-new-surface | — | Aucune route, Edge, table ou politique ajoutée par ce plan (tests seuls). |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 01-clôture : toutes les décisions D-01…D-16 sont couvertes par une preuve automatisée verte (0017 + e2e 12/12 + unitaires 39/39 + 544/544 + build + statique). Seule réserve : 0016 rouge par obsolescence voulue.
- Suivi explicite : trancher le filet de modération inerte (RPC dédié vs commentaire corrigé) avant tout besoin réel de modération ; `test-dispatch-push.sh` reste dû si un changement touche un jour le dispatch calendrier en live (pas le cas ici).
- Prêt pour `/gsd-verify-work 01`.

---
*Phase: 01-calendrier*
*Completed: 2026-10-06*

## Self-Check: PASSED

- `supabase/tests/0017_calendrier_phase.sql` FOUND (commis en 03e0ba0)
- `app/e2e/calendrier.spec.ts` FOUND (commis en ed4002d)
- Commits `03e0ba0` + `ed4002d` FOUND via `git log`
- Verifications : statique vert (132 fonctions), test-db 0017 OK + full 30/31 (0016 attendu), typecheck vert, Vitest 544/544, build vert, e2e calendrier 12/12 + full 63 passed/5 skipped, `.env.*.local` restaurés
