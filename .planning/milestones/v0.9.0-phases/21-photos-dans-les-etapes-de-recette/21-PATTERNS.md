# Phase 21: Photos dans les étapes de recette — Pattern Map

**Mapped:** 2026-10-16
**Files analyzed:** 17 (11 source + 6 test)
**Analogs found:** 17 / 17

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/0125_recipe_step_photos.sql` | migration | schema-transform | `supabase/migrations/0111_pet_summary_columns.sql` + `0122_recettes_full.sql:561-664` | role-match (add-column) + exact (function recreate) |
| `supabase/tests/0125_recipe_step_photos.sql` | test (SQL) | CRUD / RLS | `supabase/tests/0054_recettes_full.sql` + `0038_conversation_matrix.sql` | exact |
| `supabase/functions/recipe-invite/index.ts` | edge function | request-response + file-I/O (signing) | self (existing `resolveGuestCoverUrl`) | exact |
| `app/src/modules/recettes/api.ts` | service (data-access) | CRUD + file-I/O | self (existing `uploadRecipeCover` / `deleteRecipe` / `resolveRecipeCoverUrl`) | exact |
| `app/src/modules/recettes/types.ts` | types / transform | transform | self (existing `toStep` / `toRecipePrintModel`) | exact |
| `app/src/types/database.ts` | types (row) | — | self (`RecipeStepRow`) | exact |
| `app/src/modules/recettes/components/recipe-steps.tsx` | component | event-driven (interaction) | self (existing `StepRow`) | exact |
| `app/src/modules/recettes/components/recipe-cuisine-view.tsx` | component | event-driven | self (existing step `<li>` render) | exact |
| `app/src/modules/recettes/components/step-photo-dialog.tsx` | component (dialog) | request-response (presentation) | `app/src/modules/fidelite/components/card-code-dialog.tsx` | role-match (fullscreen twin) |
| `app/src/modules/recettes/components/recipe-export.css` | config (CSS) | file-I/O (print) | self (existing `@media print`) | exact |
| `app/src/modules/recettes/guest-recipe-page.tsx` | page | request-response | self (existing step mapping + shared components) | exact |
| `app/src/modules/recettes/recette-detail-page.tsx` | page | request-response | self (existing `onDelete` + `printModel`) | exact |
| `app/src/modules/recettes/recipe-step-photo.test.ts` | test (unit) | file-I/O | `app/src/modules/recettes/recipe-cover.test.ts` | exact |
| `app/src/modules/recettes/recette-detail-page.test.tsx` | test (component) | request-response | `app/src/modules/recettes/guest-recipe-page.test.tsx` + `recipe-steps.test.tsx` | role-match |
| `app/src/modules/recettes/recipe-steps.test.tsx` | test (component, modify) | event-driven | self | exact |
| `app/src/modules/recettes/recipe-actions.test.ts` | test (contract, modify) | CRUD | self | exact |
| `app/src/lib/media-path-contract.test.ts` | test (contract, modify) | — | self (`ALIGNED_WRITE_SITES`) | exact |

> **Tracked-source gate (#3645) — verified.** All analog paths above are git-tracked (`git ls-files` non-empty): `app/src/modules/recettes/*`, `app/src/lib/storage.ts`, `app/src/lib/media-path-contract.test.ts`, `app/src/types/database.ts`, `app/src/modules/fidelite/components/card-code-dialog.tsx`, `supabase/functions/recipe-invite/index.ts`, `supabase/migrations/0122_recettes_full.sql`, `supabase/migrations/0124_media_path_backfill.sql`. No gitignored mirror paths are used.

---

## Pattern Assignments

### `supabase/migrations/0125_recipe_step_photos.sql` (migration, schema-transform)

**Analog:** `supabase/migrations/0111_pet_summary_columns.sql` (add-column) + `supabase/migrations/0122_recettes_full.sql` (function recreate)

**Header / forward-only doctrine + `add column if not exists`** (`0111_pet_summary_columns.sql:1-33`):
```sql
-- 0111_pet_summary_columns.sql
-- ...
-- Contenu, vers l'avant uniquement (les migrations appliquees ne sont jamais
-- retouchees) :
--   * `pets.notes` (text) et `pets.next_reminder_date` (date), NULL par
--     defaut : une fiche sans rappel reste une fiche valide ;
-- ...

begin;

alter table public.pets
  add column if not exists notes text,
  add column if not exists next_reminder_date date;

comment on column public.pets.notes is
  '...';
```
Adapt: `begin; alter table public.recipe_steps add column if not exists photo_path text; comment on column public.recipe_steps.photo_path is '...'; ... commit;`. **Never touch `0122`** (AGENTS.md §2.7 A.1).

**Function recreation — `create or replace` + `set search_path = ''` + `public.*` qualification** (`0122_recettes_full.sql:561-590`):
```sql
create or replace function public.view_recipe_share(p_share_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_share public.recipe_shares%rowtype;
  ...
begin
  ...
  select s.* into v_share
    from public.recipe_shares s
   where s.share_hash = p_share_hash
     and private.token_hash_matches(s.share_hash, p_share_hash)
    for update;
```
Every table in the recreated function must be `public.`-qualified (`set search_path = ''` resolves no bare name — Pitfall P-4, `check-sql-statique` control 1).

**The steps jsonb to extend** (`0122_recettes_full.sql:628-638`) — add `'photo_path', st.photo_path`:
```sql
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', st.id,
             'content', st.content,
             'position', st.position
           )
           order by st.position, st.id
         ), '[]'::jsonb)
    into v_steps
    from public.recipe_steps st
   where st.recipe_id = v_share.recipe_id;
```

**NO new table policy** — `recipe_steps` already carries all four (`0122_recettes_full.sql:305-346`). Do not reproduce `*_delete_admin` (phase 18 §3):
```sql
    execute format('create policy %I on public.%I for select using (private.is_household_member(household_id))', ...);
    execute format('create policy %I on public.%I for insert with check (private.can_write_household(household_id))', ...);
    execute format('create policy %I on public.%I for update using (private.can_write_household(household_id)) with check (private.can_write_household(household_id))', ...);
    execute format('create policy %I on public.%I for delete using (private.can_write_household(household_id))', ...);
```

**Function-grant hygiene** — if the migration creates a *new* helper function (it should not, per D-02), revoke EXECUTE explicitly (pattern from `0124_media_path_backfill.sql:91-98`):
```sql
revoke all on function private.media_path_from_signed_url(text) from public;
```

**Migration naming** — last migration is `0124_media_path_backfill.sql`; next is `0125_recipe_step_photos.sql` (RESEARCH Open Question 1).

---

### `supabase/tests/0125_recipe_step_photos.sql` (test, SQL/RLS)

**Analog:** `supabase/tests/0054_recettes_full.sql` (RLS) + `supabase/tests/0038_conversation_matrix.sql` (Storage insert under RLS)

**Fixture + bounded-assertion doctrine** (`0054_recettes_full.sql:6-9, 14-73`):
```sql
-- Bornes (AGENTS.md §2.7D) : chaque comptage est borne au foyer, a la recette
-- ou au lien via testkit.fx — jamais de total nu. Role `postgres`
-- ...
begin;

do $$
declare
  alice uuid := testkit.auth_user('r16-alice@example.fr', 'Alice Recettes');
  ...
begin
  ...
  insert into public.recipe_steps (recipe_id, household_id, content, position)
  values (recipe_r1, home_a, 'Melanger la farine et le sel.', 1),
         (recipe_r1, home_a, 'Cuire au four.', 2);
end;
$$;
```

**Positive Storage insert under RLS** (`0038_conversation_matrix.sql:80-91`):
```sql
select testkit.as_user(user_id, 'mconv-kid@example.fr') from testkit.fx where key = 'kid';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'insert into storage.objects (bucket_id, name, owner) values (%L, %L, %L)',
  'household-media',
  (select household_id from testkit.fx where key = 'home') || '/messages/'
    || (select row_id from testkit.fx where key = 'conv') || '/photo-noe.jpg',
  (select user_id from testkit.fx where key = 'kid'))), 1::bigint,
  'l''enfant membre du fil depose son image messages (D-01)');
```

**Negative RLS test (enfant / other household)** — the proof-of-failure shape (`0054_recettes_full.sql:210-232`):
```sql
select testkit.expect_denied(format(
  'insert into public.recipes (household_id, title) values (%L, %L)',
  (select household_id from testkit.fx where key = 'home_a'),
  'Gateau interdit'),
  'un enfant n''insere pas de recette');
...
select testkit.eq(testkit.affected(format(
  'delete from public.recipe_categories where id = %L',
  (select row_id from testkit.fx where key = 'default_a'))), 0::bigint,
  'un enfant ne supprime pas de categorie');
```

**RPC jsonb shape assertion** (`0054_recettes_full.sql:319-323`) — assert `photo_path` presence:
```sql
  v_view := public.view_recipe_share(repeat('c', 64));
  perform testkit.eq(jsonb_array_length(v_view -> 'steps')::bigint, 2::bigint, 'la fiche rend 2 etapes');
  perform testkit.ok(v_view -> 'tags' ? 'Plat', 'la fiche rend le tag Plat');
```

Test the case that **must fail**: an `enfant` (outside `can_write_household`) cannot insert a Storage object under `<householdId>/recipes/<recipeId>/steps/<stepId>/` and cannot update `recipe_steps.photo_path`. Align types (`::bigint`) per Pitfall P-10; never use a bare total under `postgres` role (Pitfall P-9).

---

### `supabase/functions/recipe-invite/index.ts` (edge function, request-response + signing)

**Analog:** self — `resolveGuestCoverUrl` (the one signing site to mirror).

**Signing helper + TTL constant** (`supabase/functions/recipe-invite/index.ts:427-460`):
```ts
/** Bucket privé des fichiers du foyer : seul nom que les politiques connaissent. */
const HOUSEHOLD_MEDIA_BUCKET = 'household-media';
/** Validité des URL photo invitées : courte (une heure), forgée par requête. */
const GUEST_PHOTO_TTL_SECONDS = 3600;

