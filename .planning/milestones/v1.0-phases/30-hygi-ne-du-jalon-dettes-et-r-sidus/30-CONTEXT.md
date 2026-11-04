# Phase 30: Hygiène du jalon — dettes et résidus - Context

**Gathered:** 2026-10-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Cinq dettes connues sont fermées et **prouvées** avant la porte d'ouverture publique (phase 31) :

1. **DET-01** — les occurrences de routine s'alimentent chaque matin (le chemin de vérité est le job SQL `eo-routine-maintenance`, pas l'Edge), avec preuve test SQL + mesure en prod + constat d'usage.
2. **DET-02** — les trois todos hors-ligne (todos 13/14/15 de `docs/TODO.md`, déjà corrigés) sont **re-joués** et clôturés par une vérification fraîche, pas par un « déjà fait » non re-vérifié.
3. **DET-03** — les semis démo embarquent une photo pour **chacune** des recettes, en assets locaux du bundle.
4. **DET-04** — le panneau de version affiche « Version de développement » au lieu du `unknown` brut quand l'estampille manque.
5. **DET-05** — les feuilles mobiles rendent « Anniversaires » sans césure et avec animations de sortie cohérentes (arbitrage forceMount tranché : généralisé), e2e au vert.

**Hors périmètre :** toute nouvelle capacité (la phase ferme des dettes, elle n'en ouvre pas) ; les trois autres canaux d'estampille machine (X-App-Version, /version.json, LABEL) qui gardent leur contrat `unknown` de la phase 24 ; le pipeline de signature des couvertures recettes (déjà couvert par T-16-07 et les tests recettes).

</domain>

<decisions>
## Implementation Decisions

### DET-01 — Occurrences de routine
- **D-01:** Le chemin de vérité reste le **job SQL direct** `eo-routine-maintenance` (0011_cron.sql, 06:05, fuseau Europe/Paris) qui appelle `private.run_daily_routine_maintenance()`. L'Edge `generate-routine-occurrences` **n'est pas branchée au pg_cron** : elle conserve son rôle de déclenchement manuel admin + supervision. La lettre du roadmap (« Edge branchée au pg_cron ») est arbitrée au profit du design existant : pas d'aller-retour HTTP sur un chemin SQL qui marche. — **Reversibility:** reversible.
- **D-02:** Le chercheur commence par un **diagnostic** : pourquoi « les routines ne s'alimentent pas au quotidien » alors que le job existe (job absent en prod ? RRULE ? vue du jour qui ne lit pas les occurrences ?). La cause racine trouvée est corrigée dans la phase.
- **D-03:** Preuve du critère 1 = **test SQL (rouge avant vert)** : la fonction génère l'occurrence du jour pour un RRULE quotidien — **plus mesure en prod** : `cron.job_run_details` du matin + occurrence visible dans la vue du jour (même philosophie que la mesure `X-App-Version` de la phase 24).
- **D-04:** Le constat d'usage est **inclus** : une routine de test du foyer de démo alimentée matin après matin. Heure 06:05 confirmée ; doc de l'Edge (`docs/BACKEND.md` §6.3) mise à jour si le diagnostic révèle un écart de rôle.

### DET-02 — Trois todos hors-ligne
- **D-05:** Le « faux état hors-ligne « 15 » » = le badge « À faire » du shell, déjà corrigé (todo 14). Aucun autre résidu « 15 » à ouvrir.
- **D-06:** La phase **re-joue les trois preuves** (tests en rouge avant vert + constat d'usage hors ligne à froid : Courses en erreur d'origine, badge juste, bandeau) et clôt DET-02 — un succès muet est un échec inexpliqué (§2.7-F). Les fixes existants ne sont pas réécrits.
- **D-07:** Tout résidu de la même famille découvert au rejouement (une zone qui ment hors ligne) est **traité dans la phase** — corriger la classe, pas l'instance (§2.7-E).

### DET-03 — Photos des recettes du semis
- **D-08:** Photos **locales**, dossier dédié `app/public/assets/recettes/` — 12 jpg ≈ 100-200 Ko chacun, libres de droits, créditées dans `app/public/assets/ATTRIBUTION.md`. Pas d'URLs distantes. — **Reversibility:** reversible.
- **D-09:** **Toutes** les recettes du semis reçoivent une photo — aucune tuile nue dans la démo (le critère 3 l'exige).
- **D-10:** La référence dans `cover_photo` est un **chemin public du bundle** (`/assets/recettes/xxx.jpg`), gabarit cadeaux/cercle/adresses du semis. **Tension relevée et arbitrée :** les recettes lisent leur couverture via `resolveRecipeCoverUrl` (bucket privé + URL signée TTL court, T-16-07) — la signature est impossible en mode démo local. `resolveRecipeCoverUrl` laisse donc passer les chemins publics au lieu de les signer. La démo ne prouve pas le chemin de signature, qui reste couvert par les tests recettes existants. — **Reversibility:** reversible.

### DET-04 — Panneau de version sans estampille
- **D-11:** La ligne « Version » du panneau affiche **« Version de développement »** (avec explication au survol) quand l'estampille manque — plus de `unknown` brut à l'écran d'une app familiale en français. Justification reprise du commentaire D-02 du code : un build local diffère de l'image servie, `0.1.0` serait une version fausse avec assurance.
- **D-12:** Les trois autres canaux de la phase 24 (`X-App-Version`, `/version.json`, `LABEL` image) **gardent `unknown`** sans SHA — leur contrat machine est inchangé (consommés par des scripts et diagnostics).
- **D-13:** Preuve = test sur `offline-panel` en **deux familles** (estampillé → SHA court ; sans → libellé), vu rouge avant vert.

### DET-05 — Feuilles mobiles
- **D-14:** Césure corrigée par **wrap sans césure** : `hyphens: none` + `text-wrap: balance` (ou équivalent) et ajustement taille/interlignage — « Anniversaires » rendu entier sur deux lignes, zéro débordement à 390 px en trois colonnes. Le `hyphens-auto` actuel de `app-tile.tsx` (posé pour éviter le rognage) est remplacé.
- **D-15:** Arbitrage forceMount **tranché : généralisé**. Le contenu des feuilles reste monté pendant l'animation de sortie (forceMount Radix ou équivalent maison), posé **une fois dans un mécanisme partagé** — pas feuille par feuille. — **Reversibility:** reversible.
- **D-16:** Périmètre = **toutes les feuilles du même mécanisme** (feuille « Plus » du shell + sheets métier du même gabarit) — corriger la classe, pas l'instance (§2.7-E).
- **D-17:** Preuve = **e2e Playwright au vert** : feuille « Plus » à 390 px sans césure (« Anniversaires » rendu entier) + ouverture/fermeture avec animation de sortie cohérente.

### the agent's Discretion
- Cause racine exacte de DET-01 (diagnostic d'abord, correction ensuite — D-02).
- Détails CSS du wrap sans césure (taille, balance, interlignage) — tranchés avec rendu visuel à 390 px.
- Forme du mécanisme partagé de forceMount (extension du composant existant vs utilitaire) — au planner, sur les tokens d'animation existants du projet (jamais de valeur de courbe inventée, §emil design).
- Choix précis des 12 photos de recettes (sujets cohérents avec les titres du semis : tartiflette, etc.).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Exigences verrouillées
- `.planning/REQUIREMENTS.md` § Dettes et résidus — DET-01…DET-05 (table de traçabilité)
- `.planning/ROADMAP.md` § Phase 30 — objectif, dépendance 29 (orthogonale), critères de succès 1-5, UI hint: yes
- `.planning/research/SUMMARY.md` — recherche jalon v1.0

### Code de référence direct (fondations de la phase)
- `supabase/migrations/0011_cron.sql` — job `eo-routine-maintenance` (06:05), `private.run_daily_routine_maintenance()`, `private.generate_routine_occurrences(date, date)` ; gabarit d'installation des jobs `cron.schedule_in_database`
- `supabase/functions/generate-routine-occurrences/index.ts` — Edge de déclenchement manuel + supervision (modes `['secret','user']`) ; son commentaire d'en-tête documente le choix « pas d'aller-retour HTTP pour le job »
- `docs/BACKEND.md` §6.3 — contrat de l'Edge (à mettre à jour si le diagnostic révèle un écart)
- `app/src/main.tsx:25` + `app/src/lib/online-status.ts` — amorçage réseau `seedOnlineStatus()` déjà branché (DET-02 : re-jouer, ne pas réécrire)
- `app/src/lib/query-policy.ts` — politique réseau unique `networkMode: 'always'` (todo 15, corrigé 2026-10-19)
- `docs/TODO.md` todos 13/14/15 — les trois dettes hors-ligne, chacune avec sa preuve d'origine (commits `f3ee6fc`, `e07c6fd`, `1a180a3`…) à re-jouer
- `app/src/lib/data/seed.ts` — semis démo ; gabarits photo : `'/assets/cadeaux.jpg'` (l.720), `'/assets/cercle.jpg'` (l.735), `'/assets/adresses.jpg'` (l.750) ; recettes `photo_url: null` (l.267, 280)
- `app/src/modules/recettes/api.ts` — `resolveRecipeCoverUrl` : signature bucket privé TTL court (T-16-07) ; point à étendre pour laisser passer les chemins publics (D-10)
- `app/public/assets/ATTRIBUTION.md` — crédits des assets, à étendre aux 12 photos de recettes
- `app/src/modules/parametres/components/offline-panel.tsx` — ligne « Version », `unknown` brut (l.19) et son commentaire D-02/D-03 de la phase 24
- `app/src/components/shared/app-tile.tsx` — `hyphens-auto` (l.64) et son commentaire : la césure française était un fix d'overflow à remplacer proprement (D-14)
- `app/src/app/app-shell.tsx` — feuille « Plus » (trois colonnes à 390 px) et badge « À faire »

### Disciplines héritées
- `AGENTS.md` §2.7 — chaîne de vérification avant commit ; « vu rouge avant vert » ; assertions bornées par foyer ; corriger la classe, pas l'instance ; un succès muet est un échec inexpliqué
- `.planning/phases/24-*/` — findings de la phase 24 (estampille de build, quatre canaux, contrat `unknown`) que DET-04 complète sans les modifier
- `.planning/phases/29-messagerie-v2/29-CONTEXT.md` — dernier contexte de phase, gabarit de preuves (test + mesure, pas de supposition)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `private.generate_routine_occurrences(date, date)` (0011) : la génération SQL existe déjà — DET-01 est un travail de diagnostic + preuve, pas de création
- `seedOnlineStatus()` + `query-policy.ts` : les fixes hors-ligne existent — DET-02 est un re-jouement de preuves
- Gabarits photo du semis (`/assets/*.jpg` + ATTRIBUTION.md) : gabarit direct pour les 12 photos de recettes
- Composants Dialog/Sheet existants (`dialog.tsx`, `product-sheet.tsx`) : le mécanisme partagé de forceMount s'y greffe
- `scripts/check-version-stamp.sh` : preuve en « deux familles » à imiter pour le test offline-panel

### Established Patterns
- Preuves « vu rouge avant vert » + mesure en prod (phases 24, 28, 29) — chaque DET a sa preuve nommée dans les décisions
- Photos de semis = chemins publics du bundle, jamais d'URLs distantes ni de chemins de bucket en mode démo
- Corriger la classe, pas l'instance (§2.7-E) — appliqué aux feuilles (D-16) et aux résidus hors-ligne (D-07)

### Integration Points
- `cron.job_run_details` en prod pour la mesure du job du matin (DET-01)
- `resolveRecipeCoverUrl` pour le pass-through des chemins publics (DET-03)
- `app-tile.tsx` + `app-shell.tsx` pour la césure et le forceMount (DET-05)

</code_context>

<specifics>
## Specific Ideas

- « Version de développement » : libellé exact choisi pour dire la vérité sans jargon d'estampille ni mot anglais technique.
- Le constat d'usage quotidien (routine de démo alimentée matin après matin) fait partie de la preuve DET-01, pas d'une vérification séparée.
- Toutes les recettes illustrées : « jamais de tuile nue dans la démo ».

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 30-Hygiène du jalon — dettes et résidus*
*Context gathered: 2026-10-30*
