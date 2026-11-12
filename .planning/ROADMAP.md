# Roadmap: Ensemble & Organisés

## Milestones

- ✅ **v1.0 Mise en ligne publique** (phases 25-31, shipped 2026-11-04)
- ✅ **v1.1 PWA durcie mobile-first** (phases 32-35, shipped 2026-11-07)
- ✅ **v1.2 Finition de la dette offline** (phases 36-37, shipped 2026-11-08)
- ✅ **v1.3 Solde de la dette** (phases 38-42, shipped 2026-11-10) — [archive](milestones/v1.3-ROADMAP.md)
- ✅ **v1.4 Preuve & décision** (phases 43-44, shipped 2026-11-12) — [archive](milestones/v1.4-ROADMAP.md)
- 🚧 **v1.5 Audit complet & durcissement** (phases 45-52, en cours)

## Phases

<details>
<summary>✅ v1.0 Mise en ligne publique (Phases 25-31) — SHIPPED 2026-11-04</summary>

- [x] Phase 25: Profils enfants gérés par le parent — completed 2026-10-24
- [x] Phase 26: Amélioration paiements — completed 2026-10-25
- [x] Phase 27: Suppression de compte RGPD — completed 2026-10-27
- [x] Phase 28: Signature e-mail & landing — completed 2026-10-28
- [x] Phase 29: Messagerie v2 — completed 2026-10-30
- [x] Phase 30: Fin de v1.0 — completed 2026-10-31
- [x] Phase 31: Inscriptions ouvertes — completed 2026-11-03

</details>

<details>
<summary>✅ v1.1 PWA durcie mobile-first (Phases 32-35) — SHIPPED 2026-11-07</summary>

- [x] Phase 32: Install raccourcis — completed 2026-11-05
- [x] Phase 33: Cache de lecture offline — completed 2026-11-05
- [x] Phase 34: File d'écriture rejeu — completed 2026-11-06
- [x] Phase 35: Deep links validation multi-OS — completed 2026-11-07

</details>

<details>
<summary>✅ v1.2 Finition de la dette offline (Phases 36-37) — SHIPPED 2026-11-08</summary>

- [x] Phase 36: Outbox plus jamais d'effacement silencieux — completed 2026-11-08
- [x] Phase 37: Filet de tests fiable — completed 2026-11-08

</details>

<details>
<summary>✅ v1.3 Solde de la dette (Phases 38-42) — SHIPPED 2026-11-10</summary>

- [x] Phase 38: Filet de tests fiable (4 plans) — completed 2026-11-08
- [x] Phase 39: Outillage prod de vérification (2 plans) — completed 2026-11-09
- [x] Phase 40: Ardoise « Rejoindre via mon compte » (3 plans) — completed 2026-11-10
- [x] Phase 41: Gate SW simulable (1 plan) — completed 2026-11-10
- [x] Phase 42: Cold start mesuré puis corrigé + décision cache (3 plans) — completed 2026-11-10

</details>

<details>
<summary>✅ v1.4 Preuve & décision (Phases 43-44) — SHIPPED 2026-11-12</summary>

- [x] Phase 43: Preuve prod du bridge ardoise (W1) (1 plan) — completed 2026-11-11
- [x] Phase 44: Décision cache maxAge par famille CACHE-01 (2 plans) — completed 2026-11-12

</details>

## Current Milestone: v1.5 Audit complet & durcissement

