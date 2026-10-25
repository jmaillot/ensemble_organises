-- 0146_child_behavior_guards.sql
-- Gardes de comportement des enfants gérés (phase 25, plan 25-03).
--
-- LE SOCLE NE CHANGE AUCUN COMPORTEMENT À L'USAGE. 0144 pose les colonnes
-- (managed_modules, birth_date, deleted_at), 0145 pose l'invariant enfant ⟺
-- sans session — mais sans 0146, un enfant géré resterait assignable partout,
-- la complétion de routine au nom d'un autre adulte passerait, et aucune
-- modération parentale n'existerait côté serveur.
--
-- PRINCIPES (25-CONTEXT D-01/D-04/D-05/D-06/D-08/D-11/D-12/D-13, ENF-03) :
--   * D-01 : la fiche enfant est gérée par TOUT adulte du foyer
--     (can_write_household : admin OU membre), jamais par un seul créateur —
--     pas de propriété individuelle d'une fiche enfant.
--   * D-04 : l'archivage pose deleted_at, JAMAIS un delete (les cascades 0003
--     task_assignees/routine_assignees on delete cascade et
--     routine_completions.completed_by on delete set null purgeraient
--     l'historique). L'invariant 0145 chk_members_managed_child reste vrai.
--   * D-05 : la restriction par module vit sur la LIGNE MEMBRE de l'enfant
--     (household_members.managed_modules), jamais sur la ligne foyers —
--     aucune garde ne lit le tableau porté par households.
--   * D-06 : le socle v1 de la fiche est '{taches,routines,anniversaires,menu}' ;
--     update_managed_child_profile refuse-par-défaut toute clé hors des cinq
--     espaces gardés (taches/routines/messages/anniversaires/menu). Les clés
--     de module n'y sont nommées que pour désigner l'espace auquel la garde
--     s'applique, jamais comme liste d'autorisation codée en dur.
--   * D-08 : la filiation est intrinsèque — tout adulte du foyer agit au nom
--     de tout enfant géré du même foyer (pas de « responsables désignés »).
--   * D-11 : périmètre v1 des gardes d'assignation : tâches et routines
--     uniquement.
--   * D-12 : un enfant géré ne publie JAMAIS dans le Cercle (pas de session).
--     La troisième branche DELETE sert la modération ADULTE du contenu enfant.
--     Aucune politique INSERT/UPDATE Cercle n'est ajoutée ni touchée.
--   * D-13 : un adulte ne coche JAMAIS au nom d'un autre adulte (42501).
--   * ENF-03 : la filiation auditable tient en deux colonnes text :
--     tasks.assigned_by_member_id et routine_completions.actor_member_id —
--     attributaire et acteur distincts, écrits depuis auth.uid() résolu,
--     jamais un paramètre client (précédents 0036/0041/0132).
--
-- Les gardes s'écrivent `is not true` et jamais `not (…)` (piège 0133:35-40) :
-- les aides renvoient NULL pour un appelant hors foyer, et un garde
-- `if not …` laisserait passer l'inconnu sous SECURITY DEFINER.
--
-- Les colonnes d'acteur sont en `text` (type réel des identifiants membres,
-- cf. tasks.created_by 0003:89) — JAMAIS uuid.
--
-- Aucune migration appliquée n'est réécrite : replace_task_assignees
-- (0133:47), replace_routine_assignees (0133:126), les trois politiques
-- DELETE Cercle (0109:70-89), create_conversation (0041:28) et la politique
-- conversation_members_insert (0007:547, consommatrice de
-- can_join_conversation) sont recopiés-modifiés ici sous le même contrat.
-- Aucune directive de linter ; aucun message avec donnée personnelle.

begin;

-- ---------------------------------------------------------------------------
-- 1. Helpers par membre (D-05) : la restriction vit sur la ligne membre.
-- SECURITY DEFINER (lecture RLS-contournante comme les aides 0006), STABLE,
-- search_path vide, toute table qualifiée.
-- ---------------------------------------------------------------------------

