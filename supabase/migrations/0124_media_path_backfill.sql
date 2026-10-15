-- 0124_media_path_backfill.sql
-- Médias du foyer : réparer les lignes DÉJÀ écrites, pas seulement le futur
-- (WR-08, D-01/D-02).
--
-- Le défaut
-- ---------
-- Cinq modules persistaient une URL signée de 30 jours au lieu du chemin
-- durable de l'objet : c'était la référence stockée en base, donc une fois le
-- jeton expiré (J+31) la photo était morte. D-01 aligne l'écriture sur la
-- convention « le chemin est la référence, l'URL se signe à la lecture » ; il
-- reste à réparer ce qui est déjà en base, sinon « la phase ne répare que le
-- futur ».
--
-- Pourquoi le rattrapage est possible
-- ------------------------------------
-- Une URL signée du Storage porte son chemin :
--
--   …/storage/v1/object/sign/<bucket>/<chemin>?token=…
--
-- On retire d'abord la chaîne de requête (`?token=…`), puis tout ce qui précède
-- le segment du bucket : il reste exactement le chemin dans le bucket.
--
-- Pourquoi un seul bucket est reconnu
-- ------------------------------------
-- Les six constantes de bucket du dépôt portent TOUTES la même chaîne
-- `'household-media'` :
--   app/src/lib/storage.ts:18            (HOUSEHOLD_MEDIA_BUCKET)
--   app/src/modules/cercle/api.ts:25     (CERCLES_BUCKET)
--   app/src/modules/voyages/api.ts:80    (TRIP_COVERS_BUCKET)
--   app/src/modules/prestataires/api.ts:16 (PROVIDER_ATTACHMENTS_BUCKET)
--   app/src/modules/adresses/api.ts:16   (PLACES_BUCKET)
--   app/src/modules/messages/api.ts:8    (MESSAGES_BUCKET)
-- Reconnaître un seul bucket est donc la règle réelle, pas une simplification.
-- Une URL signée d'un AUTRE bucket n'est pas un joker : elle est laissée
-- intacte (prouvé par le test 0124, cas (b)).
--
-- Doctrine du rattrapage (D-02)
-- ------------------------------
-- Les valeurs non analysables — URL externe saisie à la main, chemin déjà nu,
-- valeur absente — ne sont JAMAIS réécrites, et elles sont COMPTÉES dans le
-- rapport ci-dessous : pas de conversion devinée.
--
-- Correction vers l'avant (AGENTS.md §2.7 A.1) : aucune migration antérieure
-- n'est retouchée. Toute table s'écrit `public.*` (AGENTS.md §2.7 A.3) : sous
-- `set search_path = ''`, un nom nu ne se résout pas.
--
-- Idempotence
-- -----------
-- Rejouée, la migration ne trouve plus rien à réécrire : la fonction rend le
-- chemin tel quel, donc les dix `update` gardés ne touchent aucune ligne, et le
-- rapport affiche 0 réparée partout. L'auto-contrôle final reste vert.

begin;

