---
phase: 37
review: 37-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "La marche « bon compte » est gatée sur une heuristique de copie serveur"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "`callArdoiseInvite` jette le statut HTTP ; toute erreur devient un message générique"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "Copie d'erreur « lien révoqué » affichée pour tout échec de `link-view`, garde `isSupabaseConfigured` contournée via l'URL"
  - id: WR-04
    severity: warning
    disposition: fixed
    title: "Le lien invité public expose les soldes des membres `enfant`, exclus partout ailleurs"
  - id: WR-05
    severity: warning
    disposition: fixed
    title: "État de join non réinitialisé au changement de code — message de succès égaré sur une autre ardoise"
  - id: IN-01
    severity: info
    disposition: open
    title: "Scan outbox dupliqué entre `signOut` et `assertSignOutAllowed`"
  - id: IN-02
    severity: info
    disposition: open
    title: "Deux imports dynamiques de `@/app/router` dans un même `signOut`"
open: 2
total: 7
recorded: 2026-11-08T08:53:57.437Z
---

# Phase 37: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | fixed | b2ec826 — aide déclenchée par statut 403 (InviteRequestError), plus par la copie |
| WR-02 | warning | fixed | b2ec826 — InviteRequestError porte le statut HTTP |
| WR-03 | warning | fixed | b2ec826 — garde config sur l'URL + message 5xx générique (test nouveau) |
| WR-04 | warning | fixed | b2ec826 — filtrage enfant côté Edge (buildGuestView) : noms, participations, soldes, transferts |
| WR-05 | warning | fixed | b2ec826 — activeCode suit l'URL + reset du join au changement de code (test nouveau) |
| IN-01 | info | open | - |
| IN-02 | info | open | - |

Re-review du delta des correctifs (`b2ec826`) : `37-REVIEW-FIX.md`, status `issues_found` — 0 critique, 0 warning, 2 info (garde mort api.ts:315 ; select service-role `household_members` index.ts:656, préexistant, hors delta). Les 5 correctifs WR-01..05 confirmés résolus, 11/11 tests verts, conventions conformes.

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved.
