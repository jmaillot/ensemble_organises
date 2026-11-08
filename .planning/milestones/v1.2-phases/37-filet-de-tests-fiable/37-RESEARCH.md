# Phase 37: Filet de tests fiable - Research

**Researched:** 2026-11-07
**Domain:** Test-suite debt remediation (Vitest flake, Playwright e2e with real backend, localStorage session purge)
**Confidence:** HIGH (all code claims verified by reading source this session)

## Summary

This phase is 100% test debt — zero new product surface. Four debts (TEST-01..TEST-04) must be closed, corrected, or honestly documented. The codebase investigation this session confirms the working baseline described in CONTEXT.md: the unit suite is already green (per 2026-11-07 measurement, confirmed by `cdd4fa7` fixing the date-dependent birthday tests), the e2e spec `offline-shared-device.spec.ts` already exists with its conditional env-var skip, and the GoTrue storage-key derivation already exists in `session-cache.ts` and is **only consumed by readers** — no code path currently removes the `sb-<ref>-auth-token` key (or its chunks) outside of whatever `supabase.auth.signOut()` does internally.

The most important discovery for TEST-04: `session-store.signOut` (the single purge chokepoint, D-05) never touches localStorage. `grep` over `src/` shows `cleStockageSession` is imported only by `use-auth.ts` (read path, via `lireSessionPersistee`). There is **no** `localStorage.removeItem` of the GoTrue key anywhere in non-test source except what supabase-js itself performs inside `auth.signOut()` — and guest/bootstrap-fallback paths (T-35-06) never call `supabase.auth.signOut()`. This is exactly the defect D-07/D-09 target, and it makes the "red before green" demonstration (D-09) straightforward: a unit test that seeds `sb-<ref>-auth-token` and runs the guest-purge/signOut path will fail today.

For TEST-01, the flake is in `auth-bootstrap-offline.test.tsx` test D: the mocked `expires_at` is computed from a real `Date.now()`, the bootstrap chain is async across three stores, and the `waitFor` uses default options. Under 243-file parallel load (forks pool, parallel by design per `vite.config.ts` comment), the default `waitFor` timeout window is the plausible race — but per D-01 we fix the test's tolerance, not diagnose production code.

**Primary recommendation:** Plan four independent workstreams — (1) harden test D's async tolerance + document in RETROSPECTIVE, (2) verify `cdd4fa7` covers TEST-02 and record it, (3) execute the existing e2e spec with real accounts via existing env vars and capture Playwright output as phase proof, (4) build the session-purge module (red test first per D-09), wire it into `session-store.signOut`, prove both unit (jsdom) and e2e (localStorage raw read).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Fix the test, not production root-cause. Test D (`auth-bootstrap-offline.test.tsx`) fails ~1/367 under load only; working hypothesis is a test-side race (timers/waitFor under 243-worker parallelism). Fix = load tolerance (fake timers or robust waitFor).
- **D-02:** Diagnostic goes in `docs/RETROSPECTIVE.md` (§ campagne tests v1.2): measured frequency, reproduction conditions, hypothesis ruled out, nature of fix. A non-silent success (§2.7 F).
- **D-03:** TEST-02 = "confirm settled", not a workstream. `cdd4fa7` (5 Nov) already fixed the birthday tests; plan verifies the commit covers the 2 targeted tests and records it. If the original 2 tests are NOT the ones fixed, escalate to user before any work.
- **D-04:** The conditional env-var skip of the e2e spec is KEPT (spec ignores itself explicitly, never declares itself green). Unconditional de-skip refused.
- **D-05:** The 2 real accounts come via existing env vars `E2E_SHARED_USER_A_EMAIL/PASSWORD`, `E2E_SHARED_USER_B_EMAIL/PASSWORD` pointing at the real self-hosted backend. Values live outside the repo (§2.7 H).
- **D-06:** Green execution happens DURING the phase — user provides accounts, agent executes, proof (Playwright output, 2 accounts, offline context, raw IndexedDB read) goes in phase VALIDATION. Not a deferred manual walk.
- **D-07:** Dedicated session-purge module rather than surgical fix. It explicitly erases `sb-<ref>-auth-token` (and its `.0`/`.1`+ chunks beyond the size guard) on every sign-out/guest purge. Reuses the key derivation already in `session-cache.ts`.
- **D-08:** Two-level proof: unit (raw localStorage read in jsdom) + e2e (extend existing raw-read `clesCacheBrutes()` / `page.evaluate` to localStorage). Test asserts absence of any `sb-*-auth-token*` key after purge.
- **D-09:** Purge test demonstrated RED before green (§2.7 B): current code leaves the key on guest purge — the initial red is proof the defect exists.
- **D-10:** One single entry in `docs/RETROSPECTIVE.md` (section « campagne tests v1.2 ») covers all 4 debts.

