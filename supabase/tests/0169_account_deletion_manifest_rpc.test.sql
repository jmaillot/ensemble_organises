-- supabase/tests/0169_account_deletion_manifest_rpc.test.sql
-- Tests des wrappers PostgREST du manifest de médias
-- (phase 27, plan 03, task 1 — correction vers l'avant 0163).
--
-- Ce qui est prouvé ici (§2.7 D) :
--   1. claim : ne rend QUE les chemins non purgés, borné à p_limit, avec les
--      trois champs attendus par l'Edge (id / household_id / storage_path).
--   2. mark_purged : pose purged = true sur les ids donnés et seulement eux ;
--      renvoie le compte réellement marqué ; rejouer est idempotent (0).
--   3. Privilèges : execute réservé à service_role (motif 0074).
--
-- Fixture : deux lignes de manifest semées à la main (une purgée, une non) —
-- les lignes de manifest naissent de la purge J+30 (0168), testée ailleurs.

begin;

-- ---------------------------------------------------------------
-- Semis : un foyer, deux chemins — l'un déjà purgé, l'autre non.
-- ---------------------------------------------------------------
do $$
declare
  v_hh text;
begin
  v_hh := testkit.household(null, 'Foyer manifest 169');
  insert into testkit.fx (key, household_id) values ('hh169', v_hh);

  insert into private.account_deletion_media_manifest
    (household_id, storage_path, purged)
  values
    (v_hh, v_hh || '/notes/deja-purge.png', true),
    (v_hh, v_hh || '/notes/a-purger.png', false),
    (v_hh, v_hh || '/avatars/aussi-a-purger.png', false);
end;
$$;

-- ---------------------------------------------------------------
-- 1. claim : seulement le non-purgé, borné.
-- ---------------------------------------------------------------
do $$
declare
  v_claim jsonb;
  v_hh text := (select household_id from testkit.fx where key = 'hh169');
begin
  select public.deletion_media_claim(10) into v_claim;

  perform testkit.eq((v_claim -> 'rows' -> 0 ->> 'storage_path'),
    v_hh || '/notes/a-purger.png',
    'claim rend le premier chemin non purgé');
  perform testkit.eq(jsonb_array_length(v_claim -> 'rows'), 2::jsonb,
    'claim ne rend que les deux chemins non purgés');
  perform testkit.ok(
    not exists (
      select 1
        from jsonb_array_elements(v_claim -> 'rows') r
       where r ->> 'storage_path' like '%deja-purge%'
    ),
    'claim ne rend JAMAIS un chemin déjà purgé');
  perform testkit.ok(
    (v_claim -> 'rows' -> 0 ->> 'id') is not null
      and (v_claim -> 'rows' -> 0 ->> 'household_id') is not null,
    'chaque ligne porte id et household_id, contrat de l''Edge');

  -- Borne p_limit : un lot de 1 ne rend qu'un chemin.
  select public.deletion_media_claim(1) into v_claim;
  perform testkit.eq(jsonb_array_length(v_claim -> 'rows'), 1::jsonb,
    'claim est borné à p_limit');
end;
$$;

-- ---------------------------------------------------------------
-- 2. mark_purged : marque les ids donnés, seulement eux, idempotent.
-- ---------------------------------------------------------------
do $$
declare
  v_claim jsonb;
  v_hh text := (select household_id from testkit.fx where key = 'hh169');
  v_ids uuid[];
  v_marked integer;
begin
  select public.deletion_media_claim(10) into v_claim;
  select array_agg((r ->> 'id')::uuid)
    into v_ids
    from jsonb_array_elements(v_claim -> 'rows') r;

  v_marked := public.deletion_media_mark_purged(v_ids);
  perform testkit.eq(v_marked, 2::integer,
    'mark_purged rend le nombre réellement marqué');

  perform testkit.eq((
    select count(*) from private.account_deletion_media_manifest
     where household_id = v_hh and purged = false), 0::bigint,
    'après le marquage, aucun chemin non purgé ne reste');

  v_marked := public.deletion_media_mark_purged(v_ids);
  perform testkit.eq(v_marked, 0::integer,
    'rejouer le marquage est idempotent (0 ligne retouchée)');
end;
$$;

-- ---------------------------------------------------------------
-- 3. Privilèges : execute réservé à service_role (motif 0074).
-- ---------------------------------------------------------------
do $$
begin
  perform testkit.ok(
    not has_function_privilege('anon', 'public.deletion_media_claim(integer)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.deletion_media_claim(integer)', 'EXECUTE'),
    'anon et authenticated ne peuvent pas lire le manifest');
  perform testkit.ok(
    not has_function_privilege('anon', 'public.deletion_media_mark_purged(uuid[])', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.deletion_media_mark_purged(uuid[])', 'EXECUTE'),
    'anon et authenticated ne peuvent pas marquer le manifest');
  perform testkit.ok(
    has_function_privilege('service_role', 'public.deletion_media_claim(integer)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.deletion_media_mark_purged(uuid[])', 'EXECUTE'),
    'service_role peut lire et marquer le manifest (Edge plan 03)');
end;
$$;

commit;
