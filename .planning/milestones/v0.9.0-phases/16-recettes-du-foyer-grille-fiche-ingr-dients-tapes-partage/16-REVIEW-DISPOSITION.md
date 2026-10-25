---
phase: 16-recettes-du-foyer-grille-fiche-ingr-dients-tapes-partage
review: 16-REVIEW.md
date: 2026-10-14
open: 16 of 17
fixed: 1 of 17
---

# Phase 16: Review Disposition

Source: `16-REVIEW.md` (1 critical, 9 warnings, 7 info — status `issues_found`).
Code review is advisory; this ledger records what happened to each finding.

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | fixed | Orchestrator fix 0a6a47c: bouton favori en `relative z-10` au-dessus du Link overlay ; Vitest recettes 33/33 + typecheck verts |
| WR-01 | warning | open | Non traité — coercition quantité invalide vers « au goût » ; à trancher (erreur visible vs silencieux) |
| WR-02 | warning | open | Non traité — `setRecipeTags` non atomique ; backlog |
| WR-03 | warning | open | Non traité — half-apply reorder/envoi Courses ; backlog |
| WR-04 | warning | open | Non traité — collisions `position` après suppressions ; backlog |
| WR-05 | warning | open | Non traité — curseur servings partagé entre recettes ; backlog |
| WR-06 | warning | open | Non traité — `toggleFavorite` sans garde `canWrite` (serveur refuse de toute façon) ; backlog |
| WR-07 | warning | open | Non traité — clés React sur texte de ligne print ; backlog |
| WR-08 | warning | open | Non traité — garde scope inter-foyer `category_id` côté client (RLS serveur fait foi) ; backlog |
| WR-09 | warning | open | Non traité — `callRecipeInvite` TypeError si mal configuré ; backlog |
| IN-01 | info | open | Noté — champs audit forgeables client (serveur fait foi) |
| IN-02 | info | open | Noté — cover orpheline si save échoue après upload |
| IN-03 | info | open | Noté — « 0 oeuf » singulier |
| IN-04 | info | open | Noté — quantités extrêmes remontent erreur DB brute |
| IN-05 | info | open | Noté — dialogue partage masqué si summary échoue |
| IN-06 | info | open | Noté — liens navigation redondants par carte (voulu : accessibilité) |
| IN-07 | info | open | Noté — aperçu Courses périmé si liste cible change |

CR-01 was the only finding blocking correct behavior (favorite toggle unreachable by pointer); verified in code and fixed. Warnings/Infos are robustness polish, none corrupts data or opens access — serveur (RLS + RPC + child-guard) reste la barrière. Re-check in UAT via `/gsd-verify-work 16`.
