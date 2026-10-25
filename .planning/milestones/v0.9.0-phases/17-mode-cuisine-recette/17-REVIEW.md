---
phase: 17-mode-cuisine-recette
reviewed: 2026-10-14T18:15:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - app/src/modules/recettes/hooks/use-cuisine-progress.ts
  - app/src/modules/recettes/hooks/use-screen-wake-lock.ts
  - app/src/modules/recettes/components/recipe-cuisine-view.tsx
  - app/src/modules/recettes/components/cuisine-toggle.tsx
  - app/src/modules/recettes/recette-detail-page.tsx
  - app/src/modules/recettes/guest-recipe-page.tsx
  - app/src/components/shared/module-shell.tsx
  - app/src/modules/recettes/recette-cuisine.test.tsx
  - app/src/modules/recettes/use-screen-wake-lock.test.tsx
  - app/src/modules/recettes/guest-recipe-cuisine.test.tsx
  - app/src/modules/recettes/recette-cuisine-panel.test.tsx
  - app/e2e/recettes.spec.ts
  - app/e2e/recettes-cuisine-mobile.spec.ts
findings:
  critical: 0
  warning: 6
  info: 10
  total: 16
status: issues_found
---

# Phase 17: Code Review Report

**Reviewed:** 2026-10-14T18:15:00Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Second pass over phase 17, covering the gap-closure slice (17-03 commit `409311a`:
`stickyTopClass` prop on the shared cuisine view + member call-site; 17-04 commits
`ad294c0` + `14d7168`: opt-in `headerInlineOnMobile` prop on shared `Panel` + both
Étapes call-sites + Vitest panel suite + mobile Playwright spec). Intent (17-03/17-04
SUMMARYs) and threat dispositions (T-17-05 sticky/topbar overlap, T-17-06 shared-Panel
regression, T-17-07 360px overflow) were traced against the diff `20b922c..HEAD`.

No security vulnerability, crash, or reachable data-loss path in the new slice: the
offset values are dev-controlled literals (not user input — no class-injection
surface), the `Panel` default branch is byte-identical to the historic markup
(verified in the diff, so the ~40 other `<Panel>` consumers render unchanged), auth/
network/schema surfaces are untouched, and the sticky offsets were verified against
`app-shell.tsx:225` (`h-[76px]`, `max-[650px]:h-14`, `sticky top-0 z-10` — exact match).

The 10 prior findings (WR-01..WR-04, IN-01..IN-06, all open per
17-REVIEW-DISPOSITION.md) are carried forward unchanged below. This pass adds 2
warnings (the inline header keeps `flex-wrap`, so the exact G-17-2 failure can still
trigger on long titles; the sticky offset duplicates AppShell dimensions with no
shared source of truth) and 4 info notes (unvalidated class-string prop, single-sample
overflow assertion + member-only e2e, Tailwind-coupled test helpers, triplicated test
scaffolding). Nothing blocks shipment; WR-05/WR-06 should be fixed while the code is
fresh.

## Warnings

### WR-01: `readCuisineProgress` has a read-with-write side effect and clobbers stored progress when called with empty steps

**File:** `app/src/modules/recettes/hooks/use-cuisine-progress.ts:21-40`
**Issue:** The function named "read" calls `writeCuisineProgress` (purge rewrite) as a side effect, and it is invoked in the `useState` initializer — i.e. during render. Worse, if called with `steps = []` (async data not yet loaded), every stored id is classified "orphan" and the stored array is overwritten with `[]`, destroying saved progress. Current callers mount `RecipeCuisineView` only after steps resolve, so this is latent, not live — but any future caller that mounts early (or a regression that renders the view during loading) silently wipes the user's checklist. A read path must never destroy data on an empty input.
**Fix:**
```ts
export function readCuisineProgress(recipeId: string, steps: RecipeStep[]): Set<string> {
  try {
    if (typeof localStorage === 'undefined') return new Set();
    const raw = localStorage.getItem(cuisineProgressStorageKey(recipeId));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    const ids = validIds(parsed);
    if (steps.length === 0) return new Set(ids); // ne jamais purger sur entrée vide
    const known = new Set(steps.map((step) => step.id));
    const kept = ids.filter((id) => known.has(id));
    if (kept.length !== ids.length) writeCuisineProgress(recipeId, kept);
    return new Set(kept);
  } catch {
    return new Set();
  }
}
```
Alternatively move the purge rewrite out of the read path into the `useEffect` (which already prunes), making `readCuisineProgress` pure.

