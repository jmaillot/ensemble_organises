---
phase: 25-profils-enfants-gérés-par-le-parent
reviewed: 2026-10-26T12:00:00Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - supabase/migrations/0144_managed_child_schema.sql
  - supabase/migrations/0145_convert_managed_children.sql
  - supabase/migrations/0146_child_behavior_guards.sql
  - supabase/migrations/0147_child_push_adults.sql
  - supabase/migrations/0148_link_managed_child.sql
  - supabase/migrations/0149_child_message_reassign.sql
  - supabase/migrations/0007_rls_policies.sql
  - supabase/migrations/0003_tables_daily.sql
  - supabase/migrations/0015_share_uniqueness.sql
  - supabase/tests/0146_child_behavior_guards.sql
  - supabase/tests/0147_child_push_adults.sql
  - supabase/tests/0148_link_managed_child.sql
  - app/src/lib/member-eligibility.ts
  - app/src/lib/household-store.ts
  - app/src/modules/parametres/api.ts
  - app/src/modules/parametres/hooks/use-child-profiles.ts
  - app/src/modules/parametres/components/members-panel.tsx
  - app/src/modules/taches/components/task-form-dialog.tsx
  - app/src/modules/routines/hooks/use-routines.ts
  - app/src/modules/routines/api.ts
  - app/src/modules/cercle/hooks/use-cercle.ts
  - app/src/modules/cercle/cercle-page.tsx
  - app/src/lib/data/seed.ts
  - app/src/lib/data/database.ts
findings:
  critical: 1
  warning: 6
  info: 3
  total: 10
status: issues_found
---

# Phase 25 : Code Review Report

**Reviewed :** 2026-10-26T12:00:00Z
**Depth :** standard
**Files Reviewed :** 27 (6 migrations, 2 migrations de référence schéma, 3 tests SQL, 16 fichiers frontend production)
**Status :** issues_found

## Summary

La phase 25 (profils enfants gérés par le parent) est dans l'ensemble solide : les six migrations 0144–0149 respectent les conventions du dépôt (`search_path = ''`, noms qualifiés, corrections forward-only, invariants vérifiés), les tests SQL 0146/0147/0148 sont bornés aux identifiants de fixture, sans tautologie relevée, et la chaîne de vérification citée par l'orchestrateur est verte (SQL 83/83, typecheck+vitest 1617/1617, build, e2e 155 passés).

Trois zones de faiblesse subsistent néanmoins. La plus grave : la politique RLS `household_members_delete` n'a pas été durcie pour les enfants gérés, laissant un `DELETE` direct ouvert aux admins qui purge-en-cascade tout l'historique que D-04 prétend protéger. Viennent ensuite une fusion `link_managed_child` incomplète (déduplication A6 absente pour `gift_list_shares`, donc 23505 possible) et des doublons possibles dans `meal_entries.member_ids`. Côté frontend : un avatar silencieusement abandonné côté connecté, la modération D-12 des commentaires absente de l'UI, et des assignés masqués qui bloquent la sauvegarde d'un formulaire après retrait d'un module.

Observations hors périmètre (préexistantes, non comptées comme findings) : la copie du dialogue de retrait dans `members-panel.tsx` (« Ses messages et ses contributions restent dans l'historique ») décrit le comportement des enfants gérés mais pas celui des adultes (cascades) ; l'absence de `test-dispatch-push.sh` sur la machine de vulgo est documentée, pas un défaut ; la branche morte `can_deposit_message_media` de 0099 est documentée (D-01).

## Critical Issues

### CR-01 : Un admin peut supprimer directement la ligne d'un enfant géré et purger tout son historique en cascade

**File :** `supabase/migrations/0007_rls_policies.sql:288-293` (politique inchangée par 0144–0149) ; `app/src/modules/parametres/components/members-panel.tsx` (chemin `removeMember`)

**Issue :** La politique RLS `household_members_delete` reste :

```sql
create policy household_members_delete on public.household_members
  for delete using (
    private.is_household_admin(household_id)
    and not (role = 'admin' and private.household_admin_count(household_id) = 1)
  );
```

Rien dans 0144–0149 n'interdit la suppression d'une ligne `role = 'enfant'` portant `user_id is null` par `DELETE` direct (PostgREST ou `removeMember`). Or les FK vers `household_members` sont quasi toutes `on delete cascade` (par ex. `posts.author_id` 0004, `messages.sender_id` 0004, `task_assignees`, `routine_assignees`, `conversation_members`, `expense_participants`, `recipe_favorites`, `trip_members`, `gift_list_shares`, `ardoise_members`) : la suppression purge la totalité des contributions de l'enfant — exactement ce que D-04 (« ses messages et contributions restent dans l'historique ») interdit, et ce que `link_managed_child` prend soin de préserver en réattribuant. L'UI masque « Retirer » pour un enfant, mais « le client n'est jamais l'autorité » (AGENTS.md §2.6 : la RLS est la frontière d'autorisation finale). Les tests ne couvrent pas ce chemin (aucun test de `delete from household_members where role='enfant'` refusé).