-- ---------------------------------------------------------------------------
-- 1. Extraction du chemin d'une URL signée du bucket `household-media`.
--
--    `language sql`, `immutable`, `set search_path = ''` : aucun nom de table
--    n'est résolu dans le corps, donc rien à qualifier (`split_part` et
--    `regexp_replace` vivent dans `pg_catalog`, toujours résolu). La troisième
--    branche — `else p_value` — est celle qui protège toute valeur non
--    analysable : elle la rend telle quelle.
-- ---------------------------------------------------------------------------
create or replace function private.media_path_from_signed_url(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    -- Valeur absente : rien à extraire.
    when p_value is null then null
    -- URL signée du bucket : on retire la query string, puis tout ce qui
    -- précède le segment du bucket. Le `.*` est greedy à dessein : il prend la
    -- DERNIÈRE occurrence de `/object/sign/household-media/`.
    when p_value like '%/object/sign/household-media/%'
      then regexp_replace(
             split_part(p_value, '?', 1),
             '^.*/object/sign/household-media/',
             ''
           )
    -- Toute autre forme (URL externe, chemin nu, autre bucket, `data:`,
    -- `blob:`, `/…`) : rendue telle quelle.
    else p_value
  end;
$$;

comment on function private.media_path_from_signed_url(text) is
  'Extrait le chemin d''une URL signée du bucket household-media ; laisse toute autre valeur intacte.';

-- Une fonction créée APRÈS 0009_grants.sql reçoit l'EXECUTE par défaut d'une
-- fonction neuve (accordé à PUBLIC), et le `grant … on all functions` de 0009
-- était ponctuel : il ne pouvait pas la couvrir. On retire donc explicitement
-- l'EXECUTE. `authenticated` ne détient aucun droit sur une fonction postérieure
-- à 0009, et il ne faut pas lui en donner : le rattrapage est une opération
-- d'exploitation, jamais une surface d'appel client. Révocation depuis `public`
-- seul suffit : `authenticated` en hérite l'exclusion.
revoke all on function private.media_path_from_signed_url(text) from public;

-- ---------------------------------------------------------------------------
-- 2. Rapport AVANT réécriture, colonne par colonne.
--
--    Requête STATIQUE (pas de SQL dynamique : la liste des colonnes reste
--    lisible). Deux comptes par colonne :
--      * réparables : la fonction change la valeur ;
--      * laissées en place : URL http non réécrite (externe, autre bucket) —
--        ce que D-02 exige de compter.
--    `is distinct from` / `is not distinct from` et pas `=` : `null` ne doit
--    pas disparaître des comptes.
-- ---------------------------------------------------------------------------
--    La liste des dix libellés est posée à part et LEFT JOINée au relevé : sans
--    cela, `group by libelle` sur un relevé vide ne rend AUCUN groupe, et le
--    rapport n'afficherait aucune ligne au lieu des dix attendues. `count(v.x)`
--    et non `count(*)` : la ligne de gauche d'un libellé sans correspondance ne
--    doit pas se compter elle-même.
do $$
declare
  r record;
begin
  for r in
    select l.libelle,
           count(v.x) filter (
             where v.x is distinct from private.media_path_from_signed_url(v.x)
           ) as reparable,
           count(v.x) filter (
             where v.x like 'http%'
               and v.x is not distinct from private.media_path_from_signed_url(v.x)
           ) as non_analysable
      from (values
        ('note_attachments.file_url'),
        ('birthdays.photo_url'),
        ('contacts.photo_url'),
        ('pets.photo_url'),
        ('pet_attachments.file_url'),
        ('post_media.url'),
        ('products.photo_url'),
        ('gift_items.photo_url'),
        ('gift_ideas.photo_url'),
        ('ardoises.cover_url')
      ) as l(libelle)
      left join (
        select 'note_attachments.file_url'::text as libelle, file_url as x
          from public.note_attachments
        union all select 'birthdays.photo_url',  photo_url from public.birthdays
        union all select 'contacts.photo_url',   photo_url from public.contacts
        union all select 'pets.photo_url',       photo_url from public.pets
        union all select 'pet_attachments.file_url', file_url from public.pet_attachments
        union all select 'post_media.url',       url       from public.post_media
        union all select 'products.photo_url',   photo_url from public.products
        union all select 'gift_items.photo_url', photo_url from public.gift_items
        union all select 'gift_ideas.photo_url', photo_url from public.gift_ideas
        union all select 'ardoises.cover_url',   cover_url from public.ardoises
      ) as v on v.libelle = l.libelle
     group by l.libelle
     order by l.libelle
  loop
    raise notice '% : % réparée(s), % laissée(s)', r.libelle, r.reparable, r.non_analysable;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Les dix réécritures gardées.
--
--    La garde EST l'expression : elle sélectionne exactement les lignes que la
--    fonction change, donc la garde et la réécriture ne peuvent pas diverger.
--    `is distinct from` traite `null` comme « inchangé » (pas réécrit). Chaque
--    table s'écrit `public.*`.
-- ---------------------------------------------------------------------------
update public.note_attachments
   set file_url = private.media_path_from_signed_url(file_url)
 where file_url is distinct from private.media_path_from_signed_url(file_url);

update public.birthdays
   set photo_url = private.media_path_from_signed_url(photo_url)
 where photo_url is distinct from private.media_path_from_signed_url(photo_url);

update public.contacts
   set photo_url = private.media_path_from_signed_url(photo_url)
 where photo_url is distinct from private.media_path_from_signed_url(photo_url);

update public.pets
   set photo_url = private.media_path_from_signed_url(photo_url)
 where photo_url is distinct from private.media_path_from_signed_url(photo_url);

update public.pet_attachments
   set file_url = private.media_path_from_signed_url(file_url)
 where file_url is distinct from private.media_path_from_signed_url(file_url);

update public.post_media
   set url = private.media_path_from_signed_url(url)
 where url is distinct from private.media_path_from_signed_url(url);

update public.products
   set photo_url = private.media_path_from_signed_url(photo_url)
 where photo_url is distinct from private.media_path_from_signed_url(photo_url);

update public.gift_items
   set photo_url = private.media_path_from_signed_url(photo_url)
 where photo_url is distinct from private.media_path_from_signed_url(photo_url);

update public.gift_ideas
   set photo_url = private.media_path_from_signed_url(photo_url)
 where photo_url is distinct from private.media_path_from_signed_url(photo_url);

update public.ardoises
   set cover_url = private.media_path_from_signed_url(cover_url)
 where cover_url is distinct from private.media_path_from_signed_url(cover_url);

-- ---------------------------------------------------------------------------
-- 4. Preuve d'efficacité (AGENTS.md §2.7 F).
--
--    On recomptera la MÊME liste de colonnes ; si une URL signée du bucket
--    subsiste, la migration échoue bruyamment (et sera rejouée) au lieu de
--    rapporter un succès muet. Sans ce bloc, un `update` qui ne touche aucune
--    ligne se présenterait comme un succès, sans rien expliquer.
-- ---------------------------------------------------------------------------
do $$
declare
  restant bigint;
begin
  select count(*) into restant
    from (
      select file_url as x from public.note_attachments
      union all select photo_url from public.birthdays
      union all select photo_url from public.contacts
      union all select photo_url from public.pets
      union all select file_url  from public.pet_attachments
      union all select url       from public.post_media
      union all select photo_url from public.products
      union all select photo_url from public.gift_items
      union all select photo_url from public.gift_ideas
      union all select cover_url from public.ardoises
    ) as valeurs
   where x like '%/object/sign/household-media/%';

  if restant > 0 then
    raise exception '0124 : % URL signée(s) du bucket subsistent après réécriture', restant;
  end if;

  raise notice '0124 : aucune URL signée du bucket ne subsiste ; rattrapage effectif.';
end;
$$;

commit;
