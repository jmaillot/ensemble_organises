# Phase 23: Signature média invitée bornée au foyer — Specification

**Created:** 2026-10-17
**Ambiguity score:** 0.10 (gate: ≤ 0.20)
**Requirements:** 4 locked

## Goal

Aucune référence média rendue à un visiteur invité par `gift-list-invite` ou
`ardoise-invite` ne peut désigner un objet d'un autre foyer : la valeur sort
`null` dès qu'elle n'est pas un chemin borné au foyer de la ressource, et la
forme `http(s)` n'est plus relayée du tout.

## Background

`21-SECURITY.md` a relevé trois surfaces invitées qui signent un chemin avec le
client service-role — donc **hors** de la politique du bucket
`(storage.foldername(name))[1]` — alors que l'invité n'a pas de compte et que la
RLS ne le protège pas. La phase 22 (`0126` + `0127`, plan 22-01) en a fermé une
seule, `recipe-invite`, pour les recettes. Il en reste **deux**, c'est le résidu
R3.

État vérifié du code et de la base le 2026-10-17 :

- `grep -rn createSignedUrl supabase/functions/` ne rend que trois sites :
  `recipe-invite/guest-steps.ts:41,70` (fermé), `gift-list-invite/index.ts:865`
  et `ardoise-invite/index.ts:645`. R3 = ces deux derniers, aucun autre.
- **Cadeaux** : le foyer n'est pas dans l'Edge. `handleGuestView`
  (`gift-list-invite/index.ts:873`) appelle le RPC `guest_view_gift_list`, qui
  rend `'photo_url', i.photo_url` **tel quel** (definition effective lue en
  base), puis `resolveGuestPhotoUrl` (`:857`) signe cette valeur. Le foyer est
  connu **dans le RPC** par construction (`v_invite.list_id` →
  `public.gift_lists.household_id`, colonne vérifiée présente), mais n'est
  jamais rendu.
- **Ardoise** : le foyer est disponible dans l'Edge. `buildGuestView`
  (`ardoise-invite/index.ts:657`) relit la ligne `ardoises` — mais sélectionne
  `id,name,description,cover_url,is_active`, **sans `household_id`** — et
  `resolveGuestCoverUrl` (`:637`, appelée `:737`) signe `cover_url`. Deux
  appelants du même constructeur : `handleLinkView` (`:773`) et le ticket
  (`:600`).
- **Aucune contrainte** ne borne `gift_items.photo_url` ni `ardoises.cover_url`
  (`pg_constraint`) : les seules de l'espèce sont `0126`/`0127`, sur
  `recipe_steps`.
- Les deux colonnes tolèrent une **forme non-chemin** : `cadeaux/types.ts:51`
  (« chemin du bucket pour un dépôt, URL héritée ou `data:` sinon ») et les
  tests de l'ardoise l'affirment (`api.test.ts:131` `https://externe.example/…`,
  `:161` « brute pour une forme non-chemin »). C'est l'argument de **D-02** de la
  phase 22 : une contrainte d'écriture refuserait l'édition d'une ligne héritée.
- Les deux `resolve*` relaient `http(s)` verbatim (`if (/^https?:\/\//i.test(value)) return value;`).
  C'est la branche que `0127` a rendue morte côté recette en ne l'émettant plus.
- Le dépôt a déjà la doctrine du correctif **testable sans `deno`** :
  `recipe-invite/guest-steps.ts` est un module **pur** (aucun import Deno ni
  `npm:`), et `app/vite.config.ts:71` inclut `../supabase/functions/**/*.test.ts`.
- `app/src/modules/cadeaux/hooks/use-cadeaux.ts:85` filtre déjà
  `isHouseholdMediaPath(row.photo_url)` avant de signer : le dépôt sait déjà
  distinguer un chemin d'une forme héritée, mais **seulement côté client**.

Le raisonnement de `0127:24-32` vaut mot pour mot ici : le trou n'est pas
l'écriture (les deux colonnes sont antérieures à toute borne et de forme
mixte), c'est la **signature service-role** ; le filtre de lecture le ferme,
lignes héritées comprises.

