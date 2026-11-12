# Phase 44: Décision cache maxAge par famille (CACHE-01) - Research

**Researched:** 2026-11-11
**Domain:** Politique de cache offline TanStack Query (`OFFLINE_FAMILIES`), campagne de mesures on-device, consignation de preuve — phase de preuve + décision + édition déclarative éventuelle, zéro nouveau paquet/service
**Confidence:** HIGH (tout le domaine est en dépôt, lu intégralement ce jour)

## Summary

Cette phase ne construit rien de nouveau : elle tranche, famille par famille, le `maxAgeMs` des 11 familles d'`OFFLINE_FAMILIES` selon la grille §5 de `docs/MESURES-COLD-START-42.md`, à partir d'une campagne on-device (N=5, purge froide §2.1) menée sur l'appareil de référence. L'essentiel du travail planifiable **avant** l'appareil est du squelette de consignation (D-01 à D-04) : compléter les emplacements §7.1–7.5 du document MESURES (tableaux par run, validations « froid » à cocher, grille de décision vide) sans jamais toucher PROJECT.md (D-11). Le jour J — appareil disponible — campagne et décision se font dans la **même session** (D-06), grille §7.4 remplie les données sous les yeux, puis un commit atomique par famille modifiée (D-07), et enfin la chaîne §2.7 complète une fois à l'état final (D-08).

La mécanique technique est petite et entièrement cartographiée : modifier une valeur dans `OFFLINE_FAMILIES` (`app/src/lib/query-policy.ts`), mettre le Test G à jour **en même temps que le Test H** (G affirme les valeurs par famille, H l'appartenance — voir Pitfall 2), vérifier que `gcTime` (7 j, ligne 37) reste ≥ au maxAge le plus long (Test F l'impose), et ajouter le commentaire de justification au même commit. Le code d'observabilité conditionnel (CACHE-04, D-14) réexpose ce qui existe déjà : `inspectPersistedCache` renvoie déjà `ageMs`, `maxAgeMs`, `pruneEligible` **par famille**, et le panneau offline affiche déjà ces trois faits par famille (lignes 378–386) — le seuil de déclenchement D-15 doit donc être évalué **contre ce qui est déjà à l'écran**, qui est plus riche que la formulation D-14 ne le laisse croire (voir Finding 5).

Point d'attention majeur : la campagne 2026-11-10 (phase 42) a été **différée** (2 runs seulement, pas de médiane, CACHE-01 reporté) et a produit un écart procédural consigné §7.5 : après « Effacer le stockage », la session hors ligne est détruite — la procédure de reprise comparable est documentée (reconnexion → connexion → mode avion → « Vider le cache » seul → run froid). La campagne 44 part de cette connaissance, pas de zéro.

