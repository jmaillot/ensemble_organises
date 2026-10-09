-- 0104_member_rejoin_clear.sql
-- D-12 : réadhésion = effacement du `left_at` (jamais supprimer+recréer).
--
-- Constat (UAT 08, 08-CONTEXT D-12) : ranimer un partant exigeait
-- supprimer+ré-insérer sa ligne — le premier temps est refusé aux
-- non-admins par `conversation_members_delete` (0100, soi seul sauf admin),
-- et le second se heurte à la clé ((conversation_id, member_id), 0004) tant
-- que la pierre existe. Le partant ne revenait qu'après retrait de ses
-- archives. Décidé : le verbe cohérent est dé-partir, pas
-- supprimer-puis-ajouter — un participant actif ou un admin efface la pierre
-- en une seule mise à jour, exactement la population déjà habilitée à ajouter
-- (`conversation_members_insert`, 0007, inchangée).
--
-- Deux retouches, vers l'avant uniquement, aucun fichier appliqué retouché :
--   1. Politique `conversation_members_update` (la première sur le registre :
--      0100 n'en voulait aucune, D-12 en exige une) qui miroite exactement
--      l'habilitation d'ajout — `can_join_conversation` (participant actif
--      ou admin) + cible dans le même foyer — resserrée à la transition
--      dé-partir : USING sur l'ancienne ligne (`left_at NOT NULL`, la pierre
--      existe), WITH CHECK sur la nouvelle (`left_at NULL`, la pierre
--      s'efface). Tout faux départ par mise à jour (actif → tombé, par
--      habilité comme par non-habilité) est donc refusé par construction :
--      seule la transition pierre → actif est ouverte.
--      Étendue assumée (documentée, pas élargie) : la politique ne fige pas
--      `member_id`/`conversation_id` — mais toute ligne réaffectée reste
--      bornée par la même habilitation des deux côtés (ajout dans un fil où
--      l'on participe ou administre, cible du même foyer), et toute
--      transition pierre → actif annonce (point 2), donc sans annonce
--      silencieuse possible.
--   2. Annonce d'arrivée sur dé-partir (`OLD` tombé → `NEW` actif), qui
--      réutilise la forme 0103 à l'identique (expéditeur NULL, nom figé au
--      moment du retour, `clock_timestamp()`, mêmes exclusions automatiques :
--      pas de file push — `enqueue_message_notification` ignore déjà le
--      NULL —, pas de non-lus serveur — aucun état n'existe). Le
--      silence-à-la-création 0103 est intact : un dé-partir est toujours un
--      événement postérieur par construction (une ligne naît active ou
--      tombée-muette-du-fondateur, jamais en train de revenir), donc il
--      annonce toujours — prouvé en 0043. Disjoint du déclencheur de départ
--      0101 (actif → tombé) : chaque transition n'a qu'un seul annonciateur.
--
-- Lectures relevées sans retouche (0102, inchangé) : la borne
-- `can_read_message` ne s'applique qu'aux lignes tombées existantes — sans
-- pierre, le membre est actif et relit tout le fil. Le re-départ horodate une
-- pierre neuve (0102, `clock_timestamp()`), donc une borne neuve — prouvé
-- en 0043. La voie historique (l'admin supprime la pierre puis ré-insère,
-- 0100) reste ouverte et annonce via 0103 — prouvée intacte en 0043.

begin;

-- ---------------------------------------------------------------------------
-- Réadhésion en une mise à jour : même habilitation que l'ajout, resserrée
-- à la transition pierre → actif.
-- ---------------------------------------------------------------------------
drop policy if exists conversation_members_update on public.conversation_members;
create policy conversation_members_update on public.conversation_members
  for update using (
    left_at is not null
    and private.can_join_conversation(conversation_id)
    and private.member_in_household(
      member_id, private.conversation_household_id(conversation_id)
    )
  )
  with check (
    left_at is null
    and private.can_join_conversation(conversation_id)
    and private.member_in_household(
      member_id, private.conversation_household_id(conversation_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Annonce d'arrivée sur dé-partir : nom figé au moment du retour, une fois
-- par retour, forme 0103 (expéditeur NULL, silencieuse push/non-lus).
-- ---------------------------------------------------------------------------
create or replace function private.announce_conversation_rejoin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household text;
  v_name text;
begin
  -- Seule la transition tombé → actif annonce : le départ et le re-départ
  -- (actif → tombé, 0101) comme les réécritures sans transition passent ici
  -- sans bruit — chaque transition n'a qu'un seul annonciateur.
  if old.left_at is null or new.left_at is not null then
    return new;
  end if;

  -- La ligne parente existe toujours (clé étrangère) ; la garde reste par
  -- prudence, comme en 0101/0103.
  select c.household_id into v_household
    from public.conversations c
   where c.id = new.conversation_id;
  if v_household is null then
    return new;
  end if;

  select m.display_name into v_name
    from public.household_members m
   where m.id = new.member_id;
  if v_name is null or btrim(v_name) = '' then
    v_name := 'Un membre';
  end if;

  -- Horodatage d'instruction, comme 0101/0103 : l'annonce naît au retour et
  -- suit la borne comme toute ligne — visible des actifs, bornée pour les
  -- tombés postérieurs.
  insert into public.messages (id, conversation_id, household_id, sender_id, content, created_at)
  values (private.new_id('message'), new.conversation_id, v_household, null, v_name || ' a rejoint la conversation', clock_timestamp());

  return new;
end;
$$;

comment on function private.announce_conversation_rejoin() is
  'Annonce chaque retour (effacement du left_at, D-12) par une ligne système au nom figé, exactement une fois ; muet sur toute autre écriture de left_at. Même forme et mêmes exclusions que l''arrivée 0103.';

drop trigger if exists announce_conversation_rejoin_update on public.conversation_members;
create trigger announce_conversation_rejoin_update
  after update of left_at on public.conversation_members
  for each row execute function private.announce_conversation_rejoin();

revoke all on function private.announce_conversation_rejoin() from public, anon, authenticated;

commit;
