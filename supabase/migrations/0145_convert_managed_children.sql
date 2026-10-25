-- 0145_convert_managed_children.sql
-- Conversion des comptes enfants existants en profils gérés, invariant
-- enfant ⟺ sans session, fermeture des deux chemins de recréation.
--
-- Décisions de la phase 25 :
--  - D-15 : conversion totale des enfants-avec-compte en une migration ;
--  - D-16 : suppression RÉELLE du compte (plus aucune session possible) ;
--  - D-17 : l'enfant géré est créé par un parent — l'invitation par token et
--    le changement de rôle ne peuvent plus recréer un enfant-avec-compte ;
--  - D-18 (décision irréversible, approuvée le 2026-10-25) : le RPC supprime
--    des lignes auth.users — opération à sens unique.
--
-- CONSTAT : 0144 a posé le socle des profils enfants gérés (managed_modules,
-- birth_date, deleted_at), mais les enfants créés avant la phase 25 portent
-- un compte auth.users orphelin de sens : leur ligne household_members porte
-- role='enfant' et user_id NOT NULL. Le modèle retenu veut l'inverse — la
-- ligne membre est l'unique racine d'un profil enfant (0144), sans compte,
-- sans session. L'invariant CHECK est posé ICI et non en 0144 : les lignes
-- héritées enfant-avec-compte l'auraient violée dès sa création (0144:29-31).
--
-- CE QUE LA CONVERSION DÉTRUIT : les lignes auth.users (et profiles en
-- cascade, 0002:15) des enfants dont la ligne household_members porte
-- role='enfant' et user_id NOT NULL. L'enfant perd tout login propre.
--
-- CE QUI EST PRÉSERVÉ :
--  - la ligne household_members à l'identique (id, display_name, color_tag,
--    managed_modules, historique d'assignations) : user_id passe à NULL,
--    la ligne n'est JAMAIS supprimée — c'est la règle D-04 ;
--  - le compte de tout enfant qui est aussi membre adulte (role <>
--    'enfant') d'un autre foyer : un parent d'ailleurs ne perd jamais son
--    compte. Ces enfants-là sont comptés `skipped` ; leur ligne enfant
--    devient elle aussi sans compte, mais le compte survit via sa ligne
--    adulte.
--
-- FORME : RPC `public.convert_managed_children_to_profiles()` SECURITY
-- DEFINER, sur la forme servante de 0132 (verrou pessimiste for update,
-- opérations séquentielles, rapport jsonb, search_path = ''). La migration
-- s'auto-appelle (select …;) pour que la conversion s'exécute à
-- l'application et reste observable dans la transaction rollée de
-- test-db.sh (research QO-5). Sur la base de développement, il n'existe
-- aucun enfant-avec-compte : le rapport dit converted=0 — un succès muet
-- y serait suspect, le rapport EST la preuve.
--
-- SONDES (recherche A1/A2) : l'application par scripts/migrate.sh prouve
-- que le propriétaire peut delete from auth.users (A1) et qu'aucune FK
-- non-cascade ne s'interpose (A2) — tout échec de privilège ou de clé
-- arrête la migration avant toute vérification.
--
-- LES DEUX CHEMINS FERMÉS (D-17), par create or replace function — jamais
-- la réécriture d'une migration appliquée (AGENTS.md §2.7 A) :
--  a) invitation : redeem_household_invite_token refuse p_role='enfant'
--     (22023). Définition effective recopiée depuis 0017 — pas 0006 comme
--     le disait le plan : 0017 est la DERNIÈRE définition posée, donc celle
--     que la base contient (« ce qui compte, c'est la définition effective
--     d'une fonction », AGENTS.md §2.7 A). Elle y avait retiré la
--     désactivation illusoire d'un token périmé ; ce comportement-là est
--     conservé tel quel, seul le mapping du rôle enfant devient un refus.
--  b) changement de rôle : set_member_role refuse de transformer en
--     'enfant' une ligne portant user_id NOT NULL (22023). Définition
--     recopiée depuis 0036, garde insérée après la protection du dernier
--     administrateur. La fonction reste réservée aux comptes réels (D-07) :
--     le statut « géré par le parent » est figé, aucun réglage de fiche ne
--     le change.
--
-- L'INVARIANT posé en dernier, APRÈS la conversion et les fermetures :
-- `chk_members_managed_child check ((user_id is null) = (role =
-- 'enfant'))`. C'est le filet final (23514) : même si un chemin était
-- rouvert, la CHECK refuserait l'écriture.

