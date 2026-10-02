-- 0054_create_household_seeds.sql
-- Correctif : 0052 avait réécrit public.create_household sans le bloc seed des
-- dix types de prestataires de 0027 (test 0008 rouge : 0 au lieu de 10).
-- Cette version cumule les trois seeds : dossiers Général ×3, calendrier
-- Commun + 4 catégories, dix types de prestataires.
--
-- `create or replace` recrée les ACL : même discipline que 0016/0027
-- (revoke public+anon, grant authenticated).

begin;

create or replace function public.create_household(
  p_name text,
  p_avatar_color text default 'accent'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_household_id text;
  v_member_id text;
  v_display_name text;
begin
  if v_actor is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 120 then
    raise exception 'nom de foyer invalide' using errcode = '22023';
  end if;
  if p_avatar_color is null or not private.is_member_color(p_avatar_color) then
    raise exception 'couleur invalide' using errcode = '22023';
  end if;

  v_household_id := private.new_id('household');
  v_member_id := private.new_id('member');

  select p.display_name into v_display_name
    from public.profiles p
   where p.id = v_actor;

  insert into public.households (id, name, avatar_color, created_by)
  values (v_household_id, btrim(p_name), p_avatar_color, v_actor);

  insert into public.household_members (
    id, household_id, user_id, display_name, color_tag, role
  ) values (
    v_member_id,
    v_household_id,
    v_actor,
    coalesce(nullif(btrim(v_display_name), ''), 'Nouveau foyer'),
    p_avatar_color,
    'admin'
  );

  insert into public.task_lists (household_id, name, visibility, owner_member_id, is_default)
  values (v_household_id, 'Général', 'foyer', v_member_id, true);
  insert into public.note_folders (household_id, name, visibility, owner_member_id, is_default)
  values (v_household_id, 'Général', 'foyer', v_member_id, true);
  insert into public.routine_folders (household_id, name, visibility, owner_member_id, is_default)
  values (v_household_id, 'Général', 'foyer', v_member_id, true);

  insert into public.event_calendars (household_id, name, visibility, owner_member_id)
  values (v_household_id, 'Commun', 'commun', null);

  insert into public.event_categories (household_id, name, color, is_default)
  values (v_household_id, 'Repas', '#E8930C', true),
         (v_household_id, 'Médical', '#D64545', true),
         (v_household_id, 'École', '#3E7CB1', true),
         (v_household_id, 'Sport', '#4CAF50', true);

  insert into public.provider_types (id, household_id, name)
  select private.new_id('provider-type'), v_household_id, t.name
    from (values
      ('Médecin'),
      ('Dentiste'),
      ('Pharmacie'),
      ('Plombier'),
      ('Électricien'),
      ('Garagiste'),
      ('Coiffeur'),
      ('Vétérinaire'),
      ('Assurance'),
      ('Banque')
    ) as t(name)
  on conflict do nothing;

  return jsonb_build_object(
    'household', jsonb_build_object(
      'id', v_household_id,
      'name', btrim(p_name),
      'avatar_color', p_avatar_color,
      'created_by', v_actor
    ),
    'member', jsonb_build_object(
      'id', v_member_id,
      'household_id', v_household_id,
      'user_id', v_actor,
      'display_name', coalesce(nullif(btrim(v_display_name), ''), 'Nouveau foyer'),
      'color_tag', p_avatar_color,
      'role', 'admin'
    )
  );
end;
$$;

comment on function public.create_household(text, text) is
  'Crée un foyer, son premier administrateur, ses dossiers Général, son calendrier Commun, ses catégories et ses types de prestataires par défaut en une transaction. USAGE AUTHENTIFIÉ UNIQUEMENT : l''acteur est auth.uid(), jamais un paramètre.';

revoke all on function public.create_household(text, text) from public, anon;
grant execute on function public.create_household(text, text) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.create_household(text, text)', 'EXECUTE') then
    raise exception 'anon ne doit pas pouvoir créer un foyer';
  end if;
  if not has_function_privilege('authenticated', 'public.create_household(text, text)', 'EXECUTE') then
    raise exception 'authenticated doit pouvoir créer un foyer';
  end if;
end;
$$;

commit;
