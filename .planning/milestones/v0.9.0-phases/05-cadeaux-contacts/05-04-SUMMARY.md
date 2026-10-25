---
phase: 05-cadeaux-contacts
plan: 04
subsystem: frontend-cadeaux
tags: [tabs, gift-ideas, promotion, gift-invites, surprise-ux, feb29-clamp]
requires:
  - phase: 05-01
    provides: [gift_ideas-table, contact-lists-table, surprise-rls]
  - phase: 05-02
    provides: [idea-gifted-propagation, gift-list-invite-rpcs]
  - phase: 05-03
    provides: [gift-list-invite-edge, gift-invite-client-api]
provides:
  - cadeaux-tabs-idees
  - gift-idea-crud-ui
  - gift-idea-promotion-ui
  - gift-code-share-panel
affects: [05-05-contacts-e2e]
actuals:
  tokens: 52000
  tasks: 3
  commits: 3
plan_head_before: 89b761411f26e38daef0618338681d1153df4376
plan_head_after: 2d8e28d
tech-stack:
  added: []
  patterns: [radix-tabs-shell, insert-then-reread, surprise-echo-fallback, code-shown-once-in-memory]
key-files:
  created:
    - app/src/modules/cadeaux/components/gift-idea-form-dialog.tsx
  modified:
    - app/src/modules/cadeaux/cadeaux-page.tsx
    - app/src/modules/cadeaux/api.ts
    - app/src/modules/cadeaux/hooks/use-cadeaux.ts
    - app/src/modules/cadeaux/types.ts
    - app/src/modules/cadeaux/components/gift-share-dialog.tsx
    - app/src/modules/cadeaux/cadeaux-page.test.tsx
    - app/src/types/database.ts
    - app/src/lib/data/seed.ts
key-decisions:
  - "Contacts tab = coquille (compteurs + lien /contacts) : le CRUD contacts de 05-05 n'est ni dupliqué ni touché"  - "Code brut en mémoire seule (pas de localStorage comme l'ardoise) : affiché une fois, masqué à la fermeture — exigé par le test 4"
  - "nextAnniversary délègue à nextBirthdayDate (helper clamp partagé, lecture seule) : le trou 29-février local est fermé, rien n'est dupliqué"
  - "Relecture vide après création d'idée = surprise auto-visée : écho des valeurs insérées plutôt qu'une erreur (la RLS masque aussitôt au créateur)"
requirements-completed: [D-05, D-06, D-07, D-08, D-18]
coverage:
  - id: D1
    description: "L'onglet Idées liste, crée et édite des idées avec Pour qui/prix/statut/nextOccasion"
    requirement: "D-05"
    verification:
      - kind: automated
        ref: "npm test -- cadeaux (6/6) + typecheck vert"
        status: pass
      - kind: manual
        ref: "Parcours idée→édition→suppression confirmée sur stack locale"
        status: pending
    human_judgment: true
  - id: D2
    description: "Le bouton 'ajouter à une liste' crée un gift_item lié ; passer l'idée 'offert' marque l'item"
    requirement: "D-06"
    verification:
      - kind: automated
        ref: "cadeaux-page.test.tsx#promouvoir (item vérifié avec idea_id en couche données) ; trigger serveur prouvé 0025 (plan 05-02)"
        status: pass
      - kind: manual
        ref: "Vérifier en UAT que 'Marquer offert' reflète l'achat propagé après relecture"
        status: pending
    human_judgment: true
  - id: D3
    description: "Une idée pour Maya n'apparaît pas dans la session de Maya (serveur + repli UX)"
    requirement: "D-08"
    verification:
      - kind: automated
        ref: "cadeaux-page.test.tsx#masque (repli UX) + test serveur 0024 (barrière, plan 05-01)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Le panneau partage offre Copier/Partager/Régénérer/Arrêter avec QR, identique à l'ardoise"
    requirement: "D-18"
    verification:
      - kind: automated
        ref: "cadeaux-page.test.tsx#panneau (Générer→Régénérer, masquage après fermeture) ; Edge live prouvée plan 05-03"
        status: pass
      - kind: manual
        ref: "Échange create→QR→redeem avec JWT réel en UAT (reporté plan 05-03)"
        status: pending
    human_judgment: true
  - id: D5
    description: "nextOccasion gère le 29 février sans le faire disparaître (helper clamp partagé)"
    requirement: "D-07"
    verification:
      - kind: automated
        ref: "cadeaux-page.test.tsx#29-février (miroir 0006 : clamp 28/02, 29/02 bissextile conservé)"
        status: pass
    human_judgment: false
duration: ~12 min
completed: 2026-10-05
status: complete
---

