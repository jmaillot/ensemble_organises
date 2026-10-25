---
phase: 18-durcissement-frontend-correctifs-de-revue-de-code
reviewed: 2026-10-15T00:00:00Z
depth: deep
scope: app/src (frontend complet, ~70 000 lignes, 332 fichiers)
files_reviewed: 332
files_reviewed_list:
  - app/src/lib/data/keys.ts
  - app/src/lib/data/supabase-adapter.ts
  - app/src/lib/storage.ts
  - app/src/hooks/use-auth.ts
  - app/src/hooks/use-notifications.ts
  - app/src/app/router.tsx
  - app/src/app/app-shell.tsx
  - app/src/components/ui/route-error.tsx
  - app/src/components/ui/field.tsx
  - app/src/components/shared/folder-tabs.tsx
  - app/src/components/shared/barcode.tsx
  - app/src/sw.ts
  - app/src/types/database.ts
  - app/src/modules/dashboard/hooks/use-dashboard.ts
  - app/src/modules/dashboard/types.ts
  - app/src/modules/dashboard/components/widgets.tsx
  - app/src/modules/taches/components/task-form-dialog.tsx
  - app/src/modules/taches/taches-page.tsx
  - app/src/modules/taches/hooks/use-taches.ts
  - app/src/modules/routines/components/routine-form-dialog.tsx
  - app/src/modules/routines/hooks/use-routines.ts
  - app/src/modules/routines/types.ts
  - app/src/modules/ardoise/components/expense-form-dialog.tsx
  - app/src/modules/ardoise/types.ts
  - app/src/modules/ardoise/api.ts
  - app/src/modules/ardoise/components/settlements-panel.tsx
  - app/src/modules/adresses/hooks/use-adresses.ts
  - app/src/modules/adresses/components/place-form-dialog.tsx
  - app/src/modules/adresses/api.ts
  - app/src/modules/notes/api.ts
  - app/src/modules/anniversaires/components/birthday-form-dialog.tsx
  - app/src/modules/anniversaires/anniversaires-page.tsx
  - app/src/modules/contacts/components/contact-form-dialog.tsx
  - app/src/modules/animaux/api.ts
  - app/src/modules/animaux/hooks/use-animaux.ts
  - app/src/modules/cercle/api.ts
  - app/src/modules/voyages/api.ts
  - app/src/modules/recettes/api.ts
  - app/src/modules/recettes/hooks/use-recettes.ts
  - app/src/modules/fidelite/hooks/use-barcode-scanner.ts
  - app/src/modules/calendrier/calendrier-page.tsx
  - app/src/modules/landing/create-household-page.tsx
  - app/src/modules/landing/join-household-page.tsx
findings:
  critical: 1
  warning: 20
  info: 14
  total: 35
status: issues_found
---

# Phase 18: Code Review Report

**Reviewed:** 2026-10-15 (revue large du frontend `app/src`)
**Depth:** deep (6 passes parallèles par lots + relecture personnelle des critical/high)
**Files Reviewed:** 332
**Status:** issues_found

## Summary

Portes automatiques vertes au moment de la revue (`typecheck`, 929 tests / 115
fichiers, `check-sql-statique.py` 180 fns / 0 défaut, versions épinglées, `npm audit`
0 vulnérabilité). Les défauts ci-dessous échappent à ces portes pour une raison
structurelle : **les tests Vitest tournent en mode démo (Dexie/IndexedDB), qui n'a
ni contraintes `CHECK` ni RLS.** Toute divergence entre le client et le schéma
serveur réel est donc invisible en CI.

Deux familles dominent : (1) des écritures que le serveur refuse et que le client
rapporte comme réussies ; (2) des URLs signées éphémères persistées comme référence
durable.

---

## CRITICAL

### CR-01 — Masquer un widget de l'accueil est impossible en ligne (`width = 0` viole le CHECK)

**Severity:** CRITICAL
**File:** `app/src/modules/dashboard/hooks/use-dashboard.ts:134,147`
**Constraint:** `app/../supabase/migrations/0004_tables_shared.sql:312`

**What.** `setWidgetOrder` persiste la visibilité par
`width: preference.visible ? (kind === 'routines' ? 2 : 1) : 0`, mais la colonne est
`width integer not null default 1 check (width between 1 and 4)`, et aucune migration
ne l'assouplit. La lecture considère `visible = row.width > 0`
(`modules/dashboard/types.ts:64`).