**Primary recommendation:** Plan en deux plans : (1) plan préparatoire — squelettes §7.1–7.5 + procédure de campagne résumée + évaluation explicite du seuil D-15 contre le panneau existant (tâche conditionnelle observabilité si seuil franchi, D-16) ; (2) checkpoint humain « appareil disponible » → campagne + grille §7.4 + décisions + commits par famille + chaîne §2.7 finale + report PROJECT.md + commit de consignation.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Squelette de consignation préparé avant la campagne (tableaux, en-têtes, rappels de protocole dans les sections vides de `docs/MESURES-COLD-START-42.md`) ; le jour J l'utilisateur dicte uniquement les valeurs mesurées depuis le panneau.
- **D-02:** Granularité « tout par run » : un tableau par run — estampille quatre canaux, branche auth, 4 segments, total borne à borne, deux validations « froid » §2.1.
- **D-03:** Validation « run froid » §2.1 portée dans le squelette : deux vérifications à cocher par run (panneau « rien de persisté » + SW absent/~0), règle « un run non froid n'entre pas dans les médianes » rappelée en commentaire.
- **D-04:** `docs/MESURES-COLD-START-42.md` réécrit à chaque campagne, historique dans git (D-08 phase 43), jamais de sections cumulées.
- **D-05:** « Préparer puis campagne » : d'abord tout ce qui ne dépend pas de l'appareil, puis checkpoint humain (repli : différé honnêtement consigné).
- **D-06:** Campagne et décision CACHE-01 dans la MÊME session — grille §7.4 remplie les données sous les yeux, justification (a)(b)(c) écrite à chaud.
- **D-07:** Commit par famille immédiat : valeur + Test H vert + commentaire au même commit, avant de passer à la suivante.
- **D-08:** Chaîne §2.7 complète une fois à l'état final du dépôt, résultat consigné dans le document MESURES (forme §7.6) — pas de chaîne par commit.
- **D-09:** Grille §7.4 remplie directement dans `docs/MESURES-COLD-START-42.md`, décision reportée ensuite dans PROJECT.md — un seul lieu de grille.
- **D-10:** PROJECT.md porte le verdict par famille (statu quo / nouvelle valeur) avec renvoi vers §7.4 pour la justification complète.
- **D-11:** La section « Décision CACHE-01 » n'apparaît dans PROJECT.md qu'une fois §7.4 remplie avec des données réelles (§2.7 I). Le squelette préparé ne touche pas PROJECT.md.
- **D-12:** Commit de consignation (§7 rempli + PROJECT.md) DISTINCT des commits de code par famille.
- **D-13:** Observabilité = tâche CONDITIONNELLE, jamais préventive, jamais par replanification.
- **D-14:** Si ajoutée : section « détail par famille » repliée dans le panneau offline existant, alimentée par `inspectPersistedCache` — lecture seule, zéro nouveau paquet/service, aucune mutation du cache.
- **D-15:** Seuil de déclenchement NOMMÉ dans le plan : « le panneau suffit s'il permet de répondre aux critères (a) et (c) par famille ».
- **D-16:** Si l'observabilité est livrée, elle arrive AVANT la lecture du panneau de la campagne (phase préparatoire) — jamais entre campagne et décision.

### the agent's Discretion
- Forme exacte des squelettes (mise en page des tableaux, libellés) — champs requis verrouillés par D-02/D-03.
- Rédaction exacte de la procédure de campagne résumée (la séquence §2 reste la référence contraignante).
- Découpage précis des plans/tâches par le planner (préparatoire → checkpoint → campagne+décision → commits).

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CACHE-01 | maxAge tranché famille par famille selon critères §5, campagne on-device §6 (ou différé honnêtement consigné), lecture du panneau avant décision, statu quo justifié = décision valide | Protocole et tolérances produit déjà écrits dans MESURES §5 (table des 11 familles avec phrases de tolérance (b)) ; ordre §6 consigné ; campagne 42-2026-11-10 a fourni la procédure de purge comparable (§2.1) et l'écart de reprise post-« Effacer le stockage » (§7.5) |
| CACHE-02 | Au plus un commit par famille modifiée : valeur + Test H vert + commentaire ; gcTime ≥ maxAge max ; outbox/bandeau offline/SW intouchables | `OFFLINE_FAMILIES` est la source unique (query-policy.ts:79-93) ; Test F (gcTime ≥ 7 j, query-policy.test.ts:210-218), Test G (valeurs par famille, :220-245), Test H (préfixes ↔ constantes api.ts, :247-278), Test I (garde de classe allowlist, :280-305) |
| CACHE-03 | Décision consignée dans PROJECT.md + grille §7.4 remplie avant toute édition de code | D-09/D-10/D-11 : grille dans MESURES §7.4 (tableau déjà posé, lignes 173-185), verdict dans PROJECT.md seulement après données réelles |
| CACHE-04 | Observabilité avant/après conditionnelle — détail cache par famille lecture seule, déclenché par besoin | `inspectPersistedCache` (query-persistence.ts:422-453) expose déjà ageMs/maxAgeMs/pruneEligible par famille ; panneau offline les affiche déjà (offline-panel.tsx:378-386) — le seuil D-15 est probablement DÉJÀ rempli (voir Finding 5) |

