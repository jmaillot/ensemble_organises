---
phase: 21-photos-dans-les-etapes-de-recette
reviewed: 2026-10-16T15:17:57Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - app/e2e/recettes.spec.ts
  - app/src/modules/recettes/api.ts
  - app/src/modules/recettes/components/recipe-cuisine-view.tsx
  - app/src/modules/recettes/components/recipe-export.css
  - app/src/modules/recettes/components/recipe-steps.tsx
  - app/src/modules/recettes/components/step-photo-dialog.tsx
  - app/src/modules/recettes/components/step-photo.tsx
  - app/src/modules/recettes/guest-recipe-cuisine.test.tsx
  - app/src/modules/recettes/guest-recipe-page.test.tsx
  - app/src/modules/recettes/guest-recipe-page.tsx
  - app/src/modules/recettes/hooks/use-recettes.ts
  - app/src/modules/recettes/recette-cuisine-panel.test.tsx
  - app/src/modules/recettes/recette-cuisine.test.tsx
  - app/src/modules/recettes/recette-detail-page.test.tsx
  - app/src/modules/recettes/recette-detail-page.tsx
  - app/src/modules/recettes/recipe-actions.test.ts
  - app/src/modules/recettes/recipe-cuisine-photo.test.tsx
  - app/src/modules/recettes/recipe-step-photo.test.ts
  - app/src/modules/recettes/recipe-steps.test.tsx
  - app/src/modules/recettes/types.ts
  - app/src/modules/recettes/use-screen-wake-lock.test.tsx
  - app/src/types/database.ts
  - supabase/functions/recipe-invite/guest-steps.test.ts
  - supabase/functions/recipe-invite/guest-steps.ts
  - supabase/functions/recipe-invite/index.ts
  - supabase/migrations/0125_recipe_step_photos.sql
  - supabase/tests/0125_recipe_step_photos.sql
findings:
  critical: 1
  warning: 1
  info: 4
  total: 6
status: issues_found
---

# Phase 21: Code Review Report

**Reviewed:** 2026-10-16T15:17:57Z
**Depth:** standard
**Files Reviewed:** 27
**Status:** issues_found

## Summary

Phase 21 adds a single `recipe_steps.photo_path` column, re-creates `view_recipe_share` to expose that raw path to the guest link, signs it in the `recipe-invite` Edge (fail-closed, 1 h TTL), and renders step photos on four surfaces (member sheet, member cuisine mode, guest sheet, guest cuisine mode) plus the print view. The scope is small and the code is unusually well-commented; the deliberate design decisions (D-01, D-03, D-05, D-16, D-18) are respected and are not re-litigated here.

The chain is green: `npx vitest run src/modules/recettes src/lib/media-path-contract.test.ts` → 120 tests, `npx vitest run ../supabase/functions` → 52 tests, `python3 scripts/check-sql-statique.py` → 181 functions / 0 defects. Migration `0125`'s `view_recipe_share` is a verbatim copy of `0122` with only `'photo_path', st.photo_path` added, so the `search_path = ''` / qualified-name contracts hold.

One BLOCKER was found: `writeStepPhoto` silently absorbs `DataError` and returns `void`, while both callers then delete the *previous* bucket object unconditionally — on a swallowed failure where the row still exists, that deletes an object the column still references (irreversible photo loss). One WARNING covers a tenant-isolation gap in the guest signer. Four Info items are consistency/duplication nits.

**Already deferred, not re-reported** (see `deferred-items.md`): the missing `photo_path` line in `supabase/tests/0001_schema_contract.sql`, and the reload-based dead-preview assertion in `app/e2e/recettes.spec.ts`.

## Critical Issues

### CR-01: Swallowed `DataError` makes callers delete a still-referenced photo

**File:** `app/src/modules/recettes/api.ts:392-427`

**Issue:** `writeStepPhoto` (lines 392-399) returns `Promise<void>` and converts every `DataError` into a logged no-op:

```ts
async function writeStepPhoto(stepId: string, value: string | null): Promise<void> {
  try {
    await data.update<RecipeStepRow>(RECIPE_STEPS_TABLE, stepId, { photo_path: value });
  } catch (error) {
    if (!(error instanceof DataError)) throw error;
    console.warn(`Photo d’étape non écrite : ${stepId}`, error);
  }
}
```

Both callers then treat that no-op as success and destroy the *previous* object regardless:

```ts
// replaceRecipeStepPhoto — 414-416
const next = await uploadRecipeStepPhoto(...);
await writeStepPhoto(input.stepId, next);
await removeStepPhotoObject(replacedMediaPath(input.previous, next)); // runs even if the write failed

// clearRecipeStepPhoto — 424-426
await writeStepPhoto(stepId, null);
await removeStepPhotoObject(replacedMediaPath(previous, null));       // runs even if the write failed
```

