---
phase: 36-outbox-plus-jamais-d-effacement-silencieux
verified: 2026-11-07T20:45:00Z
status: passed
score: 7/7 must-haves verified
covered_files:
  - .planning/phases/36-outbox-plus-jamais-d-effacement-silencieux/36-01-PLAN.md
  - .planning/phases/36-outbox-plus-jamais-d-effacement-silencieux/36-02-PLAN.md
  - .planning/phases/36-outbox-plus-jamais-d-effacement-silencieux/36-01-SUMMARY.md
  - .planning/phases/36-outbox-plus-jamais-d-effacement-silencieux/36-02-SUMMARY.md
  - app/src/lib/offline/outbox.ts
  - app/src/modules/parametres/components/offline-panel.tsx
  - app/src/lib/offline/outbox-replay.test.ts
  - app/src/lib/offline/outbox.test.ts
  - app/src/modules/parametres/components/offline-panel.test.tsx
  - app/src/hooks/use-outbox-replay-badge.ts
  - app/src/hooks/use-outbox-replay-badge.test.ts
covered_digest: "v2:sha256:03d1004c074fd99a1dbba1dffbfb31d209f3527433c5ca4165f5468be9c50089"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 36 : Outbox — plus jamais d'effacement silencieux — Rapport de vérification

**Phase Goal :** Toute écriture en outbox dont le rejeu échoue reçoit une classification explicite et un sort visible pour l'utilisateur — la décision 34 « jamais d'effacement silencieux » redevient vraie sans exception.
**Verified :** 2026-11-07T20:45:00Z
**Status :** passed
**Re-verification :** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | PGRST116 classé terminal, entrée jamais évaporée ni rejouée en boucle | ✓ VERIFIED | `outbox.ts:373-391` — tout code string → `{ kind: 'terminal', code }` ; défaut retryable uniquement sans code (réseau/5xx). Test d'intégration `outbox-replay.test.ts` : entrée conservée en `status: 'failed'`, longueur file inchangée, code `PGRST116` conservé — **passe dans la suite exécutée par le vérificateur** (209/209). |
| 2 | Libellé PGRST116 exactement « cet élément a été supprimé entre-temps » (D-01) | ✓ VERIFIED | `outbox.ts:339` mot pour mot ; `failureLabel` (l.364) matching EXACT `===` (Pitfall 1 couvert par test l.368) ; rendu panneau `offline-panel.tsx:273` — test composant l.305/334 vert. |
| 3 | Chaque code de la matrice D-05 reçoit classification + libellé non générique, prouvé 2× par test itératif (D-04) | ✓ VERIFIED | `outbox.test.ts:346` `it.each(FAILURE_FAMILIES.map(...))` — le test **importe la constante** (audit vivant, pas de copie) ; 28 tests dans le fichier, tous verts. |
| 4 | Tout code imprévu tombe terminal avec libellé générique français (D-06) | ✓ VERIFIED | `outbox.ts:368` `LIBELLE_GENERIQUE = 'cette écriture a été refusée par le serveur'` en branche finale ; test `outbox.test.ts:381` vert. |
| 5 | Cas retryable de la matrice (TypeError, 5xx, AbortError) restent retryable, prouvés explicitement | ✓ VERIFIED | `outbox.test.ts:373-378` — 3 assertions, vertes. |
| 6 | Toast D-12 retiré ; badge unique signal actif (D-02/D-03) | ✓ VERIFIED | `use-outbox-replay-badge.ts` : aucun `useToast`/`previousFailed`/`toastTimer` (grep nul) ; doc-comment nomme la raison du retrait ; `OutboxBadgeWatcher` toujours exporté et monté une seule fois (`router.tsx:647`) ; 4 tests badge verts. |
| 7 | Badge « N en attente / N bloquées » fonctionne à l'identique (payload `{ pending, failed }`) | ✓ VERIFIED | `use-outbox-replay-badge.ts:30-45` — compteurs dérivés de `useOutbox`, push banner-store priorité 4 intact ; tests D-13/D-11 verts. |

