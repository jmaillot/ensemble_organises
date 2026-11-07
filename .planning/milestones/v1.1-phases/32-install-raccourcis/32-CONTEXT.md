# Phase 32: Install & raccourcis - Context

**Gathered:** 2026-11-04
**Status:** Ready for planning

<domain>
## Phase Boundary

L'app installée est joignable en un tap depuis l'écran d'accueil sur les trois OS : manifest durci (icônes maskable 192/512 générées, `display_override`, balises `apple-*`), UX d'installation par OS (invite Chromium captée + guide iOS dans l'app), raccourcis web « Tâches du jour » et « Courses » sur l'icône installée, et un service worker en `registerType: prompt` dont le rechargement attend un gate « file vide » posé pour la phase 34 — jamais de reload pendant un rejeu à venir.

**Hors périmètre :** la vue « Tâches du jour » dédiée et les deep links déconnectés (phases 35, DLNK-02/DLNK-03), le cache de lecture offline et le bandeau stale (phase 33), la file d'écriture elle-même (phase 34 — ici on ne pose que le stub de gate), les widgets natifs et tout store/APK (exclusions produit 2026-11-04).

</domain>

<decisions>
## Implementation Decisions

### UX d'installation
- **D-01:** L'invite d'installation vit à **deux niveaux** : le bouton existant de la barre supérieure (Chromium, via `useInstallPrompt`) pour qui cherche, et une **bannière discrète auto-dismissable** en haut pour la découvrabilité. Le guide iOS est un **pas-à-pas dépliable dans cette même bannière** (gestes Safari : Partager → « Sur l'écran d'accueil ») — pas de page dédiée. — **Reversibility:** reversible.
- **D-02:** Après un refus (dismiss), la bannière est **enterrée 30 jours** en `localStorage`, puis réapparaît. Le bouton barre supérieure, lui, reste visible tant que `beforeinstallprompt` est disponible. — **Reversibility:** reversible.
- **D-03:** La détection d'OS et d'état se fait **à la volée** — user-agent + feature detection (`display-mode: standalone`, présence de l'événement d'install) ; la bannière est masquée si l'app est déjà installée. Pas d'écran d'onboarding à la première visite. — **Reversibility:** reversible.
- **D-04:** La bannière occupe le **slot bannière en haut** qui sera partagé avec le bandeau stale de la phase 33 : un mécanisme de bandeaux hauts empilables/priorisés est le patron à poser ici. — **Reversibility:** reversible — le partage avec le bandeau stale impose de penser l'emplacement comme une infrastructure dès maintenant.

### Manifest & raccourcis
- **D-05:** Les raccourcis pointent vers les **URLs existantes** : « Tâches du jour » → `/taches`, « Courses » → `/courses`. Ils seront retouchés en phase 35 quand la vue du jour dédiée (DLNK-03) existera. Aucun paramètre de filtre anticipé. — **Reversibility:** reversible.
- **D-06:** `display_override: ['window-controls-overlay', 'minimal-ui', 'standalone']` — sur desktop l'app tire parti des barres de titre système quand supporté ; fallback `standalone` partout ailleurs. — **Reversibility:** reversible.
- **D-07:** `orientation: portrait-primary` est **conservé** (mobile droit ; le responsive gère déjà le paysage sur grand écran). — **Reversibility:** reversible.
- **D-08:** Le manifeste est **enrichi** avec `screenshots` (desktop + narrow) et `categories: ['productivity', 'lifestyle']` au-delà du strict requis INST-01. Le manifeste reste la source unique dans `app/vite.config.ts` (décision 09-02, jamais de retour au fichier statique). — **Reversibility:** reversible.

### Flow de mise à jour SW
- **D-09:** Passage de `autoUpdate` à **`registerType: prompt`** : un bandeau « Une mise à jour est disponible → Recharger » apparaît dans le slot bannière en haut. L'utilisateur garde le contrôle, jamais de reload subi. — **Reversibility:** reversible.
- **D-10:** La gate « file vide » est **câblée dès cette phase comme stub désactivant** : un hook (ex. `use-outbox-gate`) expose « la file est-elle vide ? » et répond toujours oui en phase 32 ; le bouton Recharger est désactivé avec libellé « Mise à jour en préparation… » tant que la file n'est pas vide. La phase 34 branchera la vraie file sur ce hook sans changer le composant. — **Reversibility:** reversible.
- **D-11:** Le bandeau de mise à jour est **différable** : refermable, la nouvelle version s'applique au prochain lancement ; il est re-proposé à chaque session tant qu'elle n'est pas appliquée. — **Reversibility:** reversible.
- **D-12:** L'état SW/version visible (INST-03) vit dans le **panneau offline existant de Paramètres**, enrichi : version du worker actif, mise à jour en attente, bouton « Appliquer maintenant ». Un seul point d'observation, cohérent avec l'existant (`offline-panel.tsx` affiche déjà version et SW). — **Reversibility:** reversible.

### Génération des icônes
- **D-13:** Les icônes maskable sont produites par **`@vite-pwa/assets-generator` depuis un master unique** (SVG ou PNG haute résolution ~1024px, fond plein, marges safe-zone maskable) → sorties `any` + `maskable` en 64/192/512 + favicon. Les assets générés sont **commités dans `app/public`** — le build reste déterministe, aucune étape de génération au déploiement. — **Reversibility:** reversible.
- **D-14:** Les icônes des raccourcis **réutilisent les icônes d'espace existantes** de l'app (celles des tuiles du tableau de bord), redimensionnées à 96px — cohérence visuelle, zéro nouvel asset métier. — **Reversibility:** reversible.

### the agent's Discretion
- Le détail des balises `apple-*` (apple-touch-icon, apple-mobile-web-app-title, splash) et `launch_handler` — l'agent choisit les valeurs standard.
- Le contenu exact du pas-à-pas iOS (captures vs schéma simple) — l'agent décide selon l'effort.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requis & roadmap
- `.planning/ROADMAP.md` §Phase 32 — Goal, Success Criteria 1-4, dépendances v1.1
- `.planning/REQUIREMENTS.md` — INST-01, INST-02, INST-03, DLNK-01 (Phase 32) ; DLNK-02/DLNK-03 (Phase 35, hors périmètre ici)
- `.planning/PROJECT.md` — arbitrages d'ouverture v1.1 (aucun store, widgets natifs sortis)

### Convictions projet
- `AGENTS.md` §2.7 — chaîne de vérification avant commit (typecheck, tests, build, e2e, check-sql-statique non applicable ici — pas de SQL cette phase)
- `AGENTS.md` §6 — guidelines UX transverses (zones tactiles ≥ 44px, états vides, actions destructrices)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/src/hooks/use-pwa.ts` (`useInstallPrompt`) — cappe déjà `beforeinstallprompt` avec événement custom `eo:install-available` ; la bannière/bouton s'appuient dessus tels quels
- `app/src/modules/parametres/components/offline-panel.tsx` — affiche déjà version app + SW ; c'est le point d'extension D-12
- `app/src/sw.ts` — worker `injectManifest` versionné (`SW_VERSION`), précache + push ; la migration vers `prompt` ne touche que le côté page (`registerSW`)
- Icônes d'espace des tuiles du dashboard — réutilisables comme icônes de raccourcis (D-14)

### Established Patterns
- Manifeste **source unique dans `app/vite.config.ts`** (09-02) — le fichier statique `public/manifest.webmanifest` est interdit
- `injectManifest` (pas `generateSW`) : le worker porte les écouteurs push — ne jamais repasser en generateSW
- Slot de bandeau haut à créer conformément à D-04 (infra partagée avec le bandeau stale de la 33)
- Version d'app estampillée via `/version.json` (`scripts/build-app.sh`) — l'état SW s'y raccroche

### Integration Points
- `app/src/main.tsx` — remplace `registerSW({ immediate: true })` par la variante prompt
- `app/src/app/app-shell.tsx` — bouton install existant + nouveau slot bannière
- `app/vite.config.ts` — `registerType`, manifest (display_override, shortcuts, screenshots, categories)
- `app/index.html` — balises `apple-*` existantes à compléter

</code_context>

<specifics>
## Specific Ideas

- L'utilisateur veut que « l'installée soit joignable en un tap » : la découvrabilité de l'installation (bannière) compte autant que la complétude technique du manifeste.
- Le rechargement de mise à jour ne doit **jamais** détruire une session en cours — la gate stub est une frontière de composant posée dès maintenant pour que la phase 34 n'ait qu'un hook à remplir.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 32-Install & raccourcis*
*Context gathered: 2026-11-04*