**Scenario.** En mode Supabase, « Personnaliser l'accueil » → masquer « Tâches » :
écrire 0 lève `check_violation` (23514), `data.update` jette `DataError`,
`Promise.all` rejette, et l'appelant jette le rejet via `void`
(`dashboard-page.tsx:90,175,176`) → **aucun message**, le widget disparaît à l'écran
puis revient au rechargement. Chaque glisser-déposer échoue aussi dès qu'un widget
est masqué. Écritures partielles possibles : les `position_x` voisins du même
`Promise.all` peuvent avoir abouti.

**Note.** Le test versionné « masque puis réaffiche un widget »
(`dashboard-page.test.tsx`) passe parce qu'il tourne en démo (Dexie sans CHECK).

---

## WARNING

### WR-01 — Toute suppression refusée par la RLS est rapportée comme un succès

**Severity:** HIGH
**File:** `app/src/lib/data/supabase-adapter.ts:135-148`

**What.** `remove()` et `removeWhere()` font `.delete().eq(…)` **sans `.select()`** :
PostgREST répond 204 que 0 ou N lignes soient parties, donc un refus RLS est
indistinguable d'un succès. La mutation résout, `invalidate()` refait la lecture, la
ligne réapparaît.

**Scenario.** N'importe quelle suppression refusée (membre non admin, ligne d'un autre
foyer, compte `enfant`) : toast de succès, puis la ligne est toujours là. Concerné :
`removeWhere('conversation_members', …)` (`modules/messages/api.ts:136`),
`removeWhere('ardoise_members', …)`, et toutes les suppressions simples.

**Correction attendue.** Assertir les lignes affectées (`.select()` puis contrôle de
longueur) ou une lecture de comptage ; faire échouer explicitement sur 0 ligne quand
l'appelant s'attend à une suppression.

### WR-02 — L'interface propose des suppressions que le serveur réserve aux admins

**Severity:** HIGH
**Files:** `app/src/modules/taches/taches-page.tsx:302,388` ; `app/src/modules/taches/taches-page.tsx:184-192` ; `app/src/modules/routines/hooks/use-routines.ts:282-288`
**Policies:** `0007_rls_policies.sql:237-241` (`routine_completions_delete_admin`) ; `0007_rls_policies.sql:239` puis `0118_trip_workspace.sql:349` (`tasks_delete_admin`) ; `0051_folders_rls.sql:82-87`

**What.** Les affordances sont rendues pour tout `canWrite` (`role !== 'enfant'`),
alors que la RLS réserve la suppression à l'administrateur. `removeOccurrence` n'a même
aucun garde `canWrite`, contrairement à ses sœurs.

**Scenario.** Un `membre` clique la corbeille → « Tâche supprimée. » et la tâche reste
(voir WR-01). En démo, la suppression réussit réellement et efface une trace que le
rôle n'a pas le droit de supprimer.

### WR-03 — `ardoise_members` absente de `KEYLESS_TABLES` : ajouter des membres ne fait rien

**Severity:** HIGH
**Files:** `app/src/lib/data/keys.ts:7` ; `app/src/modules/ardoise/api.ts:167,198`
**Constraint:** `supabase/migrations/0055_ardoises.sql:33-37`

**What.** La table a une clé primaire composite `(ardoise_id, member_id)` et **pas de
colonne `id`**, mais elle n'est pas dans `KEYLESS_TABLES`. `SupabaseAdapter.create`
(`lib/data/supabase-adapter.ts:93`) injecte donc `id: randomId(...)` → PostgREST
`PGRST204` (colonne inconnue, 400). L'appel est sous `.catch(() => undefined)`
(`api.ts:198`, atteint depuis `hooks/use-ardoise.ts:108`) : l'échec est **avalé**.

**Scenario.** En ligne, un admin ouvre une ardoise et ajoute des membres → succès
affiché, aucun membre inscrit. Les 6 autres tables sans clé sont présentes ; seule
celle-ci manque. (`voyages/api.ts:303,313` sont la branche démo — moins grave.)

### WR-04 — Écran de chargement infini : `useAuthBootstrap` sans gestion d'échec

**Severity:** HIGH
**File:** `app/src/hooks/use-auth.ts:115-133`

**What.** `supabase.auth.getSession().then(async …)` n'a **pas de `.catch`**. Si
`applySession` → `loadHousehold()` → `data.list('household_members')` rejette (réseau
instable, 5xx, refus RLS), `setReady(true)` n'est jamais atteint, le rejet est non
géré, et `main.tsx` affiche « Chargement de votre foyer… » indéfiniment — sans erreur,
sans reprise, sans expiration. Le `retry: 1` du QueryClient ne s'applique pas (chaîne
de promesses brute).

