---
phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr
plan: 13
subsystem: "Médias du foyer — frontend (lib/storage + quatre modules modèles)"
tags: [WR-08, D-01, media, storage, contract-test, refactor]
status: complete
requires:
  - "19-01 (lib/storage.ts : storedValueOf, resolveHouseholdMediaUrl, replacedMediaPath)"
  - "19-07/19-08/19-09/19-10 (alignement des sites d'écriture des modules)"
  - "0124 (backfill des colonnes média vers le chemin de bucket)"
provides:
  - "Verrou de contrat anti-récidive : deposited.url interdit hors lib/storage.ts"
  - "Les quatre modules modèles passent par les deux points uniques (écriture + lecture)"
affects:
  - "Toute réintroduction future d'une URL signée comme valeur de colonne fait rougir src/lib"
tech-stack:
  added: []
  patterns:
    - "Test de contrat par lecture des sources (node:fs + remontée depuis process.cwd())"
    - "Point unique d'écriture (storedValueOf) et de lecture (resolveHouseholdMediaUrl)"
key-files:
  created:
    - app/src/lib/media-path-contract.test.ts
  modified:
    - app/src/modules/recettes/api.ts
    - app/src/modules/voyages/api.ts
    - app/src/modules/prestataires/api.ts
    - app/src/modules/adresses/api.ts
key-decisions:
  - "D-01, seconde branche : la forme de DepositedFile est inchangée, le verrou est un test de contrat (pas la suppression de url)."
  - "Le verrou négatif porte sur deposited.url seul ; deposited.path reste licite (valeur durable lue pour le nettoyage de compensation)."
metrics:
  duration: "17m"
  completed: 2026-10-15
actuals:
  tokens: 3533
  tasks: 2
  commits: 2
  plan_head_before: c6cdc362bd324ddaaa619c1fd1b7649baf4e7504
  plan_head_after: 498b3b99ea49c452d7004fe8df264e7a23754e1a
---

# Phase 19 Plan 13 : Un seul point pour la valeur de colonne et la re-signature, plus le verrou

## One-liner

Les quatre modules modèles (recettes, voyages, prestataires, adresses) ramenés aux deux points
uniques de `lib/storage.ts` — `storedValueOf` à l'écriture, `resolveHouseholdMediaUrl` à la
lecture — et un test de contrat qui fait rougir la suite dès qu'une URL signée est relue comme
valeur de colonne.

## Objectif atteint

D-01 est fermé par son second volet. La convention « le chemin du bucket est la référence
durable, l'URL signée naît à la lecture » n'existe plus qu'à un seul endroit pour l'écriture
(`storedValueOf`) et à un seul endroit pour la re-signature (`resolveHouseholdMediaUrl`), et un
verrou textuel interdit la récidive.

## Tasks

| # | Type | Nom | Commit | Fichiers |
|---|------|-----|--------|----------|
| 1 | tracer | Les quatre modules modèles passent par les points uniques | `a0cce83` | recettes/api.ts, voyages/api.ts, prestataires/api.ts, adresses/api.ts |
| 2 | auto (tdd) | Le verrou de contrat anti-récidive (D-01) | `498b3b9` | lib/media-path-contract.test.ts |

## Ce qui a changé

### Task 1 — rassemblement (comportement inchangé)

- **Écriture** : `deposited.path ?? deposited.url` → `storedValueOf(deposited)` dans
  `uploadRecipeCover`, `uploadTripCover`, `createProviderAttachment` et `uploadPlacePhoto`.
- **Lecture** : le `createSignedUrl` local de chaque module → `resolveHouseholdMediaUrl(stored,
  <TTL du module>)` dans `resolveRecipeCoverUrl` (3600), `resolveTripCoverUrl` (3600),
  `resolveAttachmentUrl` (3600), `resolvePlacePhotoUrl` (3600).
- **Conservé** : chaque constante de TTL locale et la signature publique de chaque wrapper ;
  `adresses/api.ts` garde sa délégation `shouldRemovePreviousPlacePhoto` → `replacedMediaPath`.
