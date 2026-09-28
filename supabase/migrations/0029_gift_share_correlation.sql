-- 0029_gift_share_correlation.sql
-- Corrige la corrélation du partage dans `gift_lists_select` (0028).
--
-- La 0028 écrivait `where s.list_id = id` en pensant désigner la liste
-- courante, mais dans un `EXISTS` portant sur l'alias `s`, l'identifiant nu
-- `id` se résout sur `gift_list_shares.id`, pas sur `gift_lists.id` : la
-- condition devenue `s.list_id = s.id` n'est presque jamais vraie, et la
-- branche « partagé » de la visibilité est morte (visible dans le plan :
-- `Filter: ((s.list_id = s.id) AND …)`). Les listes partagées par e-mail ou
-- par membre restaient invisibles à leurs destinataires.
--
-- La qualification explicite `public.gift_lists.id` est admise dans une
-- politique et ne peut plus dériver.

begin;

drop policy if exists gift_lists_select on public.gift_lists;
create policy gift_lists_select on public.gift_lists
  for select using (
    visibility <> 'privee'
    or owner_member_id = private.current_member_id(household_id)
    or exists (
      select 1
        from public.gift_list_shares s
       where s.list_id = public.gift_lists.id
         and (
           s.shared_with_member_id = private.current_member_id(household_id)
           or s.shared_with_email = (
             select p.email from public.profiles p where p.id = auth.uid()
           )
         )
    )
  );

commit;
