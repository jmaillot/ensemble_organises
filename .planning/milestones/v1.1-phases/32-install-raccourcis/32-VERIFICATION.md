---
phase: 32-install-raccourcis
verified: 2026-11-07T17:35:00Z
status: human_needed
score: 3/4 Success Criteria vérifiées (la 4e est présente et câblée, comportement non exercé — voir behavior_unverified)
behavior_unverified: 1
overrides_applied: 0
re_verification: null
# `gsd_run query verification.fingerprint` indisponible dans cet environnement
# (même situation que 33-VERIFICATION.md) — covered_digest non calculé.
covered_files:
  - .planning/phases/32-install-raccourcis/32-01-PLAN.md
  - .planning/phases/32-install-raccourcis/32-01-SUMMARY.md
  - .planning/phases/32-install-raccourcis/32-02-PLAN.md
  - .planning/phases/32-install-raccourcis/32-02-SUMMARY.md
  - .planning/phases/32-install-raccourcis/32-03-PLAN.md
  - .planning/phases/32-install-raccourcis/32-03-SUMMARY.md
  - .planning/phases/32-install-raccourcis/32-UAT.md
  - app/vite.config.ts
  - app/index.html
  - app/public/pwa-64x64.png
  - app/public/pwa-192x192.png
  - app/public/pwa-512x512.png
  - app/public/maskable-icon-512x512.png
  - app/public/apple-touch-icon-180x180.png
  - app/public/favicon.png
  - app/public/shortcut-taches-96.png
  - app/public/shortcut-courses-96.png
  - app/public/screenshots/desktop.png
  - app/public/screenshots/mobile.png
  - app/src/pwa/manifest.test.ts
  - app/src/lib/sw-register.ts
  - app/src/components/banners/banner-store.ts
  - app/src/components/banners/banner-slot.tsx
  - app/src/components/banners/update-banner.tsx
  - app/src/components/banners/install-banner.tsx
  - app/src/hooks/use-outbox-gate.ts
  - app/src/hooks/use-pwa.ts
  - app/src/modules/parametres/components/offline-panel.tsx
  - app/src/main.tsx
  - app/src/app/app-shell.tsx
behavior_unverified_items:
  - truth: "Quand une mise à jour du service worker est disponible, l'utilisateur la voit (bandeau) et le rechargement n'arrive jamais sans son action — sur un déploiement réel"
    test: "Au prochain déploiement naturel (release-build), ouvrir l'app installée avec une version antérieure, attendre le nouveau worker en attente"
    expected: "Bandeau « Une mise à jour est disponible » avec « Recharger » (désactivé « Mise à jour en préparation… » si la file d'écriture n'est pas vide) ; aucun auto-reload"
    why_human: "Le chemin réel (nouvelle version servie, worker en attente) n'a jamais été observé : UAT test 7 bloqué sur `release-build` le 2026-11-04. Les tests unitaires mockent registerSW ; la présence des symboles (sw-register.ts onNeedRefresh, update-banner.tsx, gate) ne prouve pas le comportement de bout en bout. Même véhicule que 35-UAT test 2."
human_verification:
  - test: "Re-jouer UAT test 7 au prochain déploiement réel (même véhicule que 35-UAT test 2) : ouvrir l'app installée sur la version N, déployer N+1, observer"
    expected: "Bandeau « Une mise à jour est disponible » apparaît (jamais de reload spontané) ; « Recharger » actif si file vide, sinon libellé « Mise à jour en préparation… » ; après rechargement, la version du worker dans le panneau offline change"
    why_human: "Dépend d'un vrai cycle de déploiement avec un onglet ouvert — non reproductible hors production ; jamais exercé depuis la livraison de la phase"
---

# Phase 32: Install & raccourcis Verification Report

**Phase Goal:** L'app installée est joignable en un tap depuis l'écran d'accueil sur les trois OS, avec des raccourcis web vers les vues du quotidien, et un service worker dont les mises à jour ne détruisent jamais une session en cours.
**Verified:** 2026-11-07T17:35:00Z
**Status:** human_needed (formel : 1 item de vérification humaine — le UAT test 7 différé au prochain déploiement ; aucun gap de code)
**Re-verification:** Non — vérification initiale (rapport absent ; audit du milestone v1.1 avait marqué les 4 exigences comme orphelines)
**Méthode:** goal-backward sur l'état ACTUEL du code (évolué par les phases 33–35), adossé à la passe d'intégration gsd-integration-checker du 2026-11-07 et à 32-UAT.md (7/8 passés).

## Goal Achievement

### Success Criteria (roadmap, contrat)

