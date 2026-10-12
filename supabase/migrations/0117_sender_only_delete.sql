-- 0117_sender_only_delete.sql
-- Phase 11 Cercle (plan 11-04, D-07) : suppression unitaire strictement auteur.
--
-- Constat (sonde RED 11-04, avant cette migration) : un admin supprimait le
-- post, le commentaire ou la reaction d'autrui (1 ligne touchee par table),
-- alors que les messages sont auteur-seul depuis 0100 (0 ligne, pre-securise).
-- Decide (D-07) : seule la ligne d'auteur se supprime a l'unite, partout —
-- posts, commentaires, reactions comme messages. Le levier de moderation
-- admin reste l'archivage de fil (0106 `archive_conversation`, fige sans
-- detruire) : prouve intact par 0052, ni rescope ni retouche ici.
--
-- Vers l'avant uniquement, aucun fichier applique retouche :
--   * les trois politiques DELETE sont recoupees sous leurs noms existants
--     (noms historiques conserves pour ne pas churner les dependants) ;
--   * `messages_delete` (0100) inchangee — prouvee, pas reconstruite ;
--   * `archive_conversation` (0106) et sa garde admin (0107) inchanges ;
--   * garde-fou contenu D-01 (0109, UPDATE auteur-ou-admin) inchange :
--     seule la SUPPRESSION devient auteur-seul, la moderation d'edition reste ;
--   * cascade de fil inchangee : supprimer SON post aspire medias/
--     commentaires/reactions par FK (ne passe pas par la RLS ligne a ligne) ;
--   * bascule des reactions (D-02) inchangee : le retrait soi-meme reste le
--     seul chemin de suppression unitaire d'une reaction.
--
-- Note de nommage : 0113 etait le numero du plan, pris par le perimetre
-- enfant (0113_enfant_perimeter.sql) ; 0051 idem cote tests. La migration
-- prend le prochain numero libre (0117), la suite le sien (0052).

begin;

-- ---------------------------------------------------------------------------
-- D-07 : un post seul ne se supprime que par son auteur. La branche admin est
-- retiree ; la suppression du fil par son auteur (cascade FK) est intacte.
-- ---------------------------------------------------------------------------
drop policy if exists posts_delete_admin on public.posts;
create policy posts_delete_admin on public.posts
  for delete using (
    author_id = private.current_member_id(household_id)
  );

-- ---------------------------------------------------------------------------
-- D-07 : un commentaire seul ne se supprime que par son auteur.
-- ---------------------------------------------------------------------------
drop policy if exists post_comments_delete_admin on public.post_comments;
create policy post_comments_delete_admin on public.post_comments
  for delete using (
    author_id = private.current_member_id(household_id)
  );

-- ---------------------------------------------------------------------------
-- D-07 : une reaction seule ne se retire que par son auteur (bascule retour).
-- ---------------------------------------------------------------------------
drop policy if exists post_reactions_delete_admin on public.post_reactions;
create policy post_reactions_delete_admin on public.post_reactions
  for delete using (
    author_id = private.current_member_id(household_id)
  );

commit;
