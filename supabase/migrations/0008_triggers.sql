-- 0008_triggers.sql
-- Déclencheurs : création de profil à la première connexion, horodatage,
-- garde-fous d'intégrité (références de membre, parent dénormalisé, Ardoise).

begin;

-- ---------------------------------------------------------------------------
-- Création du profil à la première connexion
--
-- SECURITY DEFINER + `search_path` fixe : le trigger s'exécute avec les
-- privilèges du propriétaire pour écrire dans `public.profiles` sans passer par
-- une politique RLS (aucune politique d'insertion n'existe pour les clients).
-- L'`upsert` est idempotent : un rejeu d'événement Auth ne duplique rien.
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider text;
  v_display_name text;
begin
  v_provider := coalesce(
    new.raw_app_meta_data ->> 'provider',
    new.raw_user_meta_data ->> 'provider',
    'email'
  );
  if v_provider not in ('google', 'facebook', 'email') then
    v_provider := 'email';
  end if;

  v_display_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(split_part(coalesce(new.email, ''), '@', 1)), ''),
    'Nouveau membre'
  );

  insert into public.profiles (id, email, display_name, avatar_url, provider)
  values (
    new.id,
    coalesce(new.email, ''),
    v_display_name,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'avatar_url', '')), ''),
    v_provider
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = excluded.display_name,
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
        provider = excluded.provider,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Horodatage
