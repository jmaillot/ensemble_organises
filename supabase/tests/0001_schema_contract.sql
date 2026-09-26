-- supabase/tests/0001_schema_contract.sql
-- Contrat de nommage : les tables et colonnes de `public` correspondent
-- exactement aux interfaces de `app/src/types/database.ts` (cf. §6 du contrat
-- frontend). Toute divergence casse le client, elle est donc testée.

begin;

-- ---------------------------------------------------------------------------
-- 1. Les 41 tables du contrat existent, avec exactement les colonnes attendues
--
-- L'inventaire est la seule chose qui rattrape un oubli de colonne : la RLS et
-- les contraintes ne les voient pas. `push_subscriptions` y figure depuis la
-- migration 0018, avec ses contraintes de longueur — c'est ce qui distingue une
-- donnée d'abonnement valide d'une valeur tronquée.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_actual text[];
  v_missing text[];
  v_extra text[];
begin
  for r in
    select * from (values
          ('profiles', ARRAY['id', 'email', 'display_name', 'avatar_url', 'provider', 'reminder_frequency', 'task_reminders_enabled', 'event_reminders_enabled', 'routine_reminders_enabled', 'created_at', 'updated_at']::text[]),
          ('households', ARRAY['id', 'name', 'avatar_color', 'created_by', 'created_at', 'updated_at']::text[]),
          ('household_members', ARRAY['id', 'household_id', 'user_id', 'display_name', 'avatar_url', 'color_tag', 'role', 'created_at']::text[]),
          ('household_invite_tokens', ARRAY['id', 'household_id', 'token_hash', 'created_by', 'expires_at', 'max_uses', 'use_count', 'is_active', 'created_at']::text[]),
          ('invitations', ARRAY['id', 'household_id', 'email', 'phone', 'role', 'status', 'created_at']::text[]),
          ('shopping_lists', ARRAY['id', 'household_id', 'name', 'created_by', 'created_at']::text[]),
          ('shopping_list_items', ARRAY['id', 'list_id', 'household_id', 'name', 'quantity', 'unit', 'category', 'checked', 'added_by', 'created_at']::text[]),
          ('events', ARRAY['id', 'household_id', 'title', 'description', 'start_at', 'end_at', 'all_day', 'location', 'color', 'created_by', 'created_at']::text[]),
          ('event_reminders', ARRAY['id', 'event_id', 'remind_at']::text[]),
          ('notes', ARRAY['id', 'household_id', 'title', 'content', 'category', 'color', 'created_by', 'created_at', 'updated_at']::text[]),
          ('tasks', ARRAY['id', 'household_id', 'name', 'description', 'due_date', 'priority_order', 'status', 'created_by', 'created_at']::text[]),
          ('task_assignees', ARRAY['task_id', 'member_id']::text[]),
          ('task_reminders', ARRAY['id', 'task_id', 'remind_at']::text[]),
          ('routines', ARRAY['id', 'household_id', 'name', 'description', 'recurrence_rule', 'created_by', 'created_at']::text[]),
          ('routine_assignees', ARRAY['routine_id', 'member_id']::text[]),
          ('routine_reminders', ARRAY['id', 'routine_id', 'remind_at']::text[]),
          ('routine_completions', ARRAY['id', 'routine_id', 'household_id', 'occurrence_date', 'completed_by', 'completed_at', 'status']::text[]),
          ('recipes', ARRAY['id', 'household_id', 'title', 'created_at']::text[]),
          ('expenses', ARRAY['id', 'household_id', 'title', 'amount', 'paid_by', 'expense_date', 'split_type', 'created_at']::text[]),
          ('external_participants', ARRAY['id', 'household_id', 'name', 'contact']::text[]),
          ('expense_participants', ARRAY['id', 'expense_id', 'participant_type', 'member_id', 'external_participant_id', 'share_amount']::text[]),
          ('gift_lists', ARRAY['id', 'household_id', 'owner_member_id', 'name', 'visibility', 'created_at']::text[]),
          ('gift_items', ARRAY['id', 'list_id', 'household_id', 'name', 'price', 'comment', 'photo_url', 'url', 'reserved_by', 'purchased', 'created_at']::text[]),
          ('gift_list_shares', ARRAY['id', 'list_id', 'shared_with_member_id', 'shared_with_email', 'permission']::text[]),
          ('birthdays', ARRAY['id', 'household_id', 'name', 'birth_date', 'photo_url', 'linked_member_id']::text[]),
          ('pets', ARRAY['id', 'household_id', 'name', 'species', 'breed', 'weight_kg', 'birth_date', 'identification_number', 'photo_url', 'created_at']::text[]),
          ('pet_records', ARRAY['id', 'pet_id', 'household_id', 'type', 'name', 'record_date', 'next_due_date', 'notes', 'attachment_url']::text[]),
          ('provider_types', ARRAY['id', 'household_id', 'name', 'icon', 'created_at']::text[]),
          ('providers', ARRAY['id', 'household_id', 'provider_type_id', 'name', 'email', 'phone', 'address', 'postal_code', 'city', 'notes', 'created_at']::text[]),
          ('loyalty_cards', ARRAY['id', 'household_id', 'member_id', 'name', 'code_type', 'code_value', 'brand_color', 'created_at']::text[]),
          ('places', ARRAY['id', 'household_id', 'type', 'photo_url', 'name', 'street', 'postal_code', 'city', 'phone', 'rating', 'visited', 'note', 'created_at']::text[]),
          ('posts', ARRAY['id', 'household_id', 'author_id', 'text', 'created_at']::text[]),
          ('post_media', ARRAY['id', 'post_id', 'household_id', 'media_type', 'url']::text[]),
          ('post_comments', ARRAY['id', 'post_id', 'household_id', 'author_id', 'content', 'created_at']::text[]),
          ('post_reactions', ARRAY['id', 'post_id', 'household_id', 'author_id', 'reaction_type', 'created_at']::text[]),
          ('trips', ARRAY['id', 'household_id', 'name', 'destination', 'start_date', 'end_date', 'cover_photo', 'notes', 'created_at']::text[]),
          ('conversations', ARRAY['id', 'household_id', 'type', 'title', 'created_at']::text[]),
          ('conversation_members', ARRAY['conversation_id', 'member_id']::text[]),
          ('messages', ARRAY['id', 'conversation_id', 'household_id', 'sender_id', 'content', 'media_url', 'created_at']::text[]),
          ('dashboard_widgets', ARRAY['id', 'member_id', 'household_id', 'widget_type', 'position_x', 'position_y', 'width', 'height', 'settings']::text[]),
          ('push_subscriptions', ARRAY['id', 'user_id', 'endpoint', 'p256dh', 'auth_secret', 'expiration_time', 'user_agent', 'created_at', 'updated_at', 'last_success_at', 'failure_count', 'last_status']::text[])
    ) as expected(table_name, columns)
  loop
    perform testkit.ok(
      to_regclass('public.' || r.table_name) is not null,
      'table manquante : ' || r.table_name
    );

    select coalesce(array_agg(column_name order by column_name), '{}')
      into v_actual
      from information_schema.columns
     where table_schema = 'public'
       and table_name = r.table_name;

    select coalesce(array_agg(c order by c), '{}')
      into v_missing
      from unnest(r.columns) as c
     where not (c = any (v_actual));

    select coalesce(array_agg(c order by c), '{}')
      into v_extra
      from unnest(v_actual) as c
     where not (c = any (r.columns));

    perform testkit.ok(
      cardinality(v_missing) = 0,
      'colonnes manquantes sur ' || r.table_name || ' : ' || coalesce(v_missing::text, '-')
    );
    perform testkit.ok(
      cardinality(v_extra) = 0,
      'colonnes inattendues sur ' || r.table_name || ' : ' || coalesce(v_extra::text, '-')
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. RLS activée sur chaque table métier
-- ---------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  select coalesce(array_agg(c.relname order by c.relname)::text, '{}')
    into v_missing
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not c.relrowsecurity;

  perform testkit.ok(v_missing = '{}', 'RLS désactivée sur : ' || v_missing);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2 bis. Au moins une politique, ou la table est close à double tour
-- ---------------------------------------------------------------------------
-- RLS activée sans politique ne protège de rien : elle ferme tout, y compris
-- au propriétaire légitime. C'est l'état dans lequel `expenses` est restée —
-- table sans aucune politique, donc l'Ardoise entièrement inerte côté client,
-- et l'utilisateur voyait une liste vide plutôt qu'une erreur. `0007` avait
-- écrit les politiques des tables filles de `expense_participants` en
-- oubliant la mère.
--
-- Trois exceptions, documentées l'une et l'autre :
--   * `household_invite_tokens` ne doit avoir AUCUNE politique ni aucun GRANT,
--     pour rester inatteignable ;
--   * `push_subscriptions` de même, pour une raison plus forte encore : un
--     `endpoint` de Push est une CAPACITÉ. Le laisser lire, même par son
--     propriétaire, revient à exposer à toute fuite de jeton la possibilité de
--     notifier cet appareil. Ses opérations passent par des fonctions serveur ;
--   * `schema_migrations` est le journal de `scripts/migrate.sh`, une table
--     d'outillage sans donnée personnelle. `migrate.sh` la crée sous RLS, sans
--     politique : inaccessible à `anon` et `authenticated`, lisible par le rôle
--     propriétaire du script. Même état que les précédentes, pour une raison
--     différente — c'est bien la seule table de `public` qui ne soit pas
--     une table métier.
do $$
declare
  v_sans text;
begin
  select coalesce(array_agg(c.relname order by c.relname)::text, '{}')
    into v_sans
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and c.relname not in ('household_invite_tokens', 'push_subscriptions', 'schema_migrations')
     and not exists (
       select 1 from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = c.relname
     );

  perform testkit.ok(v_sans = '{}', 'table sans aucune politique RLS : ' || v_sans);

  perform testkit.eq(
    testkit.count('select 1 from pg_policies where tablename = ''household_invite_tokens'''),
    0::bigint,
    'household_invite_tokens reste sans politique, donc inatteignable'
  );
  perform testkit.eq(
    testkit.count('select 1 from pg_policies where tablename = ''push_subscriptions'''),
    0::bigint,
    'push_subscriptions reste sans politique : un endpoint Push est une capacité'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Clé primaire ou contrainte d'unicité explicite sur chaque table
-- ---------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  select coalesce(array_agg(c.relname order by c.relname)::text, '{}')
    into v_missing
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not exists (
       select 1 from pg_constraint k where k.conrelid = c.oid and k.contype in ('p', 'u')
     );

  perform testkit.ok(v_missing = '{}', 'table sans clé primaire ni unicité : ' || v_missing);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Les tables enfants n'ont pas de household_id : accès dérivé du parent
-- ---------------------------------------------------------------------------
do $$
declare
  v_expected text[] := array[
    'event_reminders', 'task_assignees', 'task_reminders', 'routine_assignees',
    'routine_reminders', 'expense_participants', 'conversation_members'
  ];
  r text;
begin
  foreach r in array v_expected loop
    perform testkit.ok(
      not exists (
        select 1 from information_schema.columns
         where table_schema = 'public' and table_name = r and column_name = 'household_id'
      ),
      'la table enfant ' || r || ' ne doit pas porter household_id'
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Les colonnes dénormalisées sont justifiées et contraintes
--    (alignement sur le parent par déclencheur, cf. migration 0008)
-- ---------------------------------------------------------------------------
do $$
declare
  v_expected text[] := array[
    'shopping_list_items', 'routine_completions', 'gift_items',
    'pet_records', 'post_media', 'post_comments', 'post_reactions', 'messages'
  ];
  r text;
begin
  foreach r in array v_expected loop
    perform testkit.ok(
      exists (
        select 1 from pg_trigger t
          join pg_class c on c.oid = t.tgrelid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname = r
           and t.tgname = 'align_household'
           and not t.tgisinternal
      ),
      'le déclencheur align_household doit être présent sur ' || r
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Les tables inatteignables : ni politique, ni privilège client
--
-- La migration 0009 pose `alter default privileges … grant select, insert,
-- update, delete on tables to authenticated` : TOUTE table créée ensuite
-- reçoit ces privilèges, RLS ou non. C'est exactement le mécanisme qui rendait
-- `task_assignees` et consorts lisibles par tout utilisateur connecté
-- (rétrospective §1.1) — il suffisait d'oublier un `REVOKE`. Ce bloc vérifie
-- donc le GRANT autant que l'absence de politique : une table sans politique
-- mais avec le GRANT par défaut reste lisible par `authenticated`.
--
-- `push_subscriptions` est dans le même cas que `household_invite_tokens`, pour
-- une raison plus forte : un `endpoint` de Push est une CAPACITÉ, et quiconque
-- le détient peut notifier cet appareil.
-- ---------------------------------------------------------------------------
do $$
declare
  r text;
  v_privilege text;
  v_table text;
begin
  foreach v_table in array array['household_invite_tokens', 'push_subscriptions'] loop
    perform testkit.eq(
      testkit.count(format('select 1 from pg_policies where schemaname = ''public'' and tablename = %L', v_table)),
      0::bigint,
      v_table || ' ne doit avoir aucune politique RLS'
    );

    foreach r in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      v_privilege := has_table_privilege('authenticated', 'public.' || v_table, r)::text;
      perform testkit.eq(v_privilege, 'false', 'authenticated ne doit pas avoir ' || r || ' sur ' || v_table);
      v_privilege := has_table_privilege('anon', 'public.' || v_table, r)::text;
      perform testkit.eq(v_privilege, 'false', 'anon ne doit pas avoir ' || r || ' sur ' || v_table);
    end loop;

    v_privilege := has_table_privilege('service_role', 'public.' || v_table, 'SELECT')::text;
    perform testkit.eq(v_privilege, 'true', 'service_role doit pouvoir lire ' || v_table);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Les fonctions serveur ne sont pas exécutables par un client
--
-- `FUNCTIONS_VERIFY_JWT=false` est nécessaire pour mélanger appels navigateur,
-- utilisateur et cron serveur. Il rend aussi public tout nom de fonction de
-- `public` : sans ce REVOKE, un client porteur d'un JWT utilisateur pourrait
-- appeler `public.due_push_notifications` et lire les rappels de TOUS les
-- foyers, ou `record_push_deliveries` et supprimer les abonnements d'autrui.
-- ---------------------------------------------------------------------------
do $$
declare
  r text;
  v_functions text[] := array[
    'public.create_household_invite_token(uuid,text,text,timestamptz,integer)',
    'public.revoke_household_invite_tokens(uuid,text)',
    'public.household_invite_token_summary(uuid,text)',
    'public.redeem_household_invite_token(text,uuid,text,text,text)',
    'public.register_push_subscription(uuid,text,text,text,timestamptz,text)',
    'public.remove_push_subscription(uuid,text)',
    'public.list_push_subscriptions(uuid)',
    'public.due_push_notifications(text,timestamptz,uuid)',
    'public.consume_push_reminders(jsonb)',
    'public.record_push_deliveries(jsonb,integer)'
  ];
begin
  foreach r in array v_functions loop
    perform testkit.eq(
      has_function_privilege('authenticated', r, 'EXECUTE')::text, 'false',
      'authenticated ne doit pas pouvoir exécuter ' || r
    );
    perform testkit.eq(
      has_function_privilege('anon', r, 'EXECUTE')::text, 'false',
      'anon ne doit pas pouvoir exécuter ' || r
    );
    perform testkit.eq(
      has_function_privilege('service_role', r, 'EXECUTE')::text, 'true',
      'service_role doit pouvoir exécuter ' || r
    );
  end loop;

  perform testkit.eq(
    has_function_privilege('authenticated', 'private.household_balances(text)', 'EXECUTE')::text, 'false',
    'le solde de l''Ardoise ne doit pas être appelable par un client'
  );
  perform testkit.eq(
    has_function_privilege('authenticated', 'private.token_hash_matches(text,text)', 'EXECUTE')::text, 'false',
    'la comparaison des empreintes ne doit pas être appelable par un client'
  );
  perform testkit.eq(
    has_function_privilege('authenticated', 'private.parent_household_id(text,text)', 'EXECUTE')::text, 'false',
    'le résolveur de parent ne doit pas être appelable par un client'
  );
  perform testkit.eq(
    has_function_privilege('authenticated', 'private.push_reminder_notifications(timestamptz)', 'EXECUTE')::text, 'false',
    'la liste des rappels dus ne doit pas être appelable par un client'
  );
  perform testkit.eq(
    has_function_privilege('authenticated', 'private.post_push_dispatch(text)', 'EXECUTE')::text, 'false',
    'un client ne doit pas pouvoir déclencher l''envoi des notifications de tout le foyer'
  );
  perform testkit.eq(
    has_function_privilege('anon', 'private.dispatch_push_notifications()', 'EXECUTE')::text, 'false',
    'le dispatch des notifications ne doit pas être appelable sans clé secrète'
  );
end;
$$;

  -- ---------------------------------------------------------------------------
  -- 7 bis. Le même contrôle, mais EXHAUSTIF
  --
  -- Les assertions ci-dessus nomment ce qu'elles vérifient : elles confirment
  -- les signatures qu'on leur a données, et ne verront jamais une septième. Un
  -- test de privilèges qui énumère ne peut répondre que « oui » à ce qu'il
  -- a déjà lu. Et les privilèges se posent par défaut et par héritage :
  -- `0009` accorde en bloc ce qui existe à ce moment-là ; une
  -- fonction ajoutée demain dans `private`, ou une surcharge d'une fonction
  -- existante, reçoit un droit sans qu'aucune assertion ne le regarde.
  --
  -- Le contrôle ci-dessous inverse la direction. Il ne part pas d'une liste :
  -- il PARCOURT `pg_proc`, et vérifie que toute fonction de `private`
  -- exécutable par `anon` ou `authenticated` a une raison d'être. Une raison
  -- s'établit par RÉFÉRENCE, jamais par nom — c'est ce qui rend le contrôle
  -- incapable de pourrir :
  --
  --   (a) `returns trigger` : un déclencheur, non appelable directement ;
  --   (b) citée dans une contrainte CHECK (`pg_constraint`) : elle s'évalue
  --       avec le rôle qui écrit la ligne, donc sans EXECUTE l'écriture
  --       échoue ;
  --   (c) utilisée comme valeur par défaut d'une colonne (`pg_attrdef`) ;
  --   (d) citée dans une politique RLS (`pg_policies`) : une politique est
  --       évaluée avec le rôle de l'appelant, donc sans EXECUTE la requête
  --       entière échouerait — c'est le cas de `can_read_event`, appelée par
  --       les politiques des tables enfants ;
  --   (e) ou atteignable depuis l'une de celles-là par une autre fonction
  --       `SECURITY DEFINER`, qui s'exécute avec les droits de son
  --       propriétaire. C'est ce qui justifie `household_role`, appelée par
  --       `is_household_admin` sans l'être par une politique.
  --
  -- La fermeture (e) est un CTE récursif : sans elle, la catégorie justifiable
  -- s'arrête à `is_household_admin` et le test échouerait à raison sur une
  -- fonction parfaitement légitime.
  --
  -- `anon` n'a pas de cas particulier : une fonction qui lui serait
  -- exécutable serait par définition injustifiée, donc refusée ici. C'était
  -- l'invariant le plus grave, et il n'a pas besoin d'une assertion à part.
  --
  -- Une fonction non justifiée fait échouer le test en nommant sa signature.
  -- C'est une demande de justification, pas un obstacle : ajouter une ligne
  -- dans les catégories ci-dessus suffit, si la raison est réelle.
  --
  -- La limite de ce contrôle, énoncée pour qu'on ne le croie pas plus fort
  -- qu'il n'est : la catégorie (e) rend justifiable TOUT ce qui est
  -- atteignable depuis une entrée légitime. Un helper mort, appelé par un
  -- helper de politique, reste donc justifié. C'est la bonne sémantique —
  -- une chaîne `SECURITY DEFINER` a de toute façon le droit, puisque c'est
  -- le propriétaire qui l'exerce — mais ce test ne prouve pas qu'un helper
  -- est encore *nécessaire*. Il prouve qu'aucun droit n'a été accordé sans
  -- chemin utilisé.
  do $$
  declare
    v_injustifiees text[];
  begin
    with visees as (
      select p.proname,
             p.prorettype,
             p.prosrc,
             format('%I.%I(%s)', n.nspname, p.proname,
                    pg_get_function_identity_arguments(p.oid)) as signature
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'private'
         and (has_function_privilege('anon', p.oid, 'EXECUTE')
           or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    ), directes as (
      -- (a) déclencheur
      select proname as nom
        from visees
       where prorettype = 'trigger'::regtype
      union
      -- (b) contrainte CHECK
      select m[1]
        from pg_constraint c,
             lateral regexp_matches(pg_get_constraintdef(c.oid),
                                   'private\.(\w+)\s*\(', 'g') as m
       where c.contype = 'c'
      union
      -- (c) valeur par défaut de colonne
      select m[1]
        from pg_attrdef d,
             lateral regexp_matches(pg_get_expr(d.adbin, d.adrelid),
                                   'private\.(\w+)\s*\(', 'g') as m
      union
      -- (d) politique RLS
      select m[1]
        from pg_policies pol,
             lateral regexp_matches(concat_ws(' ', pol.qual, pol.with_check),
                                   'private\.(\w+)\s*\(', 'g') as m
    ), arcs as (
      -- (e) ce qu'une fonction appelle, pour la fermeture transitive
      select v.proname as appelant, m[1] as appele
        from visees v,
             lateral regexp_matches(v.prosrc, 'private\.(\w+)\s*\(', 'g') as m
    ), fermeture (nom) as (
      select nom from directes
      union
      select a.appele
        from fermeture f
        join arcs a on a.appelant = f.nom
    )
    select coalesce(array_agg(v.signature order by v.signature), '{}')
      into v_injustifiees
      from visees v
     where not exists (select 1 from fermeture f where f.nom = v.proname);

    perform testkit.ok(
      array_length(v_injustifiees, 1) is null,
      format(
        'exécutables par un client, sans raison déclarée : %s',
        array_to_string(v_injustifiees, ', ')
      )
    );
  end;
  $$;

-- ---------------------------------------------------------------------------
-- 8. Le schéma privé n'est pas accessible à anon
-- ---------------------------------------------------------------------------
do $$
begin
  perform testkit.eq(
    has_schema_privilege('anon', 'private', 'USAGE')::text, 'false',
    'anon ne doit avoir aucun droit sur le schéma private'
  );
  perform testkit.eq(
    has_schema_privilege('anon', 'public', 'CREATE')::text, 'false',
    'anon ne doit pas pouvoir créer d''objet dans public'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Le profil est créé par le trigger auth.users, sans liste globale d'emails
-- ---------------------------------------------------------------------------

insert into testkit.fx (key, user_id)
values ('bob', testkit.auth_user('bob@example.fr', 'Bob Martin'));

select testkit.eq(
  (select count(*) from public.profiles p join testkit.fx on testkit.fx.user_id = p.id where testkit.fx.key = 'bob'), 1::bigint,
  'le trigger sur auth.users doit créer le profil');
select testkit.eq(
  (select p.display_name from public.profiles p join testkit.fx on testkit.fx.user_id = p.id where testkit.fx.key = 'bob'),
  'Bob Martin',
  'le profil doit reprendre le nom d''affichage des métadonnées Auth');
select testkit.eq(
  (select p.provider from public.profiles p join testkit.fx on testkit.fx.user_id = p.id where testkit.fx.key = 'bob'),
  'email',
  'le fournisseur par défaut est email');

-- email, provider et created_at ne sont pas modifiables par le client.
select testkit.as_user(user_id, 'bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.expect_denied(format(
  'update public.profiles set email = %L where id = %L',
  'pirate@example.fr', (select user_id from testkit.fx where key = 'bob')));
select testkit.expect_denied(format(
  'update public.profiles set provider = %L where id = %L',
  'google', (select user_id from testkit.fx where key = 'bob')));
select testkit.expect_denied(format(
  'insert into public.profiles (id, email, display_name, provider) values (%L, %L, %L, %L)',
  gen_random_uuid(), 'x@example.fr', 'X', 'email'));
-- Un DELETE filtré par la RLS ne lève pas d'erreur : il ne touche aucune
-- ligne. C'est `affected` qu'il faut lire, pas `expect_denied`.
select testkit.eq(
  testkit.affected('delete from public.profiles'), 0::bigint,
  'un client ne supprime aucun profil, ni le sien ni celui d''un autre');

-- en revanche le client peut corriger son propre nom d'affichage
select testkit.eq(testkit.affected(format(
  'update public.profiles set display_name = %L where id = %L',
  'Bob M.', (select user_id from testkit.fx where key = 'bob'))), 1::bigint,
  'un client peut modifier son propre nom d''affichage');

-- Les préférences de rappel appartiennent au profil : c'est le serveur qui les
-- applique, pas une copie dans le navigateur. Le client les modifie donc, mais
-- seulement les siennes, et seulement avec une valeur admise.
select testkit.eq(testkit.affected(format(
  'update public.profiles set task_reminders_enabled = false, reminder_frequency = %L where id = %L',
  'matin', (select user_id from testkit.fx where key = 'bob'))), 1::bigint,
  'un client peut régler ses propres préférences de rappel');
select testkit.expect_denied(format(
  'update public.profiles set reminder_frequency = %L where id = %L',
  'quand-il-veux', (select user_id from testkit.fx where key = 'bob')),
  'une cadence de rappel hors enumération doit être refusée par la contrainte');
select testkit.eq(testkit.affected(format(
  'update public.profiles set task_reminders_enabled = false where id <> %L',
  (select user_id from testkit.fx where key = 'bob'))), 0::bigint,
  'un client ne modifie les préférences d''autrui : les profiles lus sont les siens');

reset role;

-- ---------------------------------------------------------------------------
-- 10. Buckets de stockage privés
-- ---------------------------------------------------------------------------
do $$
begin
  perform testkit.eq(
    (select count(*) from storage.buckets where id in ('household-media', 'household-avatars') and public = false),
    2::bigint,
    'les buckets de médias doivent exister et être privés'
  );
  perform testkit.ok(
    (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects') >= 4,
    'les politiques de stockage doivent être installées'
  );
end;
$$;

rollback;
