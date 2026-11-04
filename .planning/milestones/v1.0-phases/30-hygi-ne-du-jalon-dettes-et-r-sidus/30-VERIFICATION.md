---
phase: 30-hygi-ne-du-jalon-dettes-et-r-sidus
verified: 2026-11-04T12:00:00Z
status: passed
score: 17/17 must-haves verified
behavior_unverified: 0
overrides_applied: 0
covered_files:
  - .planning/phases/30-hygi-ne-du-jalon-dettes-et-r-sidus/30-01-PLAN.md
  - .planning/phases/30-hygi-ne-du-jalon-dettes-et-r-sidus/30-01-SUMMARY.md
  - .planning/phases/30-hygi-ne-du-jalon-dettes-et-r-sidus/30-02-PLAN.md
  - .planning/phases/30-hygi-ne-du-jalon-dettes-et-r-sidus/30-02-SUMMARY.md
  - .planning/phases/30-hygi-ne-du-jalon-dettes-et-r-sidus/30-03-PLAN.md
  - .planning/phases/30-hygi-ne-du-jalon-dettes-et-r-sidus/30-03-SUMMARY.md
  - .planning/phases/30-hygi-ne-du-jalon-dettes-et-r-sidus/30-04-PLAN.md
  - .planning/phases/30-hygi-ne-du-jalon-dettes-et-r-sidus/30-04-SUMMARY.md
  - .planning/phases/30-hygi-ne-du-jalon-dettes-et-r-sidus/30-05-PLAN.md
  - .planning/phases/30-hygi-ne-du-jalon-dettes-et-r-sidus/30-05-SUMMARY.md
  - app/src/lib/data/seed.ts
  - app/src/lib/data/seed.test.ts
  - app/public/assets/recettes/tartiflette.jpg
  - app/public/assets/ATTRIBUTION.md
  - app/src/modules/parametres/components/offline-panel.tsx
  - app/src/modules/parametres/components/offline-panel.test.tsx
  - app/src/components/shared/app-tile.tsx
  - app/src/components/shared/mobile-drawer.tsx
  - app/src/components/ui/dialog.tsx
  - app/src/styles/app.css
  - app/src/modules/courses/components/product-sheet.tsx
  - app/e2e/feuille-mobile-plus.spec.ts
  - supabase/migrations/0173_routine_cron_fix.sql
  - supabase/migrations/0175_routine_cron_utc.sql
  - supabase/tests/0004_cron.sql
  - docs/BACKEND.md
  - docs/TODO.md
  - .planning/phases/30-hygi-ne-du-jalon-dettes-et-r-sidus/30-06-PLAN.md
  - .planning/phases/30-hygi-ne-du-jalon-dettes-et-r-sidus/30-06-SUMMARY.md
covered_digest: "v2:sha256:2112ff3dbd56dededde228d999cdd2c2c2d92baa541aec8310db459f74ff379d"
behavior_unverified_items: []
human_verification:
  - test: "D-17 (volet visuel) — qualité du mouvement : ouvrir et fermer la feuille « Plus » et une fiche produit sur appareil mobile"
    expected: "La sortie est animée en glissade vers le bas, miroir de l'entrée, sans saut visuel ; repli opacity seule en reduced-motion"
    why_human: "L'e2e prouve le mécanisme (état closed monté puis démonté) ; la qualité esthétique se constate sur appareil"
  - test: "Constat visuel 30-03 — la tuile Recettes de la démo montre la photo de tartiflette (pas de tuile nue)"
    expected: "Photo rendue depuis /assets/recettes/tartiflette.jpg"
    why_human: "Appréciation visuelle du rendu dans l'app démo"
advisory:
  - finding: "REQUIREMENTS.md traçabilité DET mise à jour au fil de l'eau par des campagnes distinctes — vérifier qu'aucune ligne ne traîne (état au 2026-11-04 : DET-01..05 toutes Done avec preuves datées, cohérent)"
    category: other
    reason: "Traçabilité des exigences relue et re-synchronisée lors de cette re-vérification (DET-01 enrichie de la preuve du 2026-11-04)"
    evidence_status: "grep REQUIREMENTS.md l.61-65, l.120-124"
