-- 0075_gift_read_household_scope.sql
-- Fuite inter-foyers dans `can_read_gift_list` : la branche
-- `visibility <> 'privee'` n'était cadrée à aucun foyer, donc tout
-- utilisateur connecté lisait les listes non privées de TOUS les foyers.
-- Détecté le 05/10/2026 par le test 0002 sur base non vide (comptage global
-- à 4 au lieu de 3) : sur base vide, l'assertion passait à vide.
--
-- Correctif : la visibilité non privée ouvre la liste aux MEMBRES DU MÊME
-- foyer uniquement. Propriétaire et partages explicites (membre ou e-mail)
-- inchangés. Forme fonction conservée (pas de relecture directe dans la
-- politique, cf. 0028 : INSERT sans représentation puis SELECT).
-- Les tables enfants (items, shares) utilisent la même fonction : le
-- cadrage s'y propage.

begin;

create or replace function private.can_read_gift_list(p_list_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.gift_lists l
     where l.id = p_list_id
       and (
         l.owner_member_id = private.current_member_id(l.household_id)
         or (l.visibility <> 'privee' and private.is_household_member(l.household_id))
         or exists (
           select 1
             from public.gift_list_shares s
            where s.list_id = l.id
              and (
                s.shared_with_member_id = private.current_member_id(l.household_id)
                or s.shared_with_email = (
                  select p.email from public.profiles p where p.id = auth.uid()
                )
              )
            )
         )
  );
$$;

comment on function private.can_read_gift_list(text) is
  'Lecture : propriétaire, membres du même foyer si non privée, ou partage explicite. Réservée aux politiques SELECT (jamais de relecture directe, cf. 0028).';

commit;
