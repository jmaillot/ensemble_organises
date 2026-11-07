# Phase 32: Install & raccourcis - Research

**Researched:** 2026-11-04
**Domain:** PWA installability (vite-plugin-pwa, web app manifest, beforeinstallprompt, iOS Safari), service worker update flow (`registerType: prompt`), raccourcis web
**Confidence:** HIGH

## Summary

La phase est presque entièrement front-end, dans un codebase déjà bien préparé : le manifeste est déjà la source unique dans `app/vite.config.ts` (décision 09-02), un hook `useInstallPrompt` cappe déjà `beforeinstallprompt` avec un événement custom `eo:install-available`, et `offline-panel.tsx` affiche déjà version app + SW. Le travail se répartit en quatre chantiers : (1) durcissement du manifeste + génération des icônes via `@vite-pwa/assets-generator`, (2) infrastructure de bandeaux hauts empilables (slot partagé bannière install / futur bandeau stale) avec UX d'installation deux niveaux + guide iOS dépliable, (3) migration `autoUpdate` → `registerType: prompt` avec bandeau de mise à jour différable et hook stub `use-outbox-gate`, (4) raccourcis web vers `/taches` et `/courses` (URLs vérifiées existantes dans le routeur).

Le point technique le plus délicat n'est ni le manifeste ni le SW : c'est **les icônes des raccourcis** (D-14). Les icônes d'espace de l'app sont des glyphs SVG rendus par un composant React (`Icon` + `IconName`), pas des fichiers raster ; un raccourci de manifest exige des PNG (96×96 recommandés par Chromium). Il faut donc un export SVG→PNG one-off committé, pas une génération au build.

Le deuxième point d'attention est la sémantique exacte de `registerSW` en mode `prompt` : la page reçoit `onNeedRefresh`, et c'est l'appel à `updateSW()` retourné par `registerSW` qui recharge — le gate « file vide » (D-10) se branche sur le **bouton** (désactivé tant que la file n'est pas vide), pas sur la mécanique du plugin.

**Primary recommendation:** Générer les assets d'icônes une fois via `@vite-pwa/assets-generator` (preset `minimal-2023`, master SVG `public/icon.svg`), commité dans `app/public` ; passer `registerType: 'prompt'` et concentrer le code React sur un slot de bandeaux hauts (`BannerSlot`) + un store léger de bandeaux, un hook stub `use-outbox-gate` (répond toujours `true`), et une bannière install auto-dismissable avec enterrement 30 jours en `localStorage`.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**UX d'installation**
- **D-01:** Invite à deux niveaux : bouton existant barre supérieure (Chromium, `useInstallPrompt`) + bannière discrète auto-dismissable en haut pour la découvrabilité. Guide iOS = pas-à-pas **dépliable dans cette même bannière** (Safari : Partager → « Sur l'écran d'accueil »), pas de page dédiée.
- **D-02:** Après refus, bannière enterrée **30 jours** en `localStorage`, puis réapparaît. Le bouton barre supérieure reste visible tant que `beforeinstallprompt` est disponible.
- **D-03:** Détection OS/état **à la volée** — user-agent + feature detection (`display-mode: standalone`, présence de l'événement d'install). Bannière masquée si déjà installée. Pas d'onboarding première visite.
- **D-04:** La bannière occupe le **slot bannière en haut** partagé avec le bandeau stale de la phase 33 : mécanisme de bandeaux hauts **empilables/priorisés** à poser comme infrastructure.

**Manifest & raccourcis**
- **D-05:** Raccourcis vers URLs existantes : « Tâches du jour » → `/taches`, « Courses » → `/courses`. Retouchés en phase 35. Aucun paramètre de filtre anticipé.
- **D-06:** `display_override: ['window-controls-overlay', 'minimal-ui', 'standalone']`.
- **D-07:** `orientation: portrait-primary` conservé.
- **D-08:** Manifeste **enrichi** avec `screenshots` (desktop + narrow) et `categories: ['productivity', 'lifestyle']`. Source unique reste `app/vite.config.ts` (jamais de retour au fichier statique).

