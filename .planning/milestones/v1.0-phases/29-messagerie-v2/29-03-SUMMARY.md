---
phase: 29-messagerie-v2
plan: 03
subsystem: messagerie/realtime
tags: [realtime, websocket, preuve, d-09, msg-05]
requires: [migration 0010 (publication supabase_realtime), migration 0046, scripts/lib-db.sh, service realtime du snapshot]
provides: [scripts/test-realtime-subscription.sh — preuve D-09 réexécutable]
affects: []
tech-stack:
  added: []
  patterns: ["preuve attribuable sur le modèle test-dispatch-push.sh (évidence avant l'appel qu'elle prouve, nettoyage vérifié par comptage)"]
key-files:
  created: [scripts/test-realtime-subscription.sh]
  modified: []
decisions:
  - "Souscription par le chemin de production api-gw (Envoy) : la connexion directe au conteneur realtime répond 404 (Host de tenant manquant) — la gateway pose Host: realtime-dev.supabase-realtime"
  - "Client WS natif Node ≥22 (aucune dépendance npm nouvelle — T-29-SC), jeton service_role par variable d'environnement jamais en argv (T-29-06)"
  - "Aucune migration 0173 : pg_publication_tables couvre déjà messages, conversations, conversation_members, notification_reads"
  - "Variables shell en ASCII : dash rejette les identifiants non-ASCII (Expéditeur → Expediteur)"
metrics:
  duration: ~35 min
  completed: 2026-10-29
status: complete
commits: 1
plan_head_before: 7bd2a4bb59973d26e2965b8d000eb4851543edfe
plan_head_after: d507387
tasks: 2
---

# Phase 29 Plan 03: Preuve Realtime par souscription réelle (D-09) Summary

**Preuve D-09 livrée : un client WebSocket réel reçoit l'événement INSERT de `public.messages` en 1s, attribué au message semé, nettoyage vérifié — critère 4 du roadmap prouvé, pas supposé.**

## Ce qui a été fait

- **Task 1** — `scripts/test-realtime-subscription.sh` (commit `d507387`) : préconditions explicites (services `realtime` et `api-gw` démarrés — s'ils manquent, le script s'arrête et le dit, jamais de vert silencieux) ; lecture de la publication SQL comme précondition nécessaire et NON suffisante ; client WS natif Node ≥22 écrit éphémèrement dans `/tmp/opencode` (jamais versionné, jamais avec la clé), joint le canal `realtime:public:messages` en `postgres_changes` INSERT par le chemin de production `ws://localhost:8000/realtime/v1/websocket` (api-gw/Envoy) ; semis d'une conversation + message marqué `MARQUEWS-…` via psql stdin ; attente bornée (défaut 30s) ; vérification que le record reçu porte l'id ET la marque du message semé (§2.7-D) ; nettoyage vérifié par comptage (§2.7-F).

- **Task 2** — Exécution et consignation :
  - **Vert** (exécution réelle, 2026-10-29T14:48Z) : `SOUSCRIPTION_OK`, message semé `message_d787ee0e-5aa7-4358-a3cb-e48572d5d656`, événement `postgres_changes` reçu en **1s**, record correspondant (id + marque), nettoyage compté 0, sortie 0.
  - **Rouge vu avant vert** (§2.7-B) : variante temporaire souscrivant à une table non publiée (`mesures_absentes`) — le join est accepté mais aucun événement n'arrive ; le script rend TEMPS_DEPASSE, `ÉCHEC … l'événement n'est pas LIVRÉ`, nettoyage compté 0, sortie 1. Le rouge prouve que le script échoue quand l'événement n'arrive pas.
  - **Aucune migration 0173** : l'audit `pg_publication_tables` montre déjà les 4 tables attendues (messages, conversations, conversation_members, notification_reads) et `wal_level = logical`.

## Décisions et découvertes de mise au point

1. **Chemin de production obligatoire** : une connexion directe au conteneur realtime (`ws://<ip>:4000/realtime/v1/websocket`) répond **404** — le service v2 dérive le tenant du `Host` (`realtime-dev.supabase-realtime`), que seule la gateway api-gw pose (`host_rewrite_literal`). Le script exige donc api-gw démarré et documente ce piège.
2. **Node natif, zéro dépendance** : WebSocket global de Node ≥22 (T-29-SC : aucune installation npm).
3. **dash et identifiants non-ASCII** : `Expéditeur=` rend « not found » sous dash ; variables renommées `Expediteur`. (test-dispatch-push.sh porte les mêmes noms accentués — observation hors périmètre, consignée dans deferred-items.md.)
4. **Service realtime démarré manuellement** : le conteneur était défini mais arrêté au début de l'exécution ; `docker compose up -d realtime` l'a démarré (logs CDC normaux). Le script vérifie désormais cet état à chaque exécution.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Omission du helper `un()` dans la première version du script**
- **Found during:** Task 1 (exécution du rouge)
- **Issue:** le script appelait `un()` sans le définir (`un: not found` sous dash)
- **Fix:** helper `un()` ajouté (copie de test-dispatch-push.sh, avec le commentaire anti-pipeline sans pipefail)
- **Files modified:** scripts/test-realtime-subscription.sh
- **Commit:** d507387 (dans le commit unique de la tâche 1)

## Known Stubs

Aucun.

## Threat Flags

Aucune nouvelle surface : le script consomme l'API existante de la stack, n'expose aucun endpoint, et ne versionne aucun secret (clé service_role lue du `.env` de la stack, passée en variable d'environnement du client, jamais imprimée — T-29-06 respecté).

## Self-Check: PASSED

- [x] scripts/test-realtime-subscription.sh existe
- [x] commit d507387 présent dans git log
- [x] `sh scripts/test-realtime-subscription.sh` → sortie 0, verdict OK, nettoyage vérifié
- [x] Aucune ligne de test résiduelle en base (comptage 0 vérifié par le script)
