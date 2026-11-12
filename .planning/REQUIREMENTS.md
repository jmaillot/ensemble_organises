# Requirements: Ensemble & Organisés

**Defined:** 2026-11-12
**Core Value:** PWA foyers — l'app de poche du quotidien familial, fiable hors-ligne, joignable en un tap, sans store.

## v1 Requirements

Jalon v1.5 « Audit complet & durcissement » — auditer tout le dépôt sur 4 axes, corriger les constats majeurs uniquement, sans nouvelle fonctionnalité ni rupture. Chaque constat porte une preuve fichier:ligne (§2.7-I : une absence affirmée est une affirmation) ; chaque fix est un commit atomique avec chaîne §2.7 verte ; les migrations de fix sont forward-only et testées.

### Sécurité / RLS (axe P1)

- [ ] **SEC-01** : Chaque constat de l'audit sécurité est consigné avec preuve fichier:ligne (politique RLS manquante/permissive, mismatch de mode auth d'Edge Function sous `FUNCTIONS_VERIFY_JWT=false`, helper SECURITY DEFINER à `search_path` mutable, politique Storage trop large, secret exposé) — l'audit couvre les 83 tables / 286 politiques / 16 Edge Functions / buckets Storage via les lints SQL officiels (pg-meta) exécutés par `psql.sh` + revue humaine
- [ ] **SEC-02** : La matrice de couverture RLS par table (SELECT/INSERT/UPDATE/DELETE + cas négatifs) est remplie pour les 83 tables — les faux positifs connus (rôle postgres, helpers SECURITY DEFINER légitimes, couverture indirecte par foyer) sont exclus avec justification
- [ ] **SEC-03** : Tout constat majeur de sécurité est corrigé — un commit atomique par constat, migration forward-only (0182+) testée si le fix est SQL, chaîne §2.7 verte au plan porteur
- [ ] **SEC-04** : Les surfaces verrouillées (outbox, bandeau offline, SW, buster `v2`) sont verify-only — toute observation est consignée « verrouillé — hors périmètre », jamais traitée comme un constat

### Performance / requêtes

- [ ] **PERF-01** : La baseline du bundle est mesurée et consignée (source-map-explorer one-shot) ; les requêtes Supabase sont auditées (N+1, colonnes inutiles, index manquants via EXPLAIN) sur les parcours clés
- [ ] **PERF-02** : Les re-renders React sont audités par revue humaine (DevTools Profiler / instrumentation temporaire `<Profiler>`) — aucun détecteur automatisé React 19 n'est ajouté
- [ ] **PERF-03** : Tout constat majeur de performance est corrigé avec preuve avant/après mesurée (index manquant = migration testée ; re-render = mesure avant/après) — jamais de mémo préventif sans mesure

### Accessibilité (WCAG 2.2 AA)

- [ ] **A11Y-01** : Les parcours clés (connexion, rejoindre un foyer, dashboard, courses, tâches, ardoise) sont scannés par axe-core (`@axe-core/playwright` dans le harnais e2e existant) avec allowlist des violations acceptées consignée dans le rapport — une seule devDependency ajoutée
- [ ] **A11Y-02** : Les primitives `components/ui` sont revues d'abord (focus visible, navigation clavier, cibles tactiles ≥ 44 px, contrastes, attributs ARIA), puis les pages des modules
- [ ] **A11Y-03** : Tout constat majeur d'accessibilité est corrigé sans casser le design photo-overlay — les contrastes sur photos passent par l'overlay, jamais par la photo

### Qualité / transverse (en dernier — revue finale des fixes précédents)

