-- 0170_account_deletion_multifoyer_snapshot.sql
-- Correction vers l'avant de la suppression de compte (phase 27, plan 27-04
-- — clôture CR-02, WR-01, WR-02, WR-03 de 27-REVIEW.md). AUCUNE migration
-- appliquée n'est réécrite : 0167/0168/0169 restent tels quels, leurs
-- fonctions sont remplacées ici par create or replace (AGENTS §2.7 A).
--
-- QUATRE vérités, posées une fois pour toutes (AGENTS §2.7 I) :
--
--   1. CR-02 — L'instantané de restauration est DÉSORMAIS PAR LIGNE
--      `household_members`. En multi-foyer, l'ancien 0167 ne copiait que la
--      ligne d'ancrage (la plus ancienne) : à l'annulation, les AUTRES foyers
--      de l'utilisateur étaient réécrits avec le nom d'ancrage. Désormais
--      chaque ligne membre est instantanée AVANT déshumanisation dans
--      `private.account_deletion_restoration_members`, et l'annulation
--      restaure CHAQUE ligne depuis SA ligne d'instantané. La déshumanisation
--      reste globale et homogène (« Ancien membre » partout, D-01/D-02) ;
--      seule la restauration devient fidèle foyer par foyer (D-04/D-05).
--      Les clés `household_members.id` / `households.id` sont `text` (0002) :
--      `member_row_id` et `household_id` sont donc `text`, comme dans
--      l'instantané parent 0166 (même correction de supposition uuid).
--
--   2. WR-02 — Le manifest de médias porte le `bucket_id` de chaque objet
--      (`storage.objects` n'identifie pas un objet par son seul chemin :
--      deux buckets privés peuvent porter un même `name`). L'Edge unifiée
--      reçoit le bucket par ligne via `public.deletion_media_claim` et ne
--      peut plus marquer « purged » un objet qu'elle n'a pas trouvé (jumeau
--      cross-bucket). L'unicité du manifest passe de
--      (household_id, storage_path) à (household_id, storage_path, bucket_id)
--      — sinon le `on conflict do nothing` de la purge écraserait le second
--      jumeau, réintroduisant la confusion que bucket_id devait lever.
--
--   3. WR-01 — Le rappel J-7 est BEST-EFFORT, disposition acceptée
--      (RGDP-03) : le flag `rappel_envoye` (et le statut `rappellee`) est
--      posé DANS la transaction AVANT `net.http_post`. Un échec de livraison
--      perd donc l'alerte — le cron ne repose jamais le flag, et l'Edge ne
--      rejoue qu'une fenêtre récente de demandes. C'est assumé : l'alternative
--      (flag après réponse) créerait des doublons à chaque redrive. La vérité
--      remplace le commentaire de 0168 (« le redrive du cron est le retry »),
--      faux en cas d'échec de livraison.
--
--   4. WR-03 — AUCUN sélecteur de l'application ne filtre
--      `household_members.account_deleted_at` : la colonne est un marqueur
--      d'audit et l'ancrage de la restauration, pas un filtre. La colonne
--      `deleted_at` (0144), elle, est filtrée là où les sélecteurs d'enfants
--      le font. Le commentaire de colonne de 0166 affirmait l'inverse — il
--      est remplacé ici par la vérité (metadata, pas une réécriture de
--      migration).
--
-- Formes héritées : SECURITY DEFINER + `search_path = ''`, tout nom de table
-- qualifié, privilèges prouvés en migration (motif 0074), compteurs bornés
-- dans les tests (AGENTS §2.7 D).

begin;

-- ---------------------------------------------------------------------------
-- 1. Instantané de restauration PAR LIGNE membre (CR-02, D-04)
-- ---------------------------------------------------------------------------
create table private.account_deletion_restoration_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  member_row_id text not null references public.household_members (id) on delete cascade,
  household_id text not null,
  former_member_display_name text not null,
  former_member_avatar_url text,
  created_at timestamptz not null default now(),
  unique (user_id, member_row_id)
);