</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Déclaration des maxAge par famille | Frontend (source unique `query-policy.ts`) | — | Politique de cache = une constante ; tout client dérive (Test E) |
| Application du maxAge au restore | Frontend (`pruneExpiredFamilies`, `query-persistence.ts:308-326`) | — | Évaluée une fois au restore (OFFR-03), pas en continu |
| Mesure on-device (campagne N=5) | Humain sur appareil de référence | Panneau offline (lecture) | Mesure manuelle dictée depuis le panneau « Amorçage » + « Cache hors-ligne » — pas de script (D-01) |
| Consignation des mesures | Docs versionnés (`docs/MESURES-COLD-START-42.md`) | git | PM-03 : le panneau ne porte que la session en cours, la référence versionnée est le fichier |
| Décision CACHE-01 | Docs (grille §7.4) puis PROJECT.md (verdict) | git | D-09/D-10 |
| Observabilité conditionnelle (si déclenchée) | Frontend (panneau offline) | — | Réexposition de `inspectPersistedCache`, lecture seule (D-14) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (aucune nouvelle dépendance) | — | Zéro nouveau paquet/service verrouillé (STATE.md, D-14) | La phase réexpose du code existant et édite des constantes |

Aucune installation. Si un plan suggère `npm install`, c'est un défaut.

## Package Legitimacy Audit

**Aucun paquet externe à installer cette phase** — zéro nouvelle dépendance est une décision verrouillée (STATE.md v1.4, D-14). Audit non applicable.

## Architecture Patterns

### System Architecture Diagram

```
[Appareil de référence, build prod estampillé]
        │ (PWA installée, réseau actif)
        ▼
[Purge froide §2.1]  ── validation : panneau « rien de persisté » + SW absent/~0
        │
        ▼ (mode avion, lancement mesuré)
[Panneau « Amorçage »] ──► dictée : estampille, branche auth, 4 segments, total
        │
[Panneau « Cache hors-ligne »] ◄── inspectPersistedCache(userId, householdId)
        │                              (ageMs / maxAgeMs / pruneEligible par famille)
        ▼
[Squelette §7.1/§7.3 rempli par l'utilisateur] ──► médiane N=5
        │
        ▼
[Grille §7.4 : décision par famille selon (a)(b)(c)]
        │
   ┌────┴─────────────────┐
   ▼                      ▼
statu quo            nouvelle valeur
(justifié)                │
   │                      ▼
   │             1 commit : OFFLINE_FAMILIES + Test G/H à jour + commentaire
   │             (+ gcTime réajusté au même commit si maxAge > 7 j)
   └────────┬─────────────┘
            ▼
  chaîne §2.7 complète (une fois, état final) ──► report PROJECT.md
            ──► commit de consignation distinct (D-12)
```

### Recommended Project Structure
Aucun nouveau fichier de code prévu. Fichiers touchés :

```
app/src/lib/query-policy.ts              # OFFLINE_FAMILIES (édition de valeurs + commentaires)
app/src/lib/query-policy.test.ts         # Test G (valeurs) — Test H reste vert si préfixes inchangés
docs/MESURES-COLD-START-42.md            # squelettes §7.1–7.5, puis campagne + grille §7.4 + chaîne §7.6
.planning/PROJECT.md                     # section « Décision CACHE-01 » APRÈS §7.4 rempli (D-11)
app/src/modules/parametres/components/offline-panel.tsx  # UNIQUEMENT si tâche conditionnelle D-14 s'exécute
```

