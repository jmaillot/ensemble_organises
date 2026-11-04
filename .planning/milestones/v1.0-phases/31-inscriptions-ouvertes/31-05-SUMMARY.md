---
plan: 31-05
status: completed
phase: 31
completed_at: 2026-11-03T13:55:00Z
tasks_total: 3
tasks_completed: 3
deviations: rule_2_checkpoint_shaped_as_task
---

# 31-05 — Mentions légales + rate-limits Traefik

## Ce qui a été construit

1. **/mentions-legales publique (D-13)** — commits `905f296` : page légale publique (route dé-gatée, preload), relecture langue claire du §6 confidentialité, lien depuis footer CGU/confidentialité. Tests 7/7 verts, typecheck + build verts.
2. **Middlewares Traefik rateLimit** — commit `a531064` : `eo-signup-rl` (3/min rafale 6) sur `/auth/v1/signup`, `eo-token-rl` (10/min rafale 20) sur `/auth/v1/token`, routers dédiés priority 200 vers `eo-api-svc`, router général sans middleware. `docker compose config` validé localement.
3. **Déploiement prod + preuves 429 + validation éditeur** — ⚠ **attestation orale de l'opérateur (2026-11-03)** : le déploiement de l'override et les vérifications (429 signup/token, reste de l'API non limité, validation du contenu des mentions légales) ont été exécutés sur l'hôte de prod et « ça marche » selon l'opérateur. **Les relevés 429 datés et les captures ne sont PAS consignés** — la preuve documentaire manque ; seul le fait opérateur est enregistré.

## Preuves

- Locales : tests 7/7, typecheck, build, `docker compose config` OK (exécutés, résultats cités dans les commits).
- Prod : **attestation orale** (« c'est bon, ça marche », 2026-11-03) — sans relevé daté.

## Self-Check: PASSED (périmètre local) — preuves prod documentaires manquantes, signalé au verifier
