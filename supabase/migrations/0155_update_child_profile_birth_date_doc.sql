-- 0155_update_child_profile_birth_date_doc.sql
-- Documentation de l'asymétrie birth_date dans update_managed_child_profile
-- (finding IN-01 de la revue de phase 25). Aucun comportement n'est changé.
--
-- Pourquoi un commentaire et pas une harmonisation : birth_date est écrasée
-- SANS coalesce (null ⇒ null) tandis que display_name, color_tag et avatar_url
-- usent de coalesce (null ⇒ conserver). L'UI ne propose JAMAIS de vider la
-- date de naissance (le champ est toujours renvoyé, vide interdit) : passer
-- birth_date en coalesce ferait perdre la possibilité de RESET la date — et
-- l'appelant courant (api.ts) renvoie déjà systématiquement la valeur
-- complète. L'asymétrie est donc un choix contractuel : tout appelant DOIT
-- porter la ligne birth_date courante, comme le dit déjà la doc de api.ts.
-- Le commentaire nomme la règle là où le lecteur atterrit : la fonction.
--
-- 0154 a changé la signature (p_clear_avatar boolean) : le comment cible la
-- signature effective en cours (text, text, text, date, text, boolean, text[]).

begin;

comment on function public.update_managed_child_profile(text, text, text, date, text, boolean, text[]) is
  'D-01 : met à jour la fiche d''un enfant géré ; modules validés en format (0140) et en périmètre D-06 (refus-par-défaut hors des cinq espaces gardés). p_clear_avatar=true supprime l''avatar (0154) — null seul ne touche plus rien. CONTRAT DES ARGUMENTS (0155, IN-01) : birth_date est ÉCRASÉE sans coalesce — tout appelant renvoie la date COURANTE, modifiée ou non ; display_name (vide ⇒ conserver), color_tag et avatar_url (null ⇒ conserver) suivent l''inverse. L''UI ne vide jamais la date de naissance : cette asymétrie est délibérée, ne l''harmonisez pas sans décision produit. USAGE AUTHENTIFIÉ UNIQUEMENT.';

commit;
