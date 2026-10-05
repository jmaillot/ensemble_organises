-- 0078_birthday_mirror.sql
-- Phase 05 Cadeaux-Contacts (plan 05-02) : miroir contacts→birthdays (D-10,
-- D-14) et propagation « offert » (D-06).
--
-- Miroir (D-10, D-14) : un contact porteur d'une `birth_date` crée une ligne
-- `birthdays` miroir (nom, date, photo, foyer, `contact_id`). `contact_id`
-- est NULL pour les anniversaires saisis à la main, et unique partiel (un
-- miroir par contact). La suppression d'un contact supprime son miroir par
-- la cascade de la clé étrangère (D-14, confirmation exigée côté UI).
--
-- Garde anti-doublon (D-10) : le flux « anniversaire d'abord » crée le
-- contact ensuite (un anniversaire homonyme existe déjà). Si un anniversaire
-- du même foyer porte déjà le nom normalisé (`lower(btrim(...))`, sans
-- désaccentuation : les accents restent distinctifs) et la même date, aucun
-- miroir n'est inséré. Le miroir existant suit ensuite son contact (nom,
-- date, photo) ; retirer la date du contact supprime son miroir.
--
-- D-03, PAS DE BACKFILL : les anniversaires existants ne génèrent aucun
-- contact. Ce non-import est volontaire et documenté : un import ultérieur
-- serait une migration dédiée, avec sa propre déduplication nom+date, car
-- rejouer l'historique sans garde créerait un contact par anniversaire
-- manuel (réversibilité coûteuse).
--
-- Propagation (D-06) : passer une idée au statut `offert` marque `purchased`
-- sur les articles liés via `idea_id`. Idempotent (réassigner `true`).
--
-- Bornes : `contacts.name` accepte 200 caractères, `birthdays.name` 160. Le
-- miroir tronque à 160 (`left(btrim(...), 160)`) plutôt que de refuser la
-- création du contact : un nom de plus de 160 caractères est pathologique,
-- et bloquer la fiche pour son miroir inverserait la priorité.

begin;

-- ---------------------------------------------------------------------------
-- birthdays.contact_id : le lien miroir, NULL pour les anniversaires manuels.
-- ---------------------------------------------------------------------------
alter table public.birthdays
  add column contact_id text references public.contacts (id) on delete cascade;

comment on column public.birthdays.contact_id is
  'Miroir d''un contact (0078) : NULL pour les anniversaires saisis à la main, sinon l''identifiant du contact source. Suppression en cascade (D-14).';

create unique index birthdays_contact_uidx
  on public.birthdays (contact_id)
  where contact_id is not null;

-- ---------------------------------------------------------------------------
-- Miroir contacts→birthdays (D-10, D-14, D-03 sans backfill).
-- ---------------------------------------------------------------------------
create or replace function private.mirror_contact_birthday()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left(btrim(NEW.name), 160);
begin
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
  'Miroir contacts→birthdays : crée, suit ou retire le miroir d''un contact daté, avec garde anti-doublon nom+date (D-10). Déclencheur, non appelable directement.';

drop trigger if exists mirror_contact_birthday on public.contacts;
create trigger mirror_contact_birthday
  after insert or update of birth_date, name, photo_url on public.contacts
  for each row execute function private.mirror_contact_birthday();

-- ---------------------------------------------------------------------------
-- Propagation « offert » (D-06) : l'idée réalisée marque ses articles achetés.
-- ---------------------------------------------------------------------------
create or replace function private.propagate_idea_gifted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.gift_items i
     set purchased = true
   where i.idea_id = NEW.id;
  return NEW;
end;
$$;

comment on function private.propagate_idea_gifted() is
  'Une idée passée à « offert » marque achetés les articles liés via idea_id (D-06). Déclencheur, non appelable directement.';

drop trigger if exists propagate_idea_gifted on public.gift_ideas;
create trigger propagate_idea_gifted
  after update of status on public.gift_ideas
  for each row
  when (NEW.status = 'offert')
  execute function private.propagate_idea_gifted();

-- Déclencheurs serveur : jamais appelables par un client (motif 0052/0077).
revoke all on function private.mirror_contact_birthday() from public, anon, authenticated;
revoke all on function private.propagate_idea_gifted() from public, anon, authenticated;

commit;