### WR-02: Side effects inside state updaters (`toggle` and prune effect write to localStorage)

**File:** `app/src/modules/recettes/hooks/use-cuisine-progress.ts:88-98, 103-114`
**Issue:** `writeCuisineProgress` is called inside `setChecked((current) => {...})` updaters. React updaters must be pure — StrictMode double-invokes them, and concurrent React may discard an invocation. The write is idempotent so the practical harm today is a duplicated `setItem`, but it bakes an impurity into state logic that will bite if the write ever gains non-idempotent behavior (e.g. quota accounting, event dispatch).
**Fix:**
```ts
const toggle = useCallback((id: string) => {
  setChecked((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}, [recipeId]);
// Persist via effect:
useEffect(() => { writeCuisineProgress(recipeId, checked); }, [recipeId, checked]);
```
(Same treatment for the prune branch: compute `next` + a `pruned` flag in the updater, write in the effect body.)

### WR-03: Navigating A→B with cuisine ON flashes the new fiche's cuisine view for one render (and holds the wake lock across fiches)

**File:** `app/src/modules/recettes/recette-detail-page.tsx:72-77`, `app/src/modules/recettes/guest-recipe-page.tsx:37-43`
**Issue:** `setCuisine(false)` runs in `useEffect` on `[id]` / `[activeCode]` — i.e. *after* the render where the new id is already active. For one commit, `cuisine` is still `true` with the new recipe's steps: the user sees the new fiche's cuisine view (with the new fiche's restored checks) for a frame, and `useScreenWakeLock` keeps the sentinel across two different recipes (its effect deps `[active, supported]` don't include the recipe id). Same pattern on the guest page for link changes. Low visual severity, but it is a genuine wrong-state frame plus cross-recipe lock retention that contradicts T-17-02's "release on fiche change" spirit.
**Fix:** Reset synchronously during render instead of in an effect, e.g. keep `const [cuisineId, setCuisineId] = useState(id)` and `if (cuisineId !== id) { setCuisineId(id); setCuisine(false); }` (React-endorsed render-phase setState), or give the steps Panel `key={recipe.id}` as the comment already suggests but never applies to the cuisine branch.

### WR-04: OFF-mode description promises drag-reorder to readers who can never reorder (guest + enfant readOnly)

**File:** `app/src/modules/recettes/guest-recipe-page.tsx:160-164`, `app/src/modules/recettes/recette-detail-page.tsx:295-302` (enfant case)
**Issue:** The guest OFF description reads "Glissez la pastille numérotée pour réordonner." but the guest `RecipeSteps` is hard-`readOnly` with `onReorder={noop}` — there is no drag handle (confirmed by the test asserting no `Réordonner` button). Same on the member fiche for the `enfant` role (`readOnly={!canWrite}`). The copy was pasted "verbatim UI-SPEC" per plan, so the spec and the code agree — but both disagree with the rendered UI for readOnly viewers. Misleading affordance text is an incorrect-behavior finding, not a taste issue.
**Fix:** Branch the description on writability, e.g. guest page: `description="Étapes de la recette, en lecture seule."`; member page: `description={cuisine ? '…' : canWrite ? 'Glissez la pastille numérotée pour réordonner.' : 'Étapes de la recette.'}`. Update the two OFF assertions accordingly.

### WR-05: Inline Panel header keeps `flex-wrap`, so the toggle can still wrap below the description on narrow screens (residual G-17-2)

