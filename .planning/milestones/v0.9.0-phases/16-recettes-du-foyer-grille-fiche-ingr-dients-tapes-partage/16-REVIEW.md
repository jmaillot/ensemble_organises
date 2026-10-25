---
phase: 16-recettes-du-foyer-grille-fiche-ingr-dients-tapes-partage
reviewed: 2026-10-14T10:30:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - supabase/migrations/0122_recettes_full.sql
  - supabase/functions/recipe-invite/index.ts
  - supabase/functions/recipe-invite/child-guard.ts
  - app/src/modules/recettes/types.ts
  - app/src/modules/recettes/api.ts
  - app/src/modules/recettes/hooks/use-recettes.ts
  - app/src/modules/recettes/recettes-page.tsx
  - app/src/modules/recettes/recette-detail-page.tsx
  - app/src/modules/recettes/guest-recipe-page.tsx
  - app/src/modules/recettes/components/recipe-card.tsx
  - app/src/modules/recettes/components/ingredient-list.tsx
  - app/src/modules/recettes/components/recipe-steps.tsx
  - app/src/modules/recettes/components/recipe-form-dialog.tsx
  - app/src/modules/recettes/components/recipe-share-dialog.tsx
  - app/e2e/recettes.spec.ts
findings:
  critical: 1
  warning: 9
  info: 7
  total: 17
status: issues_found
---

# Phase 16: Code Review Report

**Reviewed:** 2026-10-14T10:30:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Reviewed the full phase 16 scope (migration 0122 + Edge `recipe-invite` + recettes frontend + e2e). The server foundation is genuinely solid: `recipe_shares` has zero policy/zero grant, all four RPCs are `service_role`-only, the oracle is uniform (`code invalide` on every invalid state), the counter is consumed under `FOR UPDATE`, and the child-guard mirrors the Edge error strings. Scaler math, NFD search, and DnD keyboard support are correct.

One Critical defect survived: the grid card's whole-card overlay link paints above the favorite button, so the heart is unreachable in a real browser (unit tests can't catch this — jsdom does no hit-testing — and no e2e covers the grid favorite). The remaining findings are robustness gaps: silent input coercion, non-atomic multi-writes, stale cursor state, and a missing tenant-scope guard on `recipes.category_id`.

## Critical Issues

### CR-01: Grid favorite button is unreachable — whole-card overlay link captures its clicks

**File:** `app/src/modules/recettes/components/recipe-card.tsx:44-57,80-86`
**Issue:** The favorite `<button>` (lines 44-57) lives inside `div.relative`, and the whole-card overlay `<Link className="absolute inset-0">` (lines 80-86) is a later positioned sibling with no `z-index` on either. Positioned elements with `z-index: auto` paint in DOM order, so the overlay sits on top of the heart and receives all pointer hits. Clicking the heart navigates to the fiche instead of toggling the favorite — the R13 grid-favorite interaction is dead in a real browser. Unit tests pass only because jsdom performs no hit-testing, and no e2e exercises the grid heart. Screen-reader/keyboard users can still reach the button, so this is a pointer-only black hole — the worst kind to notice.
**Fix:**
```tsx
<button
  type="button"
  disabled={readOnly}
  onClick={(event) => {
    event.stopPropagation();
    onToggleFavorite(recipe);
  }}
  className="relative z-10 grid size-11 ... stapled classes"
>
```

## Warnings

### WR-01: Invalid quantities silently saved as "au goût"

**File:** `app/src/modules/recettes/components/ingredient-list.tsx:40-52,63-72`
**Issue:** `parseQuantity` returns `null` for any non parseable-or-negative input (`"abc"`, `"-5"`). Both `submitAdd` and `submitEdit` then persist that `null` without any feedback, so a typo (`-500` instead of `500`) is stored as « au goût » and the user never learns their quantity was discarded. Invalid input must be rejected, not coerced.
**Fix:** Validate in the submit path and surface an inline error instead of calling `onAdd`/`onUpdate`:
```tsx
const submitAdd = async () => {
  const name = draft.name.trim();
  if (name === '') return;
  if (draft.quantity.trim() !== '' && parseQuantity(draft.quantity) === null) {
    setDraftError('Quantité invalide (nombre positif attendu).');
    return;
  }
  // ...
};
```

### WR-02: `setRecipeTags` is non-atomic — a mid-way failure leaves the recipe tagless

