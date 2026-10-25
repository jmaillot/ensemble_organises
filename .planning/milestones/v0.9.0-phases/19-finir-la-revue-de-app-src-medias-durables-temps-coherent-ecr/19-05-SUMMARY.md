---
phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr
plan: 05
subsystem: ui
tags: [react, hooks, barcode, qr, html5-qrcode, barcode-detector, mediastream, testing-library, vitest]

requires:
  - phase: 18-durcissement-frontend-correctifs-de-revue-de-code
    provides: "18-REVIEW.md §WR-15 (fidélité : format du repli, construction du détecteur, fermeture pendant l'ouverture)"
provides:
  - "use-barcode-scanner : le repli lit formatName (jamais l'entier d'énumération), les formats natifs sont filtrés par getSupportedFormats, une génération d'ouverture coupe un flux arrivé trop tard"
  - "premier fichier de test du module fidélité (17 tests, dont les 3 volets WR-15)"

actuals:
  tokens: 6674
  tasks: 3
  commits: 3
  plan_head_before: 05366de999f64732cc8de69808280d3d44289e18
  plan_head_after: 0335f8e0804176dcd99ecfb638f2f67ba41c3a96

tech-stack:
  added: []
  patterns:
    - "Génération d'ouverture (useRef<number>) : start la capture et la vérifie après chaque await, stop l'incrémente — un flux à génération périmée est coupé immédiatement"
    - "Un helper unique (toScanFormat) porte la correspondance format→ScanFormat : nom stable d'abord, entier d'énumération en second recours"

key-files:
  created:
    - app/src/modules/fidelite/hooks/use-barcode-scanner.test.ts
  modified:
    - app/src/modules/fidelite/hooks/use-barcode-scanner.ts

key-decisions:
  - "WR-15a : le chemin du repli passe formatName ('QR_CODE'…), pas l'entier Html5QrcodeSupportedFormats ; l'entier reste accepté par toScanFormat en second recours pour qu'un futur site d'appel ne rouvre pas le défaut"
  - "Les valeurs d'énumération du PLAN étaient fausses (CODE_128=1, EAN_13=3) : ce sont celles d'AZTEC et CODE_39. Les vraies valeurs vérifiées dans node_modules/html5-qrcode/core.d.ts sont QR_CODE=0, CODE_128=5, EAN_13=9 — utilisé celles-ci"
  - "WR-15b : le détecteur natif est construit avec l'intersection getSupportedFormats ∩ formats demandés ; un `try` local poursuit vers le repli au lieu de conclure 'error'. Le `catch` externe reste réservé au refus caméra ('denied') et au conteneur sans identifiant ('error')"
  - "toScanFormat exporté pour être testé directement : la branche entière (second recours) est inatteignable depuis le hook, donc un test passant par le hook n'aurait rien vérifié (AGENTS.md §2.7.D)"
  - "Le contrat fermé est « track.stop() appelé sur le flux tardif » ; jsdom ne prouve pas la libération réelle de la caméra (voir Coverage D3)"

patterns-established:
  - "Scanner annulable : toute opération asynchrone d'ouverture est gardée par une génération, pas par un booléen d'annulation"

requirements-completed: [WR-15]

