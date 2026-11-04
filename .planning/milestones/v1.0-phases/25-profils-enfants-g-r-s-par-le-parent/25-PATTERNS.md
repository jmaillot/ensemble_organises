# Phase 25: Profils enfants gérés par le parent — Pattern Map

**Mapped:** 2026-10-25
**Files analyzed:** 15 (9 new, 6 modified)
**Analogs found:** 14 / 15 (1 file sans analogue — voir § No Analog Found)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/0144_managed_child_schema.sql` | migration (schéma + CHECK) | transform | `supabase/migrations/0140_household_disabled_modules.sql` | exact |
| `supabase/migrations/0145_convert_managed_children.sql` | migration (RPC de conversion `service_role`) | batch | `supabase/migrations/0132_member_archive_purge.sql` + `0133_replace_sets.sql` (clôture de privilèges) | role-match |
| `supabase/migrations/0146_child_behavior_guards.sql` | migration (RPC « au nom de » + policies + trigger + notifications) | request-response | `supabase/migrations/0036_set_member_role.sql` + `0133_replace_sets.sql` + `0109_cercle_author_guards.sql` + `0023_qualify_final_projection.sql` | composite exact |
| `supabase/tests/0144_managed_child_schema.sql` | test SQL | transform | `supabase/tests/0140_household_disabled_modules.sql` | exact |
| `supabase/tests/0145_convert_managed_children.sql` | test SQL | batch | `supabase/tests/0133_replace_sets.sql` + `0051_enfant_perimeter.sql` | role-match |
| `supabase/tests/0146_child_behavior_guards.sql` | test SQL | request-response | `supabase/tests/0051_enfant_perimeter.sql` + `0133_replace_sets.sql` | exact |
| `app/src/modules/parametres/components/members-panel.tsx` | component React | CRUD | **lui-même** (dialog de renommage 147-192, dialog de rôle 194-246, ConfirmDialog 122-145) | exact |
| `app/src/modules/parametres/api.ts` | wrapper RPC/CRUD | request-response | lui-même (`setMemberRole` 139-153, `deleteHousehold` 176-190) | exact |
| `app/src/modules/taches/api.ts` | wrapper RPC | request-response | lui-même (`setTaskAssignees` 54-56) | exact |
| `app/src/modules/routines/api.ts` | wrapper RPC | request-response | lui-même (`markOccurrenceDone` 129-151) | exact |
| `app/src/types/database.ts` | définition de type TS | — | lui-même (`HouseholdMemberRow` 85-94) | exact |
| `app/src/lib/data/seed.ts` | fixture / seed | transform | lui-même (membre `Noé` 197-206) | exact |
| `app/src/lib/data/set-tables.ts` | carte de correspondance | config | lui-même (`SET_TABLES` 46-83) | exact |
| `app/src/modules/cercle/hooks/use-cercle.ts` | hook React | request-response | lui-même (`canDelete` 401-414) | exact |
| `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md` | documentation | — | — | sans analogue (correction de texte) |

---

## Pattern Assignments

### `supabase/migrations/0144_managed_child_schema.sql` (migration schéma, transform)

**Analog:** `supabase/migrations/0140_household_disabled_modules.sql` — *exact* pour la colonne + helper immuable + droits `EXECUTE` pour `CHECK`.

**Imports/structure pattern** (lines 35-75):
```sql
begin;

-- La garde de forme : fonction immuable, appelable depuis la contrainte.
create or replace function private.has_valid_module_keys(keys text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(k ~ '^[a-z][a-z_]{1,39}$'), true)
     and coalesce(count(*) = count(distinct k), true)
   from pg_catalog.unnest(keys) as t (k);
$$;

comment on function private.has_valid_module_keys(text[]) is
  'Vrai si chaque clé est au format module (minuscules, tiret bas) et sans doublon.';

-- `public` et `anon` perdent l'EXECUTE ; `authenticated` et `service_role` la CONSERVENT :
-- une contrainte CHECK s'évalue avec le rôle qui écrit la ligne (piège 4, AGENTS.md §2.7).
revoke execute on function private.has_valid_module_keys(text[]) from public, anon;
grant execute on function private.has_valid_module_keys(text[]) to authenticated, service_role;

alter table public.households
  add column if not exists disabled_modules text[] not null default '{}'::text[]
  check (private.has_valid_module_keys(disabled_modules));