**Score :** 7/7 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/src/lib/offline/outbox.ts` | FAILURE_FAMILIES + failureLabel exportés | ✓ VERIFIED | Substantif (matrice 6 familles + défaut) et câblé (importé par panneau + tests). |
| `app/src/modules/parametres/components/offline-panel.tsx` | rend `failureLabel(entry.failure)` | ✓ VERIFIED | L.271-274 : « Bloquée ({code}) — {failureLabel(...)} », jamais le message brut. |
| `app/src/lib/offline/outbox-replay.test.ts` | scénario 404 intégration (rouge→vert D-09) | ✓ VERIFIED | Rouge documenté dans 36-01-SUMMARY (`failureLabel is not a function`) ; assertion l.325 verte. |
| `app/src/lib/offline/outbox.test.ts` | matrice itérative D-04 + retryable + D-06 | ✓ VERIFIED | 28 tests, `it.each` sur la constante importée. |
| `app/src/modules/parametres/components/offline-panel.test.tsx` | rendu libellé 404 + ancienne forme + états vides | ✓ VERIFIED | Assertions l.305/334 vertes. |
| `app/src/hooks/use-outbox-replay-badge.ts` | toast retiré, badge intact | ✓ VERIFIED | Grep : zéro useToast ; badge + watcher présents. |
| `app/src/hooks/use-outbox-replay-badge.test.ts` | describes badge conservés | ✓ VERIFIED | 4 tests verts, zéro mention toast. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| adapter DataError(cause code) | classifyFailure → FAILURE_FAMILIES | lecture du `code` dans la chaîne cause | ✓ WIRED | `outbox.ts:378-386` lit `candidate.code` ; tests 320/391 passent un `DataError` typé. |
| FAILURE_FAMILIES | failureLabel | fonction pure, matching exact | ✓ WIRED | `outbox.ts:364-369`. |
| failureLabel | offline-panel render | import + appel au rendu | ✓ WIRED | Import l.14, rendu l.273 ; test composant vert. |
| test it.each | FAILURE_FAMILIES importée | audit vivant (D-04) | ✓ WIRED | `outbox.test.ts:346` importe la constante — aucune copie. |
| useOutbox compteurs | badge banner | payload `{ pending, failed }` | ✓ WIRED | Hook l.30-45 ; 4 tests badge verts. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Suite offline + paramètres + badge | `cd app && npx vitest run src/lib/offline src/modules/parametres src/hooks/use-outbox-replay-badge.test.ts` | 15 fichiers, **209/209 verts**, 12.3 s | ✓ PASS |

Exécutée par le vérificateur dans son propre processus — les affirmations des SUMMARY ne sont pas prises comme preuve. Cette unique run couvre les invariants comportementaux : classification terminal (transition d'état), non-évaporation, non-boucle, libellés, compteurs badge.

### Probe Execution

Aucune sonde déclarée (`grep probe-*` sur les plans : néant) — non applicable.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| OBOX-01 | 36-01, 36-02 | 404 classé terminal + message visible « supprimé entre-temps », jamais d'évaporation | ✓ SATISFIED | Truths 1, 2, 6, 7 — tests intégration + composant + badge verts. |
| OBOX-02 | 36-01 | Audit exhaustif des codes, tout échec classifié et surfaced | ✓ SATISFIED | Truths 3, 4, 5 — matrice D-05 fermée, test itératif sur constante exportée, D-06 défaut terminal testé. |

Aucun ID orphelin : REQUIREMENTS.md ne mappe que OBOX-01/OBOX-02 à la phase 36, tous deux réclamés par les plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (aucun) | — | grep TBD/FIXME/XXX/TODO/HACK/placeholder sur les 7 fichiers : néant | — | — |

### Human Verification Required

Aucun item — les invariants comportementaux (classification, non-évaporation, badge) sont exercés par des tests d'intégration/composant exécutés et verts ; aucun état de transition ne repose sur la seule présence de symboles.

## Advisory (hors périmètre, non bloquant)

1. **e2e « rejoindre un foyer / format du token » rouge (2/167)** — prouvé PRÉEXISTANT par le plan 36-02 sur baseline `b02e0a0` (parent du premier commit de phase), hors périmètre 36, consigné dans `deferred-items.md`. Ne bloque pas cette phase ; à traiter dans une phase dédiée (cause probable : pré-écran d'invitation 31-03/31-07, `join-household-page.tsx`).
2. **Chaîne §2.7** : typecheck, npm test (1958), build — verts (consignés dans 36-02-SUMMARY) ; SQL non applicable (zéro migration touchée, preuve `git status` vide sur `supabase/migrations`).

## Gaps Summary

Aucun gap. Le but de phase est atteint : chaque code de rejeu est classifié (terminal par défaut — D-06 rend l'évaporation impossible par conception), le 404 affiche le libellé verrouillé D-01 dans le panneau, le badge et le panneau forment un canal unique cohérent, et des tests automatisés rouges→verts prouvent le scénario d'origine.

---

_Verified: 2026-11-07T20:45:00Z_
_Verifier: the agent (gsd-verifier)_
