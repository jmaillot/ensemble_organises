-- 0174_folder_default_dedup.sql
-- Gap G-30-2 (UAT 2026-10-31) : ceinture de sécurité SQL derrière le correctif
-- client du formulaire de routine — une seule ligne is_default par foyer sur
-- task_lists, note_folders et routine_folders.
--
-- Diagnostic (base locale, 2026-10-31) : AUCUN doublon — un seul is_default
-- par table, les trois index uniques partiels de 0050 sont présents. Le
-- doublon « Général » vu à l'UAT est donc client : le formulaire code en dur
-- l'option value="" ET rend la ligne is_default de la liste. La migration
-- reste utile en garde (une base où 0050 aurait été appliquée partiellement,
-- ou prod dont l'état n'est pas prouvé depuis ici) ; sans doublon, elle ne
-- touche aucune ligne (idempotent, elle ne suppose pas l'état de la base).
--
-- Trois blocs, une transaction :
--   1. private.dedup_folder_defaults() : repointe tasks/notes/routines vers
--      le survivant is_default (created_at le plus ancien, tie-break id) puis
--      supprime les doublons — via session_replication_role = replica car le
--      garde guard_folder_default de 0052 lève sur tout UPDATE/DELETE d'une
--      ligne is_default. Le garde lui-même n'est ni modifié ni doublé.
--   2. Index uniques partiels de 0050 créés SEULEMENT s'ils manquent
--      (base partiellement migrée) — jamais recréés s'ils existent.
--   3. create_household durci : les trois INSERT de dossiers gagnent
--      on conflict do nothing (le backfill 0052 l'a, create_household non —
--      vérifié). Copie de la définition effective la plus récente (0065,
--      dernière redéfinition de la fonction), aucune migration appliquée
--      n'est réécrite.

begin;

-- ---------------------------------------------------------------------------
-- 1. La fonction de dédoublonnage — testée par supabase/tests/0174_...test.sql
-- ---------------------------------------------------------------------------
create or replace function private.dedup_folder_defaults()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tasks bigint;
  v_notes bigint;
  v_routines bigint;
  v_task_lists bigint;
  v_note_folders bigint;
  v_routine_folders bigint;
begin
  -- Repointage d'abord : le survivant par foyer est la ligne is_default sans
  -- pair plus ancienne (created_at, id — le tie-break rend le choix total).
  -- Les enfants d'un doublon le suivent ; ceux du survivant ne bougent pas,
  -- un second passage est donc un no-op (idempotence prouvée par le test).
  update public.tasks t
     set folder_id = s.id
    from public.task_lists d
    join public.task_lists s
      on s.household_id = d.household_id
     and s.is_default
     and not exists (select 1 from public.task_lists o
                      where o.household_id = d.household_id
                        and o.is_default
                        and (o.created_at, o.id) < (s.created_at, s.id))
   where d.is_default
     and exists (select 1 from public.task_lists o
                  where o.household_id = d.household_id
                    and o.is_default
                    and (o.created_at, o.id) < (d.created_at, d.id))
     and t.folder_id = d.id;
  get diagnostics v_tasks = row_count;

  update public.notes n
     set folder_id = s.id
    from public.note_folders d
    join public.note_folders s
      on s.household_id = d.household_id
     and s.is_default
     and not exists (select 1 from public.note_folders o
                      where o.household_id = d.household_id
                        and o.is_default
                        and (o.created_at, o.id) < (s.created_at, s.id))
   where d.is_default
     and exists (select 1 from public.note_folders o
                  where o.household_id = d.household_id
                    and o.is_default
                    and (o.created_at, o.id) < (d.created_at, d.id))
     and n.folder_id = d.id;
  get diagnostics v_notes = row_count;

  update public.routines r
     set folder_id = s.id
    from public.routine_folders d
    join public.routine_folders s
      on s.household_id = d.household_id
     and s.is_default
     and not exists (select 1 from public.routine_folders o
                      where o.household_id = d.household_id
                        and o.is_default
                        and (o.created_at, o.id) < (s.created_at, s.id))
   where d.is_default
     and exists (select 1 from public.routine_folders o
                  where o.household_id = d.household_id
                    and o.is_default
                    and (o.created_at, o.id) < (d.created_at, d.id))
     and r.folder_id = d.id;
  get diagnostics v_routines = row_count;

  -- Suppression des doublons : le garde guard_folder_default (0052) lève
  -- 42501 sur tout DELETE d'une ligne is_default ; on désactive donc les
  -- triggers LE TEMPS des trois DELETE (portée transaction — set_config
  -- local revient à la fin, le garde reste actif pour le monde extérieur).
  perform set_config('session_replication_role', 'replica', true);

  delete from public.task_lists d
   where d.is_default
     and exists (select 1 from public.task_lists o
                  where o.household_id = d.household_id
                    and o.is_default
                    and (o.created_at, o.id) < (d.created_at, d.id));
  get diagnostics v_task_lists = row_count;

  delete from public.note_folders d
   where d.is_default
     and exists (select 1 from public.note_folders o
                  where o.household_id = d.household_id
                    and o.is_default
                    and (o.created_at, o.id) < (d.created_at, d.id));
  get diagnostics v_note_folders = row_count;

  delete from public.routine_folders d
   where d.is_default
     and exists (select 1 from public.routine_folders o
                  where o.household_id = d.household_id
                    and o.is_default
                    and (o.created_at, o.id) < (d.created_at, d.id));
  get diagnostics v_routine_folders = row_count;

  return jsonb_build_object(
    'children_repointed', jsonb_build_object(
      'tasks', v_tasks,
      'notes', v_notes,
      'routines', v_routines),
    'task_lists', jsonb_build_object('duplicates_removed', v_task_lists),
    'note_folders', jsonb_build_object('duplicates_removed', v_note_folders),
    'routine_folders', jsonb_build_object('duplicates_removed', v_routine_folders)
  );
end;
$$;

comment on function private.dedup_folder_defaults() is
  'Ceinture de sécurité 0174 : une seule ligne is_default par foyer sur task_lists, note_folders et routine_folders. Repointe les enfants vers le survivant (created_at le plus ancien, tie-break id) puis supprime les doublons malgré le garde guard_folder_default (session_replication_role replica, portée transaction). Idempotent : sans doublon, 0 ligne touchée. USAGE OPÉRATEUR/serveur uniquement (schéma private).';

select private.dedup_folder_defaults();

-- ---------------------------------------------------------------------------
-- 2. Gardes d'unicité : les index partiels de 0050, créés seulement s'ils
--    manquent (jamais recréés s'ils existent — 0174 ne réécrit pas 0050).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and indexname = 'task_lists_default_unique'
  ) then
    create unique index task_lists_default_unique on public.task_lists (household_id) where is_default;
  end if;
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and indexname = 'note_folders_default_unique'
  ) then
    create unique index note_folders_default_unique on public.note_folders (household_id) where is_default;
  end if;
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and indexname = 'routine_folders_default_unique'
  ) then
    create unique index routine_folders_default_unique on public.routine_folders (household_id) where is_default;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Semis durci : create_household — copie de la définition effective
