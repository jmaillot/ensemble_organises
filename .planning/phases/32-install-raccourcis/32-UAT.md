---
status: complete
phase: 32-install-raccourcis
source: [32-01-SUMMARY.md, 32-02-SUMMARY.md, 32-03-SUMMARY.md]
started: 2026-11-04T16:05:00Z
updated: 2026-11-04T16:05:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 0
name: [testing complete]
expected: |
awaiting: -

## Tests

### 1. Icônes de l'app installée
expected: L'icône installée affiche le glyphe teal sur fond sombre, non rogné même avec le masque Android (cercle/squircle).
result: pass

### 2. Raccourcis d'app (appui long)
expected: Un appui long sur l'icône de l'app installée propose deux raccourcis « Tâches du jour » et « Courses », chacun avec sa propre pastille d'icône (glyphes distincts, pas des carrés noirs), qui ouvrent les vues correspondantes.
result: pass

### 3. Installabilité Chromium (desktop/Android)
expected: Sur Chrome desktop ou Android, le navigateur considère l'app installable (icône d'installation dans la barre d'adresse / bouton de la barre supérieure de l'app actif) — aucune erreur de manifest dans les DevTools > Application.
result: pass

### 4. Bannière d'installation (premier niveau)
expected: Sur un navigateur où l'app n'est pas installée, une bannière discrète apparaît en haut sous l'en-tête, proposant « Installer » (Chromium) ou le guide iOS dépliable (Safari iOS : Partager → Sur l'écran d'accueil).
result: pass
note: "issue cosmétique initiale corrigée (b02fde7) et re-validée visuellement"

### 5. Dismiss bannière enterrée 30 jours
expected: Après un clic sur « Plus tard », la bannière disparaît et ne revient pas au rechargement ; le bouton « Installer » de la barre supérieure, lui, reste disponible (Chromium).
result: pass

### 6. Bannière masquée si déjà installée
expected: Une fois l'app installée et ouverte en mode standalone, aucune bannière d'installation n'apparaît (pas de double invite).
result: pass

### 7. Mise à jour : bandeau plutôt que reload subi
expected: Après un nouveau déploiement (nouvelle version servie), l'app ouverte affiche un bandeau « Une mise à jour est disponible » avec bouton « Recharger » — et ne se recharge JAMAIS toute seule.
result: blocked
blocked_by: release-build
reason: "le rebuild a été effectué après le correctif banniere — aucun déploiement pendant qu'un onglet était ouvert ; à rejouer au prochain déploiement réel"

### 8. Panneau offline : versions et MAJ en attente
expected: Dans Paramètres > panneau « Données et mode de fonctionnement », une ligne « Version du service worker » affiche une valeur (ou « Service worker indisponible » honnête en dev) distincte de la version app ; quand une MAJ est en attente, « Mise à jour en attente » + « Appliquer maintenant » apparaissent, et le clic applique la mise à jour.
result: pass

## Summary

total: 8
passed: 7
issues: 0
pending: 0
skipped: 0

## Gaps

- gap_id: G-32-4
  truth: "Sur un navigateur où l'app n'est pas installée, la bannière d'installation apparaît en haut sous l'en-tête."
  status: failed
  reason: "User reported: je n'ai pas la banniere ou cliquer plus tard, juste les boutons d'installation"
  severity: major
  test: 4
  artifacts: [app/src/components/banners/install-banner.tsx]
  missing: []
  resolved_by: 32-03 fix 6d78688 (contrôleur séparé de la présentation)
- gap_id: G-32-4b
  truth: "La bannière d'installation est visuellement soignée, cohérente avec l'UI de l'app."
  status: resolved
  reason: "User reported: je vois la barre mais celle-ci n'est pas terrible niveau UI"
  severity: cosmetic
  test: 4
  artifacts: [app/src/components/banners/install-banner.tsx]
  missing: []
  resolved_by: fix b02fde7 (pastille icône, titre+sous-titre, boutons sm), re-validé en UAT
