-- 0036_set_member_role.sql
-- Changement du rôle d'un membre par un administrateur, côté serveur.
--
-- Constat (usage réel, 30/09/2026) : le panneau des membres portait un bouton
-- « Changer le rôle » désactivé, renvoyant à une Edge Function jamais écrite —
-- et la note affirmait que « la Row Level Security l'interdit », ce qui est
-- faux : `household_members_update` autorise tout administrateur, sans
-- distinguer les colonnes. La vraie raison d'interdire l'écriture directe est
-- ailleurs : rien n'empêche de rétrograder le DERNIER administrateur, ce qui
-- laisse un foyer sans personne capable de le gérer (la suppression exige
-- déjà un admin, la rétrogradation ne vérifiait rien).
--
-- La correction suit le précédent des RPC d'écriture (0016, 0035) : une
-- fonction `SECURITY DEFINER` qui vérifie en base — acteur administrateur du
-- foyer, rôle cible dans l'enum, jamais de rétrogradation du dernier
-- administrateur — et que le client appelle par RPC. `EXECUTE` accordé à
-- `authenticated` seul, comme `create_household` et les RPC de l'Ardoise.

begin;

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

  update public.household_members
     set role = p_role
   where id = p_member_id;

  return jsonb_build_object('id', p_member_id, 'role', p_role);
end;
$$;

comment on function public.set_member_role(text, text) is
  'Change le rôle d''un membre, administrateur requis, dernier admin protégé. USAGE AUTHENTIFIÉ UNIQUEMENT : l''acteur est auth.uid(), jamais un paramètre.';

-- `EXECUTE` par défaut à PUBLIC : retrait explicite, comme en 0016 et 0035.
revoke all on function public.set_member_role(text, text) from public, anon;
grant execute on function public.set_member_role(text, text) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.set_member_role(text, text)', 'EXECUTE') then
    raise exception 'anon ne doit pas pouvoir changer un rôle par RPC';
  end if;
  if not has_function_privilege('authenticated', 'public.set_member_role(text, text)', 'EXECUTE') then
    raise exception 'authenticated doit pouvoir changer un rôle par RPC';
  end if;
end;
$$;

commit;
