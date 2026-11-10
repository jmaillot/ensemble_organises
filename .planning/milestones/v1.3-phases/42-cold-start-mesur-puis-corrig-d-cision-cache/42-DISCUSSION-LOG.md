# Phase 42: Cold start mesuré puis corrigé + décision cache - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-10
**Phase:** 42-cold-start-mesuré-puis-corrigé-décision-cache
**Areas discussed:** Protocole de mesure, Cible UX & fin de boucle, Arbitrage CACHE-01, Panneau diagnostic

---

## Protocole de mesure

| Option | Description | Selected |
|--------|-------------|----------|
| 1 appareil, médiane de N | Un seul appareil réel de référence, mesures répétées (ex. 5 runs), médiane consignée | ✓ |
| 1 appareil, médiane+min/max | Mesures répétées, min/max/médiane tous consignés | |
| 2 appareils si dispo | Deux appareils si disponibles — plus représentatif, plus coûteux | |

**User's choice:** 1 appareil, médiane de N
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Purge IndexedDB + réinstall | Vider cache applicatif + désinstallation/réinstallation de la PWA entre chaque run | ✓ |
| Purge applicative seule | Purger uniquement TanStack/IndexedDB via le panneau, garder SW et navigateur | |
| Deux niveaux froids | Définir froid complet + tiède dans le protocole | |

**User's choice:** Purge IndexedDB + réinstallation entre chaque run
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Doc mesures versionné | Protocole, appareil, date, version build, 4 segments médians avant/après dans un doc versionné | ✓ |
| SUMMARY seulement | Consigner uniquement dans le résumé de phase | |
| Doc + capture panneau | Doc dédié + capture d'écran du panneau comme preuve visuelle | |

**User's choice:** Doc mesures versionné
**Notes:** —

**Continuation:** zone suivante.

---

## Cible UX & fin de boucle

| Option | Description | Selected |
|--------|-------------|----------|
| Sans cible chiffrée | Le profilage désigne les axes, on corrige les désignés, re-mesure, consigne ; arrêt = plus d'axe à fort gain désigné | ✓ |
| Cible chiffrée | Objectif absolu (ex. < 5 s) dans le protocole | |
| Cible relative | Objectif relatif (ex. -50 % du segment désigné) | |

**User's choice:** Sans cible chiffrée
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Corrections = segments tracés | Axes candidats listés au protocole ; chaque correction nomme son segment source ; hors profil = écart nommé | ✓ |
| 1 correction par itération | Une seule correction désignée par itération, re-mesure immédiate | |
| Tout en une passe | Toutes les corrections désignées en une passe, une re-mesure finale | |

**User's choice:** Corrections = segments tracés
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Autorisée mais nommée | Correction hors profil livrée mais consignée comme écart (success criterion 3) | ✓ |
| Interdite, reportée | Rien hors profil ; le reste va en idée différée/dette | |
| Au cas par cas | Décidé à la volée pendant l'exécution | |

**User's choice:** Autorisée mais nommée
**Notes:** —

**Continuation:** zone suivante.

---

## Arbitrage CACHE-01

| Option | Description | Selected |
|--------|-------------|----------|
| Par famille, à partir des données | Chaque famille OFFLINE_FAMILIES arbitrée individuellement avec les données du panneau on-device | ✓ |
| Intuition à valider | Verrouiller maintenant une intuition que les mesures valident ou infirment | |
| Deux blocs seulement | Arbitrage global vivantes/annexes plutôt que par prefix | |

**User's choice:** Par famille, à partir des données
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Critères fixés au protocole | Critères (volume réhydraté, tolérance péremption, coût re-fetch) écrits AVANT les mesures | ✓ |
| Critères à la lecture | Critères définis en lisant le panneau | |
| Critères + préférences produit | Critères au protocole + préférence produit par espace déclarée maintenant | |

**User's choice:** Critères fixés au protocole
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Changement si désigné, statu quo valide | Changement seulement si critères+données le désignent ; statu quo justifié = CACHE-01 tranchée | ✓ |
| Changement obligatoire | Au moins une famille doit changer de maxAge | |
| Seules les 24 h | Seules les données vivantes sont candidates ; annexes hors arbitrage | |

**User's choice:** Changement si désigné, statu quo valide
**Notes:** —

**Continuation:** zone suivante.

---

## Panneau diagnostic

| Option | Description | Selected |
|--------|-------------|----------|
| Section Amorçage : 4 segments + total | Panneau offline existant reçoit une section Amorçage (4 segments ms + total) | ✓ |
| Total seul dans le panneau | 4 segments seulement dans le doc mesures/dev | |
| Segments + historique | 4 segments + historique des mesures précédentes dans le panneau | |

**User's choice:** Section Amorçage : 4 segments + total
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Session seule, doc = référence | Mesure du dernier démarrage en session ; référence dans le doc versionné ; pas d'I/O de plus au démarrage | ✓ |
| Persister la dernière mesure | Dernière mesure persistée IndexedDB — risque de fausser la mesure | |
| Historique persisté | Historique N derniers démarrages persisté | |

**User's choice:** Session seule, doc = référence
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Toujours actifs | Marks sans flag — instrumentation produit, panneau lisible en prod (là où CACHE-01 se tranche) | ✓ |
| Flag de build | Marks derrière un flag (analogue VITE_E2E_SW_HARNESS) — contredirait « mesures prod on-device » | |
| Prod seulement | Marks actifs en build prod uniquement | |

**User's choice:** Toujours actifs
**Notes:** —

**Continuation:** prêt pour le contexte.

---

## the agent's Discretion

- Nombre exact N de runs par condition (médiane consignée) — choisi au plan dans les bornes du protocole.

## Deferred Ideas

None — discussion stayed within phase scope.
