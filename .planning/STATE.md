---
gsd_state_version: "1.0"
milestone: v1.4
milestone_name: Preuve & décision
current_phase: 44
status: completed
stopped_at: Phase 44 complete — all phases complete
last_updated: "2026-11-12T08:14:21.252Z"
last_activity: 2026-11-12
last_activity_desc: Phase 44 complete
state_head: 592fa18a9ed9dbe45e01941031c77fd25bf33e50
progress:
  total_phases: 2
  completed_phases: 2
  total_plans: 3
  completed_plans: 3
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-12)

**Core value:** PWA foyers — l'app de poche du quotidien familial, fiable hors-ligne, joignable en un tap, sans store.
**Current focus:** Jalon v1.4 complet — CACHE-01 différée honnêtement, reprise de campagne quand l'appareil de référence est accessible

## Current Position

Phase: 44
Plan: Not started
Status: All phases complete
Last activity: 2026-11-12 — Phase 44 complete

## Performance Metrics

- v1.1 : 4 phases, 25 plans, 17 tasks, 145 commits, audit tech_debt 16/16
- v1.2 : 2 phases, 5 plans, 6 exigences, audit tech_debt 6/6
- v1.3 : 5 phases (38-42), 12 exigences, 13 plans — audit tech_debt 10/12 (2 deferred : COLD-02, CACHE-01)
- v1.4 : 2 phases (43-44), 11 exigences (PROOF-01..07, CACHE-01..04) — en cours

**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 43 P01 | 5h | 3 tasks | 2 files |
| Phase 44 P01 | 11 min | 3 tasks | 1 files |
| Phase 44 P02 | 1h55 | 3 tasks | 1 file |

## Accumulated Context

### Decisions (this milestone)

- Ordre des phases = ordre de **risque**, pas de dépendance : aucune dépendance croisée W1/CACHE-01. W1 en premier car aucune dépendance appareil (stack prod + accès SQL suffisent) ; CACHE-01 en second car bloquée sur la disponibilité physique de l'appareil de référence (différée deux fois en v1.3 pour cette raison). Parallélisable si l'appareil se libère tôt.
- Script sœur `scripts/test-ardoise-bridge-real.sh` (convention du dépôt : un script par preuve à ressource réelle) — recommandation tranchée par la recherche contre l'extension inline de `test-join-token-real.sh` (couplage des deux jambes rendrait le verdict ambigu, §2.7 F).
- Zéro nouveau paquet, zéro nouveau service : W1 = sh + curl -K + psql.sh stdin + lib-smoke-accounts.sh ; CACHE-01 = édition déclarative d'`OFFLINE_FAMILIES` dans `query-policy.ts`. `experimental_createQueryPersister` refusé (casserait outbox, namespacing D-03, throttle muté).
- Statu quo justifié = décision CACHE-01 valide (CA-03) ; les critères §5 (b)(c) tranchent, jamais la lecture du panneau seule (biais d'ordre — le maxAge en vigueur détermine le volume observé).
- Déféré au backlog : W2 (spec navigateur du flux bridge, si PROOF-07 révèle un seam au-delà du scénario déclenché), GATE-01 (observatoire), COLD-02 (périmètre distinct).
- [Phase 44] Différé de campagne consigné honnêtement (2026-11-12) : accès à l'environnement de mesure absent en session — aucune valeur inventée, aucun émulateur, code inchangé ; la reprise se fait au même protocole (N=5, purge §2.1, dictée des panneaux), squelettes prêts dans `docs/MESURES-COLD-START-42.md`.
- [Phase 44] Repli checkpoint = repli produit : la clause « Si NON » du plan (différé tracé, PROJECT.md intouché) est le critère de succès 1, pas un échec — verdict du vérificateur 10/10.

### Todos

- Rejouer GATE-01 (tests 32-UAT 7 et 35-UAT 2) lors de la prochaine mise en production naturelle — observatoire hors jalon.
- Purger à la main les 3 comptes e2e résiduels de runs antérieurs (e2e+1794223918703512-1/-2, e2e+1794223911703118-1) — signalés par le script, jamais supprimés par lui (borne : comptes du run uniquement).

### Blockers

- Phase 44 : machine on-device (appareil de référence) requise pour la campagne N=5 et toute décision maxAge — toujours bloquant : la campagne 44-02 a été différée faute d'accès à l'environnement de mesure (2026-11-12). L'outillage est prêt, la reprise ne demande que l'appareil.

## Session Continuity

**Last session:** 2026-11-12T08:20:00Z
**Stopped at:** Jalon v1.4 complet — phases 43-44 closes, CACHE-01 différée honnêtement, reprise de campagne quand l'appareil est accessible
**Resume file:** None

- Phase 44 close (44-01 préparatoire + 44-02 différé consigné, chaîne §2.7 verte CHAINE-44-VERTE, verification passed 10/10, UAT 3/3) — voir PROJECT.md « État courant ».
- Exigences : PROOF-01..07 ✓ (Phase 43) ; CACHE-02..04 ✓ (44-01) ; CACHE-01 → différée honnêtement (critère de succès 1), reprise au protocole §6.
- Prochain pas : `/gsd-complete-milestone` pour archiver v1.4, ou reprise de campagne quand l'appareil de référence sera disponible.

## Operator Next Steps

- `/gsd-complete-milestone` — archiver v1.4 et préparer le jalon suivant (la décision CACHE-01 reste ouverte, à porter au jalon suivant ou en reprise de campagne).

## Decisions

- [Phase 43]: Négatif replay épinglé à l'observable réel 410 « révoqué » (is_active vérifié avant use_count dans 0181)
- [Phase 43]: config_session à étiquette unique — aucun compteur global en substitution de commande (sous-shell)
- [Phase 43]: householdId explicite sur create-ardoise du foyer B (households[0] sinon)
- [Phase 44]: Verdict D-15 : le panneau offline existant suffit pour les critères (a) et (c) par famille — observabilité conditionnelle D-14 non déclenchée, jamais préventive
