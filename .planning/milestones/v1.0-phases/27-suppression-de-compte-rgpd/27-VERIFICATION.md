---
phase: 27-suppression-de-compte-rgpd
verified: 2026-10-28T16:15:00Z
status: passed
score: 11/12 must-haves verified
covered_files:
  - .planning/phases/27-suppression-de-compte-rgpd/27-01-PLAN.md
  - .planning/phases/27-suppression-de-compte-rgpd/27-02-PLAN.md
  - .planning/phases/27-suppression-de-compte-rgpd/27-03-PLAN.md
  - .planning/phases/27-suppression-de-compte-rgpd/27-04-PLAN.md
  - .planning/phases/27-suppression-de-compte-rgpd/27-05-PLAN.md
  - .planning/phases/27-suppression-de-compte-rgpd/27-01-SUMMARY.md
  - .planning/phases/27-suppression-de-compte-rgpd/27-02-SUMMARY.md
  - .planning/phases/27-suppression-de-compte-rgpd/27-03-SUMMARY.md
  - .planning/phases/27-suppression-de-compte-rgpd/27-04-SUMMARY.md
  - .planning/phases/27-suppression-de-compte-rgpd/27-05-SUMMARY.md
  - supabase/migrations/0166_account_deletion_tables.sql
  - supabase/migrations/0167_account_deletion_rpc.sql
  - supabase/migrations/0168_account_deletion_purge_cron.sql
  - supabase/migrations/0169_account_deletion_manifest_rpc.sql
  - supabase/migrations/0170_account_deletion_multifoyer_snapshot.sql
  - supabase/tests/0170_account_deletion_multifoyer_snapshot.test.sql
  - supabase/functions/household-delete/index.ts
  - supabase/functions/household-delete/revoke-sessions.ts
  - supabase/functions/household-delete/revoke-sessions.test.ts
  - app/src/modules/parametres/components/gdpr-delete-panel.tsx
  - app/src/modules/parametres/gdpr-cancel-page.tsx
  - app/src/types/database.ts
  - supabase-project/docker-compose.traefik.yml
covered_digest: "v2:sha256:712a6a46369386ddb91081af25a82a139e3ab944bd06716baedc9f2c51e166a7"
behavior_unverified: 1 # assumé : livraison J-7 = test 7 reporté en phase 28 (décision utilisateur 2026-10-28)
behavior_unverified_items:
  - truth: "Alerte J-7 part exactement une fois (RGDP-03) — la livraison pg_net n'est jamais confirmée (frontière HTTP hors test-db.sh)"
    test: "Sur l'environnement réel, laisser une demande arriver à J-7 et vérifier l'arrivée de l'e-mail d'alerte (et une seule fois)"
    expected: "Un e-mail d'alerte J-7 reçu ; net._http_response 200 consigné ; aucun doublon au cron suivant"
    why_human: "La livraison SMTP/pg_net n'est pas exécutable dans test-db.sh ; le contrat best-effort (flag posé AVANT le POST, échec = alerte perdue) est désormais documenté honnêtement (0170 entête, WR-01 dispositionné accepted-best-effort) mais non exercé"
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 9/12
  gaps_closed:
    - "Sessions tuées immédiatement à la demande de suppression (RGDP-01) — CR-01"
    - "L'annulation restaure nom/avatar de CHAQUE foyer depuis un instantané par ligne (RGDP-02) — CR-02"
    - "WR-02 : manifest porte bucket_id (SQL + Edge purge par bucket exact)"
    - "WR-01/WR-03 : commentaires véridiques (rappel J-7 best-effort, aucun sélecteur ne filtre account_deleted_at)"
    - "WR-04 : message panneau conditionnel à sessions_revoked, email_error jamais rendu"
    - "IN-01/IN-02/IN-03 : destinataires profiles.email, plus de promesse de restauration des sessions, « Votre demande »"
    - "Round 2 (2026-10-28) : kill GoTrue réel vérifié par retest humain (G-27-4, sessions_restantes=0) après les correctifs 8bdb858..9c8dddd — preuves truth 4 actualisées (rpcAsUser / npm: / compose), aucune régression"
  gaps_remaining: []
  regressions: []
gaps: []
---

# Phase 27: Suppression de compte RGPD — Verification Report (RE-VERIFICATION)