**Fix :** Dans une migration 0150, durcir la politique pour exiger la passerelle RPC :

```sql
alter table public.household_members enable row level security; -- (déjà active)

drop policy if exists household_members_delete on public.household_members;
create policy household_members_delete on public.household_members
  for delete using (
    private.is_household_admin(household_id)
    and role <> 'enfant'                       -- un enfant géré ne sort jamais par DELETE direct
    and not (role = 'admin' and private.household_admin_count(household_id) = 1)
  );
```

Si un retrait d'enfant doit rester possible un jour, il devra passer par une fonction `SECURITY DEFINER` transactionnelle qui réattribue d'abord (la logique de 0149), jamais par le `DELETE` brut.

## Warnings

### WR-01 : `link_managed_child` omet la déduplication A6 pour `gift_list_shares` — la fusion échoue en 23505

**File :** `supabase/migrations/0149_child_message_reassign.sql:185-246` (bloc A6) vs `supabase/migrations/0015_share_uniqueness.sql:56-59`

**Issue :** L'index `gift_list_shares_member_unique` (`unique (list_id, shared_with_member_id)`, partiel sur `shared_with_member_id is not null`) interdit deux lignes de partage pour le même membre sur la même liste. Quand un adulte partage une liste de cadeaux à l'enfant géré **et** à son compte (deux lignes distinctes légitimes avant fusion), l'`update … set shared_with_member_id = compte where shared_with_member_id = enfant` (0149:277) viole l'index → 23505, la transaction entière est annulée, la fusion est impossible. Le fichier déduplique dix tables dans son bloc A6 (dont `ardoise_members`, ajouté en complément 0149 par précisément ce raisonnement) mais pas `gift_list_shares`. C'est la même classe de bug que celle corrigée pour `ardoise_members`, ratée une seconde fois.

**Fix :** Ajouter au bloc A6 de 0149 (et donc dans une future migration, forward-only) :

```sql
-- A6 : l'enfant et le compte partagés de la même liste — la ligne du compte fait foi.
delete from public.gift_list_shares a
 using public.gift_list_shares b
 where a.list_id = b.list_id
   and a.shared_with_member_id = p_child_member_id
   and b.shared_with_member_id = p_account_member_id;
```

### WR-02 : `array_replace` sur `meal_entries.member_ids` produit des doublons quand enfant et compte coexistent

**File :** `supabase/migrations/0149_child_message_reassign.sql:288`

**Issue :**

```sql
update public.meal_entries set member_ids = array_replace(member_ids, p_child_member_id, p_account_member_id)
 where p_child_member_id = any (member_ids);
```

