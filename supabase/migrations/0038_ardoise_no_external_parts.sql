-- 0038_ardoise_no_external_parts.sql
-- Les dépenses ne partagent plus qu'entre membres du foyer.
--
-- Constat (audit, 30/09/2026) : le serveur ignorait les parts externes dans
-- `household_balances` (0006) tandis que le client les recollait localement —
-- deux vérités, sommes non nulles, résidus jamais soldés par
-- `simplify_household_debts`. Décision produit : supprimer la possibilité
-- d'ajouter un participant externe à une dépense, plutôt que de réconcilier
-- les deux calculs. Les lignes existantes restent lisibles (aucune donnée
-- n'est effacée), mais toute insertion ou modification d'une part `externe`
-- est refusée, par le RPC comme par le trigger — donc aussi en écriture
-- directe PostgREST.
--
-- Le formulaire n'offre plus les externes (frontend), et l'API les refuse
-- avant tout appel réseau, avec le même message.

begin;

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
      raise exception 'les participants externes ne sont plus acceptés sur une dépense : partagez entre membres du foyer'
        using errcode = '22023';
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

  if new.participant_type = 'externe' then
    raise exception 'les participants externes ne sont plus acceptés sur une dépense : partagez entre membres du foyer'
      using errcode = '22023';
  end if;

  if new.participant_type = 'membre'
     and not private.member_in_household(new.member_id, v_household_id) then
    raise exception 'le membre % n''appartient pas au foyer de la dépense', new.member_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function private.insert_expense_parts(text, text, numeric, jsonb) is
  'Valide et insère les parts d''une dépense dans la transaction appelante. Membres du foyer uniquement (0038). USAGE SERVEUR UNIQUEMENT.';

commit;