comment on table private.account_deletion_restoration_members is
  'Instantané de restauration D-04 PAR LIGNE household_members (0170, clôture CR-02) : une ligne par foyer de l''utilisateur, capturée AVANT la déshumanisation. À l''annulation (cancel_account_deletion), chaque ligne membre est restaurée depuis SA ligne d''instantané. user_id porte la purge J+30 (cascade auth.users) ; member_row_id cascade avec la ligne membre (un instantané sans ligne à restaurer n''a plus de sens) ; former_member_avatar_url NULL est un état porteur (jamais coalesce).';

alter table private.account_deletion_restoration_members enable row level security;

-- AUCUNE politique (T-27-15) : la table porte l'ancienne identité — lecture
-- et écriture exclusivement via les RPC SECURITY DEFINER de 0167/0170 et la
-- purge service_role du plan 02.
revoke all on private.account_deletion_restoration_members
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. request_account_deletion — instantané de TOUTES les lignes membres
-- ---------------------------------------------------------------------------
create or replace function public.request_account_deletion(p_user_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_request_id uuid;
  v_profile_name text;
  v_profile_avatar text;
  v_member_id text;
  v_member_name text;
  v_member_avatar text;
  v_household_id text;
  v_had_active boolean;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if v_actor is distinct from p_user_id then
    raise exception 'un utilisateur ne peut agir que sur sa propre demande'
      using errcode = '42501';
  end if;

  -- Revérification en base de l'acteur : le profil doit exister.
  select p.display_name, p.avatar_url
    into v_profile_name, v_profile_avatar
    from public.profiles p
   where p.id = v_actor;
  if v_profile_name is null then
    raise exception 'profil introuvable' using errcode = 'P0002';
  end if;

  -- D-06 (remplacement) : une demande active existante est annulée d'abord.
  update public.account_deletion_requests
     set status = 'annulee',
         updated_at = now()
   where user_id = v_actor
     and status in ('demandee', 'rappellee');
  select exists (
    select 1 from public.account_deletion_requests
     where user_id = v_actor
       and status = 'annulee'
       and updated_at = now()
  ) into v_had_active;

  if v_had_active then
    -- Remplacement D-06 : la surface est déjà déshumanisée (l'utilisateur
    -- re-demande sans être passé par l'annulation). Les instantanés — parent
    -- ET par ligne (0170) — portent déjà les valeurs D'ORIGINE : ne pas
    -- re-snapshotter (on y recopierait « Ancien membre »). La déshumanisation,
    -- en revanche, DOIT être rejouée : elle est faite plus bas, hors du if
    -- (les updates sont idempotents).
    null;
  else
    -- Verrou d'abord (borne la course avec une annulation concurrente),
    -- puis la ligne membre d'ancrage : la plus ancienne ligne vivante.
    perform m.id
      from public.household_members m
     where m.user_id = v_actor
       and m.account_deleted_at is null
       for update;
    select m.id, m.display_name, m.avatar_url, m.household_id
      into v_member_id, v_member_name, v_member_avatar, v_household_id
      from public.household_members m
     where m.user_id = v_actor
       and m.account_deleted_at is null
     order by m.created_at asc
     limit 1;
    if v_member_id is null then
      raise exception 'membre introuvable' using errcode = 'P0002';
    end if;

    -- 1a. Instantané D-04 du PROFIL (table 0166), AVANT toute déshumanisation.
    insert into public.account_deletion_restorations
      (user_id, former_display_name, former_avatar_url,
       former_member_row_id, former_member_display_name,
       former_member_avatar_url, household_id)
    values
      (v_actor, v_profile_name, v_profile_avatar,
       v_member_id, v_member_name, v_member_avatar, v_household_id)
    on conflict (user_id) do update
      set former_display_name = excluded.former_display_name,
          former_avatar_url = excluded.former_avatar_url,
          former_member_row_id = excluded.former_member_row_id,
          former_member_display_name = excluded.former_member_display_name,
          former_member_avatar_url = excluded.former_member_avatar_url,
          household_id = excluded.household_id,
          created_at = now();

    -- 1b. Instantané D-04 PAR LIGNE membre (0170, CR-02) : UNE ligne par
    --     foyer, capturée AVANT la déshumanisation globale. Re-snapshot
    --     (demande reposée après annulation) : les lignes de la demande
    --     précédente sont remplacées par les valeurs fraîchement restaurées —
    --     identiques aux originales, mais jamais un mélange.
    delete from private.account_deletion_restoration_members
     where user_id = v_actor;
    insert into private.account_deletion_restoration_members
      (user_id, member_row_id, household_id,
       former_member_display_name, former_member_avatar_url)
    select v_actor, m.id, m.household_id, m.display_name, m.avatar_url
      from public.household_members m
     where m.user_id = v_actor
       and m.account_deleted_at is null
     order by m.created_at asc
       for update;
  end if;

  -- 2. Déshumanisation D-01/D-02 GLOBALE (toutes les lignes membres de
  --    l'acteur, tous foyers — homogénéité « Ancien membre »), puis l'état
  --    « ancien membre » D-03. La ligne membre reste en base : seul le
  --    marqueur est posé. Exécutée pour toute demande, y compris une demande
  --    reposée après annulation (D-05 a restauré les noms ; sans cette
  --    reprise, la purge J+30 échouerait sur chk_members_managed_child :
  --    user_id NULL d'une ligne adulte vivante, preuve 0166 §5).
  update public.profiles
     set display_name = 'Ancien membre',
         avatar_url = null,
         updated_at = now()
   where id = v_actor;
  update public.household_members
     set account_deleted_at = now(),
         display_name = 'Ancien membre',
         avatar_url = null
   where user_id = v_actor
     and account_deleted_at is null;

  -- 3. La demande, avec l'horloge J+30 rejouée à chaque demande.
  insert into public.account_deletion_requests (user_id)
  values (v_actor)
  returning id into v_request_id;

  return v_request_id;
end;
$$;

comment on function public.request_account_deletion(uuid) is
  'Demande de suppression de compte : instantané D-04 du profil ET de CHAQUE ligne household_members de l''acteur (tous foyers confondus, 0170) puis déshumanisation GLOBALE D-01/D-02/D-03 puis demande D-06, une seule transaction. L''instantané par ligne est la condition de la restauration fidèle multi-foyer (CR-02) : chaque foyer retrouve SON nom et SON avatar à l''annulation. USAGE SERVEUR UNIQUEMENT : l''acteur est vérifié en base, jamais auth.uid() cru.';

create or replace function public.cancel_account_deletion(p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_snapshot public.account_deletion_restorations%rowtype;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if v_actor is distinct from p_user_id then
    raise exception 'un utilisateur ne peut agir que sur sa propre demande'
      using errcode = '42501';
  end if;

  select r.*
    into v_snapshot
    from public.account_deletion_restorations r
   where r.user_id = v_actor;
  if v_snapshot.user_id is null then
    raise exception 'aucune demande à annuler' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.account_deletion_requests q
     where q.user_id = v_actor
       and q.status in ('demandee', 'rappellee')
  ) then
    raise exception 'aucune demande active' using errcode = 'P0002';
  end if;

  -- Restauration D-05 du profil depuis l'instantané parent (0166). La valeur
  -- NULL de l'avatar d'origine est restaurée telle quelle (coalesce interdit
  -- ici : NULL est un état porteur, pas une absence de donnée).
  update public.profiles
     set display_name = v_snapshot.former_display_name,
         avatar_url = v_snapshot.former_avatar_url,
         updated_at = now()
   where id = v_actor;

  -- Restauration D-05 PAR LIGNE (0170, CR-02) : chaque ligne household_members
  -- de l'acteur reprend le nom et l'avatar de SA ligne d'instantané — jamais
  -- le nom d'ancrage d'un autre foyer. Une ligne sans instantané (demande
  -- posée avant 0170) n'est pas touchée : on ne devine pas un nom perdu.
  update public.household_members m
     set account_deleted_at = null,
         display_name = c.former_member_display_name,
         avatar_url = c.former_member_avatar_url
    from private.account_deletion_restoration_members c
   where c.member_row_id = m.id
     and c.user_id = v_actor;

  update public.account_deletion_requests
     set status = 'annulee',
         updated_at = now()
    where user_id = v_actor
      and status in ('demandee', 'rappellee');

  -- Les instantanés (parent ET par ligne) sont conservés : une demande
  -- annulée peut être reposée, et request_account_deletion les remet à jour.
  -- Purge définitive à J+30 par le plan 02.
end;
$$;

comment on function public.cancel_account_deletion(uuid) is
  'Annulation d''une demande de suppression : restauration D-05 du profil (instantané parent 0166) ET de CHAQUE ligne household_members depuis SA ligne d''instantané (0170 — en multi-foyer, chaque foyer retrouve son propre nom et son propre avatar), demande « annulee », reposable immédiatement. USAGE SERVEUR UNIQUEMENT : acteur vérifié en base.';

-- ---------------------------------------------------------------------------
-- 3. WR-02 — le manifest porte le bucket de chaque objet
-- ---------------------------------------------------------------------------
-- Ajout NOT NULL vers l'avant : la table est un manifest transitoire côté
-- serveur ; les lignes déjà présentes (le cas échéant) datent de 0168, dont
-- l'insert ne ciblait que les objets `<household_id>/…` du bucket privé
-- `household-media` (0010) — le repli porte ce bucket, il est consigné ici.
alter table private.account_deletion_media_manifest
  add column bucket_id text;
update private.account_deletion_media_manifest
   set bucket_id = 'household-media'
 where bucket_id is null;
alter table private.account_deletion_media_manifest
  alter column bucket_id set not null;

comment on column private.account_deletion_media_manifest.bucket_id is
  'Bucket de l''objet (0170, WR-02) : un chemin `name` n''identifie pas un objet — deux buckets privés peuvent porter le même. L''Edge supprime et marque purgé PAR (bucket_id, storage_path). Repli de backfill « household-media » : 0168 ne consignait que les objets `<household_id>/…` de ce bucket (0010).';

-- Sans cette élargissement, le `on conflict do nothing` de la purge
-- écraserait le second jumeau cross-bucket — la confusion que bucket_id
-- devait précisément lever.
alter table private.account_deletion_media_manifest
  drop constraint account_deletion_media_manifest_household_id_storage_path_key;
alter table private.account_deletion_media_manifest
  add constraint account_deletion_media_manifest_unique_object
  unique (household_id, storage_path, bucket_id);

-- Recréation de la fonction de purge : seul l'insert du manifest change
-- (bucket_id porté, conflit élargi). Le reste du corps est inchangé.
create or replace function private.purge_expired_account_deletions()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
  v_hh record;
  v_inserted integer;
  v_children_transferred integer := 0;
  v_children_purged integer := 0;
  v_households_deleted integer := 0;
  v_manifest_rows integer := 0;
  v_purged integer := 0;
begin
  for r in
    select q.id, q.user_id
      from public.account_deletion_requests q
     where q.status in ('demandee', 'rappellee')
       and q.purge_due_at <= now()
     order by q.created_at asc
  loop
    begin
      -- Sous-transaction par demande : un échec (donnée imprévue, cascade
      -- restrict…) n'arrête pas les demandes suivantes — le redrive du cron
      -- journalier est le retry (motif savepoint ; le job J+30 rappelle
      -- cette fonction chaque jour tant que la demande reste active).
      for v_hh in
        select m.household_id,
               (select count(*) from public.household_members am
                 where am.household_id = m.household_id
                   and am.role <> 'enfant'
                   and am.user_id is not null
                   and am.account_deleted_at is null
                   and am.deleted_at is null
                   and am.user_id <> r.user_id) as adults_left,
               (select count(*) from public.household_members cm
                 where cm.household_id = m.household_id
                   and cm.role = 'enfant'
                   and cm.user_id is null
                   and cm.deleted_at is null) as children_count
          from public.household_members m
         where m.user_id = r.user_id
           and m.account_deleted_at is not null
         group by m.household_id
      loop
        if v_hh.adults_left > 0 then
          -- D-08 : les profils enfants RESTENT, gérés par les adultes
          -- restants. Aucune ligne n'est écrite : un enfant géré est une
          -- ligne du foyer sans gestionnaire nommé — le seul effet de la
          -- purge est que l'ancien compte ne le gérera plus. JAMAIS de
          -- DELETE brut de la ligne enfant (les cascades 0150 purgeraient
          -- son historique, pitfall du research).
          v_children_transferred := v_children_transferred + v_hh.children_count;
        else
          -- D-07 : manifest AVANT toute suppression — foyers orphelins
          -- UNIQUEMENT. Les objets Storage restent en place : le SQL ne
          -- peut pas les supprimer (pas de client Storage en base), l'Edge
          -- unifiée le fera, bornée à ce manifest. WR-02 (0170) : le bucket
          -- de chaque objet est consigné — un chemin seul n'identifie pas
          -- un objet (jumeaux cross-bucket).
          insert into private.account_deletion_media_manifest
            (household_id, storage_path, bucket_id)
          select v_hh.household_id, o.name, o.bucket_id
            from storage.objects o
           where o.name like v_hh.household_id || '/%'
          on conflict (household_id, storage_path, bucket_id) do nothing;
          get diagnostics v_inserted = row_count;
          v_manifest_rows := v_manifest_rows + v_inserted;

          -- RGDP-06 : les enfants du foyer orphelin partent avec lui.
          v_children_purged := v_children_purged + v_hh.children_count;

          -- D-09 : la suppression du foyer réutilise 0074 (dépenses d'abord
          -- — `expenses.paid_by … restrict` — puis le foyer, cascades
          -- ensuite). L'acteur est l'ancien compte lui-même : sa ligne
          -- membre porte encore son user_id (le set null ne vient qu'avec
          -- la cascade du `delete from auth.users`, plus bas).
          if exists (
            select 1 from public.household_members fm
             where fm.household_id = v_hh.household_id
               and fm.user_id = r.user_id
               and fm.role = 'admin'
          ) then
            perform public.delete_household(r.user_id, v_hh.household_id);
          else
            -- Repli documenté (Rule 2) : le compte n'était pas admin du
            -- foyer orphelin — `delete_household` refuserait (42501,
            -- assert_household_admin) et le demandeur suivant ne serait
            -- jamais purgé. Même ordre que 0074, en une transaction : les
            -- dépenses d'abord, le foyer (et ses cascades) ensuite.
            delete from public.expenses e
             where e.household_id = v_hh.household_id;
            delete from public.households h
             where h.id = v_hh.household_id;
          end if;
          v_households_deleted := v_households_deleted + 1;
        end if;
      end loop;

      -- Purge du compte : les cascades auditées en 0166 ne peuvent plus
      -- emporter de donnée partagée (set null sur les lignes survivantes).
      -- La demande est marquée `purgee` AVANT le delete : la ligne meurt
      -- ensuite avec le compte (cascade 0166) — trace RGPD disparue. Le
      -- flag `rappel_envoye` n'est PAS touché ici (rôle du J-7).
      update public.account_deletion_requests
         set status = 'purgee',
             updated_at = now()
       where id = r.id;

      -- Les instantanés de restauration (parent ET par ligne, 0170) sont
      -- purgés explicitement : au-delà de J+30, la restauration n'est plus
      -- possible (c'est le RGPD demandé).
      delete from public.account_deletion_restorations
       where user_id = r.user_id;
      delete from private.account_deletion_restoration_members
       where user_id = r.user_id;

      delete from auth.users where id = r.user_id;

      v_purged := v_purged + 1;
    exception when others then
      raise warning 'purge J+30 : la demande % a échoué : %', r.id, sqlerrm;
    end;
  end loop;

  return jsonb_build_object(
    'purged', v_purged,
    'children_transferred', v_children_transferred,
    'children_purged', v_children_purged,
    'households_deleted', v_households_deleted,
    'manifest_rows', v_manifest_rows
  );
end;
$$;

create or replace function public.deletion_media_claim(p_limit integer default 500)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return jsonb_build_object(
    'rows', coalesce((
      -- La borne s'applique AUX LIGNES, pas à l'agrégat : un LIMIT posé
      -- autour du jsonb_agg tronquerait le résultat déjà agrégé (une ligne
      -- scalaire), jamais l'entrée — preuve 0169 test « borné à p_limit ».
      select jsonb_agg(
               jsonb_build_object(
                 'id', r.id,
                 'household_id', r.household_id,
                 'storage_path', r.storage_path,
                 'bucket_id', r.bucket_id
               ) order by r.created_at asc, r.id asc)
        from (
          select m.id, m.household_id, m.storage_path, m.bucket_id, m.created_at
            from private.account_deletion_media_manifest m
           where m.purged = false
           order by m.created_at asc, m.id asc
           limit greatest(p_limit, 1)
        ) r
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.deletion_media_claim(integer) is
  'Wrapper PostgREST du manifest de médias (motif 0163 : logique en private, point d''entrée public réservé à service_role). Rend au plus p_limit objets NON purgés — avec LEUR bucket_id (0170, WR-02 : un chemin seul n''identifie pas un objet) — pour l''Edge unifiée household-delete, qui ne supprime QUE ces objets (D-07, T-27-12).';

-- ---------------------------------------------------------------------------
-- 4. WR-01 / WR-03 — les commentaires énoncent la vérité (metadata)
-- ---------------------------------------------------------------------------

-- WR-03 : le commentaire de colonne de 0166 affirmait que « les sélecteurs
-- excluent les lignes où account_deleted_at ou deleted_at est posé ». FAUX
-- pour account_deleted_at : AUCUN sélecteur de l'application ne la filtre
-- aujourd'hui. La vérité remplace l'affirmation (AGENTS §2.7 I).
comment on column public.household_members.account_deleted_at is
  'Posé à la demande de suppression de compte : la ligne devient « ancien membre » (0166). Marqueur d''audit et ancrage de la restauration D-05 — AUCUN sélecteur de l''application ne filtre cette colonne aujourd''hui (vérité rétablie en 0170, WR-03) ; ne pas INVENTER un filtrage, ni supposer qu''une ligne « ancien membre » disparaît des listes. Distincte de deleted_at (0144, profils enfants), qui elle est filtrée là où les sélecteurs d''enfants le font.';

-- WR-01 : la vérité du rappel J-7 — best-effort assumé.
comment on function private.post_account_deletion_http(text) is
  'POST /functions/v1/household-delete (Edge unifiée), clé secrète lue dans Vault, en-tête apikey. VÉRITÉ J-7 (0170, WR-01, disposition RGDP-03) : le rappel est BEST-EFFORT — le flag rappel_envoye (et le statut rappellee) est posé DANS la transaction AVANT net.http_post, donc un échec de livraison PERD l''alerte ; le cron ne repose jamais le flag et l''Edge ne rejoue qu''une fenêtre récente de demandes. Assumé : la forme inverse (flag après réponse) créerait des doublons à chaque redrive. purge-medias : POSTe seulement s''il reste des objets non purgés au manifest. Aucune donnée utilisateur dans le corps (RGDP-04).';

-- ---------------------------------------------------------------------------
-- 5. Privilèges (motif 0074) : retrait à PUBLIC puis accords nommés.
-- ---------------------------------------------------------------------------
revoke all on function public.request_account_deletion(uuid)
  from public, anon, authenticated;
revoke all on function public.cancel_account_deletion(uuid)
  from public, anon, authenticated;
grant execute on function public.request_account_deletion(uuid)
  to authenticated, service_role;
grant execute on function public.cancel_account_deletion(uuid)
  to authenticated, service_role;

do $$
begin
  if has_function_privilege('anon', 'public.request_account_deletion(uuid)', 'EXECUTE') then
    raise exception 'anon ne doit pas pouvoir demander une suppression de compte';
  end if;
  if has_function_privilege('anon', 'public.cancel_account_deletion(uuid)', 'EXECUTE') then
    raise exception 'anon ne doit pas pouvoir annuler une suppression de compte';
  end if;
  if not has_function_privilege('authenticated', 'public.request_account_deletion(uuid)', 'EXECUTE') then
    raise exception 'authenticated doit pouvoir demander sa propre suppression';
  end if;
  if not has_function_privilege('authenticated', 'public.cancel_account_deletion(uuid)', 'EXECUTE') then
    raise exception 'authenticated doit pouvoir annuler sa propre demande';
  end if;
  if not has_function_privilege('service_role', 'public.request_account_deletion(uuid)', 'EXECUTE') then
    raise exception 'service_role doit pouvoir exécuter les RPC de suppression (cron plan 02)';
  end if;
end;
$$;

commit;
