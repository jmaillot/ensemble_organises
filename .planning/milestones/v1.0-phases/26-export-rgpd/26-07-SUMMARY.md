---
phase: 26-export-rgpd
plan: "07"
subsystem: verification
tags: [gdpr, rgpd, barriere, verification, uat, rgex]

requires:
  - phase: 26-export-rgpd
    plan: "02"
    provides: "Migration 0158/0159/0160 + tests 0158 : bucket scellé, machine à états, RPC bornée, cron"
  - phase: 26-export-rgpd
    plan: "03"
    provides: "Edge gdpr-export-run multipasse (0161-0163) : en_attente → pret, ZIP streaming"
  - phase: 26-export-rgpd
    plan: "04"
    provides: "Edge gdpr-export-purge : purge 7 j + audit"
  - phase: 26-export-rgpd
    plan: "05"
    provides: "Panneau frontend (RGEX-01/02 côté produit)"
  - phase: 26-export-rgpd
    plan: "06"
    provides: "Notification push d'achèvement (0164)"

provides:
  - "Registre des preuves consolidé de la phase 26 (matière première de l'UAT end-of-phase et de la porte 31)"
  - "Chaîne §2.7 verte complète sur l'arbre final — nouvelle baseline du dépôt : 94 tests SQL, 1636 unitaires / 202 fichiers, e2e 155/155 (+7 skips viewport conditionnels)"
  - "Preuve réseau (1) export réel : ZIP conforme au périmètre tranché, exclusion cross-membre prouvée, média valide, lien signé 86400 s"
  - "Preuve réseau (2) purge : 24 objets supprimés, partial:false, audit removed=t par chemin"

affects: [verify-work end-of-phase, porte 31 (OUV-07), phase 27 (suppression)]

actuals:
  tokens: 30000
  tasks: 3
  commits: 0

tech-stack:
  added: []
  patterns:
    - "Barrière de clôture sur le modèle 25-04 : chaque commande citée avec son résultat (§2.7F/G), toute absence déclarée nommément"
    - "Preuve réseau en session authenticated réelle (request.jwt.claims) — jamais un pari de configuration"

key-files:
  created:
    - .planning/phases/26-export-rgpd/26-07-SUMMARY.md
  modified: []

decisions:
  - "Tasks 1-2 sans commit : la campagne SQL et la chaîne app sont des étapes de VÉRIFICATION — aucun delta de code produit (aucun fichier suivi modifié)"
  - "Fixture d'essai corrigé (note_attachments.file_url SANS préfixe bucket, convention 26-03) : le premier export a révélé un chemin média doublé dans le manifeste — cause le fixture, pas le produit (extracteur 0161 préfixe household-media/)"
  - "Purge prouvée sur les jobs d'essai terminaux 26-03 (f5ab3904, 6bc942b2) : leurs octets sont morts, leurs lignes d'audit restent (FK on delete set null)"

metrics:
  duration: ~45 min
  completed: 2026-10-27
status: complete
plan_head_before: fef8169
plan_head_after: fef8169
commits: 0
---

# Phase 26 Plan 07: Barrière [BLOCKING] — chaîne §2.7 verte + preuves réseau Summary

**One-liner:** La chaîne de vérification complète du dépôt (AGENTS.md §2.7) est verte sur l'arbre final de la phase 26 — 94 tests SQL, typecheck, 1636 unitaires, build, e2e 155/155 — et les preuves réseau RGPD sont produites sur la stack : export réel conforme (ZIP vérifié contre le tranchement, exclusion cross-membre prouvée, média PNG valide, lien signé 24 h), purge observée avec audit en base ; la livraison push reste déclarée absente (0 abonnement réel) et reprend à la phase 31.

## Ce qui a été fait

### Task 1 — Campagne SQL complète [BLOCKING] (chaîne §2.7, dans cet ordre)

