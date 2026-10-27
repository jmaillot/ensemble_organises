-- 0165_gdpr_export_batch_start.sql
-- Phase 26 — correction HR-02 : ordre des fragments JSON de l'archive RGPD.
--
-- POURQUOI CETTE MIGRATION (§2.7A — correction vers l'avant, 0161 appliquée)
--   Le lot remis par le RPC nommait son fragment d'après `cursor_offset`
--   APRÈS avance : le premier lot d'un module de 1500 lignes s'appelait
--   `tasks-500`, le dernier (partiel, curseur reparti à 0 sur le module
--   suivant) `tasks-0`. Triés lexicographiquement côté Edge, ces noms
--   concaténaient les fragments dans le désordre dès qu'un module dépasse
--   999 lignes. Ce fichier expose `batch_start_offset` — l'offset de DÉBUT du
--   lot, avant avance du curseur — dans le retour jsonb. L'Edge nomme
--   désormais `part-<module>-<start>` et trie sur l'ENTIER (le tri
--   lexicographique resterait faux même ainsi nommé : '1000' < '500').
--
-- Signature (uuid, integer) et retour jsonb inchangés (une clé ajoutée) :
-- les appelants existants ne voient aucune rupture. `cursor_offset` reste
-- dans le retour (post-avance) pour compatibilité du contrat.
--
-- CE QUE FAIT CETTE FONCTION
--   Remettre à l'Edge Function `gdpr-export-run` UN lot borné de données
--   « ce qui me concerne » (26-SPEC-DECISION.md : Option A, fusion multi-foyers,
--   22 modules listés mot pour mot). La borne d'isolement RGEX-03 vit ICI, en
--   SQL : l'Edge transporte avec sa clé admin, il ne définit jamais le
--   périmètre. Les tests négatifs de `supabase/tests/0158_gdpr_export.sql`
--   (section 3) prouvent l'isolement ; `supabase/tests/0161_…sql` prouve le
--   curseur et le périmètre.
--
-- MÉCANIQUE DU CURSEUR
--   `cursor_module` + `cursor_offset` sur la ligne de job, avancés
--   transactionnellement (la ligne est verrouillée `for update`) à chaque
--   remise de lot : un crash de l'Edge entre deux lots reprend où il s'est
--   arrêté, jamais deux fois le même lot. Un lot appartient à UN SEUL module :
--   quand un module s'épuise au milieu du budget, le lot est rendu tel quel et
--   l'appel suivant commence le module suivant — l'Edge nomme ainsi chaque
--   fragment JSON `part-<module>-<batch_start_offset>` (offset de DÉBUT du
--   lot, 0165) de façon déterministe, et trie les fragments sur l'entier.
--
-- FORME D'UN LOT
--   jsonb { user_id, module, rows, cursor_module, cursor_offset,
--           batch_start_offset, done, media_paths }
--   * `rows` : objet { table: [...] } — la table primaire du module porte la
--     pagination, les tables satellites (assignations, rappels, pièces
--     jointes…) sont jointes sur les identifiants DU LOT.
--   * `batch_start_offset` : offset de DÉBUT du lot dans son module, AVANT
--     avance du curseur (0165) — l'Edge en dérive un nom de fragment
--     déterministe ET un ordre de concaténation correct.
--   * `cursor_offset` : offset APRÈS avance (contrat 0161 conservé).
--   * `done` : true quand tous les modules sont épuisés. Le lot terminal peut
--     être vide (dernier module sans ligne).
--   * `media_paths` : chemins de bucket préfixés par leur bucket
--     (`household-media/<chemin>`) — les colonnes média du dépôt stockent le
--     chemin SANS le nom du bucket (app/src/lib/storage.ts, isHouseholdMediaPath)
--     ; le préfixe est donc reconstitué ici, source par source. Les valeurs
--     héritées d'avant les buckets (http(s), data:, blob:, /) ne sont PAS des
--     chemins : elles sont exclues ici, et l'Edge ne copie que ce qui porte un
--     bucket connu.
--
-- PÉRIMÈTRE PAR MODULE (26-SPEC-DECISION.md, appliqué mot pour mot)
--   La donnée « personnelle » est repérée par l'identifiant de MEMBRE
--   (`household_members.id`, format texte `member_…`) : tous les `created_by`,
--   `paid_by`, `author_id`, `sender_id`… du dépôt portent cet identifiant, pas
--   l'uuid d'utilisateur (vérifié en base : household_members.user_id est uuid,
--   tout le reste est texte membre). Deux ensembles sont résolus une fois :
--   les ids de membres du demandeur (TOUTES ses lignes de membre, y compris
--   celles d'un foyer qu'il a quitté — la donnée qu'il a créée là le concerne
--   toujours) et les ids de foyers correspondants.

