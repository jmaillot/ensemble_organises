---
phase: 27-suppression-de-compte-rgpd
plan: 03
subsystem: edge-rgpd + parametres
tags: [rgpd, edge-functions, suppression-compte, frontend]
requires: [0167-account-deletion-rpc, 0168-account-deletion-purge-cron, edge-household-delete]
provides: [edge-unifiee-household-delete, gdpr-delete-panel, gdpr-cancel-page, 0169-manifest-rpc]
affects: [parametres-page, router, route-preload, cron-account-deletion]
tech-stack:
  added: [npm:nodemailer@10.0.15 (dans household-delete)]
  patterns: [edge-unifiee-discriminated-union, wrapper-postgrest-private (motif 0163), rpc-then-edge orchestration]
key-files:
  created:
    - supabase/migrations/0169_account_deletion_manifest_rpc.sql
    - supabase/tests/0169_account_deletion_manifest_rpc.test.sql
    - app/src/modules/parametres/components/gdpr-delete-panel.tsx
    - app/src/modules/parametres/components/gdpr-delete-panel.test.tsx
    - app/src/modules/parametres/gdpr-cancel-page.tsx
  modified:
    - supabase/functions/household-delete/index.ts
    - app/src/modules/parametres/api.ts
    - app/src/modules/parametres/types.ts
    - app/src/modules/parametres/parametres-page.tsx
    - app/src/app/router.tsx
    - app/src/app/route-preload.ts
    - app/src/app/route-preload.test.tsx
decisions:
  - "F1 tranché : le ctx withSupabase n'expose pas le JWT brut — Bearer extrait du header Authorization puis admin.auth.signOut(jwt, {scope:'global'}) (documenté dans l'Edge)."
  - "Mode 'foyer' par défaut sans discriminant : compat panneau admin inchangé (D-10/RGDP-07), e2e foyer verts."
  - "0169 : le manifest privé n'est pas exposé par PostgREST — wrappers public.deletion_media_claim/mark_purged (motif 0163), service_role seul."
  - "Échec e-mail après RPC réussi : réponse 200 email_sent:false (échec honnête, la demande est déjà commitée — jamais un 500 mensonger)."
  - "Limite p_limit du claim posée sur les LIGNES (sous-requête), pas sur l'agrégat — défaut attrapé par le test 0169 vu rouge."
metrics:
  duration: ~1h30 (16:48 UTC start tasks → 17:07)
  completed: 2026-10-27
  tasks: 3
  commits: 4
status: complete
actuals:
  tokens: 15716
  tasks: 3
  commits: 4
plan_head_before: cefaa7b8f33263efb6911bf3b9dd1172485cc6ff
plan_head_after: 5be4d18
estimate:
  tokens: 80000
  tasks: 3
requirements-completed: [RGDP-01, RGDP-02, RGDP-03, RGDP-07]
commits:
  - 3ed9ae1 feat(27-03): Edge unifiée household-delete — mode compte, actions cron, manifest PostgREST
  - d7fe427 feat(27-03): panneau « Mes données (RGPD) » suppression de compte + page d'annulation
  - 5be4d18 fix(27-03): borne p_limit sur les lignes du manifest + compte de morceaux 60
---

# Phase 27 Plan 03: Edge unifiée + face vivante RGPD Summary

Edge `household-delete` consolidée en une seule voie de suppression à deux modes (foyer/compte) avec kill global des sessions, e-mail de confirmation et d'alerte J-7 via nodemailer, purge de médias bornée au manifest SQL, panneau « Mes données (RGPD) » et page d'annulation sans session.

## What Was Built

