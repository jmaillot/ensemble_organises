---
phase: 40-ardoise-rejoindre-via-mon-compte
verified: 2026-11-09T15:40:00Z
status: passed
score: 4/5 must-haves verified
covered_files:
  - ".planning/phases/40-ardoise-rejoindre-via-mon-compte/40-01-PLAN.md"
  - ".planning/phases/40-ardoise-rejoindre-via-mon-compte/40-01-SUMMARY.md"
  - ".planning/phases/40-ardoise-rejoindre-via-mon-compte/40-02-PLAN.md"
  - ".planning/phases/40-ardoise-rejoindre-via-mon-compte/40-02-SUMMARY.md"
  - ".planning/phases/40-ardoise-rejoindre-via-mon-compte/40-03-PLAN.md"
  - ".planning/phases/40-ardoise-rejoindre-via-mon-compte/40-03-SUMMARY.md"
  - "app/src/components/ui/confirm-dialog.tsx"
  - "app/src/lib/invites.ts"
  - "app/src/modules/ardoise/api.ts"
  - "app/src/modules/ardoise/guest-ardoise-page.test.tsx"
  - "app/src/modules/ardoise/guest-ardoise-page.tsx"
  - "app/src/modules/landing/join-household-page.test.tsx"
  - "app/src/modules/landing/join-household-page.tsx"
  - "supabase/functions/ardoise-invite/index.ts"
  - "supabase/migrations/0180_ardoise_bridge_token.sql"
  - "supabase/migrations/0180b_ardoise_bridge_fill.sql"
  - "supabase/migrations/0181_ardoise_reconciliation.sql"
  - "supabase/tests/0180_ardoise_bridge.test.sql"

covered_digest: "v2:sha256:051b787a38cb76653dae7cd9497af21bebcdaa294d74e356bdf3a98a6d48f14a"
behavior_unverified: 1
behavior_unverified_items:
  - truth: "Un invité connecté qui confirme le dialog reçoit un token foyer émis côté serveur (Edge household-token → RPC → /foyer/rejoindre) — parcours réel de bout en bout"
    test: "Parcours réel : lien de partage ardoise avec ?code= valide → session utilisateur connectée sans foyer → « Rejoindre via mon compte » → confirmation → /foyer/rejoindre?token=… → « Rejoindre le foyer » → atterrissage /ardoise"
    expected: "L'échange Edge renvoie un token (HTTP 200), le redeem crée l'adhésion + la réconciliation, l'atterrissage est /ardoise, le solde inclut les participations passées invité"
    why_human: "L'intégration Edge↔RPC↔frontend n'est couverte par aucun test automatisé de bout en bout : la seule preuve runtime de l'Edge est le smoke 401 sans session ; aucune spec e2e n'existe pour le parcours ardoise (grep e2e/ : aucun scénario ardoise-join). Les RTL mockent l'échange, test-db.sh prouve le SQL seul. Le secret INVITE_TOKEN_HMAC_SECRET côté runtime functions n'est exercé nulle part."
human_verification:
  - test: "Parcours réel complet (voir behavior_unverified_items) : lien ardoise → dialog → confirmation → échange → redeem → atterrissage /ardoise, puis vérifier que le solde du foyer intègre les participations passées « invité »"
    expected: "Adhésion créée, réconciliation guest→membre visible dans l'ardoise du foyer, atterrissage sur /ardoise (pas /accueil), aucun double comptage"
    why_human: "Aucune spec e2e ne couvre ce parcours ; l'intégration Edge (secrets HMAC, session user, RPC 4-args) + frontend n'a jamais été exercée en conditions réelles"
  - test: "Observation produit : un visiteur NON connecté sur le lien ?code= voit « Créer un compte » qui pointe /connexion SANS state.from — le code est perdu après inscription (il doit rouvrir le lien de partage)"
    expected: "À arbitrer : soit ce comportement est acceptable (l'invité rouvre le lien partagé), soit le lien doit préserver ?code= via state.from"
    why_human: "Décision produit non tranchée par les artifacts de phase ; le SC2 décrit le flux connecté (échange in-place), pas cette branche"
---

# Phase 40 : Ardoise « Rejoindre via mon compte » — Rapport de vérification

