---
phase: 01-calendrier
reviewed: 2026-10-06T12:30:00Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - supabase/migrations/0084_calendrier_perso_total.sql
  - supabase/migrations/0085_calendrier_perso_auto.sql
  - supabase/migrations/0086_calendrier_category_guard.sql
  - supabase/migrations/0087_calendrier_refresh_cron.sql
  - supabase/functions/refresh-calendrier-ref/index.ts
  - supabase/functions/refresh-calendrier-ref/ref-days.ts
  - supabase/functions/refresh-calendrier-ref/helpers.test.ts
  - supabase/tests/0017_calendrier_phase.sql
  - app/e2e/calendrier.spec.ts
  - app/src/modules/calendrier/components/event-form-dialog.tsx
  - app/src/modules/calendrier/components/event-form-dialog.test.tsx
  - app/src/modules/calendrier/types.ts
  - app/src/modules/calendrier/types.test.ts
  - app/src/modules/calendrier/hooks/use-ref-days.ts
  - app/src/modules/calendrier/hooks/use-ref-days.test.tsx
  - app/src/modules/calendrier/hooks/use-calendrier.ts
  - app/src/modules/calendrier/hooks/use-school-zone.test.tsx
  - app/src/modules/calendrier/api.ts
  - app/src/modules/calendrier/calendrier-page.tsx
  - app/src/modules/calendrier/calendrier-page.test.tsx
  - app/src/modules/calendrier/components/calendar-grid.tsx
  - app/src/lib/data/seed.ts
  - app/src/lib/data/local-adapter.ts
  - scripts/deploy-functions.sh
findings:
  critical: 0
  warning: 5
  info: 6
  total: 11
status: issues_found
---

# Phase 01-calendrier: Code Review Report

**Reviewed:** 2026-10-06T12:30:00Z
**Depth:** standard
**Files Reviewed:** 24
**Status:** issues_found (advisory only — none of these blocks the phase)

## Summary

Reviewed the full phase scope (migrations 0084–0087, `refresh-calendrier-ref` Edge function, calendrier frontend + seed + local-adapter, SQL suite 0017, e2e spec, unit tests) via SUMMARY.md key-files unioned with `git diff 09f96d7..ed4002d` (0084/0085 predate the diff base, read directly). SQL discipline (SECURITY DEFINER, `search_path = ''`, qualified tables, REVOKE) is respected everywhere; upsert conflict targets match real constraints (`holiday_date` PK, `(zone, start_date, end_date)` unique); no secrets in cron commands; no new RLS bypass.

**Inert-delete claim — VERIFIED.** The 01-04 finding is mechanically correct: `events_delete_admin` (0047) `USING` permits the admin, but PostgreSQL locates DELETE/UPDATE target rows through the SELECT policy path (`events_select_household` → `is_calendar_visible`, which 0084 closed to owner-only). An invisible row is never located, so the DELETE affects 0 rows — exactly what suite 0017 asserts. The moderation net is therefore dead code in practice. But 0084's own header (l.14-17) and table comment (l.94-95) still *promise* a working moderation net, which misleads any future reader/operator — WR-01.

No hardcoded secrets, injection, XSS, or auth-bypass found. Remaining findings are logic gaps and robustness issues, all advisory.

## Warnings

### WR-01: 0084 promises a moderation net that PostgreSQL renders inert

**File:** `supabase/migrations/0084_calendrier_perso_total.sql:14-17,94-95`
**Issue:** Header ("l'admin garde la suppression des events Perso comme filet de modération") and table comment ("la suppression admin reste possible") assert an effective capability that suite 0017 proves returns 0 rows. Verified against 0047: `events_delete_admin USING` is admin-permissive, but row location goes through `events_select_household` → `is_calendar_visible` (owner-only since 0084), so the DELETE never finds its target. Operational risk: a future admin facing problematic Perso content will believe a purge path exists when none does. The 0017 header documents the inertness, but the migration comment (the artifact operators read via `\d+`) still claims the opposite.
**Fix:** Forward-only correction — new migration updating the table comment to state the net is inert (SELECT-gating) and pointing at the follow-up decision (dedicated `SECURITY DEFINER` moderation RPC vs. accepted gap). Do not rewrite 0084.
```sql
comment on table public.event_calendars is
  'Calendriers du foyer : Commun partage + Perso owner-seul, invisible aux autres membres meme admin. Note : la suppression admin des objets Perso est inerte en pratique (SELECT-gating PostgreSQL, prouve en 0017) ; moderation reelle = RPC dedie a trancher.';
```

