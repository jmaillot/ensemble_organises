---
phase: 39-outillage-prod-de-v-rification
verified: 2026-11-09T18:00:00Z
status: passed
score: 11/11 must-haves verified
behavior_unverified: 0
overrides_applied: 0
covered_files:
  - .planning/phases/39-outillage-prod-de-v-rification/39-01-PLAN.md
  - .planning/phases/39-outillage-prod-de-v-rification/39-01-SUMMARY.md
  - .planning/phases/39-outillage-prod-de-v-rification/39-02-PLAN.md
  - .planning/phases/39-outillage-prod-de-v-rification/39-02-SUMMARY.md
  - scripts/lib-smoke-accounts.sh
  - scripts/smoke-test.sh
  - scripts/test-join-token-real.sh
  - app/e2e/join-token-real.spec.ts
  - app/e2e/critical-paths.spec.ts
  - app/playwright.config.ts
  - docs/EXPLOITATION.md
covered_digest: "v2:sha256:e8cc8b28f724d5f32609d19d7232be2aeacae81a0d94654041c62b5941bbfe65"
re_verification:
  previous_status: human_needed
  previous_score: 10/11
  gaps_closed:
    - "Les sondes publiques (settings/health) passent la gateway avec la clé publiable — G-39-1 résolu par 6 fixes UAT (d5af9c5, a822755, a85db2a, 8b93e31, 8bd3348, 5618352), runs réels verts"
    - "Run réel du smoke en prod : 17/17 contrôles verts, purge prouvée (re-delete → 404), exit 0 (39-UAT.md test 1, commit a85db2a)"
    - "Run réel de la spec join-token : Playwright 6/6 passed (46,5 s), 6 points JT-02, purge du trap prouvée, exit 0 (39-UAT.md test 3, commit 5618352)"
    - "ENABLE_EMAIL_AUTOCONFIRM=false confirmée sur l'hôte : le mode « prod » du smoke n'est pris que si mailer_autoconfirm=false (39-UAT.md test 2)"
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "Branches 429/422 de smoke_accounts_create observées indirectement seulement (422-like : échec nommé avec corps exercé à l'itération 1 UAT sur un 400 ; un vrai 429 jamais déclenché)"
    category: other
    reason: "UAT test 4 skippé avec raison documentée (non reproductible volontairement, aucune vraie saturation GoTrue pendant 6 itérations) — suivi différé, ne bloque pas le goal de la phase (l'outillage, pas le throttling)"
    evidence_status: "documenté dans 39-UAT.md §4 (skipped avec deferred follow-up)"
---

# Phase 39: Outillage prod de vérification — Verification Report

**Phase Goal:** « Le projet dispose du moyen de créer et purger ses propres comptes e2e en mode prod réel (sans autoconfirm), et la couverture e2e du parcours join-token correspond au flux actuel. »
**Verified:** 2026-11-09T18:00:00Z
**Status:** passed
**Re-verification:** Yes — after UAT fix iterations on origin/main (d5af9c5 → 5618352)

## Goal Achievement

### Observable Truths

