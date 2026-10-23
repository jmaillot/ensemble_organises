-- 0138_calendrier_emoji_categorie.sql
-- Emoji d'une catégorie d'événement : la colonne `event_categories.icon`
-- existe depuis `0047`, mais rien ne bornait son contenu. Une valeur vide ou
-- invisible (espace insécable, largeur nulle) passerait pour une icône posée et
-- donnerait un chip sans emoji — un défaut qu'on ne voit qu'à l'écran.
--
-- La borne haute est large à dessein : 32 caractères couvrent les séquences
-- composées (drapeaux, familles en ZWJ) sans ouvrir la porte à un paragraphe.
-- `char_length` compte ces séquences en signes, pas en unités UTF-16 : la
-- famille 👨‍👩‍👧‍👦 vaut 7, pas 11.
--
-- Le bord se refuse par classe de caractères, pas par `btrim` : celui-ci
-- n'enlève que l'espace ASCII, donc '🎒' suivi d'un espace insécable passait.
-- Sont exclus en bord l'espace (toutes variantes `[[:space:]]`), la largeur
-- nulle U+200B et le BOM U+FEFF. Le sélecteur de variante U+FE0F reste
-- autorisé : « ❤️ » se termine légitimement par lui.
--
-- Aucun DML, aucune politique nouvelle : la colonne voyage avec sa ligne, dont
-- les politiques d'écriture sont déjà posées (`0047`).

begin;

alter table public.event_categories
  drop constraint if exists event_categories_icon_check;

alter table public.event_categories
  add constraint event_categories_icon_check
  check (
    icon is null
    or (
      char_length(icon) between 1 and 32
      and icon !~ '^[[:space:]\u200b\ufeff]'
      and icon !~ '[[:space:]\u200b\ufeff]$'
    )
  );

comment on column public.event_categories.icon is
  'Emoji de la catégorie (1 à 32 signes, sans bord invisible) ; NULL = emoji déduit du nom, puis 🗓️ côté application (0138).';

commit;
