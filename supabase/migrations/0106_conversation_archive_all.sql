-- 0106_conversation_archive_all.sql
-- D-14 (UAT 2026-10-09) : la suppression admin devient un archivage-pour-tous.
--
-- Constat (preuve RED 08-09, avant cette migration) : l'admin supprimait le
-- fil (`conversations_delete` + cascade FK) et vaporisait conversation,
-- messages et appartenances pour tout le monde — histoire irrécupérable.
-- Décidé : le même geste fige le fil pour tous au lieu de le détruire, avec
-- la même machinerie de pierres tombales (0100) et de fenêtres figées
-- (0102), sans jamais réécrire la borne d'un déjà-parti.
--
-- Quatre retouches, vers l'avant uniquement, aucun fichier appliqué retouché :
--   1. `public.archive_conversation` : RPC `SECURITY DEFINER`, `EXECUTE` à
--      `authenticated` seul. L'acteur (`auth.uid()`, jamais un paramètre,
--      modèle 0016/0035/0041) est re-vérifié admin du foyer EN-RPC via
--      `private.is_household_admin` — exactement la population de l'ancien
--      `conversations_delete` (admin du foyer, appartenance au fil non
--      exigée), jamais une revendication cliente. Puis UNE seule instruction
--      tombe toutes les lignes ACTIVES (`left_at IS NULL`) à UN instant
--      commun (`clock_timestamp()`, heure d'instruction comme en 0102 : dans
--      une transaction qui écrit puis archive, `now()` vaudrait le début et
--      la borne ne fermerait pas l'historique). Les lignes déjà tombées ne
--      sont jamais réécrites : leur borne 0102 et leurs périodes 0105 restent
--      intactes, octet pour octet. Les déclencheurs existants font le reste :
--      chaque tombe ferme sa fenêtre de présence ouverte à la pierre (0105,
--      une transition null→renseigné par ligne, jamais de double-fermeture)
--      et... voir point 2 pour les annonces. Ré-archive idempotent : 0 ligne,
--      aucune annonce, succès.
--   2. Annonces : SANS garde-fou, chaque tombe de masse déclencherait
--      `announce_conversation_leave` — N lignes « X a quitté » mensongères
--      pour un geste admin unique. `archive_conversation` pose donc un
--      drapeau local à la transaction (`conversation.archive_all`, retiré en
--      fin de RPC) et `announce_conversation_leave` (remplacée vers l'avant,
--      corps 0102 inchangé par ailleurs) reste muette sur la branche UPDATE
--      quand il est posé — la branche DELETE (retrait dur) est intacte, et
--      hors archive le drapeau est vide donc les départs volontaires
--      s'annoncent comme avant. Le RPC émet À LA PLACE une seule annonce
--      d'archive (« La conversation a été archivée », `sender_id` nul comme
--      les lignes système 0101/0103, exclue du push et des non-lus comme
--      elles) née EXACTEMENT à l'instant commun : `created_at = left_at` de
--      chaque nouvel archivé, donc incluse dans chaque fenêtre par `<=`, sans
--      bidouille de borne — la condition du plan est remplie, l'annonce est
--      émise. Les déjà-partis (borne antérieure) ne la voient pas, comme tout
--      contenu post-départ : leur borne reste la leur.
--   3. Destruction retirée : la politique `conversations_delete` est
--      SUPPRIMÉE (choix documenté : abandon plutôt que détournement — un
--      DELETE qui archiverait surprendrait, un DELETE refusé se prouve ; sans
--      politique, la RLS refuse par défaut, 0 ligne touchée, sans erreur).
--      Le RPC ne supprime AUCUNE ligne (ni conversation, ni message, ni
--      appartenance) : prouvé en 0045 (tentative admin sans effet, histoire
--      intacte). Le retrait dur d'un membre par un admin
--      (`conversation_members_delete`, sémantique conservée depuis 0100) et
--      le nettoyage de sa propre pierre restent intacts : seul le
--      vaporisateur de fil disparaît.
--   4. Écritures : inchangées — toutes exigent déjà l'actif (0100), donc un
--      fil archivé-pour-tous est inscriptible par personne, admin compris
--      (prouvé en 0045 : envoi/édition/suppression refusés pour chacun).
--
-- Fenêtre mobile : une réadhésion post-archive (effacement de la pierre par
-- la voie 0104, inchangée) rouvre comme avant — l'archive n'est pas un
-- verrou, c'est une tombe collective ; la restauration explicite reste un
-- suivi différé (D-14).