**Phase Goal:** Voie de suppression de compte annulable : sessions tuées immédiatement, surface publique anonymisée, réversibilité 30 j, alerte J-7, purge J+30 purement SQL/pg_cron, Edge `household-delete` consolidée. Audit FK et règles produit tranchés en SPEC.
**Verified:** 2026-10-28T16:15:00Z
**Status:** passed (décision utilisateur 2026-10-28 : l'unique item restant — livraison e-mail J-7 pg_net/SMTP — est le test UAT 7 reporté EN PHASE 28, tracé dans ROADMAP §Phase 28 ; kill GoTrue réel et parcours visuel couverts par l'UAT humaine G-27-4 ; 5/5 tests UAT exécutés passés)
**Re-verification:** Yes — round 2 après les 4 correctifs UAT G-27-4 (commits 8bdb858..9c8dddd : household-delete/index.ts, revoke-sessions.ts, docker-compose.traefik.yml)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Une demande pose un instantané (D-04), déshumanise la surface (D-01/D-02), ligne « ancien membre » (D-03) | ✓ VERIFIED | 0167 + 0170 (re-validated by test-db run below); régression nulle (aucune migration appliquée réécrite) |
| 2 | Une seule demande active — garde index unique partiel EN BASE (D-06) | ✓ VERIFIED | inchangé, couvert par tests 0166 (régression : test-db 0170 vert) |
| 3 | L'annulation restaure nom/avatar de CHAQUE foyer depuis l'instantané par ligne (D-05, RGDP-02) | ✓ VERIFIED | **CR-02 fermé** : 0170 crée `private.account_deletion_restoration_members` (une ligne par household_members, FK member_row_id cascade, unique(user_id, member_row_id)) ; `request_account_deletion` snapshotte TOUTES les lignes `for update` (0170 l.147-191) ; `cancel_account_deletion` restaure ligne par ligne jointe sur `member_row_id` (0170 l.274-278). Prouvé par `sh scripts/test-db.sh 0170` → vert (exécuté par cette vérification, 3 foyers alpha/beta/gamma, avatars distincts dont un NULL porteur) |
| 4 | Sessions tuées immédiatement (RGDP-01) | ✓ VERIFIED | **CR-01 fermé, UAT G-27-4 fermé par retest humain (2026-08, preuve SQL `sessions_restantes = 0`, test UAT 4 pass)**. Contrat mis à jour par les correctifs 8bdb858..9c8dddd : (a) `revoke-sessions.ts` — import type préfixé `npm:@supabase/supabase-js@2` (l.1, le piège runtime : la résolution nue crashait le worker Deno au boot, test Vitest pourtant vert) ; scope `signOut(jwt, 'global')` en CHAÎNE (l.20) ; verdict honnête `{ revoked }` sur tout échec. (b) `index.ts` — `handleCompte` extrait le JWT de SESSION de l'appelant (`readBearerJwt`, header Authorization) et appelle le RPC via `rpcAsUser` : fetch DIRECT vers `http://rest:3000/rpc/request_account_deletion` avec `Authorization: Bearer <jwt utilisateur>` (l.134-162, 424-433) — la gateway api-gw rejette les JWT service (HS256/ES256 JWKS) sur /rest, seul le JWT utilisateur porte `auth.uid()` attendu par le RPC 0167 (42501). (c) `docker-compose.traefik.yml` l.71 : `SERVICE_ROLE_KEY_ASYMMETRIC` injecté dans l'env du service `functions` (clé pré-signée par add-new-auth-keys.sh ; note : plus aucun Edge du dépôt ne la lit aujourd'hui, l'appel final passe par le JWT utilisateur — injection défensive conservée pour le motif cron documenté, sans consommateurs, non bloquant). Contrat du helper prouvé par `npx vitest run revoke-sessions.test.ts` → **3/3 verts** re-exécuté le 2026-10-28, dont `expect(call).toEqual(['jwt-1', 'global'])`. Le kill réel GoTrue a été vérifié par l'humain (test UAT 4, G-27-4) |
| 5 | Audit FK vers auth.users consigné + purge sans cascade (RGDP-05) | ✓ VERIFIED | inchangé (0166, test §5) — régression nulle |
| 6 | Purge J+30 100 % SQL/pg_cron, zéro HTTP de purge (RGDP-04) | ✓ VERIFIED | inchangé (0168) — régression nulle ; 0170 ajoute seulement bucket_id au manifest (colonne + backfill + conflit élargi, l.304-393) |
| 7 | Enfants transférés/purgés (D-08), foyer orphelin supprimé (D-09) (RGDP-06) | ✓ VERIFIED | inchangé (0168, tests) — régression nulle |
| 8 | Alerte J-7 part exactement une fois (RGDP-03) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | flag avant POST = au plus une fois (motif inchangé) ; la livraison pg_net reste non exercée. WR-01 désormais traité honnêtement : contrat best-effort énoncé dans l'entête 0170 (« le flag rappel_envoye est posé AVANT net.http_post, un échec de livraison perd l'alerte ») + comment on function. Voir behavior_unverified_items |
| 9 | Edge unifiée deux modes, panneau admin foyer inchangé (D-10, RGDP-07) | ✓ VERIFIED | inchangé ; e2e 155 passed maintenu (27-05-SUMMARY). Le mode `compte` porte désormais le flux RPC corrigé G-27-4 : `rpcAsUser` (fetch direct rest:3000 + JWT utilisateur) — voir truth 4 ; le mode `foyer` et les actions cron (`secret`) n'ont pas changé de contrat |
| 10 | E-mail de confirmation avec lien d'annulation APP (RGDP-02, D-05) | ✓ VERIFIED | destinataire relu EN BASE `profiles.email` (index.ts l.402 confirmation, l.470 rappel J-7 — IN-01 fermé) ; libellé « Votre demande » (l.413, IN-03 fermé — grep « Sa demande » = 0 occurrence) |
| 11 | purge-medias borné au manifest + bucket exact (D-07/F6, WR-02) | ✓ VERIFIED | **WR-02 fermé** côté SQL : bucket_id porté et retourné par `public.deletion_media_claim` (0170 l.481-496) ; côté Edge : `handlePurgeMedias` supprime dans `admin.storage.from(row.bucket_id).remove([row.storage_path])` (index.ts l.528) — grep `for (const bucket of HOUSEHOLD_BUCKETS)` dans la purge compte = 0 |
| 12 | Panneau « Mes données (RGPD) » branché + honnête (WR-04, IN-02) | ✓ VERIFIED | gdpr-delete-panel.tsx l.76-85 : message conditionnel à `sessions_revoked` (« la déconnexion automatique a échoué : déconnectez-vous manuellement ») et à `email_sent` ; `email_error` jamais rendu au DOM. IN-02 fermé : gdpr-cancel-page.tsx l.55/91 (« nom, photo et accès retrouvés », « vous vous reconnectez ensuite ») — plus aucune promesse de restauration des sessions. Commentaire database.ts l.104-111 corrigé (WR-03) : « AUCUN sélecteur ne filtre account_deleted_today — marqueur d'audit, pas un filtre » |

