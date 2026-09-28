-- 0033_push_device_labels.sql
-- Nom d'appareil personnalisable pour les abonnements Web Push.
--
-- POURQUOI
--   La liste des appareils n'affichait que l'user-agent brut : deux PC Windows
--   sous le même Chrome y sont indiscernables, et une ligne ne dit pas si elle
--   reçoit vraiment les envois. Le nom est écrit par le propriétaire de
--   l'abonnement, via l'Edge Function `push-subscribe` (action `rename`), dans
--   la même transaction serveur que tout le reste : le client ne touche jamais
--   la table directement, et ne renomme que ses propres lignes.
--
--   `last_status` rejoint la lecture pour le même motif : un endpoint accepté
--   (201) mais jamais affiché se distingue d'un endpoint mort (410) sans
--   deviner.

alter table public.push_subscriptions
  add column device_label text;

alter table public.push_subscriptions
  add constraint push_device_label_length
  check (device_label is null or (char_length(device_label) between 1 and 80));

comment on column public.push_subscriptions.device_label is
  'Nom donné par le propriétaire pour distinguer ses appareils. NULL : libellé déduit du user-agent côté client.';

-- `register` accepte le nom dès l'inscription : sans lui, chaque activation
-- exigerait deux allers-retours (inscrire, puis renommer).
drop function if exists public.register_push_subscription(uuid, text, text, text, timestamptz, text);

create or replace function public.register_push_subscription(
  p_user_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth_secret text,
  p_expiration_time timestamptz default null,
  p_user_agent text default null,
  p_device_label text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.push_subscriptions;
  v_label text := nullif(btrim(coalesce(p_device_label, '')), '');
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
  if v_label is not null and char_length(v_label) > 80 then
    raise exception 'nom d''appareil trop long (80 caractères maximum)' using errcode = '22023';
  end if;

  -- Réinscription : même endpoint, clés neuves. Le nom n'est remplacé que
  -- s'il est fourni : une resynchronisation silencieuse ne doit pas effacer
  -- le nom choisi par l'utilisateur.
  insert into public.push_subscriptions as s (
    user_id, endpoint, p256dh, auth_secret, expiration_time, user_agent, device_label
  )
  values (
    p_user_id, btrim(p_endpoint), btrim(p_p256dh), btrim(p_auth_secret),
    p_expiration_time, nullif(left(coalesce(p_user_agent, ''), 300), ''), v_label
  )
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth_secret = excluded.auth_secret,
        expiration_time = excluded.expiration_time,
        user_agent = excluded.user_agent,
        device_label = coalesce(excluded.device_label, s.device_label),
        failure_count = 0,
        updated_at = now()
  where s.user_id is distinct from excluded.user_id
     or s.p256dh is distinct from excluded.p256dh
     or s.auth_secret is distinct from excluded.auth_secret
     or (excluded.device_label is not null and s.device_label is distinct from excluded.device_label)
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

comment on function public.register_push_subscription(uuid, text, text, text, timestamptz, text, text) is
  'USAGE SERVEUR UNIQUEMENT. Enregistre ou renouvelle l''abonnement push d''un utilisateur.';

create or replace function public.rename_push_subscription(
  p_user_id uuid,
  p_subscription_id text,
  p_label text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
  v_updated integer;
begin
  if p_user_id is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if v_label is not null and char_length(v_label) > 80 then
    raise exception 'nom d''appareil trop long (80 caractères maximum)' using errcode = '22023';
  end if;

  -- Le `user_id` dans le WHERE n'est pas décoratif : sans lui, n'importe quel
  -- appel serveur renommerait l'appareil d'un autre membre.
  update public.push_subscriptions
     set device_label = v_label,
         updated_at = now()
   where id = p_subscription_id
     and user_id = p_user_id;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'appareil introuvable pour cet utilisateur' using errcode = 'P0002';
  end if;

  return jsonb_build_object('id', p_subscription_id, 'device_label', v_label);
end;
$$;

comment on function public.rename_push_subscription(uuid, text, text) is
  'USAGE SERVEUR UNIQUEMENT. Nomme l''appareil d''un utilisateur (NULL ou vide : efface).';

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
          'device_label', s.device_label,
          'created_at', s.created_at,
          'last_success_at', s.last_success_at,
          'last_status', s.last_status,
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

-- `create or replace` recrée les ACL : comme en 0018, retrait explicite puis
-- octroi au seul `service_role`, y compris pour la nouvelle signature de
-- `register` (l'ancienne à six arguments est supprimée ci-dessus).
revoke all on function public.register_push_subscription(uuid, text, text, text, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.rename_push_subscription(uuid, text, text) from public, anon, authenticated;
revoke all on function public.list_push_subscriptions(uuid) from public, anon, authenticated;

grant execute on function public.register_push_subscription(uuid, text, text, text, timestamptz, text, text) to service_role;
grant execute on function public.rename_push_subscription(uuid, text, text) to service_role;
grant execute on function public.list_push_subscriptions(uuid) to service_role;
