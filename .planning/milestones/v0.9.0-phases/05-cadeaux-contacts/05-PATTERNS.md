# Phase 05: Cadeaux/Contacts - Pattern Map

**Mapped:** 2026-10-05
**Files analyzed:** 14 (5 migrations, 1 Edge Function, 3 SQL tests, 4 frontend areas, 1 data-layer config)
**Analogs found:** 14 / 14

> All analog paths below were verified git-tracked (`git ls-files -- <path>` non-empty).
> Migration numbering starts at **0076** — HEAD is `0075_gift_read_household_scope.sql`; the source-plan
> numbers 0047–0051 are stale. SQL test numbering continues at **0024–0026** (repo `supabase/tests/` HEAD is `0023_*`).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/0076_gift_ideas.sql` | migration (model) | CRUD | `supabase/migrations/0071_products.sql` | exact |
| `supabase/migrations/0077_contacts.sql` | migration (model) | CRUD | `supabase/migrations/0071_products.sql` + `0008_triggers.sql` loops | exact |
| `supabase/migrations/0078_birthday_mirror.sql` | migration (model) | event-driven (trigger) | `supabase/migrations/0008_triggers.sql` + `0043_media_attachments.sql`-style FK | role-match |
| `supabase/migrations/0079_gift_invites.sql` | migration (model + RPC) | request-response (service_role RPC) | `supabase/migrations/0058_ardoise_settlement_rpc.sql` (invite family) + `0009_grants.sql` | exact |
| `supabase/migrations/0080_gift_items_mask.sql` | migration (view) | transform | `supabase/migrations/0075_gift_read_household_scope.sql` | exact |
| `supabase/functions/gift-list-invite/index.ts` | edge function | request-response | `supabase/functions/ardoise-invite/index.ts` | exact |
| `supabase/tests/0024_gift_ideas.sql` | test (SQL) | CRUD | `supabase/tests/0022_products.sql` | exact |
| `supabase/tests/0025_contacts_mirror.sql` | test (SQL) | CRUD + event-driven | `supabase/tests/0022_products.sql` | role-match |
| `supabase/tests/0026_gift_invites.sql` | test (SQL) | request-response | `supabase/tests/0022_products.sql` + `0009`-era token tests | role-match |
| `app/src/modules/cadeaux/*` (tabs + idées + promotion + partage code) | component + hook + api | CRUD + request-response | `app/src/modules/cadeaux/cadeaux-page.tsx` + `api.ts` + `hooks/use-cadeaux.ts` | exact (extend-in-place) |
| `app/src/modules/contacts/*` (ou `cadeaux/contacts/`) | component + hook + api | CRUD | `app/src/modules/anniversaires/*` (api + hook + form dialog) | role-match |
| `app/src/modules/anniversaires/*` (agrégation + checkbox D-10 + fusion) | component | transform (display fusion) | `app/src/modules/anniversaires/anniversaires-page.tsx` (Tabs Liste/Calendrier) + `types.ts` | exact (extend-in-place) |
| shared `nextDate` helper (D-11) | utility | transform | `app/src/modules/anniversaires/types.ts` (`nextBirthdayDate`, lines 32-47) | exact |
| `app/src/lib/data/supabase-adapter.ts` (HOUSEHOLD_SCOPED) | config | CRUD | same file, lines 11-40 (`products` precedent from 0071) | exact |

## Pattern Assignments

### `supabase/migrations/0076_gift_ideas.sql` (migration, CRUD)

**Analog:** `supabase/migrations/0071_products.sql`

**Table shape pattern** (0071 lines 20-42) — copy verbatim, change nouns:
```sql
create table public.products (
  id text primary key default private.new_id('product'),
  household_id text not null references public.households (id) on delete cascade,
  ...
  created_by text references public.household_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_ean_per_household unique (household_id, ean)
);
comment on table public.products is '...';
create index products_household_ean_idx on public.products (household_id, ean);
alter table public.products enable row level security;
```
New table `gift_ideas`: same `id`/`household_id`/`created_at`/`updated_at` skeleton.
Columns: `name` (1–200 check like 0071 line 24), `price numeric >= 0`, `url`, `comment`,
`photo_url`, `status check in ('a_offrir','offert') default 'a_offrir'` (OQ-3 lock),
`giftee_text text`, `giftee_contact_id text references contacts(id) on delete set null`,
`gift_item_id`-side link lives on `gift_items.idea_id` (`nullable FK → gift_ideas ON DELETE SET NULL`).
Also: `alter table public.gift_items add column idea_id text references public.gift_ideas (id) on delete set null;`

**Updated-at trigger pattern** (0071 lines 52-54):
```sql
drop trigger if exists set_updated_at on public.products;
create trigger set_updated_at before update on public.products
  for each row execute function private.touch_updated_at();
```

**Member guard pattern** (0071 lines 61-63) — register new member columns in the 0008 loop style:
```sql
drop trigger if exists validate_member_refs on public.products;
create trigger validate_member_refs before insert or update on public.products
  for each row execute function private.validate_member_refs('created_by');
```
The `validate_member_refs()` function itself takes variadic columns
(`supabase/migrations/0008_triggers.sql` lines 212-235) — no function change, only new
`CREATE TRIGGER` registrations for `gift_ideas` (and `contacts.linked_member_id`, `contact_lists.owner_member_id`).

**Foyer-plat RLS pattern** (0071 lines 68-89) — four policies, never edit 0007 (0071 precedent):
```sql
create policy products_select_household on public.products
  for select using (private.is_household_member(household_id));
create policy products_insert_household on public.products
  for insert with check (
    private.can_write_household(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
  );
-- update: same USING + WITH CHECK; delete: private.is_household_admin(household_id)
```
Writes admin/membre, delete admin. SELECT for `gift_ideas` adds the D-08 surprise branch via a
new `private.can_read_gift_idea(text)` helper shaped exactly like
`private.can_read_gift_list` (`0075_gift_read_household_scope.sql` lines 17-44), with the extra
`not exists (select 1 from public.contacts c where c.id = i.giftee_contact_id
and c.linked_member_id = private.current_member_id(i.household_id))` clause.

**Realtime publication pattern** (0071 lines 94-107) — guarded `do $$` block:
```sql
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'Publication supabase_realtime absente : Realtime non active sur cette stack.';
    return;
  end if;
  begin
    execute 'alter publication supabase_realtime add table public.products';
  exception when others then
    raise notice 'table products ignoree pour Realtime : %', sqlerrm;
  end;
end;
$$;
```

**Helpers available** (`supabase/migrations/0006_security_helpers.sql`):
`private.is_household_member(text)` line 20, `private.current_member_id(text)` line 51,
`private.is_household_admin(text)` line 67, `private.can_write_household(text)` line 77,
`private.member_in_household(text, text)` line 104, `private.token_hash_matches(text, text)` line 214.
All `SECURITY DEFINER`, `set search_path = ''` — new helpers must repeat that header.

---

### `supabase/migrations/0077_contacts.sql` (migration, CRUD)

**Analog:** `supabase/migrations/0071_products.sql` + `supabase/migrations/0008_triggers.sql` lines 181-259

Same table/trigger/RLS/Realtime skeleton as 0076 above. Specifics:

- `contact_lists(id, household_id, name, owner_member_id NULLABLE, is_default boolean)` —
  `owner NULL` = shared « Famille »; RLS SELECT: shared → `private.is_household_member`,
  perso → owner-is-current-member OR admin; write → `can_write_household` + (perso ⇒ owner or admin); delete → admin.
- `contacts(id, list_id, household_id` dénormalisé, `name, birth_date NULLABLE, photo_url, linked_member_id NULLABLE)`.
- Child-household alignment: extend the loop list at `0008_triggers.sql` lines 186-195
  (forward-only — add a new loop in 0077, do NOT edit 0008):
```sql
-- Analog: 0008_triggers.sql lines 186-195
select * from (values
  ('shopping_list_items', 'shopping_lists', 'list_id'),
  ...
  ('gift_items',          'gift_lists',      'list_id'),
  ...
) as t(child_table, parent_table, parent_column)
-- New row for this phase: ('contacts','contact_lists','list_id')
```
- Member-ref guard: register `linked_member_id` (contacts) and `owner_member_id` (contact_lists)
  following the 0008 lines 242-259 value-list motif (`('gift_lists', array['owner_member_id'])` etc.).
- Defaults: `ensure_default_contact_list()` trigger + one-shot backfill in the same migration
  (create « Famille » + one perso list per adult member; pre-fill one contact per adult with
  `linked_member_id`, children excluded via `role in ('admin','membre')` — same predicate as the
  ardoise seed in `0058_ardoise_settlement_rpc.sql` lines 321-325 area, `create-ardoise` member seeding).
- Default-list guard trigger: forbid deleting the last default list of a household.

---

### `supabase/migrations/0078_birthday_mirror.sql` (migration, event-driven trigger)

**Analog:** `supabase/migrations/0008_triggers.sql` (trigger-function shape) + FK `ON DELETE CASCADE` motif from `0071`/`0043`

- `alter table public.birthdays add column contact_id text unique` (partial uniqueness: one mirror per
  contact, manual birthdays keep NULL) + `references public.contacts (id) on delete cascade` (D-14).
- Mirror trigger `AFTER INSERT OR UPDATE OF birth_date … WHEN (NEW.birth_date IS NOT NULL)`:
  inserts mirror row (`name, birth_date, photo_url, household_id, contact_id`) **unless** a
  same-household birthday with normalized-equal name + equal date already exists (dedup guard —
  prevents the D-10 « créer aussi un contact » double-mirror).
- No backfill of pre-existing birthdays (D-03). No cron change — `dispatch_birthday_alerts()` reads
  `birthdays` and picks up mirrors automatically.
- Cascade delete: contact deletion removes its mirror via the FK; UI side uses `ConfirmDialog`
  (see Shared Patterns).

---

### `supabase/migrations/0079_gift_invites.sql` (migration + RPC, request-response)

**Analog:** `supabase/migrations/0058_ardoise_settlement_rpc.sql` lines 332-441 + `supabase/migrations/0009_grants.sql` lines 24-35

**RPC shape pattern** (0058 lines 332-398) — clone, change nouns + manage rule + defaults:
```sql
create or replace function public.create_ardoise_invite(
  p_actor_id uuid,
  p_ardoise_id text,
  p_invite_hash text,
  p_expires_at timestamptz default null,
  p_max_uses integer default 10
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_household_id text;
  v_member_id text;
  v_role text;
begin
  if p_actor_id is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  ...
  if p_invite_hash is null or p_invite_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'empreinte d''invitation invalide' using errcode = '22023';
  end if;
  if p_max_uses is null or p_max_uses < 1 or p_max_uses > 100 then
    raise exception 'nombre d''utilisations invalide' using errcode = '22023';
  end if;
  if p_expires_at is not null and (p_expires_at <= now() or p_expires_at > now() + interval '90 days') then
    raise exception 'expiration invalide' using errcode = '22023';
  end if;
  -- Régénérer désactive immédiatement le précédent (un seul code actif).
  ...
```
Adaptations for gifts: table `gift_list_invites(list_id, token_hash UNIQUE 64-hex, created_by,
expires_at, max_uses, use_count, is_active)`; manage = **owner OR household admin**
(not creator/admin-of-ardoise); defaults `expires_at = now()+90d`, `max_uses = 20`
(D-15 — differs from ardoise default 10); regen deactivates previous (`FOR UPDATE` lock +
`private.token_hash_matches`, single oracle message « code invalide »).
Redeem (member path) inserts `gift_list_shares(list_id, shared_with_member_id,
permission='reservation')` **in the same transaction** (D-17); idempotent for already-shared
members (no `use_count` burn — mirrors `0006_security_helpers.sql` household redeem idempotence).
Four RPCs: `create_gift_list_invite / revoke_gift_list_invite / gift_list_invite_summary /
redeem_gift_list_invite`, each `SECURITY DEFINER`, `set search_path = ''`.

**No-policy lockdown pattern** (`0009_grants.sql` lines 25-30):
```sql
revoke all on table public.household_invite_tokens from anon, authenticated;
grant all on table public.household_invite_tokens to service_role;
-- Aucune politique n'existe sur cette table : on verrouille aussi les GRANT.
revoke all on table public.household_invite_tokens from public;
```
Apply to `gift_list_invites`. RPC grants follow 0009 lines 78-86:
```sql
revoke all on function public.create_household_invite_token(uuid, text, text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.create_household_invite_token(uuid, text, text, timestamptz, integer) to service_role;
```
Same for the four gift RPCs (revoke from public/anon/authenticated, grant to service_role).

---

### `supabase/migrations/0080_gift_items_mask.sql` (migration view, transform)

**Analog:** `supabase/migrations/0075_gift_read_household_scope.sql` (full file, 49 lines)

Copy the helper-function shape (lines 17-44): `create or replace function … returns boolean
language sql stable security definer set search_path = ''` with `comment on function`.
This migration creates the `SECURITY INVOKER` view `gift_items_for_list` masking `reserved_by`
(`CASE WHEN owner → NULL ELSE reserved_by END`) — RLS cannot filter columns, so the view is the
established pattern. Also wires `visibility = 'partagee'` to code-shared lists (enum value exists
in DB + TS `GiftVisibility` in `app/src/modules/cadeaux/types.ts` lines 3-10 but never proposed in UI).

---

### `supabase/functions/gift-list-invite/index.ts` (edge function, request-response)

**Analog:** `supabase/functions/ardoise-invite/index.ts` (696 lines)

Clone the file, reduce to actions `create/revoke/summary/redeem` with `auth: ['user']` only
(no publishable — OQ-1: externals sign up with the invited email, share activates via the
existing `can_read_gift_list` email branch, 0075 lines 34-39).

**Imports pattern** (lines 41-45):
```ts
import { withSupabase } from '@supabase/server';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@4.6.5';
```

**Response + error pattern** (lines 47-76):
```ts
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-ardoise-guest',
  'access-control-allow-methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...CORS_HEADERS } });
}
class ArdoiseInviteError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
```

**Crypto pattern** (lines 187-222) — reuse verbatim:
```ts
function generateCode(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// → 24 bytes → 32 base64url chars (≥ 128 bits)

async function hmacSha256Hex(code: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(code));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
```

**Rate-limit pattern** (lines 228-259): in-memory `Map` per `action:clientAddress`, 60 s window,
per-action LIMITS table, `MAX_TRACKED_CLIENTS = 5_000` with expired-entry eviction, 429 message
`'Trop de tentatives. Patientez une minute avant de réessayer.'`.

**Oracle-safe error translation** (lines 269-293):
```ts
function translateRpcError(error: { code?: string; message: string }): ArdoiseInviteError {
  // Même message que le hash soit inconnu, expiré, épuisé ou révoqué
  if (message.includes('code invalide')) return new ArdoiseInviteError(404, 'Ce code est invalide.');
  ...
}
```

**Secret check** (lines 295-301) — clone with new name, fail closed:
```ts
function checkSecret(): string {
  const secret = env('ARDOISE_HMAC_SECRET');
  if (secret.length < 32) {
    throw new ArdoiseInviteError(500, 'ARDOISE_HMAC_SECRET doit faire au moins 256 bits.');
  }
  return secret;
}
// → GIFT_LIST_INVITE_HMAC_SECRET (dedicated Vault secret, ≥256 bits, never reused)
```

**Entry-point shape** (lines 647-696):
```ts
Deno.serve(
  withSupabase({ auth: ['user', 'publishable'] }, async (request, ctx) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
    try {
      if (request.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);
      const body = await parseBody(request);
      enforceRateLimit(request, body.action);
      const userId = ctx.userClaims?.id;
      const isUser = ctx.authMode === 'user' && Boolean(userId);
      const admin = ctx.supabaseAdmin;
      ...
      if (!isUser || !userId) return json({ error: 'Connectez-vous pour rejoindre une ardoise.' }, 401);
      if (body.action === 'create') return await handleCreate(admin, userId, body);
      ...
    } catch (error) {
      if (error instanceof ArdoiseInviteError) return json({ error: error.message }, error.status);
      console.error('ardoise-invite: erreur inattendue', { message: ... });
      return json({ error: 'Opération impossible.' }, 500);
    }
  }),
);
```
Gift adaptation: `withSupabase({ auth: ['user'] })`, drop `redeem-guest`/`guest-view`/`link-view`
branches, Zod `requestSchema` as `discriminatedUnion('action', …)` (lines 96-120) with
`ardoiseField = z.string().trim().min(1).max(128)` and `isoInstant` datetime transform.
Auto-deployed by `scripts/deploy-functions.sh` (scans for `index.ts`).

**Client call pattern** (`app/src/modules/ardoise/api.ts` lines 222-240):
```ts
async function callArdoiseInvite<T>(action: string, body: Record<string, unknown>): Promise<T> {
  if (!supabaseFunctionsBase) throw new Error('Edge Function indisponible.');
  const { data: authData } = await supabase!.auth.getSession();
  const session = authData.session;
  const response = await fetch(`${supabaseFunctionsBase}/ardoise-invite`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
      ...(session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ action, ...body }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error((detail as { error?: string } | null)?.error ?? 'Partage impossible.');
  }
  return (await response.json()) as T;
}
```
Gift adaptation: `callGiftInvite<T>(action, body)` → `/gift-list-invite`, same headers/error surfacing.
Ticket storage (`readGuestTicket`/`writeGuestTicket`/`clearGuestTicket`, api.ts lines 36-62,
`localStorage eo:ardoise:ticket:<id>`) does NOT apply — gifts are member/email shares, no guest tickets.

---

### `supabase/tests/0024_gift_ideas.sql`, `0025_contacts_mirror.sql`, `0026_gift_invites.sql` (tests, SQL)

**Analog:** `supabase/tests/0022_products.sql`

**Fixture pattern** (0022 lines 9-48) — Alice/Bob/Noé (foyer A) vs Carol/Dave (foyer B):
```sql
begin;
do $$
declare
  alice uuid := testkit.auth_user('alice@example.fr', 'Alice Martin');
  bob uuid := testkit.auth_user('bob@example.fr', 'Bob Martin');
  kid uuid := testkit.auth_user('enfant@example.fr', 'Noe Martin');
  carol uuid := testkit.auth_user('carol@example.fr', 'Carol Durand');
  home_a text := testkit.household(alice, 'Foyer A');
  home_b text := testkit.household(carol, 'Foyer B');
  alice_m text := testkit.member(home_a, alice, 'Alice Martin', 'admin', 'accent');
  bob_m text := testkit.member(home_a, bob, 'Bob Martin', 'membre', 'ink');
  kid_m text := testkit.member(home_a, kid, 'Noe Martin', 'enfant', 'amber');
  carol_m text := testkit.member(home_b, carol, 'Carol Durand', 'admin', 'coral');
  ...
begin
  insert into public.shopping_lists (id, household_id, name, created_by)
  values (list_a, home_a, 'Fresque', alice_m);
  ...
  insert into testkit.fx (key, user_id, household_id, row_id) values
    ('alice', alice, home_a, alice_m),
    ...
end;
$$;
```
Fixture helpers: `testkit.auth_user / household / member` (`supabase/tests/_setup.sql` lines 165/220/235).

**Assertion pattern** (0022 lines 60-80) — role switch + bounded counts + denial checks:
```sql
select testkit.as_user(user_id, 'alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;
select testkit.eq(testkit.count('select 1 from public.products'), 1::bigint,
  'Alice voit le produit de son foyer');
select testkit.expect_denied(format(
  'insert into public.products (id, household_id, ean, name) values (%L, %L, %L, %L)',
  'prod_x', (select household_id from testkit.fx where key = 'carol'), '3017620422003', 'Intrus'),
  'impossible de creer un produit dans un autre foyer');
```
Per-file coverage: 0024 → RLS foyer + surprise D-08 + offert propagation D-06 + enfant/inter-foyer;
0025 → defaults D-01, pre-fill D-02, mirror-only-new D-03 + dedup guard, cascade D-14, défaut
non supprimable; 0026 → table invisible client, bounds D-15 (≤90j, 1–100), redeem atomicity D-17,
oracle single message, service_role-only EXECUTE.
Rules: count in `authenticated` role may rely on RLS; in `postgres` role bound per foyer manually;
`testkit.eq` requires same-type args; `testkit.count()` runs in a separate function (no caller vars).

---

### `app/src/modules/cadeaux/*` — tabs + idées + promotion + partage code (extend in place)

**Analog:** self — `app/src/modules/cadeaux/cadeaux-page.tsx` (442 lines), `api.ts`, `hooks/use-cadeaux.ts`, `types.ts`

**Page shell pattern** (cadeaux-page.tsx lines 1-49): `ModuleShell` + `MetricRow` + `SectionHeading`
+ `EmptyState`/`ErrorState`/`LoadingRows` + `ConfirmDialog` for every destructive action
(lines 419-439) + `useToast` feedback. New tabs Listes/Idées/Contacts reuse the Radix `Tabs`
wrapper from `app/src/components/ui/primitives.tsx` (lines 37-61: `Tabs`, `TabsList`,
`TabsTrigger`, `TabsContent` re-exporting `@radix-ui/react-tabs`) — usage shape in
`app/src/modules/anniversaires/anniversaires-page.tsx` lines 86-91:
```tsx
<Tabs value={tab} onValueChange={setTab}>
  <TabsList aria-label="Choisir la vue des anniversaires">
    <TabsTrigger value="liste">Liste</TabsTrigger>
    <TabsTrigger value="calendrier">Calendrier</TabsTrigger>
  </TabsList>
  <TabsContent value="liste">…</TabsContent>
```
(No new dependency: `@radix-ui/react-tabs` 1.1.21 already locked.)

**INSERT-without-RETURNING pattern** (`app/src/modules/cadeaux/api.ts` lines 55-82) — mandatory for
gift tables (0028/0032 MVCC cause):
```ts
export async function createGiftList(householdId: string, ownerMemberId: string, input: NewGiftListInput): Promise<GiftListRow> {
  // INSERT…RETURNING est refusé sur gift_lists : sa politique SELECT relit la
  // ligne par son id, invisible dans la même commande (MVCC). On insère donc
  // sans représentation, puis on relit la ligne commise (voir 0028/0032).
  if (isSupabaseConfigured && supabase) {
    const id = randomId('gift_lists');
    const { error } = await supabase.from('gift_lists').insert({ id, ... });
    if (error) throw new Error(error.message);
    const rows = await data.list<GiftListRow>('gift_lists', { id });
    const row = rows[0];
    if (!row) throw new Error('Liste introuvable après création.');
    return row;
  }
  return data.create<GiftListRow>('gift_lists', { ... });
}
```
Apply to `gift_ideas` / `contacts` / `contact_lists` creates.

**Snapshot + client-side visibility filter** (`hooks/use-cadeaux.ts` lines 19-68):
`fetchCadeauxSnapshot` (`api.ts` lines 19-27, `Promise.all` of `data.list` per table) +
`useQuery({ queryKey: cadeauxKeys.snapshot(householdId), enabled: Boolean(householdId) })` +
`visibleListIds` memo filtering `row.visibility !== 'privee' || owner` — extend with ideas/contacts
fetches. **Security note:** this filter is UX-only; the real D-08 gate is the RLS helper.

**Share-sync pattern** (`api.ts` lines 104-129 `syncGiftListShares` + `GiftShareDialog`):
diff existing→next (match by member-or-email, update permission in place, create new, delete
removed). Gift invite-code panel replicates the ardoise share panel UX
(`ardoise-detail-page.tsx` lines 541-680): `inviteLink(code)` =
`` `${window.location.origin}/invitation/cadeau?code=${encodeURIComponent(code)}` `` (gift route),
`copyCode` → clipboard + `'Code copié.'`, `shareCode` → `navigator.share({title, text})` fallback
clipboard lien + `'Lien copié.'`, states Générer/Régénérer + `lastCode` shown once (mono) +
`'Code actif créé ailleurs : régénérez pour l'afficher sur cet appareil.'` +
`'Arrêter le partage'` → revoke + `'Partage arrêté : le code ne passe plus.'`
Extend (don't rewrite) `GiftShareDialog` (`gift-share-dialog.tsx` lines 13-24: RHF + Zod schema
with `members` checkboxes + per-member permission `Select` + optional `email` field) for the
member/email redeem selection (D-16/D-17).

**Form dialog pattern** (`gift-form-dialog.tsx` lines 79-124): RHF + `zodResolver`, `reset()` on open
via `useEffect([open, …])`, `onSubmit` mapping `'' → null`, `roundPrice`, photo via `readPhoto`
(`createImageBitmap` + canvas, WebP else JPEG, lines 36-53). Contact/idea dialogs copy this;
contact photos go through `depositHouseholdFile({ householdId, folder: 'contacts', file })`
(`app/src/lib/storage.ts` lines 63-100) → path `<householdId>/contacts/<id>.<ext>`, ideas via
folder `cadeaux`. **Do not** persist hotlinks (0071 line 28-29 precedent).

**Vitest pattern** (`cadeaux-page.test.tsx` lines 1-28): `renderWithProviders(<CadeauxPage />,
{ route: '/cadeaux' })`, `userEvent.setup()`, dialog via `screen.findByRole('dialog')` +
`within(dialog)` scoping, `waitFor` for async mutation toasts/state.

---

### `app/src/modules/contacts/*` (ou `cadeaux/contacts/`) — new module (component, CRUD)

**Analog:** `app/src/modules/anniversaires/*` (`api.ts` 32 lines, `hooks/use-anniversaires.ts` 65 lines, `components/birthday-form-dialog.tsx` 146 lines)

**API pattern** (`anniversaires/api.ts` lines 1-32):
```ts
import { data } from '@/lib/data';
const BIRTHDAYS = 'birthdays';
const emptyToNull = (value: string) => { const trimmed = value.trim(); return trimmed === '' ? null : trimmed; };
function toRowValues(input: BirthdayFormValues, householdId: string) { return { household_id: householdId, ... }; }
export async function createBirthday(input, householdId) { return data.create<BirthdayRow>(BIRTHDAYS, toRowValues(input, householdId)); }
export async function updateBirthday(id, input, householdId) { return data.update<BirthdayRow>(BIRTHDAYS, id, toRowValues(input, householdId)); }
export async function deleteBirthday(id: string) { await data.remove(BIRTHDAYS, id); }
```
New `contacts/api.ts`: same `data.create/update/remove` + `emptyToNull` shape for
`contact_lists` + `contacts` (with the insert-then-re-read workaround from cadeaux `api.ts`
if the SELECT policy hides the row in-command — planner must verify per table).

**Hook pattern** (`use-anniversaires.ts` lines 25-65): `useResource<Row>(table)` + `useMutation` +
`useQueryClient` invalidation via `invalidateTables(queryClient, ['birthdays'])` (imported from
`@/modules/calendrier/hooks/use-calendrier`) + `data.subscribe('birthdays', refresh)` in `useEffect`
+ `toBirthday(row, members)` memo enrichment sorted by `daysUntil`. New `use-contacts`:
same, enriched with `nextBirthdayDate(contact.birth_date)` + duplicate-warning key.

**Form dialog pattern** (`birthday-form-dialog.tsx` lines 13-35 + 75-83): Zod schema with
`parseFrDate` refine (`JJ/MM/AAAA`, lines 85-97 of `anniversaires/types.ts`), `defaultValues(row)`
reset on open, submit converting display → ISO:
```ts
const birthdaySchema = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire.'),
  birthDate: z.string().trim().min(1, ...).refine((value) => parseFrDate(value) !== null, '...JJ/MM/AAAA.'),
  linkedMemberId: z.string(),
  photoUrl: z.string().trim().refine((value) => value === '' || /^(\/|https?:\/\/)/.test(value), ...),
});
...
onSubmit={handleSubmit(async (values) => { const iso = parseFrDate(values.birthDate); if (!iso) return; await onSubmit({ ...values, birthDate: iso }); })}
```
Contact dialog copies this + duplicate warning (D-04): same normalized `nom + date` key as the
D-12 fusion (warning only, submit allowed).

---

### `app/src/modules/anniversaires/*` — aggregation + checkbox D-10 + fusion badge (extend in place)

**Analog:** self — `anniversaires-page.tsx`, `anniversaires/types.ts`, `use-anniversaires.ts`

- Aggregation (D-09): extend `use-anniversaires` to also fetch dated `contacts`; each birthday
  LEFT JOINs its mirror contact via `contact_id`; mirror pairs → single row; independent
  birthday+contact sharing the fusion key → « deux sources » badge.
- Fusion key (D-12): `normalize(name) + MM-DD` where normalize = trim + lowercase + NFC +
  collapse whitespace (client-side util; existing `monthDayKey = (iso) => iso.slice(5)` at
  `types.ts` line 107 is the MM-DD half).
- Photo priority (D-13): `contact.photo_url ?? birthday.photo_url`.
- Checkbox D-10: add « créer aussi un contact » (default-on) to `BirthdayFormDialog`; the
  server-side dedup guard (0078) prevents the double-mirror.
- Countdown (D-11): `birthdayCountdown` (`types.ts` lines 71-75) + `toBirthday` enrichment
  (lines 49-66) already the pattern; countdowns switch to the shared helper (next section).

---

### Shared `nextDate` helper (D-11) (utility, transform)

**Analog:** `app/src/modules/anniversaires/types.ts` lines 32-47 — adopt, do not duplicate:
```ts
/** Gestion du 29 février : on retombe sur le dernier jour du mois. */
function clampDay(year: number, month: number, day: number) {
  return Math.min(day, getDaysInMonth(new Date(year, month, 1)));
}

