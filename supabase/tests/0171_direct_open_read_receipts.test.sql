-- supabase/tests/0171_direct_open_read_receipts.test.sql
-- Tests du socle serveur messagerie v2 (phase 29, plan 29-01) :
--   * open_direct_conversation — garde anti-doublon D-05 (rouvrir si les deux
--     participations sont actives, recréer après un départ, pierre intacte),
--     rouverture d'un fil archivé (A1 : `archived_at` n'est pas une inactivité),
--     ciblage d'un profil enfant géré (D-04), refus inter-foyer (22023) ;
--   * conversation_read_receipts — refus d'un non-membre et d'un membre
--     parti (T-29-01), watermarks des co-membres actifs, read_at NULL quand
--     le co-membre n'a pas lu (MSG-03).
--
-- Toute assertion de comptage est bornée par foyer (§2.7 D.2) ; les fonctions
-- sont éprouvées par leur DÉFINITION EFFECTIVE exécutée, jamais par le texte
-- du fichier de migration (§2.7 D.6).

begin;

-- ---------------------------------------------------------------
-- Semis : foyer 171 (alice admin, bob, dave, un enfant géré)
--         et foyer externe (eve) pour les refus inter-foyer.
-- ---------------------------------------------------------------
do $$
declare
  u_alice uuid := testkit.auth_user('t171-alice@example.fr', 'Alice 171');
  u_bob   uuid := testkit.auth_user('t171-bob@example.fr', 'Bob 171');
  u_dave  uuid := testkit.auth_user('t171-dave@example.fr', 'Dave 171');
  u_eve   uuid := testkit.auth_user('t171-eve@example.fr', 'Eve 171');
  h  text := testkit.household(u_alice, 'Foyer 171');
  h2 text := testkit.household(u_eve, 'Foyer 171 externe');
begin
  insert into testkit.fx (key, user_id, household_id, row_id) values
    ('alice', u_alice, h, testkit.member(h, u_alice, 'Alice 171', 'admin', 'accent')),
    ('bob',   u_bob,   h, testkit.member(h, u_bob,   'Bob 171',   'membre', 'coral')),
    ('dave',  u_dave,  h, testkit.member(h, u_dave,  'Dave 171',  'membre', 'violet')),
    ('enfant', null,   h, testkit.member(h, null,    'Petit 171', 'enfant', 'amber')),
    ('eve',   u_eve,  h2, testkit.member(h2, u_eve, 'Eve 171', 'admin', 'ink'));

  -- D-06 : la fiche de l'enfant ouvre 'messages' (sinon ni la directe ni le
  -- groupe ne l'acceptent — garde 0146).
  update public.household_members
     set managed_modules = array['messages']
   where id = (select row_id from testkit.fx where key = 'enfant');
end;
$$;

-- ---------------------------------------------------------------
-- 1. Premier appel → created = true, exactement UNE directe de la paire.
--    Second appel → même fil, created = false, toujours UNE (MSG-01/D-05).
-- ---------------------------------------------------------------
do $$
declare
  alice text := (select row_id from testkit.fx where key = 'alice');
  bob   text := (select row_id from testkit.fx where key = 'bob');
  h     text := (select household_id from testkit.fx where key = 'alice');
  u_alice uuid := (select user_id from testkit.fx where key = 'alice');
  v_out jsonb;
  c1 text;
