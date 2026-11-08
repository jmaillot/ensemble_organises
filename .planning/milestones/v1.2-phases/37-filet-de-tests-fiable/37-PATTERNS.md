# Phase 37: Filet de tests fiable - Pattern Map

**Mapped:** 2026-11-07
**Files analyzed:** 6
**Analogs found:** 6 / 6 (all analogs verified git-tracked via `git ls-files`)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/src/hooks/__tests__/auth-bootstrap-offline.test.tsx` (modify, TEST-01) | test (hook harness) | async request-response | itself + sibling bootstrap tests E/F in same file | exact (in-file) |
| `app/src/lib/supabase/session-cache.ts` — new `purgerStockageSession()` (or sibling module, TEST-04, discretion D-07) | utility | localStorage transform | `session-cache.ts` itself (chunk-scan idiom l.55-63) | exact |
| `app/src/stores/session-store.ts` — wire purge in `signOut` (modify, TEST-04) | store | event-driven (all sign-out paths converge) | itself, `signOut` action l.67-122 | exact |
| New unit purge test — extend `app/src/stores/session-store.test.ts` or dedicated `session-purge.test.ts` (TEST-04, D-08/D-09) | test (unit) | request-response over raw storage | `session-store.test.ts` (spy/mock idiom) + `query-persistence.test.ts` (raw-read assertion) + `auth-bootstrap-offline.test.tsx` (supabase client mock) | role-match (composite) |
| `app/e2e/offline-shared-device.spec.ts` — add `clesStockageBrutes()` + localStorage assertion (modify, TEST-03/D-08) | test (e2e) | browser-driven, offline context | itself, `clesCacheBrutes()` l.41-63 + assertion idiom l.89-91 | exact |
| `docs/RETROSPECTIVE.md` — « campagne tests v1.2 » entry (modify, D-02/D-10) | doc | — | existing campaign sections of the same file | format-match |

No SQL, no migration, no new package. Zero product surface — everything is test/debt work.

## Pattern Assignments

### 1. Flake fix — `app/src/hooks/__tests__/auth-bootstrap-offline.test.tsx` (TEST-01)

**Analog:** the file itself. The flake lives in test D (l.84-98); tests E (l.100-112) and F (l.114-127) share the identical harness and stay untouched.

**Harness mock block (l.24-59) — do not change:**
```tsx
const auth = {
  getSession: vi.fn(), /* ... */
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
};
vi.mock('@/lib/supabase/client', () => ({
  supabase: { auth },
  isSupabaseConfigured: true,
  supabaseUrl: 'https://api.exemple.fr',
  ...
}));
const { useAuthBootstrap } = await import('../use-auth');
```

**The flaky surface — test D (l.84-98):**
```tsx
it('monte l’application hors-ligne avec session valide et foyer persisté (test D)', async () => {
  semerFoyerPersiste();
  onlineManager.setOnline(false);
  auth.getSession.mockResolvedValue({
    data: { session: { user, expires_at: Date.now() / 1000 + 3600 } },  // real-clock expiry
  });
  const { result } = renderHook(() => useAuthBootstrap());
  await waitFor(() => expect(result.current.ready).toBe(true));   // bare waitFor — the race window
  expect(result.current.error).toBeNull();
  expect(useSessionStore.getState().status).toBe('authenticated');
  expect(useSessionStore.getState().householdLoaded).toBe(true);
  expect(useHouseholdStore.getState().householdId).toBe('h1');
});
```

**Fix options (D-01 discretion), scoped to THIS test only — never touch `vite.config.ts` test block (Pitfall 3):**
```tsx
// Option A (recommended): explicit options on the one waitFor
await waitFor(() => expect(result.current.ready).toBe(true), { timeout: 5_000, interval: 50 });
// Option B: fake timers, scoped — note @testing-library async utils need act()/advanceTimers wiring
```

---

### 2. Purge function — extend `app/src/lib/supabase/session-cache.ts` (TEST-04, D-07)

**Analog:** the file itself — key derivation and chunk-scan already live here; D-07 mandates reusing them, so colocating the purge here is the lowest-friction choice (planner may also pick a sibling module importing `cleStockageSession`).

**Key derivation to reuse (l.19-29):**
```ts
export function cleStockageSession(): string | null {
  if (!supabaseUrl) return null;
  try {
    const hostname = new URL(supabaseUrl).hostname;
    const reference = hostname.split('.')[0];
    return reference ? `sb-${reference}-auth-token` : null;
  } catch {
    return null;  // URL malformée : pas de clé dérivable, donc pas de session consultable.
  }
}
```

**Chunk-scan idiom to mirror for the erase loop (l.55-63):**
```ts
const fragments: string[] = [];
for (let index = 0; ; index++) {
  const fragment = localStorage.getItem(`${cle}.${index}`);
  if (fragment === null) break;
  fragments.push(fragment);
}
```

**New function shape (derived from these two excerpts):**
```ts
// Remove `${cle}` and `${cle}.${i}` for i = 0,1,… until a missing index —
// same discovery rule as lireSessionPersistee, applied to removal.
// Guard `typeof localStorage === 'undefined'` like l.53. Guard `!cle` like l.53.
export function purgerStockageSession(): void { /* ... */ }
```

Conventions to copy: French identifiers, the decision-referencing doc-comment block above each export (see l.13-18, 31-50 for the house style — every function carries its D-reference and rationale in the JSDoc, in French).

---

### 3. Wiring — `app/src/stores/session-store.ts` `signOut` (TEST-04)

**Analog:** itself. The single chokepoint (D-05 comment l.68-71) with an imposed ordering discipline (Pitfall 6, l.93-96). The new purge call slots between `purgeUserCache` success and the memory/state reset.

**Insertion point (l.96-121, excerpt):**
```ts
stopPersisting();                                    // ← already here
try {
  await purgeUserCache(userId);                      // ← IndexedDB purge (offline cache, NOT GoTrue)
} catch (cause) {
  throw new Error('Impossible de vider les données locales : ...', { cause });
}
const { queryClient } = await import('@/app/router');
queryClient.clear();                                 // ← memory frontier (CR-01)
// ★ NEW: purgerStockageSession() goes HERE — after disk purges, before state reset
set({ user: null, status: 'guest', householdLoaded: false });
useHouseholdStore.getState().reset();
```

Order rationale to copy verbatim in the new comment: a throttled writer or in-flight refresh must not resurrect the key — same logic as the existing Pitfall-6 comment (l.93-95). Decide whether a purge failure blocks sign-out like `purgeUserCache` does (l.100-108 §2.7 F pattern) — recommend yes, mirroring the same `throw new Error('...déconnexion est bloquée...', { cause })` idiom.

---

### 4. Unit purge test — extend `app/src/stores/session-store.test.ts` (TEST-04, D-08/D-09)

**Analog A — spy/mock idiom (session-store.test.ts l.37-53):**
```ts
const { purgeUserCacheSpy, stopPersistingSpy } = vi.hoisted(() => ({
  purgeUserCacheSpy: vi.fn(),
  stopPersistingSpy: vi.fn(),
}));
vi.mock('@/lib/offline/query-persistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/offline/query-persistence')>();
  return { ...actual, purgeUserCache: (...args) => purgeUserCacheSpy(...args), stopPersisting: () => stopPersistingSpy() };
});
const { loadHousehold } = await import('./session-store');   // dynamic import AFTER mocks
```

**Analog B — supabase client mock with a fake URL (auth-bootstrap-offline.test.tsx l.43-49):** mock `@/lib/supabase/client` with `supabaseUrl: 'https://api.exemple.fr'` so `cleStockageSession()` derives `sb-api-auth-token` deterministically — the same trick the flaky test already uses.

**Analog C — raw storage read assertion (query-persistence.test.ts l.22, 37, 77):**
```ts
await expect(get(cacheKey('user-a', 'h1'), probeStore)).resolves.toBeUndefined();
```
For localStorage (jsdom), the unit equivalent is direct:
```ts
// D-08 level 1: seed exactly what supabase-js would write, run the sign-out/guest
// path, then raw-read localStorage. RED today (nothing removes the key), GREEN after fix.
const cle = cleStockageSession()!;
localStorage.setItem(`${cle}`, JSON.stringify(session));       // unchunked case
localStorage.setItem(`${cle}.0`, part0);                       // chunked case (both covered)
const residuelles = Object.keys(localStorage)
  .filter((k) => /^sb-.*-auth-token(\.\d+)?$/.test(k));        // whole family, not one key (Pitfall 6)