### WR-02: D-06 child still sees event/task creation buttons

**File:** `app/src/modules/calendrier/calendrier-page.tsx:219-224,189-204`
**Issue:** `isChild` gates only the `+ Calendrier perso` / `+ Catégorie` buttons (l.306, l.318). The `ModuleShell` actions (`Ajouter un événement`, `Ajouter une tâche`) and the agenda-panel buttons stay visible to `enfant` and open a working create dialog. Server RLS (`can_write_household` excludes `enfant`) still rejects the write, so this is a UX/contract gap, not a privilege escalation — but the D-06 claim "Enfant sans bouton de création" is overstated, and the page test (`calendrier-page.test.tsx:269-284`) only asserts the two already-hidden buttons, so the gap is test-blind.
**Fix:** Gate the four create entry points on `isChild` (hide or disable with explanation), and extend the D-06 test to assert `queryByRole('button', { name: 'Ajouter un événement' })` is absent for Noé.
```tsx
{isChild ? null : (
  <Button icon="plus" onClick={() => openCreate(selected)}>Ajouter un événement</Button>
)}
```

### WR-03: Vacations ignore the `year` parameter — all school years displayed

**File:** `app/src/modules/calendrier/hooks/use-ref-days.ts:86-90,62-64`
**Issue:** The vacations query key is `['ref-days', 'school_holidays', zone]` (no year) and `listSchoolHolidays(zone)` filters on zone only (`api.ts:62-64`), so `toVacationRanges` maps rows from *every* cached school year. A `year` change never refetches vacations, and last year's Toussaint renders alongside this year's. Holidays are correctly year-scoped; vacations are not.
**Fix:** Include the covering school years in the key and filter rows to them:
```ts
const schoolYears = useMemo(() => [schoolYearFor(`${year}-01-01`), schoolYearFor(`${year}-12-31`)], [year]);
// queryKey: ['ref-days', 'school_holidays', zone, ...schoolYears]
// then: toVacationRanges((vacationsQuery.data ?? []).filter((r) => schoolYears.includes(r.school_year)))
```
(`schoolYearsForYear` exists in the Edge mirror but was never ported to the frontend — port it instead of duplicating logic a third time; see IN-04.)

### WR-04: `resolveCommunCalendarId` matches on name only — a Perso named "Commun" hijacks the silent fallback

**File:** `app/src/modules/calendrier/api.ts:67-70`
**Issue:** Lookup is `cal.household_id === householdId && cal.name === 'Commun'`, with no `visibility === 'commun'` check. Since 0085, Perso names are shareable (partial unique index is per-owner), so a Perso literally named `Commun` is legal — and this resolver feeds the empty-`calendarId` fallback in `use-calendrier.ts:108`, silently routing events into somebody's Perso. The dialog's own `communCalendar` lookup (event-form-dialog.tsx:131-134) correctly prefers `visibility`.
**Fix:**
```ts
return calendars.find((cal) => cal.household_id === householdId && cal.visibility === 'commun')?.id ?? null;
```

### WR-05: One malformed vacation record poisons the entire refresh (all zones)

