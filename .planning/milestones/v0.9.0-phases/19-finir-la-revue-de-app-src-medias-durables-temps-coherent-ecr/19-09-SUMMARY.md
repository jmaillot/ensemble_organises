---
phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr
plan: 09
subsystem: ui/api
tags: [supabase, storage, signed-url, react-query, d-01, d-03, wr-08, wr-10, ardoise]

# Dependency graph
requires:
  - phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr
    provides: app/src/lib/storage.ts — storedValueOf, isHouseholdMediaPath, householdMediaPathOf, replacedMediaPath, removeHouseholdFile, resolveHouseholdMediaUrl(s) (point unique de 19-01)
  - phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr
    provides: motifs de 19-07/19-08 (displayablePhoto, photoStored, carte de résolution dans le hook) — ici transposés en `displayableCoverUrl`/`coverUrls`
provides:
  - "Ardoise : `ardoises.cover_url` porte le CHEMIN du bucket à l'écriture (storedValueOf), l'URL signée est forgée à la lecture — liste ET fiche, échec fermé (D-01, WR-08)"
  - "`resolveArdoiseCoverUrl` / `resolveArdoiseCoverUrls` (api.ts) délèguent à lib/storage : aucun `createSignedUrl` local (D-01)"
  - "`displayableCoverUrl(row, resolved)` + `coverUrls`/`coverUrlOf(row)` exposés par `useArdoises` et `useArdoiseDetail` : chemin → URL signée, non-chemin → valeur brute, blanc → null, signature échouée → null"
  - "`deleteArdoise` retire l'objet de couverture (ligne d'abord, objet ensuite, best-effort) ; la fiche retire l'objet remplacé (replacedMediaPath) après écriture réussie (D-03, WR-10)"
affects: [19-10, 19-11, 19-12, 19-13]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 10054
  tasks: 2
  commits: 2
  plan_head_before: 1db145110111dc1ed8cb5c353f8db55982a90556
  plan_head_after: 132dad1baa7144d4e85a61a7dec90771c0c9d974

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Écriture d'un média : storedValueOf(deposited) dans la colonne (jamais deposited.url) — 3e module aligné après 19-07/19-08"
    - "Lecture d'un média : isHouseholdMediaPath → resolveArdoiseCoverUrls → displayableCoverUrl, carte de résolution détenue par le hook (useArdoiseCoverUrls) et consommée par un `coverUrlOf` lié à la carte"
    - "Valeur affichable mémorisée UNE fois par ligne (constante locale dans le map) : l'affichage et les conditions de style partagent la même résolution, donc un échec de signature retombe sur le style sans image"
    - "Brouillon d'édition : la valeur initiale vient de la COLONNE (`cover_url`), jamais de la valeur affichable ; remplacement décidé par replacedMediaPath sur les valeurs de colonne, retiré best-effort après succès"
    - "Suppression d'entité : lire la ligne (best-effort) → supprimer la ligne → retirer l'objet (best-effort, échec avalé) — ordre D-03 tenu dans le module, pas dans le composant"

key-files:
  created: []
  modified:
    - app/src/modules/ardoise/api.ts
    - app/src/modules/ardoise/hooks/use-ardoise.ts
    - app/src/modules/ardoise/api.test.ts
    - app/src/modules/ardoise/ardoise-page.tsx
    - app/src/modules/ardoise/ardoise-detail-page.tsx
    - app/src/modules/ardoise/ardoise-page.test.tsx

