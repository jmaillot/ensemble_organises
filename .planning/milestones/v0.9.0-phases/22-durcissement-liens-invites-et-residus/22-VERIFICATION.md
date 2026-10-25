---
phase: 22-durcissement-liens-invites-et-residus
verified: 2026-10-16T18:04:06Z
status: passed
score: 30/30 must-haves verified
covered_files:
  - .planning/phases/22-durcissement-liens-invites-et-residus/22-01-PLAN.md
  - .planning/phases/22-durcissement-liens-invites-et-residus/22-01-SUMMARY.md
  - .planning/phases/22-durcissement-liens-invites-et-residus/22-02-PLAN.md
  - .planning/phases/22-durcissement-liens-invites-et-residus/22-02-SUMMARY.md
  - app/src/hooks/use-notifications.ts
  - app/src/lib/data/useResource.test.ts
  - app/src/lib/data/useResource.ts
  - app/src/modules/adresses/api.test.ts
  - app/src/modules/adresses/api.ts
  - app/src/modules/calendrier/calendrier-page.test.tsx
  - app/src/modules/calendrier/calendrier-page.tsx
  - app/src/modules/calendrier/components/calendar-grid.tsx
  - app/src/modules/cercle/lib/media.test.ts
  - app/src/modules/cercle/lib/media.ts
  - app/src/modules/landing/landing-page.test.tsx
  - app/src/modules/landing/landing-page.tsx
  - supabase/migrations/0127_guest_media_household.sql
  - supabase/tests/0127_guest_media_household.sql
covered_digest: "v2:sha256:61c15b4bfb0bd4614097a862a3993f2175f34c7a37c0e295bed3ef178499664f"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 22: Durcissement des liens invités et résidus vérifiés — Verification Report

**Phase Goal:** Aucun chemin signé par l'Edge `recipe-invite` n'appartient à un
autre foyer ni ne contient un segment `..` (AR-21-01, AR-21-02 de
`21-SECURITY.md`), et un lot arrêté de six constats des phases 18/19 est fermé
avec preuve.

**Verified:** 2026-10-16T18:04:06Z (HEAD `d36359c`)
**Status:** passed
**Exécution:** 2/2 plans — 22-01 (`82b43b5`, complété par `c02d9bf`), 22-02
(`d36359c`).

Le raisonnement de R1 est **remonté depuis la barrière** : l'Edge `recipe-invite`
signe avec le client service-role, donc hors de toute politique de bucket, et
l'invité n'a pas de compte — la RLS ne le protège pas. La seule valeur qu'il
signe vient de `view_recipe_share` (`index.ts:442` → `:481`, `toGuestSteps`).
La barrière est donc **là**, plus une contrainte d'écriture pour que la valeur
ne puisse pas naître. C'est pourquoi le durcissement vit dans le RPC et dans la
contrainte, et pas dans la signature de `resolveGuestMediaUrl`.

## R1 — Références média bornées au foyer de la recette (22-01)

### Truths

| must-have | verdict | preuve |
|---|---|---|
| Un `photo_path` d'un AUTRE foyer rend `null` dans `view_recipe_share` | ✅ | test (c) ; **rouge** quand le `case` des étapes est remplacé par la colonne brute (mutation 3 de 22-01) **et** quand `starts_with` seul est retiré (ce passage) |
| Un `photo_path` avec `..` après un préfixe de foyer valide est REFUSÉ à l'écriture **et** rend `null` à la lecture | ✅ | écriture : (a2), rouge sans `strpos` (mutation 1) ; lecture : **(c2)**, ajouté ce passage, rouge quand `strpos` est retirée des étapes **seulement** |
| Un `cover_photo` d'un autre foyer, ou une forme `http(s)`, rend `null` | ✅ | (b2) et (b3) ; **rouge** quand `cover_photo` est rendue brute (mutation 2) ; (b4) pour un `cover_photo` portant `..` |
| Un `photo_path` et un `cover_photo` légitimes traversent le RPC inchangés | ✅ | (a1) écriture acceptée, (b1) couverture rendue telle quelle, et le pendant positif du bloc (c) sur l'étape `step_r1` |

### Artifacts / key_links / prohibitions

