---
phase: 33-cache-de-lecture-offline
verified: 2026-11-05T11:05:00Z
status: passed
uat: complete (4/4 pass, re-test 3 inclus)
score: 6/6 must-haves verified
behavior_unverified: 0
overrides_applied: 0
covered_files:
  - .planning/phases/33-cache-de-lecture-offline/33-01-PLAN.md
  - .planning/phases/33-cache-de-lecture-offline/33-01-SUMMARY.md
  - .planning/phases/33-cache-de-lecture-offline/33-02-PLAN.md
  - .planning/phases/33-cache-de-lecture-offline/33-02-SUMMARY.md
  - .planning/phases/33-cache-de-lecture-offline/33-03-PLAN.md
  - .planning/phases/33-cache-de-lecture-offline/33-03-SUMMARY.md
  - .planning/phases/33-cache-de-lecture-offline/33-04-PLAN.md
  - .planning/phases/33-cache-de-lecture-offline/33-04-SUMMARY.md
  - .planning/phases/33-cache-de-lecture-offline/33-05-PLAN.md
  - .planning/phases/33-cache-de-lecture-offline/33-05-SUMMARY.md
  - app/src/lib/offline/query-persistence.ts
  - app/src/lib/offline/query-persistence.test.ts
  - app/src/lib/query-policy.ts
  - app/src/lib/query-policy.test.ts
  - app/src/hooks/use-auth.ts
  - app/src/hooks/use-offline-stale-banner.ts
  - app/src/hooks/use-offline-stale-banner.test.ts
  - app/src/components/banners/offline-stale.tsx
  - app/src/components/banners/offline-stale.test.tsx
  - app/src/stores/session-store.ts
  - app/src/stores/session-store.test.ts
  - app/src/stores/household-store.ts
  - app/src/stores/household-store.test.ts
  - app/src/app/app-shell.tsx
  - app/e2e/offline-shared-device.spec.ts
  - scripts/check-sw-api-cache.sh
  - scripts/test-check-sw-api-cache.sh
  - app/fixtures/sw-bon.js
  - app/fixtures/sw-mauvais.js
  - docs/BACKEND.md
  - app/package.json
  - app/package-lock.json
  - .planning/phases/33-cache-de-lecture-offline/33-06-PLAN.md
  - .planning/phases/33-cache-de-lecture-offline/33-06-SUMMARY.md
  - app/src/lib/data/useResource.ts
  - app/src/lib/data/useResource.test.tsx
  - app/src/modules/courses/courses-offline.test.tsx
  - app/src/modules/taches/taches-offline.test.tsx
  - app/src/modules/voyages/hooks/use-voyages.ts
  - app/src/modules/voyages/hooks/use-trip-detail.ts
  - app/src/modules/calendrier/hooks/use-ref-days.ts
  - app/src/modules/messages/hooks/use-messages.ts
  - app/src/modules/taches/hooks/use-taches.ts
  - app/src/modules/routines/hooks/use-routines.ts

# NB : `gsd_run query verification.fingerprint` indisponible dans cet environnement
# lors de la re-vérification ; `covered_digest` ci-dessous est celui de la
# vérification initiale (pré-33-06) et ne couvre pas les 10 fichiers de 33-06.
covered_digest: "v2:sha256:5e998b0cb2779362e0192f7f2820bceb818ea01996aa10bf8d67ac72a354b617"
re_verification:
  previous_status: human_needed
  previous_score: 5/5
  gaps_closed:
    - "G-33-3 (UAT test 3) : hors ligne, une vue allowlistée Tier 1 dont le refetch échoue mais qui a des données en cache rend ses lignes — jamais l'ErrorState (cloisonnement isError/error par présence de données, commits 8f8f37e, 4beaddb, c469fa5, 6a5ccc9)"
  gaps_remaining: []
  regressions: []
deferred:
  - truth: "Le parcours e2e Playwright (context.setOffline) prouve déconnexion → connexion B sans donnée de A"
    addressed_in: "Phase 35"
    evidence: "Phase 35 SC3 : « La matrice de validation est passée sur desktop, Android et iOS réels : install, raccourcis, lecture hors-ligne avec bandeau, rejeu foreground, purge inter-utilisateurs » — le spec offline-shared-device.spec.ts est écrit et s'ignore via test.skip() tant que E2E_SHARED_USER_A/B ne pointent pas vers un backend réel ; la preuve D-06 rejouable vit dans le test Vitest fake-indexeddb (lecture brute entries())"
