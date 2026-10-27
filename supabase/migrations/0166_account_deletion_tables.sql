-- 0166_account_deletion_tables.sql
-- Socle SQL de la suppression de compte RGPD (phase 27, plan 27-01).
--
-- Quatre pièces, dans cet ordre :
--   1. Colonne d'état « ancien membre » `household_members.account_deleted_at`
--      (D-03) : la ligne membre RESTE en base, les sélecteurs l'excluent.
--   2. Table `account_deletion_requests` — machine à états de la demande,
--      garde D-06 « une seule demande active » posée EN BASE (index unique
--      partiel, copie du motif `gdpr_export_jobs_one_active` 0158:110-112).
--   3. Table `account_deletion_restorations` — instantané D-04 de
--      restauration (ancien nom/avatar du profil ET de la ligne membre).
--   4. Audit FK vers `auth.users` (RGDP-05) : les cascades dangereuses sont
--      converties VERS L'AVANT (jamais de réécriture, AGENTS §2.7 A) AVANT
--      que la purge J+30 ne soit armée — sans elles, `delete from auth.users`
--      purgerait les tokens, partages et lignes membres du foyer.
--
-- Pièce d'audit RGDP-05 (exigée par la ROADMAP critère 3) : la règle retenue
-- par table est consignée en commentaire devant chaque ALTER, après lecture
-- des définitions EFFECTIVES en base (pas supposées depuis 0002) :
--
--   | Table.colonne                     | Définition effective lue en base            | Règle retenue |
--   |-----------------------------------|---------------------------------------------|---------------|
--   | profiles.id                       | cascade (0002:15)                           | inchangée — purge du profil, l'instantané D-04 a copié nom/avatar |
--   | households.created_by             | set null (0002:33)                          | inchangée — le foyer survit, créateur anonymisé (D-01) |
--   | household_members.user_id         | cascade (0002:47)                           | ALTER → set null — sinon D-03 violée (pitfall 2 du research) |
--   | household_invite_tokens.created_by| cascade NOT NULL (0002:71)                  | ALTER → set null + colonne nullable (règle F5 : jamais de purge d'historique, D-01) |
--   | gift_list_invites.created_by      | cascade NOT NULL (0079:42)                  | ALTER → set null + colonne nullable (F5) |
--   | trip_invites.created_by           | cascade NOT NULL (0118:109)                 | ALTER → set null + colonne nullable (F5) |
--   | recipes.created_by                | NE référence PAS auth.users : `references household_members(id) on delete set null` (convertis lors de la campagne 0145/0150 — le research citait 0122:140, périmé). La ligne membre survit (set null sur user_id), donc les recettes du foyer survivent déjà — D-01 satisfaite sans ALTER. | aucune modification, consignée pour l'audit |
--   | recipe_shares.created_by          | cascade NOT NULL vers auth.users — omission de l'inventaire du research, trouvée en relisant les définitions effectives (Partage d'une recette du foyer = donnée partagée : la purge ne doit pas l'emporter, même menace T-27-02). | ALTER → set null + colonne nullable (F5) |
--   | push_subscriptions.user_id        | cascade (0018:65)                           | inchangée — abonnements morts avec le compte |
--   | notification_reads.user_id        | cascade (0046:22)                           | inchangée |
--   | gdpr_export_jobs.user_id          | cascade (0158:92)                           | inchangée — jobs du compte morts |
--
-- Invariant enfant (0145) : `chk_members_managed_child` impose
-- `(user_id is null) = (role = 'enfant')`. La conversion de
-- `household_members.user_id` vers `set null` ferait passer le user_id d'une
-- ligne ADULTE à NULL lors de la purge J+30 — la CHECK refuserait et le
-- `delete from auth.users` échouerait en bloc. La contrainte est donc
-- assouplie VERS L'AVANT dans la même migration : l'état « ancien membre »
-- (`account_deleted_at is not null`) est admis avec user_id NULL, l'invariant
-- reste strict pour toutes les lignes vivantes.

begin;

-- ---------------------------------------------------------------------------
-- 1. Colonne d'état « ancien membre » (D-03, hypothèse F3 du plan)
-- ---------------------------------------------------------------------------
alter table public.household_members
  add column account_deleted_at timestamptz;

comment on column public.household_members.account_deleted_at is
  'Posé à la demande de suppression de compte : la ligne devient « ancien membre ». Distincte de deleted_at (0144, profils enfants) et de role ; les sélecteurs excluent les lignes où l''une des deux colonnes est posée.';

-- Pas d'index spéculatif ici : aucun sélecteur n'a exprimé le besoin
-- (décision du plan — s'abstenir tant que rien ne le demande).

-- L'invariant 0145 doit admettre l'état « ancien membre » (voir l'entête) :
-- une ligne adulte dont le compte a été purgé a user_id NULL SANS être enfant.
alter table public.household_members drop constraint chk_members_managed_child;
alter table public.household_members
  add constraint chk_members_managed_child
  check (
    account_deleted_at is not null
    or (user_id is null) = (role = 'enfant')
  );
comment on constraint chk_members_managed_child on public.household_members is
  'Invariant 0145 assoupli en 0166 : une ligne « ancien membre » (account_deleted_at posé) peut avoir user_id NULL sans être un enfant. L''invariant reste strict pour toutes les lignes vivantes.';

-- ---------------------------------------------------------------------------
-- 2. Table account_deletion_requests (motif 0158:90-119)
-- ---------------------------------------------------------------------------
create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'demandee'
    check (status in ('demandee', 'rappellee', 'annulee', 'purgee')),
  purge_due_at timestamptz not null default now() + interval '30 days',
  rappel_envoye boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- D-06 : une seule demande ACTIVE par utilisateur. La garde vit EN BASE
-- (jamais une vérification applicative seule — course concurrentielle).
-- Les statuts terminaux (annulee, purgee) n'y participent pas : une demande
-- annulée peut être reposée immédiatement (D-06 du contexte phase 27).
create unique index account_deletion_requests_one_active
  on public.account_deletion_requests (user_id)
 where status in ('demandee', 'rappellee');

alter table public.account_deletion_requests enable row level security;

-- RLS : select limité à ses propres lignes ; AUCUNE politique d'écriture
-- client (0158:118-123) — toute écriture passe par les RPC 0167.
create policy account_deletion_requests_select_own
  on public.account_deletion_requests
  for select
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Table account_deletion_restorations (instantané D-04)
-- ---------------------------------------------------------------------------
-- NOTE : `former_member_row_id` et `household_id` sont `text` — les clés
-- primaires de `household_members` et `households` sont `text` (0002), pas
-- uuid. Le plan supposait uuid : corrigé vers le schéma effectif.
-- `former_member_display_name` / `former_member_avatar_url` portent l'état de
-- la ligne membre AVANT déshumanisation (D-02 s'applique aux deux surfaces :
-- profil ET ligne membre) — nécessaire à la restauration D-05.
create table public.account_deletion_restorations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  former_display_name text,
  former_avatar_url text,
  former_member_row_id text not null,
  former_member_display_name text,
  former_member_avatar_url text,
  household_id text not null,
  created_at timestamptz not null default now()
);

alter table public.account_deletion_restorations enable row level security;

-- AUCUNE politique client (T-27-04) : l'instantané porte l'ancien nom et
-- l'ancien avatar — lecture/écriture exclusivement via les RPC SECURITY
-- DEFINER (0167) et les fonctions service_role du plan 02.

-- ---------------------------------------------------------------------------
-- 4. Audit FK RGDP-05 — ALTER vers l'avant (définitions effectives vérifiées
--    en base avant cette migration ; noms conservés, seule la clause
--    `on delete` change).
-- ---------------------------------------------------------------------------

-- a) household_members.user_id : cascade → set null. SANS cette conversion,
--    la purge supprimerait la ligne membre et, par les cascades 0150, tout
--    l'historique attribué (pitfall 2). L'instantané D-04 a copié l'ancien
--    user_id pour la restauration.
alter table public.household_members
  drop constraint household_members_user_id_fkey;
