-- 0049_calendrier_realtime.sql
-- Temps réel sur les nouvelles tables du calendrier (même motif que 0010).

begin;

do $$
declare
  r text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'Publication supabase_realtime absente : Realtime non activé sur cette stack.';
    return;
  end if;

  foreach r in array array[
    'event_categories', 'event_calendars'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', r);
    exception when others then
      raise notice 'table % ignorée pour Realtime : %', r, sqlerrm;
    end;
  end loop;
end;
$$;

commit;
