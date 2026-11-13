-- 0182_ardoise_settlement_single_pass.sql
-- Phase 48 (PERF-03 / fiche PERF-47-09) — un seul passage des soldes par règlement.
--
-- Définitions EFFECTIVES recopiées (jamais réécrites, AGENTS §2.7-A) :
--   private.simplify_ardoise_debts(text) — 0058:98-184, signature et boucle de
--     compensation inchangées. SEUL changement : les DEUX CTE `with balances`
--     (0058:131-141 et 143-153, fiche PERF-47-09) sont fusionnés en UNE seule
--     lecture des soldes, les agrégats débiteurs et créditeurs dérivés de la
--     même lecture par `filter (where …)`.
--   private.ardoise_settlement_data(text) — NOUVEAU helper privé : lit les
--     soldes UNE fois et construit le couple balances/settlements jsonb aux
--     formats EXACTS de 0115:172-209 (mêmes clés, mêmes tri). La boucle de
--     compensation y est recopiée telle quelle (0058:155-180) : elle vit ici
--     ET dans simplify car simplify garde sa signature `(text)` pour son
--     appelant 0018:60, et l'invariant D-05 exige UNE exécution des soldes par
--     appel de règlement — le helper ne peut donc pas appeler simplify sans
--     réintroduire une seconde lecture. Le tri final des règlements
--     (order by debtor_name, creditor_name — 0115:196) est appliqué sur le
--     résultat de la boucle.
--   public.ardoise_settlement(uuid, text, text, boolean) — corps EFFECTIF
--     0115:101-211 recopié à l'identique (trois chemins, refus enfant
--     0115:157-169 verbatim, drop de la 2-arg ré-émis). SEUL changement : la
--     lecture des soldes (0115:172-201) passe par le helper — plus aucun
--     appel direct redondant. Aucun nom de paramètre ne change (l'Edge
--     expense-settlement appelle en nommé, index.ts:374/401).
--
-- Aucun index créé (PERF-47-06 réfuté). Aucune donnée migrée.

begin;