**Note.** Le commentaire des lignes 126-131 est dupliqué mot pour mot.

### WR-05 — Éditer un lieu détruit sa photo (perte de fichier)

**Severity:** HIGH
**Files:** `app/src/modules/adresses/hooks/use-adresses.ts:129-141` ; `app/src/modules/adresses/components/place-form-dialog.tsx:60,81`

**What.** `editPlace` lit `previous` = la valeur **stockée** (chemin bucket) et la
compare au `photoUrl` du formulaire, qui est l'**URL signée résolue** (le memo `places`
résout chemin → URL signée, `use-adresses.ts:102`). Elles ne sont jamais égales, donc
`deletePlacePhoto(previous)` **supprime l'objet du bucket**, et la colonne reçoit
l'URL signée (traitée ensuite comme une saisie manuelle, jamais re-signée).

**Scenario.** En ligne, l'utilisateur ouvre « Modifier le lieu », change seulement le
nom, enregistre : le fichier est supprimé définitivement et la photo est morte à
l'expiration (30 j).

### WR-06 — Ardoise : le dernier participant d'un partage personnalisé peut être négatif

**Severity:** HIGH
**Files:** `app/src/modules/ardoise/components/expense-form-dialog.tsx:46-51` ; `app/src/modules/ardoise/types.ts:123-131`

**What.** Le schéma Zod valide chaque part `>= 0` mais **jamais leur somme** face au
montant. `normalizeShares` reporte l'écart total sur le dernier participant.

**Scenario.** Dépense 10 €, A=10, B=10, C=1 (tous ≥ 0, formulaire valide) → `sum = 21`,
dernier = `1 + (10 − 21) = −10`. En démo, écrit en base : `computeBalances` crédite C et
fausse la répartition, silencieusement. En ligne, le RPC rejette
(`0056_ardoise_guests_parts.sql:169`) avec « part de dépense invalide ».

### WR-07 — Rappels décalés de 1 à 2 h à chaque enregistrement (tâches et routines)

**Severity:** HIGH
**Files:** `app/src/modules/taches/components/task-form-dialog.tsx:30` ; `app/src/modules/routines/components/routine-form-dialog.tsx:78` ; `app/src/modules/routines/api.ts:53-57`

**What.** `remindAt.slice(0, 16)` tronque l'instant **UTC** (renvoyé par PostgREST /
`toISOString()`) avant de l'injecter dans un `<input type="datetime-local">`, qui est
en **local**. La relecture reconvertit local→UTC. L'affichage, lui, passe par
`toLocalDate` (`taches/types.ts:90`) : les deux divergent.

**Scenario.** Rappel 18:30 à Paris → le formulaire affiche 16:30, et re-sauvegarder sans
rien toucher stocke 14:30Z : le rappel avance de 2 h à chaque enregistrement. Les
lignes de graine (ISO naïf) masquent le défaut — d'où l'aspect intermittent.

### WR-08 — URLs signées éphémères persistées comme référence durable (5 modules)

**Severity:** HIGH
**Files:** `app/src/lib/storage.ts:20,97` ; écritures : `modules/notes/api.ts:64`, `modules/anniversaires/components/birthday-form-dialog.tsx:78`, `modules/contacts/components/contact-form-dialog.tsx:102`, `modules/animaux/api.ts:71,85`, `modules/cercle/api.ts:74`

**What.** `depositHouseholdFile` renvoie `url` (signée, **30 j**) et `path` (durable).
Recettes, voyages, prestataires, adresses, courses, cadeaux stockent
`deposited.path ?? deposited.url` et **re-signent à la lecture** ; ces cinq modules
stockent `deposited.url` et le servent tel quel, sans jamais re-signer.

**Scenario.** À J+31, photos de proches, pièces jointes de notes, ordonnances
vétérinaires (données personnelles) et tout média du Cercle sont **brisés
définitivement** — le `path` n'est même plus connu pour re-signer.

### WR-09 — Création puis upload sans rollback : un échec d'upload laisse un doublon à la réédition

**Severity:** HIGH
**Files:** `app/src/modules/voyages/api.ts:263-275` ; `app/src/modules/recettes/hooks/use-recettes.ts:201-218` ; `app/src/modules/anniversaires/hooks/use-anniversaires.ts:60-79` ; `app/src/modules/landing/create-household-page.tsx:46-60`

