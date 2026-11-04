---
status: passed
phase: 31-inscriptions-ouvertes
verified_at: '2026-11-03T19:05:00Z'
verdict: 'passed — G-31-3 re-qualifiée et résolue : la dette de preuve est documentée
  honnêtement et traçablement au titre de l''amendement opérateur 2026-11-03 ; aucun
  must-have en échec'
score: 39/39 must-haves verified (31 code-verified inchangés + 6 items HV attestés-passés
  au titre de l'amendement opérateur 2026-11-03)
covered_files:
- .planning/phases/31-inscriptions-ouvertes/31-01-PLAN.md
- .planning/phases/31-inscriptions-ouvertes/31-01-SUMMARY.md
- .planning/phases/31-inscriptions-ouvertes/31-02-PLAN.md
- .planning/phases/31-inscriptions-ouvertes/31-02-SUMMARY.md
- .planning/phases/31-inscriptions-ouvertes/31-03-PLAN.md
- .planning/phases/31-inscriptions-ouvertes/31-03-SUMMARY.md
- .planning/phases/31-inscriptions-ouvertes/31-04-PLAN.md
- .planning/phases/31-inscriptions-ouvertes/31-04-SUMMARY.md
- .planning/phases/31-inscriptions-ouvertes/31-05-PLAN.md
- .planning/phases/31-inscriptions-ouvertes/31-05-SUMMARY.md
- .planning/phases/31-inscriptions-ouvertes/31-06-PLAN.md
- .planning/phases/31-inscriptions-ouvertes/31-06-SUMMARY.md
- .planning/phases/31-inscriptions-ouvertes/31-07-PLAN.md
- .planning/phases/31-inscriptions-ouvertes/31-07-SUMMARY.md
- .planning/phases/31-inscriptions-ouvertes/31-08-PLAN.md
- .planning/phases/31-inscriptions-ouvertes/31-08-SUMMARY.md
- .planning/phases/31-inscriptions-ouvertes/31-UAT.md
- app/src/app/route-preload.ts
- app/src/app/router.tsx
- app/src/lib/invites.ts
- app/src/modules/landing/join-household-page.tsx
- app/src/modules/landing/legal-page.tsx
- app/src/modules/landing/privacy-page.tsx
- app/src/modules/landing/sign-in-page.tsx
- app/src/modules/landing/terms-page.tsx
- app/src/modules/parametres/components/invitations-panel.test.tsx
- app/src/modules/parametres/components/invitations-panel.tsx
- docs/EXPLOITATION.md
- supabase-project/docker-compose.traefik.yml
- supabase/functions/household-invite-preview/index.ts
- supabase/functions/household-invite/index.ts
- supabase/migrations/0176_token_list_governance.sql
- supabase/tests/0176_token_list_governance.test.sql
covered_digest: v2:sha256:9eed2e5b82911628d06fdf8a4008013d92ef096fd4fd05e0c7c666055be0c194
re_verification:
  previous_status: gaps_found
  previous_score: 31/39
  gaps_closed:
  - 'G-31-3 — RESOLVED (re-qualifiée) : l''amendement du protocole de preuve (décision
    explicite et datée de l''opérateur, 2026-11-03, consigné dans 31-UAT.md § Routage)
    fait de l''attestation expresse de l''opérateur une base suffisante pour marquer
    une vérification humaine comme passée. La dette de preuve est désormais documentée
    honnêtement (sections de preuve laissées vides et annotées, aucune valeur inventée,
    notamment aucun RTO inventé) et traçablement (chaque case porte la mention « attestation
    opérateur 2026-11-03 »).'
  gaps_remaining: []
  regressions: []
gaps: []
human_verification:
- id: HV-1
  test: Réception SMTP réelle — emails de confirmation en boîte de réception (pas
    spam) sur Gmail ET Outlook, FROM alias contact@jeremymaillot.fr constaté
  expected: 'au titre du protocole initial : captures datées collées dans 31-UAT.md
    § HV-1'
  outcome: PASS au titre de l'amendement du protocole de preuve (attestation opérateur
    2026-11-03) — aucune preuve consignée, section laissée vide et annotée honnêtement
    dans 31-UAT.md
- id: HV-2
  test: 429 GoTrue — rafale de plus de 6 inscriptions/min depuis une même IP
  expected: 'au titre du protocole initial : code 429 consigné avec horodatage'
  outcome: PASS au titre de l'amendement du protocole de preuve (attestation opérateur
    2026-11-03) — aucune preuve consignée, section vide et annotée honnêtement dans
    31-UAT.md
- id: HV-3
  test: 429 Traefik — 4e POST /auth/v1/signup et 11e POST /auth/v1/token d'une rafale
  expected: 'au titre du protocole initial : 3 passent puis 429 ; 10 passent puis
    429 ; reste de l''API non limité'
  outcome: PASS au titre de l'amendement du protocole de preuve (attestation opérateur
    2026-11-03) — aucune preuve consignée, section vide et annotée honnêtement dans
    31-UAT.md
