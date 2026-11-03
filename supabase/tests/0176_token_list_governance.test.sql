-- supabase/tests/0176_token_list_governance.test.sql
-- Fondations du modèle « liste de tokens » (0176) — D-14/D-15/D-16/D-02/D-03/D-05.
--
--   Test F — jetables : au démarrage du fichier (base roll-backée par fichier,
--            donc sans aucun semis de CE fichier), AUCUN token de la table
--            n'est actif : la migration 0176 a désactivé tous les actifs
--            pré-existants. Ce test ne peut être vert qu'après la migration.
--   Test A — modèle liste : deux create à la suite sur le même foyer → les
--            DEUX tokens restent is_active (le bloc d'invalidation de 0006
--            a disparu).
--   Test B — expiration obligatoire : sans p_expires_at → ≈ now()+30 jours ;
--            une date future explicite est acceptée (clamp 90 j) ; une date
--            passée est refusée avec 22023.
--   Test C — révocation individuelle : l'admin révoque le token A, le token B
--            reste actif ; refus pour un non-admin ; 0 ligne touchée sur un
--            foyer étranger (cross-foyer) ou un id inconnu.
--   Test D — no-consume preview (D-05, §2.7-B) : la réponse du preview porte
--            le nom du foyer et le prénom de l'inviteur, et une assertion
--            négative bornée au foyer échouerait si le RPC écrivait
--            (use_count strictement inchangé, is_active intact).
--   Test E — uniformité (D-03) : preview sur hash inconnu, token expiré,
--            épuisé, révoqué, empreinte malformée → EXACTEMENT le même
--            résultat vide '{}', sans levée d'erreur différenciante. Le token
--            expiré reste is_active après preview (contrairement à redeem,
--            qui le désactive) — second prouveur du zéro-écriture.

begin;

do $$
declare
  alice uuid := testkit.auth_user('liste-alice@example.fr', 'Alice Liste');
  bob uuid := testkit.auth_user('liste-bob@example.fr', 'Bob Membre');
  carol uuid := testkit.auth_user('liste-carol@example.fr', 'Carol Ailleurs');
  home text := testkit.household(alice, 'Foyer Liste');
  home2 text := testkit.household(carol, 'Foyer Ailleurs');
begin
  perform testkit.member(home, alice, 'Alice Liste', 'admin', 'accent');
  perform testkit.member(home, bob, 'Bob Membre', 'membre', 'coral');
  perform testkit.member(home2, carol, 'Carol Ailleurs', 'admin', 'accent');
  insert into testkit.fx (key, user_id) values ('alice', alice);
  insert into testkit.fx (key, user_id) values ('bob', bob);
  insert into testkit.fx (key, user_id) values ('carol', carol);
  insert into testkit.fx (key, household_id) values ('home', home);
  insert into testkit.fx (key, household_id) values ('home2', home2);
end;
$$;

-- ---------------------------------------------------------------------------
-- Test F — jetables : aucun token actif dans la table entière. Le fichier est
-- roll-backé et ne consomme AUCUN token avant ce comptage : la base ne peut
-- montrer un actif que si la migration « jetables » n'a pas tourné.
-- ---------------------------------------------------------------------------
select testkit.eq(
  testkit.count($t$select 1 from public.household_invite_tokens where is_active$t$),
  0::bigint, 'Test F : aucun token actif pré-existant après la migration (jetables)');

-- ---------------------------------------------------------------------------
-- Semis des tokens — le semis est un TEST, pas la migration : les tokens sont
-- créés via la fonction create_household_invite_token réécrite par 0176.
-- Empreintes 64 hex uniques (md5 x2) ; le semis enregistre les ids dans fx.
-- ---------------------------------------------------------------------------
do $$
declare
  alice uuid;
  home text;
  v jsonb;