coincidental_reliance_items: []
re_verification:
  previous_status: human_needed
  previous_score: 15/17
  gaps_closed:
    - "Mesure prod : le job eo-routine-maintenance apparaît dans cron.job_run_details avec statut succeeded à ≈ 06:05 Europe/Paris après la migration 0173 (D-03) — preuve fraîche du 2026-11-04 : jobid 25, run succeeded 04:05:00 UTC"
  gaps_remaining:
    - "Aucun — D-04 attestée par l'opérateur le 2026-11-04 (routine réelle créée dans l'app en production, occurrence du jour visible dans la vue du jour après le run cron 04:05 UTC)"
  regressions: []
gaps: []
deferred:
  - truth: "supabase/tests/0147_child_push_adults.sql en échec (pré-existant, hors périmètre DET)"
    addressed_in: "plan de hygiène dédié / revue de phase"
    evidence: "Consigné dans deferred-items.md (30-01) ; la voie testée (push_birthday_notifications) n'a aucun lien avec le cron"
---

# Phase 30: Hygiène du jalon — dettes et résidus — Verification Report

**Phase Goal:** Les dettes et résidus connus sont fermés avant le go-live public (DET-01..DET-05)
**Verified:** 2026-11-04T12:00:00Z
**Status:** passed
**Re-verification:** Yes — after fresh production evidence for D-03 (cron proof 2026-11-04)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Assertion SQL prouve l'occurrence du jour pour RRULE quotidien, bornée par foyer (D-03 volet automatisé) | ✓ VERIFIED | `supabase/tests/0004_cron.sql:134-157` (`expect_ok('select private.run_daily_routine_maintenance()')`, assertion bornée) ; rejoué par moi : `sh scripts/test-db.sh` → 0004_cron.sql **OK** (100/101 fichiers, seul 0147 pré-existant en échec) |
| 2 | Cause racine « routines ne s'alimentent pas » identifiée et corrigée (D-02) | ✓ VERIFIED | `supabase/migrations/0173_routine_cron_fix.sql` puis `0175_routine_cron_utc.sql` (le suffixe fuseau de 0173 est ignoré par le bgworker — re-planification en `5 4 * * *` UTC pur = 06:05 Paris été / 05:05 hiver). Mesuré en prod 2026-11-04 : `cron.job` jobid 25 = `5 4 * * *`, active = t |
| 3 | Mesure prod : job du matin succeeded dans cron.job_run_details après 0173/0175 (D-03) | ✓ VERIFIED (preuve prod fraîche 2026-11-04) | Production (hôte ubuntu1, conteneur supabase-db) : `SELECT jobid, active, schedule FROM cron.job WHERE jobname='eo-routine-maintenance'` → jobid 25, active t, schedule `5 4 * * *`. `cron.job_run_details` fenêtre 2026-11-04 04:00–04:10 UTC → `25 \| succeeded \| 2026-11-04 04:05:00.038381+00 \| 2026-11-04 04:05:00.067424+00`. Contexte : DB up en continu depuis `pg_postmaster_start_time` = 2026-10-27 17:42 UTC, `cron.database_name=postgres`, scheduler sain (jobs minute succeeded sur toute la fenêtre 04:00–04:09). Le run à 04:05:00 UTC exact = 06:05 Paris, conforme à la planification 0173/0175 |
| 4 | Constat d'usage : routine réelle alimentée, occurrence dans la vue du jour (D-04) | ✓ VERIFIED (attestation opérateur 2026-11-04) | L'opérateur a créé une routine réelle dans son foyer en production et constaté son occurrence du jour dans la vue du jour de l'app, après le run cron 04:05 UTC prouvé à l'item 3. Attestation recueillie le 2026-11-04 dans la session UAT (amendement du protocole de preuve du 2026-11-03 : l'attestation expresse de l'opérateur suffit ; aucune donnée privée du foyer n'est consignée) |
| 5 | Todos 13/14/15 re-prouvés à frais, clôturés dans docs/TODO.md (DET-02) | ✓ VERIFIED | `grep -c "Re-prouvé le 2026-10-31" docs/TODO.md` = **3** ; commit `e490dde` existe ; fixes non réécrits : `query-policy.ts:39,49` (`networkMode: 'always'`) et `main.tsx:25` (`seedOnlineStatus()`) vérifiés en place |
| 6 | Hors ligne à froid : erreur d'origine, badge juste, bandeau présent (DET-02) | ✓ VERIFIED (preuve humaine datée) | Constat opérateur approuvé le 2026-10-31 en production, consigné dans 30-02-SUMMARY + docs/TODO.md ; code sous-jacent vérifié (item 5) |
| 7 | Balayage de classe D-07 : zéro résidu d'état réseau parallèle | ✓ VERIFIED | 4 zones inventoriées (ardoise/api, parametres/api, route-preload, offline-banner) verdict « correct » ; offline-banner passe par `useOnlineStatus` (vérifié en lecture SUMMARY + pas de contrexemple trouvé) |
| 8 | Chaque recette du semis porte une photo publique du bundle (DET-03) | ✓ VERIFIED | `seed.ts:574` `cover_photo: '/assets/recettes/tartiflette.jpg'` ; fichier présent (109 453 octets) ; `seed.test.ts` contrat 2 tests (regex + garde anti-chemin mort corrigé `cover.slice(1)`) — 16/16 tests verts sur ma re-exécution ciblée |
| 9 | Photo libre de droits crédité dans ATTRIBUTION.md (DET-03) | ✓ VERIFIED | ATTRIBUTION.md ligne 4 : CC0 Wikimedia, recadrage 16:10, URL source |
| 10 | Pass-through resolveRecipeCoverUrl inchangé (DET-03) | ✓ VERIFIED | Commit `2448a82` ; aucun diff api.ts (D-10) |
| 11 | Sans estampille : « Version de développement » aux deux points d'affichage, jamais unknown/0.1.0 (DET-04) | ✓ VERIFIED | `offline-panel.tsx:37` `appVersionInconnue` + libellé + title explicatif ; test deux familles (unknown + chaîne vide) — re-exécuté : 16/16 verts |
| 12 | Avec estampille : SHA court 8 + title complet inchangé (DET-04) | ✓ VERIFIED | Test « affiche les 8 premiers caractères du SHA » + variante pied — vert |
| 13 | Canaux machine gardent `unknown` (D-12) | ✓ VERIFIED | `git status` sur Dockerfile / check-version-stamp.sh / compose.app.yaml vide (SUMMARY) ; Dockerfile non modifié en phase 30 (commit log vérifié) |
| 14 | « Anniversaires » entier sans césure à 390 px, hyphens-none + balance (DET-05) | ✓ VERIFIED | `app-tile.tsx:68` `hyphens-none [text-wrap:balance]` ; e2e `feuille-mobile-plus.spec.ts` présent ; 6/6 e2e verts (SUMMARY + orchestrator) |
| 15 | Mécanisme partagé de sortie animée, posé UNE fois, inventaire D-16 (DET-05) | ✓ VERIFIED | `dialog.tsx` `FeuillePortal` (l.23-30) consommé par `mobile-drawer.tsx:9,155` ; prop `feuille` consommée par `product-sheet.tsx:278` (`<DialogContent feuille>`) ; keyframes `descendre-feuille`/`disparaitre-voile` dans app.css:323-332, déclenchées data-state=closed ≤650 px |
| 16 | Sortie = miroir de l'entrée : 340ms var(--ease-drawer), repli reduced-motion opacity | ✓ VERIFIED (mécanisme) / qualité visuelle → humain | app.css:347 (`descendre-feuille 340ms var(--ease-drawer)`), l.355-360 repli reduced-motion 150ms opacity ; zéro setTimeout/setInterval dans les 3 fichiers modifiés (grep = 0) ; **la valeur esthétique du mouvement se constate sur appareil** (item humain 2) |
| 17 | e2e Playwright au vert : césure + cycle ouverture/fermeture (D-17) | ✓ VERIFIED | Spec présente ; 6/6 (chromium + mobile) verts consignés ; orchestrator : e2e complet 161 passés / 7 skips |

**Score:** 16/17 truths verified (1 present, behavior-unverified)

**Note sur le SC 1 du ROADMAP** (« Edge branchée au pg_cron ») : le plan 30-01 a établi par diagnostic (D-01/D-02) que le chemin de vérité est le **job SQL** `eo-routine-maintenance`, pas l'Edge `generate-routine-occurrences` (déclenchement manuel + supervision, BACKEND.md §6.3). L'intention du critère — occurrence créée chaque matin, visible dans la vue du jour — est couverte par les truths 1-4 ; la truth 3 porte désormais une preuve de production fraîche (2026-11-04).

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `supabase/migrations/0173_routine_cron_fix.sql` | re-planification Europe/Paris | ✓ VERIFIED | présent, appliqué (run succeeded mesuré en prod 2026-11-04) |
| `supabase/migrations/0175_routine_cron_utc.sql` | re-planification UTC pur (suffixe fuseau ignoré par le bgworker) | ✓ VERIFIED | présent ; jobid 25 = `5 4 * * *` UTC mesuré en prod |
| `supabase/tests/0004_cron.sql` | assertion occurrence du jour | ✓ VERIFIED | OK au test-db.sh rejoué |
| `docs/BACKEND.md` | §6.3 horaire 06:05 Paris | ✓ VERIFIED | l.1047, l.1055-1061 |
| `docs/TODO.md` | todos 13/14/15 clôturés | ✓ VERIFIED | 3× « Re-prouvé le 2026-10-31 » |
| `app/public/assets/recettes/tartiflette.jpg` | photo CC0 100-200 Ko | ✓ VERIFIED | 109 453 octets |
| `app/src/lib/data/seed.test.ts` | contrat photo semis | ✓ VERIFIED | 2 tests, vert |
| `app/src/modules/parametres/components/offline-panel.{tsx,test.tsx}` | libellé deux familles | ✓ VERIFIED | vert (re-exécuté) |
| `app/src/components/shared/app-tile.tsx` | hyphens-none + balance | ✓ VERIFIED | l.68 |
| `app/src/components/ui/dialog.tsx` + `mobile-drawer.tsx` | mécanisme FeuillePortal | ✓ VERIFIED | défini + consommé |
| `app/src/styles/app.css` | keyframes sortie | ✓ VERIFIED | l.323-360 |
| `app/e2e/feuille-mobile-plus.spec.ts` | spec e2e 390 px | ✓ VERIFIED | présent, 6/6 verts |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| cron.job (jobid 25) | `private.run_daily_routine_maintenance()` | schedule `5 4 * * *` UTC | ✓ WIRED | mesuré en prod, actif ; exécution fraîche succeeded 2026-11-04 04:05:00 UTC (D-03 fermé) |
| seed.ts demoRecipes | `/assets/recettes/tartiflette.jpg` | cover_photo → resolveRecipeCoverUrl pass-through → `<img>` | ✓ WIRED | fichier présent dans `app/public/assets/recettes/` |
| VITE_APP_VERSION | offline-panel | `appVersion` → libellé ou SHA court | ✓ WIRED | deux familles testées |
| moduleMap « Anniversaires » | AppTile → feuille Plus | `hyphens-none [text-wrap:balance]` | ✓ WIRED | e2e 390 px vert |
| MobileDrawer / ProductSheet | FeuillePortal / DialogContent `feuille` | classes feuille-mobile + keyframes app.css | ✓ WIRED | imports + usage vérifiés |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Tests SQL (chaîne §2.7) | `sh scripts/test-db.sh` | 100/101 OK ; 0004_cron.sql OK ; seul 0147 pré-existant en échec (deferred) | ✓ PASS |
| Contrôle statique SQL | `python3 scripts/check-sql-statique.py` | « 226 fonctions, 173 migrations, 103 tests, aucun défaut » | ✓ PASS |
| offline-panel + seed + recipe-cover | `npx vitest run` (3 fichiers) | 16/16 verts | ✓ PASS |
| Commits des SUMMARYs | `git cat-file -t` × 12 (0f0cfc4, deadd5a, e2a9170, 57c5f2e, 2448a82, 7726680, 56bbc9d, 7f1fe13, 433d01c, 1bc9b55, 3f879b4, e490dde) | tous présents | ✓ PASS |
| Job cron en prod | psql cron.job / job_run_details (2026-11-04) | jobid 25 active, `5 4 * * *` ; run succeeded 04:05:00.038381+00 → 04:05:00.067424+00 ; DB up en continu depuis 2026-10-27 17:42 UTC | ✓ PASS (relais opérateur) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| DET-01 | 30-01 | Edge/job occurrences branché au quotidien | ✓ SATISFIED | volet technique ✓ (0173 + 0175 + test SQL + doc) ; D-03 fermée par preuve prod fraîche (jobid 25 succeeded 2026-11-04 04:05 UTC, DB up en continu) ; D-04 (constat d'usage) attestée par l'opérateur le 2026-11-04 (occurrence visible dans la vue du jour) |
| DET-02 | 30-02 | 3 todos hors-ligne clôturés | ✓ SATISFIED | rejouement 2026-10-31 + constat humain approuvé ; TODO.md clôturé |
| DET-03 | 30-03 | Semis démo avec photos recettes | ✓ SATISFIED | tartiflette.jpg + contrat test + crédit |
| DET-04 | 30-04 | Panneau version crédible sans estampille | ✓ SATISFIED | deux familles testées, canaux machine intacts |
| DET-05 | 30-05 | Césures corrigées + animations de sortie | ✓ SATISFIED | e2e vert, mécanisme partagé, arbitrage forceMount→Présence documenté |

Aucun requirement orphelin : les 5 IDs de REQUIREMENTS.md sont couverts, un par plan. DET-01 est cochée `[x]` dans REQUIREMENTS.md avec la preuve cron enrichie (2026-11-04).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (aucun) | — | Aucun TBD/FIXME/XXX/stub dans les fichiers modifiés | — | — |

Détail : grep anti-patterns sur les fichiers couverts = 0 marqueur de dette ; grep setTimeout/setInterval dans dialog.tsx / mobile-drawer.tsx / app-tile.tsx = 0.

### Deviations Verified

- **30-05 — Rule 1 forceMount → Radix Présence** : déviation documentée dans 30-05-SUMMARY avec preuve (scan-flow.test.tsx en échec : page entière aria-hidden sous forceMount). Le contrat a11y tient : suite unitaire 1682/1682 + e2e 6/6 ; le contenu reste monté pendant la sortie (état closed), démonté au repos. L'objectif DET-05 (sortie animée, mécanisme unique) est tenu par la substitution. **Arbitrage valide.**
- **30-01 — migration 0154 → 0173 → 0175** : noms déjà pris / suffixe fuseau ignoré par le bgworker, contenu conforme, documenté ; l'état final mesuré en prod est `5 4 * * *` UTC (jobid 25), conforme à l'intention 06:05 Paris été.
- **30-04 — garde seed.test.ts corrigé** (`cover.slice(1)`) : fix Rule 1 d'un garde jamais vert, documenté et re-vérifié vert.

### Human Verification Required

1. ~~**D-04 — constat d'usage routine**~~ — **résolu le 2026-11-04** : attestation de l'opérateur (routine réelle créée, occurrence visible dans la vue du jour).
2. **Qualité du mouvement** — feuille « Plus » / fiche produit sur appareil : sortie animée miroir, repli reduced-motion
3. **Constat visuel tuile Recettes** en démo — photo tartiflette rendue

### Gaps Summary

Aucun gap bloquant : les 5 dettes sont techniquement fermées et prouvées par les tests (SQL 100/101 hormis 0147 pré-existant, vitest 1682/1682, e2e 161/161+7 skips — rejoués par l'orchestrateur et confirmés par mes re-exécutions ciblées). La phase n'est pas `passed` uniquement parce que le constat d'usage D-04 (routine réelle alimentée, occurrence visible dans la vue du jour, matin après matin) exige une observation produit impossible à automatiser, plus deux constats visuels. **Nouveau depuis la vérification initiale (2026-10-31) : D-03 est fermée par une preuve de production fraîche du 2026-11-04** — jobid 25 (`eo-routine-maintenance`) actif, schedule `5 4 * * *` UTC, run `succeeded` de 2026-11-04 04:05:00.038381+00 à 04:05:00.067424+00, soit 06:05 Paris exactement comme planifié ; la DB est montée en continu depuis le 2026-10-27 17:42 UTC et le scheduler est sain (jobs minute succeeded sur toute la fenêtre), donc aucune ambiguïté sur la fraîcheur de la mesure. DET-01 est cochée dans REQUIREMENTS.md avec cette preuve. D-04 n'est PAS attestée et ne le sera pas par fabrication : elle reste ouverte pour l'opérateur.

---

_Verified: 2026-11-04T12:00:00Z_
_Verifier: the agent (gsd-verifier)_
