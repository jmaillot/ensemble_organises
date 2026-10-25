# Phase 17 : Mode cuisine — Research

**Researched:** 2026-10-14
**Domain:** React frontend — cooking-mode view, device-local progress, Screen Wake Lock API
**Confidence:** HIGH

## Summary

Phase 17 is frontend-only (zero migration, zero RLS, zero Edge Function): a « Mode cuisine » toggle in the `Panel action` slot of the Étapes panel swaps `RecipeSteps` (edit) for a simplified checklist view with a sticky N/M counter + `Progress` bar, persists checked step ids in `localStorage` under `eo:recette:cuisine:<recipeId>`, and holds the screen on via the native Wake Lock API. The same toggle + view ships on the guest page (`guest-recipe-page.tsx`) in `readOnly`, reading already-loaded steps.

All five technical questions are resolved. The headline finding: **no type shim and no new dependency are needed**. `navigator.wakeLock`, `WakeLock.request('screen')`, and `WakeLockSentinel.release()` are all natively typed in this repo's TypeScript 7.0.2 `lib.dom.d.ts` (read verbatim this session), and the `Switch` / `Checkbox` / `Progress` / `Button` primitives plus the `recipeInviteCodeStorageKey` storage regime already exist to copy. The one composition trap to hand the planner: the toggle is a single-tab-stop `<button aria-pressed>` wrapping a `Switch` visual — Radix `Switch` renders a native `<button>`, so it must be rendered `asChild` into a `span` to avoid nested-`<button>` invalid HTML.

**Primary recommendation:** Build three small units — `useCuisineProgress(recipeId, steps)` (storage hook copying the `recipeInviteCodeStorageKey` try/catch regime), `useScreenWakeLock(active)` (request/release/`visibilitychange` re-acquire, all failures silent), and `RecipeCuisineView` (fork of `StepRow` minus DnD/edit, static 48px pastille, connector kept, collapsed-checked rows) — wired through `Panel action` on both pages, verified by Vitest (jsdom: Wake Lock stubbed both ways, fetch-call tracking for the zero-network prohibitions) plus a Playwright demo-session journey in `e2e/recettes.spec.ts`.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Confort lecture cuisine**
- **D-01:** Grandes lignes aérées : texte 17–18px, espacement généreux, cases ≥ 48px. Lisible à bout de bras, écran posé, mains farineuses.
- **D-02:** Étapes cochées réduites et tassées : le texte se replie, la liste se tasse au fur et à mesure (pas de barré-sur-place, pas de masquage derrière filtre).
- **D-03:** Numéros en pastille XL accentuée, statique (pas de drag) — continuité du motif fiche en plus visible.
- **D-04:** Case à cocher à gauche du texte (reprend le motif actuel), zone tactile ≥ 48px.
- **D-05:** Point de liaison + trait vertical entre étapes conservés (motif fiche D-11 phase 16).
- **D-06:** Étapes longues : texte entier toujours visible, la ligne grandit — rien n'est caché ni tronqué en cuisinant.

**En-tête progression**
- **D-07:** En-tête sticky en haut de la vue cuisine : compteur + barre toujours visibles pendant le scroll.
- **D-08:** Compteur « N/M » + barre fine sous le compteur, dans l'en-tête sticky (les deux, pas l'un seul).
- **D-09:** Bouton « Tout réinitialiser » aux deux endroits : rappel dans l'en-tête + bouton en bas de vue après la dernière étape.

**Veille (Wake Lock, sans élément séparé)**
- **D-10:** Pas d'interrupteur veille séparé : la veille suit le toggle « Mode cuisine » lui-même — ON = `navigator.wakeLock.request('screen')` demandé (si supporté), OFF / sortie / démontage = relâché. Aucun switch, bouton ou case dédié près du compteur.
- **D-11:** Repli non supporté : mention discrète grise sous la barre (« veille non bloquée sur cet appareil »), jamais d'erreur. Réacquisition sur `visibilitychange` visible quand le mode est ON.

**Bascule + reset**
- **D-12:** Toggle = switch « Mode cuisine » en haut à droite du panneau Étapes (`Panel action`, `aria-pressed`), OFF par défaut à chaque ouverture (SPEC R1).
- **D-13:** Bascule édition ↔ cuisine : scroll/focus conservés — on reprend où on était, pas de retour en haut.
- **D-14:** « Tout réinitialiser » : confirmation inline (« Tout effacer ? Annuler / Réinitialiser »), sans modale — aucune donnée serveur en jeu.
- **D-15:** Description du panneau Étapes bascule avec le mode (SPEC R1) : OFF → « Glissez la pastille numérotée pour réordonner. » ; ON → « Cochez au fur et à mesure. Progression mémorisée sur cet appareil. »

