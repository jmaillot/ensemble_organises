-- 0046_notification_reads.sql
-- États de lecture synchronisés entre appareils (centre de notifications).
--
-- Constat : les « non lus » (messages par conversation, commentaires par
-- publication) ne vivaient que dans le `localStorage` de l'appareil —
-- `readMap` des messages, horodatage de visite du Cercle. Lire sur son
-- téléphone laissait le compteur allumé sur l'ordinateur, et inversement.
--
-- Contenu : `notification_reads`, une ligne par (utilisateur, portée, objet)
-- lue, avec horodatage. Les éléments calculés (tâches en retard, échéances,
-- anniversaires) n'y figurent pas : ils se déduisent de l'état courant et
-- disparaissent d'eux-mêmes une fois traités.
--
-- La RLS réserve chaque ligne à son propriétaire (`user_id = auth.uid()`),
-- lecture comme écriture : aucun identifiant de foyer n'est nécessaire, le
-- rattachement se fait par l'objet lu.

begin;

create table public.notification_reads (
  id text primary key default private.new_id('notification-read'),
  user_id uuid not null references auth.users (id) on delete cascade,
  scope text not null check (scope in ('conversation', 'post')),
  scope_id text not null check (char_length(btrim(scope_id)) between 1 and 200),
  read_at timestamptz not null default now(),
  constraint notification_reads_owner_scope_key unique (user_id, scope, scope_id)
);
comment on table public.notification_reads is
  'Horodatages de lecture par utilisateur : conversations et publications suivies par le centre de notifications.';

alter table public.notification_reads enable row level security;

drop policy if exists notification_reads_select_own on public.notification_reads;
create policy notification_reads_select_own on public.notification_reads
  for select using (user_id = auth.uid());

drop policy if exists notification_reads_insert_own on public.notification_reads;
create policy notification_reads_insert_own on public.notification_reads
  for insert with check (user_id = auth.uid());

drop policy if exists notification_reads_update_own on public.notification_reads;
create policy notification_reads_update_own on public.notification_reads
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists notification_reads_delete_own on public.notification_reads;
create policy notification_reads_delete_own on public.notification_reads
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Realtime : un marquage sur un appareil rejoint les autres sans rechargement.
-- ---------------------------------------------------------------------------
do $$
declare
  r text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'Publication supabase_realtime absente : Realtime non activé sur cette stack.';
    return;
  end if;

  foreach r in array array['notification_reads'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', r);
    exception when others then
      raise notice 'table % ignorée pour Realtime : %', r, sqlerrm;
    end;
  end loop;
end;
$$;

commit;
