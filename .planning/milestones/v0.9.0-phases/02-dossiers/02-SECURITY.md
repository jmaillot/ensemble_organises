---
phase: "02-dossiers"
slug: "dossiers"
status: verified
threats_open: 0
asvs_level: 1
created: "2026-10-06"
---

# Phase 02 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Audit rétroactif (aucun threat register planifié — phase as-built) : registre
> STRIDE construit depuis l'implémentation par `gsd-security-auditor`, ASVS 1.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| PostgREST + RLS | Client navigateur (clé publiable) → politiques RLS foyer/visibilité/grade sur dossiers + items | task_lists, note_folders, routine_folders, folder_id des items |
| Triggers serveur | Garde d'intégrité et seed, `SECURITY DEFINER`, `search_path=''` | validate_item_folder, guard_folder_default, create_household seed |
| UI enfant | Masquage visuel (`canManage`) + throw hooks, jamais barrière : `can_write` serveur exclut `enfant` | création/gestion dossiers |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| F-S01 | Spoofing | folder tables SELECT/INSERT/UPDATE/DELETE inter-foyer | high | mitigate | RLS 3 tables (0051:53-87) + 0017:56-68 (Carol lit 0, écriture refusée) | closed |
| F-T01 | Tampering | item rangé dans dossier d'un autre foyer | high | mitigate | Trigger `validate_item_folder` 23514 (0052:14-52) + FK (0050:55-60) ; 0017:108-127 | closed |
| F-T02 | Tampering | Général renommé/supprimé/désactivé | medium | mitigate | Uniques partiels (0050:51-53) + `guard_folder_default` 42501 (0073:20-37) + RLS delete `not is_default` (0051:85) ; 0017:146-151 | closed |
| F-E01 | Elevation of privilege | enfant crée/gère des dossiers | high | mitigate | RLS `can_write_household` insert/update (0051:62-80) + gate `canManage` UI (folder-tabs:80, 3 pages) + throw hooks ; 0017:90-98 | closed |
| F-I01 | Information disclosure | dossier perso visible à un non-owner non-admin du foyer | high | mitigate | SELECT foyer OU owner OU admin (0051:55-60) ; 0017:84-89 | closed |
| F-I02 | Information disclosure | item d'un dossier perso via contournement SELECT | high | mitigate | Politiques items `AND folder_visible(...)` (0051:96-175) ; 0017:70-82 | closed |
| F-D01 | Denial of service | suppression dossier détruit le contenu | medium | mitigate | FK `ON DELETE SET NULL` (0050:55-60) + garde DELETE (0053:20-22) + ConfirmDialog (folder-tabs:267-281) ; 0017:139-145 | closed |
| F-I03 | Tampering | Général dupliqué / collision de noms par foyer | low | mitigate | Unique partiel `where is_default` + uniques `(household_id,name)` (0050:20,33,46,51-53) + seed idempotent ; below high threshold | closed |
| F-E02 | Elevation of privilege | usurpation owner_member_id | high | mitigate | INSERT owner = membre courant + appartenance foyer (0051:64-69), UPDATE (0051:76-79) + trigger `validate_member_refs` (0052:98-119) ; 0017:128-134 | closed |
| F-D02 | Denial of service | garde Général bloque la suppression du foyer | medium | mitigate | Exception cascade parent-supprimé (0073:22-26) ; 0017:156-168 | closed |
| F-T03 | Tampering | nom vide/surlong (abus stocké, casse UI) | low | mitigate | CHECK 1..80 (0050:14,27,40) + trim frontend + maxLength 80 ; below high threshold | closed |
| F-D03 | Denial of service | foyer sans seed Général | low | mitigate | Seed `create_household` 3× Général (0052:171-176) + backfill (0052:211-247) ; 0017:27-33 ; below high threshold | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

No accepted risks.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-06 | 12 | 12 | 0 | gsd-security-auditor (retroactive-STRIDE, ASVS 1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-06
