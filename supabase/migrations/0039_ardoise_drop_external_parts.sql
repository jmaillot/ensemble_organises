-- 0039_ardoise_drop_external_parts.sql
-- Purge des participants externes aux dépenses (décision produit 0038).
--
-- 0038 interdisait toute nouvelle part `externe`, mais le schéma gardait la
-- colonne, la table, l'index et les branches de validation : du code mort qui
-- suggère une possibilité qui n'existe plus. Cette migration supprime :
--   * la colonne `expense_participants.external_participant_id` (clé étrangère
--     incluse) et la contrainte `kind_check`, remplacée par
--     `participant_type = 'membre' AND member_id IS NOT NULL` ;
--   * l'index partiel `expense_participants_external_unique` (0015) ;
--   * la table `public.external_participants` et son index (politiques RLS
--     tombant avec elle) ;
--   * la branche `externe` du trigger et du RPC d'insertion des parts.
-- Les lignes `externe` encore présentes sont supprimées avant (aucune
-- attendue : 0038 les interdit depuis sa mise en service ; le compte est
-- journalisé par un `raise notice`).

begin;

do $$
declare
  v_legacy integer;
begin
  select count(*) into v_legacy
    from public.expense_participants
   where participant_type = 'externe';
  if v_legacy > 0 then
    raise notice 'purge : % part(s) externe(s) supprimée(s)', v_legacy;
  end if;
  delete from public.expense_participants where participant_type = 'externe';
end;
$$;

drop index if exists public.expense_participants_external_unique;
alter table public.expense_participants
  drop column if exists external_participant_id;
alter table public.expense_participants
  drop constraint if exists expense_participants_kind_check;
alter table public.expense_participants
  add constraint expense_participants_kind_check check (
    participant_type = 'membre' and member_id is not null
  );

drop index if exists public.external_participants_household_idx;
drop table if exists public.external_participants;

create or replace function private.validate_expense_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id text;
begin
  select e.household_id into v_household_id
    from public.expenses e
   where e.id = new.expense_id;

  if v_household_id is null then
    raise exception 'dépense introuvable : %', new.expense_id using errcode = '23503';
  end if;

  if new.participant_type <> 'membre'
     or not private.member_in_household(new.member_id, v_household_id) then
    raise exception 'le membre % n''appartient pas au foyer de la dépense', new.member_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

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
  v_share numeric;
  v_total numeric := 0;
begin
  if p_parts is null or jsonb_typeof(p_parts) != 'array' or jsonb_array_length(p_parts) = 0 then
    raise exception 'au moins une personne doit partager la dépense' using errcode = '22023';
  end if;

  for r in select * from jsonb_array_elements(p_parts) loop
    v_type := r ->> 'participant_type';
    v_member := nullif(r ->> 'member_id', '');
    if coalesce(r ->> 'share_amount', '') !~ '^[0-9]+(\.[0-9]+)?$' then
      raise exception 'part de dépense invalide' using errcode = '22023';
    end if;
    v_share := (r ->> 'share_amount')::numeric;

    if v_type <> 'membre' or v_member is null then
      raise exception 'seuls les membres du foyer peuvent partager une dépense'
        using errcode = '22023';
    end if;
    if not private.member_in_household(v_member, p_household_id) then
      raise exception 'le membre % n''appartient pas au foyer de la dépense', v_member
        using errcode = '23514';
    end if;

    v_total := v_total + v_share;

    insert into public.expense_participants (
      id, expense_id, participant_type, member_id, share_amount
    ) values (
      private.new_id('expense-participant'), p_expense_id, 'membre', v_member, v_share
    );
  end loop;

  if abs(v_total - p_amount) > 0.01 then
    raise exception 'la somme des parts (%) ne correspond pas au montant de la dépense (%)', v_total, p_amount
      using errcode = '23514';
  end if;
end;
$$;

comment on function private.insert_expense_parts(text, text, numeric, jsonb) is
  'Valide et insère les parts d''une dépense dans la transaction appelante. Membres du foyer uniquement, externes purgés (0039). USAGE SERVEUR UNIQUEMENT.';

commit;
