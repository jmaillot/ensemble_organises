# Phase 37: Filet de tests fiable - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-07
**Phase:** 37-Filet de tests fiable
**Areas discussed:** Flocon auth-bootstrap (TEST-01), Tests rouges anniversaires (TEST-02), E2E offline-shared-device (TEST-03), Clé GoTrue résiduelle (TEST-04), Traçabilité des dettes soldées

---

## Flocon auth-bootstrap (TEST-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Corriger le test (recommandé) | Tolérer la charge (fake timers, waitFor robuste) — l'hypothèse est une course dans le test, pas dans l'app | ✓ |
| Diagnostiquer la cause racine | Reproduire, diagnostiquer app vs test, corriger la vraie cause | |
| Documenter sans corriger | Preuves dans le dépôt + marquer le test, le rouge reste possible | |

**User's choice:** Corriger le test (recommandé)
**Notes:** Suivi d'une seconde question : le diagnostic est consigné dans docs/RETROSPECTIVE.md (choisi), pas seulement un commentaire dans le test ni aucune documentation.

---

## Tests rouges anniversaires (TEST-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Confirmer soldé (recommandé) | Déjà corrigés incidemment par `cdd4fa7` (5 nov) ; vérifier la couverture et consigner | ✓ |
| Vérifier + blinder les dates | Figer les dates dans tous les tests anniversaires dépendants du calendrier | |
| Identifier les 2 tests d'origine | Retrouver les tests exactement rouges en v1.1 et comparer | |

**User's choice:** Confirmer soldé (recommandé)
**Notes:** Décision fondée sur la mesure du jour : suite complète verte 1958/1958, 44 tests anniversaires verts. Escalade prévue dans CONTEXT.md si `cdd4fa7` ne couvre pas les 2 tests visés.

---

## E2E offline-shared-device (TEST-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Env vars + backend réel (recommandé) | 2 comptes réels via variables d'environnement, skip conditionnel conservé | ✓ |
| Dé-skip inconditionnel | Échouer la suite sans env vars — toute machine sans comptes devient rouge | |
| Setup documenté + .env exemple | Fichier .env.e2e exemple versionné + marche documentée | |

**User's choice:** Env vars + backend réel (recommandé)
**Notes:** Seconde question — exécution pendant la phase (choisi) : l'utilisateur fournit les comptes, l'agent exécute, la preuve Playwright est consignée dans la VALIDATION de phase.

---

## Clé GoTrue résiduelle (TEST-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Purge session dédiée (recommandé) | Module centralisé efface sb-<ref>-auth-token (+ chunks) à chaque déconnexion/purge invité | ✓ |
| Diagnostiquer puis corriger | Identifier le chemin fautif d'abord, corriger exactement là | |
| Test rouge d'abord | Le test de lecture brute révèle le chemin fautif, puis correction | |

**User's choice:** Purge session dédiée (recommandé)
**Notes:** Seconde question — preuve à deux niveaux (choisi) : unitaire (jsdom, lecture brute localStorage) + extension de la lecture brute du spec e2e au localStorage. Le « vu rouge avant d'être vu vert » (§2.7 B) reste exigé (D-09 du CONTEXT).

---

## Traçabilité des dettes soldées

| Option | Description | Selected |
|--------|-------------|----------|
| Rétrospective unique (recommandé) | Une entrée « campagne tests v1.2 » dans docs/RETROSPECTIVE.md pour les 4 dettes | ✓ |
| Doc dédié | docs/TEST-DEBT-v1.2.md avec une entrée par TEST-xx | |
| VALIDATION de phase d'abord | Preuves dans la VALIDATION, rétrospective en résumé d'une ligne | |

**User's choice:** Rétrospective unique (recommandé)
**Notes:** Les preuves e2e restent aussi dans la VALIDATION de phase (D-06) ; la rétrospective reçoit le diagnostic et le récit.

---

## the agent's Discretion

- Technique exacte de correction du flocon (fake timers vs waitFor vs timeouts)
- Emplacement de la fonction de purge session (session-cache.ts vs module dédié)
- Marche de fourniture des comptes e2e à l'exécution (jamais versionnée)

## Deferred Ideas

None — discussion stayed within phase scope.
