---
phase: 20-hygiene-du-depot-les-14-constats-in-de-la-revue
verified: 2026-10-16T09:47:48Z
status: passed
score: 15/15 must-haves verified
covered_files:
  - .gitignore
  - .planning/phases/20-hygiene-du-depot-les-14-constats-in-de-la-revue/20-01-PLAN.md
  - .planning/phases/20-hygiene-du-depot-les-14-constats-in-de-la-revue/20-01-SUMMARY.md
  - .planning/phases/20-hygiene-du-depot-les-14-constats-in-de-la-revue/20-02-PLAN.md
  - .planning/phases/20-hygiene-du-depot-les-14-constats-in-de-la-revue/20-02-SUMMARY.md
  - .planning/phases/20-hygiene-du-depot-les-14-constats-in-de-la-revue/20-03-PLAN.md
  - .planning/phases/20-hygiene-du-depot-les-14-constats-in-de-la-revue/20-03-SUMMARY.md
  - .planning/phases/20-hygiene-du-depot-les-14-constats-in-de-la-revue/20-04-PLAN.md
  - .planning/phases/20-hygiene-du-depot-les-14-constats-in-de-la-revue/20-04-SUMMARY.md
  - .planning/phases/20-hygiene-du-depot-les-14-constats-in-de-la-revue/20-05-PLAN.md
  - .planning/phases/20-hygiene-du-depot-les-14-constats-in-de-la-revue/20-05-SUMMARY.md
  - .planning/phases/20-hygiene-du-depot-les-14-constats-in-de-la-revue/20-06-PLAN.md
  - .planning/phases/20-hygiene-du-depot-les-14-constats-in-de-la-revue/20-06-SUMMARY.md
  - .planning/phases/20-hygiene-du-depot-les-14-constats-in-de-la-revue/20-07-PLAN.md
  - .planning/phases/20-hygiene-du-depot-les-14-constats-in-de-la-revue/20-07-SUMMARY.md
  - AGENTS.md
  - app/src/app/app-shell.test.tsx
  - app/src/app/app-shell.tsx
  - app/src/components/shared/barcode.test.tsx
  - app/src/components/shared/barcode.tsx
  - app/src/components/shared/folder-tabs.test.tsx
  - app/src/components/shared/folder-tabs.tsx
  - app/src/components/shared/mobile-drawer.tsx
  - app/src/components/ui/field.test.tsx
  - app/src/components/ui/field.tsx
  - app/src/hooks/use-auth-local.test.ts
  - app/src/hooks/use-auth.test.ts
  - app/src/hooks/use-auth.ts
  - app/src/lib/data/useResource.test.ts
  - app/src/lib/data/useResource.ts
  - app/src/lib/no-eslint-directive.test.ts
  - app/src/modules/adresses/components/place-form-dialog.test.tsx
  - app/src/modules/adresses/components/place-form-dialog.tsx
  - app/src/modules/anniversaires/anniversaires-page.test.tsx
  - app/src/modules/anniversaires/anniversaires-page.tsx
  - app/src/modules/anniversaires/components/birthday-form-dialog.tsx
  - app/src/modules/ardoise/components/expense-form-dialog.tsx
  - app/src/modules/calendrier/components/event-form-dialog.tsx
  - app/src/modules/contacts/components/contact-form-dialog.tsx
  - app/src/modules/courses/components/product-catalog.tsx
  - app/src/modules/courses/components/product-sheet.tsx
  - app/src/modules/landing/join-household-page.test.tsx
  - app/src/modules/landing/join-household-page.tsx
  - app/src/modules/notes/components/note-form-dialog.tsx
  - app/src/modules/notes/notes-page.test.tsx
  - app/src/modules/notes/notes-page.tsx
  - app/src/modules/parametres/lib/push.test.ts
  - app/src/modules/parametres/lib/push.ts
  - app/src/modules/recettes/components/recipe-form-dialog.tsx
  - app/src/modules/recettes/hooks/use-cuisine-progress.ts
  - app/src/modules/routines/components/routine-form-dialog.tsx
  - app/src/modules/taches/components/task-form-dialog.tsx
  - app/src/modules/taches/taches-page.tsx
  - app/src/sw.test.ts
  - app/src/sw.ts
  - app/src/types/database.ts