begin;

-- ---------------------------------------------------------------------------
-- 1. RPC de conversion (forme servante de 0132).
-- ---------------------------------------------------------------------------
create or replace function public.convert_managed_children_to_profiles()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ids       uuid[] := '{}'::uuid[];
  v_skipped   uuid[] := '{}'::uuid[];
  v_converted uuid[] := '{}'::uuid[];
begin
  -- Garde d'acteur (défense en profondeur, T-25-03) : un appel portant une
  -- session utilisateur est refusé même si le grant fuyait. Seul un appel
  -- serveur sans session (service_role, pg_cron, la migration) passe.
  if auth.uid() is not null then
    raise exception 'conversion réservée au service serveur'
      using errcode = '42501';
  end if;

  -- Verrou pessimiste : deux conversions simultanées se sérialisent ici, et
  -- la seconde voit l'état laissé par la première. L'ordre rend le verrou
  -- déterministe (pas d'interblocage entre deux appels concurrents).
  perform 1
    from public.household_members m
   where m.role = 'enfant'
     and m.user_id is not null
   order by m.user_id
     for update of m;

  -- Collecte des comptes portés par une ligne enfant-avec-compte.
  select coalesce(array_agg(distinct m.user_id), '{}'::uuid[])
    into v_ids
    from public.household_members m
   where m.role = 'enfant'
     and m.user_id is not null;

  -- Exclusion multi-foyer : un id aussi référencé par une ligne role <>
  -- 'enfant' (n'importe quel foyer) appartient à un adulte ailleurs — son
  -- compte est préservé (skipped).
  select coalesce(array_agg(distinct m.user_id), '{}'::uuid[])
    into v_skipped
    from public.household_members m
   where m.user_id = any(v_ids)
     and m.role <> 'enfant';

  v_converted := coalesce(
    (select array_agg(u)
       from unnest(v_ids) as u
      where u <> all (v_skipped)),
    '{}'::uuid[]
  );

  -- D-04 : la ligne membre survit. user_id passe à NULL pour TOUTES les
  -- lignes enfant-avec-compte — converties comme skipped : la CHECK posée
  -- plus bas l'exigerait de toute façon.
  update public.household_members
     set user_id = null
   where role = 'enfant'
     and user_id is not null;

  -- D-16 : suppression réelle du compte — plus aucune session possible.
  -- ORDRE OBLIGATOIRE : l'update ci-dessus PRÉCÈDE les deletes, jamais
  -- l'inverse — l'inverse laisserait la cascade FK de 0002 (household_members
  -- user_id on delete cascade) détruire la ligne membre et l'historique
  -- d'assignations qu'elle porte. profiles d'abord, auth.users ensuite :
  -- explicite même si la cascade 0002 aurait fait le travail.
  delete from public.profiles where id = any(v_converted);
  delete from auth.users where id = any(v_converted);

  return jsonb_build_object(
    'converted', coalesce(array_length(v_converted, 1), 0),
    'skipped', coalesce(array_length(v_skipped, 1), 0)
  );
end;
$$;

comment on function public.convert_managed_children_to_profiles() is
  'USAGE SERVEUR UNIQUEMENT. Convertit les enfants-avec-compte en profils gérés : user_id NULL sur la ligne membre (conservée), compte auth.users et profile supprimés — sauf un compte aussi membre adulte d''un autre foyer (skipped, compte préservé). Décision D-18 du 2026-10-25 : opération à sens unique.';

-- ---------------------------------------------------------------------------
-- 2. Privilèges du RPC : service_role uniquement (T-25-03, double barrière
-- avec la garde d'acteur ci-dessus). Jamais authenticated, jamais anon.
-- ---------------------------------------------------------------------------
revoke all on function public.convert_managed_children_to_profiles()
  from public, anon, authenticated;
grant execute on function public.convert_managed_children_to_profiles()
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. Appel par la migration (research QO-5) : la conversion s'exécute à
-- l'application, en tant que propriétaire (sondes A1/A2), et reste
-- observable dans la transaction rollée de test-db.sh.
-- ---------------------------------------------------------------------------
select public.convert_managed_children_to_profiles();

-- ---------------------------------------------------------------------------
-- 4. Chemin invitation fermé (D-17a). Définition effective recopiée depuis
-- 0017 (voir l'en-tête : 0017 corrige 0006, c'est elle que la base contient).
-- Seul changement : le mapping du rôle enfant devient un refus franc ; le
-- reste du corps — validation de session, format HMAC, verrou for update,
-- idempotence déjà-membre, incrémentation use_count — est inchangé.
-- ---------------------------------------------------------------------------
create or replace function public.redeem_household_invite_token(
  p_token_hash text,
  p_user_id uuid,
  p_display_name text,
  p_avatar_url text default null,
  p_role text default 'membre'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.household_invite_tokens%rowtype;
  v_member_id text;
  v_role text;
  v_color text;
begin
  if p_user_id is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'token invalide' using errcode = '22023';
  end if;

  -- D-17a : un enfant ne rejoint plus un foyer par invitation — l'enfant est
  -- créé par un parent depuis les paramètres du foyer. Ce refus REMPLACE le
  -- mapping de 0017 (`v_role := case when p_role in ('enfant') then 'enfant'
  -- else 'membre' end`), qui attribuait le rôle enfant au compte invité.
  if p_role = 'enfant' then
    raise exception 'un enfant est créé par un parent depuis les paramètres du foyer'
      using errcode = '22023';
  end if;

  -- Un token d'invitation n'attribue jamais un privilège (AGENTS.md §2.6) :
  -- toute autre valeur demandée tombe sur `membre`, comme avant.
  v_role := 'membre';

  -- Verrou pessimiste : deux utilisations simultanées du même token ne
  -- peuvent pas franchir `use_count < max_uses`. La ligne est d'abord
  -- localisée par l'index sur `token_hash`, puis la comparaison est refaite
  -- à temps constant.
  select t.* into v_token
    from public.household_invite_tokens t
   where t.token_hash = p_token_hash
     and private.token_hash_matches(t.token_hash, p_token_hash)
    for update;

  if not found then
    raise exception 'token inconnu' using errcode = '22023';
  end if;
  if not v_token.is_active then
    raise exception 'token révoqué' using errcode = '22023';
  end if;

  -- Ni ici ni plus bas, un `update` ne peut être suivi d'un `raise` : les
  -- deux sont dans la même instruction, l'exception annule l'UPDATE. La
  -- désactivation d'un token périmé ou épuisé reste laissée à
  -- `private.prune_expired_invite_tokens` (pg_cron, quotidien), comme dans
  -- 0017. Ces deux refus demeurent — seule la désactivation illusoire avait
  -- disparu, et elle ne revient pas.
  if v_token.expires_at is not null and v_token.expires_at <= now() then
    raise exception 'token expiré' using errcode = '22023';
  end if;
  if v_token.use_count >= v_token.max_uses then
    raise exception 'token épuisé' using errcode = '22023';
  end if;

  -- Déjà membre : l'utilisation n'est pas comptabilisée (idempotence).
  select m.id into v_member_id
    from public.household_members m
   where m.household_id = v_token.household_id
     and m.user_id = p_user_id;

  if v_member_id is not null then
    return jsonb_build_object(
      'household_id', v_token.household_id,
      'member_id', v_member_id,
      'already_member', true
    );
  end if;

  v_color := (array['accent', 'ink', 'coral', 'amber', 'violet'])[
    1 + (select count(*) from public.household_members where household_id = v_token.household_id) % 5
  ];

  v_member_id := private.new_id('member');

  insert into public.household_members (
    id, household_id, user_id, display_name, avatar_url, color_tag, role
  ) values (
    v_member_id,
    v_token.household_id,
    p_user_id,
    coalesce(nullif(btrim(p_display_name), ''), 'Nouveau membre'),
    p_avatar_url,
    v_color,
    v_role
  );

  update public.household_invite_tokens
     set use_count = use_count + 1,
         is_active = (use_count + 1 < max_uses)
    where id = v_token.id;

  return jsonb_build_object(
    'household_id', v_token.household_id,
    'member_id', v_member_id,
    'already_member', false
  );
end;
$$;

comment on function public.redeem_household_invite_token(text, uuid, text, text, text) is
  'USAGE SERVEUR UNIQUEMENT. Échange un token contre une ligne household_members, en transaction. Un enfant ne rejoint plus un foyer par invitation (22023, D-17a) : l''enfant est créé par un parent depuis les paramètres du foyer. Un token périmé ou épuisé est refusé ; sa désactivation revient à private.prune_expired_invite_tokens.';

-- ---------------------------------------------------------------------------
-- 5. Chemin rôle fermé (D-17b). Définition recopiée depuis 0036, garde
-- insérée après la protection du dernier administrateur. Grants inchangés
-- (0036 reste la source : authenticated seul, aucun autre contact n'y a
-- touché depuis).
-- ---------------------------------------------------------------------------
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

  if v_current_role = 'admin' and p_role <> 'admin'
    and private.household_admin_count(v_household_id) <= 1 then
    raise exception 'le dernier administrateur du foyer ne peut pas être rétrogradé'
      using errcode = '23514';
  end if;

  -- D-17b : un membre disposant d'un compte ne peut pas devenir un enfant
  -- géré. L'inverse (enfant sans compte vers un rôle réel) reste possible —
  -- c'est la promotion d'un enfant majeur par son parent, un compte étant
  -- alors créé par la fonction d'adoption, pas ici. La fonction ne doit
  -- jamais permettre l'escalade d'un profil sans session vers un rôle réel.
  if p_role = 'enfant'
    and exists (
      select 1
        from public.household_members m
       where m.id = p_member_id
         and m.user_id is not null
    ) then
    raise exception 'un membre disposant d''un compte ne peut pas devenir un enfant géré'
      using errcode = '22023';
  end if;

  update public.household_members
     set role = p_role
   where id = p_member_id;

  return jsonb_build_object('id', p_member_id, 'role', p_role);
end;
$$;

comment on function public.set_member_role(text, text) is
  'Change le rôle d''un membre, administrateur requis, dernier admin protégé, refuse de transformer un membre-avec-compte en enfant géré (22023, D-17b). USAGE AUTHENTIFIÉ UNIQUEMENT : l''acteur est auth.uid(), jamais un paramètre.';

-- ---------------------------------------------------------------------------
-- 6. Invariant (filet final, 23514) : posé EN DERNIER — après la conversion
-- (sinon les lignes héritées enfant-avec-compte l'auraient violée à
-- l'application) et après les fermetures de chemins.
-- ---------------------------------------------------------------------------
alter table public.household_members
  add constraint chk_members_managed_child
  check ((user_id is null) = (role = 'enfant'));

comment on constraint chk_members_managed_child on public.household_members is
  'Invariant enfant ⟺ sans session (D-17) : un membre enfant n''a pas de compte, un membre avec compte n''est pas enfant. Filet final derrière les refus 22023 de 0145.';

-- Preuve de soi (AGENTS.md §2.7 F) : la contrainte est bien là.
do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conname = 'chk_members_managed_child'
       and conrelid = 'public.household_members'::regclass
  ) then
    raise exception 'la contrainte chk_members_managed_child n''a pas été créée';
  end if;
end;
$$;

commit;
