---
status: deferred_tests_to_phase_28
phase: 27-suppression-de-compte-rgpd
source: [27-01-SUMMARY.md, 27-02-SUMMARY.md, 27-03-SUMMARY.md, 27-04-SUMMARY.md, 27-05-SUMMARY.md]
started: 2026-10-27T17:10:00Z
updated: 2026-10-28T00:00:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: —
name: UAT 27 clôturée — 5/5 tests exécutés passés (1,2,3,4,5-ancien-8) + D1-D4 ; tests d'annulation/données/e-mail J-7 TRANSFÉRÉS en phase 28 (tracés dans ROADMAP §Phase 28)
expected: |
  Décision utilisateur du 2026-10-28 : les tests 5 (annulation multi-foyer),
  6 (données partagées) et 7 (e-mail J-7 SMTP réel) sont passés à la phase 28
  (exploitation/restauration), où le SMTP réel du serveur docker est le lieu
  d'exécution naturel. La phase 27 peut être clôturée sur cette base.
awaiting: phase closure

## Tests

### 1. Démarrage à froid après les migrations RGPD
expected: La stack redémarre proprement avec la migration 0170 appliquée : l'app se charge, la connexion fonctionne, une requête basique (tableau de bord) renvoie des données vivantes.
result: pass

### 2. Panneau « Mes données (RGPD) » dans Paramètres
expected: Dans Paramètres, le panneau RGPD propose l'export des données et la suppression du compte ; la demande de suppression affiche un avertissement clair (délai J+30, sessions coupées, restauration nom/photo possible via le lien d'annulation).
result: pass

### 3. Demande de suppression : déshumanisation + message honnête
expected: Après confirmation de la demande, le nom/photo du membre disparaissent des espaces du foyer (affichés comme compte supprimé) ; le panneau n'affiche « sessions coupées » QUE si sessions_revoked est vrai, n'affiche jamais email_error brut, et ne promet jamais de « restauration des sessions ».
result: pass

### 4. Sessions réellement révoquées (GoTrue)
expected: Dans Studio (auth.sessions / table des sessions), les sessions de l'utilisateur qui a demandé la suppression sont réellement révoquées après la demande — pas seulement côté client.
result: pass
resolved: 2026-10-28 — retest humain après la chaîne de correctifs 8bdb858/efaed47/9b29689/9c8dddd : panneau succès, déconnexion immédiate, preuve SQL sessions_restantes = 0 (voir G-27-4).
originally: "Session encore vivante dans auth.sessions (not_after NULL, updated_at 08:19) après la demande de suppression — le kill global GoTrue n'a pas touché cette session."




### 5. Relecture : commentaires véridiques (WR-01/WR-03)
expected: Relecture des commentaires posés par 0170 et du doc-comment database.ts : le contrat best-effort du rappel J-7 (échec de livraison = alerte perdue) et l'absence de filtre account_deleted_at dans les sélecteurs sont énoncés honnêtement (jugement de relecture, disposition 27-REVIEW-DISPOSITION §WR-01/WR-03).
result: pass
source: human (agent relecture, 2026-10-28) — les trois affirmations vérifiées contre le dépôt :
  WR-01 : 0170 comment on private.post_account_deletion_http énonce le best-effort
  (flag posé AVANT net.http_post, échec = alerte perdue, redrive sans retry) ;
  WR-03 : comment on column household_members.account_deleted_at énonce
  « AUCUN sélecteur ne filtre » et database.ts (l.109-113) le répète — grep
  code confirme zéro usage d'account_deleted_at hors app/src/types/database.ts ;
  le contraste deleted_at (filtré là où les sélecteurs d'enfants le font) est
  énoncé dans les deux commentaires. Véridiques.

**Coverage auto-passed (automated, #1602) :**

### A1. Purge J+30 100 % SQL (D1)
expected: Données partagées intactes quand d'autres adultes restent, enfants transférés (D-08), demande purgée + compte supprimé.
result: pass
source: automated
coverage_id: D1

### A2. Foyer orphelin supprimé avec manifest médias (D2)
expected: Manifest construit AVANT suppression ; foyers conservés n'y génèrent aucune ligne ; objets Storage jamais touchés par le SQL.
result: pass
source: automated
coverage_id: D2

### A3. Alerte J-7 idempotente (D3)
expected: Le flag rappel_envoye n'est posé que derrière un POST partant ; seconde exécution sans nouveau POST.
result: pass
source: automated
coverage_id: D3

### A4. Négatifs purge + privilèges (D4)
expected: Demande annulée ou pas encore due jamais purgée ; execute réservé à service_role.
result: pass
source: automated
coverage_id: D4

## Summary

total: 8
passed: 3
issues: 1
pending: 3
skipped: 0

## Gaps

- gap_id: G-27-3
  truth: "La demande de suppression enregistre la demande ET réussit la coupure des sessions + l'e-mail de confirmation, sans erreur visible."
  status: resolved
  reason: "User reported: Demande enregistrée, mais l'e-mail et la coupure des sessions ont échoué : Foyer visé incomplet."
  severity: major
  test: 3
  resolved_by: Edge Functions périmées — deploy-functions.sh copie sans recréer le runtime ; run.sh recreate functions a chargé le code 27-05. Retesté OK le 2026-10-28.
  resolved_at: 2026-10-28
  artifacts: []
  missing: []

- gap_id: G-27-4
  truth: "Le kill global des sessions (signOut scope 'global') révoque réellement les sessions GoTrue : auth.sessions ne contient plus de session active pour l'utilisateur demandeur."
  status: passed
  reason: >-
    Résolu le 2026-10-28 après une chaîne de quatre défauts distincts (tous
    franchis par les tests unitaires, tous côté « frontière du conteneur »,
    §2.7C) : (1) import nu '@supabase/supabase-js' crashant le worker au boot
    (8bdb858) ; (2) JWT utilisateur HS256 legacy sans kid rejeté par
    withSupabase auth 'user' — résolu par la migration signing keys ES256 ;
    (3) la gateway api-gw rejette en 401 tout JWT sur /rest et PostgREST
    interne écoute à la racine (supabase-js construisait /rest/v1 → PGRST125)
    — rpcAsUser poste le JWT de session de l'appelant en fetch direct sur
    rest:3000 ; (4) le RPC 0167 exige auth.uid() = p_user_id : un JWT service
    était condamné par conception (9c8dddd). Retest humain : panneau succès,
    déconnexion immédiate, preuve psql sessions_restantes = 0 (collée le
    2026-10-28).
  severity: major
  test: 4
  artifacts: []
  missing: []
