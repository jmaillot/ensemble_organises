# Phase 01: calendrier - Pattern Map

**Mapped:** 2026-10-06
**Files analyzed:** 9 (6 new, 3 modified)
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| supabase/migrations/0084_calendrier_perso_total.sql (new) | migration | CRUD (RLS policies) | supabase/migrations/0047_calendrier.sql | exact |
| supabase/migrations/0085_calendrier_perso_auto.sql (new) | migration | event-driven (trigger) + batch (backfill) | supabase/migrations/0048_calendrier_default.sql (trigger) + supabase/migrations/0054_create_household_seeds.sql (seed) | role-match |
| supabase/migrations/0086_calendrier_category_guard.sql (new) | migration | event-driven (trigger) | supabase/migrations/0047_calendrier.sql (validate_event_scope, l.374-411) | role-match |
| supabase/migrations/0087_calendrier_refresh_cron.sql (new) | migration | batch (pg_cron + dispatch) | supabase/migrations/0011_cron.sql (dispatch + jobs, l.316-387) | exact |
| supabase/functions/refresh-calendrier-ref/index.ts (new) | edge function | batch (fetch + upsert) | supabase/functions/gift-list-invite/index.ts | role-match |
| supabase/tests/0017_calendrier_phase.sql (new) | test | batch (assertions) | supabase/tests/0016_calendrier_rls.sql + supabase/tests/0004_cron.sql (section 4, l.160-196) | exact |
| app/src/modules/calendrier/hooks/use-ref-days.ts (rewrite) | hook | request-response | itself (pure helpers) + app/src/modules/calendrier/api.ts (data.list) | exact (self) |
| app/src/modules/calendrier/calendrier-page.tsx (modify) | component (page) | request-response | itself (FilterBar l.243-341, ConfirmDialog l.655-673) | exact (self) |
| app/src/modules/calendrier/components/event-form-dialog.tsx (modify) | component (form) | request-response | itself (calendar Select l.201-217, eventSchema l.19-42) | exact (self) |

All analog paths verified git-tracked via git ls-files (13/13 non-empty). No skills directories exist (.claude/skills/, .agents/skills/ absent) - conventions come from AGENTS.md sections 2.6/2.7/6 only.

## Pattern Assignments

### 0084_calendrier_perso_total.sql (migration, CRUD) - Analog: 0047_calendrier.sql

Goal (RESEARCH.md Pattern 1): CREATE OR REPLACE private.is_calendar_visible and policy event_calendars_select WITHOUT the admin-read branch; narrow event_calendars_update (0047 l.230-252) and events_delete_admin (0047 l.297-310) the same way (owner-only for Perso, admin keeps Commun).

Helper pattern to copy (0047 l.132-150 - keep shape, DROP l.147 admin branch):
    create or replace function private.is_calendar_visible(p_calendar_id text)
    returns boolean language sql stable security definer set search_path = ''
    as $$
      select exists (
        select 1 from public.event_calendars c
         where c.id = p_calendar_id
           and private.is_household_member(c.household_id)
           and (c.visibility = 'commun'
             or c.owner_member_id = private.current_member_id(c.household_id)
             -- LIGNE A RETIRER en 0084 : or private.is_household_admin(c.household_id)
           ));
    $$;

Policy pattern to copy (0047 l.201-210 - keep shape, DROP l.208):
    drop policy if exists event_calendars_select on public.event_calendars;
    create policy event_calendars_select on public.event_calendars
      for select using (private.is_household_member(household_id)
        and (visibility = 'commun'
          or owner_member_id = private.current_member_id(household_id)));

Delete-policy trap (0047 l.297-310 - must narrow, else an admin deletes what he cannot see): first branch currently allows is_household_admin unconditionally; in 0084 restrict it to Commun (or remove for Perso). Planner decides, recommended default yes (RESEARCH.md Open Question 1).
Comment to update (0047 l.28, l.46): 'owner seul + admin lecture' becomes 'owner seul, invisible aux autres meme admin'.

---

### 0085_calendrier_perso_auto.sql (migration, event-driven + batch) - Analogs: 0048 (trigger) + 0054 (seed)

