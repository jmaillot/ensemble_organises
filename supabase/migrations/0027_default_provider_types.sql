-- 0027_default_provider_types.sql
-- Types de prestataires proposés par défaut à chaque foyer.
--
-- Constat d'usage réel (27/09/2026) : le formulaire affiche « Sans type » et
-- la création de types existe (« Gérer les types »), mais un foyer neuf part
-- d'une liste vide — chaque foyer ressaisit les mêmes métiers. Les dix types
-- ci-dessous couvrent les besoins courants ; ils restent modifiables
-- (renommage, suppression) comme n'importe quel type.
--
-- Deux moitiés, comme 0021 sur le même sujet :
--   1. `create_household` sème les types avec le membre (foyers futurs) ;
--   2. rattrapage des foyers existants, sans écraser leurs types
--      (`on conflict do nothing` sur l'unicité `provider_types_name_unique`).

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

  -- Le nom d'affichage vient du profil, comme pour l'échange d'un token : le
  -- client ne choisit pas le nom sous lequel il apparaîtra chez les autres.
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

  -- Types proposés par défaut : le foyer les adopte, les renomme ou les
  -- supprime. `on conflict do nothing` garde l'opération idempotente.
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
  'Crée un foyer, son premier administrateur et ses types de prestataires par défaut en une transaction. USAGE AUTHENTIFIÉ UNIQUEMENT : l''acteur est auth.uid(), jamais un paramètre.';

-- Rattrapage des foyers créés avant cette migration : seuls les noms absents
-- sont ajoutés, les types existants (même renommés) sont conservés.
insert into public.provider_types (id, household_id, name)
select private.new_id('provider-type'), h.id, t.name
  from public.households h
  cross join (values
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

-- `create or replace` recrée les ACL : même discipline que 0016 et 0020.
-- `EXECUTE` est accordé à PUBLIC sur toute fonction créée, il faut donc le
-- retirer explicitement.
revoke all on function public.create_household(text, text) from public, anon;
grant execute on function public.create_household(text, text) to authenticated;

-- Le test de schéma vérifie que la fonction reste fermée à `anon` : c'est la
-- seule porte d'entrée de la création de foyer.
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
