---
phase: 34-file-d-criture-rejeu
verified: 2026-11-06T08:10:00Z
status: passed
phase: 34-file-d-criture-rejeu
score: 23/23 must-haves verified (3 behavior-dependent confirmés par UAT 3/3 le 2026-11-06)
covered_files:
  - .planning/phases/34-file-d-criture-rejeu/34-01-PLAN.md
  - .planning/phases/34-file-d-criture-rejeu/34-01-SUMMARY.md
  - .planning/phases/34-file-d-criture-rejeu/34-02-PLAN.md
  - .planning/phases/34-file-d-criture-rejeu/34-02-SUMMARY.md
  - .planning/phases/34-file-d-criture-rejeu/34-03-PLAN.md
  - .planning/phases/34-file-d-criture-rejeu/34-03-SUMMARY.md
  - .planning/phases/34-file-d-criture-rejeu/34-04-PLAN.md
  - .planning/phases/34-file-d-criture-rejeu/34-04-SUMMARY.md
  - .planning/phases/34-file-d-criture-rejeu/34-05-PLAN.md
  - .planning/phases/34-file-d-criture-rejeu/34-05-SUMMARY.md
  - supabase/migrations/0177_client_key.sql
  - supabase/migrations/0178_client_key_cron.sql
  - supabase/migrations/0179_client_key_rpc.sql
  - supabase/tests/0177_client_key.test.sql
  - app/src/lib/offline/outbox.ts
  - app/src/lib/offline/outbox.test.ts
  - app/src/lib/offline/outbox-replay.ts
  - app/src/lib/offline/outbox-replay.test.ts
  - app/src/lib/offline/query-persistence.ts
  - app/src/lib/query-policy.ts
  - app/src/lib/query-policy.test.ts
  - app/src/lib/data/useResource.ts
  - app/src/lib/data/useResource.test.ts
  - app/src/lib/data/write-policy.ts
  - app/src/lib/data/write-policy.test.ts
  - app/src/lib/data/supabase-adapter.ts
  - app/src/lib/data/supabase-adapter.test.ts
  - app/src/hooks/use-outbox.ts
  - app/src/hooks/use-outbox.test.ts
  - app/src/hooks/use-outbox-gate.ts
  - app/src/hooks/use-outbox-gate.test.ts
  - app/src/hooks/use-outbox-replay.ts
  - app/src/hooks/use-outbox-replay-badge.ts
  - app/src/hooks/use-outbox-replay-badge.test.ts
  - app/src/hooks/use-sign-out.ts
  - app/src/hooks/use-auth.ts
  - app/src/hooks/use-auth.test.ts
  - app/src/components/banners/banner-slot.tsx
  - app/src/modules/parametres/components/offline-panel.tsx
  - app/src/modules/courses/api.ts
  - app/src/modules/courses/delete-shopping-list.test.ts
  - app/src/modules/courses/hooks/use-courses.ts
  - app/src/modules/courses/products-api.ts
  - app/src/modules/courses/components/product-sheet.tsx
  - app/src/modules/courses/courses-offline-writes.test.tsx
  - app/src/modules/courses/courses-page.tsx
  - app/src/modules/voyages/components/trip-courses-tab.tsx
  - app/src/stores/session-store.ts
  - app/src/stores/household-store.ts
  - app/src/app/router.tsx
  - .planning/phases/34-file-d-criture-rejeu/34-06-PLAN.md
  - .planning/phases/34-file-d-criture-rejeu/34-06-SUMMARY.md
covered_digest: "v2:sha256:ba6157c81cd4e0a924d87f734ef99e5d2aba2958abc98df5e3a124c3af79dce0"
behavior_unverified: 3
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 23/23
  gaps_closed: []
  gaps_remaining: []
  regressions: []