`data.update` is implemented with `.select('*').single()`, so **both** "row gone" and "zero rows written" surface as the same `DataError` (this is stated in the helper's own docstring, lines 384-388). The harmful case is the second one: an RLS-denied `UPDATE` (e.g. the member's `can_write_household` no longer holds, a role changed mid-session, or a transient PostgREST 0-row response) leaves `recipe_steps.photo_path` still pointing at `previous`, yet the code deletes that object from `household-media`. Consequences:

- **Replace:** the user's existing photo is permanently gone from storage while the row still references it → broken image on the member sheet, member cuisine, guest sheet and print; the freshly uploaded `next` object is simultaneously orphaned.
- **Clear:** the row is not cleared, the object is deleted, and the user gets no error toast — the step renders as photo-less-with-a-dangling-reference and silently reappears broken on reload.

The failure is silent (the `console.warn` is the only trace) and irreversible. The docstring's contract ("un `DataError` devient un no-op JOURNALISÉ") and the callers' behaviour ("le retrait de l'ancien objet ne l'annule jamais", lines 401-405) contradict each other.

**Fix:** make the write's outcome explicit and gate the destructive cleanup on it; clean up the just-uploaded object when the write did not land.

```ts
/** @returns true when the column now holds `value`; false when the row was gone (DataError). */
async function writeStepPhoto(stepId: string, value: string | null): Promise<boolean> {
  try {
    await data.update<RecipeStepRow>(RECIPE_STEPS_TABLE, stepId, { photo_path: value });
    return true;
  } catch (error) {
    if (!(error instanceof DataError)) throw error;
    console.warn(`Photo d’étape non écrite : ${stepId}`, error);
    return false;
  }
}

export async function replaceRecipeStepPhoto(input: { /* … */ }): Promise<void> {
  const next = await uploadRecipeStepPhoto(input.householdId, input.recipeId, input.stepId, input.file);
  const landed = await writeStepPhoto(input.stepId, next);
  if (!landed) {
    // La référence n'a pas été écrite : retirer le dépôt neuf, jamais l'ancien objet.
    await removeStepPhotoObject(next);
    return;
  }
  await removeStepPhotoObject(replacedMediaPath(input.previous, next));
}

export async function clearRecipeStepPhoto(stepId: string, previous: string | null): Promise<void> {
  const landed = await writeStepPhoto(stepId, null);
  if (landed) await removeStepPhotoObject(replacedMediaPath(previous, null));
}
```

(If surfacing the failure to the user is preferred over the no-op, throw instead of returning `false` — but the two callers must stop deleting the previous object when the write did not land.)

## Warnings

### WR-01: The guest signer trusts a client-writable raw value with no household or scheme validation

**File:** `supabase/functions/recipe-invite/guest-steps.ts:59-76` (used at `supabase/functions/recipe-invite/index.ts:472,481`; value written at `app/src/modules/recettes/api.ts:322-332`)

**Issue:** `resolveGuestMediaUrl` signs **any** non-`http(s)` string with the service-role client:

```ts
const value = asTextOrNull(raw);
if (!value) return null;
if (/^https?:\/\//i.test(value)) return value;   // (b) any remote URL passed through
const path = value.replace(/^\/+/, '');
const { data, error } = await signer.storage
  .from(HOUSEHOLD_MEDIA_BUCKET)
  .createSignedUrl(path, GUEST_PHOTO_TTL_SECONDS); // (a) signs any path, no prefix check
```

Two facets, same root cause — the value is client-writable and never validated:

**(a) Cross-tenant signing.** `recipe_steps.photo_path` is an ordinary writable column; its `UPDATE` policy is `can_write_household` (0122) and migration 0125 adds **no** `CHECK` on the value's shape (line 17 is a bare `add column text`). A member can therefore `PATCH /recipe_steps?id=eq.<own step>` with `{ "photo_path": "<otherHouseholdId>/recipes/…/…jpg" }`, then create their own share link. `handleLinkView` calls `createSignedUrl` with the service-role client, which bypasses the `(storage.foldername(name))[1]` bucket policy entirely, so the Edge hands back a 1-hour signed URL for another household's private object. The same unvalidated value is exposed to *guests* via `view_recipe_share`'s raw `photo_path` (0125:98), so a holder of B's share link who is also a member of A can persist B's path in A's step and keep a signed URL for it **after B revokes the share**, or reshare it to an unrelated third party. Exploitation requires knowing a full object path (UUIDs + random suffix), which is why this is a WARNING rather than a BLOCKER — but the missing validation is a real tenant-isolation gap, and it is not covered by D-16 (which only locks "RPC returns the raw path" and the 1 h TTL).

