---
phase: 25-profils-enfants-g-r-s-par-le-parent
plan: 05
subsystem: parametres, cercle, household-store, e2e
tags: [enfants-gérés, rls-surface, rpc-0146-0148, modération, tdd, playwright]
requires:
  - 25-04 (fichier typé HouseholdMemberRow 0144 + ses test store)
  - 0145/0146/0148 (RPC enfant côté base, planted en 25-02)
  - useIsAdult (livré par ce plan, T1)
provides:
  - useIsAdult + filtre vivantes unique du store (D-01/D-04)
  - Wrappers RPC enfant dans parametres/api.ts (0146/0148)
  - use-child-profiles hook + childAgeLabel (D-05)
  - CRUD enfant dans la liste des membres (D-02)
  - Modération adulte du Cercle + composer masqué pour l'enfant (D-12)
  - Fixture e2e e2e/child-profiles.spec.ts (exécutée, verte)
affects:
  - 25-07 (rebranchage markOccurrenceDone → RPC, gardes pickers)
  - futurs modules consommateurs de useMembers (liste vivante garantie)
tech-stack:
  added: []
  patterns:
    - "Le client ne fait jamais autorité : l'UI pilote l'affichage, la base revalide (0146/0148)"
    - "Filtre vivantes à l'INGESTION du store, jamais dans les composants"
    - "Bornes locales (nom 2-120, périmètre D-06) avant le réseau : la clé morte ne part pas se faire refuser"
key-files:
  created:
    - app/src/modules/parametres/hooks/use-child-profiles.ts
    - app/src/modules/parametres/hooks/use-child-profiles.test.tsx
    - app/src/modules/cercle/hooks/use-cercle.test.tsx
    - app/e2e/child-profiles.spec.ts
  modified:
    - app/src/stores/household-store.ts
    - app/src/types/database.ts
    - app/src/modules/parametres/api.ts
    - app/src/modules/parametres/components/members-panel.tsx
    - app/src/modules/cercle/hooks/use-cercle.ts
    - app/src/modules/cercle/cercle-page.tsx
    - app/src/modules/cercle/cercle-page.test.tsx
    - app/src/lib/data/seed.ts
decisions:
  - "D-01 : useIsAdult (admin OU membre) pilote toute la gestion enfant ; useIsAdmin garde sa sémantique stricte"
  - "D-04 : le filtre deleted_at vit dans setHousehold/setMembers (vivantes) — un seul point d'éviction, aucun composant ne refiltre"
  - "D-05 : les espaces enfant se choisissent PAR MEMBRE via p_managed_modules — aucune écriture households"
  - "Photo de profil enfant REPORTÉE : l'upload exige une chaîne chemin→URL signée par membre (comme note_attachments) qui n'existe pas encore ; le RPC porte déjà p_avatar_url, l'UI d'upload viendra dans un plan futur — rien de silencieux"
  - "D-21 : « Donner accès » réutilise le lien d'invitation rappelable (rappel local + isRecallValid), jamais un token deviné"
  - "La liste « Compte à relier » montre tous les adultes du foyer : la base (0148) refuse seule une ligne sans compte — le client propose, le serveur invalide"