begin;

-- ---------------------------------------------------------------------------
-- Pendant l'archive de masse, les tombes ne s'annoncent pas une par une.
-- ---------------------------------------------------------------------------
create or replace function private.announce_conversation_leave()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_leaver text;
  v_conversation text;
  v_household text;
  v_name text;
  v_at timestamptz;
begin
  -- Archivage-pour-tous (0106, D-14) : le RPC émet une seule annonce
  -- d'archive à l'instant commun — les N « X a quitté » seraient
  -- mensongers pour un geste admin unique. Drapeau local à la transaction,
  -- posé puis retiré par `archive_conversation` ; vide hors archive, donc
  -- les départs volontaires s'annoncent comme en 0101/0102.
  if TG_OP <> 'DELETE' and coalesce(current_setting('conversation.archive_all', true), '') = 'on' then
    return new;
  end if;
  if TG_OP = 'DELETE' then
    if old.left_at is not null then
      return old;
    end if;
    v_leaver := old.member_id;
    v_conversation := old.conversation_id;
    v_at := clock_timestamp();
  else
    if old.left_at is not null or new.left_at is null then
      return new;
    end if;
    v_leaver := new.member_id;
    v_conversation := new.conversation_id;
    -- Dans la fenêtre par construction (D-10) : l'annonce du départ porte
    -- l'instant du départ, pas quelques microsecondes de plus.
    v_at := new.left_at;
  end if;

  select c.household_id into v_household
    from public.conversations c
   where c.id = v_conversation;
  if v_household is null then
    if TG_OP = 'DELETE' then
      return old;
    else
      return new;
    end if;
  end if;

  select m.display_name into v_name
    from public.household_members m
   where m.id = v_leaver;
  if v_name is null or btrim(v_name) = '' then
    v_name := 'Un membre';
  end if;

  insert into public.messages (id, conversation_id, household_id, sender_id, content, created_at)
  values (private.new_id('message'), v_conversation, v_household, null, v_name || ' a quitté la conversation', v_at);

  if TG_OP = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$$;

comment on function private.announce_conversation_leave() is
  'Annonce chaque départ (RPC volontaire, retrait admin) par une ligne système au nom figé, exactement une fois ; muet sur re-départ, nettoyage de pierre, suppression du fil — et sur les tombes de masse pendant archive_conversation (0106, une seule annonce d''archive à l''instant commun). L''annonce volontaire naît dans la fenêtre du partant (D-10).';

revoke all on function private.announce_conversation_leave() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- D-14 : archivage-pour-tous — un instant commun, aucune réécriture des
-- déjà-partis, une seule annonce, aucune suppression.
-- ---------------------------------------------------------------------------
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
  -- re-vérifié ici, jamais une revendication cliente.
  if not private.is_household_admin(v_household_id) then
    raise exception 'seul un administrateur archive la conversation' using errcode = '42501';
  end if;

  -- Les tombes de masse ne s'annoncent pas une par une (voir ci-dessus).
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
  'Archivage-pour-tous (D-14) : tombe tous les membres actifs à un instant commun, une seule annonce d''archive, aucune suppression, déjà-partis intouchés. USAGE AUTHENTIFIÉ UNIQUEMENT.';

revoke all on function public.archive_conversation(text) from public, anon;
grant execute on function public.archive_conversation(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Destruction retirée : abandon de la politique (pas de détournement).
-- ---------------------------------------------------------------------------
drop policy if exists conversations_delete on public.conversations;

-- ---------------------------------------------------------------------------
-- Garde-fous permanents (précédent 0016, 0035, 0041, 0100).
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