| Étape | Commande | Résultat |
|---|---|---|
| Contrôle statique SQL | `python3 scripts/check-sql-statique.py` | Vert — « 216 fonction(s) effective(s) sur 164 migration(s) et 96 test(s), aucun défaut » ; définitions dépassées signalées sans effet (0019) et motif DML→ALTER exempté connu (0039), sans conclusion du contrôle |
| Ses cas qui doivent échouer | `python3 scripts/test-check-sql-statique.py` | **6 cas, tous verts** (cas sain, réel, tag nommé jamais fermé, littéral ouvert, corps jamais fermé, guillemet mal placé) |
| Migrations | `sh scripts/migrate.sh` | « Toutes les migrations sont déjà appliquées » — 0158, 0159, 0160, 0161, 0162, 0163, 0164 incluses, aucune pendante |
| Suite SQL complète | `sh scripts/test-db.sh` | **94 fichiers, tous verts, exit 0** — 0158, 0161 et 0164 incluses dans le total, baseline 25 maintenue |

Aucun échec à corriger : aucune migration réécrite, aucun test assoupli (§2.7A).

### Task 2 — Chaîne app complète [BLOCKING]

| Étape | Commande | Résultat |
|---|---|---|
| Typecheck | `cd app && npm run typecheck` | Vert, exit 0 |
| Tests unitaires | `cd app && npm test` | **202 fichiers, 1636 tests, tous passés** (baseline 1628 → +8 tests du panneau RGPD 26-05) — durée 188,85 s |
| Build | `cd app && npm run build` | Vert — PWA injectManifest, précache 138 entrées (2674,78 KiB), `dist/sw.js` généré |
| E2E | `cd app && npm run test:e2e` | **155 passed, 7 skipped, exit 0** (3,1 min) |

Les 7 skips sont les skips conditionnels de viewport connus (`critical-paths.spec.ts` : raccourci clavier/tiroir/barre basse/poignées/curseur — « mobile uniquement » ou « bureau uniquement ») : jamais un test RGPD, jamais un test sauté par convenance.

Nouvelle baseline consignée : **1636 unitaires, e2e 155/155 (+7 skips viewport)** — reprend la baseline autoritaire de ROADMAP 25-08 (155) et l'état 26-06 (1632 unitaires intermédiaires).

Aucune réécriture de test : aucun test obsolète par rapport aux vérités 0145/0158 n'est apparu dans cette campagne (les réécritures post-0145 ont été faites et prouvées à 25-04).

### Task 3 — Preuves réseau bout-en-bout (produites par l'exécutant, jugement humain demandé)

#### Preuve (1) — Export réel de bout en bout [RGEX-01, RGEX-02, RGEX-03 côté produit]

Compte réel de la stack : `camille@test.local` (uid `05861440-dfed-4fa5-b8ad-32da4f318002`, admin du foyer `household_a095bbf3…`, Foyer Martin test). Données de vérification semées AVANT le déclenchement :

