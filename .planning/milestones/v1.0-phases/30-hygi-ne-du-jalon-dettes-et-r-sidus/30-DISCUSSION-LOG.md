# Phase 30: Hygiène du jalon — dettes et résidus - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-30
**Phase:** 30 - Hygiène du jalon — dettes et résidus
**Areas discussed:** DET-01 occurrences, DET-02 hors-ligne, DET-03 photos démo, DET-04 panneau version, DET-05 feuilles mobiles

---

## Sélection des zones

Les 5 zones DET-01…DET-05 ont été sélectionnées par l'utilisateur (toutes).

---

## DET-01 : Edge occurrences

Découverte de scoutage présentée : le job `eo-routine-maintenance` (0011, 06:05) appelle déjà la génération en SQL direct ; l'Edge est le déclenchement manuel admin.

| Option | Description | Selected |
|--------|-------------|----------|
| Garder le SQL direct | Le job SQL est le bon design ; diagnostic de ce qui coince en prod | ✓ |
| Brancher l'Edge au pg_cron | Conforme à la lettre du roadmap, ajoute une dépendance HTTP | |
| Diagnostic d'abord, trancher ensuite | Cause racine avant choix | |

**User's choice:** Garder le SQL direct (recommandation suivie)
**Notes:** Preuve = test SQL rouge→vert + mesure prod (cron.job_run_details + occurrence visible) ; constat d'usage quotidien inclus ; heure 06:05 confirmée.

---

## DET-02 : 3 todos hors-ligne

| Option | Description | Selected |
|--------|-------------|----------|
| Badge « 15 » déjà corrigé (re-vérifier) | Le « 15 » = badge « À faire » du shell, todo 14 | ✓ |
| Autre chose — je précise | Résidu à décrire | |

**User's choice:** Badge « 15 » déjà corrigé — re-vérifier
**Notes:** La phase re-joue les trois preuves (tests + constat d'usage hors ligne à froid) ; les résidus de la même famille sont traités dans la phase (§2.7-E).

---

## DET-03 : Photos recettes démo

| Option | Description | Selected |
|--------|-------------|----------|
| Assets locaux | Dossier /assets, gabarit existant, attribution | ✓ |
| URLs distantes | Zéro poids, mais dépendance tiers | |

| Option | Description | Selected |
|--------|-------------|----------|
| Toutes les recettes | Aucune tuile nue (critère 3) | ✓ |
| Sous-ensemble | Moins de poids, tuiles nues subsistent | |

| Option | Description | Selected |
|--------|-------------|----------|
| Chemin public bundle | /assets/recettes/*.jpg, gabarit cadeaux/cercle | ✓ |
| Bucket réel quand même | Cohérence pipeline, seed upload, mode local non résolu | |
| Hybride selon mode | Deux vérités, plus complexe | |

**User's choice:** Assets locaux, toutes les recettes, chemin public bundle
**Notes:** Tension relevée par l'agent (recettes = bucket privé signé via `resolveRecipeCoverUrl`, impossible en démo locale) et arbitrée : pass-through des chemins publics ; le chemin de signature reste prouvé par les tests T-16-07 existants.

---

## DET-04 : Panneau version

| Option | Description | Selected |
|--------|-------------|----------|
| Libellé lisible | « Version de développement » + explication au survol | ✓ |
| unknown + title enrichi | Minimum, mais anglais technique à l'écran | |

| Option | Description | Selected |
|--------|-------------|----------|
| Panneau seulement | Les 3 canaux machine gardent `unknown` (contrat phase 24) | ✓ |
| Tous les canaux | Harmonisation refusée | |

| Option | Description | Selected |
|--------|-------------|----------|
| Test deux familles | estampillé → SHA ; sans → libellé ; rouge avant vert | ✓ |
| Pas de test | Refusé (§2.7) | |

**User's choice:** Libellé « Version de développement », panneau seul, test deux familles
**Notes:** —

---

## DET-05 : Feuilles mobiles

| Option | Description | Selected |
|--------|-------------|----------|
| Wrap sans césure | hyphens: none + text-wrap: balance, « Anniversaires » entier | ✓ |
| Césure contrôlée | &shy; ou réécriture du libellé | |
| Discrétion agent | Arbitrage fin en plan | |

| Option | Description | Selected |
|--------|-------------|----------|
| forceMount généralisé | Mécanisme partagé, posé une fois | ✓ |
| Sortie sans forceMount | Réglage par feuille, régression possible | |
| Inventaire d'abord | Chercheur inventorie avant trancher | |

| Option | Description | Selected |
|--------|-------------|----------|
| e2e Playwright | Exigé par le critère 5 (« e2e au vert ») | ✓ |
| RTL + manuel | Plus léger, hors lettre du critère | |

| Option | Description | Selected |
|--------|-------------|----------|
| Toutes les feuilles | Classe entière (§2.7-E) | ✓ |
| Feuille « Plus » seulement | Reste si régression prouvée | |

**User's choice:** Wrap sans césure, forceMount généralisé, e2e Playwright, toutes les feuilles
**Notes:** —

---

## the agent's Discretion

- Cause racine exacte de DET-01 (diagnostic d'abord)
- Détails CSS du wrap sans césure (rendu visuel à 390 px)
- Forme du mécanisme partagé de forceMount
- Choix des 12 photos de recettes (sujets cohérents avec les titres du semis)

## Deferred Ideas

None — discussion stayed within phase scope
