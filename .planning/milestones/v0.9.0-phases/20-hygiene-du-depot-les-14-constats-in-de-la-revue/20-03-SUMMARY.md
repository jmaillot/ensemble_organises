---
phase: 20-hygiene-du-depot-les-14-constats-in-de-la-revue
plan: 03
subsystem: ui
tags: [a11y, aria-required, field, barcode, jsbarcode, primitive-partagee, d-05, d-12]

# Dependency graph
requires: []
provides:
  - "`app/src/components/ui/field.tsx` : `required` porté par le contexte, `aria-required` rendu par le render prop ET par `useFieldControl()`"
  - "`app/src/components/shared/barcode.tsx` : `<svg ref>` monté dans tous les états, repli rayé en frère conditionnel, deps de l'effet toujours `[value]`"
  - "`app/src/components/ui/field.test.tsx` : preuve des deux voies (render prop + contexte) et du champ optionnel"
  - "`app/src/components/shared/barcode.test.tsx` : preuve du rétablissement sur le même composant monté"
affects:
  - "tous les modules qui consomment `Field` (notes, adresses, tâches, ardoise, cadeaux, voyages, routines, cercle, landing, courses) — ils reçoivent `aria-required` sans modification"

# Actuals (#2632) — pairs with the plan's estimate (34000 tokens) to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 1927
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Le caractère requis se dit au contrôle par les DEUX voies que `Field` expose — render prop et contexte — et chacune est prouvée séparément : une seule voie prouvée laisserait l'autre muette (T-20-08)"
    - "Un composant qui peut échouer garde son nœud d'écriture monté dans tous les états : le repli est un frère conditionnel, jamais une branche exclusive qui priverait le `<svg>` de son nœud (D-12)"
    - "Un booléen `true` rend `aria-required=\"true\"`, `undefined` omet l'attribut — c'est ce qui distingue un champ requis d'un champ optionnel sans brancher sur la valeur"

key-files:
  created:
    - "app/src/components/ui/field.test.tsx"
  modified:
    - "app/src/components/ui/field.tsx"
    - "app/src/components/shared/barcode.tsx"
    - "app/src/components/shared/barcode.test.tsx"

key-decisions:
  - "D-05 : `aria-required` voyage par le render prop `children({...})` ET par `useFieldControl()` ; l'astérisque visuel (`<span aria-hidden>`) et la mention « · optionnel » restent inchangés — le `*` accompagne l'attribut, il ne le remplace pas"
  - "D-12 : c'est le montage du `<svg>` qui est stable, pas l'effet qui est rejoué — les dépendances restent `[value]`, jamais élargies à `failed` (élargir aurait masqué le défaut sans le corriger, T-20-10)"
  - "Aucun site d'appel touché : les formulaires étalent `{...props}` et reçoivent la propriété sans modification ; `input.tsx` inchangé"

requirements-completed: [IN-05, IN-12]

# Coverage metadata (#1602) — deterministic UAT routing in verify-work.
coverage:
  - id: D1
    description: "Un champ requis rend un contrôle portant `aria-required=\"true\"` par le render prop ET par `useFieldControl()` ; un champ optionnel ne le porte pas ; le `*` visuel reste"
    requirement: "IN-05"
    verification:
      - kind: unit
        ref: "cd app && npx vitest run src/components/ui/field.test.tsx (3 cas : requis/render prop, optionnel/absent, requis/contexte)"
        status: pass
      - kind: unit
        ref: "cd app && npm run typecheck (tsc --noEmit)"
        status: pass
      - kind: unit
        ref: "cd app && npm test (140 fichiers, 1177 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "`BarCode` rend un vrai code-barres après un échec d'encodage, sur le même composant monté ; le `<svg>` est présent dans tous les états ; les deps de l'effet valent toujours `[value]`"
    requirement: "IN-12"
    verification:
      - kind: unit
        ref: "cd app && npx vitest run src/components/shared/barcode.test.tsx (6 cas, dont échec → valeur valide sur le même composant monté)"
        status: pass
      - kind: unit
        ref: "cd app && npm run typecheck && npm test && npm run build"
        status: pass
      - kind: unit
        ref: "grep -n '}, \\[value\\]);' src/components/shared/barcode.tsx (deps inchangées)"
        status: pass
    human_judgment: false

# Metrics
duration: 24min
completed: 2026-10-16
status: complete

# Measured plan commit range (#3968)
plan_head_before: 47a3402d3aec7c49cad12c55850d8360f8e2d5e6
plan_head_after: f38431cf89805532a82a68c3e2453df040abf64d
commits: 2
---

# Phase 20 Plan 03: Hygiène du dépôt (IN-05, IN-12) Summary

