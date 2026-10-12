-- 0110_realtime_voyages_animaux.sql
-- Phase 12 (D-01) : publier les tables plates voyages/animaux dans Realtime.
--
-- Constat : `use-voyages` s'abonne a `trips` (`data.subscribe('trips', …)`),
-- mais `trips` est absent de la publication `supabase_realtime` (0010). Le
-- canal est donc ouvert cote client sans jamais etre alimente cote serveur :
-- les voyages crees ou modifies par un autre membre n'arrivent qu'au
-- rechargement manuel. Meme silence pour `pets` / `pet_records` (aucun
-- abonne client aujourd'hui, mais la publication doit preceder l'abonnement
-- D-07) et `recipes` (sans client : future-proofing documente, pas d'effet).
--
-- Discipline : ALTER PUBLICATION en ajout uniquement — la publication n'est
-- jamais reconstruite ni supprimee. Rejouable : l'ajout d'une table deja
-- membre est absorbe par le bloc d'exception, comme en 0010.

begin;

do $$
declare
  r text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'Publication supabase_realtime absente : Realtime non active sur cette stack.';
    return;
  end if;

  foreach r in array array[
    'trips', 'pets', 'pet_records', 'recipes'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', r);
    exception when others then
      raise notice 'table % ignoree pour Realtime : %', r, sqlerrm;
    end;
  end loop;
end;
$$;

commit;
