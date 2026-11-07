---
phase: 35-deep-links-validation-multi-os
plan: 07
subsystem: network-state / boot
tags: [deep-links, offline, android, reachability-probe, g35-4, online-manager]
requires: [35-06 (gardien 35-06 = filet, NON modifié), dlnk02 diagnostic (H1 confirmé on-device)]
provides: [sonde de joignabilité du backend reflétée dans onlineManager (≤ 4 s au boot), re-probe aux événements online/offline]
affects: [main.tsx, online-status.ts, onlineManager (comportement)]
tech-stack:
  added: []
  patterns: [Promise.race fetch-vs-délai (AbortController manuel + setTimeout, pas AbortSignal.timeout — leçon W3), site unique d'upgrade (D-11), no-op sur feature-flag de configuration (D-08)]
key-files:
  created:
    - app/src/lib/reachability.ts
    - app/src/lib/reachability.test.ts
  modified:
    - app/src/main.tsx
    - app/src/lib/online-status.ts
    - app/src/lib/online-status.test.ts
decisions:
  - D-11 appliqué en code : l'upgrade en ligne n'a qu'UN site (succès observé de la sonde) ; l'événement `online` du navigateur repose l'état à false le temps de la re-sonde (TanStack le remonterait à true tout seul — c'est le trou refermé) ; `offline` est cru immédiatement (seul le downgrade est permis sans preuve).
  - Pas d'AbortSignal.timeout (leçon W3 de 35-06, grep-négation vérifiée) : Promise.race entre le fetch et un setTimeout injectable (`options.delai`, tests seulement ; défaut DELAI_SONDE_MS=4000 en production), clearTimeout apparié en finally.
  - No-op total en mode démo (isSupabaseConfigured=false) : ni fetch ni listener — basculer offline là où le backend n'existe pas serait un mensonge (D-08) ; c'est ce qui garantit les e2e (build sans VITE_SUPABASE_URL).
  - Limite honnête T-35-12 (§2.7 I) documentée : blip backend sans bascule réseau → app reste en cache+bandeau jusqu'à une bascule réelle ou reload ; aucun retry en boucle ni timer périodique.
metrics:
  duration: ~1h
  completed: 2026-11-07
status: complete
estimate:
  tokens: 48000
  raw_tokens: 32000
  tasks: 3
  confidence: low
actuals:
  tokens: 35000
  tasks: 3
  commits: 3
commits: 3
plan_head_before: 5f458fc8450cbd85a08a9918f9c45ba689acb183
plan_head_after: 33f23fb5d40d9a898c28bd2ee6375d77bb2952ac
requirements: [DLNK-02, DLNK-03]
---

# Phase 35 Plan 07: Sonde de joignabilité — gap G-35-4 (Android mode avion : navigator.onLine ment) Summary

**Une sonde réseau (GET no-cors /auth/v1/health) reflète la joignabilité RÉELLE du backend dans onlineManager au boot — en mode avion Android (onLine=true, réseau mort), l'app bascule offline en ≤ 4 s et active le chemin « cache + bandeau » au lieu de partir en « Failed to fetch ».**

## Ce qui a été fait