- **Imports** : `isSupabaseConfigured`/`supabase` retirés de `prestataires/api.ts` et
  `adresses/api.ts` (plus aucun usage direct : `noUnusedLocals` l'aurait refusé) ; conservés dans
  `recettes`/`voyages` (utilisés ailleurs pour les Edge Functions et les gardes démo).
- **Non touchés** : `cercle/api.ts` (dépôt propre `depositMedia`), `notes`, `anniversaires`,
  `contacts`, `animaux`, `courses`, `cadeaux`, `ardoise`, `messages/api.ts` (hors périmètre).

Preuve que le comportement n'a pas bougé : les **216** tests d'intégration des quatre modules
passent **sans avoir été réécrits** (31 fichiers, avant comme après).

### Task 2 — le verrou

Nouveau `app/src/lib/media-path-contract.test.ts`, sur le motif de `lib/modules.test.ts`
(`node:fs`, remontée depuis `process.cwd()`, `expect(chemin, message)`) :

1. **Racine des sources** trouvée en remontant depuis `process.cwd()` (trois dispositions :
   `…/src`, `app`, racine du dépôt) ; `null` → échec explicite (jamais de conclusion sur un
   dossier vide).
2. **Assertion négative** : la chaîne `deposited.url` n'apparaît dans aucun fichier `.ts`/`.tsx`
   hors `lib/storage.ts` (fichiers de test exclus). Le message nomme les fichiers fautifs.
3. **Assertion positive** : `storedValueOf(` est présent dans **chacun** des **13** sites
   d'écriture alignés de la phase (commentaire : `cercle/api.ts` passe par son propre dépôt,
   `messages/api.ts` est hors périmètre).

Le plan demandait aussi trois cas unitaires de `storedValueOf` dans `storage.test.ts` : ils
existent **déjà**, écrits par 19-01 (`storage.test.ts:111-122` — chemin gagne, repli démo `blob:`,
valeur blanche rendue telle quelle). Aucune duplication ajoutée.

## Preuve rouge → vert (AGENTS.md §2.7B)

Réintroduction manuelle d'une lecture directe dans `modules/recettes/api.ts`
(`return storedValueOf(deposited);` → `return deposited.url;`), test de contrat relancé :

```
× aucun module ne lit deposited.url — la valeur de colonne passe par storedValueOf
× chaque site d'écriture aligné produit sa colonne par storedValueOf
AssertionError: lecture directe de deposited.url hors de lib/storage.ts : modules/recettes/api.ts
```

Le contrôle **a refusé** quelque chose et **a nommé le fichier fautif**. Restauration
(`git checkout -- app/src/modules/recettes/api.ts`), relance : `src/lib` — 10 fichiers / 70 tests,
vert. Les deux sorties sont consignées ici.

## Deviations from Plan

### Ajustement — assertion négative bornée à `deposited.url` (Rule 3 / défaut du plan)