behavior_unverified_items:
  - truth: "Le row Realtime prime effectivement sur l'overlay optimiste en conditions réelles (D-16, WRQ-06) — la moitié client (identité id+client_key + invalidation après succès) est prouvée par tests (y compris scénario (f) du test 34-05 avec faux client) ; la primauté du serveur sur le canal Realtime RÉEL n'est pas exercée en test unitaire"
    test: "Rejouer le test UAT 1 : créer une écriture hors-ligne sur Courses, couper le réseau, revenir en ligne avec un second appareil connecté au même foyer, observer l'overlay se remplacer par les données serveur (id et client_key inchangés, pas de doublon ni flash d'ancien état)"
    expected: "La ligne optimiste est remplacée par le row serveur ; aucune ligne dupliquée"
    why_human: "Nécessite un backend Supabase réel + canal Realtime + deux clients ; un faux client ne prouve pas la primauté du canal réel"
  - truth: "Le badge « N en attente » / « N bloquées » est visuellement présent, cliquable vers /parametres, et le toast est discret (D-11/D-12/D-13)"
    test: "Enfiler 2 écritures hors-ligne puis provoquer 1 échec terminal (ex. écriture sur une ligne supprimée par ailleurs) ; observer la bannière, le compteur, le toast"
    expected: "Badge visible online et offline, retombe à zéro après rejeu complet, « N bloquées » ouvre le panneau, un seul toast par passe d'échec"
    why_human: "Apparence visuelle, priorité de bannière et sensation de discrétion du toast ne sont pas vérifiables par grep/test"
  - truth: "Le flux de bout en bout du goal — écriture hors-ligne Tier 1 → rejeu exactement une fois → compteur retombe à zéro — se déroule sur un vrai appareil en conditions réseau réelles (y compris Courses, depuis la fermeture de G-34-1)"
    test: "Parcours e2e manuel : avion → ajouter un article Courses + cocher une tâche → retour réseau → vérifier que le serveur contient exactement les 2 écritures et que le badge descend à 0"
    expected: "Exactement une écriture serveur par action, zéro doublon, zéro perte silencieuse, badge à zéro"
    why_human: "Le cycle complet (offline réel, reprise réseau, persistance IndexedDB entre reloads) exige un appareil et un vrai réseau"
human_verification:
  - test: "Voir behavior_unverified_items (3 items, reproduits ici)"
    expected: "Voir ci-dessus"
    why_human: "Backend réel, appareil, conditions réseau réelles, perception visuelle"
---

# Phase 34: File d'écriture & rejeu — Verification Report