### Pattern 1: Le commit de famille atomique (CACHE-02)
**What:** Un commit = une famille modifiée = valeur + test à jour + commentaire de justification.
**When to use:** Uniquement pour les familles dont §7.4 conclut à une nouvelle valeur.
**Example:**
```typescript
// Source: app/src/lib/query-policy.ts (forme en vigueur, lues ce jour)
export const OFFLINE_FAMILIES: ReadonlyArray<{ prefix: string; maxAgeMs: number }> = [
  // Tier 1 — données vivantes (D-08 : horizon 24 h)
  { prefix: 'shopping_lists', maxAgeMs: 24 * 60 * 60 * 1000 },
  // ...
  // Annexes de rendu (D-10) : sans elles, avatars et noms d'assignés manquent
  { prefix: 'household_members', maxAgeMs: 7 * 24 * 60 * 60 * 1000 },
  { prefix: 'profiles', maxAgeMs: 7 * 24 * 60 * 60 * 1000 },
];
```
Les valeurs à trancher sont exactement celles-ci [VERIFIED: app/src/lib/query-policy.ts:79-93] : 9 familles à `24 * 60 * 60 * 1000` (`shopping_lists`, `shopping_list_items`, `products`, `task_lists`, `tasks`, `task_assignees`, `routine_folders`, `routines`, `routine_completions`), 2 familles à `7 * 24 * 60 * 60 * 1000` (`household_members`, `profiles`). Le `gcTime` en vigueur est `7 * 24 * 60 * 60 * 1000` [VERIFIED: app/src/lib/query-policy.ts:37] avec le commentaire « Pitfall 1 (RESEARCH phase 33) » aux lignes 32-36 — à re-regarder au même commit si une valeur dépasse 7 jours.

### Pattern 2: La purge froide comparable (§2.1)
**What:** Procédure de purge + deux validations à cocher par run.
**When to use:** Chaque run de la campagne.
Le protocole est déjà écrit et contraignant [CITED: docs/MESURES-COLD-START-42.md §2.1] : purge par « Vider le cache » (paramètres Android), déclarée froide seulement si (1) le panneau cache affiche « rien de persisté » et (2) le segment SW est absent ou ~0 ms. Un run non froid ne rentre pas dans les médianes.
**Écart consigné de la campagne 42 (à portér dans le squelette) [VERIFIED: docs/MESURES-COLD-START-42.md:132]:** après un « Effacer le stockage », la session hors ligne est détruite — reprise : reconnexion réseau → connexion → mode avion → « Vider le cache » seul (préserve la session dans IndexedDB) → run froid comparable.

### Anti-Patterns to Avoid
- **Décider depuis la lecture (a) seule:** biais d'ordre §6 — les critères (b) (tolérance produit, écrite avant lecture) et (c) (coût re-fetch borné foyer) tranchent ; le volume réhydraté est un fait d'instrumentation [CITED: MESURES §6].
- **Toucher l'outbox, le bandeau offline (MIN dataUpdatedAt) ou le SW:** anti-features verrouillées v1.1/v1.3 [CITED: REQUIREMENTS.md CACHE-02]. La purge de l'outbox est indépendante du maxAge [CITED: MESURES §5, dernier paragraphe].
- **Inventer une valeur ou mesurer sur émulateur:** §2.7 I et §1 — jamais de valeur inventée, l'émulateur est explicitement exclu.
- **Utiliser le `maxAge` global de TanStack `persistQueryClient`:** il jette TOUT le cache silencieusement (« silently discarded ») — la fraîcheur est évaluée PAR FAMILLE par `pruneExpiredFamilies`, jamais par cette option [VERIFIED: app/src/lib/offline/query-persistence.ts:212-216].
- **Ajouter l'observabilité préventivement:** D-13/D-15 — le seuil est nommé dans le plan, la tâche ne s'exécute que s'il est franchi.
- **Une deuxième liste de familles nulle part:** Test I refuse tout `prefix: '…'` hors de query-policy.ts et du test lui-même [VERIFIED: app/src/lib/query-policy.test.ts:280-305].

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Introspection du cache par famille | Lecture brute IndexedDB / désérialisation maison | `inspectPersistedCache` (existe) | Le persister porte la désérialisation TanStack et le namespacing D-03 [VERIFIED: query-persistence.ts:414-421] |
| Prédicat de péremption | Nouvelle comparaison d'âge | `famillePerimee` (existe, un seul site) | `pruneExpiredFamilies` et `inspectPersistedCache` l'utilisent tel quel — les chemins ne peuvent pas diverger [VERIFIED: query-persistence.ts:289-292] |
| Médiane, N=5, estampille | Script auto-rédigeant | Squelette + dictée humaine (D-01) | La mesure est manuelle on-device, différence assumée avec la phase 43 |