Trigger discipline to copy (0048 l.8-39 - SECURITY DEFINER, empty search_path, public.* tables, REVOKE at end):
    create or replace function private.assign_default_calendar()
    returns trigger language plpgsql security definer set search_path = ''
    as $$ declare v_calendar_id text;
    begin
      if new.calendar_id is not null then return new; end if;
      select c.id into v_calendar_id from public.event_calendars c
       where c.household_id = new.household_id and c.name = 'Commun' and c.visibility = 'commun' limit 1;
      if v_calendar_id is null then
        insert into public.event_calendars (household_id, name, visibility, owner_member_id)
        values (new.household_id, 'Commun', 'commun', null) returning id into v_calendar_id;
      end if;
      new.calendar_id := v_calendar_id; return new;
    end; $$;
    drop trigger if exists assign_default_calendar on public.events;
    create trigger assign_default_calendar before insert on public.events
      for each row execute function private.assign_default_calendar();
    revoke all on function private.assign_default_calendar() from public, anon, authenticated;

In 0085: trigger on public.household_members AFTER INSERT - if NEW.role IN ('admin','membre'), insert event_calendars (household_id, 'Perso', 'perso', NEW.id) if none exists (ON CONFLICT DO NOTHING idempotent). Enfants ('enfant') excluded - roles verified in 0006_security_helpers.sql:77-85.
Uniqueness trap (0047 l.43): event_calendars_name_unique (household_id, name) - two Perso named 'Perso' = 23505. Add partial unique index (household_id, owner_member_id) WHERE visibility='perso' (RESEARCH.md Pitfall 2).
Seed shape to reuse, DO NOT touch 0054 (forward-only) - trigger covers future members, 0085 backfill covers existing (0054 l.65-72): insert Commun + 4 categories Repas #E8930C / Medical #D64545 / Ecole #3E7CB1 / Sport #4CAF50. Backfill 0085: one Perso per existing adult member without Perso, same INSERT...SELECT WHERE NOT EXISTS shape as 0047 l.91-111.

---

### 0086_calendrier_category_guard.sql (migration, event-driven) - Analog: 0047 validate_event_scope l.374-411

Trigger pattern to copy (same discipline - v_ prefix, public.* qualified, errcode 23514, REVOKE):
    create or replace function private.validate_event_scope()
    returns trigger language plpgsql security definer set search_path = ''
    as $$ declare v_calendar_household text; v_category_household text;
    begin
      select c.household_id into v_calendar_household from public.event_calendars c where c.id = new.calendar_id;
      if v_calendar_household is null then raise exception 'calendrier introuvable' using errcode = '23503'; end if;
      if v_calendar_household <> new.household_id then raise exception 'calendrier autre foyer' using errcode = '23514'; end if;
      -- ... same shape for category_id ...
      return new;
    end; $$;
    drop trigger if exists validate_event_scope on public.events;
    create trigger validate_event_scope before insert or update of calendar_id, category_id, household_id on public.events
      for each row execute function private.validate_event_scope();

In 0086: BEFORE UPDATE OF name ON event_categories + BEFORE DELETE - if EXISTS (SELECT 1 FROM public.events WHERE category_id = OLD.id) raise 'categorie utilisee' errcode 23514. Seed categories included (no is_default exception beyond existing delete policy). Trigger only on event_categories: do NOT combine with an ALTER of events in 0086 (static check n.8, incident 0055 pending trigger events).

---

### 0087_calendrier_refresh_cron.sql (migration, batch) - Analog: 0011_cron.sql l.316-387

Dispatch pattern to copy (0011 l.316-357 - Vault at execution time, pg_net/Vault guard, no secret in clear):
    create or replace function private.dispatch_daily_notifications() returns integer
    language plpgsql security definer set search_path = ''
    as $$ declare v_url text; v_key text; v_sent integer := 0;
    begin
      if to_regclass('net.http_post') is null or to_regclass('vault.decrypted_secrets') is null then
        raise notice 'pg_net ou Vault absent : dispatch desactive.'; return 0;
      end if;
      select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
      select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';
      if v_url is null or v_key is null then
        raise warning 'Secrets Vault absents : dispatch ignore.'; return 0;
      end if;
      perform net.http_post(url := rtrim(v_url, '/') || '/functions/v1/daily-briefing',
        headers := jsonb_build_object('content-type', 'application/json', 'authorization', 'Bearer ' || v_key),
        body := jsonb_build_object('date', (now() at time zone 'Europe/Paris')::date),
        timeout_milliseconds := 10000);
      v_sent := 1; return v_sent;
    end; $$;

