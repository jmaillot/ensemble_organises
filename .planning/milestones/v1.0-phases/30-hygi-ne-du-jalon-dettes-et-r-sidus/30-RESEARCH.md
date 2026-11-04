# Phase 30: Hygiène du jalon — dettes et résidus - Research

**Researched:** 2026-10-30
**Domain:** Hygiène multi-domaines : pg_cron/SQL (DET-01), rejouement de preuves hors-ligne (DET-02), semis démo + assets (DET-03), panneau de version (DET-04), CSS/Radix feuilles mobiles (DET-05)
**Confidence:** HIGH (tout est vérifié dans le dépôt cette session ; le seul domaine non tranché est la cause racine de DET-01, explicitement laissée au diagnostic par D-02)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 (DET-01):** Le chemin de vérité reste le **job SQL direct** `eo-routine-maintenance` (0011_cron.sql, 06:05, Europe/Paris) qui appelle `private.run_daily_routine_maintenance()`. L'Edge `generate-routine-occurrences` **n'est pas branchée au pg_cron** : déclenchement manuel admin + supervision uniquement.
- **D-02 (DET-01):** **Diagnostic d'abord** : pourquoi « les routines ne s'alimentent pas au quotidien » alors que le job existe. La cause racine trouvée est corrigée dans la phase.
- **D-03 (DET-01):** Preuve = **test SQL rouge avant vert** (occurrence du jour générée pour un RRULE quotidien) **+ mesure en prod** (`cron.job_run_details` du matin + occurrence visible dans la vue du jour).
- **D-04 (DET-01):** Constat d'usage inclus (routine de démo alimentée matin après matin, heure 06:05 confirmée) ; `docs/BACKEND.md` §6.3 mise à jour si le diagnostic révèle un écart de rôle.
- **D-05 (DET-02):** Le « faux état hors-ligne « 15 » » = le badge « À faire » du shell (todo 14), déjà corrigé. Aucun autre résidu « 15 » à ouvrir.
- **D-06 (DET-02):** **Re-jouer les trois preuves** (tests rouge avant vert + constat d'usage hors ligne à froid) et clôturer — ne pas réécrire les fixes existants.
- **D-07 (DET-02):** Tout résidu de la même famille découvert au rejouement est **traité dans la phase** (§2.7-E).
- **D-08 (DET-03):** Photos **locales** dans `app/public/assets/recettes/` — 12 jpg ≈ 100-200 Ko, libres de droits, créditées dans `app/public/assets/ATTRIBUTION.md`. Pas d'URLs distantes.
- **D-09 (DET-03):** **Toutes** les recettes du semis reçoivent une photo — aucune tuile nue.
- **D-10 (DET-03):** `cover_photo` = **chemin public du bundle** (`/assets/recettes/xxx.jpg`). `resolveRecipeCoverUrl` laisse passer les chemins publics au lieu de les signer (voir finding majeur : c'est **déjà le cas**, § DET-03 ci-dessous).
- **D-11 (DET-04):** La ligne « Version » affiche **« Version de développement »** (explication au survol) quand l'estampille manque — jamais `unknown` brut, jamais `0.1.0`.
- **D-12 (DET-04):** Les trois autres canaux de la phase 24 (`X-App-Version`, `/version.json`, `LABEL`) **gardent `unknown`** sans SHA — contrat machine inchangé.
- **D-13 (DET-04):** Preuve = test `offline-panel` en **deux familles** (estampillé → SHA court ; sans → libellé), rouge avant vert.
- **D-14 (DET-05):** Césure corrigée par **wrap sans césure** : `hyphens: none` + `text-wrap: balance` (ou équivalent), taille/interlignage ajustés ; le `hyphens-auto` actuel d'`app-tile.tsx` est **remplacé**.
- **D-15 (DET-05):** Arbitrage forceMount **tranché : généralisé** — le contenu des feuilles reste monté pendant l'animation de sortie, posé **une fois dans un mécanisme partagé**.
- **D-16 (DET-05):** Périmètre = **toutes les feuilles du même mécanisme** (feuille « Plus » + sheets métier du même gabarit).
- **D-17 (DET-05):** Preuve = **e2e Playwright au vert** : feuille « Plus » à 390 px sans césure + ouverture/fermeture avec animation de sortie cohérente.

### the agent's Discretion
- Cause racine exacte de DET-01 (diagnostic d'abord — D-02).
- Détails CSS du wrap sans césure (taille, balance, interlignage) — tranchés avec rendu visuel à 390 px.
- Forme du mécanisme partagé de forceMount (extension du composant existant vs utilitaire) — sur les tokens d'animation existants du projet (jamais de valeur de courbe inventée).
- Choix précis des 12 photos de recettes (sujets cohérents avec les titres du semis).

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.

**Hors périmètre (domaine) :** toute nouvelle capacité ; les trois canaux d'estampille machine (X-App-Version, /version.json, LABEL — contrat `unknown` inchangé) ; le pipeline de signature des couvertures recettes (T-16-07 + tests recettes).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DET-01 | Routines alimentent les occurrences (Edge branchée au pg_cron) | D-01 arbitre : chemin de vérité = job SQL `eo-routine-maintenance` (vérifié 0011:364-366). Diagnostic D-02 : faits vérifiés + hypothèses § DET-01. Test SQL existant `supabase/tests/0004_cron.sql` à étendre. |
| DET-02 | 3 todos hors-ligne clôturés | Fixes vérifiés en place (`seedOnlineStatus`, `networkMode: 'always'`) ; phase = rejouement de preuves, pas de code nouveau (§ DET-02). |
| DET-03 | Semis démo avec photos de recette | Gabarit vérifié (`/assets/*.jpg` + ATTRIBUTION.md) ; `resolveRecipeCoverUrl` laisse **déjà** passer `/assets/` (§ DET-03 — finding majeur). |
| DET-04 | Panneau de version crédible sans estampille | Code vérifié (`offline-panel.tsx:12-24`, Dockerfile:25) ; pattern « deux familles » = `check-version-stamp.sh` (§ DET-04). |
| DET-05 | Césure « Anniver-saires » + animations de sortie | Code vérifié (`app-tile.tsx:64`, `mobile-drawer.tsx`, `app.css:294-309`) ; **pas d'animation de sortie aujourd'hui** (§ DET-05 — finding majeur). |
</phase_requirements>

## Summary

Cette phase ferme cinq dettes prouvées, chacune sur du code **existant** : DET-01 est un diagnostic + preuve (la génération SQL existe et est testée), DET-02 un rejouement de preuves (les fixes sont en place), DET-03 un enrichissement de semis selon un gabarit déjà utilisé sept fois, DET-04 un libellé de repli dans un composant testé, DET-05 une correction CSS + un mécanisme d'animation de sortie à créer. Deux findings majeurs changent la lecture naïve du périmètre :

1. **DET-03 : `resolveRecipeCoverUrl` laisse DÉJÀ passer les chemins `/assets/`.** Le commentaire du code et le D-10 disent « point à étendre », mais la regex de la ligne 287 (`/^blob:|^https?:|^data:|^\/assets\//i`) rend les chemins publics tels quels **depuis T-16-07**. Le travail réel est donc : semer `cover_photo` + un **test de contrat** qui verrouille le pass-through public (le commentaire dit « les formes non-chemin… actif `/assets` rendent telles quelles » — mais je n'ai pas trouvé de test dédié à cette branche pour la couverture recette ; à confirmer au planning, et si absent : le créer rouge avant vert).
2. **DET-05 : il n'existe AUCUNE animation de sortie aujourd'hui.** `.feuille-mobile` n'a qu'une animation d'entrée (`monter-feuille 340ms`, `app.css:294`) ; Radix démonte la feuille immédiatement à la fermeture, et aucun `forceMount` n'existe dans `app/src` (grep = 0 occurrence). « Animations de sortie cohérentes » est donc **une création**, pas une régression à réparer : Radix exige `forceMount` sur Portal **ET** Content, plus un masquage conditionnel (`data-[state=closed]:hidden` ou équivalent) pour que la feuille force-montée reste invisible quand elle est fermée, et l'animation de sortie se déclenche via `data-[state=closed]` + `animation-fill-mode: forwards`.

**Primary recommendation:** Traiter DET-01 d'abord (diagnostic → correction → test rouge avant vert → mesure prod), car c'est le seul DET à cause racine inconnue ; puis DET-05 (le seul à créer du mécanisme partagé), puis DET-02/03/04 qui sont des preuves + enrichissements sur code vérifié.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Occurrences de routine (DET-01) | Database/Storage (pg_cron + SQL) | API/Backend (Edge, supervision seule) | D-01 : le job SQL est le chemin de vérité ; l'Edge reste déclenchement manuel/supervision |
| État hors-ligne (DET-02) | Browser/Client (TanStack Query, `navigator.onLine`) | — | Politique réseau unique côté client ; rien côté serveur |
| Photos semis démo (DET-03) | CDN/Static (assets bundle) | Browser/Client (semis Dexie) | Chemins publics servis par Nginx ; le seed reste un adaptateur client |
| Panneau version (DET-04) | Frontend (composant React) | Build (Vite `VITE_APP_VERSION`) | Libellé de repli au rendu ; les canaux machine (Docker) restent inchangés |
| Feuilles mobiles (DET-05) | Browser/Client (Radix Dialog + CSS) | — | Animation + montée/démontage côté client pur |

## Standard Stack

**Aucun nouveau package.** La phase n'installe rien : tout est sur la stack existante (pg_cron, TanStack Query, Radix `@radix-ui/react-dialog`, Vitest + RTL, Playwright, Tailwind v4). Ne pas ajouter de dépendance d'animation (les tokens `--ease-drawer`/`--ease-out`/`--duration-quick` existent dans `app/src/styles/app.css`).

### Assets (DET-03)
| Besoin | Choix | Note |
|--------|-------|------|
| 12 photos libres de droits | Wikimedia Commons (gabarit `lisbonne.jpg` : crédit CC BY 4.0 dans ATTRIBUTION.md) ou domaines publics (Unsplash/Pexels) | ~100-200 Ko chacun, jpg ; créditer chaque source dans `app/public/assets/ATTRIBUTION.md` |

## Package Legitimacy Audit

> Aucun package externe installé par cette phase — audit non requis (verdict : N/A, aucun `npm install`).

## Architecture Patterns

### System Architecture Diagram

```
DET-01 — Chemin de vérité des occurrences
  pg_cron (06:05, job `eo-routine-maintenance` installé par 0011, jsonb depuis 0013)
      └─▶ private.run_daily_routine_maintenance()
            ├─▶ private.generate_routine_occurrences(today-14, today)  ─ INSERT routine_completions ('en_retard')
            └─▶ private.evaluate_routine_occurrences()                 ─ UPDATE '>7j' → 'manque'
  Edge `generate-routine-occurrences` (['secret','user']) ──▶ rpc routine_maintenance (0013) ──▶ mêmes fonctions
      (déclenchement manuel admin + supervision — PAS branchée au cron, D-01)
  Preuves : test SQL (0004_cron.sql à étendre) + cron.job_run_details (prod) + vue du jour

DET-03 — Couverture recette du semis
  seed.ts (demoRecipes, cover_photo) ── '/assets/recettes/xxx.jpg' ──▶ resolveRecipeCoverUrl
      └─ non-bucket → rendu tel quel (regex /\/assets\//, déjà en place)
  (chemin bucket privé → URL signée TTL 3600 — inchangé, hors périmètre démo)

DET-05 — Feuille mobile
  MobileBottomNav « Plus » ──▶ MobileDrawer (Radix Dialog, classe feuille-mobile)
      ├─ entrée : monter-feuille 340ms (existe)
      └─ sortie : À CRÉER (forceMount Portal+Content + data-[state=closed] + masquage)
  AppTile (hyphens-auto → wrap sans césure)
```

### Recommended Project Structure
Aucune nouvelle structure — modifications dans les fichiers existants ; seul `app/public/assets/recettes/` est un dossier nouveau.

### DET-01 — Diagnostic guidé (D-02)

Faits vérifiés cette session :

- Job installé par 0011 : `array['eo-routine-maintenance', '5 6 * * *', 'select private.run_daily_routine_maintenance()']` `[VERIFIED: supabase/migrations/0011_cron.sql:364-366]`. Installation idempotente (unschedule + `cron.schedule_in_database(..., current_database())`, 0011:375-385).
- La fenêtre de génération est `v_today - 14` à `v_today`, statut initial `'en_retard'` `[VERIFIED: supabase/migrations/0011_cron.sql:278, 222]`.
- Depuis 0013, `run_daily_routine_maintenance()` retourne `jsonb` (`occurrences_created`, `occurrences_late`, `occurrences_missed`, `generated_at`) et **ne réinstalle pas le job** — le job 0011 persiste `[VERIFIED: supabase/migrations/0013_server_rpc.sql:74-101]`.
- L'Edge appelle `rpc('routine_maintenance', …)` avec modes `['secret','user']`, et son en-tête documente déjà « pas d'aller-retour HTTP pour le job » `[VERIFIED: supabase/functions/generate-routine-occurrences/index.ts:7-21, 198-201]`.
- La **vue du jour ne lit PAS les occurrences matérialisées** : `todayOccurrences()` filtre `routine.isDueToday`, calculé côté client par le moteur RRULE (`types.ts:701-703`, alimenté par `buildRoutines`) `[VERIFIED: app/src/modules/routines/types.ts:700-703]`. Donc « la vue du jour ne montre rien » n'est pas forcément « le cron ne tourne pas » — séparer les deux symptômes au diagnostic.

Hypothèses de cause racine à départager (aucune tranchée cette session — c'est D-02) :
- **H1 — job absent ou en échec en prod** : `select * from cron.job; select * from cron.job_run_details order by start_time desc;` en prod (via `psql.sh < fichier`, §2.7-C) — première mesure, elle tranche H1 d'emblée.
- **H2 — fuseau du schedule** : pg_cron planifie dans le fuseau de la base (souvent UTC en conteneur) ; « 5 6 * * * » peut courir à 08:05 Paris, pas 06:05. Ne change pas le fait quotidien mais invalide « 06:05 confirmée » de D-04 si vrai.
- **H3 — migration 0153** (`routine_completions_dedup_morte.sql`, non lue cette session `[ASSUMED: contenu]`) : vérifier qu'elle n'a pas introduit de garde qui bloque l'insertion du jour.
- **H4 — usage réellement OK mais non prouvé** : le test SQL 0004 couvre déjà les RRULE et (à vérifier au planning) la génération ; la dette est peut-être surtout de **preuve et de mesure** (D-03/D-04) plus que de code.

### DET-02 — Rejouement des preuves

Fixes vérifiés en place (ne pas réécrire, D-06) :
- `seedOnlineStatus()` branchée depuis `navigator.onLine` au démarrage `[VERIFIED: app/src/lib/online-status.ts:36-41]`.
- Politique réseau unique `networkMode: 'always'` sur queries **et** mutations, `refetchOnReconnect` explicite `[VERIFIED: app/src/lib/query-policy.ts:34-49]`.
- Tests existants à rejouer : `app/src/lib/online-status.test.ts`, `app/src/lib/query-policy.test.ts` (test A ligne 85 : `networkMode` `'always'` + `refetchOnReconnect`) `[VERIFIED: noms de fichiers]`.
- Constats d'origine dans `docs/TODO.md` items 13 (l.252), 14 (l.323), 15 (l.446) — chacun avec ses commandes et commits de preuve d'origine à rejouer `[VERIFIED: docs/TODO.md:252,323,446]`.

Le constat d'usage hors ligne à froid (D-06) : `F12` → Réseau → Hors ligne → Courses doit afficher l'**erreur d'origine** (pas un état vide), le badge « À faire » doit compter juste, le bandeau doit paraître.

### DET-03 — Semis et gabarit photo

- Les recettes du semis sont `demoRecipes` (seed.ts:568) ; `cover_photo` à renseigner — gabarits existants : `photo_url: '/assets/cadeaux.jpg'` (l.720), `'/assets/cercle.jpg'` (l.735), `'/assets/adresses.jpg'` (l.750), `cover_photo: '/assets/lisbonne.jpg'` (l.1206) `[VERIFIED: app/src/lib/data/seed.ts:568,720,735,750,1206]`.
- **Pass-through public déjà en place** : `resolveRecipeCoverUrl` rend tel quel tout chemin matchant `/^blob:|^https?:|^data:|^\/assets\//i`, sinon URL signée `[VERIFIED: app/src/modules/recettes/api.ts:284-292]`. Idem pour les photos d'étape (`resolveRecipeStepPhotoUrl`, api.ts:334-342).
- Le nom de colonne est `cover_photo` dans le payload (`RecipePayload.cover_photo`, api.ts:109,123) — pas `photo_url` comme les autres tables du semis `[VERIFIED: app/src/modules/recettes/api.ts:103-110]`.
- Credits : `app/public/assets/ATTRIBUTION.md` existe avec le gabarit `lisbonne.jpg` (crédit CC BY 4.0 + mention « recadrage et réduction de résolution ») `[VERIFIED: app/public/assets/ATTRIBUTION.md]`.

### DET-04 — Panneau de version

- Code actuel : `const appVersion = (import.meta.env.VITE_APP_VERSION as string | undefined) || 'unknown';` puis `appVersionShort = appVersion.slice(0, 8)` (le `||` volontaire pour la chaîne vide, commentaire D-02) `[VERIFIED: app/src/modules/parametres/components/offline-panel.tsx:12-24]`. Deux points d'affichage : ligne « Version » (l.43) et pied « Application web » (l.80).
- `app/Dockerfile:25` : `ENV VITE_APP_VERSION=${GIT_SHA:-unknown}` `[VERIFIED: app/Dockerfile:25]`.
- Test existant `offline-panel.test.tsx` (même dossier) — l'étendre en deux familles (D-13). Pattern « deux familles » : `scripts/check-version-stamp.sh` (estampillé → SHA ; sans → `unknown`) `[VERIFIED: existence, docs/TODO.md:252-278]`.
- D-12 : les canaux machine (`X-App-Version`, `/version.json`, LABEL) ne changent pas — ne toucher que le composant React.

### DET-05 — Feuilles mobiles : faits précis

- Césure : `hyphens-auto` posé sur le `<strong>` de la tuile, avec commentaire expliquant que c'était un fix d'overflow « à remplacer proprement » `[VERIFIED: app/src/components/shared/app-tile.tsx:60-66]`. Le libellé « Anniversaires » vient de `moduleMap` (`short: 'Anniversaires'`, modules.ts:77) `[VERIFIED: app/src/lib/modules.ts:77]`.
- La feuille « Plus » = `MobileDrawer`, Radix Dialog, grille `grid-cols-3` de `AppTile` (mobile-drawer.tsx:205) `[VERIFIED: app/src/components/shared/mobile-drawer.tsx:153-158, 205]`.
- Animations existantes : `.feuille-mobile { animation: monter-feuille 340ms var(--ease-drawer) both; }`, overlay `apparaitre 200ms`, tuiles `lever-tuile 240ms`, avec repli `prefers-reduced-motion` (150ms) `[VERIFIED: app/src/styles/app.css:294-309]` — **entrée seule, aucune sortie**.
- `forceMount` : **0 occurrence dans app/src** (grep). Le mécanisme partagé de D-15 est une création.
- Forme Radix à respecter : `forceMount` se pose sur `<Portal forceMount>` **et** `<Content forceMount>` ; sans masquage la feuille resterait visible fermée — utiliser `data-[state=closed]:hidden` (ou l'équivalent maison) et déclencher la sortie par une animation `data-[state=closed]` avec `fill-mode: forwards`. Attention : un Radix Dialog force-monté rend le contenu au premier paint même fermé — le masquage conditionnel n'est pas décoratif. Sur les feuilles métier du même gabarit (D-16) : `product-sheet.tsx` (courses) et les pages qui ouvrent des feuilles via `dialog.tsx` sont les candidats à inventorier au planning — l'inventaire exact des « feuilles du même mécanisme » est à faire au plan (les seules avec la classe `feuille-mobile` aujourd'hui : mobile-drawer ; le D-16 vise les sheets Radix bas du même gabarit visuel).
- E2E : répertoire `app/e2e/` avec 10 specs Playwright existants (`npm run test:e2e`) `[VERIFIED: ls app/e2e, app/package.json:16]`. Nouveau spec ou extension : feuille à 390 px viewport, « Anniversaires » entier, cycle ouverture/fermeture.

### Anti-Patterns to Avoid
- **Réécrire les fixes DET-02** : ils existent et sont testés ; la phase rejoue les preuves (D-06).
- **Brancher l'Edge au cron** (aller-retour HTTP depuis pg_cron) : contredit D-01 et la philosophie du projet (RGDP-04 a déjà établi « jamais de purge HTTP fragile depuis cron »).
- **Inventer une valeur de courbe/durée d'animation** : réutiliser `--ease-drawer`, `--ease-out`, `--duration-quick` (§emil design, AGENTS.md).
- **Signer un chemin public** : le semis porte des chemins de bundle, jamais des chemins de bucket en démo (motif établi).
- **Modifier les trois canaux machine** de l'estampille (D-12).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Animation de sortie de feuille | Timer JS de fermeture différée | `forceMount` Radix + `data-[state=closed]` + CSS `animation-fill-mode: forwards` | Radix fournit déjà le signal d'état ; un timer serait en course avec l'unmount |
| Détection réseau | Poll ou heuristique de fetch | `onlineManager` + `navigator.onLine` (déjà câblé) | La source unique est posée (online-status.ts) |
| Expansion RRULE côté SQL | Nouveau moteur | `private.rrule_day_matches` (0011) + rrule.js côté client | Sous-ensemble documenté, testé par 0004_cron.sql |
| Photos démo | Génération ou fetch distant | 12 jpg locaux + ATTRIBUTION.md | D-08 verrouillé ; URLs distantes interdites |

## Runtime State Inventory

> Phase hygiène incluant une part « résidus » — inventaire fait, catégories :

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Occurrences `routine_completions` en prod : état réel inconnu (c'est précisément la question DET-01) ; si le job n'a jamais tourné, la fenêtre 14 jours ne rattrape que le passé récent — pas de migration de données prévue | Diagnostic prod (H1) ; correction avant |
| Live service config | Job pg_cron `eo-routine-maintenance` : défini en SQL versionné, mais l'instance prod peut différer (job jamais installé, ou écrasé) | Vérifier `cron.job`/`cron.job_run_details` en prod (D-03) |
| OS-registered state | None — pas d'OS-registered state, tout est conteneurisé | — |
| Secrets/env vars | `VITE_APP_VERSION` (build-arg) : aucun changement de nom ; les canaux machine gardent `unknown` (D-12) | none |
| Build artifacts | Aucun artifact à invalider ; les photos ajoutées sont servies par Nginx depuis `app/public/assets/recettes/` | rebuild frontend (build-app.sh) |

## Common Pitfalls

### Pitfall 1: Confondre « vue du jour vide » et « cron cassé » (DET-01)
**What goes wrong:** la vue du jour calcule `isDueToday` côté client (RRULE js) ; elle peut être pleine même sans occurrence matérialisée — ou le cron tourner sans effet visible dans la vue.
**Why:** deux sources de vérité indépendantes (client rrule.js / SQL pg_cron).
**How to avoid:** le diagnostic D-02 commence par `cron.job_run_details` en prod ; la preuve finale est double (test SQL + occurrence dans la vue).
**Warning signs:** test SQL vert mais prod muette (ou l'inverse).

### Pitfall 2: Radix forceMount sans masquage conditionnel (DET-05)
**What goes wrong:** le contenu force-monté reste visible après fermeture, ou la feuille « clignote » au premier paint.
**Why:** `forceMount` retire l'unmount automatique ; Radix ne cache plus rien tout seul.
**How to avoid:** `forceMount` sur Portal **et** Content + masquage `data-[state=closed]` + animation de sortie en `fill-mode: forwards`.
**Warning signs:** feuille visible en arrière-plan après Échap.

### Pitfall 3: `text-wrap: balance` seul ne suffit pas (DET-05)
**What goes wrong:** sans `hyphens: none`, le navigateur re-cèse (le `lang="fr"` actif rend la césure française naturelle) ; sans vérif à 390 px, « Anniversaires » peut déborder d'une tuile de grille 3 colonnes.
**Why:** `hyphens-auto` est hérité du `<html lang="fr">` ; la largeur de tuile à 390 px est étroite.
**How to avoid:** les deux propriétés ensemble (D-14) + rendu visuel Playwright à 390 px (D-17).
**Warning signs:** césure persistante sur l'e2e.

### Pitfall 4: « déjà fait » non re-vérifié (DET-02)
**What goes wrong:** clôturer DET-02 sur la foi des commits d'origine sans rejouer les preuves.
**Why:** §2.7-F : un succès muet est un échec inexpliqué.
**How to avoid:** rejouer chaque preuve à frais (tests + constat d'usage), consigner.
**Warning signs:** un todo 13/14/15 marqué clos sans sortie de preuve fraîche dans la phase.

### Pitfall 5: Un contrat SQL vérifié seulement « par la migration » (DET-01)
**What goes wrong:** annoncer le SQL bon parce que la migration s'applique.
**Why:** §2.7-A : `create function` enregistre sans exécuter.
**How to avoid:** test SQL réel (rouge avant vert) + `test-db.sh` sur machine Docker.
**Warning signs:** vert uniquement sur check-sql-statique.

## Code Examples

### Résolution de couverture — la branche publique à verrouiller par test
```typescript
// Source: app/src/modules/recettes/api.ts:284-292 (vérifié cette session)
export async function resolveRecipeCoverUrl(stored: string | null): Promise<string | null> {
  if (!stored) return null;
  if (!isHouseholdMediaPath(stored)) {
    return /^blob:|^https?:|^data:|^\/assets\//i.test(stored) ? stored : null;
  }
  return resolveHouseholdMediaUrl(stored, RECIPE_COVER_URL_TTL);
}
```

### Ligne « Version » à modifier (libellé de repli)
```tsx
// Source: app/src/modules/parametres/components/offline-panel.tsx:19-24, 41-44
const appVersion = (import.meta.env.VITE_APP_VERSION as string | undefined) || 'unknown';
const appVersionShort = appVersion.slice(0, 8);
// ...
<span className="text-muted">Version</span>
<strong title={appVersion}>{appVersionShort}</strong>
// D-11 : sans estampille → « Version de développement » (au lieu de 'unknown'),
// avec explication au survol ; estampillé → SHA court inchangé.
```

### Gabarit de semis photo (à imiter pour les recettes)
```typescript
// Source: app/src/lib/data/seed.ts:720, 1206 (gabarits vérifiés)
photo_url: '/assets/cadeaux.jpg',        // gabarit cadeaux
cover_photo: '/assets/lisbonne.jpg',     // gabarit voyages — le nom de colonne recette est cover_photo
// D-08/D-09 : demoRecipes.cover_photo → '/assets/recettes/<slug>.jpg' ×12
```

### État actuel des animations de feuille (entrée seule)
```css
/* Source: app/src/styles/app.css:294-309 (vérifié) */
.feuille-mobile { animation: monter-feuille 340ms var(--ease-drawer) both; }
.feuille-mobile-overlay { animation: apparaitre 200ms ease-out both; }
.tuile-mobile { animation: lever-tuile 240ms var(--ease-out) both; }
@media (prefers-reduced-motion: reduce) { .feuille-mobile, .tuile-mobile { animation: apparaitre 150ms ease-out both; } }
/* DET-05 : ajouter la sortie (data-[state=closed]) + forceMount Radix — aucune animation de sortie n'existe */
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Lecture offline depuis des caches Dexie | Lectures directes + erreurs d'origine (`networkMode: 'always'`) | 2026-10-12 (D-10) puis 2026-10-19 (todo 15) | DET-02 rejoue ces preuves |
| Version `unknown` brute à l'écran | Libellé « Version de développement » | cette phase (D-11) | Les canaux machine restent `unknown` |
| Feuille montée conditionnellement | forceMount généralisé + animation de sortie | cette phase (D-15) | Mécanisme partagé, pas feuille par feuille |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Le contenu de `0153_routine_completions_dedup_morte.sql` peut affecter la génération (non lu) | DET-01 H3 | Diagnostic partiel ; impact faible — le diagnostic prod tranche |
| A2 | pg_cron schedule en UTC (06:05 UTC = 08:05 Paris) possible | DET-01 H2 | « 06:05 confirmée » de D-04 serait à reformuler ; le fait quotidien reste vrai |
| A3 | Aucun test dédié verrouille le pass-through `/assets/` de `resolveRecipeCoverUrl` (non recherché exhaustivement) | DET-03 | Si un test existe déjà, la tâche devient rejouement — vérifiable au planning en 1 grep |
| A4 | « Sheets métier du même gabarit » ≈ `product-sheet.tsx` + feuilles Radix basses des pages (inventaire exact non fait) | DET-05 | Périmètre D-16 à préciser au plan ; un inventaire grep `feuille`/Dialog bas est la première tâche |
| A5 | 12 photos ≈ 12 recettes du semis (nombre exact de `demoRecipes` non compté cette session — le semis commence à `recipe-1`, Tartiflette, seed.ts:569) | DET-03 | Si ≠ 12, ajuster le nombre de photos au plan (D-09 prime : toutes les recettes) |

## Open Questions (RESOLVED)

Chaque question ci-dessous est dispositionnée par une tâche de plan — pointer croisé :

1. **Cause racine DET-01** (voulu — D-02) → **RÉSOLU par 30-01-PLAN.md Task 1** : le diagnostic prod (`cron.job`, `cron.job_run_details`, occurrence du jour via `psql.sh < fichier`) est la première tâche du plan ; tout le reste de DET-01 en découle.
2. **Fuseau réel du job en prod** (H2) → **RÉSOLU par 30-01-PLAN.md Task 1/Task 2** : le diagnostic prod mesure le fuseau ; si 06:05 UTC, Task 2 décide de re-scheduler en `Europe/Paris` (pg_cron ≥ 1.5 supporte un 6e paramètre timezone — `[ASSUMED]` à vérifier contre la version de pg_cron de l'image Supabase) ou de reformuler la documentation D-04.
3. **Inventaire des « feuilles du même mécanisme »** (D-16) → **RÉSOLU par 30-05-PLAN.md Task 1** : l'inventaire grep Dialog/feuilles bas est la première tâche du plan, préalable au périmètre forceMount.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | test-db.sh (DET-01 test SQL) | à vérifier sur la machine d'exécution | — | La chaîne sans Docker (typecheck/tests/build/e2e/check-sql-statique) suffit sauf validation SQL réelle — passage obligatoire avant de considérer le SQL validé (§2.7) |
| Playwright | e2e DET-05 | ✓ (10 specs existants, `npm run test:e2e`) | — | — |
| psql prod (psql.sh) | mesure DET-01 / diagnostic | opérateur | — | Consigner l'absence explicitement si indisponible (jamais un « pass » silencieux) |

**Missing dependencies with no fallback:** aucune identifiée (toutes les preuves locales passent par la chaîne §2.7 ; les mesures prod sont documentées comme attribuables, cf. OPS-02 leçon de la phase 28).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5 + RTL (app), tests SQL testkit (supabase/tests), Playwright (e2e) |
| Config file | `app/vitest.config.*` existant ; `supabase/tests/_setup.sql` ; `app/playwright.config.*` |
| Quick run command | `cd app && npm test` / `python3 scripts/check-sql-statique.py` |
| Full suite command | `cd app && npm run typecheck && npm test && npm run build && npm run test:e2e` + `sh scripts/test-db.sh` (Docker) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DET-01 | Génération de l'occurrence du jour (RRULE quotidien) | SQL (rouge avant vert) | `sh scripts/test-db.sh` — étendre `supabase/tests/0004_cron.sql` | ✅ (fichier existant à étendre) |
| DET-01 | Mesure prod job du matin | manual-only (mesure opérateur, consignée) | `psql.sh < requête cron.job_run_details` | ❌ preuve consignée |
| DET-02 | Amorçage réseau, badge, erreur d'origine hors ligne | unit (rejouement) | `cd app && npm test -- online-status query-policy` + suites 13/14/15 de docs/TODO.md | ✅ existants |
| DET-03 | Couverture recette du semis affichée (chemin public) | unit (contrat pass-through `/assets/`) | `cd app && npm test -- recettes` | ❌ Wave 0 (A3) |
| DET-04 | Deux familles de libellé version | unit | `cd app && npm test -- offline-panel` | ✅ (à étendre) |
| DET-05 | « Anniversaires » sans césure + sortie animée à 390 px | e2e | `cd app && npm run test:e2e -- <spec feuille>` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** quick run (typecheck + tests ciblés + check-sql-statique)
- **Per wave merge:** suite complète + test-db.sh si SQL touché
- **Phase gate:** e2e DET-05 vert + preuves prod DET-01 consignées avant `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Extension `supabase/tests/0004_cron.sql` — occurrence du jour générée (DET-01, D-03)
- [ ] Test contrat pass-through `/assets/` sur `resolveRecipeCoverUrl` (DET-03, A3)
- [ ] Extension `offline-panel.test.tsx` en deux familles (DET-04, D-13)
- [ ] Nouveau spec Playwright feuille mobile 390 px (DET-05, D-17)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | yes (DET-01) | RLS existante ; fonctions `private.*` déjà revokées à public/anon/authenticated (0011:389-395) — ne pas régrevener ; Edge modes `['secret','user']` inchangés |
| V5 Input Validation | no (aucune nouvelle entrée utilisateur) | — |
| V14 Config | yes (DET-04) | `unknown` machine inchangé (D-12) ; aucun secret en jeu |

### Known Threat Patterns for {stack}
Aucune nouvelle surface d'attaque : la phase n'ajoute ni endpoint ni écriture serveur. Point de vigilance unique : les 12 nouvelles photos sont des **assets statiques publics** — aucune donnée du foyer dedans (libres de droits, génériques), et ATTRIBUTION.md à jour.

## Project Constraints (from AGENTS.md)

- **§2.7 chaîne de vérification** dans l'ordre : typecheck + tests + build → e2e → check-sql-statique (+ ses propres tests) → test-db.sh (Docker, passage obligatoire pour tout SQL) → test-dispatch-push.sh le cas échéant.
- **Aucun linter** — la chaîne est la seule vérification ; directive ESLint proscrite (`no-eslint-directive.test.ts`).
- **Ne jamais réécrire une migration appliquée** — corriger vers l'avant (DET-01 : nouvelle migration si correction SQL nécessaire).
- **`set search_path = ''`** ⇒ tout nom de table qualifié (`public.routines`) ; assertions bornées par foyer ; `testkit.eq` types identiques ; pas de tautologie.
- **psql.sh : stdin seul** (`psql.sh < fichier`), jamais `-f`, jamais de secret en commande.
- **Corriger la classe, pas l'instance** (D-07, D-16) ; **vu rouge avant vert** ; un succès muet est un échec inexpliqué ; relire le message de commit avant push ; vérifier toute affirmation d'absence par grep (§2.7-I).

## Sources

### Primary (HIGH confidence)
- `supabase/migrations/0011_cron.sql` (lu intégralement) — job, fonctions, grants
- `supabase/functions/generate-routine-occurrences/index.ts` (lu intégralement) — contrat Edge
- `supabase/migrations/0013_server_rpc.sql` (extraits) — signature jsonb
- `app/src/modules/recettes/api.ts` (lu intégralement) — `resolveRecipeCoverUrl` et pass-through
- `app/src/modules/parametres/components/offline-panel.tsx` (lu intégralement)
- `app/src/components/shared/app-tile.tsx`, `app/src/components/shared/mobile-drawer.tsx` (lus intégralement)
- `app/src/styles/app.css` (extraits animations), `app/src/lib/online-status.ts`, `app/src/lib/query-policy.ts` (extraits)
- `app/src/lib/data/seed.ts` (grep + extraits), `app/src/lib/modules.ts:77`, `app/Dockerfile:25`
- `docs/TODO.md` items 13/14/15, `docs/BACKEND.md` §6.3 (référencé par CONTEXT), `supabase/tests/0004_cron.sql`
- `app/public/assets/ATTRIBUTION.md`

### Secondary (MEDIUM confidence)
- `.planning/phases/30-*/30-CONTEXT.md` (décisions verrouillées), `.planning/REQUIREMENTS.md` § Dettes et résidus

### Tertiary (LOW confidence)
- H2 (fuseau pg_cron) et le contenu de 0153 — hypothèses de diagnostic, § Assumptions Log

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — aucun nouveau package, tout vérifié dans le dépôt
- Architecture: HIGH — chemins de vérité vérifiés fichier par fichier ; seul le diagnostic DET-01 reste ouvert par décision D-02
- Pitfalls: HIGH — extraits de patterns d'échecs documentés du projet (§2.7) + comportements Radix `[ASSUMED]` (API forceMount stable, à vérifier au codage)

**Research date:** 2026-10-30
**Valid until:** 2026-11-29 (code stable ; re-vérifier les hypothèses A1-A5 au plan)