**File:** `supabase/functions/refresh-calendrier-ref/index.ts:148-179`, `ref-days.ts:51-61`
**Issue:** `parseVacationRecords` never validates its output (`toParisDay` on garbage yields the string `'Invalid Date'`, start/end ordering unchecked). A single bad record then throws at the `school_holidays` upsert (`end_date >= start_date` check / date parse), aborting `refreshVacations` for *all* remaining zones — and since `refreshHolidays` already succeeded, the run returns `refreshed:false` while holidays were in fact stored (misleading status + lost vacation cache until the next cron, 2×/year).
**Fix:** Filter invalid ranges in `parseVacationRecords` (drop when `start`/`end` don't match `/^\d{4}-\d{2}-\d{2}$/` or `start > end`), and wrap the per-zone upsert in try/catch so one zone's failure doesn't cancel the others; report per-zone counts in the 200 payload.

## Info

### IN-01: Cron dispatch sends `{date}`, the Edge reads `{year}` — dead field

**File:** `supabase/migrations/0087_calendrier_refresh_cron.sql:72-74`, `supabase/functions/refresh-calendrier-ref/index.ts:120-122`
**Issue:** `dispatch_calendrier_refresh` posts `body: {date: ...}` but `requestSchema` only knows `year` (Zod strips unknown keys), so cron-triggered refreshes always use "current Paris year" and the transmitted date is ignored. Harmless today (`schoolYearsForYear` covers both adjacent school years) but confusing to the next reader.
**Fix:** Send `{ year: extract(year from now() at time zone 'Europe/Paris') }` from the dispatch, or drop the body field.

### IN-02: Fail-open catch-all has no observable signal for persistent breakage

**File:** `supabase/functions/refresh-calendrier-ref/index.ts:219-229`
**Issue:** Every non-429 failure (misconfigured admin client, missing tables, schema drift) returns `200 {refreshed:false}` with only `console.error`. By design (D-15), but with cron at 2×/year a broken refresh can sit undetected for months. 429 correctly stays an error.
**Fix:** Keep the 200 contract, but add a server-visible signal: insert a row into a lightweight `refresh_status` table or emit a `raise notice`-visible log the existing `test-dispatch-push.sh`-style live check can assert on.

### IN-03: Wildcard CORS on a secret-authenticated endpoint

**File:** `supabase/functions/refresh-calendrier-ref/index.ts:42-46`
**Issue:** `access-control-allow-origin: '*'` with `apikey` in allowed headers means any origin can attempt authenticated calls (the key itself stays secret, so exploitability is nil — but the wildcard buys nothing for a server-to-server endpoint).
**Fix:** Restrict `allow-origin` to the API host or drop CORS handling to OPTIONS-204 only for expected callers.

### IN-04: Vacation helpers now live in three places — drift risk

**File:** `supabase/functions/refresh-calendrier-ref/ref-days.ts`, `app/src/modules/calendrier/hooks/use-ref-days.ts`
**Issue:** `toParisDay` / `schoolYearFor` / `parseVacationRecords` / `VacationRange` / `SchoolZone` are copy-pasted between Edge and frontend ("miroir" by convention), and `schoolYearsForYear` exists only on the Edge side (which is exactly what WR-03's fix needs on the frontend). Copies already diverge in surface (Edge `VacationRecord` exported, frontend private).
**Fix:** No shared-runtime import exists between Deno Edge and Vite app, so keep the mirror but add a one-line cross-reference comment in each file naming its twin, so the next editor updates both.

### IN-05: 0085 trigger covers INSERT only — role changes leave stale/missing Perso

**File:** `supabase/migrations/0085_calendrier_perso_auto.sql:41-60`
**Issue:** `AFTER INSERT` handles new members, but: (a) `enfant → membre` promotion never creates the Perso the adult is entitled to; (b) `membre → enfant` demotion keeps a writable-looking Perso (RLS still blocks writes, so no privilege leak — but a stale private calendar). `ON CONFLICT DO NOTHING` without a conflict target is fine here (only the owner-unique index can fire) but will also swallow any future unique violation silently.
**Fix:** Add an `AFTER UPDATE OF role` trigger handling both transitions, or document the backfill query for operators to run on role change.

### IN-06: Edit dialog can clobber `memberId`/color if members load late

**File:** `app/src/modules/calendrier/components/event-form-dialog.tsx:126-128,145-151`
**Issue:** `memberId` is derived from `members` at first render; the reset effect (deps `[open, event?.id, defaultDate, remindAt]`) doesn't re-run when `members` arrive, so opening the edit dialog before the store hydrates defaults `memberId` to `''` → save recomputes `color: 'coral'`, silently recoloring the event. Narrow window (the page renders the member filter from the same store), hence Info.
**Fix:** Add `members` (or `memberId`) to the reset-effect deps guarded by "only while pristine", or compute `memberId` inside `defaultValues` at reset time from current store state.

---

_Reviewed: 2026-10-06T12:30:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
