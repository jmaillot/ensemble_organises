# Phase 32: Install & raccourcis - Pattern Map

**Mapped:** 2026-11-04
**Files analyzed:** 11 (4 nouveaux code + 1 config + 1 html + 4 tests + 1 hook étendu)
**Analogs found:** 8 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/src/lib/sw-register.ts` | utility (bootstrap SW) | event-driven | `app/src/main.tsx` (registerSW, lignes 3, 17) + `app/src/sw.ts` (ping EO_VERSION) | exact |
| `app/src/components/banners/banner-slot.tsx` | component | event-driven (store → rendu) | `app/src/app/app-shell.tsx` header (307-387) — rendu de surface top-level | role-match |
| `app/src/components/banners/banner-store.ts` (ou hook) | store | pub-sub | `app/src/stores/session-store.ts` (zustand `create`) | exact |
| `app/src/components/banners/install-banner.tsx` | component | request-response (localStorage + UA) | `app/src/hooks/use-pwa.ts` + `offline-panel.tsx` (blocage conditionnel `canInstall`) | role-match |
| `app/src/components/banners/update-banner.tsx` | component | event-driven | `offline-panel.tsx` (pattern `Button disabled/onClick`) + bouton install `app-shell.tsx:342-346` | role-match |
| `app/src/hooks/use-outbox-gate.ts` | hook | transform (stub) | aucun — trivial, contrat figé par RESEARCH.md | none |
| `app/src/hooks/use-pwa.ts` (étendu : état « installée ») | hook | event-driven | lui-même — `matchMedia`/`navigator.standalone` à ajouter sur le même patron module-scope | exact (extension) |
| `app/src/modules/parametres/components/offline-panel.tsx` (enrichi D-12) | component | CRUD read + event | lui-même — lignes 44-101 : version affichée + `useInstallPrompt` déjà consommé | exact (extension) |
| `app/src/main.tsx` (modifié) | bootstrap | — | lui-même, ligne 17 à remplacer | exact (modification) |
| `app/vite.config.ts` (manifest enrichi) | config | — | lui-même, bloc `manifest` lignes 30-48 | exact (extension) |
| `app/index.html` (balises `apple-*`) | config (html) | — | lui-même, lignes 13-17 | exact (extension) |
| Icônes (`app/public/pwa-*.png`, `maskable-icon-512x512.png`, `shortcut-*-96.png`, `screenshots/*`) | asset (build artifact committé) | file-I/O one-off | `app/public/icon-192.png`, `icon-512.png` existants + `app/public/icon.svg` master | exact |
| Tests wave 0 (`use-outbox-gate.test.ts`, `install-banner.test.tsx`, `update-banner.test.tsx`, `manifest.test.ts`) | test | — | `app/src/stores/session-store.test.ts` (vitest + store) ; jsdom déjà configuré dans `vite.config.ts:66-82` | role-match |

## Pattern Assignments

### `app/src/lib/sw-register.ts` (utility, event-driven)

**Analog:** `app/src/main.tsx` (17) + `app/src/sw.ts` (44-51, 285-292)

**RegisterSW actuel** (`main.tsx:17`) — c'est cette ligne qui devient l'appel extrait :

```ts
registerSW({ immediate: true });
```

**API mode `prompt`** (docs vite-plugin-pwa, vérifiée RESEARCH.md Pattern 1) :

```ts
import { registerSW } from 'virtual:pwa-register';

export const updateSW = registerSW({
  onNeedRefresh() { /* push bandeau sw-update dans le store de bandeaux */ },
  onRegisteredSW(_, registration) { /* expose registration pour le panneau offline (D-12) */ },
});
```

**Version worker côté SW** (`sw.ts:51,285-292`) — le ping existe déjà, le panneau D-12 le consomme :

```ts
const SW_VERSION = 'precache-push-v2';           // sw.ts:51
self.addEventListener('message', (event: ExtendableMessageEvent) => {  // sw.ts:285
  if (!data || data.type !== 'EO_VERSION') return;
  // ... reply { type: 'EO_VERSION_REPLY', version: SW_VERSION }   // sw.ts:292
});
```

**Anti-pattern:** ne pas toucher `sw.ts` (pas de `skipWaiting`/`clientsClaim` ajoutés) ; `injectManifest` est un invariant.

---

### `app/src/components/banners/banner-store.ts` (store, pub-sub)

**Analog:** `app/src/stores/session-store.ts` (1-53)

**Imports + création store** (lignes 1-2, 34-37) :

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({ ... }),
    { name: 'ensemble-organises-session', version: 1, partialize: ... },
  ),
);
```