-- ---------------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  r text;
begin
  foreach r in array array['public.profiles', 'public.households', 'public.notes'] loop
    execute format('drop trigger if exists %I on %s', 'set_updated_at', r);
    execute format(
      'create trigger %I before update on %s for each row execute function private.touch_updated_at()',
      'set_updated_at', r
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Garde-fous d'autorisation appliqués en base
--
-- Ces déclencheurs complètent les politiques RLS : une politique ne peut pas
-- restreindre les colonnes modifiées par un UPDATE, un déclencheur si.
-- ---------------------------------------------------------------------------

-- email / provider / created_at ne sont pas modifiables par un client.
create or replace function private.guard_profile_system_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.email is distinct from old.email
      or new.provider is distinct from old.provider
      or new.created_at is distinct from old.created_at then
      raise exception 'email, provider et created_at ne sont pas modifiables par le client'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_profile_system_columns
  before update on public.profiles
  for each row execute function private.guard_profile_system_columns();

-- Transférer une liste de cadeaux reste réservé aux administrateurs du foyer.
create or replace function private.guard_gift_list_ownership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_member_id is distinct from old.owner_member_id
     and not private.is_household_admin(private.gift_list_household_id(old.id)) then
    raise exception 'seul un administrateur du foyer peut transférer une liste de cadeaux'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_gift_list_ownership
  before update on public.gift_lists
  for each row execute function private.guard_gift_list_ownership();

-- ---------------------------------------------------------------------------
-- Cohérence des `household_id` dénormalisés
--
-- Signature : private.align_child_household('<table parente>', '<colonne FK>').
-- La colonne dénormalisée est alignée sur le parent et ne peut pas en diverger.
-- ---------------------------------------------------------------------------
create or replace function private.align_child_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_table text := tg_argv[0];
  v_parent_column text := tg_argv[1];
  v_parent_id text;
  v_household_id text;
begin
  v_parent_id := to_jsonb(new) ->> v_parent_column;
  if v_parent_id is null then
    return new;
  end if;

  execute format('select household_id from public.%I where id = $1', v_parent_table)
    into v_household_id using v_parent_id;

  if v_household_id is null then
    raise exception 'parent % introuvable : %', v_parent_table, v_parent_id using errcode = '23503';
  end if;
  if new.household_id is not null and new.household_id <> v_household_id then
    raise exception 'household_id ne correspond pas au foyer de %', v_parent_table using errcode = '23514';
  end if;

  new.household_id := v_household_id;
  return new;
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('shopping_list_items', 'shopping_lists', 'list_id'),
      ('pet_records',         'pets',            'pet_id'),
      ('post_media',          'posts',           'post_id'),
      ('post_comments',       'posts',           'post_id'),
      ('post_reactions',      'posts',           'post_id'),
      ('gift_items',          'gift_lists',      'list_id'),
      ('messages',            'conversations',   'conversation_id'),
      ('routine_completions', 'routines',        'routine_id')
    ) as t(child_table, parent_table, parent_column)
  loop
    execute format('drop trigger if exists align_household on public.%I', r.child_table);
    execute format(
      'create trigger align_household before insert or update on public.%I'
      ' for each row execute function private.align_child_household(%L, %L)',
      r.child_table, r.parent_table, r.parent_column
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Références de membre : elles doivent appartenir au même foyer que la ligne.
--
-- Signature : private.validate_member_refs('colonne', ...).
-- ---------------------------------------------------------------------------
create or replace function private.validate_member_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_column text;
  v_value text;
  v_household_id text;
begin
  v_household_id := nullif(to_jsonb(new) ->> 'household_id', '');

  foreach v_column in array tg_argv loop
    v_value := nullif(to_jsonb(new) ->> v_column, '');
    if v_value is not null and not private.member_in_household(v_value, v_household_id) then
      raise exception 'la référence % (%) n''appartient pas au foyer', v_column, v_value
        using errcode = '23514';
    end if;
  end loop;

  return new;
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('shopping_lists',      array['created_by']::text[]),
      ('shopping_list_items', array['added_by']::text[]),
      ('events',              array['created_by']::text[]),
      ('notes',               array['created_by']::text[]),
      ('tasks',               array['created_by']::text[]),
      ('routines',            array['created_by']::text[]),
      ('routine_completions', array['completed_by']::text[]),
      ('expenses',            array['paid_by']::text[]),
      ('gift_lists',          array['owner_member_id']::text[]),
      ('gift_items',          array['reserved_by']::text[]),
      ('loyalty_cards',       array['member_id']::text[]),
      ('birthdays',           array['linked_member_id']::text[]),
      ('posts',               array['author_id']::text[]),
      ('post_comments',       array['author_id']::text[]),
      ('post_reactions',      array['author_id']::text[]),
      ('messages',            array['sender_id']::text[]),
      ('dashboard_widgets',   array['member_id']::text[])
    ) as t(table_name, member_columns)
  loop
    execute format('drop trigger if exists validate_member_refs on public.%I', r.table_name);
    execute format(
      'create trigger validate_member_refs before insert or update on public.%I'
      ' for each row execute function private.validate_member_refs(%L)',
      r.table_name, array_to_string(r.member_columns, ',')
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ardoise : la répartition ne peut pas sortir du foyer et la somme des parts
-- doit correspondre au montant de la dépense.
-- ---------------------------------------------------------------------------
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

  if new.participant_type = 'membre'
     and not private.member_in_household(new.member_id, v_household_id) then
    raise exception 'le membre % n''appartient pas au foyer de la dépense', new.member_id
      using errcode = '23514';
  end if;

  if new.participant_type = 'externe'
     and not exists (
       select 1 from public.external_participants ep
        where ep.id = new.external_participant_id
          and ep.household_id = v_household_id
     ) then
    raise exception 'le participant externe % n''appartient pas au foyer de la dépense', new.external_participant_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger validate_expense_participant
  before insert or update on public.expense_participants
  for each row execute function private.validate_expense_participant();

-- Somme des parts contrôlée à la fin de la transaction (contrainte différée) :
-- le client peut insérer la dépense puis ses participants dans un même
-- transaction sans ordre imposé. Une dépense sans aucune part reste autorisée
-- et est alors imputée en totalité à son payeur (cf. private.household_balances).
create or replace function private.assert_expense_share_total(p_expense_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount numeric(14, 2);
  v_total numeric(14, 2);
begin
  select e.amount into v_amount
    from public.expenses e
   where e.id = p_expense_id;

  -- Dépense supprimée (cascade) : rien à contrôler.
  if v_amount is null then
    return;
  end if;

  select coalesce(sum(ep.share_amount), 0) into v_total
    from public.expense_participants ep
   where ep.expense_id = p_expense_id;

  if v_total > 0 and abs(v_total - v_amount) > 0.01 then
    raise exception 'la somme des parts (%) ne correspond pas au montant de la dépense (%)', v_total, v_amount
      using errcode = '23514';
  end if;
end;
$$;

create or replace function private.expense_participants_share_total()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_expense_share_total(coalesce(new.expense_id, old.expense_id));
  return null;
end;
$$;

create constraint trigger expense_participants_share_total
  after insert or update or delete on public.expense_participants
  deferrable initially deferred
  for each row execute function private.expense_participants_share_total();

create or replace function private.expenses_share_total()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_expense_share_total(new.id);
  return null;
end;
$$;

create constraint trigger expenses_share_total
  after insert or update on public.expenses
  deferrable initially deferred
  for each row execute function private.expenses_share_total();

-- ---------------------------------------------------------------------------
-- Mots de passe et clés de session : jamais modifiables par le client.
-- ---------------------------------------------------------------------------
create or replace function private.guard_household_identity_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
      raise exception 'created_by et created_at ne sont pas modifiables par le client'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_household_identity_columns
  before update on public.households
  for each row execute function private.guard_household_identity_columns();

commit;
