# Phase 36: Outbox — plus jamais d'effacement silencieux - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-07
**Phase:** 36-Outbox — plus jamais d'effacement silencieux
**Areas discussed:** Granularité de classification (proposée, non sélectionnée), Messages utilisateur, Forme de l'audit, Test rouge→vert du 404

---

## Sélection des gray areas

Sélectionnées : Messages utilisateur, Forme de l'audit, Test rouge→vert du 404.
Non sélectionnée : « Granularité de classification » (catalogue par code vs règle par défaut) — tranchée de fait par les réponses D-04/D-06 (test comme source, terminal par défaut) et laissée à la discrétion de l'agent (emplacement du catalogue).

## Messages utilisateur

| Option | Description | Selected |
|--------|-------------|----------|
| Libellé par code | « Cet élément a été supprimé entre-temps » pour le 404/PGRST116, « Vous n'avez pas les droits » pour le 42501/403… | ✓ |
| Message générique + code | « L'envoi a échoué » pour tout échec terminal + code brut visible dans le panneau seulement | |
| Hybride court + détail | Message court par code + message PostgREST brut repliable | |

| Option | Description | Selected |
|--------|-------------|----------|
| Badge + panneau, pas de toast | Badge compte les failed, panneau détaille, rien pendant l'usage normal (UAT-34-1) | ✓ |
| Badge + panneau + toast | Toast une fois par passe en plus (D-12 v1.1) | |
| Mécanisme existant tel quel | Seul le libellé change | |

| Option | Description | Selected |
|--------|-------------|----------|
| Retirer le toast | Toast D-12 supprimé, badge seul canal actif | ✓ |
| Garder le toast, libellé par code | Toast conservé mais aligné sur le nouveau libellé | |

| Option | Description | Selected |
|--------|-------------|----------|
| Par famille | Libellé court par famille de code, fallback générique pour code inconnu | ✓ |
| Par code exact | Un libellé par code PostgREST exact | |

## Forme de l'audit

| Option | Description | Selected |
|--------|-------------|----------|
| Test comme source | Test énumère chaque code et affirme classification + libellé ; l'audit vit dans le code | ✓ |
| Doc de référence | Table code→classification dans docs/OUTBOX-AUDIT.md | |
| Les deux, croisés | Table doc + test de coïncidence | |

| Option | Description | Selected |
|--------|-------------|----------|
| Classification + libellé | Chaque code testé 2× | ✓ |
| Classification seule | Libellés vérifiés par un seul test sur le mapping | |

| Option | Description | Selected |
|--------|-------------|----------|
| La matrice du critère 2 | 404/PGRST116, 400, 403/42501, 23514, 23503, 23505, réseau, 5xx, AbortError | ✓ |
| Codes observables seulement | Uniquement ce que l'adaptateur actuel peut lever | |

| Option | Description | Selected |
|--------|-------------|----------|
| Terminal par défaut | Code imprévu → terminal + libellé générique, jamais d'évaporation ni de boucle | ✓ |
| Retryable par défaut | Code imprévu → retenté jusqu'à intervention humaine | |

## Test rouge→vert du 404

| Option | Description | Selected |
|--------|-------------|----------|
| Intégration + unitaire | replayOutbox mocké (scénario complet critère 1) + unitaire famille 404 | ✓ |
| Unitaire seulement | classifyFailure + mapping seulement | |

| Option | Description | Selected |
|--------|-------------|----------|
| Fichiers existants | outbox-replay.test.ts, outbox.test.ts, offline-panel.test.tsx | ✓ |
| Fichier dédié | failure-classification.test.ts isolé | |

| Option | Description | Selected |
|--------|-------------|----------|
| Rouge démontré puis vert | Le test échoue sur le comportement actuel avant le correctif (critère 4, §2.7 B) | ✓ |
| Vert direct | Rouge affirmé, non prouvé | |

| Option | Description | Selected |
|--------|-------------|----------|
| Oui, panneau testé aussi | Test composant offline-panel : entrée failed 404 → libellé rendu | ✓ |
| Non, UAT manuelle | Rendu vérifié par UAT seulement | |

## the agent's Discretion

- Emplacement du catalogue code→famille→libellé (extension `classifyFailure` vs module dédié)
- Libellés français exacts au-delà du 404 (verrouillé : « cet élément a été supprimé entre-temps »)
- Retrait propre du toast D-12 (code + tests concernés)

## Deferred Ideas

Aucune — la discussion est restée dans le périmètre de la phase.
