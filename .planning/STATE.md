---
gsd_state_version: "1.0"
milestone: v1.0
milestone_name: Mise en ligne publique (phases 25-31)
current_phase: 30
current_phase_name: Hygiène du jalon — dettes et résidus
status: verifying
stopped_at: "Completed 30-05-PLAN.md (DET-05 : césure + sortie animée feuilles, forceMount écarté sur preuve a11y)"
last_updated: "2026-10-31T12:05:55.809Z"
state_head: 3f879b4386fe5fd354323092ba9a6ab6d92678fc
progress:
  total_phases: 7
  completed_phases: 3
  total_plans: 35
  completed_plans: 35
  percent: 43
last_activity: 2026-10-27
---

# STATE — jalon v1.0 « Mise en ligne publique »

## Current Position

Phase: 30 (Hygiène du jalon — dettes et résidus) — EXECUTING
Plan: 5 of 5
Status: Phase complete — ready for verification
Progress: [████░░░░░░] 43% de la phase 29 (6/6 plans — 29-01 à 29-06, G-29-1 clos, UAT verte)

## Références du jalon v1.0

- ROADS : .planning/ROADMAP.md (phases 25-31, numérotation continue de v0.9.0 qui s'est arrêté à 24)
- Requirements : .planning/REQUIREMENTS.md (33 exigences v1.0, table de traçabilité remplie)
- Recherche : .planning/research/SUMMARY.md (confiance HIGH codebase / MEDIUM RGPD-SMTP)

## Portes dures de séquence (non négociables)

1. Phase 25 (identité enfants) AVANT 26-27 (RGPD) — le périmètre « sans session »
   doit être stabilisé avant de définir qui correspond à quelle donnée.
2. Phase 26 (export) AVANT 27 (suppression) — l'export est proposé avant l'offre.
3. Phase 28 : l'exercice de restauration consigné (OPS-02) conditionne l'ouverture
   publique. Cette phase peut courir en parallèle avec 26/27/29.
4. Phase 31 (inscriptions ouvertes) = DERNIERE : porte OUV-07 = suppression vivante (27)
   + restauration consignée (28) + preuve SMTP réelle Gmail/Outlook.
5. Phase 29 (messagerie) bénéficie de 25 (member-picker incluant les enfants) ;
   orthogonale autrement.
6. Phase 30 (hygiène/dettes) placée avant la porte d'ouverture — aucun go-live public
   sur une dette connue.

## Accumulated Context

- Décisions héritées v0.9.0 : tous les 20 espaces en prod, e2e 147/147 à la clôture
  v0.9.0 (baseline courante : 155, cf. ROADMAP 25-08), audits
  v0.9.0 PASSED ; contrats enfants 0113-0116 (à re-diligencier en plan 25) ;
  RPC conversations 0041 ; chaîne push `dispatch_messages`→`push-notify` existante ;
  estampille de build à quatre canaux (phase 24).
- Frontières tranchées par la recherche (powering plans) :
  - Suppression J+30 purement SQL/pg_cron (jamais HTTP depuis cron — frontière non
    testée par test-db.sh), manifest médias construit à la demande.
  - Accusé de lecture : watermark par membre, jamais une écriture par message
    (pitfall 7 — décision au niveau de la migration, pas un retrofit).
  - Realtime self-hosted : `alter publication supabase_realtime` obligatoire,
    prouvé par souscription.
  - MTA : Stalwart v0.16.4 (pas de SaaS SMTP — contredit self-hosted/RGPD).
  - Table `gdpr_export_jobs` + bucket `gdpr-exports` (TTL 24h URL, purge 7 j cron).
  - Flag-deliverability : réputation IP — preuve de réception réelle exigée sur le
    domaine cible, fallback relais SMTP dédié à prouver, pas à pré-installer.
- Indicateurs de suivi : 1628 tests Vitest, test-db 91/91, e2e 155/155 (baseline
  autoritaire ROADMAP 25-08, clôture 2026-10-26 — à maintenir à chaque phase).
- Pièces pointées à investiguer pendant les plans : migrations 0113-0116 (profils
  enfants) et RPC conversations 0041 (à relire pendant plan 25) ; audit FK vers
`auth.users` (phase 27) ; `household_invite_tokens` (déjà durcies 0082/0083, plan 31).

## Session Continuity

**Last session:** 2026-10-31T12:05:44.376Z
**Stopped at:** Completed 30-05-PLAN.md (DET-05 : césure + sortie animée feuilles, forceMount écarté sur preuve a11y)
**Resume file:** None

- Prochaine étape : phase 27 (suppression RGPD) — l'export est proposé avant l'offre (porte de séquence).
- Observation 26-07 conservée aux Blockers : premier dispatch purge sans atteinte Edge à surveiller en 27/28.
- Le corps historique du journal (phases 1-24) reste perdu (cf. note de réécriture du
  24/10) ; les récits vivent dans .planning/phases/*/ et docs/RETROSPECTIVE.md.
- .planning est partiellement gitignoré : ROADMAP.md/STATE.md/REQUIREMENTS.md et
  recherches vivent sur le disque uniquement. Ne pas annoncer de commit de ces fichiers.

---
Statut historique (v0.9.0 clôturé le 2026-10-24) : audit PASSED, phases 16-24
(UAT utilisateur validée). Archivé dans .planning/milestones/v0.9.0-ROADMAP.md.

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 29 P04 | ~16 min | 3 tasks | 8 files |
| Phase 29 P05 | ~25 min | 3 tasks | 6 files |
| Phase 25 P01 | 23 min | 2 tasks | 3 files |
| Phase 25 P06 | 8 min | 1 tasks | 2 files |
| Phase 25 P02 | 52 min | 3 tasks | 2 files |
| Phase 25 P03 | ~1h35 | 2 tasks | 4 files |
| Phase 25 P04 | ~2 sessions | 3 tasks | 7 files |
| Phase 25 P04 | 3 sessions | 3 tasks | 17 files |
| Phase 25 P05 | ~2h (2 sessions) | 3 tasks | 10 files |
| Phase 25 P07 | ~35 min | 3 tasks | 17 files |
| Phase 25 P08-GAP | 3 sessions | 2 chantiers | 10 files |
| Phase 26 P01 | ~40 min | 2 tasks | 2 files |
| Phase 26 P05 | ~15 min | 3 tasks | 5 files |
| Phase 26 P06 | ~35 min | 3 tasks | 3 files |
| Phase 26 P07 | ~45 min | 3 tasks (2 auto + 1 checkpoint) | 0 code files (barrière) |
| Phase 27 P01 | ~40 min | 3 tasks | 5 files |
| Phase 27 P02 | 19 min | 3 tasks | 2 files |
| Phase 27 P03 | 90min | 3 tasks | 12 files |
| Phase 27 P04 | ~50 min | 3 tasks | 4 files |
| Phase 27 P05 | ~1h20 | 3 tasks | 6 files |
| Phase 28 P01 | 9 min | 3 tasks | 3 files |
| Phase 28 P02 | 14 min | 2 tasks | 2 files |
| Phase 28 P04 | 4 min | 2 tasks | 2 files |
| Phase 29 P01 | 14 min | 2 tasks | 2 files |
| Phase 29 P02 | 75m | 2 tasks | 4 files |
| Phase 29 P03 | 35m | 2 tasks | 1 files |
| Phase 29 P05 | ~25 min | 3 tasks | 6 files |
| Phase 30 P01 | ~90m | 3 tasks | 3 files |
| Phase 30 P02 | session | 3 tasks | 1 files |
| Phase 30 P03 | ~15 min | 2 tasks | 4 files |
| Phase 30 P04 | ~30 min | 2 tasks | 3 files |
| Phase 30 P05 | ~1h20 | 3 tasks | 6 files |

## Decisions

- 30-01 (2026-10-30) : **arrêt anticipé sur décision humaine** — volets techniques de DET-01 livrés (verdict H2 fuseau UTC→Europe/Paris, migration 0173, assertion occurrence-du-jour rouge→vert, doc §6.3), preuves humaines reportées en RÉSIDU : **D-03** = exécution matinale fraîche du job à constater dans cron.job_run_details (statut succeeded, start_time ≈ 06:05 +02, demain 2026-10-31) ; **D-04** = constat d'usage (créer une routine dans un foyer, occurrence visible dans la vue du jour de l'app — 0 routine réelle en base). `/gsd-verify-work` doit collecter ces deux preuves avant la porte de la phase 31.
- 30-01 (2026-10-30) : verdict H2 — le job tournait à 06:05 UTC (08:05 Paris) ; re-planification `5 6 * * * Europe/Paris` (0173), 0011 non réécrite ; 0154 déjà pris → nom 0173.
- 30-01 (2026-10-30) : `0147_child_push_adults.sql` échoue pour cause pré-existante hors périmètre (push anniversaires, pas cron) — consigné dans deferred-items.md.

- 29-04 (2026-10-29) : migration localStorage D-03 strictement unidirectionnelle — la clé n'est jamais réécrite après push serveur réussi ; les marques optimistes restent en mémoire, le serveur fait foi.
- 29-04 (2026-10-29) : la rangée d'accusés (D-02) est rendue sous la dernière bulle « mine » (lastMineId), pas en fin de liste — elle suit la bonne bulle quand des réponses arrivent après.
- 29-04 (2026-10-29) : D-08 respecté — les receipts vivent sous le préfixe ['messages'], invalidés par useMessagesRealtime, aucune souscription Realtime dédiée.

- [Phase 28]: [28-04] RPO ≤ 24 h par le cron nocturne 02:15 ; vérité tierce assumée : réplication non déployée → points de récupération sur le disque local de l'hôte prod seul (risque documenté, re-diligence avant phase 31). RTO : cible ≤ 4 h (D-09), valeur réelle réservée à la sous-section « RTO constaté » de docs/EXPLOITATION.md à remplir par l'exercice 28-05
- [Phase 28]: [28-04] Clone de restauration isolé par docker-compose.isole.yml (ports: !override [] sur api-gw/supavisor) : sur prod, seul l'override Traefik retire les ports publiés ; sans lui, le clone binderait 8000/6543 déjà occupés par la stack qui tourne (D-08)
- [Phase 28]: [28-04] Créneau nocturne arbitré contre les jobs pg_cron internes (04:14-06:40) : backup 02:15 / réplication 02:45 / checks 07:10-07:40 — commandes livrées D-05 dans docs/DEPLOIEMENT-PROD.md « Installation de l'ordonnancement nocturne »

- [Phase 25]: Restriction par module portée par la ligne household_members (managed_modules text[]), pas par households — D-05 par enfant
- [Phase 25]: CHECK de format uniquement (private.has_valid_module_keys de 0140) : la validité sémantique du catalogue reste côté client
- [Phase 25]: Invariant enfant-⟺-sans-session volontairement ABSENT de 0144 : il rejoint en 0145 après la conversion (les lignes héritées enfant-avec-compte le violeraient)
- [Phase 25]: ENF-02 : la modération du Cercle sort du « au nom de l'enfant » — le parent n'agit jamais en son nom dans le Cercle, il modère le contenu attribué à un enfant
- [Phase 25]: D-18 approuvée (2026-10-25) : conversion des enfants-avec-compte en profils gérés, suppression réelle des comptes auth.users (0145) ; piste produit future NOTÉE non implémentée : rôle adolescent avec compte propre
- [Phase 25]: Gardes 0146 : modules lus depuis la ligne membre (D-05), colonnes d'acteur ENF-03 en text écrites depuis auth.uid(), refus explicites 22023/42501, Cercle 3e branche DELETE adulte modère le contenu enfant (D-12)
- [Phase 25]: 0149 (25-04) : corrections vers l'avant de 0148 et 0146 — les dédups A6 suppriment SEULEMENT les conflits de clé (les deletes inconditionnels de 0148 perdaient les traces de l'enfant) ; D-07 rétabli sur posts/post_comments/post_reactions (0146 avait recopié la forme 0109)
- [Phase 25]: testkit.member ignore le user_id des enfants (invariant 0145) ; 0139 débocalisé par comptage borné (§2.7 D)
- [Phase 25]: Barrière [BLOCKING] clôturée le 2026-10-26 — suite SQL complète verte (90/90 après les migrations 0150-0156) ; les 16 échecs post-0145 étaient des tests obsolètes, réécrits vers la vérité 0145 ; D-01 storage tranchée : le parent dépose pour l'enfant (décision utilisateur du 2026-10-26, passée en 0038) ; 0053 diagnostiqué = pas de bug produit
- [Phase 25]: D-01 storage : le parent depose pour l'enfant — l'adulte du foyer est l'acteur de session du depot (0038 reecrit, 83/83 verts)
- [Phase 25]: 0053 : pas de bug produit — redeem_trip_invite resout le membre par user_id ; l'uid enfant suit l'oracle invite 'pseudonyme invalide' (22023)
- [Phase 25]: Branche can_deposit_message_media de 0099 = code mort benin depuis 0145 — suppression eventuelle dans un plan futur, jamais une correction en place
- [Phase 25] (25-05) : useIsAdult est L'unique brique d'identification adulte côté UI et le filtre deleted_at="vivantes" un filtre UNIQUE dans le store — jamais un double filtrage appelant+hook
- [Phase 25] (25-05) : upload photo/avatar enfant DIFFÉRÉ à un plan futur — la RPC porte p_avatar_url de bout en bout mais aucune chaîne chemin-bucket→URL lisible membre n'existe ; précédent du dépôt : jamais une URL signée stockée
- [Phase 25] (25-05) : D-12 en UI — les adultes (admin OU membre) suppriment les posts d'enfant du Cercle ; les enfants ne voient que leurs propres publications ; les lignes enfant archivées tombent sur mine-only (limitation commentée dans use-cercle.ts)
- [Phase 25] (25-05) : « Compte à relier » liste TOUS les adults (y compris user_id null de la démo) — le serveur 0148 reste la frontière, le filtre client serait un doublon fragile
- [Phase 25]: 25-07 : la garde D-06 vit dans la fonction pure member-eligibility.ts, consommée par les quatre pickers (tâches, routines, menu, ardoise) — zéro règle locale
- [Phase 25]: 25-07 : self-toggle = cas particulier de la délégation — toggleFor est le seul chemin de complétion, markOccurrenceDone passe par le RPC 0146 en mode Supabase
- [Phase 25]: 25-07 : l'ardoise abandonne son filtre de rôle pour la règle fiduciaire D-05 — le serveur 0146 reste l'autorité
- [Phase 25] (25-08-GAP) : Voyages rejoint « Fermer la porte » (décision utilisateur 2026-10-26) — 0157 élargit le périmètre RPC et garde trip_add_member (42501) ; le frontend réutilise eligibleMembersForModule, zéro règle locale
- [Phase 25] (25-08-GAP) : UI-REVIEW warnings corrigés selon 25-UI-SPEC verbatim — couleur éditable à la modification (D-05), copie D-04 dans la confirmation, « Enfant » filtré du sélecteur de rôle, modération Cercle conditionnelle au rôle de l'auteur
- [Phase 26] (26-01) : Portée RGPD Option A « Ce qui me concerne » — profil + créations (created_by, paid_by, author_id) + attributions (task_assignees, routine_assignees) + participations ardoise (expense_participants) + médias personnels ; jamais le contenu créé par un autre membre
- [Phase 26] (26-01) : Multi-foyers fusion — une seule archive ZIP, un JSON par module, données de tous les foyers confondus ; l'identité du sujet RGPD prime sur la frontière du foyer
- [Phase 26] (26-01) : 22 modules exportables listés mot pour mot dans 26-SPEC-DECISION.md ; household_invite_tokens et gdpr_export_jobs exclus
- [Phase 26] (26-01) : Limite bucket gdpr-exports : 1 Go (1073741824 octets)
- [Phase 26] (26-01) : Verdicts A1 (upload flux ReadableStream), A2 (fflate Deno streaming), A3 (cross-bucket copy destinationBucket) établis OK avec replis nommés sur base documentaire (doc officielle + motifs in-repo)
- [Phase 27] (27-01) : D-06 en base — index unique partiel « une seule demande active » ; demande reposée après annulation = pas de re-snapshot (l'instantané garde les valeurs d'origine) MAIS déshumanisation rejouée (D-05 l'avait restaurée, défaut attrapé par le test §5 purge)
- [Phase 27] (27-01) : FK auditées — données partagées du foyer survivent à la purge (set null sur ligne membre survivante, account_deleted_at), données personnelles meurent avec le compte (cascade) ; chk_members_managed_child assoupli vers l'avant pour l'état « ancien membre »
- [Phase 26] (26-02) : Squelette gdpr_export_extract_batch — signature et contrat figés (user_id, module, rows, cursor_module, cursor_offset, done, media_paths), corps réservé au plan 26-03 Task 1 (extraction par module + liste médias)
- [Phase 26] (26-02) : Wrappers sans paramètre pour conformité test 0004 — dispatch_gdpr_export_run/purge délèguent à post_gdpr_export_http('run'/'purge'), jobs cron n'appellent QUE private.*() sans paramètre (garantie aucune valeur dans cron.job.command)
- [Phase 26] (26-02) : gdpr_export_purge_log — RLS activée ZÉRO politique client, exemption explicite test 0001 (audit RGEX-04 lisible par base/opérateur, jamais navigateur)
- [Phase 26] (26-03) : PASS_CAP=60 (et non ~10) — 22 modules + lots 500 + médias + assemblage dépassent honnêtement 10 passes ; 60 ≈ 1 h max, boucle bornée (T-26-10)
- [Phase 26] (26-03) : Assemblage ZIP from-scratch idempotent — un central-directory ZIP exige un unique écrivain séquentiel, reprendre en cours recréerait le problème mémoire évité
- [Phase 26] (26-03) : Wrapper public.gdpr_export_extract_batch (0163) — PostgREST n'expose que public/graphql_public, la logique reste en private, wrapper SECURITY DEFINER réservé service_role (motif delete_household/0160)
- [Phase 26] (26-03) : Clé du déclencheur HTTP dans l'en-tête apikey, jamais Authorization: Bearer — motif 0025, 0162 corrige la régression de 0158
- [Phase 26] (26-05) : Déviation de tier assumée — createSignedUrl côté navigateur au clic (TTL 86400 max) ; l'autorisation reste évaluée par la storage-api contre gdpr_exports_read (0158) à la signature ; un seul endroit où vit le lien (D-04), aucune persistance (T-26-15)
- [Phase 26] (26-05) : Aucun garde admin sur le panneau RGPD (D-08) — le droit d'export est personnel ; la borne est la RLS gdpr_export_jobs côté base, test 5 verrouille l'absence de garde
- [Phase 26] (26-06) : Marquage notified_push DANS public.consume_push_reminders (branche kind 'export') — le mécanisme de consommation après distribution 0042/0147 est étendu, pas une nouvelle fonction ; push-notify n'appelle la consommation qu'après un envoi réellement reçu (A5)
- [Phase 26] (26-06) : preference null pour la branche export (motif anniversaires 0019) — l'achèvement d'un export demandé n'a pas d'interrupteur ; D-04 : titre générique + url '/parametres', jamais le lien signé ni storage_path (prouvé par assertion SQL)
- [Phase 26] (26-06) : Dispatch dédié dispatch_export_notifications + cron eo-push-exports (*/5, motif 0042) — la chaîne eo-push-messages ne distribue que le scope 'messages' ; reminderKind doit reconnaître export-<job_id> sans quoi notified_push ne basculerait jamais
- [Phase 26] (26-07) : Barrière clôturée côté exécution — chaîne §2.7 verte complète (94 tests SQL, typecheck, 1636 unitaires / 202 fichiers, build, e2e 155/155 + 7 skips viewport conditionnels) ; export e2e réel prouvé (job 3bf17b27, ZIP conforme, exclusion cross-membre prouvée, média PNG valide, lien signé 86400 s) ; purge prouvée (2 jobs, 24 objets, partial:false, audit removed=t) ; push = ABSENCE DÉCLARÉE (0 abonnement réel, reprise 31)
- [Phase 26] (26-07) : Convention note_attachments.file_url confirmée = chemin d'objet SANS préfixe bucket (26-03) ; un fixture mal préfixé produit un chemin doublé dans le manifeste (fixture corrigé, produit inchangé) — à re-diligencer en 27 si d'autres colonnes média sont exportées
- [Phase 26] (26-07) : Barrière APPROUVÉE par l'utilisateur (« approved » 2026-10-27) — export conforme à la portée A (22 modules, exclusion cross-membre prouvée) et purge avec audit acceptées ; l'absence de preuve push (0 abonnement réel) acceptée comme absence déclarée, reprise phase 31 (porte OUV-07)
- [Phase 27]: 27-02: cron jobs sans paramètres — deux dispatches délégants (reminder/purge-medias) respectent le contrat 0004 (^select private\.[a-z_]+\(\)$) plutôt que des commandes littérales dans cron.job
- [Phase 27]: 27-02: purge de foyer orphelin — réutilise public.delete_household (0074) si l'utilisateur purgé était admin, sinon suppression inline (dépenses puis foyer), assert_household_admin leverait 42501
- [Phase 27]: 27-02: demande marquee 'purgee' avant delete from auth.users — la ligne meurt avec le compte via le cascade 0166, preuve RGPD assertée dans les tests
- [Phase 27]: Edge unifiée household-delete : mode foyer (défaut sans discriminant) + mode compte (rpc 0167 puis signOut global via Bearer header, F1) + actions cron reminder/purge-medias en secret ; manifest privé exposé par wrappers public 0169 (motif 0163)
- [Phase 27]: Échec d'e-mail après RPC réussi : réponse honnête email_sent:false (jamais un 500 mensonger) ; lien d'annulation vers /parametres/donnees, jamais /auth/v1/* (D-05)
- [Phase 28]: [28-01] Arbitrage transport mail consigné (DEPLOIEMENT-PROD) : conteneur jetable sur le réseau de la stack par défaut (SMTP_HOST=supabase-mail injoignable de l'hôte), msmtp si la sonde prod dit joignable — send-mail.sh choisit seul à l'exécution
- [Phase 28]: [28-01] D-07 par stdin : déchiffrement pipe-éphémère vers pg_restore --list dans le conteneur db, aucun dump clair sur disque ; backup.sh produit 4 artefacts (functions.tar.gz ajouté, bind ./volumes/functions) et maile son verdict succès/échec via send-mail.sh
- [Phase 28]: [28-01] OPS-01 non marqué complete : ID partagé avec 28-02 (gate #2388), le dernier plan déclarant le marquera ; sonde SMTP et première sauvegarde notifiée à jouer sur prod (commandes livrées per D-05)
- [Phase 29]: Push messages groupé (0172) : compteur au titre, reminder_ids par groupe, contenu banni ; Edge consomme par liste
- [Phase 29]: reminder_id scalaire conservé (dernier id du groupe) pour compat Edge ; titre du fil autorisé au push, jamais le contenu
- [Phase 29]: 29-03 : souscription Realtime par le chemin de production api-gw (Host de tenant) ; client WS natif Node, zéro dépendance npm ; aucune migration 0173 (publication déjà complète)
- [Phase 29]: 29-05 : openDirectConversation appelle le RPC 0171 (anti-doublon D-05 côté serveur), picker « À qui écrire ? » un tap = démarrage/réouverture, conversation_members ajouté à useMessagesRealtime (D-08 : notification_reads jamais souscrite)
- [Phase 30]: D-06 : todos 13/14/15 clos par rejouement de preuves (tests verts + constat hors ligne à froid approuvé par l'opérateur le 2026-10-31 en production), fixes non réécrits
- [Phase 30]: Photo du semis démo : CC0 Wikimedia plutôt que CC BY — domaine public, crédit conservé au gabarit lisbonne.jpg — Arbitrage D-08 appliqué à la mesure : 1 recette du semis (seed.ts:568) = 1 photo, gabarit réutilisable pour toute recette future
- [Phase 30]: 30-04 : le repli « Version de développement » est un choix de RENDU strict — appVersion reste 'unknown' côté machine, les trois canaux (X-App-Version, /version.json, LABEL image) gardent leur contrat (D-12) ; title du repli déclare la cause (build hors pipeline, valeur non fiable), jamais un semver faux (D-11)
- [Phase 30]: 30-05 : arbitrage forceMount amendé — écarté sur preuve a11y (hideOthers/focus guards actifs feuille fermée = page aria-hidden, prouvé par scan-flow.test) ; sortie animée appuyée sur la Présence Radix (contenu monté PENDANT la sortie, démontage propre)
- [Phase 30]: 30-05 : inventaire D-16 consigné — feuilles du mécanisme = MobileDrawer (feuille « Plus ») + ProductSheet (DialogContent feuille ≤650px) ; les autres consommateurs de DialogContent sans animation restent inchangés

### Blockers

- 16 fichiers de test en échec connu post-0145 : la suite complète test-db.sh ne sera verte qu'après leur réécriture (plan futur) + tranchement D-01 storage. Détail : deferred-items.md (25-04) et WINDOWS.md #12. [OBSOLETE : suite verte après 26-02, 92 fichiers tous verts]
- test-dispatch-push.sh (rappel réseau réel, pg_net → Vault → appareil abonné) : **absence déclarée à 26-06 ET re-déclarée à 26-07** (0 abonnement réel sur l'instance, le script refuse lui-même un endpoint factice) — à mener avec un appareil abonné, à la phase 31 (preuve SMTP/push de la porte OUV-07).
- Observation 26-07 : un premier dispatch_gdpr_export_purge a répondu dispatched:true sans que la requête n'atteigne la Edge (aucun log serving, aucune _http_response) ; le second dispatch a servi la purge normalement (200, 24 objets supprimés). Cohérent avec la philosophie cron-retry ; à surveiller en 27/28.
- [Phase 28]: [28-02] Corps GFS unique transmis par stdin ssh : purge locale et tierce exécutent la même chaîne (divergence de rétention impossible) ; sélection explicite des stamps à conserver, jamais rsync --delete
- [Phase 28]: [28-02] D-03 en dur dans le script : refus fatal si EO_PGSODIUM_COPY imbrique EO_REPL_DIR ; source clé par défaut = db-config.tar.gz du stamp le plus récent

- [Phase 29] (29-01) : types TEXTE réels pour les deux RPC (le plan disait uuid — le schéma 0002/0004/0046 fait foi : ids private.new_id, seul user_id est uuid)
- [Phase 29] (29-01) : garde D-06/0146 (enfant géré sans module 'messages' → 22023) portée par open_direct_conversation — parité avec create_conversation, sinon contournement
- [Phase 29] (29-01) : rouverture D-05 lue sur left_at is null seul (archived_at n'empêche pas, A1) ; « membre actif » ciblé = account_deleted_at is null ; l'appelant est exclu de ses propres accusés
- [Phase 29] (29-01) : échec préexistant 0147_child_push_adults (anniversaires D-23) reproduit sans 0171 — hors périmètre, deferred-items.md
- [Phase 28]: [28-02] OPS-01 marqué complete (dernier plan déclarant, gate #2388) ; exécution réelle de réplication à jouer sur prod (commandes livrées per D-05)