In 0087: private.dispatch_calendrier_refresh() same shape, URL /functions/v1/refresh-calendrier-ref, key in apikey header NEVER Bearer (section 2.7D: Bearer+key = 401 UNUSABLE_CREDENTIAL, cf. test 0004 l.263-275). v_ variables, qualified tables (avoids returns-table ambiguity, static check n.4).
Job install pattern to copy (0011 l.362-387 - schedule_in_database(..., current_database()), unschedule-if-exists, pg_cron-absent guard, final REVOKE): array of [name, schedule, command], loop with cron.unschedule if exists then cron.schedule_in_database(name, schedule, command, current_database()). In 0087: jobs eo-calendrier-refresh-jan '0 4 1 1 *' + eo-calendrier-refresh-sept '0 4 1 9 *', Europe/Paris by server convention (A1 - verify cron.timezone at plan time). End with revoke all on function private.dispatch_calendrier_refresh() from public, anon, authenticated.

---

### refresh-calendrier-ref/index.ts (edge function, batch) - Analog: gift-list-invite/index.ts

Entry + auth pattern to copy (gift-list-invite l.62-77, l.388-397 - bare import, withSupabase, CORS, json helper):
    import { withSupabase } from '@supabase/server';
    import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
    import { z } from 'npm:zod@4.6.5';
    const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
    const CORS_HEADERS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, x-invite-token', 'access-control-allow-methods': 'POST, OPTIONS' };
    function json(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...CORS_HEADERS } }); }

In refresh: withSupabase({ auth: ['secret'] }, ...) (cron server call only, AGENTS.md 2.2; gift-list-invite uses ['user','publishable'] because multi-client - here secret only). Fail-closed on missing config via env() helper (l.101-105: throw 500 explicit BEFORE any action). Error class pattern (l.91-99): class with readonly status field, constructor(status, message).
Rate-limit pattern to copy (l.210-242 - in-memory Map counter + LIMITS per action, opportunistic purge): WINDOW_MS 60000, LIMITS record per action, MAX_TRACKED_CLIENTS 5000, key = action + client IP (x-forwarded-for split comma 0, fallback cf-connecting-ip, fallback 'inconnu'), 429 'Trop de tentatives...' when exceeded. In refresh: single action 'refresh' with low limit (cron runs 2x/year + manual retry). No HMAC here (no token - do NOT reuse INVITE_TOKEN_HMAC_SECRET).
Fail-open contract (D-15, refresh-specific): any fetch error -> log + json({ refreshed: false }, 200), cache intact, retry next run. Upsert public_holidays (PK holiday_date) + school_holidays (unique zone+bornes) via privileged withSupabase client (bypasses RLS, cf. l.248 type AdminClient = SupabaseClient). URLs: https://calendrier.api.gouv.fr/jours-feries/metropole/{year}.json + EN dataset (shapes in use-ref-days.ts l.18-24). Years: january -> current year; september -> schoolYearFor (use-ref-days.ts l.32-36).

---

### 0017_calendrier_phase.sql (test, batch) - Analogs: 0016_calendrier_rls.sql + 0004_cron.sql

