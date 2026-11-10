---
phase: 38-filet-de-tests-fiable
plan: 03
subsystem: ardoise
tags: [securite, minimisation, edge-function, dette-review]
requires: [37-REVIEW-FIX (IN-01, IN-02)]
provides: [buildGuestView sans lecture de table entière, balayage I-01 consigné]
affects: []
tech-stack:
  added: []
  patterns: [bornage dans la requête PostgREST (.in/.eq), ordre déterministe]
key-files:
  created: []
  modified:
    - app/src/modules/ardoise/api.ts
    - supabase/functions/ardoise-invite/index.ts
key-decisions:
  - "Bornage IN-02 par expense_id (.in) car expense_participants n'a pas de household_id (migration 0004) — la borne est le besoin réel du consommateur, pas une limite arbitraire"
  - "expenseIds en tableau (pour .in) + Set dédié (expenseIdSet) pour le test d'appartenance existant — aucun filtrage JS ajouté"
  - "Aucune migration, aucun SQL touché → test-db.sh non requis (I-03), absence consignée"
requirements-completed: [DEBT-01]
actuals:
  tokens: 18000
  tasks: 3
  commits: 2
duration: ~25 min
completed: 2026-11-08
status: complete
coverage:
  - deliverable: IN-01 garde morte supprimée (api.ts)
    verification:
      - kind: grep
        ref: "grep -rn 'typeof response.status' app/src → aucune occurrence (exit 1)"
        status: pass
      - kind: test
        ref: "npx vitest run src/modules/ardoise → 12 fichiers, 81 tests verts"
        status: pass
    human_judgment: false
  - deliverable: IN-02 lectures bornées dans buildGuestView
    verification:
      - kind: grep
        ref: "grep -c \".in('expense_id', expenseIds)\" = 1 ; grep -c \".eq('household_id', householdId)\" = 3"
        status: pass
      - kind: e2e
        ref: "npm run test:e2e → 165 passed, 9 skipped, 2 failed = spec join-token connue (J-02, phase 39)"
        status: pass
      - kind: typecheck
        ref: "cd app && npm run typecheck → vert"
        status: pass
    human_judgment: false
  - deliverable: Balayage I-01 fichier entier (classe, pas l'instance)
    verification:
      - kind: sweep
        ref: "awk accumulateur d'énoncés sur index.ts — 3 hits tous faux positifs (2× Array.from non-SQL, 1× insert().select().single()) ; balayage ligne par ligne des 16 lectures .from() consigné ci-dessous, toutes bornées"
        status: pass
    human_judgment: false
---

# Phase 38 Plan 03: Filet de tests fiable — soldage DEBT-01 Summary

**One-liner:** Garde morte IN-01 supprimée du client ardoise et lectures service_role de buildGuestView bornées dans la requête PostgREST (`.in('expense_id')` + `.eq('household_id').order('id')`), balayage classe entière I-01 consigné — minimisation §2.6 sur l'endpoint public, sans toucher une ligne de SQL.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Supprimer la garde morte IN-01 | 12fa95a | app/src/modules/ardoise/api.ts |
| 2 | Borner buildGuestView (IN-02, T-38-01) | aacb209 | supabase/functions/ardoise-invite/index.ts |
| 3 | Balayage I-01 du fichier entier | — (aucune modification nécessaire, voir ci-dessous) | supabase/functions/ardoise-invite/index.ts |

## Ce qui a été fait

### Task 1 — IN-01 (commit 12fa95a)
`throw new InviteRequestError(typeof response.status === 'number' ? response.status : 0, …)` devient `throw new InviteRequestError(response.status, …)`. Supprimée, pas commentée (D-01). Vérifié : `grep -rn "typeof response.status" app/src` ne retourne RIEN (exit 1) ; typecheck vert ; les 81 tests du module ardoise (dont les 11 chemins d'erreur guest-ardoise-page) restent verts avec le même statut.

### Task 2 — IN-02 (commit aacb209)
Réordonnancement dans buildGuestView : `expenses` lue d'abord (requête l.648-653 INCHANGÉE : `.eq('ardoise_id', …).order('expense_date', desc).order('created_at', desc)`), `const expenseIds = …map((e) => e.id)`, puis Promise.all sur trois lectures bornées :
- `expense_participants` → `.in('expense_id', expenseIds)` (la table n'a PAS de household_id — migration 0004 ; la borne est le besoin réel du consommateur : la vue invité ne rend que les participants des dépenses de cette ardoise)
- `household_members` → `.eq('household_id', householdId).order('id', { ascending: true })` (borne foyer + ordre déterministe I-02)
- `ardoise_guests` → `.eq('ardoise_id', ardoiseId)` (déjà bornée, inchangée)

Le bornage est DANS la requête PostgREST, jamais un filtrage JS après lecture complète. Le Set existant d'appartenance devient `expenseIdSet` (construit depuis le tableau) — aucun filtrage JS ajouté, le `if (!expenseIdSet.has(…)) continue;` préexistant est conservé tel quel (défense en profondeur, il ne compense rien : la requête ne retourne déjà que des participants de cette ardoise). Un `householdId` non résolu (`null`) rend `household_members` vide — échec fermé, cohérent avec le commentaire l.643.

### Task 3 — Balayage I-01 (aucun commit : rien à modifier)
Balayage du fichier ENTIER (851 lignes). Commande awk à accumulateur d'énoncés (la borne sur une ligne suivante compte) : 3 hits, tous des faux positifs :
- l.214, l.231 : `Array.from(new Uint8Array(…))` — conversion d'octets, pas une lecture SQL ;
- l.575 : `.insert({…}).select('id,display_name').single()` — écriture dont la lecture est bornée par `.single()` sur la ligne insérée.

Balayage ligne par ligne des 16 lectures `.from()` réelles :

| Ligne | Table | Borne | Déterminisme |
| ----- | ----- | ----- | ------------ |
| 330 | household_members | `.eq household_id` + `.eq user_id` + limit 1 | — |
| 344 | ardoises | `.eq id` + maybeSingle | — |
| 373 | household_members | `.eq user_id` + limit 50 | `.order created_at` asc |
| 474 | ardoises | `.eq invite_hash` + maybeSingle | — |
| 480 | household_members | `.eq household_id` + `.eq user_id` + maybeSingle | — |
| 528 | ardoises | `.eq id` + single | — |
| 536 | household_members | `.eq household_id` + `.eq user_id` + limit 1 | — |
| 550 | ardoise_members | `.eq ardoise_id` + `.eq member_id` + limit 1 | — |
| 560 | ardoise_guests | `.eq ardoise_id` + ilike + limit 1 | — |
| 575 | ardoise_guests | INSERT + `.single()` (écriture) | — |
| 634 | ardoises | `.eq id` + single | — |
| 657 | expenses | `.eq ardoise_id` | 2 × `.order` |
| 666 | expense_participants | `.in expense_id` (NEW, ce plan) | — |
| 670 | household_members | `.eq household_id` (NEW, ce plan) | `.order id` asc |
| 674 | ardoise_guests | `.eq ardoise_id` | — |
| 798 | ardoises | `.eq invite_hash` + single | — |

Aucune lecture de table entière ne subsiste : l'hypothèse A2 est prouvée. Les lectures énumérantes portent toutes un `.order` déterministe ou un `.limit`. Le seul `.rpc('ardoise_settlement', …)` (l.726) porte ses arguments en paramètres — pas un `.from()`.

## I-03 — SQL non touché (consigné, pas escamoté)

Aucune migration, aucun SQL modifié dans ce plan (forme TypeScript-only). Par I-03, `sh scripts/test-db.sh` n'est PAS requis et n'a pas été exécuté — son absence est une application de la règle, pas un silence. Les contrôles SQL statiques ont néanmoins tourné (§2.7) : `check-sql-statique.py` → 230 fonctions effectives sur 179 migrations et 106 tests, aucun défaut ; `test-check-sql-statique.py` → 6 cas, tous verts.

## Verification (chaîne §2.7)

- `cd app && npm run typecheck` → vert ✓
- `cd app && npm test` → 244 fichiers, 1988 tests verts ✓
- `cd app && npm run build` → vert ✓
- `cd app && npm run test:e2e` → 165 passed, 9 skipped, 2 failed — les 2 échecs sont la spec join-token TEST-02, rouge documenté (38-CONTEXT J-02), soldée en phase 39, hors périmètre ✓
- `grep -rn "typeof response.status" app/src` → rien ✓
- `python3 scripts/check-sql-statique.py && python3 scripts/test-check-sql-statique.py` → verts ✓
- `sh scripts/test-db.sh` → non requis (aucun SQL touché, I-03) ✓

## Threat Model

| Threat | Disposition | Mitigation livrée |
| ------ | ----------- | ----------------- |
| T-38-01 (Information Disclosure, high) | mitigate | Les deux lectures service_role de buildGuestView sont bornées dans la requête PostgREST (`.in('expense_id', expenseIds)` / `.eq('household_id', householdId).order('id')`) — jamais de filtrage JS après lecture complète. Balayage fichier entier : aucune autre lecture non bornée (tableau ci-dessus). |
| T-38-SC (Tampering, installs) | mitigate | Aucun paquet installé par ce plan — audit non applicable. |

## Deviations from Plan

Aucune. Le plan a été exécuté tel qu'écrit ; la seule note est que le Task 3 n'a produit aucun commit parce que le balayage n'a découvert aucune lecture à borner (la preuve A2 est le livrable, pas un diff).

## Self-Check: PASSED

- `app/src/modules/ardoise/api.ts` et `supabase/functions/ardoise-invite/index.ts` existent sur disque, modifiés ✓
- Commits 12fa95a et aacb209 présents dans l'historique ✓
- Tous les critères d'acceptation des 3 tâches ré-exécutés et verts (détail ci-dessus) ✓