**Flow de mise à jour SW**
- **D-09:** `autoUpdate` → **`registerType: 'prompt'`** : bandeau « Une mise à jour est disponible → Recharger » dans le slot bannière. Jamais de reload subi.
- **D-10:** Gate « file vide » câblée **dès cette phase comme stub désactivant** : hook (ex. `use-outbox-gate`) exposant « la file est-elle vide ? », répond toujours oui en 32 ; bouton Recharger désactivé + libellé « Mise à jour en préparation… » tant que la file n'est pas vide. La phase 34 branchera la vraie file sans changer le composant.
- **D-11:** Bandeau de mise à jour **différable** : refermable, re-proposé à chaque session tant que non appliqué.
- **D-12:** État SW/version vit dans le **panneau offline existant de Paramètres**, enrichi : version du worker actif, mise à jour en attente, bouton « Appliquer maintenant ».

**Génération des icônes**
- **D-13:** Icônes maskable via **`@vite-pwa/assets-generator` depuis un master unique** (~1024px, fond plein, marges safe-zone maskable) → sorties `any` + `maskable` en 64/192/512 + favicon. Assets **commités dans `app/public`**, aucune génération au déploiement.
- **D-14:** Icônes des raccourcis **réutilisent les icônes d'espace existantes**, redimensionnées à 96px.

### the agent's Discretion
- Détail des balises `apple-*` (apple-touch-icon, apple-mobile-web-app-title, splash) et `launch_handler` — valeurs standard.
- Contenu exact du pas-à-pas iOS (captures vs schéma simple) — selon l'effort.

### Deferred Ideas (OUT OF SCOPE)
- Vue « Tâches du jour » dédiée et deep links déconnectés (phase 35, DLNK-02/DLNK-03)
- Cache de lecture offline et bandeau stale (phase 33) — mais le slot bannière doit anticiper le partage
- La file d'écriture elle-même (phase 34) — ici uniquement le stub de gate
- Widgets natifs, store/APK

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INST-01 | Manifest complet : icônes maskable + raccourcis (`@vite-pwa/assets-generator`), `display_override`, balises `apple-*` — installabilité vérifiée desktop/Android | Sections Standard Stack (assets-generator), Architecture Patterns (manifest, raccourcis), Pitfalls (installabilité Chromium) |
| INST-02 | UX d'installation claire : cap `beforeinstallprompt` (Chromium) et guide iOS dans l'app | Pattern « Bannière install deux niveaux », hook `use-pwa.ts` existant réutilisable tel quel |
| INST-03 | Mises à jour SW sûres : `registerType: prompt` avec gate « file vide », état SW/version visible | Pattern « registerSW prompt + gate stub », API `onNeedRefresh`/`updateSW` [VERIFIED: docs vite-plugin-pwa] |
| DLNK-01 | Manifest déclare raccourcis « Tâches du jour » et « Courses » vers URLs existantes | URLs `/taches` et `/courses` vérifiées dans `app/src/app/router.tsx` ; pattern raccourcis + icônes 96px |

</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Manifest, icônes, raccourcis | CDN/Static (build artifacts : `dist/manifest.webmanifest`, `public/`) | Frontend build (vite.config.ts) | Tout se joue au build ; le navigateur consomme du statique |
| Détection install + invite Chromium | Browser/Client | — | `beforeinstallprompt` n'existe que côté page ; rien côté serveur |
| Guide iOS | Browser/Client | — | Safari ne fournit aucun événement : c'est de l'UX pure, détection UA à la volée (D-03) |
| Flow de mise à jour SW | Browser/Client (page + worker) | — | `registerSW` côté page, worker en `src/sw.ts` inchangé |
| Gate « file vide » | Browser/Client (hook) | API/Backend (phase 34) | Stub local maintenant ; la vraie file vivra côté API mais l'interface du hook est déjà la frontière |
| Slot bandeaux hauts | Browser/Client | — | Infrastructure UI pure, partagée install/stale/offline |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vite-plugin-pwa | **1.3.0 (déjà installé, épinglé)** | Plugin PWA : manifest, injectManifest, registerSW | Déjà en place ; ne pas upgrader dans cette phase (le npm latest est 2.0.0 mais l'upgrade majeur n'est pas le périmètre) [VERIFIED: npm view vite-plugin-pwa version → 2.0.0 ; package.json app → 1.3.0] |
| @vite-pwa/assets-generator | **2.0.0** (devDependency, nouvelle) | Génération des icônes any/maskable/favicon/apple-touch depuis un master | Outil officiel de l'écosystème vite-pwa, imposé par D-13 et INST-01 [VERIFIED: npm view @vite-pwa/assets-generator version → 2.0.0] |
| virtual:pwa-register (module virtuel du plugin) | inclus 1.3.0 | `registerSW({ onNeedRefresh })` + `updateSW()` | API officielle du mode `prompt` [VERIFIED: docs vite-plugin-pwa, guide/prompt-for-update.md] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (aucune nouvelle dépendance runtime) | — | Bannière, slot, gate, localStorage : tout est React + Tailwind + `localStorage` | — |