coverage:
  - id: D1
    description: "Un QR (ou CODE_128 / EAN_13) lu par le repli html5-qrcode est enregistré avec le bon ScanFormat, plus jamais en code-barres par défaut ; un nom inconnu ou absent donne 'other' sans lever"
    requirement: "WR-15"
    verification:
      - kind: unit
        ref: "app/src/modules/fidelite/hooks/use-barcode-scanner.test.ts#enregistre un QR lu par le repli comme qr_code, jamais comme code-barres"
        status: pass
      - kind: unit
        ref: "app/src/modules/fidelite/hooks/use-barcode-scanner.test.ts#mappe CODE_128 et EAN_13 du repli sur leur ScanFormat"
        status: pass
      - kind: unit
        ref: "app/src/modules/fidelite/hooks/use-barcode-scanner.test.ts#range un nom inconnu ou absent en other, sans lever"
        status: pass
    human_judgment: false
  - id: D2
    description: "Un BarcodeDetector qui ne supporte pas tous les formats demandés ne fait plus échouer le scan : le détecteur est construit avec les formats réellement supportés, et une intersection vide (ou une construction qui lève) bascule sur le repli html5-qrcode au lieu de 'error' ; un refus de caméra reste 'denied'"
    requirement: "WR-15"
    verification:
      - kind: unit
        ref: "app/src/modules/fidelite/hooks/use-barcode-scanner.test.ts#ne demande au détecteur natif que les formats qu'il supporte réellement"
        status: pass
      - kind: unit
        ref: "app/src/modules/fidelite/hooks/use-barcode-scanner.test.ts#un constructeur qui lève poursuit en repli, jamais en error"
        status: pass
      - kind: unit
        ref: "app/src/modules/fidelite/hooks/use-barcode-scanner.test.ts#un tableau de formats supportés vide bascule en repli, sans construire de détecteur"
        status: pass
      - kind: unit
        ref: "app/src/modules/fidelite/hooks/use-barcode-scanner.test.ts#un refus de caméra reste denied — le repli ne masque pas une autorisation refusée"
        status: pass
    human_judgment: false
  - id: D3
    description: "Fermer le scanner (stop() ou démontage) pendant que getUserMedia est en vol coupe le flux qui arrive ensuite : track.stop() sur chaque piste, aucun play() ni detect(), et une frame detect() résolue après stop() n'appelle jamais onDetected"
    requirement: "WR-15"
    verification:
      - kind: unit
        ref: "app/src/modules/fidelite/hooks/use-barcode-scanner.test.ts#arrête le flux résolu APRÈS un stop pendant l'ouverture, sans play ni detect"
        status: pass
      - kind: unit
        ref: "app/src/modules/fidelite/hooks/use-barcode-scanner.test.ts#le démontage pendant l'ouverture coupe le flux qui arrive ensuite"
        status: pass
      - kind: unit
        ref: "app/src/modules/fidelite/hooks/use-barcode-scanner.test.ts#un detect() qui résout après stop() n'appelle jamais onDetected"
        status: pass
    human_judgment: true
    rationale: "jsdom n'implémente ni getUserMedia ni BarcodeDetector : le test prouve le contrat côté application (track.stop() appelé sur le flux tardif, aucune frame relancée), pas la libération réelle de la caméra par le navigateur. La confirmation visuelle (voyant caméra qui s'éteint à la fermeture) reste nécessaire."

metrics:
  duration: 17min
  completed: 2026-10-15
status: complete
---

# Phase 19 Plan 05: Fidélité — scan (WR-15) Summary

**Le scanner de fidélité lit désormais le nom du format renvoyé par le repli (fini les QR enregistrés en code-barres), choisit son moteur d'après les formats réellement supportés (fini le `error` là où le repli était promis), et coupe la caméra même si on ferme pendant l'ouverture.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-10-15T18:17:16Z
- **Completed:** 2026-10-15T18:34:01Z
- **Tasks:** 3
- **Files modified:** 2 (1 créé, 1 modifié)

## Accomplishments

- **WR-15a** — le succès du repli `html5-qrcode` passe `decodedResult.result.format.formatName` ('QR_CODE', 'CODE_128'…) à `toScanFormat`, au lieu de l'entier d'énumération que le helper ne reconnaissait pas. Un QR scanné au repli est enregistré comme QR (`qr`), plus comme code-barres.
- **WR-15b** — le `BarcodeDetector` natif n'est construit qu'avec les formats rendus par `getSupportedFormats` (API statique absente → tous les formats demandés). Une intersection vide, ou un constructeur qui lève, poursuit en repli `html5-qrcode` au lieu de conclure `status: 'error'`.
- **WR-15c** — une génération d'ouverture (`useRef<number>`) est capturée par `start` et incrémentée par `stop`. Après chaque `await`, un flux à génération périmée est arrêté immédiatement ; la boucle `detect` vérifie la génération avant et après `detect()`.
- **Premier test du module fidélité** (17 tests) : repli (nom connu/inconnu/absent), chemin natif, rognage de la valeur, `getSupportedFormats` (partiel/absent/vide), constructeur qui lève, refus de caméra, flux résolu après `stop`, démontage pendant l'ouverture, `stop()` idempotent, `detect()` résolu après `stop`.

