-- supabase/tests/0170_account_deletion_multifoyer_snapshot.test.sql
-- Tests de l'instantané de restauration PAR LIGNE membre (phase 27, plan
-- 27-04 — clôture CR-02, WR-02 ; vérités WR-01/WR-03 posées en commentaires
-- de 0170, non comportementales).
--
-- Ce qui est prouvé ici (§2.7 D : comptages bornés, un cas négatif par garde) :
--   1. CR-02 — un utilisateur membre de TROIS foyers (noms et avatars
--      distincts, dont un avatar NULL porteur) est déshumanisé partout
--      (D-02 homogène), puis l'annulation restitue EXACTEMENT le nom et
--      l'avatar de CHAQUE foyer depuis sa ligne d'instantané — le nom
--      d'ancrage ne se propage plus aux autres foyers (défaut 0167).
--   2. Négatif : annuler sans demande active → P0002 (motif 0167).
--   3. WR-02 — deletion_media_claim retourne le bucket_id de chaque ligne ;
--      deux jumeaux de même storage_path dans deux buckets sont rendus
--      DISTINCTS ; une ligne marquée purgée disparaît du claim suivant et un
--      double marquage ne re-mark pas ; et la purge J+30 consigne bien le
--      bucket de chaque objet du foyer orphelin au manifest (deux buckets,
--      même chemin → deux lignes de manifest).
--
-- Toute assertion sur les fonctions passe par leur DÉFINITION EFFECTIVE
-- exécutée, jamais par le texte du fichier (§2.7 D.6).

begin;

-- ---------------------------------------------------------------
-- Semis : bob, membre de trois foyers.
--   alpha : « Bob Maison »,  avatar 'alpha-170.png'
--   beta  : « Bob Travail », avatar 'beta-170.png'
--   gamma : « Bob Gamma »,   avatar NULL (état porteur)
-- ---------------------------------------------------------------
do $$
declare
  bob uuid := testkit.auth_user('t170-bob@example.fr', 'Bob 170');
  h_alpha text := testkit.household(bob, 'Foyer 170 A');
  h_beta text := testkit.household(bob, 'Foyer 170 B');
  h_gamma text := testkit.household(bob, 'Foyer 170 C');
begin
  insert into testkit.fx (key, user_id, household_id, row_id)
    values ('bob', bob, h_alpha, testkit.member(h_alpha, bob, 'Bob Maison', 'admin'));
  insert into testkit.fx (key, user_id, household_id, row_id)
    values ('h_beta', bob, h_beta, testkit.member(h_beta, bob, 'Bob Travail', 'admin'));
  insert into testkit.fx (key, user_id, household_id, row_id)
    values ('h_gamma', bob, h_gamma, testkit.member(h_gamma, bob, 'Bob Gamma', 'admin'));

  update public.household_members
     set avatar_url = 'alpha-170.png'
   where id = (select row_id from testkit.fx where key = 'bob');
  update public.household_members
     set avatar_url = 'beta-170.png'
   where id = (select row_id from testkit.fx where key = 'h_beta');
  -- gamma : avatar laissé NULL — le cas porteur.
end;
$$;

-- ---------------------------------------------------------------
-- 1. La demande : déshumanisation homogène, instantané par ligne AVANT.
-- ---------------------------------------------------------------
do $$
declare
  bob uuid := (select user_id from testkit.fx where key = 'bob');
  v_request_id uuid;
begin
  perform testkit.as_user(bob, 't170-bob@example.fr');
  set local role authenticated;
  select public.request_account_deletion(bob) into v_request_id;
  perform testkit.ok(v_request_id is not null, 'la demande renvoie son identifiant');
end;
$$;
reset role;

do $$
declare
  bob uuid := (select user_id from testkit.fx where key = 'bob');
  h_alpha text := (select household_id from testkit.fx where key = 'bob');
  h_beta text := (select household_id from testkit.fx where key = 'h_beta');
  h_gamma text := (select household_id from testkit.fx where key = 'h_gamma');
