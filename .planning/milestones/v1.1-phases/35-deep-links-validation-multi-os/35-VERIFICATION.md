---
phase: 35-deep-links-validation-multi-os
verified: 2026-11-07T14:30:00Z
status: human_needed
score: 6/6 must-haves verified (le 6e via re-test on-device Android 2026-11-07 ; digest couvert inchangé depuis 2026-11-06 — plans 35-06→35-10 postérieurs, recalcule au prochain cycle)
covered_files:
  - .planning/phases/35-deep-links-validation-multi-os/35-01-PLAN.md
  - .planning/phases/35-deep-links-validation-multi-os/35-02-PLAN.md
  - .planning/phases/35-deep-links-validation-multi-os/35-03-PLAN.md
  - .planning/phases/35-deep-links-validation-multi-os/35-04-PLAN.md
  - .planning/phases/35-deep-links-validation-multi-os/35-05-PLAN.md
  - .planning/phases/35-deep-links-validation-multi-os/35-01-SUMMARY.md
  - .planning/phases/35-deep-links-validation-multi-os/35-02-SUMMARY.md
  - .planning/phases/35-deep-links-validation-multi-os/35-03-SUMMARY.md
  - .planning/phases/35-deep-links-validation-multi-os/35-04-SUMMARY.md
  - .planning/phases/35-deep-links-validation-multi-os/35-05-SUMMARY.md
  - .planning/phases/35-deep-links-validation-multi-os/35-VALIDATION-MATRICE.md
  - .planning/phases/35-deep-links-validation-multi-os/deferred-items.md
  - app/src/stores/session-store.ts
  - app/src/hooks/use-auth.ts
  - app/src/modules/landing/sign-in-page.tsx
  - app/src/modules/taches/taches-jour-page.tsx
  - app/src/modules/taches/types.ts
  - app/src/modules/taches/components/task-row.tsx
  - app/e2e/deep-link-redirect.spec.ts
  - app/src/stores/__tests__/load-household-offline.test.ts
  - app/src/hooks/__tests__/auth-bootstrap-offline.test.tsx
  - app/src/modules/taches/__tests__/jour-view.test.tsx
  - app/src/modules/landing/__tests__/connexion-requise.test.tsx
  - app/src/app/router.tsx
  - app/src/app/route-preload.ts
  - app/vite.config.ts
  - app/src/lib/query-policy.ts
  - app/src/components/banners/update-banner.tsx
  - app/src/modules/parametres/components/offline-panel.tsx

covered_digest: "v2:78ba68152b9c1d3c332e8399d6ef899be7367d6bb7e1dc9d3ca4f480df3f4042"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/6
  gaps_closed:
    - "Deep link hors-ligne SANS session → écran « connexion requise pour cette vue » (D-07, matrice §1.5) — cause racine corrigée par 35-04 (bootstrap tolérant hors-ligne), e2e G vert sur chromium + mobile (re-exécuté 6/6 à cette vérification), rejeu on-device 2026-11-06 Passé sur Desktop Chrome ET Android 16, fix réactif MED-1 (commit 4d089f1) en place"
    - "Cold-start hors-ligne AVEC session → /taches/jour depuis le cache persisté (SC2, matrice §1.4) — mécanisme corrigé par 35-04 (loadHousehold repli foyer persisté, chemin invité, garde T-35-06 expires_at), couverture automatisée créée (tests A–F, e2e H, test unitaire I — tous re-exécutés verts à cette vérification), Desktop on-device Passé au rejeu 35-05"
  gaps_remaining:
    - "RÉSOLU 2026-11-07 : §1.4 sur Android 16 — chaîne de correctifs 35-06→35-10 livrée (gardien, sonde, chemin authentifié-hors-ligne, diagnostics, garde d'erreurs d'annexe) et re-test on-device Android 16 PASSÉ (bundle v1.0-149-g0e65444, « ca marche ! », UAT test 3 passed). DLNK-02 Android cellé dans deferred-items.md, bloqueur STATE.md levé. NB : covered_digest ci-dessus date de la vérification 2026-11-06 — les plans 35-06→35-10 (use-auth.ts, reachability.ts, session-cache.ts, useResource.ts, query-persistence.ts, offline-panel.tsx) sont postérieurs ; une re-vérification complète au prochain cycle recalcule le digest."
  regressions: []