### the agent's Discretion
- Exact flake-fix technique (fake timers vs waitFor vs explicit timeouts) — decided by researcher/planner on the real test.
- Location of the purge function (extend `session-cache.ts` vs dedicated module) — decided on existing call sites (`session-store.signOut`, guest purges).
- Exact mechanics of providing e2e accounts at run time (shell, out-of-repo .env) — free, as long as values are never committed.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEST-01 | Flake auth-bootstrap test D pinned and fixed or documented | Test D located at `app/src/hooks/__tests__/auth-bootstrap-offline.test.tsx:84-98`; race surface identified (async 3-store bootstrap + default waitFor + real-clock expiry mock) |
| TEST-02 | 2 pre-existing red birthday tests pass | Already settled by `cdd4fa7` (verified: touches `app/src/modules/anniversaires/anniversaires-page.test.tsx`, +7/−4) — plan must verify coverage of the 2 original tests, else escalate (D-03) |
| TEST-03 | e2e offline-shared-device written and executed with 2 real accounts | Spec already written (`app/e2e/offline-shared-device.spec.ts`, env-var skip verified verbatim); remaining work = execution with accounts (D-05/D-06) + localStorage read extension (D-08) |
| TEST-04 | Residual GoTrue key on guest purge eliminated | Verified: no non-test source removes `sb-*-auth-token*`; `cleStockageSession()` derivation exists (`session-cache.ts:19-29`); `session-store.signOut` is the single purge chokepoint to wire |
</phase_requirements>

## Project Constraints (from AGENTS.md)

Directives with authority equal to locked decisions:

