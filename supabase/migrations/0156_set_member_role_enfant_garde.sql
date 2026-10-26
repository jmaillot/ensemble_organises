-- 0156_set_member_role_enfant_garde.sql
-- Garde conversationnelle sur la promotion d'un enfant géré (finding IN-02
-- de la revue de phase 25) — 0145 recopié-modifié, aucune migration appliquée
-- n'est réécrite :
--
--    Changer le rôle d'une fiche enfant sans compte vers 'membre' échouait
--    en 23514 PostgreSQL brut (CHECK chk_members_managed_child) au lieu du
--    22023 traduit des autres gardes de la phase. Le refus reste correct ;
--    seul le message devient conversationnel : la garde D-17c est ajoutée
--    après la garde D-17b — un enfant géré (sans compte) ne peut pas
--    recevoir un rôle adulte. La promotion d'un enfant majeur reste le
--    chemin d'adoption dédié, jamais un simple changement de rôle.
--
-- Définition recopiée depuis 0145 (elle-même venue de 0036, D-17b) ; grants
-- inchangés (authenticated seul).

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

  -- D-17c (0156, IN-02) : un enfant géré — sans compte — ne peut pas
  -- recevoir un rôle adulte. La CHECK chk_members_managed_child (0145)
  -- refuserait de toute façon (23514 brut) ; la garde donne le message
  -- conversationnel 22023 des autres gardes de la phase. Archivée comprise :
  -- l'archive est un état figé, pas une fiche réanimable par changement de
  -- rôle. La promotion d'un enfant majeur passe par la fonction d'adoption,
  -- jamais par ici.
  if p_role <> 'enfant'
    and exists (
      select 1
        from public.household_members m
       where m.id = p_member_id
         and m.user_id is null
    ) then
    raise exception 'un enfant géré ne peut pas recevoir un rôle adulte'
      using errcode = '22023';
  end if;

  update public.household_members
     set role = p_role
    where id = p_member_id;

  return jsonb_build_object('id', p_member_id, 'role', p_role);
end;
$$;

comment on function public.set_member_role(text, text) is
  'Change le rôle d''un membre, administrateur requis, dernier admin protégé, refuse de transformer un membre-avec-compte en enfant géré (22023, D-17b) et un enfant géré en rôle adulte (22023, D-17c, 0156). USAGE AUTHENTIFIÉ UNIQUEMENT : l''acteur est auth.uid(), jamais un paramètre.';

commit;
