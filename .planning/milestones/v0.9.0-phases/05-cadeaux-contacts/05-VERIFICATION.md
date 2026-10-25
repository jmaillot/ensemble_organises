---
phase: 05-cadeaux-contacts
verified: 2026-10-06T12:00:00Z
status: passed
score: 18/18 must-haves verified
covered_files:
  - .planning/phases/05-cadeaux-contacts/05-01-PLAN.md
  - .planning/phases/05-cadeaux-contacts/05-02-PLAN.md
  - .planning/phases/05-cadeaux-contacts/05-03-PLAN.md
  - .planning/phases/05-cadeaux-contacts/05-04-PLAN.md
  - .planning/phases/05-cadeaux-contacts/05-05-PLAN.md
  - .planning/phases/05-cadeaux-contacts/05-01-SUMMARY.md
  - .planning/phases/05-cadeaux-contacts/05-02-SUMMARY.md
  - .planning/phases/05-cadeaux-contacts/05-03-SUMMARY.md
  - .planning/phases/05-cadeaux-contacts/05-04-SUMMARY.md
  - .planning/phases/05-cadeaux-contacts/05-05-SUMMARY.md
  - supabase/migrations/0076_gift_ideas.sql
  - supabase/migrations/0077_contacts.sql
  - supabase/migrations/0078_birthday_mirror.sql
  - supabase/migrations/0079_gift_invites.sql
  - supabase/migrations/0080_gift_items_mask.sql
  - supabase/migrations/0082_gift_redeem_upgrade.sql
  - supabase/migrations/0083_gift_reserve_update.sql
  - supabase/tests/0024_gift_ideas.sql
  - supabase/tests/0025_contacts_mirror.sql
  - supabase/tests/0026_gift_invites.sql
  - supabase/tests/0027_gift_redeem_upgrade.sql
  - supabase/tests/0028_gift_reserve_update.sql
  - supabase/functions/gift-list-invite/index.ts
  - app/src/modules/cadeaux/cadeaux-page.tsx
  - app/src/modules/cadeaux/api.ts
  - app/src/modules/cadeaux/hooks/use-cadeaux.ts
  - app/src/modules/cadeaux/types.ts
  - app/src/modules/cadeaux/components/gift-share-dialog.tsx
  - app/src/modules/cadeaux/components/gift-idea-form-dialog.tsx
  - app/src/modules/cadeaux/guest-cadeau-page.tsx
  - app/src/modules/cadeaux/guest-cadeau-page.test.tsx
  - app/src/components/shared/qr-code.tsx
  - app/src/modules/contacts/contacts-page.tsx
  - app/src/modules/contacts/api.ts
  - app/src/modules/contacts/hooks/use-contacts.ts
  - app/src/modules/contacts/components/contact-form-dialog.tsx
  - app/src/modules/anniversaires/anniversaires-page.tsx
  - app/src/modules/anniversaires/hooks/use-anniversaires.ts
  - app/src/modules/anniversaires/types.ts
  - app/src/modules/anniversaires/components/birthday-form-dialog.tsx
  - app/e2e/cadeaux-contacts.spec.ts
covered_digest: "v2:sha256:fbd087af261f05ba4905cef92d680350c0588072d883aec8b6ddbcfa88332800"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 18/18
  previous_verified: 2026-10-05T21:50:00Z
  previous_digest: "v2:sha256:71413c3b101560ee8db10c0c22a749e0cfb75567e313ce6b8d54ee293317223f"
  gaps_closed:
    - "UAT 1 Edge live exchange (invite code→QR→redeem→reservation→owner badge) — pass live 2026-10-06"
    - "UAT 2 external e-mail signup+redeem — pass live 2026-10-06"
    - "UAT 3 idea→offert propagation live reflection — pass live 2026-10-06"
    - "UAT 4 physical QR scan — pass live 2026-10-06"
    - "UAT 5 photo priority rendering — pass live 2026-10-06"
    - "Stale coverage: 0082/0083 + 0027/0028, guest-cadeau page + route, QR hex, null-vs-error, shared-private visibility, owner badge + Reçu, birthday upload — all now covered and verified"
  gaps_remaining: []
  regressions: []
