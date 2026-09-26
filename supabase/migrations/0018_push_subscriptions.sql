-- 0018_push_subscriptions.sql
-- Abonnements Web Push et préférences de rappel.
--
-- POURQUOI CETTE TABLE EST INATTEIGNABLE DU CLIENT
--   Un `endpoint` de Push est une CAPACITÉ : quiconque le détient peut
--   distribuer un message au navigateur qui l'a émis, à l'identique de
--   l'application. Le rendre lisible — même seulement au propriétaire — par
--   PostgREST l'exposerait à tout client capable de lire la table, et donc à
--   toute fuite de jeton. La table est donc créée SANS politique RLS et SANS
--   privilège pour `anon`/`authenticated`, exactement comme
--   `household_invite_tokens` : la création, la révocation et la lecture
--   passent par des opérations serveur, elles-mêmes appelées par l'Edge
--   Function `push-subscribe`, qui revérifie l'acteur.
--
--   Le déclencheur de la migration 0009 (`alter default privileges`) accorde
--   par défaut le CRUD aux clients sur toute table nouvelle : sans le `REVOKE`
--   explicite ci-dessous, cette table serait lisible — le défaut décrit par
--   la rétrospective §1.1, où deux erreurs anodines se cumulaient.
--
--   `0009` a aussi posé `alter default privileges` : la table étant créée par
--   le même rôle, le privilège par défaut s'applique bien, et c'est
--   volontairement rejoué ici, et vérifié par le test de contrat.
--
-- POURQUOI PAS DE `household_id`
--   Un abonnement est la propriété d'une personne et d'un appareil, pas d'un
--   foyer. Un membre de deux foyers doit recevoir les rappels des deux : lier
--   l'abonnement à un foyer à la création en ferait perdre un en silence
--   foyer. Le rattachement au foyer se fait au moment de l'envoi, via
--   `household_members`.
--
-- `p256dh` fait 65 octets (point P-256 non compressé) et `auth_secret` 16 : les
-- contraintes de longueur ne sont pas décoratives, elles distinguent une donnée
-- tronquée d'une donnée valide avant qu'un envoi ne parte au service Push.

begin;

-- ---------------------------------------------------------------------------
-- Préférences de rappel : elles vivent sur le profil, pas dans le navigateur
--
-- Le panneau de notifications affichait des réglages stockés dans le
-- `localStorage` : ils ne se suivaient pas d'un appareil à l'autre, et le
-- serveur ne pouvait pas les respecter. Un interrupteur « Rappels de tâches »
-- qui ne supprime aucun envoi est un mensonge d'interface.
--
-- `reminder_frequency` est conservée telle que l'interface la propose, mais
-- AUCUN envoi ne s'y conforme aujourd'hui : les rappels sont unitaires, donc
-- toujours immédiats. Elle documente le réglage et le job de synthèse qui
-- pourra le consommer ; ce job n'existe pas.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column reminder_frequency text not null default 'immediat'
    check (reminder_frequency in ('immediat', 'matin', 'journée', 'soir')),
  add column task_reminders_enabled boolean not null default true,
  add column event_reminders_enabled boolean not null default true,
  add column routine_reminders_enabled boolean not null default true;

comment on column public.profiles.reminder_frequency is
  'Fréquence choisie pour l''ensemble des rappels. Aucun envoi n''en dépend tant que le point de synthèse quotidien n''existe pas.';

-- ---------------------------------------------------------------------------
-- push_subscriptions
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id text primary key default private.new_id('push'),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{87}$'),
  auth_secret text not null check (auth_secret ~ '^[A-Za-z0-9_-]{22}$'),
  expiration_time timestamptz,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0),
  last_status integer,
  constraint push_subscriptions_endpoint_key unique (endpoint)
);

comment on table public.push_subscriptions is
  'Abonnements Web Push, un par appareil. Inatteignable du client : l''endpoint est une capacité, pas une donnée d''affichage.';

comment on column public.push_subscriptions.endpoint is
  'URL du service Push. Unique : un seul compte peut posséder un endpoint donné, la réinscription transfère donc l''appareil au nouvel utilisateur.';
comment on column public.push_subscriptions.failure_count is
  'Échecs consécutifs d''envoi. L''abonnement est supprimé au-delà du seuil de la fonction de rapport.';

-- L'endpoint d'un service Push est une URL HTTPS : refuser autre chose évite
-- d'enregistrer une valeur qui ne pourra jamais recevoir de message.
alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_https check (endpoint ~ '^https://[^[:space:]]{8,2048}$');

-- RLS activée SANS politique : structurellement invisible, comme les tokens.
alter table public.push_subscriptions enable row level security;

-- Le GRANT par défaut de 0009 s'applique à toute table créée ensuite.
revoke all on table public.push_subscriptions from anon, authenticated, public;
grant all on table public.push_subscriptions to service_role;

