# 32-02 Summary — Service worker en mode prompt, bandeau de mise à jour

**Statut : terminé** (2026-11-04, commit `5860ff2`).

## Livré

- **`registerType: 'prompt'`** dans `app/vite.config.ts` (D-09). `app/src/sw.ts` inchangé — aucun `skipWaiting`/`clientsClaim`, `injectManifest` conservé.
- **`app/src/lib/sw-register.ts`** : `registerSW` extrait de `main.tsx`. `onNeedRefresh` pousse `{ kind: 'sw-update', priority: 1 }` via `useBannerStore.getState()` (accès hors-React, patron `session-store.ts`). `onRegisteredSW` stocke la registration dans `useSwState` — consommation par le panneau offline au plan 32-03 (D-12).
- **`banner-store.ts`** : déduplication par `kind` (Pitfall 4), tri par priorité recalculé **à l'écriture** (le tri à la lecture créait une référence neuve et re-rendait le slot en boucle — corrigé pendant l'implémentation).
- **`banner-slot.tsx`** : `<BannerSlot />` inséré entre `</header>` et `<main>` dans `app-shell.tsx` (D-04). Kinds inconnus ignorés, `null` quand rien à rendre.
- **`update-banner.tsx`** : « Une mise à jour est disponible » + « Recharger » (`updateSW()`) + « Plus tard » (`dismiss`). Bouton désactivé, libellé « Mise à jour en préparation… », quand `useOutboxGate()` répond file non vide (D-10).
- **`use-outbox-gate.ts`** : stub `{ isEmpty: true }` — frontière de composant pour la phase 34, aucun composant à changer quand la vraie file sera branchée.

## Décisions en cours d'exécution

1. **Tri du store à l'écriture, pas à la lecture** : le plan prévoyait un « getter trié » ; la première implémentation (fonction `sorted()` appelée dans le sélecteur zustand) bouclait à l'infini (référence neuve à chaque rendu). Remplacé par un champ `sorted` maintenu par `push`/`dismiss`.
2. **Slot `null` quand tous les kinds sont ignorés** : le wrapper `<div>` vide aurait cassé `toBeEmptyDOMElement` et rendu une barre fantôme.

## Vérifications exécutées

- `npx vitest run src/components/banners/ src/hooks/use-outbox-gate.test.ts` : **10/10** ✅
- `npm run typecheck` ✅ · `npm run build` ✅
- `npm test` : **1730/1732** — les 2 échecs `anniversaires-page.test.tsx` sont préexistants (cf. 32-01), hors périmètre.
- `dist/manifest.webmanifest` : icons + shortcuts du plan 32-01 intacts après le changement `registerType` (« chain OK »).
- `git diff src/sw.ts` vide.

## Prochaine étape

- Plan 32-03 : bannière d'installation + observation SW dans le panneau offline (D-12).
- Validation on-device (bandeau réel sur nouvelle version) : `/gsd-verify-work`.
