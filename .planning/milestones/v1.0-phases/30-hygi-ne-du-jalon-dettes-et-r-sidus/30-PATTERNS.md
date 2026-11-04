# Phase 30: Hygiène du jalon — dettes et résidus - Pattern Map

**Mapped:** 2026-10-30
**Files analyzed:** 10 (fichiers modifiés/étendus — la phase ne crée presque rien de neuf : 1 dossier d'assets, 1 spec e2e, éventuellement 1 test)
**Analogs found:** 10 / 10

## ⚠️ Finding critique pour le planner (avant toute affectation de tâches)

**DET-03 — le semis ne contient qu'UNE recette, pas 12.** `demoRecipes` (app/src/lib/data/seed.ts:568-570) contient exactement une ligne : `recipe-1` « Tartiflette de saison ». La décision D-08 (« 12 jpg ») reposait sur un compte supposé (hypothèse A5 de RESEARCH.md, confirmée fausse par grep : aucun autre `id: 'recipe-…'` dans seed.ts). Le planner doit arbitrer :
- soit le semis est enrichi en recettes supplémentaires (hors périmètre affiché, mais cohérent avec D-09 « toutes les recettes ») ;
- soit **1 photo** (`/assets/recettes/tartiflette.jpg`) suffit et D-08 est reformulé au nombre réel.
Ne pas semer 12 photos orphelines. Tout le reste de la phase est conforme aux décisions telles que vérifiées.

**DET-03 — le test de contrat pass-through `/assets/` existe déjà** (hypothèse A3 levée) : `app/src/modules/recettes/recipe-cover.test.ts:71-75` couvre `'blob:'`, `'/assets/gratin.jpg'` et `null`. DET-03 côté test = **rejouement** (rouge avant vert impossible sans modifier le code), pas création. Seul travail réel : semer `cover_photo` + créditer ATTRIBUTION.md.

**DET-02 — les tests hors-ligne existent déjà** : `app/src/lib/online-status.test.ts`, `app/src/lib/query-policy.test.ts` — rejouement pur, aucun analog à extraire.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/tests/0004_cron.sql` (étendre : occurrence du jour générée) | test (SQL) | batch | lui-même + `0011_cron.sql` (fonctions testées) | exact |
| `docs/BACKEND.md` §6.3 (mise à jour si écart) | doc | — | lui-même | exact |
| `app/src/lib/data/seed.ts` (`demoRecipes.cover_photo`) | model (semis démo) | CRUD (Dexie) | `photo_url: '/assets/*.jpg'` du même fichier (l.720, 735, 750, 1206) | exact |
| `app/public/assets/recettes/*.jpg` + `ATTRIBUTION.md` | asset/config | file-I/O | `ATTRIBUTION.md` existant (gabarit `lisbonne.jpg`) | exact |
| `app/src/modules/parametres/components/offline-panel.tsx` (libellé D-11) | component | request-response | lui-même (l.12-24, 41-44, 79-82) | exact |
| `app/src/modules/parametres/components/offline-panel.test.tsx` (deux familles D-13) | test | — | lui-même (pattern `vi.stubEnv` + `vi.resetModules`) | exact |
| `app/src/components/shared/app-tile.tsx` (remplacer `hyphens-auto`, D-14) | component | — | lui-même (l.60-66) | exact |
| `app/src/components/shared/mobile-drawer.tsx` + mécanisme partagé forceMount (D-15/D-16) | component | event-driven | `app/src/components/ui/dialog.tsx` (wrap Radix Portal/Content) + lui-même | role-match |
| `app/src/styles/app.css` (animation de sortie, D-15) | config/style | — | lui-même, bloc `.feuille-mobile` (l.262-311) | exact |
| `app/e2e/` nouveau spec feuille mobile 390 px (D-17) | test (e2e) | request-response | `app/e2e/recettes-cuisine-mobile.spec.ts` (viewport 390, `openDemoSession`, assertion boîtes) | exact |

## Pattern Assignments

### `supabase/tests/0004_cron.sql` — extension (test SQL, batch)

**Analog :** le fichier lui-même (sections 1-2 déjà lues) + `0011_cron.sql:364-385` (gabarit `cron.schedule_in_database`).

**Pattern d'assertion testkit** (0004:43-71) :
```sql
do $$
declare
  alice uuid := testkit.auth_user('alice@example.fr', 'Alice Martin');
  home_a text := testkit.household(alice, 'Foyer A');
  alice_m text := testkit.member(home_a, alice, 'Alice Martin', 'admin', 'accent');
  -- Une seule notion d'« aujourd'hui » : Europe/Paris, jamais current_date
  -- (fuseau de SESSION, UTC dans ce conteneur — 0004:50-55).
  v_today date := (now() at time zone 'Europe/Paris')::date;
begin
  insert into public.routines (id, household_id, name, recurrence_rule, created_by, created_at)
  values (daily, home_a, 'Sortie canine', 'FREQ=DAILY', alice_m, now() - interval '30 days');
  perform testkit.eq(private.generate_routine_occurrences(current_date - 14, current_date) >= 15, true,
    'les occurrences des 14 derniers jours sont générées');
  perform testkit.eq(private.generate_routine_occurrences(current_date - 14, current_date), 0,
    'la génération est idempotente');
end $$;
```

**Règles héritées (AGENTS.md §2.7-D) :** assertion bornée par foyer (`household_id = home_a`, jamais count total en `postgres`) ; `testkit.eq` avec les deux arguments du même type (`0::bigint`) ; pas de tautologie ; la date unique Europe/Paris. **Rouge avant vert (D-03)** : l'assertion « l'occurrence du jour existe pour un RRULE quotidien après `run_daily_routine_maintenance()` » doit être écrite pour échouer si la fonction ne la génère pas — la prouver en la commentant/retirant l'appel, pas en la mutant pour passer.

### `app/src/lib/data/seed.ts` — semis photo (model, CRUD)

**Analog :** les gabarits photo du même fichier.

**Gabarit cadeaux/cercle/adresses** (seed.ts:720, 735, 750) :
```typescript
photo_url: '/assets/cadeaux.jpg',   // chemin public du bundle, jamais d'URL distante ni de chemin de bucket
```
**Gabarit voyages** (seed.ts:1206) — le nom de colonne recette :
```typescript
cover_photo: '/assets/lisbonne.jpg',
```
**Cible (DET-03) :** `demoRecipes` (seed.ts:568-570) reçoit `cover_photo: '/assets/recettes/<slug>.jpg'`. La colonne est `cover_photo` (pas `photo_url`) — vérifié dans `RecipePayload` (recettes/api.ts:109).

### `app/public/assets/ATTRIBUTION.md` — crédits (config, file-I/O)

**Analog :** le fichier lui-même :
```markdown
- `lisbonne.jpg` — “Tramway place Cathédrale Lisbonne 6”, Chabe01, Wikimedia Commons, CC BY 4.0. Recadrage et réduction de résolution pour l’interface. Source : https://commons.wikimedia.org/wiki/File:Tramway_place_Cath%C3%A9drale_Lisbonne_6.jpg
```
Une ligne par photo : nom de fichier, titre, auteur, licence, mention de recadrage/réduction, URL source. Dossier nouveau : `app/public/assets/recettes/` (12 jpg ≈ 100-200 Ko, D-08 — cf. finding critique sur le compte).

### `offline-panel.tsx` — libellé « Version de développement » (component, request-response)

**Analog :** le fichier lui-même. Code actuel à modifier (l.12-24, 41-44) :
```tsx
// `unknown` signale « construit hors pipeline estampillé » (D-02) : sans
// injection de SHA, afficher `0.1.0` — le semver du `package.json` — serait
// une version fausse avec assurance [...]. `||` et non `??` : un
// `--build-arg GIT_SHA=` transmet une chaîne VIDE [...].
const appVersion = (import.meta.env.VITE_APP_VERSION as string | undefined) || 'unknown';
const appVersionShort = appVersion.slice(0, 8);
// ...
<span className="text-muted">Version</span>
<strong title={appVersion}>{appVersionShort}</strong>
```
**Deux points d'affichage** : ligne « Version » (l.41-44) ET pied « Application web » (l.79-82) — corriger les deux, pas un seul. **Contrainte D-11** : sans estampille (`unknown`) → afficher « Version de développement » avec explication au survol ; estampillé → SHA court inchangé. D-12 : ne toucher AUCUN canal machine (`app/Dockerfile:25` `ENV VITE_APP_VERSION=${GIT_SHA:-unknown}` reste tel quel).

### `offline-panel.test.tsx` — test en deux familles (test)

**Analog :** le fichier lui-même. Pattern de stub env indispensable (l.24-42) — la constante est calculée au chargement du module :
```tsx
async function rendreAvecVersion(valeur: string) {
  vi.stubEnv('VITE_APP_VERSION', valeur);
  vi.resetModules();
  const module = await import('./offline-panel');
  const rendu = await import('@/test/render');
  rendu.renderWithProviders(<module.OfflinePanel />);
}
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
```
**Famille 1 (existe, l.45-50) :** `renderWithProviders(<OfflinePanel/>)` sans stub → aujourd'hui attend `unknown`. **D-13 change l'attente** : expect `'Version de développement'`, jamais `unknown` à l'écran, jamais `0.1.0`. **Famille 2 (existe, l.52-59) :** SHA 40 → 8 premiers caractères + `title` complet, inchangé. Rouge avant vert : écrire l'attente du libellé AVANT de modifier le composant.

### `app-tile.tsx` — wrap sans césure (component)

**Analog :** le fichier lui-même, code à remplacer (l.60-66) :
```tsx
{/* `hyphens-auto` : en trois colonnes (feuille « Plus », 390 px),
    « Anniversaires » ne tient pas sur une ligne — le nom passe sur
    deux avec sa césure française (`lang="fr"` posé sur <html>) au
    lieu d'être rogné par l'overflow de la tuile. */}
