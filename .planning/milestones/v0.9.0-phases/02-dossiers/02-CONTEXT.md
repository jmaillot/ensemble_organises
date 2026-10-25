# Phase 02: Dossiers - Context

**Gathered:** 2026-10-06
**Status:** Ready for planning — as-built record (implementation predates discussion)

> **Note d'orientation (2026-10-06) :** la discussion a révélé que cette phase
> est déjà implémentée de bout en bout (SQL 0050–0053 + 0073, suite 0017,
> UI folder-tabs + 3 modules, tests Vitest, e2e via critical-paths). L'utilisateur
> a choisi « Verify then close ». Ce fichier documente donc les décisions
> **telles qu'implémentées** (relevées dans le code, pas imaginées) pour que
> les agents aval (recherche, planification de correctifs, vérification)
> sachent ce qui est verrouillé. Aucune zone grise n'a nécessité de débat.

<domain>
## Phase Boundary

Dossiers de rangement pour Tâches, Notes et Routines : trois tables
dédiées (`task_lists`, `note_folders`, `routine_folders`) avec dossier
« Général » par défaut (immuable, non supprimable), visibilité
foyer/perso, onglets dossiers (`folder-tabs` tablist partagé),
filtre assigné combiné, enfants sans CTA de création/gestion.
Pas de dossiers pour les autres modules, pas de partage de dossier
hors foyer, pas de dossiers imbriqués — hors phase.

</domain>

<decisions>
## Implementation Decisions (as-built, relevées dans le code)

### Modèle SQL
- **D-01:** Une table par module : `task_lists`, `note_folders`,
  `routine_folders` (`0050_folders.sql:11,24,37`), pas une table générique.
  — **Reversibility:** costly — les FK `folder_id` des items, la RLS par
  table et la suite 0017 sont écrites contre ces trois tables.
- **D-02:** Dossier « Général » semé par foyer (`is_default`, unique partiel
  par `household_id`, `0050:51-53`), immuable (nom/visibilité/is_default) et
  non supprimable (garde `0052:55-66`, `raise exception`). Items sans dossier
  (`folder_id NULL`) = Général côté UI (`taches/types.ts:48`).
- **D-03:** Suppression d'un dossier = contenu rangé dans Général, jamais de
  perte (`0052:6`, toast « Dossier supprimé, contenu rangé dans Général »,
  `use-taches.ts:76`). Garde cascade complémentaire (`0053`, `0073`).
- **D-04:** Seed via `create_household` (3× Général + Commun + 4 catégories,
  `0052:122-176`) + backfill idempotent pour les foyers existants
  (`0052:207-230`, étendu en `0054`).

### Visibilité et RLS
- **D-05:** Dossiers `foyer` (partagés) vs perso (owner + admin)
  (`0051_folders_rls.sql`, prouvé en `0017_folders.sql` : seed Général,
  isolation foyer, perso owner+admin, enfant lecture seule).
- **D-06:** Enfants : lecture seule partout — ni création ni gestion de
  dossiers (`folder-tabs.tsx:27`, `can_write` exclut `enfant`, 0017).

### Frontend
- **D-07:** Onglets via composant partagé `folder-tabs.tsx` (tablist),
  réutilisé par les 3 modules ; onglet actif persistant par foyer avec repli
  sur Général si le dossier disparaît (`use-taches.ts:94`).
- **D-08:** État via hooks `activeFolderId` par module (`use-taches`,
  `use-notes`, `use-routines`) ; filtres combinés dossier + assigné
  (`assigneeFilter` : « tous », `use-taches.ts:87`).

### the agent's Discretion
Aucune — rien n'a été laissé ouvert par la discussion (choix utilisateur :
vérifier puis clore, pas de redesign).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase et produit
- `.planning/PHASES/02-dossiers.md` — spec de phase d'origine (n° migrations
  0047-0050 périmés : l'implémentation réelle est 0050-0053 + 0073)
- `.planning/ROADMAP.md` — Phase 1b : task_lists/note_folders/routine_folders, Général, filtre assigné
- `AGENTS.md` §2.6 — RLS (fonction utilitaire, politiques par table, pas d'auto-admin), §2.7 — chaîne de vérification

### Code de référence (implémentation à préserver)
- `supabase/migrations/0050_folders.sql` — 3 tables + uniques partiels is_default
- `supabase/migrations/0051_folders_rls.sql` — RLS foyer/perso/enfant lecture seule
- `supabase/migrations/0052_folders_triggers_seed.sql` — triggers, garde Général, seed create_household + backfill
- `supabase/migrations/0053_guard_folder_delete.sql`, `0073_folder_guard_cascade.sql` — gardes suppression
- `supabase/migrations/0054_create_household_seeds.sql` — seeds foyer
- `supabase/tests/0017_folders.sql` — preuves : seed, isolation, perso, enfant, intégrité, delete→Général
- `app/src/components/shared/folder-tabs.tsx` (+ `.test.tsx`) — tablist partagé, gating enfant
- `app/src/modules/taches/` (`api.ts`, `hooks/use-taches.ts`, `taches-page.tsx`, `folders.test.ts`) — CRUD/move, activeFolderId, assigneeFilter
- `app/src/modules/notes/`, `app/src/modules/routines/` — même structure (hooks activeFolderId, folders.test.ts)
- `app/e2e/critical-paths.spec.ts` — couverture e2e dossiers

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `folder-tabs.tsx` : tablist partagé et testé — tout nouveau module à dossiers le réutilise tel quel
- Pattern seed Général via `create_household` + backfill idempotent : à mirroring pour tout futur seed par foyer
- Pattern garde-delete-avec-repli (contenu → défaut, jamais de perte) : référence pour suppressions futures

### Established Patterns
- RLS foyer + tests négatifs inter-foyer sur chaque table (0017 : Alice/Bob/Noé vs Carol foyer B)
- Europe/Paris pour les dates ; seed + backfill + NOT NULL vers l'avant
- Enfant = lecture seule, gating UI + RLS serveur (doctrine D-06 phase 01)
- Suppressions destructrices confirmées par modale, jamais silencieuses

### Integration Points
- `tasks.folder_id` → `task_lists` (SET NULL → Général) ; idem notes/routines vers leurs tables
- `create_household` sème dossiers + calendrier Commun + catégories (couplage seed à préserver si la fonction évolue)
- `folder-tabs` consommé par taches-page, notes-page, routines-page

</code>

<specifics>
## Specific Ideas

- Choix utilisateur du 2026-10-06 : « Verify then close » — vérifier l'existant puis clore, pas de redesign ni de nouvelle discussion
- Spec `02-dossiers.md` périmée sur les numéros (0047-0050 → réel 0050-0053+0073 ; test 0016 → réel 0017) : ne pas s'y fier pour les numéros, seulement pour le périmètre

</specifics>

<deferred>
## Deferred Ideas

- Échec `0016_calendrier_rls.sql` constaté le 2026-10-06 pendant la vérification
  (`duplicate key event_calendars_perso_owner_unique` : le trigger auto-Perso
  0085 de la phase 01 entre en collision avec l'insert manuel du test) —
  **RÉSOLU le 2026-10-06 (`ae5210b`)** : le test relit le Perso auto-créé au
  lieu de l'insérer ; suite 31/31 verte.

</deferred>

---

*Phase: 02-Dossiers*
*Context gathered: 2026-10-06*