--    (0065, dernière redéfinition), seule différence : on conflict do nothing
--    sur les trois INSERT de dossiers. Sans cette garde, un conflit (impossible
--    aujourd'hui vu les index de 0050, mais la fonction doit survivre à un
--    réordonnancement de migrations) ferait échouer toute création de foyer.
-- ---------------------------------------------------------------------------
create or replace function public.create_household(
  p_name text,
  p_avatar_color text default 'accent'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_household_id text;
  v_member_id text;
  v_display_name text;
  v_ardoise_id text := private.new_id('ardoise');
begin
  if v_actor is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 120 then
    raise exception 'nom de foyer invalide' using errcode = '22023';
  end if;
  if p_avatar_color is null or not private.is_member_color(p_avatar_color) then
    raise exception 'couleur invalide' using errcode = '22023';
  end if;

  v_household_id := private.new_id('household');
  v_member_id := private.new_id('member');

  select p.display_name into v_display_name
    from public.profiles p
   where p.id = v_actor;

  insert into public.households (id, name, avatar_color, created_by)
  values (v_household_id, btrim(p_name), p_avatar_color, v_actor);

  insert into public.household_members (
    id, household_id, user_id, display_name, color_tag, role
  ) values (
    v_member_id,
    v_household_id,
    v_actor,
    coalesce(nullif(btrim(v_display_name), ''), 'Nouveau foyer'),
    p_avatar_color,
    'admin'
  );

  -- on conflict do nothing : garde de semis (le backfill 0052 l'avait, la
  -- fonction ne l'avait pas) — le doublon Général ne peut jamais être semé.
  insert into public.task_lists (household_id, name, visibility, owner_member_id, is_default)
  values (v_household_id, 'Général', 'foyer', v_member_id, true)
  on conflict do nothing;
  insert into public.note_folders (household_id, name, visibility, owner_member_id, is_default)
  values (v_household_id, 'Général', 'foyer', v_member_id, true)
  on conflict do nothing;
  insert into public.routine_folders (household_id, name, visibility, owner_member_id, is_default)
  values (v_household_id, 'Général', 'foyer', v_member_id, true)
  on conflict do nothing;

  insert into public.event_calendars (household_id, name, visibility, owner_member_id)
  values (v_household_id, 'Commun', 'commun', null);

  insert into public.event_categories (household_id, name, color, is_default)
  values (v_household_id, 'Repas', '#E8930C', true),
         (v_household_id, 'Médical', '#D64545', true),
         (v_household_id, 'École', '#3E7CB1', true),
         (v_household_id, 'Sport', '#4CAF50', true);

  insert into public.provider_types (id, household_id, name)
  select private.new_id('provider-type'), v_household_id, t.name
    from (values
      ('Médecin'),
      ('Dentiste'),
      ('Pharmacie'),
      ('Plombier'),
      ('Électricien'),
      ('Garagiste'),
      ('Coiffeur'),
      ('Vétérinaire'),
      ('Assurance'),
      ('Banque')
    ) as t(name)
  on conflict do nothing;

  insert into public.ardoises (id, household_id, name, created_by)
  values (v_ardoise_id, v_household_id, 'Ardoise du foyer', v_member_id);
  insert into public.ardoise_members (ardoise_id, member_id)
  values (v_ardoise_id, v_member_id);

  return jsonb_build_object(
    'household', jsonb_build_object(
      'id', v_household_id,
      'name', btrim(p_name),
      'avatar_color', p_avatar_color,
      'created_by', v_actor
    ),
    'member', jsonb_build_object(
      'id', v_member_id,
      'household_id', v_household_id,
      'user_id', v_actor,
      'display_name', coalesce(nullif(btrim(v_display_name), ''), 'Nouveau foyer'),
      'color_tag', p_avatar_color,
      'role', 'admin'
    )
  );
end;
$$;

comment on function public.create_household(text, text) is
  'Crée un foyer, son premier administrateur, ses dossiers Général (on conflict do nothing — 0174), son calendrier Commun, ses catégories, ses types de prestataires et son ardoise en une transaction. USAGE AUTHENTIFIÉ UNIQUEMENT : l''acteur est auth.uid(), jamais un paramètre.';

revoke all on function public.create_household(text, text) from public, anon;
grant execute on function public.create_household(text, text) to authenticated;

revoke all on function private.dedup_folder_defaults() from public, anon, authenticated;

commit;
