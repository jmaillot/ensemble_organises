-- 0086_calendrier_category_guard.sql
-- Phase 01 calendrier, D-08 : renommer ou supprimer une categorie utilisee
-- par au moins un evenement est refuse cote serveur (errcode 23514). Les
-- categories seed (Repas/Medical/Ecole/Sport, `is_default`) sont incluses :
-- aucune exception supplementaire au-dela des politiques RLS existantes.
--
-- Discipline trigger (AGENTS.md 2.7A, motif 0047 validate_event_scope) :
-- SECURITY DEFINER, `search_path = ''`, tables `public.*` qualifiees, REVOKE
-- final. Cette migration ne porte QUE des triggers sur `event_categories` :
-- aucun ALTER de `events` dans la meme transaction (controle statique n°8,
-- incident 0055 `pending trigger events`).

begin;

create or replace function private.guard_event_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
      from public.events
     where public.events.category_id = old.id
  ) then
    raise exception 'categorie utilisee' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_event_category_rename on public.event_categories;
create trigger guard_event_category_rename
  before update of name on public.event_categories
  for each row execute function private.guard_event_category();

drop trigger if exists guard_event_category_delete on public.event_categories;
create trigger guard_event_category_delete
  before delete on public.event_categories
  for each row execute function private.guard_event_category();

revoke all on function private.guard_event_category() from public, anon, authenticated;

commit;