**Goal :** Auditer l'intégralité du dépôt (qualité, sécurité/RLS, performance, accessibilité) et corriger uniquement les constats majeurs — sans nouvelle fonctionnalité, sans rupture. Structure : audit-first-per-axis, ordre imposé par les dépendances (RLS d'abord = risque dominant ; audit qualité en dernier = revue finale des fixes eux-mêmes). Les exigences transverses TRA-01/02 s'ancrent dans la phase 45 (première SPEC d'audit qui définit le seuil et introduit les premiers vérificateurs prouvés) ; TRA-03 se clôt en phase 52 (chaîne §2.7 verte à l'état final du jalon).

- [ ] **Phase 45: Audit sécurité/RLS** - Rapport complet : matrice RLS 83 tables, 16 Edge Functions, secrets, Storage, tokens — read-only, seuil + stop-list définis (SEC-01, SEC-02, SEC-04, TRA-01, TRA-02)
- [ ] **Phase 46: Fixes RLS majeurs** - Un commit atomique par constat majeur, migrations forward-only 0182+ testées (SEC-03)
- [ ] **Phase 47: Audit performance/requêtes** - Bundle, N+1, index, re-renders — sur le schéma post-fixes RLS (PERF-01, PERF-02)
- [ ] **Phase 48: Fixes perf majeurs** - Preuve avant/après mesurée par fix, jamais de mémo préventif (PERF-03)
- [ ] **Phase 49: Audit accessibilité WCAG 2.2 AA** - axe-core sur les parcours clés + revue primitives, read-only (A11Y-01, A11Y-02)
- [ ] **Phase 50: Fixes a11y majeurs** - Primitives d'abord, design photo-overlay intouché (A11Y-03)
- [ ] **Phase 51: Audit qualité transverse** - Code mort, duplications, cohérence, zones jamais relues depuis v0.9 — revue finale des fichiers que les fixes ont modifiés (QUA-01, QUA-02)
- [ ] **Phase 52: Fixes qualité + closing du jalon** - Fixes majeurs, consolidation docs/AUDIT-*.md, backlog durable, chaîne §2.7 verte consignée (QUA-03, QUA-04, TRA-03)

### Phase Details

### Phase 45: Audit sécurité/RLS

**Goal**: L'exposition de données de foyer est entièrement cartographiée et prouvée — tout constat porte une preuve fichier:ligne, les faux positifs sont exclus avec justification, et le seuil majeur-vs-moyen est posé pour tout le jalon.
**Depends on**: Nothing (first phase of v1.5)
**Requirements**: SEC-01, SEC-02, SEC-04, TRA-01, TRA-02
**Success Criteria** (what must be TRUE):
  1. Le rapport d'audit consigne chaque constat avec sa preuve fichier:ligne (politique RLS manquante/permissive, mismatch de mode auth Edge sous `FUNCTIONS_VERIFY_JWT=false`, helper SECURITY DEFINER à `search_path` mutable, Storage trop large, secret exposé) — toute absence affirmée porte sa preuve « commande → résultat daté » (§2.7-I)
  2. La matrice de couverture RLS (83 tables × SELECT/INSERT/UPDATE/DELETE + cas négatifs) est remplie et prouvée par exécution en `authenticated` — jamais par lecture seule de `pg_policies` ; les faux positifs connus (rôle postgres, helpers légitimes, couverture indirecte) sont exclus avec justification
  3. La SPEC de la phase définit le seuil majeur-vs-moyen (TRA-01 : majeur = violation §2.6/§6 prouvée ou impact utilisateur ; « cohérence » sans preuve = moyen/mineur) et le brief porte la stop-list d'over-reach — les surfaces verrouillées (outbox, bandeau offline, SW, buster `v2`) sont verify-only avec mentions « verrouillé — hors périmètre » (SEC-04)
  4. Les lints SQL introduits (pg-meta versionnés dans `supabase/tests/lints/`) sont prouvés sur des cas qui doivent échouer avant de produire un constat retenu (TRA-02, §2.7-B)
  5. Aucun fichier applicatif n'est modifié — la phase est read-only, ses artefacts vivent dans `.planning/phases/45/` (gitignoré)

**Plans**: 2/4 plans executed

Plans:
- [x] 45-01-PLAN.md — SPEC seuil TRA-01 + stop-list SEC-04 + preuve Docker + récupération lints pg-meta (provenance D-09)
- [x] 45-02-PLAN.md — Lints pg-meta portés, prouvés rouge-avant-vert (TRA-02), versionnés sous supabase/tests/lints/
- [ ] 45-03-PLAN.md — Script traversant + matrice RLS 83×4 exécutée en authenticated (SEC-02)
- [ ] 45-04-PLAN.md — Revue Edge Functions / Storage / helpers / secrets + consolidation du rapport unique (SEC-01, SEC-04)

### Phase 46: Fixes RLS majeurs

**Goal**: Tout constat majeur de sécurité de la phase 45 est corrigé — un commit atomique par constat, sans que la chaîne §2.7 ne se dégrade jamais.
**Depends on**: Phase 45
**Requirements**: SEC-03
**Success Criteria** (what must be TRUE):
  1. Chaque constat majeur du rapport 45 a son commit atomique (SQL et frontend jamais dans le même commit) ; les moyens/mineurs vont au backlog, pas au code
  2. Tout fix SQL est une migration forward-only (0182+) testée — les migrations appliquées ne sont jamais réécrites ; `sh scripts/test-db.sh` est vert et obligatoire pour tout changement SQL
  3. La chaîne §2.7 complète est verte à l'état final de chaque plan porteur (typecheck, tests, build, e2e, contrôles SQL statiques)
  4. Les cas négatifs SQL (sans foyer, inter-foyer, escalade de privilèges) accompagnent chaque fix de politique et sont vus rouges avant verts

**Plans**: TBD

### Phase 47: Audit performance/requêtes

**Goal**: La performance des parcours clés est mesurée sur le schéma post-fixes RLS — bundle, requêtes et re-renders, chaque constat mesuré et jamais deviné.
**Depends on**: Phase 46 (les politiques/vues changent les plans de requête à auditer)
**Requirements**: PERF-01, PERF-02
**Success Criteria** (what must be TRUE):
  1. La baseline du bundle est mesurée et consignée (source-map-explorer one-shot, rien de persisté dans le dépôt)
  2. Les requêtes Supabase des parcours clés sont auditées (N+1, colonnes inutiles, index manquants) — chaque index proposé porte son `EXPLAIN ANALYZE` daté
  3. Les re-renders React sont audités par revue humaine (DevTools Profiler / `<Profiler>` temporaire jamais commité) — aucun détecteur automatisé React 19 n'est ajouté (PERF-02)
  4. Chaque constat porte sa preuve (commande → résultat daté, §2.7-I) ; le seuil et la stop-list (query-policy.ts, différés CACHE-01/COLD-02, systèmes verrouillés) figurent dans la SPEC et le brief
  5. La phase est read-only — aucun fichier applicatif modifié

**Plans**: TBD

### Phase 48: Fixes perf majeurs

**Goal**: Tout constat majeur de performance est corrigé avec preuve avant/après mesurée — jamais d'optimisation préventive sans mesure.
**Depends on**: Phase 47 (audit complet avant le premier fix — séparation audit/fix stricte)
**Requirements**: PERF-03
**Success Criteria** (what must be TRUE):
  1. Chaque fix porte sa mesure avant/après (index = `EXPLAIN ANALYZE` avant/après + migration testée ; re-render = mesure Profiler avant/après) — un fix sans preuve mesurée est refusé
  2. Un commit atomique par fix ; toute lecture des conventions existantes (commentaires de raison des mémo) précède toute modification
  3. `test-db.sh` obligatoire pour tout changement SQL (index = migration non destructive 0182+) ; chaîne §2.7 verte à chaque plan
  4. Les moyens/mineurs vont au backlog — aucun mémo préventif, aucun index « entreprise » sans mesure

**Plans**: TBD

### Phase 49: Audit accessibilité (WCAG 2.2 AA)

**Goal**: L'accessibilité des parcours clés et des primitives est cartographiée par axe-core et revue humaine — sur les composants finaux après les fixes perf.
**Depends on**: Phase 48 (les composants doivent être finaux avant le scan WCAG)
**Requirements**: A11Y-01, A11Y-02
**Success Criteria** (what must be TRUE):
  1. Les parcours clés (connexion, rejoindre un foyer, dashboard, courses, tâches, ardoise) sont scannés par axe-core (`@axe-core/playwright` dans le harnais e2e existant) — une seule devDependency ajoutée, la spec e2e reste verte
  2. Les primitives `components/ui` sont revues d'abord (focus visible, navigation clavier, cibles ≥ 44 px, contrastes, ARIA), puis les pages des modules (A11Y-02)
  3. Le rapport classe chaque violation axe bloquant/informatif/design-verrouillé et consigne l'allowlist des violations acceptées ; les parcours clavier réels sont documentés, pas seulement les attributs
  4. La SPEC définit le seuil (critical/serious = majeur) et porte la stop-list (design photo-overlay intouché) ; la phase est read-only

**Plans**: TBD

### Phase 50: Fixes a11y majeurs

**Goal**: Tout constat majeur d'accessibilité est corrigé sans casser le design — les primitives d'abord pour propager aux 25 modules.
**Depends on**: Phase 49
**Requirements**: A11Y-03
**Success Criteria** (what must be TRUE):
  1. Les fixes de contraste sur photos passent par l'overlay, jamais par la photo — le design photo-overlay est intact après la phase
  2. Les primitives `components/ui` sont corrigées en premier (ratio effort/impact maximal) ; chaque fix comportemental porte son test vu rouge avant vert
  3. Un commit atomique par fix ; la chaîne §2.7 complète (e2e comprise) est verte à chaque plan
  4. Aucune violation axe bloquante des parcours clés ne subsiste au scan final (hormis l'allowlist consignée)

**Plans**: TBD

### Phase 51: Audit qualité transverse

**Goal**: La qualité du dépôt entier est revue — code mort, duplications, cohérence, zones jamais relues depuis v0.9 — et sert de revue finale des fichiers que les fixes précédents ont modifiés.
**Depends on**: Phase 50 (audit en dernier = il relit ce qui vient de changer)
**Requirements**: QUA-01, QUA-02
**Success Criteria** (what must be TRUE):
  1. Les 25 modules + `lib/`, `hooks/`, `stores/`, `components/` sont audités par revue humaine — chaque constat porte sa preuve fichier:ligne, la dérive docs/code est mesurée (le module `documents` documenté dans AGENTS.md §3 ou l'écart justifié)
  2. `knip` et `oxlint` tournent en one-shot jetables (rien de persisté, aucune directive) — la garde `no-eslint-directive.test.ts` reste verte (QUA-01)
  3. Avant de classer du code mort, les quatre câblages invisibles sont vérifiés (pg_cron, testkit SQL, deploy-functions.sh, mode démo Dexie) — l'absence affirmée porte sa preuve (§2.7-I)
  4. La SPEC définit le seuil et la stop-list (conventions intouchables §2.7 — un constat dont le fix toucherait §2.7 est reclassé moyen/mineur) ; la phase est read-only

**Plans**: TBD

### Phase 52: Fixes qualité + closing du jalon

**Goal**: Les constats majeurs de qualité sont corrigés et le jalon se clôt avec des rapports consolidés versionnés, un backlog durable, et la chaîne §2.7 verte consignée à l'état final.
**Depends on**: Phase 51
**Requirements**: QUA-03, QUA-04, TRA-03
**Success Criteria** (what must be TRUE):
  1. Chaque fix majeur est atomique (chaque suppression = commit isolé avec chaîne complète e2e comprise) ; les tests SQL périmés (assertions sur des définitions dépassées) sont corrigés vers la définition effective (QUA-03)
  2. Les rapports consolidés sont versionnés sous `docs/AUDIT-*.md` (un par axe : preuve par constat, verdict majeur/moyen/mineur, disposition fix/backlog/verrouillé) — rien d'audité ne vit uniquement dans `.planning/phases/` (QUA-04)
  3. Le backlog durable des moyens/mineurs existe ; AGENTS.md est mis à jour si une convention évolue (dont le module `documents` en §3)
  4. La chaîne §2.7 complète est verte à l'état final du jalon et consignée (TRA-03) — aucun constat sans preuve, aucun fix sans test

**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 45. Audit sécurité/RLS | 2/4 | In Progress|  |
| 46. Fixes RLS majeurs | 0/? | Not started | - |
| 47. Audit performance/requêtes | 0/? | Not started | - |
| 48. Fixes perf majeurs | 0/? | Not started | - |
| 49. Audit accessibilité WCAG 2.2 AA | 0/? | Not started | - |
| 50. Fixes a11y majeurs | 0/? | Not started | - |
| 51. Audit qualité transverse | 0/? | Not started | - |
| 52. Fixes qualité + closing | 0/? | Not started | - |
