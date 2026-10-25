---
phase: 20-hygiene-du-depot-les-14-constats-in-de-la-revue
plan: 04
subsystem: ui-affordances-et-etats
tags: [D-06, D-09, D-14, folder-tabs, notes, adresses, promesses-rejetees, etats-vides, reset-dialogue]
status: complete

requires:
  - "app/src/components/shared/folder-tabs.tsx (FolderCreateDialog.submit — la chaîne .then().catch().finally() de référence)"
  - "app/src/modules/notes/hooks/use-notes.ts (hasActiveFilters, déjà exporté)"
  - "app/src/components/ui/empty-state.tsx (EmptyState)"
  - "app/src/components/ui/confirm-dialog.tsx"
provides:
  - "folder-tabs : submitRename et onConfirm portent un catch documenté, l'édition ne se referme pas sur échec"
  - "notes-page : trois états vides distincts (aucune note / dossier vide / recherche sans résultat)"
  - "place-form-dialog : remise à zéro sur open ET la cible, champ fichier compris"
affects:
  - "app/src/modules/notes/notes-page.tsx"
  - "app/src/modules/adresses/components/place-form-dialog.tsx"

tech-stack:
  added: []
  patterns:
    - "promesse rejetée traitée là où elle naît, catch documenté nommant l'appelant qui a déjà parlé"
    - "état vide qui lit la cause réelle (hasActiveFilters) au lieu de la présumer"
    - "effet de resynchronisation sur [open, cible?.id] sans l'objet cible en dépendance"

key-files:
  created: []
  modified:
    - "app/src/components/shared/folder-tabs.tsx"
    - "app/src/components/shared/folder-tabs.test.tsx"
    - "app/src/modules/notes/notes-page.tsx"
    - "app/src/modules/notes/notes-page.test.tsx"
    - "app/src/modules/adresses/components/place-form-dialog.tsx"
    - "app/src/modules/adresses/components/place-form-dialog.test.tsx"

decisions:
  - "D-06 : un rejet de promesse se traite là où il naît — catch intercalé AVANT le finally, documenté (l'appelant a déjà annoncé l'erreur)"
  - "D-09 : un état vide dit la vérité de ce qui est vide — bifurcation sur hasActiveFilters, état « dossier vide » distinct"
  - "D-14 : un dialogue qui se rouvre repart de la cible — effet sur [open, place?.id], place non-dépendance assumée"

metrics:
  duration: "~26 min"
  completed: 2026-10-16
  tasks: 3
  files: 6
  tests_added: 6

actuals:
  tokens: 5851
  tasks: 3
  commits: 3

commits: 3
plan_head_before: f38431cf89805532a82a68c3e2453df040abf64d
plan_head_after: 520feaa55c2aaabacc9beb1af5125336270b6bf8
---

# Phase 20 Plan 04: trois constats d'affordance et d'état Summary

Trois correctifs prouvés rouge→vert : les rejets de `folder-tabs` sont traités là où ils naissent (D-06), `notes-page` distingue trois états vides dont un « dossier vide » qui dit sa vérité (D-09), et `PlaceFormDialog` repart de sa cible à chaque ouverture, fichier abandonné compris (D-14).

## Tasks

| # | Nom | Commit | Fichiers |
|---|-----|--------|----------|
| 1 | un rejet de promesse se traite là où il naît (D-06) | `51630ce` | folder-tabs.tsx, folder-tabs.test.tsx |
| 2 | un dossier vide dit sa vérité, la recherche garde la sienne (D-09) | `7bf1065` | notes-page.tsx, notes-page.test.tsx |
| 3 | un dialogue qui se rouvre repart de sa cible (D-14) | `520feaa` | place-form-dialog.tsx, place-form-dialog.test.tsx |

## Task 1 — folder-tabs (D-06)

`submitRename` (`:226`) et le `onConfirm` de la suppression laissaient une promesse rejetée sans gestionnaire : `.then().finally()` fait traverser le rejet au `finally` et le laisse orphelin. Un `.catch()` est intercalé **avant** le `.finally`, comme la chaîne de référence `FolderCreateDialog.submit`.

