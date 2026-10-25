# Phase 05: Cadeaux/Contacts - Research

**Researched:** 2026-10-05
**Domain:** Supabase/Postgres RLS + Edge Functions (Deno) + React 19 UI — gift ideas, contact lists, list invite codes
**Confidence:** HIGH

## Summary

Phase 05 extends the existing Cadeaux module (gift_lists/gift_items/gift_list_shares + surprise helpers) with three new data domains: `gift_ideas` (foyer-scoped ideas with surprise masking per D-08), `contact_lists`/`contacts` (D-01 shared "Famille" + per-member lists, D-02 adult pre-fill), and `gift_list_invites` (code-based sharing mirroring the ardoise-invite pattern, D-15…D-18). It also wires contacts↔birthdays (mirror trigger + `birthdays.contact_id`, D-03/D-10/D-14) and aggregates both sources in the Anniversaires view (D-09/D-12/D-13) with a shared Europe/Paris date helper (D-11).

The single most important finding: **every pattern this phase needs already exists in-repo and must be mirrored, not reinvented** — the ardoise-invite Edge (HMAC + rate-limit + oracle-safe errors + user/publishable split), the no-policy + service_role-only RPC table (`household_invite_tokens` → `gift_list_invites`), the `align_child_household` / `validate_member_refs` trigger registration loops, the INSERT-without-RETURNING + re-read workaround for gift policies (0028/0032), and the Copier/Partager/Régénérer/Arrêter share panel. The source plan's migration numbers (0047–0051) are **stale** — the repo is at 0075, so new migrations start at **0076**.

**Primary recommendation:** Implement as SQL-first tracer (migrations 0076+ + testkit tests reusing the Alice/Bob/Noé vs Carol/Dave fixture pattern), then a `gift-list-invite` Edge cloned from `ardoise-invite` reduced to user-mode only, then UI tabs reusing `GiftShareDialog`, `qr-code.tsx`, and the ardoise share-panel UX — with no new npm dependencies.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Contacts initiaux**
- **D-01:** Double liste par défaut : une liste « Famille » partagée au foyer + une liste perso par membre.
- **D-02:** Pré-remplissage : membres adultes (admin/membre) liés automatiquement (linked_member) ; enfants exclus, ajout manuel.
- **D-03:** Cohabitation birthdays/contacts : les anniversaires existants ne sont PAS importés ; le trigger de synchro ne couvre que les nouveaux contacts datés. — **Reversibility:** costly — un import ultérieur impose un backfill avec déduplication nom+date sur des données saisies entre-temps.
- **D-04:** Anti-doublons : avertissement UI sur doublon probable (nom + date), aucune contrainte dure (les homonymes réels restent possibles).

**Idées → Listes**
- **D-05:** Promotion explicite : bouton « ajouter à une liste » sur l'idée → crée un gift_item lié ; sinon onglets indépendants.
- **D-06:** Statut « offert » : propagation à l'item lié (marqué acheté/offert).
- **D-07:** « Pour qui » : texte libre (giftee_text) + contact lié optionnel (giftee_contact_id) ; nextOccasion possible si le contact est daté.
- **D-08:** Idées masquées au destinataire (même règle surprise que les listes) : une idée « pour Maya » est invisible de Maya.

**Contacts ↔ Anniversaires**
- **D-09:** Le module Anniversaires agrège birthdays + contacts datés (une seule vue des prochaines dates).
- **D-10:** Création d'un anniversaire : case « créer aussi un contact » cochée par défaut, décochable.
- **D-11:** Helper nextDate partagé Europe/Paris pour idées (nextOccasion) et anniversaires (compte à rebours).
- **D-12:** Fusion d'affichage sur nom normalisé + jour/mois (badge deux sources) ; rappels 06h40 dédupliqués pareil (une alerte par personne).
- **D-13:** Photo contact prioritaire en vue agrégée, repli photo birthday.
- **D-14:** Suppression : cascade vers le miroir avec confirmation modale (jamais silencieuse, comme les suppressions existantes).

**Codes d'invitation**
- **D-15:** Défauts : 90 jours / 20 usages (liste quasi-permanente type Noël ; bornes spec ≤90j, 1-100).
- **D-16:** Rachat : membres cochés par l'owner + externes via lien (email, sans compte).
- **D-17:** Droits rachat : lecture + réservation (pas de réserve aveugle).
- **D-18:** UX partage identique à l'ardoise : Copier / Partager / Régénérer / Arrêter.

### the agent's Discretion

