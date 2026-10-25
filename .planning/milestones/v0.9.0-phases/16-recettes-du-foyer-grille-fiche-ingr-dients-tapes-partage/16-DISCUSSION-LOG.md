# Phase 16: Recettes du foyer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-14
**Phase:** 16-recettes-du-foyer-grille-fiche-ingr-dients-tapes-partage
**Areas discussed:** Grille + fiche, Ingrédients + curseur, Étapes + drag, Partage + recherche, Catégories + tags (extra), Référence impaire (extra)

---

## Grille + fiche

| Option | Description | Selected |
|--------|-------------|----------|
| Carte photo + favori | Photo en haut, nom + temps + tags, cœur favori — esprit cartes voyages | |
| Carte compacte | Icône + nom + meta, photo en fiche seule | |
| Libre | Photo plein fond, nom en haut, tags bas droite, cœur haut droite | ✓ |

**User's choice:** Photo plein fond, nom en haut, tags en bas à droite, cœur favori haut droit (freeform, proche de « Carte photo + favori »)
**Notes:** Sections empilées par catégorie (pas de filtre onglets) ; fiche en défilement unique ; curseur aux ingrédients.

## Ingrédients + curseur

| Option | Description | Selected |
|--------|-------------|----------|
| Nombre + unité | Deux champs, calcul fiable | ✓ |
| Texte libre | Un champ, quantités devinées | |
| Pas de 2 + réf | 2-4-6-8-10-12 dès la référence | ✓ |
| Pas de 1 libre | Curseur continu 1-12 | |
| Fractions | ½, ¼, ¾ | |
| Décimaux | 0.5, 1.5 | ✓ |
| Accord auto | +s/+x selon le nombre | ✓ |
| Tel quel | Unité inchangée | |

**User's choice:** Nombre + unité, pas de 2, décimaux, accord auto
**Notes:** Amende la SPEC (fractions ½ initiales → décimaux).

## Étapes + drag

| Option | Description | Selected |
|--------|-------------|----------|
| Édition en ligne | Texte direct + bouton ajout | ✓ |
| Dialogue | Fiche en lecture, dialogue séparé | |
| Bulle-poignée + clavier | Bulle = poignée, boutons monter/descendre | ✓ |
| Poignée séparée | Bulle simple numéro | |
| Miniature | Photo par étape | |
| Sans photo | Texte uniquement phase 1 | ✓ |
| Cases à cocher | Progression locale non sauvegardée | ✓ |
| Statiques | Étapes fixes | |

**User's choice:** En ligne, bulle-poignée + clavier, sans photo, cases à cocher
**Notes:** Photos d'étape différées — amende SPEC R9 (couverture seule). Cases = état local, pas de colonne base.

## Partage + recherche

| Option | Description | Selected |
|--------|-------------|----------|
| Dans la fiche | Partager/Exporter calqués cadeaux/ardoises | ✓ |
| Paramètres module | Boutons hors fiche | |
| Fiche identique | Invité voit même fiche en lecture seule | ✓ |
| Vue simplifiée | Ingrédients + étapes seuls | |
| Barre + filtres | Recherche + catégorie + tags + favoris combinables | ✓ |
| Recherche seule | Sans filtres | |
| Courses fiche | Sélecteur de liste dans la fiche | ✓ |
| Courses grille | Action sur carte | |

**User's choice:** Tout « dans la fiche », invité = fiche identique, barre + filtres, Courses depuis la fiche.

## Catégories + tags (extra)

| Option | Description | Selected |
|--------|-------------|----------|
| Inline + paramètres | « + Nouvelle catégorie » dans le formulaire + gestion paramètres | ✓ |
| Paramètres seuls | Liste figée dans le formulaire | |
| Pastilles + saisie libre | Multi-sélection + frappe créant le tag | ✓ |
| Déroulant multiple | Liste déroulante | |

**User's choice:** Inline + paramètres, pastilles + saisie libre.

## Référence impaire (extra)

| Option | Description | Selected |
|--------|-------------|----------|
| Démarre à la réf | 3 autorisé comme point de départ | |
| Arrondir au pair | Réf arrondie (3→4) | ✓ |

**User's choice:** Arrondir au pair (résout le edge SPEC « servings impaire »).

---

## the agent's Discretion

Libellés, tailles de cartes, règle d'accord détaillée, nom des tables/colonnes, forme du ticket invité.

## Deferred Ideas

Photos d'étape ; difficulté/source URL ; nutrition, import URL, commentaires, planning repas (hors SPEC).
