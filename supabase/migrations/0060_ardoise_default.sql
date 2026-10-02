-- 0060_ardoise_default.sql
-- Compatibilité : les clients et tests historiques insèrent des dépenses sans
-- ardoise_id. Assigner automatiquement l'« Ardoise du foyer » (créée à la
-- volée si absente), comme 0048 pour les calendriers. Le RPC et le frontend
-- renseignent toujours l'ardoise explicitement ; le défaut ne sert qu'au repli.

begin;

create or replace function private.align_ardoise_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id text;
begin
  if new.ardoise_id is null then
    select a.id into new.ardoise_id
      from public.ardoises a
     where a.household_id = new.household_id
       and a.name = 'Ardoise du foyer'
     limit 1;
    if new.ardoise_id is null then
      insert into public.ardoises (household_id, name)
      values (new.household_id, 'Ardoise du foyer')
      returning id into new.ardoise_id;
    end if;
  end if;

  select a.household_id into v_household_id
    from public.ardoises a
   where a.id = new.ardoise_id;
  if v_household_id is null then
    raise exception 'ardoise introuvable : %', new.ardoise_id using errcode = '23503';
  end if;
  if new.household_id is not null and new.household_id <> v_household_id then
    raise exception 'ardoise d''un autre foyer' using errcode = '23514';
  end if;
  new.household_id := v_household_id;
  return new;
end;
$$;

commit;