create or replace function private.simplify_ardoise_debts(p_ardoise_id text)
returns table (
  debtor_kind text,
  debtor_id text,
  debtor_name text,
  creditor_kind text,
  creditor_id text,
  creditor_name text,
  amount numeric(14, 2)
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_debtor_kinds text[] := '{}';
  v_debtor_ids text[] := '{}';
  v_debtor_names text[] := '{}';
  v_debtor_amounts numeric[] := '{}';
  v_creditor_kinds text[] := '{}';
  v_creditor_ids text[] := '{}';
  v_creditor_names text[] := '{}';
  v_creditor_amounts numeric[] := '{}';
  v_i integer := 1;
  v_j integer := 1;
  v_amount numeric;
  v_epsilon numeric := 0.005;
begin
  if p_ardoise_id is null then
    raise exception 'ardoise manquante' using errcode = '22023';
  end if;

  -- PERF-47-09 : UNE seule lecture des soldes (au lieu des deux CTE
  -- identiques de 0058:131-153) — débiteurs et créditeurs dérivés de la
  -- même lecture par filter (where …), tris de 0058 préservés.
  with balances as (
    select * from private.ardoise_balances(p_ardoise_id)
  )
  select
    coalesce(array_agg(kind order by balance) filter (where balance < -v_epsilon), '{}'),
    coalesce(array_agg(participant_id order by balance) filter (where balance < -v_epsilon), '{}'),
    coalesce(array_agg(display_name order by balance) filter (where balance < -v_epsilon), '{}'),
    coalesce(array_agg(-balance order by balance) filter (where balance < -v_epsilon), '{}'),
    coalesce(array_agg(kind order by -balance) filter (where balance > v_epsilon), '{}'),
    coalesce(array_agg(participant_id order by -balance) filter (where balance > v_epsilon), '{}'),
    coalesce(array_agg(display_name order by -balance) filter (where balance > v_epsilon), '{}'),
    coalesce(array_agg(balance order by -balance) filter (where balance > v_epsilon), '{}')
  into v_debtor_kinds, v_debtor_ids, v_debtor_names, v_debtor_amounts,
       v_creditor_kinds, v_creditor_ids, v_creditor_names, v_creditor_amounts
  from balances;

  -- Boucle de compensation recopiée telle quelle (0058:155-180).
  while v_i <= coalesce(array_length(v_debtor_ids, 1), 0)
    and v_j <= coalesce(array_length(v_creditor_ids, 1), 0)
  loop
    v_amount := least(v_debtor_amounts[v_i], v_creditor_amounts[v_j]);

    if v_amount > v_epsilon then
      debtor_kind := v_debtor_kinds[v_i];
      debtor_id := v_debtor_ids[v_i];
      debtor_name := v_debtor_names[v_i];
      creditor_kind := v_creditor_kinds[v_j];
      creditor_id := v_creditor_ids[v_j];
      creditor_name := v_creditor_names[v_j];
      amount := round(v_amount, 2);
      return next;
    end if;

    v_debtor_amounts[v_i] := v_debtor_amounts[v_i] - v_amount;
    v_creditor_amounts[v_j] := v_creditor_amounts[v_j] - v_amount;

    if v_debtor_amounts[v_i] <= v_epsilon then
      v_i := v_i + 1;
    end if;
    if v_creditor_amounts[v_j] <= v_epsilon then
      v_j := v_j + 1;
    end if;
  end loop;

  return;
end;
$$;

comment on function private.simplify_ardoise_debts(text) is
  'Règlements minimaux d''une ardoise (0182 : soldes lus UNE fois, boucle 0058 inchangée).';

-- ---------------------------------------------------------------------------
-- Helper privé (0182, D-05) : le couple balances/settlements en UNE lecture.
-- Retourne les deux jsonb aux formats EXACTS de 0115:172-209 — mêmes clés,
-- mêmes tri (balances par display_name ; settlements par debtor_name,
-- creditor_name). La boucle de compensation 0058:155-180 est recopiée telle
-- quelle : simplify garde sa signature `(text)` pour son appelant 0018:60, et
-- appeler simplify depuis ce helper réintroduirait une seconde lecture des
-- soldes — l'invariant D-05 l'interdit.
-- ---------------------------------------------------------------------------
create or replace function private.ardoise_settlement_data(p_ardoise_id text)
returns table (
  balances jsonb,
  settlements jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_balances_json jsonb;
  v_settlements_json jsonb;
  v_settlements_raw jsonb := '[]'::jsonb;
  v_debtor_kinds text[] := '{}';
  v_debtor_ids text[] := '{}';
  v_debtor_names text[] := '{}';
  v_debtor_amounts numeric[] := '{}';
  v_creditor_kinds text[] := '{}';
  v_creditor_ids text[] := '{}';
  v_creditor_names text[] := '{}';
  v_creditor_amounts numeric[] := '{}';
  v_i integer := 1;
  v_j integer := 1;
  v_amount numeric;
  v_epsilon numeric := 0.005;
begin
  if p_ardoise_id is null then
    raise exception 'ardoise manquante' using errcode = '22023';
  end if;

  -- UNE seule lecture des soldes : les agrégats débiteurs/créditeurs ET le
  -- jsonb balances (clés et tri de 0115:172-184) sortent de la même sélection.
  with soldes as (
    select * from private.ardoise_balances(p_ardoise_id)
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'kind', kind,
          'participant_id', participant_id,
          'display_name', display_name,
          'amount', round(balance, 2)
        ) order by display_name
      ),
      '[]'::jsonb
    ),
    coalesce(array_agg(kind order by balance) filter (where balance < -v_epsilon), '{}'),
    coalesce(array_agg(participant_id order by balance) filter (where balance < -v_epsilon), '{}'),
    coalesce(array_agg(display_name order by balance) filter (where balance < -v_epsilon), '{}'),
    coalesce(array_agg(-balance order by balance) filter (where balance < -v_epsilon), '{}'),
    coalesce(array_agg(kind order by -balance) filter (where balance > v_epsilon), '{}'),
    coalesce(array_agg(participant_id order by -balance) filter (where balance > v_epsilon), '{}'),
    coalesce(array_agg(display_name order by -balance) filter (where balance > v_epsilon), '{}'),
    coalesce(array_agg(balance order by -balance) filter (where balance > v_epsilon), '{}')
  into v_balances_json,
       v_debtor_kinds, v_debtor_ids, v_debtor_names, v_debtor_amounts,
       v_creditor_kinds, v_creditor_ids, v_creditor_names, v_creditor_amounts
  from soldes;

  -- Boucle de compensation recopiée telle quelle (0058:155-180) ; le résultat
  -- s'accumule en jsonb au format de 0115:187-199.
  while v_i <= coalesce(array_length(v_debtor_ids, 1), 0)
    and v_j <= coalesce(array_length(v_creditor_ids, 1), 0)
  loop
    v_amount := least(v_debtor_amounts[v_i], v_creditor_amounts[v_j]);

    if v_amount > v_epsilon then
      v_settlements_raw := v_settlements_raw || jsonb_build_object(
        'from_kind', v_debtor_kinds[v_i],
        'from_id', v_debtor_ids[v_i],
        'from_name', v_debtor_names[v_i],
        'to_kind', v_creditor_kinds[v_j],
        'to_id', v_creditor_ids[v_j],
        'to_name', v_creditor_names[v_j],
        'amount', round(v_amount, 2)
      );
    end if;

    v_debtor_amounts[v_i] := v_debtor_amounts[v_i] - v_amount;
    v_creditor_amounts[v_j] := v_creditor_amounts[v_j] - v_amount;

    if v_debtor_amounts[v_i] <= v_epsilon then
      v_i := v_i + 1;
    end if;
    if v_creditor_amounts[v_j] <= v_epsilon then
      v_j := v_j + 1;
    end if;
  end loop;

  -- Tri de 0115:196 (order by s.debtor_name, s.creditor_name) appliqué sur le
  -- résultat de la boucle : la boucle, elle, suit l'ordre des soldes.
  select coalesce(jsonb_agg(e order by e->>'from_name', e->>'to_name'), '[]'::jsonb)
    into v_settlements_json
    from jsonb_array_elements(v_settlements_raw) e;

  return query select v_balances_json, v_settlements_json;