metrics:
  duration: ~2h (10:56 → 12:52, récupération d'un exécuteur interrompu comprise)
  completed: 2026-10-26
status: complete
actuals:
  tokens: 22082 # chars/4 mesuré sur le diff eec0611^..HEAD (88 330 caractères, 10 fichiers)
  tasks: 3
  commits: 4 # MESURé 7f6587c..HEAD ; 7 au total : les 3 commits de T1 précèdent le registre, écrit au redémarrage
plan_head_before: 7f6587c1d938d7f02627264a7855fa8d0c0546f0
plan_head_after: ea30c96
commits: 4
---

# Phase 25 Plan 05: Profils enfants gérés — surface client Summary

**One-liner :** CRUD enfant dans la liste des membres via les RPC 0146/0148 (le client n'est jamais l'autorité), âge dérivé D-05, modération adulte du Cercle D-12, fixture e2e exécutée.

## Ce qui a été livré

| # | Task | Type | Commits | Vérification |
|---|------|------|---------|--------------|
| 1 | useIsAdult + filtre vivantes du store (D-01/D-04) | auto+tdd | eec0611 (rouge), e969dbb (vert), 7f6587c (refactor type) | typecheck + 11/11 tests store |
| 2 | Wrappers RPC + hook + CRUD enfant dans le panneau (D-02/D-05/D-19/D-21) | auto+tdd | bc16728 (rouge), 199da24 (vert) | typecheck + 1595 tests + build |
| 3 | Modération Cercle + composer masqué + fixture e2e (D-12) | auto+tdd | c1dfd07 (rouge), ea30c96 (vert) | chaîne §2.7 complète + e2e 155 passés |

## Cycle TDD — rouge avant vert, partout

Chaque tâche a eu un commit `test(…)` dont la SUITE ÉCHOUE (preuve de rouge), puis un
commit `feat(…)` qui la fait passer :

- **T1** : `test(25-05)` — usage de `useIsAdult`/`deleted_at` avant leur existence.
- **T2** : `bc16728` — la suite ne charge pas (les wrappers et le hook n'existent pas).
- **T3** : `c1dfd07` — 3 essais : 2 rouges (`canDelete` reste `post.mine` : aucun adulte
  ne peut modérer), l'essai enfant verrouille la règle inverse ; le rouge du composeur
  prouve l'UI actuelle (un enfant voit un composeur que la base refusera).

## Vérification (chaîne §2.7, dans l'ordre)

1. `npm run typecheck` — zéro erreur.
2. `npm test` — **193 fichiers, 1 599 tests, tout vert**.
3. `npm run build` — Vite/PWA, dist générée.
4. `npm run test:e2e` — **EXéCUTé : 155 passés, 7 sautés (skips de viewport préexistants)**,
   dont `child-profiles.spec.ts` 4/4 sur les deux projets (chromium + mobile).
5. `python3 scripts/check-sql-statique.py` — 209 fonctions effectives, aucun défaut.
   SQL inchangé par ce plan (backend clos en 25-02/25-04).

Vérifications ciblées du plan : aucun libellé « profil géré »/`actor_member_id` en UI ;
`useIsAdmin` n'est plus utilisé pour la gestion des membres ; `deleted_at` filtré UNIQUEMENT
dans le store ; aucune écriture `households` pour les modules enfant (lignes 106/114/126 =
fonctions foyer préexistantes) ; aucune « Section Enfants » (la liste des membres est étendue).

## Déviations du plan

### Auto-corrigées

1. **[Rule 3 — Harnais] Ensemencement du store des tests d'interface**
   - Trouvé pendant T2 : `renderWithProviders` réinitialise le store démo APRèS le verdict
     du test (`withHousehold: true` par défaut).
   - Correction : `withHousehold: false` + ensemencement explicite dans le fichier de test ;
     labels `Field` étoilés → matchers regex (convention `parametres-page.test.tsx`) ;
     ensemencement après rendu → `findBy`. Aucune assertion affaiblie.
   - Fichiers : `use-child-profiles.test.tsx`.
2. **[Rule 1 — Bug] Les actions adulte s'affichaient sur les lignes enfant**
   - Trouvé pendant T3 par l'e2e (`Retirer Jade Martin du foyer` attendu absent, présent) :
     le bloc Renommer/Rôle/Retirer restait rendu pour un enfant (R-01 interdit le Rôle enfant).
   - Correction : condition `isAdult && !isManagedChild` dans `members-panel.tsx`.
3. **[Rule 1 — Tests] Trois essais pinçaient le compte exact de publications démo.**
   - Le poste démo de Noé (fixture D-12) fait passer le compte 2→3 (puis 3→4 après publication).
   - Correction : `cercle-page.test.tsx` suit le nouveau compte (commentaires ajustés).

### Décisions prises en cours d'exécution

- **Photo de profil enfant reportée** (voir decisions) : le RPC `p_avatar_url` est déjà
  câblé de bout en bout ; il manque la chaîne de résolution chemin→URL par membre
  (précédent `note_attachments` : « jamais une URL signée stockée »). Plan futur, déclaré —
  pas un stub silencieux.
- Le dialogue « Donner accès » affiche le lien rappelé quand il existe (D-21) et le
  parcours de fusion ; sans rappel local, il renvoie vers l'onglet « Inviter ».

## Limites connues

- La vérification complète de la trace routine (attributaire enfant ≠ acteur adulte) est
  le sujet du plan 25-07 (rebranchage `markOccurrenceDone` → RPC) ; l'e2e actuelle prouve
  l'action parent, pas la ligne d'attribution en base.
- Aucuns stubs de code, aucun test sauté, aucune vérification non exécutée à déplorer.

## TDD Gate Compliance

Plan de type `execute` avec `tdd="true"` par tâche : chaque tâche a livré son commit rouge
avant son commit vert (voir tableau). Aucun saut de cycle.

## Self-Check: PASSED

4 fichiers créés présents ; les 7 commits du plan vérifiés dans l'historique.
