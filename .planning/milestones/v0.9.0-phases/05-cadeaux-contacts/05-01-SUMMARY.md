# Phase 05 Plan 01: Fondations SQL cadeaux-contacts Summary

**One-liner:** Tables `gift_ideas` et `contact_lists`/`contacts` avec RLS foyer, masquage surprise serveur et seed Famille+perso, prouvées par 26/26 tests SQL verts.
**Status:** complete

## Frontmatter

```yaml
phase: 05-cadeaux-contacts
plan: 01
subsystem: supabase-sql
tags: [rls, gift-ideas, contacts, surprise, seed, backfill]
requires: [0075-gift-read-scope]
provides: [gift_ideas-table, contact-lists-table, surprise-rls, contact-seed]
affects: [05-02-miroir, 05-03-invites, 05-04-edge-ui]
tech-stack:
  added: []
  patterns: [foyer-plat-rls, policy-helper-can_read_X, trigger-seed-idempotent, guard-last-default, forward-only-loops]
key-files:
  created:
    - supabase/migrations/0076_gift_ideas.sql
    - supabase/migrations/0077_contacts.sql
    - supabase/tests/0024_gift_ideas.sql
    - supabase/tests/0025_contacts_mirror.sql
  modified:
    - supabase/tests/0001_schema_contract.sql
decisions:
  - "OQ-2 : liste personnelle lisible propriétaire + admins (documenté en commentaire 0077)"
  - "contacts.linked_member_id ON DELETE CASCADE, pas SET NULL (collision cascade vs set-null au retrait d'un membre, trouvée par 0002)"
  - "can_read_gift_idea en deux temps : version foyer seule en 0076 (PostgreSQL résout les tables à la création), version surprise effective en 0077"
  - "Seed par trigger ensure_default_contact_list sur household_members (couvre create_household ET rattachements par invitation) + backfill one-shot, au lieu d'étendre create_household"
metrics:
  duration: ~50 min
  completed: 2026-10-05
  tasks: 3
  commits: 3
actuals:
  tokens: 24000
  tasks: 3
  commits: 3
plan_head_before: dd12a6474f16333c5ca32afa7227fed65102777c
plan_head_after: d1ffaedad72d6639e5ae53b934d8e304254fc886
```

## What Was Built

**Tracer gift_ideas (0076 + 0024) :** table `gift_ideas` (nom 1-200, prix >= 0, statut verrouillé `a_offrir`/`offert`, `giftee_text`, `giftee_contact_id` sans FK vers table inexistante, `created_by` validé, audit created/updated_at), 4 politiques RLS foyer-plat, SELECT + UPDATE filtrés par `private.can_read_gift_idea`, lien `gift_items.idea_id` ON DELETE SET NULL, bloc Realtime. Test 0024 : Alice voit son idée pour Bob, Bob ne la voit pas (surprise D-08), Noé lit mais n'écrit pas, Carol/Dave isolés, statuts/prix invalides refusés, suppression admin avec article survivant à `idea_id` NULL.

**Contacts et listes (0077) :** `contact_lists` (owner NULL = Famille partagée, sinon perso ; `is_default` ; index unique partiel par défaut/owner) et `contacts` (`household_id` dénormalisé aligné par trigger + FK, `linked_member_id` CASCADE). Helpers `can_read/contact_list` + `can_write_contact_list` (source unique du prédicat OQ-2, réutilisés par les politiques des deux tables). Seed idempotent `ensure_household_contact_lists` (Famille + perso et contact lié par adulte, enfants exclus) appelé par trigger sur `household_members` et par backfill ; garde `guard_last_default_contact_list` (dernière-défaut insupprimable sauf cascade foyer, cf. `delete_household` 0074) ; FK surprise `gift_ideas.giftee_contact_id` SET NULL ; définition effective de `can_read_gift_idea` avec branche `not exists` sur contacts ; Realtime sur les deux tables.

