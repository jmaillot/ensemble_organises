# Milestones

## v1.4 Preuve & décision (Shipped: 2026-11-12)

**Known verification overrides : 69 items acquittés à la clôture (4 debug sessions, 10 uat_gaps, 5 verification_gaps, 50 différés), 0 reporté d'une clôture antérieure — voir STATE.md « Deferred Items ».**

**Phases completed:** 2 phases, 3 plans, 6 tasks

**Key accomplishments:**
- Squelettes de consignation §7.1–7.6 prêts à remplir dans docs/MESURES-COLD-START-42.md + verdict D-15 consigné : le panneau offline existant suffit pour les critères (a) et (c) par famille, l'observabilité conditionnelle n'est pas déclenchée
- Différé consigné honnêtement (§7.1–7.5) — la campagne on-device n'a pas pu tourner, aucune valeur inventée, CACHE-01 NON tranchée, PROJECT.md intouché ; chaîne §2.7 complète verte à l'état final (§7.6, CHAINE-44-VERTE)

---

## v1.3 Solde de la dette (Shipped: 2026-11-10)

**Phases completed:** 5 phases, 13 plans, 12 tasks
**Git range:** 4f88b89..41003e2 (61 fichiers, +7 146/−228, 2026-11-08 → 2026-11-10)
**Audit:** tech_debt — 10/12 exigences satisfaites, 2 deferred (COLD-02, CACHE-01 par décision produit), intégration 12/12 WIRED, 5/5 flux E2E (.planning/milestones/v1.3-MILESTONE-AUDIT.md)
**Closeout type:** override_closeout — 2 exigences décochées acceptées comme dette (décision produit, campagne on-device interrompue) ; ~60 items ouverts hérités (dette historique v0.9/v1.1/v1.2, 4 debug sessions, deferred items) reportés dans l'audit

**Delivered:** jalon dette soldé — le filet de tests est un instrument de confiance, la surface produit unique (adhésion ardoise via le lien de partage) est livrée et câblée au flux d'invitation existant, la gate SW est devenue planifiable, et le cold start est instrumenté avec un protocole de mesure versionné.

### Known Gaps (exigences décochées, décision produit)

- COLD-02 : corrections profilées du cold start — campagne on-device interrompue après 2 runs ; instrumentation + protocole livrés
- CACHE-01 : décision maxAge par famille — critères §5 du doc mesures contraignants pour la campagne future ; query-policy.ts inchangé (statu quo de fait)
- W1 : surface bridge ardoise (Edge household-token, RPC, réconciliation) sans preuve niveau prod ni navigateur réel — tests SQL + RTL uniquement