## Requirements

1. **Verdict borné dans le RPC cadeaux**: `guest_view_gift_list` ne rend
   `photo_url` que si la valeur appartient au foyer de la liste.
   - Current: le RPC rend `'photo_url', i.photo_url` brut ; l'Edge
     (service-role) signe ce chemin, quel qu'il soit.
   - Target: `case when i.photo_url is null then null when
     starts_with(i.photo_url, v_list_household || '/') and
     strpos(i.photo_url, '..') = 0 then i.photo_url else null end` ; le foyer
     (`v_list_household`) sert au verdict et **n'est jamais rendu**.
   - Acceptance: test SQL — un article du foyer A dont `photo_url` vaut
     `<foyerB>/…` rend `photo_url: null` ; un article du foyer A dont
     `photo_url` vaut `<foyerA>/…` rend la valeur ; `<foyerA>/../<foyerB>/x.webp`
     rend `null` ; la réponse ne contient aucune clé portant le foyer.

2. **Verdict borné dans l'Edge ardoise**: la couverture rendue à l'invité n'est
   signée que si elle appartient au foyer de l'ardoise.
   - Current: `buildGuestView` ne lit pas `household_id` ;
     `resolveGuestCoverUrl` signe n'importe quel chemin.
   - Target: `buildGuestView` sélectionne `household_id` et le transmet ; la
     résolution rend `null` hors du préfixe du foyer ou sur un segment `..`.
   - Acceptance: test unitaire Vitest — chemin du foyer → URL signée ; chemin
     d'un autre foyer → `null` ; chemin contenant `..` → `null` ; le signeur
     n'est **pas appelé** dans ces deux derniers cas.

3. **La forme `http(s)` n'est plus relayée**: les deux surfaces invitées ne
   rendent qu'un chemin borné signé ou `null`.
   - Current: `resolveGuestPhotoUrl` (`gift-list-invite:862`) et
     `resolveGuestCoverUrl` (`ardoise-invite:639`) rendent la valeur telle
     quelle si elle commence par `http(s)://`.
   - Target: plus aucun relais `http(s)` sur ces deux surfaces ; toute valeur
     qui n'est pas un chemin borné rend `null`. Le formulaire n'offre qu'un
     dépôt (galerie/appareil), donc aucune valeur légitime n'est perdue.
   - Acceptance: test SQL (`photo_url = 'https://externe.example/x.jpg'` →
     `null`) **et** test unitaire (prédicat ardoise : `https://…` → `null`).

4. **Le verdict est prouvable automatiquement sur cet hôte (sans `deno`)**:
   au moins une assertion exécutable échoue si le bornage est retiré.
   - Current: le verdict n'existe nulle part ; aucune assertion ne le couvre ;
     `deno` est absent, donc un `index.ts` d'Edge ne peut pas être importé par
     une suite.
   - Target: le RPC est couvert par un fichier `supabase/tests/` exécuté par
     `scripts/test-db.sh`, et le bornage de la surface ardoise vit dans une
     fonction **pure** (hors Deno/`npm:`) dont un `*.test.ts` sous
     `supabase/functions/ardoise-invite/` est découvert par
     `app/vite.config.ts:71`.
   - Acceptance: `sh scripts/test-db.sh 0128` vert, et `npm test` découvre et
     exécute le nouveau fichier ; retirer le `case` du RPC **ou** le prédicat
     pur fait échouer au moins une assertion nommée.

## Boundaries

**In scope:**

- Migration `0128` recréant `public.guest_view_gift_list(text)` avec le verdict
  de lecture sur `photo_url` (recopie de la définition effective + le `case`).
- `ardoise-invite/index.ts` : `household_id` lu par `buildGuestView`, verdict
  transmis à la résolution de la couverture (les deux appelants, `:600` et
  `:773`, en héritent par construction).
- Un module **pur** portant le prédicat de bornage (chemin × foyer), exporté et
  testé, à l'image de `recipe-invite/guest-steps.ts`.
