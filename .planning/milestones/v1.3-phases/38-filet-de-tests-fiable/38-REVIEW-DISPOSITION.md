---
phase: 38
review: 38-REVIEW.md
disposition: 2026-11-08
---

# Phase 38 — Disposition des findings de review

Source : 38-REVIEW.md (depth standard, 8 fichiers). Compte : 0 Critical, 0 Warning, 4 Info.

| # | Sévérité | Finding | Disposition | Justification |
|---|----------|---------|-------------|---------------|
| 1 | Info | Paramètre masquant le nom de la fonction `debutSemaineIso` | open | Cosmétique ; ne touche ni comportement ni sûreté. Consolidation possible en phase de refactor future. |
| 2 | Info | Dégradation théorique si `household_id` était `null` (chemin nommé pour la couverture, pas pour les membres) | open | Chemin impossible à l'état actuel du schéma (FK NOT NULL) ; noté pour vigilance si le modèle d'ardoise évolue (phase 40). |
| 3 | Info | Fenêtre microscopique minuit dans `seed.test.ts` | open | Fenêtre de course sub-seconde lors d'un passage de minuit pendant l'exécution du test ; non reproductible en pratique, coût de test > bénéfice. |
| 4 | Info | Duplication résiduelle `toUtcDate`/`isoOfUtc` (préexistante) | open | Dette préexistant à la phase 38 (hors périmètre, §2.7 pas de réparation opportuniste) ; consolidable avec le point 1. |

Aucun Critical ni Warning : aucune correction requise avant la vérification de goal. Les 4 Info restent ouvertes pour tri futur (phase de refactor ou audit de jalon).