begin
  -- D-02 homogène : CHAQUE foyer voit « Ancien membre », sans avatar.
  perform testkit.eq(
    testkit.count(format(
      'select 1 from public.household_members m where m.household_id = %L and m.user_id = %L and m.display_name = ''Ancien membre'' and m.avatar_url is null and m.account_deleted_at is not null', h_alpha, bob)),
    1::bigint,
    'foyer alpha : la ligne est déshumanisée (D-02)');
  perform testkit.eq(
    testkit.count(format(
      'select 1 from public.household_members m where m.household_id = %L and m.user_id = %L and m.display_name = ''Ancien membre'' and m.avatar_url is null and m.account_deleted_at is not null', h_beta, bob)),
    1::bigint,
    'foyer beta : la ligne est déshumanisée (D-02)');
  perform testkit.eq(
    testkit.count(format(
      'select 1 from public.household_members m where m.household_id = %L and m.user_id = %L and m.display_name = ''Ancien membre'' and m.avatar_url is null and m.account_deleted_at is not null', h_gamma, bob)),
    1::bigint,
    'foyer gamma : la ligne est déshumanisée (D-02)');

  -- Instantané par ligne : UNE ligne par foyer, valeurs d'origine capturées
  -- AVANT déshumanisation (bornage par user_id, jamais un comptage global).
  perform testkit.eq(
    testkit.count(format(
      'select 1 from private.account_deletion_restoration_members c where c.user_id = %L', bob)),
    3::bigint,
    'l''instantané par ligne porte UNE ligne par foyer (3 foyers)');
  perform testkit.ok(exists (
      select 1 from private.account_deletion_restoration_members c
       where c.user_id = bob
         and c.household_id = h_alpha
         and c.former_member_display_name = 'Bob Maison'
         and c.former_member_avatar_url = 'alpha-170.png'),
    'instantané alpha : nom et avatar d''origine capturés');
  perform testkit.ok(exists (
      select 1 from private.account_deletion_restoration_members c
       where c.user_id = bob
         and c.household_id = h_gamma
         and c.former_member_display_name = 'Bob Gamma'
         and c.former_member_avatar_url is null),
    'instantané gamma : l''avatar NULL d''origine est capturé tel quel');
end;
$$;

-- ---------------------------------------------------------------
-- 2. L'annulation : CHAQUE foyer retrouve SON nom et SON avatar (CR-02).
-- ---------------------------------------------------------------
do $$
declare
  bob uuid := (select user_id from testkit.fx where key = 'bob');
begin
  perform testkit.as_user(bob, 't170-bob@example.fr');
  set local role authenticated;
  perform public.cancel_account_deletion(bob);
end;
$$;
reset role;

do $$
declare
  bob uuid := (select user_id from testkit.fx where key = 'bob');
  m_alpha text := (select row_id from testkit.fx where key = 'bob');
  m_beta text := (select row_id from testkit.fx where key = 'h_beta');
  m_gamma text := (select row_id from testkit.fx where key = 'h_gamma');
begin
  perform testkit.ok(exists (
      select 1 from public.household_members m where m.id = m_alpha
        and m.account_deleted_at is null
        and m.display_name = 'Bob Maison'
        and m.avatar_url = 'alpha-170.png'),
    'CR-02 : le foyer alpha retrouve exactement « Bob Maison » et son avatar');
  perform testkit.ok(exists (
      select 1 from public.household_members m where m.id = m_beta
        and m.account_deleted_at is null
        and m.display_name = 'Bob Travail'
        and m.avatar_url = 'beta-170.png'),
    'CR-02 : le foyer beta retrouve exactement « Bob Travail » et son avatar (le nom d''ancrage ne se propage plus)');
  perform testkit.ok(exists (
      select 1 from public.household_members m where m.id = m_gamma
        and m.account_deleted_at is null
        and m.display_name = 'Bob Gamma'
        and m.avatar_url is null),
    'CR-02 : le foyer gamma retrouve « Bob Gamma » et son avatar NULL restauré comme NULL');
  perform testkit.ok(exists (
      select 1 from public.profiles p where p.id = bob
        and p.display_name = 'Bob 170'),
    'le profil retrouve son nom depuis l''instantané parent');

  -- Aucune ligne n'a reçu le nom d'ancrage par erreur.
  perform testkit.eq(
    testkit.count(format(
      'select 1 from public.household_members m where m.user_id = %L and m.display_name = ''Bob Maison''', bob)),
    1::bigint,
    'CR-02 : « Bob Maison » n''existe que dans le foyer alpha');
end;
$$;

-- ---------------------------------------------------------------
-- 3. Négatif : annuler sans demande active → P0002 (motif 0167).
-- ---------------------------------------------------------------
do $$
declare
  bob uuid := (select user_id from testkit.fx where key = 'bob');
begin
  perform testkit.as_user(bob, 't170-bob@example.fr');
  set local role authenticated;
  perform testkit.expect_denied(
    format('select public.cancel_account_deletion(%L::uuid)', bob),
    'annuler sans demande active est refusé (P0002)');
end;
$$;
reset role;

-- ---------------------------------------------------------------
-- 4. WR-02 — le claim porte le bucket, les jumeaux cross-bucket sont
--    distingués, le marquage n'est pas répétable.
-- ---------------------------------------------------------------
do $$
declare
  v_id1 uuid;
  v_id2 uuid;
  v_claim jsonb;
  v_marked integer;
