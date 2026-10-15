-- 0123_dashboard_widget_width_zero.sql
-- Accueil : « masquer un widget » doit être possible en ligne (CR-01, D-01).
--
-- Le client encode la visibilité par `width = 0`
-- (`app/src/modules/dashboard/hooks/use-dashboard.ts:134,147`) et lit
-- `visible = width > 0` (`app/src/modules/dashboard/types.ts:64`). La colonne
-- portait `check (width between 1 and 4)` (0004_tables_shared.sql:312) : écrire
-- 0 levait 23514, `data.update` rejetait, et le widget masqué revenait au
-- rechargement — sans message, l'appelant jetant le rejet via `void`.
--
-- Le changement est le plus petit possible : on assouplit la SEULE borne basse
-- (1 → 0). Aucun encodage client ne bouge, aucune lecture ne bouge, la
-- sémantique `visible = width > 0` est conservée, et l'échelle reste bornée
-- (`width = 5` est toujours refusé — prouvé par
-- supabase/tests/0122_dashboard_widget_width.sql).
--
-- Alternative rejetée : ajouter une colonne `visible boolean`. Elle toucherait
-- toutes les lectures et créerait deux sources de vérité pour la même chose.
--
-- Vers l'avant uniquement : 0004 n'est jamais retouchée (AGENTS.md §2.7A.1).
-- Le nom de la contrainte a été observé sur le schéma vivant avant d'écrire ce
-- fichier, pour qu'un `drop` ne passe pas à côté en silence :
--   dashboard_widgets_width_check | CHECK ((width >= 1) AND (width <= 4))
-- `not null default 1` et `dashboard_widgets_member_type_key` ne sont pas
-- touchés. Toute table s'écrit `public.*` (search_path vide ne résout rien).

begin;

alter table public.dashboard_widgets
  drop constraint dashboard_widgets_width_check;

alter table public.dashboard_widgets
  add constraint dashboard_widgets_width_check check (width between 0 and 4);

comment on column public.dashboard_widgets.width is
  'Largeur du widget dans la grille. 0 = widget masqué (lecture : visible = width > 0) ; 1..4 = largeur affichée.';

commit;
