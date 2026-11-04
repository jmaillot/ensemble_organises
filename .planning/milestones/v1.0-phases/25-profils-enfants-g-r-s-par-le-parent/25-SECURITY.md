---
phase: "25"
slug: "profils-enfants-g-r-s-par-le-parent"
status: verified
threats_open: 0
asvs_level: 1
created: "2026-10-26"
---

# Phase 25 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Client → PostgREST → PostgreSQL | Les politiques RLS (0007 et extensions 0145/0146/0148) et les contraintes CHECK sont la barrière finale ; l'UI ne fait jamais autorité. | foyers, membres, tâches, routines, complétions |
| Migration → auth.users | La migration 0145 supprime des comptes auth : pouvoir maximal, borné par l'ordre update-avant-delete et l'exclusion multi-foyer. | comptes Auth, sessions |
| Client authentifié → RPC publics | RPC de conversion/fusion réservés service_role ou gardés par session + rôle adulte du foyer. | fusions adulte↔enfant, invitations |
| Chaîne push (pg_cron → dispatch → Edge Function) | Les rappels d'un enfant géré sont redirigés vers les adultes du foyer (0147). | notifications push |
| Enfant géré → écritures par module | Les gardes D-06 lisent les `managed_modules` de la ligne membre ; la lecture reste pleine (décision D-05/D-06). | tâches, routines, messages, anniversaires, menu, voyages |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-25-01 | Tampering | household_members.managed_modules CHECK | medium | mitigate | `chk_members_valid_modules` (0144) via `private.has_valid_module_keys` — rejette clé invalide et doublon ; défaut = socle D-06 | closed |
| T-25-02 | Information Disclosure | household_members.birth_date / deleted_at | low | accept | Politiques 0007 existantes (lecture par appartenance au foyer) — aucune surface nouvelle | closed |
| T-25-03 | Elevation of Privilege | public.convert_managed_children_to_profiles | high | mitigate | revoke all + grant service_role + garde runtime 42501 (0145), testée expect_denied | closed |
| T-25-04 | Repudiation / Tampering | delete auth.users dans la conversion | high | mitigate | Ordre update-avant-delete (D-04), exclusion multi-foyer, rapport jsonb ; test 0145 prouve survie membre + historique | closed |
| T-25-05 | Elevation of Privilege | redeem_household_invite_token / set_member_role | medium | mitigate | Fermeture D-17 : 22023 sur role enfant (0154/0156) ; invariant CHECK (23514) en filet | closed |
| T-25-06 | Denial of Service | appels répétés du RPC de conversion | low | accept | RPC idempotent (converted=0 au second passage), service_role only | closed |
| T-25-07 | Elevation of Privilege | replace_task/routine_assignees | high | mitigate | `private.assert_child_module_allowed` (0146/0157), lecture managed_modules de la ligne (D-05), 42501 | closed |
| T-25-08 | Elevation of Privilege | complete_routine_occurrence | high | mitigate | Garde d'acteur D-08/D-13 (soi-même ou enfant géré), module exigé, refus adulte→adulte testé | closed |
| T-25-09 | Repudiation | Cercle DELETE étendu | medium | mitigate | Branche bornée aux adultes (`can_write_household`) sur contenu d'enfant (`is_managed_child`) ; INSERT/UPDATE intouchés | closed |
| T-25-10 | Information Disclosure | push_reminder/birthday_notifications | medium | mitigate | D-23 (0147) : redirection vers adultes (`role in ('admin','membre')`, user_id not null) ; zéro destinataire enfant ; prouvé en réel par test-dispatch-push.sh le 2026-10-26 | closed |
| T-25-11 | Tampering | assigned_by_member_id / actor_member_id | low | mitigate | Écrites par les RPC depuis auth.uid() résolu (0146:362-440), jamais un paramètre client | closed |
| T-25-12 | Spoofing | useIsAdult côté client | low | accept | Pilote l'affichage seulement ; RLS/RPC revalident en base | closed |
| T-25-13 | Tampering | setManagedModules | medium | mitigate | Validation client sur clés servables + RPC serveur + CHECK 0144 — même ensemble des deux côtés | closed |
| T-25-14 | Repudiation | suppression d'un profil enfant | medium | mitigate | ConfirmDialog obligatoire (members-panel.tsx), réservé aux adultes, deleted_at (D-04) préserve les traces | closed |
| T-25-15 | Tampering | documents de planification | low | mitigate | Édition scopée, diff minimal vérifié — correction documentaire pure | closed |
| T-25-16 | Elevation of Privilege | placement hors socle (conversations, birthdays, meal_entries) | medium | mitigate | Clauses D-06 sur create/join conversation (22023) + déclencheurs anniversaires/menu (0146) | closed |
| T-25-17 | Tampering / Repudiation | link_managed_child | high | mitigate | Session + adulte + D-18bis + même foyer (D-22), déduplication, transaction unique (0148) | closed |
| T-25-18 | Tampering | linkChildToAccount depuis le client | high | mitigate | L'appel ne déclenche que le RPC 0148, revalidé côté serveur ; confirmation « irréversible » dans l'UI | closed |
| T-25-19 | Information Disclosure | fiche enfant dans la liste des membres | low | accept | birth_date/deleted_at suivent 0007 ; âge dérivé côté client, aucune exposition au-delà du foyer | closed |
| T-25-20 | Spoofing | toggleFor côté client | low | accept | Garde UI = affichage ; RPC 0146 revalide acteur, cible et module | closed |
| T-25-21 | Repudiation | « Cocher pour » | medium | mitigate | Filiation serveur : completed_by = enfant, actor_member_id = auth.uid() résolu (0146:158-175) | closed |
| T-25-22 | Tampering | member-eligibility.ts | low | mitigate | Fonction pure, règle D-06 en un point unique, consommée par les quatre pickers | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-25-01 | T-25-02, T-25-19 | birth_date/deleted_at lisibles par le foyer uniquement (politiques 0007 existantes) — aucune surface nouvelle | plan (disposition accept) | 2026-10-25 |
| AR-25-02 | T-25-06 | RPC idempotent et service_role only — pas de surface DoS client | plan (disposition accept) | 2026-10-25 |
| AR-25-03 | T-25-12, T-25-20 | Hooks UI sans pouvoir : défense en profondeur déjà en base | plan (disposition accept) | 2026-10-25 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-26 | 22 | 22 | 0 | GLM-5.3-Flash (orchestrator, L1 grep verification) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-26