**What.** La ligne est créée **avant** le dépôt ; si le dépôt (ou l'écriture qui suit)
échoue, l'erreur est propagée, le dialogue reste ouvert avec `editing === null`, et
la ligne créée n'est pas annulée.

**Scenario.** Coupure réseau pendant l'upload de la couverture : « … impossible. », mais
l'objet existe (voyage, recette) ; l'utilisateur resoumet → doublon. Pour le foyer : la
création précède la génération du token d'invitation, donc un échec du token laisse un
foyer créé et un second à la réédition.

### WR-10 — Orphelins Storage : fichiers jamais supprimés

**Severity:** MEDIUM
**Files:** `app/src/modules/notes/hooks/use-notes.ts:183-184,204` ; `modules/animaux/api.ts:41-47,92-94` ; `modules/cercle/api.ts:99-129` ; `modules/ardoise/ardoise-page.tsx:137-150` ; `modules/courses/components/product-sheet.tsx:192`

**What.** Les suppressions/remplacements suppriment les **lignes** mais jamais les
objets du bucket, alors que `removeHouseholdFile` existe et que cadeaux (`cadeaux-page.tsx:220-221`),
prestataires et adresses compensent déjà. `depositPetPhoto` écrase `photo_url` sans
supprimer l'ancien ; `removePet` ne supprime ni le portrait ni les documents.

**Scenario.** Suppression d'une fiche animal : les ordonnances restent indéfiniment dans
le volume `household-media`.

### WR-11 — Animaux : `isMutating` et `uploading` sont structurellement `false`

**Severity:** MEDIUM
**Files:** `app/src/modules/animaux/hooks/use-animaux.ts:109,233` ; `app/src/modules/animaux/animaux-page.tsx:344,365`

**What.** Le hook retourne `resource.isMutating` (état des mutations internes de
`useResource`), mais `savePet`/`deletePet`/`addFiles` appellent les fonctions d'
`../api` directement (`data.create`/`data.update`), qui ne touchent jamais ces
mutations. Les drapeaux sont donc constamment `false`.

**Scenario.** Double clic sur « Créer la fiche » → deux fiches (et deux uploads). Pas de
retour « Envoi… » sur les pièces jointes → l'utilisateur resélectionne, doublons.
`addFiles` échoue au premier échec **avant** `await invalidate()` : succès partiel
rapporté comme échec total.

### WR-12 — 29 février → « Dans NaN jours » 3 années sur 4

**Severity:** MEDIUM
**File:** `app/src/modules/dashboard/hooks/use-dashboard.ts:329-336,184-192`

**What.** `nextBirthdayIso` construit `${year+1}-02-29` en année non bissextile ;
`new Date('2027-02-29')` est invalide → `daysBetween` renvoie `NaN` →
`Math.max(0, NaN)` = `NaN` → affichage « Dans NaN jours », et le comparateur de tri
renvoie `NaN`.

**Scenario.** Toute fiche née un 29 février (le commentaire de la fonction dit
pourtant « 29 février inclus »).

### WR-13 — Tâches : le glisser-déposer n'a aucun effet visible

**Severity:** MEDIUM
**Files:** `app/src/modules/taches/taches-page.tsx:285,125-143` ; `app/src/modules/taches/types.ts:192-202`

**What.** La liste affichée est triée par `status`, puis **échéance**, puis
`priority_order`, alors que le dépôt n'écrit que `priority_order`. Le `refresh()`
réapplique le tri par échéance : la ligne revient à sa place.

**Scenario.** Échéances 20/10, 22/10, 25/10 : l'utilisateur glisse la 25/10 en tête →
elle rebondit sous la 22/10, seul le badge de priorité change. Le libellé « Glissez les
lignes pour réordonner » et l'annonce lecteur d'écran promettent une position qui
n'arrive pas. (Nuance : `AGENTS.md` §6 décrit un tri par échéance — l'affordance et le
comportement se contredisent, il faut trancher.)

### WR-14 — Tâches : « Rappels du jour » liste des rappels expirés à l'infini

**Severity:** MEDIUM
**File:** `app/src/modules/taches/taches-page.tsx:324-350` ; `app/src/modules/taches/types.ts:262-266`

**What.** `reminderTasks` retient toute tâche avec `reminder_at` non nul, sans filtre de
date, triée croissante puis `slice(0, 3)`.

