-- supabase/migrations/0095_gift_member_leave.sql
--
-- Phase 06 Cadeaux-Invites (plan 06-08, fermeture du gap G-06-1c) : un membre
-- invité peut QUITTER une liste rejointe d'un autre foyer — sa part est
-- supprimée (la liste sort de sa vue Cadeaux), ses tenues attribuées sous
-- nom vérifié restent intactes (style anonyme), et le lien d'invitation
-- rejoint normalement (le redeem existant recrée la part, 0082 inchangé).
--
-- POURQUOI UN RPC DÉDIÉ : la RLS `gift_list_shares_delete` n'autorise que les
-- gestionnaires (`can_manage_gift_list`) — un invité ne peut pas supprimer
-- sa propre part en direct (prouvé en 0034 §1 : refus net, pas de fuite).
-- Élargir la politique DELETE aux invités ouvrirait la suppression des parts
-- d'autrui ; le RPC `service_role` supprime donc EXACTEMENT les parts de
-- l'appelant (identité résolue côté serveur depuis la session, jamais fournie
-- par le client — T-06-14), sur UNE liste, sans toucher à rien d'autre.
--
-- ORACLE UNIFORME (T-06-15) : liste inconnue, aucune part propre sur la liste,
-- et liste du propre foyer (quitter son foyer est hors périmètre — le bouton
-- ne s'y affiche jamais, le serveur refuse de toute façon) rendent tous le
-- même `quitter impossible` — le client n'apprend jamais si la liste existe.
--
-- AUCUNE politique RLS n'est élargie, AUCUNE colonne n'est ajoutée, AUCUN
-- compteur d'invitation n'est consommé : `gift_items` n'est jamais touché
-- (les tenues attribuées survivent byte-identiques), les parts des autres
-- membres survivent, et le re-échange du code recrée la part (idempotence
-- 0082 intacte : `already_shared` faux puis vrai).

begin;

create or replace function public.member_leave_gift_list(
  p_actor_id uuid,
  p_list_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_household_id text;
  v_email text;
  v_deleted integer;
begin
  if p_actor_id is null then
    raise exception 'session requise' using errcode = '28000';
  end if;

  -- Identifiant inconnu ou vide : même refus uniforme, sans distinguer
  -- (même discipline d'oracle que la voie invitée — T-06-15).
  if p_list_id is null or p_list_id = '' then
    raise exception 'quitter impossible' using errcode = 'P0002';
  end if;

  select l.household_id into v_household_id
    from public.gift_lists l where l.id = p_list_id;
  -- Liste disparue ou inconnue : même refus, rien de plus.
  if v_household_id is null then
    raise exception 'quitter impossible' using errcode = 'P0002';
  end if;

  -- Liste du propre foyer : quitter est hors périmètre (G-06-1c) — le bouton
  -- ne s'y affiche jamais, le serveur refuse de toute façon, sans le dire
  -- autrement que l'oracle (aucune fuite d'existence dans un sens ou l'autre).
  if exists (
    select 1
      from public.household_members m
     where m.household_id = v_household_id
       and m.user_id = p_actor_id
  ) then
    raise exception 'quitter impossible' using errcode = 'P0002';
  end if;

  select p.email into v_email
    from public.profiles p where p.id = p_actor_id;

  -- Suppression cadrée (liste × identité propre, les DEUX formes de part :
  -- ligne membre de n'importe lequel de ses foyers, OU e-mail de son compte
  -- normalisé comme au redeem 0082). Ni les tenues (`gift_items` jamais
  -- touché), ni les parts des autres membres, ni les compteurs.
  delete from public.gift_list_shares s
   where s.list_id = p_list_id
     and (
       exists (
         select 1
           from public.household_members m
          where m.id = s.shared_with_member_id
            and m.user_id = p_actor_id
       )
       or (
         v_email is not null
         and s.shared_with_email is not null
         and lower(btrim(s.shared_with_email)) = lower(btrim(v_email))
       )
     );

  get diagnostics v_deleted = row_count;
  -- Aucune part propre : même refus uniforme (liste rejointe jamais, déjà
  -- quittée, ou part d'autrui convoitée — le client ne distingue pas).
  if v_deleted = 0 then
    raise exception 'quitter impossible' using errcode = 'P0002';
  end if;

  -- Le re-échange du code recrée la part via le redeem existant (0082) : le
  -- départ ne consomme ni ne rend aucun jeton, il efface seulement des parts.
  return jsonb_build_object('list_id', p_list_id, 'left', true);
end;
$$;

comment on function public.member_leave_gift_list(uuid, text) is
  'USAGE SERVEUR UNIQUEMENT. Départ volontaire d''une liste rejointe inter-foyers (G-06-1c, 0095) : supprime exactement les parts de l''appelant (identité résolue en base, jamais fournie), oracle uniforme sinon, tenues attribuées et parts d''autrui intactes, re-échange via le redeem existant.';

-- ---------------------------------------------------------------------------
-- Privilèges : RPC serveur au seul `service_role` (motif 0009/0079).
-- ---------------------------------------------------------------------------
revoke all on function public.member_leave_gift_list(uuid, text) from public, anon, authenticated;
grant execute on function public.member_leave_gift_list(uuid, text) to service_role;

do $$
begin
  if has_function_privilege('authenticated', 'public.member_leave_gift_list(uuid,text)', 'EXECUTE') then
    raise exception 'authenticated ne doit pas quitter une liste partagee en direct';
  end if;
  if not has_function_privilege('service_role', 'public.member_leave_gift_list(uuid,text)', 'EXECUTE') then
    raise exception 'service_role doit pouvoir faire quitter une liste partagee';
  end if;
end;
$$;

commit;
