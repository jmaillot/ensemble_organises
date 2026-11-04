---
phase: 29-messagerie-v2
plan: 05
subsystem: messagerie (frontend)
tags: [messages, member-picker, direct-conversation, realtime, tanstack-query]
requires:
  - "RPC open_direct_conversation (0171, plan 29-01) — anti-doublon D-05 côté serveur"
  - "useMessagesRealtime (messages/conversations) — étendu à conversation_members"
  - "member-picker phase 25 (enfants gérés inclus, D-04)"
provides:
  - "openDirectConversation : RPC 0171 en ligne, repli démo rouvrant la directe active entre deux membres"
  - "DirectPickerDialog « À qui écrire ? » : un tap = démarrage/réouverture, spinner inline, double-tap protégé"
  - "CTA « Démarrer une conversation » sur le panneau de liste et l'EmptyState"
  - "Realtime : invalidation fil + liste + accusés à l'insertion (D-08), notification_reads jamais souscrite"
affects:
  - "Vérification de phase 29 (orchestrateur) : critère 1 du roadmap prouvé côté UI"
tech-stack:
  added: []
  patterns:
    - "Mutation TanStack Query + isPending → ligne membre désactivée, libellé inchangé (UI-SPEC)"
    - "Repli démo rejouant la sémantique RPC localement (participations actives uniquement, D-05)"
    - "Invalidation Realtime par data.subscribe — jamais un canal dédié aux watermarks (D-08)"
key-files:
  created:
    - app/src/modules/messages/messages-page.direct.test.tsx
    - app/src/modules/messages/hooks/use-messages.realtime.test.tsx
  modified:
    - app/src/modules/messages/api.ts
    - app/src/modules/messages/hooks/use-messages.ts
    - app/src/modules/messages/components/conversation-form-dialog.tsx
    - app/src/modules/messages/components/conversation-list.tsx
    - app/src/modules/messages/messages-page.tsx
decisions:
  - "Le repli démo d'openDirectConversation ne considère que les participations ACTIVES (left_at null des deux côtés) : une pierre tombale ne rouvre pas, une nouvelle directe est créée — même sémantique que le RPC 0171 (D-05)"
  - "conversation_members ajouté à la souscription Realtime existante (même channel pattern data.subscribe) : une directe ouverte par un co-membre rafraîchit la liste, les arrivées/départs aussi — notification_reads reste exclue (D-08 verrouillé, test de garde dédié)"
  - "Le toast d'échec du démarrage affiche le message serveur lisible s'il existe (ex. « cette personne n'appartient pas à votre foyer »), sinon le libellé contractuel « Impossible d'ouvrir la conversation. Réessayez. » (UI-SPEC)"
metrics:
  duration: ~25 min
  completed: 2026-10-29T19:20Z
  tasks: 3
  files: 7
status: complete
actuals:
  tokens: 24000
  tasks: 3
  commits: 3
commits: 2
plan_head_before: 2ee6be6e80f25183757a8a3b655908495b565ef0
plan_head_after: 8b6b6cc
estimate:
  tokens: 90000
  raw_tokens: 60000
  tasks: 3
  confidence: low
---

# Phase 29 Plan 05: Entrée directe par member-picker et Realtime fil+liste Summary

**One-liner :** un tap sur un membre du picker « À qui écrire ? » démarre ou rouvre la directe via le RPC `open_direct_conversation` (0171, D-04/D-05) et les événements Realtime messages/conversations/conversation_members invalident fil ouvert + liste (badges compris, D-08) — 86 tests du module messages verts, chaîne §2.7 complète verte (typecheck, 1679 unitaires, build, 155 e2e).

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | openDirectConversation + picker « À qui écrire ? » (D-04/D-05) | b009f74 | api.ts, conversation-form-dialog.tsx, conversation-list.tsx, use-messages.ts, messages-page.tsx + 1 test |
| 2 | Realtime — invalidation fil + liste (D-08) | 8b6b6cc | use-messages.ts + 1 test |
| 3 | Chaîne §2.7 app complète + edges picker | (aucun diff — vérification seule) | — |

## Verification (§2.7)

- `cd app && npm run typecheck` : **vert**.
- `cd app && npm test` : **211 fichiers, 1679 tests verts** (module messages : 9 fichiers / 86 tests, 10 nouveaux).
- `cd app && npm run build` : **vert** (Vite, sw.js généré).
- `cd app && npm run test:e2e` : **155 passed, 0 failed** — voir Deviation 2 : la première exécution a tourné contre un serveur étranger occupant le port 4173 ; ré-exécution propre sur port dédié (`E2E_BASE_URL=http://127.0.0.1:4321`), exit 0.
- Pas de SQL dans ce plan : les RPC 0171 sont déjà migrées et testées (29-01).

## Comportements prouvés (tdd)

