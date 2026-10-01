-- supabase/tests/0015_notification_reads.sql
-- États de lecture synchronisés (migration 0046) : chaque ligne appartient à
-- son propriétaire, en lecture comme en écriture. Aucun foyer en jeu : le
-- rattachement se fait par l'objet lu.

begin;

do $$
declare
  alice uuid := testkit.auth_user('nr-alice@example.fr', 'Alice Martin');
  bob uuid := testkit.auth_user('nr-bob@example.fr', 'Bob Martin');
begin
  insert into testkit.fx (key, user_id) values ('alice', alice), ('bob', bob);
end;
$$;

-- Alice : écrit, relit, met à jour sa ligne.
select testkit.as_user(user_id, 'nr-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'insert into public.notification_reads (id, user_id, scope, scope_id, read_at)'
  ' values (%L, %L, %L, %L, now())',
  'nr-1', (select user_id from testkit.fx where key = 'alice'), 'conversation', 'conv-a')), 1::bigint,
  'un utilisateur enregistre la lecture de sa conversation');

select testkit.eq(
  (select count(*) from public.notification_reads),
  1::bigint, 'il relit sa propre ligne');

select testkit.eq(testkit.affected(
  'update public.notification_reads set read_at = now() where id = ''nr-1'''),
  1::bigint, 'il avance son horodatage de lecture');

-- Unicité : une seule ligne par (utilisateur, portée, objet).
select testkit.expect_denied(format(
  'insert into public.notification_reads (id, user_id, scope, scope_id)'
  ' values (%L, %L, %L, %L)',
  'nr-2', (select user_id from testkit.fx where key = 'alice'), 'conversation', 'conv-a'),
  'pas de doublon de lecture pour le même objet');

-- Portée fermée : seules les portées du centre existent.
select testkit.expect_denied(format(
  'insert into public.notification_reads (id, user_id, scope, scope_id)'
  ' values (%L, %L, %L, %L)',
  'nr-3', (select user_id from testkit.fx where key = 'alice'), 'facture', 'x'),
  'une portée inconnue est refusée par la contrainte');

reset role;

-- Bob : ne voit ni ne touche la ligne d'Alice, même en forgeant son user_id.
select testkit.as_user(user_id, 'nr-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(
  (select count(*) from public.notification_reads),
  0::bigint, 'un autre utilisateur ne lit aucune ligne d’autrui');

select testkit.expect_denied(format(
  'insert into public.notification_reads (id, user_id, scope, scope_id)'
  ' values (%L, %L, %L, %L)',
  'nr-4', (select user_id from testkit.fx where key = 'alice'), 'conversation', 'conv-a'),
  'impossible d’écrire une ligne au nom d’autrui');

select testkit.eq(testkit.affected(
  'update public.notification_reads set read_at = now() where id = ''nr-1'''),
  0::bigint, 'impossible de toucher l’horodatage d’autrui');

select testkit.eq(testkit.affected(
  'delete from public.notification_reads where id = ''nr-1'''),
  0::bigint, 'impossible de supprimer la ligne d’autrui');

-- En revanche Bob tient son propre registre.
select testkit.eq(testkit.affected(format(
  'insert into public.notification_reads (id, user_id, scope, scope_id)'
  ' values (%L, %L, %L, %L)',
  'nr-5', (select user_id from testkit.fx where key = 'bob'), 'post', 'post-a')), 1::bigint,
  'chaque utilisateur tient son propre registre');

reset role;

-- La ligne d'Alice a survécu aux tentatives de Bob.
select testkit.eq(
  (select count(*) from public.notification_reads where id = 'nr-1'),
  1::bigint, 'la ligne du propriétaire est intacte');

rollback;