## Task Commits

Each task was committed atomically (`commit_docs: false` — `.planning/` non commité) :

1. **Task 1 : le repli lit le nom du format, pas son entier (WR-15a)** — `25d4c52` (fix)
2. **Task 2 : un format natif non supporté bascule en repli, pas en erreur (WR-15b)** — `2a10c87` (fix)
3. **Task 3 : fermer pendant l'ouverture coupe quand même la caméra (WR-15c)** — `0335f8e` (fix)

_Chaque tâche est en réalité TDD (RED→GREEN) : les tests ont été écrits et exécutés **avant** le correctif, la sortie rouge est consignée ci-dessous. Le test et le correctif sont dans le même commit par tâche (une tâche = un commit atomique, conformément au commit_policy de la phase)._

## Files Created/Modified

- `app/src/modules/fidelite/hooks/use-barcode-scanner.ts` — `toScanFormat` exporté + entier d'énumération en second recours ; `supportedNativeFormats` ; construction du détecteur sous `try` local ; génération d'ouverture ; `stop()` idempotent ; `stopStream` helper.
- `app/src/modules/fidelite/hooks/use-barcode-scanner.test.ts` (créé) — 17 tests, doublures de `BarcodeDetector` et `getUserMedia`, doublure `html5-qrcode` via `vi.mock` + `vi.hoisted`.

## Preuves rouges (RED → GREEN)

