-- 0040_own_member_display_name.sql
-- Renommage de sa propre ligne membre + rattrapage des lignes à l'email.
--
-- Constat (usage réel, 30/09/2026) : « Mon profil » n'écrivait que
-- `profiles.display_name`, jamais `household_members.display_name`. Les listes
-- du foyer, les soldes serveur et les avatars lisent la ligne membre : ils
-- affichaient donc le nom figé à la création (partie locale de l'email),
-- alors que le profil portait déjà le vrai « Prénom Nom ». Et la session
-- (`toSessionUser`) retombait sur l'email complet faute de `full_name`.
--
-- Deux corrections, pas de régression RLS :
--   * `public.rename_own_member_name` : un membre renomme SA ligne (vérifiée
--     par `user_id = auth.uid()`), display_name seul — aucun rôle, aucun
--     foyer, aucun autre membre ne passe par là. `EXECUTE` à `authenticated`
--     seul. La politique `household_members_update` reste réservée aux admins
--     (pas de trigger qui lèverait : `testkit.affected` ne capture pas les
--     erreurs, un refus par exception casserait les assertions `= 0` de 0002).
--   * Rattrapage unique : les lignes membre dont le nom EST l'email de
--     l'utilisateur reprennent le `display_name` du profil quand celui-ci
--     n'est ni vide ni un email. Seule l'égalité exacte est reprise : une
--     partie locale (« jeremymaillot ») peut être un surnom volontaire, on ne
--     devine pas — la prochaine sauvegarde du profil propagera (le formulaire
--     appelle désormais le RPC).

begin;

create or replace function public.rename_own_member_name(
  p_member_id text,
  p_display_name text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_out jsonb;
begin
  if v_actor is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_display_name is null or char_length(btrim(p_display_name)) not between 2 and 120 then
    raise exception 'indiquez un nom d''au moins deux caractères' using errcode = '22023';
  end if;

  update public.household_members m
     set display_name = btrim(p_display_name)
   where m.id = p_member_id
     and m.user_id = v_actor;

  if not found then
    raise exception 'membre introuvable ou autre que vous' using errcode = '42501';
  end if;

  select to_jsonb(m) into v_out from public.household_members m where m.id = p_member_id;
  return v_out;
end;
$$;

comment on function public.rename_own_member_name(text, text) is
  'Renomme sa propre ligne membre (display_name seul). USAGE AUTHENTIFIÉ UNIQUEMENT : l''acteur est auth.uid(), jamais un paramètre.';

revoke all on function public.rename_own_member_name(text, text) from public, anon;
grant execute on function public.rename_own_member_name(text, text) to authenticated;

-- Rattrapage : nom = email exact → display_name du profil (non-email, non vide).
do $$
declare
  v_fixed integer;
begin
  with fixed as (
    update public.household_members m
       set display_name = btrim(p.display_name)
      from public.profiles p
     where m.user_id = p.id
       and m.display_name = p.email
       and btrim(p.display_name) <> ''
       and p.display_name not like '%@%'
    returning m.id
  )
  select count(*) into v_fixed from fixed;
  if v_fixed > 0 then
    raise notice 'rattrapage : % ligne(s) membre reprendront le nom du profil', v_fixed;
  end if;
end;
$$;

-- Garde-fous permanents (précédent 0016, 0035) : porte fermée à `anon`.
do $$
begin
  if has_function_privilege('anon', 'public.rename_own_member_name(text, text)', 'EXECUTE') then
    raise exception 'anon ne doit pas pouvoir renommer une ligne membre par RPC';
  end if;
  if not has_function_privilege('authenticated', 'public.rename_own_member_name(text, text)', 'EXECUTE') then
    raise exception 'authenticated doit pouvoir renommer sa ligne membre par RPC';
  end if;
end;
$$;

commit;
