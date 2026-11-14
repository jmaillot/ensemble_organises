# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.5 — Audit complet & durcissement

**Shipped:** 2026-11-14
**Phases:** 8 | **Plans:** 28 | **Sessions:** ~10

### What Was Built
- 4 audits complets du dépôt avec preuves datées fichier:ligne : sécurité/RLS (matrice 83 tables, 16 Edge Functions, 212 helpers, secrets), performance (bundle, N+1, EXPLAIN, re-renders), accessibilité WCAG 2.2 AA (harnais axe 89-91 règles, 6 parcours × 2 projets), qualité transverse (code mort, duplications, dérive docs/code)
- Corrections des majeurs : lint multiple permissive policies (0183 + testkit), settlement ardoise single-pass (0182, −67 % mesuré 31,06 → 10,34 ms), primitives a11y (outline focus, cibles ≥ 44 px, skip-link, Label in Name), fixes qualité (DD-01..03)
- Consolidation versionnée : `docs/AUDIT-{SECURITE,PERFORMANCE,ACCESSIBILITE,QUALITE}.md` + backlog durable `docs/TODO.md` (13 entrées avec quoi/pourquoi/comment vérifier)
- Chaîne de vérification §2.7 verte à l'état final, blocs datés 2026-11-14 : typecheck, 2006 tests unitaires, build PWA, e2e 179 passed/11 skipped, check-sql-statique, test-db.sh 106/106

### What Worked
- Structure audit-first-per-axis avec ordre imposé par les dépendances : chaque phase d'audit est read-only (D-04), les fixes suivent dans une phase dédiée — aucun aller-retour improvisé
- Preuves rouge-avant-vert systématiques (lints, tests a11y, tests SQL) : chaque vérificateur a été prouvé capable d'échouer avant d'être utilisé
- Consolidation obligatoire en fin de jalon : rien d'audité ne vit uniquement dans `.planning/phases/` (gitigné) — le savoir passe en `docs/` versionné
- Le vérificateur de phase qui recouvre (`covered_digest`) a rattrapé proprement les modifications post-vérification sans re-exécution complète

### What Was Inefficient
- La vérification 49 marquée `stale` par le harnais modifié en 50-01 : le fingerprint du vérificateur n'avait pas anticipé le couplage inter-phases — résolu à la main en réétendant `covered_files`
- `52-04-SUMMARY.md` perdu par l'exécuteur, reconstruit par l'orchestrateur depuis les commits
- PERF-47-01 (preuve d'absence) oubliée à la recopie du consolidé performance ; comptage 7/8 hérité verbatim de 49-AUDIT — les consolidés recopiés à la main dérivent

### Patterns Established
- Gabarit de preuve SQL §2.7-I : seed borné → garde-fous → EXPLAIN daté sous RLS → rollback → preuves d'absence
- Lints officielles versionnées avec preuve rouge-avant-vert sur objet fautif jetable rollbacké
- Fiches de constat au format unique (ID, parcours, sévérité, preuve, disposition) traversant audit → fix → consolidé → backlog
- Limites honnêtement vides plutôt que remplis inventés (12 mesures Profiler en attente humaine, §2.7-I)

### Key Lessons
1. Un audit sans disposition tracée de chaque fiche (fix/verrouillé/backlog/refuté) produit du papier mort — la discipline disposition-par-fiche a rendu l'intégration 7/7 vérifiable.
2. Les preuves datées à l'état FINAL du jalon (52-06) sont ce qui permet de conclure : les preuves intermédiaires ne suffisent pas quand des commits ultérieurs touchent les mêmes fichiers.
3. La dette déclarée et bornée (§2.7-F : push Web Push non prouvé, mesure humaine manquante) coûte moins cher qu'une preuve fabriquée.

### Cost Observations
- Model mix: orchestrateur flash, exécuteurs/vérificateurs sur profils standards
- Sessions: ~10 sur 3 jours (2026-11-12 → 2026-11-14), 86 commits, 46 fichiers/3 462 insertions
- Notable: les phases d'audit sont peu coûteuses en commits mais très coûteuses en lecture — les sous-agents d'audit parallèles étaient indispensables

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | ~15 | 7 | Cadrage produit, RLS dès le départ |
| v1.1 | ~8 | 4 | Durcissement PWA, preuves navigateur réel |
| v1.2 | ~5 | 2 | Plus jamais d'effacement silencieux — filets de tests |
| v1.3 | ~7 | 5 | Solde de dette, outillage prod de vérification |
| v1.4 | ~4 | 2 | Preuve prod avant décision, décision documentée |
| v1.5 | ~10 | 8 | Audit-first-per-axis avec phases de fixes séparées, consolidation obligatoire en docs/ versionnés |

### Cumulative Quality

- Suites : 2 006 tests unitaires, 179 e2e passed/11 skipped documentés en ligne, 106 tests SQL, 232 fonctions sous contrôle statique SQL
- Sécurité : 0 threat ouvert, RLS 83 tables couvertes, zéro secret en base ou dans les logs
- Accessibilité : harnais axe permanent avec garde sur 18 exports JSON, règles WCAG 2.2 par défaut
- Dette suivie dans `docs/TODO.md` et `.planning/v1.5-MILESTONE-AUDIT.md`
