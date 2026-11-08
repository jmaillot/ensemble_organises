---
phase: 36
review: 36-REVIEW.md
status: issues_found
counts:
  critical: 0
  major: 1
  minor: 3
  total: 4
written: 2026-11-07
---

# Disposition des findings — Phase 36

Registre par finding : chaque ligne trace ce qui est devenu le finding.
Valeur par défaut à l'écriture : `open`. Trier avant `phase.complete` ; les lignes
restées `open` après tri suivent leur finding (fix immédiat, UAT, ou backlog).

| Finding | Sévérité | Disposition | Note |
|---------|----------|-------------|------|
| MAJ-01 | major | open | Audit D-04 duplique `LIBELLE_GENERIQUE` localement au lieu d'importer — une divergence silencieuse est possible (`outbox.test.ts:340`). À corriger avant UAT. |
| MIN-01 | minor | open | `REMOVE_MISSING`/`REMOVE_WHERE_MISSING` tombent dans le libellé générique — famille dédiée candidate à l'UAT (`outbox.ts:364-369`). |
| MIN-02 | minor | open | Famille `'403'` suppose une cause portant `code: '403'` — préexistant, à trancher hors phase. |
| MIN-03 | minor | open | `failureLabel` exige un champ `message` jamais lu — choix documenté, argument fantôme pour les nouveaux appelants (`outbox.ts:364`). |

Récapitulatif à l'écriture : 0 critical, 1 major, 3 minor — 4/4 `open`.