1. **§2.7 chain before commit (prescriptive, in order):** `cd app && npm run typecheck && npm test && npm run build`; then `npm run test:e2e`; then `python3 scripts/check-sql-statique.py` and its self-test; then `sh scripts/test-db.sh` (Docker machines) and `sh scripts/test-dispatch-push.sh` where applicable. No SQL changes expected in this phase — the SQL checks should still pass trivially.
2. **No linter exists and none may be introduced.** No ESLint/Biome/Prettier directives — prohibited. A deliberately omitted effect dependency carries a comment naming the reason, never "dependencies intentionally omitted". `app/src/lib/no-eslint-directive.test.ts` refuses reintroduction.
3. **§2.7 B — "vu rouge avant d'être vu vert":** any test proving a fix must be demonstrated failing first (D-09 applies this explicitly).
4. **§2.7 F — silent success is unexplained failure:** the green test D and the e2e run must be accompanied by their written explanation in the retrospective (D-02, D-10).
5. **§2.7 I — an affirmed absence is an affirmation:** the e2e spec must keep explicitly ignoring itself (not declaring green) when accounts are absent (D-04).
6. **§2.7 H — secrets never versioned, never on command lines:** e2e account values live outside the repo (D-05).
7. **§D (assertion rules):** read the function before writing the assertion; bound assertion scope (count per household/user, not whole storage — here: filter keys by pattern, don't assert global emptiness of unrelated keys); no tautologies.
8. **§2.7 / §I corollary:** correcting the class, not the instance — the purge must be at the single chokepoint (`session-store.signOut`), not at each call site.

## Standard Stack

### Core (already in repo — nothing to install)

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Vitest | v5 [VERIFIED: app/package.json `test: vitest run`; version from lockfile] | Unit tests | Project standard, already configured (forks pool, jsdom, fake-indexeddb) |
| @testing-library/react | present | `renderHook`/`waitFor` for hook tests | Already used by the flaky test |
| fake-indexeddb | present | Browser-storage simulation in unit tests | Established pattern (query-persistence.test.ts) |
| Playwright | present (`npm run test:e2e`) | e2e, offline via `context.setOffline(true)` | Established conventions in `critical-paths.spec.ts` |
| jsdom localStorage | built-in | Raw-read assertions for the purge unit test | D-08 level 1 |

**Installation:** none. Zero new packages — this phase is pure test/debt work. Package Legitimacy Audit not applicable.

## Architecture Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Flake hardening (TEST-01) | Test harness (Vitest) | — | D-01: test-side fix only |
| Birthday suite verification (TEST-02) | Test suite (git history) | docs | D-03: verify + record, no code |
| e2e execution (TEST-03) | Test harness (Playwright) | Real backend (user-supplied accounts) | D-05/D-06: execution during phase |
| GoTrue key purge (TEST-04) | Frontend lib (`session-cache.ts` or sibling) | Store chokepoint (`session-store.ts`) | D-07: one module, wired at the single sign-out chokepoint |
| Campaign record (D-10) | Docs (`docs/RETROSPECTIVE.md`) | — | Single entry for all 4 debts |

## Architecture Patterns

### System Architecture Diagram (TEST-04 — the only code change)

```
Deconnexion / guest-purge paths
  ├─ use-auth.signOut()  (revokes server token, calls store)
  ├─ SIGNED_OUT listener
  ├─ bootstrap fallback (no session → guest, T-35-06)
  └─ local mode
          │
          ▼  ALL paths converge (D-05 chokepoint)
  session-store.signOut()
          │  scan outbox → stopPersisting → purgeUserCache (IndexedDB)
          │  → queryClient.clear()
          │  ★ NEW: purgeSessionStockage()  ← removes sb-<ref>-auth-token
          ▼     and chunks .0/.1/... from localStorage
  localStorage clean of any sb-*-auth-token*
          │
          ▼  Proof (D-08)
  Unit (jsdom): seed key+chunks → purge → assert no sb-*-auth-token*
  e2e: page.evaluate(Object.keys(localStorage)) → filter /sb-.*-auth-token/
```

### Verified code facts (verbatim quotes)

**Key derivation — `app/src/lib/supabase/session-cache.ts:19-29`:**
```ts
export function cleStockageSession(): string | null {
  if (!supabaseUrl) return null;
  try {
    const hostname = new URL(supabaseUrl).hostname;
    const reference = hostname.split('.')[0];
    return reference ? `sb-${reference}-auth-token` : null;
  } catch {
    // URL malformée : pas de clé dérivable, donc pas de session consultable.
    return null;
  }
}
```
Chunk convention (same file, lines 55-63): fragments read as `` `${cle}.${index}` `` starting at `.0`, sequence ends at first missing index; the base key is read only when no fragment exists.

**Purge chokepoint — `app/src/stores/session-store.ts` (`signOut` action, lines ~66-120):** scan-avertir-purger (`OutboxPendingError` without `acknowledgePendingWrites`) → `stopPersisting()` → `purgeUserCache(userId)` → dynamic import `queryClient.clear()` → `set({ user: null, status: 'guest', ... })` → `useHouseholdStore.getState().reset()`. **No localStorage touch today.** The new purge belongs after the IndexedDB purge and before the state reset (order rationale mirrors the existing Pitfall-6 comment: no resurrect).

**e2e env-var skip — `app/e2e/offline-shared-device.spec.ts:28-38` (verbatim values):**
```ts
const userAEmail = process.env.E2E_SHARED_USER_A_EMAIL;
const userAPassword = process.env.E2E_SHARED_USER_A_PASSWORD;
const userBEmail = process.env.E2E_SHARED_USER_B_EMAIL;
const userBPassword = process.env.E2E_SHARED_USER_B_PASSWORD;
...
test.skip(!userAEmail || !userAPassword || !userBEmail || !userBPassword, skipReason);
```
This is the exact contract to keep (D-04). The spec's `clesCacheBrutes(page)` (lines 41-63) is the pattern to extend: add a sibling `clesStockageBrutes(page)` doing `page.evaluate(() => Object.keys(localStorage))`.

**Test D — `app/src/hooks/__tests__/auth-bootstrap-offline.test.tsx:84-98`:** renders `useAuthBootstrap` after seeding persisted household + `onlineManager.setOnline(false)` + `auth.getSession.mockResolvedValue({ data: { session: { user, expires_at: Date.now() / 1000 + 3600 } } })`, then a bare `await waitFor(() => expect(result.current.ready).toBe(true))` followed by 4 synchronous assertions.

### Pattern: e2e raw-read extension (D-08, level 2)

```typescript
// Source: pattern of clesCacheBrutes(), offline-shared-device.spec.ts:41-63
async function clesStockageBrutes(page: Page): Promise<string[]> {
  return page.evaluate(() => Object.keys(localStorage));
}
// Assertion: no GoTrue session key survives the purge
expect(await clesStockageBrutes(page)).not.toContainEqual(
  expect.stringMatching(/sb-.*-auth-token/),
);
```
[ASSUMED: exact assertion form — planner should mirror the existing `expect.stringContaining('eo-query-cache:')` idiom at spec line 89-91.]

### Recommended workstream order (planner input)

1. TEST-02 verification (read `cdd4fa7`, confirm coverage) — cheapest, may escalate.
2. TEST-04 purge (red-first unit test, then module, then wire chokepoint, then e2e extension).
3. TEST-01 flake hardening + retrospective documentation.
4. TEST-03 e2e execution with accounts (needs user coordination — schedule last so the extended localStorage assertion runs in the same execution).
5. D-10 single retrospective entry, closing the campaign.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GoTrue key derivation | New key-name logic in the purge | `cleStockageSession()` from `session-cache.ts` (D-07 mandates reuse) | Single source of truth; supabase-js derivation already encoded |
| Chunk discovery | Hardcoded `.0`/`.1` list | Existing scan loop idiom (read `${cle}.${i}` until null, session-cache.ts:55-63) | Chunk count unbounded by spec |
| Offline simulation | Custom fetch interception | Playwright `context.setOffline(true)` (already in spec) | Already proven in this spec |
| IndexedDB in unit tests | jsdom shims | fake-indexeddb (already configured) | Established, per-file isolated |
| Async waiting | Manual sleep/polling | `waitFor` with explicit options | Project idiom; manual sleeps are the anti-pattern that caused the flake class |

## Common Pitfalls

### Pitfall 1: Purge placement that misses guest paths
**What goes wrong:** Wiring the purge only in `use-auth.signOut` (which calls `supabase.auth.signOut()`) leaves the bootstrap-fallback and local-mode guest paths uncleaned — the very paths that never revoke a GoTrue token.
**Why:** supabase-js only removes its own key inside `auth.signOut()`; guest fallbacks skip it.
**Avoid:** wire at `session-store.signOut` — the documented single chokepoint (D-05 comment, session-store.ts:66-71).
**Warning signs:** e2e `clesStockageBrutes` non-empty after a guest-path test.

### Pitfall 2: Supabase re-persisting the session after purge
**What goes wrong:** purging the key while an `onAuthStateChange` listener or an in-flight token refresh later writes it back — the key "resurrects".
**Avoid:** purge after unsubscribing/stopping persisters, mirroring the existing order discipline (`stopPersisting()` before `purgeUserCache`, session-store.ts:94-98). Assert absence at the END of the flow, not mid-way.
**Warning signs:** unit test green alone but e2e red.

### Pitfall 3: Test-D "fix" that hides real regressions
**What goes wrong:** blanket-increasing the global waitFor timeout or adding retries masks genuine regressions suite-wide.
**Avoid:** scope the tolerance to test D (explicit `timeout`/`interval` options on that `waitFor` call, or `vi.useFakeTimers()` scoped to the test); do not touch vitest global config. Note `restoreMocks: true` and the per-file fork isolation are intentional — don't change pool settings.
**Warning signs:** diff touching `vite.config.ts` test block.

### Pitfall 4: e2e declaring green without running (§2.7 I)
**What goes wrong:** refactoring the skip into a `test('...', () => {})` that passes silently.
**Avoid:** keep `test.skip(condition, reason)` verbatim (D-04). The skip reason string is a §2.7 I-affirmation and must stay accurate.

### Pitfall 5: Secrets in CI logs or shell history (§2.7 H)
**What goes wrong:** account passwords passed on the command line or committed in a temp .env.
**Avoid:** export in the shell session / out-of-repo env file consumed at run time; never echo; never `git add`.

### Pitfall 6: D-05-style assertion tautology
**What goes wrong:** asserting "no key equals `sb-<ref>-auth-token`" but forgetting chunks, or filtering so narrowly a malformed key passes.
**Avoid:** assert absence of the whole family `/^sb-.*-auth-token(\.\d+)?$/`-shaped keys; and per D-09 demonstrate the red first — if the "red" run passes, the test is broken, not the code.

## Code Examples

### Unit test skeleton for TEST-04 (red-first, D-08/D-09)

```typescript
// Source: derived from session-cache.ts:19-63 and query-persistence.test.ts conventions
// Seed exactly what supabase-js would write, then run the sign-out/guest path,
// then raw-read localStorage. RED today (nothing removes the key), GREEN after fix.
const cle = cleStockageSession()!; // client mocked with supabaseUrl 'https://api.exemple.fr'
localStorage.setItem(`${cle}.0`, JSON.stringify(part1));
localStorage.setItem(`${cle}.1`, JSON.stringify(part2));
// ... run signOut / guest purge ...
const residuelles = Object.keys(localStorage).filter((k) => k.includes('-auth-token'));
expect(residuelles).toEqual([]);
```
[ASSUMED: chunked-seed shape — the test should also cover the unchunked base-key case; planner decides both.]

### Flake-tolerance options for test D (D-01 discretion area)

```typescript
// Option A (recommended first): explicit options, scoped to the one waitFor
await waitFor(() => expect(result.current.ready).toBe(true), { timeout: 5_000, interval: 50 });
// Option B: fake timers to remove wall-clock sensitivity of Date.now()-derived expiry
// (careful: @testing-library/react async utils need act()/advanceTimers wiring)
```
[ASSUMED: root-cause hypothesis is load-starved waitFor, per D-01 working hypothesis — the fix is validated by repeat runs under load, not by certainty.]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 2 red birthday tests expected | Already fixed by `cdd4fa7` (date-bounded birthday search) | 2026-11-05 | TEST-02 becomes verification + documentation only |
| Vitest sequential pool | Parallel forks pool, per-file fake-indexeddb | Earlier v1.1 | 243-file parallelism is the flake's load context — do not regress it |
| Guest purge = IndexedDB only | D-07 adds localStorage session purge | This phase | Closes the A/B isolation gap at the GoTrue layer |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The flake's root is the bare `waitFor` timing out under load (not a production-code race) | Code Examples / TEST-01 | Fix is misdirected; then per D-01/D-02 the diagnostic-and-document route applies — cheap fallback |
| A2 | The "2 tests" of TEST-02 are exactly the ones touched by `cdd4fa7` (commit stat confirms file match; not diffed line-by-line this session) | phase_requirements | D-03 mandates escalation to user — plan must include this verification step |
| A3 | `supabase.auth.signOut()` does remove its own localStorage key internally | Pitfall 2 | If it doesn't, the residual key is even more prevalent — purge fix still correct; only the "red" demonstration setup changes |
| A4 | Exact assertion/filter shapes in the purge tests (regex, chunk seeding) | Code Examples | Cosmetic; planner finalizes against real storage contents |

## Open Questions (RESOLVED)

1. **What does `supabase-js v2` do to `sb-<ref>-auth-token` on `signOut()` in this pinned version?** — RESOLVED : tranché empiriquement par le test rouge D-09 (37-01, Tâche 2, contrôle 3 de la liste rouge), sans input utilisateur.
2. **Are the e2e accounts provisioned in a household where Tier 1 data exists for both A and B?** — RESOLVED : règlé par le `user_setup` de la tâche 3 du plan 37-02 (l'utilisateur provisionne les données Tier 1 pour A et B avant l'exécution D-06, checkpoint bloquant).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | typecheck/test/build | ✓ | 24.21.0 (verified this session) | — |
| Vitest / Playwright | all test work | ✓ (repo deps) | per lockfile | — |
| Real self-hosted Supabase backend + 2 accounts | TEST-03 execution | ✗ (user-provided, per D-05) | — | None — blocks only TEST-03 execution; spec keeps its explicit skip |
| Docker (test-db.sh) | §2.7 chain tail | Not verified this session | — | SQL checks trivially unaffected (no SQL changes) |

**Missing dependencies with no fallback:** none for code work. TEST-03 execution awaits user-supplied accounts (D-05) — planned, not blocked.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5 (unit) + Playwright (e2e), per `app/package.json` [VERIFIED] |
| Config file | `app/vite.config.ts` (test block: jsdom, forks pool, `restoreMocks: true`) / `app/playwright.config.ts` |
| Quick run command | `cd app && npx vitest run src/hooks/__tests__/auth-bootstrap-offline.test.tsx` |
| Full suite command | `cd app && npm run typecheck && npm test && npm run build && npm run test:e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-01 | Test D passes repeatedly under load | unit (repetition under parallel load) | `cd app && npx vitest run src/hooks/__tests__/auth-bootstrap-offline.test.tsx` | ✅ |
| TEST-02 | Birthday suite green | unit | `cd app && npx vitest run src/modules/anniversaires/anniversaires-page.test.tsx` | ✅ |
| TEST-03 | e2e shared-device offline green with 2 accounts | e2e | `cd app && npm run test:e2e -- offline-shared-device` (env vars set) | ✅ |
| TEST-04 | No `sb-*-auth-token*` key after purge | unit + e2e | new unit file (Wave 0) + `offline-shared-device.spec.ts` extension | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run typecheck && npm test` (+ targeted file)
- **Per wave merge:** full §2.7 chain
- **Phase gate:** §2.7 chain green + captured Playwright output for TEST-03 (D-06) + red-then-green evidence for TEST-04 (D-09)

### Wave 0 Gaps
- [ ] Unit purge test file (TEST-04, red-first) — location: extend `src/stores/session-store.test.ts` or a dedicated `session-purge.test.ts` (discretion, D-07)
- [ ] e2e `clesStockageBrutes()` + localStorage assertion in `offline-shared-device.spec.ts`

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V3 Session Management | **yes — this phase IS session management** | Centralized purge of GoTrue localStorage key; no token resurrections |
| V4 Access Control | yes (isolation A/B preserved) | Purge must not weaken D-05/D-06 isolation; e2e re-proves it |
| V6 Cryptography | no | No crypto changes |
| V5 Input Validation | no | Test-only surface |

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Session token residue on shared device | Information Disclosure | D-07 purge at single chokepoint, proven by raw storage read |
| Purged key resurrected by in-flight writer | Tampering | Purge after `stopPersisting()`/before state reset (existing order discipline) |

## Sources

### Primary (HIGH confidence)
- Read this session: `app/src/lib/supabase/session-cache.ts` (full), `app/e2e/offline-shared-device.spec.ts` (full), `app/src/hooks/__tests__/auth-bootstrap-offline.test.tsx` (full), `app/src/stores/session-store.ts` (signOut action), `app/vite.config.ts` (test block), `app/playwright.config.ts` (grep), `app/package.json` (scripts)
- `git show --stat cdd4fa7` — birthday test fix, 1 file +7/−4
- `.planning/phases/37-filet-de-tests-fiable/37-CONTEXT.md` — all D-decisions
- `.planning/REQUIREMENTS.md` TEST-01..04

### Secondary (MEDIUM confidence)
- None needed (all claims code-verified or tagged ASSUMED)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, all tooling read from repo
- Architecture (purge placement): HIGH — chokepoint verified in source
- Pitfalls: HIGH — all grounded in read code; flake root cause is MEDIUM/ASSUMED (A1), by design (D-01)

**Research date:** 2026-11-07
**Valid until:** 2026-12-07 (repo-local facts; no external dependency drift relevant)
