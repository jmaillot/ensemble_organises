# Phase 35: Deep links & validation multi-OS - Pattern Map

**Mapped:** 2026-11-06
**Files analyzed:** 7 (4 modified, 3 new)
**Analogs found:** 6 / 7 (matrice = document, pas de code)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/src/modules/taches/taches-jour-page.tsx` (NEW) | component (route view) | request-response + offline cache-read | `app/src/modules/taches/taches-page.tsx` | exact |
| `app/src/app/router.tsx` (MODIFY) | route registration | — | itself + `route-preload.ts` | exact (self) |
| `app/src/app/route-preload.ts` (MODIFY) | config (chunk table) | — | itself — `taches`/`tachesGuide` entries | exact (self) |
| `app/src/modules/landing/sign-in-page.tsx` (MODIFY) | component + guard consumer | request-response | itself + `components/ui/forbidden.tsx` (écran sobre dédié) | exact (self) / role-match (écran) |
| `app/vite.config.ts` (MODIFY) | config (manifest shortcuts) | — | itself — `pwaManifest.shortcuts` | exact (self) |
| `app/e2e/deep-link-redirect.spec.ts` (NEW) | test (e2e) | request-response (redirect-after-login) | `app/e2e/offline-shared-device.spec.ts` | exact |
| `.planning/phases/35-.../35-VALIDATION-MATRICE.md` (NEW, Plan 2) | document (méthode) | — | aucun (document de consignation, pas de code) | none |

**Tous les chemins d'analogues vérifiés git-tracked** (`git ls-files`, ce session).

---

## Pattern Assignments

### `app/src/modules/taches/taches-jour-page.tsx` (component, vue route dédiée)

**Analog:** `app/src/modules/taches/taches-page.tsx` — D-01 réutilise ses composants, ne duplique pas.

**Imports pattern** (taches-page.tsx:1-38) :
```tsx
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { ModuleShell, MetricRow, Panel } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { MemberAvatar } from '@/components/shared/member-avatar';
import { taskGroup, type Task, type TaskStatus } from './types';
import { TaskRow } from './components/task-row';
import { useTaches } from './hooks/use-taches';
```

**Accès données** — réutiliser le hook existant `useTaches()` (use-taches.ts:106-201), PAS un nouveau fetch. Il expose déjà `tasks`, `members` (color_tag via `household-store`), `canWrite`, `toggleStatus`, `isLoading/isError/error/refetch`. Le rendu cold-start offline est fourni par le cache persisté phase 33 (`query-persistence.ts`) — aucune logique de cache à écrire dans la vue.

**Filtre D-02 (aujourd'hui + retards)** — la règle du retard existe DÉJÀ, écrite une seule fois (types.ts:102-104, 215-218) :
```tsx
// types.ts:102 — « échéance strictement antérieure à aujourd'hui, tâche non faite »
export function lateDaysFor(task: Pick<Task, 'status' | 'dueDate'>): number {
  return task.status !== 'fait' && task.dueDate ? Math.max(0, -daysBetween(todayIso(), task.dueDate)) : 0;
}
// types.ts:215
export function taskGroup(task: Task): TaskGroup {   // 'retard' | 'ouverte' | 'terminee'
  if (task.status === 'fait') return 'terminee';
  return lateDaysFor(task) > 0 ? 'retard' : 'ouverte';
}
```
Le filtre de la vue jour = `dueDate` ≤ aujourd'hui && `status !== 'fait'`. Écrire la fonction de filtre dans `types.ts` (à côté de `filterTasks`, types.ts:187) avec `todayIso()`/`daysBetween` existants — PAS de comparaison d'instant UTC (Pitfall 6 du RESEARCH.md : `due_date` est une date pure, le projet utilise déjà `todayIso()` local).

**Tri retards en haut** — réutiliser `sortTasks` (types.ts:230) tel quel : le rang `retard: 0` épile déjà le rouge en tête (D-02, convention AGENTS.md §6).

**Rendu de la liste** — copier la branche lecture-seule de taches-page.tsx:443-465 (le D-03 interdit DnD, donc ne PAS copier la branche `DndContext` :467-507) :
```tsx
<div role="list" aria-label="Tâches du jour" className="grid gap-1">
  {tasksDuJour.map((task) => (
    <TaskRow key={task.id} task={task} readOnly={false} canDelete={isAdmin}
      onToggle={(target) => { void toggleStatus(target).catch((e: unknown) =>
        toast(e instanceof Error ? e.message : 'Le statut n’a pas pu être mis à jour.', 'error')); }}
      onEdit={/* D-03 : pas d'édition — ne pas passer openEdit */}
      onDelete={/* D-03 : pas de suppression */}
    />
  ))}