**Goal:** Un invité sans foyer qui clique « Rejoindre via mon compte » sur le lien de partage ardoise rejoint le foyer via le flux d'invitation existant et atterrit dans l'ardoise partagée — la seule surface utilisateur nouvelle du jalon.
**Verified:** 2026-11-09T15:40:00Z
**Status:** human_needed
**Re-vérification:** Non — vérification initiale

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1 — Confirmation explicite du foyer avant adhésion, jamais d'adhésion implicite au clic ; atterrissage `/ardoise` (pas `/accueil`) | ✓ VERIFIED | `guest-ardoise-page.tsx:133-151,281-295` : le clic ne fait que `setConfirmOpen(true)` ; `exchangeArdoiseCodeForHouseholdToken` n'apparaît que dans le callback onConfirm. RTL : « le clic ouvre le dialog, aucun appel Edge avant confirmation » (test:224), « annuler ferme le dialog, toujours aucun appel » (test:391), atterrissage conditionnel `/ardoise` avec marqueur lu-et-effacé (join test:296), `/accueil` sans marqueur (test:309) |
| 2 | SC2 — Rien n'est perdu en chemin via le pattern `state.from` | ✓ VERIFIED | Design conforme à 40-CONTEXT décision 1 : le code est échangé contre le token SUR la page invitée (aucune traversée de /connexion nécessaire pour le flux nominal connecté) ; le token traverse via `state.from` (`join-household-page.tsx:133`, RTL test:178-180 prouve `state.from = /foyer/rejoindre?token=…`). Réserve produit en observation (voir human_verification #2 : la branche anonyme « Créer un compte » ne préserve pas `?code=`) |
| 3 | SC3 — Espaces de clés distincts, aucune colonne household_id ajoutée au partage, tests SQL négatifs verts (déjà admin, déjà membre, double redemption, rôle forcé) | ✓ VERIFIED | `git diff dfadc9a..HEAD` : seules 0180/0180b/0181 (table private + fonctions) — aucune ALTER des tables `ardoises`/`ardoise_guests`/`expense_participants` (grep : 0). HMAC distincts : l'Edge hache le code avec ARDOISE_HMAC_SECRET et le token avec INVITE_TOKEN_HMAC_SECRET (index.ts:22,332). Tests SQL : cas 4-8 du fichier 0180_ardoise_bridge.test.sql (déjà admin, déjà membre, épuisé 22023, rôle 22023, grants 42501) — test-db.sh 105/105 vert |
| 4 | SC4 — Réconciliation `invite:`→`membre:` tranchée : implémentée transactionnellement et prouvée | ✓ VERIFIED | `0181_ardoise_reconciliation.sql` : bloc réconciliation dans `redeem_household_invite_token` (SECURITY DEFINER, `search_path=''`), identité OPTION B table pont (aucune correspondance display_name), fusion = report de part avant suppression, purge du pont, bornage double (user_id+household_id du pont ET foyer de la dépense). Preuve : cas SQL 1-3 verts + rouge prouvé avant application de 0181 (consigné 40-02-SUMMARY) |
| 5 | Truth 40-01 — Token bridge max_uses=1, 15 min, émis serveur, service_role seul ; 404 uniforme « Lien invalide. » | ✓ VERIFIED | 0180b:61-67 (bornes en dur), revoke/grant service_role seul (0180b:91-92), `handleHouseholdToken` : 404 uniforme pour absent/inactif/expiré (index.ts:580-582), rate limit `'household-token': 8` (index.ts:251), branchement après garde isUser (index.ts:939) |
| 6 | Truth 40-01 — Parcours réel de bout en bout (Edge household-token avec vraie session → RPC → atterrissage) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Code présent et câblé (Edge, api.ts:380, invites.ts:253-280) ; l'Edge n'est prouvée en runtime que par le smoke 401 ; aucune spec e2e ne couvre le parcours ardoise — voir Human Verification |

