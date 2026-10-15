-- supabase/tests/0122_dashboard_widget_width.sql
-- Widgets de l'accueil (migration correctrice 0123) : masquer un widget s'encode
-- par `width = 0` côté client (`modules/dashboard/hooks/use-dashboard.ts:134,147`)
-- et la lecture considère `visible = width > 0` (`modules/dashboard/types.ts:64`).
-- La colonne portait `check (width between 1 and 4)` (0004_tables_shared.sql) :
-- en mode Supabase, « masquer » levait 23514, la mise à jour échouait sans
-- message et le widget revenait au rechargement (CR-01). 0123 assouplit la
-- SEULE borne basse ; l'échelle 0..4 doit rester bornée.
--
-- PREUVE ROUGE : exécuté contre le schéma d'avant 0123, ce fichier échoue sur
-- (a) — c'est la preuve que le test regarde bien quelque chose. Ce même
-- scénario passait en CI parce que les tests Vitest tournent en mode démo
-- (Dexie/IndexedDB), qui n'implémente ni `CHECK` ni RLS.
--
-- Bornes (AGENTS.md §2.7D) : chaque lecture cible une ligne par identifiant,
-- jamais un comptage global. Fixtures en rôle d'administration ; assertions
-- sous `authenticated`, comme PostgREST. Fichier autonome, `rollback` final.

begin;

do $$
declare
  alice uuid := testkit.auth_user('t22-alice@example.fr', 'Alice Widgets');
  home text := testkit.household(alice, 'Foyer Widgets');
  alice_m text;
begin
  alice_m := testkit.member(home, alice, 'Alice Widgets', 'admin', 'accent');
  insert into testkit.fx (key, user_id) values ('alice', alice);
  insert into testkit.fx (key, household_id) values ('home', home);
  insert into testkit.fx (key, row_id) values ('alice_m', alice_m);
end;
$$;

-- Les écritures passent par `authenticated`, comme PostgREST les exécuterait.
select testkit.as_user(user_id, 't22-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

do $$
declare
  home text;
  alice_m text;
begin
  select household_id into home from testkit.fx where key = 'home';
  select row_id into alice_m from testkit.fx where key = 'alice_m';

  -- (a) `width = 0` EST l'encodage de « widget masqué » : il doit être accepté.
  --     Avant 0123, cette insertion levait 23514 — c'est la preuve rouge.
  insert into public.dashboard_widgets
    (id, member_id, household_id, widget_type, position_x, position_y, width, height)
  values ('widget_t22_masque', alice_m, home, 'taches', 1, 0, 0, 1);
  perform testkit.eq(
    (select width from public.dashboard_widgets where id = 'widget_t22_masque'),
    0,
    'width = 0 (widget masqué) est accepté');

  -- (c) la largeur par défaut (1) et la borne haute (4) restent acceptées.
  insert into public.dashboard_widgets
    (id, member_id, household_id, widget_type, position_x, position_y, width, height)
  values ('widget_t22_defaut', alice_m, home, 'calendrier', 2, 0, 1, 1);
  insert into public.dashboard_widgets
    (id, member_id, household_id, widget_type, position_x, position_y, width, height)
  values ('widget_t22_large', alice_m, home, 'routines', 3, 0, 4, 1);
  perform testkit.eq(
    (select width from public.dashboard_widgets where id = 'widget_t22_large'),
    4,
    'la borne haute 4 reste acceptée');

  -- (b) l'échelle reste bornée : `width = 5` est toujours refusé, code 23514.
  begin
    insert into public.dashboard_widgets
      (id, member_id, household_id, widget_type, position_x, position_y, width, height)
    values ('widget_t22_trop_large', alice_m, home, 'meteo', 4, 0, 5, 1);
    perform testkit.ok(false, 'width = 5 aurait dû lever 23514');
  exception when check_violation then
    perform testkit.ok(true, 'width = 5 refusé (23514) : l''échelle 0..4 reste bornée');
  end;
  perform testkit.eq(
    testkit.count('select 1 from public.dashboard_widgets where id = ''widget_t22_trop_large'''),
    0::bigint,
    'la ligne refusée n''a pas été écrite');
end;
$$;

reset role;

rollback;