/** Chaîne non vide telle quelle, sinon null (échec fermé, jamais ''). */
function asTextOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function resolveGuestCoverUrl(admin: AdminClient, raw: unknown): Promise<string | null> {
  const value = asTextOrNull(raw);
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  try {
    const path = value.replace(/^\/+/, '');
    const { data, error } = await admin.storage
      .from(HOUSEHOLD_MEDIA_BUCKET)
      .createSignedUrl(path, GUEST_PHOTO_TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}
```
Add a twin `resolveGuestPhotoUrl(admin, raw)` with the **same shape, same TTL constant, same fail-closed → `null`**. Do not invent a second TTL.

**Steps projection to extend** (`supabase/functions/recipe-invite/index.ts:501-521`):
```ts
  const steps = Array.isArray(view.steps)
    ? view.steps.map((step) => ({
      id: String(step.id ?? ''),
      content: String(step.content ?? ''),
      position: typeof step.position === 'number' ? step.position : 0,
    }))
    : [];
  ...
  return json({
    recipeId: view.recipe_id ?? null,
    ...
    coverPhotoUrl: await resolveGuestCoverUrl(admin, view.cover_photo),
    ...
    steps,
  });
```
The `steps.map` is synchronous today — signing is async, so it becomes `await Promise.all(view.steps.map(async (step) => ({ ..., photoUrl: await resolveGuestPhotoUrl(admin, step.photo_path) })))`. Extend the typed `view.steps` element (line 488) with `photo_path?: unknown`.

---

### `app/src/modules/recettes/api.ts` (service, CRUD + file-I/O)

**Analog:** self — `uploadRecipeCover` / `deleteRecipe` / `resolveRecipeCoverUrl` are the exact shapes to clone for steps.

**Imports + module constants** (`api.ts:1-27`):
```ts
import { data } from '@/lib/data';
import { isSupabaseConfigured, supabase, supabaseFunctionsBase } from '@/lib/supabase/client';
import { depositHouseholdFile, removeHouseholdFile, resolveHouseholdMediaUrl, storedValueOf } from '@/lib/storage';
import type { RecipeStepRow, ... } from '@/types';
...
export const RECIPE_STEPS_TABLE = 'recipe_steps';
export const RECIPE_COVER_URL_TTL = 3600;
```
Add `householdMediaPathOf` and `replacedMediaPath` to the `@/lib/storage` import for the cleanup path.

**Delete + cleanup pattern to extend (3 levels, R5)** (`api.ts:218-238`):
```ts
export async function deleteRecipeStep(id: string): Promise<void> {
  await data.remove(RECIPE_STEPS_TABLE, id);
}
...
export async function deleteRecipe(id: string, coverPhoto: string | null): Promise<void> {
  await data.remove(RECIPES_TABLE, id);
  const path = recipeCoverPathOf(coverPhoto);
  if (path) await removeHouseholdFile(path).catch(() => undefined);
}
```
Target: `deleteRecipeStep(id, photoPath)` cleans the step object; `deleteRecipe(id, coverPhoto, stepPhotoPaths)` attempts **all** step objects even if one fails (R5 ordering edge). The best-effort `.catch(() => undefined)` idiom is the accepted limit (D-05).

**Deposit + column-value point** (`api.ts:244-258`):
```ts
function isRecipeCoverPath(value: string | null | undefined): value is string {
  if (typeof value !== 'string' || value === '') return false;
  return !/^(https?:|blob:|data:|\/)/i.test(value);
}

export function recipeCoverPathOf(stored: string | null | undefined): string | null {
  return isRecipeCoverPath(stored) ? stored : null;
}

/** Depose la couverture (`recipes/<id>`, compression native partagee). */
export async function uploadRecipeCover(householdId: string, recipeId: string, file: File): Promise<string> {
  const deposited = await depositHouseholdFile({ householdId, folder: `recipes/${recipeId}`, file });
  return storedValueOf(deposited);
}
```
Target `uploadRecipeStepPhoto(householdId, recipeId, stepId, file)` uses `folder: \`recipes/${recipeId}/steps/${stepId}\`` and **must** return `storedValueOf(deposited)` (never `deposited.url` — Pitfall P-1 / negative criterion). Use `householdMediaPathOf` from `lib/storage.ts` rather than a local `isRecipeStepPath` clone.

**Read resolution (fail-closed)** (`api.ts:267-281`):
```ts
export async function resolveRecipeCoverUrl(stored: string | null): Promise<string | null> {
  if (!stored) return null;
  if (!isRecipeCoverPath(stored)) {
    return /^blob:|^https?:|^data:|^\/assets\//i.test(stored) ? stored : null;
  }
  return resolveHouseholdMediaUrl(stored, RECIPE_COVER_URL_TTL);
}
```
Mirror as `resolveRecipeStepPhotoUrl(stored)` with the same non-path passthrough (so demo `blob:` renders) and the same fail-closed `null`.

**Guest projection to extend (D-15)** (`api.ts:456-460, 495-502, 511-538`):
```ts
export interface GuestRecipeStep {
  id: string;
  content: string;
  position: number;
}

function toGuestStep(entry: unknown): GuestRecipeStep {
  const row = (entry ?? {}) as Record<string, unknown>;
  return {
    id: String(row.id ?? ''),
    content: String(row.content ?? ''),
    position: typeof row.position === 'number' ? row.position : 0,
  };
}
```
Add `photoUrl: string | null` to `GuestRecipeStep` and `photoUrl: asGuestText(row.photoUrl)` to `toGuestStep` (using the existing `asGuestText`, `api.ts:478-482`). The `fetchGuestRecipeView` return object (lines 526-537) stays symmetric.

**Replacement + cleanup (D-04)** — compose the existing helpers (from RESEARCH Code Examples, all helpers read this session):
```ts
const previous = step.photoPath;
const next = await uploadRecipeStepPhoto(householdId, recipeId, step.id, file);
await data.update(RECIPE_STEPS_TABLE, step.id, { photo_path: next });
const orphan = replacedMediaPath(previous, next); // null when same path or non-path
if (orphan) await removeHouseholdFile(orphan).catch(() => undefined);
```

---

### `app/src/modules/recettes/types.ts` (types / transform)

**Analog:** self — `toStep` and `toRecipePrintModel`.

**Domain type + row mapper** (`types.ts:68-72, 219-223`):
```ts
export interface RecipeStep {
  id: string;
  content: string;
  position: number;
}
...
export const toStep = (row: RecipeStepRow): RecipeStep => ({
  id: row.id,
  content: row.content,
  position: row.position,
});
```
Add `photoPath: string | null` to `RecipeStep` and `photoPath: row.photo_path ?? null` to `toStep`.

**Print model (D-09)** (`types.ts:229-263`):
```ts
export interface RecipePrintModel {
  title: string;
  meta: string;
  ingredientLines: string[];
  stepLines: string[];
}

export function toRecipePrintModel(args: {
  title: string;
  servings: number;
  targetServings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
}): RecipePrintModel {
  ...
  const stepLines = args.steps.map((step, index) => `${index + 1}. ${step.content}`);
  return { title: args.title, meta, ingredientLines, stepLines };
}
```
Recommended (Open Question 2): add a parallel `stepPhotos: (string | null)[]` so the existing `stepLines.map` render and its tests are not broken. The model stays **pure** — resolved URLs arrive as input (signing is async, A3).

---

### `app/src/types/database.ts` (types, row)

**Analog:** self (`RecipeStepRow`).

**Row type to extend** (`app/src/types/database.ts:390-396`):
```ts
export interface RecipeStepRow {
  id: Uuid;
  recipe_id: Uuid;
  household_id: Uuid;
  content: string;
  position: number;
}
```
Add `photo_path: string | null;`.

---

### `app/src/modules/recettes/components/recipe-steps.tsx` (component, interaction)

**Analog:** self — `StepRow` and the inline `pendingDelete` confirmation.

**Props + `readOnly` (R2)** (`recipe-steps.tsx:20-36`):
```tsx
export interface RecipeStepsProps {
  steps: RecipeStep[];
  /** Faux pour le rôle `enfant` : saisie et drag masques, cases conservees. */
  readOnly?: boolean;
  isSaving?: boolean;
  onAdd: (content: string) => Promise<void> | void;
  onUpdate: (step: RecipeStep, content: string) => Promise<void> | void;
  onDelete: (step: RecipeStep) => Promise<void> | void;
  onReorder: (orderedIds: string[]) => Promise<void> | void;
}
...
export function RecipeSteps({ steps, readOnly = false, isSaving = false, onAdd, onUpdate, onDelete, onReorder }: RecipeStepsProps) {
```
Add `onPhotoChange?: (step, file) => …` / `onPhotoRemove?: (step) => …` props. Every photo affordance (add D-11, modify D-12, remove D-13) must be gated on `!readOnly` so an `enfant` sees the image but no command.

**Step row render — text + action bar (where the full-width image goes, D-06)** (`recipe-steps.tsx:205-266, 270-306`):
```tsx
function StepRow(props: StepRowProps) {
  const { step, number, isLast, checked, onToggleChecked, readOnly } = props;
  ...
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <Checkbox ... />
          <div className="min-w-0 flex-1">
            {props.isEditing ? (
              ...
            ) : (
              <p className={cn('m-0 text-[13px]', checked && 'text-muted line-through')}>{step.content}</p>
            )}
          </div>
        </div>
        {!readOnly && !props.isEditing ? (
          <div className="mt-1.5 flex items-center gap-1">
            <button ... aria-label={`Monter l’étape ${number}`} ...>
```
Place the full-width `<img>` **below the text** inside this `flex-1` column (D-06), and the "Ajouter une photo" invitation / "Modifier la photo" button in the existing secondary action bar (D-11/D-12), all inside `!readOnly`.

**Inline confirmation to reuse for removal (D-13)** (`recipe-steps.tsx:159-181`):
```tsx
      {pendingDelete ? (
        <div role="alertdialog" aria-modal="true" aria-label="Supprimer cette étape ?" className="mt-2 rounded-[10px] border border-border bg-bg p-3">
          <p className="m-0 text-[13px]">Supprimer l’étape <strong>« {pendingDelete.content.slice(0, 60)} »</strong> ?</p>
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" onClick={() => setPendingDelete(null)}>Annuler</Button>
            <Button variant="danger" disabled={isSaving} onClick={() => { ... void onDelete(targetDelete); }}>Supprimer</Button>
          </div>
        </div>
      ) : null}
```
Reuse this inline idiom (not a `ConfirmDialog`) for the photo removal. Replacement (D-14) is **direct** — no confirmation.

**`onError` masking (R6/D-18, Pitfall P-7)** — no `onError` exists anywhere in `app/src` today (verified), so this is new work: local state flips the dead `blob:` preview to "no photo" so the step renders exactly as an un-photographed step.

---

### `app/src/modules/recettes/components/recipe-cuisine-view.tsx` (component, event-driven)

**Analog:** self — the step `<li>` render.

**Step render (large image under text, reduced when checked — D-08)** (`recipe-cuisine-view.tsx:76-92`):
```tsx
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={() => toggle(step.id)}
                    aria-label={`Marquer l’étape ${number} comme faite`}
                    className="relative mt-1 size-6 shrink-0 after:absolute after:-inset-3 after:content-['']"
                  />
                  {isChecked ? (
                    <p className="m-0 line-clamp-2 text-[14px] text-muted" aria-label={step.content}>
                      {step.content}
                    </p>
                  ) : (
                    <p className="m-0 text-[18px] leading-[1.5]">{step.content}</p>
                  )}
                </div>
              </div>
```
Place a large `<img>` under the text, reduced (bounded height) when `isChecked` (recommended over hiding, to avoid layout shift — Open Question 3). Receives `steps` already loaded — zero extra network.

---

### `app/src/modules/recettes/components/step-photo-dialog.tsx` (component, dialog) — NEW

**Analog:** `app/src/modules/fidelite/components/card-code-dialog.tsx` (fullscreen twin, D-07)

**Imports + Dialog usage** (`card-code-dialog.tsx:1-2, 34-36, 95-96`):
```tsx
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
...
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[720px] border-0 bg-fg p-6 text-surface sm:p-7">
        ...
      </DialogContent>
    </Dialog>
```

**Incompatible signature — why a twin, not reuse** (`card-code-dialog.tsx:9-18`):
```tsx
export interface CardCodeDialogProps {
  card: LoyaltyCard | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isMutating: boolean;
  onScan: () => void;
  onMarkUsed: () => void;
  onEdit: () => void;
  onDelete: () => void;
}
```
Create `StepPhotoDialog` with `{ src: string | null; alt: string; open: boolean; onOpenChange: (open: boolean) => void }` on the **same** `Dialog`/`DialogContent` primitives (Radix WAI-ARIA, dismissible, keyboard — D-07). No dependency on `LoyaltyCard`.

---

### `app/src/modules/recettes/components/recipe-export.css` (config, print)

**Analog:** self — existing `@media print` block (D-09).

**Print rule to extend** (`recipe-export.css:17-55`):
```css
@media print {
  body aside,
  body header,
  body nav,
  body [role='region'],
  body .recipe-screen {
    display: none !important;
  }

  body .recipe-print {
    display: block !important;
    color: #000;
    font-size: 12pt;
    line-height: 1.45;
  }
  ...
  .recipe-print li {
    margin-bottom: 4pt;
  }
}
```
Add a bounded-width rule for `.recipe-print img` (e.g. `max-width: 100%; max-height: 120pt;`) so the step image prints without breaking pagination. CSS only — no PDF dependency (D-09). Update the header comment (lines 5-10) which currently states "le modèle n'en porte aucune".

---

### `app/src/modules/recettes/guest-recipe-page.tsx` (page, request-response)

**Analog:** self — maps `view.steps` then renders the shared components.

**Guest step mapping to extend (D-15/D-17)** (`guest-recipe-page.tsx:76-80`):
```tsx
  const steps: RecipeStep[] = (view?.steps ?? []).map((entry) => ({
    id: entry.id,
    content: entry.content,
    position: entry.position,
  }));
```
Add `photoPath: entry.photoUrl` (signed URL or `null`) — the shared `StepRow` renders it identically to the member card (D-17).

**Shared components already rendered (R3 — one render covers member + guest)** (`guest-recipe-page.tsx:168-172`):
```tsx
              {cuisine ? (
                <RecipeCuisineView steps={steps} recipeId={cuisineRecipeId} wakeLockSupported={wakeLockSupported} />
              ) : (
                <RecipeSteps steps={steps} readOnly onAdd={noop} onUpdate={noop} onDelete={noop} onReorder={noop} />
              )}
```
Because both surfaces render these same components, adding the image inside them covers the guest page automatically (Pitfall P-6).

**Guest cover image idiom (full-width, for reference)** (`guest-recipe-page.tsx:128-134`):
```tsx
            {view.coverPhotoUrl ? (
              <img
                src={view.coverPhotoUrl}
                alt={`Photo de ${view.title}`}
                className="h-44 w-full rounded-[12px] object-cover"
              />
            ) : null}
```

---

### `app/src/modules/recettes/recette-detail-page.tsx` (page, request-response)

**Analog:** self — step callbacks + print model.

**Step delete callback to extend (R5)** (`recette-detail-page.tsx:330-338`):
```tsx
          onDelete={async (step) => {
            try {
              guard();
              await deleteRecipeStep(step.id);
              await refreshChildren();
            } catch (deleteError) {
              toast(deleteError instanceof Error ? deleteError.message : 'L’étape n’a pas pu être supprimée.', 'error');
            }
          }}
```
Pass the step's `photoPath` to `deleteRecipeStep`. Add photo add/replace/remove callbacks following the same `guard()` + `toast` + `refreshChildren()` shape.

**Print model build (D-09)** (`recette-detail-page.tsx:118-128`):
```tsx
  const printModel = recipe
    ? toRecipePrintModel({
        title: recipe.title,
        servings: recipe.servings,
        targetServings: effectiveTarget,
        prepMinutes: recipe.prepMinutes,
        cookMinutes: recipe.cookMinutes,
        ingredients,
        steps,
      })
    : null;
```
The fiche has `steps` loaded (`stepsByRecipe[recipe.id]`, line 84) — resolve step photo URLs (async) and pass them in; `toRecipePrintModel` stays pure.

**Print block to extend** (`recette-detail-page.tsx:457-462`):
```tsx
        <h3>Étapes</h3>
        <ol>
          {printModel.stepLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
```
Render the bounded `<img>` under each numbered line; the text line remains the reference if the image fails.

**Recipe deletion — pass all step paths (R5, Pitfall P-8)** — `removeRecipe(recipe)` (line 409) currently only carries the cover; `deleteRecipe(id, coverPhoto, stepPhotoPaths)` must receive every step path.

---

### `app/src/modules/recettes/recipe-step-photo.test.ts` (test, unit) — NEW

**Analog:** `app/src/modules/recettes/recipe-cover.test.ts`

**Storage mocks + demo/Supabase toggles** (`recipe-cover.test.ts:20-68`):
```ts
const { storageMocks, supabaseState } = vi.hoisted(() => {
  type SignResult = { data: { signedUrl: string } | null; error: { message: string } | null };
  const storageMocks = {
    createSignedUrl: vi.fn(async (path: string): Promise<SignResult> => ({ data: { signedUrl: `https://signe.example/${path}` }, error: null })),
    remove: vi.fn(async () => ({ error: null })),
  };
  const supabaseState = { configured: false };
  return { storageMocks, supabaseState };
});