expect(residuelles).toEqual([]);
```

Red-first protocol (D-09, §2.7 B): run the test against current code, capture the failure output as evidence, then implement, then green. If the "red" run passes, the test is broken — not the code.

---

### 5. e2e extension — `app/e2e/offline-shared-device.spec.ts` (TEST-03 / D-08 level 2)

**Analog:** itself. Keep the env-var skip verbatim (D-04, l.28-38):
```ts
const userAEmail = process.env.E2E_SHARED_USER_A_EMAIL;
/* ... */
test.skip(!userAEmail || !userAPassword || !userBEmail || !userBPassword, skipReason);
```

**Pattern to replicate — `clesCacheBrutes()` (l.41-63), add a sibling:**
```ts
/** Lecture brute des clés localStorage, côté navigateur (D-08 niveau 2). */
async function clesStockageBrutes(page: Page): Promise<string[]> {
  return page.evaluate(() => Object.keys(localStorage));
}
```

**Assertion idiom to mirror (l.89-91):**
```ts
expect(await clesStockageBrutes(page)).not.toContainEqual(
  expect.stringMatching(/^sb-.*-auth-token/),
);
```

Placement: assert after `seDeconnecter(page)` (l.88), next to the existing IndexedDB raw-read — one more proof at the same checkpoint, not a new test. Helpers (`seConnecter` l.65-72, `seDeconnecter` l.74-78) are reusable as-is. The offline context (`context.setOffline(true)` l.97) already exists.

**Execution protocol (D-05/D-06):** accounts via env vars, values never committed (§2.7 H — export in shell session or out-of-repo env file, never on the command line, never `git add`). Command: `cd app && npm run test:e2e -- offline-shared-device`. Capture the full Playwright output as phase proof.

---

### 6. Retrospective entry — `docs/RETROSPECTIVE.md` (D-02/D-10)

**Analog:** the existing campaign sections in the same file (git-tracked, verified). Format: one dated campaign section, one entry per debt with measured facts, conditions, hypothesis ruled out, nature of fix — §2.7 F (no silent success). Single section « campagne tests v1.2 » covering all four debts (D-10): flake diagnostic (D-02), birthday settlement via `cdd4fa7` (D-03), e2e execution proof (D-06), GoTrue purge (D-08).

## Shared Patterns

### Mock-then-dynamic-import (Vitest module mocking)
**Source:** `app/src/stores/session-store.test.ts` l.37-53, `app/src/hooks/__tests__/auth-bootstrap-offline.test.tsx` l.43-59
**Apply to:** the new unit purge test
```ts
vi.mock('@/lib/supabase/client', () => ({ supabase: { auth }, supabaseUrl: 'https://api.exemple.fr', ... }));
const { useSessionStore } = await import('./session-store');  // AFTER vi.mock declarations
```

### Raw-storage-read proof (the D-08 idiom)
**Source:** e2e — `offline-shared-device.spec.ts` l.41-63/89-91; unit — `query-persistence.test.ts` l.22/77 (IndexedDB) + jsdom `localStorage` direct read
**Apply to:** both purge proofs. Assert absence of the whole `sb-*-auth-token` family (base + `\.\d+` chunks), never a single literal key.

### Red-before-green discipline
**Source:** `AGENTS.md` §2.7 B, mandated by D-09
**Apply to:** TEST-04 unit test (and any other test proving a fix). Capture the red run as evidence.

### Scoped fix, never global config
**Source:** `app/vite.config.ts` test block (forks pool, `restoreMocks: true`) — read-only; any diff there is a Pitfall-3 warning sign
**Apply to:** TEST-01. Tolerance options go on the one `waitFor` call in test D only.

### Decision-referencing French doc-comments
**Source:** `session-cache.ts` l.4-11, 13-18, 31-50; `session-store.ts` l.11-27, 68-82
**Apply to:** the new purge function and its wiring comment — every non-obvious choice cites its D-reference and the failure it prevents, in French. No linter directives anywhere (none exists in the repo; `no-eslint-directive.test.ts` refuses them).

### §2.7 chain (per commit)
**Source:** `AGENTS.md` §2.7 — `cd app && npm run typecheck && npm test && npm run build` then `npm run test:e2e`; SQL checks pass trivially (no SQL changes).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `docs/RETROSPECTIVE.md` entry | doc | — | Format-match only: campaign section layout copied from the same file's earlier sections; no extraction needed beyond reading them at write time |

## Metadata

**Analog search scope:** `app/src/stores/`, `app/src/hooks/__tests__/`, `app/src/lib/supabase/`, `app/src/lib/offline/`, `app/e2e/`, `docs/`
**Files scanned:** 7 read in full or part (session-cache.ts, session-store.ts, session-store.test.ts, auth-bootstrap-offline.test.tsx, offline-shared-device.spec.ts, query-persistence.test.ts, + tracked-source verification via `git ls-files`)
**Pattern extraction date:** 2026-11-07
**Note:** all named analogs verified git-tracked — no gitignored mirror paths emitted.