**Key accomplishments:**
- Helpers de production `debutSemaineIso`/`jourSemaine` prouvés par 7 dates injectées, semis menu recalé sur la semaine lundi→dimanche courante avec garde de classe anti-récidive, et `weekStartOf` (menu) délégué — une seule source d'arithmétique semaine.
- WR-03 n'est plus une course assumée : le test attend l'état persisté via `vi.waitFor` (20/20 exécutions chargées vertes), la cause timing est prouvée par le protocole W-02 exécuté avant fix (1/30 sous charge) et consignée dans la campagne v1.3 de `docs/RETROSPECTIVE.md` — code de production prouvé innocent, correction test-only.
- Garde morte IN-01 supprimée du client ardoise et lectures service_role de buildGuestView bornées dans la requête PostgREST (`.in('expense_id')` + `.eq('household_id').order('id')`), balayage classe entière I-01 consigné — minimisation §2.6 sur l'endpoint public, sans toucher une ligne de SQL.
- Chaîne §2.7 prouvée fiable : typecheck/tests(1988)/build/e2e/SQL-statique tous verts, e2e 165 passed — le seul rouge restant est la spec join-token (critical-paths.spec.ts:134), documenté et exclu explicitement (J-01/J-02, soldé en 39) ; les gardes statiques confirment 0 skip, 0 horloge figée, 0 garde morte introduits.
- Bibliothèque sourçable de comptes e2e (création Admin `email_confirm:true`, purge vérifiée re-delete→404, résidus signalés, secret uniquement via curl -K 0600), câblée dans le smoke à deux modes auto-détectés, documentée dans EXPLOITATION.md
- Spec Playwright réelle du flux 31-03 (les 6 points JT-02, sélecteurs DOM réels, D-17 provoqué par expiration réelle sans horloge figée), orchestrée par un wrapper qui crée/purge les comptes via la bibliothèque smoke du plan 01 — et le run standard soldé : 163 passed / 9 skipped / 0 failed, plus aucun rouge assumé.
- Pont invité→foyer pour l'Ardoise : table `private.ardoise_bridge_identities` + RPC transactionnel qui émet un token foyer à usage unique (15 min) en rattachant l'identité invité, et chemin frontend complet dialog → échange → `/foyer/rejoindre` → atterrissage `/ardoise`.
- Le redeem du token foyer convertit transactionnellement les participations invitées (pont OPTION B) en participations membre — fusion des doublons par report de part — prouvé par 8 cas SQL positifs/négatifs, vu rouge avant vert.
- ConfirmDialog paramétrable (icon rétro-compatible), copy UI-SPEC exacte sans « part zéro » devenue fausse, et 9 tests RTL qui verrouillent ARD-01 : aucune adhésion sans confirmation explicite, atterrissage /ardoise, erreurs affichées telles quelles.
- Marks `performance.mark`/`now` aux 4 segments de démarrage (entry chunk, activation SW, restore IndexedDB, auth bootstrap) agrégés dans un store zustand session seule, et section « Amorçage » (4 lignes + total borne à borne) dans le panneau offline — en prod réel, sans flag de build.
- Protocole de mesure versionné `docs/MESURES-COLD-START-42.md` — séquence de purge PWA exacte (Pitfall 3), N = 5 runs / médiane, définition des 4 segments et du total borne à borne, et critères d'arbitrage CACHE-01 écrits famille par famille (les 11 familles, tolérance énoncée avant lecture du panneau) — écrit AVANT toute mesure (CA-02), sans valeur inventée ni cible chiffrée.
- Campagne de mesure on-device close en **différé consigné honnêtement** — les 5 runs n'ont pas été dictés (« pass »), aucune valeur inventée (§2.7 I), la purge réelle par paramètres Android est documentée avec ses critères de froid, la dette `boot:done` de 42-01 est soldée, et la chaîne §2.7 complète est verte à l'état final (163 e2e passed, Docker disponible) — COLD-02 et CACHE-01 restent ouverts avec leur état documenté.

---

## v1.2 Finition de la dette offline (Shipped: 2026-11-08)

**Phases completed:** 2 phases, 5 plans
**Git range:** v1.1..HEAD (34 commits, 30 fichiers, +2 369/−253, 2026-11-07 → 2026-11-08)
**Audit:** tech_debt — 6/6 exigences satisfaites, intégration 3/3 coutures, 3/3 flux E2E (.planning/v1.2-MILESTONE-AUDIT.md)

**Delivered:** jalon volontairement 100 % dette/fiabilité — la promesse offline de v1.1 n'a plus de fissure : l'outbox classe tout échec de rejeu et le surface visiblement, et le filet de tests est redevenu un instrument de confiance.

**Key accomplishments:**
- Outbox : plus jamais d'effacement silencieux — matrice `FAILURE_FAMILIES` (404, 400, 403 RLS, 42501, réseau, 5xx…) avec classification terminal/retryable, libellés français via `failureLabel`, badge unique « signal actif », panneau Réessayer/Abandonner ; le scénario 404 silencieux d'origine est prouvé rouge→vert (vérification 7/7)
- Purge GoTrue au chokepoint : `purgerStockageSession()` au signOut, atteignable depuis /foyer pour un visiteur connecté sans foyer (G-37-2) — aucune clé `sb-*-auth-token` ne survit, prouvé par lecture brute (test unitaire + e2e), re-testé on-device le 2026-11-08
- Filet de tests fiable : flocon test D épinglé (cause racine documentée), anniversaires 44/44 (globale 1968/1970), e2e offline-shared-device exécuté au vert avec 2 comptes réels (b8295a3, reproduit indépendamment par le vérificateur : 2 passed chromium+mobile)
- Code review : 5 warnings corrigés (b2ec826), re-review clean ; UAT 4/4 passés après déploiement (v1.1-34-g20bbcbd+)

