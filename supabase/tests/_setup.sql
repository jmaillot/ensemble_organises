-- supabase/tests/_setup.sql
-- Outillage des tests SQL, installé puis retiré par `scripts/test-db.sh`.
--
-- Ce schéma n'existe que pendant la campagne de tests : il n'est jamais
-- déployé. Les fonctions de fixtures s'exécutent en `postgres` afin de créer
-- des utilisateurs Auth, des foyers et des membres ; les assertions sont
-- ensuite lancées avec `set local role authenticated` pour vérifier la RLS.
--
-- Exécution : psql -v ON_ERROR_STOP=1 -f supabase/tests/_setup.sql

begin;

create schema if not exists testkit;
revoke all on schema testkit from public;
grant usage on schema testkit to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Assertions
-- ---------------------------------------------------------------------------
create or replace function testkit.ok(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if p_condition is not true then
    raise exception 'ASSERTION ÉCHOUÉE : %', p_message;
  end if;
end;
$$;

create or replace function testkit.eq(p_actual anyelement, p_expected anyelement, p_message text)
returns void
language plpgsql
as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'ASSERTION ÉCHOUÉE : % (attendu %, obtenu %)', p_message, p_expected, p_actual;
  end if;
end;
$$;

-- Exécute une requête et renvoie le nombre de lignes renvoyées.
create or replace function testkit.count(p_sql text)
returns bigint
language plpgsql
as $$
declare
  v_count bigint;
begin
  execute p_sql into v_count;
  return v_count;
end;
$$;

-- Exécute une requête qui doit réussir.
create or replace function testkit.expect_ok(p_sql text)
returns void
language plpgsql
as $$
begin
  execute p_sql;
end;
$$;

-- Nombre de lignes affectées par un INSERT/UPDATE/DELETE. Un UPDATE ou un
-- DELETE filtré par la RLS ne lève pas d'erreur : il ne touche simplement
-- aucune ligne. C'est ce compteur qui permet d'affirmer « rien n'a fuité ».
create or replace function testkit.affected(p_sql text)
returns bigint
language plpgsql
as $$
declare
  v_affected bigint;
begin
  execute p_sql;
  get diagnostics v_affected = row_count;
  return v_affected;
end;
$$;

-- Exécute une requête qui doit échouer (RLS, contrainte, privilège).
create or replace function testkit.expect_denied(p_sql text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    return;
  end;
  raise exception 'ASSERTION ÉCHOUÉE : la requête aurait dû échouer : %', p_sql;
end;
$$;

-- Même chose pour une contrainte DEFERRABLE : la violation n'est levée qu'à la
-- validation, on force donc l'évaluation immédiate dans la sous-transaction.
create or replace function testkit.expect_denied_at_commit(p_sql text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
    execute 'set constraints all immediate';
  exception when others then
    return;
  end;
  raise exception 'ASSERTION ÉCHOUÉE : la contrainte différée aurait dû être violée : %', p_sql;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
create or replace function testkit.auth_user(p_email text, p_display_name text default 'Utilisateur test')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    p_email, 'test-hash', now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']::text[]),
    jsonb_build_object('full_name', p_display_name, 'name', p_display_name),
    now(), now()
  );
  return v_id;
end;
$$;

create or replace function testkit.household(p_owner uuid, p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text := private.new_id('household');
begin
  insert into public.households (id, name, avatar_color, created_by)
  values (v_id, p_name, 'accent', p_owner);
  return v_id;
end;
$$;

create or replace function testkit.member(
  p_household_id text,
  p_user_id uuid,
  p_display_name text,
  p_role text default 'membre',
  p_color_tag text default 'accent'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text := private.new_id('member');
begin
  insert into public.household_members (id, household_id, user_id, display_name, color_tag, role)
  values (v_id, p_household_id, p_user_id, p_display_name, p_color_tag, p_role);
  return v_id;
end;
$$;

-- Bascule le rôle courant et positionne les claims JWT comme le ferait PostgREST.
create or replace function testkit.as_user(p_user_id uuid, p_email text default 'test@example.fr')
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated', 'email', p_email)::text,
    true
  );
end;
$$;

create or replace function testkit.as_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anonymous"}', true);
end;
$$;

comment on function testkit.as_user(uuid, text) is
  'À appeler avant `set local role authenticated` : renseigne auth.uid().';

grant execute on all functions in schema testkit to anon, authenticated;

commit;