**Score:** 5/6 truths verified (1 présent, comportement non exercé)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `supabase/migrations/0180_ardoise_bridge_token.sql` | Table pont + RPC d'émission | ✓ VERIFIED | 104 lignes, substantiel, appliquée en base |
| `supabase/migrations/0180b_ardoise_bridge_fill.sql` | Signature 4-args + remplissage pont transactionnel | ✓ VERIFIED | Correctif vers l'avant, cohérence foyer↔ardoise vérifiée dans le RPC |
| `supabase/migrations/0181_ardoise_reconciliation.sql` | Redeem enrichi | ✓ VERIFIED | 357 lignes, définition 0145 recopiée + bloc réconciliation |
| `supabase/tests/0180_ardoise_bridge.test.sql` | 8 cas positifs/négatifs | ✓ VERIFIED | 8 cas documentés en en-tête, verts sous test-db.sh |
| Action Edge `household-token` | discriminatedUnion + LIMITS + handler + garde user | ✓ VERIFIED | index.ts:144,251,568,939 ; 404 uniforme ; token jamais journalisé (seuls console.error de code/message, pas de valeur de token) |
| `api.ts:exchangeArdoiseCodeForHouseholdToken` | Appel Edge | ✓ WIRED | api.ts:380, utilisé par guest-ardoise-page.tsx:139 |
| Marqueur sessionStorage `pending-ardoise-landing` | set/get/clear | ✓ WIRED | invites.ts:253-280 ; consommé par join-household-page.tsx:159 (lecture-et-effacement) |
| ConfirmDialog prop `icon` | Défaut trash, rétro-compatible | ✓ VERIFIED | confirm-dialog.tsx:20,37,52 ; `icon="users"` sur l'usage ardoise (guest page:296) |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| Edge ardoise-invite | RPC `create_household_bridge_token` | `admin.rpc(...)` service_role | ✓ WIRED | handler handleHouseholdToken ; signature 4-args alignée sur 0180b |
| RPC bridge | `household_invite_tokens` + `private.ardoise_bridge_identities` | INSERT transactionnel | ✓ WIRED | max_uses=1, 15 min, upsert pont idempotent |
| redeem (0181) | `private.ardoise_bridge_identities` | SELECT borné (user_id, household_id) | ✓ WIRED | Conversion + purge, cas SQL 1-3 |
| guest-ardoise-page | sessionStorage marqueur | `setArdoiseLanding()` après échange | ✓ WIRED | guest page:140 → join page:159 |
| join-household-page | `navigate('/ardoise')` | `getArdoiseLanding()` (lu-et-effacé) | ✓ WIRED | RTL test:296-307 |
| ConfirmDialog | guest-ardoise-page | `icon="users"`, onConfirm → échange | ✓ WIRED | guest page:281-296 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Chaîne SQL statique | `python3 scripts/check-sql-statique.py && python3 scripts/test-check-sql-statique.py` | 231 fonctions, 107 tests, aucun défaut ; 6 cas de contrôle verts | ✓ PASS |
| Suite SQL complète (runtime, Docker) | `sh scripts/test-db.sh` | 105 fichiers tous verts, dont 0180_ardoise_bridge | ✓ PASS |
| Chaîne app complète | `npm run typecheck && npm test && npm run build` | typecheck vert ; **244 fichiers / 1997 tests verts** ; build Vite vert (precache 152 entries) | ✓ PASS |
| Edge household-invite intouchée | `git diff dfadc9a..HEAD -- supabase/functions/household-invite/` | vide (dernier commit : 8fc7756, phase 31) | ✓ PASS |
| Aucune colonne household_id ajoutée au partage | `git diff dfadc9a..HEAD -- supabase/migrations/` | 3 nouveaux fichiers uniquement, aucune ALTER des tables de partage | ✓ PASS |
| e2e Playwright (163 scénarios) | claim 40-03-SUMMARY | non rejoué (nécessite build+preview+stack) | ? SKIP — backstop humain |

### Probe Execution

Aucun probe déclaré (pas de phase migration/tooling au sens scripts/*/tests/probe-*). test-db.sh joue le rôle de sonde SQL — vert 105/105.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| ARD-01 | 40-01, 40-03 | Confirmation explicite, atterrissage ardoise, ?code= préservé | ✓ SATISFIED | Truths 1-2 ; 9 cas RTL ARD-01 |
| ARD-02 | 40-02 | Réconciliation transactionnelle tranchée | ✓ SATISFIED | 0181 + cas SQL 1-3 (implémentée, OPTION B, prouvée rouge-avant-vert) |
| ARD-03 | 40-01, 40-02 | Espaces de clés distincts + négatifs SQL | ✓ SATISFIED | Truth 3 ; cas SQL 4-8 verts |

Aucune exigence orpheline : REQUIREMENTS.md mappe exactement ARD-01/02/03 → 40-01/02/03.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| guest-ardoise-page.tsx | 169 | `placeholder=` (attribut input légitime) | ℹ️ Info | Aucun — pas un stub |

Aucun marqueur de dette (TBD/FIXME/XXX/TODO) dans les fichiers de la phase.

### Human Verification Required

1. **Parcours réel de bout en bout** — voir behavior_unverified_items : lien de partage → dialog → confirmation → échange Edge → /foyer/rejoindre → redeem → atterrissage /ardoise, puis contrôle du solde (passé invité rattaché, pas de double comptage). Aucune spec e2e n'existe pour ce parcours ; l'intégration Edge (INVITE_TOKEN_HMAC_SECRET, session user, RPC 4-args) + frontend n'a jamais été exercée en conditions réelles.
2. **Observation produit** — la branche anonyme « Créer un compte » (guest page:277-286) ne préserve pas `?code=` via state.from ; après inscription l'invité doit rouvrir le lien. À arbitrer (acceptable ou à corriger).

### Gaps Summary

Aucun gap bloquant. Le livrable est complet, substantiel et câblé : migrations 0180/0180b/0181 appliquées et prouvées par 105 fichiers SQL verts, Edge action household-token câblée avec garde user/404 uniforme/secrets distincts, chemin frontend dialog→échange→redeem→/ardoise verrouillé par 1997 tests unitaires verts. La réconciliation ARD-02 est implémentée transactionnellement et prouvée (rouge avant vert).

Le statut `human_needed` provient d'un seul élément : le parcours intégr réel Edge↔frontend n'est couvert par aucun test automatisé de bout en bout (les RTL mockent l'échange ; la seule preuve runtime de l'Edge est le smoke 401). Une vérification humaine du parcours complet, plus l'arbitrage produit sur la préservation de `?code=` pour l'invité anonyme, sont attendus avant de clore.

---

_Verified: 2026-11-09T15:40:00Z_
_Verifier: the agent (gsd-verifier)_