**Deux primitives partagées cessent de mentir : `Field` annonce le caractère requis au contrôle — par le render prop *et* par le contexte, pas seulement par un astérisque masqué — et `BarCode` garde son `<svg>` monté dans tous les états, donc une valeur valide après un échec redevient un vrai code-barres sur le même composant.**

## Performance

- **Duration:** ~24 min
- **Started:** 2026-10-16T06:53Z (approx.)
- **Completed:** 2026-10-16T07:17Z
- **Tasks:** 2/2
- **Files modified:** 4 (2 modifiés, 1 nouveau test, 1 test étendu)

## Accomplishments

- **IN-05 / D-05** — `app/src/components/ui/field.tsx` : `FieldContextValue` porte `required` (renseigné par `!optional`) ; le render prop `children({...})` reçoit `'aria-required': !optional || undefined` ; `useFieldControl()` ajoute `'aria-required': context.required || undefined`. Un champ requis rend `aria-required="true"`, un champ `optional` omet l'attribut. L'astérisque visuel (`<span aria-hidden="true"> *</span>`) et la mention `· optionnel` sont **inchangés** : le `*` accompagne l'attribut, il ne le remplace pas.
- **IN-12 / D-12** — `app/src/components/shared/barcode.tsx` : le rendu n'a plus deux branches exclusives. Une seule structure rend toujours le `<svg ref>` (classe visible quand l'encodage réussit, `sr-only` quand la valeur est vide ou que l'encodage a échoué) et le repli rayé (`barcode-stripes`, `aria-hidden`) est un **frère conditionnel**. Les dépendances de l'effet valent toujours `[value]`. La logique d'encodage (`resolveBarcodeFormat`, `normalizeBarcodeValue`, repli EAN-13 → CODE128) est inchangée.

## Task Commits

Each task was committed atomically (directly on `main`, `branching_strategy: none`) :

1. **Task 1 : le caractère requis se dit au contrôle, par les deux voies de `Field` (D-05)** — `33c79a9` (feat, `type="tracer"`)
2. **Task 2 : un code-barres qui échoue peut se rétablir (D-12)** — `f38431c` (fix, `tdd="true"`)

**Plan metadata:** non commité (`commit_docs: false`, `.planning/` gitignoré).

## Files Created/Modified

- `app/src/components/ui/field.tsx` — `required` ajouté à `FieldContextValue` et au provider ; type du render prop étendu de `'aria-required'?: boolean` ; appel `children({...})` porte `'aria-required': !optional || undefined` ; `useFieldControl()` porte `'aria-required': context.required || undefined` ; JSDoc précisé. L'astérisque et `· optionnel` intacts.
- `app/src/components/ui/field.test.tsx` — **nouveau**, 3 cas.
- `app/src/components/shared/barcode.tsx` — `showFallback` calculé une fois, repli rayé conditionnel, `<svg ref>` inconditionnel (`sr-only` en repli) ; deps de l'effet inchangées.
- `app/src/components/shared/barcode.test.tsx` — **+1 cas** (rétablissement) et assertion « repli ⇒ `<svg>` présent » ajoutée au cas de la valeur vide.

## Preuves rouge → vert (exigées par §2.7 B et D-05/D-12)

### Preuve 1 — `Field` / render prop (`field.test.tsx`)

**Rouge** — `'aria-required': !optional || undefined` commenté dans l'appel `children({...})` :

```
 ❯ src/components/ui/field.test.tsx (3 tests | 1 failed) 81ms
     × un champ requis porte aria-required par le render prop
 FAIL  src/components/ui/field.test.tsx > ... > un champ requis porte aria-required par le render prop
 Error: expect(element).toHaveAttribute("aria-required", "true") // element.getAttribute("aria-required") === "true"
 Expected the element to have attribute:
   aria-required="true"
 Received:
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
```

**Vert** (restauré) : `Test Files 1 passed (1) / Tests 3 passed (3)`.

### Preuve 2 — `Field` / contexte (`field.test.tsx`)

**Rouge** — `'aria-required': context.required || undefined` commenté dans `useFieldControl()` :

```
 ❯ src/components/ui/field.test.tsx (3 tests | 1 failed) 80ms
     × un champ requis porte aria-required par useFieldControl()
 FAIL  src/components/ui/field.test.tsx > ... > un champ requis porte aria-required par useFieldControl()
 Error: expect(element).toHaveAttribute("aria-required", "true") // element.getAttribute("aria-required") === "true"
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
```

**Vert** (restauré) : `Test Files 1 passed (1) / Tests 3 passed (3)`.