<strong className="relative z-1 text-[16px] font-bold leading-tight tracking-[-0.01em] text-fg hyphens-auto">
  {label}
</strong>
```
**D-14 :** remplacer `hyphens-auto` par `hyphens-none` + `text-wrap: balance` (ou équivalent Tailwind v4 `[text-wrap:balance]`), ajuster taille/interlignage si besoin. **Le commentaire nommant la raison doit être réécrit** (pas de linter ici : le code dit en français pourquoi). `text-wrap: balance` seul ne suffit pas (Pitfall 3) — `hyphens: none` est requis car la césure est héritée de `<html lang="fr">`. Preuve : e2e à 390 px (D-17), pas de check unitaire CSS.

### `mobile-drawer.tsx` + `dialog.tsx` — mécanisme partagé forceMount (component, event-driven)

**Analog n°1 — le tirailleur lui-même** (structure Radix à étendre, mobile-drawer.tsx:152-159) :
```tsx
<DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="feuille-mobile-overlay fixed inset-0 z-50 ..." />
    <DialogPrimitive.Content
      id={MOBILE_DRAWER_ID}
      className="feuille-mobile fixed right-0 bottom-0 left-0 z-50 ..."
    >
```
**Analog n°2 — le wrapper Dialog partagé** (`app/src/components/ui/dialog.tsx:10-42`) : c'est **là** que le mécanisme partagé de D-15 se greffe le plus naturellement (forwardRef sur `DialogContent`, `className` fusionné par `cn(...)`, `{...rest}` propagé). Forme à respecter :
```tsx
export const DialogContent = forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { hideClose?: boolean }
>(function DialogContent({ className, children, hideClose, ...rest }, ref) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Content ref={ref} className={cn('...', className)} {...rest}>
```
**D-15 (forceMount généralisé) — recette Radix :** `forceMount` sur `Portal` **ET** `Content` + masquage conditionnel fermé (`data-[state=closed]:hidden` ou classe maison équivalente) + animation de sortie déclenchée par `data-[state=closed]` avec `animation-fill-mode: forwards`. Sans masquage, la feuille force-montée reste visible fermée et clignote au premier paint (Pitfall 2). Grep `forceMount` dans `app/src` = 0 occurrence : création pure. **D-16 :** poser le mécanisme UNE fois (dans `dialog.tsx` et/ou un utilitaire partagé consommé par `mobile-drawer.tsx` et les sheets du même gabarit) — l'inventaire exact des « feuilles du même mécanisme » est la première tâche du plan (grep Dialog bas / `feuille`).

### `app/src/styles/app.css` — animation de sortie (config/style)

**Analog :** le bloc existant, entrée seule (app.css:262-311) :
```css
/* Feuille basse du menu mobile : monte du bas au montage (Radix démonte à
   la fermeture, le keyframe rejoue à chaque ouverture). transform+opacity
   uniquement ; reduced-motion garde la tombée d'opacité, sans mouvement. */
@keyframes monter-feuille { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes apparaitre { from { opacity: 0; } to { opacity: 1; } }
.feuille-mobile { animation: monter-feuille 340ms var(--ease-drawer) both; }
.feuuille-mobile-overlay { animation: apparaitre 200ms ease-out both; } /* (sic : feuille-mobile-overlay) */
.tuile-mobile { animation: lever-tuile 240ms var(--ease-out) both; }
@media (prefers-reduced-motion: reduce) {
  .feuille-mobile, .tuile-mobile { animation: apparaitre 150ms ease-out both; }
}
```
**Règles dures (§emil design, AGENTS.md) :** JAMAIS de valeur de courbe/durée inventée — réutiliser les tokens existants `--ease-drawer`, `--ease-out`, `--duration-quick` ; la sortie est le miroir de l'entrée (`translateY(0)` → `translateY(100%)`, même durée 340ms, `var(--ease-drawer)`), déclenchée par `data-[state=closed]`, `fill-mode: forwards` ; repli `prefers-reduced-motion` livré avec l'animation (opacity seule). `transform+opacity` uniquement.

### Nouveau spec e2e feuille mobile (test e2e, request-response)

**Analog :** `app/e2e/recettes-cuisine-mobile.spec.ts` — gabarit exact d'un spec viewport fixe + assertions de géométrie :
```typescript
import { expect, test, type Page } from '@playwright/test';

async function openDemoSession(page: Page) {
  await page.goto('/connexion');
  await page.getByRole('button', { name: 'Entrer dans la démonstration' }).click();
  await page.waitForURL('**/accueil');
  await expect(page.getByRole('heading', { level: 1, name: /Bonjour/ })).toBeVisible();
}

test.describe('Recettes — toggle cuisine inline à 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.beforeEach(async ({ page }) => { await openDemoSession(page); });
  // assertions de boîtes englobantes + zéro débordement horizontal :
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
```
**D-17 :** nouveau spec (ou extension) — session démo, viewport 390, ouvrir la feuille « Plus », assert « Anniversaires » rendu ENTIER (pas de `-` de césure ; comparaison de boîtes : largeur du texte ≤ largeur de la tuile), cycle ouverture/fermeture avec animation de sortie (état fermé → contenu toujours monté mais masqué). En-tête de spec commenté en français comme le gabarit (but, couverture, fichiers voisins non modifiés).

### `docs/BACKEND.md` §6.3 — mise à jour conditionnelle (doc)

**Analog :** le fichier lui-même. À ne modifier QUE si le diagnostic DET-01 (D-02/D-04) révèle un écart de rôle de l'Edge `generate-routine-occurrences`. Le contrat actuel à répéter : modes `['secret','user']`, `rpc('routine_maintenance')`, en-tête documentant « pas d'aller-retour HTTP pour le job » (supabase/functions/generate-routine-occurrences/index.ts:7-21, 198-201).

## Shared Patterns

### Chemin de preuve « vu rouge avant vert »
**Source :** AGENTS.md §2.7 + docs/TODO.md items 13/14/15 (commandes et commits d'origine)
**Apply to :** tous les DET. Chaque test s'écrit AVANT sa correction/extension, échoue, puis passe. Pour DET-02, rejouer les preuves d'origine (tests + constat d'usage hors ligne à froid) sans réécrire les fixes — un « déjà fait » non re-vérifié est un échec inexpliqué (§2.7-F).

### Corriger la classe, pas l'instance
**Source :** AGENTS.md §2.7-E
**Apply to :** DET-05 (mécanisme partagé forceMount dans dialog.tsx, pas feuille par feuille — D-15/D-16) ; DET-02 (tout résidu « zone qui ment hors ligne » découvert est traité — D-07).

### Chemin public du bundle pour le semis
**Source :** seed.ts:720/1206 + recipe-cover.test.ts:74
**Apply to :** DET-03. Jamais d'URL distante, jamais de chemin de bucket en mode démo ; `resolveRecipeCoverUrl` laisse déjà passer `/assets/` (regex api.ts:287, testé).

### Châîne de vérification avant commit
**Source :** AGENTS.md §2.7 (ordre : typecheck + tests + build → e2e → check-sql-statique + ses tests → test-db.sh si SQL → relire message de commit avant push)
**Apply to :** tout commit de la phase. test-db.sh est un passage obligatoire pour DET-01 (§2.7-A : `create function` n'exécute rien). Aucun linter — pas de directive ESLint.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| Mécanisme partagé forceMount (D-15) | utility/component | event-driven | Aucun forceMount n'existe dans `app/src` (grep = 0) et aucune animation de sortie n'existe dans app.css — création pure ; l'analogie la plus proche est le wrapper `dialog.tsx` (cite ci-dessus) et les tokens `--ease-drawer`/`--ease-out` |

## Metadata

**Analog search scope:** `app/src/components/`, `app/src/modules/{parametres,recettes}/`, `app/src/lib/data/`, `app/src/styles/`, `app/e2e/`, `supabase/tests/`, `app/public/assets/`
**Files scanned:** ~20 (lus intégralement : offline-panel.tsx, offline-panel.test.tsx, app-tile.tsx, mobile-drawer.tsx, dialog.tsx, ATTRIBUTION.md, recipe-cover.test.ts, app.css l.260-339, 0004_cron.sql l.1-80, recettes-cuisine-mobile.spec.ts l.1-60 ; greps : seed.ts, assets, e2e, tests recettes)
**Pattern extraction date:** 2026-10-30
**Tracked-source gate:** les 14 chemins analoges nommés vérifiés `git ls-files` — tous TRACKED.
