---
status: complete
phase: 29-messagerie-v2
source: [29-VERIFICATION.md]
started: 2026-10-29T18:00:00Z
updated: 2026-10-30T09:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Livraison push réelle sur appareil
expected: test-dispatch-push.sh → `delivered` sur appareil abonné ; payload sans contenu de message
result: issue
reported: "ÉCHEC 401 INVALID_API_KEY : \"The apikey header matched no key configured for auth mode(s): \\\"secret\\\", \\\"user\\\"\" — (secret: \\\"default\\\"), reçu apikey=secret sans authorization. Le rappel n'est jamais dispatché (ligne toujours là, renvoyée indéfiniment). Le script signale aussi « Le serveur n'a pas de clé VAPID configurée » alors que l'utilisateur en a une."
severity: blocker

## Summary

total: 1
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-29-1
  truth: "test-dispatch-push.sh → `delivered` sur appareil abonné ; payload sans contenu de message"
  status: passed
  closed: 2026-10-30 (plan 29-06)
  reason: "Clos. Sonde Edge dans le prévoluble (commit 8d49c22), docs recreate/restart (b592759), UAT 1 re-passée verte sur le serveur : Sonde auth OK, dispatch 200 {delivered:4, consumed:1} — rappel consommé (restant 0), groupe messages 200 {delivered:4, consumed:3} « 3 nouveaux messages de Semure » sans contenu ; notifications reçues sur l'appareil (Firefox). Cause résiduelle découverte pendant la fermeture : supabase-envoy recréé avec un SERVICE_ROLE_KEY étranger au .env (export shell hérité) → 401 text/plain d'Envoy → code:undefined côté Edge ; fix = shell neuf + recreate api-gw + recreate functions. Défauts de classe corrigés en route : identifiant non-ASCII Expéditeur refusé par dash/C sur le serveur (1e48b16), stack serveur en retard (migrations 0150+ et Edge à jour)."
  severity: blocker
  test: 1
  root_cause: "Le conteneur functions qui a servi le 401 n'avait pas la clé sb_secret_ du Vault : SUPABASE_SECRET_KEYS (docker-compose.yml:463) retombe silencieusement sur {\"default\":\"\"} si la variable manque du contexte Compose, et un `docker restart` ne ré-interpole jamais le .env (seul `recreate` le fait) — l'arrêt/redémarrage 07:14→07:32 a précédé le test 07:36. Depuis le recreate du 2026-10-29, la config est cohérente de bout en bout : les sondes passent l'auth (400 « Portée inconnue » = porte métier) et le replay réel du dispatch renvoie 200 {notifications:2}. Le message VAPID (notifications-panel.tsx:223 via push-subscribe push_configured:false) est le même défaut de classe sur VAPID_PUBLIC_KEY, également corrigé par ce recreate."
  artifacts:
    - path: "supabase-project/docker-compose.yml:463"
      issue: "SUPABASE_SECRET_KEYS retombée silencieuse sur {\"default\":\"\"} ; le nom \"default\" collide avec le fallback legacy SUPABASE_SERVICE_ROLE_KEY (ligne 460) — configuredKeyNames identique en état sain et cassé"
    - path: "scripts/test-dispatch-push.sh"
      issue: "Le diagnostic du 401 ne distingue pas « runtime functions en retard sur le .env » de « clé Vault ≠ .env »"
  missing:
    - "Sonde push-notify dans le prévoluble du script avec messages distincts (recreate functions vs set-push-secrets.sh)"
    - "Documenter/imposer `recreate` (jamais `restart`) après toute modification du .env"
  debug_session: .planning/debug/dispatch-push-401.md
