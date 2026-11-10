---
phase: 39-outillage-prod-de-vérification
plan: 01
subsystem: testing
tags: [smoke-test, gotrue-admin-api, shell, secrets, supabase, e2e]

requires:
  - phase: 38-filet-de-tests-fiable
    provides: discipline §2.7 F (succès muet = échec), pattern anti-skip, chaîne de vérification
  - phase: 31-inscriptions-ouvertes
    provides: flux join-token 31-03 que le smoke vérifie (JWT/RLS réels)
provides:
  - scripts/lib-smoke-accounts.sh — bibliothèque CS-04 sourçable (create/purge/list/session) consommée par le plan 02
  - smoke-test.sh à deux modes auto-détectés (admin prod / signup dev), purge vérifiée re-delete→404
  - section « smoke-test prod » dans docs/EXPLOITATION.md (DS-03)
affects: [39-02, phase-40-ardoise, test-join-token-real]

actuals:
  tokens: 43000   # chars/4 sur le diff réalisé (527 lignes ajoutées / ~60 retirées sur 3 fichiers)
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "curl -K 0600 + trap : seul transport du secret (§2.7 H), pattern seed-test-accounts généralisé"
    - "purge vérifiée par re-delete → 404 exigé (§2.7 F)"
    - "429 → pause fixe + 1 retry ; 422 → échec nommé immédiat avec corps (DS-02)"

key-files:
  created:
    - scripts/lib-smoke-accounts.sh
  modified:
    - scripts/smoke-test.sh
    - docs/EXPLOITATION.md

key-decisions:
  - "Bibliothèque auto-portante (SMOKE_API/SMOKE_STACK_ENV/SMOKE_*) : le plan 02 la source sans réimplémenter l'accès Admin (CS-04)"
  - "La bibliothèque ne pose PAS son propre trap EXIT — smoke_accounts_tmp_clean est appelé dans le trap de l'appelant, sinon le trap du smoke serait écrasé"
  - "Session en mode admin par POST /auth/v1/token?grant_type=password (A1) : l'Admin ne renvoie pas de JWT, le compte confirmé accepte le grant"
  - "filter=e2e (partie avant le +) + re-vérification par email de chaque résultat (Pitfall 5 : le + nu peut être décodé en espace)"
  - "Domaine e2e paramétrable E2E_MAIL_DOMAIN (défaut ensemble.jeremymaillot.fr, A2 : aucun DNS requis, les comptes admin n'envoient aucun email)"
  - "Purge : détection résiduelle AVANT la purge dans le cleanup, pour que les résidus soient rapportés même si la purge échoue"

patterns-established:
  - "Bibliothèque shell sourcée avec contrat de variables SMOKE_* (CS-04, consommé par le wrapper du plan 02)"
  - "Fichier de config curl -K en 0600 comme unique canal du secret dans scripts/"

requirements-completed: [SMOKE-01]

coverage:
  - id: D1
    description: "Bibliothèque comptes e2e (création admin email_confirm:true, purge vérifiée re-delete→404, liste résiduelle, session par mot de passe) câblée dans le smoke — Alice ET Bob passent par elle"
    requirement: SMOKE-01
    verification:
      - kind: other
        ref: "sh -n scripts/lib-smoke-accounts.sh && sh -n scripts/smoke-test.sh (pass)"
      - kind: other
        ref: "garde anti-secret-argv : grep -nE '\\-H \"[^\"]*SECRET_KEY' scripts/smoke-test.sh scripts/lib-smoke-accounts.sh — sortie vide (pass)"
    human_judgment: false
  - id: D2
    description: "Refus explicite sans SUPABASE_SECRET_KEY (exit 1, les deux modes), 429→1 retry/422→échec nommé, emails e2e+<runid>@<E2E_MAIL_DOMAIN>"
    requirement: SMOKE-01
    verification:
      - kind: other
        ref: "! grep -q 'example\\.fr' scripts/smoke-test.sh scripts/lib-smoke-accounts.sh (pass)"
      - kind: manual_procedural
        ref: "sh scripts/smoke-test.sh depuis l'hôte de la stack (DS-01, run réel documenté)"
        status: unknown
    human_judgment: true
    rationale: "Le run réel exige la stack déployée + SUPABASE_SECRET_KEY sur l'hôte de la stack — indisponible sur la machine de travail (DS-01, user_setup déclaré dans le plan)"
  - id: D3
    description: "Section « smoke-test prod » dans docs/EXPLOITATION.md : quand, preuve/non-preuve, commandes, lecture du rapport, E2E_MAIL_DOMAIN"
    requirement: SMOKE-01
    verification:
      - kind: other
        ref: "grep 'Smoke-test prod' && grep smoke-test.sh && grep E2E_MAIL_DOMAIN docs/EXPLOITATION.md (pass)"
    human_judgment: false