### Task 1 — Sonde de joignabilité (TDD, 5 cas rouges d'abord)
- `app/src/lib/reachability.ts` : `DELAI_SONDE_MS = 4000` (bien sous le gardien 10 s de 35-06) ; `demarrerSondeJoignabilite(options?)` — première sonde immédiate, abonnement `online`/`offline` sur window, fonction de nettoyage retournée (désabonnement + annulation de la sonde en vol, sans muter l'état).
- Échec (rejet fetch OU échéance) → `onlineManager.setOnline(false)` ; succès → `setOnline(true)` — **seul site d'upgrade du module** (D-11). Réponse no-cors opaque, jamais lue (T-35-14).
- Listener `online` : repose false PROVISOIREMENT puis re-sonde (TanStack re-bascule onlineManager à true tout seul sur cet événement — trou D-11 refermé) ; listener `offline` : false immédiat. Une seule sonde en vol (drapeau) ; annulation par nettoyage ≠ preuve d'échec (garde `annulee`).
- No-op total si `isSupabaseConfigured` est false (D-08) : ni fetch ni listener — garantit le chemin démo et les e2e.
- W3 respecté : zéro `AbortSignal.timeout` (grep vérifié), Promise.race fetch-vs-minuteur, délai injectable, clearTimeout apparié en finally.
- Tests T1-T5 : vus ROUGES (import module inexistant, commit `3518321`) puis 5/5 verts.

### Task 2 — Câblage au boot : seed optimiste, sonde correctrice
- `main.tsx` : `demarrerSondeJoignabilite()` appelé juste après `seedOnlineStatus()` (ordre = contrat, Test E vu rouge avant câblage) ; pire cas documenté en commentaire français (sonde pas encore tranchée à la première lecture du bootstrap → comportement 35-06 inchangé, la sonde ne peut jamais dégrader le parcours).
- `online-status.ts` : en-tête révisé (§2.7 I — l'affirmation « navigator.onLine est la SEULE source » était devenue fausse) : seed optimiste conservé (première peinture honnête), la sonde est la couche correctrice pour les plateformes où il ment (H1 Android). `seedOnlineStatus()` inchangé.
- session-store.ts, use-auth.ts, supabase-adapter.ts, offline-banner.tsx : **git diff vierge** — gardien 35-06 et repli 35-04 intacts.

### Task 3 — Chaîne §2.7 + consignation
- typecheck ✓, tests ciblés 243 ✓, `npm test` ✓ (**240 fichiers / 1908 tests**), build ✓, e2e deep-link-redirect ✓ (**6/6**, sonde no-op dans le build e2e = cas T5), `check-sql-statique.py` ✓ (aucune migration touchée). `test-db.sh` non applicable : AUCUNE modification SQL.
- Cas qui doit échouer : les commits RED (`3518321` pour T1-T5, `33f23fb` pour Test E) prouvent chaque échec observé — cités dans les messages de commit.
- `35-07-NOTES.md` consigné (cas rouges, chaîne, rappel D-11) ; `deferred-items.md` : item DLNK-02 Android annoté 35-07 — **le rejeu on-device du test 3 de 35-UAT.md reste le véhicule de fermeture de G-35-4** (la preuve automatisée ne suffit jamais).

## Deviations from Plan

**1. [Rule 3 - Blocking] Erreur d'édition dans online-status.test.ts pendant la rédaction du Test E (RED)**

- **Found during:** Task 2 (rédaction du Test E)
- **Issue:** la première édition a avalé la clôture du Test D (accolades) → parse error, suite entière rouge
- **Fix:** restauration immédiate du commentaire LIMITE DITE + `});` du Test D ; le rouge du Test E a ensuite été obtenu proprement (1 failed | 4 passed)
- **Files modified:** app/src/lib/online-status.test.ts (final = l'état voulu)
- **Commit:** 33f23fb

Sinon : plan exécuté exactement comme écrit (aucun fichier interdit touché, aucune dépendance ajoutée).

## Known Stubs

None — aucune donnée simulée dans le chemin de production.

## Threat Flags

Aucune surface nouvelle : la sonde n'envoie aucune donnée utilisateur, sa réponse opaque est ignorée (T-35-14 accept), le faux offline ne perd que de l'affichage (T-35-12 mitigé par le downgrade-sur-preuve, prouvé T1-T3) et ne retarde que le rejeu, jamais le contenu (T-35-13 — file persistée D-08, suite outbox verte). Aucune dépendance ajoutée (T-35-SC inchangé).

## Verification Commands

```
cd app && npm run typecheck                      # ✓ 0 erreur
npx vitest run src/lib/reachability.test.ts      # ✓ 5 passed (T1-T5, rouges avant)
npx vitest run src/lib/online-status.test.ts src/lib/reachability.test.ts  # ✓ 10 passed
npx vitest run src/hooks/__tests__ src/stores/__tests__ src/lib            # ✓ 243 passed
npm test                                          # ✓ 240 files / 1908 tests, 0 failed
npm run build                                     # ✓
npx playwright test deep-link-redirect --reporter=list  # ✓ 6 passed
python3 scripts/check-sql-statique.py             # ✓ 230 fonctions / 179 migrations / 106 tests, aucun défaut
```

## Self-Check: PASSED
