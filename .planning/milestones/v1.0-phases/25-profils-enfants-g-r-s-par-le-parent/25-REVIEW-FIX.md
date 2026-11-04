---
phase: 25
fixed_at: 2026-10-26T16:06:29+01:00
review_path: .planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-REVIEW.md
iteration: 1
findings_in_scope: 10
fixed: 9
skipped: 1
status: partial
---

# Phase 25 : Code Review Fix Report

**Fixed at :** 2026-10-26T16:06:29+01:00
**Source review :** `.planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-REVIEW.md`
**Iteration :** 1

**Résumé :**
- Findings dans le périmètre : 10 (fix_scope = critical_warning + info)
- Corrigés : 9
- Skippés : 1 (IN-03, voir justification)

## Fixed Issues

### CR-01 : DELETE direct sur household_members d'un enfant géré

**Fichiers modifiés :** `supabase/migrations/0150_harden_household_members_delete.sql` (nouveau), `supabase/tests/0150_harden_household_members_delete.test.sql` (nouveau)
**Commit :** `12abce5`
**Correctif appliqué :** Durcissement avant-correctif de `household_members_delete` — un enfant géré (role 'enfant', user_id null) ne peut plus sortir par un DELETE direct ; refus 42501 explicite. La suppression passe uniquement par l'archivage RPC dédié. Test de contrat 0150 (vu rouge sans la migration, puis vert).

### WR-01 : Partage dupliqué lève 23505 dans link_managed_child

**Fichiers modifiés :** `supabase/migrations/0151_dedup_gift_list_shares.sql` (nouveau), `supabase/tests/0151_dedup_gift_list_shares.test.sql` (nouveau)
**Commit :** `8700c5a`
**Correctif appliqué :** Déduplication de `gift_list_shares` avant réinsertion dans `link_managed_child` — la fusion de foyers ne lève plus 23505 sur un partage déjà existant. L'unicité est un INDEX partiel issu de 0015 (pas une contrainte pg_constraint) : le test l'atteste via `pg_indexes`.

### WR-02 : Compte en double dans meal_entries.member_ids

**Fichiers modifiés :** `supabase/migrations/0152_dedup_meal_member_ids.sql` (nouveau), `supabase/tests/0152_dedup_meal_member_ids.test.sql` (nouveau)
**Commit :** `0d4f289`
**Correctif appliqué :** Déduplication de `meal_entries.member_ids` AVANT `array_replace` — l'ordre du tableau est préservé via `unnest with ordinality` + `coalesce(array_agg(...))`. Un compte retiré d'une fiche n'apparaît plus en double dans un repas existant.

### WR-03 : Self-join routine_completions mort

**Fichiers modifiés :** `supabase/migrations/0153_drop_dead_self_join.sql` (nouveau), `supabase/tests/0153_drop_dead_self_join.test.sql` (nouveau)
**Commit :** `0ab0636`
**Correctif appliqué :** Le bloc de jointure réflexive sur `routine_completions` était rendu inerte par la contrainte `routine_completions_unique_occurrence` (0003:151) — bloc supprimé, la raison nommée en commentaire dans la migration. Un code mort porteur d'un faux contrat disparaît.

### WR-04 : Avatar perdu à la création + suppression d'avatar impossible

**Fichiers modifiés :** `supabase/migrations/0154_create_child_avatar_and_clear.sql` (nouveau), `supabase/tests/0154_create_child_avatar_and_clear.test.sql` (nouveau), réalignement des appels dans `0012`/`0146` (fichiers de test SQL)
**Commit :** `ce4b1b7`
**Correctif appliqué :** `create_managed_child_profile` stocke désormais l'avatar (argument + retour jsonb) ; le contrat `update_managed_child_profile` gagne `p_clear_avatar boolean default false` pour la suppression explicite ; l'ancienne surcharge 6 arguments est abandonnée. Les appels de test historiques (0012, 0146) passent `false` en 6e position — un null non typé en 6e position résoudrait désormais la nouvelle fonction 7 arguments. Suite 90/90 verte.

### WR-05 : Un adulte ne peut pas supprimer le commentaire d'un enfant géré

**Fichiers modifiés :** `app/src/modules/cercle/hooks/use-cercle.ts`, `app/src/modules/cercle/hooks/use-cercle.test.tsx`, `app/src/modules/cercle/components/comments-dialog.tsx`, `app/src/modules/cercle/components/post-card.tsx`, `app/src/modules/cercle/cercle-page.tsx`, `app/src/modules/cercle/cercle-page.test.tsx`
**Commit :** `5fba638`
**Correctif appliqué :** La grille `canDeleteComment` du hook (isAdult + authorRole 'enfant' || own, symétrie de `canDelete`, conforme à la politique `post_comments_delete_admin` 0149) est descendue en props optionnelles — `canDeleteComment` vers CommentsDialog, `canDeleteInline` vers PostCard — depuis `cercle-page.tsx`. Fallback local auteur-seul conservé pour les rendus directs (contrat D-07 des tests). Commentaires périmés (« aucune branche admin ») réécrits. Deux tests de composants prouvent le câblage ; le test de hook existait déjà (5/5). Preuve inverse : test rouge sans le câblage, vérifié.