| must-have | verdict | preuve |
|---|---|---|
| `0127` : contrainte resserrée + `view_recipe_share` borné | ✅ | le fichier existe, appliqué et journalisé ; la contrainte est redéfinie sous le **même nom**, la définition effective est la dernière (§2.7 A.2) |
| `0127` test : les cas, chacun capable d'échouer | ✅ | 9 assertions ; chacune a été vue rouge sur une mutation qui la vise |
| `21-SECURITY.md` : AR-21-01 et AR-21-02 passent à « fermé » | ✅ | les deux entrées portent « FERMÉ 2026-10-16 (phase 22, plan 22-01) » avec mécanisme et preuve par mutation |
| `0126:35-37` → `0127` : la contrainte cesse d'être contournable | ✅ | `strpos(photo_path, '..') = 0` dans la définition en base |
| `0125:65-67` → `0127` : c'est la valeur RENDUE qui change | ✅ | (b1)–(b4) portent sur la sortie du RPC, pas sur la colonne |
| Le verdict est prononcé contre le foyer de la RECETTE | ✅ | `v_recipe_household` vient de `public.recipes` ; (c) et (c2) font porter une ligne héritée à l'étape `step_r2` sans toucher `recipes.household_id` |
| Ne pas réécrire `0125`/`0126` | ✅ | `git log --oneline -- supabase/migrations/0125* 0126*` : aucun commit de la phase 22 |
| Ne pas changer la signature de `resolveGuestMediaUrl` | ✅ | aucun fichier de `supabase/functions/` modifié ce passage |
| Aucune assertion tautologique | ✅ | chaque cas a son tableau de mutation (§2.7 D) |
| Ne pas présenter Storage comme normalisant `..` | ✅ | le commentaire d'en-tête de `0127` dit explicitement que la normalisation n'est pas observable et n'est pas supposée |

### L'écart trouvé pendant la rédaction de ce rapport

En relisant le test pour le décrire : le filtre des étapes porte **deux**
conditions. Le cas (c) porte un chemin d'un autre foyer, que `starts_with` seul
rejette déjà — la clause `strpos(…, '..') = 0` n'était donc exercée par **rien**,
alors qu'elle retient la ligne héritée `<homeA>/../<homeB>/…` que la contrainte
`0126` laissait passer à l'écriture. R1 tel que la phase le définissait était donc
**partiellement prouvé**. Clos par (c2) (commit `c02d9bf`), avec preuve par
mutation clause par clause. Un récit complet, y compris la mutation qui n'avait
pas atterri et le verdict faux qu'elle a failli produire, est dans
`22-01-SUMMARY.md` (Addendum).

## R2 — Le lot arrêté de six constats (22-02)

| constat | must-have | verdict | preuve |
|---|---|---|---|
| (a) | Un `type` vide n'est plus refusé ; un fichier non décodable reçoit toujours le message | ✅ | `media.test.ts` : type vide accepté (`mime` de repli `image/jpeg`), type déclaré non-image refusé, et décodage refusé → même message. Assertions vues rouges sur les deux mutations (retrait du garde, retrait du `try/catch`) |
| (b) | Le glisser-maintenir ne crée plus d'événement pour un `enfant` | ✅ | test D-06 de `calendrier-page.test.tsx`, rouge avec `onLongPress={openCreate}` — et **seul** rouge après la correction du `finally` |
| (c) | Plus deux instructions sur une même ligne | ✅ | vérifié par lecture (`use-notifications.ts`, deux lignes) ; aucune assertion possible sur une forme, et `no-eslint-directive.test.ts` garde la prohibition de directive |
| (d) | `rows` garde la MÊME identité quand la requête est désactivée | ✅ | `useResource.test.ts` compare les références (`toBe`) sur `rerender()` en `enabled: false` ; rouge avec `?? []` |
| (f) | Le titre lit le nombre d'entrées de `lib/modules.ts` | ✅ | `landing-page.test.tsx` importe `modules` et compare au texte rendu ; rouge si un nombre est réécrit à la main |
| (g) | `placePhotoPathOf` rogne, et le verdict n'a plus qu'une définition | ✅ | `api.test.ts` : valeur rognée avant jugement, préfixe ancré ; `isPlacePhotoPath === isHouseholdMediaPath` |