Harness pattern to copy (0016 l.7-31, rollback l.163): begin; do-block with testkit.auth_user x4 (alice admin / bob membre / kid enfant / carol foyer B), testkit.household x2 (Foyer Cal Aaaa / Baaa), testkit.member x4, seed calendars+categories in postgres (testkit.household does NOT seed calendars - 0016 l.32-34), events seeded in postgres bypassing RLS (l.60-62), end block, rollback. Recognizable mark: 'Aaaa' suffix on seeded names.
Negative-assertion patterns to copy: (a) 0016 l.64-76 - as_user + set local role authenticated + testkit.count(...) eq 0::bigint for inter-foyer isolation, reset role; (b) 0016 l.95-100 - testkit.expect_denied(format('insert ... %L ...', ids)) for child writes; (c) 0016 l.127-141 - trigger 23514 proven in postgres role with explicit ids + exception-when-check_violation + testkit.ok(false/true) pair.
In 0017: D-01 = expect_denied admin (Alice) on select/update/delete of Bob Perso + Perso events invisible (count 0) - REPLACES comment 0016 section 2 l.78-87 describing old admin-read (do NOT rewrite 0016, 0017 proves the new world). D-02/D-05 = Perso auto (insert adult member -> Perso exists; enfant -> none). D-08 = rename/delete used category -> 23514. Bound assertions by foyer / Aaaa mark (AGENTS.md 2.7D.2: in postgres RLS is bypassed). testkit.eq requires same types (0::bigint, cf. l.67-69).
Cron-catalog assertions to copy (0004 l.160-196): (1) no job with database distinct from current_database(); (2) no secret in cron.job.command via regex secret|token_hash|password|passwd|api-key|sb_secret|service_role|vapid (l.166-172); (3) eo-% jobs only call private fns without params via regex ^select private.[a-z_]+()$ (l.176-183); (4) exists jobname+schedule pairs (l.185-196, e.g. eo-routine-maintenance 5 6 * * *). In 0017: same 3 guards + exists eo-calendrier-refresh-jan 0 4 1 1 * + sept 0 4 1 9 * + pg_get_functiondef dispatch like Vault-decrypted_secrets (motif 0004 l.209) and like apikey-v_key (motif 0004 l.273). Absent pg_cron/Vault guard: motif 0004 l.296-307 + 0011 l.370-373 (to_regclass null -> raise notice + return).

---

### use-ref-days.ts (hook rewrite, request-response) - Analog: itself + api.ts

Keep verbatim (already tested by use-ref-days.test.ts): toParisDay (l.27-29, en-CA + Europe/Paris), schoolYearFor (l.32-36), parseVacationRecords (l.54-64, dedupe by label|start|end), vacationsOfDay (l.115-117), nextSchoolDay (l.120-127), STALE_MS 24h (l.16), useQuery shape { queryKey, queryFn, staleTime: STALE_MS, retry: 1 } (l.92-104).
Delete: feriesUrl/vacancesUrl (l.18-24), fetchFrenchHolidays (l.38-45), fetchSchoolVacations (l.66-80) - D-13 single source = DB cache (RESEARCH.md Pattern 5: no direct fallback).
Replace queries with DB reads via data.list (api.ts l.46-51: listCalendars/listCategories return data.list<Row>(TABLE); l.91-93: listEventReminders passes { event_id: eventIds } filter). New: data.list<HolidayRow>(PUBLIC_HOLIDAYS, { year }) + data.list<SchoolHolidayRow>(SCHOOL_HOLIDAYS, { zone }) then map rows to FrenchHoliday/VacationRange (reuse toParisDay on start_date/end_date). Offline free via Dexie rows (app/src/lib/data/dexie.ts:23-32). Tests: keep pure-helper tests, add DB-row mapping tests, delete direct-fetch tests (Pitfall 5).

---

### calendrier-page.tsx (component modify, request-response) - Analog: itself

Filter state + combined filter to extend (l.77-82, l.102-116): categoryFilter/memberFilter/calendarFilter useState ('toutes'/'tous'), showHolidays/showBirthdays/showVacations booleans; visibleEvents useMemo filtering category x member x calendar (with 'sans' = null category); visibleBirthdays/Holidays/Vacations gated by toggles; agenda via buildAgenda(selected, { events, tasks, birthdays, holidays, vacations, today }).
D-09/D-10: DELETE the Feries/Vacances toggles (l.306-317, l.330-341) - ref layers always ON (const visibleHolidays = holidays), keep Anniversaires toggle (l.318-329, not a ref layer). Keep the 3 Selects (l.244-284) + admin-only zone Select (l.342+). Retained reading: calendars/categories/members filters stay combinable, ref never hidden.
RefDay non-clickable - already the case, lock it (agenda-list.tsx l.91-106: edit/delete buttons only if item.kind === 'event', onOpenTask only if kind === 'tache'; pastilles l.59-60 decorative aria-hidden). No onClick/onEdit on ferie/vacances. Tap-and-hold creating a foyer event that day is allowed (the event layer receives, not ref).
ConfirmDialog pattern to reuse for D-04 move (l.655-673): open={pendingDelete !== null}, onOpenChange closes+nulls, title/description/confirmLabel props, onConfirm captures target, nulls state, void removeEvent(target.id).then(toast ok).catch(toast error). Second ConfirmDialog for Perso-to-Commun exit in onSubmit (label at agent discretion, e.g. 'Rendre visible a tout le foyer ?').