human_verification:
  - test: "RE-UAT test 3 (post-correctif G-33-3) — mode avion réel : consulter Courses/Tâches/Routines, naviguer entre les vues pendant plus de 30 s (staleTime), recharger l'app, continuer à naviguer"
    expected: "Les vues allowlistées restent lisibles depuis le cache avec le bandeau ambre — l'ErrorState « Ce contenu n'a pas pu être chargé » n'apparaît jamais ; hors allowlist (ex. Ardoise) l'erreur d'origine honnête reste affichée"
    why_human: "Le correctif est prouvé par les 5 tests automatisés (courses/tâches/useResource, vus rouges avant verts), mais le défaut initial a été constaté sur appareil réel après ~30 s de navigation — la re-validation UAT sur appareil réel n'est pas encore enregistrée dans 33-UAT.md (test 3 toujours « issue »)"
  # Items UAT 1, 2 et 4 de la vérification initiale : PASSÉS en UAT le 2026-11-05
  # (33-UAT.md status: complete) — retirés de la liste à faire, historique conservé
  # dans le corps du rapport.
---

# Phase 33: Cache de lecture offline Verification Report

**Phase Goal:** En avion, l'utilisateur relit le dernier état connu de ses données avec la certitude honnête de quand elles datent — sans qu'aucune donnée d'un utilisateur ne survive à un autre sur l'appareil, et sans que le service worker cache jamais une réponse API.
**Verified:** 2026-11-05T10:00:00Z (re-vérification après fermeture G-33-3 par 33-06 ; vérification initiale 2026-11-05T00:40:00Z)
**Status:** human_needed
**Re-verification:** Yes — after gap closure (33-06, commits 8f8f37e → 6a5ccc9, gap G-33-3)