key-decisions:
  - "`resolveArdoiseCoverUrls` ne met dans la carte que les CHEMINS (filtre isHouseholdMediaPath en amont), comme le hook prestataires (19-01) : une couverture héritée en http(s) est absente de la carte et c'est `displayableCoverUrl` qui la rend telle quelle — la carte signifie « objets du bucket signés », pas « toutes les valeurs affichables »."
  - "`displayableCoverUrl(row, resolved)` est la fonction pure (exportée, prouvée seule), et `coverUrlOf(row)` est la version liée à la carte exposée par les hooks — le plan demandait une signature à un argument, la carte ne pouvant pas être un paramètre implicite sans devenir un état mutable de module."
  - "Le détail résout la ligne unique par le MÊME helper de hook (`useArdoiseCoverUrls([row])`), pas par `resolveArdoiseCoverUrl` directement : une seule carte, un seul code d'annulation, deux consommateurs."
  - "`deleteArdoise` lit la ligne en best-effort (`catch(() => [])`) : l'échec de la lecture ne doit pas retenir la suppression de ligne (fermeture avant ouverture), et le retrait d'objet n'est tenté qu'avec un chemin (`householdMediaPathOf`)."
  - "Aucune compensation ajoutée dans les composants : le remplacement vit dans `ArdoiseSettings.save` (là où la ligne est écrite) et la suppression dans `deleteArdoise` (là où la ligne est retirée), conformément à D-03."

patterns-established:
  - "read-side media resolution (3e module) : carte signée dans le hook (useState + useEffect + témoin d'annulation + useMemo de lignes stable), fonction pure de décision exportée et testée, `null` en échec fermé"
  - "row-scoped write draft: la valeur de colonne (jamais l'affichable) part dans le brouillon et dans le payload ; replacedMediaPath décide avant, removeHouseholdFile compense après"

requirements-completed: [WR-08, WR-10]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Une couverture d'ardoise déposée porte le CHEMIN du bucket dans ardoises.cover_url, jamais l'URL signée du dépôt (D-01)."
    requirement: WR-08
    verification:
      - kind: unit
        ref: "app/src/modules/ardoise/ardoise-page.test.tsx#écrit la couverture déposée en chemin, jamais l’URL signée du dépôt"
        status: pass
      - kind: unit
        ref: "app/src/modules/ardoise/ardoise-page.test.tsx#remplacer la couverture persiste un chemin et retire l’objet précédent"
        status: pass
    human_judgment: false
  - id: D2
    description: "La liste et la fiche affichent une URL signée forgée à la lecture ; une forme non-chemin s'affiche telle quelle, en échec fermé (D-01)."
    requirement: WR-08
    verification:
      - kind: unit
        ref: "app/src/modules/ardoise/api.test.ts#ne signe que les chemins : une couverture externe reste hors de la carte"
        status: pass
      - kind: unit
        ref: "app/src/modules/ardoise/api.test.ts#coverUrlOf : URL résolue pour un chemin, brute pour une forme non-chemin, null si blanc ou non signé"
        status: pass
      - kind: unit
        ref: "app/src/modules/ardoise/ardoise-page.test.tsx#signe le chemin stocké à l’affichage (backend présent)"
        status: pass
      - kind: unit
        ref: "app/src/modules/ardoise/ardoise-page.test.tsx#affiche une couverture externe héritée telle quelle, sans appel de signature"
        status: pass
    human_judgment: false
  - id: D3
    description: "Réenregistrer la fiche sans toucher la couverture réécrit la valeur STOCKÉE (le chemin), jamais l'URL affichée (T-19-24, piège WR-05)."
    requirement: WR-08
    verification:
      - kind: unit
        ref: "app/src/modules/ardoise/ardoise-page.test.tsx#réenregistrer sans nouvelle couverture réécrit la valeur stockée, jamais l’URL affichée"
        status: pass
    human_judgment: false
  - id: D4
    description: "Remplacer une couverture retire l'objet précédent (D-03)."
    requirement: WR-10
    verification:
      - kind: unit
        ref: "app/src/modules/ardoise/ardoise-page.test.tsx#remplacer la couverture persiste un chemin et retire l’objet précédent"
        status: pass
      - kind: unit
        ref: "app/src/modules/ardoise/ardoise-page.test.tsx#réenregistrer sans nouvelle couverture … (removeFileMock non appelé)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Supprimer une ardoise retire sa couverture ; l'échec du retrait ne transforme pas une suppression réussie en échec (best-effort)."
    requirement: WR-10
    verification:
      - kind: unit
        ref: "app/src/modules/ardoise/api.test.ts#supprime la ligne puis l’objet de sa couverture, dans cet ordre"
        status: pass
      - kind: unit
        ref: "app/src/modules/ardoise/api.test.ts#un retrait d’objet en échec ne fait pas échouer la suppression"
        status: pass
      - kind: unit
        ref: "app/src/modules/ardoise/api.test.ts#une couverture non-chemin n’est jamais un objet de bucket"
        status: pass
    human_judgment: false

