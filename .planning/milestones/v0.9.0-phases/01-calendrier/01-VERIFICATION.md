---
phase: 01-calendrier
verified: 2026-10-06T15:20:00Z
status: passed
score: 16/16 must-haves verified
covered_files:
  - .planning/phases/01-calendrier/01-01-PLAN.md
  - .planning/phases/01-calendrier/01-02-PLAN.md
  - .planning/phases/01-calendrier/01-03-PLAN.md
  - .planning/phases/01-calendrier/01-04-PLAN.md
  - .planning/phases/01-calendrier/01-05-PLAN.md
  - .planning/phases/01-calendrier/01-01-SUMMARY.md
  - .planning/phases/01-calendrier/01-02-SUMMARY.md
  - .planning/phases/01-calendrier/01-03-SUMMARY.md
  - .planning/phases/01-calendrier/01-04-SUMMARY.md
  - .planning/phases/01-calendrier/01-05-SUMMARY.md
  - supabase/migrations/0084_calendrier_perso_total.sql
  - supabase/migrations/0085_calendrier_perso_auto.sql
  - supabase/migrations/0086_calendrier_category_guard.sql
  - supabase/migrations/0087_calendrier_refresh_cron.sql
  - supabase/tests/0017_calendrier_phase.sql
  - supabase/functions/refresh-calendrier-ref/index.ts
  - supabase/functions/refresh-calendrier-ref/ref-days.ts
  - app/e2e/calendrier.spec.ts
  - app/src/modules/calendrier/calendrier-page.tsx
  - app/src/modules/calendrier/api.ts
  - app/src/modules/calendrier/types.ts
  - app/src/modules/calendrier/hooks/use-ref-days.ts
  - app/src/modules/calendrier/hooks/use-school-zone.ts
  - app/src/modules/calendrier/components/event-form-dialog.tsx
  - app/src/modules/calendrier/hooks/use-calendrier.ts
  - app/src/modules/calendrier/calendrier-page.test.tsx
  - app/src/modules/calendrier/hooks/use-ref-days.test.tsx
covered_digest: "v2:sha256:2d80f2269baa50a5e17ca26e401ad8f5fa1c16febcbb6698ca50b7dc0ace4000"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 13/16
  gaps_closed:
    - "Un enfant ne voit aucun bouton de creation (D-06, UI)"
    - "Jamais de rattachement silencieux au Commun, y compris chemin serveur (D-03)"
    - "Les vacances affichees correspondent a l'annee de la grille (D-13)"
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "0084 promet un filet de moderation admin inerte (SELECT-gating prouve 0 ligne en 0017)"
    category: other
    reason: "Docs/entete migration trompeurs pour un futur operateur ; fix = commentaire vers l'avant + trancher RPC moderation dedie vs gap accepte (WR-01)"
    evidence_status: "deterministic (0017 asserts 0 affected, EXPLAIN en SUMMARY 01-04)"
  - finding: "Un enregistrement vacances malforme annule le refresh de toutes les zones + statut refreshed:false trompeur (WR-05)"
    category: robustness
    reason: "parseVacationRecords sans validation ; fix = filtrer ranges invalides + try/catch par zone"
    evidence_status: "code reading only, not executed"
  - finding: "Dialogue Nouveau calendrier perso dit '(et les admins en lecture)' — faux depuis 0084 (D-01 invisibilite totale)"
    category: other
    reason: "Copie UI contredisant la RLS ; fix = reformuler 'Visible uniquement par vous'"
    evidence_status: "code reading only (calendrier-page.tsx:522)"
  - finding: "IN-01..IN-06 (dead field date/year, fail-open sans signal, CORS wildcard, helpers en 3 copies, trigger INSERT-only, race memberId/couleur)"
    category: other
    reason: "Carries per 01-REVIEW-DISPOSITION.md, tous open ; aucun ne contredit une verite must-have telle que libellee"
    evidence_status: "code review record only"
  - finding: "Tap-and-hold (onLongPress={openCreate}, calendrier-page.tsx:406) reste actif pour un enfant : ouvre le dialogue creation alors que tous les boutons sont gates"
    category: ux
    reason: "Plan 01-05 a deliberement laisse onLongPress tel quel ('action supplementaire', AGENTS.md §6). Aucune escalade possible : la RLS serveur (can_write exclut enfant, prouve 0017) rejette toute sauvegarde ; c'est une impasse UX (dialogue qui ne peut pas aboutir), pas une violation de contrat. Fix candidat : onLongPress={isChild ? undefined-no-op : openCreate} ou dialogue en lecture seule pour enfant"
    evidence_status: "code reading (calendrier-page.tsx:406, CalendarGrid onLongPress prop)"
