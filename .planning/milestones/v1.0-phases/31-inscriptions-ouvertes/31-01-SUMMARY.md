---
phase: 31-inscriptions-ouvertes
plan: 01
subsystem: base de données (Supabase SQL)
tags: [invitations, tokens, rpc, securite, phase-31]
requires: [0002_tables_identity, 0006_security_helpers, 0009_grants]
provides:
  - public.create_household_invite_token (modèle liste D-14, expiration obligatoire)
  - public.revoke_household_invite_token(uuid, text, text) (révocation individuelle)
  - public.household_invite_tokens_list(uuid, text) (liste anonymisée D-15)
  - public.preview_household_invite_token(text) (pré-auth lecture pure D-02/D-03/D-05)
affects: [31-02 (Edge preview), 31-03/31-04 (UI panneau + pré-écran)]
tech-stack:
  added: []
  patterns: [create or replace vers l'avant (§2.7 A), testkit.expect_denied, cas qui doit échouer §2.7-B]
key-files:
  created:
    - supabase/migrations/0176_token_list_governance.sql
    - supabase/tests/0176_token_list_governance.test.sql
  modified:
    - supabase/tests/0003_invites.sql (section 4 réécrite vers le modèle liste)
decisions:
  - promote assumé (assumption_delta_decision) : le modèle « un token actif par foyer » disparaît, 0003 réécrit au gabarit des reécritures post-0145
  - preview éxecutable par anon (clé publiable sans JWT) — seule fonction pré-auth du lot, le reste réservé service_role
  - preview lit created_by → profiles via LEFT JOIN (prénom vide plutôt qu'un token invisible si le profil manque)
metrics:
  duration: ~25 min
  completed: 2026-11-03
  commits: 2
  plan_head_before: 1582ddc599ec7f29fd04cef10e553edddf0cf3c0
  plan_head_after: a5b3342
actuals:
  tokens: 10000
  tasks: 2
  commits: 2
status: complete
---

# Phase 31 Plan 01 : Migration 0176 — modèle liste de tokens + preview RPC Summary

**Modèle « liste de tokens » fondé en base : deux tokens coexistent actifs, expiration obligatoire (30 j par défaut), révocation individuelle, liste anonymisée, et un RPC de preview pré-auth qui lit sans jamais consommer — appliqué, prouvé par 103/103 tests SQL verts.**

## What Was Built

**Task 1 (tracer, tdd) — migration 0176 + tests** (`3a023f6`) :
- `supabase/migrations/0176_token_list_governance.sql`, une transaction, cinq blocs :
  1. **Jetables** : `update ... set is_active = false where is_active` — aucun token pré-existant actif après la migration (décision « jetables »).
  2. **create_household_invite_token** : copie de la définition 0006 avec le bloc d'invalidation des prédécesseurs SUPPRIMÉ (modèle liste D-14) ; expiration obligatoire (null → now()+30 j, passée → 22023, clamp 90 j conservé).
  3. **revoke_household_invite_token(uuid, text, text)** : gabarit revoke global 0006:322-342, UPDATE borné `id + household_id + is_active`.
  4. **household_invite_tokens_list** : returns table anonymisé (id, dates, compteurs, statut) — JAMAIS token_hash (D-15).
  5. **preview_household_invite_token(text)** : SECURITY DEFINER stable, lecture pure (aucune écriture, D-05), household_name + prénom inviteur (D-02), résultat vide `{}` uniforme pour inconnu/expiré/épuisé/révoqué/hash malformé (D-03), comparaison via `private.token_hash_matches`.
  - Privilèges : create/revoke-one/list → service_role uniquement ; preview → anon + authenticated + service_role.
- `supabase/tests/0176_token_list_governance.test.sql` : cas (a) coexistence, (b) expiration 30 j / refus 22023, (c) révocation individuelle + refus non-admin + cross-foyer 0 ligne + id inconnu, (d) **no-consume** avec l'assertion négative bornée qui échouerait si le RPC écrivait (§2.7-B), (e) uniformité sur 5 motifs + second prouveur zéro-écriture (le token expiré reste actif, contrairement à redeem), (f) jetables comptés sur la table entière hors semis. Bonus : liste refusée au non-admin et cross-foyer.
- **RED prouvé** avant application : Test F échouait sur un token actif résiduel de la base ; les fonctions list/preview n'existaient pas.

**Task 2 — application + preuve test-db** (`a5b3342`) :
- `sh scripts/migrate.sh` : 0176 appliquée, journalisée (`schema_migrations` contient l'entrée).
- Corrections de fixtures 0176 : color_tag `rose` → `coral` (check 0001), cast `int::jsonb` → `to_jsonb()`, état « révoqué » semé par UPDATE direct.
- **0003 section 4 réécrite** vers le modèle liste (déviation documentée ci-dessous) : deux tokens coexistent actifs, le précédent reste actif ; l'assertion « un seul token actif » est remplacée par un comptage borné aux deux tokens du récit.
- **Chaîne §2.7 verte** : migrate.sh OK, check-sql-statique OK (230 fonctions, 0 défaut), test-check-sql-statique OK, **test-db.sh 103/103 fichiers verts**.
- Base post-migration : **0 token actif** (jetables prouvé en live).

## Deviations from Plan

**[Rule 1 - Bug/obsolescence] 0003_invites.sql réécrit (section 4)**
- **Found during:** Task 2
- **Issue:** l'assertion « un seul token actif à la fois, pour ce foyer » encode l'ancien modèle que 0176 remplace — échec attendu dès la première exécution post-migration.
- **Fix:** réécrite vers la vérité 0176 conformément à l'`assumption_delta_decision` du plan (**promote**, aucun modèle parallèle) ; gabarit des réécritures post-0145 (« réécrites vers la vérité, le code fautif des migrations reste dans l'histoire »).
- **Files modified:** supabase/tests/0003_invites.sql
- **Commit:** a5b3342

Corrections mineures de fixtures 0176 (color_tag, cast jsonb, état révocable semé directement) : même règle, incluses dans a5b3342.

## Known Stubs

Aucun.

## Notes for Next Plans

- 31-02 (Edge) : la preview Edge appelle `preview_household_invite_token(p_token_hash)` avec auth `['publishable']` ; rate-limit applicatif `preview ≤ 8` côté Edge (D-04, pas de Traefik).
- 31-04 (UI) : le toast « Le précédent est invalidé » et `isRecallValid` (match par createdAt) suivent le modèle liste — dette tracée dans le plan 31-04.
- `household_invite_token_summary` (0006) reste définie et verte ; l'Edge la remplacera par la liste en 31-02 — sa suppression éventuelle est hors périmètre 31-01.

## Self-Check: PASSED

- supabase/migrations/0176_token_list_governance.sql : FOUND (commit 3a023f6)
- supabase/tests/0176_token_list_governance.test.sql : FOUND (commit 3a023f6)
- Commits 3a023f6 / a5b3342 : FOUND dans git log
- schema_migrations entrée 0176 : FOUND (migrate.sh --status)
- test-db.sh 103/103 verts : prouvé à l'exécution
