---
phase: "05"
slug: "cadeaux-contacts"
threats_open: 0
asvs_level: 1
audited: "2026-10-06"
---

# Phase 05 — Security Review (SECURITY.md)

Threat register authored at plan time (T-05-01…T-05-11, all `mitigate`), verified against implementation (ASVS L1 grep-depth + live UAT). No auditor spawn (short-circuit: threats_open 0, register at plan time, L1).

## Threat Register

| ID | Category | Component | Severity | Status | Evidence |
|----|----------|-----------|----------|--------|----------|
| T-05-01 | Info Disclosure | gift_ideas SELECT / can_read_gift_idea | high | CLOSED | RLS helper in 0076; surprise assertion bounded per foyer in 0024 (test-db green) |
| T-05-02 | Elevation of Privilege | gift_ideas/contacts INSERT (enfant) | high | CLOSED | WITH CHECK writers-only + validate_member_refs; refusal tests 0024/0025 |
| T-05-03 | Info Disclosure | gift_items.reserved_by → owner | high | CLOSED | Masked view 0080 + UI reads view (7b2eadb, WR-03 fix); owner/non-owner assertions 0026 |
| T-05-04 | Info Disclosure | invites oracle | high | CLOSED | Uniform `code invalide` SQL→Edge→UI; WR-01 straight-quote fix (3afa24a); 0026. Residual: malformed-email 400 vs 404 heartbeat (WR-02, backlog — 128-bit + rate-limit, low exploitability) |
| T-05-05 | Tampering | redeem double-spend use_count | high | CLOSED | FOR UPDATE + atomic increment in RPC; idempotent already_shared consumes nothing (0026/0027) |
| T-05-06 | Info Disclosure | GIFT_LIST_INVITE_HMAC_SECRET exfiltration | high | CLOSED | Vault/prod wiring + local .env only; repo grep for value: empty; Edge fail-closed when absent |
| T-05-07 | Elevation of Privilege | redeem self-admin/write | high | CLOSED | Edge `auth:['user','publishable']` with 401-refuse on non-user (OQ-1 A); redeem inserts `reservation` only; manage = owner\|admin rechecked in RPC |
| T-05-08 | Info Disclosure | client-side surprise filter as barrier | high | CLOSED | Server barrier can_read_gift_idea (0024); UI filter documented UX-only; masked view wired (WR-03) |
| T-05-09 | Info Disclosure | idea photos public hotlink | medium | CLOSED | depositHouseholdFile (cadeaux/contacts/anniversaires), private bucket, browser compression |
| T-05-10 | Info Disclosure | cross-foyer fusion via homonym key | high | CLOSED | Every row RLS-scoped; fusion key never joins cross-foyer; inter-foyer tests 0025 |
| T-05-11 | Tampering | contact delete orphan mirror | medium | CLOSED | FK ON DELETE CASCADE + ConfirmDialog (D-14); cascade test 0025 |

## Post-review additions (UAT-driven, same bar)

- 0082 redeem upgrades `lecture`→`reservation` (0027 green).
- 0083 reservation-share UPDATE on private lists + trigger column guard (0028 green, 30/30).
- use-cadeaux: private list visible to explicit invitee (member/email).
- Owner neutral `Réservé` badge + `Reçu` switch (reserved_by untouched).

## Accepted risks / backlog

- WR-02 oracle heartbeat, WR-04/05/06, 5 Infos (05-REVIEW-DISPOSITION.md).
- Foyer-less external journey (shared view + reserved_by_email) — future phase.
- Reverse item→idea offert propagation (loop guard) — backlog.
- Test 6 browser delivery: server chain proven (200/delivered/consumed ×3), Firefox 156 never fires the event — retest on another browser/device.

## Security Audit 2026-10-06

| Metric | Count |
|--------|-------|
| Threats found | 11 |
| Closed | 11 |
| Open | 0 |