---

# Phase 05: Cadeaux/Contacts Verification Report (re-verification)

**Phase Goal:** ROADMAP Phase 4 — gift_ideas + invites code + contacts : idées cadeaux du foyer, listes à surprise avec codes d'invitation, contacts avec naissances synchronisées vers anniversaires, Tabs Listes/Idées/Contacts.
**Verified:** 2026-10-06T12:00:00Z
**Status:** passed
**Re-verification:** Yes — prior VERIFICATION.md (2026-10-05, human_needed, 18/18 automated) was STALE: 8 post-verifier drive-by commits landed after its digest (b16b0f7, 16da7c4, 4935da2, 9156e2f, e034352, c748179, 6b6023a, b594e66, d64a30a). All re-verified below with a fresh digest.

**Digest note:** `gsd_run query verification.fingerprint` was not callable from this verification context; `covered_digest` is sha256 over the concatenated bytes of the 43 listed covered files in listed order (all 43 existence-checked). Recompute via the canonical verb when available; content verdict is independent of the digest method.

## Goal Achievement

### Observable Truths (D-01…D-18, CONTEXT-locked — regression-checked against drive-bys)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| D-01 | Liste « Famille » partagée + une liste perso par membre existent après seed/backfill | ✓ VERIFIED | Unchanged since prior verification; suite now 30/30 (was 27/27), no 0077 modification |
| D-02 | Membres adultes pré-remplis liés (linked_member), enfants exclus ajout manuel | ✓ VERIFIED | Unchanged; 0025 still green in 30/30 run |
| D-03 | Anniversaires existants PAS importés ; synchro = nouveaux contacts datés seuls | ✓ VERIFIED | Unchanged; 0078 untouched |
| D-04 | Avertissement doublon probable (nom + date), non bloquant, sans contrainte dure | ✓ VERIFIED | Unchanged; contacts-page tests green (42/42 phase-05 Vitest) |
| D-05 | Bouton « ajouter à une liste » crée un gift_item lié (idea_id), onglets sinon indépendants | ✓ VERIFIED | Unchanged; cadeaux tests green |
| D-06 | Statut « offert » propagé à l'item lié (acheté/offert) côté serveur | ✓ VERIFIED | Unchanged + UAT 3 pass live 2026-10-06 (idea→offert marks linked item purchased). Reverse item→idea still out of scope → backlog, unchanged |
| D-07 | « Pour qui » texte libre + contact lié optionnel ; nextOccasion si contact daté | ✓ VERIFIED | Unchanged; tests green |
| D-08 | Idées masquées au destinataire (règle surprise), serveur + repli UX | ✓ VERIFIED | Unchanged; masked view path intact (0080 untouched, reads still via `gift_items_for_list`) |
| D-09 | Anniversaires agrègent birthdays + contacts datés en une seule vue | ✓ VERIFIED | Unchanged; aggregation tests green |
| D-10 | Case « créer aussi un contact » cochée par défaut, décochable ; garde anti-doublon serveur | ✓ VERIFIED | Unchanged; 0078 untouched |
| D-11 | Helper nextDate partagé Europe/Paris (idées + anniversaires) | ✓ VERIFIED | Unchanged |
| D-12 | Fusion nom normalisé + jour/mois (badge deux sources) ; rappels 06h40 dédupliqués | ✓ VERIFIED | Unchanged; cron 0012 still unmodified (verified: no diff on dispatch path from 0082/0083 — redeem/reserve only) |
| D-13 | Photo contact prioritaire en vue agrégée, repli photo birthday | ✓ VERIFIED (strengthened) | `displayPhotoUrl` unchanged + drive-by `d64a30a`: birthday-form-dialog now supports local file upload via `depositHouseholdFile` (folder `anniversaires`) — was URL-only. UAT 5 pass live |
| D-14 | Suppression cascade vers le miroir avec confirmation modale | ✓ VERIFIED | Unchanged; cascade tests green |
| D-15 | Défauts 90j / 20 usages ; bornes ≤90j, 1-100 | ✓ VERIFIED | Unchanged; 0079 untouched |
| D-16 | Rachat : membres cochés par l'owner + externes via lien (e-mail, sans compte) | ✓ VERIFIED (strengthened) | 0082: redeem upgrades pre-existing `lecture` share → `reservation` (0027 green, idempotent `already_shared` preserved). Guest page `/invitation/cadeau?code=` created (16da7c4, OQ-1 OPTION A: signup-then-redeem, no anonymous path). UAT 1+2 pass live |
| D-17 | Droits rachat : lecture + réservation (jamais réserve aveugle, jamais admin) | ✓ VERIFIED (strengthened) | 0083: reservation-share holders may UPDATE `reserved_by`/`purchased` on private lists via column-guarded trigger `has_gift_reservation` (0028 green incl. RLS-no-visible-row fix c748179). Redeem still inserts `reservation` only; manage still owner\|admin. UAT 1 pass live |
| D-18 | UX partage identique ardoise : Copier / Partager / Régénérer / Arrêter (+ QR) | ✓ VERIFIED (strengthened) | b16b0f7: dialog shows « Générer » when `summary.hasCode` false (null ≠ error distinguished, `gift-share-dialog.tsx:165-198`). 16da7c4: QR colors pinned to hex (`#1c2b26`/`#ffffff`, `qr-code.tsx:27`) — lib rejects oklch. UAT 4 (physical scan) pass live |

