# Phase 16: Recettes du foyer — Context

**Gathered:** 2026-10-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Module Recettes complet : grille de cartes photo groupées par catégorie (sections empilées), fiche en défilement unique (header, curseur personnes, ingrédients recalculés, étapes à cocher), scaler pair 2–12, lien invité lecture seule + export print, favoris + recherche + filtres, envoi vers Courses. Enfant lecture seule. Photos d'étape différées (couverture seule).

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**14 requirements are locked.** See `16-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `16-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):** grille cartes + groupement catégorie + fiche ingrédients/étapes ; CRUD catégories (défaut foyer + créées par admin/membre), tags seed + volée + paramètres ; ingrédients structurés + scaler pair 2–12 + décimaux ; étapes numérotées + liaison point + DnD sur bulle + cases à cocher ; enfant lecture seule ; lien invité lecture seule révocable + export print ; favoris + recherche + filtres ; envoi vers Courses ; migration SQL + preuves + UI + e2e, chaîne §2.7.
**Out of scope (from SPEC.md):** nutrition/calories ; import URL ; commentaires ; planning repas ; galerie multi-photos ; partage externe en écriture ; push dédié. Plus : photos d'étape (différé en discuss).

</spec_lock>

<decisions>
## Implementation Decisions

### Grille + fiche
- **D-01:** Carte = photo plein fond, nom en haut, tags en bas à droite, cœur favori en haut à droite. Esprit cartes voyages.
- **D-02:** Groupement par catégorie en sections empilées (Recettes du foyer d'abord), pas de filtre par onglets. Les filtres catégorie/tags vivent dans la barre de recherche (D-13), pas comme navigation.
- **D-03:** Fiche en défilement unique : header photo/nom/meta → curseur personnes → ingrédients → étapes → actions (partage/export/Courses).
- **D-04:** Curseur placé juste au-dessus des ingrédients (pas de sticky header).

### Ingrédients + curseur
- **D-05:** Saisie quantité en deux champs : nombre décimal + unité libre (g, cas, pincée). Nombre vide = affiché tel quel (« au goût »).
- **D-06:** Curseur par pas de 2 sur 2–12, initialisé à la référence arrondie au pair le plus proche (3→4). — **Reversibility:** reversible — pur client, aucun contrat serveur.
- **D-07:** Quantités recalculées en décimaux (0.5, pas ½) + accord auto simple de l'unité (+s/+x : 0.5 œuf, 2 œufs).
- **D-08:** Catégorie créée inline dans le formulaire (« + Nouvelle catégorie ») + gestion (renommer/supprimer, réassignation au défaut si pleine) en paramètres du module.
- **D-09:** Tags en champ à pastilles : multi-sélection + frappe libre créant le tag, gestion en paramètres.

### Étapes + drag
- **D-10:** Édition des étapes en ligne dans la fiche (texte direct + bouton « + Ajouter une étape »), pas de dialogue.
- **D-11:** La bulle numéro EST la poignée de drag (dnd-kit déjà installé) + boutons monter/descendre comme alternative clavier (a11y ≥ 44px). Deux étapes consécutives reliées par un point.
- **D-12:** Cases à cocher par étape pour suivre la cuisson, état local non sauvegardé (pas de colonne en base).

### Partage + recherche
- **D-13:** Boutons Partager (lien invité copiable + révocation) et Exporter (print/PDF) dans la fiche, calqués sur le dialogue cadeaux/ardoises.
- **D-14:** Page invitée = même fiche en lecture seule (défilement, curseur, cases) sans aucun bouton d'édition — via Edge `recipe-invite` + ticket, jamais PostgREST direct. — **Reversibility:** one-way — contrat public (URL invitée) + secret HMAC dédié ; changer le format invalide les liens émis.
- **D-15:** Barre de recherche (nom/ingrédient, insensible aux accents) + filtre catégorie + filtre tags + toggle favoris, combinables, en haut de la grille.
- **D-16:** Envoi vers Courses depuis la fiche : sélecteur de liste du foyer → insert des ingrédients à l'échelle courante.

### the agent's Discretion
Libellés exacts, tailles de cartes et points de rupture, détail de la règle d'accord (+s/+x, cas irréguliers), libellé du bouton d'export, nom des tables/colonnes (convention du schéma), forme du ticket invité (HMAC vs SHA simple — suivre trip-invite).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Exigences verrouillées
- `.planning/phases/16-recettes-du-foyer-grille-fiche-ingr-dients-tapes-partage/16-SPEC.md` — Locked requirements — MUST read before planning.

### Motifs à copier
- `supabase/functions/trip-invite/index.ts` — Byte-motif invitation (HMAC, oracle unique, rate-limits, child-guard, guest-view) à copier pour `recipe-invite`.
- `supabase/functions/ardoise-invite/child-guard.ts` — Garde enfant Edge (résolution serveur via ligne membre).
- `app/src/modules/recettes/recettes-page.tsx` + `types.ts` — État actuel du module (placeholder à remplacer).
- `app/src/modules/ardoise/guest-ardoise-page.test.tsx` — Précédent de page invitée + preuves.
- `app/src/modules/courses/api.ts` — Insert `shopping_list_items` pour l'envoi vers Courses.
- `AGENTS.md` §2.6/§2.7 — RLS + chaîne de vérification avant commit.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ModuleShell` + `Panel` (`@/components/shared/module-shell`) : coquille des pages modules, déjà utilisée par recettes-page.
- `useResource('recipes')` (`@/lib/data/useResource`) : lecture table recipes à étendre aux enfants.
- `@dnd-kit/core@6` + `@dnd-kit/sortable@10` : déjà en dépendances pour le DnD des étapes.
- Edge `trip-invite` / `ardoise-invite` : motif HMAC + RPC `service_role` seuls + page invitée.

### Established Patterns
- Bucket privé + chemin stocké + URL signée + cleanup (phase 13) pour la couverture.
- Enfant lecture seule serveur (RLS SELECT seul) + masquage UI + garde non-autorisé (phase 14).
- Dialogue de partage copié de `gift-share-dialog` (phase 15).

### Integration Points
- `shopping_lists` / `shopping_list_items` du foyer (envoi d'ingrédients).
- `household_members` (rôles admin/membre/enfant pour création catégories et gating).
- Table `recipes` existante (0003) à étendre, pas à recréer.

</code_context>

<specifics>
## Specific Ideas

- Cartes « photo plein fond, nom en haut, tags en bas à droite, cœur en haut à droite » — demandé tel quel par l'utilisateur.
- Étapes « bulle numéro + point de liaison », drag « sur le numéro de l'étape » — repris verbatim du cadrage initial.
- Export = mise en page print CSS d'abord (pas de lib PDF en phase 1).

</specifics>

<deferred>
## Deferred Ideas

- Photos d'étape (miniature par étape) — différé en discuss 2026-10-14, SPEC R9 réduite à la couverture.
- Difficulté / temps total auto / source URL — exclus au cadrage (bonus non retenus).
- Nutrition, import URL, commentaires, planning repas — hors SPEC.

</deferred>

---

*Phase: 16-recettes-du-foyer-grille-fiche-ingr-dients-tapes-partage*
*Context gathered: 2026-10-14*
