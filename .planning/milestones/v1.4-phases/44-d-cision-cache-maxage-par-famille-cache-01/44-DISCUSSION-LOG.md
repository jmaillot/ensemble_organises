# Phase 44: Décision cache maxAge par famille (CACHE-01) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-11
**Phase:** 44 - Décision cache maxAge par famille (CACHE-01)
**Areas discussed:** Consignation des runs, Séquencement vs appareil, Emplacement de la décision, Détail cache par famille

---

## Consignation des runs

| Option | Description | Selected |
|--------|-------------|----------|
| Squelette préparé | Le plan prépare d'abord le squelette (tableaux, en-têtes, mentions de protocole) dans les sections vides ; le jour J, l'utilisateur dicte uniquement les valeurs mesurées | ✓ |
| Tout le jour J | Les sections §7 remises intégralement après la campagne — risque d'oubli de champs | |
| Dictée à l'agent | Les valeurs dictées à l'agent qui les rédige — repose sur une session d'agent au moment de la campagne | |

**User's choice:** Squelette préparé (recommandé)
**Notes:** La mesure est manuelle on-device (lecture panneau + dictée humaine) — pas de script auto-rédigeant possible, différence assumée avec la phase 43.

| Option | Description | Selected |
|--------|-------------|----------|
| Tout par run | Un tableau par run : estampille, branche auth, 4 segments, total borne à borne, 2 validations « froid » §2.1 | ✓ |
| Tableau §7.1 actuel | Une ligne par run, validations « froid » dans §7.5 seulement si échec | |

**User's choice:** Tout par run (recommandé)

| Option | Description | Selected |
|--------|-------------|----------|
| Validation dans le squelette | Les 2 vérifications §2.1 à cocher par run, règle « non froid → pas de médiane » en commentaire | ✓ |
| Procédure §2.1 seule | Validation mentale de l'opérateur, pas répétée dans le squelette | |

**User's choice:** Validation dans le squelette (recommandé)

| Option | Description | Selected |
|--------|-------------|----------|
| Réécrit, git = historique | Un seul document réécrit à chaque campagne — convention D-08 phase 43 | ✓ |
| Sections cumulées | Une section par campagne qui s'accumule | |

**User's choice:** Réécrit, git = historique (recommandé)

---

## Séquencement vs appareil

| Option | Description | Selected |
|--------|-------------|----------|
| Préparer puis campagne | Tout ce qui ne dépend pas de l'appareil livré d'abord, checkpoint humain, campagne + décision même session | ✓ |
| Campagne d'abord | Tentée d'abord, repli sur le différé si l'appareil manque — risque de travail inutilisé | |
| Différé assumé si besoin | Clôture volontaire par différé consigné — même forme que la campagne 2026-11-10 | |

**User's choice:** Préparer puis campagne (recommandé)
**Notes:** Le différé honnêtement consigné reste le repli documenté au checkpoint (succès criterion 1) — mais ce n'est pas le chemin principal.

| Option | Description | Selected |
|--------|-------------|----------|
| Même session | Grille remplie les données sous les yeux, biais d'ordre §6 respecté | ✓ |
| Deux sessions | Campagne un jour, décision un autre — relecture différée des mesures | |

**User's choice:** Même session (recommandé)

| Option | Description | Selected |
|--------|-------------|----------|
| Commit par famille immédiat | Chaque famille commitée juste après sa décision, avant la suivante | ✓ |
| Chaîne unique en fin | Modifications groupées, chaîne une fois, puis commits — un Test H rouge tard contamine plusieurs familles | |

**User's choice:** Commit par famille immédiat (recommandé)

| Option | Description | Selected |
|--------|-------------|----------|
| Chaîne finale consignée | Chaîne §2.7 une fois à l'état final, résultat consigné (forme §7.6 phase 42) | ✓ |
| Chaîne par commit | ~6 exécutions pour rien — le SQL n'est pas touché | |

**User's choice:** Chaîne finale consignée (recommandé)

---

## Emplacement de la décision

| Option | Description | Selected |
|--------|-------------|----------|
| §7.4 MESURES + report PROJECT.md | Grille remplie dans le document MESURES (emplacement déjà prévu), verdict reporté dans PROJECT.md | ✓ |
| Nouveau doc dédié | Duplique les données §7.3, second lieu de consignation | |
| PROJECT.md seul | Contredit le document MESURES qui prévoit §7.4 | |

**User's choice:** §7.4 MESURES + report PROJECT.md (recommandé)

| Option | Description | Selected |
|--------|-------------|----------|
| Verdict + renvoi | PROJECT.md porte le verdict par famille, renvoi vers §7.4 pour la justification | ✓ |
| Grille complète dans PROJECT.md | Tout en un — gonfle PROJECT.md, risque de divergence | |

**User's choice:** Verdict + renvoi (recommandé)

| Option | Description | Selected |
|--------|-------------|----------|
| PROJECT.md après §7.4 remplie | Section « Décision CACHE-01 » seulement avec données réelles — règle §2.7 I | ✓ |
| Section en attente d'emblée | Affirme une décision qui n'existe pas encore | |

**User's choice:** PROJECT.md après §7.4 remplie (recommandé)

| Option | Description | Selected |
|--------|-------------|----------|
| Doc séparé du code | Commit de consignation distinct des commits de code par famille | ✓ |
| Doc + code ensemble | Mélange consignation et code dans un commit déjà chargé | |

**User's choice:** Doc séparé du code (recommandé)

---

## Détail cache par famille

| Option | Description | Selected |
|--------|-------------|----------|
| Tâche conditionnelle | Code écrit seulement si le besoin apparaît — conforme au critère 4 | ✓ |
| Livré préventivement | Contredit directement le critère 4 (« jamais préventif ») | |
| Replanification si besoin | Rigoureux mais lourd pour un ajout en lecture seule | |

**User's choice:** Tâche conditionnelle (recommandé)

| Option | Description | Selected |
|--------|-------------|----------|
| Section du panneau offline | Réutilise inspectPersistedCache, lecture seule, zéro nouveau paquet/service | ✓ |
| Nouvelle surface dédiée | Nouvelle navigation pour un besoin ponctuel | |

**User's choice:** Section du panneau offline (recommandé)

| Option | Description | Selected |
|--------|-------------|----------|
| Seuil nommé dans le plan | Panneau suffit s'il répond aux critères (a) et (c) par famille — seuil écrit, pas subjectif | ✓ |
| Au cas par cas | « Déclenché par besoin » reste subjectif, risque de livraison par prudence | |

**User's choice:** Seuil nommé dans le plan (recommandé)

| Option | Description | Selected |
|--------|-------------|----------|
| Avant la lecture, jamais entre | Si livrée, l'observabilité arrive avant la lecture de la campagne — comparabilité des médianes | ✓ |
| À tout moment | Risque de mélanger des lectures avec des outils différents | |

**User's choice:** Avant la lecture, jamais entre (recommandé)

---

## the agent's Discretion

- Forme exacte des squelettes (mise en page, libellés) — champs requis verrouillés par D-02/D-03.
- Rédaction exacte de la procédure de campagne résumée (la séquence §2 reste la référence contraignante).
- Découpage précis des plans/tâches par le planner.

## Deferred Ideas

None — discussion stayed within phase scope.