**Score:** 18/18 truths verified (0 present-behavior-unverified). No truth regressed; D-13/D-16/D-17/D-18 strictly strengthened by forward corrections (0079/0080 untouched; 0082/0083 additive).

### Drive-By Fix Verification (post-prior-digest commits)

| Commit | Claim | Status | Evidence |
|--------|-------|--------|----------|
| b16b0f7 | Share dialog shows Générer when no code (null ≠ error) | ✓ VERIFIED | `gift-share-dialog.tsx:61-63,78,165-198`: `summary`/`lastCode` nulled on close+revoke; `hasCode` ternary Générer/Régénérer; error path separate (toast) |
| 4935da2 | Private shared list visible to its invitee (member or e-mail) | ✓ VERIFIED | `use-cadeaux.ts:77-96`: `sharedListIds` from shares by member-id or normalized e-mail; filter keeps `privee` iff owner or invited |
| 6b6023a | Owner sees neutral `Réservé` badge (who masked) | ✓ VERIFIED | `cadeaux-page.tsx:544-547`: amber `Réservé` on `item.purchased` (view-exposed), never `reserved_by` (NULL via view) |
| b594e66 | Owner marks `Reçu` without touching reserved_by | ✓ VERIFIED | `cadeaux-page.tsx:278-282` `handleToggleReceived` updates `{purchased}` only; non-owner path (`handleTogglePurchased`, :265-271) still sets `reserved_by` = self — surprise direction preserved |
| 16da7c4 | Guest `/invitation/cadeau` page + route + QR hex | ✓ VERIFIED | `guest-cadeau-page.tsx` (redeem via `redeemGiftListInvite`, code≥22, revoked/expired message, offline guard) + route `router.tsx:262` + `guest-cadeau-page.test.tsx` (88 lines) + hex pin `qr-code.tsx:27` |
| 9156e2f | Redeem upgrades lecture→reservation (0082 + 0027) | ✓ VERIFIED | Migration forward-correct (0079 untouched), 0027 (92 lines) green in 30/30 run |
| e034352 + c748179 | Reservation invitee may reserve on private list (0083 + 0028) | ✓ VERIFIED | Column-guard trigger pattern (RLS can't filter columns); 0028 (98 lines) green after RLS-no-visible-row assertion fix |
| d64a30a | Contacts counter dedup + birthday local photo upload | ✓ VERIFIED | `birthday-form-dialog.tsx:56-80,144-165` upload flow; cadeaux-page counter uses `pluralize` helper |

### Review Disposition Check (unchanged — 11/11 closed per 05-SECURITY.md)

WR-01/03/07 fixed and still fixed (no reversions in drive-bys — `git log` shows no touch to Edge matchers, masked-view reads, or database types beyond additive rows). WR-02/04/05/06 + 5 Infos remain open → backlog, acknowledged, unchanged. Cross-phase ardoise-invite WR-01 sibling still out of scope (not touched — correctly).

### Security Register (05-SECURITY.md, 11/11 CLOSED — delta verified)

Post-review additions confirmed in code + green tests: 0082 lecture→reservation upgrade (0027), 0083 reservation UPDATE + column guard (0028, 30/30), use-cadeaux private-visibility, owner neutral badge + Reçu switch. No new threat surface: no publishable route added (guest page redeems as user session), no RLS policy added (0083 uses trigger guard, table invites still policy-free + service_role-only), no secret handling change.

### Required Artifacts (delta only; prior 0076–0080 + 0024–0026 re-confirmed via 30/30 suite)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/0082_gift_redeem_upgrade.sql` | redeem upgrades lecture→reservation | ✓ VERIFIED | Forward `CREATE OR REPLACE`, oracle/idempotence preserved, 0027 green |
| `supabase/migrations/0083_gift_reserve_update.sql` | reservation UPDATE on private + column guard | ✓ VERIFIED | `has_gift_reservation` helper, trigger-bounded to `reserved_by`/`purchased`, 0028 green |
| `supabase/tests/0027_gift_redeem_upgrade.sql` | proof 0082 | ✓ VERIFIED | 92 lines, green in test-db 30/30 |
| `supabase/tests/0028_gift_reserve_update.sql` | proof 0083 | ✓ VERIFIED | 98 lines, green after c748179 assertion fix |
| `app/src/modules/cadeaux/guest-cadeau-page.tsx` + test + route | public invite page OQ-1 A | ✓ VERIFIED | 136 lines + 88-line test + `router.tsx:262`; phase-05 Vitest 42/42 |
| `app/src/components/shared/qr-code.tsx` | hex colors | ✓ VERIFIED | `:27` hex pin with rationale comment |
| Modified: gift-share-dialog, use-cadeaux, cadeaux-page, birthday-form-dialog | drive-by fixes | ✓ VERIFIED | Each traced to commit above; no stubs |

### Key Link Verification (delta)

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Guest page | Edge redeem | `redeemGiftListInvite(code, email)` | ✓ WIRED | `guest-cadeau-page.tsx:37`; user-session path, no anonymous reserve |
| Private list UI | shares | `sharedListIds` filter | ✓ WIRED | `use-cadeaux.ts:81-96`; invitee sees list, others still excluded |
| Reçu switch (owner) | gift_items.purchased | `handleToggleReceived` | ✓ WIRED | `:280-282`; `reserved_by` untouched — masked-view invariant holds |
| Réservé badge | masked view | `item.purchased` only | ✓ WIRED | `:547`; no `reserved_by` leak to owner |
| Reservation UPDATE | trigger guard | `has_gift_reservation` | ✓ WIRED | 0083; non-managers bounded to 2 columns, self-or-NULL |
| QR | invite link | hex-color QRCode | ✓ WIRED | renders instead of placeholder (UAT 4 physical scan pass) |

### Data-Flow Trace (Level 4) — delta

| Artifact | Data Variable | Source | Real Data | Status |
|----------|---------------|--------|-----------|--------|
| Guest page | `redeemQuery.data` | Edge → RPC redeem | ✓ (UAT 2 live) | ✓ FLOWING |
| Shared-private list | filtered `lists` | PostgREST + shares join | ✓ (UAT 1 live, Bob sees Alice's list) | ✓ FLOWING |
| Owner badge | `item.purchased` | masked view | ✓ (UAT 1 owner neutral badge live) | ✓ FLOWING |
| Birthday photo | `deposited.url` | Storage private bucket | ✓ (UAT 5 live) | ✓ FLOWING |

### Behavioral Spot-Checks (re-run this verification)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase-05 Vitest (cadeaux/contacts/anniversaires) | `npx vitest run src/modules/cadeaux src/modules/contacts src/modules/anniversaires` | 7 files, 42/42 pass (26s) | ✓ PASS |
| SQL suite | `sh scripts/test-db.sh` | 30 files, all green (was 27/27 → +0027/+0028/+0081) | ✓ PASS |
| Static SQL | `python3 scripts/check-sql-statique.py` | 129 effective functions / 84 migrations / 32 tests, no defects | ✓ PASS |
| Typecheck phase-05 files | `npx tsc --noEmit` filtered | 0 errors in cadeaux/contacts/anniversaires/guest/qr-code files | ✓ PASS (with note) |
| e2e | per 05-05 SUMMARY + unchanged since | 43/43 (reported, spec file unchanged — covered, not re-run: needs browser) | ✓ PASS (reported) |

Note: unfiltered `tsc` reports errors **only** in `app/src/modules/courses/types.ts` (`"Ménage"` vs rayon union) — uncommitted work from another phase (`git status: M courses/types.ts`), untouched by phase 05, out of scope. No phase-05 file errors.

### Requirements Coverage

D-01…D-18 all covered (table above). No orphaned requirements: plans 05-01…05-05 claim map unchanged; drive-bys strengthen D-13/D-16/D-17/D-18 without adding requirements. Migrations 0081 (`author_update_fix`, taches phase) is out-of-phase-scope but present in suite — correctly NOT claimed here.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| Drive-by files (guest page, use-cadeaux, share dialog, cadeaux-page, 0082/0083) | No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER/`return null` stubs/`console.log` | — | Clean |
| `app/src/modules/courses/types.ts` (uncommitted, other phase) | type errors | 📋 Advisory (out of scope) | None for phase 05; flagged, not blocking |

### Human Verification Required

None remaining for phase scope. Prior 6 items resolved: UAT 1–5 **pass live 2026-10-06** (accepted as fact per verification brief, not re-demanded); UAT 6 (browser push delivery) is a physical-device block outside phase-05 code scope — preserved below as an acknowledged gap, not a phase gate.

### Acknowledged Gaps (preserved from prior VERIFICATION.md + UAT 2026-10-06)

- Test 6 browser delivery: server chain proven 3× (200/delivered:1/consumed:1, real Mozilla endpoint), Firefox 156 never fires the push event (no SW receipt after resync + fresh endpoint). Retest on another browser/device. UAT status: blocked (physical-device).
- Backlog (non-blocking): WR-02/04/05/06 + 5 Infos (05-REVIEW-DISPOSITION.md); foyer-less external journey (shared view + reserved_by_email); reverse item→idea propagation (needs loop guard); ardoise curly-quote sibling.
- UAT-accepted notes 2026-10-06: reveal-to-owner explicitly declined (statu quo, surprise kept); local autoconfirm for external signup is local-only; contacts-shell double count + birthday URL-only photo fixed via drive-bys (d64a30a).

### Gaps Summary

No blocking gaps. All 18 locked decisions implemented, wired, and covered by automated evidence re-run in this verification (Vitest 42/42 phase-05, SQL 30/30, static green, phase-05 typecheck clean). The 8 post-digest drive-by commits were each traced to code and strengthen (never weaken) their decisions; forward-correction discipline honored throughout (0079/0080 untouched, 0082/0083 additive). UAT 1–5 pass live; the single remaining blocked item (browser push delivery) is a device-dependent dispatch concern outside phase-05 code, explicitly acknowledged. Previous `human_needed` → `passed` on re-verification.

---

_Verified: 2026-10-06T12:00:00Z_
_Verifier: the agent (gsd-verifier, re-verification)_
_Prior: 2026-10-05T21:50:00Z human_needed 18/18 digest v2:sha256:71413c3b…_
