---
phase: 29-messagerie-v2
verified: 2026-10-30T11:20:00Z
status: passed
score: 8/8 must-haves verified (+ 3/3 must-haves 29-06 vérifiés)
behavior_unverified: 0
overrides_applied: 0
covered_files:
  - ".planning/phases/29-messagerie-v2/29-01-PLAN.md"
  - ".planning/phases/29-messagerie-v2/29-01-SUMMARY.md"
  - ".planning/phases/29-messagerie-v2/29-02-PLAN.md"
  - ".planning/phases/29-messagerie-v2/29-02-SUMMARY.md"
  - ".planning/phases/29-messagerie-v2/29-03-PLAN.md"
  - ".planning/phases/29-messagerie-v2/29-03-SUMMARY.md"
  - ".planning/phases/29-messagerie-v2/29-04-PLAN.md"
  - ".planning/phases/29-messagerie-v2/29-04-SUMMARY.md"
  - ".planning/phases/29-messagerie-v2/29-05-PLAN.md"
  - ".planning/phases/29-messagerie-v2/29-05-SUMMARY.md"
  - ".planning/phases/29-messagerie-v2/29-06-PLAN.md"
  - ".planning/phases/29-messagerie-v2/29-06-SUMMARY.md"
  - "app/src/lib/notification-reads.ts"
  - "app/src/modules/messages/api.ts"
  - "app/src/modules/messages/components/chat-panel.tsx"
  - "app/src/modules/messages/components/conversation-form-dialog.tsx"
  - "app/src/modules/messages/components/conversation-list.tsx"
  - "app/src/modules/messages/components/read-receipts.tsx"
  - "app/src/modules/messages/hooks/use-messages.ts"
  - "app/src/modules/messages/messages-page.tsx"
  - "docs/BACKEND.md"
  - "docs/DEPLOIEMENT-PROD.md"
  - "scripts/test-dispatch-push.sh"
  - "scripts/test-realtime-subscription.sh"
  - "supabase/functions/push-notify/index.ts"
  - "supabase/migrations/0171_direct_open_read_receipts.sql"
  - "supabase/migrations/0172_grouped_message_push.sql"
  - "supabase/tests/0171_direct_open_read_receipts.test.sql"
  - "supabase/tests/0172_grouped_push.test.sql"
covered_digest: "v2:sha256:2f63addeb3de363978ab6dd361fb95ad5a8a4ab918eed542e0794edf253c3a1f"
behavior_unverified_items: []
overrides: []
re_verification:
  previous_status: human_needed
  previous_score: 8/8
  gaps_closed:
    - "G-29-1 — tronçon Edge push-notify → service Web Push → appareil : dispatch 200 delivered=4/consumed=1 (rappel consommé, restant 0), groupe messages 200 delivered=4/consumed=3, titre « 3 nouveaux messages de Semure » sans aucun contenu de message, notifications reçues sur l'appareil (confirmation utilisateur) — plan 29-06, commits 8d49c22, b592759, 1e48b16"
  gaps_remaining: []
  regressions: []
gaps: []
---

# Phase 29 : Messagerie v2 — Rapport de vérification (re-vérification)

**Objectif de la phase :** conversations directes par RPC avec garde anti-doublon, accusé de lecture par watermark par membre (aucune écriture par message), notifications groupées sans contenu réutilisant la chaîne push existante, Realtime prouvé par souscription avant annonce.
**Vérifié :** 2026-10-30T11:20:00Z
**Statut :** `passed`
**Re-vérification :** Oui — après fermeture du gap G-29-1 (plan 29-06, commits 8d49c22, b592759, 1e48b16). Rapport du 2026-10-29 supplanté : les fichiers couverts ont changé après la vérification précédente.

## Atteinte de l'objectif

### Vérités observables (plans 29-01..29-05 — régression rapide, inchangées)