**À copier :** zustand `create`, nommage `useXxxStore`, état typé par interface au-dessus. Le store de bandeaux N'A PAS besoin de `persist` (déduplication par `kind` en mémoire suffit — Pitfall 4 : `onNeedRefresh` peut être appelé plusieurs fois par session, le store doit dédupliquer). Accès hors-React : `useSessionStore.getState()` (lignes 48, 57) — c'est comme ça que `sw-register.ts` poussera le bandeau depuis un callback non-React.

---

### `app/src/components/banners/install-banner.tsx` + `update-banner.tsx` (component)

**Analog:** `app/src/modules/parametres/components/offline-panel.tsx` (boutons) + `app/src/app/app-shell.tsx` (bouton install existant, lignes 342-346)

**Bouton install existant** (`app-shell.tsx:342-346`) — reste inchangé (D-01) :

```tsx
{canInstall ? (
  <Button variant="secondary" size="sm" icon="download" className="max-[650px]:hidden" onClick={install}>
    Installer l’app
  </Button>
) : null}
```

**Structure conditionnelle + Button** (`offline-panel.tsx:76-89`) :

```tsx
<Button variant="secondary" icon="trash" disabled={clearing} onClick={() => setConfirmClear(true)}>
  Vider le cache local
</Button>
{canInstall ? (
  <Button icon="download" onClick={() => void install()}>Installer l’application</Button>
) : null}
```

**À copier :** `Button` de `@/components/ui/button`, rendu conditionnel ternaire, `void install()` pour la promesse. Le bouton « Recharger » d'`update-banner` suit exactement le patron `disabled={...}` — désactivé par `useOutboxGate()` avec libellé « Mise à jour en préparation… » (D-10). Slot d'insertion : entre `</header>` (387) et `<main>` (389) d'`app-shell.tsx` — le `<BannerSlot />` se place juste avant `<main>` pour empiler les bandeaux au-dessus du contenu (D-04).

---

### `app/src/hooks/use-pwa.ts` (extension : état « installée », D-03)

**Analog:** lui-même — patron module-scope à étendre tel quel (1-42)

**Patron existant à reproduire pour la détection installée :**

```ts
// Écoute au niveau module, pas dans le hook (lignes 10-16) :
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => { ... });
}
// Hook qui s'abonne/désabonne proprement (lignes 22-31) :
useEffect(() => {
  const onAvailable = () => setCanInstall(true);
  window.addEventListener('eo:install-available', onAvailable);
  return () => { window.removeEventListener('eo:install-available', onAvailable); };
}, []);
```

**Détection « installée » (nouveau, standard) :**

```ts
const estInstallee = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  // iOS Safari ne déclenche pas matchMedia standalone ; flag propriétaire :
  (navigator as unknown as { standalone?: boolean }).standalone === true;
```

---

### `app/src/modules/parametres/components/offline-panel.tsx` (enrichi, D-12)

**Analog:** lui-même (lignes 12-42, 44-101)

**Ce qui existe déjà et reste :** version app estampillée avec repli « Version de développement » (12-42), `useInstallPrompt` consommé (47), Panel grille (52-101). **Ce qui s'ajoute :** une ligne « Version du service worker » (réponse au ping `EO_VERSION` de `sw.ts:292`, réutilisée telle quelle) et un bouton « Appliquer maintenant » (même patron que `install` ligne 84-88) qui appelle `updateSW()` — désactivé par `useOutboxGate()`.

---

### `app/vite.config.ts` (manifest enrichi)

**Analog:** lui-même (13-57)

**Bloc actuel** — `registerType: 'autoUpdate'` (14) devient `'prompt'` ; le bloc `manifest.icons` (43-47) est remplacé par les sorties du générateur :

```ts
icons: [
  { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
],
```

**Ajouts (D-05/06/08, DLNK-01)** — RESEARCH.md Pattern 3 :

