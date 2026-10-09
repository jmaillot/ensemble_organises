-- 0103_message_system_join.sql
-- D-11 : l'arrivée annonce le fil comme le départ, par une ligne système
-- figée serveur.
--
-- Constat (UAT 08, 08-CONTEXT D-11) : l'ajout tardif est muet — les restants
-- ne voient pas qui est entré. Décidé : chaque ajout postérieur à la création
-- écrit exactement une ligne système dans le fil, figée au nom du joint au
-- moment de l'ajout (les renommages ultérieurs ne réécrivent jamais
-- l'histoire), visible comme toute ligne (restants + jointe), inactionnable
-- (aucune écriture client) et silencieuse (ni file push, ni non-lus) — les
-- mêmes garanties que les départs 0101, étendues, pas reconstruites.
--
-- Règle de silence à la création (choix documenté de l'exécutant, prouvé des
-- deux côtés en 0042) : les membres fondateurs partagent la transaction
-- fondatrice de la conversation — la ligne `conversations` et ses membres
-- portent le même `xmin`. Le RPC `create_conversation` (0041) comme les
-- insertions directes fondent fil + membres dans une seule transaction : le
-- déclencheur compare le `xmin` de la ligne insérée à celui du fil et se tait
-- quand ils coïncident. Ni horloge (un ajout manuel trois secondes après la
-- création n'est pas un fondateur), ni marquage (aucune colonne, aucun
-- paramètre) : la distinction est la transaction elle-même. Cas limite
-- honnête : un fil fondé en SQL brut en deux transactions annoncerait ses
-- seconds membres — ils n'étaient pas dans l'instant fondateur.
--
-- Forme retenue : `sender_id NULL`, la forme 0101. Tout ce qu'elle apporte
-- est donc déjà prouvé et reste inchangé :
--   * `validate_member_refs` (0008) saute les références nulles : AUCUNE.
--   * `lock_message_identity` (0041) verrouille auteur/fil : AUCUNE.
--   * Les RLS `messages_insert/update/delete` exigent un auteur égal au membre
--     courant : NULL n'est jamais égal, donc tout faux système est refusé
--     sans retoucher une seule politique (prouvé pour l'espèce arrivée en
--     0042, comme 0040 l'avait prouvé pour l'espèce départ).
--   * `enqueue_message_notification` (0101) ignore déjà les lignes sans auteur :
--     AUCUNE retouche — l'arrivée n'entre jamais en file (prouvé en 0042).
--   * Aucun état serveur de lecture n'existe (suivi local) : le marqueur
--     d'exclusion reste `sender_id IS NULL`, prouvé côté Vitest (08-06).
--   * Fenêtre figée (0102) : l'arrivée naît à l'heure d'instruction et suit la
--     borne comme toute ligne — visible des actifs, bornée pour les tombés
--     (prouvé en 0042 : la partante relit son arrivée née avant sa pierre).
--
-- Exactement-une-fois : l'annonce part sur chaque INSERT (ajout admin comme
-- réadhésion après nettoyage de pierre — 0100, inchangé). La suppression
-- d'une pierre reste muette (0101, inchangé) ; seul le ré-INSERT annonce, une
-- fois. Garde-fou : sans ligne `conversations` (impossible par clé étrangère),
-- l'annonce est abandonnée.

begin;

-- ---------------------------------------------------------------------------
-- Annonce d'arrivée : nom figé au moment de l'ajout, une fois par ajout,
-- silence pour les fondateurs (même `xmin` que le fil).
-- ---------------------------------------------------------------------------
create or replace function private.announce_conversation_join()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_founding xid;
  v_household text;
  v_name text;
begin
  -- La ligne parente existe toujours (clé étrangère) ; la garde reste par
  -- prudence, comme en 0101.
  select c.xmin, c.household_id into v_founding, v_household
    from public.conversations c
   where c.id = new.conversation_id;
  if v_founding is null then
    return new;
  end if;

  -- Fondateurs : même transaction fondatrice que le fil — pas de spam initial.
  if v_founding = new.xmin then
    return new;
  end if;

  select m.display_name into v_name
    from public.household_members m
   where m.id = new.member_id;
  if v_name is null or btrim(v_name) = '' then
    v_name := 'Un membre';
  end if;

  -- Horodatage d'instruction, comme 0101 : l'annonce naît à l'ajout.
  insert into public.messages (id, conversation_id, household_id, sender_id, content, created_at)
  values (private.new_id('message'), new.conversation_id, v_household, null, v_name || ' a rejoint la conversation', clock_timestamp());

  return new;
end;
$$;

comment on function private.announce_conversation_join() is
  'Annonce chaque ajout postérieur à la création par une ligne système au nom figé, exactement une fois ; muette pour les fondateurs (même xmin que le fil).';

comment on column public.messages.sender_id is
  'Auteur membre du foyer ; NULL = ligne système serveur (départ D-09, arrivée D-11), écrite par les déclencheurs seuls, jamais par un client.';

drop trigger if exists announce_conversation_join_insert on public.conversation_members;
create trigger announce_conversation_join_insert
  after insert on public.conversation_members
  for each row execute function private.announce_conversation_join();

revoke all on function private.announce_conversation_join() from public, anon, authenticated;

commit;
