-- 0069_ardoise_open_settlement.sql
-- Lecture anonyme par lien (`link-view`) : l'Edge vérifie le code (actif, non
-- expiré) puis lit les soldes SANS acteur ni ticket. `p_open_access` ouvre ce
-- troisième chemin, réservé au `service_role` comme les deux autres : la
-- vérification du code vit dans l'Edge, jamais dans le RPC.
--
-- Nouvelle signature donc nouvelle fonction : l'ancienne est supprimée
-- (jamais appelée que par l'Edge), jamais réécrite. Corps identique à 0064
-- à la branche d'autorisation près.

begin;

drop function if exists public.ardoise_settlement(uuid, text, text);

create or replace function public.ardoise_settlement(
  p_actor_id uuid,
  p_ardoise_id text,
  p_ticket_hash text default null,
  p_open_access boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_balances jsonb;
  v_settlements jsonb;
  v_household_id text;
  v_member_id text;
  v_role text;
  v_guest_ardoise text;
begin
  if p_ardoise_id is null then
    raise exception 'ardoise obligatoire' using errcode = '22023';
  end if;

  select a.household_id into v_household_id
    from public.ardoises a
   where a.id = p_ardoise_id;
  if v_household_id is null then
    raise exception 'ardoise introuvable' using errcode = 'P0002';
  end if;

  -- Chemin ouvert : lien vérifié par l'Edge (code actif, non expiré).
  if p_open_access is true then
    null;
  -- Chemin invité : ticket vérifié en base, aucun JWT requis.
  elsif p_ticket_hash is not null then
    if p_ticket_hash !~ '^[0-9a-f]{64}$' then
      raise exception 'ticket invalide' using errcode = '22023';
    end if;
    select g.ardoise_id into v_guest_ardoise
      from public.ardoise_guests g
     where g.ticket_hash = p_ticket_hash;
    if v_guest_ardoise is null or v_guest_ardoise <> p_ardoise_id then
      raise exception 'ticket invalide' using errcode = 'P0002';
    end if;
  else
    if p_actor_id is null then
      raise exception 'session requise' using errcode = '28000';
    end if;
    perform private.assert_household_member(v_household_id, p_actor_id);

    select m.id, m.role into v_member_id, v_role
      from public.household_members m
     where m.household_id = v_household_id
       and m.user_id = p_actor_id
     limit 1;
    if v_role <> 'admin'
       and not exists (
         select 1 from public.ardoise_members am
          where am.ardoise_id = p_ardoise_id and am.member_id = v_member_id
       ) then
      raise exception 'inscription à l''ardoise requise' using errcode = '42501';
    end if;
  end if;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'kind', b.kind,
               'participant_id', b.participant_id,
               'display_name', b.display_name,
               'amount', round(b.balance, 2)
             ) order by b.display_name
           ),
           '[]'::jsonb
         )
    into v_balances
    from private.ardoise_balances(p_ardoise_id) b;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'from_kind', s.debtor_kind,
               'from_id', s.debtor_id,
               'from_name', s.debtor_name,
               'to_kind', s.creditor_kind,
               'to_id', s.creditor_id,
               'to_name', s.creditor_name,
               'amount', round(s.amount, 2)
             ) order by s.debtor_name, s.creditor_name
           ),
           '[]'::jsonb
         )
    into v_settlements
    from private.simplify_ardoise_debts(p_ardoise_id) s;

  return jsonb_build_object(
    'ardoise_id', p_ardoise_id,
    'household_id', v_household_id,
    'balances', v_balances,
    'settlements', v_settlements,
    'generated_at', now()
  );
end;
$$;

comment on function public.ardoise_settlement(uuid, text, text, boolean) is
  'USAGE SERVEUR UNIQUEMENT. Soldes et compensation d''une ardoise : membre (JWT), invité (HMAC du ticket) ou accès ouvert (lien vérifié par l''Edge).';

revoke all on function public.ardoise_settlement(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.ardoise_settlement(uuid, text, text, boolean) to service_role;

do $$
begin
  if has_function_privilege('authenticated', 'public.ardoise_settlement(uuid, text, text, boolean)', 'EXECUTE') then
    raise exception 'authenticated ne doit pas pouvoir appeler le settlement serveur';
  end if;
end;
$$;

commit;