begin
  perform testkit.as_user(u_alice, 't171-alice@example.fr');
  set local role authenticated;

  select public.open_direct_conversation(bob) into v_out;
  perform testkit.ok((v_out ->> 'created')::boolean is true,
    'premier appel : la directe est créée (created = true)');
  c1 := v_out ->> 'id';
  perform testkit.ok(c1 is not null, 'premier appel : l''identifiant du fil est rendu');
  insert into testkit.fx (key, household_id, row_id) values ('c1', h, c1);

  perform testkit.eq(
    testkit.count(format('select 1 from public.conversations c where c.household_id = %L and c.type = ''direct'' and exists (select 1 from public.conversation_members a where a.conversation_id = c.id and a.member_id = %L) and exists (select 1 from public.conversation_members b where b.conversation_id = c.id and b.member_id = %L)', h, alice, bob)),
    1::bigint,
    'après le premier appel : exactement UNE directe de la paire dans le foyer');

  select public.open_direct_conversation(bob) into v_out;
  perform testkit.ok((v_out ->> 'created')::boolean is false,
    'second appel : le fil existant est ROUVERT (created = false)');
  perform testkit.eq(v_out ->> 'id', c1,
    'second appel : c''est le MÊME fil qui est rendu');
  perform testkit.eq(
    testkit.count(format('select 1 from public.conversations c where c.household_id = %L and c.type = ''direct'' and exists (select 1 from public.conversation_members a where a.conversation_id = c.id and a.member_id = %L) and exists (select 1 from public.conversation_members b where b.conversation_id = c.id and b.member_id = %L)', h, alice, bob)),
    1::bigint,
    'après le second appel : toujours UNE seule directe de la paire (aucun doublon)');
end;
$$;
reset role;

-- ---------------------------------------------------------------
-- 2. Départ (pierre tombale 0101) puis nouvel appel → NOUVELLE directe,
--    et la participation quittée garde son left_at (pierre intacte).
-- ---------------------------------------------------------------
do $$
declare
  u_alice uuid := (select user_id from testkit.fx where key = 'alice');
  u_bob   uuid := (select user_id from testkit.fx where key = 'bob');
  alice text := (select row_id from testkit.fx where key = 'alice');
  bob   text := (select row_id from testkit.fx where key = 'bob');
  h     text := (select household_id from testkit.fx where key = 'alice');
  c1    text := (select row_id from testkit.fx where key = 'c1');
  v_out jsonb;
  c2 text;
begin
  perform testkit.as_user(u_bob, 't171-bob@example.fr');
  set local role authenticated;
  perform public.leave_conversation(c1);
end;
$$;
reset role;

do $$
declare
  u_alice uuid := (select user_id from testkit.fx where key = 'alice');
  alice text := (select row_id from testkit.fx where key = 'alice');
  bob   text := (select row_id from testkit.fx where key = 'bob');
  h     text := (select household_id from testkit.fx where key = 'alice');
  c1    text := (select row_id from testkit.fx where key = 'c1');
  v_out jsonb;
  c2 text;
begin
  perform testkit.as_user(u_alice, 't171-alice@example.fr');
  set local role authenticated;

  select public.open_direct_conversation(bob) into v_out;
  perform testkit.ok((v_out ->> 'created')::boolean is true,
    'après le départ de bob : un NOUVEL appel crée une nouvelle directe');
  c2 := v_out ->> 'id';
  perform testkit.ok(c2 is distinct from c1,
    'la nouvelle directe n''est pas l''ancienne');
  insert into testkit.fx (key, household_id, row_id) values ('c2', h, c2);

  perform testkit.eq(
    testkit.count(format('select 1 from public.conversations c where c.household_id = %L and c.type = ''direct'' and exists (select 1 from public.conversation_members a where a.conversation_id = c.id and a.member_id = %L and a.left_at is null) and exists (select 1 from public.conversation_members b where b.conversation_id = c.id and b.member_id = %L and b.left_at is null)', h, alice, bob)),
    1::bigint,
    'une seule directe de la paire est ACTIVE (l''ancienne porte la pierre)');
  perform testkit.ok(exists (
      select 1 from public.conversation_members cm
       where cm.conversation_id = c1
         and cm.member_id = bob
         and cm.left_at is not null),
    'la pierre tombale de bob sur l''ancienne directe est INTACTE');
end;
$$;
reset role;

-- ---------------------------------------------------------------
-- 3. Fil archivé (0131) mais NON quitté → l'appel ROUVRE l'existant (A1).
-- ---------------------------------------------------------------
do $$
declare
  u_alice uuid := (select user_id from testkit.fx where key = 'alice');
  bob text := (select row_id from testkit.fx where key = 'bob');
  c2  text := (select row_id from testkit.fx where key = 'c2');
  v_out jsonb;
