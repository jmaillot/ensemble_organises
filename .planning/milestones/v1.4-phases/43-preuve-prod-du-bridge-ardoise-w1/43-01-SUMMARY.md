---
phase: 43
plan: 01
subsystem: scripts/supabase-doc
tags: [e2e, preuve-prod, bridge-ardoise, edge-functions, curl-0600, purge-e2e]
requires: [stack-prod-locale, edge-ardoise-invite, edge-household-invite, migrations-0180b-0181, lib-smoke-accounts]
provides: [script-preuve-prod-bridge, doc-brige-ardoise-preuve, PROOF-01..06-prouves]
affects: [scripts/test-ardoise-bridge-real.sh, docs/BRIDGE-ARDOISE-PREUVE.md]
tech-stack:
  added: []
  patterns: [curl -K fichier-0600, psql-stdin-borné, budget rate-limit 8/min, attente réelle d'expiration]
key-files:
  created: [scripts/test-ardoise-bridge-real.sh, docs/BRIDGE-ARDOISE-PREUVE.md]
  modified: [scripts/lib-smoke-accounts.sh]
decisions:
  - "Négatif replay épinglé à l'observable réel : 410 « Ce token a été révoqué. » (is_active vérifié AVANT use_count dans 0181 ; l'invité lui-même prouve l'usage unique)"
  - "config_session à étiquette unique — aucun compteur global en substitution de commande (sous-shell)"
  - "householdId explicite sur create-ardoise du foyer B (households[0] sinon)"
  - "Asserts tokens bornés : use_count >= 1 pour le consommé, never-used+actif pour le ré-émis (sans condition d'expiration)"
metrics:
  duration: ~5h (runs 1-10, dont 2 runs complets verts de ~20 min)
  completed: 2026-11-11
status: complete
plan_head_before: 4045f843e228418fa0bab96f08c3ed9a22cea90a
plan_head_after: d7c910e
commits: 12
actuals:
  tokens: 74000
  tasks: 3
  commits: 12
estimate: ~35000
---

# Phase 43 Plan 1 : Preuve prod du bridge ardoise Summary

Script de preuve prod bout-en-bout du bridge invité→foyer ardoise (curl -K 0600, psql stdin borné, attente réelle d'expiration, purge e2e prouvée) — **vert de bout en bout sur 2 runs consécutifs** (run 9 et run 10 idempotence), doc auto-rédigé `docs/BRIDGE-ARDOISE-PREUVE.md`.

## Résultats des runs finaux

- **Run 9** (log `/tmp/opencode/43-01-run9.log`) : 18 étapes HTTP 200/410/404 attendus, 4 négatifs rouges vus rouges (replay 410 « révoqué », token muté 404, token expiré 410 après **1020 s d'attente réelle** sans falsification SQL, cross-household borné), 9 asserts SQL exacts, purge foyers cascade → 0 ligne + comptes re-delete → 404.
- **Run 10 (idempotence)** (log `/tmp/opencode/43-01-run10-idempotence.log`) : même verdicts, aucun artifact accumulé, doc réécrit (pas accumulé) daté du run 10.
- `python3 scripts/check-sql-statique.py` : vert (aucune migration touchée).
- `git status` : uniquement le script, le doc et `.planning/` — aucun code produit modifié.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Cause racine du « replay 200 idempotent » — écrasement de session par compteur de sous-shell**
- **Found during:** Tâche 3 (négatif replay), runs 4-5
- **Issue:** `config_session` incrémentait `CORPS_N` dans une substitution de commande `$(...)` : l'incrément était perdu, les deux appels écrivaient `session-1`, le second (invité) écrasait le JWT du payeur. L'étape 1 créait donc le foyer **en tant qu'invité** → invité déjà membre au 1ᵉʳ redeem → chemin idempotent 200. Les « runs 4/5 » prouvaient le bug du script, PAS un comportement de prod — les reproducteurs contrôlés (invitation ET bridge, redeems séquentiels) donnaient tous 410 « révoqué ». Hypothèse antérieure (compte tiers nécessaire) **supersédé** : le 3ᵉ compte n'a jamais été ajouté.
- **Fix:** `config_session` à étiquette unique (`payeur`/`invite`), `corps_secret` via `mktemp`. Signature corrigée après un premier passage fautif (étiquette écrite comme JWT — « Expected 3 parts in JWT; got 1 »), attrapé par le script instrumenté.
- **Files modified:** `scripts/test-ardoise-bridge-real.sh`
- **Commit:** `87c87ec` (précedé de `20dd84d` : assert élargi révoqué/épuisé + corps masqué en cas de KO)

**2. [Rule 1 - Bug] Ardoise du foyer B créée dans le mauvais foyer**
- **Found during:** Tâche 3 (étape 18), run 6
- **Issue:** sans `householdId`, `handleCreateArdoise` choisit `households[0]` (premier foyer par `created_at`) : l'invité ayant rejoint le foyer A avant de créer le foyer B, l'ardoise « B » naissait dans A → `create_expense(FOYER_B, ARDOISE_B)` en 400.
- **Fix:** `householdId: "$FOYER_B"` explicite, commentaire nommant la raison. Repro isolé vert au passage (payload sain).
- **Files modified:** `scripts/test-ardoise-bridge-real.sh`
- **Commit:** `0d18e2f`

**3. [Rule 1 - Bug] Asserts token à portée trop large — le 2ᵉ token ré-émis faussait le comptage**
- **Found during:** Tâche 3 (lectures SQL après coup), runs 7-8
- **Issue:** l'étape 11 ré-émet un 2ᵉ token bridge pour le MÊME foyer (négatif d'expiration) : `token_actifs` comptait TOUS les tokens actifs du foyer (le ré-émis, expiré mais `is_active=true` — purge cron quotidienne 0011 pas encore passée) → faux KO ; `token_max_uses` renvoyait 2 lignes dupliquées. Puis la prescription `expires_at > now()` était elle-même fausse : la lecture arrive ~17 min après émission (attente réelle 1020 s), condition toujours fausse (run 8).
- **Fix:** asserts bornés — `token_consomme_use_count`/`max_uses` (borne `use_count >= 1`, attendus exacts 1/1), `token_consomme_inactif` (0), `token_reemis_propre` (actif + `use_count = 0`, **sans** condition d'expiration : propriété never-used, attendu 1). Validation à blanc sur foyer inexistant.
- **Files modified:** `scripts/test-ardoise-bridge-real.sh`
- **Commits:** `9bb9951`, `d7c910e`

### Écarts de message consignés (pas de changement de code)
- Le plan prévoyait « 410 “utilisations maximal” » pour le replay : l'observable réel de prod est **410 « Ce token a été révoqué. »** — dans la fonction effective 0181, `is_active` (l.83-85) est vérifié AVANT `use_count >= max_uses` (l.96-98) et un token `max_uses=1` consommé est désactivé (`is_active = use_count+1 < max_uses`, l.342-343). L'usage unique reste prouvé par l'invité lui-même ; le 410 « épuisé » n'est observable ni par l'invité ni par un tiers sur un token consommé (consigné dans le doc §4).

## Authentification / Gates

Aucun gate d'authentification — tout se passe sur la stack prod locale (http://localhost:8000), secrets via `.env` de la stack, jamais imprimés.

## Known Stubs

Aucun stub dans le livrable. Un élément nommé mais non prouvé est consigné dans le doc §4 : **l'estampille frontend** (`/version.json`) est INDISPONIBLE sur les runs (conteneur frontend non démarré — code 000, nommé à chaque étape, jamais silencieux). Elle n'est pas requise par PROOF-01..07 sur ce canal HTTP.

## Self-Check: PASSED

- `scripts/test-ardoise-bridge-real.sh` existe (53993 octets) ✓
- `docs/BRIDGE-ARDOISE-PREUVE.md` réécrit daté du run 10 (1794399940-766728), verdict VERT ✓
- Commits vérifiés : `7f74132`..`d7c910e` (12 commits sur le ledger `4045f84..d7c910e`) ✓
- Runs finaux verts : run 9 + run 10 idempotence, exit 0 chacun ✓
- check-sql-statique : vert ✓
