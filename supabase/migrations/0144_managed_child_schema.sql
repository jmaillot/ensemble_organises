-- 0144_managed_child_schema.sql
-- Socle schématique des profils enfants gérés par le parent (phase 25).
--
-- MODÈLE D-22 : un profil enfant est une ligne `household_members` avec
-- `user_id NULL` et `role = 'enfant'`. La ligne membre est l'unique racine
-- d'un profil enfant — aucune entité enfant globale : un enfant de deux
-- foyers est deux lignes indépendantes. Ce modèle préserve la purge par
-- foyer de RGDP-06 (phase 27) sans interaction avec la définition
-- « à qui correspond la donnée ».
--
-- COLONNES POSÉES (D-04, D-05, D-06) :
--  - `managed_modules text[]` : les espaces où l'enfant peut figurer
--    (restriction PAR ENFANT, D-05). Socle D-06 : '{taches,routines,
--    anniversaires,menu}' — jamais '{}' qui signifierait « tout éteint ».
--  - `birth_date date` : date de naissance nullable (D-05, âge calculé
--    affiché côté client via date-fns).
--  - `deleted_at timestamptz` : support de l'archivage D-04. L'archivage
--    pose cette marque au lieu de `delete`, neutralisant les cascades 0003
--    (task_assignees/routine_assignees en `on delete cascade`, et
--    routine_completions.completed_by en `on delete set null`). Les traces
--    où l'enfant est attributaire sont conservées.
--
-- CONTRAINTE DE FORMAT (pas de catalogue) : `managed_modules` est validée
-- par `private.has_valid_module_keys` (0140) — format
-- `^[a-z][a-z_]{1,39}$` sans doublon. La validité SÉMANTIQUE (la clé
-- désigne un espace réel du catalogue) reste au client : la base ne connaît
-- pas la liste des espaces (0140:22-24).
--
-- L'INVARIANT enfant ⟺ sans session rejoint en 0145 APRÈS la conversion
-- des comptes enfants existants — ne PAS l'ajouter ici (les lignes enfant
-- avec compte héritées violeraient immédiatement la CHECK avant conversion).
--
-- AUCUNE POLITIQUE RLS NOUVELLE. Les colonnes suivent les politiques
-- `household_members` existantes (0007:267-293) : lecture par appartenance
-- au foyer, écriture admin-seule.

begin;

-- ---------------------------------------------------------------------------
-- Re-grant idempotent : les grants EXECUTE de `has_valid_module_keys`
-- existent déjà depuis 0140 (lignes 62-63), mais ils sont réitérés ici pour
-- garantir l'état sur les piles restaurées sans dépendre de l'ordre
-- d'application (une contrainte CHECK s'évalue avec le rôle qui écrit la
-- ligne — sans EXECUTE à `authenticated`, chaque écriture échouerait).
-- ---------------------------------------------------------------------------
revoke execute on function private.has_valid_module_keys(text[]) from public, anon;
grant execute on function private.has_valid_module_keys(text[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- managed_modules : espaces où l'enfant peut figurer (D-05/D-06).
-- Socle restreint par défaut : '{taches,routines,anniversaires,menu}'.
-- ---------------------------------------------------------------------------
alter table public.household_members
  add column if not exists managed_modules text[] not null
    default '{taches,routines,anniversaires,menu}'::text[]
    constraint chk_members_valid_modules check (private.has_valid_module_keys(managed_modules));

comment on column public.household_members.managed_modules is
  'Espaces où l''enfant géré peut figurer (restriction par enfant, D-05). Socle D-06 : tâches, routines, anniversaires, menu. La validité sémantique (catalogue réel) reste au client.';

-- ---------------------------------------------------------------------------
-- birth_date : date de naissance nullable (D-05).
-- L'âge calculé est affiché côté client (date-fns, differenceInYears/Months).
-- ---------------------------------------------------------------------------
alter table public.household_members
  add column if not exists birth_date date;

comment on column public.household_members.birth_date is
  'Date de naissance (D-05). Nullable : seuls les profils enfants la portent. Un adulte avec date de naissance est toléré — aucune règle ne l''interdit.';

-- ---------------------------------------------------------------------------
-- deleted_at : support de l'archivage D-04 (suppression-préservant-les-traces).
-- Le RPC d'archive (0146) pose cette marque au lieu de `delete`, neutralisant
-- les cascades 0003 qui purgeraient les traces (task_assignees/routine_assignees
-- en `on delete cascade`, completed_by en `on delete set null`).
-- ---------------------------------------------------------------------------
alter table public.household_members
  add column if not exists deleted_at timestamptz;

comment on column public.household_members.deleted_at is
  'Marque d''archivage (D-04) : le profil a été supprimé mais ses traces sont conservées. Posée par le RPC d''archivage (0146) au lieu d''un DELETE qui déclencherait les cascades 0003.';

commit;
