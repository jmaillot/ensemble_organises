# Phase 35: Deep links & validation multi-OS - Research

**Researched:** 2026-11-06
**Domain:** PWA deep-link routing correctness + multi-OS validation methodology
**Confidence:** HIGH (code findings verified this session) / MEDIUM (iOS on-device behavior)

<user_constraints>
## User Constraints (from CONTEXT.md — LOCKED, implement exactly)

### Implementation Decisions
- **D-01:** Route dédiée `/taches/jour`, cible du raccourci manifest (remplace `/taches` posée en 32-01 dans `app/vite.config.ts`), réutilise les composants de `taches-page`, rendu prioritaire en cold-start offline.
- **D-02:** Périmètre = échéances aujourd'hui + retards (`due_date` ≤ aujourd'hui, non faites) — retards en rouge en haut (AGENTS.md §6).
- **D-03:** Interaction minimale cochable : liste + coche + bouton retour vers `/taches`. Pas de filtres, dossiers, ajout rapide, édition, DnD.
- **D-04:** Assignés visibles avec `color_tag`/avatar, coche selon rôle. Assignations Tier 1 déjà dans la allowlist de lecture offline.
- **D-05:** Prouver l'existant `RequireAuth` → `state.from` → `internalPathOf()` (garde T-19-43) ; ne corriger que si l'e2e révèle un trou. Aucune refonte.
- **D-06:** E2e dédié = un scénario unique : cold-start session expirée → garde → login → retour `/taches/jour` → vue rendue.
- **D-07:** Deep link hors-ligne SANS session : écran explicite « connexion requise pour cette vue » — jamais une erreur technique générique.
- **D-08:** Aucun stockage de cible au-delà de `state.from` — pas de localStorage/sessionStorage.
- **D-09:** Exécution matrice = checklist guidée ; l'humain exécute sur appareils réels ; l'agent prépare la grille et les étapes par OS.
- **D-10:** Consignation = grille dédiée `35-VALIDATION-MATRICE.md` : lignes = cas, colonnes desktop/Android/iOS, statut + quirk par cellule.
- **D-11:** Chaque cellule explicite : Passé / Échoué / Quirk consigné / Non testé (appareil absent). L'honnêteté prime.
- **D-12:** La grille intègre AUSSI la checklist « looks done but isn't » (PITFALLS) et la vérification gate SW « file vide » — un seul document, ordre fixe.
- **D-13:** Plan 1 = vue `/taches/jour` + e2e redirect + écran offline sans session ; Plan 2 = grille + passage on-device guidé.

### the agent's Discretion
- Forme exacte de l'écran « connexion requise » (composant réutilisé vs dédié) dans les limites de D-07.
- Structure interne de la grille (colonnes supplémentaires : appareil, version OS, notes).
- Détails de composition de la vue `/taches/jour` (en-tête, compteur, état vide) dans les limites de D-02/D-03.
- Découpage fin en plans au-delà du séquençage D-13.

### Hors périmètre (phase boundary)
- Background Sync (rejeu app fermée — v1.x), raccourcis iOS natifs (l'OS ignore le champ), retour du mode démo Dexie, correction des 2 tests anniversaires préexistants (34-deferred-items), refonte du mécanisme de redirection.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DLNK-02 | Deep link ouvert pendant session expirée → login → retour à la vue cible (redirect-after-login, e2e dédié) | Mécanisme DÉJÀ PRÉSENT et vérifié : `RequireAuth` écrit `state.from` (router.tsx:35), sign-in-page le consomme (sign-in-page.tsx:102,114). Reste : e2e dédié (D-06) + écran offline sans session (D-07) |
| DLNK-03 | Vue « Tâches du jour » dédiée comme cible du raccourci, rendant depuis le cache persisté en cold-start hors-ligne | Route `/taches/jour` n'existe pas encore (router.tsx:310-322 n'a que `/taches` et `/taches/aide`) ; raccourci pointe `/taches` (vite.config.ts:44) ; filtre « aujourd'hui + retards » à construire (aucun filtrage date dans taches-page.tsx) |
</phase_requirements>