## Runtime State Inventory

> Phase de décision + édition de constantes ; pas de rename ni de migration SQL. Catégories vérifiées :

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | IndexedDB `eo-offline-cache`, store `query`, clé `eo-query-cache:<userId>:<householdId>`, buster `'v2'` [VERIFIED: query-persistence.ts:21-46] | Aucune migration : changer un maxAge ne change pas la FORME du cache (pas de bump de buster — un bump jetterait le cache de tous les appareils) |
| Live service config | None — aucune configuration externe ne porte ces valeurs (vérifié : les maxAge n'existent que dans query-policy.ts, guard Test I) | — |
| OS-registered state | None — la PWA installée est l'appareil de mesure lui-même | — |
| Secrets/env vars | None — aucun maxAge en variable d'environnement | — |
| Build artifacts | Aucun artefact à reconstruire en dehors du build prod standard (estampille quatre canaux exigée pour la campagne, §1) | Build prod déployé avant campagne |

## Common Pitfalls

### Pitfall 1: Modifier gcTime trop tard (ou jamais)
**What goes wrong:** Si §7.4 retient un maxAge > 7 jours, le Test F (`gcTime ≥ 7 j` codé en dur à `7 * 24 * 60 * 60 * 1000`) reste vert, mais le commentaire Pitfall 1 de query-policy.ts (l.32-36) devient faux, et une query hydratée serait collectée avant la prochaine sauvegarde si gcTime < maxAge réel.
**Why it happens:** Le Test F borne à 7 jours en dur, pas au max maxAge réel.
**How to avoid:** Si une valeur dépasse 7 jours : réajuster `gcTime` ET le commentaire ET éventuellement le Test F au MÊME commit que la famille (CACHE-02).
**Warning signs:** Famille annexe proposée au-delà de 7 j dans la grille §7.4.

### Pitfall 2: Le Test G, pas seulement le Test H, porte les valeurs
**What goes wrong:** Modifier une valeur de maxAge sans toucher query-policy.test.ts fait échouer le Test G (`expect(byAge(prefix)).toBe(day)` / `.toBe(7 * day)`) — ou, pire, un commit « Test H vert » seul alors que G est rouge bloque la chaîne.
**Why it happens:** CACHE-02 dit « Test H vert » ; c'est en réalité **G** qui affirme les valeurs par famille (H n'affirme que la correspondance préfixes ↔ constantes api.ts, insensible au maxAge).
**How to avoid:** Le plan doit dire : famille modifiée → G mis à jour au même commit (H reste vert tant que les préfixes ne bougent pas). Attendu réel par famille [VERIFIED: app/src/lib/query-policy.test.ts:220-245]: les 9 vivantes `toBe(day)`, les 2 annexes `toBe(7 * day)`, `OFFLINE_FAMILIES` `toHaveLength(11)`.
**Warning signs:** `npm test` rouge sur le fichier query-policy.test.ts après l'édition de la valeur.

### Pitfall 3: Le run post-purge n'est plus comparable (écart 42 consigné)
**What goes wrong:** « Effacer le stockage » détruit la session hors ligne → lancement mode avion = écran de connexion → run non comparable (branche « session absente »).
**Why it happens:** La purge système tue la session persistée, pas seulement les données.
**How to avoid:** Suivre la procédure de reprise §7.5 : reconnexion → connexion → mode avion → « Vider le cache » seul → run. La porter dans le squelette (D-03).
**Warning signs:** Panneau Amorçage montrant la branche « session absente ».

