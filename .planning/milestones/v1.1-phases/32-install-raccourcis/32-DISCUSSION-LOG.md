# Phase 32: Install & raccourcis - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-04
**Phase:** 32-Install & raccourcis
**Areas discussed:** UX d'installation, Manifest & cibles raccourcis, Flow de mise à jour SW, Génération des icônes

---

## UX d'installation

| Option | Description | Selected |
|--------|-------------|----------|
| Bouton + bannière iOS | Bouton existant barre sup. (Chromium) + bannière discrète iOS ; guide en bannière dépliable | ✓ |
| Tout dans Paramètres | Centralisé Paramètres → « Installer l'app », plus discret mais moins découvrable | |
| Page dédiée | Page /installation avec détection OS et pas-à-pas illustré | |

| Option | Description | Selected |
|--------|-------------|----------|
| Réapparaît à 30 j | Refus enterré 30 jours en localStorage puis réapparition | ✓ |
| Jamais réaffichée | Une fois fermée, jamais réaffichée | |
| À chaque session | Réapparition à chaque session tant que non installé | |

| Option | Description | Selected |
|--------|-------------|----------|
| Détection à la volée | user-agent + feature detection, masquée si standalone | ✓ |
| Écran à la 1re visite | Écran contextuel de présentation à la première visite | |

| Option | Description | Selected |
|--------|-------------|----------|
| Slot bannière en haut | Bannière en haut, slot partagé avec le futur bandeau stale (phase 33) | ✓ |
| Bannière en bas | Façon apps natives, chevauche le contenu scrollé | |
| Popover au bouton | Bulle ancrée au bouton, moins visible sur mobile | |

**User's choice:** Bouton + bannière iOS, dismiss 30 j, détection à la volée, slot en haut
**Notes:** — Aucune note additionnelle ; options recommandées acceptées.

---

## Manifest & cibles raccourcis

| Option | Description | Selected |
|--------|-------------|----------|
| URLs existantes | « Tâches du jour » → /taches, « Courses » → /courses ; retouchées en phase 35 | ✓ |
| Paramètre de filtre | /taches?filtre=jour dès maintenant, code remplacé en 35 | |

| Option | Description | Selected |
|--------|-------------|----------|
| window-controls-overlay | display_override WCO → minimal-ui → standalone, desktop tire parti des barres système | ✓ |
| standalone seul | Comportement prédictible partout | |
| Ne pas ajouter | Garder display: standalone sans display_override | |

| Option | Description | Selected |
|--------|-------------|----------|
| Garder portrait-primary | Aucun changement | ✓ |
| Passer à any | Tablette/desktop paysage officiels | |
| Retirer le champ | Comportement navigateur par défaut | |

| Option | Description | Selected |
|--------|-------------|----------|
| Screenshots + categories | screenshots (desktop + narrow) + categories productivity/lifestyle | ✓ |
| Strict minimum | Seulement INST-01 | |
| Manifeste enrichi complet | Screenshots, categories, launch_handler + icônes de raccourcis dédiées | |

**User's choice:** URLs existantes, WCO, portrait-primary conservé, screenshots + categories
**Notes:** — La vue « Tâches du jour » dédiée reste DLNK-03, phase 35.

---

## Flow de mise à jour SW

| Option | Description | Selected |
|--------|-------------|----------|
| Bandeau + bouton | registerType: prompt, bandeau « Recharger » dans le slot bannière, reload gated | ✓ |
| AutoUpdate au lancement | Ne satisfait pas INST-03 | |
| Modale bloquante | Dialog bloquant, plus insistant | |

| Option | Description | Selected |
|--------|-------------|----------|
| Gate stub désactivante | Hook stub posé en 32 (file toujours vide), bouton désactivé si file non vide | ✓ |
| Gate ajoutée en 34 | Reload immédiat en 32, comportement changeant en 34 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Différable | Bandeau refermable, application au prochain lancement, re-proposé à chaque session | ✓ |
| Persistant | Bandeau jusqu'à application, pas de fermeture | |

| Option | Description | Selected |
|--------|-------------|----------|
| Panneau Paramètres | État SW enrichi dans le panneau offline existant | ✓ |
| Indicateur permanent | Indicateur toujours accessible dans le shell | |
| Bandeau seul | Aucun point d'observation hors mises à jour | |

**User's choice:** Prompt + bandeau, gate stub, différable, panneau Paramètres
**Notes:** — La frontière de composant (hook de gate) évite tout changement de comportement en 34.

---

## Génération des icônes

| Option | Description | Selected |
|--------|-------------|----------|
| Master + generator | Master unique ~1024px → assets-generator (any + maskable 64/192/512 + favicon), commités | ✓ |
| Édition manuelle | Retravail manuel des PNG existants | |

| Option | Description | Selected |
|--------|-------------|----------|
| Réutiliser les icônes d'espace | Icônes des tuiles dashboard redimensionnées à 96px | ✓ |
| Sans icônes | Chrome affiche une icône générique | |
| Icônes dédiées | Deux icônes sur mesure dans le style du master | |

| Option | Description | Selected |
|--------|-------------|----------|
| Commités | Assets générés commités dans app/public, build déterministe | ✓ |
| Regénérés au build | Script npm avant vite build, bruit de diff | |

**User's choice:** Master + generator, icônes d'espace réutilisées, assets commités
**Notes:** —

---

## the agent's Discretion

- Détail des balises `apple-*` (apple-touch-icon, titre, splash) et `launch_handler` — valeurs standard au choix de l'agent.
- Contenu du pas-à-pas iOS (captures vs schéma simple).

## Deferred Ideas

- Aucune — la discussion est restée dans le périmètre de la phase.