**Scenario.** Trois rappels passés (juin…) occupent les trois places en tête ; les
rappels du jour n'apparaissent jamais. Aucun chemin ne nettoie un rappel passé.

### WR-15 — Fidélité : types et repli du scan

**Severity:** MEDIUM
**Files:** `app/src/modules/fidelite/hooks/use-barcode-scanner.ts:63-68,88-105,147-151,184`

**What.** (a) Le repli `html5-qrcode` lit `format.format` (enum numérique) au lieu de
`formatName` → `toScanFormat` renvoie `'other'` → tout QR scanné est enregistré en
`barcode`. (b) `new BarcodeDetector({formats:[…]})` **lève** si un format demandé n'est
pas supporté : l'exception est attrapée par le `catch` externe, qui bascule en erreur
au lieu du repli pourtant promis. (c) `stop()` ne coupe rien si `getUserMedia` est
encore en vol au moment de la fermeture → caméra allumée et `detect()` par frame
jusqu'au départ de la page.

### WR-16 — Fichier mobile à MIME vide déposé en `application/pdf`

**Severity:** MEDIUM
**File:** `app/src/lib/storage.ts:79`

**What.** `isAccepted` accepte une image devinée par l'extension (cas documenté
« certains mobiles déclarent un type vide »), mais la branche MIME, elle, réécrit
`mime = 'application/pdf'` quand `file.type` est vide → extension `.pdf`, et
`isImageMime` devient faux (aperçu perdu, « PDF » qui est un JPEG).

### WR-17 — Garde-fous de route et d'attestation

**Severity:** MEDIUM
**Files:** `app/src/app/router.tsx:66,205` ; `app/src/components/ui/route-error.tsx:62`

**What.** (a) `RequireAttestation` ne teste que `profileQuery.data?.age_attested_at` : sur
`isError`, `data` est `undefined` → un utilisateur **déjà attesté** reçoit la modale CGU
bloquante, dont l'action naturelle le déconnecte. (b) `/foyer/nouveau` et
`/foyer/rejoindre` ne sont pas sous `RequireAuth` (contrairement à `/foyer`) alors
qu'ils écrivent. (c) `LazyRoute` attribue **toute** erreur de rendu à la connexion et
rejoue la même page à chaque « Réessayer ».

### WR-18 — Un `enfant` voit Modifier/Supprimer sur les événements existants

**Severity:** MEDIUM
**File:** `app/src/modules/calendrier/calendrier-page.tsx:223-225,540-541`

**What.** `isChild` ne borne que les entrées de création ; les callbacks
`onEdit`/`onDelete` sont passés inconditionnellement. La doctrine D-06 « lecture seule
partout, gating UI + RLS » n'est donc respectée que côté serveur.

### WR-19 — Notifications : deps incomplètes, la cloche et le compteur divergent

**Severity:** MEDIUM
**File:** `app/src/hooks/use-notifications.ts:347-359`

**What.** Le memo `items` lit `assigneesByTask` et `currentMember` mais ne les a pas dans
ses dépendances (il liste `tasksResource.rows`, qui ne change pas quand seuls
`task_assignees` changent).

**Scenario.** Assigner à un autre membre une tâche présente dans la cloche ne la
retire pas ; le badge de la barre, lui, se met à jour → deux nombres qui se
contredisent.

### WR-20 — Voyages : partage égal invité arrondi par part → rejet du RPC

**Severity:** MEDIUM
**File:** `app/src/modules/voyages/components/trip-budget-tab.tsx:342-350` ; `app/src/modules/voyages/api.ts:974-1001`
**Constraint:** `supabase/migrations/0056_ardoise_guests_parts.sql:210`

**What.** Chaque part est `Math.round((montant / n) * 100) / 100`, identique pour tous, et
le reliquat n'est pas reporté (contrairement au chemin membre). Le RPC rejette un écart
> 1 centime.

**Scenario.** 50 € entre 6 → 6 × 8,33 = 49,98 → rejet « la somme des parts ne
correspond pas ». Cas plus doux : 10 € / 3 → 1 centime non alloué silencieusement.

---

## INFO

### IN-01 — Aucun linter : les directives `eslint-disable` sont inertes

**Severity:** LOW
**Files:** 14 occurrences de `eslint-disable-next-line react-hooks/exhaustive-deps` (recettes, ardoise, routines, courses, notes, tâches, contacts, calendrier, anniversaires, mobile-drawer)

Aucun ESLint / Biome / Prettier n'est installé ni dans la chaîne (§2.7 AGENTS.md :
`typecheck && test && build`). Les 14 directives supposent une règle qui n'est vérifiée
par personne.

