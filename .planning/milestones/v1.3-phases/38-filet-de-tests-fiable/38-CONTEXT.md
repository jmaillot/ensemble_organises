# Phase 38: Filet de tests fiable - Context

**Gathered:** 2026-11-08
**Status:** Ready for planning

<domain>
## Phase Boundary

La chaîne de vérification §2.7 redevient un instrument de confiance pour tout le jalon v1.3 : les 2 flakes du dimanche (menu-page + household-store WR-03) sont corrigés à la racine via des semis lundi-based centralisés, IN-01 (garde morte `api.ts:315`) est supprimée et IN-02 (select `service_role` non borné) est borné. Zéro nouvelle surface produit.

Exclusions explicites du périmètre : la spec e2e join-token périmée (TEST-02, phase 39) et l'outillage prod du smoke-test (SMOKE-01, phase 39).

</domain>

<decisions>
## Implementation Decisions

### Périmètre du balayage des semis

- **S-01: Toute la classe, pas seulement les 2 flakes.** Les semis menu-page et household-store WR-03 ET le semis démo `app/src/lib/data/seed.ts` (qui utilise le même pattern `day(offset)` relatif, l.98/l.161) sont recalibrés sur les helpers lundi-based — plus aucun `day()`/`new Date()` ad hoc dans les semis. `seed.test.ts` est maintenu vert. (§2.7 E — corriger la classe, pas l'instance.) — **Reversibility:** reversible — local, tests only.
- **S-02: Preuve « quel que soit le jour » par 7 dates simulées.** Les tests paramétriques injectent la date en entrée du helper (une exécution par jour de semaine) — jamais d'horloge figée dans les tests (principe « corriger le semis, pas l'horloge »). La preuve ne dépend pas d'attendre le vrai dimanche.
- **S-03: Helpers de production dans `lib/datetime.ts` existant** (déjà testé), exportés — `debutSemaineIso`/`jourSemaine` deviennent l'utilitaire de référence consommable par menu/calendrier dans les phases futures. Pas de module de test dédié.

### Vert e2e vs spec join-token (cohabitation avec la phase 39)

- **J-01: Exclusion explicite, pas de contorsion.** SC2 (« plus aucun rouge préexistant assumé ») s'applique aux flakes corrigés en 38. La spec join-token reste le SEUL rouge connu, listé noir sur blanc comme exclus du critère 38 et soldé en 39 — consigné dans ce CONTEXT et dans la VALIDATION de la phase.
- **J-02: La spec join-token continue de tourner dans le run e2e standard** avec son rouge documenté — pas de `test.skip`, pas de grepExclude, pas de renommage. Le rouge visible rappelle la dette jusqu'à la réécriture en 39. (§2.7 I — un skip qui traîne est une absence affirmée.)

### WR-03 et discipline de correction des flakes

- **W-01: Cause vérifiée avant fix ; corrigée dans la phase quelle que soit sa nature.** Le protocole établit d'abord si WR-03 (household-store) est bien date-dépendante. Si le diagnostic prouve une cause non-date (timing, ordre async, cache…), elle est corrigée DANS la phase 38 — la phase ne se termine pas avec le flake ouvert. L'intention du SC1 est « la suite est fiable », pas seulement « les semis sont lundi-based ».
- **W-02: Protocole écrit type D-01 (phase 37)** : reproduction avant fix (exécutions répétées, date forcée + charge), preuve d'innocence du code de production (même protocole sur l'arbre de base), correction test-only, diagnostic consigné dans `docs/RETROSPECTIVE.md`. Même discipline que le flocon test D.

### Bornage IN-02

- **I-01: Classe entière dans la fonction.** Borner le select visé (`index.ts:656` — Edge Function exacte à confirmer au plan) ET balayer les autres selects `service_role` de la même fonction ; les occurrences présentant le même risque sont bornées. (§2.7 E.)
- **I-02: Forme du bornage — LIMIT explicite + ordre déterministe (ORDER BY).** Pas de pagination complète sans besoin réel du consommateur ; le plan documentera le besoin du consommateur avant de choisir la borne.
- **I-03:** `sh scripts/test-db.sh` obligatoire si du SQL est touché (Docker disponible en local) ; si du SQL n'est PAS touché (fix Edge Function TypeScript seulement), la chaîne §2.7 standard s'applique.

### the agent's Discretion
- La cause exacte de WR-03 et la technique de correction (le protocole W-02 la désigne).
- La liste exhaustive des semis couverts par S-01 (inventaire des usages `day()`/`new Date()` dans les semis).
- L'ordre des deux corrections (flakes d'abord ou IN d'abord) — les deux sont indépendantes.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Exigences et critères de la phase
- `.planning/ROADMAP.md` §Phase 38 — goal et 4 success criteria
- `.planning/REQUIREMENTS.md` §TEST-01, TEST-03, DEBT-01 — exigences verrouillées

### Garde-fous de vérification
- `AGENTS.md` §2.7 — chaîne avant commit ; §B « vu rouge avant d'être vu vert » ; §E « corriger la classe, pas l'instance » ; §F « un succès muet est un échec inexpliqué »
- `docs/RETROSPECTIVE.md` — format des campagnes ; y consigner le diagnostic des flakes (W-02)

### Recherche du jalon
- `.planning/research/SUMMARY.md` — Phase 1 « Fiabilité du filet » ; ARCHITECTURE.md §flakes (`seed.ts:70 day(offset)` vs semaine lundi→dimanche) ; PITFALLS.md (corriger le semis, traiter les DEUX flakes dans la même phase)

### Code (source de vérité du comportement actuel)
- `app/src/lib/datetime.ts` — module cible des helpers (S-03), déjà testé (`datetime.test.ts`)
- `app/src/lib/data/seed.ts` — semis démo avec `day(offset)` (l.98, l.161 meal-1), couvert par S-01
- `app/src/stores/household-store.test.ts` — le flake WR-03
- `app/src/modules/*/api.ts` (l.315) — garde morte IN-01 à supprimer
- Edge Function portant le select `service_role` à `index.ts:656` — à confirmer au plan (I-01)

### Contexte des phases précédentes
- `.planning/milestones/v1.2-phases/37-filet-de-tests-fiable/37-CONTEXT.md` — décisions D-01/D-02 (protocole flocon, consignation rétrospective) réappliquées par W-02

</canonical_refs>

<code_context>
## Codebase Context

**Reusable assets:**
- `app/src/lib/datetime.ts` + `datetime.test.ts` — module de dates existant, testé ; les helpers s'y ajoutent
- Le trick TZ (`TZ=Pacific/Kiritimati`) prouvé en phase 09 pour démontrer un flake horaire — utilisable pour la reproduction (W-02), mais la preuve finale reste paramétrique (S-02)
- `docs/RETROSPECTIVE.md` — les campagnes tests précédentes (v1.1, v1.2) y sont écrites ; la campagne v1.3 s'y ajoute

**Patterns:**
- Les semis de démo recalent les dates sur « aujourd'hui » pour que le foyer reste vivant (`seed.ts` en-tête l.68-70) — le recalibrage S-01 conserve cette propriété
- Le mode démo (`lib/data/`) est testé par `seed.test.ts`, `local-adapter.test.ts` — maintenir verts

**Integration points:**
- La chaîne §2.7 (§2.7 typecheck → tests → build → e2e → check-sql-statique → test-db.sh) est la définition de « vert » de toute la phase
- Le run e2e standard inclut la spec join-token (J-02) — son rouge documenté traverse la phase

</code_context>

<deferred>
## Noted for Later

- *(aucune idée différée — la discussion est restée dans le périmètre de la phase)*

</deferred>