| Tâche | Assertion | Sortie ROUGE (code d'avant) | Sortie VERTE (après) |
|---|---|---|---|
| 1 | « un QR du repli donne `qr_code` » | `AssertionError: expected { value: '628411903312', format: 'other' } to deeply equal { … format: 'qr_code' }` | `14 passed` |
| 2 | « constructeur qui lève ⇒ repli » / « détecteur construit avec le sous-ensemble » / « intersection vide ⇒ repli » | 3 échecs : `expected [ { formats: [ 'qr_code', …(2) ] } ] to deeply equal [ { formats: [ 'qr_code' ] } ]` ; `expected undefined to be defined` ; `expected 1 to be +0` | `19 passed` |
| 3 | « flux arrivé après `stop()` est arrêté » / « `detect()` après `stop()` n'appelle pas `onDetected` » | 3 échecs : `expected "vi.fn()" to be called 1 times, but got 0 times` (×2) ; `expected "vi.fn()" to not be called at all, but actually been called 1 times` | `24 passed` |

L'état a été restauré après chaque preuve : la table ci-dessus compare le fichier de test (écrit avant le correctif) exécuté d'abord contre le hook non corrigé, puis le hook corrigé.

## Verification

| Contrôle | Résultat |
|---|---|
| `cd app && npm run typecheck` | ✅ vert |
| `cd app && npm test` | ✅ **130 fichiers / 1070 tests** (baseline 129/1053 + le nouveau fichier de 17 tests) |
| `cd app && npm run build` | ✅ vert (built in 27ms, SW PWA généré) |
| `cd app && npm test -- src/modules/fidelite` | ✅ 24 passed (dont les 17 du nouveau fichier) |
| `grep -n "format?\.format\b" app/src/modules/fidelite/hooks/use-barcode-scanner.ts` | ✅ aucune occurrence (plus de lecture d'entier sur le chemin nominal) |
| `python3 scripts/check-sql-statique.py` | ✅ `180 fonction(s) effective(s) … aucun défaut` |

**SQL non concerné.** Ce plan n'ajoute aucune migration : `sh scripts/migrate.sh` et `sh scripts/test-db.sh` n'ont **aucun levier** ici et ne valident rien de ce plan — le dire plutôt que de le sous-entendre (AGENTS.md §2.7). Docker est disponible mais il n'y a rien à y exécuter pour ce changement TypeScript.

**`npm run test:e2e` non exécuté** : le plan ne le demande pas, et les 4 échecs préexistants connus appartiennent à 19-06. Ne pas les toucher ici.

## Ce que ces tests prouvent — et ce qu'ils ne prouvent pas

`BarcodeDetector` et `navigator.mediaDevices.getUserMedia` sont des API navigateur que **jsdom n'implémente pas**. Les doublures de ce fichier ne simulent donc pas une caméra : elles rendent **observables les décisions du hook** — quel moteur est choisi, quel flux reçoit `track.stop()`, quel format est normalisé, quelle frame est relancée.

Ce qui est prouvé : `track.stop()` est appelé sur chaque piste du flux résolu trop tard ; `play()` et `detect()` ne partent pas après une fermeture ; `onDetected` n'est jamais rappelé par une frame en vol ; le détecteur natif est construit avec les formats supportés.

Ce qui n'est **pas** prouvé : que le voyant caméra s'éteint réellement dans un vrai navigateur. C'est pourquoi D3 porte `human_judgment: true`.

## Decisions Made

- **WR-15a — nom stable, entier en recours.** `toScanFormat` lit le nom en premier ; l'entier d'énumération reste accepté pour qu'un futur site d'appel ne rouvre pas le défaut. La correspondance vit dans ce seul helper, exporté pour être testé.
- **WR-15b — moteur unique, choix conditionnel.** Le détecteur natif est construit avec `getSupportedFormats ∩ {qr_code, code_128, ean_13}` ; `try` local → repli. Le `catch` externe garde `'denied'` (NotAllowed/Security) et `'error'` (conteneur sans identifiant).
- **WR-15c — génération, pas booléen.** `stop()` incrémente `generationRef` ; `start` compare après chaque `await`. Le flux tardif est arrêté, l'état n'est pas posé, la boucle ne redémarre pas.
- **Export de `toScanFormat`.** La branche « entier » n'est atteignable que par un appel direct : sans export, un test passant par le hook n'aurait rien vérifié (AGENTS.md §2.7.D — un test qui ne peut pas échouer n'est pas un test).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Les valeurs d'énumération fournies par le PLAN étaient fausses**
- **Found during:** Task 1
- **Issue:** Le plan demandait d'accepter `CODE_128 = 1` et `EAN_13 = 3` comme entiers de repli. Dans `html5-qrcode`, `1` est `AZTEC` et `3` est `CODE_39` : les valeurs du plan auraient donc mappé CODE_128→AZTEC et EAN_13→CODE_39, réintroduisant exactement le défaut WR-15a sous une autre forme.
- **Fix:** Valeurs réelles vérifiées dans `node_modules/html5-qrcode/core.d.ts` : `QR_CODE = 0`, `CODE_128 = 5`, `EAN_13 = 9`. Un test dédié (`toScanFormat … avec les vraies valeurs`) verrouille ces trois entiers **et** vérifie que `1`, `3`, `6` restent `'other'` (jamais devinés).
- **Files modified:** `app/src/modules/fidelite/hooks/use-barcode-scanner.ts`, `...test.ts`
- **Verification:** `npm test -- src/modules/fidelite` vert ; la mutation inverse (utiliser 1/3) ferait échouer le test.
- **Committed in:** `25d4c52`

### Adjustments (documented, not auto-fixed)

**2. [Tension du plan] « code_128 reste lisible via le repli » — non satisfait au sens littéral**
- **Found during:** Task 2
- **Constat:** Le `<must_haves>`/`<behavior>` du plan énonce à la fois « le détecteur est construit **avec `['qr_code']` seulement** » **et** « le format `code_128` reste lisible **via le repli** ». Ces deux phrases ne peuvent coexister qu'avec **deux moteurs simultanés** (natif pour `qr_code`, repli pour le reste) — un changement d'architecture que le `<action>` ne prescrit pas (`« ne construire le détecteur que si l'intersection est non vide »` → moteur unique).
- **Choix:** suivre le `<action>` à la lettre : moteur natif avec l'intersection ; repli seulement quand l'intersection est vide ou que la construction échoue. Le test assère (a) le détecteur construit avec `['qr_code']` seul et (b) que le **repli**, quand il tourne, demande bien les trois formats (`formatsToSupport = [0, 5, 9]`, CODE_128 compris).
- **Limite résiduelle assumée:** sur un navigateur dont `BarcodeDetector` ne supporte qu'un sous-ensemble, les formats demandés-mais-non-supportés ne sont **pas** lus par le moteur natif. À traiter par une décision produit si le cas se présente (consigné dans le registre `.planning/WINDOWS.md`).
- **Impact:** le `error` d'origine est bien supprimé (la promesse « jamais `'error'` » est tenue) ; seule la couverture exhaustive des formats par dual-moteur n'est pas implémentée.

**3. [Message de commit] Réécriture du message de la tâche 1**
- **Found during:** Task 1
- **Issue:** Le premier message de commit contenait des backticks, interprétés par le shell : les identifiants entre backticks ont disparu et deux `command not found` ont filtré. Le message commité était factuellement cassé.
- **Fix:** `git commit --amend -F <fichier>` (contenu inchangé, **message seul**), avant tout partage — conforme à AGENTS.md §2.7.G (« le message est vérifié avant le push »). Le hash de tâche est `25d4c52` (pas de hash antérieur partagé).
- **Impact:** aucun ; aucun autre commit touché, rien n'avait été poussé.

---

**Total deviations:** 1 auto-fix (Rule 1) + 2 ajustements documentés (tension du plan, message de commit).
**Impact on plan:** Les trois volets WR-15 sont couverts par des tests qui échouent si l'on revient en arrière. Aucun élargissement de périmètre ; `ScanFormat`, `types.ts` et le format des cartes restent inchangés.

## Issues Encountered

- **jsdom ne connaît ni `BarcodeDetector` ni `getUserMedia`.** Résolu par des doublures observables (spies sur `track.stop`, `detect`, `play`), en **disant ce qu'elles ne prouvent pas** (voir la section dédiée).
- **Deux `Not implemented: HTMLMediaElement's pause()`** apparaissent à l'exécution de `fidelite-page.test.tsx` (test **préexistant**, hors de ce plan) — pas de mon fichier, dont les `<video>` stubent `pause`. Hors périmètre, non touché.

## Known Stubs

Aucun. Le hook est entièrement câblé (moteur natif, repli `html5-qrcode`, états `idle/starting/scanning/denied/unsupported/error`), et les appels `card-form-dialog`/`card-code-dialog`/`fidelite-page`/`scan-dialog` restent inchangés.

## Next Phase Readiness

- WR-15 fermé, avec preuve rouge→vert par volet.
- 19-06 (e2e périmés) reste indépendant : ce plan ne touche ni `critical-paths` ni `voyage-workspace`.
- La `fidelite-page.tsx` mappe `result.format === 'qr_code' ? 'qr' : 'barcode'` : le pré-remplissage du type de carte profite directement du WR-15a corrigé.

## Self-Check: PASSED

- Fichiers créés/modifiés présents : `use-barcode-scanner.ts`, `use-barcode-scanner.test.ts` ✅
- Commits présents : `25d4c52`, `2a10c87`, `0335f8e` (mesurés : `git rev-list --count 05366de..HEAD = 3`) ✅
- typecheck / test / build / check-sql-statique verts ✅

---
*Phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr*
*Completed: 2026-10-15*
