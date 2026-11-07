# Phase 34: File d'écriture & rejeu - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-05
**Phase:** 34-File d'écriture & rejeu
**Areas discussed:** Architecture de la file, Sémantique d'enfilage, Surface des échecs, Modèle d'idempotence SQL, Liste blanche, Rejeu foreground, Réconciliation Realtime, Purge de la file, Tables Tier 1, Badge en ligne

---

## Architecture de la file

| Option | Description | Selected |
|--------|-------------|----------|
| Persister une clé query dédiée | File via persistQueryClient (même mécanisme que lecture 33-D01/D-02) | ✓ |
| IndexedDB séparé | Indépendant du cache mais deuxième mécanisme à purger/namespace | |
| Dexie | Écarté : le mode démo Dexie retiré du prod ne revient pas (D-10 jalon) | |

**User's choice:** Persister une clé query dédiée
**Notes:** Un seul système de persistance, purge déjà awaitée à la déconnexion.

## Enfilage

| Option | Description | Selected |
|--------|-------------|----------|
| MutationCache central | buildQueryClient installe le cache global — corrige la classe (§2.7 E) | ✓ |
| Branchement par vue | N points à maintenir, risque d'oubli | |
| Dans l'adaptateur | Mélange transport et politique de file | |

**User's choice:** MutationCache central

## Lecture de la file

| Option | Description | Selected |
|--------|-------------|----------|
| Hook use-outbox sur la query | Gate et badge dérivent de la liste persistée, source unique | ✓ |
| Store Zustand compteur | Double source de vérité à synchroniser | |

**User's choice:** Hook use-outbox sur la query

## Sémantique d'enfilage — coche/décoche

| Option | Description | Selected |
|--------|-------------|----------|
| Fusion par entité | Une seule écriture par entité en attente, la dernière gagne | ✓ |
| File ordonnée brute | Historique fidèle mais séquences composées à optimiser à part | |

**User's choice:** Fusion par entité

## Création puis suppression hors-ligne

| Option | Description | Selected |
|--------|-------------|----------|
| Annulation locale par clé client | Create + delete partent ensemble, jamais de fantôme serveur | ✓ |
| Rejeu séquentiel | Ligne fantôme transitoire, risque de doublon Realtime | |

**User's choice:** Annulation locale par clé client

## Surface des échecs terminaux

| Option | Description | Selected |
|--------|-------------|----------|
| Panneau Paramètres | Panneau offline 32-D12 enrichi : liste, statut, Réessayer/Abandonner | ✓ |
| Feuille basse contextuelle | Plus immédiat mais nouveau composant modal + interruption | |

**User's choice:** Panneau Paramètres

## Toast de retour réseau

| Option | Description | Selected |
|--------|-------------|----------|
| Toast une fois | Discret, une fois par échec terminal ; retards réseau muets | ✓ |
| Rien de proactif | Silencieux mais l'utilisateur ne saura jamais pourquoi | |

**User's choice:** Toast une fois

## Modèle d'idempotence SQL

| Option | Description | Selected |
|--------|-------------|----------|
| Colonne client_key par table | client_key uuid + unique (household_id, client_key) + upsert on conflict | ✓ |
| Table outbox générique | Centralisé mais payload jsonb mal protégé par RLS par table | |

**User's choice:** Colonne client_key par table

## Rétrocompatibilité (lignes en prod)

| Option | Description | Selected |
|--------|-------------|----------|
| Backfill + NOT NULL | gen_random_uuid() immédiat, contrainte vraie dès le déploiement | ✓ |
| Deux migrations | État intermédiaire sans unicité garantie | |

**User's choice:** Backfill + NOT NULL

## Liste blanche d'écriture

| Option | Description | Selected |
|--------|-------------|----------|
| query-policy.ts | À côté de la allowlist lecture — un seul fichier pour l'éligibilité offline | ✓ |
| Fichier séparé | Deux sources de vérité pour « qu'est-ce qui marche hors-ligne » | |

**User's choice:** query-policy.ts

## Refus hors liste

| Option | Description | Selected |
|--------|-------------|----------|
| Refus upfront + toast | Rejeté avant tout départ réseau, jamais enfilé | ✓ |
| Refus au rejeu | Incohérent : l'éligibilité est connue dès l'enfilage | |

**User's choice:** Refus upfront + toast

## Déclencheurs du rejeu

| Option | Description | Selected |
|--------|-------------|----------|
| online + visibilitychange | Couvre le déverrouillage téléphone, pas de polling | ✓ |
| + Polling de secours | Couverture redondante, polling inutile | |
| online seul | Onglet resté ouvert sur connexion morte ne rejoue pas | |

**User's choice:** online + visibilitychange

## Ordre de rejeu

| Option | Description | Selected |
|--------|-------------|----------|
| FIFO + create d'abord | Creates avant update/delete par entité, puis ordre d'enfilage | ✓ |
| Par type d'opération | Risque de suppression avant un create dépendant | |

**User's choice:** FIFO + create d'abord

## Réconciliation Realtime

| Option | Description | Selected |
|--------|-------------|----------|
| Rapprochement par clé client | Realtime/invalidation priment toujours sur l'optimiste | ✓ |
| Invalidation seule | Flash visuel, risque de réintroduction d'ancien état | |

**User's choice:** Rapprochement par clé client

## Purge de la file

| Option | Description | Selected |
|--------|-------------|----------|
| Avertir puis purger | Déconnexion : scan + avertissement bloquant ; changement de foyer : purge directe | ✓ |
| Rejeu forcé avant purge | Chemin réseau critique dans signOut() | |
| Persistance inter-sessions | Écritures rejouées sous session suivante sans que l'utilisateur sache | |

**User's choice:** Avertir puis purger

## Tables Tier 1

| Option | Description | Selected |
|--------|-------------|----------|
| Aligné allowlist lecture | shopping_list_items, tasks, task_assignees, routines, routine_completions | ✓ |
| Étendre préventivement (events, notes) | Scope creep — le goal nomme Courses, Tâches, Routines | |

**User's choice:** Aligné allowlist lecture

## Badge en ligne

| Option | Description | Selected |
|--------|-------------|----------|
| Visible tant que N > 0 | Compteur qui descend pendant le rejeu, preuve visible | ✓ |
| Hors ligne seulement | Rejeu invisible, N>0 persistant paraîtrait un bug | |

**User's choice:** Visible tant que N > 0

---

## the agent's Discretion

- Format exact de l'entrée de file (table, operation, values, client_key, enfiled_at, status)
- Forme exacte du toast (libellé, icône, déduplication)
- Placement du hook use-outbox et de son test
- Détails du MutationCache (onError vs onSuccess) dans les limites de D-02

## Deferred Ideas

None — discussion stayed within phase scope.
