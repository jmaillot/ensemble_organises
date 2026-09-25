-- 0006_security_helpers.sql
-- Utilitaires d'autorisation (SECURITY DEFINER, `search_path` vide) et
-- opérations serveur sur les tokens d'invitation.
--
-- Toutes ces fonctions s'exécutent avec les privilèges du propriétaire
-- (postgres) et contourment donc la RLS : elles portent la vérification
-- d'appartenance et de rôle qui constitue la frontière d'autorisation.
--
-- Règles retenues :
--   * `admin`  : lecture + écriture + gestion des membres et des invitations.
--   * `membre` : lecture + écriture sur le contenu du foyer.
--   * `enfant` : lecture seule (AGENTS.md §9.3 — décision retenue le 25/09/2026 :
--     un profil « enfant » n'écrit pas dans le foyer, il consulte).

begin;

-- ---------------------------------------------------------------------------
-- Appartenance et rôle
-- ---------------------------------------------------------------------------
create or replace function private.is_household_member(p_household_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.household_members m
     where m.household_id = p_household_id
       and m.user_id = auth.uid()
  );
$$;

create or replace function private.household_role(p_household_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select (
    select m.role
      from public.household_members m
     where m.household_id = p_household_id
       and m.user_id = auth.uid()
     limit 1
  );
$$;

create or replace function private.current_member_id(p_household_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select (
    select m.id
      from public.household_members m
     where m.household_id = p_household_id
       and m.user_id = auth.uid()
     limit 1
  );
$$;

create or replace function private.is_household_admin(p_household_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.household_role(p_household_id) = 'admin';
$$;

create or replace function private.can_write_household(p_household_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.household_role(p_household_id) in ('admin', 'membre');
$$;

create or replace function private.household_admin_count(p_household_id text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (
    select count(*)
      from public.household_members m
     where m.household_id = p_household_id
       and m.role = 'admin'
  );
$$;

-- Un membre du foyer est-il aussi membre du foyer donné ? Utilisé par les
-- `WITH CHECK` pour interdire de rattacher une donnée à un autre foyer.
create or replace function private.member_in_household(p_member_id text, p_household_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.household_members m
     where m.id = p_member_id
       and m.household_id = p_household_id
  );
$$;

-- Vérification de rôle pour les opérations serveur (clé secrète).
create or replace function private.assert_household_admin(p_household_id text, p_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
      from public.household_members m
     where m.household_id = p_household_id
       and m.user_id = p_user_id
       and m.role = 'admin'
  ) then
    raise exception 'action réservée aux administrateurs du foyer'
      using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Listes de cadeaux (visibilité)
-- ---------------------------------------------------------------------------
create or replace function private.can_read_gift_list(p_list_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.gift_lists l
     where l.id = p_list_id
       and (
         l.visibility <> 'privee'
         or l.owner_member_id = private.current_member_id(l.household_id)
         or exists (
           select 1
             from public.gift_list_shares s
            where s.list_id = l.id
              and (
                s.shared_with_member_id = private.current_member_id(l.household_id)
                or s.shared_with_email = (
                  select p.email from public.profiles p where p.id = auth.uid()
                )
              )
         )
       )
  );
$$;

create or replace function private.can_write_gift_list(p_list_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.gift_lists l
     where l.id = p_list_id
       and (
         l.owner_member_id = private.current_member_id(l.household_id)
         or private.is_household_admin(l.household_id)
         or (l.visibility <> 'privee' and private.can_write_household(l.household_id))
       )
  );
$$;

-- ---------------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------------
create or replace function private.is_conversation_member(p_conversation_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.conversation_members cm
      join public.conversations c on c.id = cm.conversation_id
     where cm.conversation_id = p_conversation_id
       and cm.member_id = private.current_member_id(c.household_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- Comparaison à temps constant des empreintes HMAC
-- ---------------------------------------------------------------------------
create or replace function private.token_hash_matches(p_stored text, p_candidate text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_stored bytea;
  v_candidate bytea;
  v_equal boolean := true;
  v_index integer;
begin
  if p_stored is null or p_candidate is null then
    return false;
  end if;
  -- La longueur est une information publique (empreinte hexadécimale de
  -- longueur fixe) : elle ne rompt pas la constante de temps sur le contenu.
  if length(p_stored) <> length(p_candidate) then
    return false;
  end if;

  v_stored := decode(p_stored, 'hex');
  v_candidate := decode(p_candidate, 'hex');

  -- Comparaison octet à octet sans sortie anticipée.
  for v_index in 0 .. length(v_stored) - 1 loop
    if get_byte(v_stored, v_index) <> get_byte(v_candidate, v_index) then
      v_equal := false;
    end if;
  end loop;

  return v_equal;
end;
$$;

comment on function private.token_hash_matches(text, text) is
  'Comparaison à temps constant de deux empreintes HMAC-SHA-256 hexadécimales.';

-- ---------------------------------------------------------------------------
-- Opérations serveur sur les tokens d'invitation.
--
-- Ces quatre fonctions vivent dans `public` parce qu'elles sont appelées par
-- l'Edge Function `household-invite` via PostgREST. Elles sont `SECURITY
-- DEFINER` mais l'EXÉCUTE n'est accordé qu'à `service_role` (cf. 0009) : un
-- client porteur d'un JWT utilisateur obtient le rôle `authenticated` et se
-- voit refuser l'appel. Elles revérifient le rôle de l'acteur en base, donc
-- même une Edge Function compromise ne peut pas agir pour un non-administrateur.
-- ---------------------------------------------------------------------------
create or replace function public.create_household_invite_token(
  p_actor_id uuid,
  p_household_id text,
  p_token_hash text,
  p_expires_at timestamptz default null,
  p_max_uses integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max_uses integer;
  v_expires_at timestamptz;
  v_token_id text;
begin
  if p_household_id is null or p_actor_id is null then
    raise exception 'foyer et acteur obligatoires' using errcode = '22023';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'empreinte de token invalide' using errcode = '22023';
  end if;

  perform private.assert_household_admin(p_household_id, p_actor_id);

  v_max_uses := least(greatest(coalesce(p_max_uses, 10), 1), 100);

  if p_expires_at is not null then
    if p_expires_at <= now() then
      raise exception 'expiration doit être dans le futur' using errcode = '22023';
    end if;
    v_expires_at := least(p_expires_at, now() + interval '90 days');
  end if;

  -- Régénération : le token précédent est invalidé immédiatement.
  update public.household_invite_tokens
     set is_active = false
   where household_id = p_household_id
     and is_active;

  insert into public.household_invite_tokens (
    household_id, token_hash, created_by, expires_at, max_uses, use_count, is_active
  ) values (
    p_household_id, p_token_hash, p_actor_id, v_expires_at, v_max_uses, 0, true
  )
  returning id into v_token_id;

  return jsonb_build_object(
    'token_id', v_token_id,
    'household_id', p_household_id,
    'expires_at', v_expires_at,
    'max_uses', v_max_uses
  );
end;
$$;

comment on function public.create_household_invite_token(uuid, text, text, timestamptz, integer) is
  'USAGE SERVEUR UNIQUEMENT. Génère un nouveau token et invalide le précédent.';

create or replace function public.revoke_household_invite_tokens(p_actor_id uuid, p_household_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revoked integer;
begin
  perform private.assert_household_admin(p_household_id, p_actor_id);

  update public.household_invite_tokens
     set is_active = false
   where household_id = p_household_id
     and is_active;

  get diagnostics v_revoked = row_count;

  return jsonb_build_object('household_id', p_household_id, 'revoked', v_revoked);
end;
$$;

comment on function public.revoke_household_invite_tokens(uuid, text) is
  'USAGE SERVEUR UNIQUEMENT. Révoque tous les tokens actifs du foyer.';

create or replace function public.household_invite_token_summary(p_actor_id uuid, p_household_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_household_admin(p_household_id, p_actor_id);

  return (
    select jsonb_build_object(
      'token_id', t.id,
      'household_id', t.household_id,
      'is_active', t.is_active,
      'expires_at', t.expires_at,
      'max_uses', t.max_uses,
      'use_count', t.use_count,
      'created_at', t.created_at
    )
    from public.household_invite_tokens t
    where t.household_id = p_household_id
    order by t.created_at desc
    limit 1
  );
end;
$$;

comment on function public.household_invite_token_summary(uuid, text) is
  'USAGE SERVEUR UNIQUEMENT. Résumé du dernier token, sans son empreinte.';

create or replace function public.redeem_household_invite_token(
  p_token_hash text,
  p_user_id uuid,
  p_display_name text,
  p_avatar_url text default null,
  p_role text default 'membre'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.household_invite_tokens%rowtype;
  v_member_id text;
  v_role text;
  v_color text;
begin
  if p_user_id is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'token invalide' using errcode = '22023';
  end if;

  -- Un token d'invitation n'attribue jamais le rôle `admin` : le client ne peut
  -- pas s'attribuer un privilège (AGENTS.md §2.6).
  v_role := case when p_role in ('enfant') then 'enfant' else 'membre' end;

  -- Verrou pessimiste : deux utilisations simultanées du même token ne peuvent
  -- pas franchir `use_count < max_uses`. La ligne est d'abord localisée par
  -- l'index sur `token_hash`, puis la comparaison est refaite à temps constant.
  select t.* into v_token
    from public.household_invite_tokens t
   where t.token_hash = p_token_hash
     and private.token_hash_matches(t.token_hash, p_token_hash)
   for update;

  if not found then
    raise exception 'token inconnu' using errcode = '22023';
  end if;
  if not v_token.is_active then
    raise exception 'token révoqué' using errcode = '22023';
  end if;
  if v_token.expires_at is not null and v_token.expires_at <= now() then
    update public.household_invite_tokens
       set is_active = false
     where id = v_token.id;
    raise exception 'token expiré' using errcode = '22023';
  end if;
  if v_token.use_count >= v_token.max_uses then
    update public.household_invite_tokens
       set is_active = false
     where id = v_token.id;
    raise exception 'token épuisé' using errcode = '22023';
  end if;

  -- Déjà membre : l'utilisation n'est pas comptabilisée (idempotence).
  select m.id into v_member_id
    from public.household_members m
   where m.household_id = v_token.household_id
     and m.user_id = p_user_id;

  if v_member_id is not null then
    return jsonb_build_object(
      'household_id', v_token.household_id,
      'member_id', v_member_id,
      'already_member', true
    );
  end if;

  v_color := (array['accent', 'ink', 'coral', 'amber', 'violet'])[
    1 + (select count(*) from public.household_members where household_id = v_token.household_id) % 5
  ];

  v_member_id := private.new_id('member');

  insert into public.household_members (
    id, household_id, user_id, display_name, avatar_url, color_tag, role
  ) values (
    v_member_id,
    v_token.household_id,
    p_user_id,
    coalesce(nullif(btrim(p_display_name), ''), 'Nouveau membre'),
    p_avatar_url,
    v_color,
    v_role
  );

  update public.household_invite_tokens
     set use_count = use_count + 1,
         is_active = (use_count + 1 < max_uses)
   where id = v_token.id;

  return jsonb_build_object(
    'household_id', v_token.household_id,
    'member_id', v_member_id,
    'already_member', false
  );
end;
$$;

comment on function public.redeem_household_invite_token(text, uuid, text, text, text) is
  'USAGE SERVEUR UNIQUEMENT. Échange un token contre une ligne household_members, en transaction.';

-- ---------------------------------------------------------------------------
-- Solde de l'Ardoise, calculé côté serveur (AGENTS.md §2.2).
-- Volontairement hors de `public` : il sera exposé par une Edge Function dédiée
-- plutôt que par PostgREST tant que la compensation n'est pas validée.
-- ---------------------------------------------------------------------------
create or replace function private.household_balances(p_household_id text)
returns table (
  member_id text,
  display_name text,
  role text,
  paid numeric(14, 2),
  share numeric(14, 2),
  balance numeric(14, 2)
)
language sql
stable
security definer
set search_path = ''
as $$
  with expense_totals as (
    select
      e.id,
      e.paid_by,
      e.amount,
      coalesce(
        (select sum(ep.share_amount) from public.expense_participants ep where ep.expense_id = e.id),
        0
      ) as allocated
    from public.expenses e
    where e.household_id = p_household_id
  ), paid as (
    select et.paid_by as member_id, sum(et.amount)::numeric(14, 2) as amount
      from expense_totals et
     group by et.paid_by
  ), shared as (
    select s.member_id, sum(s.amount)::numeric(14, 2) as amount
      from (
        -- Dépense sans répartition : entièrement imputée à son payeur.
        select et.paid_by as member_id, et.amount
          from expense_totals et
         where et.allocated = 0
        union all
        select ep.member_id, ep.share_amount
          from public.expense_participants ep
          join expense_totals et on et.id = ep.expense_id
         where et.allocated > 0
           and ep.participant_type = 'membre'
      ) s
     where s.member_id is not null
     group by s.member_id
  )
  select
    m.id,
    m.display_name,
    m.role,
    coalesce(paid.amount, 0),
    coalesce(shared.amount, 0),
    coalesce(paid.amount, 0) - coalesce(shared.amount, 0)
  from public.household_members m
  left join paid on paid.member_id = m.id
  left join shared on shared.member_id = m.id
  where m.household_id = p_household_id
  order by m.display_name;
$$;

comment on function private.household_balances(text) is
  'Solde par membre : positive = le foyer lui doit, négative = il doit au foyer.';

-- Compensation des dettes (AGENTS.md §2.2) : réduit les sommes croisées à un
-- nombre minimal de transferts, par glissement des deux plus grands soldes.
-- Volontairement hors de `public` : l'algorithme reste une référence unique,
-- testable en SQL, et sera exposé par une Edge Function dédiée.
create or replace function private.simplify_household_debts(p_household_id text)
returns table (
  debtor_id text,
  debtor_name text,
  creditor_id text,
  creditor_name text,
  amount numeric(14, 2)
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_debtor_ids text[] := '{}';
  v_debtor_names text[] := '{}';
  v_debtor_amounts numeric[] := '{}';
  v_creditor_ids text[] := '{}';
  v_creditor_names text[] := '{}';
  v_creditor_amounts numeric[] := '{}';
  v_i integer := 1;
  v_j integer := 1;
  v_amount numeric;
  v_epsilon numeric := 0.005; -- tolérance d'arrondi au centime
begin
  if p_household_id is null then
    raise exception 'foyer manquant' using errcode = '22023';
  end if;

  -- Débiteurs : les plus endettés d'abord (balance croissante).
  with balances as (
    select * from private.household_balances(p_household_id)
  )
  select
    coalesce(array_agg(member_id order by balance), '{}'),
    coalesce(array_agg(display_name order by balance), '{}'),
    coalesce(array_agg(-balance order by balance), '{}')
  into v_debtor_ids, v_debtor_names, v_debtor_amounts
  from balances
  where balance < -v_epsilon;

  -- Créanciers : les plus créditeurs d'abord (balance décroissante).
  with balances as (
    select * from private.household_balances(p_household_id)
  )
  select
    coalesce(array_agg(member_id order by -balance), '{}'),
    coalesce(array_agg(display_name order by -balance), '{}'),
    coalesce(array_agg(balance order by -balance), '{}')
  into v_creditor_ids, v_creditor_names, v_creditor_amounts
  from balances
  where balance > v_epsilon;

  while v_i <= coalesce(array_length(v_debtor_ids, 1), 0)
    and v_j <= coalesce(array_length(v_creditor_ids, 1), 0)
  loop
    v_amount := least(v_debtor_amounts[v_i], v_creditor_amounts[v_j]);

    if v_amount > v_epsilon then
      debtor_id := v_debtor_ids[v_i];
      debtor_name := v_debtor_names[v_i];
      creditor_id := v_creditor_ids[v_j];
      creditor_name := v_creditor_names[v_j];
      amount := round(v_amount, 2);
      return next;
    end if;

    v_debtor_amounts[v_i] := v_debtor_amounts[v_i] - v_amount;
    v_creditor_amounts[v_j] := v_creditor_amounts[v_j] - v_amount;

    if v_debtor_amounts[v_i] <= v_epsilon then
      v_i := v_i + 1;
    end if;
    if v_creditor_amounts[v_j] <= v_epsilon then
      v_j := v_j + 1;
    end if;
  end loop;

  return;
end;
$$;

comment on function private.simplify_household_debts(text) is
  'Nombre minimal de transferts pour solder un foyer. Sens : debtor_id doit creditor_id.';

commit;
