-- 0105_membership_periods.sql
-- D-13 (amende D-12, UAT 2026-10-09) : les absences sont mémorisées
-- (périodes) — le ré-ajouté ne relit PAS les messages parus pendant ses
-- absences, ni les annonces système de la période.
--
-- Constat (UAT 08) : ranimer un partant (0104) relevait la borne 0102, et le
-- ré-ajouté relisait tout le creux — la règle D-12 « le ré-ajouté relit tout »
-- est amendée : lectures bornées à la présence, creux cachés. Décidé : chaque
-- appartenance porte son historique de présence (fenêtres
-- `[joined_at, left_at]`), entretenu par déclencheurs seuls — jamais par le
-- client — et les lectures exigent en plus la couverture par une fenêtre, à
-- côté de toutes les portes existantes.
--
-- Cinq retouches, vers l'avant uniquement, aucun fichier appliqué retouché :
--   1. Table `conversation_membership_periods` (fenêtre par appartenance :
--      conversation, membre, entrée, sortie nulle si présent). RLS activée
--      SANS politique et GRANT révoqués (précédent `household_invite_tokens`,
--      0009) : vérité serveur, jamais revendiquée ni lue par un client. Les
--      privilèges par défaut (0009) accordent CRUD à `authenticated` sur toute
--      table neuve — révocation explicite ci-dessous, prouvée en 0044.
--   2. Prédicat `in_membership_presence` : couvert s'il existe une fenêtre
--      avec `joined_at <= created_at <= left_at` (sortie nulle = ouvert), OU
--      si le message est antérieur à toute présence enregistrée (`created_at
--      < min(joined_at)`). Cette seconde branche conserve le comportement
--      d'ajout tardif (0103 : l'ajouté lit l'avant) et les contenus antidatés
--      (0041 : `now() - 1 hour`) — elle ne rouvre aucun creux : un message du
--      creux est postérieur à la première entrée par construction. Les jeux
--      antidatés vers le futur (0043 : pierre + 1 minute) tombent APRÈS la
--      fenêtre rouverte et restent visibles : artefact de preuve documenté en
--      08-07-SUMMARY, pas une faille — 0044 n'emploie que des horloges réelles.
--   3. `can_read_message` (0102, remplacée vers l'avant) : la borne pierre est
--      INCHANGÉE pour les lignes tombées, la couverture s'y AJOUTE. Pour un
--      tombé, la fenêtre fermée `[premier contenu, pierre]` + la borne donnent
--      exactement la borne 0102 (prouvé en 0041, inchangé). Pour un actif sans
--      absence, la fenêtre ouverte couvre tout depuis le premier contenu et
--      la branche antériorité couvre le reste : lecture totale, comme avant.
--   4. Trois déclencheurs AFTER sur le registre (même idiome que
--      0101/0103/0104) : ouverture à l'insertion (`now()`, début de
--      transaction — les lignes fondées dans la même transaction portent le
--      même `now()` et restent couvertes par l'égalité `<=`), fermeture au
--      départ (`NEW.left_at`, la pierre — l'annonce née à la pierre y est
--      incluse par `<=`, comme en 0102), ouverture au dé-partir (`now()` :
--      tout creux validé lui est antérieur, toute annonce née au retour lui
--      est postérieure ou égale — aucun ordre de déclencheurs requis),
--      fermeture au retrait dur (`clock_timestamp()` ; le nettoyage d'une
--      pierre n'a aucune fenêtre ouverte : sans effet, muet conservé).
--      Idempotent sans bruit (re-départ, réécriture sans transition).
--   5. Remblai : une fenêtre ouverte par membre actif (depuis le premier
--      contenu connaissable : `min(messages.created_at)`, sinon
--      `conversations.created_at`), une fenêtre fermée
--      `[least(premier contenu, pierre), pierre]` par ligne tombée. Les
--      membres ré-ajoutés AVANT ce changement gardent donc l'historique
--      complet par construction — leur creux est inconnaissable (aucune
--      période ne l'a enregistré) et n'est PAS reconstruit : documenté ici et
--      en 08-08-SUMMARY, pas tu.
--
-- Portée conservée : retraits des archives aveugles, annonces et ventilateur
-- push intacts (les lignes système n'entrent ni en file ni en non-lus),
-- écritures exigent toujours l'actif, voie historique (suppression de pierre
-- puis ré-insertion) intacte : la ré-insertion ouvre une fenêtre neuve et
-- annonce via 0103, le creux (pierre, ré-insertion] reste caché.

begin;

-- ---------------------------------------------------------------------------
-- Fenêtres de présence : vérité serveur, jamais revendiquée par un client.
-- ---------------------------------------------------------------------------
create table public.conversation_membership_periods (
  id text primary key default private.new_id('membership-period'),
  conversation_id text not null references public.conversations (id) on delete cascade,
  member_id text not null references public.household_members (id) on delete cascade,
  joined_at timestamptz not null,
  left_at timestamptz,
  constraint membership_period_window_check check (left_at is null or left_at >= joined_at)
);

comment on table public.conversation_membership_periods is
  'Historique de présence par appartenance (D-13) : une fenêtre [joined_at, left_at] par période de présence, sortie nulle si présent. Entretenu par déclencheurs seuls ; aucune lecture ni écriture cliente.';
comment on column public.conversation_membership_periods.joined_at is
  'Entrée en présence : insertion (now(), début de transaction) ou dé-partir. Antérieure à tout creux validé.';
comment on column public.conversation_membership_periods.left_at is
  'Sortie de présence : pierre (départ) ou retrait dur. Nulle = fenêtre ouverte.';

alter table public.conversation_membership_periods enable row level security;

-- Aucune politique n'existe sur cette table : on verrouille aussi les GRANT
-- (précédent household_invite_tokens, 0009 — les privilèges par défaut y
-- auraient accordé CRUD à `authenticated`).
revoke all on table public.conversation_membership_periods from anon, authenticated;
revoke all on table public.conversation_membership_periods from public;
grant all on table public.conversation_membership_periods to service_role;

-- ---------------------------------------------------------------------------
-- Couverture de présence : une fenêtre couvre, ou le message précède toute
-- présence enregistrée (ajout tardif 0103 et contenus antidatés conservés).
-- ---------------------------------------------------------------------------
create or replace function private.in_membership_presence(p_conversation_id text, p_member_id text, p_created_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.conversation_membership_periods pp
     where pp.conversation_id = p_conversation_id
       and pp.member_id = p_member_id
       and pp.joined_at <= p_created_at
       and (pp.left_at is null or p_created_at <= pp.left_at)
  ) or p_created_at < (
    select min(pp.joined_at)
      from public.conversation_membership_periods pp
     where pp.conversation_id = p_conversation_id
       and pp.member_id = p_member_id
  );
$$;

comment on function private.in_membership_presence(text, text, timestamptz) is
  'Couverture de présence (D-13) : une fenêtre [joined_at, left_at] couvre le message, ou le message précède toute présence enregistrée (ajout tardif, antidatés — jamais un creux, postérieur à la première entrée par construction).';

-- GRANT explicite : un `CREATE OR REPLACE` conserve les privilèges existants
-- et ne répare donc pas une révocation antérieure (même idiome que
-- `can_read_message` en 0102).
grant execute on function private.in_membership_presence(text, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- D-13 : la borne pierre 0102 reste pour les tombés, la couverture s'ajoute
-- pour tous. Forme retenue : les champs du membre en ARGUMENTS du prédicat
-- (même idiome anti-ambiguïté que les portes 0102 : aucun nom non qualifié
-- ne concurrence la ligne de `messages`).
-- ---------------------------------------------------------------------------
create or replace function private.can_read_message(p_conversation_id text, p_created_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.conversation_members cm
      join public.conversations c on c.id = cm.conversation_id
     where cm.conversation_id = p_conversation_id
       and cm.member_id = private.current_member_id(c.household_id)
       and (cm.left_at is null or p_created_at <= cm.left_at)
       and private.in_membership_presence(cm.conversation_id, cm.member_id, p_created_at)
  );
$$;

comment on function private.can_read_message(text, timestamptz) is
  'Porte de lecture des messages (D-10 + D-13) : actif = fenêtres de présence (creux cachés), tombé = jusqu''à sa pierre (0102, inchangée) ET couvert par sa fenêtre fermée — évalué serveur par ligne.';

grant execute on function private.can_read_message(text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Entretien des fenêtres : insertions, départs, retours, retraits.
-- ---------------------------------------------------------------------------
create or replace function private.track_membership_period_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- `now()` (début de transaction), pas l'horloge d'instruction : les lignes
  -- du fil fondées dans la même transaction portent le même `now()` et
  -- restent couvertes par l'égalité `<=`. Insertion déjà tombée (cas limite,
  -- la politique d'insertion ne l'interdit pas) : la fenêtre s'ouvre au plus
  -- tard à la pierre, pour ne jamais violer `membership_period_window_check`.
  insert into public.conversation_membership_periods (id, conversation_id, member_id, joined_at, left_at)
  values (private.new_id('membership-period'), new.conversation_id, new.member_id,
          least(now(), coalesce(new.left_at, now())), new.left_at);
  return new;
end;
$$;

comment on function private.track_membership_period_on_insert() is
  'Ouvre une fenêtre de présence à chaque ajout (D-13), au début de transaction ; insertion déjà tombée : fenêtre réduite à la pierre.';

create or replace function private.track_membership_period_on_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.left_at is null and new.left_at is not null then
    -- Départ : la fenêtre ouverte se ferme à la pierre (l'annonce née à la
    -- pierre y est incluse par `<=`, comme en 0102).
    update public.conversation_membership_periods pp
       set left_at = new.left_at
     where pp.conversation_id = new.conversation_id
       and pp.member_id = new.member_id
       and pp.left_at is null;
  elsif old.left_at is not null and new.left_at is null then
    -- Retour : une fenêtre neuve s'ouvre au début de transaction — tout creux
    -- validé lui est antérieur, toute annonce née au retour lui est
    -- postérieure ou égale, sans dépendre de l'ordre des déclencheurs.
    insert into public.conversation_membership_periods (id, conversation_id, member_id, joined_at, left_at)
    values (private.new_id('membership-period'), new.conversation_id, new.member_id, now(), null);
  end if;
  return new;
end;
$$;

comment on function private.track_membership_period_on_update() is
  'Ferme la fenêtre ouverte au départ (à la pierre), ouvre une fenêtre neuve au dé-partir (D-13) ; muet sur re-départ et réécriture sans transition.';

create or replace function private.track_membership_period_on_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Retrait des archives (pierre, aucune fenêtre ouverte) : sans effet, muet
  -- conservé. Retrait dur d'un actif : la fenêtre ouverte se ferme à l'instant
  -- du retrait. Suppression du fil en cascade : les fenêtres partent avec lui
  -- (clé étrangère), la mise à jour ne touche alors rien, sans erreur.
  update public.conversation_membership_periods pp
     set left_at = clock_timestamp()
   where pp.conversation_id = old.conversation_id
     and pp.member_id = old.member_id
     and pp.left_at is null;
  return old;
end;
$$;

comment on function private.track_membership_period_on_delete() is
  'Ferme la fenêtre ouverte au retrait dur (D-13) ; sans effet au nettoyage d''une pierre ni à la suppression du fil en cascade.';

drop trigger if exists track_membership_period_insert on public.conversation_members;
create trigger track_membership_period_insert
  after insert on public.conversation_members
  for each row execute function private.track_membership_period_on_insert();

drop trigger if exists track_membership_period_update on public.conversation_members;
create trigger track_membership_period_update
  after update of left_at on public.conversation_members
  for each row execute function private.track_membership_period_on_update();

drop trigger if exists track_membership_period_delete on public.conversation_members;
create trigger track_membership_period_delete
  after delete on public.conversation_members
  for each row execute function private.track_membership_period_on_delete();

revoke all on function private.track_membership_period_on_insert() from public, anon, authenticated;
revoke all on function private.track_membership_period_on_update() from public, anon, authenticated;
revoke all on function private.track_membership_period_on_delete() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Remblai : une fenêtre par appartenance existante, depuis le premier contenu
-- connaissable. Les ré-ajoutés d'avant le changement (actifs aujourd'hui)
-- obtiennent une fenêtre ouverte couvrant tout : historique complet par
-- construction, creux inconnaissable non reconstruit (voir l'en-tête).
-- ---------------------------------------------------------------------------
insert into public.conversation_membership_periods (id, conversation_id, member_id, joined_at, left_at)
select private.new_id('membership-period'), cm.conversation_id, cm.member_id,
       coalesce((select min(m.created_at) from public.messages m where m.conversation_id = cm.conversation_id), c.created_at),
       null
  from public.conversation_members cm
  join public.conversations c on c.id = cm.conversation_id
 where cm.left_at is null;

insert into public.conversation_membership_periods (id, conversation_id, member_id, joined_at, left_at)
select private.new_id('membership-period'), cm.conversation_id, cm.member_id,
       least(coalesce((select min(m.created_at) from public.messages m where m.conversation_id = cm.conversation_id), c.created_at), cm.left_at),
       cm.left_at
  from public.conversation_members cm
  join public.conversations c on c.id = cm.conversation_id
 where cm.left_at is not null;

-- ---------------------------------------------------------------------------
-- Garde-fous permanents (précédent 0016, 0035, 0041, 0100) : aucun accès
-- client aux périodes, y compris en lecture directe.
-- ---------------------------------------------------------------------------
do $$
begin
  if has_table_privilege('anon', 'public.conversation_membership_periods', 'SELECT') then
    raise exception 'anon ne doit rien lire des periodes de presence';
  end if;
  if has_table_privilege('authenticated', 'public.conversation_membership_periods', 'SELECT') then
    raise exception 'authenticated ne doit rien lire des periodes de presence en direct';
  end if;
  if has_table_privilege('authenticated', 'public.conversation_membership_periods', 'INSERT') then
    raise exception 'authenticated ne doit pas forger de periode de presence';
  end if;
  if has_table_privilege('authenticated', 'public.conversation_membership_periods', 'UPDATE') then
    raise exception 'authenticated ne doit pas reecrire de periode de presence';
  end if;
  if has_table_privilege('authenticated', 'public.conversation_membership_periods', 'DELETE') then
    raise exception 'authenticated ne doit pas effacer de periode de presence';
  end if;
end;
$$;

commit;