### Pitfall 4: Le maxAge actif influence le volume observé
**What goes wrong:** « La famille montre peu de lignes restaurées → je raccourcis/allonge » — le biais d'ordre §6 exact.
**Why it happens:** Une famille à maxAge court élaguera plus au restore.
**How to avoid:** Décider sur (b) et (c), consigner (a) comme fait. Modifier un maxAge change ce que la lecture suivante montrera — jamais d'inversion panneau→valeur.
**Warning signs:** Justification §7.4 citant le volume avant la tolérance produit.

### Pitfall 5: Une édition de famille est livrée hors commit isolé
**What goes wrong:** Deux familles dans un commit = CACHE-02 violé ; consignation + code dans le même commit = D-12 violé.
**How to avoid:** Séquencement D-07 strict : décision famille → commit famille → famille suivante ; commit de consignation séparé en fin.
**Warning signs:** `git show --stat` du commit montrant > 1 famille ou MESURES + code ensemble.

### Pitfall 6: Évaluer le seuil D-15 sans lire ce que le panneau affiche déjà
**What goes wrong:** Livrer l'observabilité « par précaution » alors que le panneau répond déjà aux critères (a) et (c) — violation de D-13 et du critère 4.
**How to avoid:** Voir Finding 5 : le panneau affiche DÉJÂ `ageMs`, `maxAgeMs` et `pruneEligible` par famille, plus le delta de prune global via `libelleIssueRestore`. Le seuil est probablement rempli par l'existant ; l'évaluation doit le dire explicitement dans le plan.

## Code Examples

### Ce que le panneau montre déjà par famille (source de l'évaluation D-15)
```tsx
// Source: app/src/modules/parametres/components/offline-panel.tsx:378-386 (existant)
{cacheInspecte.families.map((famille) => (
  <li key={famille.prefix} className="text-xs">
    {famille.prefix} — mise en cache il y a {libelleAgeCache(famille.ageMs)} — conserve{' '}
    {libelleDureeConservation(famille.maxAgeMs)}
    {famille.pruneEligible
      ? ' — au-delà de la durée de conservation, écartée au prochain démarrage'
      : ''}
  </li>
))}
```
Le delta de prune par restore est affiché globalement (pas par famille) :
```tsx
// Source: offline-panel.tsx:94-97 (existant)
const base = `Dernière restauration : ${outcome.restoredFamilies} familles restaurées`;
return outcome.prunedFamilies > 0 ? `${base}, ${outcome.prunedFamilies} écartées (> 24 h)` : base;
```
[VERIFIED: les deux extraits ci-dessus, lus ce jour]

### L'interface d'inspection disponible (si la tâche conditionnelle s'exécute)
```typescript
// Source: app/src/lib/offline/query-persistence.ts:384-406 (existant)
export interface FamilleInspectee {
  prefix: string;
  dataUpdatedAt: number;
  ageMs: number;
  maxAgeMs: number;
  pruneEligible: boolean;
}
export interface InspectCachePersiste {
  exists: boolean;
  buster: string | null;
  persistedAt: number | null;
  families: FamilleInspectee[];
}
```
Aucune donnée de ligne n'y figure (T-35-18) : le rapport ne porte que noms, horodatages et booléens — conforme D-14 « lecture seule, aucune mutation du cache ».

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| maxAge global TanStack (`persistQueryClient.maxAge`) | maxAge par famille via `pruneExpiredFamilies` + `famillePerimee` | Phase 33/34 | Le global reste à NE PAS utiliser (Pitfall 3 du code) |
| `persistQueryClient` (restore+souscription) | `persistQueryClientSubscribe` + sauvegarde explicite (35-09) | Phase 35 | Ne pas réintroduire un second restore — il réhydraterait ce que la prune vient d'écarter [VERIFIED: query-persistence.ts:243-259] |
| Campagne scriptée (phase 43) | Squelette + dictée humaine (D-01) | Cette phase | La mesure on-device ne peut pas être auto-rédigée |