---

### event-form-dialog.tsx (component modify, request-response) - Analog: itself

Schema + silent-default trap (l.19-42; use-calendrier.ts l.105-108): eventSchema has calendarId: z.string(); saveMutation resolves empty calendarId to existing?.calendar_id ?? resolveCommunCalendarId(householdId). D-03: make choice explicit - visibly preselect Commun (no silent empty value), Zod calendarId non-empty when several calendars. Keep server net 0048 intact.
Calendar Select to fix (l.201-217 - the silent empty option is the defect): renders only if calendars.length > 1; Field render-prop {(props) => (...)}; Select register('calendarId'); option value='' 'Commun du foyer' + calendars minus Commun mapped with ' (perso)' suffix. Form patterns to keep: useForm + zodResolver (l.2-3), defaultValues(event, defaultDate, memberId, remindAt) with calendarId '' (l.51-68 -> preselect Commun), DialogActions Annuler + submit (l.245-252).

## Shared Patterns

### RLS / Security Definer Discipline
Source: 0047_calendrier.sql:132-150, 0048_calendrier_default.sql:8-12,39. Apply to: 0084, 0085, 0086, 0087.
Every function: SECURITY DEFINER + set search_path = '' + public.* qualified tables. Helpers read by RLS policies -> GRANT EXECUTE to authenticated (+ service_role). Triggers never called directly -> REVOKE ALL ... FROM public, anon, authenticated (same motif as 0009/0026, cf. 0047 l.413-418).

### Static-SQL Checklist (section 2.7A/B)
Source: AGENTS.md 2.7 + scripts/check-sql-statique.py (8 checks, green before commit). Apply to: 0084-0087 + test 0017.
No self-joining CTE; qualified tables under empty search_path; v_ qualified variables (no returns-table collision); no DML+ALTER same table same txn (0086: trigger only).

### Secrets
Source: 0011_cron.sql:327-340, test 0004_cron.sql:165-183. Apply to: 0087 + Edge refresh.
Vault decrypted_secrets at execution time; nothing in clear in cron.job.command (guard regex); commands are bare select private.fn() only; Edge: apikey header never Bearer; stdin for psql never -c with secret.

### Frontend Data + UX
Source: api.ts:46-51 (data.list), calendrier-page.tsx:655-673 (ConfirmDialog), AGENTS.md section 6. Apply to: use-ref-days rewrite, FilterBar, event-form-dialog, move-confirm.
Reads via data.list (free Dexie cache) + TanStack staleTime 24h retry 1; destructive actions (category delete, Perso-to-Commun move) = ConfirmDialog; tap-and-hold is an extra entry (plus button kept); D-07: category colors the event, member color on avatars - extend buildDayMarkers (types.ts:291-329), no second system.

## No Analog Found

None. All 9 files have an exact or role-match analog; zones without precedent (fail-open D-15, 23514 category guard) are covered by excerpts above + RESEARCH.md Code Examples.

## Metadata

**Analog search scope:** supabase/migrations/, supabase/functions/, supabase/tests/, app/src/modules/calendrier/
**Files scanned:** 13 (0047, 0048, 0054, 0011, gift-list-invite, ardoise-invite listed same family, 0016, 0004, calendrier-page, use-ref-days, event-form-dialog, use-calendrier, api.ts + agenda-list/types via grep)
**Pattern extraction date:** 2026-10-06
**Notes:** ardoise-invite/ not read (same HMAC family as gift-list-invite, already covered); stopped after 5 SQL + 1 Edge + 2 tests + 5 frontend sources - diminishing returns beyond. Frontend entries are self-analogs (extend/rewrite, no cross-module copy). Test 0016 section 2 (l.78-87) documents old admin-read: 0017 replaces it, 0016 stays history (forward-only).