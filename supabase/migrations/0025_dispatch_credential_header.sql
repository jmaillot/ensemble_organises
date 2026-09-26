-- 0025_dispatch_credential_header.sql
-- Le dispatch envoyait la clé secrète comme un jeton Bearer, et se faisait
-- refuser.
--
-- POURQUOI UNE NOUVELLE MIGRATION
--   0024 est appliquée et ne sera pas réécrite. Le défaut n'apparaît qu'au
--   premier envoi RÉEL de la base vers l'Edge Function.
--
-- LE DÉFAUT : `Authorization: Bearer <clé sb_*>`
--   `post_push_dispatch()` posait :
--
--     headers := jsonb_build_object(
--       'content-type', 'application/json',
--       'authorization', 'Bearer ' || v_key
--     )
--
--   Or `push-notify` déclare `auth: ['secret', 'user']`, et `@supabase/server`
--   distingue les deux modes par l'EN-TÊTE, pas par la forme de la valeur :
--
--     * `secret` → la clé secrète dans l'en-tête `apikey` ;
--     * `user`   → un JWT de session dans `Authorization: Bearer`.
--
--   Une clé `sb_*` envoyée comme Bearer n'est pas une clé secrète : c'est un
--   JWT qui n'en est pas un. La réponse est sans appel :
--
--     401 UNUSABLE_CREDENTIAL
--     The request carried a credential this endpoint cannot use: the
--     Authorization header carried an sb_* API key, not a user JWT.
--     Accepted auth mode(s): "secret", "user".
--     received: { authorization: "api-key", apikey: "absent" }
--
--   Le corps de la fonction n'est même pas atteint : le refus vient du
--   framework, avant le handler. C'est pourquoi aucun log de la fonction
--   n'apparaissait, et pourquoi la file d'attente de `pg_net` se vidait sans
--   qu'aucun envoi n'ait eu lieu.
--
-- CE QUE CELA PRODUISAIT
--   Aucun rappel de tâche, d'événement ou de routine n'a jamais été distribué
--   par la base. Les trois réponses archivées dans `net._http_response` portent
--   toutes `401`, à 10:11, 10:12 et 10:15 — les deux dispatches manuels et le
--   passage du job cron.
--
--   Le bouton « Envoyer un test » fonctionnait, et masque toujours la panne :
--   il appelle `push-notify` depuis le navigateur, avec un JWT d'utilisateur,
--   donc par le mode `user`, qui était déjà correct.
--
-- CE QUI EST MAINTENU
--   Le secret ne doit apparaître NI dans l'URL NI dans un en-tête de journal.
--   L'en-tête `apikey` est le seul endroit prévu par le framework pour le
--   transmettre, et `net.http_request_queue` conserve la requête : ce
--   secret est donc visible en base — ce qui est déjà le cas de la clé secrète de la
--   stack, et ce n'est pas une raison de ne pas corriger l'authentification.
--
--   La documentation disait `apikey: <clé secrète>` depuis le début, pour le
--   mode `secret` : c'est elle qui avait raison, et le code qui suivait une
--   autre piste. `0004_cron.sql` vérifie désormais l'en-tête, pour que la
--   divergence ne se rouvre pas.

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
  -- pg_net installée : le dispatch était alors inerte en permanence. (0024)
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

  -- La clé secrète va dans `apikey`, et JAMAIS dans `Authorization: Bearer`.
  -- Le mode est décidé par l'en-tête, pas par la valeur : une clé `sb_*`
  -- présentée comme Bearer est un JWT, et le framework répond 401 avant
  -- d'atteindre le corps de la fonction.
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/push-notify',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'apikey', v_key
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