vi.mock('@/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage')>();
  return {
    ...actual,
    depositHouseholdFile: vi.fn(async ({ file }: { file: File }) => ({
      url: 'blob:apercu-couverture', path: null, name: file.name, mime: 'image/jpeg', size: 21,
    })),
    removeHouseholdFile: vi.fn(async () => {}),
  };
});
```

**Resolution + deposit + cleanup assertions to mirror (R1/R6)** (`recipe-cover.test.ts:70-123`):
```ts
  it('rend les formes non-chemin telles quelles, null sans image', async () => {
    expect(await resolveRecipeCoverUrl(null)).toBeNull();
    expect(await resolveRecipeCoverUrl('blob:apercu-local')).toBe('blob:apercu-local');
    ...
  });

  it('echec ferme sans backend : un chemin donne null, jamais de lien mort', async () => {
    expect(await resolveRecipeCoverUrl('foyer-1/recipes/r-1/file.jpg')).toBeNull();
  });

  it('depose via le helper partage (compression native)', async () => {
    const file = new File(['pixels'], 'gratin.jpg', { type: 'image/jpeg' });
    const stored = await uploadRecipeCover(DEMO_HOUSEHOLD_ID, 'recipe-9', file);
    expect(depositMock).toHaveBeenCalledWith({ householdId: DEMO_HOUSEHOLD_ID, folder: 'recipes/recipe-9', file });
    expect(stored).toBe('blob:apercu-couverture');
  });

  it('supprimer la recette nettoie l objet Storage (aucun orphelin)', async () => {
    ...
    expect(removeFileMock).toHaveBeenCalledWith('foyer-1/recipes/r-del/file.jpg');
  });