| # | Vérité | Statut | Preuve |
|---|--------|--------|--------|
| 1 | Ouverture directe idempotente (created=false), verrou consultatif anti-course (SC1, MSG-01) | ✓ VERIFIED | `0171_direct_open_read_receipts.sql:35-124` : garde `left_at is null` des deux côtés, `pg_advisory_xact_lock` sur la paire triée. Test SQL 0171 vert à l'exécution (régression : existence + contenu inchangé). |
| 2 | Watermark à l'ouverture et au retour sur l'onglet, jamais par message (SC2, MSG-02, D-01) | ✓ VERIFIED | `use-messages.ts:52-61` + `messages-page.tsx:48` ; aucun appel markRead par message. Test `use-messages.watermark.test.tsx`. |
| 3 | Rangée d'accusés sous la dernière bulle (zéro lecteur = rien, +N au-delà de 5) (SC2, MSG-03, D-02) | ✓ VERIFIED | `read-receipts.tsx:50-77`, branché `chat-panel.tsx:410`, alimenté par RPC 0171 (`api.ts:470-491`). |
| 4 | Portage localStorage → `notification_reads` one-way, retiré après succès (D-03) | ✓ VERIFIED | `notification-reads.ts:35-60` + garde `migratedKeysRef`. Test `notification-reads.migration.test.tsx`. |
| 5 | Push groupé, compteur au titre, JAMAIS le contenu d'un message (SC3, MSG-04, D-06/D-07) | ✓ VERIFIED | `0172_grouped_message_push.sql:33-126` : aucune référence à `msg.content` dans titre/corps. **Preuve de bout en bout aujourd'hui : dispatch groupe 200, titre « 3 nouveaux messages de Semure », appareil sans contenu (voir vérité 9).** |
| 6 | Edge push-notify consomme une LISTE d'ids pour kind message, seulement si sent>0 | ✓ VERIFIED | `push-notify/index.ts:313-320` ; consommation subordonnée à `sent > 0`. **Confirmé au réel : consumed=1 et consumed=3, lignes consommées (restant 0).** |
| 7 | Publication supabase_realtime prouvée par souscription WS réelle (SC4, MSG-05, D-09) | ✓ VERIFIED | `test-realtime-subscription.sh` vert au précédent passage (événement reçu, preuve attribuable). |
| 8 | Tap member-picker démarre/rouvre la directe ; toast contractuel ; Realtime invalide fil + liste, `notification_reads` jamais souscrite (MSG-01/05, D-04/D-08) | ✓ VERIFIED | `conversation-form-dialog.tsx:195-231`, `messages-page.tsx:73-84`, `use-messages.ts:848-869`. |

### Vérités du plan de fermeture 29-06 (vérification complète)

| # | Vérité (must_haves 29-06) | Statut | Preuve |
|---|---------------------------|--------|--------|
| 9 | Le tronçon Edge push-notify → service Web Push → appareil livre la notification à un appareil réellement abonné ; payload sans contenu ; rappel collant consommé au premier dispatch 200 (G-29-1) | ✓ VERIFIED | **Exécution réelle sur le serveur de production cette session** : sonde Edge auth OK (« 400 métier attendu ») ; rappel dispatch 200 `{"delivered":4,"consumed":1}`, ligne consommée (restant 0) — le rappel collant de l'UAT n'est plus renvoyé ; groupe 0172 dispatch 200 `{"delivered":4,"consumed":3}`, titre « 3 nouveaux messages de Semure » **sans aucun contenu de message** (D-06/D-07) ; notifications reçues sur l'appareil Firefox (confirmation utilisateur, consignée dans 29-UAT.md — G-29-1 `status: passed`). Cause racine résiduelle identifiée et corrigée : supabase-envoy (api-gw) recréé avec un SERVICE_ROLE_KEY étranger au .env (export shell hérité) → fix shell neuf + `recreate api-gw` + `recreate functions`. |
| 10 | Le prévoluble sonde push-notify avec la clé du Vault AVANT semure ; un 401 produit un diagnostic qui distingue « runtime en retard sur le .env » (→ recreate functions) de « clé Vault ≠ .env » (→ set-push-secrets.sh) | ✓ VERIFIED | `scripts/test-dispatch-push.sh` : sonde `net.http_post` avec en-tête `apikey` (contrat 0025), fenêtre `net._http_response` ouverte avant émission, comparaison par empreintes md5 sans affichage de secret — messages distincts lignes 172/182/187 (« recreate functions » vs « set-push-secrets.sh puis recreate functions »), préambule visible ligne 199. Commit 8d49c22. **La sonde a fait la preuve de sa portée en production : auth OK → a redirigé le diagnostic vers Envoy (cause réelle hors de sa cible).** |
| 11 | Les deux docs d'exploitation disent qu'un `docker restart` ne ré-interpole JAMAIS le .env — seul `recreate` — après toute modification | ✓ VERIFIED | `docs/BACKEND.md:1357` (« ne ré-interpole JAMAIS le .env. Cas documenté (2026-10-30, UAT 29) ») et `docs/DEPLOIEMENT-PROD.md:85`. Commit b592759. |
| 12 | Identifiants ASCII (portabilité dash/locale C) — CR-01 clos | ✓ VERIFIED | Commit 1e48b16 : `Expéditeur` renommé `Expediteur` (`grep -c "Expéditeur" scripts/test-dispatch-push.sh` → 0) ; `sh -n` ET `LC_ALL=C dash -n` verts cette session. |