alter table public.household_members
  add constraint household_members_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;

-- b) household_invite_tokens.created_by : cascade NOT NULL → set null.
--    Le contenu reste au foyer, l'attribut créateur devient NULL (F5/D-01).
alter table public.household_invite_tokens
  alter column created_by drop not null;
alter table public.household_invite_tokens
  drop constraint household_invite_tokens_created_by_fkey;
alter table public.household_invite_tokens
  add constraint household_invite_tokens_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;

-- c) gift_list_invites.created_by : idem (F5).
alter table public.gift_list_invites
  alter column created_by drop not null;
alter table public.gift_list_invites
  drop constraint gift_list_invites_created_by_fkey;
alter table public.gift_list_invites
  add constraint gift_list_invites_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;

-- d) trip_invites.created_by : idem (F5).
alter table public.trip_invites
  alter column created_by drop not null;
alter table public.trip_invites
  drop constraint trip_invites_created_by_fkey;
alter table public.trip_invites
  add constraint trip_invites_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;

-- e) recipe_shares.created_by : idem — omission de l'inventaire du research,
--    trouvée en lisant les définitions effectives (voir table d'audit
--    ci-dessus). Une part de recette du foyer est une donnée partagée.
alter table public.recipe_shares
  alter column created_by drop not null;
alter table public.recipe_shares
  drop constraint recipe_shares_created_by_fkey;
alter table public.recipe_shares
  add constraint recipe_shares_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;

-- f) recipes.created_by : AUCUN ALTER — la contrainte effective référence
--    `household_members(id) on delete set null` (convertis en 0145/0150) et
--    la ligne membre survit désormais à la purge (a). Les recettes du foyer
--    survivent donc : D-01 déjà satisfaite. Consigné pour l'audit RGDP-05.

commit;