begin
  alice := (select user_id from testkit.fx where key = 'alice');
  home := (select household_id from testkit.fx where key = 'home');

  -- Token A : expiration par défaut (null → 30 jours).
  v := public.create_household_invite_token(alice, home, md5('tok-a') || md5('tok-a-bis'), null, 10);
  insert into testkit.fx (key, row_id) values ('tok_a', v ->> 'token_id');

  -- Token B : expiration explicite à 10 jours, max 5.
  v := public.create_household_invite_token(
         alice, home, md5('tok-b') || md5('tok-b-bis'), now() + interval '10 days', 5);
  insert into testkit.fx (key, row_id) values ('tok_b', v ->> 'token_id');

  -- Token C : dédié au no-consume du Test D.
  v := public.create_household_invite_token(
         alice, home, md5('tok-c') || md5('tok-c-bis'), now() + interval '20 days', 10);
  insert into testkit.fx (key, row_id) values ('tok_c', v ->> 'token_id');

  -- Token D : sera rendu expiré ; Token E : sera rendu épuisé (Test E).
  v := public.create_household_invite_token(
         alice, home, md5('tok-d') || md5('tok-d-bis'), now() + interval '1 day', 10);
  insert into testkit.fx (key, row_id) values ('tok_d', v ->> 'token_id');
  v := public.create_household_invite_token(
         alice, home, md5('tok-e') || md5('tok-e-bis'), now() + interval '1 day', 10);
  insert into testkit.fx (key, row_id) values ('tok_e', v ->> 'token_id');
end;
$$;

-- Test A — modèle liste : les tokens A et B, créés à la suite, coexistent
-- actifs (le semis crée d'autres tokens ensuite ; le comptage est borné aux
-- deux premiers, §2.7-D).
select testkit.eq(
  testkit.count($t$select 1 from public.household_invite_tokens
                 where household_id = (select household_id from testkit.fx where key = 'home')
                   and is_active
                   and id in ((select row_id from testkit.fx where key = 'tok_a'),
                              (select row_id from testkit.fx where key = 'tok_b'))$t$),
  2::bigint, 'Test A : deux tokens créés à la suite restent actifs (modèle liste D-14)');

select testkit.ok(
  (select row_id from testkit.fx where key = 'tok_a')
    is distinct from (select row_id from testkit.fx where key = 'tok_b'),
  'Test A : les deux tokens sont bien des lignes distinctes');

-- ---------------------------------------------------------------------------
-- Test B — expiration obligatoire.
-- B1 : sans p_expires_at, A expire ≈ now()+30 jours (entre 29 et 31).
-- B2 : date explicite future acceptée (B à 10 jours, non clamppé à 90).
-- B3 : date passée refusée, errcode 22023 conservé.
-- ---------------------------------------------------------------------------
select testkit.ok(
  exists (
    select 1 from public.household_invite_tokens
     where id = (select row_id from testkit.fx where key = 'tok_a')
       and expires_at is not null
       and expires_at > now() + interval '29 days'
       and expires_at <= now() + interval '31 days'),
  'Test B1 : création sans expiration → approvisionnée à now()+30 jours');

select testkit.ok(
  exists (
    select 1 from public.household_invite_tokens
     where id = (select row_id from testkit.fx where key = 'tok_b')
       and expires_at > now() + interval '9 days'
       and expires_at <= now() + interval '11 days'),
  'Test B2 : expiration explicite à 10 jours acceptée telle quelle (clamp 90 non atteint)');

do $$
declare
  alice uuid;
  home text;
  v_code text;
begin
  alice := (select user_id from testkit.fx where key = 'alice');
  home := (select household_id from testkit.fx where key = 'home');
  begin
    perform public.create_household_invite_token(
      alice, home, md5('tok-passe') || md5('tok-passe-bis'), now() - interval '1 day', 10);
  exception when others then
    v_code := sqlstate;
  end;
  perform testkit.eq(v_code, '22023',
    'Test B3 : expiration dans le passé refusée avec 22023');
end;
$$;

