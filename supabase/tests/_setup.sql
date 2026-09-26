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

-- Exécute une requête et renvoie le nombre de lignes qu'elle renvoie.
--
-- L'implémentation straightforward — `execute p_sql into v_count` — ne
-- renvoyait que la PREMIÈRE ligne : sur un `select 1 from household_members`
-- couvrant trois membres, elle rendait 1, pas 3, et NULL si la RLS n'en
-- montrait aucun. Toutes les assertions de comptage compar donc une valeur qui
-- n'était pas un compte. On encapsule la requête et on compte vraiment.
create or replace function testkit.count(p_sql text)
returns bigint
language plpgsql
as $$
declare
  v_count bigint;
begin
  execute 'select count(*) from (' || p_sql || ') as counted' into v_count;
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
--
-- Le second paramètre est le libellé de l'intention. Il n'est pas décoratif :
-- l'échec doit pouvoir être lu sans remonter au fichier de test pour savoir ce
-- qui était vérifié. Sans lui, le message ne portait que la requête — et une
-- longue chaîne `format(...)` n'a jamais décrit une intention.
create or replace function testkit.expect_denied(p_sql text, p_message text default null)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    return;
  end;
  raise exception 'ASSERTION ÉCHOUÉE : % : %',
    coalesce(p_message, 'la requête aurait dû échouer'), p_sql;
end;
$$;

-- Même chose pour une contrainte DEFERRABLE : la violation n'est levée qu'à la
-- validation, on force donc l'évaluation immédiate dans la sous-transaction.
create or replace function testkit.expect_denied_at_commit(p_sql text, p_message text default null)
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
  raise exception 'ASSERTION ÉCHOUÉE : % : %',
    coalesce(p_message, 'la contrainte différée aurait dû être violée'), p_sql;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
-- Table de correspondance entre identifiants lisibles (`'alice'`) et identifiants
-- générés (`gen_random_uuid()`), lisible après `set local role authenticated`.
--
-- Elle est VOLONTAIREMENT dans `testkit` et non `temporary` : une table
-- temporaire appartient au rôle qui l'a créée, donc `authenticated` n'y a
-- aucun droit et la moindre lecture après un changement de rôle échoue sur
-- « permission denied for table fx ». Ici le droit de lecture est explicite.
create table if not exists testkit.fx (
  key          text primary key,
  user_id      uuid,
  household_id text,
  row_id       text
);
grant select on testkit.fx to anon, authenticated;
comment on table testkit.fx is
  'Fixture de correspondance libellé → identifiants, partagée par les tests SQL.';

-- Les colonnes de `auth.users` ne sont pas identiques d'une version de GoTrue
-- à l'autre (la confirmation du courriel a notamment changé de nom). Figer une
-- liste rendait la fixture dépendante d'un instantané précis : on n'alimente
-- donc que les colonnes réellement présentes, et la fixture reste valable après
-- une mise à jour de la stack.
--
-- « Présente » ne suffit pourtant pas, et c'est un second axe. Une colonne
-- GÉNÉRÉE est bien listée dans `pg_attribute` : le filtre d'existence la laisse
-- passer, et PostgreSQL refuse ensuite toute valeur fournie pour elle. Sur
-- certaines versions de GoTrue, `confirmed_at` est exactement ce cas — et
-- l'échec tombait sur les SEPT suites, pour une raison étrangère à leur
-- contenu : sept fichiers rouges, un seul défaut, qui n'avait rien à voir avec
-- ce qu'ils vérifient.
--
-- Les colonnes d'IDENTITÉ sont volontairement exclues du même filtre. Les
-- écarter toutes casserait `id`, que la fixture fournit pour connaître
-- l'identifiant du compte : la ligne créée serait muette et la fonction
-- renverrait un uuid qui n'appartiendrait à personne. Il faut que cet échec
-- reste bruyant, pas qu'il devienne silencieux.
create or replace function testkit.auth_user(p_email text, p_display_name text default 'Utilisateur test')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_columns text;
  v_values text;
begin
  select string_agg(format('%I', s.column_name), ', ' order by s.ord),
         string_agg(s.literal, ', ' order by s.ord)
    into v_columns, v_values
    from (values
      ( 1, 'instance_id',        quote_literal('00000000-0000-0000-0000-000000000000')),
      ( 2, 'id',                 quote_literal(v_id::text)),
      ( 3, 'aud',                quote_literal('authenticated')),
      ( 4, 'role',               quote_literal('authenticated')),
      ( 5, 'email',              quote_literal(p_email)),
      ( 6, 'encrypted_password', quote_literal('test-hash')),
      ( 7, 'email_confirmed_at', quote_literal(now()::text)),
      ( 8, 'confirmed_at',       quote_literal(now()::text)),
      ( 9, 'raw_app_meta_data',  quote_literal(
             jsonb_build_object('provider', 'email', 'providers', array['email']::text[])::text)),
      (10, 'raw_user_meta_data', quote_literal(
             jsonb_build_object('full_name', p_display_name, 'name', p_display_name)::text)),
      (11, 'created_at',         quote_literal(now()::text)),
      (12, 'updated_at',         quote_literal(now()::text))
    ) as s(ord, column_name, literal)
   where exists (
     select 1
       from pg_catalog.pg_attribute a
      where a.attrelid = 'auth.users'::regclass
        and a.attname::text = s.column_name
        and a.attnum > 0
        and not a.attisdropped
        -- Colonne générée : présente au catalogue, mais sa valeur est calculée.
        -- Voir la note ci-dessus.
        and a.attgenerated = ''
   );

  if v_columns is null then
    raise exception
      'testkit.auth_user : aucune colonne connue dans auth.users (version de stack inattendue)';
  end if;

  execute format(
    'insert into auth.users (%s) values (%s)', v_columns, v_values
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
  -- PostgREST pose les DEUX formes à chaque requête : le jeton complet
  -- (`request.jwt.claims`) et chaque revendication scalaire
  -- (`request.jwt.claim.sub`, `request.jwt.claim.role`…). Selon sa version,
  -- `auth.uid()` ne lit que l'une des deux — sur l'instantané self-hosted
  -- v0.8.2, `current_setting('request.jwt.claim.sub', true)` et rien d'autre.
  --
  -- Ne poser que le JSON rendait TOUS les utilisateurs invisibles : uid()
  -- valait NULL, donc aucune politique ne reconnaissait personne et chaque
  -- comptage sous `authenticated` rendait zéro. D'où la symétrie avec
  -- PostgREST, plutôt qu'un choix parmi les deux GUC.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated', 'email', p_email)::text,
    true
  );
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.email', p_email, true);
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