```ts
shortcuts: [
  { name: 'Tâches du jour', url: '/taches', icons: [{ src: 'shortcut-taches-96.png', sizes: '96x96', type: 'image/png' }] },
  { name: 'Courses', url: '/courses', icons: [{ src: 'shortcut-courses-96.png', sizes: '96x96', type: 'image/png' }] },
],
display_override: ['window-controls-overlay', 'minimal-ui', 'standalone'],
categories: ['productivity', 'lifestyle'],
screenshots: [
  { src: 'screenshots/desktop.png', sizes: '1280x720', type: 'image/png', form_factor: 'wide' },
  { src: 'screenshots/mobile.png', sizes: '720x1280', type: 'image/png', form_factor: 'narrow' },
],
```

**Génération one-off (D-13)** : `cd app && npx @vite-pwa/assets-generator --preset minimal-2023 public/icon.svg` — sorties commitées, JAMAIS intégrée au build (pas d'option `pwaAssets` du plugin). **Invariant** : `includeAssets`/`globPatterns` à vérifier pour ne pas précacher les screenshots lourds (Pitfall 5).

---

### `app/index.html` (balises `apple-*`)

**Analog:** lui-même (13-17)

**Bloc actuel à compléter** — les capacités existent, il manque le titre et éventuellement l'icône maskable en apple-touch 180 :

```html
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<link rel="icon" type="image/svg+xml" href="/icon.svg" />
<!-- iOS ignore le SVG : icône tactile en PNG raster (D-03). -->
<link rel="apple-touch-icon" href="/icon-192.png" />
```

**Ajout :** `<meta name="apple-mobile-web-app-title" content="Ensemble" />` (aligné sur `short_name` du manifest) — suffisant, pas de splash screens (discretion, RESEARCH.md SotA).

---

### `app/src/main.tsx` (modification)

**Analog:** lui-même (17) — la ligne `registerSW({ immediate: true });` disparaît au profit de l'import de `@/lib/sw-register` (appel au niveau module, comme aujourd'hui, avant le premier rendu — même position que `seedOnlineStatus()` ligne 25).

---

## Shared Patterns

### Zustand store hors-React
**Source:** `app/src/stores/session-store.ts` (34-53, 57)
**Apply to:** `banner-store.ts`, `sw-register.ts` (état registration)
```ts
useSessionStore.getState()  // accès hors composant — pour pousser un bandeau depuis un callback registerSW
```

### Rendu conditionnel d'action secondaire
**Source:** `app/src/app/app-shell.tsx` (342-346), `offline-panel.tsx` (76-89)
**Apply to:** `install-banner.tsx`, `update-banner.tsx`, bouton « Appliquer maintenant » offline-panel
```tsx
{condition ? <Button variant="secondary" size="sm" icon="..." onClick={...}>…</Button> : null}
```

### localStorage défensif (V5 — seule « entrée » de la phase)
**Source:** RESEARCH.md « Enterrement 30 jours » + `offline-panel.tsx` (19 : `|| 'unknown'` pour repli)
**Apply to:** `install-banner.tsx`
```ts
const at = Number(localStorage.getItem(KEY));
return Number.isFinite(at) && Date.now() - at < 30 * 24 * 3600 * 1000;
// Repli sûr = bannière visible si la clé est corrompue
```

### Tests vitest (config existante)
**Source:** `app/vite.config.ts` (66-82 : jsdom, setupFiles, include pattern) ; `app/src/stores/session-store.test.ts` pour le patron de test de store
**Apply to:** les 4 tests wave 0. `matchMedia` et `localStorage` mockés dans les tests de bannière (jsdom n'implémente pas `matchMedia`).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `app/src/hooks/use-outbox-gate.ts` | hook | transform | Aucun hook de gate existe ; le contrat `{ isEmpty: true }` est entièrement spécifié par D-10/RESEARCH.md (3 lignes). Phase 34 remplira l'interface sans changer les composants. |
| Icônes raccourcis `shortcut-*-96.png` | asset | file-I/O | Export SVG→PNG one-off des glyphs React existants (`Icon` n'est pas un fichier raster) ; nécessite un rendu headless one-off committé, aucun patron similaire dans le dépôt. |

## Metadata

**Analog search scope:** `app/src/hooks`, `app/src/stores`, `app/src/components`, `app/src/modules/parametres/components`, `app/src/app`, `app/src/main.tsx`, `app/src/sw.ts`, `app/vite.config.ts`, `app/index.html`
**Files scanned:** 12
**Tracked-source gate:** tous les chemins d'analogues vérifiés via `git ls-files` (8/8 tracked)
**Pattern extraction date:** 2026-11-04
