---
phase: 30-hygi-ne-du-jalon-dettes-et-r-sidus
plan: 05
subsystem: frontend-mobile-ui
tags: [det-05, feuilles-mobiles, animation-sortie, césure, radix-dialog, e2e]
requires: [app-tile.tsx, mobile-drawer.tsx, dialog.tsx, app.css]
provides: [mécanisme partagé FeuillePortal/DialogContent feuille, animation de sortie des feuilles basses, spec e2e feuille-mobile-plus]
affects: [product-sheet.tsx, app-shell (tiroir)]
tech-stack:
  added: []
  patterns: [Radix Présence pour l'animation de sortie (data-state=closed), classes partagées feuille-mobile/feuille-mobile-overlay]
key-files:
  created: [app/e2e/feuille-mobile-plus.spec.ts]
  modified: [app/src/components/shared/app-tile.tsx, app/src/components/shared/mobile-drawer.tsx, app/src/components/ui/dialog.tsx, app/src/styles/app.css, app/src/modules/courses/components/product-sheet.tsx]
key-decisions:
  - "D-15 amendée : forceMount ÉCARTÉ — la machinerie modale Radix (hideOthers, focus guards) reste active feuille fermée et laissait la page entière aria-hidden (prouvé par scan-flow.test en échec) ; la sortie animée s'appuie sur la Présence Radix, qui garde le contenu monté PENDANT l'animation de sortie puis démonte proprement"
  - "Inventaire D-16 consigné : feuilles du même mécanisme = MobileDrawer (classe feuille-mobile, feuille « Plus ») + ProductSheet via DialogContent (même gabarit Radix bas ≤650px) ; les ~40 autres consommateurs de DialogContent partagent le gabarit mais n'avaient aucune animation et restent inchangés"
  - "Sortie animée scopée ≤650px (gabarit feuille basse) ; l'overlay fermé perd ses pointeurs à toutes les largeurs pour ne pas intercepter un clic pendant la glissade"
requirements-completed: [DET-05]
duration: ~1h20
completed: 2026-10-31
status: complete
commits: 3
plan_head_before: 540f910
plan_head_after: 3f879b4
coverage:
  - deliverable: "« Anniversaires » rendu entier sans césure à 390px (D-14)"
    verification: [{ kind: e2e, ref: "app/e2e/feuille-mobile-plus.spec.ts#anniversaires-entier", status: pass }]
    human_judgment: false
  - deliverable: "Zéro débordement horizontal feuille ouverte à 390px"
    verification: [{ kind: e2e, ref: "app/e2e/feuille-mobile-plus.spec.ts#aucun-debordement", status: pass }]
    human_judgment: false
  - deliverable: "Animation de sortie miroir de l'entrée (340ms --ease-drawer, 200ms ease-out, repli reduced-motion opacity seule) — valeur esthétique du mouvement"
    verification: [{ kind: e2e, ref: "app/e2e/feuille-mobile-plus.spec.ts#cycle-ouverture-fermeture", status: pass }]
    human_judgment: true
    rationale: "L'e2e prouve le mécanisme (état closed monté puis démonté) ; la qualité visuelle du mouvement se constate sur appareil."
  - deliverable: "Chaîne complète §2.7 verte (typecheck, 1682 tests, build, e2e 161 passés / 7 skips viewport)"
    verification: [{ kind: command, ref: "cd app && npm run typecheck && npm test && npm run build && npm run test:e2e", status: pass }]
    human_judgment: false
---

# Phase 30 Plan 05: Feuilles mobiles — césure et animation de sortie Summary

**DET-05 clos : « Anniversaires » entier sans césure à 390 px (D-14), animation de sortie des feuilles basses via mécanisme partagé posé une fois (D-15/D-16), preuve e2e Playwright au vert (D-17).**

## Accomplishments

- **D-14** : `hyphens-auto` d'AppTile remplacé par `hyphens-none` + `[text-wrap:balance]` — le nom d'espace n'est jamais césuré, la balance répartit les deux lignes ; commentaire réécrit nommant la raison.
- **D-16 (inventaire consigné)** : feuilles du même mécanisme = **MobileDrawer** (seule porteuse historique de `.feuille-mobile`, feuille « Plus ») et **ProductSheet** (même gabarit Radix bas ≤650 px via `DialogContent`, sans animation jusqu'ici). Les ~40 autres consommateurs de `DialogContent` partagent le gabarit mais n'avaient aucune animation : inchangés.
- **D-15 (mécanisme partagé posé UNE fois)** : `FeuillePortal` dans `dialog.tsx` (portal + overlay + contenu portant les classes `feuille-mobile`/`feuille-mobile-overlay`) consommé par MobileDrawer ; `DialogContent` expose la prop `feuille` consommée par ProductSheet. Le masquage/animation vit dans app.css, source unique — aucune logique dupliquée feuille par feuille.
- **D-16 (sortie animée)** : keyframes `descendre-feuille` (translateY(0)→100%, 340 ms `var(--ease-drawer)`) et `disparaitre-voile` (opacity 1→0, 200 ms ease-out), déclenchés par `data-state=closed` sous 650 px ; repli `prefers-reduced-motion` en opacity seule (150 ms ease-out, gabarit du bloc d'entrée existant). Aucune valeur inventée, aucun timer JS (grep vérifié : zéro).
- **D-17 (preuve e2e)** : `app/e2e/feuille-mobile-plus.spec.ts` — 3 tests × 2 projets (chromium + mobile) au gabarit recettes-cuisine-mobile (session démo, viewport 390×844) : césure entière + `hyphens:none`/`text-wrap:balance` calculés, zéro débordement horizontal, cycle ouverture/fermeture (état `closed` monté pendant la sortie, DOM propre au repos, réouverture animée).

## Arbitrage forceMount consigné (critère 5 du ROADMAP)

**D-15 amendée en exécution : forceMount écarté, au profit de la Présence Radix.**

Le plan prescrivait `forceMount` sur Portal ET Content pour garder le contenu monté fermé. Implémenté puis **rejeté sur preuve** : la machinerie modale de Radix (`hideOthers` posé au montage, focus guards) est liée à la présence du contenu, pas à son état — avec `forceMount`, une feuille fermée laissait **la page entière `aria-hidden`** et le verrou de scroll actif, prouvé par `scan-flow.test.tsx` en échec (l'article « Terminer Nutella » devenait introuvable). `modal={false}` n'était pas une issue (l'overlay Radix disparaît en non-modal ; focus guards toujours montés).

Le mécanisme livré obtient le même résultat utilisateur : Radix **Présence** garde le contenu monté **pendant** l'animation de sortie (l'e2e prouve l'état `closed` encore monté), puis démonte proprement — le DOM reste net au repos, Pitfall 2 (contenu visible fermé) est structurellement impossible, et l'a11y est intacte. L'objectif DET-05 (sortie animée cohérente, mécanisme unique, pas de copie feuille par feuille) est intégralement tenu.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] forceMount incompatible avec la machinerie modale Radix**
- **Found during:** Task 2
- **Issue:** `forceMount` sur Portal/Overlay/Content laissait `hideOthers` + focus guards actifs feuille fermée — page entière `aria-hidden`, scroll verrouillé (2 tests unitaires en échec).
- **Fix:** mécanisme appuyé sur la Présence Radix (contenu monté pendant l'animation de sortie, démontage après) ; see Arbitrage ci-dessus.
- **Files modified:** app/src/components/ui/dialog.tsx, app/src/components/shared/mobile-drawer.tsx, app/src/styles/app.css, app/e2e/feuille-mobile-plus.spec.ts
- **Verification:** 1682 tests unitaires verts (scan-flow et app-shell ré-tablis), e2e 6/6.
- **Commit:** 3f879b4

**Total deviations :** 1 auto-fixée (bug a11y prouvé). **Impact :** l'arbitrage « généralisé » reste tel quel (mécanisme partagé unique, disponible à tous, consommé par les feuilles de l'inventaire D-16) ; seule la technique de maintien au DOM change — sans régression utilisateur ni d'accessibilité.

## Verification (§2.7)

| Étape | Résultat |
|---|---|
| `npm run typecheck` | ✅ 0 erreur |
| `npm test` | ✅ 212 fichiers, 1682 tests passés |
| `npm run build` | ✅ (précache 141 entrées) |
| `npm run test:e2e` (complet) | ✅ 161 passés, 7 skips viewport conditionnels (baseline) |
| `npm run test:e2e -- feuille-mobile-plus` | ✅ 6/6 (rouge consigné avant : `hyphens:auto`, 2 échecs) |
| SQL | non concerné — aucun fichier SQL touché |

Prohibitions vérifiées : zéro `setTimeout`/`setInterval` dans les fichiers modifiés ; chaque nouvelle animation référence `var(--ease-drawer)`/`ease-out`/150 ms avec des durées déjà présentes dans le bloc `.feuille-mobile` existant.

## Known Stubs

None.

## Next

Phase 30 : 5/5 plans clos — phase complete, prête pour `/gsd-verify-work 30` puis la porte de la phase 31.

## Self-Check: PASSED

- `app/e2e/feuille-mobile-plus.spec.ts` : présent sur disque ✅
- Commits 433d01c / 1bc9b55 / 3f879b4 : présents dans `git log` ✅
- Chaîne §2.7 rejouée au vert (voir table) ✅
