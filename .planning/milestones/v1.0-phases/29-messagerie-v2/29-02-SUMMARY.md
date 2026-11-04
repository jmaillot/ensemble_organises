---
phase: 29
plan: 02
subsystem: messagerie-push
tags: [sql, edge-functions, web-push, notifications]
requires: [0042_message_notifications, 0130_fix_dispatch_messages, 0131_member_archive, 0164_gdpr_push_export]
provides: [push_message_notifications_grouped, consume_push_reminders_by_list, reminder_ids_payload]
affects: [push-notify, test-dispatch-push.sh, eo-push-messages]
tech-stack:
  added: []
  patterns: [groupement-cote-dispatch-sans-etat, consommation-par-liste, correction-vers-lavant]
key-files:
  created:
    - supabase/migrations/0172_grouped_message_push.sql
    - supabase/tests/0172_grouped_push.test.sql
  modified:
    - supabase/functions/push-notify/index.ts
    - scripts/test-dispatch-push.sh
    - supabase/tests/0039_leave_read_delete.sql
    - supabase/tests/0044_membership_periods.sql
decisions:
  - "reminder_id scalaire conservé (= dernier id de file du groupe) pour compatibilité Edge, reminder_ids porte le groupe entier"
  - "titre : « N nouveau(x) message(s) de {prénom} » en directe, « … dans {titre du fil} » en groupe ; corps : gabarit prénoms / titre du fil — jamais le contenu (T-29-04)"
  - "l'expéditeur affiché est celui du DERNIER message du groupe (array_agg ordonné desc), pas un max alphabétique"
  - "auteur exclu par membre (cm.member_id is distinct from msg.sender_id) : robuste aux lignes système et aux expéditeurs sans compte"
metrics:
  duration: ~75 min
  completed: 2026-10-29
  tasks: 2
  commits: 2
  plan_head_before: 661a87d
  plan_head_after: 7bd2a4b
status: complete
---

# Phase 29 Plan 02: Push groupés par conversation, sans contenu Summary