**Phase Goal:** Une écriture simple effectuée hors-ligne sur un module Tier 1 atteint malgré tout le serveur — exactement une fois, sans doublon ni perte silencieuse — et l'utilisateur voit toujours combien d'écritures sont en attente et ce qui a échoué.
**Verified:** 2026-11-06T10:30:00Z
**Status:** human_needed
**Re-verification:** Yes — après la passe de correction code-review (7 commits db32ce7→f6446d4) ET le plan 34-06 (fermeture de UAT-34-1 : absorption de l'échec enfilé dans useResource) ; la chaîne §2.7 complète a été rejouée sur le checkout post-34-06 (typecheck, 234 fichiers / 1879 tests verts, build, contrôle SQL statique) ; les 3 items behavior-dependent ont été confirmés par l'humain le 2026-11-06 (34-UAT.md : 3/3 passés)

## Goal Achievement

### Observable Truths

| # | Truth (source plan) | Status | Evidence |
|---|---|---|---|
| 1 | Rejouer deux fois la même écriture (même client_key) ne crée pas de doublon (34-01) | ✓ VERIFIED | `supabase/tests/0177_client_key.test.sql` vert (104/104, Docker réel, passe initiale) ; aucun fichier supabase/ modifié depuis |
| 2 | Chaque ligne pré-existante des 5 tables Tier 1 porte un client_key non null (34-01) | ✓ VERIFIED | Migration `0177_client_key.sql` : 5× add column + backfill + `set not null` + contraintes uniques ; inchangée |
| 3 | Doublon même foyer refusé (23505) ; même client_key accepté dans deux foyers distincts (34-01) | ✓ VERIFIED | Cas 2 et 3 du fichier de test SQL — verts |
| 4 | Utilisateur non membre du foyer : insert refusé (RLS) (34-01) | ✓ VERIFIED | `expect_denied` inter-foyer sur tasks — vert |
| 5 | Create hors-ligne enfilé automatiquement via MutationCache central, sans composant de vue modifié (34-02) | ✓ VERIFIED | `query-policy.ts` `isWriteAllowed(marker.table)` ; `useResource.ts` 5× `meta: { table, operation }` ; suite complète verte |
| 6 | Create hors-ligne peint l'overlay avec id (randomId) + client_key (crypto.randomUUID) (34-02) | ✓ VERIFIED | `useResource.ts` prepareCreate ; test « id ET clientKey présents et distincts » vert |
| 7 | Coche/décoche = UNE écriture (D-04) ; create puis delete = zéro écriture (D-05) (34-02) | ✓ VERIFIED | `outbox.ts` `enqueueOutbox` fusion + annulation ; **renforcé par CR-02** (fusion update-dans-create) ; tests dédiés verts |
| 8 | Écriture hors liste refusée AVANT tout départ réseau (34-02 / WRQ-03) | ✓ VERIFIED | `assertWriteAllowed` dans `useResource.ts` + en tête de `supabase-adapter.ts` create/update/remove/removeWhere ; tests verts |
| 9 | Un refus RLS/validation n'est JAMAIS enfilé — seul réseau/5xx part en file (34-02) | ✓ VERIFIED | `isNetworkFailure` déroule la cause DataError ; test 42501 → pas d'entrée, vert |
| 10 | Après reload, la file est restaurée et jamais élaguée par pruneExpiredFamilies (34-02) | ✓ VERIFIED | `query-persistence.ts` cas outbox avant familyOf, exempt de prune ; **renforcé par CR-01** (query outbox inrefetchable) ; tests verts |
| 11 | Rejeu FIFO creates-d'abord, upsert onConflict, une seule fois (34-03) | ✓ VERIFIED | `outbox-replay.ts` (`onConflict 'household_id,client_key'` / `'client_key'`) ; test « exactement une fois » + anti-parallélisme — verts |
| 12 | Refus terminal → 'failed', jamais re-enfilé, jamais de boucle (34-03 / WRQ-04) | ✓ VERIFIED | `classifyFailure` branché ; test non-boucle — vert |
| 13 | Échec réseau/5xx au rejeu → reste pending (34-03) | ✓ VERIFIED | Test TypeError réseau — vert |
| 14 | Après rejeu réussi : entrée quitte la file ET table invalidée, serveur prime (34-03 / WRQ-06) | ✓ VERIFIED (moitié client) | `invalidateQueries([table])` + identité id+client_key portée par l'overlay — testés ; **primauté du canal Realtime réel → human item 1** |
| 15 | Badge « N en attente » visible tant que N > 0, retombe à zéro (34-04) | ✓ VERIFIED (logique) | `use-outbox.ts` — **queryFn CR-01 rend désormais l'état réel de la file** (jamais `[]` écrasant), staleTime/refetch* falsifiés ; tests verts ; rendu visuel → human item 2 |
| 16 | failedCount > 0 → « N bloquées » cliquable vers le panneau (34-04) | ✓ VERIFIED (logique) | banner-slot `outbox-pending` → `OutboxBanner` ; test cliquable — vert |
| 17 | Toast discret UNE fois par passe d'échec terminal, jamais pour un retard réseau (34-04) | ✓ VERIFIED (logique) | Tests antirebond/toast-pending — verts ; discrétion perçue → human item 2 |
| 18 | Panneau offline liste les écritures avec Réessayer et Abandonner (confirm-dialog) (34-04) | ✓ VERIFIED | `offline-panel.tsx` ; tests composant verts ; aucune `values` rendue |
| 19 | Gate use-outbox-gate expose { isEmpty } dérivé de la vraie file, aucun composant phase 32 modifié (34-04) | ✓ VERIFIED | `use-outbox-gate.ts` ; signature préservée |
| 20 | Déconnexion avec pendantes → avertissement bloquant avant purge ; changement de foyer → purge (34-04 / D-17) | ✓ VERIFIED | `session-store.ts` `OutboxPendingError` scan avant stopPersisting ; **renforcé par WR-01** (`assertSignOutAllowed` avant révocation du jeton dans use-auth.signOut) ; tests verts |
| 21 | **[G-34-1, classe]** TOUT appel adaptateur brut sur table hors liste, hors ligne, refusé AVANT tout réseau avec message français (34-05 Task 1) | ✓ VERIFIED | `write-policy.ts` module feuille (WRITE_ALLOWLIST 5 tables) ; gardes en première instruction des 4 voies de `supabase-adapter.ts` ; ré-export unique `query-policy.ts` ; tests verts (fake supabase jamais appelé hors ligne) |
| 22 | **[G-34-1, instance]** Écritures d'articles Courses via la couche mutation Tier 1 : client_key, overlay, meta D-02 ; produit inconnu hors-ligne refusé AVANT toute écriture d'article ; re-scan connu enfile l'écriture (34-05 Task 2) | ✓ VERIFIED | 11 sites `itemResource` dans `use-courses.ts` ; `products-api.ts` : ItemMutators + `assertWriteAllowed(PRODUCTS_TABLE)` avant toute écriture ; grep `data.(create\|update\|remove)(SHOPPING_ITEMS_TABLE` hors useResource → 1 seul hit (`courses/api.ts:208`, deleteShoppingItem, voie brute documentée) ; product-sheet passe par `productsApi.resolveScannedProduct` ; **WR-03 : les commentaires « lecture Dexie pure sans réseau » corrigés dans les 3 copies (use-courses, findProductByEan, resolveScannedProduct)** |
| 23 | **[G-34-1, régression]** Créer un article Courses hors-ligne n'émet AUCUN fetch, enfile l'outbox, le rejeu réconcilie sans doublon ; en ligne, comportement Courses inchangé (34-05 Task 3) | ✓ VERIFIED | `courses-offline-writes.test.tsx` 6 scénarios verts ; **WR-04** : `deleteShoppingList` supprime la liste D'ABORD (refus D-07 hors ligne précède tout enfilage d'articles, `delete-shopping-list.test.ts` rouge sur l'état pré-fixe) ; suite complète **234 fichiers, 1874/1874 verts** |

**Score:** 23/23 truths verified (3 items comportent une composante behavior-dependent portée à la vérification humaine — code présent, câblé et testé côté client)

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `supabase/migrations/0177/0178/0179` + tests SQL | client_key, backfill, unicité, alimentation serveur | ✓ VERIFIED | validés en passe initiale (Docker, 104/104) ; `git diff` : zéro fichier supabase/ modifié depuis |
| `app/src/lib/offline/outbox.ts` / `outbox-replay.ts` | file + rejeu | ✓ VERIFIED | substantifs, câblés, testés ; CR-02 fusion update-dans-create commentée |
| `app/src/hooks/use-outbox.ts` | badge dérivé de la vraie file | ✓ VERIFIED | CR-01 : queryFn rend `getQueryData(key) ?? []`, staleTime Infinity, refetch* false — la file survit à l'invalidation globale et au reconnect |
| `app/src/lib/data/write-policy.ts` | module feuille, SOURCE UNIQUE de l'allowlist | ✓ VERIFIED | 5 tables, `assertWriteAllowed` lève DataError, sans cycle |
| `app/src/lib/data/supabase-adapter.ts` | garde frontière sur 4 voies | ✓ VERIFIED | `assertWriteAllowed(table)` en première instruction |
| `app/src/lib/data/useResource.ts` | overlay + file symétriques create/update | ✓ VERIFIED | WR-02 : l'overlay d'un update survit à l'échec réseau (symétrie create), seul un refus métier remet l'écran en l'état |
| `app/src/hooks/use-auth.ts` + `app/src/stores/session-store.ts` | déconnexion scan-avertir-purger | ✓ VERIFIED | WR-01 : `assertSignOutAllowed` avant `supabase.auth.signOut()` — annuler la dialog laisse un jeton valide ; ceinture session-store conservée pour les autres chemins |
| `app/src/modules/courses/api.ts` | suppression liste = liste d'abord, articles ensuite | ✓ VERIFIED | WR-04 : `data.remove(SHOPPING_LISTS_TABLE)` précède `Promise.all(removeItem)` ; test dédié |
| `app/src/modules/courses/hooks/use-courses.ts` | routage itemResource complet | ✓ VERIFIED | 11 sites itemResource ; commentaires WR-03 corrigés |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| write-policy.ts | query-policy + supabase-adapter + useResource | UNE liste, trois consommateurs | ✓ WIRED | ré-export, import adaptateur, garde mutation + adaptateur |
| adapter.upsert (rejeu) | Contrainte 0177 | onConflict 'household_id,client_key' | ✓ WIRED | `outbox-replay.ts` ↔ 0177 |
| Clé outbox | shouldDehydrateQuery / pruneExpiredFamilies / useOutbox | cas particulier + exemption + queryFn CR-01 | ✓ WIRED | même `OUTBOX_KEY + [userId, householdId]` des deux côtés |
| OutboxReplayWatcher / BadgeWatcher | router.tsx | montage hors Routes | ✓ WIRED | inchangé |
| useOutbox | gate 32-D10 / badge / panneau | source unique D-03 | ✓ WIRED | inchangé |
| use-auth.signOut | assertSignOutAllowed (session-store) | scan avant révocation du jeton | ✓ WIRED | WR-01, importé et appelé en tête de signOut |
| resolveScannedProduct | mutateurs itemResource injectés | ItemMutators | ✓ WIRED | product-sheet en props ; commentaires D-06 corrigés (WR-03) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| use-outbox (CR-01) | entries | queryClient.getQueryData sur la vraie file persistée | Oui | ✓ FLOWING |
| useResource update (WR-02) | rows | useResource → SupabaseAdapter | Oui | ✓ FLOWING |
| courses-offline-writes.test.tsx | outbox entries | client.getQueryData(['outbox']) | Oui | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Typecheck (chaîne §2.7) | `cd app && npm run typecheck` | 0 erreur | ✓ PASS |
| Suite complète app (chaîne §2.7) | `cd app && npm test` | **234 fichiers, 1874/1874 verts, 0 échec** (légère croissance vs 1865 : tests des fixes CR-01/CR-02/WR-01/WR-02/WR-04 ajoutés) | ✓ PASS |
| Build (chaîne §2.7) | `cd app && npm run build` | dist généré, 150 entrées precache, sw.js produit | ✓ PASS |
| Contrôle statique SQL | `python3 scripts/check-sql-statique.py` | 230 fonctions / 179 migrations / 106 tests, aucun défaut | ✓ PASS |
| Dette non référencée | grep TBD/FIXME/XXX sur fichiers phase (y compris fichiers des fixes) | vide | ✓ PASS |
| Zéro data.* brut d'article hors useResource | grep SHOPPING_ITEMS_TABLE sur app/src/modules/courses | 1 hit : `courses/api.ts:208` (deleteShoppingItem, voie brute documentée, couverte par la garde adaptateur hors ligne) | ✓ PASS (écart documenté) |
| Suite SQL test-db.sh | `sh scripts/test-db.sh` | **NON EXÉCUTÉE — Docker indisponible sur cette machine**, comme explicitement prévu par AGENTS.md §2.7. Exécutée verte (104/104) lors de la passe initiale ; `git diff` confirme qu'aucun fichier supabase/ n'a été modifié depuis, l'état SQL validé demeure | ⚠️ UNEXECUTED (Docker indisponible, non applicable : zéro changement SQL) |

### Probe Execution

Aucun probe déclarée dans les plans (aucun scripts/*/tests/probe-*.sh pour cette phase). SKIPPED.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| WRQ-01 | 34-01 | Migration idempotence client_key + tests SQL négatifs | ✓ SATISFIED | 0177/0178/0179 + suite SQL verte (passe initiale, SQL inchangé) |
| WRQ-02 | 34-02 + 34-03 + 34-05 | Enfilage local + rejeu automatique foreground — y compris le chemin Courses | ✓ SATISFIED | MutationCache + replayOutbox + routage itemResource ; CR-01/CR-02 durcissent la file |
| WRQ-03 | 34-02 + 34-05 | Liste blanche, refus upfront prouvé | ✓ SATISFIED | WRITE_ALLOWLIST + double couche (mutation + adaptateur) ; WR-04 aligne l'ordre de suppression |
| WRQ-04 | 34-03 | Terminal vs retryable, jamais de boucle | ✓ SATISFIED | classifyFailure + test non-boucle |
| WRQ-05 | 34-04 | Badge N en attente + liste consultable, retombe à zéro | ✓ SATISFIED | use-outbox (queryFn CR-01) + badge + panneau ; rendu visuel en UAT |
| WRQ-06 | 34-03 + 34-05 | Réconciliation Realtime par clé client | ✓ SATISFIED (client) | identité + invalidation + scénario (f) testés ; primauté du canal réel en UAT |

Aucun ID orphelin : les 6 IDs WRQ sont couverts par les plans 01-05 et tous marqués Complete dans REQUIREMENTS.md.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| — | — | Aucun debt marker (TBD/FIXME/XXX), aucun stub, aucun return vide détecté dans les fichiers de la phase et des fixes | — | — |

Écart documenté (non anti-pattern) : voies brutes `createShoppingItem`/`deleteShoppingItem` conservées pour recettes/voyages, entourées d'un bloc commentaire « NE PAS EN AJOUTER » — la garde adaptateur les couvre de toute façon hors-ligne.

### Human Verification Required

Voir les 3 items dans `behavior_unverified_items` / `human_verification` (frontmatter) : (1) primauté Realtime réelle (D-16/WRQ-06, test UAT 1), (2) rendu visuel badge/toast (D-11/D-12/D-13), (3) parcours e2e de bout en bout sur appareil réel. Suivis dans `34-UAT.md` (3 tests en attente).

### Gaps Summary

Aucun gap. La re-vérification porte sur le delta de la passe de correction code-review (7 commits de fix + 2 commits doc/test) ; les 7 fixes ont été vérifiés dans le code courant, un par un :

- **CR-01 (db32ce7)** — la query outbox de `use-outbox.ts` ne peut plus détruire la file : queryFn rend l'état actuel (`getQueryData(key) ?? []`), `staleTime: Infinity`, `refetchOnReconnect/WindowFocus: false`, `retry: false`. Correcte : les deux ceintures sont indépendantes et l'invalideur le plus agressif (invalidateQueries sans filtre) ne peut plus rien écraser.
- **CR-02 (6eaf9a2)** — `enqueueOutbox` : un update arrivant sur un create pendante fusionne les valeurs DANS le create (client_key conservé) au lieu de le remplacer. Correcte : évite un update rejoué sur une ligne inexistante (PGRST116, échec terminal) et maintient l'invariant « une écriture finale par entité ».
- **WR-01 (4add203)** — `use-auth.signOut` appelle `assertSignOutAllowed` (nouvel export session-store) AVANT `supabase.auth.signOut()` : annuler la dialog laisse un jeton valide. Correcte ; le scan dans session-store reste en ceinture pour les chemins qui n'ont pas scanné, idempotent.
- **WR-02 (2233e84 + 10f3552)** — dans `useResource.update`, l'overlay n'est restauré que si l'erreur n'est PAS réseau (`!isNetworkFailure(error)`) : symétrie avec create, l'écran reflète une écriture qui s'appliquera au rejeu. Correcte ; types du mock corrigés dans useResource.test.ts.
- **WR-03 (57631fc)** — commentaires « lecture Dexie pure, aucun appel réseau » obsolètes depuis D-10 corrigés dans les 3 copies (use-courses.addScannedToList, products-api.findProductByEan, products-api.resolveScannedProduct). §2.7 I : affirmation documentale désormais vraie.
- **WR-04 (f6446d4)** — `deleteShoppingList` supprime la liste D'ABORD puis les articles : hors ligne, le refus D-07 précède tout enfilage, plus de liste fantome vide. Test dédié rouge sur l'état pré-fixe.

**Chaîne §2.7 sur le checkout courant :** typecheck 0 erreur, `npm test` **234 fichiers / 1874 tests verts (0 échec)**, build OK (sw.js produit), contrôle statique SQL vert. **`test-db.sh` NON EXÉCUTÉ (Docker indisponible)** — explicitement toléré par §2.7 ; aucun fichier supabase/ n'a été modifié depuis sa dernière exécution verte, l'état SQL validé en passe initiale demeure.

Les 23 must-haves des plans 01-05 restent couverts par la suite complète verte. Les 3 composantes comportementales (primauté Realtime réelle, rendu visuel badge/toast, parcours appareil) restent à confirmer par l'humain — d'où `human_needed`, pas `gaps_found`.

---

_Verified: 2026-11-06T08:10:00Z_
_Verifier: the agent (gsd-verifier)_
