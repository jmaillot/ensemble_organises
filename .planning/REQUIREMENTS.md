# Requirements : v1.0 — Mise en ligne publique

**Défini :** 2026-10-25
**Core Value :** la vie quotidienne du foyer tenue en prod, sans que les données de la famille ne sortent du serveur auto-hébergé.

## Exigences v1.0

### Profils enfants gérés par le parent

- [x] **ENF-01** : Un admin crée, modifie et supprime un profil enfant géré dans le foyer (aucun compte d'authentification autonome créé)
- [x] **ENF-02** : Un parent agit au nom de l'enfant (assigner une tâche, cocher une routine) via des opérations serveur explicitement validées (`actor_member_id` vérifié côté SQL/Edge, jamais un CRUD générique) ; le parent ne publie jamais au nom de l'enfant dans le Cercle — seule la modération y est admise : un adulte peut modérer le Cercle (supprimer/masquer tout contenu — post, commentaire, réaction — attribué à un profil enfant du foyer, y compris l'historique issu des anciens comptes enfant) — 0146 gardes + 0148 fusion + D-12 prouvée par 0047/0052 verts (25-04)
- [x] **ENF-03** : Les traces d'activité gardent l'enfant comme attributaire et le parent comme acteur (filiation auditable)
- [x] **ENF-04** : RLS strict vérifiée par tests négatifs SQL : un profil enfant n'a ni session ni moyen d'agir lui-même ; toutes les politiques existantes auditées (tâches, routines, courses, cercle, cadeaux, anniversaires, messages) — audits 0145/0146/0148/0149 ; suite complète **83/83 verte** (les 16 tests pré-0145 réécrits vers la vérité 0145, commits 555ab79…b904caf)
- [x] **ENF-05** : L'enfant apparaît par défaut dans les sélecteurs (tâches, routines, anniversaires, menu — socle D-06) comme membre du foyer ; tout autre espace refuse l'attribution tant qu'il n'est pas activé sur sa fiche

### Export RGPD

- [x] **RGEX-01** : Un membre demande l'export complet de ses données (JSON structuré + médias, archive ZIP) via un lien signé sur bucket privé, URL expirée ≤ 24 h
- [x] **RGEX-02** : L'export est asynchrone (statut visible, notification à l'achèvement) pour supporter un foyer de plusieurs centaines de Mo
- [x] **RGEX-03** : L'export est borné à la seule donnée du demandeur (cas multi-foyers tranchée dans la spec produit ; tests SQL négatifs inter-foyers obligatoires)
- [x] **RGEX-04** : Le contenu du bucket `gdpr-exports` est purgé à 7 jours par le pg_cron existant

### Suppression de compte RGPD

- [x] **RGDP-01** : Un utilisateur demande la suppression de son compte — sessions tuées immédiatement, surface publique anonymisée
- [x] **RGDP-02** : La demande de suppression est annulable pendant 30 jours (réversibilité), via confirmation email
- [x] **RGDP-03** : Un email d'alerte est envoyé à J-7 avant la purge effective
- [x] **RGDP-04** : La purge J+30 est purement SQL/pg_cron (médias revalidés depuis un manifest construit à la demande ; jamais de purge HTTP fragile depuis cron — frontière HTTP non couverte par test-db.sh)
- [x] **RGDP-05** : Les FK vers `auth.users` sont auditées avant toute migration : les données partagées au foyer sont anonymisées/réattribuées, jamais cascadées ; les règles sont décidées dans la spec (y compris médias co-possédés) *(audit FK + conversions set null en 0166, plan 27-01)*
- [x] **RGDP-06** : Les profils enfants portés par le parent sont purgés en même temps que lui, avec règle produit annoncée en phase
- [x] **RGDP-07** : L'Edge `household-delete` existante est consolidée avec la nouvelle chaîne (une seule voie de suppression)

### Messagerie v2

- [ ] **MSG-01** : Un membre démarre une conversation directe avec un autre membre via RPC serveur avec garde anti-doublon
- [ ] **MSG-02** : Les badges non-lus s'appuient sur un watermark par membre sur la conversation (jamais une écriture par message)
- [ ] **MSG-03** : L'accusé de lecture est visible côté émetteur
- [x] **MSG-04** : Les notifications push sont groupées par conversation (« 2 nouveaux messages de X »), sans contenu du message, chaîne `dispatch_messages`→`push-notify` existante réutilisée
- [ ] **MSG-05** : La publication Realtime (publication `supabase_realtime` self-hosted complétée) est testée par souscription avant d'être annoncée

### Exploitation

- [x] **OPS-01** *(réécrite le 2026-10-28 en discussion de phase — « restic » retiré, décision verrouillée D-02 : les fichiers chiffrés existants de `scripts/backup.sh` sont répliqués tels quels, pas de nouvel outil de backup)* : Sauvegardes nocturnes : pg_dump chiffré + réplication des fichiers chiffrés de `scripts/backup.sh` (volumes `storage`, `functions` et `db-config`) vers une machine tierce auto-hébergée (clé pgsodium sauvegardée séparément du dump, en deux copies disjointes — D-03)
- [ ] **OPS-02** : Exercice de restauration joué sur un Compose isolé (jamais sur la prod) avec RTO mesuré et consigné + runbook exploitable
- [x] **OPS-03** *(réécrite le 2026-10-28 en discussion de phase — la pile Prometheus/Grafana/Loki est retirée au profit d'alertes mail simples)* : Alertes par mail pour disque / certificats / pg_cron / erreurs Edge, chacune prouvée par un déclenchement réel, pas une promesse de configuration
- [x] **OPS-04** : `check-cron-health.sh` valide les jobs pg_cron et attrape une rotation ratée de secret
- [x] **OPS-05** : RPO, RTO et politique de rétention arbitrés et documentés dans `docs/`

### Ouverture des inscriptions

- [ ] **OUV-01** : Un MTA auto-hébergé (Stalwart) établit SPF/DKIM/DMARC pour le domaine, avec une preuve de réception réelle sur Gmail et Outlook
- [ ] **OUV-02** : Confirmations email obligatoires ; SMTP de GoTrue durci (limites de débit applicatives activées)
- [ ] **OUV-03** : Un rate-limit Traefik filtre `/auth/v1/signup` et `/auth/v1/token` contre les abus d'inscription
- [ ] **OUV-04** : Un étranger arrivant sur un lien d'invitation voit un pré-écran pré-auth (« Vous avez été invité au foyer X ») et son token traverse l'inscription jusqu'au foyer
- [ ] **OUV-05** : L'administration du token de foyer expose une gouvernance : expiration obligatoire (défaut 30 j), nombre max d'utilisations (défaut 10), révocation à tout moment
- [ ] **OUV-06** : Les pages mentions légales et confidentialité sont en ligne, avec la politique de purge et de sauvegarde rédigée en langue claire
- [ ] **OUV-07** : L'ouverture passe les portes dures : voie de suppression vivante + exercice de restauration consigné + preuve SMTP (séquence roadmap, pas une promesse)

### Dettes et résidus

- [ ] **DET-01** : L'Edge `generate-routine-occurrences` est branchée au pg_cron quotidien (routines alimentent les occurrences)
- [ ] **DET-02** : Les 3 todos hors-ligne clôturés (amorçage état réseau, compteur juste, faux état hors-ligne « 15 »)
- [ ] **DET-03** : Les semis démo embarquent des photos de recette
- [ ] **DET-04** : Le panneau de version affiche un message crédible quand l'estampille manque
- [ ] **DET-05** : Feuilles mobiles : césures « Anniver-saires » corrigées et animations de sortie sans régression (arbitrage forceMount tranché)

## Exigences v1.1 (hors roadmap actuel)

### Messagerie avancée

- **MSG2-01** : Conversations de groupe constituées librement
- **MSG2-02** : Médias en un clic (photos/réactions) dans la conversation

### Comptes

- **CMPT-01** : Compte enfant autonome avec accès restreint (revisiter AGENTS.md §9, seulement si légitimité confirmée post-v1.0)

## Hors portée

| Fonctionnalité | Raison |
|---------|--------|
| Threads et fils par message | Anti-feature ressortie ; complexité hors proportion pour une messagerie de foyer |
| Chiffrement de bout en bout | Sur-ingénierie self-hosted, aucune demande |
| Accusés de lecture désactivables | Convention du marché ; le watermark est déjà discret, un interrupteur double la surface produit |
| Suppression partielle du compte | Anti-feature RGPD (une suppression à moitié ne vaut rien) |
| Captcha anti-bot self-hosted | Rate-limit Traefik suffisant en v1.0 ; revisiter en cas d'abus constaté |
| SaaS SMTP (Brevo/Mailgun) | Contredit la décision self-hosted/RGPD du projet |
| Réversibilité « tout intact à J+30 » | Le foyer continue de vivre ; seul le compte et ses droits sont restaurés selon les règles de la spec |

## Traçabilité

| Exigence | Phase | Statut |
|-------------|-------|--------|
| ENF-01 | Phase 25 | Done (25-05, panneau Foyer : créer/modifier/archiver un profil enfant) |
| ENF-02 | Phase 25 | Done (25-04) |
| ENF-03 | Phase 25 | Done (25-04, colonnes d'acteur 0146 + traces essayées par 0047/0052) |
| ENF-04 | Phase 25 | Done (25-04, suite complète 83/83 verte) |
| ENF-05 | Phase 25 | Done (25-07 : garde D-06 en un point unique — member-eligibility.ts — branchée aux quatre pickers : un enfant hors-fiche est absent des sélecteurs tâches/routines/menu/ardoise, le serveur 0146 revalide) |
| RGEX-01 | Phase 26 | Complete |
| RGEX-02 | Phase 26 | Complete |
| RGEX-03 | Phase 26 | Complete |
| RGEX-04 | Phase 26 | Complete |
| RGDP-01 | Phase 27 | Complete (27-03 : signOut global + déshumanisation RPC à la demande) |
| RGDP-02 | Phase 27 | Complete (27-03 : e-mail de confirmation + lien d'annulation APP) |
| RGDP-03 | Phase 27 | Complete (27-03 : e-mail J-7 envoyé par l'Edge depuis le cron) |
| RGDP-04 | Phase 27 | Complete (27-02 : purge J+30 SQL pur, manifest médias) |
| RGDP-05 | Phase 27 | Complete (27-01) |
| RGDP-06 | Phase 27 | Complete (27-02 : enfants purgés avec le foyer orphelin, transférés D-08 sinon) |
| RGDP-07 | Phase 27 | Complete (27-03 : Edge unifiée, panneau admin inchangé) |
| OPS-01 | Phase 28 | Complete | 2026-10-29 |
| OPS-02 | Phase 28 | Non joué (absence déclarée opérateur 2026-10-29, « pass » — edda816) : runbook livré mais exercice réel non exécuté, RTO non mesuré ; re-diligence obligatoire phase 31 (porte OUV-07) |
| OPS-03 | Phase 28 | Complete (4 alertes mail prouvées rouge→vert sur prod, mails reçus 2026-10-29 — runbook § Preuves des alertes, 89e5645) |
| OPS-04 | Phase 28 | Complete (check-cron-health.sh 3 axes, rotation ratée attrapée par job de test 15-36 failed, prod 2026-10-29) |
| OPS-05 | Phase 28 | Complete (28-04 : RPO ≤ 24 h / RTO cible ≤ 4 h avec « RTO constaté » réservé à l'exercice 28-05 / rétention GFS dans docs/EXPLOITATION.md ; commandes cron livrées D-05 dans docs/DEPLOIEMENT-PROD.md) |
| MSG-01 | Phase 29 | Pending |
| MSG-02 | Phase 29 | Pending |
| MSG-03 | Phase 29 | Pending |
| MSG-04 | Phase 29 | Pending |
| MSG-05 | Phase 29 | Pending |
| DET-01 | Phase 30 | Pending |
| DET-02 | Phase 30 | Pending |
| DET-03 | Phase 30 | Pending |
| DET-04 | Phase 30 | Pending |
| DET-05 | Phase 30 | Pending |
| OUV-01 | Phase 31 | Pending |
| OUV-02 | Phase 31 | Pending |
| OUV-03 | Phase 31 | Pending |
| OUV-04 | Phase 31 | Pending |
| OUV-05 | Phase 31 | Pending |
| OUV-06 | Phase 31 | Pending |
| OUV-07 | Phase 31 | Pending |

**Couverture :**
- v1.0 : 38 exigences totales (5 ENF + 4 RGEX + 7 RGDP + 5 OPS + 5 MSG + 5 DET + 7 OUV)
- Mappées : 38 ✓ (Phases 25-31 — numérotation continue depuis v0.9.0)
- Non mappées : 0 ✓

---
*Exigences définies : 2026-10-25*