begin;

create or replace function private.gdpr_export_extract_batch(
  p_job_id uuid,
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job record;
  v_uid uuid;
  v_member_ids text[] := array[]::text[];
  v_household_ids text[] := array[]::text[];
  v_modules text[] := array[
    'profiles','households','household_members','tasks','events','notes',
    'expenses','routines','shopping_lists','posts','recipes','messages',
    'birthdays','pets','loyalty_cards','places','gift_lists','contacts',
    'trips','pantry_items','meal_entries','dashboard_widgets'
  ];
  v_module text;
  v_module_index integer;
  v_offset integer;
  v_limit_left integer;
  v_primary jsonb;
  v_primary_count integer;
  v_secondary jsonb;
  v_secondary2 jsonb;
  v_secondary3 jsonb;
  v_rows jsonb;
  v_media text[] := array[]::text[];
  v_media_batch text[] := array[]::text[];
  v_batch_rows jsonb;
  v_batch_module text;
  v_batch_start_offset integer;
  v_done boolean := false;
begin
  -- Ligne de job verrouillée : deux passes ne peuvent pas remettre le même
  -- lot (le curseur avance dans la même transaction que la lecture).
  select user_id, cursor_module, cursor_offset
    into v_job
    from public.gdpr_export_jobs
   where id = p_job_id
     for update;

  if not found then
    raise exception 'job introuvable' using errcode = 'P0002';
  end if;

  v_uid := v_job.user_id;

  -- Les deux ensembles de référence (membres et foyers du demandeur).
  select coalesce(array_agg(id), array[]::text[])
    into v_member_ids
    from public.household_members
   where user_id = v_uid;

  select coalesce(array_agg(distinct household_id), array[]::text[])
    into v_household_ids
    from public.household_members
   where user_id = v_uid;

  v_module := coalesce(v_job.cursor_module, v_modules[1]);
  v_offset := coalesce(v_job.cursor_offset, 0);
  v_module_index := array_position(v_modules, v_module);
  if v_module_index is null then
    -- Curseur inconnu : état impossible par construction, mais l'échec doit
    -- être lisible (D-02) plutôt qu'une boucle muette.
    raise exception 'curseur de module inconnu : %', v_module using errcode = '22023';
  end if;

  v_limit_left := greatest(p_limit, 1);

  loop
    v_primary := null;
    v_primary_count := 0;
    v_secondary := null;
    v_secondary2 := null;
    v_secondary3 := null;
    v_media_batch := array[]::text[];
    v_rows := null;
    -- Offset de DÉBUT du lot dans son module (HR-02/0165) : capturé AVANT la
    -- lecture, l'avance du curseur en fin de boucle le rendrait post-avance.
    v_batch_start_offset := v_offset;

    case v_module
      -- 1. Profil global du demandeur.
      when 'profiles' then
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb), count(*)::int
          into v_primary, v_primary_count
          from (select id, email, display_name, avatar_url, provider, city,
                       created_at, updated_at
                  from public.profiles
                 where id = v_uid
                 limit v_limit_left offset v_offset) r;
        select coalesce(array_agg(p.avatar_url), array[]::text[]) into v_media_batch
          from public.profiles p
         where p.id = v_uid and p.avatar_url is not null and p.avatar_url <> ''
           and p.avatar_url not like 'http%' and p.avatar_url not like 'data:%'
           and p.avatar_url not like 'blob:%' and p.avatar_url not like '/%';
        v_media_batch := array(select 'household-avatars/' || m from unnest(v_media_batch) m);

      -- 2. Foyers dont le demandeur est membre.
      when 'households' then
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb), count(*)::int
          into v_primary, v_primary_count
          from (select h.id, h.name, h.avatar_color, h.created_by, h.created_at,
                       h.updated_at, h.disabled_modules
                  from public.households h
                 where h.id::text = any(v_household_ids)
                 order by h.created_at, h.id
                 limit v_limit_left offset v_offset) r;

      -- 3. Lignes de membre du demandeur dans chaque foyer.
      when 'household_members' then
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb), count(*)::int
          into v_primary, v_primary_count
          from (select id, household_id, user_id, display_name, avatar_url,
                       color_tag, role, birth_date, created_at
                  from public.household_members
                 where user_id = v_uid
                 order by created_at, id
                 limit v_limit_left offset v_offset) r;

      -- 4. Tâches créées OU assignées au demandeur.
      when 'tasks' then
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb), count(*)::int
          into v_primary, v_primary_count
          from (select t.*
                  from public.tasks t
                 where t.created_by = any(v_member_ids)
                    or t.id in (select a.task_id from public.task_assignees a
                                 where a.member_id = any(v_member_ids))
                 order by t.created_at, t.id
                 limit v_limit_left offset v_offset) r;
        select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) into v_secondary
          from public.task_assignees a
         where a.task_id in (select (e->>'id') from jsonb_array_elements(v_primary) e);
        select coalesce(jsonb_agg(to_jsonb(rm)), '[]'::jsonb) into v_secondary2
          from public.task_reminders rm
         where rm.task_id in (select (e->>'id') from jsonb_array_elements(v_primary) e);
        v_rows := jsonb_build_object('tasks', v_primary, 'task_assignees', v_secondary,
                                     'task_reminders', v_secondary2);

      -- 5. Événements créés par le demandeur.
      when 'events' then
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb), count(*)::int
          into v_primary, v_primary_count
          from (select e.*
                  from public.events e
                 where e.created_by = any(v_member_ids)
                 order by e.created_at, e.id
                 limit v_limit_left offset v_offset) r;
        select coalesce(jsonb_agg(to_jsonb(er)), '[]'::jsonb) into v_secondary
          from public.event_reminders er
         where er.event_id in (select (x->>'id') from jsonb_array_elements(v_primary) x);
        v_rows := jsonb_build_object('events', v_primary, 'event_reminders', v_secondary);

      -- 6. Notes créées par le demandeur + leurs pièces jointes (médias).
      when 'notes' then
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb), count(*)::int
          into v_primary, v_primary_count
          from (select n.id, n.household_id, n.title, n.content, n.category,
                       n.color, n.created_by, n.created_at, n.updated_at,
                       n.folder_id, n.cover_attachment_id, n.is_locked
                  from public.notes n
                 where n.created_by = any(v_member_ids)
                 order by n.created_at, n.id
                 limit v_limit_left offset v_offset) r;
        select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) into v_secondary
          from public.note_attachments a
         where a.note_id in (select (x->>'id') from jsonb_array_elements(v_primary) x);
        -- Médias : pièces jointes de TOUTES les notes du demandeur (le filtre
        -- module entier, dédoublonné côté Edge — un chemin répété entre deux
        -- lots ne coûte qu'une ligne de manifeste).
        select coalesce(array_agg(distinct a.file_url), array[]::text[]) into v_media_batch
          from public.note_attachments a
          join public.notes n on n.id = a.note_id
         where n.created_by = any(v_member_ids)
           and a.file_url is not null and a.file_url <> ''
           and a.file_url not like 'http%' and a.file_url not like 'data:%'
           and a.file_url not like 'blob:%' and a.file_url not like '/%';
        v_media_batch := array(select 'household-media/' || m from unnest(v_media_batch) m);
        v_rows := jsonb_build_object('notes', v_primary, 'note_attachments', v_secondary);

      -- 7. Dépenses payées par le demandeur OU où il participe.
      when 'expenses' then
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb), count(*)::int
          into v_primary, v_primary_count
          from (select x.*
                  from public.expenses x
                 where x.paid_by = any(v_member_ids)
                    or x.id in (select ep.expense_id from public.expense_participants ep
                                 where ep.member_id = any(v_member_ids))
                 order by x.created_at, x.id
                 limit v_limit_left offset v_offset) r;
        select coalesce(jsonb_agg(to_jsonb(ep)), '[]'::jsonb) into v_secondary
          from public.expense_participants ep
         where ep.expense_id in (select (e->>'id') from jsonb_array_elements(v_primary) e);
        v_rows := jsonb_build_object('expenses', v_primary, 'expense_participants', v_secondary);

      -- 8. Routines créées OU assignées + complétions du demandeur.
      when 'routines' then
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb), count(*)::int
          into v_primary, v_primary_count
          from (select rt.*
                  from public.routines rt
                 where rt.created_by = any(v_member_ids)
                    or rt.id in (select ra.routine_id from public.routine_assignees ra
                                  where ra.member_id = any(v_member_ids))
                 order by rt.created_at, rt.id
                 limit v_limit_left offset v_offset) r;
        select coalesce(jsonb_agg(to_jsonb(ra)), '[]'::jsonb) into v_secondary
          from public.routine_assignees ra
         where ra.routine_id in (select (x->>'id') from jsonb_array_elements(v_primary) x);
        select coalesce(jsonb_agg(to_jsonb(rc)), '[]'::jsonb) into v_secondary2
          from public.routine_completions rc
         where rc.completed_by = any(v_member_ids);
        select coalesce(jsonb_agg(to_jsonb(rr)), '[]'::jsonb) into v_secondary3
          from public.routine_reminders rr
         where rr.routine_id in (select (x->>'id') from jsonb_array_elements(v_primary) x);
        v_rows := jsonb_build_object('routines', v_primary, 'routine_assignees', v_secondary,
                                     'routine_completions', v_secondary2,
                                     'routine_reminders', v_secondary3);

      -- 9. Listes de courses créées + articles ajoutés par le demandeur.
      when 'shopping_lists' then
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb), count(*)::int
          into v_primary, v_primary_count
          from (select s.id, s.household_id, s.name, s.created_by, s.created_at
                  from public.shopping_lists s
                 where s.created_by = any(v_member_ids)
                 order by s.created_at, s.id
                 limit v_limit_left offset v_offset) r;
        select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) into v_secondary
          from public.shopping_list_items i
         where i.added_by = any(v_member_ids);
        v_rows := jsonb_build_object('shopping_lists', v_primary, 'shopping_list_items', v_secondary);

      -- 10. Publications du Cercle + commentaires + réactions du demandeur.
      when 'posts' then
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb), count(*)::int
          into v_primary, v_primary_count
          from (select p.*
                  from public.posts p
                 where p.author_id = any(v_member_ids)
                 order by p.created_at, p.id
                 limit v_limit_left offset v_offset) r;
        select coalesce(jsonb_agg(to_jsonb(pm)), '[]'::jsonb) into v_secondary
          from public.post_media pm
         where pm.post_id in (select (x->>'id') from jsonb_array_elements(v_primary) x);
        select coalesce(jsonb_agg(to_jsonb(pc)), '[]'::jsonb) into v_secondary2
          from public.post_comments pc
         where pc.author_id = any(v_member_ids);
        select coalesce(jsonb_agg(to_jsonb(pr)), '[]'::jsonb) into v_secondary3
          from public.post_reactions pr
         where pr.author_id = any(v_member_ids);
        select coalesce(array_agg(distinct pm.url), array[]::text[]) into v_media_batch
          from public.post_media pm
          join public.posts p on p.id = pm.post_id
         where p.author_id = any(v_member_ids)
           and pm.url is not null and pm.url <> ''
           and pm.url not like 'http%' and pm.url not like 'data:%'
           and pm.url not like 'blob:%' and pm.url not like '/%';
        v_media_batch := array(select 'household-media/' || m from unnest(v_media_batch) m);
        v_rows := jsonb_build_object('posts', v_primary, 'post_media', v_secondary,
                                     'post_comments', v_secondary2, 'post_reactions', v_secondary3);

      -- 11. Recettes créées + ingrédients + étapes (médias : couverture, photos d'étapes).
      when 'recipes' then
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb), count(*)::int
          into v_primary, v_primary_count
          from (select rc.id, rc.household_id, rc.title, rc.created_at, rc.servings,
                       rc.prep_minutes, rc.cook_minutes, rc.cover_photo, rc.created_by,
                       rc.category_id
                  from public.recipes rc
                 where rc.created_by = any(v_member_ids)
                 order by rc.created_at, rc.id
                 limit v_limit_left offset v_offset) r;
        select coalesce(jsonb_agg(to_jsonb(ri)), '[]'::jsonb) into v_secondary
          from public.recipe_ingredients ri
         where ri.recipe_id in (select (x->>'id') from jsonb_array_elements(v_primary) x);
        select coalesce(jsonb_agg(to_jsonb(rs)), '[]'::jsonb) into v_secondary2
          from public.recipe_steps rs
         where rs.recipe_id in (select (x->>'id') from jsonb_array_elements(v_primary) x);
        select coalesce(array_agg(distinct m), array[]::text[]) into v_media_batch
          from (
            select rc.cover_photo as m from public.recipes rc
             where rc.created_by = any(v_member_ids)
               and rc.cover_photo is not null and rc.cover_photo <> ''
               and rc.cover_photo not like 'http%' and rc.cover_photo not like 'data:%'
               and rc.cover_photo not like 'blob:%' and rc.cover_photo not like '/%'
            union
            select rs.photo_path from public.recipe_steps rs
             join public.recipes rc on rc.id = rs.recipe_id
             where rc.created_by = any(v_member_ids)
               and rs.photo_path is not null and rs.photo_path <> ''
               and rs.photo_path not like 'http%' and rs.photo_path not like 'data:%'
               and rs.photo_path not like 'blob:%' and rs.photo_path not like '/%'
          ) u;
        v_media_batch := array(select 'household-media/' || m from unnest(v_media_batch) m);
        v_rows := jsonb_build_object('recipes', v_primary, 'recipe_ingredients', v_secondary,
                                     'recipe_steps', v_secondary2);

      -- 12. Messages envoyés + conversations dont le demandeur est membre.
      when 'messages' then
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb), count(*)::int
          into v_primary, v_primary_count
          from (select ms.*
                  from public.messages ms
                 where ms.sender_id = any(v_member_ids)
                 order by ms.created_at, ms.id
                 limit v_limit_left offset v_offset) r;
        select coalesce(jsonb_agg(to_jsonb(cv)), '[]'::jsonb) into v_secondary
          from public.conversations cv
         where cv.id in (select cm.conversation_id from public.conversation_members cm
                          where cm.member_id = any(v_member_ids));
        select coalesce(jsonb_agg(to_jsonb(cm)), '[]'::jsonb) into v_secondary2
          from public.conversation_members cm
         where cm.member_id = any(v_member_ids);
        select coalesce(array_agg(distinct ms.media_url), array[]::text[]) into v_media_batch
          from public.messages ms
         where ms.sender_id = any(v_member_ids)
           and ms.media_url is not null and ms.media_url <> ''
           and ms.media_url not like 'http%' and ms.media_url not like 'data:%'
           and ms.media_url not like 'blob:%' and ms.media_url not like '/%';
        v_media_batch := array(select 'household-media/' || m from unnest(v_media_batch) m);
        v_rows := jsonb_build_object('messages', v_primary, 'conversations', v_secondary,
                                     'conversation_members', v_secondary2);

      -- 13. Anniversaires des foyers du demandeur (pas de created_by porté).
      when 'birthdays' then
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb), count(*)::int
          into v_primary, v_primary_count
          from (select b.*
                  from public.birthdays b
                 where b.household_id = any(v_household_ids)
                 order by b.name, b.id
                 limit v_limit_left offset v_offset) r;
        select coalesce(array_agg(distinct b.photo_url), array[]::text[]) into v_media_batch
          from public.birthdays b
         where b.household_id = any(v_household_ids)
           and b.photo_url is not null and b.photo_url <> ''
           and b.photo_url not like 'http%' and b.photo_url not like 'data:%'
           and b.photo_url not like 'blob:%' and b.photo_url not like '/%';
        v_media_batch := array(select 'household-media/' || m from unnest(v_media_batch) m);
        v_rows := jsonb_build_object('birthdays', v_primary);

      -- 14. Animaux des foyers du demandeur (filtrés par foyer).
      when 'pets' then
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb), count(*)::int
          into v_primary, v_primary_count
          from (select p.*
                  from public.pets p
                 where p.household_id = any(v_household_ids)
                 order by p.created_at, p.id
                 limit v_limit_left offset v_offset) r;
        select coalesce(array_agg(distinct p.photo_url), array[]::text[]) into v_media_batch
          from public.pets p
         where p.household_id = any(v_household_ids)
           and p.photo_url is not null and p.photo_url <> ''
           and p.photo_url not like 'http%' and p.photo_url not like 'data:%'
           and p.photo_url not like 'blob:%' and p.photo_url not like '/%';
        v_media_batch := array(select 'household-media/' || m from unnest(v_media_batch) m);
        v_rows := jsonb_build_object('pets', v_primary);

      -- 15. Cartes de fidélité du demandeur (personnelles + foyer sans membre).
      when 'loyalty_cards' then
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb), count(*)::int
          into v_primary, v_primary_count
          from (select lc.*
                  from public.loyalty_cards lc
                 where lc.member_id = any(v_member_ids)
                    or (lc.member_id is null and lc.household_id = any(v_household_ids))
                 order by lc.created_at, lc.id
                 limit v_limit_left offset v_offset) r;
        v_rows := jsonb_build_object('loyalty_cards', v_primary);

      -- 16. Lieux des foyers du demandeur.
      when 'places' then
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb), count(*)::int
          into v_primary, v_primary_count
          from (select pl.*
                  from public.places pl
                 where pl.household_id = any(v_household_ids)
                 order by pl.created_at, pl.id
                 limit v_limit_left offset v_offset) r;
        select coalesce(array_agg(distinct pl.photo_url), array[]::text[]) into v_media_batch
          from public.places pl
         where pl.household_id = any(v_household_ids)
           and pl.photo_url is not null and pl.photo_url <> ''
           and pl.photo_url not like 'http%' and pl.photo_url not like 'data:%'
           and pl.photo_url not like 'blob:%' and pl.photo_url not like '/%';
        v_media_batch := array(select 'household-media/' || m from unnest(v_media_batch) m);
        v_rows := jsonb_build_object('places', v_primary);

      -- 17. Listes de cadeaux possédées + leurs articles.
      when 'gift_lists' then
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb), count(*)::int
          into v_primary, v_primary_count
          from (select gl.*
                  from public.gift_lists gl
                 where gl.owner_member_id = any(v_member_ids)
                 order by gl.created_at, gl.id
                 limit v_limit_left offset v_offset) r;
        select coalesce(jsonb_agg(to_jsonb(gi)), '[]'::jsonb) into v_secondary
          from public.gift_items gi
         where gi.list_id in (select (x->>'id') from jsonb_array_elements(v_primary) x);
        select coalesce(array_agg(distinct gi.photo_url), array[]::text[]) into v_media_batch
          from public.gift_items gi
          join public.gift_lists gl on gl.id = gi.list_id
         where gl.owner_member_id = any(v_member_ids)
           and gi.photo_url is not null and gi.photo_url <> ''
           and gi.photo_url not like 'http%' and gi.photo_url not like 'data:%'
           and gi.photo_url not like 'blob:%' and gi.photo_url not like '/%';
        v_media_batch := array(select 'household-media/' || m from unnest(v_media_batch) m);
        v_rows := jsonb_build_object('gift_lists', v_primary, 'gift_items', v_secondary);

      -- 18. Listes de contacts possédées ou partagées du foyer + leurs contacts.
      when 'contacts' then
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb), count(*)::int
          into v_primary, v_primary_count
          from (select cl.id, cl.household_id, cl.name, cl.owner_member_id,
                       cl.is_default, cl.created_at
                  from public.contact_lists cl
                 where cl.owner_member_id = any(v_member_ids)
                    or (cl.is_default and cl.household_id = any(v_household_ids))
                 order by cl.created_at, cl.id
                 limit v_limit_left offset v_offset) r;
        select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into v_secondary
          from public.contacts c
         where c.list_id in (select (x->>'id') from jsonb_array_elements(v_primary) x);
        select coalesce(array_agg(distinct c.photo_url), array[]::text[]) into v_media_batch
          from public.contacts c
          join public.contact_lists cl on cl.id = c.list_id
         where (cl.owner_member_id = any(v_member_ids)
                or (cl.is_default and cl.household_id = any(v_household_ids)))
           and c.photo_url is not null and c.photo_url <> ''
           and c.photo_url not like 'http%' and c.photo_url not like 'data:%'
           and c.photo_url not like 'blob:%' and c.photo_url not like '/%';
        v_media_batch := array(select 'household-media/' || m from unnest(v_media_batch) m);
        v_rows := jsonb_build_object('contact_lists', v_primary, 'contacts', v_secondary);

      -- 19. Voyages des foyers du demandeur.
      when 'trips' then
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb), count(*)::int
          into v_primary, v_primary_count
          from (select t.id, t.household_id, t.name, t.destination, t.start_date,
                       t.end_date, t.cover_photo, t.notes, t.created_at, t.created_by
                  from public.trips t
                 where t.household_id = any(v_household_ids)
                 order by t.created_at, t.id
                 limit v_limit_left offset v_offset) r;
        select coalesce(array_agg(distinct t.cover_photo), array[]::text[]) into v_media_batch
          from public.trips t
         where t.household_id = any(v_household_ids)
           and t.cover_photo is not null and t.cover_photo <> ''
           and t.cover_photo not like 'http%' and t.cover_photo not like 'data:%'
           and t.cover_photo not like 'blob:%' and t.cover_photo not like '/%';
        v_media_batch := array(select 'household-media/' || m from unnest(v_media_batch) m);
        v_rows := jsonb_build_object('trips', v_primary);

      -- 20. Articles du frigo créés par le demandeur.
      when 'pantry_items' then
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb), count(*)::int
          into v_primary, v_primary_count
          from (select pi.*
                  from public.pantry_items pi
                 where pi.created_by = any(v_member_ids)
                 order by pi.created_at, pi.id
                 limit v_limit_left offset v_offset) r;
        v_rows := jsonb_build_object('pantry_items', v_primary);

      -- 21. Repas du menu créés par le demandeur.
      when 'meal_entries' then
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb), count(*)::int
          into v_primary, v_primary_count
          from (select me.*
                  from public.meal_entries me
                 where me.created_by = any(v_member_ids)
                 order by me.created_at, me.id
                 limit v_limit_left offset v_offset) r;
        v_rows := jsonb_build_object('meal_entries', v_primary);

      -- 22. Widgets du tableau de bord du demandeur.
      when 'dashboard_widgets' then
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb), count(*)::int
          into v_primary, v_primary_count
          from (select dw.*
                  from public.dashboard_widgets dw
                 where dw.member_id = any(v_member_ids)
                 order by dw.id
                 limit v_limit_left offset v_offset) r;
        v_rows := jsonb_build_object('dashboard_widgets', v_primary);

      else
        raise exception 'curseur de module inconnu : %', v_module using errcode = '22023';
    end case;

    -- Module sans table primaire mono-ligne (profiles) : la pagination porte
    -- quand même sur la requête limit/offset, le compte décide.
    if v_primary is null then
      v_primary := '[]'::jsonb;
    end if;
    if v_rows is null then
      v_rows := jsonb_build_object(v_module, v_primary);
    end if;

    if v_primary_count = 0 then
      -- Module épuisé : module suivant. Le dernier module bascule done.
      if v_module_index >= array_length(v_modules, 1) then
        v_done := true;
        exit;
      end if;
      v_module_index := v_module_index + 1;
      v_module := v_modules[v_module_index];
      v_offset := 0;
      continue;
    end if;

    -- Un lot rendu appartient à UN module : on le rend tel quel.
    v_batch_rows := v_rows;
    v_batch_module := v_module;
    v_media := v_media || v_media_batch;

    if v_primary_count < v_limit_left then
      -- Module épuisé dans ce lot : avancer au module suivant AVANT de rendre.
      if v_module_index >= array_length(v_modules, 1) then
        v_done := true;
        v_offset := v_offset + v_primary_count;
      else
        v_module_index := v_module_index + 1;
        v_module := v_modules[v_module_index];
        v_offset := 0;
      end if;
    else
      -- Le module déborde encore : reprendre à cet offset au prochain lot.
      v_offset := v_offset + v_primary_count;
    end if;

    -- Avance transactionnelle du curseur (même transaction que la lecture).
    update public.gdpr_export_jobs
       set cursor_module = v_module,
           cursor_offset = v_offset,
           updated_at = now()
     where id = p_job_id;

    exit;
  end loop;

  if v_done then
    update public.gdpr_export_jobs
       set cursor_offset = 0,
           updated_at = now()
     where id = p_job_id;
  end if;

  return jsonb_build_object(
    'user_id', v_uid,
    'module', coalesce(v_batch_module, v_module),
    'rows', coalesce(v_batch_rows, jsonb_build_object(v_module, '[]'::jsonb)),
    'cursor_module', v_module,
    'cursor_offset', v_offset,
    'batch_start_offset', coalesce(v_batch_start_offset, 0),
    'done', v_done,
    'media_paths', coalesce((select array_agg(distinct m) from unnest(v_media) m), array[]::text[])
  );
end;
$$;

comment on function private.gdpr_export_extract_batch(uuid, integer) is
  'Extraction JSON bornée au demandeur (RGEX-03). Portée tranchée dans 26-SPEC-DECISION.md : Option A « Ce qui me concerne », fusion multi-foyers, 22 modules. Corps effectif (0161, enrichi 0165) : remet UN lot par appel, curseur (cursor_module/cursor_offset) avancé transactionnellement, batch_start_offset = offset de DÉBUT du lot (nommage et tri déterministes des fragments côté Edge), done=true à l''épuisement des 22 modules. La borne d''isolement vit dans CE RPC — l''Edge transporte, il ne définit jamais le périmètre.';

-- Privilèges inchangés (posés en 0158/0160) : service_role uniquement.
revoke all on function private.gdpr_export_extract_batch(uuid, integer) from public, anon, authenticated;
grant execute on function private.gdpr_export_extract_batch(uuid, integer) to service_role;

commit;
