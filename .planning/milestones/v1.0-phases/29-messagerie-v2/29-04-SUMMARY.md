---
phase: 29-messagerie-v2
plan: 04
subsystem: messagerie (frontend)
tags: [messages, read-receipts, watermark, tanstack-query, vitest]
requires:
  - "RPC conversation_read_receipts (0171, plan 29-01) — watermarks co-membres"
  - "notification_reads (0046) + useSyncedReads (fusion max local/serveur)"
  - "Realtime messages/conversations (useMessagesRealtime, D-08)"
provides:
  - "useReadWatermark : écriture D-01 à l'ouverture/focus (messages-page)"
  - "fetchReadReceipts + ReadReceipt : RPC 0171 en ligne, jointure démo"
  - "ReadReceipts : rangée d'accusés UI-SPEC (0/1/n, +N au-delà de 5)"
  - "migrateLocalReads : portage D-03 one-way localStorage → notification_reads"
affects:
  - "29-05 (restant frontend) : consomme la même surface readMap/markRead"
tech-stack:
  added: []
  patterns:
    - "Requête accusés sous le préfixe ['messages'] — invalidée par le Realtime existant, jamais un canal dédié (D-08)"
    - "Portage one-way avec dépendances injectées (prouvable hors navigateur)"
    - "Composition MemberAvatar sm, aucun nouveau composant générique (UI-SPEC)"
key-files:
  created:
    - app/src/modules/messages/components/read-receipts.tsx
    - app/src/lib/notification-reads.migration.test.tsx
    - app/src/modules/messages/hooks/use-messages.watermark.test.tsx
    - app/src/modules/messages/hooks/use-messages.receipts.test.tsx
    - app/src/modules/messages/api.read-receipts.test.ts
    - app/src/modules/messages/components/read-receipts.test.tsx
  modified:
    - app/src/lib/notification-reads.ts
    - app/src/modules/messages/api.ts
    - app/src/modules/messages/hooks/use-messages.ts
    - app/src/modules/messages/messages-page.tsx
    - app/src/modules/messages/components/chat-panel.tsx
decisions:
  - "Après portage D-03 réussi, la clé locale ne revit plus : l'optimisme reste en mémoire (setLocalMap), la persistance appartient au serveur — un marquage réécrit sinon une clé partielle et contredirait le one-way"
  - "La rangée d'accusés est rendue dans le fragment de la dernière bulle MINE (pas en fin de liste) : sous des messages reçus après coup, elle reste sous la bonne bulle (D-02 verbatim)"
  - "L'horodatage affiché est la lecture la plus récente (latestRead) : c'est l'instant où le message a été vu en dernier ; avatars triés par ordre de lecture"
metrics:
  duration: ~16 min
  completed: 2026-10-29T16:20Z
  tasks: 3
  files: 11
status: complete
actuals:
  tokens: 20000
  tasks: 3
  commits: 3
commits: 3
plan_head_before: 98c4957
plan_head_after: 16478cf
estimate:
  tokens: 100000
  raw_tokens: 65000
  tasks: 3
  confidence: low
---

# Phase 29 Plan 04: Watermark de lecture et accusés côté émetteur Summary

**One-liner :** markRead une fois par session d'ouverture/focus (D-01), rangée d'accusés avatars+horodatage sous la dernière bulle envoyée (D-02, gabarit UI-SPEC), portage one-way du localStorage vers `notification_reads` (D-03) — 40 tests du module messages verts, chaîne §2.7 partielle verte (typecheck, 1668 unitaires, build).

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Migration D-03 + markRead ouverture/focus D-01 | 3f6e490 | notification-reads.ts, use-messages.ts, messages-page.tsx + 2 tests |
| 2 | fetchReadReceipts + rangée d'accusés (D-02) | ce02fec | api.ts, chat-panel.tsx, read-receipts.tsx + 3 tests |
| 3 | Edges UI-SPEC backstop prouvés | 16478cf | read-receipts.test.tsx (borne exacte 5) |

## Verification (§2.7)

- `cd app && npm run typecheck` : **vert**.
- `cd app && npm test` : **209 fichiers, 1668 tests verts** (dont 40 sur le module messages + notification-reads, 12 nouveaux).
- `cd app && npm run build` : **vert** (Vite, sw.js généré).
- Task 3 (chaîne partielle planifiée) : `npm run typecheck && npm test -- src/modules/messages` → 7 fichiers / 68 tests verts, le filtre positionnel trouve bien les tests (garde du fails_when honorée).
- Pas de Docker/SQL attendu dans ce plan : les RPC 0171 sont déjà migrées et testées (29-01, 99/100 verts).

## Comportements prouvés (tdd)

- **D-03** : portage réussi → clé `ensemble-organises-messages-read:<compte>` absente et horodatages lus sur le serveur ; échec réseau → clé CONSERVÉE, erreur propagée sans effacement ; max des deux gagné (entrée locale plus ancienne = zéro écriture de régression) ; clé vide = rien ne bouge.
- **D-01** : une écriture à l'ouverture, zéro au re-rendu (messages en direct), une au `visibilitychange` visible, une au changement de fil, zéro sans fil.
- **D-02** : 0 lecteur → rangée absente ; 1 lecteur → avatar + « À l'instant » ; 5 → pas de « +0 » ; 6 → 5 avatars + « +1 » sur la même rangée ; initiale blanche sur `bg-coral-deep` (AA) ; ordre de lecture ; mapping RPC camelCase et jointure démo `user_id → household_members` ; appelante et sans-lecture exclus.

## Deviations from Plan

**1. [Rule 3 - Blocage] Task 1 commit porte le scaffolding de l'accusé (api.ts)**
- **Found during:** Task 1 commit
- **Issue:** `useReadWatermark` et `useReadReceipts` vivent dans le même fichier use-messages.ts ; couper api.ts du commit 1 laissait l'arbre rouge au commit (typecheck).
- **Fix:** commit 1 = Task 1 + `fetchReadReceipts`/`messageKeys.receipts` (déclaré dans le message de commit) ; le rendu D-02 reste au commit 2. Aucun commit intermédiaire cassé.

**2. [Note] `formatListTime` renvoie « Hier » capitalisé**
- L'UI-SPEC cite « hier » en minuscule ; le gabarit existant du fil (formatListTime) capitalise. Réutilisation du gabarit existant (Don't Hand-Roll) — « À l'instant » suit la même casse.

## Known Stubs

Aucun. Toutes les surfaces sont câblées : le badge lit le watermark serveur, la rangée lit le RPC 0171, la migration D-03 est effective au premier chargement.

## Threat Model — mitigations livrées

- T-29-08 (migration D-03) : le client ne pousse que SES entrées — `migrateLocalReads` filtre `user_id === userId` et passe par `data.create/update` sur `notification_reads` (RLS own-only 0046). ✔
- T-29-09 (markRead) : garde de monotonie `current[id] >= at` conservée ; après portage, l'écriture locale cesse et le serveur reste borné par la RLS. ✔

## Notes

- D-08 respecté : la requête des accusés vit sous le préfixe `['messages']`, invalidée par `useMessagesRealtime` existant — aucun canal Realtime dédié aux watermarks.
- Copie : aucun libellé visible sur la rangée (Copywriting Contract) ; `aria-label="Lu par {prénoms}"` pour le lecteur d'écran, aucun terme technique à l'écran.
- 29-05 (si prévu) n'a plus qu'à brancher le member-picker → `open_direct_conversation` (0171, RPC déjà exposée côté api ? non — à faire au plan 05).
