---
gsd_state_version: "1.0"
milestone: v1.5
milestone_name: Audit complet & durcissement
status: planning
last_updated: "2026-11-12T08:52:48.516Z"
last_activity: 2026-11-12
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-12)

**Core value:** PWA foyers — l'app de poche du quotidien familial, fiable hors-ligne, joignable en un tap, sans store.
**Current focus:** Jalon v1.4 complet — CACHE-01 différée honnêtement, reprise de campagne quand l'appareil de référence est accessible

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-11-12 — Milestone v1.5 started

## Performance Metrics

- v1.1 : 4 phases, 25 plans, 17 tasks, 145 commits, audit tech_debt 16/16
- v1.2 : 2 phases, 5 plans, 6 exigences, audit tech_debt 6/6
- v1.3 : 5 phases (38-42), 12 exigences, 13 plans — audit tech_debt 10/12 (2 deferred : COLD-02, CACHE-01)
- v1.4 : 2 phases (43-44), 11 exigences (PROOF-01..07, CACHE-01..04) — en cours

**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 43 P01 | 5h | 3 tasks | 2 files |
| Phase 44 P01 | 11 min | 3 tasks | 1 files |
| Phase 44 P02 | 1h55 | 3 tasks | 1 file |

## Accumulated Context

### Decisions (this milestone)