## Summary

Les trois fondations existent déjà et ont été vérifiées dans le code ce session : (1) le mécanisme redirect-after-login est **complet** (`RequireAuth` → `state.from` → `internalPathOf()` → navigate après login), DLNK-02 est donc une **preuve par e2e**, pas une construction — exactement ce que D-05 verrouille. (2) La route `/taches/jour` **n'existe pas** et le raccourci manifest pointe encore `/taches` — la vue dédiée est la seule vraie construction de code de la phase. (3) Le gate SW « file vide » est **déjà branché** aux deux points d'application de mise à jour (`update-banner.tsx`, `offline-panel.tsx`), tous deux désactivant le bouton tant que `useOutboxGate().isEmpty` est faux — le critère 4 est une vérification, pas un travail.

Le travail de la phase se répartit en : Plan 1 (code) = nouvelle route + composant minimal + cible manifest + e2e redirect + écran « connexion requise » hors-ligne sans session ; Plan 2 (méthode) = grille `35-VALIDATION-MATRICE.md` qui fusionne les cas de matrice multi-OS, la checklist « looks done but isn't » de PITFALLS.md et le passage du gate SW, exécutée par l'humain sur appareils réels.

**Primary recommendation:** Plan 1 code-first (vue + e2e + écran offline), Plan 2 grille unique de validation ; ne toucher ni au mécanisme de redirection ni au gate SW.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Redirect-after-login | Frontend (Router gardes) | — | `RequireAuth` + `sign-in-page` vivent dans la SPA ; aucune logique serveur |
| Vue `/taches/jour` | Frontend (React + TanStack Query) | IndexedDB (cache persisté 33) | Rendu depuis le cache restauré, requêtes Supabase via adaptateur `data` |
| Écran « connexion requise » hors-ligne | Frontend (Router + landing) | — | Pure UX de garde, lecture `navigator.onLine` + `state.from` |
| Cible du raccourci manifest | Build (vite.config.ts) | — | Champ `shortcuts` du manifest Vite PWA |
| Gate SW « file vide » | Frontend (bannières + panneau) | — | Déjà branché ; vérification seulement |
| Matrice multi-OS | Humain (on-device) | Agent (grille + étapes) | D-09/D-10 : l'agent ne peut pas exécuter Android/iOS réels |

## Standard Stack

Aucun nouveau package — cette phase n'installe RIEN (aucun audit de légitimité requis).

| Élément | Version | Rôle | Source |
|---------|---------|------|--------|
| React Router (déclaratif) | 8.4 | `Navigate`, `useLocation`, `state.from` — imports depuis `react-router`, jamais `react-router-dom` (AGENTS.md §2.1) | [VERIFIED: AGENTS.md §2.1 + router.tsx] |
| vite-pwa (`virtual:pwa-register`) | config existante | `registerType: 'prompt'`, champ `shortcuts` | [VERIFIED: app/vite.config.ts:67,43-45] |
| TanStack Query persister | posé phase 33 | Rendu cold-start offline de `/taches/jour` | [VERIFIED: src/lib/offline/query-persistence.ts] |
| Playwright | 1.63.0 | e2e dédié DLNK-02 | [VERIFIED: app/package.json:70] |
| date-fns | v4 | Filtre `due_date` ≤ aujourd'hui | [VERIFIED: AGENTS.md §2.1] |

## Verified Code Findings

### 1. Redirect-after-login : mécanisme COMPLET (D-05 confirmé)

**`app/src/app/router.tsx:28-38`** [VERIFIED: app/src/app/router.tsx:28-38] :
```tsx
function RequireAuth({ children }: { children: ReactNode }) {
  const isAuthenticated = useIsAuthenticated();
  const location = useLocation();
  if (!isAuthenticated) {
    // La chaîne de requête fait partie de la route visée ...
    return <Navigate to="/connexion" replace state={{ from: location.pathname + location.search }} />;
  }
  return <RequireAttestation>{children}</RequireAttestation>;
}
```