Les 10 truths statiquement vérifiés au premier passage ont été **re-vérifiés contre HEAD** (les fichiers couverts ont changé : regression check complet, pas simple existence). Le 11e truth (runs réels DS-01) est désormais prouvé par les runs réels consignés dans 39-UAT.md.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Le smoke crée ses comptes via l'Admin GoTrue (`email_confirm:true`) sans toucher à `ENABLE_EMAIL_AUTOCONFIRM` (CS-01) | ✓ VERIFIED | Re-vérifié HEAD : body `{"email","password","email_confirm":true,"user_metadata":{...}}` dans `smoke_accounts_create` (clé `user_metadata` depuis 5618352) ; sonde `GET /auth/v1/settings` avec header `apikey` publiable (d5af9c5) → `mailer_autoconfirm` → mode admin/signup ; aucun toggle autoconfirm écrit par les scripts |
| 2 | Refus explicite sans `SUPABASE_SECRET_KEY` (CS-02, §2.7 F) | ✓ VERIFIED | `smoke_accounts_secret` : refus nommé + `return 1` ; message hôte de stack inchangé dans smoke-test.sh |
| 3 | Chaque purge prouvée par re-delete → 404 exigé (§2.7 F) | ✓ VERIFIED | `smoke_accounts_purge` : DELETE puis re-delete, 404 exigé, status=1 sinon — code inchangé et **prouvé en réel** : purge des 2 comptes + 2 foyers avec re-delete → 404 consignée aux deux runs UAT |
| 4 | Emails `e2e+<runid>-<index>@<domain>`, entropy `$$`, aucun `example.fr` (EE-01) | ✓ VERIFIED | Re-vérifié HEAD : `smoke_accounts_domain` borne désormais `${SMOKE_MAIL_DOMAIN:-}` (a822755 — l'email tronqué sous `set -u` est corrigé) ; garde `! grep example.fr` verte sur les 3 scripts |
| 5 | Détection résiduelle signale, purge bornée au runid (EE-02) | ✓ VERIFIED | `smoke_accounts_list` inchangé ; « aucun résidu » consigné au run réel |
| 6 | 429 → pause 5 s + UN retry puis échec nommé ; 422 → échec immédiat (DS-02) | ✓ VERIFIED (comportement partiellement exercé) | Branches présentes et câblées (`create_once`, sleep 5, un retry, case 422 échec immédiat avec corps) ; l'itération 1 de l'UAT a exercé de fait la branche d'échec nommé avec corps (400 invalid format affiché, parcours interrompu proprement) ; un vrai 429 jamais déclenché — skippé en UAT avec raison documentée (advisory) |
| 7 | Aucun secret en argv/ARG frontend : curl -K 0600 (§2.7 H) | ✓ VERIFIED | Re-vérifié HEAD : `smoke_admin_config` fichier 0600 ; garde grep `-H "...SECRET` verte sur les 3 fichiers de la phase (seul hit du dépôt : `smoke-functions-serveur.sh`, hors phase, préexistant) |
| 8 | Les 5 étapes du parcours smoke inchangées, les DEUX comptes via la bibliothèque (CS-03/CS-04) | ✓ VERIFIED | `smoke-test.sh` 611 lignes : Alice et Bob via `smoke_accounts_create` ; étape tâches corrigée vers le contrat réel (0177 : `client_key` uuid NOT NULL, a85db2a) |
| 9 | La spec réelle couvre les 6 points JT-02 (TEST-02) | ✓ VERIFIED (structure **et réel**) | 6 `test()` dans `join-token-real.spec.ts` ; le helper `seConnecter` coche désormais l'attestation d'âge D-17 après connexion (8b93e31) avec `waitFor visible` 10 s (8bd3348) ; le curl brut crée le compte avec `user_metadata.full_name` (5618352) — **prouvé en réel** : 6/6 passed contre la stack déployée |
| 10 | Run séparé sans gating de skip ; 2 tests périmés supprimés ; `--project=chromium` ; wrapper refuse sans stack (JT-01/JT-03) | ✓ VERIFIED | `testIgnore` sur E2E_BASE_URL inchangé ; health check du wrapper porte l'apikey publiable (d5af9c5) ; 2 commits de fix ultérieurs (a822755, a85db2a) ne touchent que les payloads |
| 11 | Runs réels DS-01 exécutés et verts (ex-human_verification) | ✓ VERIFIED | 39-UAT.md : test 1 passed (smoke 17/17, mode prod, purge prouvée, exit 0, commit a85db2a) ; test 2 passed (autoconfirm=false confirmé par la branche prod prise) ; test 3 passed (Playwright 6/6, 46,5 s, purge trap, commit 5618352) ; test 4 skipped avec raison différée |

**Score:** 11/11 truths verified (0 présent, comportement non exercé)

### Re-verification note

Les fichiers couverts ont changé après le premier passage (fixes UAT G-39-1). Chaque truth statique a été re-contrôlé contre HEAD, pas repris de l'ancien rapport :

- `d5af9c5` — header `apikey` publiable sur la sonde settings (lib) et le health check (wrapper) : vérifié dans les deux fichiers (l.115-121 lib, l.104-108 wrapper).
- `a822755` — `${SMOKE_MAIL_DOMAIN:-}` borné sous `set -u` : vérifié dans `smoke_accounts_domain`.
- `a85db2a` — payloads alignés au contrat réel : `client_key` uuid sur POST tasks (smoke l.484-488), `expiresAt` sur household-invite create (smoke l.505-509 et wrapper l.251-255).
- `8b93e31` + `8bd3348` — helper `seConnecter` atteste D-17 (dialog, checkbox 15+, Confirmer, attestation masquée) avec `waitFor visible` 10 s au lieu d'un `isVisible()` instantané : vérifié spec l.84-100.
- `5618352` — `user_metadata.full_name` dans le body Admin API brut : vérifié lib l.176-182.

Aucune régression détectée sur les truths du premier passage. `sh -n` vert sur les 3 scripts. Aucun marqueur de dette (TODO/FIXME/XXX/TBD) dans les fichiers de la phase.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/lib-smoke-accounts.sh` | Bibliothèque sourçable create/purge/list/session | ✓ VERIFIED | 332 lignes, toutes les corrections UAT intégrées |
| `scripts/smoke-test.sh` | Deux modes, refus sans secret, purge vérifiée, résidus, contrat 0177 | ✓ VERIFIED | 611 lignes, `client_key` + `expiresAt` au contrat réel |
| `scripts/test-join-token-real.sh` | Wrapper run séparé, health check apikey, purge en trap | ✓ VERIFIED | 301 lignes, 6/6 au run réel |
| `app/e2e/join-token-real.spec.ts` | 6 points JT-02, attestation D-17, aucun skip conditionnel | ✓ VERIFIED | 6 `test()`, helper `seConnecter` complet, 6/6 au run réel |
| `app/e2e/critical-paths.spec.ts` | 2 tests join-token périmés supprimés | ✓ VERIFIED | Inchangé depuis 339a80b, commentaire de suppression en place |
| `app/playwright.config.ts` | Routage de run (testIgnore sur E2E_BASE_URL) | ✓ VERIFIED | Inchangé depuis 339a80b |
| `docs/EXPLOITATION.md` | Section « Smoke-test prod » (DS-03) | ✓ VERIFIED | Inchangée depuis 59d6e15 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| smoke-test.sh | lib-smoke-accounts.sh | source | WIRED | Inchangé, re-vérifié |
| test-join-token-real.sh | lib-smoke-accounts.sh | source | WIRED | Inchangé, re-vérifié |
| lib + wrapper | Admin GoTrue / Edge Functions | curl -K 0600, apikey publiable sur les sondes | WIRED | d5af9c5 vérifié des deux côtés |
| wrapper | spec Playwright | `npx playwright test --project=chromium` | WIRED | Inchangé |
| spec | sélecteurs réels du flux | dialog D-17, sessionStorage D-06, role=alert | WIRED | 8b93e31/8bd3348 consomment le DOM réel — prouvé par le run 6/6 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Syntaxe des 3 scripts | `sh -n` | aucune sortie | ✓ PASS |
| Aucun secret inline en argv | grep `-H "...SECRET` sur les 3 fichiers de la phase | aucune correspondance | ✓ PASS |
| Aucun email example.fr | `! grep example.fr` | vert | ✓ PASS |
| Aucun marqueur de dette | grep TODO/FIXME/XXX/TBD | aucune correspondance | ✓ PASS |
| Spec : 6 tests JT-02 | `grep -c "^  test("` | 6 | ✓ PASS |
| Smoke prod réel (DS-01) | `sh scripts/smoke-test.sh` hôte de stack, 2026-11-09, commit a85db2a | 17/17 contrôles, purge prouvée, exit 0 (39-UAT.md test 1) | ✓ PASS (réel) |
| Spec réelle join-token (DS-01) | `sh scripts/test-join-token-real.sh` hôte de stack, 2026-11-09, commit 5618352 | Playwright 6/6 (46,5 s), purge trap re-delete → 404, exit 0 (39-UAT.md test 3) | ✓ PASS (réel) |

### Probe Execution

Les deux runs réels ont été exécutés sur l'hôte de la stack pendant l'UAT (consignés dans 39-UAT.md avec commits de référence) — l'exécution par le vérificateur depuis la machine de travail reste impossible (DS-01, secrets jamais en CI), mais l'exigence humaine est désormais levée par preuve consignée.

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| smoke prod réel | `sh scripts/smoke-test.sh` (hôte stack, a85db2a) | 17/17, purge prouvée (re-delete → 404), aucun résidu, exit 0 | PASS |
| spec réelle join-token | `sh scripts/test-join-token-real.sh` (hôte stack, 5618352) | Playwright 6 passed (46,5 s), purge 2 foyers + 2 comptes prouvée, exit 0 | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SMOKE-01 | 39-01 | Smoke crée ET purge ses comptes e2e via l'Admin GoTrue en mode prod, autoconfirm resté false, secrets jamais en argv/ARG, 422/429 explicites | ✓ SATISFIED | Truths 1-8 ; run réel 17/17 (autoconfirm=false prouvé par la branche prod prise) |
| TEST-02 | 39-02 | Spec e2e join-token réécrite contre le flux actuel, jamais « réparée au vert » | ✓ SATISFIED | Truths 9-10 ; run réel 6/6 avec attestation D-17 comme un utilisateur réel |

Aucun ID orphelin : REQUIREMENTS.md ne mappe que SMOKE-01 et TEST-02 à la phase 39.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (aucun) | — | — | — | Aucun marqueur de dette, aucun stub, aucun secret en argv dans les fichiers de la phase |

### Human Verification Required

Aucun — les 3 items du premier passage sont levés :
1. Run réel smoke → passed (39-UAT.md test 1, 17/17).
2. Run réel spec join-token → passed (39-UAT.md test 3, 6/6).
3. ENABLE_EMAIL_AUTOCONFIRM=false → passed (39-UAT.md test 2, prouvé par la branche prod prise au run).

### Advisory

- **Branches 429/422** : jamais un vrai 429 GoTrue déclenché (test 4 UAT skippé avec raison différée documentée) ; la branche d'échec nommé avec corps a de fait été exercée à l'itération 1 (400 invalid format). Suivi différé, hors goal de la phase — consigné en `advisory` frontmatter, non bloquant.

### Gaps Summary

Aucun gap. Le statut `human_needed` du premier passage provenait exclusivement des runs réels DS-01 ; ceux-ci ont été exécutés avec succès pendant l'UAT (6 itérations, 6 fixes commités d5af9c5 → 5618352) et leurs preuves sont consignées dans 39-UAT.md. Tous les truths statiques ont été re-vérifiés contre HEAD après les fixes — aucune régression. Le G-39-1 (sondes sans apikey) est résolu.

---

_Verified: 2026-11-09T18:00:00Z_
_Verifier: the agent (gsd-verifier)_
