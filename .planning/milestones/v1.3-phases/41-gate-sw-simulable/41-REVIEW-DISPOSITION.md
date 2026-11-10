---
phase: 41
review: 41-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "Le serveur du harnais meurt sur une exception non attrapée dans le handler de requête"
  - id: WR-02
    severity: warning
    disposition: open
    title: "La preuve anti-prod A2 devient un contrôle qui ne regarde rien si `find` ne rend aucun fichier"
  - id: WR-03
    severity: warning
    disposition: open
    title: "Un run interrompu laisse `app/dist` cassé et `dist.original-sw-gate` orphelin"
  - id: WR-04
    severity: warning
    disposition: open
    title: "Fenêtre de course résiduelle entre `kill -0` et le curl de readiness"
  - id: IN-01
    severity: info
    disposition: open
    title: "`ready()` est un no-op alors que sa doc promet « l'app est montée »"
  - id: IN-02
    severity: info
    disposition: open
    title: "Aucune garde contre le cumul `E2E_BASE_URL` + `E2E_SW_BASE_URL`"
  - id: IN-03
    severity: info
    disposition: open
    title: "Fenêtre d'observation d'absence de 3 s fondée sur le temps dans le cas « gate fermée »"
open: 7
total: 7
recorded: 2026-11-10T11:10:00Z
---

# Phase 41: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently.