Les deux voies sont prouvées **séparément** : retirer l'attribut d'une seule laisse l'autre verte — c'est exactement ce que T-20-08 demande de vérifier (une seule voie prouvée laisserait l'autre muette).

### Preuve 3 — `BarCode` / structure à deux branches exclusives (`barcode.test.tsx`)

**Rouge** — ancienne structure restaurée (`if (!value.trim() || failed) { … sans <svg> }`) :

```
 ❯ src/components/shared/barcode.test.tsx (6 tests | 2 failed) 89ms
     × affiche un repli quand la valeur est vide 11ms
     × se rétablit sur le même composant monté après un échec d’encodage 5ms
 Test Files  1 failed (1)
      Tests  2 failed | 4 passed (6)
```

Le premier échec nomme le montage : `expect(target.querySelector('svg')).not.toBeNull()` — `Received: null`.

**Rouge (sonde)** — assertions d'état échoué neutralisées pour isoler la **conséquence** (le composant ne se rétablit pas), sur la même ancienne structure :

```
 FAIL  src/components/shared/barcode.test.tsx > BarCode > se rétablit sur le même composant monté après un échec d’encodage
 AssertionError: expected <div class="barcode-stripes" …(1)></div> to be null
```

C'est le défaut nommé par D-12 : après un `rerender` avec une valeur **valide**, l'ancien composant affiche **toujours** le repli rayé — il ne se rétablit pas, sans qu'aucun code n'ait changé entre-temps.

**Vert** (restauré) : `Test Files 1 passed (1) / Tests 6 passed (6)`.

## Verification Results

| # | Commande | Résultat |
|---|---|---|
| 1 | `cd app && npm run typecheck && npm test && npm run build` | **vert** — `tsc --noEmit` OK ; **140 fichiers / 1177 tests** ; build Vite OK (PWA v1.3.0, `dist/sw.js` généré) |
| 2 | `cd app && npx vitest run src/components/ui/field.test.tsx src/components/shared/barcode.test.tsx` | **vert** — 2 fichiers, **9 tests** |
| 3 | Non-régression `Field` (`npm test` couvre notes, adresses, tâches, ardoise, cadeaux, voyages…) | **vert** — 140/140 fichiers, aucune assertion existante cassée par l'ajout de l'attribut |
| 4 | `python3 scripts/check-sql-statique.py` | **vert** — 181 fonctions effectives, « aucun défaut » (aucun SQL touché) |
| 5 | `grep -n '}, \[value\]);' app/src/components/shared/barcode.tsx` | **`74:  }, [value]);`** — deps de l'effet **inchangées** (D-12) |

## Deviations from Plan

**None** — plan exécuté exactement comme écrit.

- Aucune dépendance ajoutée (T-20-SC non déclenché) ; aucun SQL touché ; aucun site d'appel de `Field` modifié ; `input.tsx` inchangé.
- Aucun `git add` de chemin `.planning/` (gitignoré) ; deux commits atomiques, un par tâche.
- Aucune directive de linter introduite (garde de classe `no-eslint-directive.test.ts` respecté) ; les commentaires ajoutés nomment la raison, ils ne la masquent pas.
- Note d'exécution : la preuve rouge de la tâche 2 a été prise **deux fois** (structure à deux branches → 2 échecs ; puis sonde isolant la non-rétablissement → `barcode-stripes` subsistant après `rerender`), afin de prouver la **conséquence** et pas seulement la présence du nœud. Aucune déviation : c'est une preuve plus forte que le minimum demandé.

## Issues Encountered

None.

## User Setup Required

None — aucune configuration de service externe.

## Threat Flags

Aucun. Les deux changements n'ouvrent aucune surface nouvelle : `aria-required` est un attribut déclaratif sur un contrôle déjà rendu, et `sr-only` masque visuellement un `<svg>` déjà `aria-hidden` (donc invisible aux technologies d'assistance dans tous les états, comme avant). T-20-08, T-20-09 et T-20-10 sont couverts par les preuves ci-dessus.

## Next Phase Readiness

- IN-05 et IN-12 sont fermés ; les autres constats `IN-*` de la phase 20 restent ouverts (plans 20-01, 20-02 et 20-04…20-07).
- `npm run test:e2e` (attendu 121 passés / 5 sautés, chaîne de la phase) n'est pas dans la `<verification>` de ce plan : les changements sont un attribut ARIA et un montage SVG, sans effet sur les parcours Playwright — l'e2e reste à rejouer au niveau de la phase.
- `STATE.md` / `ROADMAP.md` non mis à jour par cet exécuteur : la vague 2 peut porter d'autres plans en parallèle, l'orchestrateur centralise l'avancement.
- Rien à signaler dans `WINDOWS.md` : aucun stub, aucun test sauté, aucune `<verify>` non exécutée, aucune déviation.

---
*Phase: 20-hygiene-du-depot-les-14-constats-in-de-la-revue*
*Completed: 2026-10-16*

## Self-Check: PASSED

- FOUND: `app/src/components/ui/field.tsx`, `app/src/components/ui/field.test.tsx`, `app/src/components/shared/barcode.tsx`, `app/src/components/shared/barcode.test.tsx`
- FOUND: commits `33c79a9`, `f38431c`