</div>
```

**Retour vers `/taches`** (D-03) — bouton d'en-tête :
```tsx
<Button variant="secondary" onClick={() => navigate('/taches')}>…</Button>
```

**État erreur** (taches-page.tsx:344-348) :
```tsx
<ErrorState message={error?.message ?? 'Les tâches du foyer n’ont pas pu être chargées.'} onRetry={refetch} />
```

**Enregistrement route** — deux modifications :
1. `route-preload.ts:34-35` — ajouter une entrée dans la table unique (commentaire :19-21 : « Ajouter une route, c'est ajouter UNE entrée ici ») :
```ts
tachesJour: () => import('@/modules/taches/taches-jour-page'),
```
2. `router.tsx:309-314` — route imbriquée sous le shell (RequireAuth + RequireHousehold hérités du layout :288-296) :
```tsx
<Route
  path="/taches/jour"
  element={<LazyRoute load={routeChunkLoaders.tachesJour} />}
/>
```

---

### `app/src/modules/landing/sign-in-page.tsx` (MODIFY — écran « connexion requise » D-07)

**Analog 1 (mécanisme) : lui-même** — `requestedPath` déjà extrait (sign-in-page.tsx:102) :
```tsx
const requestedPath = internalPathOf((location.state as { from?: unknown } | null)?.from);
```
Le composant d'écran s'insère ici : quand `requestedPath !== null && navigator.onLine === false`, rendre l'écran explicite au lieu du formulaire. `navigator.onLine` est une lecture d'état, pas un stockage — D-08 respecté.

**Analog 2 (écran sobre dédié) : `app/src/components/ui/forbidden.tsx`** (lignes 12-33) — c'est le patron du projet pour « écran explicite, jamais une erreur technique générique » :
```tsx
export function Forbidden() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-5 text-center">
      <div className="max-w-[440px]">
        <span className="mx-auto mb-5 grid size-14 place-items-center rounded-[18px] bg-accent-soft text-accent-strong">
          <Icon name="info" size="lg" />
        </span>
        <h1 className="mb-2 text-[clamp(24px,3vw,36px)] leading-[1.05]">…</h1>
        <p className="lede mx-auto mb-6 text-[14px]">…</p>
        <Button asChild><Link to="/accueil">…</Link></Button>
      </div>
    </div>
  );
}
```
Le composant D-07 suit cette forme : icône, titre « Connexion requise pour cette vue », indication de la vue visée (dérivée de `requestedPath`), bouton « Se reconnecter » qui révèle le formulaire. Ne PAS passer par une route-garde dédiée (RESEARCH.md §3 : plus lourd, à éviter).

**Anti open-redirect** — ne PAS réimplémenter : `internalPathOf()` (sign-in-page.tsx:64-73) est la garde T-19-43 exportée et testée. Aucun nouveau parseur d'URL (Don't Hand-Roll).

---

### `app/vite.config.ts` (MODIFY — cible du raccourci D-01)

**Analog : lui-même**, ligne 43-45 (commentaire :41-42 annonce déjà « la vue dédiée vient en phase 35 ») :
```ts
shortcuts: [
  { name: 'Tâches du jour', url: '/taches', icons: [{ src: 'shortcut-taches-96.png', sizes: '96x96', type: 'image/png' }] },  // → url: '/taches/jour'
  { name: 'Courses', url: '/courses', icons: [{ src: 'shortcut-courses-96.png', sizes: '96x96', type: 'image/png' }] },
],
```
Changement : **un seul champ**, `url: '/taches'` → `url: '/taches/jour'`. La suite manifest est testée par `src/pwa/manifest.test.ts` (commentaire :13-16) — mettre à jour le test si l'invariant de cible y est affirmé.

---

### `app/e2e/deep-link-redirect.spec.ts` (NEW — DLNK-02, D-06)

**Analog:** `app/e2e/offline-shared-device.spec.ts` — patron exact des conventions e2e du dépôt.

**Patron de skip documenté (lignes 3-38)** — NE JAMAIS déclarer vert un test ignoré (§2.7 F) :
```ts
import { expect, test } from '@playwright/test';

