-- 0140_household_disabled_modules.sql
-- Le menu des applications du foyer (migration 0140).
--
-- POURQUOI. Chaque foyer n'utilise pas tout : un foyer sans animaux n'a
-- aucune raison de voir l'espace Animaux, et les nouveaux modules du lot 3
-- (Menu, Frigo, Budget…) doivent pouvoir rester éteints chez qui ne les
-- veut pas. Le catalogue des espaces est un choix du foyer, pas un périmètre
-- imposé à tous.
--
-- LA COLONNE. `disabled_modules` porte les CLÉS des espaces éteints — et non
-- la liste des espaces allumés : la liste vide dit « tout est activé », de
-- sorte que tout foyer existant et tout nouveau foyer retombe sur le
-- comportement actuel sans backfill. Un module ajouté plus tard au catalogue
-- est donc actif par défaut, et le foyer peut l'éteindre.
--
-- LA GARDE DE FORME. Un tableau libre accepterait n'importe quelle chaîne ;
-- une clé mal écrite (`Ardoise`, `ardoise ` avec une espace) éteindrait un
-- module qui n'existe pas et jamais celui visé. La contrainte `check` refuse
-- toute clé hors du format maison (`[a-z][a-z_]{1,39}`, sans doublon). La
-- validité SÉMANTIQUE — la clé désigne un module réel du catalogue — reste
-- au client : la base ne peut pas connaître la liste des espaces sans en
-- réserver l'édition à chaque nouveau module, ce qui serait pire.
--
-- AUCUNE POLITIQUE NOUVELLE. `households_update` (0007) réserve déjà
-- l'écriture d'une ligne foyer aux administrateurs : le menu des
-- applications est administrateur-seul par héritage, pas par ajout. Les
-- membres et les enfants lisent la ligne (et donc la configuration) mais ne
-- peuvent pas la changer.
--
-- LE TEST (tests/0140) prouve : le défaut vide, l'écriture admin, le refus
-- d'un membre (compteur à 0 : un update filtré par la RLS ne lève rien), le
-- refus d'un foyer étranger, et la garde de forme (clé en majuscule, clé
-- avec espace, doublon) ainsi que le refus de NULL.

begin;

-- ---------------------------------------------------------------------------
-- La garde de forme : fonction immuable, appelable depuis la contrainte.
-- Une contrainte `check` ne peut pas contenir de sous-requête ; elle appelle
-- donc cette fonction, qui n'interroge aucune table (le format seul).
-- ---------------------------------------------------------------------------
create or replace function private.has_valid_module_keys(keys text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(k ~ '^[a-z][a-z_]{1,39}$'), true)
     and coalesce(count(*) = count(distinct k), true)
    from pg_catalog.unnest(keys) as t (k);
$$;

comment on function private.has_valid_module_keys(text[]) is
  'Vrai si chaque clé est au format module (minuscules, tiret bas) et sans doublon.';

-- `public` et `anon` perdent l'EXECUTE : la fonction n'est pas une surface
-- d'appel client. `authenticated` et `service_role` la CONSERVENT — et c'est
-- voulu, pas un oubli : une contrainte CHECK s'évalue avec le rôle qui écrit
-- la ligne, donc sans EXECUTE chaque écriture d'un foyer échouerait. Le
-- contrat de schéma (0001, §7 bis, catégorie b) justifie ce droit par la
-- référence `pg_constraint` elle-même.
revoke execute on function private.has_valid_module_keys(text[]) from public, anon;
grant execute on function private.has_valid_module_keys(text[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- La colonne
-- ---------------------------------------------------------------------------
alter table public.households
  add column if not exists disabled_modules text[] not null default '{}'::text[]
  check (private.has_valid_module_keys(disabled_modules));

comment on column public.households.disabled_modules is
  'Clés des espaces éteints par le foyer. Vide = tout activé : les foyers existants et les modules futurs restent actifs par défaut.';

commit;