**One-liner:** Dispatch push groupé par conversation (D-06/D-07) via migration 0172 — compteur « N nouveaux messages » au titre, reminder_ids par groupe, contenu de message banni du titre et du corps (fuite 0042 corrigée vers l'avant), Edge push-notify consommant par liste, preuve attribuable étendue dans test-dispatch-push.sh.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Migration 0172 — dispatch groupé sans contenu | 1db7d28 | supabase/migrations/0172_grouped_message_push.sql, supabase/tests/0172_grouped_push.test.sql, supabase/tests/0039_leave_read_delete.sql, supabase/tests/0044_membership_periods.sql |
| 2 | Edge push-notify (ids par groupe) + preuve attribuable | 7bd2a4b | supabase/functions/push-notify/index.ts, scripts/test-dispatch-push.sh |

## What Was Built

- **`private.push_message_notifications` (0172)** : GROUP BY (destinataire, conversation) sur la file `message_notifications` — la file EST la fenêtre d'accumulation, aucun état serveur nouveau (D-07). Une ligne par groupe : `count(*)` au titre (« 1 nouveau message » / « N nouveaux messages »), `reminder_ids` = ids de file du groupe, `reminder_id` scalaire = dernier id (compatibilité Edge antérieure). Directe : titre « N nouveau(x) message(s) de {prénom} », corps « Conversation avec {prénoms des autres} » (gabarit conversation-list). Groupe : titre « N nouveau(x) message(s) dans {titre du fil} » (titre de fil autorisé, contenu interdit). Participants actifs non archivés (`left_at is null`, `archived_at is null` — 0131 rétabli), auteur exclu par membre, fenêtre 24 h inchangée, tag OS `message-<conversation_id>` inchangé (D-06).
- **`due_push_notifications`** : colonne `reminder_ids` (jsonb) ajoutée au recordset et au jsonb de sortie pour le scope messages ; scopes rappels/anniversaires/export/test inchangés (A4). La branche `export` de 0164 est conservée.
- **`consume_push_reminders`** : accepte `{kind:'message', ids:[...]}` (le groupe entier se vide d'un coup) et conserve le scalaire `{kind, id}` pour tous les autres kinds ; id absent = no-op compté ; branche `export` de 0164 (bascule `notified_push`) conservée dans les deux formes.
- **Edge `push-notify`** : pour les notifications `message-`, pousse `{kind, ids: reminder_ids}` quand la liste est présente, sinon le scalaire — consommation toujours subordonnée à `sent > 0` (un groupe livré au moins une fois est consommé en entier). Chiffrement VAPID inchangé.
- **`test-dispatch-push.sh` étendu** : sème 3 messages dans une conversation dédiée pour le membre abonné (expéditeur = ligne membre sans compte), prouve le payload DANS `due_push_notifications` filtrée par tag (attribuable à la semure : compteur exact « 3 nouveaux messages de Semure », gabarit prénoms au corps, marque de contenu `MARQUEPUSH-<run>` absente du titre ET du corps, reminder_ids=3), puis dispatch `dispatch_message_notifications` avec fenêtre `net._http_response` propre (max(id) avant l'appel) : 200, consumed ≥ 3, file vidée pour la conversation semée ; nettoyage déclaré et vérifié.
- **Nouveau test SQL `0172_grouped_push.test.sql`** : 3 messages + 1 message dans deux fils → 2 notifications ; compteur/singuliers ; marques de contenu semées absentes ; reminder_ids=3 ; consommation par liste, re-consommation = no-op, kind inconnu ignoré, scalaire toujours valide.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Définitions obsolètes recopiées dans 0172**
- **Found during:** Task 1 (test-db.sh, 5 fichiers en échec)
- **Issue:** le plan renvoyait à 0042 comme définition de référence, mais la définition effective portait les retouches 0131 (filtre `archived_at is null`) et 0164 (scope `export` dans `due_push_notifications` + branche `notified_push` dans `consume_push_reminders`). La première version de 0172 les perdait.
- **Fix:** les trois éléments rétablis dans 0172 et réappliqués ; vérifiés par `pg_get_functiondef` puis par la chaîne de tests.
- **Files modified:** supabase/migrations/0172_grouped_message_push.sql
- **Commit:** 1db7d28

**2. [Rule 3 - Blocking] `create or replace` refusé sur row type modifié**
- **Found during:** Task 1 (migrate.sh)
- **Issue:** la colonne `reminder_ids` change le type de retour de `push_message_notifications` ; PostgreSQL refuse `create or replace` sur un row type différent.
- **Fix:** `drop function if exists` avant recréation dans 0172 (fonction `private`, seule `due_push_notifications` l'appelle, recréée dans la même transaction — correction reste vers l'avant).
- **Commit:** 1db7d28

**3. [Rule 1 - Bug] Tests 0039/0044 : jointure ventilateur sur le scalaire**
- **Found during:** Task 1
- **Issue:** trois assertions joignaient `mn.id = n.reminder_id` (une ligne par message) ; le contrat 0172 est une ligne par groupe.
- **Fix:** jointure par `n.reminder_ids ? mn.id`, avec commentaire nommant 0172 ; la sémantique visée (actif visé, tombé ignoré, ré-ajouté notifié) reste exactement celle des tests.
- **Commit:** 1db7d28

**4. [Rule 3 - Blocking] Fonctions 0171 absentes de la base malgré le registre**
- **Found during:** Task 1 (test 0171 en échec à l'arrivée)
- **Issue:** `schema_migrations` enregistrait 0171 mais `public.open_direct_conversation` n'existait pas (dérive préexistante au plan, non provoquée par 0172).
- **Fix:** fichier 0171 réappliqué localement via `psql.sh` (idempotent, aucune réécriture de migration) ; test 0171 repassé vert. Cause de la dérive consignée dans deferred-items.md.
- **Commit:** 1db7d28 (aucun changement de fichier — intervention d'environnement)

## Verification

- `python3 scripts/check-sql-statique.py` : **vert** (226 fonctions effectives, aucun défaut) ; `test-check-sql-statique.py` : 6 cas verts.
- `sh scripts/migrate.sh` : 0172 appliquée.
- `sh scripts/test-db.sh` : **100/101** — seul échec restant : 0147 (préexistant, documenté en deferred-items depuis 29-01, hors périmètre).
- `cd app && npm run typecheck && npm test && npm run build` : typecheck vert, **1647 tests verts (204 fichiers)**, build produit `dist/`.
- `sh scripts/deploy-functions.sh` + `run.sh recreate functions` : Edge redéployée.
- `sh -n scripts/test-dispatch-push.sh` : syntaxe OK ; exécution réelle : **arrêt explicite à la porte abonnement — AUCUN appareil abonné sur cette instance** (0 endpoint non factice). Ce tronçon (Edge → service Push → compteur sur l'appareil) n'est PAS prouvé sur cette machine ; la preuve SQL du payload groupé est verte (test 0172 + lecture `due_push_notifications` encadrée par le script). À rejouer sur une machine avec appareil abonné — son absence est déclarée ici, pas passée sous silence (§2.7).

## Known Stubs

None. Aucun comportement simulé : la seule lacune est l'exécution physique de `test-dispatch-push.sh` sans appareil abonné, documentée ci-dessus et dans deferred-items.md.

## Decisions Made

- `reminder_id` scalaire conservé (dernier id de file du groupe) pour compatibilité Edge antérieure ; `reminder_ids` porte le groupe.
- Titre/corps arbitragés selon la lecture la plus défendable de l'Open Question 2 : le compteur est toujours au titre (directe « de {prénom} », groupe « dans {titre du fil} ») et le corps complète (gabarit prénoms / titre du fil) — le contenu d'un message n'apparaît nulle part.
- L'expéditeur affiché est celui du dernier message du groupe (ordré par date), pas un `max()` alphabétique.
