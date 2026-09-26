-- 0020_push_execution_fixes.sql
-- Corrige deux défauts que seule l'EXÉCUTION du code Web Push a révélés.
--
-- POURQUOI UNE NOUVELLE MIGRATION ET NON UNE CORRECTION DE 0018 / 0019
--   Les deux fichiers sont APPLIQUÉS sur la stack : c'est en les exécutant que
--   leurs défauts sont apparus. Les réécrire sur place romprait l'invariant qui
--   fait qu'une migration appliquée ne change plus, et la divergence resterait
--   invisible jusqu'au provisionnement d'une base neuve — où 0019 échouerait
--   de nouveau, sur la même erreur. On corrige donc vers l'avant, comme 0019
--   l'a fait pour 0012 sur le même point.
--
--   Un détail utile sur la manière dont ces défauts ont pu s'installer : les
--   deux sont ACCEPTÉS à la CRÉATION et refusés à l'APPEL. Ni `migrate.sh` ni
--   le test de contrat ne les voyaient, et aucun journal ne portait trace d'un
--   échec — les deux migrations étaient journalisées, doncjuguinement appliquées — dans les
--   deux cas, sans qu'aucun journal n'en garde trace.

begin;

-- ---------------------------------------------------------------------------
-- 1. Les deux dispatchs : une liste de colonnes sur un appel de fonction
--
--   from jsonb_array_elements(public.due_push_notifications('rappels'))
--     as n(notification jsonb)
--
-- `jsonb_array_elements` renvoie `setof jsonb`, pas `record`. PostgreSQL
-- n'accepte une liste de définitions de colonnes que sur une fonction
-- renvoyant `record`, et le dit à l'EXÉCUTION :
--
--   ERROR: a column definition list is only allowed for functions returning record
--
-- Les deux dispatchs sont donc infaillibles : le job quotidien n'aurait
-- rien distribué, et `private.dispatch_birthday_alerts()` — appelée directement
-- par `0004_cron.sql` et `0006_birthdays.sql` — refusait de s'exécuter.
--
-- La colonne de sortie de `jsonb_array_elements` s'appelle `value` : d'où
-- `n.value -> 'subscriptions'`, et aucun alias n'est nécessaire.
-- ---------------------------------------------------------------------------
create or replace function private.dispatch_push_notifications()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_due integer;
  v_sent boolean;
begin
  select count(*)::integer into v_due
    from jsonb_array_elements(public.due_push_notifications('rappels')) as n
   where jsonb_array_length(n.value -> 'subscriptions') > 0;

  if v_due = 0 then
    return jsonb_build_object('due', 0, 'dispatched', false, 'generated_at', now());
  end if;

  v_sent := private.post_push_dispatch('rappels');

  return jsonb_build_object('due', v_due, 'dispatched', v_sent, 'generated_at', now());
end;
$$;

comment on function private.dispatch_push_notifications() is
  'Rappels dus : n''appelle la fonction d''envoi que s''il y a des destinataires.';

create or replace function private.dispatch_birthday_alerts()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_due integer;
  v_sent boolean;
begin
  select count(*)::integer into v_due
    from jsonb_array_elements(public.due_push_notifications('anniversaires')) as n
   where jsonb_array_length(n.value -> 'subscriptions') > 0;

  if v_due = 0 then
    return jsonb_build_object('due', 0, 'dispatched', false, 'generated_at', now());
  end if;

  v_sent := private.post_push_dispatch('anniversaires');

  return jsonb_build_object('due', v_due, 'dispatched', v_sent, 'generated_at', now());
end;
$$;

comment on function private.dispatch_birthday_alerts() is
  'Anniversaires du jour : distribués si des membres sont abonnés.';

-- ---------------------------------------------------------------------------
-- 2. La contrainte d'endpoint : un quantificateur de répétition trop grand
--
--   check (endpoint ~ '^https://[^[:space:]]{8,2048}$')
--
-- PostgreSQL refuse un compte de répétition supérieur à 255, et ne le signale
-- qu'à l'INSERT :
--
--   ERROR: invalid regular expression: invalid repetition count(s)
--
-- La contrainte était donc créée sans erreur par 0018, vérifiée comme
-- présente par le test de contrat, et rendait TOUTE écriture d'abonnement
-- impossible — y compris le tout premier, donc la fonctionnalité entière.
--
-- La borne passe en `char_length`, qui exprime la même intention sans le
-- plafond du moteur d'expressions régulières. Le motif ne garde que ce qu'il
-- sait faire : le préfixe HTTPS et l'absence d'espace.
-- ---------------------------------------------------------------------------
alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_endpoint_https;

alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_https check (endpoint ~ '^https://[^[:space:]]+$'),
  add constraint push_subscriptions_endpoint_length
    check (char_length(endpoint) between 16 and 2048);

-- ---------------------------------------------------------------------------
-- Privilèges
--
-- `create or replace` recrée les ACL : l'EXECUTE par défaut de `PUBLIC` est
-- explicitement retiré, comme partout ailleurs. Une migration qui oublierait
-- cette section rendrait le dispatch appelable par un client.
-- ---------------------------------------------------------------------------
revoke all on function private.dispatch_push_notifications() from public, anon, authenticated;
revoke all on function private.dispatch_birthday_alerts() from public, anon, authenticated;

grant execute on function private.dispatch_push_notifications() to service_role;
grant execute on function private.dispatch_birthday_alerts() to service_role;

commit;