const skipReason = '… raison explicite en constantes …';
test.describe('redirect-after-login (DLNK-02, D-06)', () => {
  test.skip(!condition, skipReason);
```
Si l'expiration de session n'est pas simulable proprement en mode démo, suivre exactement ce patron : `test.skip(cond, reason)` avec env vars backend documentées — pas de vert silencieux.

**Patron d'aide connexion (lignes 65-72)** :
```ts
async function seConnecter(page: Page, email: string, password: string) {
  await page.goto('/connexion');
  await page.getByLabel(/E-mail/i).fill(email);
  await page.getByLabel(/Mot de passe/i).fill(password);
  await page.getByRole('button', { name: /Se connecter|Continuer/i }).click();
  await page.waitForURL('**/accueil');
  await expect(page.getByRole('heading', { level: 1, name: /Bonjour/ })).toBeVisible();
}
```
Le sélecteur du bouton accepte le mode démo (`Continuer`). Le scénario D-06 reprend cette aide et remplace `waitForURL('**/accueil')` par la cible `**/taches/jour`.

**Nuance d'amorçage obligatoire (RESEARCH.md §1)** : le compte e2e doit AVOIR un foyer — `RequireHousehold` (router.tsx:156-162) reste maître et renverrait un compte sans foyer vers `/foyer`, masquant la preuve du redirect.

**Structure du scénario unique (D-06)** : cold-start session expirée → `page.goto('/taches/jour')` → garde → `/connexion` → connexion → `page.waitForURL('**/taches/jour')` → assertion que la vue rend (heading + liste). Une assertion d'URL intermédiaire vérifie que `state.from` porte bien `/taches/jour`.

---

### `.planning/phases/35-.../35-VALIDATION-MATRICE.md` (NEW, Plan 2 — D-09/D-10/D-12)

**Aucun analog code.** Structure dictée par RESEARCH.md §Validation Matrix Design : sections ordonnées 1-4 (matrice offline / gate SW / checklist PITFALLS / quirks iOS pré-remplis), tableau lignes=cas, colonnes Desktop/Android/iOS, cellules `Passé | Échoué | Quirk: … | Non testé (appareil absent)`.

---

## Shared Patterns

### Garde de route + `state.from` (aucun nouveau stockage — D-08)
**Source:** `app/src/app/router.tsx:28-38` + `app/src/modules/landing/sign-in-page.tsx:64,102,109`
```tsx
// router.tsx:36
return <Navigate to="/connexion" replace state={{ from: location.pathname + location.search }} />;
// sign-in-page.tsx:102 + 109
const requestedPath = internalPathOf((location.state as { from?: unknown } | null)?.from);
navigate(requestedPath ?? '/accueil');
```
**Apply to:** e2e deep-link (prouver la chaîne, D-05) et écran « connexion requise » (lire `requestedPath`, jamais localStorage).

### Table unique des chunks de route
**Source:** `app/src/app/route-preload.ts:19-81`
**Apply to:** toute nouvelle route = UNE entrée `routeChunkLoaders` + UNE `<Route>` dans router.tsx ; `ROUTE_CHUNK_COUNT` (ligne 86) et la couverture précache suivent automatiquement.

### Écran explicite, jamais une erreur générique
**Source:** `app/src/components/ui/forbidden.tsx:12-33` (et `route-error.tsx:77-92` pour le vocabulaire des états)
**Apply to:** écran « connexion requise » D-07 — icône + titre + explication + action unique, zones tactiles ≥ 44px (AGENTS.md §6).

### Toast d'erreur en français, message nommé
**Source:** `taches-page.tsx:156-158`
```tsx
void setTaskStatus(task, status).catch((moveError: unknown) =>
  toast(moveError instanceof Error ? moveError.message : 'Le statut n’a pas pu être mis à jour.', 'error'),
);
```
**Apply to:** la coche de `/taches/jour` — même signature, jamais d'erreur silencieuse (§2.7 F).

### Règle du retard écrite une seule fois
**Source:** `app/src/modules/taches/types.ts:102-104, 215-218` (`lateDaysFor`, `taskGroup`, `sortTasks`)
**Apply to:** filtre D-02 de la vue jour — dériver du même `todayIso()`/`daysBetween`, ne jamais dupliquer une comparaison de date.

### E2E : skip documenté, jamais de vert silencieux
**Source:** `app/e2e/offline-shared-device.spec.ts:3-38`
**Apply to:** `deep-link-redirect.spec.ts`.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `.planning/phases/35-.../35-VALIDATION-MATRICE.md` | document | — | Document de consignation humaine (D-09/D-10) ; structure fournie par RESEARCH.md §Validation Matrix Design, pas par le code |

## Metadata

**Analog search scope:** `app/src/app/`, `app/src/modules/taches/`, `app/src/modules/landing/`, `app/src/components/ui/`, `app/e2e/`, `app/vite.config.ts`
**Files scanned:** ~12 (5 lus intégralement, 7 ciblés)
**Pattern extraction date:** 2026-11-06
**Tracked-source gate:** tous les analogues nommés vérifiés `git ls-files` (§3645)