**Parité invitée + enfant + a11y**
- **D-16:** Page invitée à parité totale : même confort XL + sticky + compteur/barre + reset, alimentée par les étapes `link-view` déjà chargées, zéro PostgREST supplémentaire, zéro édition.
- **D-17:** Mémoire locale aussi pour l'invité : même clé `eo:recette:cuisine:<recipeId>` sur l'appareil de l'invité, purge ids obsolètes identique.
- **D-18:** Enfant : toggle visible, cases cochables seules, rien d'autre (cohérent `readOnly` actuel).
- **D-19:** A11y : compteur « N/M » annoncé poliment (`aria-live="polite"`) à chaque case, ordre tab naturel, cases ≥ 44px via primitive `Checkbox` existante.

**Amendement R4 acté en discuss (user) :** SPEC prévoyait « interrupteur visible dans la vue cuisine près du compteur ». Décision utilisateur : **pas d'élément séparé** — la veille suit le toggle « Mode cuisine » (ON = demande verrou, OFF/sortie = relâche). La mention discrète de repli est conservée. Le planner applique l'amendement, pas la lettre de R4.

### The Agent's Discretion

Tailles px exactes (17 vs 18px, pastille XL en px), épaisseur/couleur de la barre, wording exact de la mention de repli, libellé du bouton reset (« Tout réinitialiser » vs « Tout effacer »), nom du composant vue cuisine et du hook mémoire/veille.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

## Phase Requirements

| ID | Description (from SPEC.md) | Research Support |
|----|----------------------------|------------------|
| R1 | Toggle `aria-pressed` en `Panel action`, OFF par défaut, bascule édition ↔ cuisine + swap description | `Panel action` slot verified; single-tab-stop button+`Switch-asChild-span` pattern; `key={recipe.id}` reset idiom |
| R2 | Liste simplifiée : numéro + texte + case, compteur N/M + barre, zéro édition | `RecipeCuisineView` fork spec; `Checkbox` + `Progress` primitives verified; sticky header pattern |
| R3 | Progression `localStorage` `eo:recette:cuisine:<recipeId>`, purge ids obsolètes, reset inline | Storage hook copying `recipeInviteCodeStorageKey` regime (verified verbatim); JSON-array-of-ids format |
| R4 (amendé) | Wake Lock suit le toggle, release sortie/démontage, re-acquire `visibilitychange`, repli discret | Native TS 7.0.2 types verified verbatim — no shim; `useScreenWakeLock(active)` pattern; secure-context note |
| R5 | Page invitée à parité, zéro PostgREST, zéro édition | Guest branch point verified; fetch-call-tracking test technique from `guest-recipe-page.test.tsx` |

## Project Constraints (from AGENTS.md)

