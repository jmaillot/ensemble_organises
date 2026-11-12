# Phase 44: Décision cache maxAge par famille (CACHE-01) - Pattern Map

**Mapped:** 2026-11-11
**Files analyzed:** 5 (2 code édité, 1 code conditionnel, 2 documents)
**Analogs found:** 5 / 5

## File Classification

| Fichier créé/modifié | Rôle | Flux de données | Analog le plus proche | Qualité de match |
|----------------------|------|-----------------|----------------------|------------------|
| `app/src/lib/query-policy.ts` (édition valeurs) | config (politique, SOURCE UNIQUE) | transform (constantes déclaratives) | lui-même — le pattern est la forme actuelle du fichier | exact (éditer in place) |
| `app/src/lib/query-policy.test.ts` (Test G/F à jour) | test | transform (assertion de constantes) | lui-même — Tests F:210-218, G:220-245, H:247-278, I:280-305 | exact |
| `docs/MESURES-COLD-START-42.md` (squelettes §7.1-7.5, puis campagne) | doc de preuve versionnée | batch (consignation manuelle par run) | ses propres sections §7.1/§7.6 déjà remplies + `.planning/milestones/v1.3-phases/38-filet-de-tests-fiable/38-E2E-SIGNATURE.md` | exact (forme imposée) |
| `.planning/PROJECT.md` (section « Décision CACHE-01 » APRÈS §7.4 rempli, D-11) | doc de jalon | request-response (verdict + renvoi) | ses propres lignes 113-115 (verdicts par exigence avec renvoi) | role-match |
| `app/src/modules/parametres/components/offline-panel.tsx` (UNIQUEMENT si tâche conditionnelle D-14 s'exécute) | component (panneau diagnostic) | request-response (lecture seule, inspect au montage) | lui-même — section « Cache hors-ligne » lignes 350-389 | exact |

Tous les chemins ci-dessus sont **git-TRACKED** (vérifié `git ls-files` ce jour). Tous les analogs sont des fichiers réels du dépôt, aucun miroir.

---

## Pattern Assignments

### `app/src/lib/query-policy.ts` (config, transform) — le commit de famille atomique CACHE-02

**Analog : le fichier lui-même en l'état** — l'édition est déclarative, la forme ne change pas.

**La déclaration à éditer** (lignes 79-93) — les 11 valeurs à trancher :

```typescript
export const OFFLINE_FAMILIES: ReadonlyArray<{ prefix: string; maxAgeMs: number }> = [
  // Tier 1 — données vivantes (D-08 : horizon 24 h)
  { prefix: 'shopping_lists', maxAgeMs: 24 * 60 * 60 * 1000 },
  // ... (9 familles vivantes à 24 h)
  // Annexes de rendu (D-10) : sans elles, avatars et noms d'assignés manquent
  { prefix: 'household_members', maxAgeMs: 7 * 24 * 60 * 60 * 1000 },
  { prefix: 'profiles', maxAgeMs: 7 * 24 * 60 * 60 * 1000 },
];
```

**Le `gcTime` à réajuster AU MÊME COMMIT si une valeur dépasse 7 jours** (lignes 32-37, commentaire « Pitfall 1 » à mettre à jour en même temps que la valeur) :

```typescript
// Pitfall 1 (RESEARCH phase 33) : le gcTime doit couvrir l'horizon de
// persistance offline — l'horizon le plus long est le maxAge des annexes
// (7 jours, OFFLINE_FAMILIES). ...
gcTime: 7 * 24 * 60 * 60 * 1000,
```

**Commentaire de justification** : chaque valeur modifiée porte un commentaire français qui NOMME la raison (critères (a)(b)(c) §5) — convention AGENTS.md §2.7 (pas de linter, le code dit pourquoi). Exemple de forme en vigueur, lignes 69-74 du même fichier (bloc D-08/D-09).

---

### `app/src/lib/query-policy.test.ts` (test) — Pitfall 2 : c'est le Test G qui porte les valeurs

**Analog : le fichier lui-même.** Le Test H (préfixes ↔ constantes api.ts) reste vert si les préfixes ne bougent pas ; **Test G est celui qui échoue si une valeur change sans lui**.

**Test G** (lignes 220-245) — à mettre à jour au même commit que la valeur :

```typescript
it('G. OFFLINE_FAMILIES contient exactement les 9 familles vivantes et les 2 annexes', () => {
  const byAge = (prefix: string) => OFFLINE_FAMILIES.find((family) => family.prefix === prefix)?.maxAgeMs;
  const day = 24 * 60 * 60 * 1000;
  // ... 9 préfixes : expect(byAge(prefix), `famille vivante ${prefix} absente`).toBe(day);
  for (const prefix of ['household_members', 'profiles']) {
    expect(byAge(prefix), `annexe ${prefix} absente`).toBe(7 * day);
  }
  expect(OFFLINE_FAMILIES).toHaveLength(11);
});
```

**Test F** (lignes 210-218) — borne `gcTime ≥ 7 j` en dur ; à réajuster au même commit si le maxAge max dépasse 7 jours :

```typescript
it('F. gcTime couvre l'horizon de persistance (≥ 7 jours)', () => {
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  expect(QUERY_POLICY.queries?.gcTime ?? 0).toBeGreaterThanOrEqual(sevenDays);
  const options = appQueryClient.getDefaultOptions();
  expect(options.queries?.gcTime ?? 0).toBeGreaterThanOrEqual(sevenDays);
});
```

**Tests H/I intouchables** (lignes 247-305) : H affirme la correspondance préfixes ↔ constantes `*_TABLE` des api.ts ; I refuse tout `prefix: '…'` hors de query-policy.ts et du test lui-même (garde de classe §2.7 E) — aucune édition de valeur ne doit toucher ces deux tests.

---

### `docs/MESURES-COLD-START-42.md` (doc de preuve) — squelette D-01 à D-04

**Analog 1 : ses propres sections §7.1 et §7.6 déjà remplies** (forme cible du jour J).

**Tableau par run D-02** (forme §7.1, lignes 124-128) :

```markdown
| Run | Estampille | Branche auth | entry chunk | SW | idb | auth | Total (borne à borne) |
|---|---|---|---|---|---|---|---|
| 1 | v1.2-71- | hors ligne (mode avion) | 3 ms | 20 ms | 6 ms | 437 ms | 437 ms |
```

**Tableau par famille D-01** (forme §7.3, lignes 155-167 — déjà posé, le squelette complète les cellules) :

```markdown
| Famille | maxAge | Lignes restaurées (médiane) | pruneEligible (médiane) | Delta prune |
```

**Tableau de décision §7.4** (lignes 173-185 — déjà posé, à remplir les données sous les yeux, D-06) :

```markdown
| Famille | Décision | Justification (critères a/b/c) |
```

**Tableau chaîne §2.7 D-08** (forme §7.6, lignes 198-208 — chaque étape citée avec son résultat, §2.7 F) + bannière finale `CHAINE-42-VERTE` (ligne 209).

**Analog 2 (forme imposée de la consignation) : `.planning/milestones/v1.3-phases/38-filet-de-tests-fiable/38-E2E-SIGNATURE.md`** (git-tracked, 89 lignes) :
- En-tête : Run du / Exécuté par / Référence avant-phase / Exigence couverte (lignes 3-6) ;
- Chaîne §2.7 en tableau avec **résultat chiffré par étape** (lignes 12-19) ;
- Verdict + ce qui n'est PAS prouvé (section §4) — « ce qui est prouvé, ce qui ne l'est pas » ;
- Self-Check final (lignes 79-88).

**Règles de réécriture** : D-04 — le document est **réécrit à chaque campagne**, historique dans git, jamais de sections cumulées ; les différés §7.1/§7.2/§7.3/§7.4 actuels (textes « Différé consigné ») sont remplacés le jour J. L'écart de reprise post-purge (§7.5, ligne 132) est **porté dans le squelette** (D-03) : `reconnexion réseau → connexion → mode avion → « Vider le cache » seul → run froid comparable`.

**D-03 : deux validations « froid » §2.1 par run**, à cocher dans le squelette (règle « un run non froid n'entre pas dans les médianes » en commentaire) : (1) panneau cache « rien de persisté », (2) segment SW absent ou ~0 ms.

---

### `.planning/PROJECT.md` (verdict D-10/D-11)

**Analog : ses propres verdicts par exigence** (lignes 113-115) — forme « exigence : verdict une ligne + renvoi » :

```markdown
- CACHE-01 : décision maxAge par famille appliquée selon les critères §5 de `docs/MESURES-COLD-START-42.md`, mise en œuvre dans `query-policy.ts`
```

La section « Décision CACHE-01 » n'apparaît qu'UNE fois §7.4 rempli avec des données réelles (D-11, §2.7 I) — le squelette préparatoire ne touche PAS ce fichier.

---

### `app/src/modules/parametres/components/offline-panel.tsx` (CONDITIONNEL, D-13/D-14/D-15/D-16)

**Analog : la section « Cache hors-ligne » existante** (lignes 350-389) — c'est AUSSI la source de l'évaluation du seuil D-15. Le panneau affiche DÉJÀ, par famille : `ageMs` (`libelleAgeCache`), `maxAgeMs` (`libelleDureeConservation`) et `pruneEligible` (phrase d'écart) :

```tsx
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

Le delta de prune est affiché **globalement** (pas par famille), lignes 90-98 :

```tsx
const base = `Dernière restauration : ${outcome.restoredFamilies} familles restaurées`;
return outcome.prunedFamilies > 0 ? `${base}, ${outcome.prunedFamilies} écartées (> 24 h)` : base;
```

**Interface disponible si la tâche s'exécute** (`app/src/lib/offline/query-persistence.ts:384-406`) :

```typescript
export interface FamilleInspectee {
  prefix: string;
  dataUpdatedAt: number;
  ageMs: number;
  maxAgeMs: number;
  pruneEligible: boolean;
}
```

Si ajoutée : section **repliée** dans ce panneau, alimentée par `inspectPersistedCache` (déjà importé, ligne 18, appelé lignes 139+ au montage — même patron), **lecture seule** (T-35-18 : noms/horodatages/booléens uniquement, zéro contenu de ligne), zéro nouveau paquet/service. Elle arrive AVANT la lecture de campagne (D-16).

---

## Shared Patterns

### Source unique + garde de classe (§2.7 E)
**Source :** `app/src/lib/query-policy.ts` (commentaire 58-78) + `query-policy.test.ts` Test I (280-305)
**Apply to :** toute édition de maxAge — la valeur vit UNIQUEMENT dans `OFFLINE_FAMILIES` ; aucune liste parallèle, aucun `prefix: '…'` ailleurs ; le Test H refuse toute divergence avec les constantes `*_TABLE` des api.ts.

### Commit atomique par famille (CACHE-02, D-07/D-12)
**Source :** la forme du dépôt — un commit = 1 famille = `query-policy.ts` (valeur + commentaire) + Test G à jour (+ Test F/gcTime si > 7 j) ; commit de consignation (MESURES + PROJECT.md) DISTINCT.
**Apply to :** toutes les familles modifiées. Vérification par commit : `cd app && npm run typecheck && npm test -- query-policy` (chaîne complète §2.7 UNE fois à l'état final, D-08).

### Consignation de preuve (forme 38-E2E-SIGNATURE)
**Source :** `.planning/milestones/v1.3-phases/38-filet-de-tests-fiable/38-E2E-SIGNATURE.md`
**Apply to :** `docs/MESURES-COLD-START-42.md` — chaque étape citée avec résultat chiffré (§2.7 F), verdict explicite de ce qui est prouvé / pas prouvé, différés honnêtes consignés (§2.7 I : une absence affirmée est une affirmation).

### Jamais de maxAge global TanStack
**Source :** `app/src/lib/offline/query-persistence.ts:212-216` (commentaire « Pitfall 3 ») et `pruneExpiredFamilies` (308-326) / `famillePerimee` (289-292)
**Apply to :** toute réflexion sur l'application du maxAge — la fraîcheur est évaluée PAR FAMILLE au restore par le prédicat partagé ; l'option `maxAge` de `persistQueryClient` jette tout le cache silencieusement, elle ne peut pas servir.

## No Analog Found

| Fichier | Rôle | Flux | Raison |
|------|------|-----------|--------|
| (aucun) | — | — | Tous les fichiers touchés ont un analog exact dans le dépôt ou sont eux-mêmes le pattern en vigueur |

## Metadata

**Analog search scope:** `app/src/lib/`, `app/src/lib/offline/`, `app/src/modules/parametres/components/`, `docs/`, `.planning/`
**Files scanned:** 7 (5 lisibles en entier, 2 ciblés) — tous git-tracked (vérifié `git ls-files`)
**Pattern extraction date:** 2026-11-11