**Task 1 — D-04/D-05 (vu rouge avant vert : 5 échecs sur le fichier neuf, puis 5 verts)**
- Premier tap sur « Écrire à Noé Martin » → fil « Messages de Noé » ouvert, un seul fil Noé dans la liste.
- Second tap sur le même membre → le MÊME fil est rouvert, aucun doublon (en démo le repli rejoue la sémantique du RPC ; en ligne le RPC 0171 le garantit côté serveur).
- Échec du démarrage → toast contractuel « Impossible d'ouvrir la conversation. Réessayez. » (ou message serveur lisible), picker toujours ouvert, ligne réactivée, second essai rejouable.
- Appel en cours → ligne membre désactivée (double-tap protégé), libellé « Écrire à Noé Martin » inchangé, jamais un « Connexion… ».
- La ligne de l'appelante n'est jamais proposée dans le picker.

**Task 2 — D-08 (vu rouge avant vert : échec sur conversation_members, puis vert)**
- INSERT messages → caches fil + liste invalidés.
- Événement conversations → liste rafraîchie (nouvelle directe créée par l'autre membre).
- Événement conversation_members → fil + liste rafraîchis (arrivée/départ, badge).
- notification_reads → RIEN n'est invalidé : aucune souscription aux watermarks, test de garde dédié.
- Désmontage du hook → plus aucune invalidation (pas de fuite de listener).

## Deviations from Plan

**1. [Rule 1 - Bug de test] L'identifiant démo du membre Noé est déjà « conversation-noe »-compatible**
- **Found during:** Task 1 (première exécution rouge)
- **Issue:** deux sélecteurs de test visaient des libellés inexacts (« Noé Martin » sans prénom complet dans la liste, `role="listitem"` explicite qui masquait le rôle `button` natif des lignes du picker).
- **Fix:** sélecteurs alignés sur l'accessibilité réelle (`/^Noé/`, retrait du `role="listitem"` redondant) ; le composant livré utilise le rôle natif du `button`.
- **Files modified:** messages-page.direct.test.tsx, conversation-form-dialog.tsx.

**2. [Rule 3 - Blocage environnemental] e2e : port 4173 occupé par un serveur étranger**
- **Found during:** Task 3 (chaîne §2.7, `npm run test:e2e`)
- **Issue:** un `vite preview --port 4173` orphelin d'un AUTRE projet (`gr8r`, titre « Projects Studio ») occupait le port par défaut de la config Playwright. `reuseExistingServer` a fait accepter ce serveur à la place du build du dépôt : 149/162 tests en timeout sur le bouton « Entrer dans la démonstration », absent de l'app étrangère. Constaté avant tout soupçon sur le code : `curl http://127.0.0.1:4173/` rendait « Projects Studio ».
- **Fix:** serveur de preview du dépôt lancé sur un port libre (4321) et `E2E_BASE_URL` pointé dessus — re-run complet : **155 passed, exit 0**. Aucun changement de code ni de config Playwright (le défaut est environnemental, machine de l'exécutrice) ; le serveur temporaire a été arrêté après la preuve.
- **Files modified:** aucun (aucune config versionnée touchée).

**3. [Note] L'ancien formulaire de groupe reste accessible**
- Le picker « À qui écrire ? » (D-04) est l'entrée par défaut des directes. `ConversationFormDialog` (direct + groupe) est conservé : c'est le seul chemin de création des conversations de GROUPE (le RPC 0171 ne couvre que les directes, comme prévu au plan). Aucun écart UI-SPEC : le CTA du panneau et de la liste vide ouvre le picker.

## Known Stubs

Aucun. La directe passe par le RPC 0171 en ligne et par le repli démo complet hors ligne.

## Threat Model — mitigations livrées

- **T-29-10** (openDirectConversation client) : l'autorité reste serveur (foyer, membre actif, garde enfant D-06 du RPC 0171). Le client n'affiche jamais d'erreur brute sans repli : message serveur lisible sinon toast contractuel. ✔
- **T-29-11** (Realtime payload) : les événements ne portent que des notifications de changement — les données rechargent par les requêtes RLS-protégées existantes (`invalidateQueries`), jamais rendues telles quelles. ✔

## Notes

- Le second tap ne « crée » jamais localement : en ligne le RPC garantit l'anti-doublon (verrou consultatif, plan 01), en démo la recherche des participations actives des deux côtés rejoue D-05 (une pierre tombale ne rouvre pas).
- D-08 respecté et prouvé par test de garde : `notification_reads` n'apparaît dans AUCUN `data.subscribe`.
- Copie conforme au Copywriting Contract : « À qui écrire ? », « Démarrer une conversation » (icône `people`, ≥ 44px), EmptyState « Écrivez à un membre du foyer en un tap. », badge = nombre seul.
- Phase 29 : 5/5 plans exécutés — la vérification de phase revient à l'orchestrateur (VERIFICATION.md non écrit ici, conformément à la consigne).
