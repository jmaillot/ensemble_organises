---
phase: 21
review: 21-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: fixed
    title: "Swallowed `DataError` makes callers delete a still-referenced photo"
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "The guest signer trusts a client-writable raw value with no household or scheme validation"
  - id: IN-01
    severity: info
    disposition: fixed
    title: "Remove-photo control and the photo affordance are gated on different values"
  - id: IN-02
    severity: info
    disposition: fixed
    title: "Fullscreen dialog state (`open`) is not reset when a preview dies"
  - id: IN-03
    severity: info
    disposition: fixed
    title: "Duplicated helpers that already exist elsewhere"
  - id: IN-04
    severity: info
    disposition: fixed
    title: "`photo_path` doc comment omits the leading household segment"
open: 0
total: 6
recorded: 2026-10-16T17:58:00.000Z
---

# Phase 21: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | fixed | 21-05 3bb2e45 — `writeStepPhoto` rend `landed`, le nettoyage destructif est conditionné, l'objet neuf est retiré quand l'écriture n'atterrit pas |
| WR-01 | warning | fixed | 21-05 22dd47b — migration `0126` : `check (photo_path is null or starts_with(photo_path, household_id || '/'))` + test SQL 0126 (étranger refusé, `null` et foyer acceptés) |
| IN-01 | info | fixed | 21-05 3bb2e45 — bouton de retrait conditionné sur `step.photoPath && props.photoUrl`, la même vérité que l'image rendue |
| IN-02 | info | fixed | 21-05 3bb2e45 — `setOpen(false)` dans l'ajustement de rendu qui remet `shownUrl` et `dead` |
| IN-03 | info | fixed | 21-05 3bb2e45 — `isRecipeCoverPath` supprimé, `isHouseholdMediaPath` (lib/storage.ts) fait foi |
| IN-04 | info | fixed | 21-05 3bb2e45 — commentaire de `database.ts` corrigé : préfixe `<householdId>/` rétabli |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.

> **Dispositions saisies à la main**, pas par le constructeur du crochet : les constats ont
> été clos par le **plan de fermeture d'écart `21-05`** (vague 4), et non par `/gsd-code-review
> 21 --fix`. Le constructeur ne réconcilie `fixed` qu'à partir d'un `21-REVIEW-FIX.md`, absent
> ici : l'exécuter aurait rendu six lignes `open`, un registre **factuellement faux**. Chaque
> Source nomme donc le commit qui a réellement clos le constat, vérifié dans l'arbre par le
> vérificateur de phase (`21-VERIFICATION.md`, 31/31).