| # | Truth (SC) | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Installation via invite native (Chromium) + guide iOS, rien ne bloque sur le manifeste | ✓ VERIFIED | `install-banner.tsx` capé sur `beforeinstallprompt` + branche UA iOS avec pas-à-pas dépliable ; `use-pwa.ts` états standalone/`navigator.standalone` ; UAT tests 3, 4, 5, 6 passés (dont 2 défauts corrigés : `6d78688`, `b02fde7`, re-validés) |
| 2 | Appui long → raccourcis « Tâches du jour » et « Courses » ouvrant les vues | ✓ VERIFIED | `dist/manifest.webmanifest` (lu après build du jour) : shortcuts `/taches/jour` + `/courses`, icônes 96 distinctes ; route `/taches/jour` existe (`app/src/app/router.tsx:316`, vue dédiée phase 35 — amélioration, pas régression : D-05 « sans paramètre d'URL » respecté) ; UAT test 2 passé |
| 3 | Icônes maskable 192/512, `display_override`, balises `apple-*` | ✓ VERIFIED | Manifest dist : icons any 64/192/512 + maskable 512, `display_override` ordre D-06 exact, categories, screenshots wide+narrow ; `index.html:17-18` apple-touch-icon PNG + apple-mobile-web-app-title ; assets commités dans `app/public/` (aucune génération au build — prohibition D-13 respectée) ; UAT tests 1 et 3 passés |
| 4 | Mise à jour SW visible, reload n'attend jamais pendant un rejeu (`registerType: prompt`, gate) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Présent + câblé : `vite.config.ts` `registerType: 'prompt'` + `injectManifest` conservé, `sw.ts` sans `skipWaiting`/`clientsClaim` ; `sw-register.ts` `onNeedRefresh` → push `{kind:'sw-update'}` + `needsRefresh` ; `update-banner.tsx:19` et `offline-panel.tsx:98` consomment `useOutboxGate` — le stub de 32-02 a été remplacé par la vraie gate en 34-04 (`use-outbox.ts`/`pendingCount`), le contrat de frontière `{ isEmpty }` tient, aucun composant de 32 n'a changé (amélioration, pas régression). Aucun test n'exerce le chemin réel « nouveau worker servi → bandeau » (UAT test 7 bloqué sur release-build) — voir Human Verification |

**Score:** 3/4 SC vérifiées (1 présente + câblée, comportement non exercé). Toutes les truths de plan (32-01 : 6, 32-02 : 4, 32-03 : 6) sont vérifiées au niveau présence/sous-type/câblage, adossées aux tests unitaires verts du jour.

### Non-régression (phases 33–35)

| Élément de 32 | État aujourd'hui | Verdict |
| --- | --- | --- |
| Gate stub 32-02 → `use-outbox-gate.ts` | Délégation réelle `useOutbox().pendingCount` (34-04) | Amélioration — contrat inchangé |
| Raccourci `/taches` → `/taches/jour` | Vue dédiée phase 35, route présente, e2e deep-link-redirect (35-VERIFICATION 2026-11-07) | Amélioration |
| SW denylist API | `bash scripts/check-sw-api-cache.sh` → **OK** ce jour | Intact |
| Version estampille | `build-app.sh` GIT_SHA → `sw.ts` (passe intégration 2026-11-07) | Intact |

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `app/public/*.png` (icônes, raccourcis, screenshots) | Assets commités | ✓ VERIFIED | 12 fichiers présents, référencés par le manifeste dist |
| `app/vite.config.ts` (bloc manifest + registerType) | Source unique du manifeste | ✓ VERIFIED | Lu intégralement ; prohibitions respectées (pas de manifest statique — fichier supprimé, pas d'option pwaAssets) |
| `app/src/lib/sw-register.ts` | registerSW prompt, push bannière | ✓ VERIFIED | Importé par `main.tsx:5` (WIRED), `onNeedRefresh` → banner-store |
| `app/src/components/banners/*` | Slot empilable, dédup par kind | ✓ VERIFIED | `BannerSlot` dans `app-shell.tsx:395` (entre header et main, D-04) ; 8 fichiers de tests, 55/55 verts ce jour |
| `app/src/components/banners/install-banner.tsx` | Bannière 2 niveaux, enterrement 30 j | ✓ VERIFIED | Clé `eo-install-banner-dismissed-at`, parse `Number.isFinite`, branche iOS dépliable |
| `app/src/hooks/use-outbox-gate.ts` | Contrat `{isEmpty}` (stub en 32, réel en 34) | ✓ VERIFIED | Réel aujourd'hui — frontière de composant tenue |
| `app/src/hooks/use-pwa.ts` | État `isInstalled` | ✓ VERIFIED | matchMedia standalone + navigator.standalone |
| `app/src/modules/parametres/components/offline-panel.tsx` | Version worker, MAJ en attente, Appliquer maintenant | ✓ VERIFIED | Consume `useSwState` + `updateSW` + gate ; UAT test 8 passé |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `vite.config.ts` manifest.icons | fichiers `app/public/` | src des entrées | ✓ WIRED | Vérifié dans dist/ après build : aucune entrée orpheline |
| `vite.config.ts` shortcuts[].url | routes `router.tsx` | `/taches/jour`, `/courses` | ✓ WIRED | router.tsx:316 + route courses |
| `index.html` apple-touch-icon | PNG raster | href | ✓ WIRED | `/apple-touch-icon-180x180.png`, pas le SVG |
| `sw-register.ts` onNeedRefresh | banner-store | `getState().push` hors-React | ✓ WIRED | Dédup par kind côté store |
| `main.tsx` | sw-register | import niveau module | ✓ WIRED | remplace registerSW inline |
| `app-shell.tsx` | BannerSlot | JSX entre header et main | ✓ WIRED | app-shell.tsx:395 |
| `update-banner.tsx` / `offline-panel.tsx` | gate | `useOutboxGate()` | ✓ WIRED | update-banner.tsx:3,19 ; offline-panel.tsx:11,98 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| offline-panel | version worker | ping `EO_VERSION` → réponse SW réel | Oui (repli honnête « Service worker indisponible ») | ✓ FLOWING |
| update-banner | `isEmpty` | `useOutbox()` → MutationCache réel | Oui (depuis 34-04) | ✓ FLOWING |
| manifest dist | icons/shortcuts | bloc `pwaManifest` → build | Oui | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Chaîne §2.7 typecheck | `npm run typecheck` | 0 erreur | ✓ PASS |
| Tests phase-32 ciblés (manifest, banners, gate, use-pwa, offline-panel) | `npx vitest run …` | 8 fichiers, 55/55 | ✓ PASS |
| Build prod + manifest dist | `npm run build` + lecture `dist/manifest.webmanifest` | icons 4 + maskable, shortcuts sans param, display_override, screenshots 2 | ✓ PASS |
| SW denylist API | `bash scripts/check-sw-api-cache.sh` | SW API CACHE: OK | ✓ PASS |

### Probe Execution

Aucun probe `scripts/*/tests/probe-*.sh` déclaré par la phase — non applicable. Le contrôle statique SW (`check-sw-api-cache.sh`) est exécuté ci-dessus.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| INST-01 | 32-01 | Installable desktop/Android (manifest complet) | ✓ SATISFIED | SC-1/SC-3 + UAT 1, 3 passés |
| INST-02 | 32-03 | UX d'installation par OS (bannière 2 niveaux, guide iOS, enterrement 30 j) | ✓ SATISFIED | SC-1 + UAT 4, 5, 6 passés (2 défauts corrigés en session et re-validés) |
| INST-03 | 32-02 | Mises à jour SW sûres — jamais de reload subi | ✓ SATISFIED (code) | SC-4 présent + câblé ; registerType prompt, gate réelle, aucun auto-reload. Caveat honnête : le chemin runtime réel (bandeau sur nouveau déploiement) n'a jamais été observé — UAT test 7 différé au prochain déploiement (behavior_unverified, PAS un gap) |
| DLNK-01 | 32-01 | Raccourcis web « Tâches du jour » et « Courses » | ✓ SATISFIED | SC-2 + UAT test 2 passé ; URLs sans paramètre (D-05) |

Aucune exigence orpheline : les 4 exigences de la phase sont couvertes par les 3 plans. (L'audit milestone les avait marquées orphelines faute de rapport de vérification — comblé par le présent rapport.)

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| — | — | Aucun marqueur de dette (TBD/FIXME/XXX) ni stub détecté dans les fichiers de la phase | — | — |

Note (hors périmètre, pré-existant) : 2 tests rouges `anniversaires-page.test.tsx` documentés dans `deferred-items.md` de la phase comme pré-existants à 32-01 ; non liés à la PWA, non re-run ici (règle 1 suite complète max).

### Human Verification Required

### 1. UAT test 7 — bandeau de mise à jour réel (déféré)

**Test:** Au prochain déploiement naturel (même véhicule que 35-UAT test 2) : ouvrir l'app installée sur la version N, déployer N+1, laisser l'onglet ouvert.
**Expected:** Bandeau « Une mise à jour est disponible » + « Recharger » (jamais de reload spontané) ; bouton désactivé « Mise à jour en préparation… » si la file d'écriture n'est pas vide ; après rechargement, la version du service worker change dans le panneau offline.
**Why human:** Dépend d'un vrai cycle de déploiement avec un onglet ouvert sur l'ancienne version — jamais exercé depuis la livraison (bloqué sur `release-build` le 2026-11-04).

### Gaps Summary

Aucun gap de code. Les 4 exigences et les 3 des 4 Success Criteria sont vérifiées dans le code actuel, avec non-régression confirmée à travers les phases 33–35 (gate stub devenue vraie gate, raccourci pointant vers la vue dédiée de la phase 35, denylist SW et estampille intacts). Le statut `human_needed` encode uniquement le report du UAT test 7 (bandeau de mise à jour sur déploiement réel) — véhicule partagé avec 35-UAT test 2, cohérent avec 35-VERIFICATION.md.

---

_Verified: 2026-11-07T17:35:00Z_
_Verifier: the agent (gsd-verifier)_
