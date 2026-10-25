---
gsd_state_version: "1.0"
milestone: v1.0
milestone_name: Mise en ligne publique (phases 25-31)
current_phase: 25
current_phase_name: Profils enfants gérés par le parent
status: executing
stopped_at: Completed 25-06-PLAN.md
last_updated: "2026-10-25T16:55:15.727Z"
state_head: e5e1669823614ae162591c227ea990ba1f4b3dbf
progress:
  total_phases: 7
  completed_phases: 0
  total_plans: 7
  completed_plans: 2
  percent: 0
last_activity: 2026-10-25
---

# STATE — jalon v1.0 « Mise en ligne publique »

## Current Position

Phase: 25 (Profils enfants gérés par le parent) — EXECUTING
Plan: 3 of 7
Status: Ready to execute
Progress: [░░░░░░░░░░] 0%

## Références du jalon v1.0

- ROADS : .planning/ROADMAP.md (phases 25-31, numérotation continue de v0.9.0 qui s'est arrêté à 24)
- Requirements : .planning/REQUIREMENTS.md (33 exigences v1.0, table de traçabilité remplie)
- Recherche : .planning/research/SUMMARY.md (confiance HIGH codebase / MEDIUM RGPD-SMTP)

## Portes dures de séquence (non négociables)

1. Phase 25 (identité enfants) AVANT 26-27 (RGPD) — le périmètre « sans session »
   doit être stabilisé avant de définir qui correspond à quelle donnée.
2. Phase 26 (export) AVANT 27 (suppression) — l'export est proposé avant l'offre.
3. Phase 28 : l'exercice de restauration consigné (OPS-02) conditionne l'ouverture
   publique. Cette phase peut courir en parallèle avec 26/27/29.
4. Phase 31 (inscriptions ouvertes) = DERNIERE : porte OUV-07 = suppression vivante (27)
   + restauration consignée (28) + preuve SMTP réelle Gmail/Outlook.
5. Phase 29 (messagerie) bénéficie de 25 (member-picker incluant les enfants) ;
   orthogonale autrement.
6. Phase 30 (hygiène/dettes) placée avant la porte d'ouverture — aucun go-live public
   sur une dette connue.

## Accumulated Context

- Décisions héritées v0.9.0 : tous les 20 espaces en prod, e2e 147/147, audits
  v0.9.0 PASSED ; contrats enfants 0113-0116 (à re-diligencier en plan 25) ;
  RPC conversations 0041 ; chaîne push `dispatch_messages`→`push-notify` existante ;
  estampille de build à quatre canaux (phase 24).
- Frontières tranchées par la recherche (powering plans) :
  - Suppression J+30 purement SQL/pg_cron (jamais HTTP depuis cron — frontière non
    testée par test-db.sh), manifest médias construit à la demande.
  - Accusé de lecture : watermark par membre, jamais une écriture par message
    (pitfall 7 — décision au niveau de la migration, pas un retrofit).
  - Realtime self-hosted : `alter publication supabase_realtime` obligatoire,
    prouvé par souscription.
  - MTA : Stalwart v0.16.4 (pas de SaaS SMTP — contredit self-hosted/RGPD).
  - Table `gdpr_export_jobs` + bucket `gdpr-exports` (TTL 24h URL, purge 7 j cron).
  - Flag-deliverability : réputation IP — preuve de réception réelle exigée sur le
    domaine cible, fallback relais SMTP dédié à prouver, pas à pré-installer.
- Indicateurs de suivi : 925+ tests Vitest, test-db 64/64, e2e 147/147 (baseline à
  maintenir à chaque phase).
- Pièces pointées à investiguer pendant les plans : migrations 0113-0116 (profils
  enfants) et RPC conversations 0041 (à relire pendant plan 25) ; audit FK vers
`auth.users` (phase 27) ; `household_invite_tokens` (déjà durcies 0082/0083, plan 31).

## Session Continuity

**Last session:** 2026-10-25T16:54:53.477Z
**Stopped at:** Completed 25-06-PLAN.md
**Resume file:** None

- Prochaine étape : approbation de la roadmap par l'utilisateur, puis `/gsd-plan-phase 25`
  (recherche approfondie recommandée selon research/SUMMARY.md pour 25, 26, 27, 31).
- Le corps historique du journal (phases 1-24) reste perdu (cf. note de réécriture du
  24/10) ; les récits vivent dans .planning/phases/*/ et docs/RETROSPECTIVE.md.
- .planning est partiellement gitignoré : ROADMAP.md/STATE.md/REQUIREMENTS.md et
  recherches vivent sur le disque uniquement. Ne pas annoncer de commit de ces fichiers.

---
Statut historique (v0.9.0 clôturé le 2026-10-24) : audit PASSED, phases 16-24
(UAT utilisateur validée). Archivé dans .planning/milestones/v0.9.0-ROADMAP.md.

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 25 P01 | 23 min | 2 tasks | 3 files |
| Phase 25 P06 | 8 min | 1 tasks | 2 files |

## Decisions

- [Phase 25]: Restriction par module portée par la ligne household_members (managed_modules text[]), pas par households — D-05 par enfant
- [Phase 25]: CHECK de format uniquement (private.has_valid_module_keys de 0140) : la validité sémantique du catalogue reste côté client
- [Phase 25]: Invariant enfant-⟺-sans-session volontairement ABSENT de 0144 : il rejoint en 0145 après la conversion (les lignes héritées enfant-avec-compte le violeraient)
- [Phase 25]: ENF-02 : la modération du Cercle sort du « au nom de l'enfant » — le parent n'agit jamais en son nom dans le Cercle, il modère le contenu attribué à un enfant

### Blockers

- test 0139 : assertion de backfill non bornée au foyer (préexistant, non causé par 25-01) — échoue dès qu'un article réel existe ; consigné dans deferred-items.md et WINDOWS.md