- **Edge unifiée** (`supabase/functions/household-delete/index.ts`) : `z.discriminatedUnion('mode', …)` avec 'foyer' par défaut (panneau admin inchangé), mode 'compte' (garde `authMode==='user'` → RPC 0167 → `signOut(jwt, {scope:'global'})` → e-mail nodemailer avec lien d'annulation vers `/parametres/donnees?annuler=<id>`, jamais `/auth/v1/*`), actions cron `reminder`/`purge-medias` réservées à `auth: 'secret'` (403 sinon) — purge-medias ne supprime QUE les chemins du manifest et répond le contrat honnête `storage_cleanup: 'ok'|'partial'`.
- **0169** (correction vers l'avant, motif 0163) : PostgREST n'expose pas le schéma `private` — wrappers `public.deletion_media_claim(integer)` / `public.deletion_media_mark_purged(uuid[])`, SECURITY DEFINER, service_role seul, preuves de privilèges en migration + tests SQL (0169 test vu rouge avant vert).
- **Frontend** : `api.ts` (requestAccountDeletion orchestrant rpc PUIS Edge dans cet ordre, échec Edge signalé honnêtement D-02 ; cancelAccountDeletion ; fetchAccountDeletionRequests — RPC purs, zéro écriture directe des tables `account_deletion_*`), `gdpr-delete-panel.tsx` (modale destructive obligatoire qui prévient AVANT le clic que les sessions meurent, horloge locale `purge_due_at`, aria-live, annulation), page `/parametres/donnees` (lit `?annuler=`, ne crée jamais de session, appelle le RPC D-05 dans une session réauthentifiée), panneau monté à côté du panneau export dans l'onglet 'foyer'.

## Coverage (Must-Haves → Evidence)

| Must-have | Preuve |
|---|---|
| Sessions tuées immédiatement + surface déshumanisée (RGDP-01) | Edge mode 'compte' : rpc 0167 puis `signOut(jwt,{scope:'global'})` ; test vitest prouve l'ordre rpc→Edge et la modale prévient du kill |
| Panneau admin inchangé (D-10/RGDP-07) | Contrat foyer rejoué tel quel (défaut sans discriminant) ; e2e foyer verts (155 passed) |
| Email de confirmation → lien d'annulation APP, jamais /auth/v1/* (D-05) | `readAppOrigin` (SITE_URL, échec fermé), lien `${origin}/parametres/donnees?annuler=<id>` ; page React sous RequireAuth |
| purge-medias borné au manifest, contrat 'partial' (D-07/F6) | claim/mark via 0169 ; boucle ne supprime que les chemins listés ; test SQL 0169 vert |

## Task Results

| Task | Type | Commit | Résultat |
|---|---|---|---|
| 1 Edge unifiée (tracer) | tracer | 3ed9ae1 | Deploy OK (gardes vérifiées en direct : action cron avec clé publiable → 403 ; mode 'compte' anonyme → 401) ; typecheck + vitest parametres verts |
| 2 Frontend RGPD | auto | d7fe427 | Typecheck + vitest module verts (96 tests, dont 5 nouveaux) |
| 3 Chaîne §2.7 | auto | 5be4d18 | Chaîne entière verte (détail ci-dessous) |

## Vérification §2.7 (chaîne complète, Task 3)

- `npm run typecheck` : vert.
- `npm test` : **203 fichiers / 1641 tests verts** (1 correction : témoin de couverture route-preload 59→60 morceaux).
- `npm run build` : vert (precache 141 entrées).
- `npm run test:e2e` : **155 passed, 7 skipped** — parcours foyer existants verts (RGDP-07 prouvé).
- `check-sql-statique.py` : 224 fonctions effectives / 169 migrations / 100 tests, aucun défaut ; `test-check-sql-statique.py` : 6 cas verts.
- `test-db.sh` : **98 fichiers, tous verts** (0169 inclus, vu rouge puis corrigé).
- **`test-dispatch-push.sh` NON exécuté** : le push Web n'est pas touché par ce plan (aucun abonnement, aucune notification push — les e-mails partent par SMTP/nodemailer). Une absence se dit : voilà pourquoi.

## Deviations from Plan

**[Rule 3 - Blocking] Migration 0169 ajoutée (hors `files_modified` du plan).**
- **Found during:** Task 1
- **Issue:** le plan supposait « accès SQL direct depuis l'Edge » au manifest `private.account_deletion_media_manifest` — or PostgREST n'expose que `public`/`graphql_public` (PGRST_DB_SCHEMAS du snapshot) : l'appel admin.rpc échoue (« Could not find the function … in the schema cache »).
- **Fix:** même correction que le tracer 26-03 (0163) — wrappers `public` SECURITY DEFINER service_role seul, logique restée en `private`.
- **Files:** supabase/migrations/0169_account_deletion_manifest_rpc.sql + supabase/tests/0169_account_deletion_manifest_rpc.test.sql
- **Commit:** 3ed9ae1, corrigé en 5be4d18 (borne p_limit).

**[Rule 1 - Bug] `LIMIT` du claim s'appliquait à l'agrégat, pas aux lignes.**
- **Found during:** Task 3 (test-db.sh, assertion 0169 « borné à p_limit » rouge)
- **Fix:** sous-requête bornée AVANT le `jsonb_agg`.
- **Commit:** 5be4d18

**[Rule 1 - Bug] Témoin de couverture route-preload (59→60).** Ajout du chunk `parametresDonnees` — le témoin a fait son travail (vu rouge, corrigé). Commit 5be4d18.

## F1 — point tranché (demandé par le plan)

`withSupabase` expose `{ supabase, supabaseAdmin, userClaims, jwtClaims, authMode }` — **pas** le JWT brut. Choix : Bearer extrait du header `Authorization` de la requête, puis `supabaseAdmin.auth.signOut(jwt, { scope: 'global' })` (le client GoTrue poste `/auth/v1/logout?scope=global` avec CE jwt : le kill porte sur la session de l'appelant). Le fallback `POST /auth/v1/admin/logout` + service key n'a pas été nécessaire. Choix consigné dans le doc-comment SONDE F1 de l'Edge.

## Auth Gates

Aucun (SMTP relais dev Inbucket :2500 déjà configuré).

## Known Stubs

Aucun. (L'e-mail J-7 cible `profiles.email` — colonne réelle ; le libellé « demande visée » de la page d'annulation affiche l'id reçu sans l'utiliser pour autoriser quoi que ce soit : le serveur n'agit que sur la demande du compte connecté, 42501.)

## Self-Check: PASSED

- Fichiers créés/modifiés présents sur disque ; commits 3ed9ae1 / d7fe427 / 5be4d18 retrouvés dans `git log`.
- `git rev-list --count cefaa7b..HEAD` = 3 commits de tâches (+ 1 commit docs ci-dessous = 4 mesurés au moment du SUMMARY).
