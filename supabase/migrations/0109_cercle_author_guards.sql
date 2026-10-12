-- 0109_cercle_author_guards.sql
-- Phase 11 Cercle (D-01/D-03) : restauration de l'auteur sur le contenu.
--
-- Constats (audit 11-CONTEXT) :
--   * D-01 : la relaxation 0081 (WITH CHECK = ecrivain) a leve la seule
--     barriere d'auteur sur le CONTENU des posts/commentaires — n'importe
--     quel membre reecrivait le texte d'autrui. Correctif : trigger
--     garde-fou auteur-ou-admin sur UPDATE de posts/post_comments, meme
--     forme que les gardes gift (0083) ; `author_id` reste gele par le
--     trigger existant `guard_author_immutable` (0081, inchange).
--   * D-03 : les DELETE posts/comments/reactions n'autorisaient que l'admin —
--     un membre ne supprimait meme pas son propre contenu, alors que l'UI
--     offre `canDelete = mine||admin`. Correctif : regle unique
--     auteur-ou-admin sur les trois tables.
--
-- Vers l'avant uniquement, aucun fichier applique retouche :
--   * trigger sibling (le trigger 0081 n'est ni deplace ni reconstruit) ;
--   * politiques DELETE recoupees sous leurs noms existants.
-- Inchanges (non-regressions prouvees par 0047) :
--   * bascule des reactions (D-02) : INSERT auteur = soi, unicite
--     (post_id, author_id, reaction_type) — UPDATE reactions inchange (0081) ;
--   * cascade de fil : supprimer un post aspire medias/commentaires/
--     reactions par FK (la cascade ne passe pas par la RLS ligne a ligne) ;
--   * chemins post_media : aucune colonne d'auteur, politiques inchangees ;
--   * relaxation 0081 sur tasks/notes (et autres tables non-Cercle) intacte.

begin;

-- ---------------------------------------------------------------------------
-- D-01 : garde-fou contenu — seul l'auteur ou un admin modifie un
-- post/commentaire. `author_id` reste gele par `guard_author_immutable`.
-- ---------------------------------------------------------------------------
create or replace function private.guard_cercle_content_author()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_me text;
begin
  if current_user in ('anon', 'authenticated') then
    v_me := private.current_member_id(OLD.household_id);
    if OLD.author_id is distinct from v_me
       and not private.is_household_admin(OLD.household_id) then
      raise exception 'seul l''auteur ou un admin peut modifier ce contenu'
        using errcode = '42501';
    end if;
  end if;
  return NEW;
end;
$$;

comment on function private.guard_cercle_content_author() is
  'Cercle D-01 : UPDATE de posts/post_comments reserve a l''auteur ou un admin ; l''auteur reste fige par guard_author_immutable (0081).';

drop trigger if exists guard_cercle_content_author on public.posts;
create trigger guard_cercle_content_author
  before update on public.posts
  for each row execute function private.guard_cercle_content_author();

drop trigger if exists guard_cercle_content_author on public.post_comments;
create trigger guard_cercle_content_author
  before update on public.post_comments
  for each row execute function private.guard_cercle_content_author();

-- ---------------------------------------------------------------------------
-- D-03 : regle unique auteur-ou-admin pour DELETE (l'UI canDelete
-- = mine||admin devient vraie cote serveur aussi).
-- ---------------------------------------------------------------------------
drop policy if exists posts_delete_admin on public.posts;
create policy posts_delete_admin on public.posts
  for delete using (
    author_id = private.current_member_id(household_id)
    or private.is_household_admin(household_id)
  );

drop policy if exists post_comments_delete_admin on public.post_comments;
create policy post_comments_delete_admin on public.post_comments
  for delete using (
    author_id = private.current_member_id(household_id)
    or private.is_household_admin(household_id)
  );

drop policy if exists post_reactions_delete_admin on public.post_reactions;
create policy post_reactions_delete_admin on public.post_reactions
  for delete using (
    author_id = private.current_member_id(household_id)
    or private.is_household_admin(household_id)
  );

commit;
