# Phase 37: Filet de tests fiable - Context

**Gathered:** 2026-11-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Solder les 4 dettes tests héritées de v1.1 (TEST-01 → TEST-04) : flocon auth-bootstrap test D corrigé, suite unitaire 100 % verte, e2e offline-shared-device exécuté au vert avec 2 comptes réels, clé GoTrue résiduelle éliminée et prouvée par lecture brute du stockage. Zéro nouvelle surface produit — jalon 100 % dette. La phase consolide le filet APRÈS la phase 36 : les tests d'outbox peuvent bouger ici, jamais l'inverse.

**Constat majeur mesuré au 2026-11-07 :** la suite unitaire complète est déjà 100 % verte (243 fichiers, 1958 tests) — les 2 tests rouges anniversaires de TEST-02 ont été corrigés incidemment par le commit `cdd4fa7` (5 nov, « bornage annuel de la recherche de pastille anniversaire — tests dépendants de la date ») pendant la phase 36.

</domain>

<decisions>
## Implementation Decisions

### Flocon auth-bootstrap test D (TEST-01)
- **D-01:** **Corriger le test, pas diagnostiquer la cause racine applicative.** Le test D (« monte l'application hors-ligne avec session valide et foyer persisté », `auth-bootstrap-offline.test.tsx`) échoue ~1/367 sous charge uniquement — l'hypothèse de travail est une condition de course dans le test (timers/waitFor sous parallélisme 243 workers), pas dans le code de production. Correction : tolérance à la charge (fake timers ou waitFor robuste).
- **D-02:** **Le diagnostic est consigné dans `docs/RETROSPECTIVE.md`** (§ campagne tests v1.2) : fréquence mesurée, conditions de reproduction (charge/parallélisme), hypothèse écartée, nature de la correction. Un succès non silencieux (§2.7 F) — le test vert est accompagné de son explication.

### Tests rouges anniversaires (TEST-02)
- **D-03:** **TEST-02 est traité comme « confirmer soldé », pas comme un chantier.** Les 44 tests anniversaires passent (mesuré au 2026-11-07) ; la correction vient de `cdd4fa7` pendant la phase 36. Le plan vérifie que la correction couvre bien les 2 tests visés (lecture du commit) et consigne le fait dans la rétrospective — pas de code nouveau. Si la vérification révélait que les 2 tests d'origine v1.1 ne sont PAS ceux corrigés par `cdd4fa7`, escalade vers l'utilisateur avant tout travail.

### E2E offline-shared-device (TEST-03)
- **D-04:** **Le skip conditionnel aux env vars est conservé** (comportement actuel, conforme §2.7 : le spec s'ignore explicitement, ne se déclare pas vert). Le dé-skip inconditionnel est refusé — il rendrait rouge toute machine sans comptes.
- **D-05:** **Les 2 comptes réels passent par les variables d'environnement existantes** (`E2E_SHARED_USER_A_EMAIL/PASSWORD`, `E2E_SHARED_USER_B_EMAIL/PASSWORD`) pointant vers le backend auto-hébergé réel. Les valeurs vivent hors du dépôt (§2.7 H).
- **D-06:** **L'exécution au vert a lieu pendant la phase** — l'utilisateur fournit les comptes, l'agent exécute, et la preuve (sortie Playwright, 2 comptes, contexte offline, lecture brute IndexedDB) est consignée dans la VALIDATION de la phase. L'exécution n'est pas une marche manuelle différée.

### Clé GoTrue résiduelle (TEST-04)
- **D-07:** **Purge session dédiée plutôt que correctif chirurgical.** Un module de purge session centralisé efface explicitement `sb-<ref>-auth-token` (et ses chunks `.0`/`.1` au-delà de la garde de taille) à chaque déconnexion/purge invité — la clé ne peut plus survivre quel que soit le chemin de déconnexion. La dérivation de la clé existe déjà dans `session-cache.ts` et sera réutilisée.
- **D-08:** **La preuve est à deux niveaux : unitaire + e2e.** Le test lit le stockage brut après purge et vérifie l'absence de toute clé `sb-*-auth-token*` — lecture directe localStorage en unitaire (jsdom), et extension de la lecture brute existante du spec offline-shared-device (`clesCacheBrutes()`, `page.evaluate`) au localStorage en e2e. Même logique que le test D-06 unitaire.
- **D-09:** Le test de purge est **démontré rouge avant le vert** (§2.7 B) : sur le code actuel, la purge invité laisse la clé — le rouge initial est la preuve que le défaut existe, le vert après correction est la preuve du fix.

### Traçabilité de la campagne
- **D-10:** **Une entrée unique dans `docs/RETROSPECTIVE.md`** (section « campagne tests v1.2 ») couvre les 4 dettes : diagnostic flocon (D-02), anniversaires déjà soldés par `cdd4fa7` (D-03), preuves d'exécution e2e (D-06), purge GoTrue (D-08). Un seul endroit, cohérent avec les campagnes précédentes du document.

### the agent's Discretion
- Technique exacte de correction du flocon (fake timers vs waitFor vs timeouts explicites) — le chercheur et le planneur tranchent au vu du test réel.
- Emplacement de la fonction de purge session (extension de `session-cache.ts` vs module dédié) — au vu des appels existants (`session-store.signOut`, purges invité).
- La marche exacte de fourniture des comptes e2e à l'exécution (shell, .env hors dépôt) — libre, tant que les valeurs ne sont jamais versionnées.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Exigences et critères de la phase
- `.planning/ROADMAP.md` §Phase 37 — goal et 4 success criteria
- `.planning/REQUIREMENTS.md` §TEST-01…TEST-04 — exigences verrouillées

### Garde-fous de vérification
- `AGENTS.md` §2.7 — chaîne avant commit ; §B « vu rouge avant d'être vu vert » ; §F « un succès muet est un échec inexpliqué » ; §I « une absence affirmée est une affirmation » (le spec e2e s'ignore explicitement)
- `docs/RETROSPECTIVE.md` — format des campagnes ; y écrire la section « campagne tests v1.2 » (D-02, D-03, D-06, D-10)

### Code (source de vérité du comportement actuel)
- `app/src/hooks/__tests__/auth-bootstrap-offline.test.tsx` — le test D (flocon TEST-01, l.84)
- `app/src/hooks/__tests__/auth-bootstrap-watchdog.test.tsx` — gardien d'amorçage 10 s (35-06), contexte du bootstrap
- `app/e2e/offline-shared-device.spec.ts` — spec e2e complet, skip conditionnel env vars, `clesCacheBrutes()` (lecture brute IndexedDB à étendre au localStorage, D-08)
- `app/src/lib/supabase/session-cache.ts` — dérivation de la clé GoTrue `sb-<ref>-auth-token` et chunks `.0`/`.1` (D-07)
- `app/src/lib/offline/query-persistence.ts` — `purgeUserCache` / `purgeCache`, ordre unsubscribe→purge (Pitfall 6), la purge offline à ne pas confondre avec la purge session GoTrue
- `app/src/modules/anniversaires/anniversaires-page.test.tsx` — corrigé par `cdd4fa7` (TEST-02, à vérifier)

### Hors-ligne / session (décisions v1.1 à respecter)
- `.planning/MILESTONES.md` §v1.1 — D-05 (purge des clés IndexedDB à la déconnexion), D-06 (isolation A/B), T-35-06 (purge session)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `clesCacheBrutes(page)` (offline-shared-device.spec.ts) : lecture brute IndexedDB via `page.evaluate` — patron à répliquer pour le localStorage (D-08)
- Dérivation de clé GoTrue (`session-cache.ts`) : `sb-${reference}-auth-token` + gestion des chunks — la purge session l'utilise, le test aussi
- `purgeUserCache` (query-persistence.ts) : la purge cache offline existe et est testée (`query-persistence.test.ts`, fake-indexeddb) — ne pas la doubler, brancher la purge session à côté
- Suite e2e mode démonstration (`critical-paths.spec.ts`) : conventions des specs Playwright du dépôt

### Established Patterns
- Skip conditionnel aux env vars avec raison explicite (le spec ne se déclare pas vert) — §2.7 I
- Tests dans les fichiers existants, mêmes conventions (36-CONTEXT D-08)
- « Vu rouge avant d'être vu vert » exigé pour tout test prouvant une correction (§2.7 B)
- fake-indexeddb en unitaire pour le stockage navigateur

### Integration Points
- `session-store.signOut` : chemin de déconnexion où la purge session doit être appelée (et les purges invité équivalentes)
- Les tests d'outbox écrits en phase 36 (`outbox-replay.test.ts`, `outbox.test.ts`, `offline-panel.test.tsx`) peuvent bouger ici — consolidation post-36
- La suite e2e exige un backend réel avec 2 comptes — exécution à prévoir avec les env vars, pas en mode démo

</code_context>

<specifics>
## Specific Ideas

- Le constat chiffré du 2026-11-07 (suite verte 1958/1958, correction `cdd4fa7` du 5 nov) fait foi pour TEST-02 — le plan part de là, pas de l'hypothèse « 2 tests rouges à corriger ».
- La preuve e2e attendue dans la VALIDATION : sortie Playwright nominale (2 comptes, offline, isolation A/B, lecture brute propre).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 37-Filet de tests fiable*
*Context gathered: 2026-11-07*