**File:** `app/src/modules/recettes/api.ts:89-98`
**Issue:** `removeWhere` deletes all existing links first, then re-creates them with `Promise.all`. If any create fails (tag insert race on the unique `(household_id, name)`, network drop), the recipe ends up with zero tags and the error toast gives no hint that data was lost. Same class as WR-03: multi-write without all-or-nothing semantics.
**Fix:** Create missing tags and new links first, then delete only the stale links; or wrap the sequence so a failure restores the previous link set.

### WR-03: `reorderRecipeSteps` and `sendRecipeIngredientsToCourses` can half-apply

**File:** `app/src/modules/recettes/api.ts:222-224,520-537`
**Issue:** `reorderRecipeSteps` fires N independent `update` calls via `Promise.all` — a single failure leaves positions half-rewritten (neither old nor new order, possibly duplicated). `sendRecipeIngredientsToCourses` awaits creates sequentially and throws on first failure, so the user gets an error toast while an unknown subset of lines already landed in Courses, with no report of which. Both need failure accounting.
**Fix:** For reorder, persist via a single RPC that rewrites positions transactionally. For Courses, collect per-item results and report `X/Y lignes ajoutées` instead of throwing away the partial outcome, or pre-validate the list once before inserting.

### WR-04: `position` collides after deletes — sort order becomes nondeterministic

**File:** `app/src/modules/recettes/api.ts:125-136` + `app/src/modules/recettes/recette-detail-page.tsx:244,279`
**Issue:** New ingredients/steps get `position: ingredients.length` / `steps.length`, but deletes never renumber. After deleting item 0 of 3, positions are `{1,2}` and the next add reuses `2` — a tie the server (`ORDER BY position` only, `listRecipeIngredients`/`listRecipeSteps`) breaks arbitrarily. Display order of tied rows is then fetch-dependent.
**Fix:** Use `max(position) + 1` on add, or renumber densely on delete (same treatment the DnD reorder already gets).

### WR-05: Servings cursor leaks across recipes (member fiche and guest page)

**File:** `app/src/modules/recettes/recette-detail-page.tsx:67,96` + `app/src/modules/recettes/guest-recipe-page.tsx:135-142` + `app/src/modules/recettes/components/ingredient-list.tsx:32-34`
**Issue:** `targetServings` (member) and `internalTarget` (guest, `useState` initializer) are never reset when the displayed recipe changes — React Router reuses the detail component across `/recettes/:id` navigations, and the guest `IngredientList` has no `key`. Opening recipe B after setting recipe A to 8 persons silently scales, prints, and sends-to-Courses B at 8. (The member `IngredientList` has `key={recipe.id}`, but the state lives in the parent, so the key does not help.)
**Fix:**
```tsx
useEffect(() => setTargetServings(null), [id]);
// guest: <IngredientList key={view.recipeId} ... />
```

### WR-06: `toggleFavorite` skips the client-side `canWrite` guard every sibling mutation has

**File:** `app/src/modules/recettes/hooks/use-recettes.ts:240-247`
**Issue:** `saveRecipe`, `removeRecipe`, and `reorderSteps` all throw the uniform `Votre rôle ne permet pas d'écrire ici.` before touching the network; `toggleFavorite` does not. An `enfant` caller (or a future caller that forgets the `disabled` prop) hits the server RLS denial and gets a raw/PostgREST-flavored error instead of the uniform message. Server RLS remains the real barrier — this is defense-in-depth consistency.
**Fix:** Add `if (!canWrite) throw new Error('Votre rôle ne permet pas d'écrire ici.');` and `canWrite` to the dep array.

### WR-07: Print view uses line text as React key — duplicates collide

**File:** `app/src/modules/recettes/recette-detail-page.tsx:410-427`
**Issue:** `<li key={line}>` for both ingredient and step lines. Two identical lines (`Sel — au goût` twice, two `Mélanger.` steps) produce duplicate keys: React warns and reconciliation of those siblings is undefined. Realistic in recipes, not just theoretical.
**Fix:** `key={`${index}-${line}`}` or, better, build the print model from `{id, text}` and key by id.

### WR-08: `recipes.category_id` has no cross-household scope guard

