---
phase: "31"
slug: "inscriptions-ouvertes"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-03"
---

# Phase 31 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5 + React Testing Library (app), Playwright (e2e), SQL tests via `scripts/test-db.sh` (psql/testkit) |
| **Config file** | `app/vitest.config.ts`, `app/playwright.config.ts` |
| **Quick run command** | `cd app && npm run typecheck && npm test` |
| **Full suite command** | `cd app && npm run typecheck && npm test && npm run build && npm run test:e2e && python3 scripts/check-sql-statique.py && python3 scripts/test-check-sql-statique.py && sh scripts/test-db.sh` |
| **Estimated runtime** | ~600 s full suite (unit ~180 s, e2e ~180 s, SQL ~60 s, build ~60 s) |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npm run typecheck && npm test` (et `python3 scripts/check-sql-statique.py` pour toute migration SQL)
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (rempli à la création des plans) | 01+ | 1+ | OUV-01..07 | T-31-NN | Auth email, rate-limit, token governance | unit / SQL / e2e / manual (deliverability) | voir plans | ❌ W0 / ✅ | ⬜ pending |

*Le tableau précis est complété par le planner lors de la création des PLAN.md (chaque tâche porte son `<automated>` + `<fails_when>`).*

---

## Wave 0 Requirements

- [ ] Tests SQL négatifs — migration gouvernance tokens (expiration, max_uses, révocation individuelle) via `scripts/test-db.sh`, rouge avant migration
- [ ] Tests Vitest — pré-écran pré-auth `/foyer/rejoindre` hors garde auth, préservation du token à travers l'inscription
- [ ] Test de contrat Traefik — fichier override avec middlewares rate-limit sur routers dédiés `/auth/v1/signup|token`
- [ ] Tests GoTrue config — `.env` de stack : `ENABLE_EMAIL_AUTOCONFIRM=false`, SMTP pointé, `RATE_LIMIT_*`

*Infrastructure existante couvre le reste (Vitest/Playwright/psql en place).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Email de confirmation reçu en boîte de réception Gmail ET Outlook | OUV-01, OUV-05 | Délivrabilité réelle non simulable (SPF/DKIM/DMARC + réputation domaine) | Envoyer confirmation d'inscription réelle depuis la stack ; vérifier arrivée en inbox (pas spam) sur les deux fournisseurs ; consigner horodatage + en-têtes |
| Rate-limit Traefik bloque effectivement les rafales | OUV-03 | Preuve comportementale réseau (429 observés) | Rafale de requêtes sur `/auth/v1/signup` et `/auth/v1/token` ; consigner les 429 et le comportement du middleware |
| Notification push reçue sur appareil réel | (héritée 26/29, porte OUV-07) | Aucun appareil abonné aujourd'hui (0 abonnement) | Abonner un appareil réel, rejouer `scripts/test-dispatch-push.sh`, preuve `delivered` |
| Compte Outlook réel pour la preuve de délivrabilité | OUV-01 | Nécessite un compte opérateur | Créer/utiliser un compte Outlook, rejouer la preuve D-11 (SPF du domaine, alias « via gmail.com ») |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
