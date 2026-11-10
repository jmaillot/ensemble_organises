# Phase 42: Cold start mesuré puis corrigé + décision cache - Pattern Map

**Mapped:** 2026-11-10
**Files analyzed:** 10 (4 créations, 6 modifications/docs)
**Analogs found:** 10 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/src/lib/boot-marks.ts` | utility (instrumentation) | event-driven (marks → store session) | `app/src/lib/sw-register.ts` | exact |
| `app/src/lib/boot-marks.test.ts` | test | unit | `app/src/lib/reachability.test.ts` / `query-persistence.test.ts` | role-match |
| `app/src/main.tsx` (mod) | entry point | boot sequence | lui-même (insertion mark `boot:start` au niveau module) | — |
| `app/src/lib/sw-register.ts` (mod) | utility / SW registration | event-driven | lui-même (mark fin segment SW dans `onRegisteredSW`) | — |
| `app/src/hooks/use-auth.ts` (mod) | hook / bootstrap | request-response + offline branches | lui-même (marks autour des 2 branches `connectOfflineCache`) | — |
| `app/src/lib/offline/query-persistence.ts` (mod) | service (cache) | file-I/O (IndexedDB) | lui-même (marks bornant `connectOfflineCache`) | — |
| `app/src/modules/parametres/components/offline-panel.tsx` (mod) | component | request-response (lecture session) | lui-même (section additionnelle, patron rangées clé/valeur) | — |
| Doc mesures versionné (`docs/MESURES-COLD-START-42.md` — nom libre, agent's discretion) | documentation | — | `.planning/phases/38-filet-de-tests-fiable/38-E2E-SIGNATURE.md` | exact |
| `app/src/lib/query-policy.ts` (mod conditionnel CACHE-01) | config (politique) | — | lui-même + tests `query-policy.test.ts` (Test H) | — |
| `.planning/PROJECT.md` (mod) | documentation (décision CACHE-01) | — | sections de décision existantes de PROJECT.md | role-match |

> Vérification tracked-source (#3645) : tous les chemins analogues nommés ci-dessus
> sont git-tracked (`git ls-files` non vide pour chaque fichier — vérifié ce session).

## Pattern Assignments

### `app/src/lib/boot-marks.ts` (utility, event-driven) — NOUVEAU

**Analog:** `app/src/lib/sw-register.ts` (intégralité, 36 lignes)

Module hors-React avec store zustand accessible hors composant — c'est exactement
le patron de `sw-register.ts` (commentaire l.3-4 : « accès au store hors-React,
patron `session-store.ts` »).

**Imports + store pattern** (sw-register.ts l.6-24) :
```typescript
import { registerSW } from 'virtual:pwa-register';
import { create } from 'zustand';
import { useBannerStore } from '@/components/banners/banner-store';

interface SwState {
  registration: ServiceWorkerRegistration | null;
  needsRefresh: boolean;
  setRegistration: (registration: ServiceWorkerRegistration | null) => void;
}