### IN-02 — Fichiers non suivis et non ignorés

`app/shot-toggle-on.mjs` (script Playwright ad hoc de debug), `.gsd/dispatch-isolation-sentinel.json`,
`.claude/worktrees/*.worker.json|.log|.prompt.md`. Un `git add -A` les embarquerait.

### IN-03 — Déclarations de types dupliquées

`app/src/types/database.ts` : `NoteAttachmentRow` (238 et 249), `PetAttachmentRow` (601 et 612).
La fusion TypeScript masque une divergence future.

### IN-04 — Service worker : pas de `pushsubscriptionchange`

`app/src/sw.ts:120`. Un abonnement rotaté n'est ni renouvelé ni signalé.

### IN-05 — `Field` : champ requis indiqué seulement visuellement

`app/src/components/ui/field.tsx:40-42`. Astérisque `aria-hidden`, pas d'`aria-required`
transmis au contrôle.

### IN-06 — `folder-tabs` : rejets de promesse non gérés

`app/src/components/shared/folder-tabs.tsx:204,279` — `void … .then()` sans `.catch`, alors
que les consommateurs relancent volontairement après toast.

### IN-07 — Session/foyer persistés qui survivent au sign-out d'un autre onglet

`app/src/hooks/use-auth.ts:118`, `app/src/stores/household-store.ts:31` — branche « pas de
session » qui ne vide pas `useSessionStore.user` ; aucun listener `storage`.

### IN-08 — Deux clés de requête hors conventions

`app/src/lib/data/useResource.ts:56` (`select` appliqué dans `queryFn` mais absent de la
clé) ; `app/src/app/app-shell.tsx:65` (clé `['app-shell','task-assignees',…]` jamais
atteinte par les invalidations `['all','task_assignees']`).

### IN-09 — État vide d'un dossier qui n'existe pas

`app/src/modules/notes/notes-page.tsx:199-206` — le message et l'unique action supposent
une recherche active ; dossier vide sans filtre → texte trompeur.

### IN-10 — Page de jonction : mauvaise sonde de configuration

`app/src/modules/landing/join-household-page.tsx:39` teste `VITE_SUPABASE_URL` seul au lieu
de `isSupabaseConfigured` (URL **et** clé).

### IN-11 — Commentaire dupliqué mot pour mot

`app/src/hooks/use-auth.ts:126-131`.

### IN-12 — `BarCode` ne récupère jamais d'un encodage en échec

`app/src/components/shared/barcode.tsx:44` — en état `failed`, le `<svg ref>` n'est plus
rendu, donc l'effet suivant retrouve `svgRef.current === null` et remet `failed`.

### IN-13 — Anniversaire d'origine contact éditable sous un id synthétique

`app/src/modules/anniversaires/anniversaires-page.tsx:199,355-366` — le point du
calendrier appelle `openEdit` sur `contact-<uuid>` : « Modification enregistrée. » sans
effet.

### IN-14 — `PlaceFormDialog` ne se réinitialise pas entre deux ouvertures

`app/src/modules/adresses/components/place-form-dialog.tsx:56-83` — pas d'effet `reset`,
`key` inchangé pour la même cible : une photo annulée resurgit à la réouverture.

---

## Checked and clean (extraits)

- Seule la clé publiable atteint le bundle ; 0 `any`, 0 `console.log`, 0 `TODO/FIXME`,
  0 `dangerouslySetInnerHTML` hors QR généré ; `supabase-client` garde toutes les
  branches d'absence de configuration.
- Garde de route acyclique ; parcours invités (cadeau, ardoise, recette, voyage) sans
  aucune écriture PostgREST ; `RequireGrownUp` rend `Forbidden` et non un faux 404.
- `useResource` remonte les erreurs et restaure l'état optimiste ; les RPC d'ardoise et
  de voyage font dépense + parts en **une** transaction avec `auth.uid()`, appartenance
  revérifiée et `EXECUTE` révoqué à `anon`.
- Adapter Supabase : `list`/`create`/`update` relancent `DataError` (pas d'avaleur) ;
  Realtime dédupliqué par table et canal retiré au dernier désabonnement.
- Service worker : `/rest|/auth|/functions|/realtime|/storage` hors `NavigationRoute`,
  URL de notification ancrée à `/`.
- Arithmétique : `splitEqual`, `simplifyDebts`, `lateDays`, dédup des widgets, marquage
  invité (slot `null`).
