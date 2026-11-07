---
phase: 261019-dw6
verified: 2026-10-19T09:41:28Z
status: human_needed
score: 6/6 must-haves verified
covered_files: [".planning/quick/261019-dw6-corriger-15-hors-ligne-l-app-affiche-un-/261019-dw6-CONTEXT.md", ".planning/quick/261019-dw6-corriger-15-hors-ligne-l-app-affiche-un-/261019-dw6-PLAN.md", ".planning/quick/261019-dw6-corriger-15-hors-ligne-l-app-affiche-un-/261019-dw6-SUMMARY.md", "app/src/app/route-preload.ts", "app/src/app/router.tsx", "app/src/components/shared/offline-banner.test.tsx", "app/src/components/shared/offline-banner.tsx", "app/src/hooks/use-online-status.ts", "app/src/lib/query-policy.test.ts", "app/src/lib/query-policy.ts", "app/src/modules/courses/courses-offline.test.tsx", "app/src/modules/dashboard/hooks/use-dashboard.ts", "app/src/test/render.tsx"]
covered_digest: "v2:sha256:30107ff3eb88bea9de673f80094e98f6e8d219afe58961cb684e763d040bbd8d"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 6/6
  gaps_closed:
    - "Anti-pattern ℹ️ Info (comment-only): `app/src/hooks/use-online-status.ts` justifiait la source par « c'est onlineManager qui décide si une requête part ou reste en pause », clause devenue fausse avec `networkMode: 'always'`. Réécrite en ce qui reste vrai — corrigée par 690ae9a."
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Sur l'app déployée (ou un build de prévisualisation), Firefox, F12 → Réseau → « Hors ligne », puis ouverture À FROID de la section Courses (ou rechargement de page)."
    expected: "L'`ErrorState` de Courses s'affiche avec le bouton « Réessayer », le bandeau global « Vous êtes hors ligne… » apparaît en haut, et « Aucune liste pour ce foyer » n'apparaît JAMAIS. Refaire le geste sur au moins un second module (Recettes ou Prestataires)."
    why_human: "Le constat #15 a été produit en usage réel (app déployée, Firefox, coupure réelle) ; aucun test du dépôt ne pilote le VRAI `navigator.onLine` avec le VRAI chemin réseau. La preuve automatisée (Test C) déclare l'état hors ligne via `onlineManager` et mocke `data.list` ; elle prouve le rendu de l'erreur, pas que l'état hors ligne réel du navigateur est bien capté par `onlineManager` en production."
  - test: "Lire le texte du bandeau hors ligne à l'écran, seul porteur de l'explication (l'accueil n'a, par arbitrage verrouillé, aucun état d'erreur propre)."
    expected: "Un utilisateur qui découvre l'écran comprend, sans autre indice, que l'application n'a pas pu lire les données du foyer, et qu'une zone vide affichée peut ne pas être son contenu réel."
    why_human: "La mécanique (apparition/disparition liée à `onlineManager`, rôle `status`) est testée, mais la clarté et la suffisance du TEXTE sont un jugement humain que la machine ne tranche pas (couverture D3 `human_judgment: true` du SUMMARY)."
---

# Quick Task 261019-dw6 : Corriger #15 — hors ligne, l'app affichait un état vide au lieu de dire qu'elle n'avait pas pu lire

