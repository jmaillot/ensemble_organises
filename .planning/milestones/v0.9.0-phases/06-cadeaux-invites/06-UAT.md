---
status: complete
phase: 06-cadeaux-invites
source: [06-VERIFICATION.md]
started: 2026-10-06T18:00:00Z
updated: 2026-10-08T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Real-phone code-link scan
expected: Scan a code link on a physical phone, declare a name, reserve. Guest journey works without account; organizer sees « Réservé ».
result: pass
reported: "Email bien reçu, nom + réserve OK sur les 2 cadeaux, mais détails des cadeaux invisibles (réserve seule, pas de contenu). Avec un compte, 'Ouvrir les cadeaux' force à rejoindre/créer un foyer — je veux participer sans foyer."
note: "Original issue resolved via gap plans 06-04→06-14 (all G-06-* passed); re-tested OK on prod 2026-10-08 (rebuild + full re-test confirmed by user)."
severity: major

### 2. One-real-email eyeball
expected: Open a received invitation — sober rendering, clickable code link, admin sender address, host message shown when present.
result: pass

### 3. Supervised production TLS send
expected: Provision SMTP secrets, recreate functions service, send via 465/TLS. Delivery via prod relay; first real Edge npm:nodemailer resolution observed in logs.
result: pass
note: "Confirmed by user 2026-10-08: SMTP secrets provisioned on ubuntu1, real delivery via prod relay."

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-06-1a
  truth: "Guest sees gift details (content), not just reserve affordance"
  status: passed
  reason: "Closed by 06-04 (2026-10-07): guest-view carries url + ephemeral photoUrl, rows render photo + Voir link, D-07 masking proven at all tiers"
  severity: major
  test: 1
  artifacts: []
  missing: []
- gap_id: G-06-1b
  truth: "Invited account holder finds and reserves on the shared list"
  status: passed
  reason: "Closed by 06-05 (2026-10-07): explicit join-vs-anonymous choice, redeem path argument-identical, anonymous path sessionless (withoutSession). Cross-household list merging recorded as deferred, not a gap."
  severity: major
  test: 1
  artifacts: []
  missing: []
- gap_id: G-06-1a-bis
  truth: "Guest taps a row to reveal full gift detail inline"
  status: passed
  reason: "UAT 2026-10-07: content renders (06-04 works) but rows are inert — reporter expects tap-to-detail. Closed by 06-06 (aaa3f5b + 60aacf9, Vitest 44/44 + e2e 8/8)."
  severity: minor
  test: 1
  artifacts: []
  missing: []
- gap_id: G-06-1b-bis
  truth: "Joined cross-household list is visible and reservable in Cadeaux"
  status: passed
  reason: "UAT 2026-10-07: redeem into another household's list leaves it invisible. Closed by 06-07 (eab6aeb 0093+0094+0033+Edge member-reserve, c1513ed snapshot merge + origin badge, 2fdf29c e2e 10/10): verified-profile-name attribution (0094 pivot, guard 0083 intact), no RLS widening. Orchestrator fix ed60ad3 (async findBy flake)."
  severity: major
  test: 1
  artifacts: []
  missing: []
- gap_id: G-06-1c
  truth: "Invited member leaves a foreign list keeping name-attributed holds, rejoin via link"
  status: passed
  reason: "UAT request 2026-10-07 (option 'nom seul, liste sortie'): no leave path exists (organizer-only revoke). Closed by 06-08 (429f8ff RPC 0095 + Edge member-leave + 0034, dea5f32 quit control + modal, 6925a77 e2e 14/14)."
  severity: minor
  test: 1
  artifacts: []
  missing: []
- gap_id: G-06-1d
  truth: "Organizer understands cutting shares does not revoke the code link"
  status: passed
  reason: "UAT 2026-10-07: cut all shares, guest still visible via code link (by design D-05/D-06, undisclosed in UI). Closed by 06-09 (c678f63 warning + reminder, 3ad2f54 suite 7/7, e2e 14/14)."
  severity: minor
  test: 1
  artifacts: []
  missing: []
- gap_id: G-06-1e
  truth: "Share dialog has no redundant non-sending email field; members-only submit fabricates no email share"
  status: passed
  reason: "UAT request 2026-10-07: field verified redundant (0082 redeem + send-email upsert the share; code link independent). Closed by 06-10 (fda1082 removal, 761d0dd suite, Vitest 73/73, e2e 14/14)."
  severity: minor
  test: 1
  artifacts: []
  missing: []
- gap_id: G-06-1f
  truth: "List navigation is toggle-driven with foreign lists in their own filter slot"
  status: passed
  reason: "UAT request 2026-10-07: toggle list selector, top 'Créer une liste', Toutes/Privées/Foyer/Partagées auto-filter. Closed by 06-11 (2c66d51 selector + top button, 69f223e four-way filter + proofs, Vitest 74/74, e2e 14/14)."
  severity: minor
  test: 1
  artifacts: []
  missing: []
- gap_id: G-06-20
  truth: "Owner unchecking Reçu on a reserved item confirms release; no silent badge-gone state"
  status: passed
  reason: "UAT 2026-10-07: unchecking hides the badge while guests still see reserved (masked view shows holds only via purchased). Closed by 06-12 (ad74c0b delegating uncheck + relabel, f99b56e proofs, Vitest 77/77, e2e 14/14)."
  severity: minor
  test: 1
  artifacts: []
  missing: []
- gap_id: G-06-21
  truth: "List actions share one toolbar, selector labeled small, sharing grants reservation by default"
  status: passed
  reason: "UAT request 2026-10-07: tidy Partager/Supprimer placement, small labeled selector, reservation-only sharing (D-04 amended). Closed by 06-13 (f00e87a toolbar + selector, 186736c reservation default, 614614d proofs, Vitest 77/77, Edge redeployed, e2e 14/14)."
  severity: minor
  test: 1
  artifacts: []
  missing: []
- gap_id: G-06-22
  truth: "Single uncheck-to-release path, no redundant standalone release button"
  status: passed
  reason: "UAT 2026-10-07: uncheck now does what Libérer did — remove the duplicate. Closed by 06-14 T1 (a9189f1, modal is the only path)."
  severity: minor
  test: 1
  artifacts: []
  missing: []
- gap_id: G-06-23
  truth: "Member releases own foreign-list hold; other's hold answers clean conflict"
  status: passed
  reason: "UAT 2026-10-07: cannot uncheck after reserving on a joined foreign list (switch disabled on held items, no own-release path). Closed by 06-14 T2-T3 (0096 reserve-or-release + 0035, enabled toggle, clean 409)."
  severity: major
  test: 1
  artifacts: []
  missing: []
- gap_id: G-06-24
  truth: "Quit is red under the selector, origin badge removed"
  status: passed
  reason: "UAT 2026-10-07: Quit misplaced for guests, badge redundant with Partagées filter. Closed by 06-14 T3 (123051e red Quit under selector, badge removed)."
  severity: minor
  test: 1
  artifacts: []
  missing: []