duration: 70min
completed: 2026-11-09
status: complete
plan_head_before: fb561d1d0ba3d6df3975d28b89eb3f0201218590
plan_head_after: 59d6e15
commits: 3
---

# Phase 39 Plan 01: Outillage smoke prod — comptes e2e via l'Admin GoTrue Summary

**Bibliothèque sourçable de comptes e2e (création Admin `email_confirm:true`, purge vérifiée re-delete→404, résidus signalés, secret uniquement via curl -K 0600), câblée dans le smoke à deux modes auto-détectés, documentée dans EXPLOITATION.md**

## Performance

- **Duration:** ~70 min
- **Started:** 2026-11-09T10:25:59Z
- **Completed:** 2026-11-09T11:36Z
- **Tasks:** 3/3
- **Files modified:** 3

## Accomplishments

- `scripts/lib-smoke-accounts.sh` (CS-04) : sonde publique `mailer_autoconfirm`, `smoke_accounts_create` (admin, `email_confirm:true`, 429→pause+1 retry, 422→échec nommé immédiat), `smoke_accounts_purge` (re-delete→404 exigé), `smoke_accounts_list` (signale, ne supprime jamais, filtre `e2e` + re-vérification par email), `smoke_accounts_session` (grant password, A1) — le secret ne circule QUE via un fichier `-K` en 0600 dans un mktemp supprimé au nettoyage
- `scripts/smoke-test.sh` : mode auto-détecté (CS-01), Alice ET Bob créés via la bibliothèque en mode admin (sérialisés), emails `e2e+<runid>-<index>@$E2E_MAIL_DOMAIN` (EE-01), purge finale vérifiée (§2.7 F), détection résiduelle en fin de run (EE-02), refus nommé sans secret dans les deux modes (CS-02) — les deux dettes historiques (secret en argv l.211-212, fallback muet l.197) sont corrigées
- Section « smoke-test prod (phase 39, SMOKE-01 / TEST-02) » dans `docs/EXPLOITATION.md` (DS-03) : quand lancer, preuve/non-preuve, les deux commandes, lecture du rapport, `E2E_MAIL_DOMAIN`

## Task Commits

1. **Task 1: Tracer — bibliothèque comptes + câblage** — `9c0c3be` (feat)
2. **Task 2: Expansion — deux comptes via la bibliothèque, refus sans secret, 422/429** — `6d7be49` (feat)
3. **Task 3: Documentation d'exploitation (DS-03)** — `59d6e15` (docs)

## Files Created/Modified

- `scripts/lib-smoke-accounts.sh` — bibliothèque CS-04 (fichier SOURCÉ, jamais exécuté)
- `scripts/smoke-test.sh` — parcours 5 étapes inchangé (CS-03), création et purge branchées sur la bibliothèque
- `docs/EXPLOITATION.md` — section « smoke-test prod »

## Decisions Made

