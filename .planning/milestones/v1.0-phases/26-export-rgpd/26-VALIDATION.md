---
phase: "26"
slug: "export-rgpd"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-26"
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source : § Validation Architecture de `26-RESEARCH.md`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5 (frontend) + suite SQL `testkit` (`sh scripts/test-db.sh`) |
| **Config file** | existants (`app/` vitest, `supabase/tests/_setup.sql`) |
| **Quick run command** | `cd app && npm test` / `sh scripts/test-db.sh 0158` |
| **Full suite command** | `cd app && npm run typecheck && npm test && npm run build && npm run test:e2e` + `python3 scripts/check-sql-statique.py` + `python3 scripts/test-check-sql-statique.py` + `sh scripts/test-db.sh` |
| **Estimated runtime** | ~60 s (quick) / ~10 min (full) |

---

## Sampling Rate

- **After every task commit:** `sh scripts/test-db.sh 0158` + `cd app && npm test`
- **After every plan wave:** suite complète ci-dessus
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 26-01 T1 | 26-01 | 1 | RGEX-02/03 (SPEC) | — | Portée multi-foyers tranchée par l'utilisateur AVANT tout SQL | checkpoint:decision (human-check) | non automatisé — `26-SPEC-DECISION.md` validé (`gate="blocking-human"`) | n/a | ⬜ pending |
| 26-01 T2 | 26-01 | 1 | RGEX-02 | T-26-01, T-26-02, T-26-SC | Mode d'auth 'secret' exclusif ; aucun secret persistant | spike + deploy deploy | `sh scripts/deploy-functions.sh && test -f .planning/phases/26-export-rgpd/26-SPIKE-RESULTATS.md && test ! -d supabase/functions/gdpr-export-spike && echo SPIKE_OK` | n/a (fichiers créés en W0) | ⬜ pending |
| 26-02 T1 | 26-02 | 2 | RGEX-01..04 | T-26-04, T-26-07 | SQL statique propre (search_path vide, références qualifiées) | static | `python3 scripts/check-sql-statique.py && python3 scripts/test-check-sql-statique.py` | ✅ | ⬜ pending |
| 26-02 T2 | 26-02 | 2 | RGEX-01..04 | T-26-05 | Migration 0158 appliquée, aucun secret dans cron.job.command | migrate | `sh scripts/migrate.sh` | ✅ | ⬜ pending |
| 26-02 T3 | 26-02 | 2 | RGEX-01, RGEX-03 | T-26-03, T-26-04, T-26-06, T-26-07 | expect_denied inter-membre/foyer, unicité du job actif, politiques scellées | SQL négatif | `sh scripts/test-db.sh 0158 && sh scripts/test-db.sh` | ❌ W0 | ⬜ pending |
| 26-03 T1 | 26-03 | 3 | RGEX-02 | T-26-08, T-26-11 | Mode 'secret' exclusif ; lecture via RPC borné uniquement | tracer + deploy | `sh scripts/deploy-functions.sh && grep -q "secret" supabase/functions/gdpr-export-run/index.ts && echo RUN_DEPLOYED` | n/a | ⬜ pending |
| 26-03 T2 | 26-03 | 3 | RGEX-02 | T-26-09, T-26-10 | Streaming STORE (jamais mémoire) ; lease/plafond ; zip-slip | tracer expansion | `sh scripts/deploy-functions.sh && grep -c "ZipPassThrough" supabase/functions/gdpr-export-run/index.ts` | n/a | ⬜ pending |
| 26-03 T3 | 26-03 | 3 | RGEX-02 | T-26-10 | Crash/reprise prouvés ; D-06 après échec | regression SQL | `sh scripts/test-db.sh 0158` | ❌ W0 | ⬜ pending |
| 26-04 T1 | 26-04 | 4 | RGEX-04 | T-26-14 | Mode 'secret' exclusif de la purge | tracer + deploy | `sh scripts/deploy-functions.sh && grep -q "secret" supabase/functions/gdpr-export-purge/index.ts && echo PURGE_DEPLOYED` | n/a | ⬜ pending |
| 26-04 T2 | 26-04 | 4 | RGEX-04 | T-26-12 | Contrat 'partial' honnête (§2.7F) | tracer expansion | `sh scripts/deploy-functions.sh && grep -q "partial" supabase/functions/gdpr-export-purge/index.ts && echo PURGE_HARDENED` | n/a | ⬜ pending |
| 26-04 T3 | 26-04 | 4 | RGEX-04 | T-26-13 | Candidats = terminaux expirés seulement | SQL | `sh scripts/test-db.sh 0158` | ❌ W0 | ⬜ pending |
| 26-05 T1 | 26-05 | 3 | RGEX-01, RGEX-02 | T-26-15, T-26-16 | URL signée au clic ≤ 86400, jamais persistée ; aucune garde admin | unit (vitest, TDD tracer) | `cd app && npm run typecheck && npm test -- --run src/modules/parametres` | ❌ W0 | ⬜ pending |
| 26-05 T2 | 26-05 | 3 | RGEX-01, RGEX-02 | T-26-15, T-26-17 | Historique + lien expiré + retente D-02 | unit + build | `cd app && npm run typecheck && npm test -- --run src/modules/parametres && npm run build` | ❌ W0 | ⬜ pending |
| 26-05 T3 | 26-05 | 3 | RGEX-01, RGEX-02 | — | Non-régression chaîne app + e2e (baseline 155) | full app | `cd app && npm run typecheck && npm test && npm run build && npm run test:e2e` | ✅ | ⬜ pending |
| 26-06 T1 | 26-06 | 5 | RGEX-02 | T-26-19, T-26-SC | Branche push 'export' + marquage notified_push + garde p_scope | SQL + static + migrate | `python3 scripts/check-sql-statique.py && python3 scripts/test-check-sql-statique.py && sh scripts/migrate.sh && sh scripts/test-db.sh 0159` | ❌ W0 | ⬜ pending |
| 26-06 T2 | 26-06 | 5 | RGEX-02 | — | push-notify accepte scope 'export' (ligne ~77) | deploy + typecheck | `sh scripts/deploy-functions.sh && grep -nE "z\.enum\(.*'export'" supabase/functions/push-notify/index.ts && cd app && npm run typecheck` | ✅ | ⬜ pending |
| 26-06 T3 | 26-06 | 5 | RGEX-02 | — | Pas de régression suite SQL complète | full SQL | `sh scripts/test-db.sh` | ✅ | ⬜ pending |
| 26-07 T1 | 26-07 | 6 | RGEX-01..04 | T-26-21 | Campagne SQL complète (ordre §2.7) | full SQL campain | `python3 scripts/check-sql-statique.py && python3 scripts/test-check-sql-statique.py && sh scripts/migrate.sh && sh scripts/test-db.sh` | ✅ | ⬜ pending |
| 26-07 T2 | 26-07 | 6 | RGEX-01..04 | T-26-21 | Chaîne app complète + e2e baseline 155 | full app | `cd app && npm run typecheck && npm test && npm run build && npm run test:e2e` | ✅ | ⬜ pending |
| 26-07 T3 | 26-07 | 6 | RGEX-01, RGEX-02, RGEX-04 | T-26-22 | Acceptation RGPD humaine : ZIP conforme, purge observée, push delivered (ou déclarée) | checkpoint:human-verify | non automatisé — preuves réseau consignées dans 26-07-SUMMARY.md | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Convention File Exists :** ✅ = infrastructure existante ; ❌ W0 = fichier créé à la Wave 0 (0158/0159 SQL ou gdpr-export-panel.test.tsx) ; n/a = preuve de déploiement/réseau ou checkpoint humain sans fichier de test.

