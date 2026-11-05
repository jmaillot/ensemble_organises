-- 0178_client_key_cron.sql
-- Suite directe de 0177 (WRQ-01, D-14/D-15) — correction vers l'avant
-- (AGENTS §2.7 A) d'un site d'insertion SERVEUR cassé par le NOT NULL :
--
--    `private.generate_routine_occurrences` (job pg_cron quotidien) insère
--    dans `public.routine_completions` SANS client_key. Après 0177
--    (`client_key set not null`), chaque exécution du job échouait sur la
--    violation NOT NULL — plus aucune occurrence de routine ne serait
--    générée. La définition effective de la fonction (vérifiée dans la base
--    via pg_get_functiondef, AGENTS §2.7 A.2) est la version 0011:205 ;
--    elle est recopiée ci-dessous avec `client_key = gen_random_uuid()`.
--
--    Ces occurrences sont nées CÔTÉ SERVEUR : elles n'ont pas de clé client,
--    un uuid généré au serveur est la valeur correcte (le client ne rejoue
--    jamais une occurrence générée par le cron — la file d'écriture ne
--    concerne que les écritures du client).
--
-- Les sites d'insertion de task_assignees (0133:77, 0146:426) sont couverts :
-- leurs définitions EFFECTIVES portent déjà client_key (vérifié par requête
-- pg_get_functiondef filtrée sur client_key absent — seule
-- generate_routine_occurrences était concernée).

begin;

create or replace function private.generate_routine_occurrences(
  p_from date,
  p_to date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  if p_from is null or p_to is null or p_to < p_from then
    return 0;
  end if;

  -- `client_key` est alimentée par le serveur (0178) : la colonne est NOT
  -- NULL depuis 0177 et ces lignes ne proviennent jamais d'un rejeu client.
  insert into public.routine_completions
    (routine_id, household_id, occurrence_date, status, client_key)
  select r.id, r.household_id, g.day::date, 'en_retard', gen_random_uuid()
    from public.routines r
    cross join lateral generate_series(
      greatest(p_from, r.created_at::date),
      p_to,
      interval '1 day'
    ) as g(day)
   where private.rrule_day_matches(r.recurrence_rule, r.created_at::date, g.day::date)
     and not exists (
       select 1
         from public.routine_completions rc
        where rc.routine_id = r.id
          and rc.occurrence_date = g.day::date
     )
  on conflict (routine_id, occurrence_date) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

commit;