Si la ligne porte `member_ids = '{ enfant, compte }'` (les deux convives d'un repas), l'enfant est remplacé par le compte → `'{ compte, compte }'`. Aucune contrainte unique n'interdit les doublons dans `member_ids`, et le fichier lui-même énonce en tête de bloc A6 le principe de déduplication « la trace du compte fait foi » sans l'appliquer ici. La fiche du repas compte ensuite deux fois le même membre.

**Fix :** Dédupliquer avant réattribution, comme les autres tables :

```sql
update public.meal_entries
   set member_ids = array(select distinct unnest(member_ids))
 where p_child_member_id = any (member_ids)
   and p_account_member_id = any (member_ids);
-- puis l'update array_replace existant, désormais sans risque de doublon.
```

### WR-03 : La déduplication `routine_completions` du bloc A6 est du code mort — elle ne peut jamais s'exécuter

**File :** `supabase/migrations/0149_child_message_reassign.sql:203-208` ; `supabase/migrations/0003_tables_daily.sql:151`

**Issue :** Le self-join de déduplication suppose que deux lignes `(routine_id, occurrence_date)` identiques peuvent coexister (une par `completed_by`). Or `routine_completions_unique_occurrence unique (routine_id, occurrence_date)` (0003:151) rend cette situation impossible depuis l'origine : le join ne matche jamais, le `delete` ne supprime jamais rien, et l'`update` d'après ne peut jamais violer la contrainte. Ce n'est pas dangereux, mais c'est exactement le motif « un contrôle qui ne regarde rien » proscrit par AGENTS §2.7-B : vert, silencieux, et porteur d'une fausse assurance sur la structure des données. Une assertion de test qui l'exercerait serait une tautologie.

**Fix :** Supprimer ce bloc de déduplication et remplacer par un commentaire nommant la raison : « pas de déduplication nécessaire : routine_completions_unique_occurrence (0003) interdit deux occurrences (routine_id, occurrence_date) ; l'update ne peut pas violer la contrainte ». Si la contrainte devait devenir `(routine_id, occurrence_date, completed_by)`, le bloc redeviendrait nécessaire — le commentaire le rappellera.

### WR-04 : `create_managed_child_profile` accepte `p_avatar_url` puis le jette silencieusement

**File :** `supabase/migrations/0146_child_behavior_guards.sql:149` (paramètre) vs `:193-203` (INSERT) ; `app/src/modules/parametres/api.ts:214` (mode démo divergent)

**Issue :** La signature déclare `p_avatar_url text default null`, mais la colonne `avatar_url` est absente de la liste d'insertion de `household_members`. L'avatar est perdu sans erreur côté connecté, alors que le mode démo (`api.ts:214`) le stocke — divergence de comportement entre les deux modes. `update_managed_child_profile` sait écrire `avatar_url` (0146:294, `coalesce(p_avatar_url, avatar_url)`), ce qui confirme que l'omission à la création est un oubli, pas un choix. Par ailleurs le `coalesce` rend impossible la ** suppression** de l'avatar après coup (passer null ne fait rien).

**Fix :** Ajouter la colonne à l'insertion (nouvelle migration, forward-only :

```sql
create or replace function public.create_managed_child_profile(…) …
  insert into public.household_members
    (id, household_id, user_id, display_name, color_tag, role, birth_date,
     avatar_url, managed_modules)
  values (v_member_id, p_household_id, null, btrim(p_display_name), v_color,
          'enfant', p_birth_date, p_avatar_url,
          '{taches,routines,anniversaires,menu}'::text[]);
```

et, pour rendre possible la suppression de l'avatar, introduire un drapeau `p_clear_avatar boolean default false` côté `update_…` (le `coalesce` seul ne peut pas exprimer « mettre à null »).

### WR-05 : La modération D-12 des commentaires de l'Cercle existe côté serveur mais pas côté UI

**File :** `app/src/modules/cercle/hooks/use-cercle.ts:426-429` ; consommateurs `post-card.tsx:124`, `comments-dialog.tsx:96` ; politique serveur `post_comments_delete_admin` (`0149_child_message_reassign.sql:337-344`)

**Issue :** `canDeleteComment` reste auteur-seul :

```ts
const canDeleteComment = useCallback(
  (comment: FeedComment) => comment.authorId === currentMemberId,
  [currentMemberId],
);
```

alors que la politique serveur `post_comments_delete_admin` autorise un adulte à modérer le commentaire d'un enfant (D-12), et que `canDeletePost` (même fichier, juste au-dessus) porte bien sa branche adulte. Concrètement : la modération est permise par l'API mais personne ne peut la déclencher dans l'app — l'asymétrie avec les publications (qui la possède) et avec les réactions (trois branches D-12 côté hook, zéro UI de retrait adulte) rend le comportement incohérent et le code trompeur pour le prochain lecteur.

**Fix :** Répliquer la logique de `canDeletePost` :

```ts
const canDeleteComment = useCallback(
  (comment: FeedComment) =>
    comment.authorId === currentMemberId ||
    (isAdult && comment.authorIsChild),
  [currentMemberId, isAdult],
);
```

(en rechauffant `FeedComment` du drapeau auteur-enfant que les publications ont déjà), et brancher le même traitement dans `comments-dialog.tsx` et `post-card.tsx`.

### WR-06 : Des assignés masqués font échouer la sauvegarde du formulaire après retrait d'un module

**File :** `app/src/modules/taches/components/task-form-dialog.tsx:55` (même motif dans le formulaire de routine)

**Issue :** À l'ouverture, `assigneeIds: task.assignees.map((a) => a.memberId)` (ligne 55) charge **tous** les assignés historiques, y compris ceux que `member-eligibility` exclut désormais de la liste rendue (enfant géré à qui l'adulte vient de retirer « Tâches » dans sa fiche). La case est invisible mais l'id reste dans le state Zod ; toute sauvegarde (même pour corriger le titre) le resoumet, et `replace_task_assignees` rejette en 42501. L'utilisateur ne peut ni décocher l'assigné (pas rendu) ni sauvegarder sans l'abandonner : blocage réel, exactement le scénario D-08/retrait de module que la phase prétend gérer.

