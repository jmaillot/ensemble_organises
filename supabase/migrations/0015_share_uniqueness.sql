-- 0015_share_uniqueness.sql
-- Rend le partage d'une dépense et d'une liste de cadeaux possible.
--
-- Constat (campagne de tests du 25/09/2026) : l'insertion de deux parts de
-- membre pour une même dépense échoue sur
-- `expense_participants_external_unique`, clé (expense_id, NULL).
--
-- 0004 déclarait :
--   constraint expense_participants_member_unique   unique nulls not distinct (expense_id, member_id)
--   constraint expense_participants_external_unique unique nulls not distinct (expense_id, external_participant_id)
--
-- `NULLS NOT DISTINCT` rend NULL equal à NULL pour l'index. Or chaque part de
-- type `membre` porte `external_participant_id = NULL` : la contrainte
-- externe les collideait donc toutes entre elles. Conséquence : une dépense ne
-- pouvait être répartie qu'entre UN membre du foyer, plus un participant externe
-- au plus. L'Ardoise, qui répartit par défaut une dépense entre tous les
-- membres, était inutilisable dès la deuxième part.
--
-- Même défaut, même table, symétrique : `gift_list_shares` n'autorisait qu'un
-- partage par membre OU un partage par courriel, jamais les deux à la fois,
-- et jamais deux membres.
--
-- L'intention d'origine — « un même participant ne peut pas être compté deux
-- fois pour une même dépense » — s'exprime par un index unique PARTIEL : la
-- contrainte ne porte que sur les lignes où la colonne est renseignée.
-- `unique (expense_id, member_id)` seul laisserait passer deux lignes membre
-- distinctes, puisque leurs `external_participant_id` valent tous deux NULL.
--
-- La contrainte `expense_participants_kind_check` (0004) reste la gardienne :
-- un participant est membre XOR externe, donc les deux index se recoupent
-- exactement sur `participant_type` et ne laissent passer aucune ligne ambiguë.

begin;

-- Dépose les contraintes fautives. `if exists` : cette migration est rejouable,
-- et sur une base fraîche 0004 les aura peut-être déjà recréées.
alter table public.expense_participants
  drop constraint if exists expense_participants_member_unique;
alter table public.expense_participants
  drop constraint if exists expense_participants_external_unique;
alter table public.gift_list_shares
  drop constraint if exists gift_list_shares_member_unique;
alter table public.gift_list_shares
  drop constraint if exists gift_list_shares_email_unique;

-- Un membre, une fois par dépense.
create unique index if not exists expense_participants_member_unique
  on public.expense_participants (expense_id, member_id)
  where member_id is not null;

-- Un participant externe, une fois par dépense.
create unique index if not exists expense_participants_external_unique
  on public.expense_participants (expense_id, external_participant_id)
  where external_participant_id is not null;

-- Un membre, une fois par liste.
create unique index if not exists gift_list_shares_member_unique
  on public.gift_list_shares (list_id, shared_with_member_id)
  where shared_with_member_id is not null;

-- Un courriel, une fois par liste.
create unique index if not exists gift_list_shares_email_unique
  on public.gift_list_shares (list_id, shared_with_email)
  where shared_with_email is not null;

comment on index public.expense_participants_member_unique is
  'Index unique partiel : les parts de membre portent external_participant_id NULL, qu''un index ordinaire traiterait comme une valeur unique.';

comment on index public.expense_participants_external_unique is
  'Index unique partiel, symétrique du précédent, pour les participants externes.';

comment on index public.gift_list_shares_member_unique is
  'Index unique partiel : un partage par courriel porte shared_with_member_id NULL.';

comment on index public.gift_list_shares_email_unique is
  'Index unique partiel, symétrique du précédent.';

-- Garde-fou : un index unique partiel ne se remarque pas dans `\d` comme une
-- contrainte. On vérifie donc explicitement que les quatre	index existent,
-- qu'ils sont uniques, et qu'ils sont bien partiels.
do $$
declare
  v_expected text[] := array[
    'expense_participants_external_unique', 'expense_participants_member_unique',
    'gift_list_shares_email_unique', 'gift_list_shares_member_unique'
  ];
  v_broken text;
begin
  select coalesce(array_agg(t.index_name order by t.index_name)::text, '{}')
    into v_broken
    from unnest(v_expected) as t(index_name)
   where not exists (
           select 1
             from pg_index i
             join pg_class c on c.oid = i.indexrelid
             join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public'
              and c.relname = t.index_name
              and i.indisunique
              -- `indpred is null` = index non partiel : c'est exactement le
              -- défaut qu'on vient de corriger.
              and i.indpred is not null
         );

  if v_broken <> '{}' then
    raise exception
      'index unique partiel attendu mais absent ou non partiel : %', v_broken;
  end if;
end;
$$;

commit;