### Texte exact des commentaires ajoutés (`folder-tabs.tsx`)

**`submitRename`** (`:229-237`) :

> ```
>       // L'appelant a déjà annoncé l'échec : `notes-page.tsx` — comme
>       // `taches-page` et `routines` — affiche le message en toast PUIS relance
>       // l'erreur. Afficher ici un second message le doublerait, et un `catch`
>       // muet sans cette phrase serait un avaleur : ce gestionnaire constate que
>       // l'erreur a été dite, il ne la fait pas disparaître en silence. L'édition
>       // reste ouverte (`setEditingId(null)` n'est que dans le `then`) pour qu'un
>       // échec ne se fasse pas passer pour un renommage abouti.
>       .catch(() => undefined)
> ```

**`onConfirm`** (`:314-322`) :

> ```
>             // Même division du travail que `submitRename` : l'appelant a déjà
>             // affiché l'erreur en toast puis relancé (`notes-page.tsx`,
>             // `taches-page`, `routines`). Ce `catch` constate que l'erreur a été
>             // dite, il ne l'avale pas ; la fermeture du dialogue de gestion
>             // (`onOpenChange(false)`) reste dans le `then` — un échec ne doit pas
>             // laisser croire que le dossier a été supprimé.
>             .catch(() => undefined);
> ```

`setEditingId(null)` reste dans le `then` (édition ouverte sur échec) ; `onOpenChange(false)` de la suppression reste dans le `then` (T-20-12).

### Preuves rouge → verte

Test : `folder-tabs.test.tsx` — nouveau `describe` écoutant `unhandledRejection`, +2 cas.

- **ROUGE** (les deux `.catch` retirés) : `2 failed | 5 passed (7)`
  - `renommage refusé : aucun rejet non traité, l'édition reste ouverte` → `AssertionError: expected [ Error: Renommage refusé. ] to have a length of +0 but got 1`
  - `suppression refusée : aucun rejet non traité, le dialogue de gestion reste ouvert` → `AssertionError: expected [ Error: Suppression refusée. ] to have a length of +0 but got 1`
- **VERT** (restauré) : `7 passed (7)`

## Task 2 — notes-page (D-09)

`notes-page.tsx` lit `hasActiveFilters` (déjà exporté par `useNotes`, simplement non lu) et la branche `visibleNotes.length === 0` bifurque dessus.

### Titres retenus pour les deux états vides

| Branche | Icône | Titre | Action |
|---------|-------|-------|--------|
| `hasActiveFilters` vrai (inchangé) | `search` | « Aucune note ne correspond à votre recherche. » | « Réinitialiser les filtres » |
| `hasActiveFilters` faux, onglet Général | `archive` | « Aucune note dans Général » | « Créer une note » si `canWrite` |
| `hasActiveFilters` faux, dossier | `archive` | « Ce dossier est vide » | « Créer une note » si `canWrite` |

L'état « aucune note du tout » (`notes.length === 0`) est inchangé et reste distinct. La cascade `isError → isLoading → notes.length === 0 → visibleNotes.length === 0` garde son ordre ; `useNotes()` non modifié.

### Preuves rouge → verte

Test : `notes-page.test.tsx` — +2 cas (dossier vide créé puis ouvert ; Général vide après rangement des notes), `localStorage` nettoyé dans un `finally`.

- **ROUGE** (bifurcation inversée, `!hasActiveFilters`) : `3 failed | 3 passed (6)`
  - `un dossier vide dit sa vérité et propose de le remplir (D-09)` → `TestingLibraryElementError: Unable to find role="heading" and name "Ce dossier est vide"`
  - `Général vide alors que des notes sont rangées ailleurs dit son propre titre (D-09)` → `Unable to find role="heading" and name "Aucune note dans Général"`
  - (le test de recherche préexistant rougit aussi : `Unable to find an element with the text: Aucune note ne correspond à votre recherche.`)
- **VERT** (restauré) : `6 passed (6)`

Distinction prouvée dans le même test : sur un dossier vide avec recherche active, l'état de recherche est rendu **et** l'état « dossier vide » ne l'est pas (deux `heading` qui ne peuvent pas coexister).