**File:** `supabase/migrations/0122_recettes_full.sql:71-72`
**Issue:** The migration carefully guards the second parent for tag links and favorites (`check_recipe_link_scope`) but `recipes.category_id` is a bare FK. A writer in household A who learns (or guesses — ids are prefixed but not secret) a category id of household B can point their recipe at it; the UPDATE RLS policy (`can_write_household` on the recipe's own household) passes. No read leak follows (names resolve from the viewer's own categories, falling back to the default), but it breaks the tenant-isolation convention AGENTS.md §5 requires (every denormalized/cross reference justified and constrained).
**Fix:** Extend `check_recipe_link_scope` (or a `BEFORE INSERT OR UPDATE OF category_id` trigger on `recipes`) to reject a `category_id` whose household differs.

### WR-09: `callRecipeInvite` crashes with `TypeError` instead of a clean error when misconfigured

**File:** `app/src/modules/recettes/api.ts:317-335`
**Issue:** The function dereferences `supabase!` (line 322) with no `isSupabaseConfigured` guard, unlike `fetchRecipeInviteSummary` (line 400). In any state where the functions base is set but the client is not, users get `Cannot read properties of null` instead of `Edge Function indisponible.`
**Fix:** Add the same `if (!isSupabaseConfigured || !supabase) throw new Error('Edge Function indisponible.');` guard used by the summary path.

## Info

### IN-01: Audit fields are client-forgeable on recipe create

**File:** `app/src/modules/recettes/hooks/use-recettes.ts:201-208`
**Issue:** `household_id`, `created_by`, and `created_at` are supplied by the client. RLS correctly bounds the write to a household the caller writes in, but a caller can forge `created_at` (sort-order manipulation — the grid sorts by `createdAt` desc) and impersonate another member in `created_by`. Low impact (display/moderation only).
**Fix:** Default `created_at` server-side and validate `created_by` against the caller's membership in a trigger, or accept as documented.

### IN-02: Failed recipe save after cover upload orphans a Storage object

**File:** `app/src/modules/recettes/hooks/use-recettes.ts:210-218`
**Issue:** On edit with a new `coverFile`, the upload lands in Storage before the row update; if `update()` or `setRecipeTags()` then throws, the new file is orphaned (the old path is only cleaned on success). `deleteRecipe` cleans on delete, but this path has no compensation.
**Fix:** On save failure after a fresh upload, best-effort `removeHouseholdFile(uploaded)`.

### IN-03: `agreeUnit(…, 0)` renders singular ("0 oeuf")

**File:** `app/src/modules/recettes/types.ts:131-139`
**Issue:** `if (scaled <= 1)` strips the plural for zero quantities. French usage expects plural at zero (« 0 œufs »). Cosmetic.
**Fix:** `if (scaled > 1) { pluralize } else { singularize }` with zero falling in the plural branch — i.e. strip only when `scaled === 1`.

### IN-04: Oversized scaled quantities surface raw DB errors

**File:** `app/src/modules/recettes/api.ts:520-537`
**Issue:** `scaleQuantity` output is unbounded; a large reference quantity × 12 persons can exceed `numeric(10,2)` and the user receives the raw PostgREST error via toast. Same for negative quantities rejected client-side but accepted by the DB from any direct writer.
**Fix:** Clamp/validate before insert with a friendly message; consider a `CHECK (quantity >= 0)` on `recipe_ingredients` (forward migration).

### IN-05: Share dialog hides all actions when the summary fetch fails

**File:** `app/src/modules/recettes/components/recipe-share-dialog.tsx:141-145`
**Issue:** `codeError` replaces the entire dialog body — including Générer/Régénérer — with a static note. A transient Edge failure therefore removes the retry path (the generate button itself would surface the real error via toast). Degraded-UX, not data loss.
**Fix:** Keep the action buttons visible and show the notice as a non-blocking hint.

### IN-06: Redundant navigation links on every card

**File:** `app/src/modules/recettes/components/recipe-card.tsx:38-43,80-86`
**Issue:** The title link and the whole-card overlay link share the same destination: two tab stops per card for keyboard users. Minor a11y noise (magnified by CR-01's stacking problem).
**Fix:** After fixing CR-01, drop the title link's `to` in favor of a plain span, or `aria-hidden` one of the two with `tabIndex={-1}`.

### IN-07: `coursesResult` preview goes stale when the target list changes

**File:** `app/src/modules/recettes/recette-detail-page.tsx:65,97,335,346-350`
**Issue:** The success line (`3 lignes ajoutées à « Fresque »…`) is never cleared when the user picks another list or re-scales, so a second send can display an outdated confirmation next to fresh state.
**Fix:** `setCoursesResult(null)` in the list `onChange` and whenever `effectiveTarget` changes.

---

_Reviewed: 2026-10-14T10:30:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