**Deprecated/outdated:** rien dans le périmètre de cette phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Aucune des 11 familles ne devrait logiquement dépasser 7 j (les critères (b)/(c) écrits §5 penchent statu quo), donc gcTime ne bougera probablement pas — mais le plan doit prévoir le cas | Pitfall 1 | Faible : si une valeur dépassait 7 j, le geste est cartographié (même commit) |
| A2 | L'appareil de référence est celui utilisé pour la campagne 42 (procédure de purge connue) — l'identité exacte de l'appareil n'est pas vérifiable depuis le dépôt | Summary / Pattern 2 | Faible : le checkpoint humain D-05 le confirme de toute façon |
| A3 | Le seuil D-15 est probablement déjà rempli par le panneau existant (Finding 5) — c'est une LECTURE du plan, pas une décision : l'évaluation explicite reste une tâche du plan préparatoire | Pitfall 6 / Finding 5 | Faible : si l'évaluation conclut autrement, la tâche conditionnelle s'exécute (D-14/D-16 déjà prévus) |

## Open Questions (RESOLVED — les deux dispositions sont implémentées dans les plans)

1. **Combien de runs « avant correction » §7.1 faut-il pour la campagne 44 ?** (RESOLVED — Task 2 du plan 44-02, étape 1)
   - What we know: la campagne 42 a clôturé §7.1 à 2 runs (décision produit) ; la phase 44 re-mesure-t-elle un état « avant » (les maxAge n'ont pas changé depuis) ou part-elle directement aux lectures §7.3 ?
   - What's unclear: le protocole §1 dit « chaque condition (avant correction, après correction, et toute lecture CACHE-01) est mesurée sur N=5 » — la lecture CACHE-01 est la condition de cette phase ; « avant correction » n'a de sens ici que si des corrections suivent.
   - **Disposition implémentée:** la question est posée dans le squelette §7.1 (Task 2 du plan 44-02, étape 1 : « décider sur place si les runs "avant correction" §7.1 ont déjà une couverture suffisante via §7.3 ») — le protocole §1 reste contraignant, l'utilisateur tranche sur place avec l'appareil ; le planner ne tranche pas à la place du protocole.

2. **Le bandeau offline (MIN dataUpdatedAt) — vérifier qu'aucune famille éditée ne le touche.** (RESOLVED — Task 2 du plan 44-02, verrou CACHE-02)
   - What we know: CACHE-02 verrouille le bandeau comme intouchable ; il n'a pas été ouvert ce jour (le grep n'a pas été fait sur son implémentation).
   - What's unclear: rien fonctionnellement — l'édition de maxAge ne touche pas le bandeau par construction.
   - **Disposition implémentée:** le bandeau est listé dans les `prohibitions` du plan 44-02 (« Ne jamais toucher l'outbox, le bandeau offline (MIN dataUpdatedAt) ou le service worker ») et la chaîne §2.7 finale (e2e + tests, Task 3) sert de non-régression ; aucune tâche dédiée.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Appareil Android de référence | Campagne on-device §6 | ? (checkpoint humain D-05) | — | Différé honnêtement consigné (critère 1) |
| Build prod estampillé (pipeline `build-app.sh`) | Campagne §1 (PM-02) | ✓ (pipeline existant, chaîne 42 §7.6 OK le 2026-11-10) | v1.2-71-… | — |
| Docker (e2e) | Chaîne §2.7 finale D-08 | ✓ le 2026-11-10 (§7.6 phase 42) | — | Représenter l'absence comme la phase 42 le fait |
| Node 24 / npm / Vitest 5 | Chaîne §2.7 | ✓ (existant, 2006 tests verts le 2026-11-10) | — | — |

**Missing dependencies with no fallback:**
- L'appareil de référence, tant qu'il n'est pas disponible — la phase ne livre alors que le préparatoire + différé consigné (chemin principal D-05 est de l'attendre, pas de bâcler).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5 (+ RTL) |
| Config file | `app/` (chaîne §2.7 existante) |
| Quick run command | `cd app && npm test -- query-policy` |
| Full suite command | `cd app && npm run typecheck && npm test && npm run build` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CACHE-01 | (procédure humaine — pas automatisable) ; la preuve est la consignation §7.4 | manual-only | — (justification : mesure on-device dictée, §1/D-01) | n/a |
| CACHE-02 | Valeur par famille + gcTime ≥ maxAge max + préfixes ↔ constantes | unit | `cd app && npm test -- query-policy` (Tests F/G/H/I) | ✅ |
| CACHE-03 | Consignation (document versionné + PROJECT.md) | manual-only | — (preuve par relecture du diff docs/PROJECT.md, forme 38-E2E-SIGNATURE) | n/a |
| CACHE-04 | (conditionnel) panneau lecture seule | unit (si livré) | `cd app && npm test -- offline-panel` | à créer si la tâche s'exécute |