Artifacts (4/4 : les quatre fichiers de test existent et portent l'assertion),
key_links (3/3 : `compressImage` ← `depositHouseholdFile`, les cinq entrées de
création du calendrier, `adresses/api.ts` ← `lib/storage.ts`) et prohibitions
(3/3 : aucune directive de linter — contrôle automatisé vert ; `e2e/recettes.spec.ts`
non touché ; aucun message remplacé par une exception brute) : ✅.

### Balayage de la classe (AGENTS.md §2.7 E)

`use-voyages.ts:96` (`tripsQuery.data ?? []` produit au rendu, consommé comme
dépendance d'effet et de memo) présente la **même forme** que (d) : consigné,
**non corrigé** — il n'est ni dans le lot ni dans un journal, et son seul effet
observable est un recalcul sans changement de donnée. Les trois autres sites de
même apparence (`use-ardoise.ts:165`, `use-trip-detail.ts:175`,
`use-cadeaux.ts:191-192`) n'ont aucun consommateur qui mémoïse dessus. Le repli
partagé n'ouvre pas de piège de mutation : aucun consommateur ne modifie `rows`
sur place.

## R3 — La même classe dans deux autres Edge, consignée

✅ Consigné sans correction, avec `file:line` et le site où le foyer est
disponible : `gift-list-invite/index.ts:857` (`resolveGuestPhotoUrl`, foyer à
`:750`) et `ardoise-invite/index.ts:637` (`resolveGuestCoverUrl`, foyer à
`:532`). Le journal `21-SECURITY.md` et `22-01-SUMMARY.md` le portent.

**FERMÉ le 2026-10-17 (phase 23, migration `0128`)** — le constat ci-dessus est
**périmé** : les deux signeurs ne reçoivent plus une valeur brute mais une valeur
bornée au foyer (`guest_view_gift_list` pour les cadeaux, le module pur
`ardoise-invite/guest-media.ts` pour l'ardoise), et la forme `http(s)` héritée
n'est plus relayée (D-03). `21-SECURITY.md` porte le détail du mécanisme ;
`recipe-invite/guest-steps.ts:65` garde un relais `http(s)` désormais
inatteignable (D-05, asymétrie cosmétique, jamais une protection).

## Chaîne de vérification (arbre figé)

| étape | résultat |
|---|---|
| `cd app && npm run typecheck` | propre |
| `cd app && npm test` | 148 fichiers / **1264** tests verts |
| `cd app && npm run build` | vert |
| `cd app && npm run test:e2e` | **123 passés / 5 ignorés** |
| `python3 scripts/check-sql-statique.py` | 0 défaut (181 fonctions, 127 migrations, 66 tests) |
| `sh scripts/test-db.sh` | **64/64 fichiers verts** |

## Ce que ce rapport n'affirme pas

- **Les autres entrées des journaux 18/19** (§2, §7, §9, §10, §11, §12, §13,
  §14, §15, §16) ne sont pas dans le lot arrêté. Leur statut n'est **pas**
  affirmé : ni « ouvert », ni « fermé ». Les recenser demanderait un passage qui
  n'a pas été fait, et une absence affirmée est une affirmation (§2.7 I).
- **La chaîne base → Edge → Push** (`test-dispatch-push.sh`) reste **non
  validée** sur cet hôte : aucun abonnement de push réel. La phase 22 ne touche
  aucun code de push, donc cela ne change pas son verdict — mais cela reste une
  limite de l'environnement, pas un acquis.
- **Le comportement de l'Edge déployée** n'est pas exercé ici (`deno` absent,
  aucun test n'importe un `index.ts`). Ce que la phase ferme est le côté BASE :
  l'Edge ne *peut plus recevoir* de valeur illégitime du RPC. Le redéploiement
  n'est pas nécessaire pour R1 (le changement est une fonction SQL), mais son
  application en production relève de l'exploitant.
- **L'application de `0127` en production** n'est pas faite ici : la migration
  est appliquée sur la base de développement et journalisée. Les journaux
  d'audit de la phase 19 ont été conservés dans le dépôt : les défauts qu'ils
  décrivent y restent lisibles.