```
Include the **negative criterion** (SPEC acceptance 6): after deposit, the stored value is a bucket path, never `http(s)://`. Cover the demo dead-`blob:` masking (R6).

---

### `app/src/modules/recettes/recette-detail-page.test.tsx` (test, component) — NEW

**Analog:** `app/src/modules/recettes/guest-recipe-page.test.tsx` (mock fetch/payload) + `recipe-steps.test.tsx` (render + roles)

**Render + role query idiom** (`recipe-steps.test.tsx:1-37`):
```tsx
import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { RecipeSteps } from './components/recipe-steps';
...
const STEPS: RecipeStep[] = [
  { id: 'step-1', content: 'Éplucher les pommes de terre.', position: 0 },
  ...
];

describe('Étapes recettes (R7, D-11, D-12)', () => {
  it('affiche les bulles 1-2-3 avec poignees de drag', async () => {
    renderSteps();
    const list = await screen.findByRole('list', { name: 'Étapes de la recette' });
    expect(within(list).getByRole('button', { name: 'Réordonner : étape 1' })).toBeInTheDocument();
```
Assert the four surfaces: the fiche image + the print model (R3). For the "no photo" case assert **no** media element is rendered (D-10) — a positive assertion, not a tautology (Pitfall P-9).

---

### `app/src/modules/recettes/recipe-steps.test.tsx` (test, component — MODIFY)