# Metrics
duration: 17min
completed: 2026-10-15
status: complete
---

# Phase 19 Plan 09: Ardoise — la couverture porte un chemin, la lecture re-signe, l'objet suit sa ligne Summary

**`ardoises.cover_url` reçoit le CHEMIN du bucket (`storedValueOf(deposited)`) et les deux écrans re-signent à la lecture via le point unique de 19-01 (`resolveArdoiseCoverUrl(s)` + `displayableCoverUrl`, échec fermé) ; réenregistrer sans toucher la couverture réécrit la valeur stockée — jamais l'URL affichée (T-19-24) — et remplacer/supprimer retire l'objet, en best-effort (D-01/D-03, WR-08/WR-10).**

## Performance

- **Duration:** ~17 min
- **Started:** 2026-10-15T20:52:34Z (Task 1)
- **Completed:** 2026-10-15T21:09Z (commit Task 2)
- **Tasks:** 2
- **Files modified:** 6 (tous dans `app/src/modules/ardoise`)

## Accomplishments
- **Écriture** : la création (dialogue de `ardoise-page.tsx`) et la fiche Paramètres (`ardoise-detail-page.tsx`) persistent `storedValueOf(deposited)` — le chemin de bucket — et plus jamais l'URL signée 30 jours du dépôt (D-01, WR-08). La colonne cesse d'être une référence durable morte à J+31.
- **Lecture** : `resolveArdoiseCoverUrl`/`resolveArdoiseCoverUrls` (api.ts) délèguent à `lib/storage.ts` — **aucune** copie locale de `createSignedUrl` (D-01). Le verdict « chemin » est `isHouseholdMediaPath` ; seuls les chemins entrent dans la carte, une valeur non-chemin (URL héritée, `data:`, `blob:`, `/…`) s'affiche telle quelle et ne consomme aucun appel Storage.
- **Valeur affichable** : `displayableCoverUrl(row, resolved)` (pure, exportée) rend `null` pour un blanc **et** pour un chemin dont la signature a échoué — le DOM ne reçoit ni chemin brut ni lien mort. Les hooks `useArdoises` et `useArdoiseDetail` exposent `coverUrls` + `coverUrlOf`, la liste et la fiche consomment `coverUrlOf` **une fois par ligne**, y compris dans les conditions de style : une signature en échec retombe sur le style « sans image » au lieu de blanchir le texte sur rien.
- **Le piège de la relecture d'écriture est fermé** : le brouillon de la fiche part de `ardoise?.cover_url` (la **colonne**), jamais de `coverUrlOf(ardoise)` — sinon chaque enregistrement de nom aurait écrit une URL signée dans une colonne que tout le dépôt lit comme un chemin (WR-05 de la phase 18, T-19-24). Une mutation ciblée le démontre (voir Red Proofs).
- **Compensation** : `deleteArdoise` lit la ligne, la supprime, puis retire l'objet (`householdMediaPathOf` → `removeHouseholdFile`) ; la fiche calcule `replacedMediaPath(cover_url, coverUrl)` avant l'écriture et retire l'objet précédent après succès. Dans les deux cas le retrait est best-effort : un échec de nettoyage ne transforme pas un succès en échec (D-03). La compensation vit au même endroit que l'écriture/la suppression de ligne, jamais dans un composant consommateur.

## Task Commits

Each task was committed atomically:

1. **Task 1: Ardoise — résolution de couverture et objets qui suivent leur ligne** — `dd070c7` (fix)
2. **Task 2: Ardoise — les deux écrans écrivent un chemin et affichent une URL signée** — `132dad1` (fix)

**Plan metadata:** aucun commit de plan dédié — `.planning/` est gitignoré (`.gitignore:58`) et `commit_docs: false` ; `19-09-SUMMARY.md` reste **non commité**, par choix de configuration (identique à 19-07/19-08).