## Task 3 — place-form-dialog (D-14)

### Dépendances finales de l'effet

```ts
  useEffect(() => {
    if (!open) return;
    reset(defaultsFor(place));
    setPhotoPreview(place?.photoUrl ?? null);
    setPickedFile(null);
    if (fileRef.current) fileRef.current.value = '';
  }, [open, place?.id]);
```

`place` n'est **pas** une dépendance : la page reconstruit cet objet à chaque rendu (`adresses-page.tsx`), l'inclure rejouerait la remise à zéro pendant la saisie. Le commentaire de l'effet nomme cette raison (aucune directive de linter — §2.7). `defaultsFor(target)` est partagé entre `useForm` et l'effet ; `photoUrl` reste la valeur **stockée** (`photoStored`). Aucun `key` ajouté côté page (`adresses-page.tsx` inchangé).

### Preuves rouge → verte

Test : `place-form-dialog.test.tsx` — harnais de réouverture (fermeture par « Annuler », réouverture par un bouton hors dialogue), +2 cas. `URL.createObjectURL` stubé (jsdom ne l'implémente pas) puis `unstubAllGlobals`.

- **ROUGE** (corps de l'effet vidé) : `2 failed | 3 passed (5)`
  - `aucun aperçu ni fichier abandonné ne survit à la réouverture de la même cible` → `AssertionError: expected <img …(3)></img> to be null`
  - `la cible fait foi : rouvrir le lieu existant rend l’aperçu de sa photo` → `TestingLibraryElementError: Unable to find an element with the alt text: Aperçu de la photo du lieu`
- **VERT** (restauré) : `5 passed (5)` ; les trois cas WR-05 existants restent verts.

## Verification

| Contrôle | Résultat |
|----------|----------|
| `cd app && npm run typecheck` | vert (après chaque tâche) |
| `cd app && npm test` | **140 fichiers / 1183 tests verts** (1177 au départ : +2 par tâche) |
| `cd app && npm run build` | vert (`✓ built`, PWA `dist/sw.js`) |
| trois fichiers seuls (`folder-tabs` + `notes-page` + `place-form-dialog`) | **18 passed (18)** |
| `python3 scripts/check-sql-statique.py` | vert — « 181 fonction(s) effective(s) … aucun défaut » (aucun SQL touché) |
| appelants de `FolderTabs` (notes/taches/routines) | couverts par `npm test` — aucun échec de non-régression |

## Deviations from Plan

None — plan exécuté tel qu'écrit.

Un seul ajustement interne (pas une déviation) : le harnais de test de `place-form-dialog` referme par le bouton « Annuler » du dialogue plutôt que par un bouton de harnais « Fermer ». Motif : tant que le dialogue modal est ouvert, Radix rend le reste du document `aria-hidden` et sans pointer-events, donc les boutons du harnais sont inaccessibles — le geste réel du dialogue est la fermeture correcte. La preuve rouge a été reprise après cet ajustement pour rester honnête (les deux cas rougissent bien).

## Auth Gates

Aucune.

## Known Stubs

Aucun.

## Threat Flags

Aucun — les surfaces introduites (deux `catch` documentés, une branche d'état vide, un effet de remise à zéro) couvrent T-20-11, T-20-12 et T-20-13 du registre du plan ; aucune surface hors registre.

## Self-Check: PASSED

- `app/src/components/shared/folder-tabs.tsx` : FOUND (`catch` aux deux sites)
- `app/src/components/shared/folder-tabs.test.tsx` : FOUND (+describe de rejets)
- `app/src/modules/notes/notes-page.tsx` : FOUND (`hasActiveFilters` lu, bifurcation)
- `app/src/modules/notes/notes-page.test.tsx` : FOUND (+2 cas)
- `app/src/modules/adresses/components/place-form-dialog.tsx` : FOUND (effet + `defaultsFor`)
- `app/src/modules/adresses/components/place-form-dialog.test.tsx` : FOUND (+2 cas)
- commits `51630ce`, `7bf1065`, `520feaa` : FOUND (3, mesurés `f38431c..520feaa`)