**Analog:** self.

Extend the existing `RecipeSteps` suite: with `readOnly` (enfant) no add/remove command is rendered and the image stays visible; without it both commands are rendered and functional (R2, SPEC acceptance 3).

---

### `app/src/modules/recettes/recipe-actions.test.ts` (test, contract — MODIFY)

**Analog:** self.

Add the three-level cleanup cases (R5): remove photo, delete step, delete recipe — each leaves no object in the bucket; a step/recipe with no photo is a no-op without error (SPEC acceptance 7).

---

### `app/src/lib/media-path-contract.test.ts` (test, contract — MODIFY)

**Analog:** self — `ALIGNED_WRITE_SITES`.

**Write-site registry** (`media-path-contract.test.ts:75-89, 118-130`):
```ts
const ALIGNED_WRITE_SITES = [
  'modules/notes/api.ts',
  ...
  'modules/recettes/api.ts',
  'modules/prestataires/api.ts',
  'modules/adresses/api.ts',
];
...
  it('chaque site d’écriture aligné produit sa colonne par storedValueOf', () => {
    ...
    for (const site of ALIGNED_WRITE_SITES) {
      const file = resolve(root!, site);
      expect(existsSync(file), `site aligné introuvable : ${site}`).toBe(true);
      expect(readFileSync(file, 'utf8'), `${site} ne passe pas par storedValueOf (D-01)`).toContain('storedValueOf(');
    }
  });
```
`modules/recettes/api.ts` is already registered — the new `uploadRecipeStepPhoto` lives there, so no registry change is required **unless** a new file becomes a write site (Pitfall P-1).