export const useSwState = create<SwState>()((set) => ({
  registration: null,
  needsRefresh: false,
  setRegistration: (registration) => set({ registration }),
}));
```

**Code à copier pour `boot-marks.ts`** : interface d'état typée (4 durées + total),
`create<T>()((set) => ...)`, mutations par `setState`/`getState()` depuis le code
non-composant. Remplacer les callbacks SW par des `performance.mark`/`measure`
(research Pattern 1). Commentaires en français nommant la RAZON du choix (§2.7,
pas de linter ici) — chaque mise à jour de store doit être lue UNIQUEMENT au
montage du panneau (PD-02 / research Pitfall 1 : aucune subscription React
active pendant le démarrage).

### `app/src/lib/boot-marks.test.ts` (test, unit) — NOUVEAU

**Analog:** `app/src/lib/reachability.test.ts` (test de lib pure, mocks `vi`), et
`app/src/lib/offline/query-persistence.test.ts` (tests du service offline, patron
d'assertions bornées §2.7 D).

Points de test imposés par RESEARCH.md Validation Architecture :
- total = borne à borne (`boot:done − boot:start`), PAS la somme des 4 segments
  (Pattern 2 : segments chevauchants) ;
- StrictMode double-monte en dev : le dernier passage écrase (Pitfall 2) ;
- test de garde : aucun `set(` ni `persistQueryClientSave` dans boot-marks
  (PD-02 — l'instrumentation ne doit pas écrire IndexedDB).

### `app/src/main.tsx` (mod — mark `boot:start` au niveau module)

**Point d'insertion :** au niveau module, AVANT `seedOnlineStatus()` (l.28) —
le mark doit être posé au plus tôt, avant tout travail de démarrage. Commentaire
de raison obligatoire (patron du fichier : chaque appel module-scope porte son
bloc de commentaire, cf. l.22-27 pour `seedOnlineStatus`, l.30-40 pour la sonde).

**Structure existante à respecter** (l.28-40, l.83-91) :
```typescript
seedOnlineStatus();
demarrerSondeJoignabilite();
// ...
if (import.meta.env.VITE_E2E_SW_HARNESS === '1') {
  void import('@/lib/e2e-sw-harness');
}
createRoot(container).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
```
Le mark `entry:done` (fin de l'évaluation du bundle) se pose au point où
`createRoot(...).render(...)` a été appelé (après l.91). Le harnais e2e
conditionnel (`VITE_E2E_SW_HARNESS`) est le CONTRE-exemple à ne pas copier pour
les marks : PD-03 exige des marks toujours actifs, sans flag de build.

### `app/src/lib/sw-register.ts` (mod — fin du segment « activation SW »)

**Analog : lui-même.** Le mark de fin se pose dans le callback existant
`onRegisteredSW` (l.33-35) :
```typescript
onRegisteredSW(_, registration) {
  useSwState.getState().setRegistration(registration ?? null);
},
```
PATTERN 3 (un call `registerSW({ immediate: true, onRegisteredSW })`, dedup via
store). Un commentaire hors-ligne consigne le fait que ce mark peut être absent
ou à 0 ms au cold start hors ligne (Pitfall 3 — l'écart entre runs est un fait à
consigner, jamais lissé). Le segment peut déborder de la fenêtre de mesure si
l'activation SW est post-`ready` (assumption A2) — le protocole fixe la borne.

### `app/src/hooks/use-auth.ts` (mod — segment « auth bootstrap »)

**Analog : lui-même.** Constante de borne existante (l.111) :
```typescript
export const DELAI_GARDIEN_AMORCAGE_MS = 10_000;
```

**Les DEUX branches `connectOfflineCache` doivent porter le mark « idb »** —
recherche OQ-1 : branches l.262 (chemin hors-ligne) et l.402 (chaîne normale) :
```typescript
// l.256-271 (branche hors-ligne, après rejet applySession)
try {
  await connectOfflineCache(queryClient, userId, householdId);
} catch (causeRestore) { console.error('[offline] restore du cache impossible, démarrage avec un cache vide :', causeRestore); }
// ...
if (!active) return;
setReady(true);

// l.397-414 (chaîne normale)
const { queryClient } = await import('@/app/router');
// ... même bloc connectOfflineCache try/catch l.400-406 ...
if (!active) return;
setReady(true);
```
Marks : `marquerSegmentDebut('idb')` / `marquerSegmentFin('idb')` autour de chaque
`connectOfflineCache` ; `marquerSegmentFin('auth')` au point `setReady(true)`
final (les deux branches — `if (!active) return;` précède le mark pour éviter un
mark posé sur un effet déjà mort). Pitfall 4 : hors ligne, ce segment absorbe
les délais de repli (sonde 4 s, gardien 10 s) — le protocole définit ce que le
segment contient et le doc mesures consigne la branche réellement empruntée.

### `app/src/lib/offline/query-persistence.ts` (mod — bornes du restore IDB)

**Analog : lui-même.** `connectOfflineCache` (l.349-371) est la frontière exacte
du segment « restore IndexedDB » :
```typescript
export async function connectOfflineCache(client, userId, householdId, options = {}): Promise<void> {
  try {
    await restoreOfflineCache(client, userId, householdId);
    const avantPrune = compterFamillesRestaurees(client);
    pruneExpiredFamilies(client);
    const apresPrune = compterFamillesRestaurees(client);
    dernierRestore = { restoredFamilies: avantPrune, prunedFamilies: avantPrune - apresPrune, failure: null, at: Date.now() };
  } catch (cause) {
    dernierRestore = { restoredFamilies: 0, prunedFamilies: 0, failure: String(cause), at: Date.now() };
    throw cause;
  }
  await persistNow(client, userId, householdId, options);
}
```
Marks de début/fin posés par le module central (via injection ou appel direct)
autour de l'APPEL de `connectOfflineCache` dans `use-auth.ts` (recommandation
RESEARCH : les composants/modules n'appellent pas `performance` directement ;
options d'injection laissées au plan). `inspectPersistedCache` (l.422-453) est
NE PAS modifié — c'est la source de données CACHE-01 (CA-01, par famille :
`ageMs`, `maxAgeMs`, `pruneEligible`).

### `app/src/modules/parametres/components/offline-panel.tsx` (mod — section « Amorçage »)

**Analog : lui-même.** Patron de rangée clé/valeur (l.199-212) :
```typescript
<div className="flex items-center justify-between gap-2.5 border-t border-border py-[13px] text-xs">
  <span className="text-muted">Version du service worker</span>
  <strong>{swVersion ?? 'Service worker indisponible'}</strong>
</div>
```

**Consommation de store hors-React (l.95-97)** :
```typescript
// D-12 : point d'observation unique de l'état SW. `useSwState` renvoie l'objet
// de test mocké (vi.hoisted) ou le store zustand réel.
const sw = useSwState();
```
→ même discipline pour les durées : `useBootMarks()` lu au montage du panneau,
une ligne par segment + une ligne total, `libelleMs` à copier sur le patron
`libelleAgeCache` (l.64-69). Discipline D-11 (commentaire l.58-63) : la section
affiche des FAITS (durées, compteurs), jamais un jugement ; aucun identifiant ni
clé de cache complète (Security Domain RESEARCH — estampille : SHA court à
l'écran l.37, complet au survol l.55).

**Test à étendre :** `app/src/modules/parametres/components/offline-panel.test.tsx`
(existe) — section Amorçage rend 4 segments + total, repli honnête si mesure
absente (« pas encore mesuré sur ce démarrage »).

### Doc mesures versionné — NOUVEAU (markdown)

**Analog:** `.planning/phases/38-filet-de-tests-fiable/38-E2E-SIGNATURE.md` —
la discipline de preuve §2.7 exacte :

```markdown
# 38-E2E-SIGNATURE — Signature du filet de tests (phase 38)
**Run du :** 2026-11-08
**Exécuté par :** plan 38-04 (Task 1 + Task 2), executor séquentiel
**Référence avant-phase :** cd3fdf1 (commit précédant le premier commit de la phase, `4f88b89^`)
**Exigence couverte :** TEST-03
## 1. Chaîne §2.7 complète, dans l'ordre, chaque étape citée (§2.7 F)
| # | Étape | Commande | Résultat |
```

→ Le doc mesures reprend cette structure : protocole écrit AVANT les mesures
(PM-01/PM-02/CA-02 : appareil de référence, N runs, séquence purge exacte,
critères CACHE-01 par famille, N = 5 recommandé RESEARCH), puis par run :
estampille quatre canaux (`check-version-stamp.sh`, `build-app.sh`), les 4
segments médians avant/après, les écarts (CU-03), la branche auth empruntée,
l'ordre instrumentation → lecture panneau → décision (CA-04). Contenu de
référence, JAMAIS persisté dans l'app (PD-02, PM-03).

### `app/src/lib/query-policy.ts` (mod CONDITIONNEL — uniquement si la décision CACHE-01 change un maxAge)

**Contenu arbitré** (l.79-93, verbatim RESEARCH) : 9 familles
`maxAgeMs: 24 * 60 * 60 * 1000`, 2 familles (`household_members`, `profiles`)
`maxAgeMs: 7 * 24 * 60 * 60 * 1000` ; `gcTime` 7 j (l.37) couplé à l'horizon
des annexes. Si changement : UN commit par famille avec tests à jour
(`query-policy.test.ts` Test H refuse toute divergence préfixes/hooks),
commentaire D-08/D-09 mis à jour, vérifier le commentaire gcTime si un maxAge
dépasse 7 j (Pitfall 6). CA-03 : statu quo justifié = décision valide — dans ce
cas ce fichier n'est PAS touché et PROJECT.md porte la justification.

### `.planning/PROJECT.md` (mod — décision CACHE-01)

Analog : les sections de décision existantes de PROJECT.md (dette reportée
v1.1/v1.2 déjà documentées). Contenu : valeur maxAge retenue PAR famille + justification
(CA-01/CA-03) + référence au doc mesures.

## Shared Patterns

### Store zustand hors-React, session seule
**Source:** `app/src/lib/sw-register.ts` l.6-24
**Apply to:** `boot-marks.ts` (nouveau) + `offline-panel.tsx` (consommation)
```typescript
export const useSwState = create<SwState>()((set) => ({ ... }));
// mutation hors composant : useSwState.setState({...}) / useSwState.getState()
```

### Commentaire de raison en français, nommé par décision
**Source:** tous les fichiers analogues (ex. offline-panel.tsx l.25-31, main.tsx l.22-27)
**Apply to:** chaque modification de cette phase
```typescript
// D-11 : ... la raison nommée, jamais « dépendances volontairement omises ».
```
Pas de linter dans ce dépôt (AGENTS.md §2.7) : le commentaire EST la
vérification — chaque directive proscrite, chaque omission nommée.

### Assertion bornée + preuve du contrôle
**Source:** `.planning/phases/38-filet-de-tests-fiable/38-E2E-SIGNATURE.md` §1-3
**Apply to:** doc mesures + tout nouveau test
- Une assertion borne sa portée (§2.7 D.2) ; un contrôle se prouve sur un cas
  qui doit échouer (§2.7 B) ; un succès muet est un échec inexpliqué (§2.7 F) ;
  une absence affirmée est vérifiée par grep (§2.7 I).

### Chaîne de vérification avant commit
**Source:** AGENTS.md §2.7
**Apply to:** tout commit de la phase
```sh
cd app && npm run typecheck && npm test && npm run build
cd app && npm run test:e2e   # si Docker disponible
```
Pas de SQL dans cette phase → `check-sql-statique.py` non requis (RESEARCH
Validation Architecture). `test-db.sh` non requis.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| Protocole PM-02 (séquence uninstall/reinstall on-device) | procédure manuelle | — | Aucune procédure de mesure on-device existe dans le dépôt ; le protocole est écrit de zéro dans le doc mesures (N runs, purge, coupure réseau) — RESEARCH Pattern 3 et Pitfall 3 fournissent la structure |

## Metadata

**Analog search scope:** `app/src/lib/`, `app/src/lib/offline/`, `app/src/hooks/`, `app/src/modules/parametres/components/`, `app/src/main.tsx`, `.planning/phases/38-filet-de-tests-fiable/`
**Files scanned:** 12 (9 sources + 2 tests + 1 doc versionné)
**Pattern extraction date:** 2026-11-10
