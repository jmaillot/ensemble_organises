-- 0045_provider_attachments.sql
-- Pièces jointes des fiches prestataires (devis, factures, attestations).
--
-- Même motif que 0043 (carnet de santé, notes) : plusieurs fichiers par
-- fiche, images et PDF via le bucket `household-media`, `household_id`
-- dénormalisé justifié par l'affichage sans jointure et contraint par le
-- déclencheur `align_household` (0008). Suppression en cascade depuis le
-- prestataire, RLS activée, quatre politiques explicites.

begin;

create table public.provider_attachments (
  id text primary key default private.new_id('provider-attachment'),
  provider_id text not null references public.providers (id) on delete cascade,
  -- `household_id` dénormalisé : justifié par l'affichage des vignettes sur
  -- les cartes de prestataires, sans jointure sur `providers`, et validé par
  -- trigger.
  household_id text not null references public.households (id) on delete cascade,
  file_url text not null check (char_length(btrim(file_url)) between 1 and 2000),
  file_name text not null check (char_length(btrim(file_name)) between 1 and 255),
  mime_type text not null check (char_length(btrim(mime_type)) between 1 and 127),
  size_bytes integer not null check (size_bytes >= 0),
  created_at timestamptz not null default now()
);
comment on table public.provider_attachments is 'Pièces jointes des fiches prestataires : devis, factures, attestations.';

alter table public.provider_attachments enable row level security;

drop policy if exists provider_attachments_select_household on public.provider_attachments;
create policy provider_attachments_select_household on public.provider_attachments
  for select using (private.is_household_member(household_id));

drop policy if exists provider_attachments_insert_household on public.provider_attachments;
create policy provider_attachments_insert_household on public.provider_attachments
  for insert with check (private.can_write_household(household_id));

drop policy if exists provider_attachments_update_household on public.provider_attachments;
create policy provider_attachments_update_household on public.provider_attachments
  for update using (private.can_write_household(household_id))
  with check (private.can_write_household(household_id));

drop policy if exists provider_attachments_delete_admin on public.provider_attachments;
create policy provider_attachments_delete_admin on public.provider_attachments
  for delete using (private.is_household_admin(household_id));

drop trigger if exists align_household on public.provider_attachments;
create trigger align_household before insert or update on public.provider_attachments
  for each row execute function private.align_child_household('providers', 'provider_id');

-- ---------------------------------------------------------------------------
-- Realtime : les vignettes suivent les dépôts sans rechargement.
-- ---------------------------------------------------------------------------
do $$
declare
  r text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'Publication supabase_realtime absente : Realtime non activé sur cette stack.';
    return;
  end if;

  foreach r in array array['provider_attachments'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', r);
    exception when others then
      raise notice 'table % ignorée pour Realtime : %', r, sqlerrm;
    end;
  end loop;
end;
$$;

commit;