---

## Shared Patterns

### Media column value — one point (`storedValueOf`)
**Source:** `app/src/lib/storage.ts:164-175`
**Apply to:** `api.ts` write paths (`uploadRecipeStepPhoto`), any new write site
```ts
export function storedValueOf(deposited: DepositedFile): string {
  return deposited.path ?? deposited.url;
}
```

### Deposit (`depositHouseholdFile`) — never a parallel depositor
**Source:** `app/src/lib/storage.ts:109-151` (path built at line 140)
**Apply to:** `uploadRecipeStepPhoto`
```ts
  const path = `${householdId}/${folder}/${randomId('file')}.${extensionFor(storedMime, file.name)}`;
  const { error } = await supabase.storage.from(HOUSEHOLD_MEDIA_BUCKET).upload(path, blob, {
    contentType: storedMime, upsert: false,
  });
```

### Read resolution — fail-closed, single signing point
**Source:** `app/src/lib/storage.ts:210-227` (member) and `supabase/functions/recipe-invite/index.ts:446-460` (guest)
**Apply to:** `resolveRecipeStepPhotoUrl` (member) and `resolveGuestPhotoUrl` (Edge)
```ts
  if (!path) return stored.trim() === '' ? null : stored;
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data: signed, error } = await supabase.storage.from(HOUSEHOLD_MEDIA_BUCKET).createSignedUrl(path, ttl);
    if (error || !signed) return null;
    return signed.signedUrl;
  } catch {
    return null;
  }
```

