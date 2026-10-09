-- 0107_archive_admin_null_guard.sql
-- Durcit le garde admin de `archive_conversation` (0106) contre la logique
-- à trois valeurs.
--
-- Constat (suite 0045, avant cette correction) : `private.is_household_admin`
-- vaut `household_role(...) = 'admin'`, et `household_role` rend NULL pour
-- qui n'a aucune ligne membre — donc NULL pour un hors-foyer. Le garde 0106
-- (`if not ... then raise`) ne se déclenchait pas sur NULL, et un extérieur
-- archivait sans erreur (prouvé en 0045 : `un exterieur n'archive rien` en
-- échec, sans corruption — toutes les lignes étaient déjà tombées, 0 ligne
-- touchée, aucune annonce). Les politiques RLS n'ont jamais eu ce trou
-- (une politique exige TRUE, NULL refuse), seul le `IF` procédural l'avait.
--
-- Correction vers l'avant (0106 appliquée, jamais réécrite) : le garde exige
-- TRUE explicite (`coalesce(..., false) is not true`). Corps 0106 inchangé
-- par ailleurs ; la définition effective est celle-ci.

begin;

create or replace function public.archive_conversation(p_conversation_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_household_id text;
  v_at timestamptz := clock_timestamp();
  v_count integer := 0;
begin
  if v_actor is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_conversation_id is null then
    raise exception 'conversation obligatoire' using errcode = '22023';
  end if;

  select c.household_id into v_household_id
    from public.conversations c
   where c.id = p_conversation_id;
  if v_household_id is null then
    raise exception 'conversation inconnue' using errcode = '22023';
  end if;

  -- Même population que l'ancien `conversations_delete` : admin du foyer,
  -- re-vérifié ici, jamais une revendication cliente. `is_household_admin`
  -- rend NULL hors foyer (pas de ligne membre) : on exige TRUE explicite,
  -- sinon un extérieur passerait le garde sans erreur (trou 0045).
  if coalesce(private.is_household_admin(v_household_id), false) is not true then
    raise exception 'seul un administrateur archive la conversation' using errcode = '42501';
  end if;

  -- Les tombes de masse ne s'annoncent pas une par une (voir 0106).
  perform set_config('conversation.archive_all', 'on', true);

  -- Un seul instant pour tous les actifs ; les déjà-tombés ne sont jamais
  -- réécrits (leur borne 0102 et leurs périodes 0105 intactes). Chaque tombe
  -- ferme sa fenêtre de présence ouverte à la pierre via le déclencheur
  -- 0105 — une transition par ligne, jamais de double-fermeture.
  update public.conversation_members cm
     set left_at = v_at
   where cm.conversation_id = p_conversation_id
     and cm.left_at is null;
  get diagnostics v_count = row_count;

  -- Une seule annonce d'archive, née exactement à l'instant commun : incluse
  -- dans chaque fenêtre nouvellement fermée par `<=`, sans bidouille de
  -- borne. Rien si personne n'a été tombé (ré-archive idempotente).
  if v_count > 0 then
    insert into public.messages (id, conversation_id, household_id, sender_id, content, created_at)
    values (private.new_id('message'), p_conversation_id, v_household_id, null, 'La conversation a été archivée', v_at);
  end if;

  perform set_config('conversation.archive_all', 'off', true);

  return jsonb_build_object('conversation_id', p_conversation_id, 'archived_members', v_count, 'archived_at', v_at);
end;
$$;

comment on function public.archive_conversation(text) is
  'Archivage-pour-tous (D-14, garde TRUE explicite 0107) : tombe tous les membres actifs à un instant commun, une seule annonce d''archive, aucune suppression, déjà-partis intouchés. USAGE AUTHENTIFIÉ UNIQUEMENT.';

revoke all on function public.archive_conversation(text) from public, anon;
grant execute on function public.archive_conversation(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Garde-fous permanents (précédent 0016, 0035, 0041, 0100, 0106).
-- ---------------------------------------------------------------------------
do $$
begin
  if has_function_privilege('anon', 'public.archive_conversation(text)', 'EXECUTE') then
    raise exception 'anon ne doit pas pouvoir archiver une conversation par RPC';
  end if;
  if not has_function_privilege('authenticated', 'public.archive_conversation(text)', 'EXECUTE') then
    raise exception 'authenticated doit pouvoir archiver une conversation par RPC';
  end if;
end;
$$;

commit;
