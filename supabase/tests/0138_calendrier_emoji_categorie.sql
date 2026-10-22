-- supabase/tests/0138_calendrier_emoji_categorie.sql
-- Emoji de catégorie d'événement (migration 0138).
--
-- CE QUI EST VÉRIFIÉ, ET POURQUOI LA COLONNE N'Y SUFFISAIT PAS. `icon` existait
-- depuis `0047` sans borne : une chaîne vide, un espace ou un caractère de
-- largeur nulle passait pour une icône posée. Le chip s'affichait alors sans
-- signe, et rien à l'écran ne disait pourquoi. Les assertions (a) à (d)
-- refusent ces formes ; (e) et (f) prouvent que les séquences composées
-- légitimes passent — un contrôle qui refuserait un drapeau serait pire que
-- pas de contrôle.
--
-- Le cas du bord insécable est celui qui a fait changer le contrôle : `btrim`
-- n'enlève que l'espace ASCII, donc il n'aurait pas vu '🎒' suivi de U+00A0.
-- L'assertion (b) est celle qui rougirait sur la première version.
--
-- Bornes (AGENTS.md §2.7D) : chaque insert et chaque comptage portent sur le
-- foyer `hh_t138`, jamais sur la table entière. Fichier autonome, `rollback`
-- final. Les cas acceptés passent par `expect_ok` : sans eux, un refus dû à une
-- colonne mal nommée serait pris pour un refus de la contrainte.

begin;

insert into public.households (id, name)
values ('hh_t138', 'Foyer Emoji');

-- ---------------------------------------------------------------------------
-- (a) Un bord espace est refusé.
-- ---------------------------------------------------------------------------
select testkit.expect_denied(
  $q$insert into public.event_categories (household_id, name, color, icon)
     values ('hh_t138', 'Bord espace', '#E8930C', ' 🎒')$q$,
  'un emoji précédé d''un espace est refusé');

-- ---------------------------------------------------------------------------
-- (b) Un bord insécable est refusé — le cas que `btrim` laissait passer.
-- ---------------------------------------------------------------------------
select testkit.expect_denied(
  $q$insert into public.event_categories (household_id, name, color, icon)
     values ('hh_t138', 'Bord insécable', '#E8930C', '🎒' || chr(160))$q$,
  'un emoji suivi d''un espace insécable est refusé');

-- ---------------------------------------------------------------------------
-- (c) Une valeur vide est refusée.
-- ---------------------------------------------------------------------------
select testkit.expect_denied(
  $q$insert into public.event_categories (household_id, name, color, icon)
     values ('hh_t138', 'Vide', '#E8930C', '')$q$,
  'une icône vide est refusée');

-- ---------------------------------------------------------------------------
-- (d) Plus de 32 signes est refusé.
-- ---------------------------------------------------------------------------
select testkit.expect_denied(
  $q$insert into public.event_categories (household_id, name, color, icon)
     values ('hh_t138', 'Trop long', '#E8930C', repeat('a', 33))$q$,
  'une icône de 33 signes est refusée');

-- ---------------------------------------------------------------------------
-- (e) Une séquence composée passe et se compte en signes (7 pour cette
--     famille), pas en unités UTF-16 (11).
-- ---------------------------------------------------------------------------
select testkit.expect_ok(
  $q$insert into public.event_categories (household_id, name, color, icon)
     values ('hh_t138', 'Famille', '#E8930C', '👨‍👩‍👧‍👦')$q$);

do $$
begin
  perform testkit.eq(
    testkit.count($q$select 1 from public.event_categories
                     where household_id = 'hh_t138' and name = 'Famille'
                       and icon = '👨‍👩‍👧‍👦' and char_length(icon) = 7$q$),
    1::bigint,
    'la famille en ZWJ est acceptée et vaut 7 signes');
end;
$$;

-- ---------------------------------------------------------------------------
-- (f) Une icône absente reste permise, et un sélecteur de variante en fin
--     n'est pas un bord invisible.
-- ---------------------------------------------------------------------------
select testkit.expect_ok(
  $q$insert into public.event_categories (household_id, name, color, icon)
     values ('hh_t138', 'Sans emoji', '#E8930C', null),
            ('hh_t138', 'Coeur', '#E8930C', '❤️')$q$);

do $$
begin
  perform testkit.eq(
    testkit.count($q$select 1 from public.event_categories
                     where household_id = 'hh_t138' and (icon is null or icon = '❤️')$q$),
    2::bigint,
    'NULL et « ❤️ » sont acceptés');
end;
$$;

rollback;