### Replacement cleanup decision — pure guard
**Source:** `app/src/lib/storage.ts:244-258`
**Apply to:** photo replacement (D-04), step deletion, recipe deletion
```ts
export function replacedMediaPath(previousStored: string | null, nextStored: string | null): string | null {
  const previous = householdMediaPathOf(previousStored);
  if (!previous) return null;
  const next = (nextStored ?? '').trim();
  return next.length === 0 || next !== previous ? previous : null;
}
```

### Object removal — best-effort, never silent
**Source:** `app/src/lib/storage.ts:153-162`
**Apply to:** all three cleanup levels (R5)
```ts
export async function removeHouseholdFile(path: string | null): Promise<void> {
  if (!path || !isSupabaseConfigured || !supabase) return;
  const { error } = await supabase.storage.from(HOUSEHOLD_MEDIA_BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}
```
Callers wrap with `.catch(() => undefined)` (the `deleteRecipe` idiom, `api.ts:234-238`) — the removal never cancels the committed photo.

### Authorization — no new policy (table + bucket already cover it)
**Source:** `supabase/migrations/0122_recettes_full.sql:305-346` (table) and `0099_message_child_upload.sql:53-64` (Storage, cited in RESEARCH)
**Apply to:** the migration (nothing to add) and the tests (prove positif membre / négatif enfant)
```sql
-- recipe_steps: select = is_household_member ; insert/update/delete = can_write_household
-- storage household-media: can_write_household((storage.foldername(name))[1]) — foldername[1] stays the householdId
```

---

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH.md patterns instead):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| — | — | — | None. Every file has a strong in-repo analog: the client media flow mirrors `recipes.cover_photo`; the guest signing mirrors `resolveGuestCoverUrl`; the fullscreen dialog mirrors `card-code-dialog.tsx`; the migration mirrors `0111` (add-column) + `0122` (function recreate); tests mirror `0054`/`0038`/`recipe-cover.test.ts`. |

**Only genuinely-new behavior with no direct excerpt to copy:** `onError`-based masking of a dead `blob:` preview (R6/D-18) — no `onError` exists anywhere in `app/src` today (verified: `grep -rn "onError=" app/src` empty). The planner must specify this from RESEARCH Pitfall P-7, not from an analog.

---

## Metadata

**Analog search scope:** `app/src/modules/recettes/**`, `app/src/lib/**`, `app/src/types/**`, `app/src/modules/fidelite/components/**`, `supabase/functions/recipe-invite/**`, `supabase/migrations/**`, `supabase/tests/**`
**Files scanned:** 30+ (analogs read this session with verbatim excerpts + line ranges)
**Tracked-source gate:** all named analogs confirmed git-tracked via `git ls-files`
**Pattern extraction date:** 2026-10-16