begin
  perform testkit.as_user(u_alice, 't171-alice@example.fr');
  set local role authenticated;

  perform public.archive_conversation_for_me(c2);
  select public.open_direct_conversation(bob) into v_out;
  perform testkit.ok((v_out ->> 'created')::boolean is false,
    'fil archivé non quitté : l''appel ROUVRE l''existant (archived_at n''est pas une inactivité, D-05/A1)');
  perform testkit.eq(v_out ->> 'id', c2,
    'la rouverture du fil archivé rend le MÊME identifiant');
end;
$$;
reset role;

-- ---------------------------------------------------------------
-- 4. Profil enfant géré (sans compte) : ciblage accepté (D-04).
-- ---------------------------------------------------------------
do $$
declare
  u_alice uuid := (select user_id from testkit.fx where key = 'alice');
  enfant text := (select row_id from testkit.fx where key = 'enfant');
  v_out jsonb;
begin
  perform testkit.as_user(u_alice, 't171-alice@example.fr');
  set local role authenticated;
  select public.open_direct_conversation(enfant) into v_out;
  perform testkit.ok((v_out ->> 'created')::boolean is true,
    'un profil enfant géré est un membre cible valide (D-04)');
end;
$$;
reset role;

-- ---------------------------------------------------------------
-- 5. Négatif : membre d'un AUTRE foyer → refus 22023 (T-29-01/D-04).
-- ---------------------------------------------------------------
do $$
declare
  u_eve uuid := (select user_id from testkit.fx where key = 'eve');
  bob text := (select row_id from testkit.fx where key = 'bob');
begin
  perform testkit.as_user(u_eve, 't171-eve@example.fr');
  set local role authenticated;
  perform testkit.expect_denied(
    format('select public.open_direct_conversation(%L)', bob),
    'ouvrir une directe avec un membre d''un autre foyer est refusé (22023)');
end;
$$;
reset role;

-- ---------------------------------------------------------------
-- 6. Accusés — refus d'un membre PARTI et d'un hors-foyer (T-29-01).
-- ---------------------------------------------------------------
do $$
declare
  u_bob uuid := (select user_id from testkit.fx where key = 'bob');
  u_eve uuid := (select user_id from testkit.fx where key = 'eve');
  c1 text := (select row_id from testkit.fx where key = 'c1');
  c2 text := (select row_id from testkit.fx where key = 'c2');
begin
  -- bob a QUITTÉ c1 : il ne peut plus en lire les accusés.
  perform testkit.as_user(u_bob, 't171-bob@example.fr');
  set local role authenticated;
  perform testkit.expect_denied(
    format('select * from public.conversation_read_receipts(%L)', c1),
    'un membre qui a quitté le fil ne peut pas lire ses accusés (42501)');
end;
$$;
reset role;

do $$
declare
  u_eve uuid := (select user_id from testkit.fx where key = 'eve');
  c2 text := (select row_id from testkit.fx where key = 'c2');
begin
  -- eve n'appartient pas au foyer du fil.
  perform testkit.as_user(u_eve, 't171-eve@example.fr');
  set local role authenticated;
  perform testkit.expect_denied(
    format('select * from public.conversation_read_receipts(%L)', c2),
    'un utilisateur hors foyer ne peut pas lire les accusés d''un fil (42501)');
end;
$$;
reset role;

-- ---------------------------------------------------------------
-- 7. Accusés — MSG-03 : watermarks des co-membres actifs d'un groupe ;
--    deux read_at semés, un co-membre sans watermark → read_at NULL ;
--    display_name et color_tag corrects ; l'appelant n'est pas dans la liste.
-- ---------------------------------------------------------------
do $$
declare
  u_bob uuid := (select user_id from testkit.fx where key = 'bob');
  alice text := (select row_id from testkit.fx where key = 'alice');
  bob   text := (select row_id from testkit.fx where key = 'bob');
  dave  text := (select row_id from testkit.fx where key = 'dave');
  enfant text := (select row_id from testkit.fx where key = 'enfant');
  h     text := (select household_id from testkit.fx where key = 'alice');
  g text;
