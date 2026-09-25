-- 0016_create_household.sql
-- Crée un foyer et son premier membre dans UNE transaction.
--
-- Constat (premier parcours réel, 25/09/2026) : l'insertion du foyer depuis le
-- client était refusée par
--
--   new row violates row-level security policy for table "households"
--
-- alors que `created_by` valait bien l'uid de l'appelant, et que le jeton
-- était transmis. Deux requêtes distinctes étaient en cause.
--
-- 1. `INSERT … RETURNING` applique la politique de LECTURE aux lignes
--    renvoyées. La politique de lecture de `households` est
--    `private.is_household_member(id)` : au moment où la ligne est insérée,
--    l'appelant n'est pas encore membre du foyer qu'il vient de créer — le
--    `household_members` est inséré par la requête suivante. La ligne passait
--    le `WITH CHECK` d'insertion, puis était refusée au moment du renvoi.
--
-- 2. Deux requêtes ne sont pas atomiques. Si l'insertion du membre échoue,
--    il reste un foyer sans administratrice — et `households_delete` exige un
--    administrateur : ce foyer devient alors impossible à supprimer, par
--    quiconque, définitivement. Le second défaut est plus grave que le premier,
--    et il existe indépendamment de lui.
--
-- La fonction ci-dessous supprime les deux : une fonction PostgreSQL s'exécute
-- dans une transaction, donc foyer et membre disparaissent ensemble en cas
-- d'échec, et le foyer est renvoyé par la valeur de retour — pas par un
-- `RETURNING` soumis à la politique de lecture.
--
-- Elle est `SECURITY DEFINER` : c'est la seule façon d'écrire dans les deux
-- tables en une seule opération côté client. Ce que la sécurité exige est
-- explicite et vérifié ici :
--
--   * l'acteur est `auth.uid()`, jamais un paramètre — un client ne peut donc
--     pas créer un foyer au nom d'un autre, ce qu'interdisait déjà la
--     politique `households_insert` ;
--   * le rôle est `admin` en dur, jamais fourni par l'appelant ;
--   * `EXECUTE` n'est accordé qu'à `authenticated`, et révoqué à `anon` et
--     `public` : un visiteur non connecté ne peut pas créer de foyer.
--
-- Les politiques `households_insert` et `household_members_insert` restent en
-- place : la fonction ne les contourne pas pour autant, elle s'exécute avec les
-- droits de son propriétaire, et c'est elle qui fait les vérifications.

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
  'Crée un foyer et son premier administrateur en une transaction. USAGE AUTHENTIFIÉ UNIQUEMENT : l''acteur est auth.uid(), jamais un paramètre.';

-- Un visiteur non connecté ne peut pas créer de foyer, et personne ne peut
-- exécuter la fonction par défaut : `EXECUTE` est accordé à PUBLIC sur toute
-- fonction créée, il faut donc le retirer explicitement.
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