-- ---------------------------------------------------------------------------
-- Opérations serveur : abonnement, révocation, lecture
--
-- `p_user_id` est un paramètre explicite, jamais `auth.uid()` : ces fonctions
-- sont appelées avec la clé secrète (`FUNCTIONS_VERIFY_JWT=false`), donc
-- `auth.uid()` y serait systématiquement nul. C'est l'Edge Function
-- `push-subscribe` qui prend l'identifiant dans le jeton de session, et elle
-- refuse tout appel sans session.
-- ---------------------------------------------------------------------------
create or replace function public.register_push_subscription(
  p_user_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth_secret text,
  p_expiration_time timestamptz default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.push_subscriptions;
begin
  if p_user_id is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_endpoint is null or btrim(p_endpoint) = '' then
    raise exception 'endpoint obligatoire' using errcode = '22023';
  end if;
  if p_p256dh is null or p_auth_secret is null then
    raise exception 'clé publique et secret d''authentification obligatoires' using errcode = '22023';
  end if;

  -- Réinscription : même endpoint, clés neuves. C'est le cas normal quand le
  -- navigateur renouvelle son abonnement sans que l'utilisateur ait rien fait.
  -- Le compteur d'échecs repart de zéro : l'ancien état était celui de la clé
  -- précédente.
  insert into public.push_subscriptions as s (
    user_id, endpoint, p256dh, auth_secret, expiration_time, user_agent
  )
  values (
    p_user_id, btrim(p_endpoint), btrim(p_p256dh), btrim(p_auth_secret),
    p_expiration_time, nullif(left(coalesce(p_user_agent, ''), 300), '')
  )
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth_secret = excluded.auth_secret,
        expiration_time = excluded.expiration_time,
        user_agent = excluded.user_agent,
        failure_count = 0,
        updated_at = now()
  where s.user_id is distinct from excluded.user_id
     or s.p256dh is distinct from excluded.p256dh
     or s.auth_secret is distinct from excluded.auth_secret
  returning * into v_row;

  -- Aucun RETURNING ne signifie pas « déjà à jour » mais « rien à écrire » : la
  -- ligne existe déjà, identique. La relire est donc nécessaire pour renvoyer
  -- son identifiant, et pour ne pas confondre un rejeu avec un échec.
  if v_row.id is null then
    select * into v_row
      from public.push_subscriptions
     where endpoint = btrim(p_endpoint);
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'endpoint', v_row.endpoint,
    'created_at', v_row.created_at,
    'last_success_at', v_row.last_success_at
  );
end;
$$;

comment on function public.register_push_subscription(uuid, text, text, text, timestamptz, text) is
  'USAGE SERVEUR UNIQUEMENT. Enregistre ou renouvelle l''abonnement push d''un utilisateur.';

create or replace function public.remove_push_subscription(
  p_user_id uuid,
  p_endpoint text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_removed integer;
begin
  if p_user_id is null or p_endpoint is null then
    return false;
  end if;

  -- Le `user_id` dans le WHERE n'est pas décoratif : sans lui, n'importe quel
  -- appel serveur pourrait désabonner l'appareil d'un autre membre.
  delete from public.push_subscriptions
   where endpoint = p_endpoint
     and user_id = p_user_id;

  get diagnostics v_removed = row_count;
  return v_removed > 0;
end;
$$;

comment on function public.remove_push_subscription(uuid, text) is
  'USAGE SERVEUR UNIQUEMENT. Révoque l''abonnement d''un endpoint pour un utilisateur donné.';

create or replace function public.list_push_subscriptions(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'session requise' using errcode = '28000';
  end if;

  -- L'endpoint est renvoyé : il appartient à l'appelant, et le navigateur en a
  -- besoin pour reconnaître un appareil déjà enregistré. Ce que la table
  -- refuse, c'est de le laisser lire ceux des AUTRES.
  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'endpoint', s.endpoint,
          'device', coalesce(s.user_agent, 'appareil inconnu'),
          'created_at', s.created_at,
          'last_success_at', s.last_success_at,
          'failure_count', s.failure_count
        ) order by s.created_at
      )
      from public.push_subscriptions s
      where s.user_id = p_user_id
    ),
    '[]'::jsonb
  );
end;
$$;

comment on function public.list_push_subscriptions(uuid) is
  'USAGE SERVEUR UNIQUEMENT. Appareils enregistrés pour un utilisateur.';

-- ---------------------------------------------------------------------------
-- Privilèges
--
-- `create or replace` recrée les ACL : l'EXECUTE par défaut de `PUBLIC` est
-- explicitement retiré, comme pour les quatre fonctions serveur de 0009.
-- ---------------------------------------------------------------------------
revoke all on function public.register_push_subscription(uuid, text, text, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.remove_push_subscription(uuid, text) from public, anon, authenticated;
revoke all on function public.list_push_subscriptions(uuid) from public, anon, authenticated;

grant execute on function public.register_push_subscription(uuid, text, text, text, timestamptz, text) to service_role;
grant execute on function public.remove_push_subscription(uuid, text) to service_role;
grant execute on function public.list_push_subscriptions(uuid) to service_role;

commit;