**`app/src/modules/landing/sign-in-page.tsx:64,102,114`** [VERIFIED: app/src/modules/landing/sign-in-page.tsx] : `internalPathOf()` exportée (garde anti open-redirect T-19-43, résolution contre l'origine courante) ; à la ligne 102 `requestedPath = internalPathOf((location.state as { from?: unknown } | null)?.from)` ; après login réussi `navigate(requestedPath ?? '/accueil')`.

**Conséquence plan:** DLNK-02 = écrire UN e2e. Toute correction du mécanisme est conditionnée à un échec de cet e2e.

**Nuance d'amorçage (à respecter dans l'e2e):** le commentaire de sign-in-page précise que les gardes en aval (`RequireHousehold`) restent maîtres — un compte sans foyer arrivant sur `/taches/jour` repart vers le choix créer/rejoindre. L'e2e doit utiliser un compte AVEC foyer.

### 2. Route `/taches/jour` : ABSENTE — à créer (D-01/D-03)

- [VERIFIED: app/src/app/router.tsx:310-322] sous `RequireAuth` : `path="/taches"` et `path="/taches/aide"` seulement. Aucune `/taches/jour`.
- [VERIFIED: app/src/modules/taches/taches-page.tsx] — aucun filtrage par date existant (aucun `startOfDay`/`isBefore` sur `due_date` dans la page) ; la vue filtre/fold par statut et dossiers. Le filtre D-02 (`due_date ≤ today && status ≠ fait`) est à écrire.
- [VERIFIED: AGENTS.md §5] énum des statuts tâches : `à faire` / `en cours` / `fait`.
- Composants réutilisables dans `app/src/modules/taches/components/` (liste, coche, assignés avec color_tag) — l'agent planificateur choisira lesquels importer vs extraire (discretion).
- Raccourci manifest à repointer [VERIFIED: app/vite.config.ts:44] : `{ name: 'Tâches du jour', url: '/taches', ... }` → `url: '/taches/jour'`.

**Données nécessaires au rendu offline (critère 2):** `tasks` + `task_assignees` + `household_members` (color_tag) — les 5 tables Tier 1 incluent tasks et task_assignees (STATE.md 34-02 : WRITE_ALLOWLIST = les 5 tables D-14 ; la allowlist de LECTURE offline de phase 33 couvre Tier 1 dont Tâches). [VERIFIED: .planning/STATE.md:77 + 35-CONTEXT.md D-04] ; assignations Tier 1 déjà dans la allowlist de lecture.

### 3. Écran « connexion requise » hors-ligne sans session (D-07)

[VERIFIED: app/e2e/offline-shared-device.spec.ts:32-35, commentaire] : « le chemin offline du bootstrap (`connectOfflineCache`) n'est branché qu'en session Supabase ». Donc sans session, cold-start offline → `RequireAuth` redirige vers `/connexion` avec le formulaire email standard — qui échouera réseau → erreur technique générique. C'est précisément ce que D-07 interdit.

**Design recommandé (discretion D-07):** dans `sign-in-page`, quand `requestedPath` existe ET `!navigator.onLine`, rendre l'écran explicite « connexion requise pour cette vue » (composant dédié léger, avec bouton « Se reconnecter » vers le formulaire + indication de la vue visée) au lieu du formulaire brut. Aucun stockage (D-08 respecté : `state.from` suffit, `navigator.onLine` est une lecture d'état, pas un stockage). Alternative : une route-garde dédiée — plus lourd, à éviter.

### 4. Gate SW « file vide » : DÉJÀ BRANCHÉ (critère 4 = vérification)

- [VERIFIED: app/src/lib/sw-register.ts:26-35] : `registerType: 'prompt'` (vite.config.ts:67), `onNeedRefresh` pousse le bannier `sw-update` et met `needsRefresh: true`. Aucun reload automatique.
- [VERIFIED: app/src/components/banners/update-banner.tsx:19,29-32] : bouton `disabled={!isEmpty}` (`useOutboxGate`), label « Recharger » vs « Mise à jour en préparation… ».
- [VERIFIED: app/src/modules/parametres/components/offline-panel.tsx:60,137-145] : même gate sur le bouton « Appliquer maintenant » du panneau.
- [VERIFIED: .planning/STATE.md:80] : « Gate 32-D10 branchée sur useOutbox : isEmpty = pendingCount === 0, échecs terminaux hors comptage (34-04) ».

