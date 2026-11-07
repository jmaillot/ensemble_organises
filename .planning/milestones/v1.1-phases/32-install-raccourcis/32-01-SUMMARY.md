# 32-01 Summary — Icônes, manifest PWA et raccourcis

**Statut : terminé** (checkpoint `blocking-human` résolu le 2026-11-04).

## Livré

- **Icônes any** 64/192/512 + `apple-touch-icon-180x180.png` + `favicon.png` : fond sombre plein (#0e171e), glyphe teal/orange (#008a6a / #d8644f) — commit `229a402`, corrigé dans `1fc7d58`.
- **Maskable 512** : glyphe réellement chromatique (le preset `minimal-2023` produisait une silhouette noire sur fond blanc), récentré (centre réel du dessin : 216,271) et à 75 % → rayon max mesuré **188,5 px < 204,8 px** de la safe-zone Android.
- **Raccourcis** « Tâches du jour » → `/taches` et « Courses » → `/courses`, URLs sans paramètres, icônes 96 px pastilles sombres avec les glyphs `checkCircle` et `receipt` de l'app (les premières sorties étaient des carrés noirs vides).
- **Manifest** (`app/vite.config.ts`, source unique — `64c6ff1`, `4951a85`) : `display_override` window-controls-overlay/minimal-ui/standalone, `categories` productivity/lifestyle, `orientation` portrait-primary conservé, screenshots wide (1280×720 réel) + narrow (720×1280 réel), précache SW sans `screenshots/`.
- **index.html** : `apple-touch-icon` PNG raster + `apple-mobile-web-app-title`.
- **Test** `app/src/pwa/manifest.test.ts` : 7 assertions vertes (porte INST-01 et DLNK-01).

## Décisions du checkpoint (validées avec l'utilisatrice)

1. Maskable refaite : le premier rendu était illisible (élément noir) — hypothèse A2 confirmée, master dédié `icon-master.svg` commité, génération one-off via sharp (script non commité), sorties commitées (D-13).
2. Raccourcis refaits : « rempli de gris » confirmé par mesure (1 couleur), remplacés par les glyphs réels.
3. Screenshots réels validés tels quels (pas des placeholders).
4. Couleurs oklch du master converties en hex (culori) car le pipeline d'icônes ne les restituait pas.

## Vérifications exécutées

- `npm run typecheck` ✅ · `npm run build` ✅ · `npx vitest run src/pwa/manifest.test.ts` 7/7 ✅
- `dist/manifest.webmanifest` : icons any 192+512 + maskable 512 présentes dans dist/, shortcuts OK, display_override ordre exact ✅
- `npm test` : 1720/1722 — **2 échecs préexistants** dans `anniversaires-page.test.tsx` (rôle `dialog` introuvable), reproduits sans les modifications de ce plan ; hors périmètre PWA, à traiter séparément.

## Prochaines étapes

- Plans 32-02 (registerType `prompt`) et 32-03 (bannière install).
- Vérification on-device desktop/Android : `/gsd-verify-work` (SC-3).