**Sérialisation des déploiements Edge :** les commandes Automatées ci-dessus copient verbatim les blocs `<automated>` des plans (code de sortie fait foi — jamais un extrait tailé, §2.7). Les plans 26-03, 26-04 et 26-06 appellent tous `sh scripts/deploy-functions.sh`, qui reconstruit en entier le miroir `supabase-project/volumes/functions` (suppression des fonctions obsolètes puis copie) — deux exécutions entrelacées le corrompraient. La structure des vagues est donc : 26-01 (v1) · 26-02 (v2) · 26-03 + 26-05 (v3, 26-05 ne déploie pas) · 26-04 (v4, `depends_on` 26-03) · 26-06 (v5, `depends_on` 26-04) · 26-07 (v6) — un seul plan déployant par vague.

---

## Wave 0 Requirements

- [ ] `supabase/tests/0158_gdpr_export.sql` — négatifs RGEX-03 (expect_denied, comptages bornés §2.7D) + machine à états du job + job de purge présent
- [ ] Spike Deno (streaming fflate A2 + upload de flux A1 + cross-bucket copy A3) — débloquent les hypothèses A1–A3 du RESEARCH
- [ ] `app/src/modules/parametres/components/gdpr-export-panel.test.tsx` — panneau export (statuts, déclenchement)

*Si aucun : "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Notification push à l'achèvement (RGEX-02) | RGEX-02 | test-db.sh s'arrête à la frontière HTTP (pas de pg_net/runtime functions en base de test) | Modèle `test-dispatch-push.sh` : abonnement push réel exigé ; si aucun appareil abonné, l'absence n'est pas un échec mais doit être déclarée (§2.7) |
| Preuve réseau de purge (RGEX-04) | RGEX-04 | Le déclenchement réel de la storage-api ne peut pas s'exécuter dans la base de test seule | Script réseau sur le modèle de `test-dispatch-push.sh`, lisant le dernier `net._http_response` avant appel |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