### Sampling Rate
- **Per task commit:** `cd app && npm run typecheck && npm test` (le SQL n'est pas touché — D-08 le dit explicitement).
- **Per wave merge / phase gate:** chaîne §2.7 complète UNE fois à l'état final (D-08), résultat consigné en §7.6 du document MESURES.

### Wave 0 Gaps
- None — l'infrastructure de test existe et couvre la politique (Tests F/G/H/I en place).

## Security Domain

> security_enforcement non désactivé ; section incluse. Le périmètre de la phase est déclaratif (constantes de cache + docs), la frontière de sécurité (RLS, allowlist d'écriture) n'est pas touchée.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | indirect | `OFFLINE_FAMILIES` reste LA frontière de ce qui quitte la mémoire (Test I refuse toute liste parallèle) — ne pas étendre la liste |
| V5 Input Validation | no (aucune entrée utilisateur nouvelle) | — |
| V6 Cryptography | no | — |
| Autres (V2/V3/V7…) | no | Aucune surface auth/session/新增 dans le périmètre |

### Known Threat Patterns for ce périmètre

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Étendre OFFLINE_FAMILIES à une table Tier 2 (données personnelles, notes/ardoise) | Information Disclosure | Test G `toHaveLength(11)` + Test I — toute extension est une violation détectable ; ne pas la faire |
| Rapport d'inspection qui fuirait le contenu des lignes | Information Disclosure | `inspectPersistedCache` ne porte que noms/horodatages/booléens (T-35-18) — garder cette forme si la tâche D-14 s'exécute |

## Sources

### Primary (HIGH confidence)
- `app/src/lib/query-policy.ts` (lu intégralement ce jour) — OFFLINE_FAMILIES :79-93, gcTime :37, commentaire Pitfall 1 :32-36
- `app/src/lib/query-policy.test.ts` (lu intégralement) — Tests F:210-218, G:220-245, H:247-278, I:280-305, L:186-207
- `app/src/lib/offline/query-persistence.ts` (lu intégralement) — famillePerimee:289-292, pruneExpiredFamilies:308-326, inspectPersistedCache:422-453, FamilleInspectee:384-395, maxAge global interdit:212-216
- `app/src/modules/parametres/components/offline-panel.tsx` (lu intégralement) — rendu par famille:378-386, libellé restore:94-97, section Amorçage:279-305
- `docs/MESURES-COLD-START-42.md` (lu intégralement) — protocole §1, purge §2/§2.1, segments §3, critères §5 (tolérances par famille l.88-102), biais §6, emplacements §7.1-7.6, écart de reprise :132
- `.planning/phases/44-*/44-CONTEXT.md` — décisions D-01..D-16
- `.planning/REQUIREMENTS.md` — CACHE-01..04 (l.17-22)

### Secondary (MEDIUM confidence)
- `.planning/ROADMAP.md` §Phase 44 (cité par l'orchestrateur) ; `.planning/STATE.md` (décisions v1.4, cité par CONTEXT.md)

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zéro dépendance, décision verrouillée
- Architecture: HIGH — tous les fichiers du domaine lus intégralement ce jour, lignes citées
- Pitfalls: HIGH — dérivés directement des tests et commentaires du code en vigueur, plus l'écart consigné de la campagne 42

**Research date:** 2026-11-11
**Valid until:** 2026-12-11 (domaine stable ; seule la disponibilité de l'appareil est variable)