deferred:
  - truth: "Cold-start déconnecté AVEC session → /taches/jour rendue depuis le cache persisté, sur Android (SC2/DLNK-02, matrice §1.4)"
    addressed_in: "CLOS 2026-11-07 — plans 35-06 à 35-10, rejeu on-device v1.0-149 Passé (« ca marche ! »), item cellé dans deferred-items.md"
    evidence: "35-UAT.md test 3 result: passed (2026-11-07) ; 35-VALIDATION-MATRICE.md §1.4 rejeu final Passé ; STATE.md bloqueur levé"
  - truth: "UAT test 1 — matrice iOS réelle (install, raccourcis, purge A→B, quirks ITP) : Non testé (appareil absent), archivé par décision utilisateur"
    addressed_in: "Skip consigné dans 35-UAT.md ; les cellules matrice iOS restent « Non testé (appareil absent) » — honnêteté D-11, jamais cochées à tort"
    evidence: "35-UAT.md test 1 result: skipped, reason archivée 2026-11-07"
  - truth: "UAT test 2 — gate SW « file vide » (bouton désactivé, zéro reload, file vidée → actif) : reporté au prochain rebuild naturel avec file d'écriture non vide"
    addressed_in: "Skip consigné dans 35-UAT.md ; le véhicule de test (rebuild avec file non vide) n'est pas déclenchable artificiellement sans fausser le scénario"
    evidence: "35-UAT.md test 2 result: skipped, reason 2026-11-07"
advisory:
  - finding: "Test unitaire D (auth-bootstrap-offline) échoué une fois sur trois en exécution parallèle (9 fichiers, 9 workers), vert 2/2 en isolation — instabilité de timing waitFor, pas de défaut du mécanisme"
    category: other
    reason: "Observé pendant cette re-vérification uniquement sous charge parallèle ; re-run isolé vert deux fois. À surveiller si la suite s'allonge."
    evidence_status: "npx vitest run (parallèle) : 1 failed/45 ; npx vitest run <fichier> ×2 : 3/3 passed"
coincidental_reliance_items:
  - truth: "Taper /taches/jour pendant une session expirée mène à /connexion puis ramène à /taches/jour (e2e deep-link-redirect, DLNK-02 chemin en ligne)"
    reason: fixture-only
    harden: "L'e2e s'appuie sur le harnais démo (purge des stores localStorage pour simuler l'expiration). Le chemin production (JWT expiré réel côté Supabase) n'est pas exercé ; déclarer explicitement que la preuve DLNK-02 vaut pour le mécanisme state.from/RequireAuth, l'expiration de session JWT restant un point de contrôle humain."
  - truth: "Deep link hors-ligne AVEC session → vue Tâches du jour rendue (e2e H, 35-04)"
    reason: fixture-only
    harden: "L'e2e H exerce le mode démo (session démo, SW en contrôle après chargement en ligne préalable). Le chemin Supabase réel au cold-start est couvert unitairement (tests D/E sur branches Supabase mockées) mais pas e2e ; la divergence Android §1.4 au rejeu prouve précisément que ce chemin n'est pas équivalent sur tout OS — d'où l'item humain 3."
