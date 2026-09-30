-- 0035_expense_write_rpc.sql
-- Création et modification d'une dépense et de ses parts en UNE transaction.
--
-- Constat (usage réel, 30/09/2026) : ajouter une dépense de 30 € partagée entre
-- deux participants échouait sur
--
--   la somme des parts (15.00) ne correspond pas au montant de la dépense (30.00)
--
-- Le trigger différé `expense_participants_share_total` (0008) est contrôlé au
-- `COMMIT` de CHAQUE transaction. Or le client écrivait en N appels PostgREST,
-- donc N transactions : dépense seule (somme 0, tolérée), puis première part
-- (somme 15 ≠ 30 : exception 23514), et la séquence s'arrêtait là. Seules les
-- dépenses à part unique passaient — ce qui a masqué le défaut jusqu'au premier
-- partage réel en production. `BACKEND.md` §8 affirmait en outre que le client
-- insérait « dans une même transaction » : c'était faux, PostgREST ne regroupe
-- jamais plusieurs appels, et cette phrase est corrigée avec ce changement.
--
-- La correction suit le précédent `create_household` (0016) : une fonction
-- PostgreSQL s'exécute dans une transaction, donc le contrôle différé ne voit
-- que l'état final, complet. Le client appelle désormais
-- `public.create_expense` / `public.update_expense` par RPC (une transaction),
-- et garde ses appels directs pour le mode local (démo, hors ligne).
--
-- Sécurité (même doctrine que 0016) :
--   * l'acteur est `auth.uid()`, jamais un paramètre ;
--   * l'appartenance au foyer est revérifiée en base
--     (`private.assert_household_member`), le payeur et chaque part sont
--     rattachés au même foyer, et la somme des parts au montant (même message
--     que le trigger, même code 23514) ;
--   * `EXECUTE` accordé à `authenticated` seul, révoqué à `public` et `anon`.
-- Les politiques RLS restent en place pour les lectures et la suppression.

begin;