**Aucune autre dépendance externe.** Le slot de bandeaux, le hook `use-outbox-gate` et l'enterrement localStorage sont du code maison de quelques dizaines de lignes — pas de lib de gestion de bannières.

**Version verification:** `npm view @vite-pwa/assets-generator version` → `2.0.0` (exécuté cette session). Pas de `scripts.postinstall` sur le paquet (recherche vide). `vite-plugin-pwa` reste à `1.3.0` (épinglé dans `app/package.json`).

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| @vite-pwa/assets-generator | npm | plusieurs années (paquet officiel de l'org vite-pwa) | élevées | github.com/vite-pwa/vite-plugin-pwa (monorepo) | OK | Approved |
| vite-plugin-pwa | npm | déjà installé | — | github.com/vite-pwa/vite-plugin-pwa | OK | Déjà en place, inchangé |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Déploiement (build)                          Navigateur
───────────────────                          ──────────
public/icon.svg (master)                     Chargement de la page
   │ npx @vite-pwa/assets-generator                 │
   ▼                                         registerSW({ onNeedRefresh, onRegisteredSW })
public/ : pwa-64/192/512.png,                       │ onNeedRefresh → store bandeaux
maskable-icon-512x512.png,                          ▼
apple-touch-icon-180x180.png                 BannerSlot (app-shell, en haut)
favicon.ico/png                                   │  priorité 1 : bandeau MAJ SW
   │                                              │  priorité 2 : bannière install
   ▼                                              │     ├ Chromium : « Installer » → useInstallPrompt
vite.config.ts (manifest source unique)           │     └ iOS UA   : pas-à-pas dépliable
   ├ icons (any+maskable, 64/192/512)             └ Panneau offline (Paramètres)
   ├ shortcuts: Tâches→/taches, Courses→/courses          : version app, version worker actif,
   ├ display_override, screenshots, categories              MAJ en attente, « Appliquer maintenant »
   └ (écrasé si manifest.webmanifest statique — INTERDIT, 09-02)
```

### Recommended Project Structure

```
app/src/
├── components/
│   └── banners/                    # NOUVEAU — infrastructure D-04
│       ├── banner-slot.tsx         # rend les bandeaux actifs triés par priorité
│       └── store (zustand ou hook) # registre des bandeaux actifs
├── components/banners/
│   ├── install-banner.tsx          # bannière install + pas-à-pas iOS dépliable (D-01)
│   └── update-banner.tsx           # « Mise à jour disponible → Recharger » (D-09/D-10)
├── hooks/
│   ├── use-pwa.ts                  # EXISTANT — useInstallPrompt, à étendre légèrement (état installé)
│   └── use-outbox-gate.ts          # NOUVEAU — stub : retourne toujours { isEmpty: true } (D-10)
├── lib/sw-register.ts              # NOUVEAU — extrait registerSW de main.tsx, expose updateSW + état
└── modules/parametres/components/
    └── offline-panel.tsx           # EXISTANT — enrichi (D-12)
```

### Pattern 1: `registerType: 'prompt'` avec `updateSW()`

**What:** En mode `prompt`, le plugin n'applique jamais le worker en attente automatiquement. `onNeedRefresh` est appelé quand un worker en attente existe ; la fonction retournée par `registerSW` déclenche le rechargement.

**Example** (source : docs officielles vite-plugin-pwa, guide/prompt-for-update.md — vérifié via Context7 cette session) :

```ts
// app/src/lib/sw-register.ts
import { registerSW } from 'virtual:pwa-register';

// onNeedRefresh est appelé à chaque session où un worker en attente existe —
// c'est ce qui réalise D-11 « re-proposé à chaque session tant que non appliqué ».
export const updateSW = registerSW({
  onNeedRefresh() {
    useBannerStore.getState().push({ kind: 'sw-update' });
  },
  onRegisteredSW(_, registration) {
    // expose la version du worker actif pour le panneau offline (D-12)
    useSwState.getState().setRegistration(registration);
  },
});
// Bouton « Recharger » → updateSW() → la page recharge avec le nouveau worker.
// Le bouton est désactivé par use-outbox-gate (D-10) : gate = frontière de COMPOSANT.
```

**Point clé :** le gate ne détourne pas `updateSW()` ; il désactive le bouton. La phase 34 remplira `use-outbox-gate` sans toucher ni `sw-register.ts` ni `update-banner.tsx`.

### Pattern 2: Bannière install deux niveaux (D-01/D-02/D-03)

```ts
// Conditions d'affichage de la bannière (toutes requises, vérifiées à la volée — D-03) :
// 1. PAS installée : !window.matchMedia('(display-mode: standalone)').matches
//    (+ fallback navigator.standalone pour iOS)
// 2. PAS enterrée : localStorage 'eo-install-banner-dismissed-at' absent
//    ou de plus de 30 jours (30*24*3600*1000)
// 3. OS détecté : UA iOS → guide Safari dépliable ; Chromium → bouton « Installer »
//    (useInstallPrompt().canInstall) ; desktop Safari/Firefox → rien ou guide neutre
// Le bouton barre supérieure (app-shell.tsx:343) reste inchangé : il cappe
// déjà beforeinstallprompt via eo:install-available.
```

### Pattern 3: Raccourcis manifest (DLNK-01)

```ts
// app/vite.config.ts — bloc manifest :
shortcuts: [
  { name: 'Tâches du jour', url: '/taches', icons: [{ src: 'shortcut-taches-96.png', sizes: '96x96', type: 'image/png' }] },
  { name: 'Courses', url: '/courses', icons: [{ src: 'shortcut-courses-96.png', sizes: '96x96', type: 'image/png' }] },
],
display_override: ['window-controls-overlay', 'minimal-ui', 'standalone'],
categories: ['productivity', 'lifestyle'],
// screenshots: deux PNG (desktop wide ~1280×720+, narrow ~720×1280), committés — attention au poids (voir Pitfalls 6)
```

### Anti-Patterns to Avoid

- **Recréer `public/manifest.webmanifest`** : interdit depuis 09-02, le bloc `manifest:` de `vite.config.ts` est la source unique et gagne dans `dist/`.
- **Repasser en `generateSW`** : le worker porte les écouteurs push (`push`, `notificationclick`) ; `injectManifest` est un invariant du projet.
- **Générer les icônes au build/déploiement** (D-13) : `@vite-pwa/assets-generator` tourne une fois en dev ; les sorties sont committées. N'intégrez PAS l'option `pwaAssets` du plugin (elle générerais au build et casserait la détermination du déploiement).
- **Reload automatique ou `skipWaiting` appelé depuis la page** : c'est exactement ce que `prompt` élimine. Ne pas coller de `clientsClaim()` modifié dans `sw.ts` pour « accélérer ».
- **Bannière install visible quand `display-mode: standalone`** : double invite après installation, confusion.
- **Filtrer par filtre de tâches dans l'URL du raccourci** : interdit par D-05 (aucun paramètre anticipé ; la vue dédiée vient en 35).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Génération any/maskable/favicon/apple-touch | Script sharp/canvas maison | `@vite-pwa/assets-generator` (CLI, preset `minimal-2023`) | La safe-zone maskable, le favicon multi-tailles et les liens apple-touch sont un domaine d'erreurs subtiles ; le preset est maintenu par l'équipe vite-pwa |
| Détection « app installée » | Cookie ou flag serveur | `matchMedia('(display-mode: standalone)')` + `navigator.standalone` (iOS) | Standard ; le flag serveur serait faux par appareil |
| Cap de l'invite d'installation | Nouveau listener | `use-pwa.ts` existant (déjà complet, événement `eo:install-available`) | Réutilisable tel quel (D-01) |
| Réutilisation d'icônes de tuiles pour les raccourcis | Rendu runtime du glyph SVG en data-URL au chargement du manifest | Export one-off SVG→PNG 96px committé | Le manifest est un fichier statique : pas de dynamique possible ; les glyphs React ne s'y exportent pas |

**Key insight:** tout ce qui touche le manifeste ou le SW est **figé au build** — aucune logique runtime ne peut l'influencer. Le dynamisme (bannière, gate, panneau) vit entièrement côté React.

## Runtime State Inventory

Non applicable (pas de rename/migration de données). État navigateur nouveau à créer : la clé `localStorage` d'enterrement de la bannière (ex. `eo-install-banner-dismissed-at`). Aucune migration, aucune donnée serveur touchée.

## Common Pitfalls

### Pitfall 1: `beforeinstallprompt` ne se déclenche pas alors que « tout semble bon »
**What goes wrong:** Chromium exige conjointement manifest valide (avec icônes 192 **et** 512), SW avec fetch handler, HTTPS, pas déjà installée, et engagement (interaction utilisateur). Une icône maskable seule à 512 sans `any` 192 fait échouer l'installabilité.
**Why it happens:** critères silencieux, aucun message d'erreur côté page.
**How to avoid:** garder les deux icônes `any` (192+512) ET la maskable 512 ; vérifier sur desktop Chrome via l'icône d'installation dans l'omnibox + Lighthouse « Installable » ; sur Android via `chrome://webapks` ou l'invite réelle.
**Warning signs:** le bouton Installer n'apparaît jamais ; l'omnibox ne propose pas d'installer.

### Pitfall 2: iOS ignore `shortcuts`, `beforeinstallprompt` et la moitié du manifeste
**What goes wrong:** coder l'UX raccourcis pour iOS, ou attendre une invite Safari.
**Why it happens:** WebKit n'implémente ni l'un ni l'autre.
**How to avoid:** détection UA iOS distincte (D-03) → pas-à-pas Safari dépliable ; les vues cibles restent atteignables in-app (exigence DLNK-01). Safari lit `apple-touch-icon`, `apple-mobile-web-app-capable`/`mobile-web-app-capable` (déjà présents dans `index.html`) et `apple-mobile-web-app-title` — compléter le titre est suffisant, pas de splash screens à générer (discretion).
**Warning signs:** tests « réussis » uniquement sous Chromium.

### Pitfall 3: Icônes de raccourcis non carrées ou non PNG
**What goes wrong:** Chromium exige des PNG (ou WebP) carrés ; 96×96 est la taille recommandée pour les shortcuts ; une icône manquante fait parfois ignorer le raccourci silencieusement.
**Why it happens:** le manifeste accepte beaucoup de choses sans valider.
**How to avoid:** exporter les glyphs existants en PNG 96×96 committés (D-14) ; nommer `shortcut-taches-96.png` / `shortcut-courses-96.png`.
**Warning signs:** appui long sur l'icône Android sans raccourcis.

### Pitfall 4: Le worker en attente ne devient jamais actif / double bandeau
**What goes wrong:** en mode `prompt`, si `onNeedRefresh` est appelé à chaque session alors que la mise à jour n'a jamais été appliquée, le bandeau revient (voulu, D-11) — mais il faut éviter de créer **plusieurs** entrées dans le store de bandeaux à chaque événement.
**How to avoid:** le store de bandeaux déduplique par `kind`; un seul bandeau `sw-update` actif à la fois ; priorité sur la bannière install.
**Warning signs:** deux bandeaux empilés identiques après un re-render.

### Pitfall 5: `screenshots` trop lourds ou mal formés
**What goes wrong:** le champ `screenshots` (D-08) attend `form_factor: 'wide'`/'narrow' + `width`/`height` réels ; des PNG énormes alourdissent le premier chargement (ils ne sont téléchargés qu'à l'invite d'install, mais ils comptent dans le précache si le glob les attrape).
**How to avoid:** compresser (~100–200 Ko), déclarer tailles exactes ; vérifier que `globPatterns`/`includeAssets` n'embarque pas les screenshots dans le précache SW s'ils sont lourds (le glob par défaut de vite-plugin-pwa peut attraper `public/**` selon la config — vérifier `injectManifest.globPatterns`).
**Warning signs:** SW de plusieurs Mo après la phase.

### Pitfall 6: `display_override` avec un mode non supporté
**What goes wrong:** `window-controls-overlay` n'existe que sur desktop Chromium installé ; sur Android il est ignoré au profit du premier mode supporté de la liste — c'est le comportement voulu (D-06), mais tester que la fenêtre desktop reste utilisable sans barre de titre custom non dessinée (WCO réclame un `titlebar` dessiné par l'app ; **ne pas dessiner de titlebar custom dans cette phase** — le fallback `minimal-ui`/`standalone` suffit ; WCO s'active pour de vrai seulement si l'app gère `app-region: drag`).
**How to avoid:** commander la liste exactement comme D-06 ; ne pas ajouter de CSS de titlebar dans cette phase.
**Warning signs:** fenêtre desktop sans aucun moyen de déplacer/fermer après install.

### Pitfall 7: La version SW affichée ne bouge pas
**What goes wrong:** le panneau offline (D-12) doit afficher la version du **worker actif** (`registration.active` + ping `EO_VERSION` — mécanisme `SW_VERSION` déjà en place dans `src/sw.ts`), pas la version de l'app build. Deux sources différentes.
**How to avoid:** réutiliser le ping `EO_VERSION` existant ; afficher les deux (version app = `VITE_APP_VERSION`, version worker = réponse au ping).
**Warning signs:** « mise à jour en attente » affichée en permanence alors que tout est à jour.

## Code Examples

### Manifest final attendu (ajouts en gras)

```ts
// app/vite.config.ts — ajouts au bloc manifest existant :
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
// icons : remplacer le bloc existant par les sorties du générateur :
// pwa-64x64.png (any), pwa-192x192.png (any), pwa-512x512.png (any),
// maskable-icon-512x512.png (maskable) + favicon
```

### Génération des icônes (one-off, sorties committées)

```bash
# Preset minimal-2023 : part d'un SVG master (public/icon.svg existe déjà),
# sorties attendues : pwa-64x64.png, pwa-192x192.png, pwa-512x512.png,
# maskable-icon-512x512.png, apple-touch-icon-180x180.png, favicon.ico/favicon.png
cd app && npx @vite-pwa/assets-generator --preset minimal-2023 public/icon.svg
# Puis committer les sorties dans app/public et mettre à jour le bloc manifest.
# Si le master SVG a des marges insuffisantes pour la maskable, générer un
# master dédié (fond plein + safe zone ~20 %) et le passer au générateur.
```

### Hook stub `use-outbox-gate` (D-10)

```ts
// app/src/hooks/use-outbox-gate.ts
// STUB phase 32 : la file d'écriture (phase 34) n'existe pas encore.
// Le contrat est déjà la frontière : { isEmpty: boolean }.
export function useOutboxGate() {
  return { isEmpty: true } as const;
}
// Phase 34 : brancher sur la vraie file — AUCUN composant à changer.
```

### Enterrement 30 jours (D-02)

```ts
const KEY = 'eo-install-banner-dismissed-at';
const THIRTY_DAYS = 30 * 24 * 3600 * 1000;
export function isBannerBuried(): boolean {
  const at = Number(localStorage.getItem(KEY));
  return Number.isFinite(at) && Date.now() - at < THIRTY_DAYS;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `registerType: 'autoUpdate'` | `prompt` + bandeau contrôlé par l'utilisateur | D-09, cette phase | La page décide quand recharger ; gate possible |
| Icônes 192/512 only | Icônes any + maskable distinctes (preset minimal-2023) | standards PWA récents | Meilleur rendu Android adaptive icons |
| `apple-mobile-web-app-capable` seul | `mobile-web-app-capable` (déjà présent) + manifest complet | — | Déjà conforme dans `index.html` |

**Deprecated/outdated:**
- `dnd-kit` umbrella, `react-router-dom` : hors périmètre, déjà traités dans le codebase.
- Splash screens iOS générés (`createAppleSplashScreens`) : optionnel et coûteux ; la discretion le rend facultatif — recommandation : ne pas les générer (effort/maintenance pour un gain marginal).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Le preset `minimal-2023` du générateur produit exactement les noms de fichiers `pwa-64x64.png`, `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png`, favicon | Génération des icônes | Noms à ajuster dans le manifest — low risk, vérifiable à l'exécution du CLI |
| A2 | Le master `app/public/icon.svg` actuel convient comme source du générateur (fond/marges) | Génération des icônes | Générer un master dédié avec safe-zone — plan doit prévoir une vérification visuelle |
| A3 | `matchMedia('(display-mode: standalone)')` + `navigator.standalone` couvrent la détection « installée » sur les trois OS | Pattern bannière | Faux positif/négatif de bannière — mineur |
| A4 | Chromium accepte des icônes de shortcuts à 96×96 uniquement | Pitfalls 3 | Ajouter 192×192 en secours si ignorées |
| A5 | `@vite-pwa/assets-generator` fonctionne dans l'environnement (sharp natif requis) | Environment Availability | Ajouter une tâche de vérification rapide en début de phase |

## Open Questions — (RESOLVED, arbitrées par les plans)

1. **Screenshots réels** (D-08) : **résolu par le plan 32-01** — Task 3 committe deux captures (placeholders compressés ou réelles), et le checkpoint humain de fin de plan 32-01 fait remplacer les placeholders par des captures réelles ou fait accepter explicitement leur report.
2. **Master d'icône** : **résolu par le plan 32-01** — Task 1 (étape 3) prévoit un master dédié `icon-master.svg` si l'`icon.svg` actuel manque de marge pour la safe-zone maskable, et le checkpoint humain valide visuellement la maskable générée.
3. **`launch_handler`** : omit — discretion (CONTEXT.md « the agent's Discretion » : le détail de `launch_handler` est laissé à l'agent). Aucune clé `launch_handler` n'est ajoutée au manifest ; comportement navigateur par défaut (navigate-app-wide), retouchable plus tard si un retour d'usage le justifie.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js + npm | génération d'icônes (dev) | ✓ (toolchain du projet, Node 24) | 24 | — |
| npx @vite-pwa/assets-generator | génération one-off | à installer (devDependency) | 2.0.0 | — |
| Chrome/Android device | vérification installabilité (criterion SC-3) | machine de l'utilisatrice | — | Lighthouse installable en CI ne remplace pas le test on-device exigé par SC-3 |

**Missing dependencies with no fallback:** aucune bloquante (le test on-device SC-3 est un passage manuel de l'utilisatrice, à prévoir comme étape de vérification).

**Missing dependencies with fallback:** —

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5 + @testing-library/react (déjà configuré) |
| Config file | `app/vite.config.ts` (bloc `test`) |
| Quick run command | `cd app && npx vitest run src/hooks/use-outbox-gate.test.ts` |
| Full suite command | `cd app && npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INST-01 | Le manifest généré contient icônes maskable, display_override, shortcuts, categories | unit (test sur le bloc manifest de vite.config.ts ou snapshot du manifeste de dist) | `cd app && npx vitest run src/pwa/manifest.test.ts` | ❌ Wave 0 |
| INST-02 | La bannière n'apparaît pas si standalone ni si enterrée < 30 jours ; le pas-à-pas iOS se déplie | unit (jsdom + matchMedia mock + localStorage) | `cd app && npx vitest run src/components/banners/install-banner.test.tsx` | ❌ Wave 0 |
| INST-03 | `use-outbox-gate` répond isEmpty:true ; le bouton Recharger est désactivé avec le bon libellé quand !isEmpty | unit | `cd app && npx vitest run src/hooks/use-outbox-gate.test.ts src/components/banners/update-banner.test.tsx` | ❌ Wave 0 |
| DLNK-01 | shortcuts pointent vers `/taches` et `/courses` (vérifiées dans router.tsx:297,333) | unit (manifest test, partagé avec INST-01) | même fichier manifest.test.ts | ❌ Wave 0 |

La vérification **on-device** (installabilité desktop/Android, appui long raccourcis, invite iOS) reste manuelle — SC-3 l'exige explicitement ; à prévoir comme étape de `/gsd-verify-work`.

### Sampling Rate
- **Per task commit:** `cd app && npm run typecheck && npx vitest run <fichiers touchés>`
- **Per wave merge:** `cd app && npm test && npm run build` (+ `npm run test:e2e` si parcours touché — aucun e2e existant ne couvre l'install ; pas d'e2e nouveau nécessaire, hors périmètre automatisable)
- **Phase gate:** Full suite green + build `dist/manifest.webmanifest` inspecté avant `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `app/src/hooks/use-outbox-gate.test.ts` — INST-03
- [ ] `app/src/components/banners/install-banner.test.tsx` — INST-02 (mock matchMedia/localStorage)
- [ ] `app/src/components/banners/update-banner.test.tsx` — INST-03
- [ ] `app/src/pwa/manifest.test.ts` (ou test important le bloc manifest) — INST-01, DLNK-01

*(Note : aucun test e2e Playwright nouveau requis — l'installabilité est intrinsèquement on-device.)*

## Security Domain

> `security_enforcement` absent de `.planning/config.json` → traité comme activé. Cette phase n'introduit **aucune donnée utilisateur, auth, crypto ni endpoint** : rien de nouveau côté serveur.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2/V3/V4/V6 | no | Aucune auth/session/acces/crypto dans cette phase |
| V5 Input Validation | marginal | La seule « entrée » est `localStorage` (timestamp d'enterrement) — parser avec `Number()` + garde `Number.isFinite`, jamais d'injection possible dans le DOM (React) |
| V14 (config) | yes | Ne pas exposer de secret dans le manifeste ; `display_override`/`screenshots` sont publics par nature |

### Known Threat Patterns for cette phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Clé localStorage manipulée (date invalide) | Tampering | Parse défensif, repli = bannière visible (comportement sûr) |
| Worker en attente activé pendant un rejeu de mutations | Elevation/DoS de données | Exactement le gate D-10 — c'est le cœur du critère INST-03 |

## Sources

### Primary (HIGH confidence)
- Context7 `/vite-pwa/vite-plugin-pwa` — guide/prompt-for-update.md (API `registerSW({ onNeedRefresh })`, `updateSW()`, `onNeedReload`), frameworks/index.md, assets-generator (preset minimal-2023, sorties)
- Codebase lu cette session : `app/vite.config.ts` (manifest, injectManifest), `app/src/hooks/use-pwa.ts`, `app/src/sw.ts` (SW_VERSION, ping EO_VERSION), `app/src/main.tsx` (`registerSW({ immediate: true })`), `app/src/modules/parametres/components/offline-panel.tsx`, `app/index.html` (balises apple-*), `app/src/app/router.tsx` (routes `/taches`, `/courses`)

### Secondary (MEDIUM confidence)
- `npm view` registre npm : @vite-pwa/assets-generator 2.0.0, vite-plugin-pwa 2.0.0 (latest — non retenu)

### Tertiary (LOW confidence)
- Détails de comportement Chromium shortcuts (Pitfalls 3/4) et iOS (A3/A4) : `[ASSUMED]` — standards bien établis mais non vérifiés on-device cette session

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — plugin déjà en place, versions vérifiées au registre, API prompt vérifiée via Context7
- Architecture: HIGH — s'appuie sur des patterns existants du codebase (use-pwa, offline-panel, store bandeaux à créer)
- Pitfalls: MEDIUM — comportements navigateur (iOS, shortcuts) assumés mais bien connus ; vérification on-device requise par SC-3 de toute façon

**Research date:** 2026-11-04
**Valid until:** 2026-12-04 (stable — la seule dépendance nouvelle est un outil de génération one-off)
