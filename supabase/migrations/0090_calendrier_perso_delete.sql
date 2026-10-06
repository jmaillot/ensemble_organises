-- 0090_calendrier_perso_delete.sql
-- Calendrier : l'owner supprime son Perso, l'admin ne touche toujours qu'au
-- Commun + dispatch `refresh-calendrier-ref` aligné sur le contrat Edge.
--
-- Contexte : depuis 0084 (D-01 Option B), le Perso est invisible aux autres
-- membres, admin compris en SELECT. La politique `event_calendars_delete`
-- (0047, admin uniquement) est donc inerte pour le Perso d'autrui : 0017 le
-- prouve par des 0 affectés. Résultat : personne ne peut supprimer un
-- calendrier perso — ni l'admin (ligne invisible), ni l'owner membre
-- (politique admin-only). Cette migration ouvre la suppression à l'owner de
-- son propre Perso, seul acteur qui le voit.
--
-- Portée exacte :
-- - `event_calendars_delete` : branche owner ajoutée
--   (`visibility = 'perso'` + `owner_member_id = current_member_id`). Le
--   Commun reste protégé par `name <> 'Commun'` ; un Perso renommé « Commun »
--   par son owner reste supprimable (c'est bien un Perso, `visibility` fait
--   foi, pas le nom).
-- - `private.dispatch_calendrier_refresh()` : le corps envoyait
--   `jsonb_build_object('date', …)` alors que l'Edge ne connaît que `year`
--   (clé inconnue ignorée par Zod, année courante par défaut). Même valeur
--   effective, contrat explicite.
--
-- Ne réécrit aucune migration appliquée : forward-only (`drop policy if
-- exists` + `create policy`, `create or replace`). Aucun DML dans ce fichier.
--
-- Discipline (AGENTS.md 2.7A) : `search_path = ''`, tables `public.*`
-- qualifiées, REVOKE final reconduit (le `create or replace` conserve les
-- privilèges 0087, le REVOKE les fige explicitement).

begin;

-- ---------------------------------------------------------------------------
-- Suppression : admin (hors Commun, inchangé) OU owner de son Perso.
-- ---------------------------------------------------------------------------
drop policy if exists event_calendars_delete on public.event_calendars;
create policy event_calendars_delete on public.event_calendars
  for delete using (
    (private.is_household_admin(household_id) and name <> 'Commun')
    or (
      visibility = 'perso'
      and owner_member_id = private.current_member_id(household_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Dispatch : corps aligné sur le schéma Zod de l'Edge (`{ year?: number }`).
-- ---------------------------------------------------------------------------
create or replace function private.dispatch_calendrier_refresh()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
  v_sent integer := 0;
begin
  -- Une FONCTION se demande au catalogue avec `to_regproc` (0024) : `to_regclass`
  -- repond NULL devant `net.http_post` et rendrait le dispatch inerte.
  if to_regproc('net.http_post') is null then
    raise notice 'pg_net absent (net.http_post introuvable) : dispatch calendrier desactive.';
    return 0;
  end if;

  if to_regclass('vault.decrypted_secrets') is null then
    raise notice 'Vault absent (vault.decrypted_secrets introuvable) : dispatch calendrier desactive.';
    return 0;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'service_role_key';

  if v_url is null or v_key is null then
    raise warning 'Secrets Vault project_url / service_role_key absents : dispatch calendrier ignore.';
    return 0;
  end if;

  -- La cle secrete va dans `apikey`, jamais en Bearer (0025 : Bearer + cle
  -- = 401 UNUSABLE_CREDENTIAL avant le corps de la fonction).
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/refresh-calendrier-ref',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'apikey', v_key
    ),
    body := jsonb_build_object(
      'year', extract(year from (now() at time zone 'Europe/Paris'))::integer
    ),
    timeout_milliseconds := 30000
  );

  v_sent := 1;
  return v_sent;
end;
$$;

revoke all on function private.dispatch_calendrier_refresh() from public, anon, authenticated;
grant execute on function private.dispatch_calendrier_refresh() to service_role;

commit;
