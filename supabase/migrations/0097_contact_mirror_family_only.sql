-- 0097_contact_mirror_family_only.sql
-- Phase 07 Contacts privés (plan 07-01, D-01/D-02) : le miroir
-- contacts→birthdays ne sert que les listes « Famille ».
--
-- Constat UAT 2026-10-08 : `mirror_contact_birthday` (0078) miroitait tout
-- contact daté, y compris ceux des listes personnelles — or `birthdays` est
-- lisible par tout le foyer (SELECT = simple appartenance, motif 0007).
-- Nom + date + photo d'un contact personnel fuyaient donc vers les autres
-- membres via Anniversaires. Prouvé rouge par 0036 avant cette migration
-- (miroir personnel créé, lu par B).
--
-- Correctif, vers l'avant uniquement (0077/0078 intouchées) :
--   1. la fonction ne miroite que les contacts dont la liste a
--      `owner_member_id IS NULL` (la liste « Famille » — la seule porte) ;
--      un contact d'une liste personnelle ne crée, ne suit ni ne garde
--      aucun miroir (tout miroir résiduel est retiré au passage) ;
--   2. le déclencheur surveille aussi `list_id` : déplacer une fiche
--      personnel→Famille fait naître son miroir, sans écriture dédiée ;
--   3. purge one-shot des miroirs existants issus de listes personnelles
--      (portée exacte : `contact_id` joint au contact, liste personnelle —
--      les miroirs Famille restent à l'octet près).
--
-- RLS inchangée (OQ-2 conservée) : le déplacement personnel→Famille reste
-- l'écriture client directe prouvée en 0036 (USING ancienne liste +
-- WITH CHECK nouvelle liste).

begin;

create or replace function private.mirror_contact_birthday()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left(btrim(NEW.name), 160);
  v_shared boolean;
begin
  -- Porte Famille seule (D-02) : la liste du contact est-elle partagée ?
  -- Une liste introuvable (impossible par clé étrangère) vaut personnelle :
  -- en cas de doute, aucun miroir.
  select (l.owner_member_id is null)
    into v_shared
    from public.contact_lists l
   where l.id = NEW.list_id;
  if not coalesce(v_shared, false) then
    delete from public.birthdays b where b.contact_id = NEW.id;
    return NEW;
  end if;

  -- Le contact perd sa date : son miroir disparaît avec elle.
  if NEW.birth_date is null then
    delete from public.birthdays b where b.contact_id = NEW.id;
    return NEW;
  end if;

  -- Le contact a déjà son miroir : il le suit (nom, date, photo).
  update public.birthdays b
     set name = v_name,
         birth_date = NEW.birth_date,
         photo_url = NEW.photo_url
   where b.contact_id = NEW.id;
  if found then
    return NEW;
  end if;

  -- Garde anti-doublon D-10 : le flux anniversaire-d'abord a déjà sa ligne
  -- (nom normalisé + même date, même foyer), le contact s'y rattache sans
  -- créer de miroir.
  if exists (
    select 1
      from public.birthdays b
     where b.household_id = NEW.household_id
       and b.birth_date = NEW.birth_date
       and lower(btrim(b.name)) = lower(btrim(NEW.name))
  ) then
    return NEW;
  end if;

  insert into public.birthdays (household_id, name, birth_date, photo_url, contact_id)
  values (NEW.household_id, v_name, NEW.birth_date, NEW.photo_url, NEW.id);

  return NEW;
end;
$$;

comment on function private.mirror_contact_birthday() is
  'Miroir contacts→birthdays, listes Famille seules (0097) : crée, suit ou retire le miroir d''un contact daté partagé, avec garde anti-doublon nom+date (D-10). Les listes personnelles ne miroitent jamais. Déclencheur, non appelable directement.';

-- Le déplacement de liste fait naître ou mourir le miroir : `list_id`
-- rejoint les colonnes surveillées (0078 ne voyait que date, nom, photo).
drop trigger if exists mirror_contact_birthday on public.contacts;
create trigger mirror_contact_birthday
  after insert or update of birth_date, name, photo_url, list_id on public.contacts
  for each row execute function private.mirror_contact_birthday();

-- Déclencheur serveur : jamais appelable par un client (motif 0052/0077).
revoke all on function private.mirror_contact_birthday() from public, anon, authenticated;

-- Purge one-shot des miroirs personnels préexistants : seuls les miroirs
-- dont le contact vit dans une liste à propriétaire sont retirés. Les
-- miroirs Famille ne sont ni lus ni réécrits.
delete from public.birthdays b
 where b.contact_id is not null
   and exists (
     select 1
       from public.contacts c
       join public.contact_lists l on l.id = c.list_id
      where c.id = b.contact_id
        and l.owner_member_id is not null
   );

commit;
