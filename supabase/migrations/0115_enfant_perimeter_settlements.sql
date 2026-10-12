-- 0115_enfant_perimeter_settlements.sql
-- Phase 14 perimetre enfants, suite de 0113/0114 : les deux voies soldes
-- lisibles a un enfant inscrit/membre, trouvees par l'audit inter-modules
-- (tache 3) et par la preuve d'ambiguite 0018.
--
-- 1. `expense_settlement(uuid, text)` (0013, voie foyer de l'Edge
--    `expense-settlement`) ne verifiait que l'appartenance : tout membre,
--    enfant compris, lisait soldes et compensations du foyer. Role ecrivain
--    exige desormais (membres/admins byte-identiques, enfant 42501 — l'Edge
--    traduit deja tout 42501 en 403 `Accès refusé`, oracle inchange).
-- 2. `ardoise_settlement` voie utilisateur effective : c'est la surcharge a
--    4 arguments (0069, chemins ouvert/invite + membre), pas la 2-arg (0058)
--    — l'Edge appelle en nomme, PostgREST ne resout que la 4-arg. Le refus
--    enfant pose en 0113 sur la 2-arg ne couvrait donc pas le chemin reel :
--    il est reporte ici, meme message (`inscription requise`, 42501).
-- 3. Classe (AGENTS.md §E) : depuis 0069, tout appel a 2 arguments positionnels
--    est AMBIGU entre les deux surcharges (defauts) — `0018_ardoises` est
--    rouge avec comme sans 0113 (prouve), et la 2-arg duplique la branche
--    utilisateur de la 4-arg. La surcharge 2-arg est SUPPRIMEE : les appels
--    existants (0018, Edge nomme, 0051) se resolvent sur la 4-arg aux
--    defauts, semantique identique pour membre/admin, enfant desormais
--    refuse. Aucun appelant direct en 2-arg hors tests (Edge et app
--    passent par les Edges ou le nomme).
--
-- Vers l'avant uniquement : 0113/0114 restent au depot et racontent ce qui
-- s'est passe, y compris le refus pose sur la mauvaise surcharge.

begin;

create or replace function public.expense_settlement(
  p_actor_id uuid,
  p_household_id text
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
begin
  if p_actor_id is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_household_id is null then
    raise exception 'foyer obligatoire' using errcode = '22023';
  end if;

  -- L'appartenance est revérifiée en base : une Edge Function compromise ne peut
  -- donc pas lire le solde d'un foyer dont l'appelant n'est pas membre.
  perform private.assert_household_member(p_household_id, p_actor_id);

  -- Phase 14 (0115, audit inter-modules tache 3) : la voie foyer de
  -- `expense-settlement` lisait les soldes a tout membre, enfant compris —
  -- l'appartenance seule ne suffit plus, role ecrivain exige (D-03, meme
  -- 403 `Accès refusé` cote Edge pour tout 42501).
  perform private.assert_household_writer(p_household_id, p_actor_id);

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'member_id', b.member_id,
               'display_name', b.display_name,
               'amount', round(b.balance, 2)
             ) order by b.display_name
           ),
           '[]'::jsonb
         )
    into v_balances
    from private.household_balances(p_household_id) b;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'from_member_id', s.debtor_id,
               'from_name', s.debtor_name,
               'to_member_id', s.creditor_id,
               'to_name', s.creditor_name,
               'amount', round(s.amount, 2)
             ) order by s.debtor_name, s.creditor_name
           ),
           '[]'::jsonb
         )
    into v_settlements
    from private.simplify_household_debts(p_household_id) s;

  return jsonb_build_object(
    'household_id', p_household_id,
    'balances', v_balances,
    'settlements', v_settlements,
    'generated_at', now()
  );
end;
$$;

comment on function public.expense_settlement(uuid, text) is
  'USAGE SERVEUR UNIQUEMENT. Soldes et compensation minimale des dettes d''un foyer (0115 : membre ecrivain ou admin, enfant refuse).';

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
    -- Phase 14 (0115) : un enfant inscrit ne lit plus les soldes — meme
    -- refus que le non inscrit, sans distinguer (D-03). Couvre la voie
    -- `expense-settlement` authentifiee (l'Edge pre-filtre deja par RLS).
    if v_role is distinct from 'admin' and v_role is distinct from 'membre' then
      raise exception 'inscription à l''ardoise requise' using errcode = '42501';
    end if;
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
  'Soldes d''une ardoise : chemin ouvert (lien verifie par l''Edge), invite (ticket), ou membre inscrit ecrivain (0115 : enfant refuse, meme message) ; usage serveur uniquement pour l''acteur.';

-- La 2-arg (0058, retouchee en 0113) dupliquait la branche utilisateur de
-- la 4-arg (0069, effective) et rendait tout appel positionnel ambigu
-- (0018 rouge prouve, avec comme sans 0113). Suppression : les appelants
-- se resolvent sur la 4-arg aux defauts, semantique identique.
drop function if exists public.ardoise_settlement(uuid, text);

-- ---------------------------------------------------------------------------
-- Privileges : re-emis a l'identique (aucune signature conservee ne change
-- de droits ; la 2-arg supprimee n'en porte plus).
-- ---------------------------------------------------------------------------
revoke all on function public.expense_settlement(uuid, text) from public, anon, authenticated;
grant execute on function public.expense_settlement(uuid, text) to service_role;
revoke all on function public.ardoise_settlement(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.ardoise_settlement(uuid, text, text, boolean) to service_role;

do $$
begin
  if has_function_privilege('authenticated', 'public.expense_settlement(uuid,text)', 'EXECUTE') then
    raise exception 'authenticated ne doit pas lire les soldes du foyer en direct';
  end if;
  if not has_function_privilege('service_role', 'public.expense_settlement(uuid,text)', 'EXECUTE') then
    raise exception 'service_role doit pouvoir solder un foyer';
  end if;
end;
$$;

commit;