- `supabase/tests/0128_guest_media_household.sql` (verdict cadeaux, cas
  positif/négatif/`..`/`http(s)`/foyer non rendu).
- `supabase/functions/ardoise-invite/guest-media.test.ts` (verdict ardoise).
- Mise à jour des assertions de vitrine qui affirment le relais `http(s)` :
  `app/src/modules/cadeaux/api.test.ts`, `guest-cadeau-page.test.tsx`,
  `app/src/modules/ardoise/api.test.ts` (y compris le `data:` de
  `guest-cadeau-page.test.tsx:328`).

**Out of scope:**

- Toute contrainte d'écriture sur `gift_items.photo_url` ou `ardoises.cover_url`
  — décision utilisateur du 2026-10-17 : les deux colonnes tolèrent une forme
  héritée (`http(s)`, `data:`) et le client réécrit la valeur existante à chaque
  édition ; une contrainte refuserait cette édition (même raisonnement que
  `0127:24-32`, D-02 de la phase 22).
- `recipe-invite` — déjà fermé par la phase 22 (`0127`), on n'y touche pas.
- Réécrire `0122` ou toute migration appliquée — correction vers l'avant
  uniquement (AGENTS.md §2.7 A.1).
- Refondre la vue invitée de l'ardoise en fonction serveur — la vue est
  composée dans l'Edge, il n'y a pas de RPC à border ; le refactor n'est pas
  justifié par le trou.
- Les 14 politiques `*_delete_admin` (18-§3) — déjà assumées, décision prise.
- La passe documentaire 18/19 restante (statuts de `deferred-items.md` non
  affirmés) — hors périmètre, à router séparément.

## Constraints

- `set search_path = ''` sur le RPC : toute table s'écrit `public.` (contrôles 1
  et 2 de `scripts/check-sql-statique.py`).
- `starts_with`, jamais `like` : `household_id` est un texte `household_<uuid>`
  qui contient un `_`, métacaractère `like` (`0126:24-31`).
- Le segment relatif se teste par `strpos(valeur, '..') = 0`, jamais par un
  motif : les noms déposés sont `file_<uuid>.<ext>` et ne contiennent jamais
  deux points consécutifs (`0127:42-47`).
- Le foyer n'est **jamais** rendu au visiteur : il sert au verdict, il ne figure
  dans aucune clé de la réponse (`0127:116-120`).
- Le module pur de l'ardoise n'importe ni Deno ni `npm:` — sinon il cesse
  d'être exécutable par Vitest (doctrine `guest-steps.ts:1-6`).
- Échec fermé : absent, vide, forme inconnue, erreur de signature, exception →
  `null`, sans erreur remontée et sans journaliser la valeur (`0127:36-37`).
- Aucune directive de linter n'est introduite (le dépôt n'en a aucun) : une
  omission de dépendance porte un commentaire qui nomme la raison.

## Acceptance Criteria

- [ ] `guest_view_gift_list` rend `photo_url` **non nul** pour un article du
  foyer A dont la colonne vaut `<foyerA>/…`.
- [ ] `guest_view_gift_list` rend `photo_url: null` pour `<foyerB>/…`,
  `<foyerA>/../<foyerB>/x.webp` et `https://externe.example/x.jpg`.
- [ ] La réponse de `guest_view_gift_list` ne contient **aucune** occurrence de
  la chaîne du foyer de la liste.
- [ ] La résolution de la couverture invité de l'ardoise rend une URL signée
  pour `<foyerA>/…` et `null` pour `<foyerB>/…`, `../…` et `https://…`.
- [ ] Dans les deux cas de refus, le signeur n'est **pas** appelé (assertion sur
  le double de test, pas seulement sur le retour).
- [ ] `cd app && npm run typecheck && npm test && npm run build` vert.
- [ ] `python3 scripts/check-sql-statique.py` : 0 défaut.
- [ ] `sh scripts/test-db.sh 0128` vert ; suite complète verte (attendue 65/65).
- [ ] `cd app && npm run test:e2e` vert.
- [ ] Aucune migration appliquée n'a été réécrite ; `0128` est la seule
  migration nouvelle.