**(b) Arbitrary remote image load on the guest page.** Because `photo_path` is client-writable and any `http(s)://` value is returned verbatim, a member can make the *guest's* browser fetch an attacker-controlled image (guest IP, referrer and view timing leak to a third party).

**Fix:** validate the value at the one place that trusts it. Cleanest is a DB constraint so the value can never leave the household prefix, plus a defence-in-depth check in the Edge:

```sql
-- nouvelle migration (0125 est appliquée : corriger vers l'avant)
alter table public.recipe_steps
  add constraint recipe_steps_photo_path_household
  check (photo_path is null or photo_path like household_id || '/%');
```

and/or have `view_recipe_share` return `household_id` and reject any path whose leading segment differs before signing:

```ts
const prefix = `${recipeHouseholdId}/`;
if (!path.startsWith(prefix)) return null; // fail-closed, comme le reste du module
```

If the `http(s)` passthrough is only meant for legacy signed URLs, gate it on the host too (e.g. accept only the configured storage origin) rather than accepting any URL.

## Info

### IN-01: Remove-photo control and the photo affordance are gated on different values

**File:** `app/src/modules/recettes/components/recipe-steps.tsx:354` (with `:312-324`)

**Issue:** the ✕ "Retirer la photo" button renders on `step.photoPath`, while the image and the "Ajouter/Modifier la photo" affordance render on `props.photoUrl` (which is `null` whenever signing fails or a demo preview is dead). When the two disagree the row shows *both* "Ajouter une photo" and "✕ Retirer la photo de l'étape N" for a step that displays as photo-less — confusing, and the two controls then mean the same thing to the user.

**Fix:** gate both on the same source of truth (`step.photoPath`), or hide the ✕ when there is nothing rendered to remove:

```tsx
{step.photoPath && props.photoUrl ? ( /* ✕ Retirer la photo */ ) : null}
```

### IN-02: Fullscreen dialog state (`open`) is not reset when a preview dies

**File:** `app/src/modules/recettes/components/step-photo.tsx:30-43`

**Issue:** the render-phase adjustment resets `shownUrl` and `dead` when a new `url` arrives, but never resets `open`. If the preview dies while the fullscreen dialog is open (`dead` flips → the `url && !dead` branch is skipped and `StepPhotoDialog` unmounts), `open` stays `true`; a later `url` change re-enters the image branch and re-opens the dialog with no user action. Low reachability (needs a dead-then-revived URL on a mounted component), but the state is genuinely stale.

**Fix:** reset `open` in the same render-phase adjustment:

```tsx
if (url !== shownUrl) {
  setShownUrl(url);
  setDead(false);
  setOpen(false);
}
```

### IN-03: Duplicated helpers that already exist elsewhere

**File:** `app/src/modules/recettes/api.ts:617-621` and `:261-264`; `supabase/functions/recipe-invite/guest-steps.ts:26-30`; `app/src/lib/storage.ts:182-184`

**Issue:** `asGuestText` (api.ts:617-621) is byte-identical to `asTextOrNull` (guest-steps.ts:26-30), and `isRecipeCoverPath` (api.ts:261-264) duplicates the regex in `isHouseholdMediaPath` (storage.ts:182-184). Divergence between the copies is exactly the class of defect `media-path-contract.test.ts` exists to catch, so keeping two definitions of the same predicate is a standing risk.

**Fix:** import and reuse the existing helpers (`isHouseholdMediaPath` for the path predicate; share the trim-or-null normaliser with the Edge module or accept the small intentional duplication with a comment naming the cross-runtime boundary — `guest-steps.ts` must stay Deno-import-free, so a *comment* may be the honest answer there).

### IN-04: `photo_path` doc comment omits the leading household segment

**File:** `app/src/types/database.ts:396`

**Issue:** the comment reads `Chemin prive de la photo d'etape (recipes/<id>/steps/<stepId>/…, 0125)`, but the real value is `<householdId>/recipes/<recipeId>/steps/<stepId>/<file>.<ext>` (api.ts:328 → storage.ts:140; migration 0125:20 documents it correctly). AGENTS.md §2.7 I: a stale or incomplete affirmation dissuades the next reader — here it would hide the household prefix that WR-01 turns on.

**Fix:**

```ts
/** Chemin prive de la photo d'etape (`<householdId>/recipes/<recipeId>/steps/<stepId>/…`, 0125). */
photo_path?: string | null;
```

---

_Reviewed: 2026-10-16T15:17:57Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
