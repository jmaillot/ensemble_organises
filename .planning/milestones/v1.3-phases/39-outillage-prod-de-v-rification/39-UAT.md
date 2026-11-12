---
status: testing
phase: 39-outillage-prod-de-v-rification
source: [39-VERIFICATION.md]
started: 2026-11-09T00:00:00Z
updated: 2026-11-09T12:00:00Z
audit_acknowledged:
  milestone: v1.4
  at: 2026-11-12
  gap_snapshot: "testing::scenarios=0"
---

## Current Test

number: none
name: —
expected: —
awaiting: none

## Tests

### 1. Run réel du smoke-test en prod (DS-01)

expected: Depuis l'hôte de la stack, `sh scripts/smoke-test.sh` : mode « prod » affiché, parcours vert, purge prouvée (re-delete → 404), aucun résidu, exit 0.
result: passed
reported: "Run du 2026-11-09 (4e itération, commit a85db2a) : 17 contrôles réussis, aucun échec. Mode prod détecté, création admin email_confirm:true, RLS (foyer + membres + tâches), échange anonyme refusé (401), redeem atomique, idempotence, purge prouvée (re-delete → 404), aucun résidu, exit 0."

### 2. Vérifier ENABLE_EMAIL_AUTOCONFIRM=false dans supabase-project/.env

expected: false — le script ne la modifie jamais (vérifié statiquement) ; la valeur réelle de l'hôte doit être confirmée avant le run.
result: passed
reported: "Confirmé par le run réel du 2026-11-09 : sortie du smoke « mode prod : création via l'Admin GoTrue (autoconfirm désactivé) » — la branche prod n'est prise que si autoconfirm est désactivé."

### 3. Run réel de la spec join-token (DS-01)

expected: Depuis l'hôte de la stack, `sh scripts/test-join-token-real.sh` : Playwright 6 passed (chromium), les 6 points JT-02 verts, foyers et comptes purgés par le trap, exit 0.
result: passed
reported: "Run du 2026-11-09 (6e itération, commit 5618352) : Playwright 6 passed (46,5 s), points 1-4 et 6a/6b verts, deux foyers et deux comptes purgés par le trap (re-delete → 404), exit 0."
severity: blocker
diagnosis: "Même cause racine que le test 1 : health check sans header apikey."
fix: "Corrigé dans le même commit d5af9c5. Second run : même blocage SMOKE_MAIL_DOMAIN (a822755). Troisième run : wrapper OK mais spec échoue au point 1 — modale D-17 bloquante pour comptes neufs (8b93e31). Quatrième run : branche non déclenchée — course avec la requête profil, isVisible() instantané (8bd3348 : waitFor visible 10 s). Cinquième run : point 1 VERT (7,5 s). Point 2 : le pré-écran nommait « e2e+…-1 » au lieu de Fernande — le curl brut POST /admin/users exige user_metadata, pas data (traduction auth-js seule) ; full_name ignoré → trigger tombait sur le fallback email. Corrigé commit 5618352. RE-TESTER."

### 4. (Optionnel) Branches 429/422 de smoke_accounts_create

expected: 429 → pause 5 s + un seul retry puis échec nommé ; 422 → échec immédiat nommé avec corps. Présentes et câblées (smoke_accounts_create l.169-199) ; seule une observation sur un vrai throttling GoTrue peut les prouver.
result: skipped
reported: "Non observées sur les runs réels : aucun throttling GoTrue déclenché pendant les 6 itérations UAT. La branche d'échec nommé avec corps a de fait été exercée à l'itération 1 (400 invalid format affiché, parcours interrompu proprement)."
reason: "Deferred follow-up: observation des branches 429/422 sur un vrai throttling GoTrue — non reproductible volontairement en UAT, la branche d'échec nommé avec corps a déjà été observée (itération 1)."

## Summary

total: 4
passed: 3
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps

- gap_id: G-39-1
  truth: "Les sondes publiques (settings/health) passent la gateway avec la clé publiable — les runs réels démarrent"
  status: resolved
  reason: "Closed par 4 itérations de fixes (d5af9c5 apikey, a822755 SMOKE_MAIL_DOMAIN, a85db2a payloads contrat client_key/expiresAt, 5618352 user_metadata) + 2 fixes spec e2e (8b93e31/8bd3348 attestation D-17). Smoke 17/17 vert et spec 6/6 vert sur l'hôte de stack, purge prouvée."
  severity: blocker
  test: 1,3
  artifacts: [scripts/lib-smoke-accounts.sh, scripts/smoke-test.sh, scripts/test-join-token-real.sh, app/e2e/join-token-real.spec.ts]
  missing: []
