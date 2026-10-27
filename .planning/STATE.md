---
gsd_state_version: "1.0"
milestone: v1.0
milestone_name: Mise en ligne publique (phases 25-31)
current_phase: 26
current_phase_name: Export RGPD
status: executing
stopped_at: "Phase 26 Plan 04 complete — Edge gdpr-export-purge : purge 7 j des octets via API Storage, auditée (RGEX-04), preuve réseau prouvée"
last_updated: "2026-10-27T10:15:00Z"
state_head: 5873249
progress:
  total_phases: 7
  completed_phases: 1
  total_plans: 14
  completed_plans: 12
  percent: 26
last_activity: 2026-10-27
---

# STATE — jalon v1.0 « Mise en ligne publique »

## Current Position

Phase: 26 (Export RGPD) — EXECUTING
Plan: 5 of 7 (26-04 terminé en Wave 4 ; 26-06 est le prochain plan exécutable — Wave 5)
Status: Executing Phase 26 — plans 26-02/26-03/26-04/26-05 terminés, reste 26-06 (push) et 26-07 (barrière)
Progress: [██▌░░░░░░░] 26% (12/14 plans)

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

**Last session:** 2026-10-27T09:57:49Z
**Stopped at:** Phase 26 Plan 05 complete — panneau RGPD Paramètres monté, 8 tests verts, e2e baseline tenue
**Resume file:** .planning/phases/26-export-rgpd/26-05-SUMMARY.md

- Prochaine étape : plan 26-06 (notification push d'achèvement — branche « export » de due_push_notifications), puis 26-07 (UAT).
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

## Decisions

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
- [Phase 26] (26-02) : Squelette gdpr_export_extract_batch — signature et contrat figés (user_id, module, rows, cursor_module, cursor_offset, done, media_paths), corps réservé au plan 26-03 Task 1 (extraction par module + liste médias)
- [Phase 26] (26-02) : Wrappers sans paramètre pour conformité test 0004 — dispatch_gdpr_export_run/purge délèguent à post_gdpr_export_http('run'/'purge'), jobs cron n'appellent QUE private.*() sans paramètre (garantie aucune valeur dans cron.job.command)
- [Phase 26] (26-02) : gdpr_export_purge_log — RLS activée ZÉRO politique client, exemption explicite test 0001 (audit RGEX-04 lisible par base/opérateur, jamais navigateur)
- [Phase 26] (26-03) : PASS_CAP=60 (et non ~10) — 22 modules + lots 500 + médias + assemblage dépassent honnêtement 10 passes ; 60 ≈ 1 h max, boucle bornée (T-26-10)
- [Phase 26] (26-03) : Assemblage ZIP from-scratch idempotent — un central-directory ZIP exige un unique écrivain séquentiel, reprendre en cours recréerait le problème mémoire évité
- [Phase 26] (26-03) : Wrapper public.gdpr_export_extract_batch (0163) — PostgREST n'expose que public/graphql_public, la logique reste en private, wrapper SECURITY DEFINER réservé service_role (motif delete_household/0160)
- [Phase 26] (26-03) : Clé du déclencheur HTTP dans l'en-tête apikey, jamais Authorization: Bearer — motif 0025, 0162 corrige la régression de 0158
- [Phase 26] (26-05) : Déviation de tier assumée — createSignedUrl côté navigateur au clic (TTL 86400 max) ; l'autorisation reste évaluée par la storage-api contre gdpr_exports_read (0158) à la signature ; un seul endroit où vit le lien (D-04), aucune persistance (T-26-15)
- [Phase 26] (26-05) : Aucun garde admin sur le panneau RGPD (D-08) — le droit d'export est personnel ; la borne est la RLS gdpr_export_jobs côté base, test 5 verrouille l'absence de garde

### Blockers

- 16 fichiers de test en échec connu post-0145 : la suite complète test-db.sh ne sera verte qu'après leur réécriture (plan futur) + tranchement D-01 storage. Détail : deferred-items.md (25-04) et WINDOWS.md #12. [OBSOLETE : suite verte après 26-02, 92 fichiers tous verts]
- test-dispatch-push.sh (rappel réseau réel, pg_net → Vault → appareil abonné) : absent de cette campagne — AGENTS.md §2.7 exige qu'il soit mené AVANT de considérer le SQL push validé.
