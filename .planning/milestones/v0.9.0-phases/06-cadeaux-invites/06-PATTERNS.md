# Phase 06: Cadeaux invites - Pattern Map

**Mapped:** 2026-10-06
**Files analyzed:** 10 new/modified
**Analogs found:** 9 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/functions/gift-list-invite/index.ts` (extend: `send-email`, `guest-view`, `guest-reserve`) | edge function | request-response | `supabase/functions/ardoise-invite/index.ts` (per-action publishable gate + `redeem-guest`/`guest-view`/`link-view`) | exact |
| `supabase/migrations/0089_gift_guest_reserve.sql` (new: `reserved_by_name` + RPCs + view + guard) | migration | CRUD | `supabase/migrations/0079_gift_invites.sql` + `0082_gift_redeem_upgrade.sql` (RPC shape) + `0083_gift_reserve_update.sql` (guard) | exact |
| `supabase/migrations/0080_gift_items_mask.sql` (extend view via `CREATE OR REPLACE VIEW`) | migration | transform | itself `supabase/migrations/0080_gift_items_mask.sql` | exact |
| `supabase/tests/0027_gift_guest.sql` (new) | test | batch | `supabase/tests/0026_gift_invites.sql` | exact |
| `app/src/modules/cadeaux/api.ts` (extend: publishable call + guest helpers) | service/api | request-response | `app/src/modules/ardoise/api.ts` (`callArdoiseInvite` + `redeemGuestTicket` + `fetchGuestLinkView` + `read/writeGuestTicket`) | exact |
| `app/src/modules/cadeaux/components/gift-share-dialog.tsx` (extend: message + Envoyer) | component | request-response | itself (GiftCodePanel pattern) | exact |
| `app/src/modules/cadeaux/guest-cadeau-page.tsx` (extend: name + reserve w/o account) | component | request-response | `app/src/modules/ardoise/*` guest flow (ticket-less `link-view` analog) + itself | role-match |
| `supabase-project/docker-compose.traefik.yml` + `.env` runbook (add `SMTP_*` to `functions.environment`) | config | N/A | itself lines 65-102 (HMAC/VAPID `:-` pattern) | exact |
| `scripts/test-gift-mail.sh` (new, Inbucket proof) | test/script | request-response | `scripts/deploy-functions.sh` (script conventions) + `scripts/test-dispatch-push.sh` (attributable style, per AGENTS.md §2.7) | role-match |
| Email template helper (new, Vitest-testable pure function) | utility | transform | inline string building in Edge handlers (no existing helper — shape from RESEARCH §Code Examples) | no-analog (use RESEARCH.md) |
| `app/e2e/cadeaux-contacts.spec.ts` (extend: guest name+reserve) | test | request-response | itself (83 lines, demo-session pattern) | exact |

## Pattern Assignments

### `supabase/functions/gift-list-invite/index.ts` (edge function, request-response)

**Analog:** `supabase/functions/ardoise-invite/index.ts` — the ONLY in-repo example of a per-action publishable gate coexisting with user-only actions on the same invite function. `gift-list-invite` itself (lines 388-425) is the base to edit; ardoise-invite lines 647-686 is the gate shape to copy.

**Imports pattern** — copy verbatim, add one line (`supabase/functions/gift-list-invite/index.ts` lines 62-66; same in ardoise-invite lines 43-45):

```typescript
import { withSupabase } from '@supabase/server';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@4.6.5';
// NEW (exact pin at write time, no ^ — AGENTS.md §2.1; RESEARCH says re-check `npm view nodemailer version`):
import nodemailer from 'npm:nodemailer@10.0.15';
```

**Per-action gate pattern** — replace the blanket user-only guard (`gift-list-invite/index.ts` lines 402-408) with the ardoise per-action dispatch (`supabase/functions/ardoise-invite/index.ts` lines 658-686):

```typescript
// Source: supabase/functions/ardoise-invite/index.ts:658-679
const body = await parseBody(request);
enforceRateLimit(request, body.action);

const userId = ctx.userClaims?.id;
const isUser = ctx.authMode === 'user' && Boolean(userId);
const admin = ctx.supabaseAdmin;

// Guest actions FIRST, no session, no code validation elsewhere:
if (body.action === 'guest-view') {
  return await handleGuestView(admin, body);
}
if (body.action === 'guest-reserve') {
  return await handleGuestReserve(admin, body);
}
// send-email stays user-only like create/revoke/summary/redeem:
if (!isUser || !userId) {
  return json({ error: 'Connectez-vous pour partager une liste de cadeaux.' }, 401);
}
if (body.action === 'send-email') return await handleSendEmail(admin, userId, body);
```

Note: `withSupabase({ auth: ['user', 'publishable'] }, …)` declaration stays UNCHANGED (already present, `gift-list-invite/index.ts:389`). Only the in-handler gate changes.

**Rate-limit pattern** — extend the LIMITS map (`gift-list-invite/index.ts` lines 210-211), copying ardoise's per-action table (`supabase/functions/ardoise-invite/index.ts` line 229):

```typescript
// Source: supabase/functions/ardoise-invite/index.ts:229 (shape) — values per RESEARCH A2 (agent discretion)
const LIMITS: Record<string, number> = {
  redeem: 8, create: 20, revoke: 20, summary: 30,
  'send-email': 5, 'guest-view': 30, 'guest-reserve': 10,
};
```

Copy `enforceRateLimit` + `clientAddress` + `counters`/`MAX_TRACKED_CLIENTS` verbatim (`gift-list-invite/index.ts:210-242`); call `enforceRateLimit(request, body.action)` BEFORE any auth/code work (line 400).

**Oracle-preserving error translation** — extend `translateRpcError`, do not fork it (`gift-list-invite/index.ts:257-283`). New SQL messages must contain `code invalide` so the existing first branch catches them:

```typescript
// Source: supabase/functions/gift-list-invite/index.ts:260-262
if (message.includes('code invalide')) return new GiftListInviteError(404, 'Ce code est invalide.');
// ADD alongside (ardoise shape: supabase/functions/ardoise-invite/index.ts:284-286):
if (message.includes('nom invalide')) {
  return new GiftListInviteError(400, 'Indiquez un nom (1 à 80 caractères).');
}
if (message.includes('article déjà réservé')) {
  return new GiftListInviteError(409, 'Cet article est déjà réservé.');
}
```

**Fail-closed secret pattern** — copy `env()` + `checkSecret` for SMTP (`gift-list-invite/index.ts:101-105, 290-296):

```typescript
// Source: supabase/functions/gift-list-invite/index.ts:290-296
function checkSecret(): string {
  const secret = env('GIFT_LIST_INVITE_HMAC_SECRET');
  if (secret.length < 32) {
    throw new GiftListInviteError(500, 'GIFT_LIST_INVITE_HMAC_SECRET doit faire au moins 256 bits.');
  }
  return secret;
}
// NEW, same shape: SMTP_HOST/SMTP_PORT required → 500 before any send (D-01);
// SMTP_USER/SMTP_PASS required unless dev port 2500 (RESEARCH Pitfall 4).
```

**SMTP transport pattern** — NO in-repo analog (grep for `nodemailer|smtp|sendMail` in `supabase/functions` = zero matches). Use RESEARCH.md §Code Examples (official Supabase `send-email-smtp` example) with the two documented corrections: `secure = port === 465` (never `Boolean(Deno.env.get(...))`), omit `auth` when user is empty:

```typescript
// Source: RESEARCH.md §Code Examples (adapted from official example)
const port = Number(Deno.env.get('SMTP_PORT'));
const user = Deno.env.get('SMTP_USER') || undefined;
const transport = nodemailer.createTransport({
  host: Deno.env.get('SMTP_HOST'),
  port,
  secure: port === 465,
  ...(user ? { auth: { user, pass: Deno.env.get('SMTP_PASS') } } : {}),
});
await transport.sendMail({ from, to, subject, text });
```

**CORS pattern** — keep existing headers (`gift-list-invite/index.ts:73-77`); guest actions use the same `callGiftInvite` fetch shape so no new header is needed (unlike ardoise's `x-ardoise-guest` ticket header — there is NO ticket here, the code IS the credential per D-06/D-09).

---

### `supabase/migrations/0089_gift_guest_reserve.sql` (migration, CRUD)

**Analog:** `supabase/migrations/0079_gift_invites.sql` (RPC skeleton) + `0082_gift_redeem_upgrade.sql` (forward-fix layering) + `0083_gift_reserve_update.sql` (guard trigger).

**File header + transaction pattern** — copy the forward-fix header convention (`supabase/migrations/0082_gift_redeem_upgrade.sql:1-9`, `0083_gift_reserve_update.sql:1-8`): state what it fixes, that 0079/0080/0083 are UNCHANGED, wrap in `begin;` … `commit;`.

**Column + mutual-exclusion CHECK pattern** — new column beside the FK (`supabase/migrations/0004_tables_shared.sql:77`):

```sql
-- Source: supabase/migrations/0004_tables_shared.sql:77
reserved_by text references public.household_members (id) on delete set null,
-- NEW in 0089 (RESEARCH Pitfall 3):
alter table public.gift_items add column reserved_by_name text
  check (reserved_by_name is null or char_length(btrim(reserved_by_name)) between 1 and 80);
alter table public.gift_items add constraint gift_items_single_author_check
  check (not (reserved_by is not null and reserved_by_name is not null));
-- « réservé » = l'une des deux non-NULL ; « libre » = les deux NULL.
```

**RPC skeleton pattern** — copy `redeem_gift_list_invite` structure verbatim (`supabase/migrations/0079_gift_invites.sql:270-308` for validation/lock/oracle, `0082` lines 37-49 for the 0082-upgraded body as the CURRENT effective definition — extend 0082's version, not 0079's):

```sql
-- Source: supabase/migrations/0082_gift_redeem_upgrade.sql:29-49
if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
  raise exception 'code invalide' using errcode = '22023';
end if;
select t.* into v_invite
  from public.gift_list_invites t
 where t.token_hash = p_token_hash
   and private.token_hash_matches(t.token_hash, p_token_hash)
 for update;
if not found then
  raise exception 'code invalide' using errcode = 'P0002';
end if;
if not v_invite.is_active
   or (v_invite.expires_at is not null and v_invite.expires_at <= now())
   or v_invite.use_count >= v_invite.max_uses then
  raise exception 'code invalide' using errcode = 'P0002';
end if;
```

New RPCs (`guest_reserve_gift_item`, and `guest_view_gift_list` if Open Question 3 resolves to RPC — RESEARCH recommends yes): same `security definer set search_path = ''` with `public.`-qualified tables, name check `btrim 1-80 → 'nom invalide' (22023, NON-oracle message), item-belongs-to-invite-list check → `'code invalide'` (no inter-list leak), idempotence branch (same normalized name → `already_reserved:true` without error), conflict branch → `'article déjà réservé' (409)`, `UPDATE gift_items SET reserved_by_name` (service_role bypasses RLS inside SECURITY DEFINER). Do NOT consume `use_count` on reserve (RESEARCH A6, to lock at plan).

**Privilege lockdown pattern** — copy the 0079 footer exactly (`supabase/migrations/0079_gift_invites.sql:383-404`):

```sql
-- Source: supabase/migrations/0079_gift_invites.sql:383-390
revoke all on function public.guest_reserve_gift_item(...) from public, anon, authenticated;
grant execute on function public.guest_reserve_gift_item(...) to service_role;
-- + has_function_privilege assertions in a do $$ block (0079:392-404 shape).
```

**Guard extension pattern** — extend `private.guard_gift_item_reserve()` in place (`supabase/migrations/0083_gift_reserve_update.sql:55-92`): a non-manager authenticated user must NEVER touch `reserved_by_name` (raise 42501 on any `NEW.reserved_by_name IS DISTINCT FROM OLD.reserved_by_name` when `can_write_gift_list` is false — only the service_role RPC writes it; note `guard_author_immutable` in `0081` skips non-`anon`/`authenticated` roles, and service_role bypass follows the same principle). Keep the existing `reserved_by`-self-or-null check (0083:81-88) untouched.

---

### `supabase/migrations/0080_gift_items_mask.sql` extension (migration, transform)

**Analog:** itself — `supabase/migrations/0080_gift_items_mask.sql:26-46`. Extend with `CREATE OR REPLACE VIEW` in the 0089 migration (never rewrite 0080 — AGENTS.md §2.7.A.1, corriger vers l'avant):

```sql
-- Source: supabase/migrations/0080_gift_items_mask.sql:26-46
create or replace view public.gift_items_for_list
with (security_invoker = true) as
select
  i.id, i.list_id, i.household_id, i.name, i.price, i.comment,
  i.photo_url, i.url,
  case
    when l.owner_member_id = private.current_member_id(l.household_id)
    then null
    else i.reserved_by
  end as reserved_by,
  -- NEW: same CASE around reserved_by_name (D-07: owner sees « réservé », never the name)
  case
    when l.owner_member_id = private.current_member_id(l.household_id)
    then null
    else i.reserved_by_name
  end as reserved_by_name,
  i.purchased, i.idea_id, i.created_at
from public.gift_items i
join public.gift_lists l on l.id = i.list_id;
-- Keep: revoke anon / grant authenticated, service_role (0080:53-54).
```

---

### `supabase/tests/0027_gift_guest.sql` (test, batch)

**Analog:** `supabase/tests/0026_gift_invites.sql` — copy file skeleton section by section.

**Fixture pattern** (`0026_gift_invites.sql:19-71`): `testkit.auth_user` + `testkit.household` + `testkit.member` + `testkit.fx` insert; add `testkit.hashes`-style table if new hashes needed (or reuse distinct constants). Keep the `set local role authenticated` + `testkit.as_user` + `testkit.expect_denied`/`testkit.eq`/`testkit.count` idioms:

```sql
-- Source: supabase/tests/0026_gift_invites.sql:76-98 (§1: client sees nothing)
select testkit.as_user(user_id, 'alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;
select testkit.expect_denied('select * from public.gift_list_invites',
  'la table des codes est illisible par un client');
-- NEW §: same for new RPCs — authenticated cannot call guest_reserve/guest_view directly.
reset role;
```

**Oracle proof pattern** — copy the motif-0018 block (`0026_gift_invites.sql:273-326`):

```sql
-- Source: supabase/tests/0026_gift_invites.sql:283-288
begin
  perform public.redeem_gift_list_invite(h4, null, 'autre@exemple.fr');
  perform testkit.ok(false, 'un code epuise aurait du etre refuse');
exception when others then
  perform testkit.ok(sqlerrm like '%code invalide%', 'code epuise refuse sans oracle : ' || sqlerrm);
end;
-- NEW: same for guest_reserve guest_view on unknown/expired/exhausted/revoked codes.
```

**View masking pattern** — copy §7 per-role reads (`0026_gift_invites.sql:328-376`): owner reads via view sees NULL, non-owner sees value, other household sees nothing. NEW: same three reads for a row with `reserved_by_name` set (owner → NULL, non-owner → name visible, cross-household → 0 rows), plus a negative assertion that the guest payload contains no `reserved_by*` keys (Edge-level assertion in Vitest, not SQL).

**Negative moderation proof (D-08)** — new section, same `expect_denied` idiom: non-manager UPDATE on `reserved_by`/`reserved_by_name` raises 42501 (guard), guest-role caller cannot release; manager release succeeds for both member- and anonymous-held reservations.

**File must end with `rollback;`** (`0026_gift_invites.sql:376`) — tests are transactional fixtures, never committed.

---

### `app/src/modules/cadeaux/api.ts` (service/api, request-response)

**Analog:** `app/src/modules/ardoise/api.ts` — `callArdoiseInvite` (lines 236-254) + guest helpers (lines 37-63, 311-335).

**Edge-call pattern** — copy `callGiftInvite` extension from the ardoise shape. Existing `callGiftInvite` (`app/src/modules/cadeaux/api.ts:240-258`) ALWAYS attaches the session token when present; the guest path must work WITHOUT session (publishable + apikey only). Copy ardoise's `callArdoiseInvite` which already builds headers conditionally (`app/src/modules/ardoise/api.ts:236-254`):

```typescript
// Source: app/src/modules/ardoise/api.ts:236-254
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
  // ... error unwrap identical (cadeaux/api.ts:253-256)
}
```

Guest helpers copy ardoise lines 311-335 (`fetchGuestLinkView` + `redeemGuestTicket`); adapt: NO ticket persistence — persist `{ code, declaredName }` in localStorage for prefill only (Pitfall 6), copying the guarded try/catch storage shape (`app/src/modules/ardoise/api.ts:37-63`):

```typescript
// Source: app/src/modules/ardoise/api.ts:37-63 (guarded storage shape)
const guestNameKey = (code: string) => `eo:cadeau:guest-name:${code}`;
export function readGuestName(code: string): string | null {
  try {
    return window.localStorage.getItem(guestNameKey(code));
  } catch {
    return null;
  }
}
```

Client-side code gate stays: `trimmed.length < 22 → throw` (`app/src/modules/cadeaux/api.ts:304-305`, mirrored in ardoise `api.ts:318-319`). `giftInviteLink` (`cadeaux/api.ts:236-238`) is REUSED unchanged for the email link.

---

### `app/src/modules/cadeaux/components/gift-share-dialog.tsx` (component, request-response)

**Analog:** itself — `GiftCodePanel` (`gift-share-dialog.tsx:59-207`). Add inside the panel (agent discretion on exact layout):

- A Zod-validated email field reusing the dialog's `emailPattern` (`line 22: /^[^@\s]+@[^@\s]+\.[^@\s]+$/`) + a `message` field (`z.string().trim().max(500)` — RESEARCH A3, strip `\r\n` at send time in the Edge, not the UI).
- A `sendEmail` handler copying the `generate`/`revoke` promise-chain + toast shape (lines 126-153):

```typescript
// Source: app/src/modules/cadeaux/components/gift-share-dialog.tsx:126-139
const generate = () => {
  setBusy(true);
  createGiftListInviteCode(list.id)
    .then((created) => {
      setLastCode(created.code);
      setCodeError(false);
      return refresh();
    })
    .then(() => toast('Nouveau code généré : l’ancien est invalidé.'))
    .catch((inviteError: unknown) =>
      toast(inviteError instanceof Error ? inviteError.message : 'Code impossible.', 'error'),
    )
    .finally(() => setBusy(false));
};
```

- D-04: sending creates the `lecture` share first via the existing `onSubmit` path (dialog form), THEN calls the Edge `send-email` — reuse `syncGiftListShares` (`api.ts:199-224`), no new share primitive.

---

### `app/src/modules/cadeaux/guest-cadeau-page.tsx` (component, request-response)

**Analog:** itself (code-gate + redeem-query shape, lines 22-53) + ardoise guest localStorage/ticket-less read. Current page REQUIRES a session (lines 87-101: unauthenticated → login prompt). New flow keeps that branch for account holders and ADDS a parallel anonymous branch:

- Code gate stays: `trimmed.length >= 22`, ` Ce lien semble incomplet.` (`guest-cadeau-page.tsx:47-52`), `useQuery` with `enabled: activeCode !== null && …` + `retry: false` (lines 33-38).
- Name field: 1-80 chars (same bound as folders — D-06), prefilled from localStorage (see api.ts pattern above), persisted on successful reserve (cosmetic only — never a credential, RESEARCH Pitfall 6).
- Reserve mutation via the new publishable api helper; `already_reserved:true` → idempotent success (not an error); 409 `déjà réservé` shown distinctly from 404 oracle `Ce code est invalide.` (existing `ErrorState` message line 106 covers the oracle case — reuse it).
- Guest payload renders `{ id, name, price, reserved: boolean }` ONLY — never `reserved_by*` (RESEARCH Pitfall 7 / A4 to confirm at plan).

**Test analog:** `guest-cadeau-page.test.tsx` (88 lines: `mockRedeemFetch` fetch-stub + `renderGuest` route helper + 3 cases, lines 20-37) — extend with: anonymous name→reserve success, invalid-code oracle message, revoked-link retry. **API test analog:** `api.test.ts` (view-masked rows via `vi.mock('@/lib/data')`, lines 5-53; `fetchCadeauxSnapshot` reads `gift_items_for_list` never `gift_items`, lines 60-67).

---

### `supabase-project/docker-compose.traefik.yml` + `.env` (config)

**Analog:** itself, `functions.environment` block (lines 65-102). Add SMTP vars with the `:-` convention (documented lines 86-98 — avoids Compose WARN noise on unrelated commands):

```yaml
# Source: supabase-project/docker-compose.traefik.yml:65-102 (pattern)
SMTP_HOST: ${SMTP_HOST:-}
SMTP_PORT: ${SMTP_PORT:-}
SMTP_USER: ${SMTP_USER:-}
SMTP_PASS: ${SMTP_PASS:-}
SMTP_ADMIN_EMAIL: ${SMTP_ADMIN_EMAIL:-}
SMTP_SENDER_NAME: ${SMTP_SENDER_NAME:-}
```

Runbook (not versioned `.env`): values mirror `GOTRUE_SMTP_*` relay (same host, distinct mapping — RESEARCH Pitfall 5); `sh run.sh recreate functions` after change. Never version `.env` (AGENTS.md §8.4).

---

### `scripts/test-gift-mail.sh` (test/script, request-response)

**Analog:** `scripts/deploy-functions.sh` (POSIX `sh`, `set -eu`, no-pipeline idiom lines 47-55) + `scripts/test-dispatch-push.sh` (attributable dispatch style per AGENTS.md §2.7 — note last `net._http_response` before dispatch). Proof target: dev Inbucket (`supabase-mail:2500`, API `:9000` — RESEARCH §Environment Availability). Script must STATE absence explicitly if Inbucket is unreachable (AGENTS.md §2.7: absence is said, not silenced).

---

### Email template helper (utility, transform)

**No analog** — no template builder exists in repo (RESEARCH: string literals + plain text, no new dependency). Planner uses RESEARCH.md §Code Examples `stripBreaks` + subject/body shape; extract as a pure function unit-tested in Vitest (bornes + `\r\n` injection), independent of the Edge runtime so `npm test` covers it without SMTP.

---

### `app/e2e/cadeaux-contacts.spec.ts` (test, request-response)

**Analog:** itself — `openDemoSession` + dialog-fill pattern (lines 16-35). Extend with guest name+reserve journey (demo/offline-capable path where possible; server-backed assertions stay in `0027` + `test-gift-mail.sh`).

## Shared Patterns

### Authentication (Edge multi-mode gate)

**Source:** `supabase/functions/ardoise-invite/index.ts:647-686` (+ `expense-settlement/index.ts:354-391` for the header-ticket variant)
**Apply to:** extended `gift-list-invite/index.ts` entry point
The gateway accepts `['user', 'publishable']`; the HANDLER decides per action. Guest actions run before the `isUser` check and never validate codes on the 401 path (no oracle). `send-email` + `create/revoke/summary/redeem` require `isUser`.

### Error handling (Edge → UI contract)

**Source:** `supabase/functions/gift-list-invite/index.ts:84-99` (`json()` + `GiftListInviteError{status}`) + `translateRpcError` (257-283) + catch-all 500 (416-423, logs server-side only, generic client message)
**Apply to:** all new Edge actions + new `api.ts` helpers
UI unwrap shape (`app/src/modules/cadeaux/api.ts:253-256`, identical in ardoise `api.ts:249-252`): `response.json().catch(() => null)` → `throw new Error(detail?.error ?? 'Partage impossible.')`. Never leak SQL text to the client.

### Validation (Zod Edge + CHECK SQL mirrors)

**Source:** `supabase/functions/gift-list-invite/index.ts:123-172` (`z.discriminatedUnion('action')`, code `min(22).max(512).regex(base64url)`, email `.email().max(320)`) + `0079` SQL mirrors (`token_hash ~ '^[0-9a-f]{64}$'`, `max_uses 1-100`, expiry ≤ +90j)
**Apply to:** new schemas (`send-email`: email `.email().max(320)`, message `.max(500)`; `guest-reserve`: name `.trim().min(1).max(80)`, code same-as-redeem) + new SQL CHECKs (`reserved_by_name` 1-80 + mutual exclusion). Bounds enforced in BOTH tiers.

### Test idioms (SQL + Vitest)

**Source:** `supabase/tests/0026_gift_invites.sql` (transactional `begin;…rollback;`, `testkit.*` helpers, motif-0018 oracle blocks) + `app/src/modules/cadeaux/api.test.ts` (`vi.mock('@/lib/data')` view-rows) + `guest-cadeau-page.test.tsx` (fetch stub + route helper)
**Apply to:** `0027_gift_guest.sql`, template-helper unit tests, extended guest page tests, extended e2e spec
Per AGENTS.md §2.7: behavioral assertions only (call the RPC, read counts/messages) — never assert on function source text; new test file must FAIL before the migration exists (a test that cannot fail is not a test).

### Deployment (Edge shipping)

**Source:** `scripts/deploy-functions.sh` (copies `supabase/functions/*` → runtime, preserves `main`/`hello`, drops `*.test.ts`, lines 129-146) + `supabase-project/docker-compose.traefik.yml` env mapping
**Apply to:** shipping the extended function + SMTP env rollout (`deploy-functions.sh`, `sh run.sh recreate functions`, real-send proof — never « SQL bon » without execution per AGENTS.md §2.7).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| Email template helper (pure function) | utility | transform | No template builder exists in repo by design (plain-text literals per RESEARCH); planner uses RESEARCH.md §Code Examples `stripBreaks`/subject/body shape |
| `npm:nodemailer` SMTP send inside Deno Edge | library usage | request-response | Zero matches for `nodemailer\|smtp\|sendMail` in `supabase/functions`; planner uses RESEARCH.md official-example adaptation + real-send validation (Inbucket) |

## Metadata

**Analog search scope:** `supabase/functions/*/index.ts`, `supabase/migrations/00*.sql`, `supabase/tests/0026_*`, `app/src/modules/cadeaux/**`, `app/src/modules/ardoise/api.ts`, `app/e2e/cadeaux-contacts.spec.ts`, `supabase-project/docker-compose.traefik.yml`, `scripts/*.sh`
**Files scanned:** ~20 (3 Edge functions read in full, 5 migrations, 1 test file, 4 frontend files, 2 scripts, 2 configs)
**Pattern extraction date:** 2026-10-06
**Tracked-source gate:** all 19 analog paths verified via `git ls-files` (non-empty output for every path; no mirror paths emitted)