## Edge Coverage

**Coverage:** 8/8 applicable edges resolved · 0 unresolved

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| Absence | R1 | ✅ covered | `photo_url is null` → `null` (AC 2, cas nul) |
| Absence | R2 | ✅ covered | `cover_url` absent → `null`, signeur non appelé (AC 5) |
| Segment relatif | R1 | ✅ covered | `strpos(…, '..') = 0` ; cas `<foyerA>/../<foyerB>/x.webp` (AC 2) |
| Segment relatif | R2 | ✅ covered | même prédicat, test unitaire (AC 4, AC 5) |
| Forme héritée | R1 | ✅ covered | `https://…` → `null` (AC 2) |
| Forme héritée | R2 | ✅ covered | `https://…` → `null` (AC 4) |
| Fuite du foyer | R1 | ✅ covered | le foyer sert au verdict, jamais rendu (AC 3) |
| Foyer homonyme | R1/R2 | ✅ covered | `starts_with(… , household_id || '/')` exige la barre : `household_ab` n'accepte pas `household_abc/…` (AC 1, AC 4) |

## Prohibitions (must-NOT)

**Coverage:** 4/4 applicable prohibitions resolved · 0 unresolved

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT relayer une valeur `http(s)` sur une surface invitée | R3 | resolved | test (SQL + unitaire) : `https://…` → `null` |
| MUST NOT rendre le foyer de la ressource dans la charge invitée | R1 | resolved | test : aucune occurrence du foyer dans le jsonb (AC 3) |
| MUST NOT ajouter de contrainte d'écriture sur les deux colonnes | tout | resolved | jugement : décision utilisateur ; aucun DDL `add constraint` sur `gift_items`/`ardoises` dans `0128` |
| MUST NOT réécrire une migration appliquée | tout | resolved | jugement : `0128` seule nouvelle migration ; `0122` intacte (`git status`) |

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                        |
|--------------------|-------|------|--------|--------------------------------------------------------------|
| Goal Clarity       | 0.95  | 0.75 | ✓      | Une phrase, mesurable par assertion sur les deux surfaces     |
| Boundary Clarity   | 0.92  | 0.70 | ✓      | Hors-périmètre explicite et motivé (contrainte d'écriture, refactor) |
| Constraint Clarity | 0.88  | 0.65 | ✓      | `search_path` vide, `starts_with`, `strpos`, no-Deno, échec fermé |
| Acceptance Criteria| 0.90  | 0.70 | ✓      | 10 critères pass/fail, dont des négatifs sur le double de test |
| **Ambiguity**      | 0.10  | ≤0.20| ✓      |                                                              |

## Interview Log

| Round | Perspective     | Question summary                                                     | Decision locked                                                                 |
|-------|-----------------|----------------------------------------------------------------------|---------------------------------------------------------------------------------|
| 1     | Researcher      | Où le foyer est-il connu sur chaque surface ?                        | Cadeaux : dans le RPC. Ardoise : dans l'Edge (`buildGuestView`). Deux remèdes distincts |
| 2     | Boundary Keeper | La forme `http(s)` est-elle encore relayée ?                          | Non — l'utilisateur : la photo vient d'un dépôt (galerie/appareil), pas d'un chemin `https` |
| 3     | Boundary Keeper | Ajoute-t-on une contrainte d'écriture ?                               | Non — « fais au mieux pour garder le comportement attendu » ; une contrainte refuserait l'édition d'une ligne héritée (D-02) |
| 4     | Failure Analyst | Comment prouver le verdict sans `deno` ?                              | RPC couvert par `test-db.sh` ; surface ardoise portée par un module pur couvert par Vitest |

---

*Phase: 23-signature-media-invitee-bornee-au-foyer*
*Spec created: 2026-10-17*
*Next step: /gsd-discuss-phase 23 — implementation decisions (how to build what's specified above)*
