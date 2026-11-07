# Phase 35: Deep links & validation multi-OS - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-06
**Phase:** 35-Deep links & validation multi-OS
**Areas discussed:** Vue Tâches du jour, Redirect-after-login, Matrice de validation multi-OS, Séquençage plans vs validation

---

## Vue Tâches du jour

| Option | Description | Selected |
|--------|-------------|----------|
| Route dédiée /taches/jour | Nouvelle route, réutilise les composants de taches-page, rendu cold-start offline prioritaire | ✓ |
| /taches filtrée | Query param ?vue=jour, pas de nouvelle route mais chargement plus lourd | |
| Rester sur /taches | Vue complète comme cible — en tension avec le critère 2 | |

**User's choice:** Route dédiée /taches/jour
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Jour + retards | due_date ≤ aujourd'hui non faites, retards en rouge en haut | ✓ |
| Jour uniquement | Strictement due_date = aujourd'hui — les retards disparaissent | |
| Jour + retards + sans échéance | Vision plus large, s'éloigne de la promesse « du jour » | |

**User's choice:** Jour + retards
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Minimale cochable | Liste + coche + retour /taches, pas de filtres/dossiers/ajout | ✓ |
| Cochable + ajout rapide | Plus utile mais risque de divergence avec /taches | |
| Miroir de /taches filtré | Pas de divergence mais gain cold-start évaporé | |

**User's choice:** Minimale cochable
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Assignés visibles | color_tag/avatar, coche selon le rôle | ✓ |
| Titre seul | Risque de cocher la tâche du conjoint sans le savoir | |
| Assignés + filtre « mes tâches » | Fonctionnalité de plus, contre la vue minimale | |

**User's choice:** Assignés visibles
**Notes:** —

---

## Redirect-after-login

| Option | Description | Selected |
|--------|-------------|----------|
| Prouver l'existant par e2e | state.from → internalPathOf présumé correct, e2e dédié, correction seulement si trou révélé | ✓ |
| Auditer puis e2e | Plus sûr mais plus long | |
| Refondre le mécanisme | Risque de régression sur une garde déjà testée | |

**User's choice:** Prouver l'existant par e2e
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Cold-start expiré → login → retour | Un scénario unique, exactement le critère 1 | ✓ |
| Trois scénarios | + Google OAuth, + cache offline sans session | |
| E2e + test unitaire de la garde | Double filet, coût faible | |

**User's choice:** Cold-start expiré → login → retour
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Écran explicite offline sans session | « connexion requise pour cette vue », jamais d'erreur générique | ✓ |
| Différer au prochain login | Mécanisme de plus à purger, risque inter-utilisateurs | |
| Comportement générique | Message technique sur le chemin le plus fréquent | |

**User's choice:** Écran explicite offline sans session
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Aucun stockage supplémentaire | state.from suffit, purge naturelle, zéro risque | ✓ |
| sessionStorage en secours | Uniquement si l'e2e montre que state.from ne survit pas | |

**User's choice:** Aucun stockage supplémentaire
**Notes:** —

---

## Matrice de validation multi-OS

| Option | Description | Selected |
|--------|-------------|----------|
| Checklist guidée, vous exécutez | Agent prépare grille + étapes par OS, humain exécute | ✓ |
| Vous testez seul | Risque de trous de consignation | |
| Hybride Playwright desktop + manuel mobile | Non retenu | |

**User's choice:** Checklist guidée, vous exécutez
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Grille 35-VALIDATION-MATRICE.md | Lignes = cas, colonnes OS, statut + quirk par cellule | ✓ |
| Section dans VALIDATION.md | Mélange e2e automatisés et tests on-device | |
| Cas UAT conversationnels | Plus verbeux | |

**User's choice:** Grille 35-VALIDATION-MATRICE.md
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Cellule explicite, Non testé permis | Passé/Échoué/Quirk/Non testé — aucune case vide, honnêteté prime | ✓ |
| 100 % des trois OS requis | Peut bloquer le jalon sur un quirk iOS | |
| 2 OS verts + iOS documenté | Frontière arbitraire | |

**User's choice:** Cellule explicite, Non testé permis
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Tout dans la grille | 5 familles critère 3 + PITFALLS + gate SW, un seul document, ordre fixe | ✓ |
| Grille + doc PITFALLS séparé | Deux documents à maintenir | |

**User's choice:** Tout dans la grille
**Notes:** —

---

## Séquençage plans vs validation

| Option | Description | Selected |
|--------|-------------|----------|
| Construire puis valider | Plan 1 = vue + e2e + écran offline ; Plan 2 = grille + passage on-device. Matrice sur le code final | ✓ |
| Valider l'existant d'abord | Grille à repasser après les ajouts | |
| You decide | Choix tactique laissé à l'agent | |

**User's choice:** Construire puis valider
**Notes:** —

---

## the agent's Discretion

- Forme exacte de l'écran « connexion requise » (composant réutilisé vs dédié)
- Structure interne de la grille (colonnes appareil, version OS, notes)
- Composition de la vue `/taches/jour` (en-tête, compteur, état vide)
- Découpage fin en plans au-delà du séquençage construire-puis-valider

## Deferred Ideas

None — discussion stayed within phase scope.