> **Re-vérification du 2026-11-05 (matin).** Le plan 33-06 (gap_closure: G-33-3, l'UAT test 3 major) a atterri après la vérification initiale. Vérifications refaites contre le code réel :
>
> - Les 4 commits existent : `git log e6430f9..HEAD` → 8f8f37e (garde RED), 4beaddb (garde useResource), c469fa5 (useQuery directs), 6a5ccc9 (annexes taches/routines).
> - **Périmètre respecté** : `git diff e6430f9..HEAD -- app/src/lib/query-policy.ts app/src/lib/offline/query-persistence.ts app/src/app/router.tsx` est VIDE — ni la politique de requête, ni la persistance, ni le routeur n'ont été touchés.
> - **Garde vérifiée dans le code** : `useResource.ts:164-165` (`isError: query.isError && query.data === undefined`, idem `error`) ; use-voyages.ts:241-243 ; use-trip-detail.ts:149-151 ; use-ref-days.ts:182-183 ; use-messages.ts:708-714 ; use-taches.ts:354-359 et use-routines.ts:401-407 (isError ET error composés, garde par requête source d'annexe). `completionsResource` (use-routines) hérite du garde interne de useResource — justifié en commentaire. `useLinkedRows` n'expose pas `isError` (interface `LinkedResult`) — rien à garder, conforme au plan.
> - **Tests exécutés par le vérificateur** : `npx vitest run courses-offline taches-offline useResource.test` → **5/5 verts**, dont le cas exact G-33-3 (« refetch échoué avec données en cache : les lignes restent rendues, jamais d'ErrorState », courses ET tâches) et le miroir D-10 (« échec sans aucune donnée : erreur d'origine exposée »). RED→GREEN documenté dans 33-06-SUMMARY.
> - **UAT** : 33-UAT.md status `complete` — tests 1 (CR-01 purge), 2 (mode avion + bandeau) et 4 (visuel bandeau) passés par l'humain ; le test 3 reste « issue » en attente de re-passage après correctif (item humain ci-dessous).
> - **Observations hors périmètre (pas des gaps de phase 33)** : 2 échecs vitest préexistants `anniversaires-page.test.tsx` (prouvés reproductibles sur e6430f9) et 2 échecs e2e « rejoindre un foyer valide le format du token » (`critical-paths.spec.ts:134`, chromium + mobile, flux onboarding/HMAC que 33-06 ne touche pas). À traiter dans une passe dédiée.


## Goal Achievement

### Observable Truths

| # | Truth (roadmap SC + plan must_haves fusionnés) | Status | Evidence |
|---|---|---|---|
| 1 | Cache persisté restauré avant le premier rendu des routes protégées — dernière vue Tier 1 lisible hors ligne (SC1, OFFR-01) | ✓ VERIFIED | `connectOfflineCache` awaité dans `use-auth.ts:219` entre applySession et setReady ; filtrage à la sérialisation (`shouldDehydrateQuery` sur `OFFLINE_FAMILIES`, query-policy.ts:78) ; 77 tests ciblés verts dont tracer seed→persist→restore→lecture, idempotence, namespacing |
| 2 | Toute donnée rendue du cache porte le bandeau « Dernier état connu le [horodatage] » (SC2, OFFR-02, D-10/D-12/D-13) | ✓ VERIFIED | `use-offline-stale-banner.ts` : MIN des dataUpdatedAt (annexes comprises), push priority 3 / dismiss au retour réseau, 5 tests hook + 4 tests composant verts ; monté dans `app-shell.tsx:400` |
| 3 | Allowlist Tier 1 avec maxAge par famille ; hors allowlist = erreur d'origine, jamais du cache ; prune des familles expirées avant setReady (SC3, OFFR-03, D-07/D-08/D-09) | ✓ VERIFIED | `OFFLINE_FAMILIES` (8 familles 24 h + 2 annexes 7 j), `pruneExpiredFamilies` avec garde dataUpdatedAt ≤ 0 (WR-04 corrigé), gcTime 7 j (Pitfall 1) ; tests query-policy F/G/H/I + persistence verts |
| 4 | Cache namespacé par utilisateur, purge synchrone attendue à la déconnexion et au changement de foyer — preuve appareil partagé simulée (SC4, OFFR-04, D-03/D-04/D-05/D-06) | ✓ VERIFIED | Goulot `session-store.signOut()` : stopPersisting → purgeUserCache(await) → set (session-store.ts:56-58) ; `switchWithPurge` ordre prouvé par journal d'ordre ; preuve D-06 par lecture brute `entries()` rejouée dans npm test ; **le parcours e2e navigateur est skip → deferred phase 35 (voir Deferred)** |
| 5 | Le SW ne met jamais en cache une réponse API — contrôle statique §2.7 vu rouge sur un cas qui doit échouer (SC5, OFFR-05) | ✓ VERIFIED | `check-sw-api-cache.sh` exécuté par le vérificateur sur dist/sw.js reconstruit : denylist 5 motifs présente, aucune stratégie cacheable, registerRoute=1 — OK ; contre-preuve `test-check-sw-api-cache.sh` : fixture mauvaise refusée (vu rouge observé), fixture bonne acceptée, fichier absent refusé |
| 6 | Hors ligne, une vue allowlistée Tier 1 dont le refetch échoue mais qui a des données en cache rend ses lignes — jamais l'ErrorState ; sans données en cache, l'erreur d'origine reste affichée (G-33-3, OFFR-01/OFFR-03, D-09/D-10) | ✓ VERIFIED | Garde `isError: query.isError && query.data === undefined` dans useResource.ts:164-165, les 4 useQuery directs (voyages/trip-detail/ref-days/messages) et les annexes composées de use-taches/use-routines ; 5/5 tests verts exécutés par le vérificateur (RED→GREEN documenté) ; e2e navigateur réel post-correctif → re-UAT humaine (item 1) |

**Score:** 6/6 truths verified (0 present, behavior-unverified)

Les invariants comportementaux (ordre purge → clear → set, blocage de déconnexion si purge échoue, garde cancelled sur la traîne du throttle, MIN d'horodatage, annulation de l'ancien persister) sont exercés par des tests Vitest avec espions d'ordre et vus rouges avant verts (33-REVIEW-DISPOSITION, commits 2f3cfd9..7d2b6db) — ces tests tournent sans serveur, donc comportement prouvé, pas seulement présent.

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Parcours e2e Playwright offline-shared-device.spec.ts (skip tant que 2 comptes réels absents) | Phase 35 | Phase 35 SC3 : matrice multi-OS réelle incluant « purge inter-utilisateurs » ; la preuve D-06 rejouable est déjà dans npm test (fake-indexeddb) |

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `app/src/lib/offline/query-persistence.ts` | cacheKey, buildPersister, persistNow, restoreOfflineCache, purgeUserCache, pruneExpiredFamilies, connectOfflineCache, stopPersisting | ✓ VERIFIED | 15 Ko, importé et utilisé par use-auth, session-store, household-store |
| `app/src/lib/offline/query-persistence.test.ts` | tracer, idempotence, namespacing, purge, allowlist, D-06 | ✓ VERIFIED | 13 Ko, exécuté vert |
| `app/src/lib/query-policy.ts` | OFFLINE_FAMILIES + gcTime 7 j | ✓ VERIFIED | Lignes 36, 78 |
| `app/src/hooks/use-auth.ts` | connectOfflineCache dans le bootstrap | ✓ VERIFIED | Ligne 219, awaité |
| `app/src/stores/session-store.ts` | goulot signOut purge awaitée | ✓ VERIFIED | stopPersisting + purgeUserCache(await) |
| `app/src/stores/household-store.ts` | switchWithPurge + reconnect | ✓ VERIFIED | Lignes 97-108 |
| `app/src/hooks/use-offline-stale-banner.ts` + composant | bandeau ambre non-dismissable | ✓ VERIFIED | Branché dans app-shell.tsx:400 |
| `scripts/check-sw-api-cache.sh` + test + 2 fixtures | contrôle §2.7 + contre-preuve | ✓ VERIFIED | Exécutés par le vérificateur, vert + vu rouge |
| `app/e2e/offline-shared-device.spec.ts` | parcours e2e offline | ⚠️ PRÉSENT, SKIP DOCUMENTÉ | Écrit complet, `test.skip()` tant que pas de 2 comptes réels — deferred phase 35 |
| `app/package.json` + lockfile | 3 paquets épinglés -E | ✓ VERIFIED | 5.103.2 / 5.103.2 / idb-keyval 6.3.0 (checkpoint humain Task 1 validé) |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| use-auth.ts (bootstrap) | query-persistence.ts | `connectOfflineCache(queryClient, userId, householdId)` awaité avant setReady | ✓ WIRED | Import ligne 8, appel ligne 219 |
| session-store.signOut | purgeUserCache | goulot unique, purge awaitée avant effacement d'état | ✓ WIRED | Lignes 56-58 ; échec → throw avec copy UI-SPEC (blocage D-05) |
| household-store.switchWithPurge | stopPersisting/purgeCache/connectOfflineCache | ordre purge → clear → switch → reconnect | ✓ WIRED | Lignes 97-108, journal d'ordre testé (WR-03 corrigé) |
| app-shell.tsx | OfflineStaleBanner | montage à côté de BannerSlot | ✓ WIRED | Ligne 400 ; banner-store/banner-slot inchangés |
| use-offline-stale-banner | queryCache.subscribe + useOnlineStatus + banner push/dismiss | MIN dataUpdatedAt Tier 1, jamais navigator.onLine | ✓ WIRED | 5 tests hook verts |
| check-sw-api-cache.sh | dist/sw.js + fixtures | mode --check-file pour la contre-preuve | ✓ WIRED | Les deux exécutions vertes par le vérificateur |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| Bandeau offline-stale | lastKnownAt | MIN dataUpdatedAt des queries réellement hydratées via restore OfflineCache (IndexedDB) | ✓ | FLOWING |
| Vue Tier 1 hors ligne | queries | hydrate() depuis idb-keyval (données réellement consultées avant offline) | ✓ | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Chaîne §2.7 typecheck | `npm run typecheck` | vert | ✓ PASS |
| Suite complète | `npm test` | 1782/1784 — seuls les 2 échecs anniversaires préexistants documentés (deferred-items.md, prouvés préexistants au commit d404ed0) | ✓ PASS |
| Contrôle statique SW + contre-preuve | `bash scripts/test-check-sw-api-cache.sh` puis `bash scripts/check-sw-api-cache.sh` (après `npm run build`) | fixture mauvaise refusée / fixture bonne acceptée / dist/sw.js OK | ✓ PASS |
| Tests ciblés phase 33 | `npx vitest run src/lib/offline src/stores src/hooks/use-auth.test.ts use-offline-stale-banner offline-stale query-policy` | 77/77 verts (7 fichiers) | ✓ PASS |
| Garde G-33-3 (33-06) | `npx vitest run src/modules/courses/courses-offline.test.tsx src/modules/taches/taches-offline.test.tsx src/lib/data/useResource.test.tsx` | 5/5 verts (exécuté par le vérificateur le 2026-11-05 09:52) | ✓ PASS |
| Périmètre 33-06 | `git diff e6430f9..HEAD -- app/src/lib/query-policy.ts app/src/lib/offline/query-persistence.ts app/src/app/router.tsx` | diff vide | ✓ PASS |

### Probe Execution

Pas de probe conventionnel (`scripts/*/tests/probe-*.sh`) déclaré pour cette phase. Le rôle probe est tenu par `test-check-sw-api-cache.sh` (exécuté, PASS — voir ci-dessus).

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| OFFR-01 | 33-01, 33-03 | Dernière vue Tier 1 lisible en avion, cache restauré avant premier rendu | ✓ SATISFIED | Truth 1 |
| OFFR-02 | 33-05 | Bandeau « dernier état connu le [horodatage] » | ✓ SATISFIED | Truth 2 |
| OFFR-03 | 33-03 | Allowlist Tier 1 + maxAge ; hors allowlist = erreur honnête | ✓ SATISFIED | Truth 3 |
| OFFR-04 | 33-01, 33-04 | Cache namespacé + purge synchrone déconnexion/changement de foyer | ✓ SATISFIED | Truth 4 (e2e navigateur deferred phase 35) |
| OFFR-05 | 33-02 | SW ne cache jamais une réponse API — contrôle statique vu rouge | ✓ SATISFIED | Truth 5 |

Aucun ID orphelin : REQUIREMENTS.md ne mappe à la phase 33 que OFFR-01..05, tous déclarés et satisfaits.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| — | — | Aucun TBD/FIXME/XXX/stub dans les fichiers de la phase (grep exécuté) | — | — |

Note : les 5 findings IN de 33-REVIEW (Info) restent ouverts par disposition — aucun n'atteint le seuil Warning : IN-02 (faux négatif possible si le minifieur embarque les littéraux workbox) est couvert en pratique par la vérification 3 qui vise `src/sw.ts` par comptage ; IN-01/03/04/05 sont des remarques de qualité sans effet observable sur les truths.

### Human Verification Required

**Après la re-vérification du 2026-11-05 (post-33-06), il reste 1 item** — les items UAT 1 (CR-01 purge), 2 (mode avion + bandeau) et 4 (visuel du bandeau) ont été passés par l'humain le 2026-11-05 (33-UAT.md : status complete, 3/4 pass) :

1. **RE-UAT test 3 (post-correctif G-33-3)** — mode avion réel : consulter Courses/Tâches/Routines, naviguer entre les vues pendant plus de 30 s (staleTime), recharger l'app, continuer à naviguer. Attendu : les vues allowlistées restent lisibles depuis le cache avec le bandeau ambre, l'ErrorState « Ce contenu n'a pas pu être chargé » n'apparaît jamais ; hors allowlist, l'erreur d'origine honnête est préservée. Le correctif est prouvé par 5 tests automatisés RED→GREEN, mais le défaut initial a été observé sur appareil réel après ~30 s — la re-validation humaine n'est pas encore enregistrée (33-UAT.md test 3 toujours « issue »).

_Historique des 4 items de la vérification initiale :_
- ~~CR-01 sur appareil réel — purge inter-utilisateurs~~ → **PASSÉ** (33-UAT.md test 1, note : IndexedDB vérifié vide après déconnexion via DevTools).
- ~~Mode avion réel Tier 1 — vue lisible + bandeau~~ → **PASSÉ** (33-UAT.md test 2).
- Mode avion hors allowlist → recouvert par le RE-UAT test 3 ci-dessus (le correctif a précisément durci cette partition).
- ~~Contrôle visuel du bandeau~~ → **PASSÉ** (33-UAT.md test 4, « Dernier état connu le 5 nov. à 08:57 », ambre, non-dismissable).

### Gaps Summary

**Re-vérification (2026-11-05, post-33-06) :** aucun gap bloquant. G-33-3 est fermé dans le code (garde `isError && data === undefined` vérifiée ligne à ligne dans useResource, les 4 useQuery directs et les hooks composés taches/routines ; diff e6430f9..HEAD strictement limité aux 10 fichiers du plan, query-policy/query-persistence/router intacts) et prouvé par 5 tests RED→GREEN exécutés par le vérificateur. Le statut `human_needed` restant tient au seul re-passage UAT du test 3 sur appareil réel, non encore enregistré. Observations hors périmètre : 2 échecs vitest anniversaires (prouvés préexistants sur e6430f9) et 2 échecs e2e onboarding token — aucun ne contredit un must-have de la phase 33.

**Vérification initiale (2026-11-05T00:40) :** aucun gap bloquant. Les 5 success criteria du roadmap sont vérifiés dans le code, câblés et exercés par des tests comportementaux verts (782 lignes de preuve TDD vue rouge avant verte documentées dans les SUMMARY et la disposition de revue). Le statut `human_needed` provient exclusivement : (a) de l'e2e navigateur skip, explicitement couvert par la matrice multi-OS de la phase 35 (deferred, pas un gap) ; (b) de la vérification humaine demandée par la disposition CR-01 ; (c) des comportements visuels/runtime (mode avion réel, apparence du bandeau) que grep ne peut pas voir. Les 2 échecs de test anniversaires sont prouvés préexistants au commit d404ed0 et documentés hors périmètre dans deferred-items.md.

---

_Verified: 2026-11-05T10:00:00Z (re-vérification post-G-33-3 ; initiale 2026-11-05T00:40:00Z)_
_Verifier: the agent (gsd-verifier)_