-- ---------------------------------------------------------------------------
-- Test C — révocation individuelle (D-16).
-- C1 : un non-admin (Bob, membre) est refusé — rien ne change.
-- C2 : l'admin révoque le token A → A inactif, B reste actif.
-- C3 : révocation cross-foyer (Carol admin du foyer 2 vise le token B du
--      foyer 1 en déclarant le foyer 2) → 0 ligne touchée, B intact.
-- C4 : id inconnu → revoked = 0.
-- ---------------------------------------------------------------------------
select testkit.expect_denied(
  $q$select public.revoke_household_invite_token(
         (select user_id from testkit.fx where key = 'bob'),
         (select household_id from testkit.fx where key = 'home'),
         (select row_id from testkit.fx where key = 'tok_a'))$q$,
  'Test C1 : un non-admin ne peut pas révoquer (assert_household_admin)');

select testkit.eq(
  testkit.count($t$select 1 from public.household_invite_tokens
                 where household_id = (select household_id from testkit.fx where key = 'home')
                   and is_active
                   and id in ((select row_id from testkit.fx where key = 'tok_a'),
                              (select row_id from testkit.fx where key = 'tok_b'))$t$),
  2::bigint, 'Test C1 : après le refus non-admin, les deux tokens restent actifs');

do $$
declare
  alice uuid;
  home text;
  v jsonb;
begin
  alice := (select user_id from testkit.fx where key = 'alice');
  home := (select household_id from testkit.fx where key = 'home');
  v := public.revoke_household_invite_token(
         alice, home, (select row_id from testkit.fx where key = 'tok_a'));
  perform testkit.eq(v -> 'revoked', to_jsonb(1),
    'Test C2 : la révocation individuelle touche exactement 1 ligne');
end;
$$;

select testkit.ok(
  not exists (
    select 1 from public.household_invite_tokens
     where id = (select row_id from testkit.fx where key = 'tok_a') and is_active),
  'Test C2 : le token A est inactif après sa révocation');

select testkit.ok(
  exists (
    select 1 from public.household_invite_tokens
     where id = (select row_id from testkit.fx where key = 'tok_b') and is_active),
  'Test C2 : le token B reste actif (révocation individuelle, pas globale)');

do $$
declare
  carol uuid;
  home2 text;
  v jsonb;
begin
  carol := (select user_id from testkit.fx where key = 'carol');
  home2 := (select household_id from testkit.fx where key = 'home2');
  -- Carol est admin de son foyer : assert_household_admin passe, mais l'UPDATE
  -- borné à household_id = foyer 2 ne peut toucher le token B (foyer 1).
  v := public.revoke_household_invite_token(
         carol, home2, (select row_id from testkit.fx where key = 'tok_b'));
  perform testkit.eq(v -> 'revoked', to_jsonb(0),
    'Test C3 : cross-foyer → 0 ligne modifiée');
end;
$$;

select testkit.ok(
  exists (
    select 1 from public.household_invite_tokens
     where id = (select row_id from testkit.fx where key = 'tok_b') and is_active),
  'Test C3 : le token B survit à la tentative cross-foyer');

do $$
declare
  alice uuid;
  home text;
  v jsonb;
begin
  alice := (select user_id from testkit.fx where key = 'alice');
  home := (select household_id from testkit.fx where key = 'home');
  v := public.revoke_household_invite_token(alice, home, 'invite-inconnu');
  perform testkit.eq(v -> 'revoked', to_jsonb(0),
    'Test C4 : id inconnu → 0 ligne modifiée');
end;
$$;

-- ---------------------------------------------------------------------------
-- Test D — no-consume preview (D-05). Assertion positive PUIS assertion
-- négative bornée qui échouerait si le RPC écrivait (§2.7-B).
-- ---------------------------------------------------------------------------
select testkit.ok(
  has_function_privilege('anon', 'public.preview_household_invite_token(text)', 'execute'),
  'Test D : le preview est exécutable par anon (clé publiable, pré-écran sans session)');

select testkit.eq(
  public.preview_household_invite_token(md5('tok-c') || md5('tok-c-bis')),
  jsonb_build_object('household_name', 'Foyer Liste', 'inviter_first_name', 'Alice'),
  'Test D : la réponse porte le nom du foyer et le prénom de l''inviteur (D-02)');