commit;
```

**Application à 0144 :**
- `household_members.managed_modules text[] not null default '{taches,routines,anniversaires,menu}'::text[] check (private.has_valid_module_keys(managed_modules))` — **réutilise** `private.has_valid_module_keys` existant (0140:42-51), ne pas la recréer. Le défaut est le socle restreint de D-06, jamais `'{}'` (qui signifierait « tout activé » dans la sémantique négative de 0140).
- `household_members.birth_date date` (nullable, D-05).
- La CHECK d'invariant **se joint après la conversion** (voir 0145), pas ici : `check ( (user_id is null) = (role = 'enfant') )`.
- En-tête de migration : même style de narration que 0140 (`POURQUOI`, `LA COLONNE`, `AUCUNE POLITIQUE NOUVELLE`, `LE TEST`).

---

### `supabase/migrations/0145_convert_managed_children.sql` (migration conversion, batch)

**Analog principal:** `supabase/migrations/0132_member_archive_purge.sql` — *role-match* pour la forme RPC destructive `SECURITY DEFINER` avec verrou + rapport `jsonb`.

**Core pattern — verrou + opérations séquentielles + rapport** (0132:21-79):
```sql
create or replace function public.delete_conversation_for_me(p_conversation_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_household_id text;
  v_self text;
  v_deleted integer := 0;
begin
  if auth.uid() is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  ...
  -- Verrou : deux derniers membres qui supprimeraient en même temps se sérialisent ici.
  select c.household_id into v_household_id
    from public.conversations c
   where c.id = p_conversation_id
     for update;
  ...
  return jsonb_build_object('conversation_id', p_conversation_id, 'deleted', v_deleted, 'purged', v_purged_rows > 0);
end;
$$;

comment on function public.delete_conversation_for_me(text) is
  '... USAGE AUTHENTIFIÉ UNIQUEMENT.';
```

**Application à 0145 :**
- `create or replace function public.convert_managed_children_to_profiles() returns jsonb ... security definer set search_path = ''` — **appelé par la migration elle-même** (`select public.convert_managed_children_to_profiles();`), donc testable dans la transaction annulée de `test-db.sh` (AGENTS.md §2.7 A : `create function` n'exécute pas le corps).
- Ordre strict (piège 5, recherche § Piège 5) : (1) `update public.household_members set user_id = null where role = 'enfant' and user_id is not null` **AVANT** le `delete from auth.users` — sinon la FK `on delete cascade` (0002:47) supprime la ligne membre et l'historique entier. (2) Suppression réelle des comptes. (3) Rapport `jsonb` avec les compteurs (membres convertis, comptes supprimés).
- `EXECUTE` réservé à `service_role` : la suppression de `auth.users` est une action d'administrateur de base, jamais client.
- Clore sur les deux chemins qui **recréeraient** un enfant avec compte (piège 6) : `redeem_household_invite_token` (0006:403-405, refus `p_role = 'enfant'`) et `set_member_role` (0036:39, refus `p_role = 'enfant'`).

---

### `supabase/migrations/0146_child_behavior_guards.sql` (migration RPC + policies + notifications, request-response)

**Quatre analogues composites, un par bloc.**

#### Bloc A — RPC « au nom de » : `actor = auth.uid()`, jamais un paramètre

**Analog:** `supabase/migrations/0036_set_member_role.sql:21-63` — *exact* pour la forme.

```sql
create or replace function public.set_member_role(
  p_member_id text,
  p_role text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_household_id text;
  v_current_role text;
begin
  if v_actor is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_role not in ('admin', 'membre', 'enfant') then
    raise exception 'rôle invalide' using errcode = '22023';
  end if;

  select m.household_id, m.role into v_household_id, v_current_role
    from public.household_members m
   where m.id = p_member_id;
  if v_household_id is null then
    raise exception 'membre introuvable' using errcode = 'P0002';
  end if;

  perform private.assert_household_admin(v_household_id, v_actor);
  ...
end;
$$;

-- Clôture de privilèges (0036:69-82) :
revoke all on function public.set_member_role(text, text) from public, anon;
grant execute on function public.set_member_role(text, text) to authenticated;
```

**Application à 0146 :**
- Les nouvelles RPCs prennent le **membre cible** (`p_member_id`) comme paramètre, **jamais** l'acteur. L'acteur est `v_actor := auth.uid()` résolu vers `private.current_member_id(household_id)`. Trois raisons (recherche § Pattern 1) : précédents 0036/0041 ; un paramètre `p_actor_id` appelle en `service_role` où `auth.uid()` vaut NULL et « fermerait tout » (motif 0058, cité 0113:487-488) ; la session vérifiée est la seule source d'identité non déclarable par le client (ENF-02).
- Garde à écrire `is not true` et **jamais** `not (...)` — les helpers renvoient NULL pour un appelant hors foyer, et `not NULL` vaut NULL, donc un garde `if not …` laisserait passer un inconnu (0133:35-40, lu verbatim).
- Refus en français sans donnée, `errcode = '42501'` (oracle invariant 0113:276-279).

**Analog secondaire pour le garde de module :** `supabase/migrations/0133_replace_sets.sql:47-84` — *exact* pour la clause membre-hors-foyer dans une RPC de remplacement.

```sql
  if exists (
    select 1
      from unnest(p_member_ids) as m
     where private.member_in_task_household(m, p_task_id) is not true
  ) then
    raise exception 'membre hors du foyer de la tâche' using errcode = '42501';
  end if;

  delete from public.task_assignees where task_id = p_task_id;
  insert into public.task_assignees (task_id, member_id)
  select distinct p_task_id, m
    from unnest(p_member_ids) as m;

  get diagnostics v_inserted = row_count;
  return v_inserted;
```

Les nouveaux helpers proposés (recherche § Pattern 1) suivent la forme `private.has_valid_module_keys` : `language sql stable security definer set search_path = ''`, `revoke execute ... from public, anon; grant execute ... to authenticated, service_role`.

#### Bloc B — Modération Cercle (D-12) : étendre le DELETE, ne pas toucher le garde d'auteur

**Analog:** `supabase/migrations/0109_cercle_author_guards.sql:70-89` — *exact* pour la forme de la politique.

```sql
drop policy if exists posts_delete_admin on public.posts;
create policy posts_delete_admin on public.posts
  for delete using (
    author_id = private.current_member_id(household_id)
    or private.is_household_admin(household_id)
  );
-- identique pour post_comments_delete_admin et post_reactions_delete_admin (0109:77-89)
```

**Application à 0146 :** `drop policy if exists` + `create policy` sous les **mêmes noms**, avec une troisième branche ajoutée :
```sql
or (private.can_write_household(household_id) and private.is_managed_child(author_id))
```
`private.can_write_household` existe déjà (0006:77-85 : `household_role in ('admin','membre')`) — réutiliser, ne pas recréer. `private.is_household_admin` existe (0006:69-75).

Ne **pas** toucher : `guard_cercle_content_author` (0109:33-54, garde d'UPDATE), `guard_author_immutable` (0081), ni les INSERT/UPDATE. D-12 interdit la publication « au nom de ».

#### Bloc C — Trigger `meal_entries.member_ids` (seul trigger nécessaire, recherche § Pattern 4)

**Analog:** `supabase/migrations/0113_enfant_perimeter.sql:256-316` (`guard_gift_item_reserve`) — vérification avant `raise exception ... using errcode = '42501'`. Motif 0109:33-64 pour l'installation (`drop trigger if exists` + `create trigger ... before update on ... for each row`).

`meal_entries.member_ids` est le **seul** attributaire en tableau libre hors de la liste générée de 0007 (recherche § Pattern 4) : ni politique ni colonne unique, aucun RPC ne l'écrit → un trigger est indispensable ici.

#### Bloc D — Notifications adultes (D-23) : redéfinir depuis la définition **effective**

**Analog:** `supabase/migrations/0023_qualify_final_projection.sql:45-185` — la **dernière** définition de `private.push_reminder_notifications`.

**Leçon verbatim à reproduire (0116:1-8, citée dans la recherche § Piège 1) :** « toute redefinition DOIT partir de la definition effective (la derniere), jamais d'une version d'origine ». Les dernières définitions vivent dans **0023** (rappels) et **0022** (anniversaires) ; 0129/0130 ne redéfinissent que le dispatch (`dispatch_message_notifications`, `dispatch_push_notifications`), pas les sources. Lire 0022 et 0023 avant d'écrire les nouveaux corps.

Structure à conserver (0023:61-183) : CTEs nommées `rappels_taches` / `rappels_evenements` / `rappels_routines` (nommées ainsi car un CTE masque la table du même nom), `cross join bounds w`, projection finale qualifiée (`rappels_taches.user_id` et non `user_id` — AGENTS.md §2.7 A : `returns table (a,b)` rend `a`/`b` des variables).

Correction D-23 par source (recherche § Pattern 6, lignes de 0023 verbatim) :
- **Tâches** (0023:97-109) : remplacer le `left join lateral (... assignee.user_id is not null ...)` + `coalesce(assigned.member_id, t.created_by)` par « si aucun assignataire doté d'un compte, notifier les adultes du foyer » (`role in ('admin','membre')`).
- **Routines** (0023:135-150) : rejoindre les adultes du foyer, pas seulement le créateur.
- **Anniversaires** (0019:108-113, défini dans 0022) : `linked_member_id` enfant → adultes du foyer.
- **Événements** (0023:130-134) : pas d'attributaire, aucun changement.

`revoke all ... from public, anon, authenticated; grant execute ... to service_role;` (0023:193-194) inchangé — ces fonctions sont appelées par pg_cron.

---

### `supabase/tests/0144_managed_child_schema.sql` (test SQL, transform)

**Analog:** `supabase/tests/0140_household_disabled_modules.sql` — *exact* pour la structure.

**Structure** (0140-tests:32-146):
```sql
begin;

do $$
declare
  alice  uuid := testkit.auth_user('t140-alice@example.fr', 'Alice Menu');
  home   text := testkit.household(alice, 'Foyer Menu');
begin
  perform testkit.member(home, alice, 'Alice Menu', 'admin');
  insert into testkit.fx (key, user_id) values ('alice', alice);
  insert into testkit.fx (key, household_id) values ('home', home);
end;
$$;

-- (a) défaut : testkit.eq(count, 1)
-- (b) écriture admin : testkit.as_user(...) + set local role authenticated + testkit.affected
-- (c) membre refusé : affecté = 0 (PAS expect_denied — un update filtré par la RLS ne lève rien)
-- (e) garde de forme : testkit.expect_denied (erreur de contrainte check)
rollback;
```

**Discipline à suivre** (0140-tests:29-31 + AGENTS.md §2.7 D) : chaque assertion **bornée par foyer** (`where id = (select household_id from testkit.fx where key = 'home')`), jamais de total nu ; marques reconnaissables dans les données d'essai (`t140-`, `t145-`, `t146-`). Distinction critique : `affected = 0` pour un `UPDATE`/`DELETE` **filtré** par la RLS (ne lève rien), `testkit.expect_denied` pour une **erreur** (contrainte CHECK, RPC qui `raise`).

---

### `supabase/tests/0145_convert_managed_children.sql` (test SQL, batch)

**Analogues:** `supabase/tests/0133_replace_sets.sql` (transaction atomique + blocs `exception`) et `supabase/tests/0051_enfant_perimeter.sql` (acteurs par rôle, oracles RPC).

**Pattern bloc `exception`** (0133-tests:102-113):
```sql
begin
  perform public.replace_task_assignees('task_t133', array[zoe_m]);
  perform testkit.ok(false, 'un membre d''un autre foyer aurait dû être refusé');
exception when insufficient_privilege then
  perform testkit.ok(true, 'membre hors foyer refusé (42501)');
end;
```

**Pattern verrouillage de session** (`supabase/tests/_setup.sql:257-281` — lu verbatim, à citer dans le test) :
```sql
select testkit.as_user(user_id, 't145-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;
```
`testkit.as_user` pose **les deux** formes de claims (`request.jwt.claims` et `request.jwt.claim.sub`), sinon `auth.uid()` vaut NULL sur le snapshot self-hosted v0.8.2 et aucun utilisateur n'est reconnu.

**Spécifique à la conversion :** la suppression de `auth.users` est annulée par le `rollback` final, donc **inobservable** après rejeu (recherche § QO-5). Le test doit insérer un compte enfant via le fixture, exécuter la conversion, vérifier la suppression **dans la transaction**, puis laisser l'annulation — même discipline que `testkit.expect_denied` pour une écriture censée échouer. Prouver « ni session ni moyen d'agir » : `set local role authenticated` avec un `sub` absent de `auth.users` → 0 ligne partout (ENF-04).

---

### `supabase/tests/0146_child_behavior_guards.sql` (test SQL, request-response)

**Analog principal:** `supabase/tests/0051_enfant_perimeter.sql:1-41` — *exact* pour la forme « acteurs par rôle ».

```sql
do $$
declare
  alice uuid := testkit.auth_user('e14-alice@example.fr', 'Alice Quatorze');
  kid   uuid := testkit.auth_user('e14-kid@example.fr', 'Noe Quatorze');
  home_a text := testkit.household(alice, 'Foyer Quatorze A');
  alice_m text := testkit.member(home_a, alice, 'Alice Quatorze', 'admin', 'accent');
  kid_m   text := testkit.member(home_a, kid, 'Noe Quatorze', 'enfant', 'amber');
begin
  ...
end;
$$;
```

**Oracles RPC à réutiliser (0051-tests:17-21 + 0113:276-279) :** SQLSTATE + message en français, `42501` gestion/écriture, `P0002` pour les oracles « trouvé » ; message **sans donnée** (« jamais de donnée dans un refus », motif 0113).

**Cas à couvrir** (recherche § Phase Requirements → Tests) : délégation succès (ENF-02) ; écriture directe `completed_by = enfant` → 0 ligne **et non `raise`** (ENF-02 négatif) ; adulte→adulte refusé (D-13) ; insertion Cercle `author_id = enfant` refusée, DELETE adulte autorisé (D-12) ; adulte ne supprime pas un post d'un **autre adulte** ; notification adulte si l'attributaire seul est un enfant (D-23) ; zéro destinataire enfant (D-23).

---

### `app/src/modules/parametres/components/members-panel.tsx` (component, CRUD)

**Analog : le fichier lui-même** — étendre, ne pas réécrire. Trois gabarits existants à suivre pour la fiche enfant.

**Gabarit 1 — ConfirmDialog de suppression** (122-145), modèle pour la suppression de profil enfant (D-04 : traces conservées) :
```tsx
<ConfirmDialog
  open={Boolean(target)}
  onOpenChange={(open) => { if (!open) setPendingRemoval(null); }}
  title={target ? `Retirer ${target.display_name} du foyer ?` : 'Retirer ce membre ?'}
  description={isLastAdmin ? '...' : 'Cette personne perdra l'accès au foyer. Ses messages et ses contributions restent dans l'historique.'}
  confirmLabel="Retirer du foyer"
  onConfirm={async () => {
    if (!target) return;
    try {
      await removeMember(target.id);
      setMembers(members.filter((member) => member.id !== target.id));
      toast(`${target.display_name} ne fait plus partie du foyer.`);
    } catch (removeError) {
      toast(removeError instanceof Error ? removeError.message : 'Retrait impossible.', 'error');
    } finally {
      setPendingRemoval(null);
    }
  }}
/>
```

**Gabarit 2 — Dialog formulaire avec état pending** (147-192), modèle pour la fiche enfant :
```tsx
<Dialog open={renaming !== null} onOpenChange={(open) => { if (!open) setRenaming(null); }}>
  <DialogContent>
    <DialogHeader>
      <p className="eyebrow">Foyer</p>
      <DialogTitle>Renommer {renaming?.display_name}</DialogTitle>
    </DialogHeader>
    <form noValidate className="grid gap-3.5" onSubmit={async (event) => {
      event.preventDefault();
      if (!renaming) return;
      setRenamePending(true);
      setRenameError(null);
      try {
        await renameMember(renaming.id, draftName);
        setMembers(members.map((m) => (m.id === renaming.id ? { ...m, display_name: draftName.trim() } : m)));
        setRenaming(null);
        toast('Membre renommé.');
      } catch (renameError) {
        setRenameError(renameError instanceof Error ? renameError.message : 'Renommage impossible.');
      } finally {
        setRenamePending(false);
      }
    }}>
      <Field label="Prénom et nom" error={renameError ?? undefined}>
        {(props) => <Input {...props} value={draftName} onChange={(e) => setDraftName(e.target.value)} autoComplete="off" />}
      </Field>
      <DialogActions>
        <Button variant="secondary" onClick={() => setRenaming(null)}>Annuler</Button>
        <Button type="submit" icon="check" disabled={renamePending}>
          {renamePending ? 'Enregistrement…' : 'Renommer'}
        </Button>
      </DialogActions>
    </form>
  </DialogContent>
</Dialog>
```

**Gabarit 3 — lignes de membre avec tri et badge** (49-114) : conserver `roleOrder` (admin, membre, enfant) pour ranger les fiches enfants en fin de liste ; conserver le `Badge tone={... member.role === 'enfant' ? 'amber' : ...}` (67-69) — le badge ambre est le **seul** marqueur visuel du statut enfant (UI-SPEC §Color). Le `roleChangeNotice` (116-120) est le modèle de la notice « n'a pas de compte » (`bg-bg text-[12px] text-muted`).

**Contraintes UI-SPEC à respecter :** aucun nouveau composant UI générique ; la fiche assemble Dialog + Field + Input + Select + Badge + Checkbox + ConfirmDialog + MemberAvatar + Toast + EmptyState existants. Bouton d'action destructeur : `variant="ghost" size="sm" className="hover:bg-coral-soft hover:text-coral-text"` (100-108). Âge calculé : `text-[11px] text-muted` à côté de la date de naissance (UI-SPEC §Typography). Icônes du jeu existant (`edit`, `trash`, `check`, `people`, `info`) via `@/components/shared/icon`.

**Note :** `useIsAdmin` (21) contrôle aujourd'hui les actions — D-01 veut **tout adulte** (`admin` ET `membre`). Le plan doit vérifier l'existence d'un hook `useIsAdult` ou étendre la condition. `useIsAdmin` est importé depuis `@/stores/household-store`.

---

### `app/src/modules/parametres/api.ts` (wrapper RPC, request-response)

**Analog : le fichier lui-même.** Trois modèles à suivre.

**Modèle 1 — RPC `authenticated` simple avec repli local** (139-153, `setMemberRole`), modèle pour `createManagedChild` / `updateManagedChild` / `deleteManagedChild` :
```ts
export async function setMemberRole(memberId: string, role: Role): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { error } = await supabase.rpc('set_member_role', { p_member_id: memberId, p_role: role });
      if (error) throw new Error(error.message || 'Changement de rôle impossible.');
      return;
    } catch (requestError) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('Hors ligne : reconnectez-vous pour changer un rôle.');
      }
      throw requestError instanceof Error ? requestError : new Error('Changement de rôle impossible.');
    }
  }
  await data.update('household_members', memberId, { role });
}
```

**Modèle 2 — Edge Function avec lecture d'erreur** (176-202, `deleteHousehold`), si `linkManagedChild` passe par une Edge Function :
```ts
export async function deleteHousehold(householdId: string): Promise<HouseholdDeleteResult> {
  if (!isSupabaseConfigured || !supabase) throw new Error('Connectez-vous pour supprimer le foyer.');
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('Hors ligne : reconnectez-vous pour supprimer le foyer.');
  const { data: body, error, response } = await supabase.functions.invoke('household-delete', { body: { householdId } });
  if (error) throw new Error(await readFunctionError(response, 'Suppression du foyer impossible pour le moment.'));
  return body as HouseholdDeleteResult;
}
```

**Modèle 3 — écriture de colonne tableau** (124-126, `saveDisabledModules`), modèle pour l'écriture de `managed_modules` :
```ts
export async function saveDisabledModules(householdId: string, disabledModules: string[]): Promise<HouseholdRow> {
  return data.update<HouseholdRow>('households', householdId, { disabled_modules: disabledModules });
}
```

---

### `app/src/modules/taches/api.ts` + `app/src/modules/routines/api.ts` (wrapper RPC, request-response)

**Analogues : les fichiers eux-mêmes.**

`app/src/modules/taches/api.ts:54-56` — `setTaskAssignees` passe déjà par `data.replaceSet('task_assignees', taskId, memberIds)`, donc par `public.replace_task_assignees` (0133). La clause de module D-06 s'ajoute **dans cette RPC serveur**, pas dans le client (recherche § Pattern 4 : « garder dans `replace_task_assignees` recommandé : le RPC est la seule écriture réelle »). Aucun changement de signature client si le RPC existant est enrichi en place.

`app/src/modules/routines/api.ts:129-151` — `markOccurrenceDone` écrit **directement** `routine_completions.completed_by` via `data.update` / `data.create`. C'est **l'écriture directe qu'il faut remplacer par un RPC** (recherche § Pattern 4 : « la RLS actuelle renvoie 0 ligne en silence — ni erreur ni effet »). Nouveau RPC serveur `SECURITY DEFINER` avec `actor = auth.uid()` ; le client envoie `p_routine_id`, `p_occurrence_date`, et la complétion porte `completed_by = p_member_id` (enfant) + `actor_member_id = auth.uid()` résolu (ENF-03).

Si un nouvel ensemble traverse `replaceSet`, ajouter l'entrée dans `app/src/lib/data/set-tables.ts:46-83` (`SET_TABLES`) — la correspondance est déclarée **une fois** là, jamais dupliquée dans les deux adaptateurs (commentaire 0133:1-17). Le test de contrat `app/src/lib/data/replace-set-contract.test.ts` refuse une table sans sa fonction SQL.

---

### `app/src/types/database.ts` (définition de type, —)

**Analog : le fichier lui-même.**

`app/src/types/database.ts:85-94` :
```ts
export interface HouseholdMemberRow {
  id: Uuid;
  household_id: Uuid;
  user_id: Uuid | null; // null pour un profil géré par un parent
  display_name: string;
  avatar_url: string | null;
  color_tag: MemberColorTag;
  role: Role;
  created_at: IsoDateTime;
}
```
La comment existante (ligne 88) prouve que la forme sans compte est déjà anticipée. Ajouter `birth_date: IsoDateTime | null;` et `managed_modules: string[];`. `MemberColorTag` (96) et `Role` (12) inchangés — `role: Role` couvre déjà `'enfant'`.

---

### `app/src/lib/data/seed.ts` (fixture, transform)

**Analog : le fichier lui-même.** `app/src/lib/data/seed.ts:197-206` — le membre `Noé Martin` est **déjà** `user_id: null, role: 'enfant'` : la forme cible existe déjà côté démo. Ajouter `birth_date` + `managed_modules` (socle D-06) pour que l'UAT/Playwright voie la fiche complète.

---

### `app/src/modules/cercle/hooks/use-cercle.ts` (hook, request-response)

**Analog : le fichier lui-même.** `app/src/modules/cercle/hooks/use-cercle.ts:401-414` :
```ts
// D-07 : suppression unitaire strictement auteur — plus de branche admin.
const canDelete = useCallback((post: FeedPost) => post.mine, []);
const canEditPost = useCallback((post: FeedPost) => post.mine, []);
const canDeleteComment = useCallback(
  (comment: FeedComment) => comment.authorId === currentMemberId,
  [currentMemberId],
);
```

**Application D-12 :** `canDelete` gagne une branche « modération d'un auteur enfant géré » : `post.mine || (isAdult && isManagedChildAuthor(post.authorId))`. Le serveur porte la même règle via la politique DELETE étendue (Bloc B) — l'UI n'offre l'affordance que si le serveur l'autorise. `isAdult` nécessite l'état du membre courant (le hook expose déjà `isAdmin` à la ligne 423 ; `useIsAdmin` du store household). La suppression reste un `data.remove` direct (`app/src/modules/cercle/api.ts:189-191` `removeComment`) — la politique DELETE étendue porte l'autorisation, aucun RPC nouveau n'est requis.

---

## Shared Patterns

### Résolution de l'acteur côté base (toutes les RPCs nouvelles)
**Source:** `supabase/migrations/0036_set_member_role.sql:31-50`
**Apply to:** `0146` — toutes les RPCs « au nom de » et de liaison.
```sql
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  ...
  perform private.assert_household_writer(v_household_id, v_actor);  -- adulte (admin ou membre), 0037:28
