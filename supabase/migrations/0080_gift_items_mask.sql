-- 0080_gift_items_mask.sql
-- Phase 05 Cadeaux-Contacts (plan 05-02) : vue masquant `reserved_by` au
-- propriétaire (T-05-03, surprise-breach).
--
-- Une politique RLS ne peut pas filtrer une COLONNE : elle ouvre ou ferme des
-- lignes. Le propriétaire d'une liste lisait donc `reserved_by` en direct sur
-- `public.gift_items`, ruinant la surprise (qui a réservé quoi). La correction
-- est une vue `SECURITY INVOKER` (droits de l'appelant : la RLS des tables
-- sous-jacentes continue de filtrer les lignes) qui rend `reserved_by` NULL
-- quand le lecteur est le propriétaire de la liste, via le même
-- `can_read`/`can_manage` que les politiques (copié du shape helper de
-- 0075, jamais de filtrage colonne en RLS).
--
-- Règle d'usage (documentée ici, pas contrainte en base) : l'UI lit les
-- articles d'une liste via `gift_items_for_list`, jamais la table brute. La
-- table brute reste lisible (0024 et les écritures serveur en dépendent) ;
-- c'est la vue qui porte le masquage.
--
-- `visibility = 'partagee'` : valeur d'enum existante (0004), jamais
-- proposée en UI jusqu'ici — c'est elle que portent les listes partagées par
-- code (0079) : lisibles par tout le foyer, réservables via le partage
-- `reservation` créé par l'échange.

begin;

create or replace view public.gift_items_for_list
with (security_invoker = true) as
select
  i.id,
  i.list_id,
  i.household_id,
  i.name,
  i.price,
  i.comment,
  i.photo_url,
  i.url,
  case
    when l.owner_member_id = private.current_member_id(l.household_id)
    then null
    else i.reserved_by
  end as reserved_by,
  i.purchased,
  i.idea_id,
  i.created_at
from public.gift_items i
join public.gift_lists l on l.id = i.list_id;

comment on view public.gift_items_for_list is
  'Lecture des articles avec reserved_by masqué (NULL) au propriétaire de la liste (T-05-03). SECURITY INVOKER : la RLS des tables filtre toujours les lignes. L''UI lit ici, jamais la table brute. Listes partagées par code : visibility ''partagee''.';

-- Lecture client via la vue uniquement (l'écriture ne passe jamais par une
-- vue) ; le serveur garde tous ses droits par défaut.
revoke all on table public.gift_items_for_list from anon;
grant select on table public.gift_items_for_list to authenticated, service_role;

commit;