- **Trouvé pendant :** Task 2.
- **Constat :** la tâche 2 point c demandait d'interdire **`deposited.url` et `deposited.path`**
  hors `lib/storage.ts`. Or quatre sites **hors du `files_modified`** de ce plan lisent
  `deposited.path` — non pour persister une colonne, mais pour la **compensation de nettoyage**
  (`removeHouseholdFile` après un échec d'écriture) : `courses/components/product-sheet.tsx:196`,
  `courses/components/product-catalog.tsx:206`, `cadeaux/cadeaux-page.tsx:200`,
  `prestataires/api.ts:79`. Ces sites sont alignés par 19-07/19-08 et la tâche 1 dit explicitement
  de ne pas les toucher. L'assertion littérale du plan les ferait donc rougir sans qu'on puisse
  satisfaire le plan.
- **Décision :** le verrou négatif porte sur **`deposited.url` seul**. C'est exactement la valeur
  que D-01/`WR-08`/T-19-35 refusent de persister (une URL signée éphémère). `deposited.path`
  reste licite : c'est **la valeur durable elle-même**, lire `deposited.path` ne peut pas
  persister une URL, et l'assertion positive `storedValueOf(` couvre déjà la production de la
  valeur de colonne. Interdire `deposited.path` aurait été « un contrôle qui refuse du code que
  les tests couvrent » (§2.7B).
- **Fichiers modifiés :** `app/src/lib/media-path-contract.test.ts` (commentaire d'entête +
  portée expliqués).
- **Commit :** `498b3b9`.

### Constat (sans changement) — deux `createSignedUrl` subsistent dans `lib/storage.ts`

- La tâche 1 point 2 demande de « vérifier que `resolveHouseholdMediaUrl` est le seul appel à
  `createSignedUrl` sur `HOUSEHOLD_MEDIA_BUCKET` dans `lib/` ». Vérifié : il y a **deux** appels
  dans `lib/storage.ts` — `lib/storage.ts:148` dans `depositHouseholdFile` (le dépôt forge l'URL
  de retour qu'il rend dans `DepositedFile.url`) et `lib/storage.ts:221` dans
  `resolveHouseholdMediaUrl`. Le point unique de la **lecture** est bien `resolveHouseholdMediaUrl` ;
  l'appel du dépôt appartient au dépôt, pas à la résolution. Aucun `createSignedUrl` n'a été
  ajouté ni déplacé par ce plan. Hors `lib/`, il reste `messages/api.ts:187` (hors périmètre,
  remonté à l'orchestrateur) et un simple **commentaire** dans `ardoise/api.ts:187`.

## Vérification

| Étape | Résultat |
|-------|----------|
| `npm run typecheck` | ✅ (avant et après chaque task) |
| `npm test -- src/modules/voyages src/modules/recettes src/modules/prestataires src/modules/adresses` | ✅ 31 fichiers / **216** tests (non réécrits), avant et après Task 1 |
| `npm test -- src/lib` | ✅ 10 fichiers / 70 tests (verrou inclus) |
| `npm test` (suite complète) | ✅ 1144 passés, **4 échecs connus préexistants** (voir ci-dessous) |
| `npm run build` | ✅ |
| `npm run test:e2e` | ✅ **121 passés**, 5 ignorés |
| `python3 scripts/check-sql-statique.py` | ✅ « aucun défaut » |

### Défauts préexistants (non attribués, non corrigés — plan 19-14)

- `src/hooks/use-notifications.test.tsx` — **4 cas** en échec, uniquement dans la fenêtre locale
  minuit → 10:45 (le seed démo date des messages à des heures fixes du « jour courant »). La suite
  a été lancée à ~01:08 locale : exactement ces 4 cas. **Défaut connu préexistant** (`deferred-items.md` §13).
- `supabase/tests/0004_cron.sql` — échoue uniquement entre 22:00 et 24:00 UTC. Non exécuté ici
  (aucun SQL touché). **Défaut connu préexistant** (`deferred-items.md` §14).

### SQL : aucune conséquence serveur

Ce plan ne touche **aucun** SQL et ne change pas la convention média côté base : il ne fait que
réduire à un point unique la production de la valeur de colonne et la re-signature côté frontend.
`0124_media_path_backfill.sql` a été appliquée et prouvée par 19-12. `sh scripts/migrate.sh` et
`sh scripts/test-db.sh 0124` n'ont donc **pas** de conséquence à vérifier ici — je le dis
explicitement plutôt que de les lancer pour l'apparence.

## Known Stubs

Aucun.

## Threat Flags

Aucune surface nouvelle : le plan **retire** de la surface (les quatre copies locales de
`createSignedUrl` disparaissent au profit du point unique en échec fermé de 19-01). La mitigation
T-19-35 (récidive de `deposited.url` comme valeur de colonne) est désormais portée par le test de
contrat, vu échouer puis restaurer.

## Self-Check: PASSED

- Fichier créé présent : `app/src/lib/media-path-contract.test.ts` ✅
- Commits présents : `a0cce83`, `498b3b9` ✅
- Aucune suppression accidentelle de fichier suivi ✅