- La bibliothèque est auto-portante (`SMOKE_API`, `SMOKE_STACK_ENV`, sorties `SMOKE_CREATED_*`, `SMOKE_SESSION_JWT`) : le wrapper du plan 02 la source tel quel, sans seconde implémentation de l'accès Admin (contrat A1 épinglé dans l'en-tête du fichier)
- La bibliothèque ne pose pas son propre `trap` EXIT (elle écraserait celui du smoke) — `smoke_accounts_tmp_clean` est appelé depuis le `cleanup` du smoke
- En mode admin, la session s'obtient par `POST /auth/v1/token?grant_type=password` (l'Admin ne renvoie pas de JWT) — le smoke dépend de ce grant, c'est aussi le contrat du plan 02 (A1)
- Détection résiduelle placée AVANT la purge dans le cleanup : les résidus sont rapportés même si la purge échoue ; les comptes du run courant sont exclus de la liste par leur email
- Le `filter=` de la liste porte sur `e2e` (partie avant le `+`, Pitfall 5) avec re-vérification par email de chaque résultat

## Deviations from Plan

None — plan exécuté tel qu'écrit.

## Issues Encountered

- **Échec unitaire préexistant, hors périmètre** : `cd app && npm test` → 1 échec (`calendrier-page.test.tsx` l.165, « Journée libre » non trouvée) ; 243/244 fichiers et 1987/1988 tests verts. Le plan ne touche aucun fichier `app/` — défaut préexistant, consigné dans `deferred-items.md` du répertoire de phase (scope boundary, non corrigé).
- **Run réel non exécuté ici (DS-01, par conception)** : la machine de travail n'a ni stack joignable ni `SUPABASE_SECRET_KEY`. Le passage obligatoire reste : `sh scripts/smoke-test.sh` depuis l'hôte de la stack, en vérifiant la ligne « comptes purgés, purge prouvée (re-delete → 404) » et l'absence de résidu du run. `npm run typecheck` : vert.

## Vérification de A1 (consignée pour le plan 02)

`POST /auth/v1/token?grant_type=password` sur un compte admin-créé (`email_confirm:true`) : le chemin est implémenté (`smoke_accounts_session`) et consommé par le smoke — sa preuve réelle est le run manuel sur la stack (DS-01). Si le grant échouait au premier run réel, le fallback documenté en recherche est `generate_link` Admin (chemin non représentatif, à consigner avant adoption). Le plan 02 consomme `smoke_accounts_session` telle quelle, sans la réimplémenter.

## Dépendance inter-vagues assumée

La section doc mentionne `sh scripts/test-join-token-real.sh` : cette référence est résolue à la vague 2 (plan 02). Elle est en suspens jusqu'à l'exécution du plan 02 — dépendance de résolution inter-vagues assumée, non une omission.

## User Setup Required

Oui — déclaré `user_setup` dans le plan (DS-01) :

- **Service** : stack Supabase déployée joignable depuis l'hôte de la stack.
- **Variable** : `SUPABASE_SECRET_KEY` présent dans le `.env` de la stack (`supabase-project/.env`) — jamais sur la machine de travail.
- **Dashboard/config** : vérifier `ENABLE_EMAIL_AUTOCONFIRM=false` dans le `.env` de la stack (déjà le cas en prod — contrainte, jamais modifiée par le script).
- **Optionnel (EE-01)** : si un sous-domaine e2e est réservé, poser `E2E_MAIL_DOMAIN=<sous-domaine>` dans le `.env` de la stack (défaut `ensemble.jeremymaillot.fr`, aucun DNS requis).

## Known Stubs

None — aucun stub : toutes les fonctions livrées sont câblées et appelées ; la seule preuve en suspens est le run réel manuel (DS-01), tracé dans User Setup Required et la couverture D2.

## Next Phase Readiness

- Le plan 02 source `scripts/lib-smoke-accounts.sh` pour créer/purger ses comptes (contrat : `smoke_accounts_create`/`_purge`/`_session`, variables `SMOKE_*` documentées en tête de fichier)
- Le run réel du smoke (et la vérification de A1) se joue sur l'hôte de la stack avant `/gsd-verify-work`

---
*Phase: 39-outillage-prod-de-vérification*
*Completed: 2026-11-09*

## Self-Check: PASSED

- `scripts/lib-smoke-accounts.sh`, `scripts/smoke-test.sh`, `docs/EXPLOITATION.md` : présents sur disque
- Commits `9c0c3be`, `6d7be49`, `59d6e15` : présents dans l'historique
- `commits: 3` mesuré depuis le ledger (`fb561d1..59d6e15`)