**Conséquence plan:** aucune modification de code pour le critère 4 — la grille (Plan 2) contient les étapes de vérification on-device (ouvrir le bandeau pendant un rejeu, constater le bouton désactivé, vérifier qu'aucun reload ne survient).

### 5. Chaîne e2e existante et ses contraintes

- [VERIFIED: app/e2e/] : 13 specs Playwright, `npm run test:e2e`.
- [VERIFIED: app/e2e/offline-shared-device.spec.ts:24-40] : les e2e tournent en **mode démonstration** (un seul compte démo, pas de backend) ; les specs exigeant un backend réel s'ignorent explicitement via `test.skip(cond, reason)` avec env vars (`E2E_SHARED_USER_A_EMAIL`…).
- Le spec offline existant prouve l'isolation A/B **unitairement** (`query-persistence.test.ts`, fake-indexeddb) et e2e seulement si backend configuré.

**Implication pour le scénario D-06:** le scénario « session expirée → login → retour » doit fonctionner en mode démo : simuler l'expiration en vidant la session (localStorage/session Supabase mockée du mode démo — repérer le mécanisme exact dans le harnais démo au moment du plan) puis naviguer vers `/taches/jour` cold-start. Si le mode démo ne permet pas de simuler l'expiration proprement, suivre le patron du spec offline : `test.skip` documenté avec env vars backend réelles. **Ne jamais déclarer vert un test ignoré.**

### 6. Checklist « looks done but isn't » (source de D-12)

[VERIFIED: .planning/research/PITFALLS.md:248-259] — 11 items exacts :
1. Offline read : chaque module offline affiche l'horodatage de fraîcheur — vérifier chaque module, pas un seul
2. Write queue : écriture vers une ligne supprimée serveur → échec **surfaced** au reconnect
3. Idempotence : une écriture ambiguë rejouée crée exactement une ligne (contrainte unique + test SQL négatif)
4. Logout/switch foyer : `queryClient.clear()` + purge persister + purge file **awaitées avant navigation** (e2e deux utilisateurs)
5. Rejeu sous mauvaise identité : entrée de A ne rejoue que sous A
6. Update flow : nouvelle version SW proposée, gated sur file vide, application sans perte d'écritures pendantes — **sur appareil**
7. Manifest shortcuts : apparaissent après update SW + relaunch sur Android ; chaque deep link résout cold-start déconnecté — **les 3 OS**
8. iOS : push depuis PWA installée, demande de persistance du stockage, guide d'install manuel, rejeu au foreground — **vrai iPhone**
9. SW denylist : aucune route de cache runtime ne matche `/rest/`, `/auth/`, `/storage/`, `/realtime/`, `/functions/` (contrôle statique §2.7, prouvé must-fail — **déjà livré OFFR-05 phase 33**, vérifier qu'il est vert)
10. Connectivity truth : portail captif ne rejoue pas la file dans le vide

## Common Pitfalls

### Pitfall 1: Marquer « vérifié » ce qui n'a pas tourné
**Quoi:** cocher une cellule de matrice sans exécution réelle. **Éviter:** D-11 — statuts explicites uniquement ; « Non testé (appareil absent) » documenté est honnête.
### Pitfall 2: e2e vert mais ignoré
**Quoi:** un `test.skip` silencieux passe pour un succès. **Éviter:** suivre le patron `offline-shared-device.spec.ts` — raison de skip explicite en constantes, jamais de vert sans exécution (§2.7 F).
### Pitfall 3: Dupliquer taches-page au lieu de réutiliser
**Quoi:** recopier la logique de liste. **Éviter:** D-01 — importer/extraire les composants de `taches-page.tsx` ; la vue dédiée n'a ni DnD ni dossiers ni création.
### Pitfall 4: Stocker la cible de redirection ailleurs que `state.from`
**Quoi:** localStorage pour survivre au reload — risque inter-utilisateurs. **Interdit par D-08.**
### Pitfall 5: Tester la matrice sur du code intermédiaire
**Quoi:** lancer on-device avant la fin du Plan 1. **Éviter:** D-13 — la matrice teste le code final.
### Pitfall 6: Filtre « aujourd'hui » fragile au fuseau
**Quoi:** comparer `due_date` (date pure) avec un instant UTC. **Éviter:** `date-fns` `startOfDay(today())` local ; `due_date` est une date, pas un timestamp.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Validation open-redirect | nouveau parseur d'URL | `internalPathOf()` existante (sign-in-page.tsx:64) | déjà prouvée, testée (T-19-43) |
| Détection offline | heuristique fetch | `navigator.onLine` (patron existant route-error.tsx / listener online historique) | standard, cohérent avec le code existant |
| Gate file vide | nouveau compteur | `useOutboxGate().isEmpty` (34-04) | déjà branché et testé |
| Rendu cold-start offline | fetch réseau + try/catch | persister TanStack 33 restauré avant premier rendu | c'est l'infrastructure existante du critère 2 |

## Validation Matrix Design (Plan 2 — D-09/D-10/D-12)

**Fichier:** `.planning/phases/35-deep-links-validation-multi-os/35-VALIDATION-MATRICE.md`
**Structure:** sections ordonnées (ordre fixe), chaque cas = tableau lignes=cas / colonnes=Desktop / Android / iOS, cellules = `Passé | Échoué | Quirk: … | Non testé (appareil absent)`. Colonnes additionnelles conseillées : appareil, version OS, date, notes.

Sections proposées (ordre fixe D-12):
1. **Matrice offline complète** (critère 3) : install (invite Chromium / guide iOS), raccourcis (appui long Android ; atteignable in-app iOS), lecture offline avec bandeau fraîcheur (par module Tier 1), rejeu foreground avec badge/panneau, purge inter-utilisateurs (A→B même appareil)
2. **Gate SW « file vide »** (critère 4) : enfile une écriture hors-ligne, ouvre le bandeau update → bouton désactivé, constater zéro reload ; vide la file → bouton actif
3. **Checklist « looks done but isn't »** : les 11 items de PITFALLS.md:248-259, chacun avec preuve attendue (commande, e2e, ou étape on-device)
4. **Quirks iOS attendus** (pré-remplis dans la grille pour honest-checking) : ITP éviction du stockage script-writable ≈ 7 jours sans visite (cache lecture peut disparaître), iOS ignore `shortcuts` du manifest, Background Sync absent → rejeu foreground seulement, installation manuelle Safari (guide in-app 32-03)

## Open Questions (RESOLVED)

1. **Le mécanisme redirect-after-login existe-t-il ?** → OUI, complet : [VERIFIED: router.tsx:28-38, sign-in-page.tsx:64,102,114]. D-05 « prouver l'existant » est fondé.
2. **`/taches/jour` existe-t-elle ?** → NON [VERIFIED: router.tsx:310-322]. À créer (D-01). Le raccourci pointe `/taches` [VERIFIED: vite.config.ts:44] et doit être repointé.
3. **Le gate SW « file vide » est-il branché ?** → OUI aux deux points d'application [VERIFIED: update-banner.tsx:19,29-32 ; offline-panel.tsx:60,137-145]. Critère 4 = vérification seulement.
4. **Comment l'e2e DLNK-02 tourne-t-il sans backend ?** → Mode démo obligatoire : simuler l'expiration en vidant la session du harnais démo ; si impossible proprement, patron `test.skip` documenté avec env backend (patron `offline-shared-device.spec.ts`). Décidé au plan, jamais de vert silencieux.
5. **Que voit un deep link hors-ligne sans session aujourd'hui ?** → `/connexion` avec formulaire qui échouera réseau → erreur générique [VERIFIED: commentaire offline-shared-device.spec.ts:32-35 : connectOfflineCache branché seulement en session Supabase]. C'est le trou D-07 : écran explicite à ajouter.
6. **Quelles données pour le rendu offline de la vue ?** → tasks + task_assignees + household_members, couvertes par la allowlist lecture 33 [VERIFIED: 35-CONTEXT.md D-04, STATE.md:77]. Aucune migration, aucune allowlist à toucher.
7. **Où vit la checklist « looks done but isn't » ?** → `.planning/research/PITFALLS.md:248-259`, 11 items [VERIFIED]. Elle fusionne dans la grille D-12.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5 + Playwright 1.63.0 |
| Config file | `app/playwright.config.*` (existant), Vitest via package.json |
| Quick run command | `cd app && npx vitest run src/modules/taches` |
| Full suite command | `cd app && npm run typecheck && npm test && npm run build && npm run test:e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DLNK-02 | redirect-after-login e2e | e2e | `cd app && npx playwright test e2e/deep-link-redirect.spec.ts` | ❌ Wave 0 (le test EST la livrable) |
| DLNK-03 | vue `/taches/jour` filtre + coche + offline | unit + composant | `cd app && npx vitest run src/modules/taches` | ❌ à créer |
| Critère 4 | gate SW file vide | on-device (grille) + tests existants | tests banner/panel existants (`npm test`) | ✅ (32/34) |
| Matrice | multi-OS | manual-only (D-09) | grille `35-VALIDATION-MATRICE.md` | ❌ Plan 2 |

### Wave 0 Gaps
- [ ] `app/e2e/deep-link-redirect.spec.ts` — DLNK-02
- [ ] test unitaire filtre D-02 (retards en haut, cochées exclues)
- [ ] test écran « connexion requise » hors-ligne sans session

### Verification chain (AGENTS.md §2.7 — obligatoire)
```sh
cd app && npm run typecheck && npm test && npm run build
cd app && npm run test:e2e
python3 scripts/check-sql-statique.py   # aucune migration prévue — doit rester vert
sh scripts/test-db.sh                   # non requis (aucun changement SQL)
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Simuler l'expiration de session en mode démo e2e est faisable (vidage de session du harnais démo) | §5 e2e | e2e DLNK-02 devient skip-documenté (acceptable, pas bloquant) |
| A2 | iOS ITP éviction ≈ 7 jours sans visite pour stockage script-writable | Matrice quirks | Quirk pré-rempli inexact — corrigé par la consignation réelle (D-11 le tolère) |
| A3 | Énum statuts tâches `à faire/en cours/fait` (source AGENTS.md §5, non relue dans types.ts ce session) | §2 vue | Filtre D-02 faux — vérifier `app/src/modules/taches/types.ts` au plan |
| A4 | `household_members` est dans la allowlist de lecture offline (requis pour color_tag hors-ligne) | §2 données | Assignés invisibles offline — vérifier `query-policy.ts` au plan, ajout allowlist sinon |

## Sources

### Primary (HIGH)
- Code lu ce session : `app/src/app/router.tsx`, `app/src/modules/landing/sign-in-page.tsx`, `app/src/modules/taches/taches-page.tsx` + `api.ts`, `app/vite.config.ts`, `app/src/lib/sw-register.ts`, `app/src/components/banners/update-banner.tsx`, `app/src/modules/parametres/components/offline-panel.tsx`, `app/src/lib/offline/query-persistence.ts`, `app/e2e/offline-shared-device.spec.ts`, `app/package.json`
- `.planning/research/PITFALLS.md:248-259`, `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/phases/35-*/35-CONTEXT.md`

### Tertiary (MEDIUM — à confirmer on-device)
- Comportement iOS réel (ITP, install, shortcuts ignorés) — MEDIUM, consigné en matrice (STATE.md blockers)

## Metadata

**Confidence breakdown:**
- Mécanisme redirect + gate SW : HIGH — lu dans le code ce session
- Vue `/taches/jour` : HIGH (absence vérifiée) ; détails composants à choisir au plan
- Matrice multi-OS : MEDIUM par nature — le comportement réel est l'objet de la validation

**Research date:** 2026-11-06
**Valid until:** phase locale, pas de dépendance externe mouvante
