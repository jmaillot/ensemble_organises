---
phase: 31
review: 31-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: open
    title: "L'UI affirme une invalidation des liens précédents que la migration 0176 a supprimée"
  - id: MAJ-01
    severity: warning
    disposition: open
    title: "le RPC preview est exécutable par `anon` directement sur PostgREST — la rate-limit de l'Edge est contournable"
  - id: MAJ-02
    severity: warning
    disposition: open
    title: "clé de rate-limit = premier élément de `X-Forwarded-For`, forgable par le client"
  - id: MAJ-03
    severity: warning
    disposition: open
    title: "critères d'acceptation prod non prouvés — attestations orales seules (31-05/31-06)"
  - id: MIN-01
    severity: info
    disposition: open
    title: "garde client `redeemInviteToken` incohérente — seuil 16, message 22"
  - id: MIN-02
    severity: info
    disposition: open
    title: "expiration construite en UTC arbitraire côté panneau, en heure locale côté lib"
  - id: MIN-03
    severity: info
    disposition: open
    title: "rate-limit appliqué APRÈS `parseBody` — rafale de corps invalides non limitée"
  - id: MIN-04
    severity: info
    disposition: open
    title: "message 404 trompeur de `resolveHousehold`"
  - id: MIN-05
    severity: info
    disposition: open
    title: "`QrCode` encode le token brut, pas l'URL d'invitation"
  - id: NIT-01
    severity: info
    disposition: open
    title: "code mort — `inviteHeaders` et `INVITE_SECRET_HEADER`"
  - id: NIT-02
    severity: info
    disposition: open
    title: "backticks rendus tels quels dans l'UI"
  - id: NIT-03
    severity: info
    disposition: open
    title: "router Traefik `PathPrefix` sans frontière de segment"
  - id: NIT-04
    severity: info
    disposition: open
    title: "abandon d'inscription — token en attente non purgé"
open: 13
total: 13
recorded: 2026-11-03T14:55:00Z
---

# Phase 31: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | open | - |
| MAJ-01 | warning | open | - |
| MAJ-02 | warning | open | - |
| MAJ-03 | warning | open | - |
| MIN-01 | info | open | - |
| MIN-02 | info | open | - |
| MIN-03 | info | open | - |
| MIN-04 | info | open | - |
| MIN-05 | info | open | - |
| NIT-01 | info | open | - |
| NIT-02 | info | open | - |
| NIT-03 | info | open | - |
| NIT-04 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Severity mapping (frontmatter de la review en major/minor/nit, vocabulaire du ledger critical/warning/info) : major→warning, minor→info, nit→info.
Set `deferred` by hand and put the reason in the Source cell; both are preserved.