- Ordre des phases = ordre de **risque**, pas de dépendance : aucune dépendance croisée W1/CACHE-01. W1 en premier car aucune dépendance appareil (stack prod + accès SQL suffisent) ; CACHE-01 en second car bloquée sur la disponibilité physique de l'appareil de référence (différée deux fois en v1.3 pour cette raison). Parallélisable si l'appareil se libère tôt.
- Script sœur `scripts/test-ardoise-bridge-real.sh` (convention du dépôt : un script par preuve à ressource réelle) — recommandation tranchée par la recherche contre l'extension inline de `test-join-token-real.sh` (couplage des deux jambes rendrait le verdict ambigu, §2.7 F).
- Zéro nouveau paquet, zéro nouveau service : W1 = sh + curl -K + psql.sh stdin + lib-smoke-accounts.sh ; CACHE-01 = édition déclarative d'`OFFLINE_FAMILIES` dans `query-policy.ts`. `experimental_createQueryPersister` refusé (casserait outbox, namespacing D-03, throttle muté).
- Statu quo justifié = décision CACHE-01 valide (CA-03) ; les critères §5 (b)(c) tranchent, jamais la lecture du panneau seule (biais d'ordre — le maxAge en vigueur détermine le volume observé).
- Déféré au backlog : W2 (spec navigateur du flux bridge, si PROOF-07 révèle un seam au-delà du scénario déclenché), GATE-01 (observatoire), COLD-02 (périmètre distinct).
- [Phase 44] Différé de campagne consigné honnêtement (2026-11-12) : accès à l'environnement de mesure absent en session — aucune valeur inventée, aucun émulateur, code inchangé ; la reprise se fait au même protocole (N=5, purge §2.1, dictée des panneaux), squelettes prêts dans `docs/MESURES-COLD-START-42.md`.
- [Phase 44] Repli checkpoint = repli produit : la clause « Si NON » du plan (différé tracé, PROJECT.md intouché) est le critère de succès 1, pas un échec — verdict du vérificateur 10/10.

### Todos

- Rejouer GATE-01 (tests 32-UAT 7 et 35-UAT 2) lors de la prochaine mise en production naturelle — observatoire hors jalon.
- Purger à la main les 3 comptes e2e résiduels de runs antérieurs (e2e+1794223918703512-1/-2, e2e+1794223911703118-1) — signalés par le script, jamais supprimés par lui (borne : comptes du run uniquement).

### Blockers

- Phase 44 : machine on-device (appareil de référence) requise pour la campagne N=5 et toute décision maxAge — toujours bloquant : la campagne 44-02 a été différée faute d'accès à l'environnement de mesure (2026-11-12). L'outillage est prêt, la reprise ne demande que l'appareil.

## Session Continuity

**Last session:** 2026-11-12T08:20:00Z
**Stopped at:** Jalon v1.4 complet — phases 43-44 closes, CACHE-01 différée honnêtement, reprise de campagne quand l'appareil est accessible
**Resume file:** None

- Phase 44 close (44-01 préparatoire + 44-02 différé consigné, chaîne §2.7 verte CHAINE-44-VERTE, verification passed 10/10, UAT 3/3) — voir PROJECT.md « État courant ».
- Exigences : PROOF-01..07 ✓ (Phase 43) ; CACHE-02..04 ✓ (44-01) ; CACHE-01 → différée honnêtement (critère de succès 1), reprise au protocole §6.
- Prochain pas : `/gsd-complete-milestone` pour archiver v1.4, ou reprise de campagne quand l'appareil de référence sera disponible.

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone

## Decisions

- [Phase 43]: Négatif replay épinglé à l'observable réel 410 « révoqué » (is_active vérifié avant use_count dans 0181)
- [Phase 43]: config_session à étiquette unique — aucun compteur global en substitution de commande (sous-shell)
- [Phase 43]: householdId explicite sur create-ardoise du foyer B (households[0] sinon)
- [Phase 44]: Verdict D-15 : le panneau offline existant suffit pour les critères (a) et (c) par famille — observabilité conditionnelle D-14 non déclenchée, jamais préventive

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| debug_sessions | 35-07-probe-offline-not-flipping | diagnosed | 2026-11-12 | v1.4 |
| debug_sessions | courses-offline-create-bypasses-outbox | diagnosed | 2026-11-12 | v1.4 |
| debug_sessions | dispatch-push-401 | diagnosed | 2026-11-12 | v1.4 |
| debug_sessions | dlnk02-android-cold-start-offline | investigating | 2026-11-12 | v1.4 |
| uat_gaps | 43/43-UAT.md | unknown | 2026-11-12 | v1.4 |
| uat_gaps | 39/39-UAT.md | testing | 2026-11-12 | v1.4 |
| uat_gaps | 37/37-UAT.md | passed | 2026-11-12 | v1.4 |
| uat_gaps | 34/34-UAT.md | passed | 2026-11-12 | v1.4 |
| uat_gaps | 35/35-UAT.md | partial | 2026-11-12 | v1.4 |
| uat_gaps | 27/27-UAT.md | deferred_tests_to_phase_28 | 2026-11-12 | v1.4 |
| uat_gaps | 21/21-UAT.md | unknown | 2026-11-12 | v1.4 |
| uat_gaps | 22/22-UAT.md | unknown | 2026-11-12 | v1.4 |
| uat_gaps | 23/23-UAT.md | unknown | 2026-11-12 | v1.4 |
| uat_gaps | 24/24-UAT.md | unknown | 2026-11-12 | v1.4 |
| verification_gaps | 32/32-VERIFICATION.md | human_needed | 2026-11-12 | v1.4 |
| verification_gaps | 35/35-VERIFICATION.md | human_needed | 2026-11-12 | v1.4 |
| verification_gaps | 16/16-VERIFICATION.md | human_needed | 2026-11-12 | v1.4 |
| verification_gaps | 17/17-VERIFICATION.md | human_needed | 2026-11-12 | v1.4 |
| verification_gaps | 18/18-VERIFICATION.md | human_needed | 2026-11-12 | v1.4 |
| deferred_items | 39/deferred-items.md: 2026-11-09 — plan 39-01  - **Échec unitaire préexistant** (hors périmètre, non corrigé) : `app/src/modules/calendrier/calendrier-page.test… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 39/deferred-items.md: 2026-11-09 — plan 39-02  - **Échec unitaire préexistant, inchangé** (hors périmètre, non corrigé) : `app/src/modules/calendrier/calendrier… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 40/deferred-items.md: 1. Test calendrier préexistant en échec (hors périmètre 40-01)  - **Fichier :** `app/src/modules/calendrier/calendrier-page.test.tsx` - **… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 36/deferred-items.md: [préexistant, hors périmètre 36] e2e `rejoindre un foyer valide le format du token` rouge avant la phase  - **Constaté pendant :** 36-02, … | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 37/deferred-items.md: 1. Flocon sibling découvert en clôture — household-store.test.ts WR-03 (hors périmètre TEST-01)  - **Découvert pendant :** plan 37-02, re-… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 32/deferred-items.md: Hors périmètre (pré-existants, non touchés par 32-01)  - **2 tests rouges dans `app/src/modules/anniversaires/anniversaires-page.test.tsx`… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 33/deferred-items.md: 33-01 — Échecs de test préexistant (hors périmètre, Rule SCOPE BOUNDARY)  **Découvert pendant :** Task 3 (tracer offline) — `npm test` com… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 34/deferred-items.md: 2026-11-05 (plan 34-02)  - **2 tests préexistants en échec sur `app/src/modules/anniversaires/anniversaires-page.test.tsx`** (« bascule en… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 34/deferred-items.md: 34-03 (2026-11-05)  - `app/src/components/ui/route-error.tsx:128` garde un `window.addEventListener('online', …)` préexistant (retry d'Err… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 35/deferred-items.md: 2026-11-06 — 35-01 (hors périmètre, constaté, non corrigé)  - **e2e `critical-paths.spec.ts` « rejoindre un foyer valide le format du toke… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 35/deferred-items.md: 2026-11-06 — 35-02 (résultats Échoué de la matrice multi-OS, travaux correctifs ouverts)  Constats issus de la consignation `35-VALIDATION… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 35/deferred-items.md: 2026-11-07 — 35-09 (hors périmètre, constaté, non corrigé)  - **`auth-bootstrap-offline.test.tsx` test D (« monte l'application hors-ligne… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 25/deferred-items.md: test 0139 : assertion de backfill non bornée (préexistant, hors périmètre 25-01)  - **Découvert pendant :** plan 25-01, exécution de la su… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 25/deferred-items.md: Résolu pendant 25-04 (pour mémoire)  - **test 0139 (ci-dessus) : CORRIGÉ pendant 25-04** — l'assertion globale `v_count = 4` a été remplac… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 25/deferred-items.md: Résolu le 2026-10-26 (suite) — familles A/B, D-01 storage, 0053 (barrière 83/83)  Les sections « Ouvert » ci-dessous sont **toutes résolue… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 29/deferred-items.md: 2026-10-29 (29-01)  - **test 0147_child_push_adults.sql en échec préexistant** — « anniversaire enfant : annonce a chaque adulte du foyer … | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 29/deferred-items.md: 2026-10-29 (29-02)  - **0147 toujours en échec** (même signature qu'en 29-01) — seul échec restant de `test-db.sh` (1/101) ; inchangé par … | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 29/deferred-items.md: 2026-10-29 (29-03, exécution) - Hors périmètre, observation : `scripts/test-dispatch-push.sh` (et d'autres scripts du dépôt ?) portent des… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 30/deferred-items.md: 30-01  - **[Pré-existant, hors périmètre] `supabase/tests/0147_child_push_adults.sql` échoue** : assertion « anniversaire enfant : annonce… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 31/deferred-items.md: `app/src/modules/anniversaires/anniversaires-page.test.tsx` — bascule liste/calendrier ; point d'un anniversaire d'origine anniversaire co… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 31/deferred-items.md: `app/src/modules/anniversaires/components/birthday-confetti.test.tsx` — accueille le jour J par la pluie | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 31/deferred-items.md: `app/src/modules/calendrier/calendrier-page.test.tsx` — ajout via dialogue ; appui long sur une date ; sélection met à jour l'agenda | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 31/deferred-items.md: `app/src/modules/courses/off-client.test.ts` — retourne null après timeout (repli manuel) | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 09/deferred-items.md: 1. Time-of-day flake: `use-notifications.test.tsx` (3 tests)  - **Found during:** 09-07 Task 3 full-suite gate (2026-10-12, ~08:25 Paris).… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 18/deferred-items.md: 1. `setWidgetOrder` insère une seconde série de widgets quand la lecture n'est pas chargée  - **Fichier :** `app/src/modules/dashboard/hoo… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 18/deferred-items.md: 2. Tests e2e périmés (échecs préexistants, sans rapport avec 18-01)  Mesuré sur la chaîne complète : **4 échecs, 117 passés, 5 ignorés** (… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 18/deferred-items.md: 3. Classe WR-02 hors périmètre : les autres corbeilles admin-seules (relevé pendant 18-03)  Le plan 18-03 ferme la classe pour les politiq… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 18/deferred-items.md: 4. La reprise d'amorçage rétablit la session mais pas le foyer (relevé pendant 18-04)  - **Fichiers :** `app/src/stores/session-store.ts:2… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 18/deferred-items.md: 5. `placePhotoPathOf` ne normalise pas une valeur blanche (relevé pendant 18-05)  - **Fichiers :** `app/src/modules/adresses/api.ts` (`pla… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 18/deferred-items.md: 6. L'en-tête de `STATE.md` porte encore un pointeur global périmé (relevé pendant 18-06)  - **Fichier :** `.planning/STATE.md`, frontmatte… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 18/deferred-items.md: 7. Script de mesure Playwright non suivi à la racine de `app/` (relevé pendant 18-06)  - **Fichier :** `app/shot-toggle-on.mjs` (39 lignes… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 18/deferred-items.md: Clôture des escalades §1 et §4 (plan 18-06)  Les deux escalades qui motivaient ce registre sont **fermées** par le plan 18-06, et par lui … | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 19/deferred-items.md: 1. `compressImage` refuse un fichier dont le `type` est vide, même quand sa seule extension l'identifie  - **Fichier :** `app/src/modules/… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 19/deferred-items.md: 2. Deux consommateurs de `NoteAttachment.url` n'appartiennent à aucun plan de la phase  - **Fichiers :** `app/src/modules/notes/notes-page… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 19/deferred-items.md: 3. Un `enfant` peut encore ouvrir le dialogue de création par un appui long sur la grille  - **Fichiers :** `app/src/modules/calendrier/ca… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 19/deferred-items.md: 4. Une ligne de `use-notifications.ts` porte deux instructions (défaut de forme préexistant)  - **Fichier :** `app/src/hooks/use-notificat… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 19/deferred-items.md: 5. Le memo `items` se recalcule à chaque rendu quand la session n'est pas connectée (cause amont, préexistante)  - **Fichiers :** `app/src… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 19/deferred-items.md: 6. `recettes.spec.ts:181` est instable sous la charge de la suite entière  - **Fichier :** `app/e2e/recettes.spec.ts:181` (« enfant : togg… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 19/deferred-items.md: 7. La redirection de `RequireAuth` perd la requête, et rien ne lit `?token=`  - **Fichiers :** `app/src/app/router.tsx:34` (`state={{ from… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 19/deferred-items.md: 8. L'accroche de la landing annonce « Seize espaces » et en rend dix-sept  - **Fichier :** `app/src/modules/landing/landing-page.tsx:124` … | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 19/deferred-items.md: 9. Trois fichiers non suivis traînent à la racine du dépôt  - **Fichiers :** `.claude/`, `.gsd/`, `app/shot-toggle-on.mjs`. - **Constat :*… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 19/deferred-items.md: 10. Le parcours invité de l'Ardoise servait `cover_url` brut — **CLOS par 19-14** (2026-10-16)  > **CLOS le 2026-10-16 (plan 19-14, `39b0c… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 19/deferred-items.md: 11. `use-notifications.test.tsx` échoue par expiration (4 cas) — préexistant, hors plan 19-11  - **Fichier :** `app/src/hooks/use-notifica… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 19/deferred-items.md: 12. Décompte de `npm test` : 4 échecs préexistants, à ne pas attribuer à 19-11  - **Base au commit 86944da :** conforme au plan, **132 fic… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 19/deferred-items.md: 15. Le formulaire « Rejoindre un foyer » ne lit toujours pas `?token=` — reste de §7  - **Fichiers :** `app/src/modules/landing/join-house… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 19/deferred-items.md: 16. `recettes.spec.ts:159` instable sous la charge de la suite e2e entière (classe de §6)  - **Fichier :** `app/e2e/recettes.spec.ts:159` … | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 19/deferred-items.md: `Europe/Paris` — 2026-10-16 00:27 — **4 échoués**, 10 passés | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 19/deferred-items.md: `Pacific/Midway` — 2026-10-15 11:23 — **14 passés**, 4,4 s | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 21/deferred-items.md: `supabase/tests/0001_schema_contract.sql:52` — le contrat de schéma déclare les colonnes de `recipe_steps` comme `['id','recipe_id','house… | acknowledged | 2026-11-12 | v1.4 |
| deferred_items | 21/deferred-items.md: `app/e2e/recettes.spec.ts:270` — le test « dépôt, image sur les trois surfaces, puis aperçu mort masqué après rechargement » est **instabl… | acknowledged | 2026-11-12 | v1.4 |