begin
  perform testkit.as_user(u_bob, 't171-bob@example.fr');
  set local role authenticated;
  declare
    v_out jsonb;
  begin
    select public.create_conversation(h, 'groupe', 'Groupe 171',
             to_jsonb(array[alice, bob, dave, enfant])) into v_out;
    g := v_out ->> 'id';
  end;
  insert into testkit.fx (key, household_id, row_id) values ('g171', h, g);
end;
$$;
reset role;

-- Semure des watermarks : alice lit à 10:00, dave à 11:00, l'enfant jamais.
do $$
declare
  u_alice uuid := (select user_id from testkit.fx where key = 'alice');
  g text := (select row_id from testkit.fx where key = 'g171');
begin
  perform testkit.as_user(u_alice, 't171-alice@example.fr');
  set local role authenticated;
  insert into public.notification_reads (user_id, scope, scope_id, read_at)
  values (u_alice, 'conversation', g, '2026-10-29 10:00:00+00');
end;
$$;
reset role;

do $$
declare
  u_dave uuid := (select user_id from testkit.fx where key = 'dave');
  g text := (select row_id from testkit.fx where key = 'g171');
begin
  perform testkit.as_user(u_dave, 't171-dave@example.fr');
  set local role authenticated;
  insert into public.notification_reads (user_id, scope, scope_id, read_at)
  values (u_dave, 'conversation', g, '2026-10-29 11:00:00+00');
end;
$$;
reset role;

do $$
declare
  u_bob uuid := (select user_id from testkit.fx where key = 'bob');
  bob   text := (select row_id from testkit.fx where key = 'bob');
  alice text := (select row_id from testkit.fx where key = 'alice');
  dave  text := (select row_id from testkit.fx where key = 'dave');
  enfant text := (select row_id from testkit.fx where key = 'enfant');
  g     text := (select row_id from testkit.fx where key = 'g171');
  v_alice record;
  v_dave record;
  v_enfant record;
  v_count bigint;
begin
  perform testkit.as_user(u_bob, 't171-bob@example.fr');
  set local role authenticated;

  select count(*) into v_count from public.conversation_read_receipts(g);
  perform testkit.eq(v_count, 3::bigint,
    'MSG-03 : trois co-membres actifs rendus (l''appelant bob est exclu)');

  select * into v_alice from public.conversation_read_receipts(g) where member_id = alice;
  perform testkit.ok(v_alice.member_id is not null, 'alice figure parmi les accusés');
  perform testkit.eq(v_alice.read_at, '2026-10-29 10:00:00+00'::timestamptz,
    'MSG-03 : le watermark semé d''alice est rendu tel quel');
  perform testkit.eq(v_alice.display_name, 'Alice 171', 'MSG-03 : display_name correct (alice)');
  perform testkit.eq(v_alice.color_tag, 'accent', 'MSG-03 : color_tag correct (alice)');

  select * into v_dave from public.conversation_read_receipts(g) where member_id = dave;
  perform testkit.eq(v_dave.read_at, '2026-10-29 11:00:00+00'::timestamptz,
    'MSG-03 : le watermark semé de dave est rendu tel quel');
  perform testkit.eq(v_dave.color_tag, 'violet', 'MSG-03 : color_tag correct (dave)');

  select * into v_enfant from public.conversation_read_receipts(g) where member_id = enfant;
  perform testkit.ok(v_enfant.member_id is not null, 'l''enfant géré figure parmi les co-membres');
  perform testkit.ok(v_enfant.read_at is null,
    'MSG-03 : sans watermark, read_at est NULL (n''a pas lu — l''UI ne montre que les non-null)');
end;
$$;
reset role;

rollback;