- **Chaîne §2.7 (ordre imposé) :** `cd app && npm run typecheck && npm test && npm run build`, puis `cd app && npm run test:e2e`. Aucun SQL/DB dans cette phase (frontend only) — `check-sql-statique.py`, `test-db.sh`, `test-dispatch-push.sh` sans objet.
- **Stack verrouillée :** Node.js 24 + npm, React 19.3, TypeScript 7 (`tsc` build), Vite 8.3, React Router 8.4 déclaratif (`react-router`, jamais `react-router-dom`), Tailwind v4, Radix-backed primitives, `package-lock.json` versionné — **aucune nouvelle dépendance** (prohibition SPEC : Wake Lock natif + primitives existantes).
- **Données sensibles :** clé publiable seule côté frontend ; ici rien de plus — la progression cuisine (ids d'étapes) reste sur l'appareil, jamais envoyée.
- **Conventions UI §6 :** zones tactiles ≥ 44px, pas de suppression en un tap sans confirmation (ici : reset avec confirmation inline, pas de modale — aucune donnée serveur en jeu, D-14).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cuisine checklist rendering (numbers, checkboxes, counter, bar) | Browser / Client | — | Pure presentational fork of `RecipeSteps`; reads already-loaded `steps`, zero network |
| Progress persistence (`eo:recette:cuisine:<recipeId>`) | Browser / Client | — | `localStorage` device-only by locked design; server persistence explicitly prohibited |
| Screen wake lock hold/release | Browser / Client | — | `navigator.wakeLock` is a browser capability API; no server involvement possible |
| Toggle + panel description swap | Browser / Client | — | Local `useState(false)` per sheet open; mode never persisted |
| Steps data source (member + guest) | API / Backend (read-only, pre-existing) | — | Member: `stepsByRecipe` already loaded; guest: `link-view` Edge payload already loaded — phase adds zero calls |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `navigator.wakeLock` (native) | navigateur (Chrome/Edge/Safari 16.4+/Firefox 135+) [ASSUMED] | Maintenir l'écran allumé en mode cuisine | API web native, zéro dépendance (prohibition SPEC) ; types natifs TS 7.0.2 [VERIFIED: app/node_modules/@typescript/typescript-linux-x64/lib/lib.dom.d.ts:38528-38534] |
| `Checkbox` (`@/components/ui/primitives`) | @radix-ui/react-checkbox 1.3.11 [VERIFIED: app/package.json:28] | Cases des étapes cuisine (clavier + lecteur d'écran) | Primitive existante imposée par SPEC R2/D-19 ; lue verbatim (`primitives.tsx:21-35`) |
| `Switch` (`@/components/ui/primitives`) | @radix-ui/react-switch 1.3.7 [VERIFIED: app/package.json:40] | Visuel du toggle « Mode cuisine » | Primitive existante imposée par UI-SPEC ; rendue `asChild`→`span` dans le bouton toggle (voir piège §Pitfall 1) |
| `Progress` (`@/components/ui/primitives`) | @radix-ui/react-progress 1.1.16 [VERIFIED: app/package.json:34] | Barre N/M (déjà `role="progressbar"`, clamp 0–100) | Primitive existante, lue verbatim (`primitives.tsx:83-97`) — rien à construire |
| `Button` (`@/components/ui/button`) | existant (`secondary`/`quiet`/`danger` vérifiés, `button.tsx:11-17`) [VERIFIED: app/src/components/ui/button.tsx:11-17] | Reset en-tête (`quiet`), reset bas (`secondary`), confirmation (`secondary`+`danger`) | Variants exacts exigés par le copy contract déjà présents |
| `Panel` (`@/components/shared/module-shell`) | existant (`action` lue verbatim, `module-shell.tsx:74-91`) | Slot haut-droite du toggle + swap de `description` | Emplacement verrouillé R1/D-12 ; motif `aria-pressed` déjà éprouvé (favori grille, `recette-detail-page.tsx:226`) |
| React `useState`/`useEffect`/`useRef` | react 19.3.0 [VERIFIED: app/package.json:53-54] | État toggle (OFF défaut), hook veille, hook mémoire | Aucune lib d'état requise |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest + Testing Library + user-event | vitest 5.0.2, @testing-library/react 16.3.3, user-event 14.6.7 [VERIFIED: app/package.json:62-81] | Tests toggle/mémoire/veille/reset, preuve zéro-réseau | Toute la preuve Vitest de la phase |
| Playwright | @playwright/test 1.63.0 [VERIFIED: app/package.json:63] | Parcours démo : toggle → cocher → recharger → reprise | e2e recettes (navigateurs déjà installés, voir §Environment) |
| TypeScript | 7.0.2 [VERIFIED: app/package.json:78] | `tsc --noEmit` ; types Wake Lock natifs, **aucun shim ambient** | `lib: ["ES2022", "DOM", "DOM.Iterable"]` [VERIFIED: app/tsconfig.json:2-5] — `DOM` suffit, ne pas toucher au tsconfig |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `navigator.wakeLock` natif | lib `react-wake-lock` / NoSleep.js (vidéo cachée) | Rejeté : prohibition SPEC (zéro dépendance) + hack vidéo obsolète et gourmand |
| `localStorage` ids JSON | IndexedDB/Dexie | Rejeté : sur-ingénierie — quelques ids, régime `eo:*:code:` éprouvé phases 15–16, synchrone simple |
| Bouton toggle maison | `Switch` seul avec `aria-pressed` | Rejeté : Radix `Switch` est `role="switch"` (`aria-checked`), le contrat verrouille `aria-pressed` sur un seul tab stop — d'où bouton + visuel `asChild` |
| Modale de confirmation reset | inline « Tout effacer ? Annuler / Réinitialiser » | Rejeté : D-14 verrouille l'inline (aucune donnée serveur en jeu) |

**Installation:**
```bash
# Rien à installer — zéro nouvelle dépendance (prohibition SPEC vérifiable : lockfile inchangé).
```

**Version verification:** versions ci-dessus lues dans `app/package.json` (lignes 18–88) et `app/node_modules/typescript/package.json` (`"version": "7.0.2"`) cette session ; Node `v24.21.0` / npm `11.19.0` constatés en exécution (voir §Environment Availability).

## Package Legitimacy Audit

> Aucun package externe installé par cette phase (natif + primitives existantes). Gate sans objet.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| *(aucun)* | — | — | — | — | — | Rien à auditer |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.
**Lockfile check for planner:** le plan doit inclure une vérification `git diff --stat package-lock.json` vide (prohibition SPEC « MUST NOT ajouter de dépendance », vérification : judgment — revue lockfile inchangé).

## Architecture Patterns

### System Architecture Diagram

```
Fiche recette (/recettes/:id)                    Page invitée (/invitation/recette?code=…)
┌─────────────────────────────────┐              ┌──────────────────────────────────┐
│ steps déjà chargés              │              │ steps link-view déjà chargés     │
│ (stepsByRecipe, zéro appel)     │              │ (fetchGuestRecipeView, 1 appel   │
└───────────────┬─────────────────┘              │  Edge pré-existant, zéro ajout)  │
                ▼                                └───────────────┬──────────────────┘
┌─────────────────────────────────┐                             ▼
│ Panel « Étapes »                │              ┌──────────────────────────────────┐
│  action = [toggle Mode cuisine] │              │ Panel Étapes invité              │
│  description = OFF|ON swap      │              │  action = [même toggle]          │
└───────────────┬─────────────────┘              └───────────────┬──────────────────┘
                │ toggle OFF (défaut) / ON                      │ toggle OFF (défaut) / ON
       ┌────────┴────────┐                             ┌────────┴────────┐
       ▼                 ▼                             ▼                 ▼
 RecipeSteps        RecipeCuisineView              (partagé, readOnly) (partagé)
 (édition, DnD,    (NOUVEAU, lecture + cases) ──► même composant, prop readOnly
  draft préservé)   │ sticky header N/M + bar
                    │ cases ↔ useCuisineProgress ──► localStorage
                    │         eo:recette:cuisine:<recipeId>
                    │ toggle ON/OFF ↔ useScreenWakeLock ──► navigator.wakeLock
                    │         request('screen') / release()
                    │ visibilitychange → re-acquire si ON + visible
                    └─ reset ×2 (header + bas) + confirm inline
```

Seuls deux points de branchement : le panneau « Étapes » de `recette-detail-page.tsx` (ligne 282) et le rendu `RecipeSteps` de `guest-recipe-page.tsx` (ligne 143). Tout le reste de la fiche (ingrédients, scaler, actions, export, Courses) est untouched.

### Recommended Project Structure

```
app/src/modules/recettes/
├── components/
│   ├── recipe-steps.tsx          # INCHANGÉ — vue édition préservée (draft/edit/drag)
│   ├── recipe-cuisine-view.tsx   # NOUVEAU — vue cuisine (fork StepRow sans DnD/edit)
│   └── cuisine-toggle.tsx        # NOUVEAU (optionnel) — bouton aria-pressed + Switch asChild
├── hooks/
│   ├── use-cuisine-progress.ts   # NOUVEAU — mémoire locale par recipeId
│   └── use-screen-wake-lock.ts   # NOUVEAU — veille suivant le toggle
├── api.ts                        # +3 helpers stockage (read/write/clear, régime copié)
├── recette-detail-page.tsx       # Panel Étapes : action + description swap + branche ON/OFF
└── guest-recipe-page.tsx         # Panel invité : même action + même vue (readOnly)
```

(Noms de fichiers à la discrétion de l'agent — D the agent's Discretion. L'essentiel : hooks testables purs + composant présentational partagé.)

### Pattern 1: Mémoire locale par recette (régime `eo:*:code:` copié)

**What:** clé exacte `eo:recette:cuisine:<recipeId>` → tableau JSON d'ids d'étapes cochées. Lecture au montage (parse gardé + purge des ids absents de `steps`), écriture à chaque bascule, `removeItem` au reset. Stockage illisible → repli session silencieuse (état mémoire seul), jamais d'erreur UI.
**When to use:** le hook `useCuisineProgress(recipeId, steps)` ; même clé côté invité (D-17).
**Example:**
```typescript
// Régime copié de app/src/modules/recettes/api.ts:416-445 (verbatim) :
export const recipeInviteCodeStorageKey = (recipeId: string): string => `eo:recipe:code:${recipeId}`;
export function readRecipeInviteCode(recipeId: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const stored = localStorage.getItem(recipeInviteCodeStorageKey(recipeId));
    const trimmed = stored?.trim() ?? '';
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}
// … writeRecipeInviteCode / clearRecipeInviteCode : même garde try/catch,
// commentaire d'origine : « Stockage plein ou bloqué : le code reste affiché, sans mémoire. »
```

```typescript
// Nouveau — même garde, valeur JSON + purge (recommandation, à placer en hooks/use-cuisine-progress.ts) :
export const cuisineProgressStorageKey = (recipeId: string): string => `eo:recette:cuisine:${recipeId}`;

export function useCuisineProgress(recipeId: string, steps: RecipeStep[]) {
  const [checked, setChecked] = useState<Set<string>>(() => readCuisineProgress(recipeId, steps));
  const toggle = (id: string) =>
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeCuisineProgress(recipeId, next); // try/catch interne, silencieux
      return next;
    });
  const reset = () => {
    setChecked(new Set());
    clearCuisineProgress(recipeId); // removeItem gardé
  };
  return { checked, toggle, reset };
}
// read : JSON.parse gardé → filtre aux ids de `steps` (purge obsolètes, SPEC edge) → Set.
// NOTE : `steps` change (reorder/édition) sans perdre les cases : les ids sont stables,
// seuls les ids disparus sont purgés. Mémoriser aussi la purge (réécrire) pour ne pas
// relire d'orphelins à chaque montage.
```

### Pattern 2: Wake Lock suivant le toggle (demande/libération/re-acquisition)

**What:** `useScreenWakeLock(active: boolean)` — `request('screen')` quand `active` passe vrai (si `'wakeLock' in navigator`), `release()` au cleanup (toggle-OFF, changement de fiche, démontage), réacquisition sur `visibilitychange` → `visible` si toujours actif. Tout rejet → silencieux ; `supported` exposé pour la mention de repli.
**When to use:** monté une fois par panneau Étapes, `active = cuisineMode`.
**Example:**
```typescript
// Types natifs — AUCUN shim (lus verbatim, TS 7.0.2 lib.dom.d.ts) :
//   Navigator: « readonly wakeLock: WakeLock; » (:25859)
//   « request(type?: WakeLockType): Promise<WakeLockSentinel>; » (:38534)
//   « type WakeLockType = "screen"; » (:44470)
//   « release(): Promise<void>; » + « readonly released: boolean; » (:38560-38572)
//   « Available only in secure contexts. » (:38524) — localhost et HTTPS OK,
//   HTTP LAN/intranet non-HTTPS : request rejette → chemin silencieux, mention de repli.
export function useScreenWakeLock(active: boolean): { supported: boolean } {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  useEffect(() => {
    if (!active || !supported) return;
    let cancelled = false;
    const acquire = async () => {
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          await sentinel.release().catch(() => undefined);
          return;
        }
        sentinelRef.current = sentinel;
      } catch {
        // Refus / non-sécurisé / onglet caché : la cuisine continue, sans erreur.
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && activeRef.current && !sentinelRef.current?.released === false) {
        void acquire();
      }
    };
    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => undefined);
    };
  }, [active, supported]);

  return { supported };
}
// NOTE : le flag `cancelled` couvre la course request lente → toggle-OFF avant
// résolution (verrou fantôme, SPEC edge). Le garde `!sentinel.released` évite le
// double-release si le système a déjà relâché (onglet masqué).
```

### Pattern 3: Toggle single-tab-stop en `Panel action`

**What:** `<button type="button" aria-pressed>` contenant le libellé 14px/700 + visuel `Switch` rendu **`asChild` vers un `span`** (`tabIndex={-1}`, `aria-hidden`) — un seul tab stop, état porté par `aria-pressed`. OFF par défaut : `useState(false)` réinitialisé par `key={recipe.id}` (même idiome que `IngredientList key={recipe.id}`, `recette-detail-page.tsx:238`) car la page persiste entre fiches sur la route `/recettes/:id`.
**When to use:** `action` du `Panel` Étapes membre + invité ; `description` du même `Panel` basculée par le même booléen (D-15).
**Example:**
```tsx
// Slot vérifié : app/src/components/shared/module-shell.tsx:74-91 —
// « {title || action ? (<div …><div>{title}{description}</div>{action}</div>) : null}{children} »
// Motif aria-pressed éprouvé : favori grille (recette-detail-page.tsx:226,
// « aria-pressed={recipe.isFavorite} ») + filtres cadeaux.
const [cuisine, setCuisine] = useState(false); // OFF par défaut à chaque ouverture (R1)

<Panel
  title="Étapes"
  description={
    cuisine
      ? 'Cochez au fur et à mesure. Progression mémorisée sur cet appareil.'
      : 'Glissez la pastille numérotée pour réordonner.'
  }
  action={
    <button
      type="button"
      aria-pressed={cuisine}
      onClick={() => setCuisine((current) => !current)}
      className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border …"
    >
      <span className="text-[14px] font-bold">Mode cuisine</span>
      {/* Switch Radix rend un <button> : asChild→span évite le <button> imbriqué. [ASSUMED] */}
      <Switch checked={cuisine} tabIndex={-1} aria-hidden="true" asChild>
        <span />
      </Switch>
    </button>
  }
>
  {cuisine
    ? <RecipeCuisineView steps={steps} readOnly={!canWrite} recipeId={recipe.id} />
    : <RecipeSteps steps={steps} readOnly={!canWrite} …inchangé />}
</Panel>
// D-13 : aucun scrollTo/autofocus au toggle — le swap a lieu in situ, le scroll est conservé
// par construction. Ne PAS ajouter de ref/focus management.
```

### Pattern 4: Vue cuisine = fork `StepRow` sans DnD ni édition

**What:** `RecipeCuisineView({ steps, checked, onToggle, onReset, readOnly })` — en-tête sticky (`sticky top-0 bg-surface/95 backdrop-blur`, compteur `aria-live="polite"` + `Progress value={m===0?0:(n/m)*100}` + reset discret `quiet` + mention repli si non supporté), liste `<ol aria-label="Étapes de la recette">` (même label que l'original), lignes : pastille XL **statique** 48px (`bg-accent-soft`, chiffre 20px/700 `text-accent-strong`), connecteur `bg-border` conservé sauf dernière, `Checkbox` à gauche, texte 18px entier si non coché / 14px `text-muted` clamp 2 lignes si coché (texte complet en `aria-label`, D-02/D-06, pas de `line-through`), reset bas `secondary` + confirm inline in-place, état vide = même copie que l'original.
**When to use:** ON sur les deux pages ; `readOnly` ne change rien en cuisine (cases toujours cochables, y compris enfant D-18 — cohérent avec les cases D-12 conservées en `readOnly` dans `StepRow`).
**Example (ligne) :**
```tsx
// Base copiée de recipe-steps.tsx:218-246 (pastille + connecteur + Checkbox à gauche) :
<li className="relative flex gap-3 py-3 first:pt-0 last:pb-0">
  <span className="flex flex-col items-center">
    <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent-soft text-[20px] font-bold text-accent-strong">
      {number}
    </span>
    {!isLast ? <span aria-hidden="true" className="mt-1 w-px flex-1 bg-border" /> : null}
  </span>
  <div className="min-w-0 flex-1">
    <div className="flex items-start gap-2">
      <Checkbox
        checked={checked}
        onCheckedChange={onToggle}
        aria-label={checked ? `Étape ${number} faite, activer pour rouvrir` : `Marquer l’étape ${number} comme faite`}
        className="relative mt-1 size-6 shrink-0 after:absolute after:-inset-3 after:content-['']"
      />
      {/* size-6 (24px) + after:-inset-3 (12px×2) = 48px tactiles — voir Pitfall 2. */}
      {checked
        ? <p className="m-0 line-clamp-2 text-[14px] text-muted">{step.content}</p>
        : <p className="m-0 text-[18px] leading-[1.5]">{step.content}</p>}
    </div>
  </div>
</li>
```

### Anti-Patterns to Avoid

- **Persister le *mode* (toggle ON) :** R1 verrouille OFF par défaut à chaque ouverture — seul `checked` est stocké. Ne pas mettre `cuisine` en `localStorage`.
- **`<button>` imbriqué (Switch natif dans le bouton toggle) :** HTML invalide + warning React + clics fantômes. Toujours `asChild`→`span` (ou visuel pur), jamais deux tab stops.
- **Édition câblée en mode ON :** aucun `onAdd/onUpdate/onDelete/onReorder` ne doit atteindre la vue cuisine (prohibition SPEC, vérifiée par test : aucun handler d'écriture câblé). La vue cuisine ne reçoit que `steps` + callbacks de cases.
- **`scrollTo`/`autoFocus` au toggle :** interdit par D-13. Le swap in-situ conserve scroll et focus par construction.
- **Toast/erreur sur échec stockage ou Wake Lock :** interdit par le copy contract (« cooking must never be interrupted ») — silence total, repli discret pour le seul cas non-supporté.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cases clavier/lecteur d'écran | `<input type="checkbox">` stylé maison + gestion d'état ARIA | `Checkbox` (`primitives.tsx`) | Roving/focus/annonce Radix déjà éprouvés ; le motif `after:-inset` existe dans `StepRow` |
| Barre de progression | `<div>` width % maison + ARIA manuel | `Progress` (`primitives.tsx`) | `role="progressbar"` + `aria-valuenow/min/max` + clamp déjà en place (lignes 83-97) |
| Maintien d'écran | Timer/no-op, vidéo invisible (NoSleep.js), `preventDefault` sur touch | `navigator.wakeLock.request('screen')` | Natif, économe, types TS 7.0.2 natifs ; les hacks vidéo drainent la batterie et cassent en arrière-plan |
| Persistance ids cochés | Store Zustand persisté / IndexedDB | `localStorage` JSON + régime try/catch copié de `api.ts:416-445` | Quelques ids, synchrone, éprouvé phases 15–16 ; Dexie n'est plus que démo locale |
| Compteur annoncé | `setInterval`/ref polling du N/M | `aria-live="polite"` sur le compteur (D-19) | Natif lecteur d'écran, zéro JS |

**Key insight:** tout ce que la phase touche existe déjà (slot, primitives, régime mémoire, motifs `aria-pressed`, copie vide) sauf 40 lignes de logique navigateur (Wake Lock + JSON) — la valeur du plan est dans le câblage et les preuves, pas dans des composants.

## Common Pitfalls

### Pitfall 1: `<button>` imbriqué via le `Switch` dans le toggle
**What goes wrong:** `<button aria-pressed><Switch/></button>` rend un `<button>` Radix dans un `<button>` — HTML invalide, warning React « validateDOMNesting », le clic sur le switch ne remonte pas toujours, double tab stop.
**Why it happens:** `Switch` (`SwitchPrimitive.Root`) rend nativement un `<button>` (`primitives.tsx:9-18`) ; l'UI-SPEC exige un seul tab stop avec `tabIndex={-1}` + `aria-hidden` sur le visuel, ce qui ne suffit pas sans changer l'élément.
**How to avoid:** `Switch … asChild` avec enfant `<span />` (Radix Slot fusionne `data-state` → les styles `data-[state=checked]:bg-accent` continuent de s'appliquer) [ASSUMED — composition Radix standard, à prouver par test `getByRole('button', {name:'Mode cuisine'})` unique + aucun `switch` dans l'arbre].
**Warning signs:** warning `validateDOMNesting(<button> cannot appear as a descendant of <button>)` dans les logs Vitest/jsdom.

### Pitfall 2: Zone tactile < 48px en recopiant `StepRow` tel quel
**What goes wrong:** `StepRow` utilise `size-[19px] … after:-inset-3` soit 19 + 24 = **43px** effectifs — sous le seuil D-04 (≥ 48px) et D-19 (≥ 44px).
**Why it happens:** copie littérale de `recipe-steps.tsx:245` sans refaire le calcul.
**How to avoid:** visuel `size-6` (24px) + `after:-inset-3` (12px × 2) = **48px** exactement (résolution UI-SPEC validée) ; test : `getComputedStyle` ou assertion de classes.
**Warning signs:** audit tactile Playwright / revue qui mesure 43px.

### Pitfall 3: Toggle qui persiste entre fiches (route `/recettes/:id` réutilisée)
**What goes wrong:** naviguer fiche A (cuisine ON) → fiche B garde ON, violant « OFF par défaut à chaque ouverture ».
**Why it happens:** `RecetteDetailPage` ne démonte pas entre `:id` — `useState(false)` initial ne rejoue pas.
**How to avoid:** copier l'idiome existant `key={recipe.id}` (`recette-detail-page.tsx:238`, `IngredientList`) sur la section contenant l'état cuisine, ou `useEffect(() => setCuisine(false), [recipe.id])`. Test : deux `recipeId`, ON sur A, rerender B → OFF + cases de B.
**Warning signs:** e2e qui ouvre une 2e fiche et voit la vue cuisine.

### Pitfall 4: Verrou fantôme (request lente + sortie rapide / StrictMode dev)
**What goes wrong:** `request('screen')` résout après le toggle-OFF → sentinelle stockée, jamais relâchée, écran tenu allumé hors cuisine (edge SPEC « verrou fantôme »).
**Why it happens:** effet async sans garde d'annulation ; double-invocation d'effet en dev.
**How to avoid:** flag `cancelled` + release immédiate si résolu après annulation (voir Pattern 2) ; cleanup systématique. Test : mock `request` à résolution différée, OFF avant résolution, assert `release` appelée et `sentinelRef` nul.
**Warning signs:** en manuel, écran qui ne se verrouille plus après un ON/OFF rapide.

### Pitfall 5: `localStorage` corrompu ou quota plein → crash au montage
**What goes wrong:** `JSON.parse` qui jette, ou `setItem` qui jette (quota / navigation privée) → fiche blanche ou toggle mort.
**Why it happens:** lecture/écriture non gardées, contrairement au régime `api.ts:418-445` qui enveloppe tout en try/catch.
**How to avoid:** `read` : try/catch + validation `Array.isArray` + filtre `typeof id === 'string'` → `Set` vide en repli ; `write` : try/catch silencieux (état mémoire conservé = session-only). Test backstop UI-SPEC : stockage indisponible → cases 100 % opérables, aucune UI d'erreur.
**Warning signs:** `SyntaxError: Unexpected token` dans les rapports d'erreur prod sur la fiche recette.

### Pitfall 6: Copie d'état vide avec la mauvaise apostrophe
**What goes wrong:** deux chaînes quasi identiques coexistent (« …l'instant. » typographique dans `recipe-steps.tsx:122` vs « …l'instant. » droite dans l'UI-SPEC) → doublon de copy, tests fragiles au copier-coller.
**Why it happens:** UI-SPEC écrit en apostrophe droite, le code existant en `'` (U+2019).
**How to avoid:** réutiliser la copie du composant d'origine telle quelle (ou extraire une constante partagée) ; les tests doivent requêter par rôle/texte insensible à l'apostrophe ou copier la chaîne du source.
**Warning signs:** test `getByText('Aucune étape…')` qui échoue alors que la ligne est visible.

### Pitfall 7: Requêtes réseau fantômes en mode cuisine (prohibitions R3/R5)
**What goes wrong:** la vue cuisine déclenche un `fetch` (cover, refresh, TanStack refetch au focus) pendant la preuve « zéro appel ».
**Why it happens:** `coverQuery` et TanStack refetch-on-focus existent sur la fiche ; un test mal scopé les attribue à la vue cuisine.
**How to avoid:** preuve Vitest à la `guest-recipe-page.test.tsx:42-53` (stub `fetch`, clics cases/toggle, assert `calls` vide) en montant la **vue cuisine isolée** (pas la page entière) ; côté page, assert aucun `from()` PostgREST *supplémentaire* au toggle (le `link-view` initial reste légitime).
**Warning signs:** test zéro-réseau rouge à cause du `link-view` de setup — scoper le reset du mock après le chargement.

## Code Examples

Verified patterns from repo sources (all files read this session):

### Stockage par id — régime à copier (verbatim, `api.ts:416-445`)
```typescript
// Source: app/src/modules/recettes/api.ts:416-445
export const recipeInviteCodeStorageKey = (recipeId: string): string => `eo:recipe:code:${recipeId}`;
// read : « if (typeof localStorage === 'undefined') return null; » + getItem + trim, le tout en try/catch → null.
// write : « localStorage.setItem(…code.trim()) » en try/catch —
//   « // Stockage plein ou bloqué : le code reste affiché, sans mémoire. »
// clear : « localStorage.removeItem(…) » en try/catch —
//   « // Décoratif : un code restant ne fait qu'afficher un lien caduc. »
```

### Toggle `aria-pressed` éprouvé + reset par `key` (ver
...[truncated 6452 chars]