end;
$$;

comment on function private.ardoise_settlement_data(text) is
  'USAGE SERVEUR UNIQUEMENT. Soldes et règlements d''une ardoise en un seul passage (0182, PERF-47-09).';

-- ---------------------------------------------------------------------------
-- public.ardoise_settlement — corps EFFECTIF 0115:101-211 recopié à
-- l'identique. SEUL changement : la lecture des soldes (0115:172-201, trois
-- exécutions des soldes par appel) passe par le helper — UNE exécution par
-- appel. Signature, chemins, refus enfant et message d'erreur inchangés.
-- ---------------------------------------------------------------------------
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

  -- 0182 (PERF-47-09) : le couple balances/settlements vient du helper en
  -- UNE exécution des soldes — plus aucun appel direct redondant (0115 lisait
  -- les soldes pour les balances, puis simplify les relisait DEUX fois).
  select d.balances, d.settlements
    into v_balances, v_settlements
    from private.ardoise_settlement_data(p_ardoise_id) d;

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
  'Soldes d''une ardoise : chemin ouvert (lien verifie par l''Edge), invite (ticket), ou membre inscrit ecrivain (0115 : enfant refuse, meme message) ; usage serveur uniquement pour l''acteur. 0182 : soldes en un seul passage.';

-- La suppression de la 2-arg (0115:220) reste effective — 0182 ne recrée
-- jamais la surcharge.
drop function if exists public.ardoise_settlement(uuid, text);

-- ---------------------------------------------------------------------------
-- Privilèges ré-émis (0115:226-229 et régime privates 0058:730-733).
-- ---------------------------------------------------------------------------
revoke all on function private.ardoise_balances(text) from public, anon, authenticated;
revoke all on function private.simplify_ardoise_debts(text) from public, anon, authenticated;
revoke all on function private.ardoise_settlement_data(text) from public, anon, authenticated;
grant execute on function private.ardoise_balances(text) to service_role;
grant execute on function private.simplify_ardoise_debts(text) to service_role;
grant execute on function private.ardoise_settlement_data(text) to service_role;

revoke all on function public.ardoise_settlement(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.ardoise_settlement(uuid, text, text, boolean) to service_role;

-- Garde (pattern 0058:763-765 / 0115:231-240) : la 4-arg reste au service_role.
do $$
begin
  if has_function_privilege('authenticated', 'public.ardoise_settlement(uuid,text,text,boolean)', 'EXECUTE') then
    raise exception 'authenticated ne doit pas appeler le règlement serveur d''ardoise';
  end if;
  if not has_function_privilege('service_role', 'public.ardoise_settlement(uuid,text,text,boolean)', 'EXECUTE') then
    raise exception 'service_role doit pouvoir solder une ardoise';
  end if;
end;
$$;

commit;
