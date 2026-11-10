# Phase 38: Filet de tests fiable - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-08
**Phase:** 38-filet-de-tests-fiable
**Areas discussed:** Périmètre du balayage semis, Vert e2e vs join-token, WR-03 si non-date, Bornage IN-02

---

## Périmètre du balayage semis

| Option | Description | Selected |
|--------|-------------|----------|
| 2 semis flakés seulement | menu-page + WR-03, seed.ts pas touché — rapide, strict | |
| Toute la classe | + seed.ts recalibré sur les helpers, classe day()/new Date() couverte (§2.7 E) | ✓ |
| 2 + inventaire | Correction des 2, inventaire écrit du reste | |

| Option | Description | Selected |
|--------|-------------|----------|
| 7 dates simulées | Tests paramétriques, date injectée — jamais d'horloge figée | ✓ |
| Tests + vrai dimanche | Preuve d'exécution le vrai dimanche | |

| Option | Description | Selected |
|--------|-------------|----------|
| datetime.ts partagé | Helpers de production, exportés, consommables par futures phases | ✓ |
| Module semis dédié | lib/test-dates.ts — sépare prod et outillage de test | |

**User's choice:** Toute la classe ; 7 dates simulées ; datetime.ts partagé
**Notes:** Le semis démo seed.ts utilise day(offset) relatif au jour, pas à la semaine — couvert quand même par le balayage de classe ; seed.test.ts maintenu vert.

---

## Vert e2e vs join-token

| Option | Description | Selected |
|--------|-------------|----------|
| Exclusion explicite | SC2 = flakes corrigés en 38 ; join-token listé comme seul rouge connu, soldé en 39 | ✓ |
| Skip propre en 38 | test.skip documenté, retiré en 39 | |
| Réécrire en 38 | Avancer TEST-02 en 38 (changement de roadmap) | |

| Option | Description | Selected |
|--------|-------------|----------|
| Tourne et échoue | Spec reste dans le run standard, rouge documenté visible | ✓ |
| Hors run standard | grepExcludes/.skip jusqu'à la 39 | |

**User's choice:** Exclusion explicite ; tourne et échoue
**Notes:** §2.7 I — un skip qui traîne est une absence affirmée ; le rouge visible rappelle la dette.

---

## WR-03 si non-date

| Option | Description | Selected |
|--------|-------------|----------|
| Corriger dans la phase | La phase ne se termine pas avec le flake ouvert, quelle que soit sa cause | ✓ |
| Consigner et reporter | Dette distincte, seule la partie date traitée | |

| Option | Description | Selected |
|--------|-------------|----------|
| Protocole D-01 | Reproduction avant fix, preuve d'innocence, correction test-only, rétrospective | ✓ |
| Fix direct | Cause déjà documentée dans MILESTONES.md | |

**User's choice:** Corriger dans la phase ; protocole D-01
**Notes:** L'intention du SC1 est « la suite est fiable » — le protocole établit d'abord si WR-03 est bien date-dépendante.

---

## Bornage IN-02

| Option | Description | Selected |
|--------|-------------|----------|
| Fonction entière | Select visé + balayage des autres selects service_role de la même fonction (§2.7 E) | ✓ |
| Ligne seule | Strictement index.ts:656 | |

| Option | Description | Selected |
|--------|-------------|----------|
| LIMIT + ordre | LIMIT explicite + ORDER BY déterministe, pas de pagination sans besoin réel | ✓ |
| Pagination complète | limit/offset paramétrés par le consommateur | |

**User's choice:** Fonction entière ; LIMIT + ordre
**Notes:** L'emplacement exact (quelle Edge Function) est à confirmer au plan ; test-db.sh obligatoire si SQL touché (I-03, ajouté à la discrétion de l'agent).

---

## the agent's Discretion

- Cause exacte de WR-03 et technique de correction (protocole W-02 la désigne)
- Liste exhaustive des semis couverts par S-01 (inventaire des usages day()/new Date())
- Ordre des corrections (flakes d'abord ou IN d'abord — indépendantes)

## Deferred Ideas

*(aucune — la discussion est restée dans le périmètre de la phase)*