Forme exacte des onglets, libellés des avertissements doublons, détail du badge double-source.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope. (Phase boundary reiterated: pas de messagerie autour des cadeaux, pas d'import de contacts externes, pas de comparateur de prix.)

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| D-01 | Liste « Famille » partagée + liste perso par membre | § Architecture Pattern 2 (ensure_default_contact_list + backfill) |
| D-02 | Pré-remplissage adultes liés, enfants exclus | § Pattern 2; `validate_member_refs` loop; role check `in ('admin','membre')` |
| D-03 | Pas d'import birthdays existants; trigger nouveaux contacts datés seuls | § Pattern 3 (mirror trigger + dedup guard) |
| D-04 | Avertissement doublon UI, sans contrainte dure | § Pattern 5 (normalized name+date warning, no UNIQUE) |
| D-05 | Promotion idée → gift_item lié | § Pattern 1 (`gift_items.idea_id` FK, propose-button) |
| D-06 | Statut offert → item acheté/offert | § Pattern 1 (server trigger `propagate_idea_gifted`) |
| D-07 | giftee_text + giftee_contact_id; nextOccasion si daté | § Pattern 1 (columns); § Pattern 6 (shared nextDate) |
| D-08 | Idée invisible du destinataire | § Pattern 1 (`can_read_gift_idea` RLS helper, row-level) |
| D-09 | Anniversaires agrège birthdays + contacts datés | § Pattern 5 (aggregated view, join via contact_id) |
| D-10 | Case « créer aussi un contact » cochée par défaut | § Pattern 5 (birthday form checkbox; mirror-skip guard) |
| D-11 | Helper nextDate partagé Europe/Paris | § Pattern 6 (adopt `nextBirthdayDate`, fix `nextAnniversary` Feb-29 hole) |
| D-12 | Fusion nom normalisé + JJ/MM, badge deux sources; rappels dédupliqués | § Pattern 5 (fusion key); cron 06h40 unchanged (mirrors feed dispatch) |
| D-13 | Photo contact prioritaire, repli birthday | § Pattern 5 (`contact.photo ?? birthday.photo`) |
| D-14 | Suppression cascade miroir + modale | FK `ON DELETE CASCADE` + existing `ConfirmDialog` pattern |
| D-15 | Défauts 90j / 20 usages, bornes ≤90j, 1-100 | § Pattern 4 (clamp exactly like `create_ardoise_invite`) |
| D-16 | Rachat membres cochés + externes email sans compte | § Pattern 4 (redeem RPC); Open Question OQ-1 for no-account flow |
| D-17 | Droits lecture + réservation | § Pattern 4 (redeem inserts `permission='reservation'` share) |
| D-18 | UX Copier/Partager/Régénérer/Arrêter | § Code Examples (ardoise-detail-page panel, verbatim UX) |

## Project Constraints (from AGENTS.md)

1. **RLS per table (§2.6):** every multi-foyer table enables RLS with explicit SELECT/INSERT/UPDATE/DELETE policies; child tables derive foyer from parent or carry justified + constrained denormalized `household_id`; `SECURITY DEFINER` helpers with fixed `search_path`; no self-admin (invite tokens never grant `admin`).
2. **Verification chain (§2.7, mandatory order):** `cd app && npm run typecheck && npm test && npm run build`, `npm run test:e2e`, `python3 scripts/check-sql-statique.py`, `sh scripts/test-db.sh` (Docker), plus `test-dispatch-push.sh` where push-adjacent. SQL is only proven by execution; never rewrite an applied migration — fix forward.
3. **Static SQL check:** 8 checks (unqualified table under empty `search_path`, self-joining CTE, unclosed literal, unqualified `RETURNS TABLE` output column, `testkit.eq` type mismatch, plpgsql var inside `testkit.count()` string, non-`RECURSIVE` recursive CTE, DML-then-ALTER same txn on deferred-trigger table). Effective definition only; controls proven by a must-fail case.
4. **Testkit assertions:** bounded per foyer (count in `authenticated` role may rely on RLS; in `postgres` role must bound manually), no tautologies, `testkit.eq` requires same-type args, `testkit.count()` runs in a separate function (no caller variables).
5. **Container boundary:** `psql.sh` runs inside `db`; only stdin crosses (`psql.sh < file`, never `-f`).
6. **Secrets:** never versioned, never on CLI, never in `cron.job.command`; new `GIFT_LIST_INVITE_HMAC_SECRET` (≥256 bits) lives in Vault/secret manager, injected server-side only, never reused from another secret.
7. **Gift model (§5):** `gift_lists(owner_member_id, visibility privee/foyer/partagee)`, `gift_items` with denormalized `household_id`, `gift_list_shares` member-or-email with `permission lecture/reservation`.
8. **Storage:** private `household-media` bucket, browser-compressed photos, signed URLs; contact photos go under `<householdId>/contacts/`.
9. **Cron Europe/Paris:** `eo-birthday-alerts` at `40 6 * * *` (06h40) [VERIFIED: supabase/migrations/0012_notifications.sql:224-245] — this phase must not alter it; mirror rows feed it automatically.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| gift_ideas / contacts CRUD + RLS | API / Backend (PostgREST + RLS) | — | Foyer isolation and surprise masking are authorization → enforced in DB, never client-side |
| Invite code mint/verify/redeem | Edge Function (`gift-list-invite`) + RPC `service_role` | — | HMAC secret never leaves server; `gift_list_invites` has no client policies |
| Mirror contacts→birthdays + offert propagation | Database (triggers) | — | Must fire regardless of writer path (client, RPC, backfill) |
| Birthday alert dispatch 06h40 | Database (pg_cron, unchanged) | — | Existing `dispatch_birthday_alerts` reads `birthdays`; mirrors are picked up with zero change |
| Tabs Listes/Idées/Contacts, aggregation, dedup badge | Browser / Client | — | Display fusion (D-12) and duplicate warning (D-04) are presentation, not authorization |
| Contact/idea photos | Browser (compress) → Storage (private bucket) | — | Established `depositHouseholdFile` path |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react` + `react-dom` | 19.3.0 | UI | Project-locked [VERIFIED: app/package.json] |
| `react-router` | 8.4.0 | Routing (declarative, `react-router` import only) | Project-locked [VERIFIED: app/package.json] |
| `@supabase/supabase-js` | 2.117.2 | PostgREST + Auth + Storage + Functions invoke | Project-locked [VERIFIED: app/package.json] |
| `@tanstack/react-query` | 5.103.2 | Server cache, optimistic mutations (`useCadeaux` pattern) | Project-locked [VERIFIED: app/package.json] |
| `react-hook-form` + `zod` + `@hookform/resolvers` | 7.88.0 / 4.6.5 / 5.9.1 | Forms + typed validation | Project-locked [VERIFIED: app/package.json] |
| `@radix-ui/react-tabs` | 1.1.21 | Tabs Listes/Idées/Contacts | Already a dependency — use for the tab shell [VERIFIED: app/package.json] |
| `qrcode` + `@types/qrcode` | 1.5.4 / 1.5.6 | QR render of invite code/link | Already used by shared `qr-code.tsx` [VERIFIED: app/src/components/shared/qr-code.tsx:2,20] |
| `date-fns` + `@date-fns/tz` | 4.4.0 / 1.5.0 | Europe/Paris date math | Project-locked [VERIFIED: app/package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `supabase/functions` Deno + `npm:zod@4.6.5` + `@supabase/server` (`withSupabase`) | pinned by snapshot `deno.jsonc` | `gift-list-invite` Edge | Clone `ardoise-invite/index.ts` structure verbatim |
| testkit (`supabase/tests/_setup.sql`) | in-repo | SQL fixtures + assertions (`testkit.ok/eq/count`, `testkit.fx`, `auth_user`) | All new SQL tests |
| `depositHouseholdFile` (`app/src/lib/storage.ts`) | in-repo | Contact/idea photos → `household-media` | folder `contacts` / `cadeaux` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| View `gift_items_for_list` masking `reserved_by` | RLS policy on `gift_items` | RLS cannot filter columns — rejected; a `SECURITY INVOKER` view with `CASE` is the established pattern (CONTEXT code insights) |
| Publishable `link-view` for no-account externals (ardoise-style) | User-only redeem + email share activated on signup | Spec mandates Edge user-only; see OQ-1 |
| Client-side offert propagation | Trigger `propagate_idea_gifted()` | Client path breaks under offline replay and multi-writer; trigger is single source of truth |
| New date helper | Reuse `nextBirthdayDate` | `nextAnniversary` (cadeaux) has a Feb-29 hole (returns null, drops the birthday); the clamped helper is already tested |

**Installation:**
```bash
# No new dependencies. All libraries above are already in app/package.json / lockfile.
```

**Version verification:** No `npm install` required — stack table versions were read from `app/package.json` this session (dependency + devDependency blocks). `qrcode` presence confirmed by import in `app/src/components/shared/qr-code.tsx`.

## Package Legitimacy Audit

No external packages are installed by this phase. All UI needs (tabs, QR, forms, dates) are covered by existing locked dependencies (`@radix-ui/react-tabs` 1.1.1x, `qrcode` 1.5.4, `zod` 4.6.5, `date-fns` 4.4.0).

| Package | Registry | Verdict | Disposition |
|---------|----------|---------|-------------|
| *(none — zero new installs)* | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Navigateur (Tabs Listes/Idées/Contacts)
  │ PostgREST (JWT user, RLS foyer + surprise)
  ├─ gift_lists / gift_items (+ vue gift_items_for_list masquant reserved_by au owner)
  ├─ gift_ideas (RLS can_read_gift_idea : masquée au destinataire D-08)
  ├─ contact_lists / contacts (RLS via liste parente)
  └─ birthdays (+ contact_id ; trigger miroir contacts→birthdays)
  │ Edge gift-list-invite [user seul] (HMAC GIFT_LIST_INVITE_HMAC_SECRET, rate-limit, oracle-safe)
  ├─ create/revoke/summary → RPC service_role (manage = owner|admin, verrou FOR UPDATE, temps constant)
  └─ redeem → crée gift_list_shares (membre coché | email externe), permission 'reservation'
pg_cron eo-birthday-alerts 06h40 (INCHANGÉ) → dispatch_birthday_alerts() lit birthdays (miroirs inclus)
Storage household-media/<householdId>/{contacts,cadeaux}/… (photos compressées navigateur)
```

### Recommended Project Structure

```
supabase/migrations/0076_gift_ideas.sql        # gift_ideas + idea_id sur gift_items + trigger offert + RLS + grants
supabase/migrations/0077_contacts.sql          # contact_lists + contacts + align/validate triggers + ensure_default + backfill + RLS
supabase/migrations/0078_birthday_mirror.sql  # birthdays.contact_id (unique partiel) + trigger synchro + cascade
supabase/migrations/0079_gift_invites.sql     # gift_list_invites (SANS politique) + RPC create/revoke/summary/redeem + grants service_role
supabase/migrations/0080_gift_items_mask.sql  # vue gift_items_for_list (reserved_by masqué au owner) + visibility 'partagee'
supabase/functions/gift-list-invite/index.ts  # clone ardoise-invite, actions create/revoke/summary/redeem, auth user seul
supabase/tests/0024_gift_ideas.sql            # RLS foyer + surprise + offert + enfant/inter-foyer
supabase/tests/0025_contacts_mirror.sql        # listes défaut, pré-remplissage, miroir, cascade, défaut non supprimable
supabase/tests/0026_gift_invites.sql          # invites invisibles client, bornes, redeem, oracle unique
app/src/modules/cadeaux/…                     # tabs + idées + promotion + partage code (étendre, pas réécrire)
app/src/modules/contacts/… (ou cadeaux/contacts/) # listes + fiches + warning doublons
app/src/modules/anniversaires/…               # agrégation + checkbox D-10 + fusion badge + photo prioritaire
```

(Exact migration numbers: start at 0076 — files 0047–0051 named in the source plan are stale; repo HEAD is `0075_gift_read_household_scope.sql` [VERIFIED: `ls supabase/migrations | sort | tail`]. Planner must confirm no 0076+ landed before writing.)

### Pattern 1: gift_ideas with row-level surprise masking (D-05…D-08)

**What:** New `gift_ideas` table (foyer-plat RLS: writers admin/membre, delete admin — same generator motif as 0007/0071) plus a `can_read_gift_idea(id)` helper that hides the row from its giftee. Promotion creates a linked `gift_items.idea_id`; a trigger propagates `offert`.
**When to use:** For D-08 (whole-row hiding → RLS helper suffices; column masking is only needed for `reserved_by`, which stays a view).
**Example:**
```sql
-- Source: mirrors private.can_read_gift_list (supabase/migrations/0075_gift_read_household_scope.sql:17-44)
create or replace function private.can_read_gift_idea(p_idea_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.gift_ideas i
     where i.id = p_idea_id
       and private.is_household_member(i.household_id)
       and not exists (  -- masquée au destinataire (D-08)
         select 1 from public.contacts c
          where c.id = i.giftee_contact_id
            and c.linked_member_id = private.current_member_id(i.household_id)
       )
  );
$$;
-- gift_items.idea_id: nullable FK → gift_ideas ON DELETE SET NULL (l'item survit à l'idée).
-- Trigger propagate_idea_gifted(): AFTER UPDATE WHEN old.status <> 'offert' AND new.status = 'offert'
--   → UPDATE public.gift_items SET purchased = true WHERE idea_id = NEW.id;
```

### Pattern 2: contact_lists defaults + adult pre-fill (D-01/D-02)

**What:** `contact_lists(id, household_id, name, owner_member_id NULLABLE, is_default)` — `owner NULL` = shared « Famille », set = perso. `contacts(id, list_id, household_id` dénormalisé, `name, birth_date NULLABLE, photo_url, linked_member_id NULLABLE)`. `ensure_default_contact_list()` trigger + one-shot backfill in the same migration (forward-only): create « Famille » + one perso list per adult member; pre-fill one contact per adult with `linked_member_id` (children excluded, `role in ('admin','membre')` — same predicate as `create_ardoise` seed [VERIFIED: 0058_ardoise_settlement_rpc.sql:321-325]). Register `contacts` in the `align_child_household` loop (`('contacts','contact_lists','list_id')` — extends the 0008 list [VERIFIED: 0008_triggers.sql:186-195]) and member columns in `validate_member_refs` (`linked_member_id`); add `('contact_lists', …)` + `('contacts', …)` handling to the foyer-plat RLS generator style (new migration creates the 4+4 policies, never edits 0007 — per 0071 precedent).
**RLS for lists:** SELECT shared → `is_household_member`; perso → owner-is-current-member OR admin. INSERT/UPDATE → `can_write_household` + (perso ⇒ owner or admin); DELETE → admin. Contacts policies delegate to parent via `private.contact_list_household_id()` (same shape as `gift_list_household_id` [VERIFIED: 0007_rls_policies.sql:148-151]).
**Default-list guard:** trigger forbids deleting the last default list of a household (test: « défaut non supprimable »).

### Pattern 3: contacts→birthdays mirror (D-03/D-10/D-14)

**What:** `birthdays.contact_id NULLABLE UNIQUE NULLS NOT DISTINCT`-style partial uniqueness (one mirror per contact; manual birthdays keep NULL). `AFTER INSERT OR UPDATE OF birth_date … WHEN (NEW.birth_date IS NOT NULL)` trigger inserts the mirror row (`name, birth_date, photo_url, household_id, contact_id`) **unless** a same-household birthday with normalized-equal name + equal date already exists (dedup guard — this is what prevents the D-10 « créer aussi un contact » double-mirror: the birthday-first flow creates contact second, guard sees the just-created birthday and skips). D-03 respected: no backfill of pre-existing birthdays into contacts.
**Delete (D-14):** `birthdays.contact_id REFERENCES contacts(id) ON DELETE CASCADE` + UI `ConfirmDialog` (existing component, same wording shape as cadeaux-page deletions).
**Cron:** no change — `dispatch_birthday_alerts()` aggregates `birthdays`, mirrors included; D-12 reminder dedup falls out of the mirror-skip guard (one row per person).

### Pattern 4: gift_list_invites without policy + service_role RPC (D-15…D-18)

**What:** Exact mirror of the `household_invite_tokens` (0006 + 0009 grants) and ardoise-invite (0058 RPCs + Edge) pattern, with one deliberate difference: manage = **owner OR household admin** (not creator/admin-of-ardoise).
- Table `gift_list_invites(list_id, token_hash UNIQUE 64-hex, created_by auth user, expires_at, max_uses, use_count, is_active)` — **zero RLS policies** + `revoke all … from anon, authenticated` / `grant all … to service_role` (per 0009 pattern [VERIFIED: 0009_grants.sql:24-30]).
- RPCs `create_gift_list_invite / revoke_gift_list_invite / gift_list_invite_summary / redeem_gift_list_invite`, `SECURITY DEFINER`, `search_path=''`, `revoke … from public, anon, authenticated` + `grant execute … to service_role` (per 0058 pattern [VERIFIED: 0058_ardoise_settlement_rpc.sql:737-747]).
- Bounds cloned from `create_ardoise_invite`: hash `^[0-9a-f]{64}$`, `max_uses 1–100` (D-15 upper bound), `expires_at ≤ now()+90 days`, regen deactivates previous, `FOR UPDATE` lock + `private.token_hash_matches`, single oracle message « code invalide » [VERIFIED: 0058_ardoise_settlement_rpc.sql:369-377, 483-517].
- D-15 defaults: `expires_at = now()+90d`, `max_uses = 20` (differs from ardoise default 10 — set explicitly as RPC defaults).
- Redeem (member path): `p_actor_id` must be a household member (target member required — hence Edge user-only); inserts `gift_list_shares(list_id, shared_with_member_id, permission='reservation')` **in the same transaction** (D-17, mirrors « share reservation même transaction » from source plan); idempotent for already-shared members (no use_count burn — mirrors household redeem idempotence [VERIFIED: 0006_security_helpers.sql:435-446]).
- Secret: new Vault `GIFT_LIST_INVITE_HMAC_SECRET` (≥256 bits, dedicated — never reuse `ARDOISE_HMAC_SECRET` or `INVITE_TOKEN_HMAC_SECRET`); Edge fails closed with 500 if absent/short (same `checkSecret` as ardoise-invite [VERIFIED: index.ts:295-301]).
- Edge `gift-list-invite` (`supabase/functions/gift-list-invite/index.ts`): clone `ardoise-invite` with actions `create/revoke/summary/redeem` only, `withSupabase({ auth: ['user'] })`, code `generateCode()` 24 bytes → 32 base64url chars, Zod-validated, rate-limit map, `translateRpcError` with identical oracle message. Auto-deployed by `scripts/deploy-functions.sh` (scans for `index.ts`), then `recreate functions` + frontend rebuild per STATE distant-relance procedure.

### Pattern 5: Aggregated Anniversaires + duplicate warning (D-04/D-09…D-13)

**What:** `use-anniversaires` fetches `birthdays` + dated `contacts`; each birthday LEFT JOINs its mirror contact via `contact_id`; fusion key = `normalize(name) + MM-DD` where normalize = trim + lowercase + NFC + collapse whitespace (client-side, shared util). Independent birthday+contact sharing a key → « deux sources » badge; mirror pairs → single row. Photo = `contact.photo_url ?? birthday.photo_url` (D-13). Countdown/nextDate via the shared helper (Pattern 6). Birthday form gains « créer aussi un contact » checkbox default-on (D-10) writing `birthdays` (+ contact with `birth_date`, mirror-skip guard prevents the duplicate). Contact form warns on probable duplicate (same key, D-04) — warning only, submit allowed.
**Why client-side fusion:** it is display (which badge, which photo), not authorization — RLS still gates every row.

### Pattern 6: Shared Europe/Paris nextDate (D-11)

**What:** Single helper `nextBirthdayDate` (anniversaires/types.ts — clamped Feb-29 → Feb-28, tested) becomes the shared nextDate for `findNextOccasion` (cadeaux) and countdowns. `private.next_birthday_date(date,date)` (SQL, immutable, tested in 0006_birthdays.sql) remains the server reference.
**Why:** `nextAnniversary` in cadeaux/types.ts (`thisYear >= today` string compare, `new Date()` validity check) returns **null for Feb-29 birthdays in non-leap years** — silently dropping them from nextOccasion [VERIFIED: app/src/modules/cadeaux/types.ts:74-81 vs anniversaires/types.ts:32-47]. Adopting the clamped helper fixes a real hole while satisfying D-11.

### Anti-Patterns to Avoid
- **Editing applied migrations (0004/0006/0007/0008/0009/0012) to add tables/policies/triggers:** always fix forward in 0076+ (AGENTS.md §A.1; 0030→0031 revert precedent).
- **INSERT…RETURNING on gift tables from the client:** the SELECT policy re-reads by id, invisible in the same command under MVCC — use the insert-then-re-read pattern from `createGiftList` [VERIFIED: app/src/modules/cadeaux/api.ts:55-82].
- **Client-side surprise filtering as the security boundary:** `useCadeaux` already filters private lists client-side for UX, but the real gate is `can_read_gift_list` in RLS — D-08 masking must live in the RLS helper, not in the hook.
- **Re-reading gift helpers directly in policies:** keep function indirection (0028/0032 precedent — direct re-read breaks plans).
- **`RETURNS TABLE` unqualified output columns / CTE shadowing / counting in `postgres` role without foyer bound:** the exact failure family the static check + testkit rules exist for.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Invite code crypto + HMAC verify | Custom token scheme | Clone of `ardoise-invite` generateCode/hmacSha256Hex/token_hash_matches + new Vault secret | Constant-time compare, oracle-safe errors, rate-limit already proven in production |
| Foyer isolation on new tables | Ad-hoc policies | Foyer-plat generator motif + `align_child_household` + `validate_member_refs` loops | Same-member-write, cross-foyer negative tests already standardized |
| Date math (next occurrence, Feb-29) | String slicing | `nextBirthdayDate` (client) / `private.next_birthday_date` (SQL) | Leap-year clamp + existing test vectors (0006_birthdays.sql) |
| Photo upload/compress | New uploader | `depositHouseholdFile` + `compressImage` | Bucket policies know only `household-media`; MIME allowlist enforced |
| QR display of code/link | New renderer | Shared `qr-code.tsx` (`qrcode` lib) | Already in dependency tree |
| Share dialog member/email UX | New form | Extend `GiftShareDialog` (RHF + Zod, member checkboxes + email) | D-18 « identique à l'ardoise » includes this dialog shape |
| Delete confirmations | `window.confirm` / silent delete | `ConfirmDialog` | Project-wide destructive-action rule (AGENTS.md §6) |

**Key insight:** This phase is 80% mirroring (ardoise-invite → gift-list-invite, household_invite_tokens → gift_list_invites, products-0071 → new tables). Deviations from the mirrored shape are where the last four production incidents came from — keep the shape, change only the nouns (owner|admin manage rule, 20-use default, user-only Edge).

## Common Pitfalls

### Pitfall 1: Stale migration numbers (0047–0051) colliding with HEAD at 0075
**What goes wrong:** New files named 0047+ sort before applied migrations; `migrate.sh` applies lexicographically → out-of-order or skipped DDL.
**Why it happens:** Source plan was written against an older HEAD.
**How to avoid:** Number from 0076 after `ls supabase/migrations | sort | tail`. Never reuse numbers.
**Warning signs:** `schema_migrations` count mismatch; `migrate.sh` reporting « already applied » for new files.

### Pitfall 2: New Vault secret missing locally → Edge 500
**What goes wrong:** `gift-list-invite` returns « Configuration serveur absente : GIFT_LIST_INVITE_HMAC_SECRET » on a dev stack.
**Why it happens:** Same as the known STATE issue (`INVITE_TOKEN_HMAC_SECRET` absent locally → household-invite KO). Secrets are provisioned per environment, never versioned.
**How to avoid:** Provisioning step in plan (Vault + local `.env` of the functions runtime); Edge must fail closed with explicit message (clone `checkSecret`).
**Warning signs:** 500 on first create-code call in local testing.

### Pitfall 3: D-10 double-mirror (birthday → contact → second birthday)
**What goes wrong:** Checking « créer aussi un contact » creates a contact whose mirror trigger inserts a duplicate birthday.
**Why it happens:** Trigger fires on every dated contact insert without dedup awareness.
**How to avoid:** Dedup guard in the mirror trigger (skip when same-household normalized-name + date birthday exists) + test asserting exactly 1 birthday after the D-10 flow.
**Warning signs:** Birthday count 2 after single D-10 creation in tests.

### Pitfall 4: Feb-29 birthdays vanish from nextOccasion
**What goes wrong:** `nextAnniversary('2000-02-29', …)` returns null in non-leap years → contact never surfaces in « Pour qui » occasions.
**Why it happens:** String-built `YYYY-02-29` fails `new Date()` validation.
**How to avoid:** Adopt clamped `nextBirthdayDate` as the shared helper (Pattern 6); add Feb-29 Vitest vector mirroring 0006_birthdays.sql cases.
**Warning signs:** Empty nextOccasion for a known Feb-29 contact.

### Pitfall 5: Unbounded testkit counts passing on empty DB, failing in production
**What goes wrong:** Assertions like « Carol sees 0 gift_ideas » pass vacuously on empty staging, then the 0075-style inter-foyer leak (fixed 05/10/2026 after `testkit.count` global hit 4 vs 3) recurses.
**Why it happens:** Counting in `postgres` role without foyer bound; fixtures from other suites leaking expectations.
**How to avoid:** Bound every assertion per foyer; run new test files against a seeded non-empty base (the 0075 incident's lesson); `set local role authenticated` for RLS-path counts.
**Warning signs:** A test file that is green on first run with zero fixtures exercising the negative path.

### Pitfall 6: Static-check blind spots on new SQL shapes
**What goes wrong:** Mirror trigger or masked view contains a self-joining CTE or unqualified `RETURNS TABLE` column that the checker doesn't flag (AGENTS.md §B documents three such evolutions already).
**Why it happens:** New query shapes (e.g., normalized-name dedup subquery) outside the checker's patterns.
**How to avoid:** `python3 scripts/check-sql-statique.py` green is necessary but not sufficient — the plan must also execute every new function at least once via `test-db.sh` (AGENTS.md §A: only execution proves SQL).
**Warning signs:** Checker green + first real call raising `relation does not exist` / ambiguous column.

## Code Examples

### Ardoise share panel UX to replicate (D-18)

```tsx
// Source: app/src/modules/ardoise/ardoise-detail-page.tsx:541-679 (read this session)
// Invite link: `${window.location.origin}/invitation/ardoise?code=${encodeURIComponent(code)}`
// copyCode → navigator.clipboard.writeText(code) + toast 'Code copié.'
// shareCode → navigator.share({title, text}) fallback clipboard lien + 'Lien copié.'
// States: summary.hasCode ? 'Régénérer' : 'Générer un code'; lastCode shown once (mono font)
// + 'Code actif créé ailleurs : régénérez pour l'afficher sur cet appareil.'
// + 'Arrêter le partage' → revoke + 'Partage arrêté : le code ne passe plus.'
// Gift adaptation: route /invitation/cadeau?code=…, title = nom de la liste.
```

### Edge handler shape to clone (user-only reduction)

```ts
// Source: supabase/functions/ardoise-invite/index.ts:647-696 (read this session)
Deno.serve(
  withSupabase({ auth: ['user'] }, async (request, ctx) => {  // NOTE: user seul (pas 'publishable')
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
    // parseBody (Zod discriminatedUnion action) → enforceRateLimit → isUser check → dispatch
    // create/revoke/summary/redeem handlers call admin.rpc('create_gift_list_invite', …) etc.
  }),
);
// Reuse verbatim: generateCode, hmacSha256Hex, rate-limit map, translateRpcError oracle mapping.
```

### Client Edge call + ticket storage pattern

```ts
// Source: app/src/modules/ardoise/api.ts:222-240 (read this session)
// callArdoiseInvite → fetch(`${supabaseFunctionsBase}/ardoise-invite`, { apikey, Authorization Bearer session })
// Gift adaptation: callGiftInvite<T>(action, body) → `/gift-list-invite`, same headers, same error surfacing.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Ardoise invite hash on `ardoises` row | Dedicated no-policy table + RPC (`household_invite_tokens`, 0058 RPCs) | Phases 1–2 | Gift invites follow the dedicated-table variant (multiple codes per list possible; revoke per invite row) |
| Client-side private-list filter as gate | RLS `can_read_gift_list` + 0075 household-scope fix | 2026-10-05 | D-08 masking must be RLS-level; client filter is UX-only |
| `nextAnniversary` string compare (cadeaux) | Clamped `nextBirthdayDate` (anniversaires) + SQL `next_birthday_date` | This phase (D-11) | Fixes Feb-29 hole; single helper for both modules |

**Deprecated/outdated:**
- Source-plan migration numbers 0047–0051: stale (HEAD is 0075) — start at 0076.
- `visibility = 'partagee'` enum value exists in DB + TS (`GiftVisibility`) but is never proposed in UI (spec: « partagee proposée » = this phase wires it to code-shared lists).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `todayIso()` / countdown base is Europe/Paris-consistent (to verify in `app/src/lib/utils.ts`) | Pattern 6 | Off-by-one-day occasions around midnight; planner must add a verification task reading `lib/utils.ts` |
| A2 | Birthday reminder push path (`test-dispatch-push.sh`) covers mirror rows without change since it reads `birthdays` | Pattern 3 | If dispatch filters by source/columns added later, mirrors silently unalerted; verify dispatch query reads all `birthdays` rows |
| A3 | `supabase_realtime` publication needs new tables added (per 0071 `products` precedent) for live UI updates | Patterns 1–2 | Tabs won't live-update; planner must check 0010/publication loop and add tables the same way |
| A4 | `HOUSEHOLD_SCOPED` in `supabase-adapter.ts` + `database.ts` row types must be extended for new tables (per 0071) | Patterns 1–2 | Offline cache/demo mode misses new tables; include in plan file lists |
| A5 | No-account external flow resolves as: redeem requires session; external signs up with the invited email, then share activates via existing `can_read_gift_list` email branch | OQ-1 | If product expects fully anonymous reservation, Edge needs a publishable action — confirm with user (see Open Questions) |

## Open Questions

1. **OQ-1: No-account external redeem path (D-16 vs Edge user-only)**
   - What we know: Spec says Edge `gift-list-invite` is user-only AND externals join « via lien (email, sans compte) ». Ardoise solved this with publishable `redeem-guest`/`link-view`; gifts explicitly exclude it.
   - What's unclear: Whether « sans compte » means never-sign-up (needs anonymous view/reserve) or signup-with-that-email-later.
   - Recommendation: Implement redeem-as-user-only; the emailed code link leads to signup/login with that email, after which the `shared_with_email` share activates via the existing `can_read_gift_list` email branch (`s.shared_with_email = profiles.email` [VERIFIED: 0075:34-39]). Flag as `checkpoint:human-verify` in plan; if anonymous reservation is required, add a publishable `link-view` action (ardoise precedent) as a scoped follow-up.

2. **OQ-2: Personal contact-list visibility for admins**
   - What we know: D-01 says « liste perso par membre » without specifying admin visibility.
   - What's unclear: Can a household admin read another member's personal list (e.g., to help)?
   - Recommendation: Perso list readable by owner + admins (admins already manage everything: `can_manage_gift_list` precedent), writable by owner + admins; document the choice in the migration comment.

3. **OQ-3: `gift_ideas.status` value set**
   - What we know: Source plan says `status a_offrir/offert`.
   - What's unclear: Exact enum literals (French with underscore?).
   - Recommendation: `check (status in ('a_offrir','offert')) default 'a_offrir'`; planner locks literals before writing Zod schemas so client/server agree byte-for-byte.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker (db service) | `test-db.sh`, `migrate.sh` | To verify at plan time (`docker info`) | — | Typecheck + Vitest + static check only; SQL marked unproven until Docker run |
| Vault `GIFT_LIST_INVITE_HMAC_SECRET` | Edge + RPC redeem/create | ✗ (new secret, to provision) | — | None — Edge fails closed; provisioning task mandatory pre-Edge-testing |
| Node ≥24.21 + npm | typecheck/test/build/e2e | ✓ (project toolchain) | per `app/package.json` engines | — |
| Playwright browsers | e2e (idée→réserve→code→contact daté) | To verify (`npx playwright --version`) | 1.63.0 pinned | Vitest-only + manual path if browsers absent |

**Missing dependencies with no fallback:**
- `GIFT_LIST_INVITE_HMAC_SECRET` in Vault/runtime env — plan must include provisioning before Edge verification.

**Missing dependencies with fallback:**
- Docker-absent machine: full static chain still runs; `test-db.sh` becomes a mandatory gate before merge (AGENTS.md §2.7).

## Validation Architecture

> Included (no `workflow.nyquist_validation=false` found — `.planning/config.json` absent; treated as enabled per instructions).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (`vitest run`) + Playwright 1.63.0 + pgTAP/testkit via `sh scripts/test-db.sh` + `python3 scripts/check-sql-statique.py` |
| Config file | `app/package.json` scripts (`test`, `test:e2e`), `app/playwright.config.ts`, `supabase/tests/_setup.sql` |
| Quick run command | `cd app && npm run typecheck && npm test` |
| Full suite command | `cd app && npm run typecheck && npm test && npm run build && npm run test:e2e && python3 ../scripts/check-sql-statique.py && sh ../scripts/test-db.sh` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-08 | Idea for Maya invisible to Maya; visible to others same foyer | SQL (authenticated-role counts, bounded per foyer) | `sh scripts/test-db.sh 0024` | ❌ Wave 0 (new `0024_gift_ideas.sql`) |
| D-15/D-16/D-17 | Invite bounds (≤90j, 1–100), redeem creates reservation share, oracle-safe single message | SQL via RPC as service_role + denial as authenticated | `sh scripts/test-db.sh 0026` | ❌ Wave 0 (new `0026_gift_invites.sql`) |
| D-01/D-02/D-03/D-14 | Default lists, adult pre-fill, mirror-only-new, cascade delete | SQL | `sh scripts/test-db.sh 0025` | ❌ Wave 0 (new `0025_contacts_mirror.sql`) |
| D-05/D-06 | Promote idea → linked item; offert → purchased | Vitest (api, MSW not needed — data-layer mocks per existing `cadeaux-page.test.tsx`) | `npm test -- gift` | ❌ Wave 0 (extend module tests) |
| D-04/D-09/D-12/D-13 | Duplicate warning, aggregation, badge, photo priority | Vitest (pure fusion util + component) | `npm test -- anniversaires` | ❌ Wave 0 |
| D-11 | Shared nextDate incl. Feb-29 vector | Vitest | `npm test -- nextBirthday` | ❌ Wave 0 |
| D-18 + full journey | idée→réserve→code→contact daté | Playwright | `npm run test:e2e` (extend `app/e2e/`) | ❌ Wave 0 (new spec, cf. `critical-paths.spec.ts` pattern) |

### Sampling Rate
- **Per task commit:** `cd app && npm run typecheck && npm test`
- **Per wave merge:** full suite command above
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `supabase/tests/0024_gift_ideas.sql` — covers D-05…D-08 (RLS foyer/plat + enfant + inter-foyer + surprise + offert propagation)
- [ ] `supabase/tests/0025_contacts_mirror.sql` — covers D-01…D-04, D-10, D-14 (defaults, pre-fill, mirror + dedup guard, cascade, défaut non supprimable)
- [ ] `supabase/tests/0026_gift_invites.sql` — covers D-15…D-17 (invisible table, bounds, redeem atomicity, oracle message, service_role-only EXECUTE)
- [ ] Vitest: fusion util + duplicate warning + shared nextDate (Feb-29) + masked view mapping
- [ ] Playwright: idée→réserve→code→contact daté journey
- [ ] Provision `GIFT_LIST_INVITE_HMAC_SECRET` (Vault + local functions env) before Edge verification

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Partial | Supabase Auth unchanged; Edge `auth:['user']` only — no new session logic |
| V3 Session Management | No | No change (JWT via `withSupabase`, same as ardoise-invite) |
| V4 Access Control | **Yes** | RLS per table + `can_read_gift_idea` surprise helper + no-policy `gift_list_invites` with service_role RPCs + `private.assert_*` re-checks inside RPCs |
| V5 Input Validation | **Yes** | Zod v4 both tiers: Edge `requestSchema` (code regex base64url, displayName 1–120) + RHF/Zod dialogs; SQL CHECKs (name lengths, price ≥ 0, status enum, hash hex) |
| V6 Cryptography | **Yes** | `crypto.getRandomValues` 24B + HMAC-SHA-256 server-side only; never hand-roll (clone ardoise-invite verbatim) |
| V8 Data Protection | **Yes** | Surprise masking (D-08 row-level + `reserved_by` view-level); contact photos in private bucket, signed URLs |

### Known Threat Patterns for Supabase/RLS + Edge stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Inter-foyer read via permissive branch (cf. 0075 incident) | Information Disclosure | Scope every visibility branch to `is_household_member`; negative Carol-vs-Alice tests per table |
| Column leak through RLS (reserved_by to owner) | Information Disclosure | Masking view/RPC, never raw table read for owners |
| Invite oracle (distinguishing expired/exhausted/unknown) | Information Disclosure | Single « code invalide » message end-to-end (SQL → Edge → UI) |
| Concurrent redeem double-spend of use_count | Tampering | `FOR UPDATE` row lock + atomic increment in one RPC transaction |
| Self-grant of reservation/admin via crafted share/invite | Elevation of Privilege | `validate_member_refs` + `member_in_household` checks; invites never grant `admin`; manage = owner\|admin verified in-RPC |
| Email-share hijack (attacker registers victim email) | Spoofing | Pre-existing accepted risk of the email-share model (profiles.email match); redeem binds code→email explicitly entered by redeemer; no change in this phase |

## Sources

### Primary (HIGH confidence)
- In-repo reads this session: `0006_security_helpers.sql` (helpers + household redeem idempotence), `0007_rls_policies.sql:148-168,195` (gift helpers, foyer-plat generator), `0008_triggers.sql` (align/validate loops, gift ownership guard), `0009_grants.sql:24-30` (no-policy table lockdown), `0012_notifications.sql:224-245` (06h40 cron), `0028/0032`-era `createGiftList` workaround (`app/src/modules/cadeaux/api.ts:55-82`), `ardoise-invite/index.ts` (full Edge reference), `0058_ardoise_settlement_rpc.sql:332-547` (invite RPC family), `0075_gift_read_household_scope.sql` (scope fix + helper shape), `cadeaux/types.ts:74-81` vs `anniversaires/types.ts:32-47` (Feb-29 divergence), `ardoise-detail-page.tsx:541-679` (share UX), `qr-code.tsx`, `storage.ts`, `app/package.json` (locked versions), `scripts/test-db.sh` + `tests/_setup.sql` (harness), `scripts/deploy-functions.sh` (auto-discovery), `check-sql-statique.py` header (control family).

### Secondary (MEDIUM confidence)
- `.planning/PHASES/05-cadeaux-contacts.md` + `/home/jmaillot/.opencode/plan/05-cadeaux-contacts.md` (phase spec; migration numbers stale, bounds/defaults authoritative for D-15).
- Prior plan `04-courses-scan/04-01-PLAN.md` (verify-command reuse, threat-model shape, `HOUSEHOLD_SCOPED`/realtime-registration pattern from 0071).

### Tertiary (LOW confidence)
- None relied upon — every structural claim is grounded in a file read this session; residual unknowns are in Assumptions/Open Questions.

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — versions read from `app/package.json`; zero new installs.
- Architecture: HIGH — every mechanism mirrors a production-proven in-repo precedent read this session.
- Pitfalls: HIGH — four of six pitfalls are generalizations of documented in-repo incidents (0075 leak, 0055 txn, Feb-29 vectors, secret-absent-local).

**Research date:** 2026-10-05
**Valid until:** 2026-11-04 (stable domain; re-check only if HEAD migrations move past 0075 or ardoise-invite changes shape)