covered_digest: "v2:sha256:80d507d102c751bf476b248f9cdc32819630584359de272c6a1bb181b8826b55"
behavior_unverified: 0
overrides_applied: 0
gaps: []
deferred: []
advisory: []
behavior_unverified_items: []
coincidental_reliance_items: []
---

# Phase 20: Hygiène du dépôt — les constats IN de la revue — Verification Report

**Phase Goal:** Fermer les 14 constats `INFO` de la revue 18 (`IN-01`…`IN-14`) plus le constat neuf `IN-15` : aucun linter n'est configuré mais 14 `eslint-disable` inertes prétendent le contraire (IN-01) ; ce qui n'est pas du produit sort du champ de `git add -A` (IN-02) ; un type n'est déclaré qu'une fois (IN-03) ; un abonnement push rotaté est renouvelé **et** signalé (IN-04) ; le caractère requis d'un champ se dit au contrôle et plus seulement à l'œil (IN-05) ; un rejet de promesse est traité là où il naît (IN-06) ; la branche « pas de session » vide vraiment la session et le foyer persistés (IN-07) ; la clé de cache contient tout ce qui change le résultat (IN-08) ; un état vide dit la vérité de ce qui est vide (IN-09) ; la sonde de configuration est celle de toute l'application (IN-10) ; une règle énoncée deux fois n'est énoncée qu'une fois (IN-11) ; un composant qui échoue peut se rétablir (IN-12) ; on n'édite pas un anniversaire d'origine contact sous un id synthétique (IN-13) ; un dialogue qui se rouvre repart de sa cible (IN-14) ; un commentaire illisible est corrigé et la classe est balayée (IN-15).
**Verified:** 2026-10-16T09:47:48Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth   | Status     | Evidence       |
| --- | ------- | ---------- | -------------- |
| 1 | IN-01 — aucune directive de linter inerte ne subsiste dans `app/src`, et sa réintroduction est refusée par un garde | ✓ VERIFIED | `grep -rn "eslint-disable" app/src` = **0** ; `app/src/lib/no-eslint-directive.test.ts` scanne la racine entière (racine trouvée via `lib/data/useResource.ts`, >0 puis ≥100 fichiers, nomme les contrevenants, aiguille `['eslint','disable'].join('-')`) — **vu ROUGE** (sonde `__guard_probe__.tsx` réinjectée → `expected [ '__guard_probe__.tsx' ] to deeply equal []`) puis **vert** ; `AGENTS.md:119-128` porte la proscription |
| 2 | IN-02 — les familles non suivies sont ignorées *par famille* ; le script de debug reste sur le disque mais hors de `git add -A` | ✓ VERIFIED | `.gitignore` ignore `.claude/worktrees/`, `.gsd/`, `app/shot-toggle-on.mjs` ; `git status --porcelain --untracked-files=all` = **vide** ; `test -f app/shot-toggle-on.mjs` = **present** ; `git check-ignore -v` nomme `.gitignore` |
| 3 | IN-03 — `NoteAttachmentRow` et `PetAttachmentRow` ne sont déclarés qu'une fois | ✓ VERIFIED | `app/src/types/database.ts` diff **supprime** les seconds blocs dupliqués (lignes 249/612 d'origine) ; `grep -c` = **1** pour chacun |
| 4 | IN-04 — un abonnement rotaté est **renouvelé** (worker) et **signalé** (onglets + reçu durable), la page enregistrant le nouvel endpoint | ✓ VERIFIED | `sw.ts:251` `pushsubscriptionchange`, `:114` `writePushRotationReceipt` (reçu `/__push_rotation__`), `:277` `postMessage({type:'EO_PUSH_ROTATED'})`, `SW_VERSION='precache-push-v2'` (:51) ; `sw.test.ts` 4 cas (reçu écrit, recréation avec la clé de l'ancien, échec **écrit**, ping) ; `app-shell.tsx:115-129` traite `EO_PUSH_ROTATED` → `syncRotatedPushSubscription` ; `push.test.ts` |
| 5 | IN-05 — le caractère requis est transmis au contrôle par `aria-required`, l'astérisque visuel restant | ✓ VERIFIED | `field.tsx:10` contexte `required` ; render prop `'aria-required': !optional \|\| undefined` (:55) ; `useFieldControl()` (:79) ; `field.test.tsx` (requis par les deux voies, optionnel sans attribut) |
| 6 | IN-06 — les rejets de promesse de `folder-tabs` sont traités là où ils naissent (l'appelant ayant déjà dit l'erreur) | ✓ VERIFIED | `folder-tabs.tsx` `submitRename` `.catch(() => undefined)` (:237, commenté) et suppression (:321, commenté) ; `notes-page.tsx` `onRename`/`onDelete` affichent le toast **puis relancent** (`throw folderError`, :117/:126) ; `folder-tabs.test.tsx` (aucun rejet non traité, édition/dialogue restant ouverts sur échec) |
| 7 | IN-07 — la branche « pas de session » vide la session **et** le foyer persistés (les deux modes) | ✓ VERIFIED | `use-auth.ts:149` et `:176` appellent `useSessionStore.getState().signOut()` (remplace `setStatus('guest')`) ; `session-store.ts:46-49` `signOut` → `useHouseholdStore.getState().reset()` → `householdId=null` ; `use-auth.test.ts` (branche Supabase, rouge→vert sur `householdId`) + `use-auth-local.test.ts` (branche locale, rouge→vert) |
| 8 | IN-08 — la clé de cache contient tout ce qui change le résultat, et la clé du shell est atteinte par les invalidations | ✓ VERIFIED | `useResource.ts:13` `selectKey` (union discriminée :57-59, l'oubli devient erreur de compilation) ; `app-shell.tsx:63` `selectKey:'tasks-open'` ; clé assignees `[...queryKeys.tableAll('task_assignees'), openTaskIds]` (:76) — le préfixe `['all','task_assignees']` que `use-taches.ts:167` invalide l'atteint ; `useResource.test.ts`, `app-shell.test.tsx` |
| 9 | IN-09 — un état vide dit la vérité de ce qui est vide (trois états distincts) | ✓ VERIFIED | `notes-page.tsx:197-230` : (a) aucune note, (b) aucun résultat **avec** filtres actifs (action « Réinitialiser les filtres »), (c) dossier/Général vide (« Ce dossier est vide » / « Aucune note dans Général ») ; `notes-page.test.tsx` |
| 10 | IN-10 — la jonction lit la **même** sonde de configuration que le reste de l'application | ✓ VERIFIED | `join-household-page.tsx:53` `isSupabaseConfigured` (import :11) remplace `import.meta.env.VITE_SUPABASE_URL` ; `join-household-page.test.tsx` (URL+clé ⇒ Supabase ; URL seule ⇒ local) |
| 11 | IN-11 — une règle énoncée deux fois n'est énoncée qu'une fois | ✓ VERIFIED | `use-auth.ts` : règle énoncée une seule fois dans `applySession` (:56-60), le bootstrap y **renvoie** en la nommant (:129-131) ; diff = consolidation de documentation, aucune ligne répétée |
| 12 | IN-12 — `BarCode` se rétablit après un échec d'encodage sur le même composant monté | ✓ VERIFIED | `barcode.tsx:86-90` `<svg ref>` monté dans **tous** les états (repli rayé en frère conditionnel :81-85, `<svg>` passé en `sr-only` en repli), deps de l'effet toujours `[value]` (:74) ; `barcode.test.tsx` (échec → valeur valide sur le même composant monté) |
| 13 | IN-13 — on n'édite pas un anniversaire d'origine contact ; il mène à sa fiche | ✓ VERIFIED | `anniversaires-page.tsx` : liste `:163-170` et calendrier `:362-368` rendent `<Link to="/contacts">` quand `origin === 'contact'` (au lieu de `openEdit`/`onOpen`) ; route `/contacts` existe (`router.tsx:365`) ; `anniversaires-page.test.tsx` (deux observables rouges) |
| 14 | IN-14 — `PlaceFormDialog` repart de sa cible à chaque ouverture (fichier abandonné compris) | ✓ VERIFIED | `place-form-dialog.tsx:113-121` effet `[open, place?.id]` → `reset(defaultsFor(place))` + `setPhotoPreview` + `setPickedFile(null)` + vidage du champ fichier ; `defaultsFor` partagé avec `useForm` (:61-76, `photoUrl` = valeur **stockée**) ; `place-form-dialog.test.tsx` |
| 15 | IN-15 — un commentaire illisible est corrigé et la classe est balayée | ✓ VERIFIED | `push.ts:152` `distinguishes` → `distingue` ; balayage `app/src`, `supabase/`, `scripts/` : **0** caractère non-latin (CJK/kana/hangul/cyrillique/arabe/hébreu), **0** artefact de double-encodage UTF-8 |

**Score:** 15/15 truths verified (0 present-behavior-unverified)

### Deferred Items

None — aucune phase ultérieure du jalon ne revendique un constat de cette phase. `IN-01`…`IN-15` sont tous fermés ici (le backlog `999.2` est remplacé par cette phase).

### Advisory (New Scope, Unevidenced)

None — vérification initiale ; aucun constat de portée nouvelle non prouvé.

### Required Artifacts

| Artifact | Expected    | Status | Details |
| -------- | ----------- | ------ | ------- |
| `app/src/lib/no-eslint-directive.test.ts` | Garde de classe anti-réintroduction (D-01) | ✓ VERIFIED | Scan récursif réel ; se prouve rouge (sonde) et vert ; refuse un dossier vide (racine introuvable = échec bruyant) |
| `AGENTS.md` §2.7 | Proscription écrite de la directive inerte | ✓ VERIFIED | `:119-128` nomme la proscription et cite le garde |
| `app/src/types/database.ts` | Types média uniques | ✓ VERIFIED | Doublons `NoteAttachmentRow`/`PetAttachmentRow` supprimés |
| `app/src/sw.ts` | Gestionnaire de rotation + reçu durable | ✓ VERIFIED | `pushsubscriptionchange` (:251), `writePushRotationReceipt` (:114), `postMessage` (:277) |
| `app/src/modules/parametres/lib/push.ts` | Relecture du reçu + acquittement + re-registration | ✓ VERIFIED | `readPushRotationReceipt`, `acknowledgePushRotation`, `syncRotatedPushSubscription` (`'none'\|'registered'\|'failed'`) ; mojibake corrigé (:152) |
| `app/src/components/ui/field.tsx` | `aria-required` transmis au contrôle | ✓ VERIFIED | Contexte `required` + render prop + `useFieldControl()` |
| `app/src/components/shared/barcode.tsx` | `<svg ref>` monté dans tous les états | ✓ VERIFIED | Repli en frère conditionnel ; effet toujours `[value]` |
| `app/src/components/shared/folder-tabs.tsx` | Rejets de promesse traités | ✓ VERIFIED | `.catch(() => undefined)` commenté (renommage + suppression) |
| `app/src/hooks/use-auth.ts` | Branche « pas de session » vide session + foyer | ✓ VERIFIED | `signOut()` dans les deux branches ; `setStatus` retiré, deps `[attempt]` |
| `app/src/lib/data/useResource.ts` | `selectKey` dans la clé (union discriminée) | ✓ VERIFIED | 4e élément de `queryKeys.table`, type exigeant |
| `app/src/app/app-shell.tsx` | `selectKey` + clé assignees atteignable + handler `EO_PUSH_ROTATED` | ✓ VERIFIED | :63, :76, :115-129 |
| `app/src/modules/notes/notes-page.tsx` | Trois états vides distincts | ✓ VERIFIED | :197-230 |
| `app/src/modules/anniversaires/anniversaires-page.tsx` | Point contact → `/contacts` | ✓ VERIFIED | Liste + calendrier |
| `app/src/modules/adresses/components/place-form-dialog.tsx` | Effet de remise à zéro (D-14) | ✓ VERIFIED | `defaultsFor` partagé + effet `[open, place?.id]` |
| `app/src/modules/landing/join-household-page.tsx` | Sonde `isSupabaseConfigured` | ✓ VERIFIED | :53 |
| `.gitignore` | Familles ignorées par famille | ✓ VERIFIED | `.claude/worktrees/`, `.gsd/`, `app/shot-toggle-on.mjs` |

### Key Link Verification

| From | To  | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `sw.ts` rotation | reçu `eo-push-log` `/__push_rotation__` | `writePushRotationReceipt` → `cache.put` | ✓ WIRED | `sw.test.ts` observe le reçu **écrit** (double `Request` retenant l'URL ; `cache.put` lit `.url`) — contrôle non vacueux |
| `sw.ts` rotation | onglets ouverts | `postMessage({type:'EO_PUSH_ROTATED'})` | ✓ WIRED | `sw.test.ts` (message asserté) |
| `app-shell.tsx` | `push.ts:syncRotatedPushSubscription` | handler `EO_PUSH_ROTATED` | ✓ WIRED | `app-shell.test.tsx` |
| `push.ts` | fonction Edge `push-subscribe` | `invoke` | ✓ WIRED (unitaire) | `push.test.ts` ; **round-trip serveur non exercé par la chaîne** (cf. Résidus) |
| `app-shell.tsx` clé assignees | invalidations `['all','task_assignees']` | `queryKeys.tableAll('task_assignees')` | ✓ WIRED | Clé `:76` = préfixe invalidé par `use-taches.ts:167` |
| `join-household-page.tsx` | `lib/supabase/client.ts:isSupabaseConfigured` | import | ✓ WIRED | `join-household-page.test.tsx` |
| `anniversaires-page.tsx` | route `/contacts` | `<Link to="/contacts">` | ✓ WIRED | `router.tsx:365` ; `anniversaires-page.test.tsx` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `sw.ts` reçu de rotation | `receipt.endpoint`/`ok`/`error` | `event.newSubscription` (ou `pushManager.subscribe`) → `cache.put` | Yes (endpoint réel de l'événement) | ✓ FLOWING |
| `push.ts` `syncRotatedPushSubscription` | `result` `'none'\|'registered'\|'failed'` | reçu `eo-push-log` → `push-subscribe` → acquittement | Yes (testé unitairement ; round-trip serveur hors chaîne) | ✓ FLOWING (unitaire) |
| `app-shell.tsx` badge assignees | `taskAssigneesQuery` | `listTaskAssignees(openTaskIds)` sous la clé invalidable | Yes | ✓ FLOWING |
| `notes-page.tsx` états vides | `visibleNotes`/`hasActiveFilters`/`activeFolderId` | `useNotes()` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Typecheck | `cd app && npm run typecheck` | `tsc --noEmit` sans sortie, exit 0 | ✓ PASS |
| Tests unitaires | `cd app && npm test` | **143 fichiers / 1202 tests** passés, `Duration 484.83s`, exit 0 | ✓ PASS |
| Build | `cd app && npm run build` | `✓ built`, PWA v1.3.0, `dist/sw.js` généré, exit 0 | ✓ PASS |
| e2e | `cd app && npm run test:e2e` | **121 passed / 5 skipped** (2.0m), exit 0 | ✓ PASS |
| Contrôle SQL statique | `python3 scripts/check-sql-statique.py` | 181 fonctions / 124 migrations / 63 tests, « aucun défaut », exit 0 | ✓ PASS |
| Migrations | `sh scripts/migrate.sh` | « Toutes les migrations sont déjà appliquées. », exit 0 | ✓ PASS |
| Tests SQL (Docker) | `sh scripts/test-db.sh` | **61/61** fichiers verts, exit 0 | ✓ PASS |
| Garde IN-01 vu rouge puis vert | sonde `app/src/__guard_probe__.tsx` réinjectée puis retirée | ROUGE (`expected [ '__guard_probe__.tsx' ] to deeply equal []`) → VERT (3 passed) | ✓ PASS |
| Dépôt inchangé hors `app/`+`AGENTS.md`+`.gitignore` | `git diff 79e0fbd..2ff8085 --stat -- supabase/ scripts/` | **vide** — aucune migration, aucun test SQL, aucun script touché | ✓ PASS |

### Probe Execution

Aucune sonde déclarée par la phase ni sonde conventionnelle (`scripts/*/tests/probe-*.sh`) — non applicable.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| IN-01 | 20-01 | Directives `eslint-disable` inertes | ✓ SATISFIED | 0 occurrence ; garde `no-eslint-directive.test.ts` (vu rouge) ; `AGENTS.md` §2.7 |
| IN-02 | 20-02 | Fichiers non suivis et non ignorés | ✓ SATISFIED | `.gitignore` par famille ; `git status` vide ; script toujours présent |
| IN-03 | 20-02 | Déclarations de types dupliquées | ✓ SATISFIED | `database.ts` doublons supprimés |
| IN-04 | 20-07 | Service worker sans `pushsubscriptionchange` | ✓ SATISFIED | `sw.ts:251` + reçu + `postMessage` ; `sw.test.ts` ; page `app-shell.tsx` |
| IN-05 | 20-03 | `Field` requis seulement visuel | ✓ SATISFIED | `field.tsx` `aria-required` (render prop + `useFieldControl`) ; `field.test.tsx` |
| IN-06 | 20-04 | Rejets de promesse non gérés (`folder-tabs`) | ✓ SATISFIED | `.catch` commentés ; appelants qui relancent ; `folder-tabs.test.tsx` |
| IN-07 | 20-05 | Session/foyer persistés survivant au sign-out | ✓ SATISFIED | `use-auth.ts:149,176` `signOut()` ; `use-auth.test.ts` + `use-auth-local.test.ts` |
| IN-08 | 20-06 | Deux clés de requête hors conventions | ✓ SATISFIED | `selectKey` ; clé assignees sous `['all','task_assignees']` |
| IN-09 | 20-04 | État vide d'un dossier inexistant | ✓ SATISFIED | Trois états vides distincts ; `notes-page.test.tsx` |
| IN-10 | 20-07 | Mauvaise sonde de configuration (jonction) | ✓ SATISFIED | `join-household-page.tsx:53` `isSupabaseConfigured` |
| IN-11 | 20-06 | Commentaire dupliqué mot pour mot | ✓ SATISFIED | Règle unique dans `applySession` ; bootstrap y renvoie (le SUMMARY corrige honnêtement : ce n'était pas mot pour mot) |
| IN-12 | 20-03 | `BarCode` sans rétablissement | ✓ SATISFIED | `<svg ref>` monté dans tous les états ; `barcode.test.tsx` |
| IN-13 | 20-06 | Anniversaire contact éditable sous id synthétique | ✓ SATISFIED | `<Link to="/contacts">` en liste + calendrier ; `anniversaires-page.test.tsx` |
| IN-14 | 20-04 | `PlaceFormDialog` sans réinitialisation | ✓ SATISFIED | Effet `[open, place?.id]` + `defaultsFor` partagé ; `place-form-dialog.test.tsx` |
| IN-15 | 20-02 | Commentaire illisible (mojibake) | ✓ SATISFIED | `push.ts:152` corrigé ; balayage 0/0 sur `app/src`, `supabase/`, `scripts/` |

Aucune exigence orpheline : `IN-01`…`IN-15` sont chacune revendiquée par au moins un plan (20-01…20-07).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (aucun) | — | `TBD`/`FIXME`/`XXX` dans les fichiers modifiés par la phase | — | Aucun marqueur de dette non référencé |
| (aucun) | — | `TODO`/`HACK`/`PLACEHOLDER`/`coming soon`/`not implemented` dans les sources modifiées | — | Aucun texte de complaisance |
| (aucun) | — | `eslint-disable` résiduel | — | 0 occurrence dans `app/src` |

### Defects Introduced

**Aucun.** Les diffs des fichiers à risque (`sw.ts`, `useResource.ts`, `app-shell.tsx`, `use-auth.ts`, `anniversaires-page.tsx`, `barcode.tsx`, `field.tsx`, `place-form-dialog.tsx`, `folder-tabs.tsx`, `notes-page.tsx`, `join-household-page.tsx`, `database.ts`) sont minimaux et ciblés. `household-store.ts` et `session-store.ts` ne sont **pas** modifiés (leur diff est vide sur toute la plage) : le chemin `signOut → reset` préexistait, seul `use-auth.ts` change — la crainte adverse d'un `reset()` nouvellement ajouté est levée. Aucun paquet ajouté, aucun SQL touché.

### Human Verification Required

None. Les quinze vérités sont adossées à un test qui exerce le comportement (et, pour les vérités à transition d'état — IN-04, IN-06, IN-07, IN-12, IN-13, IN-14 — à une preuve rouge→verte réelle). Aucune vérité n'est laissée « présente mais non exercée ».

### Notes / Observations (non bloquantes)

- **ℹ️ `sh scripts/test-dispatch-push.sh` n'a pas tourné — la jambe `base → Edge Function → service Push` reste NON VALIDÉE par la chaîne.** Le script sort en exit 1 parce que `push_subscriptions` est **vide** sur cette instance (0 abonnement réel, 0 synthétique ; `select count(*) … from public.push_subscriptions` = `0|0`). Le script refuse de fabriquer un endpoint factice (qui serait `dropped`, donc une preuve fausse). Conformément à `AGENTS.md` §2.7, ce n'est pas un échec du changement — mais ce n'est **pas** « absent » : la livraison réelle d'un rappel rotaté par le service Push n'est **pas validée** ici et **reste à rejouer depuis un appareil abonné**. Ce que la phase prouve par ailleurs est la **logique** du worker (`sw.test.ts`) et de la page (`push.test.ts`), pas le trajet serveur. Le `20-07-SUMMARY.md` §6 le dit explicitement, y compris « elle reste à rejouer depuis un appareil abonné ».
- **ℹ️ Métadonnée ROADMAP en retard.** `ROADMAP.md:206` laisse `20-07-PLAN.md` en `[ ]` alors que son plan est committé (`052e3be`, `2ff8085`) et vérifié ici. La mise à jour de ROADMAP relève de l'orchestrateur, pas de cette vérification ; ce n'est pas un écart de code.
- **ℹ️ La preuve rouge→verte de `sw.test.ts` double `Request`.** Le SUMMARY (20-07, déviation n°1) le déclare honnêtement : sous jsdom `new Request('/__push_rotation__')` lèverait, le `catch` isolé avalerait, et le test « n'aurait rien regardé ». Le double retient l'URL, `cache.put` lit `.url`, donc le reçu est bien **observé** — et le test serait rouge si le gestionnaire disparaissait (`handlerFor` lève « aucun gestionnaire enregistré »). Le contrôle n'est pas vacueux.

### Gaps Summary

Aucun écart. Les quinze constats `IN-01`…`IN-15` sont implémentés dans le code et couverts par la chaîne verbatim : `typecheck` propre, **1202 tests unitaires (143 fichiers)**, build OK, **121 e2e (5 sauts conditionnels au viewport)**, contrôle SQL statique (181 fonctions, 0 défaut), migrations à jour, **61/61 tests SQL**. Aucun fichier de `supabase/` ni de `scripts/` n'a changé sur la plage : le SQL est intact, comme les plans le déclaraient. Les cinq preuves rouges→vertes revendiquées ont été recoupées dans les diffs de test et les messages d'assertion sont réels ; la seule preuve non rouge→verte (verrou `SIGNED_OUT` de 20-05) est **honnêtement déclarée** comme déjà verte avant le correctif, non déguisée. Le seul point non exercé par la chaîne (livraison Push réelle) est une jambe préexistante et inchangée par la phase, correctement consignée comme « non validé ».

---

_Verified: 2026-10-16T09:47:48Z_
_Verifier: the agent (gsd-verifier)_