-- L'enfant géré : role='enfant', sans compte, non archivé. Un enfant ARCHIVÉ
-- (deleted_at posé) ne matche plus : il sort de toutes les gardes et de la
-- redirection push de 0147 — son historique reste, mais rien de nouveau
-- ne peut le viser.
create or replace function private.is_managed_child(p_member_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.household_members m
     where m.id = p_member_id
       and m.role = 'enfant'
       and m.user_id is null
       and m.deleted_at is null
  );
$$;

comment on function private.is_managed_child(text) is
  'Vrai si la ligne membre est un enfant géré actif (role enfant, sans session, non archivé — D-04/D-22).';

-- Le module est-il ouvert pour CET enfant ? La lecture porte sur la ligne
-- membre (D-05 : restriction par enfant) — jamais sur la ligne foyers.
create or replace function private.managed_child_module_allowed(p_member_id text, p_module text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.household_members m
     where m.id = p_member_id
       and m.role = 'enfant'
       and m.user_id is null
       and m.deleted_at is null
       and p_module = any (m.managed_modules)
  );
$$;

comment on function private.managed_child_module_allowed(text, text) is
  'Vrai si p_module figure dans les managed_modules DE LA LIGNE MEMBRE de cet enfant (D-05).';

-- Forme servante : refuse 42501 si le module n'est pas ouvert pour l'enfant.
create or replace function private.assert_child_module_allowed(p_member_id text, p_module text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if private.managed_child_module_allowed(p_member_id, p_module) is not true then
    raise exception 'l''enfant n''est pas autorisé sur cet espace'
      using errcode = '42501';
  end if;
end;
$$;

comment on function private.assert_child_module_allowed(text, text) is
  'Garde 42501 : refus si le module n''est pas dans les managed_modules de la ligne enfant (D-05).';

-- Privilèges, précédent 0026 : les aides appelées depuis une expression de
-- politique RLS sont évaluées avec le rôle appelant — l'EXECUTE de
-- `is_managed_child` et `managed_child_module_allowed` (politiques Cercle et
-- conversation_members_insert) doit donc rester accessible à `authenticated`.
-- `assert_child_module_allowed` n'est appelée que depuis des SECURITY DEFINER
-- (RPC, déclencheurs) : elle reste interne.
revoke execute on function private.is_managed_child(text) from public, anon;
revoke execute on function private.managed_child_module_allowed(text, text) from public, anon;
revoke execute on function private.assert_child_module_allowed(text, text) from public, anon, authenticated;
grant execute on function private.is_managed_child(text) to authenticated, service_role;
grant execute on function private.managed_child_module_allowed(text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. RPC de fiche enfant (D-01), formes servantes 0036/0132.
-- Acteur résolu depuis auth.uid() (jamais un paramètre), adulte = can_write_household.
-- ---------------------------------------------------------------------------

create or replace function public.create_managed_child_profile(
  p_household_id text,
  p_display_name text,
  p_color_tag text,
  p_birth_date date default null,
  p_avatar_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_member_id text;
  v_member_id text;
  v_color text;
begin
  if v_actor is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_household_id is null then
    raise exception 'foyer obligatoire' using errcode = '22023';
  end if;

  -- D-03 : tout adulte du foyer crée une fiche (admin OU membre).
  if private.can_write_household(p_household_id) is not true then
    raise exception 'action réservée aux adultes du foyer' using errcode = '42501';
  end if;

  select private.current_member_id(p_household_id) into v_actor_member_id;
  if v_actor_member_id is null then
    raise exception 'aucune ligne membre pour cet acteur dans ce foyer' using errcode = '42501';
  end if;

  -- Validation locale : mêmes bornes que la CHECK 0002 (1-120 btrim)
  -- resserrées au contrat produit 2-120 ; couleur validée par
  -- private.is_member_color (0001).
  if p_display_name is null or char_length(btrim(p_display_name)) not between 2 and 120 then
    raise exception 'le nom doit compter entre 2 et 120 caractères' using errcode = '22023';
  end if;
  v_color := coalesce(p_color_tag, 'accent');
  if private.is_member_color(v_color) is not true then
    raise exception 'couleur invalide' using errcode = '22023';
  end if;

  -- Socle D-06 posé comme valeur d'insertion.
  v_member_id := private.new_id('member');
  insert into public.household_members
    (id, household_id, user_id, display_name, color_tag, role, birth_date, managed_modules)
  values (
    v_member_id,
    p_household_id,
    null,
    btrim(p_display_name),
    v_color,
    'enfant',
    p_birth_date,
    '{taches,routines,anniversaires,menu}'::text[]
  );

  return jsonb_build_object(
    'id', v_member_id,
    'household_id', p_household_id,
    'display_name', btrim(p_display_name),
    'color_tag', v_color,
    'role', 'enfant',
    'birth_date', p_birth_date
  );
end;
$$;

comment on function public.create_managed_child_profile(text, text, text, date, text) is
  'D-01 : crée la fiche d''un enfant géré (role enfant, sans compte, socle D-06). Tout adulte du foyer (can_write_household). USAGE AUTHENTIFIÉ UNIQUEMENT.';

create or replace function public.update_managed_child_profile(
  p_member_id text,
  p_display_name text,
  p_color_tag text,
  p_birth_date date,
  p_avatar_url text,
  p_managed_modules text[] default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_household_id text;
  v_modules text[];
begin
  if v_actor is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_member_id is null then
    raise exception 'enfant obligatoire' using errcode = '22023';
  end if;

  select m.household_id into v_household_id
    from public.household_members m
   where m.id = p_member_id;

  if v_household_id is null then
    raise exception 'enfant introuvable' using errcode = '42501';
  end if;

  -- D-03 : tout adulte du foyer de la ligne cible.
  if private.can_write_household(v_household_id) is not true then
    raise exception 'action réservée aux adultes du foyer' using errcode = '42501';
  end if;

  -- La cible est un enfant géré ACTIF : un adulte n'est jamais éditable par ce
  -- RPC (22023, forme is not true — jamais not (…)).
  if private.is_managed_child(p_member_id) is not true then
    raise exception 'la ligne visée n''est pas un enfant géré' using errcode = '22023';
  end if;

  if p_display_name is not null and char_length(btrim(p_display_name)) not between 2 and 120 then
    raise exception 'le nom doit compter entre 2 et 120 caractères' using errcode = '22023';
  end if;
  if p_color_tag is not null and private.is_member_color(p_color_tag) is not true then
    raise exception 'couleur invalide' using errcode = '22023';
  end if;

  -- D-06 : validation de FORMAT (has_valid_module_keys, même format que la
  -- CHECK 0144) PUIS de PÉRIMÈTRE : refus-par-défaut, seuls les cinq espaces
  -- gardés sont activables. cadeaux/voyages/contacts et tout autre espace
  -- → 22023 (leur garde rejoindra dans une migration ultérieure si le
  -- produit l'exige).
  if p_managed_modules is not null then
    if private.has_valid_module_keys(p_managed_modules) is not true then
      raise exception 'liste de modules invalide' using errcode = '22023';
    end if;
    if exists (
      select 1
        from pg_catalog.unnest(p_managed_modules) as t (k)
       where k not in ('taches', 'routines', 'messages', 'anniversaires', 'menu')
    ) then
      raise exception 'cet espace n''est pas activable sur une fiche enfant'
        using errcode = '22023';
    end if;
    v_modules := p_managed_modules;
  end if;

  update public.household_members
     set display_name = coalesce(nullif(btrim(p_display_name), ''), display_name),
         color_tag = coalesce(p_color_tag, color_tag),
         birth_date = p_birth_date,
         avatar_url = coalesce(p_avatar_url, avatar_url),
         managed_modules = coalesce(v_modules, managed_modules)
   where id = p_member_id;
end;
$$;

comment on function public.update_managed_child_profile(text, text, text, date, text, text[]) is
  'D-01 : met à jour la fiche d''un enfant géré ; modules validés en format (0140) et en périmètre D-06 (refus-par-défaut hors des cinq espaces gardés). USAGE AUTHENTIFIÉ UNIQUEMENT.';

create or replace function public.archive_managed_child_profile(p_member_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_household_id text;
begin
  if v_actor is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_member_id is null then
    raise exception 'enfant obligatoire' using errcode = '22023';
  end if;

  select m.household_id into v_household_id
    from public.household_members m
   where m.id = p_member_id;

  if v_household_id is null then
    raise exception 'enfant introuvable' using errcode = '42501';
  end if;

  if private.can_write_household(v_household_id) is not true then
    raise exception 'action réservée aux adultes du foyer' using errcode = '42501';
  end if;

  if private.is_managed_child(p_member_id) is not true then
    raise exception 'la ligne visée n''est pas un enfant géré' using errcode = '22023';
  end if;

  -- D-04 : archivage par marque, JAMAIS un delete — les cascades 0003
  -- (task_assignees/routine_assignees en cascade, completed_by en set null)
  -- purgeraient l'historique. L'invariant 0145 reste vrai (role/user_id
  -- inchangés).
  update public.household_members
     set deleted_at = now()
   where id = p_member_id;
end;
$$;

comment on function public.archive_managed_child_profile(text) is
  'D-04 : archive la fiche (deleted_at) sans supprimer la ligne ni ses traces. USAGE AUTHENTIFIÉ UNIQUEMENT.';

-- Privilèges : ces RPC SONT la surface client (D-01).
revoke all on function public.create_managed_child_profile(text, text, text, date, text) from public, anon;
revoke all on function public.update_managed_child_profile(text, text, text, date, text, text[]) from public, anon;
revoke all on function public.archive_managed_child_profile(text) from public, anon;
grant execute on function public.create_managed_child_profile(text, text, text, date, text) to authenticated;
grant execute on function public.update_managed_child_profile(text, text, text, date, text, text[]) to authenticated;
grant execute on function public.archive_managed_child_profile(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Colonnes d'acteur ENF-03 : attributaire et acteur distincts, en text.
-- ---------------------------------------------------------------------------

alter table public.tasks
  add column if not exists assigned_by_member_id text
    references public.household_members (id) on delete set null;

comment on column public.tasks.assigned_by_member_id is
  'Acteur qui a posé la dernière assignation (ENF-03) : résolu depuis auth.uid() par replace_task_assignees (0146), jamais un paramètre client. Nullable : les lignes antérieures à 0146 ne le portent pas.';

alter table public.routine_completions
  add column if not exists actor_member_id text
    references public.household_members (id) on delete set null;

comment on column public.routine_completions.actor_member_id is
  'Acteur qui a coché l''occurrence (ENF-03) : résolu depuis auth.uid() par complete_routine_occurrence (0146), distinct de completed_by (l''attributaire). Nullable pour l''historique antérieur.';

-- ---------------------------------------------------------------------------
-- 4. Gardes de module sur les ensembles (D-05/D-11 : tâches et routines
-- uniquement en v1). Définitions effectives 0133:47 et 0133:126
-- recopiées-modifiées : contrat atomique conservé, garde de module insérée
-- après les gardes d'acteur existantes.
-- ---------------------------------------------------------------------------

create or replace function public.replace_task_assignees(p_task_id text, p_member_ids text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
  v_actor uuid := auth.uid();
  v_household_id text;
  v_actor_member_id text;
begin
  if p_task_id is null then
    raise exception 'tâche obligatoire' using errcode = '22023';
  end if;
  if p_member_ids is null then
    raise exception 'liste d''assignataires obligatoire' using errcode = '22023';
  end if;

  if private.can_write_task(p_task_id) is not true then
    raise exception 'écriture refusée sur cette tâche' using errcode = '42501';
  end if;

  if exists (
    select 1
      from unnest(p_member_ids) as m
     where private.member_in_task_household(m, p_task_id) is not true
  ) then
    raise exception 'membre hors du foyer de la tâche' using errcode = '42501';
  end if;

  -- Garde de module D-05 : un enfant géré n'est assignable que sur SES espaces.
  -- Admin inclus : un admin ne contourne pas le choix de la fiche.
  if exists (
    select 1
      from unnest(p_member_ids) as m
     where private.is_managed_child(m)
       and private.managed_child_module_allowed(m, 'taches') is not true
  ) then
    raise exception 'un enfant est assigné hors de ses espaces autorisés' using errcode = '42501';
  end if;

  delete from public.task_assignees where task_id = p_task_id;

  insert into public.task_assignees (task_id, member_id)
  select distinct p_task_id, m
    from unnest(p_member_ids) as m;

  get diagnostics v_inserted = row_count;

  -- ENF-03 : l'acteur est résolu depuis auth.uid(), jamais un paramètre.
  -- Nullable : un appel sans session (pg_cron, test en postgres) laisse null.
  select t.household_id into v_household_id
    from public.tasks t
   where t.id = p_task_id;
  select private.current_member_id(v_household_id) into v_actor_member_id;

  update public.tasks
     set assigned_by_member_id = v_actor_member_id
   where id = p_task_id
     and v_actor_member_id is not null;

  return v_inserted;
end;
$$;

comment on function public.replace_task_assignees(text, text[]) is
  'Remplace en une transaction les assignataires d''une tâche (droit d''écriture, membres du foyer, enfants gérés limités à leurs espaces D-05) et pose assigned_by_member_id depuis auth.uid().';

create or replace function public.replace_routine_assignees(p_routine_id text, p_member_ids text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  if p_routine_id is null then
    raise exception 'routine obligatoire' using errcode = '22023';
  end if;
  if p_member_ids is null then
    raise exception 'liste d''assignataires obligatoire' using errcode = '22023';
  end if;

  if private.can_write_routine(p_routine_id) is not true then
    raise exception 'écriture refusée sur cette routine' using errcode = '42501';
  end if;

  if exists (
    select 1
      from unnest(p_member_ids) as m
     where private.member_in_routine_household(m, p_routine_id) is not true
  ) then
    raise exception 'membre hors du foyer de la routine' using errcode = '42501';
  end if;

  -- Garde de module D-05, symétrique de la tâche.
  if exists (
    select 1
      from unnest(p_member_ids) as m
     where private.is_managed_child(m)
       and private.managed_child_module_allowed(m, 'routines') is not true
  ) then
    raise exception 'un enfant est assigné hors de ses espaces autorisés' using errcode = '42501';
  end if;

  delete from public.routine_assignees where routine_id = p_routine_id;

  insert into public.routine_assignees (routine_id, member_id)
  select distinct p_routine_id, m
    from unnest(p_member_ids) as m;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

comment on function public.replace_routine_assignees(text, text[]) is
  'Remplace en une transaction les assignataires d''une routine (droit d''écriture, membres du foyer, enfants gérés limités à leurs espaces D-05).';

-- ---------------------------------------------------------------------------
-- 5. Complétion de routine par délégation (D-08/D-13, ENF-03).
-- ---------------------------------------------------------------------------

create or replace function public.complete_routine_occurrence(
  p_routine_id text,
  p_occurrence_date date,
  p_member_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_household_id text;
  v_actor_member_id text;
  v_target text;
begin
  if v_actor is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_routine_id is null or p_occurrence_date is null or p_member_id is null then
    raise exception 'routine, date et membre obligatoires' using errcode = '22023';
  end if;

  select r.household_id into v_household_id
    from public.routines r
   where r.id = p_routine_id;
  if v_household_id is null then
    raise exception 'routine introuvable' using errcode = '42501';
  end if;

  select private.current_member_id(v_household_id) into v_actor_member_id;
  if v_actor_member_id is null then
    raise exception 'aucune ligne membre pour cet acteur dans ce foyer' using errcode = '42501';
  end if;

  -- La cible doit appartenir au foyer de la routine.
  if private.member_in_household(p_member_id, v_household_id) is not true then
    raise exception 'membre hors du foyer de la routine' using errcode = '42501';
  end if;

  -- D-08 + D-13 (formes is not true) : la cible est l'acteur lui-même OU un
  -- enfant géré du même foyer. Tout autre cas — en particulier un adulte
  -- agissant au nom d'un AUTRE adulte — est refusé 42501.
  if p_member_id = v_actor_member_id then
    v_target := p_member_id;
  elsif private.is_managed_child(p_member_id) is true then
    v_target := p_member_id;
  else
    raise exception 'on ne coche pas au nom d''un autre adulte' using errcode = '42501';
  end if;

  -- Garde de module D-05 : un enfant géré est coché seulement si 'routines'
  -- est ouvert SUR SA fiche (que la cible coche pour elle-même ou soit
  -- déléguée).
  if private.is_managed_child(v_target) is true then
    perform private.assert_child_module_allowed(v_target, 'routines');
  end if;

  -- Upsert sur la contrainte réelle routine_completions_unique_occurrence
  -- (0003:151) : le conflit est exactement (routine_id, occurrence_date),
  -- JAMAIS completed_by. Insert : completed_by = l'attributaire,
  -- actor_member_id = l'acteur (ENF-03).
  insert into public.routine_completions
    (routine_id, household_id, occurrence_date, completed_by, actor_member_id, completed_at, status)
  values (p_routine_id, v_household_id, p_occurrence_date, v_target, v_actor_member_id, now(), 'fait')
  on conflict (routine_id, occurrence_date) do update
     set completed_by = excluded.completed_by,
         actor_member_id = excluded.actor_member_id,
         completed_at = excluded.completed_at,
         status = excluded.status;

  return jsonb_build_object(
    'routine_id', p_routine_id,
    'occurrence_date', p_occurrence_date,
    'completed_by', v_target,
    'actor_member_id', v_actor_member_id,
    'status', 'fait'
  );
end;
$$;

comment on function public.complete_routine_occurrence(text, date, text) is
  'D-08/D-13 : coche une occurrence pour soi ou pour un enfant géré du foyer ; refuse adulte→adulte (42501). Upsert sur (routine_id, occurrence_date). USAGE AUTHENTIFIÉ UNIQUEMENT.';

-- Preuve de soi (AGENTS.md §2.7 F) : la contrainte visée par l'upsert est
-- bien celle du schéma — si 0003 changeait, ce fichier échouerait ici.
do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conname = 'routine_completions_unique_occurrence'
       and conrelid = 'public.routine_completions'::regclass
  ) then
    raise exception 'la contrainte routine_completions_unique_occurrence n''a pas été trouvée';
  end if;
end;
$$;

revoke all on function public.complete_routine_occurrence(text, date, text) from public, anon;
grant execute on function public.complete_routine_occurrence(text, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Cercle DELETE (D-12, modération adulte) : troisième branche bornée aux
-- adultes. Définitions effectives 0109:70-89 recouvertes sous leurs noms.
-- Ni INSERT ni UPDATE ni le trigger d'auteur 0109 ne sont touchés : un enfant
-- géré n'a pas de session, il ne publie jamais.
-- ---------------------------------------------------------------------------

drop policy if exists posts_delete_admin on public.posts;
create policy posts_delete_admin on public.posts
  for delete using (
    author_id = private.current_member_id(household_id)
    or private.is_household_admin(household_id)
    or (
      private.can_write_household(household_id)
      and private.is_managed_child(author_id)
    )
  );

drop policy if exists post_comments_delete_admin on public.post_comments;
create policy post_comments_delete_admin on public.post_comments
  for delete using (
    author_id = private.current_member_id(household_id)
    or private.is_household_admin(household_id)
    or (
      private.can_write_household(household_id)
      and private.is_managed_child(author_id)
    )
  );

drop policy if exists post_reactions_delete_admin on public.post_reactions;
create policy post_reactions_delete_admin on public.post_reactions
  for delete using (
    author_id = private.current_member_id(household_id)
    or private.is_household_admin(household_id)
    or (
      private.can_write_household(household_id)
      and private.is_managed_child(author_id)
    )
  );

comment on policy posts_delete_admin on public.posts is
  'D-12 : auteur, admin, ou tout adulte modérant un contenu attribué à un enfant géré du foyer.';

comment on policy post_comments_delete_admin on public.post_comments is
  'D-12 : auteur, admin, ou tout adulte modérant un contenu attribué à un enfant géré du foyer.';

comment on policy post_reactions_delete_admin on public.post_reactions is
  'D-12 : auteur, admin, ou tout adulte modérant un contenu attribué à un enfant géré du foyer.';

-- ---------------------------------------------------------------------------
-- 7. Clauses D-06 sur les chemins de placement hors socle.
-- ---------------------------------------------------------------------------

-- 7a. Conversations ('messages', hors socle) : create_conversation (0041:28)
-- recopié-modifié. Dans la boucle des membres, après le contrôle
-- d'appartenance, refuser un enfant géré non autorisé sur 'messages'
-- (22023, garde bornée aux enfants — un adulte passe toujours).
create or replace function public.create_conversation(
  p_household_id text,
  p_type text default 'direct',
  p_title text default null,
  p_member_ids jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_self text;
  v_conversation_id text := private.new_id('conversation');
  v_member text;
  v_seen text[] := '{}';
  v_count integer := 0;
  v_out jsonb;
begin
  if v_actor is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_household_id is null then
    raise exception 'foyer obligatoire' using errcode = '22023';
  end if;
  perform private.assert_household_member(p_household_id, v_actor);

  if p_type not in ('direct', 'groupe') then
    raise exception 'type de conversation invalide' using errcode = '22023';
  end if;
  if p_type = 'groupe' then
    if p_title is null or char_length(btrim(p_title)) not between 1 and 120 then
      raise exception 'un groupe exige un titre' using errcode = '22023';
    end if;
  elsif p_title is not null then
    raise exception 'un direct ne porte pas de titre' using errcode = '22023';
  end if;

  if p_member_ids is null or jsonb_typeof(p_member_ids) != 'array' or jsonb_array_length(p_member_ids) = 0 then
    raise exception 'au moins un membre doit participer à la conversation' using errcode = '22023';
  end if;

  select private.current_member_id(p_household_id) into v_self;
  if v_self is null then
    raise exception 'aucune ligne membre pour cet acteur dans ce foyer' using errcode = '42501';
  end if;

  insert into public.conversations (id, household_id, type, title)
  values (v_conversation_id, p_household_id, p_type, case when p_type = 'groupe' then btrim(p_title) else null end);

  for v_member in select * from jsonb_array_elements_text(p_member_ids) loop
    if v_member = any (v_seen) then
      continue;
    end if;
    v_seen := v_seen || v_member;
    if private.member_in_household(v_member, p_household_id) is not true then
      raise exception 'le membre % n''appartient pas au foyer de la conversation', v_member
        using errcode = '23514';
    end if;
    -- D-06 : un enfant géré n'entre dans une conversation que si 'messages'
    -- est ouvert sur sa fiche. Un adulte passe toujours (la garde est bornée
    -- aux enfants gérés).
    if private.is_managed_child(v_member) is true
       and private.managed_child_module_allowed(v_member, 'messages') is not true then
      raise exception 'cet enfant n''a pas accès à la messagerie' using errcode = '22023';
    end if;
    insert into public.conversation_members (conversation_id, member_id)
    values (v_conversation_id, v_member);
    v_count := v_count + 1;
  end loop;

  -- v_seen est non vide ici (la boucle a tourné au moins une fois) : la
  -- forme `<> all` ne vaut jamais NULL et dit « le créateur n'y est pas ».
  if v_self <> all (v_seen) then
    raise exception 'le créateur doit participer à sa conversation' using errcode = '22023';
  end if;

  select jsonb_build_object('id', v_conversation_id) into v_out;
  return v_out;
end;
$$;

comment on function public.create_conversation(text, text, text, jsonb) is
  'Crée une conversation et ses membres en une transaction. Appartenance exigée, enfants inclus si leur fiche ouvre ''messages'' (D-06). USAGE AUTHENTIFIÉ UNIQUEMENT.';

revoke all on function public.create_conversation(text, text, text, jsonb) from public, anon;
grant execute on function public.create_conversation(text, text, text, jsonb) to authenticated;

-- can_join_conversation (0007:111) ne connaît que l'appelant porteur de
-- session (auth.uid()) — or un enfant géré n'a JAMAIS de session depuis
-- l'invariant 0145 : il ne peut pas « rejoindre par lui-même ». La garde
-- enfant porte donc sur les chemins qui insèrent ou raniment sa ligne :
-- les politiques conversation_members_insert (0007:547) et
-- conversation_members_update (0104:55, réadhésion par effacement du
-- left_at), consommatrices de can_join_conversation, recouvertes ici avec
-- la clause module.
drop policy if exists conversation_members_insert on public.conversation_members;
create policy conversation_members_insert on public.conversation_members
  for insert with check (
    private.can_join_conversation(conversation_id)
    and private.member_in_household(
      member_id, private.conversation_household_id(conversation_id)
    )
    and (
      private.is_managed_child(member_id) is not true
      or private.managed_child_module_allowed(member_id, 'messages')
    )
  );

drop policy if exists conversation_members_update on public.conversation_members;
create policy conversation_members_update on public.conversation_members
  for update using (
    left_at is not null
    and private.can_join_conversation(conversation_id)
    and private.member_in_household(
      member_id, private.conversation_household_id(conversation_id)
    )
    and (
      private.is_managed_child(member_id) is not true
      or private.managed_child_module_allowed(member_id, 'messages')
    )
  )
  with check (
    left_at is null
    and private.can_join_conversation(conversation_id)
    and private.member_in_household(
      member_id, private.conversation_household_id(conversation_id)
    )
    and (
      private.is_managed_child(member_id) is not true
      or private.managed_child_module_allowed(member_id, 'messages')
    )
  );

-- 7b. Birthdays ('anniversaires', dans le socle) : un enfant sorti du module
-- ne peut pas être lié à une fiche anniversaire.
create or replace function private.guard_birthdays_linked_child()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.linked_member_id is not null
     and private.is_managed_child(new.linked_member_id) is true
     and private.managed_child_module_allowed(new.linked_member_id, 'anniversaires') is not true then
    raise exception 'cet enfant n''a pas accès aux anniversaires' using errcode = '22023';
  end if;
  return new;
end;
$$;

comment on function private.guard_birthdays_linked_child() is
  'D-06 : refuse de lier un enfant géré hors-module ''anniversaires'' à une fiche (22023).';

drop trigger if exists guard_birthdays_linked_child on public.birthdays;
create trigger guard_birthdays_linked_child
  before insert or update on public.birthdays
  for each row execute function private.guard_birthdays_linked_child();

-- 7c. meal_entries ('menu', dans le socle) : normalisation silencieuse
-- (backstop A3, assumée et commentée). Un enfant non autorisé sur 'menu'
-- est retiré de member_ids au lieu de lever — le repas reste valide pour le
-- foyer, la liste « qui mange » reflète la fiche.
create or replace function private.normalize_meal_entries_children()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.member_ids := coalesce(
    (
      select array_agg(mid order by ord)
        from unnest(new.member_ids) with ordinality as u (mid, ord)
       where private.is_managed_child(mid) is not true
          or private.managed_child_module_allowed(mid, 'menu') is true
    ),
    '{}'
  );
  return new;
end;
$$;

comment on function private.normalize_meal_entries_children() is
  'D-06/A3 : retire silencieusement de member_ids tout enfant géré hors-module ''menu'' (backstop assumé, pas d''erreur).';

drop trigger if exists normalize_meal_entries_children on public.meal_entries;
create trigger normalize_meal_entries_children
  before insert or update on public.meal_entries
  for each row execute function private.normalize_meal_entries_children();

commit;