**Score:** 11/12 truths verified (1 present, behavior-unverified)

### Automated Checks (executed by this verification — round 2, 2026-10-28)

Re-verification triggered by the 4 UAT fix commits `8bdb858..9c8dddd` touching `household-delete/{index.ts,revoke-sessions.ts}` and `docker-compose.traefik.yml` (motifs dans 27-UAT.md G-27-4). Fichiers inchangés par ces commits (0166-0170, gdpr-delete-panel.tsx, gdpr-cancel-page.tsx, database.ts, revoke-sessions.test.ts) : preuves antérieures conservées telles quelles.

| Check | Command | Result |
|-------|---------|--------|
| Import `npm:` (piège runtime Deno, 8bdb858) | `grep npm: revoke-sessions.ts index.ts` | `npm:@supabase/supabase-js@2` (revoke-sessions.ts l.1, index.ts l.56), `npm:zod`, `npm:nodemailer` — aucune résolution nue |
| RPC mode `compte` par JWT utilisateur (9c8dddd) | lecture `index.ts` l.134-162, 424-433 | `rpcAsUser` : fetch direct `http://rest:3000/rpc/request_account_deletion`, `Authorization: Bearer <jwt session appelant>` ; 401 si Bearer absent |
| Scope chaîne + verdict honnête (CR-01) | `npx vitest run revoke-sessions.test.ts` | **3/3 verts** (re-exécuté le 2026-10-28), dont `toEqual(['jwt-1', 'global'])` |
| Injection `SERVICE_ROLE_KEY_ASYMMETRIC` | `grep` compose.traefik.yml | présente (l.71, service `functions`, défaut `${...:-}`) — ℹ️ aucun Edge ne la lit aujourd'hui (l'appel final passe par le JWT utilisateur) ; injection défensive, non bloquante |
| Contrat panneau WR-04 | `grep sessions_revoked gdpr-delete-panel.tsx` | l.70-80 : message conditionnel à `sessions_revoked` — inchangé par les commits, preuve antérieure maintenue |
| Arbre de travail propre | `git status --porcelain` sur les 3 fichiers | vide — les fichiers vérifiés sont exactement ceux des commits |

## Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| RGDP-01 | ✓ SATISFIED | signOut scope chaîne + verdict honnête (CR-01 fermé) ; déshumanisation 0167/0170 |
| RGDP-02 | ✓ SATISFIED | réversibilité multi-foyer prouvée par test 0170 (CR-02 fermé) ; e-mail confirmation + page annulation |
| RGDP-03 | ⚠️ SATISFIED (best-effort assumé) | e-mail J-7 câblé ; contrat best-effort énoncé honnêtement (WR-01 dispositionné) ; livraison non exercée (behavior_unverified) |
| RGDP-04 | ✓ SATISFIED | purge 100 % SQL/pg_cron, manifest à la demande avec bucket_id (WR-02 fermé) |
| RGDP-05 | ✓ SATISFIED | audit FK 0166, conversions set null vers l'avant, aucune cascade de données partagées |
| RGDP-06 | ✓ SATISFIED | enfants purgés avec le foyer orphelin ou transférés (D-08), tests 0168 |
| RGDP-07 | ✓ SATISFIED | Edge unifiée mode foyer/compte, panneau admin inchangé, e2e baseline maintenue |

## Human Verification Required

Mise à jour round 2 (2026-10-28) : l'item 1 (kill GoTrue réel) est **résolu** — retest humain après les correctifs 8bdb858..9c8dddd, preuve SQL `sessions_restantes = 0` (27-UAT.md G-27-4, test UAT 4 pass) ; le parcours visuel (item 3) est couvert par les tests UAT 2 et 3 (pass). Restent les items reportés en phase 28 à la demande de l'utilisateur (2026-10-28, tracés dans ROADMAP §Phase 28).

1. **Livraison SMTP réelle (IN-01/IN-03, RGDP-03) — reporté phase 28 (test UAT 7)**
   **Test:** Vérifier l'arrivée des e-mails (confirmation avec lien d'annulation, alerte J-7) sur le SMTP de prod du serveur docker.
   **Expected:** E-mails reçus au bon destinataire (profiles.email), lien d'annulation ouvrant la page de l'app ; alerte J-7 reçue une seule fois.
   **Why human:** SMTP/pg_net hors frontière test-db.sh ; le SMTP réel du serveur est le lieu d'exécution naturel (phase 28).
2. **Annulation multi-foyer — reporté phase 28 (test UAT 5)**
   **Test:** Pour un compte membre de plusieurs foyers, confirmer l'annulation : nom/photo restaurés dans CHAQUE foyer (dont avatar NULL qui revient NULL), page sans promesse de restauration de sessions.
   **Expected:** Restauration exacte ligne par ligne (contrat prouvé par test-db 0170 vert) ; rendu visuel de la page d'annulation conforme.
   **Why human:** Parcours utilisateur réel depuis le lien e-mail, rendu visuel.
3. **Données partagées intactes après suppression — reporté phase 28 (test UAT 6)**
   **Test:** Supprimer un compte membre ; vérifier que les données partagées du foyer survivent (tâches, courses, notes créées par lui restent) et que seules ses données personnelles disparaissent.
   **Expected:** Couvert automatiquement par D1/D2 (A1-A4 pass), mais constat humain sur l'app restant.
   **Why human:** Constat visuel sur données réelles.

## Gaps Summary

Aucun gap restant : les 2 CRITICAL (CR-01, CR-02) sont fermés et prouvés par des tests ré-exécutés (vitest, test-db 0170 vert sur le conteneur db), les 4 WARNING et 3 INFO sont traités (code, libellés, commentaires véridiques). IN-04 a été dispositionné skipped-cosmétique (27-05-SUMMARY) — non bloquant. Round 2 (2026-10-28) : les 4 correctifs UAT G-27-4 (8bdb858..9c8dddd) sont re-vérifiés sur pièce — RPC appelé par fetch direct `http://rest:3000/rpc/…` avec le JWT de session de l'appelant (l'appelant porte `auth.uid()`, la gateway rejette les JWT service), import `npm:` rétabli dans revoke-sessions (piège import-map du runtime), `SERVICE_ROLE_KEY_ASYMMETRIC` injectée dans l'env `functions` (défensive, sans lecteur actuel), `npx vitest run revoke-sessions.test.ts` 3/3 verts. Le kill GoTrue réel a été vérifié par l'humain (sessions_restantes = 0). Le statut reste `human_needed` uniquement pour les tests UAT 5, 6 et 7, reportés en phase 28 à la demande de l'utilisateur (tracés dans ROADMAP §Phase 28), plus la livraison pg_net J-7 (contrat best-effort documenté, behavior_unverified).

---

_Verified: 2026-10-28T16:15:00Z_
_Verifier: the agent (gsd-verifier)_