## Files Created/Modified
- `app/src/modules/ardoise/api.ts` — `resolveArdoiseCoverUrl`, `resolveArdoiseCoverUrls` (délégation à `lib/storage`, chemins uniquement) ; `deleteArdoise` : lecture best-effort, suppression de ligne, puis retrait de l'objet de couverture en best-effort
- `app/src/modules/ardoise/hooks/use-ardoise.ts` — `displayableCoverUrl` (pure, exportée), `useArdoiseCoverUrls` (carte signée : `useState` + `useEffect` + témoin d'annulation), `ArdoisesData`/`ArdoiseDetailData` exposent `coverUrls` + `coverUrlOf`
- `app/src/modules/ardoise/api.test.ts` — mocks `@/lib/storage` (partial, `importOriginal`) et client Supabase mutable ; 7 tests ajoutés (résolution chemin/non-chemin, échec fermé, `coverUrlOf`, ordre ligne→objet, retrait en échec non bloquant)
- `app/src/modules/ardoise/ardoise-page.tsx` — `storedValueOf(deposited)` à la création ; `coverUrlOf` en tête de `map` (une constante locale pour les 6 lectures d'affichage et de style)
- `app/src/modules/ardoise/ardoise-detail-page.tsx` — brouillon = valeur de colonne (piège nommé) ; dépôt en chemin ; `replacedMediaPath` + `removeHouseholdFile` best-effort après succès ; affichage par `coverUrlOf` (constante `coverUrl` calculée une fois)
- `app/src/modules/ardoise/ardoise-page.test.tsx` — mocks `@/lib/storage` (dépôt renvoyant chemin **et** URL distincts) et client Supabase mutable ; 5 tests ajoutés (colonne = chemin, signature à l'affichage, URL externe sans signature, réenregistrement sans changement, remplacement compensé)

## Decisions Made
- **La carte ne contient que des chemins.** `resolveArdoiseCoverUrls` filtre en amont (`isHouseholdMediaPath`), comme `use-prestataires.ts:68` et comme le plan l'écrit (« une couverture externe est absente de la carte »). `displayableCoverUrl` reste donc responsable des formes non-chemin, ce qui évite d'injecter une URL héritée dans une carte qui signifie « objet de bucket signé ».
- **Deux niveaux volontairement séparés** : `displayableCoverUrl(row, resolved)` est la décision pure (exportée, prouvée sur les 6 cas du `<behavior>`), `coverUrlOf(row)` la version liée à la carte du hook. Le plan demandait `coverUrlOf(row)` à un argument ; la carte ne peut pas être implicite sans devenir un état de module, donc la décision pure prend la carte en paramètre et le hook la lie.
- **Le détail réutilise le helper de hook** sur sa ligne unique (`coverRows` mémoïsé sur `ardoise`) plutôt que d'appeler `resolveArdoiseCoverUrl` directement : une seule carte, une seule annulation, deux écrans — et `coverUrlOf` a exactement le même sens dans la liste et la fiche.
- **Lecture de ligne best-effort dans `deleteArdoise`.** Le plan dit « lire la ligne avant de la supprimer » ; une lecture qui échoue ne doit pas retenir la suppression (fermeture avant ouverture : une ligne sans objet est réparable, un objet sans ligne ne l'est pas). Le `.catch(() => [])` est commenté dans le code.
- **Aucune restructuration de `NewArdoiseInput`.** `coverUrl` reste le nom du champ transporté ; seule sa **valeur** change de nature (chemin). Renommer le champ aurait touché l'Edge `create-ardoise` (`p_cover_url`, `index.ts:393`) sans nécessité — le serveur reçoit déjà une chaîne.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `deleteArdoise` avait besoin de `data.remove` dans le mock de test (Task 1)**
- **Found during:** Task 1 (tests)
- **Issue:** `api.test.ts` ne mockait que `data.create`/`data.list` (elle n'exerçait pas `deleteArdoise`). Écrire les trois cas de suppression sans `remove` aurait appelé `undefined(...)`.
- **Fix:** ajout de `mockRemove` au mock hoisté de `@/lib/data`, et du mock partiel de `@/lib/storage` (`importOriginal` étalé, seul `removeHouseholdFile` espionné) pour pouvoir observer le retrait d'objet.
- **Files modified:** `app/src/modules/ardoise/api.test.ts`
- **Verification:** `npx vitest run src/modules/ardoise/api.test.ts` — 10 tests verts ; preuve rouge sur le filtre de chemin.
- **Committed in:** `dd070c7` (Task 1)

**2. [Rule 3 - Blocking] Le client Supabase du test devait devenir mutable (Task 1 et 2)**
- **Found during:** Tasks 1 et 2 (tests)
- **Issue:** les deux fichiers mockaient `isSupabaseConfigured: false` en littéral. Or la signature n'existe **qu'**en mode configuré : sans pouvoir basculer l'état, aucune assertion « le chemin se signe à la lecture » ne peut s'exécuter — et une assertion qui ne peut pas s'exécuter ne peut pas échouer.
- **Fix:** mock piloté par un état hoisté (`supabaseState.configured`), `supabase` en accesseur, `storage.from(...).createSignedUrl/remove` espionnés. L'état par défaut reste `false`, donc les cas existants (démo Dexie, `createArdoise` local) sont inchangés — et le module `@/lib/data` continue de résoudre l'adaptateur local à l'import.
- **Files modified:** `app/src/modules/ardoise/api.test.ts`, `app/src/modules/ardoise/ardoise-page.test.tsx`
- **Verification:** suites complètes vertes (131 fichiers / 1114 tests).
- **Committed in:** `dd070c7` (Task 1) et `132dad1` (Task 2)

**3. [Rule 2 - Missing critical] Tests d'écriture de la FICHE dans `ardoise-page.test.tsx` (Task 2)**
- **Found during:** Task 2 (tests)
- **Issue:** le plan liste trois cas à ajouter à `ardoise-page.test.tsx`, mais le `<behavior>` et les critères de succès engagent aussi l'écriture de la fiche Paramètres (brouillon = colonne ; remplacement compensé) — le piège T-19-24, qui n'est prouvable nulle part ailleurs sans sortir de `files_modified` (`ardoise-detail-page.test.tsx` n'est pas dans la liste).
- **Fix:** un `describe('ArdoiseDetailPage — Paramètres : la couverture suit sa ligne')` dans `ardoise-page.test.tsx` (fichier qui importe déjà `ArdoiseDetailPage` et monte déjà ses routes) : réenregistrement sans nouvelle couverture → la colonne garde le chemin et aucun objet n'est retiré ; remplacement → nouveau chemin en colonne + retrait de l'ancien.
- **Files modified:** `app/src/modules/ardoise/ardoise-page.test.tsx`
- **Verification:** 11 tests verts dans le fichier ; la mutation du brouillon les fait échouer (Red Proofs).
- **Committed in:** `132dad1` (Task 2)

---

**Total deviations:** 3 auto-fixed (2 blocages Rule 3, 1 fonctionnalité critique Rule 2).
**Impact on plan:** nul sur le périmètre — les trois portent sur les tests (leur capacité à échouer) et sur l'ordre ligne→objet. Le code applicatif suit le plan à la lettre : les deux seuls emplacements d'écriture, les deux seuls emplacements de retrait, aucun nouveau fichier.

## Issues Encountered
- **`resolveArdoiseCoverUrl` n'est pas appelée par le détail.** Le plan cite la fonction pour l'artefact `api.ts` mais l'énoncé du `<behavior>` décrit `coverUrlOf(row)` pour le détail. Trancher en faveur d'une **carte unique** partagée par les deux écrans évite deux chemins de résolution qui pourraient diverger (l'un signant sur la ligne, l'autre non) ; `resolveArdoiseCoverUrl` reste exportée pour les consommateurs hors hook et couverte par un test unitaire.
- **Le détail monte l'onglet Paramètres avec `supabaseFunctionsBase: null`** dans le mock, donc `fetchInviteSummary` échoue pendant ces deux tests (le panneau Code affiche « Aucun code actif »). C'est sans effet sur ce qui est prouvé (couverture) et évite d'ajouter un stub `fetch` non nécessaire ; signalé ici pour que personne ne s'en étonne à la lecture des logs de test.

## Red Proofs (preuve rouge→vert)
- **Task 1 — le filtre de chemin** : `rows.filter(r => r.cover_url !== null && isHouseholdMediaPath(r.cover_url))` muté en `rows.filter(r => r.cover_url !== null)` dans `resolveArdoiseCoverUrls` → `api.test.ts` échoue — `expected { a, b } to deeply equal { a }`, avec `b: "https://externe.example/photo.jpg"` : la mutation fait bien **entrer la couverture externe dans la carte**, c'est-à-dire la fait « signer ». Restauré → vert (10/10).
- **Task 2 — la colonne reçoit un chemin** : `coverUrl = storedValueOf(deposited)` muté en `coverUrl = deposited.url` dans `ardoise-page.tsx:146` **et** `ardoise-detail-page.tsx:533` → 2 échecs constatés (`expected 'https://signe.example/foyer-1/ardoise…' to be 'foyer-1/ardoises/couverture.webp'`), restaurés → vert (11/11).
- **Task 2 — le piège du brouillon (T-19-24)** : `let coverUrl = ardoise?.cover_url ?? null` muté en `let coverUrl = ardoise ? coverUrlOf(ardoise) : null` → 1 échec constaté (`expected 'https://signe.example/foyer-1/ardoise…' to be 'foyer-1/ardoises/plage.webp'`) : l'URL signée serait réécrite dans la colonne. Restauré → vert (72/72 sur `src/modules/ardoise`).
- Aucun résidu d'instrumentation : `grep -rn "deposited.url" app/src/modules/ardoise` **vide**, `grep -rn "src={ardoise.cover_url}" app/src/modules/ardoise` **vide** (les deux contrôles de non-régression exigés par la `<verification>` du plan).

## Verification Chain (résultats réels)

| Étape | Commande | Résultat |
|---|---|---|
| Typecheck | `cd app && npm run typecheck` | vert (exit 0, `tsc --noEmit` muet) |
| Suite complète | `cd app && npm test` | vert — **131 fichiers / 1114 tests** (base 19-08 : 131 / 1102 ; +12 = +7 `api.test.ts`, +5 `ardoise-page.test.tsx`) |
| Tests ciblés module | `npx vitest run src/modules/ardoise` | vert — 11 fichiers / 72 tests |
| Build | `cd app && npm run build` | vert (exit 0 ; PWA `injectManifest`, 104 entrées précachées) |
| SQL statique | `python3 scripts/check-sql-statique.py` | vert (exit 0) — « 180 fonction(s) effective(s) sur 123 migration(s) et 62 test(s), aucun défaut » |
| Verrou non-régression (a) | `grep -rn "deposited.url" app/src/modules/ardoise` | **vide** |
| Verrou non-régression (b) | `grep -rn "src={ardoise.cover_url}" app/src/modules/ardoise` | **vide** |

**Leverage SQL** : ce plan n'ajoute **aucune migration** et ne touche à aucun fichier `supabase/` — `scripts/migrate.sh`, `sh scripts/test-db.sh` et `sh scripts/test-dispatch-push.sh` n'ont **aucun levier** ici. Docker est disponible sur l'hôte, mais rien de ce plan ne s'y exécute : le dire, plutôt que de laisser croire que la chaîne SQL a validé quelque chose.

**`npm run test:e2e`** n'a **pas** été réexécuté : le contexte d'exécution le déclare vert (121 passés) et ce plan ne touche aucun sélecteur ni parcours e2e (aucun `data-testid`, aucun libellé d'action modifiés — seul l'`src` d'une `img` de couverture change). Consigné comme tel, non comme une exécution.

## Threat Surface Scan
Aucune surface nouvelle au sens du `<threat_model>` : les deux colonnes et le bucket existaient déjà, seule la **valeur** écrite change. Les mitigations du plan sont en place — **T-19-23** (plus d'URL signée 30 j persistée : la colonne porte le chemin, l'URL n'existe qu'à la lecture via `resolveArdoiseCoverUrls`, échec fermé), **T-19-24** (le brouillon vient de la colonne, prouvé par mutation), **T-19-25** (objets orphelins retirés au remplacement et à la suppression, best-effort), **T-19-SC** (aucun paquet ajouté — `npm ls` inchangé, aucun `npm install`). Aucun `threat_flag` nouveau introduit par ce plan.

## Known Follow-up (hors périmètre, consigné en `deferred-items.md` §10) — **CLOS par 19-14**
- **Le parcours invité n'est pas aligné sur D-01.** *(Trace du 19-09 : l'état décrit ci-dessous a été corrigé par le plan 19-14, voir la ligne de clôture en fin de paragraphe.)* `GuestArdoiseView.ardoise.cover_url` est servi **tel quel** par l'Edge `ardoise-invite` (lecture `select('…,cover_url,…')` puis restitution, `index.ts:615,689`) et rendu directement dans un `<img>` par `guest-ardoise-page.tsx:100-102`. Depuis ce plan, une ardoise **créée ou modifiée** porte un chemin : le lien invité affichera une image cassée (avant, il consommait une URL signée qui vivait 30 jours). `guest-ardoise-page.tsx` et `supabase/functions/ardoise-invite/` ne sont dans le `files_modified` d'aucun plan : la correction demande une décision (signature côté serveur avec la clé secrète, le bucket restant fermé aux non-membres) — donc **Rule 4**, pas un correctif d'exécuteur. Aucune migration de rattrapage n'existe non plus pour `ardoises.cover_url` (vérifié : aucune migration ne référence `storage/v1/object` ni `object/sign`), donc les lignes existantes déjà mortes le restent. **CLOS par 19-14 (`39b0c6d`, 2026-10-16)** : la couverture invitée est désormais signée côté serveur (`resolveGuestCoverUrl` appelé en `index.ts:737`, TTL 1 h, échec fermé à `null`), la charge utile porte `coverUrl`, et un verrou de source (`app/src/lib/guest-media-contract.test.ts`) empêche la récidive — le lien invité affiche donc sa couverture.

## Next Phase Readiness
- L'Ardoise est alignée sur le point unique de 19-01 ; WR-08 et WR-10 sont tenus sur les deux faces (écriture en chemin, lecture re-signée, objets compensés) et **prouvés par mutation**.
- Le motif `displayableCoverUrl(row, resolved)` + `coverUrls`/`coverUrlOf` est le troisième du genre (après `displayablePhoto` de 19-07 et les cartes de Courses/Cadeaux de 19-08) : réutilisable par 19-10 (Cercle, dont le média est le dernier module WR-08 hors invité) et par les plans 19-11…19-13.
- Laissé intact volontairement : `lib/storage.ts` (19-01), `guest-ardoise-page.tsx` et l'Edge `ardoise-invite` (hors `files_modified`), le règlement et les RPC de l'Ardoise (le plan l'interdit), le bornage de la somme des parts personnalisées de `expense-form-dialog.tsx`/`ardoise/types.ts` (18-05, non rouvert).
- Fichiers non suivis préexistants laissés intacts : `.claude/`, `.gsd/`, `app/shot-toggle-on.mjs` (déjà relevés en `deferred-items.md` §9 ; non créés ni touchés par ce plan).

---
*Phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr*
*Completed: 2026-10-15*

## Self-Check: PASSED
- FOUND: `.planning/phases/19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr/19-09-SUMMARY.md`
- FOUND: commits `dd070c7`, `132dad1`
- FOUND: `app/src/modules/ardoise/api.ts`, `app/src/modules/ardoise/hooks/use-ardoise.ts`, `app/src/modules/ardoise/ardoise-page.tsx`, `app/src/modules/ardoise/ardoise-detail-page.tsx`, `app/src/modules/ardoise/api.test.ts`, `app/src/modules/ardoise/ardoise-page.test.tsx`
- Measured commit count over `1db1451..HEAD` = 2 ; full suite: 131 files / 1114 tests