behavior_unverified_items: []
human_verification:
  - test: "Matrice iOS réelle (sections 1 et 4 de 35-VALIDATION-MATRICE.md) : install, raccourcis, lecture offline avec bandeau, rejeu foreground, purge A→B, deep link cold-start, quirks ITP/éviction ~7 jours"
    expected: "Chaque cellule iOS passe de « Non testé (appareil absent) » à un statut consigné avec appareil/version/date ; les quirks iOS pré-remplis sont confrontés au réel"
    why_human: "Aucun appareil iOS disponible pendant les passages 2026-11-06 ; le critère roadmap « trois OS » exige iOS réel. Constaté non testé, jamais coché à tort (honnêteté de consignation vérifiée)."
  - test: "Gate SW « file vide » déclenché on-device (section 2 de la matrice) : publier un nouveau build avec file non vide, vérifier bouton désactivé + label « Mise à jour en préparation… » aux deux points (update-banner + panneau Paramètres), zéro reload pendant le rejeu, puis file vidée → bouton actif"
    expected: "Aucune mise à jour ne recharge pendant un rejeu ; le gate se libère quand la file se vide"
    why_human: "Le gate exige une proposition de mise à jour SW réelle (aucun build publié pendant les passages) ; le code est vérifié (update-banner.tsx:29 disabled={!isEmpty}, offline-panel.tsx:142, branché via useOutboxGate) mais non déclenchable — à rejouer à la prochaine mise en production"
  - test: "Rejeu Android §1.4 après le diagnostic DLNK-02 Android : cold-start déconnecté avec session sur Android 16, deep link /taches/jour"
    expected: "/taches/jour rendue depuis le cache persisté (plus d'écran « Chargement de votre foyer ») — re-celler l'item deferred-items.md et lever le bloqueur STATE.md uniquement sur Passé consigné"
    why_human: "L'échec Android est observé uniquement on-device (le symptôme « encore chargement de votre foyer » suggère un contrôle SW ou une restauration persist divergents sur Android) ; aucun émulateur de ce régime n'est automatisable tel quel"
audit_acknowledged:
  milestone: v1.4
  at: 2026-11-12
  status: human_needed
---

# Phase 35: Deep links & validation multi-OS Verification Report

**Phase Goal:** « Un raccourci tapé en cold-start déconnecté mène toujours à la bonne vue après reconnexion, et l'expérience offline complète est validée de bout en bout sur les trois OS — l'app de poche est prête, prouvée, pas supposée. »
**Verified:** 2026-11-06T17:45:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (35-04/35-05 exécutés depuis la vérification initiale 16:10Z ; digest régénéré)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1 / DLNK-02 : session expirée → /connexion → retour exact à /taches/jour, prouvé par e2e dédié | ✓ VERIFIED | Re-exécuté à cette vérification : `npx playwright test deep-link-redirect` → **6/6 passed** dont les 2 cas redirect-after-login (chromium 2.4s + mobile 2.6s). D-08 respecté : seule source `state={{ from }}` (router.tsx:36). |
| 2 | SC2a / DLNK-03 : la vue « Tâches du jour » /taches/jour existe comme cible du raccourci et rend correctement | ✓ VERIFIED | Route router.tsx:316 + route-preload.ts:35, manifest shortcut (vite.config.ts:45), filtre tasksDuJour (types.ts:201), vue branchée useTaches + TaskRow. 9 tests unitaires verts (re-exécutés). On-device raccourcis Passé (matrice §1.2). |
| 3 | SC2b : rend depuis le cache persisté en cold-start hors-ligne AVEC session | ✓ VERIFIED (mécanisme + Desktop) — Android différé, voir Deferred | Mécanisme 35-04 vérifié dans le code : `loadHousehold` repli foyer persisté hors-ligne (session-store.ts:173-185, revalidation journalisée §2.7 F), chemin invité sur rejet hors-ligne (use-auth.ts:229-232, :274-277), garde T-35-06 expires_at (use-auth.ts:206-219). **Couverture automatisée créée** : 6 tests A–F (load-household-offline + auth-bootstrap-offline, re-exécutés verts) + e2e H « avec session démo : deep link hors-ligne → vue Tâches du jour rendue » (2 projets verts, re-exécuté) + test unitaire I (rendu vue depuis store hydraté). Rejeu on-device 35-05 : Desktop **Passé**. Android 16 **Échoué** — consigné tel quel, différé PAR DÉCISION UTILISATEUR (voir Deferred Items et Gaps Summary). |
| 4 | D-07 (35-03) : deep link hors-ligne SANS session → écran « connexion requise pour cette vue » | ✓ VERIFIED | Gap 2 du rapport initial **clos** : e2e G « sans session : deep link hors-ligne → écran connexion requise » (re-exécuté : chromium + mobile verts), rejeu on-device 2026-11-06 **Passé sur Desktop ET Android 16** (matrice §1.5 table Rejeu). Fix réactif MED-1 en place : `useOnlineStatus()` (sign-in-page.tsx:146, commit 4d089f1). Le test E2E prouve que l'écran est réellement ATTEINT (plus orphelin). |
| 5 | SC3 : matrice passée sur desktop, Android et iOS réels, tout consigné, rien marqué vérifié à tort | ⚠️ consignation VERIFIED, couverture 2 OS sur 3 | Consignation exemplaire vérifiée : historique initial intact, tables Rejeu datées (§1.4 : Desktop Passé / Android Échoué ; §1.5 : Passé ×2), item 7-rejeu « Échoué (partiel) » assumé, iOS « Non testé (appareil absent) » partout, CONFIRMATION-CONSIGNATION complétée avec la date du rejeu. **MAIS** : Android §1.4 Échoué + iOS entièrement absent → le critère « trois OS » n'est pas tenu. Aucun écart dissimulé — d'où human_needed, pas passed. |
| 6 | SC4 : checklist PITFALLS passée en revue + gate SW « file vide » vérifié | ✓ code / ⚠️ preuve on-device (humain) | Code vérifié par grep : update-banner.tsx:29 `disabled={!isEmpty}`, offline-panel.tsx:142, labels corrects, branché via useOutboxGate. Déclenchement on-device « Non testé » (aucun build publié) → item humain 2. |