# Phase 05 Plan 04 : Tabs cadeaux + idées + partage UI Summary

**Onglets Cadeaux (Listes/Idées/Contacts) avec CRUD idées, promotion liée vers articles, panneau partage par code avec QR, et filtre surprise UX-only — full suite 491/491 verte.**
**Status:** complete

## Performance

- **Duration:** ~12 min
- **Started:** 2026-10-05T19:24:57Z
- **Completed:** 2026-10-05
- **Tasks:** 3 (toutes `auto`, dont 1 `tdd`)
- **Files modified:** 9 (1 créée, 8 modifiés dont seed + types DB)

## Accomplishments

- **Task 1 — Tabs + CRUD idées + nextOccasion :** `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` de `primitives.ui` (triggers `min-h-11`, ≥ 44px), contenu Listes existant inchangé ; onglet Idées (cartes Pour qui/prix/statut/nextOccasion, bascule offert, suppression confirmée, états vides avec CTA) ; onglet Contacts en coquille (compteurs + lien `/contacts`, zéro duplication du module 05-05). Snapshot étendu `gift_ideas`/`contact_lists`/`contacts`, filtre surprise UX-only documenté (barrière = `can_read_gift_idea`, test 0024). Photos idées via `depositHouseholdFile` dossier `cadeaux` + compensation `removeHouseholdFile` (T-05-09).
- **Task 2 — Promotion + panneau code :** bouton « Ajouter à une liste » avec dialogue de destination → `promoteIdeaToItem` (article porte `idea_id` ; l'UI relit après mutation pour refléter la propagation serveur D-06). `GiftCodePanel` dans `GiftShareDialog` (sans réécriture du form membres/email) : Générer/Régénérer/Copier/Partager (`navigator.share` + repli presse-papiers)/Arrêter + QR via `qr-code.tsx` partagé + mention code-créé-ailleurs, sur `callGiftInvite` du plan 05-03 (aucune duplication).
- **Task 3 — Vitest (4 comportements) :** masquage idée-pour-soi, promotion vérifiée en couche données (`idea_id`), clamp 29-février (miroir 0006) + cas sans-contact, panneau Générer→Régénérer + masquage après fermeture (mocks `vi.mock('./api')` + `importOriginal`).
- **Preuves :** `npm run typecheck` vert, suite cadeaux 6/6, **full suite 72 fichiers / 491 tests verts** (le cas calendrier pré-existant signalé en 05-03 ne se reproduit plus).

## Task Commits

Each task was committed atomically on `worktree-agent-p04-1791227951` :

1. **Task 1 : onglets + CRUD idées + nextOccasion clamp** - `30cb62a` (feat, 7 fichiers)
2. **Task 2 : promotion liée + panneau partage par code** - `f32bb58` (feat, 3 fichiers)
3. **Task 3 : Vitest masquage/promotion/29-février/partage-code** - `2d8e28d` (test, 1 fichier)

**Plan metadata:** skipped_gitignored — `.planning/` est gitignoré (`.gitignore:58`), le commit du SUMMARY a été refusé sans `git add -f` (interdit) ; le fichier est écrit sur disque pour l'orchestrateur.

## Files Created/Modified

- `app/src/modules/cadeaux/cadeaux-page.tsx` - Tabs Listes/Idées/Contacts, CRUD idées, promotion, suppressions confirmées
- `app/src/modules/cadeaux/components/gift-idea-form-dialog.tsx` - formulaire idée RHF+Zod (littéraux `a_offrir`/`offert` à l'octet près, OQ-3)
- `app/src/modules/cadeaux/components/gift-share-dialog.tsx` - `GiftCodePanel` (D-15/D-18, OQ-1 OPTION A rappelée)
- `app/src/modules/cadeaux/api.ts` - snapshot étendu, CRUD idées (insert-puis-relecture + écho surprise), `promoteIdeaToItem`
- `app/src/modules/cadeaux/hooks/use-cadeaux.ts` - idées + contacts + 4 mutations (filtre surprise documenté UX-only)
- `app/src/modules/cadeaux/types.ts` - `GiftIdea`, `toGiftIdea`, `nextIdeaOccasion`, `nextAnniversary`→clamp, `ideaId` sur item/input
- `app/src/modules/cadeaux/cadeaux-page.test.tsx` - 2 tests existants + 4 comportements (6/6)
- `app/src/types/database.ts` - `GiftItemRow.idea_id` (colonne 0076 manquante au type)
- `app/src/lib/data/seed.ts` - `demoGiftIdeas` (dont idée-pour-Camille pour le masquage) + `idea_id: null` sur items

## Decisions Made

- **Contacts tab = coquille :** compteurs + lien vers `/contacts`. Le CRUD contacts appartient à 05-05 : ni duplication ni retouche.
- **Code brut en mémoire seule :** contrairement à l'ardoise (localStorage), fermer le dialogue efface le code — « affiché une fois » + test 4 l'exigent ; le résumé couvre le cas « créé ailleurs ».
- **Clamp partagé, pas dupliqué :** `nextAnniversary` délègue à `nextBirthdayDate` (anniversaires/types, lecture seule) avec garde ISO → `null` si inexploitable. Le trou 29-février est fermé dans le module aussi (D-11).
- **Écho surprise à la création :** relecture vide = idée auto-visée masquée aussitôt par la RLS → on renvoie les valeurs insérées, pas une erreur.
- **Attribution :** `promoteIdeaToItem`/`usePromoteGiftIdea` écrits pendant la passe API de la tâche 1, câblés UI en tâche 2 (même `api.ts`, commits séparés ci-dessus).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] `GiftItemRow.idea_id` absent du type alors que la colonne existe (0076)**
- **Found during:** Task 1 (la promotion exige le champ, la migration l'a créé)
- **Issue:** `database.ts` ignorait `idea_id` (text nullable, ON DELETE SET NULL) — tout article promu aurait été mal typé
- **Fix:** champ `idea_id: string | null` + `idea_id: null` sur les 3 seed items
- **Files modified:** `app/src/types/database.ts`, `app/src/lib/data/seed.ts`
- **Commit:** 30cb62a

**2. [Rule 1 - Bug] Chemin de mock `../api` au lieu de `./api` dans le test**
- **Found during:** Task 3 (test 4 échouait : panneau « indisponible », mocks jamais appliqués)
- **Issue:** le test est voisin de `api.ts`, pas en dessous — `vi.mock` ciblait un module inexistant
- **Fix:** `./api` + signatures `(_listId: string)` sur les mocks (3 erreurs TS)
- **Files modified:** `app/src/modules/cadeaux/cadeaux-page.test.tsx`
- **Commit:** 2d8e28d (amendé avant commit : vert typecheck + 6/6 au moment du commit)

**3. [Rule 3 - Blocking] `npm ci` inutile mais vérifié / HOOKS**
- **Found during:** Task 1 (worktree sans certitude sur `node_modules`)
- **Issue:** aucune — `node_modules` présent, aucun nouveau paquet (exclusion Rule 3 respectée : `qrcode`, Radix Tabs déjà en dépendances)
- **Fix:** rien à installer ; vérification seule

---

**Total deviations:** 2 auto-fixed (missing + bug), 1 non-issue vérifiée

## Issues Encountered

- **Boutons existants < 44px conservés :** `cardAction` (31px) et `shareButtonBase` (33px) de l'onglet Listes sont sous le seuil, mais les retoucher serait hors périmètre (visuel existant + tests) — seules les zones tactiles **nouvelles** (triggers, actions idées) sont ≥ 44px. Signalé, non corrigé ici.
- **Échange Edge authentifié non rejouable :** comme en 05-03, create/redeem/revoke réels exigent JWT + foyer — couverts par mocks en UI, reportés en UAT manuelle (cases D2/D4 `pending`).
- **Ancienne photo d'idée orpheline en édition :** seule l'URL est stockée (pas le chemin bucket) — le remplacement ne peut pas nettoyer l'ancien objet, comme pour les articles existants. Documenté, non bloquant.

## Threat Flags

Aucune surface nouvelle hors plan : le panneau code réutilise `callGiftInvite` (05-03, user-only, fail-closed) sans nouvelle route ; les photos idées passent par le bucket privé `household-media` avec compensation d'orphelin (T-05-09) ; le filtre surprise client est marqué UX-only en commentaire + hook, barrière serveur inchangée (T-05-08, test 0024). Section STRIDE du plan couverte sans ajout.

## Known Stubs

Aucun. (`fetchGiftListInviteSummary` → `null` hors Supabase = repli configuré hérité de 05-03, pas un stub ; panneau « indisponible dans ce mode » affiché explicitement.)

## Self-Check

**PASSED** — fichiers créés/modifiés présents sur disque, commits `30cb62a`/`f32bb58`/`2d8e28d` présents sur `worktree-agent-p04-1791227951`, typecheck vert, cadeaux 6/6, full 491/491, SUMMARY écrit (commit refusé : `.planning/` gitignoré — `skipped_gitignored` explicite, aucun `git add -f`).

---
*Phase: 05-cadeaux-contacts*
*Completed: 2026-10-05*
