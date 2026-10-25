---
phase: "01-calendrier"
slug: "calendrier"
status: verified
threats_open: 0
asvs_level: 1
created: "2026-10-06"
---

# Phase 01 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Audit L1 (grep-depth, short-circuit : register planifié, ASVS 1, 0 menace ouverte).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| PostgREST + RLS | Client navigateur (clé publiable) → politiques RLS foyer/visibilité/grade | events, calendriers, catégories, cache fériés/vacances |
| Edge refresh-calendrier-ref (secret seul) | Cron serveur → Vault → sources officielles → tables cache | fériés/vacances, project_url/service_role_key via Vault uniquement |
| UI enfant | Masquage visuel des CTA, jamais barrière : `can_write` serveur exclut `enfant` | actions création/gestion |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-01-01 | Information disclosure | event_calendars_select + is_calendar_visible | high | mitigate | 0084 : branche admin-read retirée (`is_calendar_visible`, politique select) ; négatif admin en 0017 | closed |
| T-01-02 | Tampering | events.calendar_id forgé inter-foyer | high | mitigate | Trigger `validate_event_scope` (0047:374-409) inchangé ; aucune écriture ne contourne calendar_id | closed |
| T-01-03 | Information disclosure | private.dispatch_calendrier_refresh + cron.job.command | high | mitigate | Secrets via Vault à l'exécution (0087:49-56), commandes nues ; catalogue sans-secret en 0017 | closed |
| T-01-04 | Tampering | event_categories delete/rename en usage | medium | mitigate | Garde 0086 errcode 23514 + ConfirmDialog UI | closed |
| T-01-05 | Elevation of privilege | création catégorie/calendrier par enfant | medium | mitigate | `can_write_household` = admin/membre seuls (0006:77-85) + boutons masqués (01-05) + 0016/0017 | closed |
| T-01-06 | Information disclosure | filtre client du Perso | high | mitigate | Aucun filtre client de confidentialité (filtres = affichage FilterBar/dates) ; RLS 0084 seule barrière | closed |
| T-01-07 | Elevation of privilege | households.school_zone override par non-admin | medium | mitigate | `households_update` admin-only (0007:257-260) ; preuve e2e 01-03 | closed |
| T-01-08 | Information disclosure | resolveCommunCalendarId visibility-first | medium | mitigate | Resolver `visibility==='commun'` seul (api.ts:69) + tests anti-hijack ; RLS barrière réelle | closed |
| T-01-SC | Tampering | npm/pip/cargo installs | high | mitigate | Aucune dépendance ajoutée par la phase (diff package.json/package-lock vide) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-01-01 | T-01-01 (partiel) | `events_delete_admin` conservé : l'admin supprime des events Perso invisibles (filet modération, documenté en entête 0084). Lecture fermée, suppression = risque accepté. | phase 01 (SUMMARY 01-01) | 2026-10-06 |
| R-01-02 | — (cron-tz-drift) | Jobs cron codés en GMT pour viser 04h Paris : si `cron.timezone` change, dérive silencieuse. Consigne en entête 0087, aucun test de garde. | phase 01 (SUMMARY 01-02) | 2026-10-06 |
| R-01-03 | — (moderation-net-inerte) | Filet modération 0084 inerte en pratique (SELECT-gating, prouvé 0017+EXPLAIN) : contenu Perso problématique inexpurgeable sans RPC dédié. À trancher (RPC vs commentaire). | phase 01 (SUMMARY 01-04) | 2026-10-06 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-06 | 9 | 9 | 0 | orchestrator (L1 short-circuit, register planifié, ASVS 1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-06