**Goal :** Corriger #15 — hors ligne, l'application affiche un état vide au lieu de dire qu'elle n'a pas pu lire.
**Terminé quand (docs/TODO.md #15) :** une preuve montre que, hors ligne, chaque zone concernée dit qu'elle n'a pas pu lire au lieu d'un état vide — et qu'un test rend une page avec `navigator.onLine = false` en exigeant une **erreur**, le test échouant sur le code d'aujourd'hui.

**Verified:** 2026-10-19T09:41:28Z
**Status:** human_needed
**Re-verification:** Yes — after the comment-only correction `690ae9a`, on request

## Re-verification: what changed and what I checked

The prior report scored 6/6 and left two human items plus one ℹ️ Info: a stale in-code comment in `app/src/hooks/use-online-status.ts`. That Info was acted on by commit `690ae9a`. Because `use-online-status.ts` was a `covered_file`, the `covered_digest` stopped matching and the status query reports `stale` — that, and only that, is the reason for this pass.

1. **Comment-only, read from the diff — confirmed.** `git show 690ae9a` touches one file, `3 insertions / 3 deletions`; filtering out `+`/`-` lines that are comments (JSDoc `*`) yields **no executable line**. The only changed hunk is the docblock lines 7-9 (`git show`, reproduced below). No import, no statement, no type changed.
2. **The new prose is TRUE against the code as it stands — confirmed for the operative claims, with one wording nuance.**
   - `c'est lui que TanStack interroge (networkMode, …)` — VERIFIED in the installed library: `node_modules/@tanstack/query-core/build/modern/retryer.js:10` → `canFetch = (networkMode ?? 'online') === 'online' ? onlineManager.isOnline() : true`. `networkMode` consults `onlineManager`; with `'always'` it short-circuits to `true` (nothing paused). TRUE.
   - `… et le rechargement à la reconnexion` — VERIFIED: `queryClient.js:58` → `onlineManager.subscribe(async (online) => { if (online) { await this.resumePausedMutations(); this.#queryCache.onOnline(); } })`, and `queryClient.js:606` → default `refetchOnReconnect = networkMode !== 'always'` (which is why `refetchOnReconnect: true` had to be explicit). TRUE.
   - `onlineManager est l'état réseau unique de l'application` — the operative sense (the single network state TanStack consults) holds; but "unique" is a mild overstatement: four sites read `navigator.onLine` **directly** (`app/src/modules/ardoise/api.ts:587`, `app/src/modules/parametres/api.ts:134,168`, `app/src/app/route-preload.ts:92`) and `app/src/components/ui/route-error.tsx:128` adds its own `window.addEventListener('online', …)`. Those read the same browser state `onlineManager` mirrors, and none competes with the banner's choice of source — so the comment is not false in what it justifies, but "unique" is looser than the code. Recorded as ℹ️ Info, not a gap.
   - The false clause of the old comment ("décide si une requête part ou reste en pause") is **absent** from the file — `grep -n 'pause' app/src/hooks/use-online-status.ts` returns nothing.
3. **`must_haves` re-checked against HEAD** — all six still hold (see table). Targeted suites green (9/9); full unit suite green (1288/1288). `covered_digest` refreshed to bind to HEAD.
4. **What I re-ran, and what I did not.** Re-ran: the three targeted suites (9/9), and the full `npm test` once (153 files, 1288/1288, 508 s). Did **not** re-run: `npm run typecheck`, `npm run build`, `npm run test:e2e` (the orchestrator ran the whole §2.7 chain on this exact tree — typecheck green, build green, e2e 123 passed / 5 skipped / 0 failed). `690ae9a` is comment-only, so none of those exercised paths changed; I rely on the orchestrator's run for them and say so rather than claim I ran them.

## Goal Achievement

### Observable Truths

| # | Truth (must_haves.truths) | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Hors ligne, une page dont la lecture n'a pas pu être tentée affiche l'erreur qu'elle prévoit déjà, jamais un état vide qui a l'air normal (D-10). | ✓ VERIFIED | `courses-page.tsx:247-249` (ErrorState) atteint hors ligne. `courses-offline.test.tsx` (Test C) vert sur cette arborescence (rejoué, 9/9 global) ; rouge sur le code d'avant la politique (reproduit en vérification initiale). Test B prouve qu'une lecture hors ligne rejette au lieu de rester `pending`. La classe entière hérite (l'unique `QueryClient` de l'app est celui que Test D inspecte). |
| 2 | Un bandeau global annonce l'état hors ligne et porte, à lui seul, l'explication de la coupure — l'accueil n'a aucun état d'erreur propre. | ✓ VERIFIED | `OfflineBanner` monté une seule fois dans `AppRouter` (`router.tsx:455`), hors de `Routes` ; `useOnlineStatus` lit `onlineManager` (`use-online-status.ts:22-26`) ; 3 tests verts (rôle `status` hors ligne, rien en ligne, bascule en direct). La suffisance du texte = jugement humain → Human Verification. |
| 3 | La politique réseau ne met plus aucune requête en pause : `networkMode 'always'` + `refetchOnReconnect: true`, requêtes ET mutations. | ✓ VERIFIED | `query-policy.ts:39,44,49`. Test A (constante) et Test D (client résolu) verts (rejoués) ; rouges tous deux sans la politique (reproduit). Aucune surcharge locale de `networkMode` ailleurs (`grep` ne rend rien hors ces deux fichiers). |
| 4 | Les deux commentaires qui parlaient encore de la file de rejeu supprimée par D-10 disent la vérité. | ✓ VERIFIED | Les deux tournures d'origine absentes (`! grep -q 'la file rejouera' use-dashboard.ts` et `! grep -q 'la file de synchro' route-preload.ts` → OK). `use-dashboard.ts` dit « rien ne la rejoue » (exact : le `catch` avale, le store garde la valeur) ; `route-preload.ts:70-72` dit « hors ligne, télécharger est voué à l'échec » (exact : `navigator.onLine === false` → retour anticipé, l.92). |
| 5 | Le `queryClient` de l'application — celui que `main.tsx` monte — résout la politique partagée. | ✓ VERIFIED | `router.tsx:23` `export const queryClient = buildQueryClient()` ; `main.tsx:38` rend `AppRouter` qui pose ce client dans `QueryClientProvider` (`router.tsx:438`). Test D lit `getDefaultOptions()` sur **ce client** ; vert rejoué, vu rouge en retirant `networkMode`. |
| 6 | Une garde de classe refuse la régression : l'invariant est prouvé par un test qui échoue sur le code d'aujourd'hui (§2.7 B). | ✓ VERIFIED | Tests A/B/C/D vus **rouges** sans la politique et **verts** avec (reproduit en vérification initiale) ; Test E vu rouge en ajoutant un `new QueryClient(` hors politique, nommant le fichier fautif. Rejoués verts ici (dont l'auto-contrôle « la racine des sources est trouvée » et le refus d'un client en ligne). Limite textuelle de Test E assumée et doublée par Test D. |

**Score:** 6/6 truths verified (0 present-but-behavior-unverified)

### Deferred Items

Aucun. Cette tâche est un constat ponctuel de `docs/TODO.md` ; aucun élément non satisfait n'est rattaché à une phase ultérieure du milestone.

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `app/src/lib/query-policy.ts` | Source unique des `defaultOptions` | ✓ VERIFIED | 69 l. **WIRED** : importé par `router.tsx:4` ET `test/render.tsx:8`. |
| `app/src/components/shared/offline-banner.tsx` | Bandeau global monté une fois | ✓ VERIFIED | 35 l. **WIRED** : importé et rendu dans `router.tsx:8,455` (unique point de montage). |
| `app/src/hooks/use-online-status.ts` | Abonnement à `onlineManager` via `useSyncExternalStore` | ✓ VERIFIED | 27 l. **WIRED** : consommé par `offline-banner.tsx:1,21`. Snapshot serveur `true` (pas de faux bandeau en pré-rendu). Commentaire corrigé (`690ae9a`), exécutable inchangé. |
| `app/src/lib/query-policy.test.ts` | Garde de classe (A, B, D, E) | ✓ VERIFIED | Tests A/B/D + auto-contrôle racine + Test E, tous verts. |
| `app/src/modules/courses/courses-offline.test.tsx` | Non-régression bout en bout (C) | ✓ VERIFIED | Cache vide, hors ligne avant montage, `data.list` rejette → « Réessayer » présent, « Aucune liste pour ce foyer » absent. |

Aucun artefact `MISSING`, `STUB`, `ORPHANED` ni `HOLLOW`.

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `app/src/app/router.tsx` | `app/src/lib/query-policy.ts` | `queryClient = buildQueryClient()` | ✓ WIRED | Test D inspecte les valeurs **résolues** du client exporté ; rouge si `router.tsx` reprend un client en ligne. |
| `app/src/test/render.tsx` | `app/src/lib/query-policy.ts` | `createTestQueryClient() → buildQueryClient({…})` | ✓ WIRED | Le harnais dérive de la politique : Test C exerce la politique **réelle**, `retry: false` seulement surchargé. |
| `app/src/components/shared/offline-banner.tsx` | `onlineManager` (TanStack) | `useOnlineStatus` (`useSyncExternalStore`) | ✓ WIRED | Même source que celle consultée par TanStack (`retryer.js:10`, `queryClient.js:58`) ; bascule en direct testée. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `OfflineBanner` | `isOnline` | `onlineManager.isOnline()` (magasin externe réel, abonné) | Oui — état réseau réel, pas une constante | ✓ FLOWING |
| `CoursesPage` | `isError` / `rows` | `useResource` → `data.list()` → TanStack `useQuery` (client de l'app, politique résolue) | Oui — la lecture part et échoue hors ligne (Test B/C) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Suites ciblées vertes (rejouées) | `npx vitest run src/lib/query-policy.test.ts src/modules/courses/courses-offline.test.tsx src/components/shared/offline-banner.test.tsx` | 3 fichiers, **9/9** | ✓ PASS |
| Suite unitaire complète (rejouée) | `npm test` | **153 fichiers, 1288/1288**, 0 échec (508 s) | ✓ PASS |
| Red-capability de la politique (vérif. initiale) | retrait temporaire de `networkMode`/`refetchOnReconnect` → suites ciblées | **4 rouges** (A, B, C, D), restauré (arbre propre) | ✓ PASS (rouge observé) |
| Red-capability Test E (vérif. initiale) | `new QueryClient(` hors politique → Test E | **Test E rouge**, nomme le fichier fautif ; fichier supprimé, arbre propre | ✓ PASS (rouge observé) |

### Probe Execution

Aucune sonde déclarée (ni dans PLAN/SUMMARY, ni conventionnelle `scripts/*/tests/probe-*.sh`). Étape sans objet.

### Requirements Coverage

`must_haves.requirements` du PLAN = `[]` ; `docs/TODO.md` #15 ne porte pas d'identifiant `REQ-*`. Le critère de fin du constat #15 (« une preuve …, et un test … qui échoue sur le code d'aujourd'hui ») est couvert par les truths 1 et 6. Aucune exigence orpheline.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| (aucun) | — | `TBD`/`FIXME`/`XXX` réels | — | `grep -nE 'TBD|FIXME|XXX'` sur les sept fichiers de code touchés ne rend **rien**. Robuste à la porte-frein de §2.7. |
| `app/src/hooks/use-online-status.ts` | 8 | Clause périmée « décide si une requête part ou reste en pause » | ✓ RESOLVED | Corrigée par `690ae9a` ; le mot « pause » est absent du fichier. La nouvelle prose est vraie sous ses affirmations opérantes (voir Re-verification). |
| `app/src/hooks/use-online-status.ts` | 8 | « `onlineManager` est l'état réseau unique de l'application » — léger excès de langage | ℹ️ Info | Quatre sites lisent `navigator.onLine` en direct (`ardoise/api.ts:587`, `parametres/api.ts:134,168`, `route-preload.ts:92`) et `route-error.tsx:128` a son propre écouteur `window 'online'`. Aucun ne contredit ce que le commentaire justifie (la source que TanStack interroge) ; « unique » est simplement plus étroit que le code. Sans effet sur le comportement ni sur les liens. |
| `app/src/components/shared/offline-banner.tsx` | 10-18 | (rapport précédent) « la même formule de mise en pause » y subsisterait | ℹ️ Info (rectification) | **Retiré** : c'était une affirmation non vérifiée de mon rapport précédent. `offline-banner.tsx` n'a **jamais** contenu le mot « pause » (`git show f1d5191:… | grep pause` → rien ; le fichier n'a qu'un commit, `e07c6fd`). La remarque de §2.7 I s'applique à mon propre écrit : je la consigne comme retirée, plutôt que de la laisser en circulation. |
| `.planning/quick/…/261019-dw6-SUMMARY.md` | 203, 232 | Attribution du flake e2e à « la classe de course de `recettes.spec.ts` connue (traitée en 21-05) » : **assertée, non prouvée**. | ⚠️ Warning | Le flake **documenté** en 21-05 (`deferred-items.md`) est au test `recettes.spec.ts:270` (aperçu `blob:` mort), un **autre** test que celui qui a échoué (`:186`/`:207`, « enfant »). L'attribution n'est donc pas établie. Le flake lui-même n'est **pas** imputable à ce changement (`networkMode: 'always'` est équivalent à `'online'` quand le navigateur est en ligne). Observation informative, sans effet sur le but. |

Aucun 🛑 BLOCKER.

**Observation non nommée (à enregistrer pour ce qu'elle est).** Un premier `npm test` de l'orchestrateur a rapporté **1 test en échec**, dont le nom a été perdu par un filtre `tail`. Trois exécutions complètes ultérieures — la mienne en vérification initiale, celle de l'orchestrateur, et celle-ci (153 fichiers, 1288/1288, 508 s) — sont **vertes**. Le flake ne s'est pas reproduit en trois passages ; je **ne peux pas le nommer**, donc je consigne une observation non identifiée, **pas** un brevet de bonne santé de la suite. Rien ne relie cette observation aux fichiers de cette tâche (aucun d'eux n'est un harnais partagé partiellement instable de façon connue).

### Human Verification Required

#### 1. Rejeu du constat #15 en usage réel (app déployée, coupure réelle)

**Test :** Firefox → F12 → Réseau → « Hors ligne » → ouvrir à froid la section **Courses** (ou recharger la page), puis refaire sur un second module (Recettes ou Prestataires).
**Expected :** l'`ErrorState` (« Réessayer ») s'affiche, le bandeau « Vous êtes hors ligne… » est présent, et « Aucune liste pour ce foyer » n'apparaît jamais.
**Why human :** le défaut d'origine a été mesuré sur l'app déployée avec une coupure **réelle** ; aucun test du dépôt ne pilote le vrai `navigator.onLine` et le vrai chemin réseau (Test C déclare l'état via `onlineManager` et mocke `data.list`). C'est la couverture D5 (`human_judgment: true`) que le SUMMARY annonce.

#### 2. Suffisance du texte du bandeau

**Test :** lire le bandeau hors ligne à l'écran, seul porteur de l'explication de la coupure (l'accueil n'a, par arbitrage verrouillé, aucun état d'erreur propre).
**Expected :** un utilisateur comprend, sans autre indice, que l'application n'a pas pu lire les données du foyer et qu'une zone vide peut ne pas être son contenu réel.
**Why human :** la mécanique est testée (rôle `status`, apparition/disparition), mais la clarté du TEXTE est un jugement — couverture D3 `human_judgment: true`. Point de vigilance : le texte dit « l'application **ne peut pas** lire les données du foyer », affirmation absolue qu'une donnée encore en cache peut démentir ; le bandeau atténue ensuite (« une zone vide peut ne pas être son contenu réel »). À trancher à l'œil.

### Gaps Summary

Aucun gap. Les six truths restent vraies sur l'arborescence actuelle (HEAD = `690ae9a`), dont le seul delta depuis la vérification initiale est un **commentaire** dans `use-online-status.ts` — confirmé depuis le diff, sans ligne exécutable touchée. Le ℹ️ Info de la vérification initiale est fermé, et la nouvelle prose est vraie sous ses affirmations opérantes, vérifiées dans la source installée de TanStack Query (`retryer.js:10`, `queryClient.js:58,606`) : `onlineManager` est bien ce que TanStack interroge pour `networkMode` et le rechargement à la reconnexion. Une nuance de langage (« unique ») est consignée en ℹ️ Info, sans effet.

Le statut reste **human_needed**, non par défaut de code, mais parce que les deux vérifications par nature humaines subsistent : le rejeu en usage réel du constat d'origine, et la suffisance du texte du bandeau — toutes deux annoncées comme telles par le SUMMARY (`human_judgment: true` sur D3 et D5).

---

_Verified: 2026-10-19T09:41:28Z_
_Verifier: the agent (gsd-verifier)_