**Score:** 5/6 truths verified (0 present-behavior-unverified)

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Cold-start hors-ligne AVEC session sur Android 16 → « Chargement de votre foyer » au lieu de /taches/jour (SC2/DLNK-02, matrice §1.4) | Bloqueur STATE.md — diagnostic complémentaire à ouvrir en plan dédié | Décision utilisateur 2026-11-06 « consigner et différer » (STATE.md:30 : « la phase n'est PAS close tant que DLNK-02 Android n'est pas corrigé et re-rejoué ») ; deferred-items.md item « DLNK-02 Android » réouvert avec symptôme + 2 pistes (SW non maître / restauration zustand persist) ; rejeu consigné matrice §1.4 |

**Position explicite du vérificateur** (demandée par l'orchestrateur) : cet item n'est PAS réinscrit comme nouveau gap actif parce qu'il est porté, daté et diagnostiqué dans deferred-items.md et STATE.md — une réinscription créerait un doublon sans nouveau contenu. **Mais il DOIT bloquer toute clôture de milestone** : le goal dit « validée de bout en bout sur les trois OS » et, indépendamment de l'Android différé, iOS est entièrement non testé (truth 5). La phase est livrée, prouvée sur son périmètre automatisable et sur Desktop + le chemin sans session sur Android — elle n'est PAS « prouvée sur les trois OS ». Prochaine étape : plan de diagnostic DLNK-02 Android (pistes déjà écrites), puis rejeu Android §1.4 + matrice iOS.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `app/src/stores/session-store.ts` | loadHousehold tolérant hors-ligne (repli foyer persisté) | ✓ VERIFIED | :173-185 — try/catch + `onlineManager.isOnline()` + garde householdId/members, revalidation journalisée (§2.7 F), wired par use-auth |
| `app/src/hooks/use-auth.ts` | Chemin invité hors-ligne + garde expires_at | ✓ VERIFIED | :206-219 (T-35-06), :229-232 (catch applySession), :274-277 (catch getSession) — les 3 branches menent à `cheminInvite()`, le routeur monte toujours hors-ligne |
| `app/src/stores/__tests__/load-household-offline.test.ts` | Tests A–C (nouveau, 35-04) | ✓ VERIFIED | Re-exécutés verts à cette vérification |
| `app/src/hooks/__tests__/auth-bootstrap-offline.test.tsx` | Tests D–F (nouveau, 35-04) | ✓ VERIFIED | 3/3 verts en isolation (2 runs) ; 1 échec de timing constaté une fois sous 9 workers parallèles — advisory, pas un défaut du mécanisme |
| `app/e2e/deep-link-redirect.spec.ts` | E2e DLNK-02 + cas hors-ligne G/H (nouveau, 35-04) | ✓ VERIFIED | Re-exécuté : **6/6 passed** (chromium + mobile × 3 cas), 12.0s |
| `app/src/modules/taches/taches-jour-page.tsx` | Vue /taches/jour | ✓ VERIFIED | inchangée du rapport initial, 9 tests unitaires verts |
| `app/src/modules/landing/sign-in-page.tsx` | Écran D-07, état réseau réactif | ✓ VERIFIED | offlineWithoutSession :147, `useOnlineStatus()` :146 (MED-1, commit 4d089f1), 5 tests unitaires verts |
| `.planning/.../35-VALIDATION-MATRICE.md` | Grille + tables Rejeu + confirmation | ✓ VERIFIED | Tables Rejeu §1.4/§1.5 datées, item 7-rejeu, historique intact, CONFIRMATION-CONSIGNATION complétée |
| `.planning/.../deferred-items.md` | Statut final des items | ✓ VERIFIED | D-07 clôturé, DLNK-02 Android réouvert avec symptôme, outbox silencieux ouvert hors périmètre, LOW-2 reporté justifié |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| vite.config.ts shortcut « Tâches du jour » | /taches/jour | manifest.shortcuts url | ✓ WIRED | inchangé (rapport initial) |
| router.tsx route /taches/jour | taches-jour-page | routeChunkLoaders.tachesJour | ✓ WIRED | inchangé |
| use-auth (bootstrap hors-ligne) | chemin invité → gardes du routeur | cheminInvite() + setReady | ✓ WIRED | e2e G/H prouvent le montage du routeur hors-ligne (c'était le maillon manquant avant 35-04) |
| session-store.loadHousehold | foyer persisté (zustand persist) | storeAvantLecture.householdId/members | ✓ WIRED | tests A/C + D couvrent les branches repli et rejet |
| sign-in-page.tsx | écran connexion requise | offlineWithoutSession (réactif) | ✓ WIRED | useOnlineStatus :146 + e2e G : l'écran est atteint |
| update-banner/offline-panel | useOutboxGate | isEmpty | ✓ WIRED | :29/:142 (inchangé) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| taches-jour-page | tasks | useTaches — cache persisté au cold-start hors-ligne | Oui (e2e H + test I + rejeu Desktop) | ✓ FLOWING (Desktop) — Android divergent, consigné deferred |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Typecheck | `npm run typecheck` | exit 0 | ✓ PASS |
| Tests unitaires stores/hooks/landing (45 tests) | `npx vitest run src/stores/__tests__ src/hooks/__tests__ src/modules/landing` | 44/45 ; 1 échec test D une fois sous 9 workers parallèles, vert 2/2 en isolation | ✓ PASS (flakiness de timing consigné en advisory) |
| E2e deep-link-redirect (3 cas × 2 projets, dont 2 hors-ligne) | `npx playwright test deep-link-redirect --reporter=list` | **6/6 passed** (12.0s) | ✓ PASS |

### Probe Execution

No phase-declared probe scripts (`scripts/*/tests/probe-*`) — SKIPPED.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| DLNK-02 | 35-01…35-05 | Deep link session expirée → login → retour vue cible | ⚠️ SATISFIABLE — PARTIEL (différé Android) | Chemin en ligne + cold-start hors-ligne prouvés automatisablement (6/6 e2e, tests A–F) + Desktop on-device ; Android 16 §1.4 Échoué consigné et différé par décision utilisateur. NB : REQUIREMENTS.md ligne 35 marque `[x]` — la coche ne vaut que pour le mécanisme, l'item Android reste ouvert (deferred-items.md + STATE.md). |
| DLNK-03 | 35-01, 35-02, 35-04 | Vue « Tâches du jour » dédiée comme cible du raccourci | ✓ SATISFIABLE (mécanisme complet, même réservé Android §1.4) | Vue + route + manifest + filtre + assignés + rendu cold-start prouvés (tests, e2e, Desktop on-device) ; l'échec Android relève du bootstrap (DLNK-02), pas de la vue |

Aucun requirement orphelin : REQUIREMENTS.md ne mappe que DLNK-02 et DLNK-03 sur la phase 35.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (aucun) | — | Pas de TBD/FIXME/XXX/stub dans les fichiers couverts | ℹ️ | — |
| e2e critical-paths.spec.ts | — | 1 échec préexistant (token format), prouvé antérieur (base 36ac215), hors périmètre | ℹ️ | Consigné deferred-items.md |
| auth-bootstrap-offline.test.tsx:93 | — | waitFor sensible à la charge parallèle (1/3 échec sous 9 workers) | ℹ️ | Advisory — vert en isolation, à surveiller |

### Human Verification Required

Voir `human_verification` en frontmatter : (1) matrice iOS réelle à la prochaine disponibilité d'appareil ; (2) gate SW « file vide » à la prochaine mise en production ; (3) rejeu Android §1.4 après le diagnostic DLNK-02 Android.

### Gaps Summary

**Les deux gaps du rapport initial sont traités :**

1. **Gap 2 (D-07, §1.5) — CLOS et prouvé de bout en bout.** Cause racine (bootstrap hors-ligne bloquant le montage du routeur) corrigée par 35-04 ; e2e G vert sur les 2 projets (re-exécuté ici) ; rejeu on-device 2026-11-06 Passé sur Desktop ET Android 16 ; fix réactif MED-1 (4d089f1) en place. Aucune réserve.
2. **Gap 1 (§1.4, cold-start avec session) — PARTIELLEMENT clos.** Le mécanisme existe, est câblé, et dispose désormais de la couverture automatisée qui faisait défaut (c'est corrigé : 6 tests A–F + e2e H + test I, tous verts). Desktop on-device est Passé. **Android 16 reste Échoué** au rejeu 35-05 (« encore chargement de votre foyer ») — consigné honnêtement avec symptôme et pistes, différé PAR DÉCISION UTILISATEUR (« consigner et différer », STATE.md:30), porté par deferred-items.md. Non réinscrit comme gap actif (déjà porté), mais le bloqueur STATE.md tient : la phase n'est pas close tant que l'item n'est pas corrigé et re-rejoué.

**Pourquoi human_needed et pas passed :** le goal exige la validation « sur les trois OS ». Android §1.4 est Échoué (différé) et iOS est entièrement non testé (appareil absent). Le critère OS-coverage n'est pas tenu, et c'est précisément un point de contrôle humain (items 1 et 3). Toute la part automatisable est verte et re-prouvée à cette vérification : typecheck 0, 44/45 unitaires (1 flake de timing en isolation vert), e2e 6/6.

**Prochaines actions recommandées :** `/gsd-plan-phase --gaps` n'est PAS requis (aucun gap actif) — ouvrir un plan de diagnostic DLNK-02 Android (pistes déjà écrites dans deferred-items.md), puis rejeu Android §1.4, puis matrice iOS à la prochaine disponibilité d'appareil.

---

_Verified: 2026-11-06T17:45:00Z_
_Verifier: the agent (gsd-verifier)_
