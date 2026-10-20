-- supabase/tests/0131_member_archive.sql
-- Gestes personnels du membre (migration 0131) : archiver pour soi, écrire
-- pour revenir, réadhérer sans hériter de l'archive, supprimer sa ligne.
--
-- Ce que la migration promet, et qui se vérifie ici :
--   * l'archive ne touche que MA ligne — les autres ne voient rien changer ;
--   * elle est idempotente, et un fil archivé ne pousse plus (ni cloche ni push) ;
--   * écrire désarchive, y compris par le trigger, pas seulement par le RPC ;
--   * une réadhésion repart propre (pas d'archive héritée du passage précédent) ;
--   * « supprimer pour moi » efface ma ligne quel que soit son état, sans rien
--     retirer aux autres ;
--   * un non-membre du fil ne peut pas archiver.

begin;

do $$
declare
  alice uuid := testkit.auth_user('arch-alice@example.fr', 'Alice Archive');
  bob uuid := testkit.auth_user('arch-bob@example.fr', 'Bob Archive');
  carol uuid := testkit.auth_user('arch-carol@example.fr', 'Carol Archive');
  outsider uuid := testkit.auth_user('arch-out@example.fr', 'Olga Archive');
  home text := testkit.household(alice, 'Foyer Archive');
  alice_m text;
  bob_m text;
  carol_m text;
  conv text := private.new_id('conversation');
begin
  alice_m := testkit.member(home, alice, 'Alice Archive', 'admin', 'accent');
  bob_m := testkit.member(home, bob, 'Bob Archive', 'membre', 'ink');
  carol_m := testkit.member(home, carol, 'Carol Archive', 'membre', 'amber');
  -- Olga est du foyer mais pas du fil : c'est la garde du geste personnel.
  perform testkit.member(home, outsider, 'Olga Archive', 'membre', 'violet');

  insert into testkit.fx (key, user_id) values
    ('alice', alice), ('bob', bob), ('carol', carol), ('outsider', outsider);
  insert into testkit.fx (key, row_id) values
    ('conv', conv), ('alice_m', alice_m), ('bob_m', bob_m), ('carol_m', carol_m);

  insert into public.conversations (id, household_id, type, title)
  values (conv, home, 'groupe', 'Salon');
  insert into public.conversation_members (conversation_id, member_id)
  values (conv, alice_m), (conv, bob_m), (conv, carol_m);
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Archiver pour soi : la marque tombe sur MA ligne, et sur elle seule.
-- ---------------------------------------------------------------------------
select testkit.as_user((select user_id from testkit.fx where key = 'bob'), 'arch-bob@example.fr');
set local role authenticated;
select testkit.eq(
  (public.archive_conversation_for_me((select row_id from testkit.fx where key = 'conv')) ->> 'member_id'),
  (select row_id from testkit.fx where key = 'bob_m'),
  'l''archive vise la ligne de l''appelant, pas une ligne choisie par le client');
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

select testkit.eq(
  (select count(*) from public.conversation_members
    where conversation_id = (select row_id from testkit.fx where key = 'conv')
      and member_id = (select row_id from testkit.fx where key = 'bob_m')
      and archived_at is not null),
  1::bigint, 'Bob est archivé');
select testkit.eq(
  (select count(*) from public.conversation_members
    where conversation_id = (select row_id from testkit.fx where key = 'conv')
      and archived_at is null),
  2::bigint, 'Alice et Carol ne sont pas archivées : l''archive est personnelle');

create temporary table arch_mark on commit drop as
select archived_at
  from public.conversation_members
 where conversation_id = (select row_id from testkit.fx where key = 'conv')
   and member_id = (select row_id from testkit.fx where key = 'bob_m');

-- ---------------------------------------------------------------------------
-- 2. Idempotence : réarchiver ne repousse pas la date.
-- ---------------------------------------------------------------------------
select testkit.as_user((select user_id from testkit.fx where key = 'bob'), 'arch-bob@example.fr');
set local role authenticated;
select public.archive_conversation_for_me((select row_id from testkit.fx where key = 'conv'));
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

select testkit.eq(
  (select archived_at from public.conversation_members
    where conversation_id = (select row_id from testkit.fx where key = 'conv')
      and member_id = (select row_id from testkit.fx where key = 'bob_m')),
  (select archived_at from arch_mark),
  'la seconde archive conserve la date de la première');

-- ---------------------------------------------------------------------------
-- 3. Un fil archivé ne pousse plus — et le contrôle positif vient d'abord,
--    sinon l'assertion suivante serait vraie pour n'importe quelle raison.
--    Insertion en superutilisateur : le sujet est le ventilateur, pas la
--    politique d'écriture des messages. L'identifiant est gardé : les
--    assertions de la section 8 comptent MES deux messages, pas le fil entier,
--    qui porte aussi les messages système de sa création.
-- ---------------------------------------------------------------------------
with inserted as (
  insert into public.messages (conversation_id, household_id, sender_id, content)
  select (select row_id from testkit.fx where key = 'conv'),
         (select household_id from public.conversations
           where id = (select row_id from testkit.fx where key = 'conv')),
         (select row_id from testkit.fx where key = 'alice_m'),
         'Message pendant l''archive de Bob'
  returning id
)
insert into testkit.fx (key, row_id) select 'msg1', id from inserted;

select testkit.eq(
  (select count(*) from private.push_message_notifications(now()) n
    where n.user_id = (select user_id from testkit.fx where key = 'carol')),
  1::bigint, 'Carol, non archivée, reste destinataire');
select testkit.eq(
  (select count(*) from private.push_message_notifications(now()) n
    where n.user_id = (select user_id from testkit.fx where key = 'bob')),
  0::bigint, 'Bob, archivé, n''est plus destinataire');

-- ---------------------------------------------------------------------------
-- 4. Écrire désarchive : le trigger, pas le RPC, ramène le fil.
-- ---------------------------------------------------------------------------
with inserted as (
  insert into public.messages (conversation_id, household_id, sender_id, content)
  select (select row_id from testkit.fx where key = 'conv'),
         (select household_id from public.conversations
           where id = (select row_id from testkit.fx where key = 'conv')),
         (select row_id from testkit.fx where key = 'bob_m'),
         'Je réponds, donc je reviens'
  returning id
)
insert into testkit.fx (key, row_id) select 'msg2', id from inserted;

select testkit.eq(
  (select count(*) from public.conversation_members
    where conversation_id = (select row_id from testkit.fx where key = 'conv')
      and member_id = (select row_id from testkit.fx where key = 'bob_m')
      and archived_at is null),
  1::bigint, 'un message de Bob lève sa propre archive');

-- ---------------------------------------------------------------------------
-- 5. Désarchiver par le geste explicite.
-- ---------------------------------------------------------------------------
select testkit.as_user((select user_id from testkit.fx where key = 'bob'), 'arch-bob@example.fr');
set local role authenticated;
select public.archive_conversation_for_me((select row_id from testkit.fx where key = 'conv'));
select public.unarchive_conversation_for_me((select row_id from testkit.fx where key = 'conv'));
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

select testkit.eq(
  (select count(*) from public.conversation_members
    where conversation_id = (select row_id from testkit.fx where key = 'conv')
      and member_id = (select row_id from testkit.fx where key = 'bob_m')
      and archived_at is null),
  1::bigint, 'le désarchivage explicite lève la marque');

-- ---------------------------------------------------------------------------
-- 6. Réadhésion : la pierre tombale n'efface pas l'archive, le retour si.
-- ---------------------------------------------------------------------------
select testkit.as_user((select user_id from testkit.fx where key = 'bob'), 'arch-bob@example.fr');
set local role authenticated;
select public.archive_conversation_for_me((select row_id from testkit.fx where key = 'conv'));
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

update public.conversation_members
   set left_at = now()
 where conversation_id = (select row_id from testkit.fx where key = 'conv')
   and member_id = (select row_id from testkit.fx where key = 'bob_m');

select testkit.eq(
  (select count(*) from public.conversation_members
    where conversation_id = (select row_id from testkit.fx where key = 'conv')
      and member_id = (select row_id from testkit.fx where key = 'bob_m')
      and archived_at is not null),
  1::bigint, 'le départ laisse l''archive en place');

update public.conversation_members
   set left_at = null
 where conversation_id = (select row_id from testkit.fx where key = 'conv')
   and member_id = (select row_id from testkit.fx where key = 'bob_m');

select testkit.eq(
  (select count(*) from public.conversation_members
    where conversation_id = (select row_id from testkit.fx where key = 'conv')
      and member_id = (select row_id from testkit.fx where key = 'bob_m')
      and archived_at is null),
  1::bigint, 'un revenant n''hérite pas de l''archive de son passage précédent');

-- ---------------------------------------------------------------------------
-- 7. Garde : une personne du foyer qui n'est pas du fil ne peut pas archiver.
-- ---------------------------------------------------------------------------
select testkit.as_user((select user_id from testkit.fx where key = 'outsider'), 'arch-out@example.fr');
set local role authenticated;
select testkit.expect_denied(
  format('select public.archive_conversation_for_me(%L)',
    (select row_id from testkit.fx where key = 'conv')),
  'un non-membre du fil ne peut pas archiver');
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

-- ---------------------------------------------------------------------------
-- 8. Supprimer pour soi : ma ligne part, celle des autres reste, et les
--    messages du fil aussi.
-- ---------------------------------------------------------------------------
select testkit.as_user((select user_id from testkit.fx where key = 'bob'), 'arch-bob@example.fr');
set local role authenticated;
select testkit.eq(
  ((public.delete_conversation_for_me((select row_id from testkit.fx where key = 'conv'))) ->> 'deleted')::integer,
  1, 'la suppression emporte exactement ma ligne');
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

select testkit.eq(
  (select count(*) from public.conversation_members
    where conversation_id = (select row_id from testkit.fx where key = 'conv')
      and member_id = (select row_id from testkit.fx where key = 'bob_m')),
  0::bigint, 'la ligne de Bob a disparu');
select testkit.eq(
  (select count(*) from public.conversation_members
    where conversation_id = (select row_id from testkit.fx where key = 'conv')),
  2::bigint, 'Alice et Carol gardent la leur');
select testkit.eq(
  (select count(*) from public.messages
    where id in ((select row_id from testkit.fx where key = 'msg1'),
                 (select row_id from testkit.fx where key = 'msg2'))),
  2::bigint, 'les deux messages du fil sont intacts');

-- ---------------------------------------------------------------------------
-- 9. Le dernier membre peut supprimer : le fil lui devient invisible, sans
--    être effacé pour autant (personne ne le voit plus, la ligne demeure).
-- ---------------------------------------------------------------------------
do $$
declare
  alice_m text := (select row_id from testkit.fx where key = 'alice_m');
  conv2 text := private.new_id('conversation');
begin
  insert into testkit.fx (key, row_id) values ('conv2', conv2);
  insert into public.conversations (id, household_id, type, title)
  select conv2, household_id, 'groupe', 'Solo'
    from public.conversations
   where id = (select row_id from testkit.fx where key = 'conv');
  insert into public.conversation_members (conversation_id, member_id) values (conv2, alice_m);
end;
$$;

select testkit.as_user((select user_id from testkit.fx where key = 'alice'), 'arch-alice@example.fr');
set local role authenticated;
select testkit.eq(
  ((public.delete_conversation_for_me((select row_id from testkit.fx where key = 'conv2'))) ->> 'deleted')::integer,
  1, 'le dernier membre supprime sa ligne comme les autres');
select testkit.eq(
  (select count(*) from public.conversations where id = (select row_id from testkit.fx where key = 'conv2')),
  0::bigint, 'le fil n''est plus visible pour elle');
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

select testkit.eq(
  (select count(*) from public.conversation_members
    where conversation_id = (select row_id from testkit.fx where key = 'conv2')),
  0::bigint, 'et il ne reste aucune appartenance');

rollback;