---

# Phase 01: Calendrier Verification Report

**Phase Goal:** calendriers Commun/Perso, catégories Repas/Médical/École/Sport+custom, vues Liste/Jour/Semaine/Mois, cache fériés/vacances API + zone A/B/C (ROADMAP.md Phase 1).
**Verified:** 2026-10-06T15:20:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (plan 01-05, commits 35c4e52 / 811de4d / e96e8db)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | D-01 : admin ne voit ni ne modifie le Perso d'autrui ni ses events (Option B, delete inerte prouve) | ✓ VERIFIED | Unchanged since initial verification (no SQL touched by 01-05) ; 0017 : 32 assertions, admin select/update/delete-effectif = 0 + temoin owner = 1 |
| 2 | D-02/D-05 : un Perso par adulte (auto + backfill), aucun pour enfant | ✓ VERIFIED | Unchanged (0085 untouched) ; 0017 asserts adulte=1/enfant=0 |
| 3 | D-03 : choix calendrier explicite, Commun preselectionne, vide rejete | ✓ VERIFIED | Unchanged ; event-form-dialog Select + Zod min(1) ; 3 tests D-03 |
| 4 | D-03 : aucun rattachement silencieux, chemin serveur inclus | ✓ VERIFIED | **Gap closed.** api.ts:69 `find((cal) => cal.household_id === householdId && cal.visibility === 'commun')` — no name match. Anti-hijack tests (use-ref-days.test.tsx:198-229) : Perso nomme 'Commun' ignore, Commun au nom quelconque retourne, null sans Commun. Fallback use-calendrier.ts:108 sur par construction. Commit 811de4d |
| 5 | D-08 : renommer/supprimer categorie utilisee refuse 23514, seed inclus | ✓ VERIFIED | Unchanged (0086 untouched) ; 0017 asserts 23514 |
| 6 | D-13 : refresh serveur seul (secret-only) met le cache a jour depuis sources officielles | ✓ VERIFIED | Unchanged (Edge untouched) ; helpers.test.ts 4/4 |
| 7 | D-14 : cron janvier + septembre Europe/Paris, Vault, aucun secret en clair | ✓ VERIFIED | Unchanged (0087 untouched) ; catalogue 0017 |
| 8 | D-15 : panne API = ancien cache affiche, 200 refreshed:false non bloquant | ✓ VERIFIED | Unchanged + preserved : placeholderData/retry:1 intacts dans use-ref-days.ts:89-102 ; test D-15 (use-ref-days.test.tsx:173-195) vert |
| 9 | D-04 : deplacement Perso→Commun exige confirmation sortie du secret | ✓ VERIFIED | Unchanged ; isExitingPerso + ConfirmDialog ; 7 cas + integration |
| 10 | D-06 : enfant sans creation (serveur) et sans bouton de creation (UI) | ✓ VERIFIED | **Gap closed.** calendrier-page.tsx:188 (`isChild ? null` panneau agenda) + :218 (`actions={isChild ? undefined : ...}` ModuleShell) ; hidden=isChild conserves :308/:320. Test D-06 etendu (calendrier-page.test.tsx:285-288) : queryByRole null + queryAllByRole [] sur les 4 entrees pour Noe. Commit 35c4e52. Serveur inchange (can_write exclut enfant) |
| 11 | D-07 : categorie colore l'evenement, couleur membre sur avatars/vues filtrees | ✓ VERIFIED | Unchanged ; DayMarker/AgendaItem + tests hex |
| 12 | D-09/D-10 : filtres cumulables, couches ref toujours visibles non cliquables | ✓ VERIFIED | Unchanged ; toggles supprimes, RefDay non cliquable |
| 13 | D-11/D-12 : Mois defaut pastilles, Jour au clic, tap-and-hold + bouton + | ✓ VERIFIED | Unchanged ; 8 tests + e2e |
| 14 | D-13 : vacances affichees = annee de la grille | ✓ VERIFIED | **Gap closed.** use-ref-days.ts:37-39 export `schoolYearsForYear` (porte Edge), :96 queryKey `['ref-days','school_holidays',year,zone]`, :105-118 filtre `school_year ∈ years` + chevauchement `[01-01,12-31]` (clause requise : annee scolaire seule ne peut exclure Toussaint N-1, prouve rouge avant fix per 01-05-SUMMARY deviation). Tests bi-annees + 2-fetches cache-distinct + unitaire schoolYearsForYear verts. Feries (:89) et D-15 intacts. Commit e96e8db |
| 15 | D-16 : zone scolaire auto-suggeree, override admin-only, vacances par zone effective | ✓ VERIFIED | Unchanged ; use-school-zone + resolveur CP |
| 16 | Preuves : 0017 + e2e 12 tests + chaine §2.7 verte | ✓ VERIFIED | Rerun ce jour : `typecheck` vert (tsc --noEmit clean), Vitest calendrier 7 fichiers 43/43 vert (39 preexistants + 4 nouveaux : D-06 etendu, D-03 ×2, D-13 ×2/unitaire), `git status` propre, aucun SQL/Edge/RLS touche (`git diff --stat HEAD~3 HEAD -- supabase/` vide) |