**File:** `app/src/components/shared/module-shell.tsx:90`
**Issue:** The opt-in branch renders `flex flex-wrap … max-[650px]:flex-row`. `flex-wrap` permits exactly the failure mode G-17-2 was closed for: if title-block minimum content + toggle width exceed the row (long recipe title, long single-word description token, larger system font, or a translated toggle label), the `shrink-0` action wraps onto its own line *below the description* — visually identical to the pre-fix bug. The proofs only exercise the short default title ("Tartiflette de saison" in e2e, "Étapes" + one-line description in Vitest), so the wrapped state is untested and the D1 claim ("jamais sous la description") holds only while content fits. The title block already carries `min-w-0 flex-1` (it can shrink) and the action `shrink-0` (it won't compress), which is precisely the combination where `nowrap` is safe.
**Fix:** Drop wrapping in the opt-in branch only:
```tsx
<div className="mb-4 flex flex-nowrap items-start justify-between gap-3 max-[650px]:gap-2.5">
```
(`max-[650px]:flex-row` becomes redundant and can go with it — the base `flex` is already row direction.) Keep `flex-wrap` in the default branch untouched.

### WR-06: Sticky offset duplicates AppShell topbar dimensions as string literals with no shared source of truth

**File:** `app/src/modules/recettes/recette-detail-page.tsx:306`, `app/src/app/app-shell.tsx:225`
**Issue:** `stickyTopClass="top-[76px] max-[650px]:top-14"` hard-codes three facts owned by `app-shell.tsx:225` (`h-[76px]`, `max-[650px]:h-14`, the 650px breakpoint itself). The values match today (verified), but nothing links them: a future topbar height/padding/breakpoint tweak silently re-opens T-17-05 (overlap hiding menu/notifications/profil) or leaves a dead gap, with no failing test — the Vitest proofs assert the *literal*, not the *relationship to the topbar*. Cross-module magic numbers with a comment ("hauteur exacte de la topbar") instead of a reference is how G-17-1 recurs.
**Fix:** Export the offset from one place both files import, e.g. in `module-shell.tsx` or a `layout-constants` module:
```ts
export const CUISINE_STICKY_TOP_CLASS = 'top-[76px] max-[650px]:top-14' as const;
// app-shell topbar heights (h-[76px], max-[650px]:h-14) must stay in sync — see comment.
```
and use it at the call-site. At minimum, add a comment on the AppShell header line pointing at the cuisine call-site so the next editor knows the coupling exists.

## Info

### IN-01: Stale comment on the wake-lock hookup (member page)

**File:** `app/src/modules/recettes/recette-detail-page.tsx:78`
**Issue:** Comment still reads "Repli discret en attendant le hook de veille (tâche 2)" although the hook has been mounted since `a248025`. A future reader will wonder whether the wiring is half-done.
**Fix:** Replace with `/** Veille suivant le toggle (R4) : demandée en ON, relâchée en OFF/sortie/démontage. */`.

### IN-02: Dead ternary — `total === 0` guard after an early return on `total === 0`

**File:** `app/src/modules/recettes/components/recipe-cuisine-view.tsx:46`
**Issue:** The `total === 0` early return on line 23 makes `total === 0 ? 0 : …` unreachable. Harmless, but signals copy-paste and invites "fixing" the wrong branch later.
**Fix:** ` <Progress value={(done / total) * 100} … />`.

### IN-03: `aria-label` on a plain `<p>` is ignored by assistive tech

**File:** `app/src/modules/recettes/components/recipe-cuisine-view.tsx:77`
**Issue:** The checked-step `<p aria-label={step.content}>` aims to expose the full text while visually clamping to 2 lines — but `aria-label` on a non-interactive element without a role is dropped by screen readers, so the "full text available" intent is not delivered. No harm (visible text is still the content, truncated visually), but the attribute is a no-op that suggests an accessibility guarantee that doesn't exist.
**Fix:** Either drop the attribute or give the clamped paragraph `title={step.content}` (native tooltip + AT-readable name computation on hover/focus contexts vary — `title` is the honest minimal fallback).

### IN-04: Focusable `aria-hidden` switch visual (`tabIndex={-1}` inside `aria-hidden`)

**File:** `app/src/modules/recettes/components/cuisine-toggle.tsx:27-29`
**Issue:** The `Switch … asChild` span carries both `tabIndex={-1}` (programmatically focusable) and `aria-hidden="true"`. A focusable element inside hidden content is an `aria-hidden-focus` axe violation pattern; no axe suite runs here so nothing is red today, but the first automated a11y pass over this page will flag it.
**Fix:** Remove `tabIndex={-1}` passthrough concern by rendering the visual as a plain non-focusable span — i.e. drop the Radix `Switch` entirely in favor of a styled span driven by `active` (`data-state={active ? 'checked' : 'unchecked'}`), since the outer `<button aria-pressed>` already owns semantics, focus, and state.

### IN-05: Ref assignment during render in `useScreenWakeLock`

**File:** `app/src/modules/recettes/hooks/use-screen-wake-lock.ts:22`
**Issue:** `activeRef.current = active` executes on every render. Works, but violates the render-purity rule; under concurrent rendering the ref can momentarily disagree with the committed effect's `active`. The only consumer is the `visibilitychange` handler, which is re-registered per effect run anyway.
**Fix:** Assign inside the effect (`activeRef.current = active;` as first line of the `useEffect` body) and drop the render-phase write.

### IN-06: E2E assumes the demo seed provides zero steps without asserting it

**File:** `app/e2e/recettes.spec.ts:147-157, 159-179`
**Issue:** `seedTwoSteps` adds two steps then asserts `0/2` / `1/2`. If the demo seed ever ships steps for `recipe-1`, both cuisine tests fail with a confusing counter mismatch (`0/4`), and repeated seeding within one context would accumulate. The comment documents the assumption but the test doesn't pin it.
**Fix:** After `seedTwoSteps`, assert the exact counter first (`await expect(page.getByText('0/2')).toBeVisible()` already does post-toggle) — better: read the checkbox count (`await expect(page.getByRole('checkbox', …))` length 2) right after seeding, so a seed change fails loudly at the seeding step, not at the counter.

### IN-07: `stickyTopClass` accepts any string — a caller can silently un-sticky or hide the header

**File:** `app/src/modules/recettes/components/recipe-cuisine-view.tsx:18, 26, 43`
**Issue:** The prop is typed `string` and interpolated raw into `className`. Both current call-sites pass correct literals, and the prop is internal (not user input — no injection surface), so this is not a security hole. But the type permits `stickyTopClass="relative hidden"` or a typo like `"top-76px"` (no such Tailwind class → header falls back to static, silently un-sticky with zero test failure, since tests assert presence of the expected token, not stickiness itself). A stringly-typed layout contract invites exactly that typo.
**Fix:** Narrow the type to the known-good literals: `stickyTopClass?: 'top-0' | 'top-[76px] max-[650px]:top-14'` (extend the union if a third shell appears), keeping the `'top-0'` default.

### IN-08: Mobile overflow proof is a single-sample measurement on the member route only

**File:** `app/e2e/recettes-cuisine-mobile.spec.ts:46-48`
**Issue:** `document.documentElement.scrollWidth - window.innerWidth <= 0` is sampled once, immediately after navigation + visibility assertions — before the cover image (`h-48 w-full object-cover`) and webfonts settle, both of which can introduce late horizontal overflow the spec never sees. The guest route (different surrounding markup: nested outer Panel + join CTA panel) is never e2e-measured — coverage relies on Vitest class assertions, which prove the header row but not page-level overflow. T-17-07's spirit is "no horizontal scroll on either fiche", the proof covers half of it at one instant.
**Fix:** Re-sample after `page.waitForLoadState('networkidle')` (or after the cover image emits `load`), and add one guest-route case (`/invitation/recette?code=…` via the demo share link) asserting the same `scrollWidth <= innerWidth` bound.

### IN-09: Test helpers couple 8 proofs to Tailwind class substrings

**File:** `app/src/modules/recettes/recette-cuisine-panel.test.tsx:93-98`, `app/src/modules/recettes/recette-cuisine.test.tsx` (`stickyHeaderOf`)
**Issue:** `headerOf` uses `closest('div[class*="max-[650px]"]')` and the sticky proofs use `closest('div.sticky')` + `classList.contains`. A behavior-preserving refactor (renaming the breakpoint, restructuring the header div, moving the sticky class) breaks up to 8 tests with no behavior change — classic brittle-selector coupling. The `classList.contains` exact-token idiom (avoiding substring false positives) is good; the issue is only that the tests pin *implementation classes* rather than *observable layout*.
**Fix:** No change required while Tailwind literals are the contract (they double as the static-scan guarantee). If touched, prefer asserting the prop-to-DOM path once per component and behavior (`aria-pressed`, counter text) elsewhere — which is already mostly the case; just avoid extending the class-substring pattern to new suites.

### IN-10: Test scaffolding now triplicated across three cuisine suites (~60 lines each)

**File:** `app/src/modules/recettes/recette-cuisine.test.tsx:22-46`, `app/src/modules/recettes/recette-cuisine-panel.test.tsx:29-46`, `app/src/modules/recettes/guest-recipe-cuisine.test.tsx`
**Issue:** The `vi.hoisted` client-config mock, the `./api` `fetchGuestRecipeView` mock, `seedFiche`, `STEP_CONTENTS`, and the guest `viewPayload` are copy-pasted across all three suites (17-03/17-04 each re-copied the idiom with a comment saying so). The copies already drift: payload field sets differ (`tags` present in two, ingredient shapes differ). The next mock-idiom fix must land in three places or two suites silently diverge.
**Fix:** Extract a shared `recette-cuisine-test-utils.ts` (or `test/` helper) exporting the hoisted config, the mock setup, `seedFiche`, and step/payload factories; each suite imports it. Low risk, purely test-local.

---

_Reviewed: 2026-10-14T18:15:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