```
Ne **jamais** déclarer l'acteur comme paramètre. `private.assert_household_writer` existe déjà (`0037_ardoise_write_roles.sql:28`), `private.can_write_household` (0006:77-85), `private.is_household_admin` (0006:69-75), `private.current_member_id` (0006:20-33). Réutiliser, ne pas recréer.

### Guardes écrites `is not true`, jamais `not (...)`
**Source:** `supabase/migrations/0133_replace_sets.sql:35-40` (commentaire verbatim)
**Apply to:** toutes les gardes des nouvelles RPCs.
```sql
if private.can_write_task(p_task_id) is not true then
  raise exception 'écriture refusée sur cette tâche' using errcode = '42501';
end if;
```
Raison : les helpers renvoient NULL pour un appelant hors foyer, `not NULL` vaut NULL, une condition NULL ne déclenche pas le `raise` — un inconnu passerait.

### `search_path = ''` + noms entièrement qualifiés (AGENTS.md §2.7 A)
**Source:** tous les helpers/RPCs (0006, 0036, 0037, 0133, 0140)
**Apply to:** chaque nouvelle fonction de 0144-0146.
Chaque fonction porte `security definer set search_path = ''` et référence `public.household_members`, `public.auth.users`, etc. explicitement. Un `search_path` vide ne résout **aucun** nom. `scripts/check-sql-statique.py` vérifie les 8 formes.

### Droits `EXECUTE` — deux familles distinctes
**Source:** `supabase/migrations/0036_set_member_role.sql:69-82` (RPC client) et `0140_household_disabled_modules.sql:62-63` (helper de CHECK)
**Apply to:** chaque nouvelle fonction, selon son rôle.
```sql
-- RPC appelé par le client : EXECUTE à authenticated SEUL
revoke all on function public.set_member_role(text, text) from public, anon;
grant execute on function public.set_member_role(text, text) to authenticated;