**Tests 0025 (partie listes) :** défauts Famille + persos adultes présents, pré-remplissage lié par adulte et zéro enfant, visibilité perso owner+admin (Bob ne voit pas la perso d'Alice, Noé ne voit que Famille), enfant et inter-foyer bloqués en écriture, suppression non-défaut OK, suppression dernière-défaut refusée avec Famille intacte. IDs seedés lus en superuser dans `testkit.fx` pour des refus RLS francs (pas de NULL déguisé).

**Contrat 0001 :** lignes `gift_ideas`, `contact_lists`, `contacts` (colonnes exactes) + `idea_id` sur `gift_items` ; `contacts` ajouté à la liste des dénormalisés contraints par `align_household`.

## Verification

- `sh scripts/migrate.sh` : 0076 + 0077 appliquées, 60 tables, 0 sans RLS.
- `python3 scripts/check-sql-statique.py` : 120 fonctions effectives, aucun défaut.
- `sh scripts/test-db.sh` : **26/26 fichiers verts**, dont 0001 (contrat), 0002 (isolation, exerce le retrait de membre sur les nouvelles tables), 0024, 0025.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Helper `can_read_gift_idea` manquant du draft 0076**
- **Found during:** Tâche 1 (relecture du draft non commité avant application)
- **Issue:** Le draft référençait `private.can_read_gift_idea(id)` dans deux politiques sans jamais créer la fonction — chaque SELECT sur `gift_ideas` aurait levé `function does not exist`.
- **Fix:** Fonction créée en 0076 (version foyer seule) + version surprise effective en 0077.
- **Files modified:** `supabase/migrations/0076_gift_ideas.sql`, `0077_contacts.sql`
- **Commit:** b7efd5a, 6e4400b

**2. [Rule 1 - Bug] `contacts.linked_member_id` SET NULL faisait échouer le retrait d'un membre**
- **Found during:** Tâche 2 (suite complète : 0002 échouait après seed)
- **Issue:** La fiche seedée vit dans la liste perso du membre ET lui est liée : au retrait du membre, le SET NULL sur `linked_member_id` tirait le trigger `align_household` sur une ligne dont la liste était déjà supprimée par cascade → `parent contact_lists introuvable`.
- **Fix:** `ON DELETE CASCADE` (même motif que `gift_lists.owner_member_id` en 0004) ; les idées survivent via leur propre SET NULL. Fichier non commité à ce stade : revert ciblé de l'application dev (2 lignes de journal + DROP, données backfill dev re-seedées) puis correction dans le même fichier — pas de migration corrective séparée, historique propre.
- **Files modified:** `supabase/migrations/0077_contacts.sql`
- **Commit:** 6e4400b

**3. [Rule 3 - Structure] `language sql` résout les tables à la création**
- **Found during:** Tâche 1 (`migrate.sh` : `relation public.contacts does not exist` dans le corps de la fonction)
- **Issue:** L'hypothèse « corps non résolu avant le premier appel » était fausse — PostgreSQL valide à la création.
- **Fix:** Version foyer seule en 0076, `CREATE OR REPLACE` complète en 0077 (commentaires mis à jour dans les deux fichiers).

**4. [Pattern] Seed par trigger plutôt qu'extension de `create_household`**
- **Found during:** Tâche 2
- **Issue:** Le plan demandait un trigger `ensure_default_contact_list` ; étendre `create_household` (motif 0052) aurait raté les rattachements par invitation (insert direct dans `household_members`).
- **Fix:** Trigger AFTER INSERT OR UPDATE idempotent sur `household_members` + backfill one-shot appelant le même helper. Couvre création et rattachement sans toucher à `create_household`.

**5. [Outillage] Worktree sans runtime : `EO_PROJECT_DIR`**
- Les scripts (`migrate.sh`, `test-db.sh`, `psql.sh`) exigeaient `supabase-project/` absent du worktree (gitignoré) : exécutés avec `EO_PROJECT_DIR=/home/jmaillot/Projects/ensemble_organises/supabase-project`. Aucun impact sur le contenu.

### Ordre de vérification (nota, pas un échec)
La fixture 0024 insère dans `contact_lists`/`contacts` : 0024 ne passe au vert qu'une fois 0077 appliquée. 0076 a été appliquée seule d'abord (migration OK), puis la vérification tests (0024 + suite) après 0077. Les commits par tâche ont été posés une fois l'ensemble vert.

## Threat Flags

Aucune surface nouvelle hors plan : les deux helpers de lecture/écriture sont `SECURITY DEFINER` + `search_path=''` et ne sont cités que par des politiques RLS (justification 7bis du contrat) ; les fonctions de seed/garde sont révoquées de `public, anon, authenticated` (motif 0052). T-05-01 (surprise serveur, assertion bornée 0024) et T-05-02 (enfant bloqué, assertions 0024/0025 + retrait membre via 0002) mitigées et testées.

## Known Stubs

Aucun.

## Self-Check

**PASSED** — les 6 fichiers existent sur disque, les 3 commits existent dans l'historique de la branche `worktree-agent-p01-1791218649` (vérifiés le 2026-10-05).