**Fix :** Filtre les assignés inéligibles à l'initialisation de `defaultValues`, en gardant éligible l'assignation explicite de l'utilisateur courant :

```ts
const eligibleIds = new Set(eligibleMembers.map((m) => m.memberId));
assigneeIds: task.assignees
  .map((a) => a.memberId)
  .filter((id) => eligibleIds.has(id) || id === currentMemberId),
```

(appliquer le même correctif au formulaire de routine).

## Info

### IN-01 : Sémantique mixte dans `update_managed_child_profile`

**File :** `supabase/migrations/0146_child_behavior_guards.sql:282-300` ; documenté `app/src/modules/parametres/api.ts:236-238`

**Issue :** `birth_date` est écrasée inconditionnellement (null ⇒ null) tandis que `display_name`, `color_tag` et `avatar_url` usent de `coalesce` (null ⇒ conserver). Les appelants contournent en passant les valeurs courantes ; le contrat est correct à l'instant mais fragile : le premier appelant qui n'a que le.nom sous la main effacera la date de naissance par accident.

**Fix :** Harmoniser (tout en `coalesce`, ou tout écrasant), et à défaut renommer le paramètre en `p_birth_date_clear` ou documenter l'asymétrie dans le commentaire d'en-tête de la fonction.

### IN-02 : `set_member_role` sur une fiche enfant renvoie le 23514 brut de la CHECK plutôt que le message 22023 conversationnel

**File :** `supabase/migrations/0145_convert_managed_children.sql` (garde d'invariant) ; parcours `members-panel.tsx`

**Issue :** La CHECK `role IN ('admin','membre','enfant')` **ne contient pas** de garde « enfant sans compte », donc changer le rôle d'une fiche enfant vers 'membre' via `set_member_role` contourne l'invariant D (rôle non-enfant ⇒ user_id non null) et échoue en 23514 PostgreSQL brut, non en 22023 avec message traduit comme les autres gardes de la phase. Le résultat est correct (refus), seul l'erreur est inhospitalière et le message d'erreur passe inaperçu dans les tests UI.

**Fix :** Ajouter dans `set_member_role` la même garde explicite que les autres RPC : `if p_role in ('membre','admin') and not exists (select 1 from public.household_members where id = p_member_id and user_id is not null) then raise exception 'un enfant géré ne peut pas recevoir un rôle adulte' using errcode = '22023'; end if;`

### IN-03 : 0148 conserve ses deletes inconditionnels et sa purge `completed_by = enfant`

**File :** `supabase/migrations/0148_link_managed_child.sql:215` et suivants — contexte seulement

**Issue :** 0148 (version buguée, dépassée par 0149) contient des `delete` inconditionnels sur `task_assignees`/`routine_assignees` et un `delete from routine_completions where completed_by = enfant` : appliquée seule, elle perdait des données. C'est voulu : la correction 0149 est forward-only, l'historique fautif reste dans le dépôt (AGENTS §2.7-A, « il raconte ce qui s'est passé »). **Aucune action requise** — mentionné pour que les relecteurs ouverts des deux fichiers ne confondent pas l'effectif (0149) avec la trace abandonnée (0148).

---

_Conservé dans cette revue : 1 CRITICAL (CR-01), 6 WARNING (WR-01 à WR-06), 3 INFO (IN-01 à IN-03). Les tests existants ne couvrent ni la collision `gift_list_shares` à la fusion, ni le chemin `DELETE` direct d'une ligne enfant — ces findings ne contredissent donc aucun test vert._

_Consultés mais sans finding propre : `supabase/migrations/0144_managed_child_schema.sql`, `0145`, `0147` (D-23 conforme), tests `0146`/`0147` (assertions bornées, pas de tautologie relevée), `member-eligibility.ts`, `use-child-profiles.ts`, `use-routines.ts`, `cercle-page.tsx`, `seed.ts`, `database.ts`._

---

_Reviewed: 2026-10-26T12:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