**Score :** 8/8 vérités initiales + 3/3 vérités 29-06 (0 présent-comportement-non-vérifié)

## Chaîne de vérification exécutée (cette session)

| Commande | Résultat |
|----------|----------|
| `python3 scripts/check-sql-statique.py` | Vert — « 226 fonction(s) effective(s) sur 172 migration(s) et 103 test(s), aucun défaut » |
| `sh -n scripts/test-dispatch-push.sh` | Vert |
| `LC_ALL=C dash -n scripts/test-dispatch-push.sh` | Vert (CR-01 : portabilité dash/C prouvée) |
| `grep` sonde + docs | 8d49c22 (sonde, +96 lignes), b592759 (docs +9/+8), 1e48b16 présents dans l'historique ; commits vérifiés via `git show --stat` |
| Preuve de production (exécutée cette session par l'orchestrateur sur le serveur) | Sonde auth OK ; rappel 200 delivered=4/consumed=1 (restant 0) ; groupe 200 delivered=4/consumed=3 sans contenu ; notifications reçues sur l'appareil |

## Exigences (REQUIREMENTS.md)

| Exigence | Plan | Statut | Preuve |
|----------|------|--------|--------|
| MSG-01 | 29-01, 29-05 | ✓ SATISFAIT | RPC 0171 + picker « À qui écrire ? » |
| MSG-02 | 29-04 | ✓ SATISFAIT | Watermark D-01, zéro écriture par message |
| MSG-03 | 29-01, 29-04, **29-06** | ✓ SATISFAIT | `conversation_read_receipts` + rangée d'accusés + UAT verte |
| MSG-04 | 29-02, **29-06** | ✓ SATISFAIT | 0172 groupé sans contenu + Edge reminder_ids + **tronçon appareil prouvé au réel (delivered=4)** |
| MSG-05 | 29-03, 29-05 | ✓ SATISFAIT | Preuve par souscription réelle + invalidation côté app |

Aucune exigence orpheline.

## Anti-patterns

Aucun marqueur de dette (TBD/FIXME/XXX/PLACEHOLDER) dans les fichiers modifiés par la phase (re-vérifié sur `scripts/test-dispatch-push.sh` lors de la lecture des lignes sonde). Aucun secret en clair dans les messages du script ni dans les docs (comparaisons par empreintes uniquement).

## Advisory (conservé du rapport précédent, non bloquant)

| # | Constat | Catégorie | Détail |
|---|---------|-----------|--------|
| 1 | `test-realtime-subscription.sh` flake (1 TEMPS_DEPASSE sur 2 passages au 2026-10-29) | other | Passage 2 vert et attribuable ; si ça se reproduit, examiner les logs CDC du conteneur realtime. |
| 2 | REQUIREMENTS.md : case MSG-04 cochée mais table de traçabilité « Pending » (ligne 118) | other | Correction documentaire à faire à la clôture de phase. |
| 3 | Constats de relecture WR-01..03, IN-01..05 toujours `open` | other | Aucun ne bloque le goal (voir 29-REVIEW-DISPOSITION.md). CR-01, seul `critical`, est **clos** par 1e48b16. |

## Human Verification Required

Aucun. L'unique item humain du rapport précédent (tronçon Edge→appareil, G-29-1) est clos par une exécution réelle constatée sur le serveur de production avec confirmation utilisateur sur l'appareil.

## Gaps Summary

Aucun gap. Le goal de la phase est atteint de bout en bout : la livraison push réelle sur appareil — seul point autrefois différé faute d'abonnement réel — est désormais prouvée sur le serveur de production (delivered=4, file consommée, payload sans contenu, notification visible). Le plan 29-06 a transformé la classe de défaut (env de conteneur figé/étranger) en diagnostic automatisé (sonde prévoluble + docs recreate/restart), conformément à l'intention « diagnostiquable plutôt que reconstitué à la main ».

---

_Vérifié : 2026-10-30T11:20:00Z_
_Vérificateur : gsd-verifier (re-vérification #4682)_