- id: HV-4
  test: Exercice de restauration réel (runbook docs/EXPLOITATION.md, Compose isolé
    eo-restore, pg_cron désactivé avant démarrage)
  expected: 'au titre du protocole initial : RTO mesuré consigné dans docs/EXPLOITATION.md
    § RTO constaté'
  outcome: 'PASS au titre de l''amendement du protocole de preuve (attestation opérateur
    2026-11-03) — exercice attesté exécuté, mais valeur RTO mesurée NON consignée
    (relevé T0/T1 absent) : docs/EXPLOITATION.md reste « non mesuré » et AUCUNE valeur
    RTO n''a été inventée — cohérent des deux côtés'
- id: HV-5
  test: Push réelle — sh scripts/test-dispatch-push.sh avec appareil réellement abonné
  expected: 'au titre du protocole initial : au moins 1 « delivered » consigné, endpoint
    factice non admis'
  outcome: PASS au titre de l'amendement du protocole de preuve (attestation opérateur
    2026-11-03) — aucune preuve consignée, section vide et annotée honnêtement dans
    31-UAT.md
- id: HV-6
  test: État de prod — migration 0176 appliquée, Edges déployées, override Traefik
    chargé (recréation api-gw/auth/functions)
  expected: 'au titre du protocole initial : sorties d''hôte collées dans 31-UAT.md
    § HV-6 (schema_migrations, volumes/functions, docker compose ps)'
  outcome: PASS au titre de l'amendement du protocole de preuve (attestation opérateur
    2026-11-03) — aucune preuve consignée, section vide et annotée honnêtement dans
    31-UAT.md
requirement_traceability:
  OUV-01: attested-passed (HV-1, amendement opérateur 2026-11-03) — code SMTP relais
    Gmail vérifié en codebase, réception réelle attestée par l'opérateur sans relevé
    consigné
  OUV-02: attested-passed (HV-1 + HV-2, amendement opérateur 2026-11-03) — limites
    GoTrue configurées en code, 429 attesté par l'opérateur
  OUV-03: attested-passed (HV-3, amendement opérateur 2026-11-03) — middlewares Traefik
    3+6 / 10+20 vérifiés en config (docker-compose.traefik.yml), filtrage réel attesté
    par l'opérateur
  OUV-04: code-verified (pré-écran dé-gaté, preview, traversée sessionStorage, 62/62
    tests plan) — état live prod attesté via HV-6
  OUV-05: code-verified (migration 0176 modèle liste, expiration/revoke-one/panneau
    — SQL 103/103, 13/13 tests, 10/10 tests re-exécutés par le verifier)
  OUV-06: code-verified (routes /mentions-legales et /confidentialité publiques dans
    router.tsx:258,270) — mise en ligne réelle attestée via HV-6
  OUV-07: attested-passed (HV-4 + HV-5, amendement opérateur 2026-11-03) — restauration
    exécutée attestée (RTO non mesuré, valeur honnêtement déclarée absente), push
    réelle attestée, aucune valeur inventée
---

# Phase 31 — VERIFICATION (re-vérification après amendement du protocole de preuve)

## Résultat : passed — G-31-3 résolue par amendement explicite et daté de l'opérateur

## Décision enregistrée : amendement du protocole de preuve (2026-11-03)

**Le niveau de garantie des six vérifications humaines HV-1..HV-6 repose désormais sur l'attestation expresse de l'opérateur, et non sur des relevés datés consignés. C'est une décision EXPLICITE ET DATÉE de l'opérateur du projet (2026-11-03, commit 0d4daf0), consignée dans `31-UAT.md` § Routage — pas un oubli, pas un contournement silencieux.** Tout auditeur lisant ce rapport doit comprendre que :

1. La règle initiale (« une case ne passe que sur un relevé daté collé ») est conservée pour l'historique dans `31-UAT.md` et supplantée par l'amendement ;
2. L'opérateur a attesté le 2026-11-03 (session `/gsd-verify-work 31`, 7/7 « pass ») que les six portes prod sont exécutées et conformes ;
3. Aucune preuve indépendante n'existe dans le dépôt pour ces six portes — la traçabilité repose sur la parole de l'opérateur, conséquence explicitement acceptée dans l'amendement.

## Re-qualification de G-31-3 : RESOLVED

La question posée par cette re-vérification n'était plus « la preuve est-elle collée ? » mais « la dette de preuve est-elle documentée honnêtement et traçablement au titre de l'amendement ? ». Réponse : oui, sur les trois critères.

### 1. Amendement daté et explicite dans 31-UAT.md § Routage — OUI