**Known debt (reportée):**
- GATE-01 : re-test gate SW « file vide » + 32-UAT 7 / 35-UAT 2 à la première utilisation observée du déploiement du 2026-11-08
- CACHE-01 : décision produit maxAge 24 h (panneau diagnostic disponible)
- Flakes du dimanche (menu-page, household-store WR-03) — semis `day(1)` vs semaine lundi→dimanche
- Spec e2e join-token périmé depuis la refonte 31-03 (préexistant, prouvé sur base b02e0a0)
- Amorçage offline ≈ 30-40 s avant premier rendu (observation UX 35-06)
- Smoke-test sans mode prod (exige ENABLE_EMAIL_AUTOCONFIRM — à adapter via API Admin)
- 2 infos de review phase 37 (IN-01 garde mort api.ts:315, IN-02 select service_role non borné index.ts:656 — préexistant)

## v1.1 PWA durcie mobile-first (Shipped: 2026-11-07)

**Phases completed:** 4 phases, 25 plans, 17 tasks
**Git range:** 229a402..7915178 (145 commits, 170 fichiers, +15 669/−639, 2026-11-04 → 2026-11-07)
**Audit:** tech_debt — 16/16 exigences satisfaites, intégration 8/8 coutures, 4/4 flux E2E (.planning/milestones/v1.1-MILESTONE-AUDIT.md)

**Delivered:** la PWA installée est une vraie app de poche — lecture offline (cache persisté + bandeau horodaté), file d'écriture idempotente rejouée à la reconnexion, deep links cold-start offline validés on-device Android, installabilité durcie avec gate de mise à jour « file vide ».

**Key accomplishments:**
- Cache de lecture offline : persistance TanStack Query sur IndexedDB namespacée par (utilisateur, foyer), bandeau « dernier état connu le… » (MIN dataUpdatedAt), allowlist Tier 1 avec maxAge, contrôle statique prouvé que le SW ne cache jamais une réponse API
- Purge inter-utilisateurs attendue au goulot signOut et au changement de foyer (preuve D-06), fermeture G-33-3 (isError cloisonné par présence de données)
- File d'écriture idempotente : client_key uuid + unicité sur les 5 tables Tier 1 (migrations 0177-0179, tests SQL 104/104), outbox MutationCache central avec liste blanche et classification terminal/retryable sans boucle
- Rejeu FIFO creates-d'abord exactement-une-fois (upsert onConflict), badge « N en attente / N bloquées », panneau Réessayer/Abandonner, purge scan-avertir-purger, réconciliation Realtime par clé client
- Deep links : /taches/jour + redirect-after-login e2e, écran « connexion requise » hors-ligne, bootstrap tolérant hors-ligne, gardien d'amorçage 10 s, sonde de joignabilité (onlineManager reflète le backend réel), chemin authentifié-hors-ligne (session valide jamais purgée), composeOfflineAwareError — chaîne G-35-3→G-35-6 close on-device (2026-11-07, v1.0-149, « ca marche ! »)
- Install & durcissement : manifest maskable + raccourcis, registerType prompt avec gate « file vide » branchée sur l'outbox, UX d'installation deux niveaux (invite Chromium + guide iOS), panneau diagnostic « Cache hors-ligne »
- Validation multi-OS honnête : matrice Desktop + Android 16 consignée (iOS absent, cellules « Non testé »), chaque défaut ouvert ayant reçu sa chaîne de correctifs re-testée on-device