-- Helper appelé depuis une CHECK : EXECUTE à authenticated ET service_role
-- (une CHECK s'évalue avec le rôle qui écrit la ligne)
revoke execute on function private.has_valid_module_keys(text[]) from public, anon;
grant execute on function private.has_valid_module_keys(text[]) to authenticated, service_role;

-- Fonction appelée par pg_cron : EXECUTE à service_role SEUL (0023:193-194)
revoke all on function private.push_reminder_notifications(timestamptz) from public, anon, authenticated;
grant execute on function private.push_reminder_notifications(timestamptz) to service_role;
```

### Refus en français, sans donnée, errcode invariant
**Source:** `supabase/migrations/0113_enfant_perimeter.sql:276-279`
**Apply to:** tous les nouveaux refus de 0146.
```sql
raise exception 'réserve enfant refusée : voie attribuée uniquement' using errcode = '42501';
```
Codification : `28000` session manquante, `22023` paramètre invalide, `42501` écriture/refus d'accès, `P0002` introuvable, `23514` contrainte, `23505` clé primaire. Les oracles de 0113 restent inchangés.

### Bornage par foyer des assertions de test (AGENTS.md §2.7 D)
**Source:** `supabase/tests/0140_household_disabled_modules.sql:29-31, 54-58`
**Apply to:** `supabase/tests/0144`, `0145`, `0146`.
```sql
select testkit.eq(
  testkit.count($q$select 1 from public.households
                  where id = (select household_id from testkit.fx where key = 'home')
                    and disabled_modules = '{}'::text[]$q$),
  1::bigint, 'le foyer du test démarre tout activé');
```
En `postgres` la RLS est court-circuitée : un comptage global échouerait pour une raison sans rapport. Marques reconnaissables (`t144-`, `t145-`, `t146-`) dans les données d'essai plutôt que par identifiant.

### Chaîne de vérification avant commit (AGENTS.md §2.7)
**Source:** AGENTS.md §2.7 (lecture obligatoire)
**Apply to:** chaque tâche du plan.
```sh
cd app && npm run typecheck && npm test && npm run build
cd app && npm run test:e2e
python3 scripts/check-sql-statique.py
python3 scripts/test-check-sql-statique.py
sh scripts/test-db.sh
sh scripts/test-dispatch-push.sh   # si appareil abonné ; sinon déclaré non exécutable
```
Aucun linter n'est configuré — une directive de linter est **proscrite**.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md` | documentation | — | Correction de texte pure (D-12) : remplacer « réagir dans le Cercle » par « modérer le Cercle ». Aucun analogue de code ; se fait sur les fichiers eux-mêmes. `REQUIREMENTS.md:11` dit encore « réagir dans le Cercle » et le critère de succès n°2 de `ROADMAP.md` dit « réagit dans le Cercle » — D-12 les contredit explicitement. |

---

## Notes pour le planificateur

1. **Le plan peut regrouper `0144-0146`** — l'ordre d'application est contraint, pas l'nombre de fichiers (recherche § Structure). Si un seul fichier, garder l'ordre interne : schéma → conversion (et joint de la CHECK d'invariant) → comportement.
2. **La CHECK d'invariant `(user_id is null) = (role = 'enfant')` se joint après la conversion** (pas dans 0144 seul) : sinon les lignes enfant avec compte existantes la violeraient dès l'ajout.
3. **A1/A2 du journal des hypothèses** (recherche § Journal) : `delete from auth.users` depuis une migration exécutée en `postgres` — à confirmer par une sonde SQL à la première application réelle ; variante RPC-first via l'API admin Supabase si la migration échoue.
4. **A3** : vérifier par `grep` que `is_managed_child`, `managed_child_module_allowed`, `assert_child_module_allowed` ne collisionnent pas avec une définition effective existante avant de les écrire (piège 1).
5. **`useIsAdmin` → `useIsAdult`** : D-01 veut tout adulte (admin ET membre). Vérifier l'existence d'un hook `useIsAdult` dans `@/stores/household-store`, sinon le plan le crée en suivant le gabarit de `useIsAdmin`.
6. **Piège 2 (RLS annule silencieusement à 0 ligne)** : pour ENF-02, les tests doivent utiliser `testkit.expect_denied` sur le RPC, **pas** un comptage à 0 sur l'écriture directe — le comptage à 0 ne prouve pas que la délégation est impossible, seulement qu'elle n'a pas eu lieu.

---

## Metadata

**Analog search scope:** `supabase/migrations/0006,0022,0023,0036,0037,0109,0113,0129,0130,0132,0133,0140,0142`, `supabase/tests/_setup,0051,0133,0140`, `app/src/modules/parametres`, `app/src/modules/cercle`, `app/src/modules/taches`, `app/src/modules/routines`, `app/src/lib/data`, `app/src/lib/modules`, `app/src/types`
**Files scanned:** 22 analogues lus (migrations, tests, composants, API, types, seed)
**Pattern extraction date:** 2026-10-25
