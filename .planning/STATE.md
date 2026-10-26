---
gsd_state_version: "1.0"
milestone: v1.0
milestone_name: Mise en ligne publique (phases 25-31)
current_phase: 26
current_phase_name: Export RGPD
status: planning
stopped_at: Phase 25 complete, ready to plan Phase 26
last_updated: "2026-10-26T20:21:59.555Z"
state_head: ac39db591d8126a2dfe9b4f80fd3bdc7ea9dfe7d
progress:
  total_phases: 7
  completed_phases: 1
  total_plans: 7
  completed_plans: 7
  percent: 14
last_activity: 2026-10-25
---

# STATE — jalon v1.0 « Mise en ligne publique »

## Current Position

Phase: 26 — Export RGPD
Plan: Not started
Status: Ready to plan
Progress: [█░░░░░░░░░] 14% (6/7 plans)

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

- Décisions héritées v0.9.0 : tous les 20 espaces en prod, e2e 147/147, audits
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
- Indicateurs de suivi : 925+ tests Vitest, test-db 64/64, e2e 147/147 (baseline à
  maintenir à chaque phase).
- Pièces pointées à investiguer pendant les plans : migrations 0113-0116 (profils
  enfants) et RPC conversations 0041 (à relire pendant plan 25) ; audit FK vers
`auth.users` (phase 27) ; `household_invite_tokens` (déjà durcies 0082/0083, plan 31).

## Session Continuity

**Last session:** 2026-10-26T12:15:02.565Z
**Stopped at:** Phase 25 complete, ready to plan Phase 26
**Resume file:** None

- Prochaine étape : approbation de la roadmap par l'utilisateur, puis `/gsd-plan-phase 25`
  (recherche approfondie recommandée selon research/SUMMARY.md pour 25, 26, 27, 31).
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

### Blockers

- 16 fichiers de test en échec connu post-0145 : la suite complète test-db.sh ne sera verte qu'après leur réécriture (plan futur) + tranchement D-01 storage. Détail : deferred-items.md (25-04) et WINDOWS.md #12.
- test-dispatch-push.sh (rappel réseau réel, pg_net → Vault → appareil abonné) : absent de cette campagne — AGENTS.md §2.7 exige qu'il soit mené AVANT de considérer le SQL push validé.