- [ ] **QUA-01** : Les 25 modules + `lib/`, `hooks/`, `stores/`, `components/` sont audités par revue humaine (code mort, duplications, cohérence des patterns, gestion d'erreur, zones jamais relues depuis v0.9) ; `knip` et `oxlint` en one-shot jetables (rien de persisté, aucune directive — la garde `no-eslint-directive.test.ts` reste verte)
- [ ] **QUA-02** : La dérive docs/code est corrigée : le module `documents` est documenté dans AGENTS.md §3 (ou l'écart est justifié) — l'audit mesure le code, pas la prose
- [ ] **QUA-03** : Tout constat majeur de qualité est corrigé atomiquement ; les tests SQL périmés (assertions sur des définitions dépassées) sont corrigés vers la définition effective
- [ ] **QUA-04** : Les rapports consolidés sont versionnés sous `docs/AUDIT-*.md` (un par axe : preuve par constat, verdict majeur/moyen/mineur, disposition fix/backlog/verrouillé) ; le backlog durable des moyens/mineurs est créé ; AGENTS.md est mis à jour si une convention évolue

### Transverse (tous les axes)

- [x] **TRA-01** : Le seuil majeur-vs-moyen est défini dans la SPEC de chaque phase audit (majeur = violation de §2.6/§6 ou impact utilisateur prouvé ; « cohérence » ou « best practice » sans preuve = moyen/mineur) — la stop-list d'over-reach figure dans le brief de chaque phase
- [ ] **TRA-02** : Tout nouveau vérificateur introduit est prouvé sur des cas qui doivent échouer (§2.7-B) avant de produire un constat retenu
- [ ] **TRA-03** : La chaîne §2.7 complète est verte à l'état final du jalon et consignée — aucun constat sans preuve, aucun fix sans test

## v2 Requirements

### Instruments durables (P3 — seulement si un constat les justifie, décision produit)

- **GUARD-01** : Garde de couverture RLS permanent en test SQL (si l'audit révèle des trous structurels récurrents)
- **GUARD-02** : Spec axe-core permanente dans le harnais e2e (si les scans one-shot révèlent des régressions récurrentes)
- **GUARD-03** : Budget bundle en CI (si la baseline révèle une dérive non maîtrisée)
- **LINT-01** : Adoption d'un linter permanent (nécessite modification d'AGENTS.md d'abord — jamais un fix de ce jalon)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Toute nouvelle surface produit | Jalon d'audit — aucune fonctionnalité nouvelle |
| Anti-features verrouillées : outbox, bandeau offline (MIN dataUpdatedAt), SW précache+push, buster `v2` | Verrouillées v1.1/v1.3 — verify-only |
| Reprise campagne CACHE-01 / COLD-02 | Différée 3 jalons — session dédiée avec appareil au jalon suivant |
| Rejeu GATE-01, purge comptes e2e résiduels | Observatoire manuel, hors jalon |
| Adoption d'un linter permanent | Convention no-linter délibérée (AGENTS.md §2.7) — recommandation écrite au pire |
| Migration destructive du schéma | Fixes forward-only uniquement (0182+) |
| Correctifs moyens/mineurs en code | Backlog durable — seul le majeur est corrigé |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEC-01 | Phase 45 | Pending |
| SEC-02 | Phase 45 | Pending |
| SEC-03 | Phase 46 | Pending |
| SEC-04 | Phase 45 | Pending |
| PERF-01 | Phase 47 | Pending |
| PERF-02 | Phase 47 | Pending |
| PERF-03 | Phase 48 | Pending |
| A11Y-01 | Phase 49 | Pending |
| A11Y-02 | Phase 49 | Pending |
| A11Y-03 | Phase 50 | Pending |
| QUA-01 | Phase 51 | Pending |
| QUA-02 | Phase 51 | Pending |
| QUA-03 | Phase 52 | Pending |
| QUA-04 | Phase 52 | Pending |
| TRA-01 | Phase 45 | Complete |
| TRA-02 | Phase 45 | Pending |
| TRA-03 | Phase 52 | Pending |

**Coverage:**
- v1 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0 ✓

---
*Requirements defined: 2026-11-12*
*Last updated: 2026-11-12 after initial definition*
