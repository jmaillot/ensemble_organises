---
phase: "34"
slug: "file-d-criture-rejeu"
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-06"
status: validated
---

# Phase 34 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Client ↔ PostgREST | Écritures hors-ligne enfilées localement (IndexedDB `eo-offline-cache`) puis rejouées vers l'API ; identité portée par le client (`client_key`, `household_id`) | Lignes des 5 tables Tier 1 (shopping_list_items, tasks, task_assignees, routines, routine_completions) |
| Client ↔ IndexedDB | File d'outbox et cache de requêtes persistés côté navigateur | Données du foyer de l'utilisateur (purge à la déconnexion / au changement de foyer) |
| Serveur (RLS) | Frontière d'autorisation finale ; l'upsert de rejeu est borné au foyer | Toutes écritures rejouées |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-34-01 | Tampering | client_key / household_id transmis par le client (upsert de rejeu) | high | mitigate | `0177_client_key.sql:49,58` — contrainte `unique (household_id, client_key)` sur les tables à foyer ; test négatif inter-foyer `expect_denied` (0177 test.sql Test D) | closed |
| T-34-02 | DoS | Rejeu en boucle d'un refus terminal | high | mitigate | `outbox-replay.ts:59` — seuls les `status: 'pending'` sont rejoués ; terminal → `'failed'` jamais relu (commentaire « boucle structurellement impossible » l.88-89) | closed |
| T-34-03 | Information Disclosure | Outbox persistée contenant les values des lignes | medium | mitigate | Namespacing `(userId, householdId)` : `outboxKeyFor`, `eo-query-cache:<userId>:<householdId>` (`query-persistence.ts:26-27`) ; purge du foyer quitté emporte l'outbox (`household-store.ts:97-104`, D-17) | closed |
| T-34-04 | Repudiation | Refus métier (RLS 42501, check 23514) enfilé comme « en attente » | high | mitigate | `isNetworkFailure` (`outbox.ts:301-325`) — tout code PostgREST 4xx ⇒ `false`, jamais enfilé ; appelé AVANT `enqueueOutbox` (`query-policy.ts:134-135`) | closed |
| T-34-05 | Tampering | Mutation hors allowlist enfilée via un chemin oublié | medium | mitigate | Double barrière : garde upfront `assertWriteAllowed` (`useResource.ts:162,169,176,325,332`, D-07) + filtre du MutationCache (`query-policy.ts:131-136`) + filet adaptateur (T-34-13) | closed |
| T-34-06 | Tampering | Payload de file sérialisé rejoué tel quel | medium | mitigate | Rejeu uniquement via les méthodes typées de l'adaptateur (`outbox-replay.ts:152,160,168,171`) ; jamais de SQL construit ; RLS + contrainte restent la frontière | closed |
| T-34-07 | Repudiation | Overlay optimiste présentant comme faite une écriture jamais appliquée | high | mitigate | D-16 : overlay portant `id + client_key`, `invalidate()` après chaque succès (`useResource.ts:197,220,230,268`), rollback snapshot sur refus métier — le serveur prime toujours | closed |
| T-34-08 | Information Disclosure | Données personnelles survivant à la déconnexion | high | mitigate | `session-store.ts:66-99` — signOut goulot unique : scan outbox AVANT purge, rejet typé sans `acknowledgePendingWrites`, `await purgeUserCache(userId)` bloquant ; purge sans confirmation au changement de foyer | closed |
| T-34-09 | Repudiation | Échec terminal effacé en silence (Abandonner sans trace) | medium | mitigate | `offline-panel.tsx:258-260` — Abandonner derrière `ConfirmDialog`, retrait explicite uniquement ; échec d'abord rendu visible (badge/panneau) | closed |
| T-34-10 | DoS | Réessayer spamé → boucle de requêtes | low | mitigate | `retryOutboxEntry` (`outbox-replay.ts:112-134`) — repasse `pending` une fois par action explicite ; le rejeu automatique ne lit jamais `failed` | closed |
| T-34-11 | DoS | Rejeu en boucle d'un refus (amplification serveur) | medium | mitigate | Client : D-10 (T-34-02) ; serveur : test d'idempotence upsert rejoué deux fois sans doublon (0177 test.sql Test B) | closed |
| T-34-12 | Repudiation | Refus hors-ligne silencieux ou mensonger | low | mitigate | `write-policy.ts:51-54` — `assertWriteAllowed` retourne early pour toute table allowlistée ; `OFFLINE_WRITE_REFUSED_MESSAGE` uniquement hors liste | closed |
| T-34-13 | Tampering | Chemin d'écriture brut contournant l'outbox (G-34-1) | high | mitigate | `assertWriteAllowed` aux 4 points d'écriture de la frontière adaptateur (`supabase-adapter.ts:130,193,211,228`) + routage Tier 1 de toutes les écritures d'articles Courses + régression `courses-offline-writes.test.tsx` | closed |
| T-34-14 | Tampering | Absorption d'un échec non enfilé (perte silencieuse) | high | mitigate | `isEnqueuedFailure = isWriteAllowed(table) && isNetworkFailure(error)` (`useResource.ts:80-82`) — miroir exact du filtre onError ; Tests 3/4 de `useResource.test.tsx:183-194` prouvent les deux rejets | closed |
| T-34-15 | Repudiation | Appelants comptant sur le rejet réseau pour réinitialiser l'état UI | medium | mitigate | Symétrie WR-02 (`useResource.ts:206,242,255,276`) — overlay conservé si enfilé, snapshot restauré si refus ; inventaire des 12 sites `itemResource.*` consigné (34-06-SUMMARY.md) | closed |
| T-34-SC (×6) | Tampering | npm/pip/cargo installs | high | mitigate (n/a) | Aucune installation dans la phase (disposition documentée dans les 6 `<threat_model>`) — conforme, la phase n'installe rien | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

No accepted risks.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-06 | 15 + T-34-SC ×6 | 15 | 0 | gsd-security-auditor (ASVS L1, block_on: high) — verdict **SECURED** |

**Verdict :** toutes les mitigations déclarées sont présentes dans le code implémenté aux emplacements cités, avec les preuves de test associées (0177 test.sql, useResource.test.tsx, courses-offline-writes.test.tsx, offline-panel). Aucun flag de SUMMARY non enregistré — 34-06 déclare « aucune nouvelle surface », cohérent avec les fichiers implémentés.
