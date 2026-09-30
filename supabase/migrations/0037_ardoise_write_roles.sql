-- 0037_ardoise_write_roles.sql
-- Écriture de l'Ardoise : rôle exigé côté RPC, suppression des parts aux admins.
--
-- Constat (audit, 30/09/2026), deux trous d'autorisation :
--
--   1. `public.create_expense` / `public.update_expense` (0035) vérifient
--      l'appartenance au foyer (`assert_household_member`), pas le rôle. Or
--      `can_write_household` n'accepte que `admin`/`membre` (0006), et les RLS
--      `expenses`/`expense_participants` appliquent cette exclusion aux
--      écritures directes. `EXECUTE to authenticated` ouvrait donc aux `enfant`
--      une écriture que PostgREST leur refuse. Ajout d'un
--      `assert_household_writer` (admin ou membre) dans les deux RPC.
--   2. `expense_participants_delete` n'exigeait que `can_write_expense`,
--      alors que toutes les autres tables enfants exigent leur `can_admin_*`
--      pour `DELETE` (tâches, routines, rappels) et que `expenses_delete`
--      exige déjà un admin. Tout membre pouvait supprimer des parts — et avec
--      la tolérance « zéro part » (0008), annuler l'effet financier d'une
--      dépense sans droit de suppression sur la dépense elle-même. Le `DELETE`
--      des parts passe à `can_admin_expense`, au même motif que les autres
--      enfants. Un admin pouvant déjà supprimer la dépense entière, cela ne
--      lui donne aucun pouvoir nouveau.

begin;

-- ---------------------------------------------------------------------------
-- Rôle écrivain pour les opérations serveur (clé secrète ou RPC authentifié).
-- ---------------------------------------------------------------------------
create or replace function private.assert_household_writer(
  p_household_id text,
  p_user_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_household_id is null or p_user_id is null then
    raise exception 'foyer et acteur obligatoires' using errcode = '22023';
  end if;

  if not exists (
    select 1
      from public.household_members m
     where m.household_id = p_household_id
       and m.user_id = p_user_id
       and m.role in ('admin', 'membre')
  ) then
    raise exception 'écriture refusée : rôle insuffisant dans ce foyer'
      using errcode = '42501';
  end if;
end;
$$;

comment on function private.assert_household_writer(text, uuid) is
  'Refuse l''opération si l''acteur n''est pas admin ou membre du foyer (serveur). Les enfants restent en lecture seule.';

revoke all on function private.assert_household_writer(text, uuid) from public, anon, authenticated;
grant execute on function private.assert_household_writer(text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- `create_expense` / `update_expense` : mêmes corps que 0035, plus l'exigence
-- du rôle écrivain après le contrôle d'appartenance.
-- ---------------------------------------------------------------------------
create or replace function public.create_expense(
  p_household_id text,
  p_title text,
  p_amount numeric,
  p_paid_by text,
  p_expense_date date,
  p_split_type text default 'egal',
  p_parts jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_expense_id text := private.new_id('expense');
  v_out jsonb;
begin
  if v_actor is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_household_id is null then
    raise exception 'foyer obligatoire' using errcode = '22023';
  end if;
  perform private.assert_household_member(p_household_id, v_actor);
  perform private.assert_household_writer(p_household_id, v_actor);

  if p_title is null or char_length(btrim(p_title)) not between 1 and 200 then
    raise exception 'libellé de dépense invalide' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'le montant doit être supérieur à zéro' using errcode = '22023';
  end if;
  if p_split_type not in ('egal', 'personnalise') then
    raise exception 'type de partage invalide' using errcode = '22023';
  end if;
  if p_paid_by is null or not private.member_in_household(p_paid_by, p_household_id) then
    raise exception 'le payeur n''appartient pas au foyer de la dépense' using errcode = '23514';
  end if;

  insert into public.expenses (id, household_id, title, amount, paid_by, expense_date, split_type)
  values (v_expense_id, p_household_id, btrim(p_title), round(p_amount, 2), p_paid_by, coalesce(p_expense_date, current_date), p_split_type);

  perform private.insert_expense_parts(v_expense_id, p_household_id, round(p_amount, 2), p_parts);

  select to_jsonb(e) into v_out from public.expenses e where e.id = v_expense_id;
  return v_out;
end;
$$;

create or replace function public.update_expense(
  p_expense_id text,
  p_title text,
  p_amount numeric,
  p_paid_by text,
  p_expense_date date,
  p_split_type text default 'egal',
  p_parts jsonb default '[]'::jsonb
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
  v_out jsonb;
begin
  if v_actor is null then
    raise exception 'session requise' using errcode = '28000';
  end if;

  select e.household_id into v_household_id
    from public.expenses e
   where e.id = p_expense_id;
  if v_household_id is null then
    raise exception 'dépense introuvable' using errcode = 'P0002';
  end if;
  perform private.assert_household_member(v_household_id, v_actor);
  perform private.assert_household_writer(v_household_id, v_actor);

  if p_title is null or char_length(btrim(p_title)) not between 1 and 200 then
    raise exception 'libellé de dépense invalide' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'le montant doit être supérieur à zéro' using errcode = '22023';
  end if;
  if p_split_type not in ('egal', 'personnalise') then
    raise exception 'type de partage invalide' using errcode = '22023';
  end if;
  if p_paid_by is null or not private.member_in_household(p_paid_by, v_household_id) then
    raise exception 'le payeur n''appartient pas au foyer de la dépense' using errcode = '23514';
  end if;

  update public.expenses
     set title = btrim(p_title),
         amount = round(p_amount, 2),
         paid_by = p_paid_by,
         expense_date = coalesce(p_expense_date, expense_date),
         split_type = p_split_type
   where id = p_expense_id;

  delete from public.expense_participants where expense_id = p_expense_id;

  perform private.insert_expense_parts(p_expense_id, v_household_id, round(p_amount, 2), p_parts);

  select to_jsonb(e) into v_out from public.expenses e where e.id = p_expense_id;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- Suppression des parts : administrateurs uniquement, comme les autres tables
-- enfants et comme la dépense elle-même.
-- ---------------------------------------------------------------------------
create or replace function private.can_admin_expense(p_expense_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_household_admin(private.parent_household_id('expenses', p_expense_id));
$$;

drop policy if exists expense_participants_delete on public.expense_participants;
create policy expense_participants_delete on public.expense_participants
  for delete using (private.can_admin_expense(expense_id));

commit;