export function nextBirthdayDate(birthDate: string, from = todayIso()): string {
  const source = toLocalDate(birthDate);
  const reference = toLocalDate(from);
  const month = source.getMonth();
  const day = source.getDate();
  const thisYear = clampDay(reference.getFullYear(), month, day);
  const candidate = new Date(reference.getFullYear(), month, thisYear);
  if (toIsoDate(candidate) >= from) return toIsoDate(candidate);
  const nextYear = reference.getFullYear() + 1;
  return toIsoDate(new Date(nextYear, month, clampDay(nextYear, month, day)));
}
```
This replaces `nextAnniversary` in `app/src/modules/cadeaux/types.ts` lines 74-81, which returns
**null for Feb-29 in non-leap years** (string-built `YYYY-02-29` fails `new Date()` validation →
birthday silently dropped from `findNextOccasion`, lines 88-94). Server reference stays
`private.next_birthday_date(date,date)` (SQL, immutable). Add Feb-29 Vitest vector mirroring the
0006_birthdays.sql cases. Verify `todayIso()` Europe/Paris consistency in `app/src/lib/utils.ts`
(assumption A1 — planner adds a verification task).

---

### `app/src/lib/data/supabase-adapter.ts` — HOUSEHOLD_SCOPED extension (config)

**Analog:** same file, lines 11-40:
```ts
/** Tables dont l'accès passe par la colonne `household_id`. */
const HOUSEHOLD_SCOPED = new Set([
  ...
  'gift_lists',
  'gift_items',
  'gift_list_shares',
  'birthdays',
  ...
]);
```
Add `gift_ideas`, `contact_lists`, `contacts`, `gift_list_invites` (if client-readable at all —
`gift_list_invites` has no policies, so likely excluded like `household_invite_tokens`; planner
verifies against the 0071 `products` precedent which added its table here). Also extend row types
in `database.ts` (assumption A4) and check the `supabase_realtime` publication loop (assumption A3).

## Shared Patterns

### Authentication / Row-Level isolation
**Source:** `supabase/migrations/0006_security_helpers.sql` (helpers) + `0007`-style foyer-plat policies (see 0071 lines 68-89)
**Apply to:** all 0076–0079 migrations, all new client reads
- Every multi-foyer table: RLS enabled + explicit SELECT/INSERT/UPDATE/DELETE policies.
- Child tables derive foyer from parent (`align_child_household` loop) or carry justified +
  constrained denormalized `household_id`.
- `SECURITY DEFINER`, `set search_path = ''` on every helper; unqualified names forbidden
  (static check §B). Tables referenced as `public.<table>` under empty search_path.
- No self-admin: invite RPCs never grant `admin`; gift manage = owner OR household admin.
- Client writes never spoof another member (`created_by = current_member_id` check in WITH CHECK).

### Error Handling
**Source:** `supabase/functions/ardoise-invite/index.ts` lines 68-76 + 269-293 + `app/src/modules/ardoise/api.ts` lines 235-239
**Apply to:** `gift-list-invite` Edge + `callGiftInvite` client + all cadeaux/contacts UI handlers
- Edge: single oracle message (`'Ce code est invalide.'` 404 for unknown/expired/exhausted/revoked);
  unexpected → `console.error` + 500 `'Opération impossible.'`.
- Client: `if (!response.ok) { const detail = await response.json().catch(() => null);
  throw new Error(detail?.error ?? 'Partage impossible.'); }`.
- UI: `try { await mutate } catch (e) { toast(e instanceof Error ? e.message : '…impossible.', 'error'); }`
  (cadeaux-page.tsx `handleSubmitItem`/`handleDeleteItem`/`handleShare` pattern).

### Validation
**Source:** Edge Zod `discriminatedUnion` (`ardoise-invite/index.ts` lines 96-120) + dialog Zod schemas
(`gift-form-dialog.tsx` lines 14-20, `birthday-form-dialog.tsx` lines 13-25) + SQL CHECKs (0071 lines 23-24)
**Apply to:** Edge `requestSchema` (code base64url ≥22 chars, displayName 1–120, `maxUses` 1–100,
`expiresAt ≤ now()+90d`), contact/idea dialogs (RHF + `@hookform/resolvers/zod`), SQL CHECKs
(name lengths, price ≥ 0, status enum, token hash `^[0-9a-f]{64}$`).
- OQ-3 lock before writing schemas: `status in ('a_offrir','offert')` — client/server agree byte-for-byte.

### Destructive Actions
**Source:** `app/src/modules/cadeaux/cadeaux-page.tsx` lines 419-439 (`ConfirmDialog`)
**Apply to:** contact delete, mirror-cascade delete (D-14), list delete, invite revoke
- Never silent, never `window.confirm`: `ConfirmDialog` with explicit title/description/confirmLabel.

### Photos / Storage
**Source:** `app/src/lib/storage.ts` lines 63-100 (`depositHouseholdFile`) + `removeHouseholdFile` lines 107-111
**Apply to:** contact photos (`folder: 'contacts'` → `<householdId>/contacts/…`), idea photos (`folder: 'cadeaux'`)
- Browser-compress (WebP/JPEG), private `household-media` bucket, signed URLs; compensate failed
  writes with `removeHouseholdFile` (no bucket orphans).

### QR Display
**Source:** `app/src/components/shared/qr-code.tsx` lines 15-47 (`QrCode`, `qrcode` → SVG, pulse fallback)
**Apply to:** gift invite-code/link rendering — reuse the component, no new renderer.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| — | — | — | Full coverage: every new file mirrors a production-proven in-repo precedent (80% mirroring per RESEARCH §Don't Hand-Roll). The only deliberate shape deviations are: manage = owner\|admin (vs creator/admin-of-ardoise), defaults 90j/20 (vs ardoise 10), Edge user-only (no publishable guest path — see OQ-1). |

## Metadata

**Analog search scope:** `app/src/modules/{cadeaux,anniversaires,ardoise}/`, `app/src/{lib,components/shared,components/ui}/`,
`supabase/{migrations,functions/ardoise-invite,tests}/`
**Files scanned:** ~30 (8 read fully, 6 read in targeted ranges, greps for helper/Tabs/fixture registries)
**Git-tracked verification:** all 24 cited analog paths confirmed via `git ls-files` (non-empty output)
**Most recent precedent commits:** `699ddaa` (anniversaires JJ/MM/AAAA), `da040c0` (cadeaux insert-sans-représentation 0028/0032)
**Pattern extraction date:** 2026-10-05
