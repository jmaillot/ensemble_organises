-- 0024_dispatch_predicat.sql
-- Le dispatch des rappels était inerte par construction.
--
-- POURQUOI UNE NOUVELLE MIGRATION
--   0019 est appliquée et ne sera pas réécrite. Le défaut n'est apparu qu'au
--   premier envoi réel, sur le serveur.
--
-- LE DÉFAUT : `to_regclass` SUR UNE FONCTION
--   `private.post_push_dispatch()` commence par :
--
--     if to_regclass('net.http_post') is null or … then
--       raise notice 'pg_net ou Vault absent…'; return false;
--
--   `to_regclass` résout les RELATIONS — tables, vues, index, séquences, types
--   composites. `net.http_post` est une FONCTION : le prédicat renvoyait `NULL`
--   même pg_net entièrement installé, et le garde-fou court-circuitait donc
--   toujours. `dispatched` valait `false` en permanence, quel que soit l'état
--   de la stack.
--
--   Vérifié sur le serveur, en une requête :
--
--     to_regclass('net.http_post')  → NULL
--     to_regproc('net.http_post')   → net.http_post
--     pg_net installée              → true
--
--   C'est-à-dire que pg_net était là, correctement installée, et que seule la
--   question posée au catalogue était fausse. `to_regproc` est le bon prédicat
--   pour une fonction ; `vault.decrypted_secrets` est une VUE, et `to_regclass`
--   y reste correct.
--
-- CE QUE CELA PRODUISAIT
--   Aucun rappel de tâche, d'événement ou de routine n'a jamais été distribué,
--   et aucun anniversaire annoncé. Le chemin « Envoyer un test » fonctionnait,
--   car il appelle `push-notify` directement et ne passe pas par ce dispatch :
--   c'est ce qui a masqué la panne, et c'est aussi pour cela que `0007_push.sql`
--   n'a rien vu — le fichier évite explicitement le chemin peuplé.
--
-- MESSAGES DISTINCTS
--   « pg_net ou Vault absent » obligeait à trancher entre deux causes sans
--   instrument. Les deux sont désormais vérifiées séparément et nommées, parce
--   qu'un diagnostic qui demande de deviner est un diagnostic raté. Le niveau
--   passe de `notice` à `warning` : un dispatch définitivement inerte ne doit
--   pas passer inaperçu dans le journal d'un job.
--
-- AUCUNE EXTENSION À CRÉER
--   pg_net est déjà installée sur cette instance. La correction est donc
--   entièrement SQL, et `0004_cron.sql` gagne une assertion de contrat sur le
--   TYPE du prédicat — vérifiable sans environment, contrairement à une
--   assertion « pg_net est installée », qui ne serait vraie que chez vous.

begin;

create or replace function private.post_push_dispatch(p_scope text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
begin
  -- Une FONCTION se demande au catalogue avec `to_regproc`. `to_regclass` ne
  -- connaît que les relations et répond `NULL` devant `net.http_post`, même
  -- pg_net installée : le dispatch était alors inerte en permanence.
  if to_regproc('net.http_post') is null then
    raise warning 'pg_net absent (net.http_post introuvable) : aucun envoi ne partira, et les rappels seront calculés pour rien.';
    return false;
  end if;

  -- Une VUE se demande avec `to_regclass`, qui reste donc le bon prédicat ici.
  if to_regclass('vault.decrypted_secrets') is null then
    raise warning 'Vault absent (vault.decrypted_secrets introuvable) : aucun envoi ne partira, et les rappels seront calculés pour rien.';
    return false;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'service_role_key';

  if v_url is null or v_key is null then
    raise warning 'Secrets Vault project_url / service_role_key absents : envoi ignoré.';
    return false;
  end if;

  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/push-notify',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object('scope', p_scope),
    timeout_milliseconds := 30000
  );

  return true;
end;
$$;

comment on function private.post_push_dispatch(text) is
  'Lit ses secrets dans Vault et POSTE vers functions/v1/push-notify. false si la stack ne peut pas envoyer.';

-- ---------------------------------------------------------------------------
-- Privilèges — inchangés depuis 0019.
-- ---------------------------------------------------------------------------
revoke all on function private.post_push_dispatch(text) from public, anon, authenticated;
grant execute on function private.post_push_dispatch(text) to service_role;

commit;