- Tâche camille `task_98839864…` « Tâche export e2e 26-07 » (marque AAAA)
- Note camille `note_b51e0d3d…` « Note export e2e 26-07 » + pièce jointe `test-export-e2e-26-07.png` (PNG 1×1 uploadé via l'API Storage, octets intacts)
- Tâche thomas `task_4bf77159…` « Tache thomas NE DOIT PAS appaitre 26-07 » (contrôle d'exclusion cross-membre)

Déroulé observé :

1. `select public.request_gdpr_export()` en session `authenticated` réelle (jwt claims camille) → job **3bf17b27-9636-494f-9d62-1a92d1559c28**, `en_attente`, `expires_at 2026-11-03` (7 jours, D-06)
2. Le cron minute `eo-gdpr-export-run` a éveillé la Edge : `en_attente → en_cours (passe 1, extraction) → pret (passe 2, assemblage)` en **~5 min** — pilotage 100 % cron, aucun appel manuel (log Edge : `gdpr-export-run` servi, passes extraction/assemblage HTTP 200 : `batches:9, media_copied:2, media_skipped:0`)
3. `storage_path = 05861440…/3bf17b27….zip` (chemin scellé 0158)
4. URL signée `POST /storage/v1/object/sign/gdpr-exports/…` avec **expiresIn=86400** (24 h, borne max RGEX-02) → téléchargement réel via le lien signé : ZIP de 2 977 octets
5. **Vérification du contenu contre le tranchement 26-01** :
   - `donnees-rgpd.json` : enveloppe `{"exporte_le", "modules"}`, **22 modules** dans l'ordre nominal
   - La tâche « Tâche export e2e 26-07 » et la note « Note export e2e 26-07 » sont présentes ; le demandeur (`camille@test.local`, uid 05861440…) apparaît dans `profiles`
   - **Exclusion cross-membre prouvée** : la marque « NE DOIT PAS » de thomas est ABSENTE de toute l'archive (la seule occurrence « Thomas » est un contact de camille — donnée légitimement sienne)
   - **Médias présents et lisibles** : 2 entrées `medias/household-media/…/notes/test-export-e2e-26-07.png` (signature PNG `\x89PNG` valide, 69 octets intacts) et `test-export-e2e.png` (26-03)
   - Rien d'un autre foyer : la donnée de thomas hors du périmètre n'est pas dans le ZIP
6. Le panneau (26-05) expose les 3 états + durée et le téléchargement au clic (`createSignedUrl` 86400 s côté navigateur) — la chaîne humaine RGEX-01 est complète ; la notification push, elle, est traitée ci-dessous

**Écart intermédiaire consigné (§2.7F, jamais tu) :** le premier job déclenché (ea48dc8b) a produit un ZIP dont le média 26-07 était ABSENT — le manifeste contenait `household-media/household-media/…` (chemin doublé). Cause : mon fixture d'essai avait écrit `note_attachments.file_url` AVEC préfixe bucket, alors que la convention du dépôt (ligne 26-03, et l'extracteur 0161 qui préfixe `household-media/`) stocke le chemin SANS le bucket. Fixture corrigé (UPDATE de la ligne d'essai), produit inchangé, export relancé → conforme ci-dessus. Observation notée au STATE (blockers) pour re-diligence en 27.

#### Preuve (2) — Purge visible avec audit en base [RGEX-04]

- `expires_at` forcé dans le passé (`now() - 1 h`) sur les deux jobs d'essai terminaux de 26-03 (f5ab3904 `echec`, 6bc942b2 `pret`) → 24 objets candidats en base (`storage.objects`, bucket `gdpr-exports` : staging parts/manifest/medias + 2 zip)
- `select private.dispatch_gdpr_export_purge();` → `{"action":"purge","dispatched":true}`
- Edge `gdpr-export-purge` réellement servie (log `serving the request with …/gdpr-export-purge`), réponse `net._http_response` id 32 : **`{"purged_jobs":2,"removed_count":24,"partial":false}`**
- **Objets disparus** : recomptage `storage.objects` sur les préfixes des deux jobs → **0 ligne** (les octets disque sont morts via l'API Storage, jamais un DELETE SQL)
- **Audit en base cité** : 24 lignes `gdpr_export_purge_log` nouvelles, toutes `removed=t`, sans erreur — exemples de chemins+horodatage : `05861440…/6bc942b2….zip` et `05861440…/f5ab3904….zip`, purge du 2026-10-27 ~10:57-10:58 UTC. La preuve RGEX-04 vit en base (cron + audit), pas dans une promesse de configuration
- Observation honnête : un PREMIER dispatch (10:54:58) a répondu `dispatched:true` sans que la requête n'atteigne la Edge (aucun log serving, aucune ligne `_http_response`) ; le second dispatch a servi normalement. Cohérent avec la philosophie retry-du-cron-quotidien (26-04) ; consigné au STATE comme observation à surveiller en 27/28 — jamais une perte silencieuse.

#### Preuve (3) — test-dispatch-push.sh : ABSENCE DÉCLARÉE (reprise 31)

- `sh scripts/test-dispatch-push.sh` relancé ce jour → « aucun abonnement de push réel sur cette instance » (`public.push_subscriptions` = 0 ligne), le script refuse lui-même un endpoint factice qui produirait `dropped` et non `delivered` — un chiffre juste et une preuve fausse
- La chaîne SQL du rappel est elle prouvée : `public.due_push_notifications('export')` retourne **1** pour le job 3bf17b27 (la notification est DUE), `notified_push = false` (correct : jamais un marquage anticipé, A5/26-06 — elle basculera à la première distribution réelle)
- **Statut : « déclaré, à reprendre en 31 »** (preuve SMTP/push de la porte OUV-07), comme prévu au plan et comme à 26-06. Rien n'est passé sous silence (§2.7).

## Validation humaine (checkpoint Task 3) — APPROUVÉE

**Décision de l'utilisateur : « approved »** (2026-10-27) — les preuves de la barrière finale sont acceptées :

- [x] Archive reçue conforme au périmètre tranché — export conforme à la portée A (« Ce qui me concerne », 22 modules), exclusion cross-membre prouvée (marque « NE DOIT PAS » de thomas absente de l'archive)
- [x] Purge observée avec ses lignes d'audit en base — RGEX-04 prouvé en base (24 lignes `gdpr_export_purge_log`, `removed=t`, `partial:false`)
- [x] Push : absence déclarée acceptée nommément (0 abonnement réel sur l'instance, reprise phase 31 — preuve SMTP/push de la porte OUV-07)

La phase 26 (Export RGPD) est clôturée par cette acceptation.

## Deviations from Plan

1. **[Rule 1 - Fixture] note_attachments.file_url mal préfixé par mon essai** — le premier export (ea48dc8b) a révélé un chemin média doublé dans le manifeste (`household-media/household-media/…`) : mon fixture d'essai avait écrit le chemin AVEC le préfixe bucket, la convention du dépôt (26-03, extracteur 0161) le stocke sans. Fixture corrigé, export relancé, conforme. Produit inchangé — aucun commit (données de stack, pas du code).
2. **Tasks 1-2 sans commit** — ce sont des tâches de VÉRIFICATION de la barrière : aucun fichier suivi modifié (le plan ne liste que le SUMMARY, gitignore volontairement). Commits : 0, conformes au `files_modified: []` du frontmatter.
3. **Purge menée sur les jobs d'essai 26-03 (f5ab3904/6bc942b2)** — le premier job de 26-07 destiné à la purge (fdd07c02) avait été créé dans une transaction rollbackée (erreur de session psql, `begin` sans commit) ; relance hors transaction correcte. Les jobs purgés sont terminaux et d'essai ; leurs audits restent.

## Auth Gates

Aucun — stack locale, secrets dans Vault (§2.7H), aucune clé manipulée en ligne de commande.

## Known Stubs

Aucun. L'absence de livraison push est une ABSENCE DÉCLARÉE (0 abonnement réel sur l'instance), pas un stub : la chaîne SQL complète est prouvée (0164) et la reprise est planifiée (31).

## Threat Flags

Aucune surface de sécurité nouvelle : cette barrière n'a créé aucun endpoint, aucune migration, aucune fonction. Menaces du plan : T-26-21 (preuve étouffée) atténué par ce registre intégral ; T-26-22 (contenu vérifié à moitié) atténué — la vérification couvre l'exclusion cross-membre (marque thomas) ET la présence (tâche/note/média camille), les deux côtés du tranchement 26-01 ; T-26-SC inchangé (aucune installation nouvelle).

## Self-Check: PASSED

- [x] Chaîne §2.7 exécutée dans l'ordre, chaque commande citée avec son exit (Task 1 : 4/4 verts ; Task 2 : 4/4 verts)
- [x] Export réel prouvé : job 3bf17b27 `pret`, ZIP téléchargé via lien signé 86400 s, 22 modules, exclusion cross-membre vérifiée, PNG valide
- [x] Purge prouvée : id 32 `_http_response` 200 `{"purged_jobs":2,"removed_count":24,"partial":false}`, 0 objet restant, 24 lignes d'audit `removed=t`
- [x] test-dispatch-push.sh : absence déclarée nommément (0 abonnement, reprise 31)
- [x] STATE.md/ROADMAP.md mis à jour puis clôturés (checkpoint « approved » le 2026-10-27)
- [x] Commits attendus pour ce plan : 0 (tâches de vérification, `files_modified: []`) — vérifié `git status` propre sur les fichiers suivis

---
*Phase: 26-export-rgpd*
*Completed: 2026-10-27 — validation humaine « approved » reçue, phase 26 clôturée*