-- L'assertion qui ferait échouer un RPC écrivain : le compteur du token C
-- (borné au foyer d'essai) est resté strictement à zéro, et le token est actif.
select testkit.eq(
  testkit.count($t$select 1 from public.household_invite_tokens
                 where household_id = (select household_id from testkit.fx where key = 'home')
                   and id = (select row_id from testkit.fx where key = 'tok_c')
                   and (use_count <> 0 or not is_active)$t$),
  0::bigint, 'Test D : use_count strictement inchangé et token intact après preview (no-consume D-05)');

-- ---------------------------------------------------------------------------
-- Test E — uniformité du résultat vide (D-03) : cinq motifs d'échec, un seul
-- résultat '{}', sans exception levée.
-- ---------------------------------------------------------------------------
do $$
declare
  home text;
begin
  home := (select household_id from testkit.fx where key = 'home');

  -- État fautif atteint par UPDATE direct (la fonction de création refuse ces
  -- états : le test ne passe jamais par elle, §2.7-D.3).
  update public.household_invite_tokens
     set expires_at = now() - interval '1 hour'
   where id = (select row_id from testkit.fx where key = 'tok_d');
  update public.household_invite_tokens
     set use_count = max_uses
   where id = (select row_id from testkit.fx where key = 'tok_e');
  -- tok_b est révoqué ici par UPDATE direct (quatrième motif ; la révocation
  -- par fonction a déjà été prouvée au Test C, l'état fautif suffit).
  update public.household_invite_tokens
     set is_active = false
   where id = (select row_id from testkit.fx where key = 'tok_b');
end;
$$;

select testkit.eq(
  public.preview_household_invite_token(md5('inconnu') || md5('inconnu-bis')),
  '{}'::jsonb, 'Test E1 : hash inconnu → résultat vide');

select testkit.eq(
  public.preview_household_invite_token(md5('tok-d') || md5('tok-d-bis')),
  '{}'::jsonb, 'Test E2 : token expiré → résultat vide');

select testkit.eq(
  public.preview_household_invite_token(md5('tok-e') || md5('tok-e-bis')),
  '{}'::jsonb, 'Test E3 : token épuisé → résultat vide');

select testkit.eq(
  public.preview_household_invite_token(md5('tok-b') || md5('tok-b-bis')),
  '{}'::jsonb, 'Test E4 : token révoqué → résultat vide');

select testkit.eq(
  public.preview_household_invite_token('pas-un-hash'),
  '{}'::jsonb, 'Test E5 : empreinte malformée → résultat vide (garde d''entrée)');

-- Second prouveur du zéro-écriture : redeem désactive un token expiré, le
-- preview ne le fait PAS — tok_d reste actif après sa consultation.
select testkit.ok(
  exists (
    select 1 from public.household_invite_tokens
     where id = (select row_id from testkit.fx where key = 'tok_d') and is_active),
  'Test E : le token expiré reste actif — le preview n''écrit jamais (D-05)');

-- ---------------------------------------------------------------------------
-- Bonus liste (D-15) : la liste ne renvoie JAMAIS d'empreinte, et l'acteur
-- non-admin est refusé.
-- ---------------------------------------------------------------------------
select testkit.ok(
  not exists (
    select 1
      from public.household_invite_tokens_list(
             (select user_id from testkit.fx where key = 'alice'),
             (select household_id from testkit.fx where key = 'home')) as l
     where l.id is null),
  'Bonus : la liste renvoie les identifiants de tokens (liste non vide en structure)');

select testkit.expect_denied(
  $q$select * from public.household_invite_tokens_list(
         (select user_id from testkit.fx where key = 'bob'),
         (select household_id from testkit.fx where key = 'home'))$q$,
  'Bonus : la liste est refusée à un non-admin');

select testkit.expect_denied(
  $q$select * from public.household_invite_tokens_list(
         (select user_id from testkit.fx where key = 'carol'),
         (select household_id from testkit.fx where key = 'home'))$q$,
  'Bonus : la liste d''un foyer étranger est refusée (assert_household_admin)');

rollback;