**Known debt (reportée au jalon suivant):**
- Outbox silencieux : écriture vers une ligne supprimée serveur = entrée évaporée sans message — contredit la décision 34 « jamais d'effacement silencieux » sur le scénario 404
- maxAge 24 h du cache : décision produit en attente (panneau diagnostic disponible)
- Gate SW runtime + INST-03 : bandeau de mise à jour sur un vrai déploiement jamais observé (32-UAT test 7, 35-UAT test 2 — re-test au prochain déploiement)
- Matrice iOS réelle jamais passée (appareil absent) — le critère « trois OS » n'est pas atteint, consigné
- Flocon auth-bootstrap test D (~1/367 sous charge), 2 tests rouges anniversaires préexistants, e2e offline-shared-device skip (2 comptes réels requis), leftover clé GoTrue sur purges invité (low)
- Persistance du cache de lecture TanStack Query sur IndexedDB, namespacée par (utilisateur, foyer), prouvée par un tracer seed → persist → restore → lecture avec fake-indexeddb.
- Contrôle statique à trois vérifications sur `dist/sw.js` + contre-preuve vue rouge sur fixtures, prouvant que le SW ne cache jamais une réponse API (OFFR-05, garantie « le serveur est la seule vérité »).
- Purge namespace de tous les caches d'un utilisateur (tous foyers) awaitée au goulot signOut et au changement de foyer, preuve D-06 par lecture brute du stockage — la déconnexion ne laisse plus rien derrière elle.
- Hook `useOfflineStaleBanner` (MIN des dataUpdatedAt Tier 1 rendues du cache, annexes comprises) + bandeau ambre horodaté non-dismissable dans le slot bannières de la 32.
- Fermeture de G-33-3 — `isError` cloisonné par présence de données (`query.isError && query.data === undefined`) dans useResource, les useQuery directs exposant isError (voyages, détail voyage, calendrier useRefDays, messages) et les requêtes d'annexe de use-taches/use-routines, prouvé RED→GREEN par un test e2e courses + tâches hors ligne.
- `client_key uuid` NOT NULL + unicité par foyer sur les 5 tables Tier 1 (migration 0177, backfill D-15), migrations 0178/0179 pour les insertions serveur (cron routines, RPC coches/remplacements), tests SQL négatifs §2.7 verts (104/104).
- Outbox TanStack persistée (D-01) enfilée par un MutationCache central (D-02) sur échec réseau des 5 mutations Tier 1 marquées `meta`, fusion D-04 / annulation D-05, liste blanche WRITE_ALLOWLIST avec refus upfront hors-ligne (D-07), classification terminal/retryable (D-10) — 36 tests verts, typecheck + build verts.
- Moteur de rejeu `replayOutbox` FIFO creates-d'abord avec upsert idempotent `onConflict household_id,client_key`, classification terminal/retryable intégrée (non-boucle prouvée sur 10 déclencheurs) et hook de déclencheurs foreground `use-outbox-replay` monté une fois dans l'app — WRQ-02/04/06, 17 tests + chaîne complète verte.
- source unique `useOutbox` (D-03) branchée à la gate 32-D10 sans toucher la phase 32, badge « N en attente / N bloquées » priorité 4, toast d'échec terminal une fois par passe (D-12), panneau Paramètres avec Réessayer (rejeu FIFO) et Abandonner (confirm-dialog), purge D-17 scan-avertir-purger dans le goulot `signOut`.
- Fermeture de G-34-1 : allowlist d'écriture centralisée (write-policy), écritures d'articles Courses passées par la couche mutation Tier 1, et régression bout en bout prouvant l'enfilage hors ligne, l'overlay optimiste et le rejeu réconcilié sans doublon.
- Fermeture UAT-34-1 : une écriture hors-ligne enfilée dans l'outbox (table allowlistée, échec réseau) ne remonte plus comme rejet à l'appelant — le signal utilisateur est le badge (D-11/D-12), plus jamais un toast « TypeError: NetworkError… ».
- Route `/taches/jour` (raccourci manifest D-01) rend aujourd'hui + retards depuis le cache persisté (allowlist `task_assignees` complétée), et un e2e dédié prouve le cold-start session expirée → /connexion → login → retour exact à `/taches/jour` — vu rouge avant d'être vu vert.
- Grille 35-VALIDATION-MATRICE.md exécutée par l'humain sur Desktop Chrome + Android 16 Chrome (iOS absent), chaque cellule consignée avec le vocabulaire fermé D-11, ligne CONFIRMATION-CONSIGNATION apposée après confirmation explicite — 3 défauts réels consignés qui ouvrent des travaux correctifs, rien marqué vérifié à tort.
- Écran D-07 rendu hors-ligne sans session sur un deep link : titre explicite, vue visée dérivée de `requestedPath`, bouton « Se reconnecter » — jamais le formulaire nu, aucun stockage au-delà de `state.from` (D-08), cycle TDD rouge→vert complet.
- Rejeu humain 2026-11-06 consigné : §1.5 « connexion requise » **Passé** sur Desktop Chrome ET Android 16 (gap 2 clos), §1.4 cold-start hors-ligne avec session **Passé** sur Desktop mais **Échoué** sur Android 16 (« encore chargement de votre foyer ») — gap 1 partiellement clos, item Android réouvert avec symptôme.
- Une chaîne d'amorçage qui hang (GoTrue initializePromise en refresh réseau bloquant) est coupée à 10 s et retombe sur le chemin invité ; onLine=true trompeur (H1) ne protège plus le hang, et un fetch `list` qui hang rejette en 10 s pour réactiver le repli foyer persisté.
- Une sonde réseau (GET no-cors /auth/v1/health) reflète la joignabilité RÉELLE du backend dans onlineManager au boot — en mode avion Android (onLine=true, réseau mort), l'app bascule offline en ≤ 4 s et active le chemin « cache + bandeau » au lieu de partir en « Failed to fetch ».
- le gardien d'amorçage et les rejets hors-ligne consultent désormais la session GoTrue persistée (avec réassemblage du format chunké v2) avant de purger — une session valide (expires_at > now + 60 s) rétablit l'état authentifié depuis le cache, le foyer persisté est rendu via le repli 35-04, et la complétion tardive de la chaîne ne purge plus un état authentifié établi.
- Introspection lecture seule du cache persisté (`inspectPersistedCache`) + télémétrie du restore (delta de prune compté, cause d'échec capturée), section « Cache hors-ligne » dans le panneau Paramètres, et substitution du « TypeError: Failed to fetch » par un état honnête hors ligne sans données — sonde durcie `cache: 'no-store'`.
- `composeOfflineAwareError` exporté de useResource.ts (miroir exact de la substitution 35-09) remplace la chaîne `error ?? annexe` brute de use-taches.ts et use-routines.ts — plus aucun « TypeError: failed to fetch » hors-ligne, même quand la requête principale possède des données en cache.

---

## v1.0 Mise en ligne publique (phases 25-31) (Shipped: 2026-11-04)

**Phases completed:** 7 phases, 44 plans, 48 tasks

**Key accomplishments:**
- Migration 0144 : managed_modules (socle D-06 par enfant, CHECK de format via 0140), birth_date et deleted_at sur household_members, tests SQL complets avec preuve rouge par mutant
- Migration 0145 : RPC de conversion des enfants-avec-compte en profils gérés (service_role seul, double barrière 42501, exclusion multi-foyer, update-avant-delete), invariant chk_members_managed_child, chemins invitation et rôle refermés (22023), tests SQL verts avec oracles SQLSTATE
- Migration 0146
- migrations 0147 (push adulte D-23), 0148 (fusion link_managed_child) et 0149 (corrections prouvées) posées ; 16 fichiers de tests réécrits vers la vérité 0145 — la barrière [BLOCKING] `sh scripts/test-db.sh` complète est **83/83 verts**.
- CRUD enfant dans la liste des membres via les RPC 0146/0148 (le client n'est jamais l'autorité), âge dérivé D-05, modération adulte du Cercle D-12, fixture e2e exécutée.
- Alignement des sources de vérité sur D-12 (modération du Cercle, jamais de publication au nom de l'enfant) et D-06 (socle tâches/routines/anniversaires/menu) — les trois contradictions nommées plus ENF-05 corrigées, rien d'autre touché.
- la garde d'éligibilité D-06 vit désormais dans une fonction pure (`member-eligibility.ts`) consommée par les quatre pickers, et cocher une routine AU NOM d'un enfant passe par le RPC `complete_routine_occurrence` (0146) depuis le menu « Cocher pour » de la carte.
- Voyages rebranché sur « Fermer la porte » (D-06, migration 0157 + pickers `eligibleMembersForModule`) et les deux avertissements UI-REVIEW corrigés selon le contrat 25-UI-SPEC, avec couverture unitaire et e2e réalignée.
- Portée RGPD tranchée (Option A « ce qui me concerne », fusion multi-foyers, 22 modules, limite 1 Go) et verdicts A1/A2/A3 OK établis pour la mécanique streaming fflate/cross-bucket/upload-flux
- Socle SQL complet de l'export RGPD : bucket privé scellé, table de jobs avec machine à états multipasse, RPC d'extraction bornée au demandeur (RGEX-03), driver cron minute + purge quotidienne
- Job d'export RGPD multipasse prouvé de bout en bout sur la stack : claim atomique, extraction bornée par RPC (22 modules), médias copiés cross-bucket, ZIP assemblé en flux fflate et poussé sans jamais charger l'archive en mémoire — `en_attente → pret` en 2 passes avec preuve de téléchargement signé.
- La purge RGEX-04 est réelle : une Edge Function mode `secret` supprime les octets du bucket `gdpr-exports` (staging + zip) via l'API Storage pour les jobs terminaux dont `expires_at` est dépassé, consigne chaque chemin dans `gdpr_export_purge_log`, et le cron quotidien `eo-gdpr-export-purge` l'éveille via pg_net + Vault — preuve E2E et preuve réseau obtenues sur la stack.
- Panneau Paramètres qui déclenche l'export par RPC, suit les trois états avec durée écoulée (jamais de pourcentage), liste l'historique et télécharge par un lien signé de 24 h maximum calculé au clic — échec visible et retentable.
- La boucle D-01/D-02 est fermée : à l'achèvement d'un job d'export (succès comme échec), le demandeur reçoit une push par la chaîne existante — branche « export » ajoutée par recopie-modification (patron 0147/0042), notified_push bascule après distribution, et la push ne transporte jamais le lien signé ni storage_path (D-04, prouvé par assertion SQL).
- La chaîne de vérification complète du dépôt (AGENTS.md §2.7) est verte sur l'arbre final de la phase 26 — 94 tests SQL, typecheck, 1636 unitaires, build, e2e 155/155 — et les preuves réseau RGPD sont produites sur la stack : export réel conforme (ZIP vérifié contre le tranchement, exclusion cross-membre prouvée, média PNG valide, lien signé 24 h), purge observée avec audit en base ; la livraison push reste déclarée absente (0 abonnement réel) et reprend à la phase 31.
- Tables + RPC de demande/annulation de suppression de compte avec instantané de restauration, déshumanisation immédiate et FK auditées pour que la purge J+30 ne casse aucune donnée partagée du foyer.
- Purge J+30 purement SQL/pg_cron avec transfert d'enfants (D-08), suppression de foyer orphelin réutilisant 0074, manifest de médias construit à la demande (D-07), et alerte J-7 idempotente via wrapper Vault + trois jobs cron sans paramètre.
- Backup.sh produit désormais 4 artefacts chiffrés (dump + storage + db-config + functions), se vérifie (D-07 : pg_restore --list sur stdin, tailles, sha256) et maile son verdict succès/échec via le nouveau send-mail.sh (D-06)
- Réplication chiffrée vers la machine tierce via rsync (D-01/D-02), clé pgsodium copiée hors du répertoire des sauvegardes (D-03), purge GFS 7 j / 1 mois / 1 an jamais antérieure à la vérification du stamp du jour (D-04, Pitfall 6).
- Quatre alertes mail prouvées rouge→vert sur prod (pg_cron, disque, certificats, erreurs Edge) — mails reçus et lus par l'opérateur le 2026-10-29 — et check-cron-health.sh à trois axes attrapant une rotation de secret ratée (OPS-03/OPS-04).
- RPO ≤ 24 h, RTO cible ≤ 4 h (valeur constatée réservée à l'exercice) et rétention GFS arbitrés dans docs/EXPLOITATION.md, runbook pas-à-pas de restauration rejouable (D-10), et toutes les commandes d'installation de l'ordonnancement nocturne livrées dans docs/DEPLOIEMENT-PROD.md (D-05).
- Bilan de porte de la phase 28 consigné : 4 critères prouvés, l'exercice de restauration (OPS-02) et la campagne UAT-27 déclarés non joués par décision opérateur, reportés phase 31 — rien n'est marqué vérifié à tort.
- RPC `open_direct_conversation` (rouverture anti-doublon D-05, verrou consultatif sur la paire, garde enfant D-06) et RPC `conversation_read_receipts` (watermarks `notification_reads` des co-membres actifs, MSG-03), migration 0171 + tests 0171 verts.
- Dispatch push groupé par conversation (D-06/D-07) via migration 0172 — compteur « N nouveaux messages » au titre, reminder_ids par groupe, contenu de message banni du titre et du corps (fuite 0042 corrigée vers l'avant), Edge push-notify consommant par liste, preuve attribuable étendue dans test-dispatch-push.sh.
- Preuve D-09 livrée : un client WebSocket réel reçoit l'événement INSERT de `public.messages` en 1s, attribué au message semé, nettoyage vérifié — critère 4 du roadmap prouvé, pas supposé.
- markRead une fois par session d'ouverture/focus (D-01), rangée d'accusés avatars+horodatage sous la dernière bulle envoyée (D-02, gabarit UI-SPEC), portage one-way du localStorage vers `notification_reads` (D-03) — 40 tests du module messages verts, chaîne §2.7 partielle verte (typecheck, 1668 unitaires, build).
- un tap sur un membre du picker « À qui écrire ? » démarre ou rouvre la directe via le RPC `open_direct_conversation` (0171, D-04/D-05) et les événements Realtime messages/conversations/conversation_members invalident fil ouvert + liste (badges compris, D-08) — 86 tests du module messages verts, chaîne §2.7 complète verte (typecheck, 1679 unitaires, build, 155 e2e).
- Job `eo-routine-maintenance` re-planifié à 06:05 Europe/Paris (fuseau UTC diagnostiqué), assertion SQL de l'occurrence du jour rouge→vert ; preuves humaines D-03/D-04 reportées en résidu.
- DET-02 clos par rejouement de preuves (D-06) — tests automatisés re-vérifiés verts, constat d'usage hors ligne à froid refait et approuvé par l'opérateur le 2026-10-31 en production, todos 13/14/15 clôturés dans docs/TODO.md avec preuve fraîche datée.
- DET-05 clos : « Anniversaires » entier sans césure à 390 px (D-14), animation de sortie des feuilles basses via mécanisme partagé posé une fois (D-15/D-16), preuve e2e Playwright au vert (D-17).
- Dédoublonnage idempotent SQL (0174 : fonction `private.dedup_folder_defaults()` + index 0050 conditionnels + `create_household` durci `on conflict`) et filtre `is_default` côté hook — le formulaire n'affiche plus qu'une entrée « Général », les onglets restent complets.
- Modèle « liste de tokens » fondé en base : deux tokens coexistent actifs, expiration obligatoire (30 j par défaut), révocation individuelle, liste anonymisée, et un RPC de preview pré-auth qui lit sans jamais consommer — appliqué, prouvé par 103/103 tests SQL verts.
- Surface serveur de la consultation pré-auth : Edge dédiée household-invite-preview (publishable, réponse 2 champs, 404 uniforme anti-énumération, rate-limit 8/min) et household-invite enrichi (liste anonymisée D-15, révocation individuelle D-16, expiration exigée à la création) — les deux déployées dans volumes/functions.
- Parcours étranger de bout en bout : lien public `/foyer/rejoindre?token=…` sorti de RequireAuth, pré-écran nommant l'inviteur et le foyer via la preview Edge, token traversant l'inscription par sessionStorage (jamais dans l'email), puis redeem authentifié avec messages D-17 et atterrissage non bloquant D-09.
- L'admin pilote sa gouvernance de liens depuis le panneau existant : création pré-remplie 30 j / 10 avec refus client strict avant l'Edge, liste anonymisée triée par création décroissante avec statuts honnêtes, révocation individuelle confirmée par modale, empty state après la migration « jetables ».
- Libellés d'invitation véridiques : plus aucune interface ne promet l'invalidation des liens précédents à la génération — le modèle liste (0176, D-14) rend chaque lien indépendant, actif jusqu'à son expiration ou sa révocation individuelle.
- Réceptacle daté 31-UAT.md (HV-1..HV-6, zéro valeur pré-remplie) + EXPLOITATION.md remis en accord avec la vérité 31-06 (« RTO non mesuré », plus aucun « À REMPLIR »).

---