### WR-06 : Assigné masqué bloque la sauvegarde des formulaires

**Fichiers modifiés :** `app/src/modules/taches/components/task-form-dialog.tsx`, `app/src/modules/taches/components/task-form-dialog.test.tsx`, `app/src/modules/routines/components/routine-form-dialog.tsx`, `app/src/modules/routines/components/routine-form-dialog.test.tsx`
**Commit :** `317a14e`
**Correctif appliqué :** Le pré-remplissage `assigneeIds` filtre les assignés inéligibles (`eligibleIds.has(id) || id === currentMemberId`) dans les deux formulaires — un assigné rendu inéligible (module retiré de sa fiche entre deux ouvertures) n'est plus resoumis, le serveur ne refuse plus en 42501. `eligibleIds` n'est pas dans les deps du `useEffect` : identité nouvelle à chaque rendu, il re-déclencherait le reset en boucle — la raison est nommée en commentaire dans le fichier (aucun linter dans ce dépôt). Un test par formulaire prouve que la sauvegarde exclut l'enfant hors-module. Preuve inverse : test rouge sans le filtre, vérifié.

### IN-01 : Sémantique mixte dans update_managed_child_profile

**Fichiers modifiés :** `supabase/migrations/0155_comment_update_managed_child_profile.sql` (nouveau), `supabase/tests/0155_comment_update_managed_child_profile.test.sql` (nouveau)
**Commit :** `2f9d132`
**Correctif appliqué :** Contrat documenté par `comment on function` — l'asymétrie `birth_date` (écriture unilatérale, jamais écrasée par null) est délibérée : l'UI n'offre jamais l'effacement. Assertions via motifs LIKE sur `pg_description` (jokers par caractère pour les accents).

### IN-02 : Promotion d'un enfant géré, garde conversationnelle

**Fichiers modifiés :** `supabase/migrations/0156_guard_promote_managed_child.sql` (nouveau), `supabase/tests/0156_guard_promote_managed_child.test.sql` (nouveau)
**Commit :** `9698497`
**Correctif appliqué :** `set_member_role` gagne la garde D-17c (réf. 22023) — `p_role <> 'enfant'` ET cible `user_id is null` (SANS filtre deleted_at : un enfant archivé doit aussi refuser en 22023, sinon 23514) → message « un enfant géré ne peut pas recevoir un rôle adulte ». Note d'exécution : la migration a été consommée par `schema_migrations` AVANT la correction du filtre deleted_at ; le corps corrigé a été réappliqué manuellement via psql et vérifié en base (`garde_presente=t, deleted_at_encore=f`). Les appels de test réalignés sur la signature 0154 (6e argument).

## Skipped Issues

### IN-03 : 0148 conserve ses deletes inconditionnels et sa purge `completed_by = enfant`

**Fichier :** `supabase/migrations/0148_link_managed_child.sql:215` et suivants — contexte seulement
**Raison du skip :** Le review lui-même conclut « aucune action requise » : la version buguée 0148 est dépassée par la correction forward-only 0149, et l'historique fautif reste volontairement dans le dépôt (AGENTS §2.7-A — « il raconte ce qui s'est passé »). Confondre l'effectif (0149) avec la trace abandonnée (0148) serait une erreur de lecture, pas un défaut de code. Aucun commit.

## Vérification

**Lieu d'exécution :** les portes ont tourné DANS LE WORKTREE ISOLÉ `.claude/worktrees/rf-25-149936-1793019553` (branche `gsd-reviewfix/25-149936`) — les chiffres ne sont pas reproductibles depuis le checkout principal sans y rejouer la chaîne.

- SQL : `check-sql-statique.py` + `test-check-sql-statique.py` + `migrate.sh` + `test-db.sh` verts — 90 fichiers de test, tous verts (EO_PROJECT_DIR pointé sur la stack du checkout principal, faute de `.env` dans le worktree).
- Frontend : `npm run typecheck` vert, `npm test` 201 fichiers / 1624 tests verts, `npm run build` OK.
- Chaque fix porte son test prouvant (rouge sans lui, vert avec) ; preuves inverses exécutées pour WR-05 et WR-06.

---

_Fixed: 2026-10-26T16:06:29+01:00_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