begin
  -- Deux jumeaux : même (household_id, storage_path), buckets distincts.
  insert into private.account_deletion_media_manifest (household_id, storage_path, bucket_id)
    values ('h170-jumeaux', 'h170-jumeaux/x.png', 'household-media')
    returning id into v_id1;
  insert into private.account_deletion_media_manifest (household_id, storage_path, bucket_id)
    values ('h170-jumeaux', 'h170-jumeaux/x.png', 'notes-media')
    returning id into v_id2;

  select public.deletion_media_claim(10) into v_claim;

  perform testkit.eq(
    (select count(*) from jsonb_array_elements(v_claim -> 'rows') r
      where r ->> 'id' = v_id1::text and r ->> 'bucket_id' = 'household-media'),
    1::bigint,
    'WR-02 : le claim retourne le jumeau de household-media avec SON bucket_id');
  perform testkit.eq(
    (select count(*) from jsonb_array_elements(v_claim -> 'rows') r
      where r ->> 'id' = v_id2::text and r ->> 'bucket_id' = 'notes-media'),
    1::bigint,
    'WR-02 : le claim retourne le jumeau de notes-media avec SON bucket_id');

  v_marked := public.deletion_media_mark_purged(array[v_id1]);
  perform testkit.eq(v_marked, 1, 'le premier jumeau est marqué purgé une fois');

  v_marked := public.deletion_media_mark_purged(array[v_id1]);
  perform testkit.eq(v_marked, 0, 'un double marquage ne re-mark pas (déjà purgé)');

  select public.deletion_media_claim(10) into v_claim;
  perform testkit.eq(
    (select count(*) from jsonb_array_elements(v_claim -> 'rows') r
      where r ->> 'id' = v_id1::text),
    0::bigint,
    'le jumeau purgé disparaît du claim suivant');
  perform testkit.eq(
    (select count(*) from jsonb_array_elements(v_claim -> 'rows') r
      where r ->> 'id' = v_id2::text and r ->> 'bucket_id' = 'notes-media'),
    1::bigint,
    'le second jumeau (autre bucket) reste à purger — pas de confusion cross-bucket');
end;
$$;

-- ---------------------------------------------------------------
-- 5. WR-02 côté purge : le manifest construit par la purge J+30 porte le
--    bucket de CHAQUE objet — deux buckets, même chemin → DEUX lignes.
-- ---------------------------------------------------------------
do $$
declare
  zed uuid := testkit.auth_user('t170-zed@example.fr', 'Zed 170');
  h3 text := testkit.household(zed, 'Foyer 170 orphelin');
  v_result jsonb;
  v_count integer;
begin
  insert into testkit.fx (key, user_id, household_id, row_id)
    values ('zed', zed, h3, testkit.member(h3, zed, 'Membre Zed 170', 'admin'));

  -- Deux objets de MÊME chemin dans DEUX buckets du futur foyer orphelin.
  -- Bucket secondaire semé (FK objects_bucketId) : la démonstration exige un
  -- vrai second bucket privé — c'est le cas WR-02, deux buckets qui portent
  -- le même chemin.
  insert into storage.buckets (id, name)
    values ('notes-media', 'notes-media');
  insert into storage.objects (bucket_id, name)
    values ('household-media', h3 || '/jumeau.png');
  insert into storage.objects (bucket_id, name)
    values ('notes-media', h3 || '/jumeau.png');

  -- Déshumanisation semée à la main (le RPC exige une session, le cron n'en
  -- a pas — motif 0168) puis demande DUE.
  update public.profiles
     set display_name = 'Ancien membre', avatar_url = null
   where id = zed;
  update public.household_members
     set account_deleted_at = now(),
         display_name = 'Ancien membre',
         avatar_url = null
   where user_id = zed;
  insert into public.account_deletion_requests (user_id, purge_due_at)
    values (zed, now() - interval '1 day');

  select private.purge_expired_account_deletions() into v_result;
  perform testkit.eq((v_result ->> 'manifest_rows')::integer, 2,
    'WR-02 : deux buckets, même chemin → DEUX lignes de manifest (l''unicité élargie ne fusionne plus les jumeaux)');
  perform testkit.eq((v_result ->> 'households_deleted')::integer, 1,
    'le foyer orphelin est supprimé (D-09)');

  select count(*) into v_count
    from private.account_deletion_media_manifest
   where household_id = h3
     and storage_path = h3 || '/jumeau.png'
     and bucket_id in ('household-media', 'notes-media');
  perform testkit.eq(v_count, 2,
    'WR-02 : chaque ligne de manifest porte le bucket_id de SON objet');
end;
$$;

rollback;
