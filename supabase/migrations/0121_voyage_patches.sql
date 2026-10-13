-- 0121_voyage_patches.sql
-- Fiche voyage : la dépense retient son créateur (`expenses.created_by`)
-- pour que l'onglet Budget propose « Modifier » à l'admin du foyer et au
-- créateur de la ligne (les lignes héritées, sans créateur, restent
-- admin-seules). `update_expense` ne touche jamais au créateur.
--
-- Vers l'avant uniquement, aucune migration appliquée retouchée (AGENTS.md
-- §2.7A). Toute table s'écrit `public.*` (search_path vide ne résout rien).

begin;

alter table public.expenses
  add column created_by text references public.household_members (id) on delete set null;

comment on column public.expenses.created_by is
  'Membre créateur de la dépense (édition réservée aux admins et au créateur côté voyage). NULL pour les lignes héritées.';

-- Création : le créateur est résolu en base depuis la session (jamais fourni
-- par le client), comme `trips.created_by` en 0118. Corps repris de 0058 à
-- l'identique, seule la persistance du créateur s'ajoute.
create or replace function public.create_expense(
  p_household_id text,
  p_ardoise_id text,
  p_title text,
  p_amount numeric,
  p_paid_by text,
  p_paid_by_guest text,
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
  v_creator text;
  v_out jsonb;
  v_ardoise_household text;
begin
  if v_actor is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_household_id is null then
    raise exception 'foyer obligatoire' using errcode = '22023';
  end if;
  perform private.assert_household_member(p_household_id, v_actor);
  perform private.assert_household_writer(p_household_id, v_actor);

  select a.household_id into v_ardoise_household
    from public.ardoises a
   where a.id = p_ardoise_id;
  if v_ardoise_household is null then
    raise exception 'ardoise introuvable' using errcode = 'P0002';
  end if;
  if v_ardoise_household <> p_household_id then
    raise exception 'ardoise d''un autre foyer' using errcode = '23514';
  end if;
  if not private.can_write_ardoise(p_ardoise_id)
     and not private.is_household_admin(p_household_id) then
    -- `can_write_ardoise` lit auth.uid() : l'acteur courant est déjà vérifié
    -- writer, il doit en plus être inscrit à l'ardoise (ou admin).
    raise exception 'inscription à l''ardoise requise' using errcode = '42501';
  end if;

  if p_title is null or char_length(btrim(p_title)) not between 1 and 200 then
    raise exception 'libellé de dépense invalide' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'le montant doit être supérieur à zéro' using errcode = '22023';
  end if;
  if p_split_type not in ('egal', 'personnalise') then
    raise exception 'type de partage invalide' using errcode = '22023';
  end if;
  if p_paid_by is not null and p_paid_by_guest is not null then
    raise exception 'un seul payeur par dépense' using errcode = '22023';
  end if;

  select m.id into v_creator
    from public.household_members m
   where m.household_id = p_household_id and m.user_id = v_actor
   limit 1;

  insert into public.expenses (id, household_id, ardoise_id, title, amount, paid_by, paid_by_guest, expense_date, split_type, created_by)
  values (v_expense_id, p_household_id, p_ardoise_id, btrim(p_title), round(p_amount, 2), p_paid_by, p_paid_by_guest, coalesce(p_expense_date, current_date), p_split_type, v_creator);

  perform private.insert_expense_parts(v_expense_id, p_household_id, round(p_amount, 2), p_parts);

  select to_jsonb(e) into v_out from public.expenses e where e.id = v_expense_id;
  return v_out;
end;
$$;

comment on function public.create_expense(text, text, text, numeric, text, text, date, text, jsonb) is
  'USAGE AUTHENTICATED. Crée une dépense et ses parts en une transaction (0121 : retient le créateur).';

grant execute on function public.create_expense(text, text, text, numeric, text, text, date, text, jsonb) to authenticated;

commit;
