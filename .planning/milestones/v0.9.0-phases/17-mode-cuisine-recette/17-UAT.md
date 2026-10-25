---
status: complete
phase: 17-mode-cuisine-recette
source: [17-VERIFICATION.md]
started: 2026-10-14T16:35:00Z
updated: 2026-10-18T10:10:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Re-test mode cuisine sur mobile — sticky sous topbar + toggle en haut à droite
expected: En mode cuisine au scroll : topbar intacte et cliquable, compteur N/M + barre collés dessous. À 390px et 360px : toggle sur la ligne du titre en haut à droite, zéro scroll horizontal. (1er passage : sticky OK mais recouvrement topbar G-17-1 + toggle sous description G-17-2, tous deux fixés par 17-03/17-04)
result: pass

### 2. Activer Mode cuisine sur un vrai téléphone (Chrome/Safari), verrouiller/déverrouiller, changer d'onglet puis revenir, désactiver
expected: Écran maintenu allumé en ON, relâché en OFF/sortie, réacquis au retour visible, aucune erreur si non supporté (mention discrète)
result: pass

### 3. Parcourir le lien invité /invitation/recette sur un second appareil
expected: Même toggle + vue + mémoire locale, zéro édition, progression indépendante par appareil
result: pass

### 4. Re-test toggle ON — pastille contenue dans la piste (fix G-17-3)
expected: Sur la fiche recette, activer Mode cuisine : à l'état ON la pastille du switch est entièrement contenue dans la piste (aucun dépassement à droite). Même rendu côté invité. Preuve auto : bounding-box Playwright 390px ON/OFF verte.
result: pass
note: "Confirmed by user 2026-10-18. Couvert aussi par e2e app/e2e/recettes-switch-geometry.spec.ts (pastille contenue à ON et OFF), vert sur desktop + mobile (123/123, 5 sautés, 2026-10-18)."

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-17-1
  truth: "Compteur N/M + barre sticky visibles en scroll, sous la barre menu/notifications/profil (pas de recouvrement)"
  status: resolved
  resolved_by: 17-03-SUMMARY.md
  resolved_at: 2026-10-14
  reason: "User reported: oui elle est bien en sticky, par contre elle passe par dessus la barre avec le menu / notifications / profil"
  severity: minor
  test: 1
  artifacts: [app/src/modules/recettes/components/recipe-cuisine-view.tsx, app/src/app/app-shell.tsx]
  missing: ["offset sticky sous la topbar (top-0 + z-10 identiques => recouvrement DOM-order)"]
- gap_id: G-17-2
  truth: "Toggle Mode cuisine en haut à droite du panneau Étapes (D-12), y compris mobile"
  status: resolved
  resolved_by: 17-04-SUMMARY.md
  resolved_at: 2026-10-14
  reason: "User reported: le bouton toggle Mode cuisine sort du cadre. Playwright (390px + 360px, démo) : le header Panel passe en flex-col sous 650px (module-shell.tsx:80), le toggle tombe sous la description au lieu de rester en haut à droite — preuve /tmp/opencode/cuisine-panel-390.png"
  severity: minor
  test: 1
  artifacts: [app/src/components/shared/module-shell.tsx, app/src/modules/recettes/components/cuisine-toggle.tsx, app/src/modules/recettes/recette-detail-page.tsx, app/src/modules/recettes/guest-recipe-page.tsx]
  missing: ["slot action inline en haut à droite sur mobile sans régression des autres panneaux"]
- gap_id: G-17-3
  truth: "Pastille du switch contenue dans le bouton Mode cuisine à l'état ON (aucun dépassement)"
  status: resolved
  resolved_by: 17-05-SUMMARY.md
  resolved_at: 2026-10-15
  reason: "User reported: le toggle dépasse un peu de son cadre lorsqu'il est activé. Playwright + lecture code : piste w-[38px] (bordures 2px + padding 2px = 30px utiles), pastille 18px + translate-x-4 (16px) = 34px > 30px, dépassement ~4px à droite — preuve /tmp/opencode/toggle-on-card.png"
  severity: minor
  test: 1
  artifacts: [app/src/components/ui/primitives.tsx, app/src/modules/recettes/components/cuisine-toggle.tsx]
  missing: ["course translate corrigée (12px) ou piste élargie, sans régression des autres consommateurs Switch"]

## Deferred Follow-Ups

- test: hors-session (remontée post-UAT)
  idea: "Possibilité de mettre des photos dans les étapes de recette"
  deferred_at: 2026-10-14