`31-UAT.md` lignes 166-177 : bloc « Amendement du protocole de preuve (2026-11-03, décision de l'opérateur) » qui (a) cite la règle initiale qu'il remplace, (b) énonce la nouvelle règle (« l'attestation expresse de l'opérateur suffit »), (c) documente la session de vérification (7/7 « pass »), (d) déclare la conséquence acceptée (« la traçabilité de ces portes repose désormais sur la parole de l'opérateur ») et (e) route vers le présent rapport. Le protocole initial reste en fin de fichier, annoté « supplanté par l'amendement ». Commit porteur : 0d4daf0 (« amendement du protocole de preuve - attestation operateur HV-1..HV-6 (2026-11-03) »).

### 2. Honnêteté des sections HV — OUI (aucune preuve fabriquée)

Chacune des six sections HV-1..HV-6 porte :

- une date d'exécution formulée « 2026-11-03 (attestation opérateur — amendement du protocole, aucun relevé collé) » — pas une date d'exécution factice ;
- une section « Preuve collée » explicite : « (vide — aucune preuve consignée ; attestation opérateur 2026-11-03 au titre de l'amendement § Routage) » — vide et annotée, pas inventée ;
- une case `[x] pass` assortie de la mention « attestation opérateur 2026-11-03 (amendement § Routage) » — la case ne prétend jamais reposer sur un relevé.

**Aucune valeur mesurée n'a été inventée nulle part**, en particulier : **aucune valeur RTO**. Le grep du dépôt sur « RTO constaté » ne retourne que des formulations « non mesuré » / « valeur non consignée » / « — ». La date d'exécution HV est le seul champ daté et il est qualifié d'attestation, pas d'exécution documentée.

### 3. Cohérence de docs/EXPLOITATION.md — OUI (la contradiction précédente a disparu)

- § « RTO constaté » (lignes 43-53) : « Non mesuré à ce jour (2026-11-03) : l'exercice de restauration a été **exécuté et conforme selon l'attestation expresse de l'opérateur** ... mais la **valeur RTO mesurée n'a pas été consignée** (relevé T0/T1 absent) ». La mention antérieure « exécution en attente » a été supprimée — la contradiction matérielle signalée en G-31-3 n'existe plus.
- Tableau de bilan (ligne 66) : « RTO constaté (T1 − T0) | — (exercice attesté exécuté, valeur non consignée — relevé T0/T1 absent) ».
- Bilan de porte critère 2 (ligne 355) : « attesté — preuve non consignée (amendement du protocole de preuve, opérateur 2026-11-03) » avec références croisées vers EXPLOITATION § RTO constaté et 31-UAT.md § HV-4.
- L'étape 6 du runbook (lignes 252-257) reste intacte : la procédure de consignation du RTO demeure disponible si l'opérateur consigne la valeur plus tard.

EXPLOITATION.md, 31-UAT.md et le présent rapport racontent la même histoire : **exercice attesté, valeur non mesurée consignée, dette déclarée au lieu d'être masquée.**

## Vérification technique (régression et périmètre)

- **Aucun changement de code depuis la vérification précédente.** `git diff 0d4daf0 -- app supabase` est vide ; les deux commits postérieurs à la vérification précédente (c39dbf8 : mise à jour ROADMAP « 8/8 plans executed » ; 0d4daf0 : documentation) ne touchent aucun fichier d'implémentation. Les 31 must-haves code-verified de la précédente passe restent donc valables sans re-exécution (rappel : G-31-1 fermé et vérifié, 10/10 tests invitations-panel verts exécutés par le verifier à la passe précédente).
- **Cohérence structurale re-confirmée par sondage** : routes `/mentions-legales` (router.tsx:270) et `/confidentialité` (router.tsx:258) publiques ; middlewares rateLimit Traefik signup 3/6 et token 10/20 présents dans `docker-compose.traefik.yml` (lignes 142-163) ; migration `0176_token_list_governance.sql` présente en tête de `supabase/migrations`.
- **UAT session** : 7/7 pass (cold-start + HV-1..HV-6), frontmatter `31-UAT.md` status: complete — désormais cohérent avec le corps du document, puisque chaque case porte sa justification d'amendement.

## Note d'audit (n'entrave pas le statut passed)

`.planning/REQUIREMENTS.md` marque toujours OUV-01/02/03/06/07 « Pending » (cases `[ ]` non cochées, table de traçabilité lignes 125-131). Ce n'est **pas** une contradiction avec l'amendement — ces cases reflètent la conservation conservatrice de la preuve collée et n'affirment rien de faux — mais le suivi de traçabilité gagnerait à être aligné sur ce verdict (cases cochées avec mention « attesté, amendement 2026-11-03 ») par l'orchestrateur ou l'opérateur lors du prochain passage sur REQUIREMENTS.md.

## Score

**39/39 must-haves vérifiés** : 31 code-verified (inchangés depuis la passe précédente) + 6 items HV attestés-passés au titre de l'amendement opérateur 2026-11-03. **behavior_unverified : 0** au titre du régime amendé (les 6 vérifications humaines sont couvertes par l'attestation opérateur, décision explicite enregistrée ci-dessus).

## Errors

Aucune erreur bloquante. Note outil : `covered_digest` (v2) a été recalculé après vérification — le subagent verifier n'avait pas `gsd_run` dans son PATH ; les 16 artefacts PLAN/SUMMARY ont été ajoutés à `covered_files` (re-scan live) et le digest recalculé via `gsd_run verification.fingerprint`.

---

_Verified: 2026-11-03T19:05:00Z_
_Verifier: the agent (gsd-verifier)_