-- ---------------------------------------------------------------------------
-- Validation et insertion des parts, partagées par la création et la
-- modification. Révoquée au client : seul le DEFINER l'exécute, dans sa
-- transaction (cf. 0013 pour le motif).
-- ---------------------------------------------------------------------------
create or replace function private.insert_expense_parts(
  p_expense_id text,
  p_household_id text,
  p_amount numeric,
  p_parts jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r jsonb;
  v_type text;
  v_member text;
  v_external text;
  v_share numeric;
  v_total numeric := 0;
begin
  if p_parts is null or jsonb_typeof(p_parts) != 'array' or jsonb_array_length(p_parts) = 0 then
    raise exception 'au moins une personne doit partager la dépense' using errcode = '22023';
  end if;

  for r in select * from jsonb_array_elements(p_parts) loop
    v_type := r ->> 'participant_type';
    v_member := nullif(r ->> 'member_id', '');
    v_external := nullif(r ->> 'external_participant_id', '');
    if coalesce(r ->> 'share_amount', '') !~ '^[0-9]+(\.[0-9]+)?$' then
      raise exception 'part de dépense invalide' using errcode = '22023';
    end if;
    v_share := (r ->> 'share_amount')::numeric;

    if v_type = 'membre' then
      if v_member is null or v_external is not null then
        raise exception 'part membre invalide' using errcode = '22023';
      end if;
      if not private.member_in_household(v_member, p_household_id) then
        raise exception 'le membre % n''appartient pas au foyer de la dépense', v_member
          using errcode = '23514';
      end if;
    elsif v_type = 'externe' then
      if v_external is null or v_member is not null then
        raise exception 'part externe invalide' using errcode = '22023';
      end if;
      if not exists (
        select 1 from public.external_participants ep
         where ep.id = v_external
           and ep.household_id = p_household_id
      ) then
        raise exception 'le participant externe % n''appartient pas au foyer de la dépense', v_external
          using errcode = '23514';
      end if;
    else
      raise exception 'type de participant invalide' using errcode = '22023';
    end if;

    v_total := v_total + v_share;

    insert into public.expense_participants (
      id, expense_id, participant_type, member_id, external_participant_id, share_amount
    ) values (
      private.new_id('expense-participant'), p_expense_id, v_type, v_member, v_external, v_share
    );
  end loop;

  if abs(v_total - p_amount) > 0.01 then
    raise exception 'la somme des parts (%) ne correspond pas au montant de la dépense (%)', v_total, p_amount
      using errcode = '23514';
  end if;
end;
$$;

comment on function private.insert_expense_parts(text, text, numeric, jsonb) is
  'Valide et insère les parts d''une dépense dans la transaction appelante. USAGE SERVEUR UNIQUEMENT.';

revoke all on function private.insert_expense_parts(text, text, numeric, jsonb) from public, anon, authenticated;
grant execute on function private.insert_expense_parts(text, text, numeric, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Création : dépense + parts, atomique.
-- ---------------------------------------------------------------------------
create or replace function public.create_expense(
  p_household_id text,
  p_title text,
  p_amount numeric,
  p_paid_by text,
  p_expense_date date,
  p_split_type text default 'egal',
  p_parts jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_expense_id text := private.new_id('expense');
  v_out jsonb;
begin
  if v_actor is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_household_id is null then
    raise exception 'foyer obligatoire' using errcode = '22023';
  end if;
  perform private.assert_household_member(p_household_id, v_actor);

  if p_title is null or char_length(btrim(p_title)) not between 1 and 200 then
    raise exception 'libellé de dépense invalide' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'le montant doit être supérieur à zéro' using errcode = '22023';
  end if;
  if p_split_type not in ('egal', 'personnalise') then
    raise exception 'type de partage invalide' using errcode = '22023';
  end if;
  if p_paid_by is null or not private.member_in_household(p_paid_by, p_household_id) then
    raise exception 'le payeur n''appartient pas au foyer de la dépense' using errcode = '23514';
  end if;

  insert into public.expenses (id, household_id, title, amount, paid_by, expense_date, split_type)
  values (v_expense_id, p_household_id, btrim(p_title), round(p_amount, 2), p_paid_by, coalesce(p_expense_date, current_date), p_split_type);

  perform private.insert_expense_parts(v_expense_id, p_household_id, round(p_amount, 2), p_parts);

  select to_jsonb(e) into v_out from public.expenses e where e.id = v_expense_id;
  return v_out;
end;
$$;

comment on function public.create_expense(text, text, numeric, text, date, text, jsonb) is
  'Crée une dépense et ses parts en une transaction. USAGE AUTHENTIFIÉ UNIQUEMENT : l''acteur est auth.uid(), jamais un paramètre.';

-- ---------------------------------------------------------------------------
-- Modification : ligne + remplacement des parts, atomique.
-- ---------------------------------------------------------------------------
create or replace function public.update_expense(
  p_expense_id text,
  p_title text,
  p_amount numeric,
  p_paid_by text,
  p_expense_date date,
  p_split_type text default 'egal',
  p_parts jsonb default '[]'::jsonb
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
  v_out jsonb;
begin
  if v_actor is null then
    raise exception 'session requise' using errcode = '28000';
  end if;

  select e.household_id into v_household_id
    from public.expenses e
   where e.id = p_expense_id;
  if v_household_id is null then
    raise exception 'dépense introuvable' using errcode = 'P0002';
  end if;
  perform private.assert_household_member(v_household_id, v_actor);

  if p_title is null or char_length(btrim(p_title)) not between 1 and 200 then
    raise exception 'libellé de dépense invalide' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'le montant doit être supérieur à zéro' using errcode = '22023';
  end if;
  if p_split_type not in ('egal', 'personnalise') then
    raise exception 'type de partage invalide' using errcode = '22023';
  end if;
  if p_paid_by is null or not private.member_in_household(p_paid_by, v_household_id) then
    raise exception 'le payeur n''appartient pas au foyer de la dépense' using errcode = '23514';
  end if;

  update public.expenses
     set title = btrim(p_title),
         amount = round(p_amount, 2),
         paid_by = p_paid_by,
         expense_date = coalesce(p_expense_date, expense_date),
         split_type = p_split_type
   where id = p_expense_id;

  delete from public.expense_participants where expense_id = p_expense_id;

  perform private.insert_expense_parts(p_expense_id, v_household_id, round(p_amount, 2), p_parts);

  select to_jsonb(e) into v_out from public.expenses e where e.id = p_expense_id;
  return v_out;
end;
$$;

comment on function public.update_expense(text, text, numeric, text, date, text, jsonb) is
  'Modifie une dépense et remplace ses parts en une transaction. USAGE AUTHENTIFIÉ UNIQUEMENT : l''acteur est auth.uid(), jamais un paramètre.';

-- `EXECUTE` par défaut à PUBLIC : retrait explicite, comme en 0016.
revoke all on function public.create_expense(text, text, numeric, text, date, text, jsonb) from public, anon;
revoke all on function public.update_expense(text, text, numeric, text, date, text, jsonb) from public, anon;
grant execute on function public.create_expense(text, text, numeric, text, date, text, jsonb) to authenticated;
grant execute on function public.update_expense(text, text, numeric, text, date, text, jsonb) to authenticated;

-- Garde-fous permanents (précédent 0016) : la porte reste fermée à `anon` et
-- ouverte à `authenticated`, et l'assistant d'insertion au seul serveur.
do $$
begin
  if has_function_privilege('anon', 'public.create_expense(text, text, numeric, text, date, text, jsonb)', 'EXECUTE') then
    raise exception 'anon ne doit pas pouvoir créer une dépense par RPC';
  end if;
  if not has_function_privilege('authenticated', 'public.create_expense(text, text, numeric, text, date, text, jsonb)', 'EXECUTE') then
    raise exception 'authenticated doit pouvoir créer une dépense par RPC';
  end if;
  if has_function_privilege('anon', 'public.update_expense(text, text, numeric, text, date, text, jsonb)', 'EXECUTE') then
    raise exception 'anon ne doit pas pouvoir modifier une dépense par RPC';
  end if;
  if not has_function_privilege('authenticated', 'public.update_expense(text, text, numeric, text, date, text, jsonb)', 'EXECUTE') then
    raise exception 'authenticated doit pouvoir modifier une dépense par RPC';
  end if;
  if has_function_privilege('authenticated', 'private.insert_expense_parts(text, text, numeric, jsonb)', 'EXECUTE') then
    raise exception 'authenticated ne doit pas pouvoir appeler l''assistant d''insertion des parts';
  end if;
end;
$$;

commit;