**Score:** 16/16 truths verified (0 present, behavior-unverified)

### Per-Gap Evidence (re-verification)

| Gap (prior status) | Commit | Code proof | Test proof | Verdict |
|---|---|---|---|---|
| D-06 child creation entries visible (partial) | 35c4e52 | calendrier-page.tsx:188 agenda `isChild ? null`, :218 ModuleShell `actions={isChild ? undefined : ...}` | calendrier-page.test.tsx:285-288 null/[] on all 4 entries for Noe ; suite 43/43 | CLOSED |
| D-03 resolveCommunCalendarId name-only (partial) | 811de4d | api.ts:69 `visibility === 'commun'`, zero name match | use-ref-days.test.tsx:198-229 impostor ignored / null case ; suite 43/43 | CLOSED |
| D-13 vacations not year-scoped (partial) | e96e8db | use-ref-days.ts:37-39 + :96 + :105-118 | bi-year hooks, 2-fetch distinct-key, schoolYearsForYear unit ; suite 43/43, D-15 green | CLOSED |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/0084_calendrier_perso_total.sql` | RLS Perso invisible total | ✓ VERIFIED | Untouched, preuve 0017 intacte |
| `supabase/migrations/0085_calendrier_perso_auto.sql` | Trigger Perso auto + backfill | ✓ VERIFIED | Untouched |
| `supabase/migrations/0086_calendrier_category_guard.sql` | Garde 23514 | ✓ VERIFIED | Untouched |
| `supabase/migrations/0087_calendrier_refresh_cron.sql` | Dispatch Vault + 2 jobs | ✓ VERIFIED | Untouched |
| `supabase/functions/refresh-calendrier-ref/index.ts` | Edge secret-only fail-open | ✓ VERIFIED | Untouched |
| `supabase/functions/refresh-calendrier-ref/ref-days.ts` | Helpers purs | ✓ VERIFIED | Untouched, logique porte cote front a l'identique |
| `supabase/tests/0017_calendrier_phase.sql` | Suite preuves | ✓ VERIFIED | Untouched |
| `app/e2e/calendrier.spec.ts` | Spec 2 contextes | ✓ VERIFIED | Untouched |
| `app/src/modules/calendrier/components/event-form-dialog.tsx` | Choix explicite | ✓ VERIFIED | Untouched |
| `app/src/modules/calendrier/hooks/use-ref-days.ts` | Cache base + scope annee | ✓ VERIFIED | schoolYearsForYear + queryKey year + filtre overlap ; D-15 preserve |
| `app/src/modules/calendrier/api.ts` | Lecteurs cache + resolver | ✓ VERIFIED | Resolver visibility-first ; listSchoolHolidays inchange (filtre cote hook) |
| `app/src/modules/calendrier/types.ts` | Couleurs + isExitingPerso | ✓ VERIFIED | Untouched |
| `app/src/modules/calendrier/calendrier-page.tsx` | FilterBar/verrous/confirm/zone | ✓ VERIFIED | Gating isChild complet sur les 4 boutons ; copie admin-lecture stale (advisory porte) |
| `app/src/modules/calendrier/hooks/use-school-zone.ts` | Zone effective | ✓ VERIFIED | Untouched |
| `app/src/modules/calendrier/calendrier-page.test.tsx` | Preuve D-06 | ✓ VERIFIED | Test etendu vert |
| `app/src/modules/calendrier/hooks/use-ref-days.test.tsx` | Preuves D-03/D-13 | ✓ VERIFIED | Anti-hijack + bi-annees verts |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| event_calendars_select + is_calendar_visible | events Perso via PostgREST | RLS sans branche admin | WIRED | Unchanged, 0017 |
| trigger household_members AFTER INSERT | event_calendriers Perso | SECURITY DEFINER | WIRED | Unchanged |
| eventSchema calendarId | saveEvent | Select preselectionne + Zod | WIRED | Unchanged |
| resolveCommunCalendarId | saveEvent fallback | use-calendrier:108 | WIRED | **Fixed** — visibility-first, hijack impossible (test anti-hijack) |
| data.list holidays/school_holidays | CalendarShell | helpers purs + stale 24h | WIRED | Unchanged |
| dispatch Vault pg_net | Edge apikey | cron janv/sept | WIRED | Unchanged |
| onSubmit changement calendrier | ConfirmDialog sortie Perso | isExitingPerso | WIRED | Unchanged |
| queryKey(year,zone) | RefDay layer | useRefDays -> toVacationRanges | WIRED | **Fixed** — annee dans la cle + filtre (2 fetches distincts prouves) |
| isChild | toutes les entrees bouton de creation | ModuleShell + agenda + hidden | WIRED | **Fixed** — 4/4 gates, test [] |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| calendrier-page RefDay layer | holidays/vacations | public_holidays/school_holidays via data.list | ✓ FLOWING, scope annee OK | ✓ VERIFIED |
| FilterBar selects | calendars/categories/members | event_calendars/event_categories/household_members | ✓ FLOWING | ✓ VERIFIED |
| Edge refresh | public_holidays/school_holidays rows | data.gouv + EN (fetch serveur) | ✓ code wired | ✓ VERIFIED (live non exerce) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| typecheck | `npm --prefix app run typecheck` | clean (tsc --noEmit, no output) | ✓ PASS |
| Vitest calendrier | `npm test -- calendrier` | 7 files, 43/43 | ✓ PASS |
| No SQL/Edge drift | `git diff --stat HEAD~3 HEAD -- supabase/` | empty | ✓ PASS |
| Working tree | `git status --porcelain` | only `?? .claude/`, `?? .gsd/` (preexisting untracked) | ✓ PASS |

### Requirements Coverage

D-01…D-16 tous couverts (frontmatter 01-01…01-05 : 01-05 ajoute D-03/D-06/D-13). Pas de REQUIREMENTS.md projet — referentiel = 01-CONTEXT.md. Aucun orphelin.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | Aucun TBD/FIXME/XXX, placeholder, return vide, console.log seul dans les 5 fichiers 01-05 | — | Propre |

### Human Verification Required

None — les 3 gaps sont prouvables automatiquement (code + tests verts ci-dessus). Tap-and-hold enfant restant = impasse UX sans risque serveur, porte en advisory (pas de test humain requis pour lever `passed`).

### Gaps Summary

Les 3 gaps partiels sont fermes : gating enfant 4/4 boutons (35c4e52), resolver visibility-first (811de4d), vacances scopees annee civile + chevauchement (e96e8db). Socle serveur intact (aucun SQL/Edge/RLS touche), typecheck + 43/43 Vitest verts ce jour. Phase goal atteint : 16/16.

---

_Verified: 2026-10-06T15:20:00Z_
_Verifier: the agent (gsd-verifier)_
_Re-verification after 01-05 gap closure (prior: gaps_found 13/16, 2026-10-06T14:15:00Z)_
