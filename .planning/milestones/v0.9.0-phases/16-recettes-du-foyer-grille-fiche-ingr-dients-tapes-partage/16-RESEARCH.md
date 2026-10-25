# Phase 16 : Recettes du foyer — Research

**Researched:** 2026-10-14
**Domain:** Module Recettes (grille, fiche, ingrédients, étapes, partage invité)
**Confidence:** HIGH

## Summary

Le module Recettes part d'un schéma minimal (`public.recipes` : `id, household_id, title, created_at`) et d'un écran d'attente (`recettes-page.tsx` + `types.ts`) vers un module complet : 7 tables neuves (catégories, tags + liens, ingrédients, étapes, partages, favoris + colonnes sur `recipes`), 1 Edge Function `recipe-invite` copiée byte-motif de `trip-invite`, couverture via `depositHouseholdFile`, DnD étapes via dnd-kit déjà installé, recherche insensible aux accents côté client (pas d'extension `unaccent` sur la stack).

**Primary recommendation:** Étendre `recipes` vers l'avant (ALTER, jamais de recréation), copier le motif `trip-invite` (HMAC + `FOR UPDATE` + oracle unique + child-guard) pour `recipe-invite`, réutiliser `depositHouseholdFile`/`removeHouseholdFile` + `resolveTripCoverUrl` pour la couverture, et filtrer la recherche côté client avec `normalize('NFD')` comme `prestataires`/`off-client`.

## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Grille + fiche
- **D-01:** Carte = photo plein fond, nom en haut, tags en bas à droite, cœur favori en haut à droite. Esprit cartes voyages.
- **D-02:** Groupement par catégorie en sections empilées (Recettes du foyer d'abord), pas de filtre par onglets. Les filtres catégorie/tags vivent dans la barre de recherche (D-13), pas comme navigation.
- **D-03:** Fiche en défilement unique : header photo/nom/meta → curseur personnes → ingrédients → étapes → actions (partage/export/Courses).
- **D-04:** Curseur placé juste au-dessus des ingrédients (pas de sticky header).

#### Ingrédients + curseur
- **D-05:** Saisie quantité en deux champs : nombre décimal + unité libre (g, cas, pincée). Nombre vide = affiché tel quel (« au goût »).
- **D-06:** Curseur par pas de 2 sur 2–12, initialisé à la référence arrondie au pair le plus proche (3→4). — **Reversibility:** reversible — pur client, aucun contrat serveur.
- **D-07:** Quantités recalculées en décimaux (0.5, pas ½) + accord auto simple de l'unité (+s/+x : 0.5 œuf, 2 œufs).
- **D-08:** Catégorie créée inline dans le formulaire (« + Nouvelle catégorie ») + gestion (renommer/supprimer, réassignation au défaut si pleine) en paramètres du module.
- **D-09:** Tags en champ à pastilles : multi-sélection + frappe libre créant le tag, gestion en paramètres.

#### Étapes + drag
- **D-10:** Édition des étapes en ligne dans la fiche (texte direct + bouton « + Ajouter une étape »), pas de dialogue.
- **D-11:** La bulle numéro EST la poignée de drag (dnd-kit déjà installé) + boutons monter/descendre comme alternative clavier (a11y ≥ 44px). Deux étapes consécutives reliées par un point.
- **D-12:** Cases à cocher par étape pour suivre la cuisson, état local non sauvegardé (pas de colonne en base).

#### Partage + recherche
- **D-13:** Boutons Partager (lien invité copiable + révocation) et Exporter (print/PDF) dans la fiche, calqués sur le dialogue cadeaux/ardoises.
- **D-14:** Page invitée = même fiche en lecture seule (défilement, curseur, cases) sans aucun bouton d'édition — via Edge `recipe-invite` + ticket, jamais PostgREST direct. — **Reversibility:** one-way — contrat public (URL invitée) + secret HMAC dédié ; changer le format invalide les liens émis.
- **D-15:** Barre de recherche (nom/ingrédient, insensible aux accents) + filtre catégorie + filtre tags + toggle favoris, combinables, en haut de la grille.
- **D-16:** Envoi vers Courses depuis la fiche : sélecteur de liste du foyer → insert des ingrédients à l'échelle courante.

### the agent's Discretion
Libellés exacts, tailles de cartes et points de rupture, détail de la règle d'accord (+s/+x, cas irréguliers), libellé du bouton d'export, nom des tables/colonnes (convention du schéma), forme du ticket invité (HMAC vs SHA simple — suivre trip-invite).

### Deferred Ideas (OUT OF SCOPE)
- Photos d'étape (miniature par étape) — différé en discuss 2026-10-14, SPEC R9 réduite à la couverture.
- Difficulté / temps total auto / source URL — exclus au cadrage (bonus non retenus).
- Nutrition, import URL, commentaires, planning repas — hors SPEC.

## Phase Requirements

| ID | Description (SPEC) | Research Support |
|----|--------------------|------------------|
| R1 | Grille cartes photo groupées par catégorie | Cartes voyages (esprit D-01) ; `resolveTripCoverUrls` forge N couvertures en une passe |
| R2 | Catégories + défaut « Recettes du foyer » | Motif dossiers tâches/notes (`FolderTabs`, tri `localeCompare fr`) ; seed catégorie par défaut en migration |
| R3 | Création 7 champs, temps total | `toTripPayload`-style ; validation Zod nom 1–200 (CHECK btrim) |
| R4 | Tags multi + 14 seeds + volée + paramètres | `recipe_tags` + `recipe_tag_links` ; seed en migration ; création à la volée = insert tag + lien |
| R5 | Fiche cliquable par recipe_id | Route fiche ; sections Ingrédients + Étapes |
| R6 | Ingrédients nom + nombre + unité, NULL accepté | `quantity numeric(10,2)` nullable comme `shopping_list_items` ; NULL = « au goût » |
| R7 | Étapes bulles reliées + DnD sur bulle | `useSortable` + `DndContext` + `sortableKeyboardCoordinates` (tâches) ; `position` persistée |
| R8 | Scaler pair 2–12, décimaux + accord auto | Pur client (D-06 reversible) ; formule `qté × (cible/base)` ; accord +s/+x |
| R9 | Couverture unique, cleanup sans orphelin | `depositHouseholdFile` + `removeHouseholdFile` + `uploadTripCover`/`removeTripCover` |
| R10 | Enfant lecture seule (RLS + UI) | SELECT `is_household_member` conservé ; écritures `can_write_household` ; `canWrite = role !== 'enfant'` + garde throw |
| R11 | Lien invité lecture seule révocable | Byte-motif `trip-invite` : HMAC, `FOR UPDATE`, oracle unique, `RECIPE_INVITE_HMAC_SECRET` dédié |
| R12 | Export print CSS | `@media print` vue fiche à l'échelle courante, sans lib |
| R13 | Favoris + recherche insensible accents + filtres | `recipe_favorites (recipe_id, member_id)` ; filtre client `normalize('NFD')` (prestataires/off-client) |
| R14 | Envoi vers Courses | `createShoppingItem` : `household_id, list_id, name, quantity, unit, category, checked:false, added_by` |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Grille cartes + fiche + scaler + cases étapes | Frontend (React) | — | Pur UI/client ; scaler et cases sont état local (D-06, D-12) |
| Persistance recettes/enfants + RLS | API / Backend (PostgREST + RLS) | — | RLS frontière finale (AGENTS.md §2.6) |
| Lien invité lecture seule | Edge Function (`recipe-invite`) | — | Invités sans compte : jamais PostgREST direct, RPC `service_role` seuls |
| Couverture photo | Storage privé + Frontend | — | Dépôt/URL signée/cleanup côté client via helpers partagés |
| Export PDF | Frontend (print CSS) | — | Aucune lib, `@media print` |
| Envoi Courses | Frontend → API | — | Inserts `shopping_list_items` via `data.create` existant |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@dnd-kit/core` | 6.3.1 [VERIFIED: app/package.json:20] | DnD étapes (DndContext, capteurs) | Déjà installé, éprouvé tâches + dashboard |
| `@dnd-kit/sortable` | 10.0.0 [VERIFIED: app/package.json:22] | `useSortable` + `SortableContext` + stratégie verticale | Précédent `task-row.tsx` / `taches-page.tsx` |
| `@dnd-kit/utilities` | 3.2.2 [VERIFIED: app/package.json:23] | `CSS.Transform.toString` | Compagnon obligatoire du motif existant |
| `@dnd-kit/modifiers` | 9.0.0 [VERIFIED: app/package.json:21] | `restrictToParentElement` si besoin | Déjà en dépendances (dashboard) |
| React Hook Form v7 + Zod v4 | existants | Formulaire création (nom 1–200, temps) | Stack projet (AGENTS.md §2.1), dialogue cadeaux |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `normalize('NFD')` natif | — | Recherche insensible aux accents | Filtre client R13 (motif prestataires/off-client) |
| `@media print` CSS | — | Export fiche | R12, sans dépendance |
| `withSupabase` (`@supabase/server`) | runtime épinglé | Auth Edge `['user','publishable']` | Copie `trip-invite` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Filtre client NFD | Extension `unaccent` / `pg_trgm` côté SQL | Aucune extension texte trouvée dans les migrations [ASSUMED] ; le filtre client suit le précédent maison (`anniversaires/types.ts` : « extension `unaccent` non garantie sur la stack ») |
| Print CSS | lib PDF (jspdf, react-to-print) | SPEC impose print CSS phase 1 ; 0 nouvelle dépendance |
| Table `recipe_shares` ad hoc | Réutiliser `trip_invites` | Non : périmètre et secret HMAC dédié exigés ; table propre au même motif |

**Installation:** aucune — `npm install` inutile, tout est déjà en dépendances.

**Version verification:** dnd-kit lu dans `app/package.json` + `package-lock.json` cette session (core 6.3.1, sortable 10.0.0, utilities 3.2.2, modifiers 9.0.0).

## Package Legitimacy Audit

Aucun paquet externe à installer pour cette phase (dnd-kit déjà verrouillé au lockfile, export en CSS natif, recherche en NFD natif, Edge en `zod` déjà utilisé par `trip-invite`). Pas d'audit requis.

| Package | Registry | Verdict | Disposition |
|---------|----------|---------|-------------|
| — (aucun nouveau) | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Navigateur (membre) ──JWT──▶ PostgREST ──RLS──▶ public.recipes + enfants
        │                        │                    (SELECT membre, écriture can_write)
        │                        ▼
        │                   Storage household-media (couverture, URL signée TTL court)
        │
        ├── Fiche : scaler client 2–12 → recalcul décimaux + accord unité
        ├── Étapes : DndContext + useSortable(bulle) → UPDATE position
        ├── Envoi Courses : sélecteur shopping_lists → INSERT shopping_list_items
        └── Partager : POST recipe-invite {create|revoke|summary} (JWT user)

Navigateur (invité, sans compte) ──code/ticket──▶ Edge recipe-invite (publishable)
                                                      │ RPC service_role seuls
                                                      ▼
                                              Vue fiche lecture seule (scaler + cases OK,
                                              0 bouton édition, 0 PostgREST direct)
```

### Recommended Project Structure
```
app/src/modules/recettes/
├── recettes-page.tsx        # grille sections par catégorie + barre recherche/filtres
├── recette-detail-page.tsx  # NOUVEAU — fiche défilement unique (D-03)
├── api.ts                   # NOUVEAU — écritures (calque courses/api.ts, cadeaux/api.ts)
├── types.ts                 # étendre (catégorie, tags, ingrédients, étapes, scaler)
├── hooks/use-recettes.ts    # NOUVEAU — ressources + canWrite (calque use-taches/use-notes)
└── components/
    ├── recipe-card.tsx            # NOUVEAU — photo fond, nom haut, tags bas-droite, cœur haut-droite
    ├── recipe-form-dialog.tsx     # NOUVEAU — 7 champs + « + Nouvelle catégorie »
    ├── ingredient-list.tsx        # NOUVEAU — scaler + accord unité
    ├── recipe-steps.tsx           # NOUVEAU — bulles + point liaison + DnD + cases locales
    ├── recipe-share-dialog.tsx    # NOUVEAU — calque gift-share-dialog (summary + révocation)
    └── recipe-settings.tsx        # NOUVEAU — catégories + tags en paramètres
supabase/
├── migrations/01XX_recettes_full.sql   # NOUVEAU — tables + ALTER recipes + RLS + RPC + seeds
└── functions/recipe-invite/index.ts + child-guard.ts  # NOUVEAU — copie trip-invite
```

### Pattern 1: Table enfant + RLS dérivée du parent
**What:** Tables `recipe_ingredients`, `recipe_steps`, `recipe_tag_links`, `recipe_favorites`, `recipe_shares` portent `recipe_id` (+ `household_id` dénormalisé justifié/contraint comme `shopping_list_items`/`routine_completions`) ; SELECT via `is_household_member`, écritures via `can_write_household`, trigger `align_child_household` ; RLS activée + garde-fou 0014.
**When to use:** Toutes les tables neuves de la phase.
**Example:**
```sql
-- Source: supabase/migrations/0003_tables_daily.sql:18-31 + 0008_triggers.sql (align_child_household)
create table public.recipe_ingredients (
  id text primary key default private.new_id('recipe-ingredient'),
  recipe_id text not null references public.recipes (id) on delete cascade,
  household_id text not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  quantity numeric(10, 2),   -- NULL = « au goût » (R6)
  unit text,
  position integer not null default 0
);
```

### Pattern 2: Edge invitation byte-motif trip-invite
**What:** `generateCode()` (24 octets → 32 base64url), `hmacSha256Hex(code, SECRET)`, base ne stocke que le hash hex 64 ; RPC `SECURITY DEFINER SET search_path=''` avec `FOR UPDATE` + oracle unique `code invalide` ; `auth: ['user','publishable']`, chemins invités avant le contrôle user ; child-guard pur testé Vitest.
**When to use:** `recipe-invite` (create/revoke/summary en `user` + `link-view` en `publishable`).
**Example:**
```ts
// Source: supabase/functions/trip-invite/index.ts:265-301, 1019-1033
const codeHash = await hmacSha256Hex(code, checkSecret()); // code rendu une seule fois
-- select ... for update; -- verrou pessimiste max-uses (0118:1019-1025)
if not v_invite.is_active or ... or v_invite.use_count >= v_invite.max_uses then
  raise exception 'code invalide' using errcode = 'P0002'; -- oracle unique
```

### Pattern 3: Couverture bucket privé + forge courte + cleanup
**What:** Colonne `cover_photo` = CHEMIN bucket pour nouveaux dépôts ; dépôt via `depositHouseholdFile({householdId, folder:'recipes/<id>', file})` (compression image native) ; lecture via `createSignedUrl(path, 3600)` avec échec fermé (`null`, jamais de lien mort) ; suppression recette = `removeHouseholdFile` + `data.remove`.
**When to use:** R9 couverture unique.
**Example:**
```ts
// Source: app/src/lib/storage.ts:68-111 + app/src/modules/voyages/api.ts:105-137
const deposited = await depositHouseholdFile({ householdId, folder: `recipes/${recipeId}`, file });
return deposited.path ?? deposited.url; // chemin stocké, aperçu local en démo
```

### Pattern 4: canWrite + readOnly + garde serveur
**What:** `canWrite = currentMember?.role !== 'enfant'` ; UI masque actions (`actionLabel={canWrite ? ... : undefined}`, `readOnly={!canWrite}`) ; chaque mutation throw `'Votre rôle ne permet pas d'écrire ici.'` ; RLS refuse de toute façon (`can_write_household` = admin/membre seuls).
**When to use:** R10, toutes les écritures recettes.
**Example:**
```tsx
// Source: app/src/modules/taches/hooks/use-taches.ts:118 + app/src/modules/taches/components/task-row.tsx:25-54
const canWrite = currentMember?.role !== 'enfant';
const { listeners, setActivatorNodeRef } = useSortable({ id: task.id }); // poignée = bouton, a11y clavier
```

### Anti-Patterns to Avoid
- **Politique RLS publique pour invités:** jamais de SELECT anonyme sur `recipe_shares` ; lecture invitée uniquement via Edge/RPC serveur (prohibition SPEC R11).
- **Token brut ou secret en base:** seul le hash hex 64 persiste ; `RECIPE_INVITE_HMAC_SECRET` (≥ 256 bits) en Vault/secret manager, jamais en base ni `cron.job`.
- **Poignée DnD non-clavier:** la bulle doit rester un vrai `<button>` + `sortableKeyboardCoordinates` + boutons monter/descendre (D-11, ≥ 44px).
- **Réécrire une migration appliquée:** corriger vers l'avant (AGENTS.md §2.7-A).
- **Assertion SQL non bornée / tautologique:** borner par foyer ; 0 `count(*) >= 0` (§2.7-D).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Invitation externe + oracle + rate-limit | Nouveau design HMAC/maison | Copie `trip-invite` + `child-guard.ts` | Entropie, oracle unique, `FOR UPDATE`, child-guard testé — tout est prouvé |
| Upload/compression/URL signée/cleanup | Uploader maison | `depositHouseholdFile` + `removeHouseholdFile` + forge 1h | Compression native, TTL, échec fermé, 0 orphelin |
| DnD accessible | Drag maison (pointer events) | dnd-kit core6/sortable10 + `sortableKeyboardCoordinates` | Clavier + lecteur d'écran déjà éprouvés (tâches, dashboard) |
| Recherche insensible accents | Extension SQL maison | `stripDiacritics` client (`normalize NFD` + `\p{Diacritic}`) | `unaccent` non garanti sur la stack ; précédent prestataires/off-client |
| RLS foyer + rôles | Checks applicatifs seuls | `is_household_member` / `can_write_household` / `is_household_admin` | Frontière finale serveur, helpers existants |

**Key insight:** Chaque brique (invitation, photo, DnD, gating enfant, recherche) a un précédent copiable dans le dépôt — la phase est un assemblage, pas une invention.

## Common Pitfalls

### Pitfall 1: CTE masquant la table + search_path vide
**What goes wrong:** `join tasks t` dans le CTE `tasks` se joint à lui-même ; nom non qualifié sous `search_path=''` ne résout rien.
**Why it happens:** PL/pgSQL + `set search_path=''` exigent `public.` partout.
**How to avoid:** Qualifier `public.` chaque table ; nommer les CTE sans collision ; `python3 scripts/check-sql-statique.py` vert.
**Warning signs:** Fonction créée mais jamais exécutée avant commit (§2.7-A).

### Pitfall 2: Colonne `returns table` ambiguë en PL/pgSQL
**What goes wrong:** Référence non qualifiée remplacée par NULL ou erreur ambiguë.
**Why it happens:** `returns table (a, b)` déclare des variables PL/pgSQL.
**How to avoid:** Qualifier ou renommer ; contrôle statique §2.7-B.
**Warning signs:** RPC rend NULL là où la requête manuelle rend une valeur.

### Pitfall 3: Assertion SQL lisant `pg_get_functiondef` comme du texte
**What goes wrong:** Motif écrit contre la migration échoue contre la déparse (casts `'scope'::text`), ou passe sans rien vérifier.
**Why it happens:** PostgreSQL réaffiche les littéraux selon sa version.
**How to avoid:** Ancrer sur le littéral, forme positive, sinon preuve comportementale (§2.7-D §6).
**Warning signs:** Test vert après reformatage sans changement sémantique.

### Pitfall 4: Orphelin Storage à la suppression
**What goes wrong:** `data.remove('recipes', id)` sans `removeHouseholdFile` laisse l'objet en bucket.
**Why it happens:** Cascade SQL ne touche pas le Storage.
**How to avoid:** Supprimer l'objet AVANT/après la ligne dans la même action, best-effort sans masquer l'erreur d'origine.
**Warning signs:** Objets sans ligne référençante (critère R9).

### Pitfall 5: Suppression catégorie pleine sans réassignation
**What goes wrong:** `ON DELETE` cascade ou RESTRICT inadapté : perte ou blocage.
**Why it happens:** `recipes.category_id` FK mal choisie.
**How to avoid:** `ON DELETE SET NULL` + trigger/garde réassignant vers la catégorie défaut du foyer, ou `SET DEFAULT` ; suppression vide = DELETE direct (critère R2).
**Warning signs:** Recettes sans catégorie après suppression.

### Pitfall 6: Scaler appliquant le facteur aux lignes « au goût »
**What goes wrong:** `NULL × facteur` affiché « 0 » ou « NaN ».
**Why it happens:** Oubli du cas `quantity === null`.
**How to avoid:** Lignes sans nombre rendues telles quelles à toutes les valeurs (critère R8).
**Warning signs:** « sel au goût » change au déplacement du curseur.

## Code Examples

### Scaler + accord unité (client, D-06/D-07/D-08)
```ts
// Source: logique déduite de SPEC R8 + CONTEXT D-06/D-07 (pur client, [ASSUMED] pour le détail)
export const roundToEven = (n: number) => Math.round(n / 2) * 2; // réf 3 → 4
export const scaleQty = (qty: number | null, base: number, target: number) =>
  qty === null ? null : (qty * target) / base; // NULL = « au goût », inchangé
export const agreeUnit = (unit: string | null, scaled: number | null): string | null => {
  if (!unit || scaled === null) return unit; // « pincée(s) », « au goût » intacts
  if (!/[sx]$/i.test(unit)) return scaled > 1 ? `${unit}s` : unit.replace(/s$/i, '');
  return unit; // unités déjà marquées (ex. « pincée(s) ») inchangées
};
// 1 œuf/4 → 0.5 œuf à 2 → 2 œufs à 8 ; affichage décimal, pas de ½
```

### DnD sur la bulle étape (calque TaskRow)
```tsx
// Source: app/src/modules/taches/components/task-row.tsx:25-54
const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
  useSortable({ id: step.id });
<button ref={setActivatorNodeRef} type="button" {...attributes} {...listeners}
  aria-label={`Réordonner : étape ${step.position}`}>{step.position}</button>
// + SortableContext + sortableKeyboardCoordinates + boutons monter/descendre (D-11)
```

### Recherche insensible aux accents (calque prestataires)
```ts
// Source: app/src/modules/prestataires/types.ts:96 + app/src/modules/courses/off-client.ts:233-240
const stripDiacritics = (v: string) => v.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
const hit = (t: string, q: string) => stripDiacritics(t).includes(stripDiacritics(q.trim()));
// appliquer sur nom recette + noms ingrédients, combiné aux filtres catégorie/tags/favoris (D-15)
```

### Envoi vers Courses (calque courses/api.ts)
```ts
// Source: app/src/modules/courses/api.ts:109-122 + supabase/migrations/0003_tables_daily.sql:18-31
await Promise.all(scaled.map((ing) => createShoppingItem({
  householdId, listId, name: ing.name, quantity: ing.quantity, // quantité à l'échelle courante
  unit: ing.unit, rayon: '', addedBy: currentMemberId,
})));
// quantity numeric(10,2) accepte les décimaux du scaler ; unit text libre
```

### Garde enfant Edge (calque ardoise/trip-invite)
```ts
// Source: supabase/functions/ardoise-invite/child-guard.ts:17-40 + trip-invite/index.ts:476-487
if (isChildRole(await callerRole(admin, householdId, userId))) {
  const refusal = childRefusal('manage'); throw new TripInviteError(refusal.status, refusal.message);
}
// foyer inconnu → laisser le RPC trancher (jamais de 403 révélant l'existence)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `recipes` minimal + EmptyState attente | Module complet 7 tables + fiche + partage | Cette phase | Placeholder remplacé, pas de recréation |
| `dnd-kit` umbrella | `@dnd-kit/core` 6 + `sortable` 10 modulaires | Stack projet | Imports modulaires obligatoires |
| Bucket public / URL longue | Bucket privé `household-media` + URL signée TTL court + cleanup | Phases 13/voyages | Copier tel quel |
| Enfant masqué en lecture (ardoises/cadeaux) | Enfant lecture seule recettes (SELECT conservé) | SPEC R10 + phase 14 | Ne PAS resserrer les SELECT vers `can_write_household` ici |

**Deprecated/outdated:**
- Photos d'étape : différées (D-14/CONTEXT), R9 = couverture seule
- Fractions ½ : le scope SPEC mentionne « fractions ½ » mais D-07 verrouille les décimaux (0.5) — suivre D-07

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Aucune extension `unaccent`/`pg_trgm` sur la stack → recherche côté client | Standard Stack | Si l'extension existe, un index serveur serait plus scalable ; vérifier `select * from pg_extension` au plan |
| A2 | `private.new_id('recipe-…')` accepte les préfixes enfants proposés | Pattern 1 | Faible : préfixes existants variés (`recipe`, `list`, `item`, `trip-guest`) |
| A3 | Détail accord unité (+s/+x, irréguliers) à la discrétion de l'agent | Code Examples | Négociable en review ; cas `pincée(s)` proposé |
| A4 | Concurrence max-uses=1 couverte par `FOR UPDATE` copié de 0118 | Pattern 2 | SPEC la traite en hypothèse ; le verrou pessimiste est le motif 0017/0079 prouvé |

## Open Questions

1. **Seed catégorie défaut par foyer**
   - What we know: R2 exige « Recettes du foyer » par défaut ; aucun trigger de seed foyer visible pour catégories.
   - What's unclear: Seed en migration pour foyers existants (INSERT sélectif) + trigger à la création de foyer, ou création paresseuse à la première recette ?
   - Recommendation: Migration seed (foyers existants) + fonction appelée à la création de foyer ; planner tranche.

2. **Nom table partages + secret**
   - What we know: SPEC propose `recipe_shares (recipe_id, share_hash, …)` ; trip utilise `trip_invites.token_hash` + `trip_guests.ticket_hash`.
   - What's unclear: Faut-il le double régime code+ticket (suivre trip-invite à la lettre) ou lien seul (link-view suffit, lecture sans inscription) ?
   - Recommendation: Lien seul `link-view` (pas d'inscription externe en lecture seule) — à la discrétion de l'agent, ticket seulement si besoin futur.

## Environment Availability

Phase code/config/SQL + Edge Deno : aucune dépendance externe neuve.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 24 + npm | Build/test front | ✓ [ASSUMED] | — | — |
| Docker (db) | `test-db.sh`, migrations | À vérifier au plan | — | Chaîne sans Docker (typecheck+tests+build+e2e+statique) puis `test-db.sh` obligatoire avant validation SQL |
| Deno runtime Edge | `recipe-invite` | ✓ via stack | — | — |

**Missing dependencies with no fallback:** none identifié.
**Missing dependencies with fallback:** Docker absent → valider SQL sur machine équipée (§2.7).

## Validation Architecture

`workflow.nyquist_validation` absent de `.planning/config.json` [VERIFIED: .planning/config.json:1-5] → section incluse (activé par défaut).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 [VERIFIED: app/package.json:81] + Testing Library + user-event |
| Config file | none détecté à la racine app (glob `vitest*` vide) — voir Wave 0 |
| Quick run command | `cd app && npm test` (vitest run) |
| Full suite command | `cd app && npm run typecheck && npm test && npm run build` puis `npm run test:e2e` (Playwright 1.63.0) + `python3 scripts/check-sql-statique.py` + `sh scripts/test-db.sh` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| R1 | Grille 3 cartes / 2 sections, clic → fiche | unit + e2e | `npm test -- recettes` / `npm run test:e2e` | ❌ Wave 0 |
| R2 | Catégorie défaut, création membre, suppression pleine réassigne | sql + unit | `sh scripts/test-db.sh` | ❌ Wave 0 |
| R6/R8 | NULL « au goût », scaler 1 œuf/4 → 0.5/2 → 2/8 | unit | `npm test -- scaler` | ❌ Wave 0 |
| R7 | DnD 3→1 persiste après reload | unit + e2e | `npm test -- steps` | ❌ Wave 0 |
| R9 | Cleanup Storage sans orphelin | unit (mock storage) | `npm test -- cover` (calque `storage.test.ts`, `prestataires/api.test.ts`) | ❌ Wave 0 |
| R10 | Enfant : lecture OK, INSERT refusé | sql négatif | `sh scripts/test-db.sh` | ❌ Wave 0 |
| R11 | Lien invité OK / révoqué → invalide / max-uses | sql + Edge | `sh scripts/test-db.sh` + test Edge | ❌ Wave 0 |
| R13 | Recherche insensible accents + filtres | unit | `npm test -- search` | ❌ Wave 0 |
| R14 | Envoi 3 ingrédients à l'échelle 8 | unit | `npm test -- courses` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd app && npm run typecheck && npm test`
- **Per wave merge:** `+ npm run build` et `npm run test:e2e`
- **Phase gate:** Full suite + statique SQL + test-db verts avant `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `supabase/migrations/01XX_recettes_full.sql` — tables + RLS + RPC + seeds (R2/R4/R6/R7/R10/R11)
- [ ] `supabase/functions/recipe-invite/` — index.ts + child-guard.ts + test Vitest garde
- [ ] `app/src/modules/recettes/hooks/use-recettes.ts` + `api.ts` + composants + tests
- [ ] Localiser la config Vitest effective (script `vitest run` sans `vitest.config.*` à la racine app — vérifier `vite.config` embarqué) [ASSUMED]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (invité) | Edge `publishable` + ticket/code, jamais de session |
| V3 Session Management | no | Invités sans session ; membres via Supabase Auth |
| V4 Access Control | yes | RLS : SELECT `is_household_member`, écritures `can_write_household`, DELETE admin ; RPC `service_role` seuls pour invités |
| V5 Input Validation | yes | Zod Edge (code ≥22 base64url, hash hex 64, nom 1–200) + CHECK SQL `btrim` |
| V6 Cryptography | yes | HMAC-SHA-256 secret dédié ≥ 256 bits, Vault uniquement ; jamais hand-roll (WebCrypto `crypto.subtle`) |

### Known Threat Patterns for Supabase/RLS + Edge

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Oracle invitation (énumération codes) | Information disclosure | Message unique `code invalide`/`Lien invalide`, 404 uniforme |
| Lecture invitée via PostgREST direct | Information disclosure | Aucune politique publique ; RPC `service_role` seuls + Edge seule |
| Escalade enfant (INSERT direct) | Elevation of privilege | `can_write_household` exclut `enfant` [VERIFIED: 0006_security_helpers.sql:77-85] + test négatif |
| Token brut en base/logs | Information disclosure | Hash seul persisté, brut rendu une fois, jamais loggé |
| Concurrence max-uses | Tampering | `SELECT ... FOR UPDATE` (motif 0017/0079/0118) |
| Orphelin Storage / URL permanente | Information disclosure | URL signée TTL court, cleanup à la suppression |

## Project Constraints (from AGENTS.md)

- RLS frontière finale : politiques SELECT/INSERT/UPDATE/DELETE explicites, `SECURITY DEFINER` + `search_path` fixe, enfant lecture seule via `can_write_household` (admin/membre seuls).
- Migrations vers l'avant uniquement ; tables qualifiées `public.` ; tests négatifs inter-foyer (2 foyers) + escalade enfant.
- Secret HMAC en Vault/secret manager, jamais en base/CLI/`cron.job` ; token brut affiché une seule fois.
- Chaîne avant commit : `typecheck && tests && build`, `test:e2e`, `check-sql-statique.py`, `test-db.sh` (+ `test-dispatch-push.sh` non pertinent ici — pas de push).
- Zones tactiles ≥ 44px ; actions destructrices confirmées par modale ; états vides soignés.
- `recipes` existante à étendre (0003/0007), pas à recréer ; `id text default private.new_id('recipe')`, `title 1–200 btrim`.

## Sources

### Primary (HIGH confidence)
- `supabase/functions/trip-invite/index.ts` — motif invitation complet lu (879 lignes)
- `supabase/functions/ardoise-invite/child-guard.ts` — garde enfant pure lue
- `supabase/migrations/0003_tables_daily.sql:9-31,156-172` — `recipes` + `shopping_list_items` lus
- `supabase/migrations/0006_security_helpers.sql:35-85` — `household_role`/`can_write_household` lus
- `supabase/migrations/0007_rls_policies.sql:1-19,170-244` — motif « foyer plat » lu
- `supabase/migrations/0118_trip_workspace.sql:1015-1033` — `FOR UPDATE` + oracle unique lus
- `app/src/lib/storage.ts:68-111` — dépôt/cleanup lus ; `app/src/modules/voyages/api.ts:105-137` — forge couverture lue
- `app/src/modules/taches/` (`taches-page.tsx`, `task-row.tsx`, `use-taches.ts:118`) — DnD + canWrite lus
- `app/src/modules/courses/api.ts:109-122` — insert items lu
- `app/package.json` — dnd-kit 6.3.1/10.0.0/3.2.2/9.0.0, vitest 5.0.2, playwright 1.63.0 lus

### Secondary (MEDIUM confidence)
- `supabase/migrations/0113_enfant_perimeter.sql` — périmètre enfant phase 14 (ne pas copier le resserrement SELECT ici)
- `app/src/modules/cadeaux/components/gift-share-dialog.tsx` — dialogue partage à calquer
- `app/src/modules/prestataires/types.ts:96`, `off-client.ts:233-240`, `anniversaires/types.ts:112-116` — NFD + `unaccent` non garanti

### Tertiary (LOW confidence)
- Détail règle d'accord unité et seed trigger foyer — à la discrétion de l'agent, marqués [ASSUMED]

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH - versions lues au lockfile, 0 nouvelle dépendance
- Architecture: HIGH - chaque brique a un précédent maison lu cette session
- Pitfalls: HIGH - §2.7 AGENTS.md + motifs migrations lus

**Research date:** 2026-10-14
**Valid until:** 2026-11-13 (stack stable, précédents internes)
