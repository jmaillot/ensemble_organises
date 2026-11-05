-- 0179_client_key_rpc.sql
-- Suite de 0177/0178 (WRQ-01) — correction vers l'avant (AGENTS §2.7 A) des
-- deux dernières fonctions serveur dont la définition effective insère dans
-- les tables Tier 1 SANS client_key (repérées par un scan pg_get_functiondef
-- filtré sur l'absence de client_key, AGENTS §2.7 A.2) :
--
--   1. `public.complete_routine_occurrence` (0146:507) : upsert dans
--      `routine_completions` — après le NOT NULL de 0177, chaque coche de
--      routine échouait. `client_key = gen_random_uuid()` : la ligne naît
--      côté serveur, le client ne rejoue jamais une coche (la file
--      d'écriture ne concerne que les écritures du client).
--   2. `public.replace_task_assignees` (0146:382) : insert…select dans
--      `task_assignees` — idem, uuid généré au serveur.
--
-- Définitions effectives recopiées-modifiées, aucune migration appliquée
-- n'est réécrite ; seul le site d'insertion change.

begin;

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

  -- `client_key` est alimentée par le serveur (0179) : ces lignes ne
  -- proviennent jamais d'un rejeu client. La déduplication porte sur le
  -- MEMBRE seul (comportement 0133 conservé) : poser gen_random_uuid() dans
  -- le select distinct la rendrait distincte par ligne et léverait
  -- task_assignees_pkey sur un doublon de p_member_ids (prouvé par 0133:95).
  insert into public.task_assignees (task_id, member_id, client_key)
  select p_task_id, d.m, gen_random_uuid()
    from (select distinct m from unnest(p_member_ids) as m) as d;

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
  -- actor_member_id = l'acteur (ENF-03). `client_key` est alimentée par le
  -- serveur (0179) : ces lignes ne proviennent jamais d'un rejeu client.
  insert into public.routine_completions
    (routine_id, household_id, occurrence_date, completed_by, actor_member_id, completed_at, status, client_key)
  values (p_routine_id, v_household_id, p_occurrence_date, v_target, v_actor_member_id, now(), 'fait', gen_random_uuid())
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

commit;
