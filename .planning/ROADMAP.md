# Roadmap: Ensemble & Organisés

## Milestone: v1.0 — Mise en ligne publique (phases 25-31)

> Jalon v1.0 : profils enfants gérés, RGPD (export + suppression de compte),
> exploitation (sauvegardes/supervision/restauration), messagerie v2,
> hygiène des dettes, puis inscriptions ouvertes en dernier.
> Les phases 1-24 relèvent du jalon v0.9.0 (archivé dans
> .planning/milestones/v0.9.0-ROADMAP.md).
> **Portes dures de séquence :** le renversement d'identité (Phase 25) précède
> toute mécanique de suppression (26-27) ; l'exercice de restauration consigné
> (Phase 28) et la voie de suppression vivante (27) précèdent l'ouverture
> publique (Phase 31 — OUV-07, dernière exigence du jalon).
> *Constraints: phases ordered by dependency gates, not calendar.*

## Phases

- [ ] **Phase 25: Profils enfants gérés par le parent** - Renverser l'identité : un enfant du foyer agit par la médiation d'un parent, sans aucune session
- [ ] **Phase 26: Export RGPD** - Un membre récupère l'archive complète de ses données (JSON + médias) via un lien signé à durée limitée
- [ ] **Phase 27: Suppression de compte RGPD** - Une demande de suppression vivante : sessions tuées, réversibilité 30 j, purge J+30 en SQL pur
- [ ] **Phase 28: Exploitation — sauvegardes, restauration, supervision** - Un sinistre est récupérable et observable : sauvegardes nocturnes, exercice de restauration consigné, alertes fonctionnelles
- [ ] **Phase 29: Messagerie v2** - Conversations directes avec watermark de lecture et notifications groupées, sans écriture par message
- [ ] **Phase 30: Hygiène du jalon — dettes et résidus** - Les dettes connues fermées avant l'ouverture : Edge occurrences, hors-ligne, semis démo, estampille, feuilles mobiles
- [ ] **Phase 31: Inscriptions ouvertes** - Le serveur reçoit des étrangers en sécurité : SMTP livrable, confirmations, rate-limit, invitation pré-auth — derrière les portes dures

## Phase Details

### Phase 25: Profils enfants gérés par le parent

**Goal**: Un enfant du foyer existe comme membre (sélecteurs, attributions, traces) sans jamais posséder de compte d'authentification : un parent agit au nom de l'enfant par des opérations serveur explicitement validées, et la filiation le parent → l'enfant reste auditable. C'est le renversement d'identité du jalon : tout ce qui change « qui peut agir » précède toute mécanique de suppression.
**Depends on**: Rien (première phase du jalon v1.0 ; s'appuie sur les contrats 0113-0116 de v0.9.0)
**Requirements**: ENF-01, ENF-02, ENF-03, ENF-04, ENF-05
**Success Criteria** (what must be TRUE):
  1. Un admin crée, modifie et supprime un profil enfant du foyer depuis l'écran du foyer, et aucun compte d'authentification n'apparaît à la création
  2. Un parent assigne une tâche, coche une routine et réagit dans le Cercle au nom de l'enfant, et la trace porte l'enfant comme attributaire et le parent comme acteur
  3. Un enfant apparaît dans les sélecteurs de tâches, d'ardoise, de messagerie et de menu, comme tout autre membre du foyer
  4. Les tests SQL négatifs prouvent qu'aucun profil enfant n'a de session ni de moyen d'agir par lui-même, et toutes les politiques existantes (tâches, routines, courses, cercle, cadeaux, anniversaires, messages) passent l'audit de la clause « parent du même foyer »

**Plans**: 7 plans

Plans:
**Wave 1**
- [ ] 25-01-PLAN.md — Migration 0144 : socle schématique PAR MEMBRE (managed_modules D-05/D-06 + birth_date + deleted_at D-04) avec tests SQL
- [ ] 25-06-PLAN.md — Correction documentaire : alignement REQUIREMENTS.md/ROADMAP.md sur D-12 (modération, critère #2) et D-06 (sélecteurs du socle, critère #3)

**Wave 2** *(blocked on Wave 1 completion)*
- [ ] 25-02-PLAN.md — Migration 0145 : conversion RPC des comptes enfants (checkpoint D-18), invariant chk_members_managed_child, fermeture des chemins 0006/0036, migrate [BLOCKING]

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 25-03-PLAN.md — Migration 0146 (`0146_child_behavior_guards.sql`) : helpers par membre, RPC de fiche D-01 (create/update/archive deleted_at, périmètre D-06 des cinq espaces gardés), gardes de module (replace_*), colonnes d'acteur ENF-03 en text, RPC complete_routine_occurrence (refus adulte→adulte D-13), Cercle DELETE modération adulte (D-12), clauses D-06 (conversations, birthdays, meal_entries)

**Wave 4** *(blocked on Wave 3 completion)*
- [ ] 25-04-PLAN.md — Migrations 0147/0148 : push D-23 (redirection vers les adultes, zéro enfant) + fusion link_managed_child (D-19/D-20/D-18bis) + barrière [BLOCKING] finale test-db.sh SANS argument

**Wave 5** *(blocked on Wave 4 completion)*
- [ ] 25-05-PLAN.md — Frontend : useIsAdult (D-01), CRUD enfants DANS la liste des membres via RPC (D-01/D-02), filtre deleted_at unique dans household-store (D-04), espaces par membre (D-05), modération Cercle (D-12), CTA « Donner accès » (D-21), tests Vitest Wave-0 + fixture Playwright

**Wave 6** *(blocked on Wave 5 completion)*
- [ ] 25-07-PLAN.md — Garde UI D-06 : member-eligibility.ts (fonction pure), quatre pickers inline branchés, « Cocher pour » sur la carte de routine (D-08/D-11), rebranchage markOccurrenceDone → RPC complete_routine_occurrence

**UI hint**: yes

### Phase 26: Export RGPD

**Goal**: Un membre demande et obtient l'archive complète de ses données personnelles (JSON structuré + médias, ZIP) par un lien signé sur bucket privé qui expire, sans bloquer l'application et sans jamais livrer la donnée d'un autre membre — la définition de la portée multi-foyers est tranchée en SPEC produit avant toute requête SQL.
**Depends on**: Phase 25 (le périmètre d'identité doit être stabilisé avant de définir « à qui correspond la donnée »)
**Requirements**: RGEX-01, RGEX-02, RGEX-03, RGEX-04
**Success Criteria** (what must be TRUE):
  1. Un membre déclenche son export depuis l'application, voit le statut du job d'export et reçoit une notification à l'achèvement
  2. L'archive téléchargée contient le JSON structuré et les médias du demandeur, via une URL signée sur `gdpr-exports` expirée au plus tard 24 h après l'émission
  3. Les tests SQL négatifs prouvent qu'un export ne déborde jamais sur un autre foyer ni sur la donnée des autres membres du foyer
  4. Le contenu du bucket `gdpr-exports` disparaît au bout de 7 jours par le pg_cron existant — vérifié en base, pas par un pari HTTP

**Plans**: TBD
**UI hint**: yes

### Phase 27: Suppression de compte RGPD

**Goal**: La voie de suppression de compte existe et est annulable : sessions tuées immédiatement, surface publique anonymisée, réversibilité 30 j par email de confirmation, alerte à J-7, purge effective J+30 purement SQL/pg_cron — et l'Edge `household-delete` consolidée en une seule voie. L'audit des FK vers `auth.users` et les règles produit (médias co-possédés, profils enfants portés par le parent) sont tranchés en SPEC avant migration.
**Depends on**: Phase 26 (l'export est proposé avant de offrir la suppression) ; Phase 25 (les profils enfant sautent avec le parent : RGDP-06)
**Requirements**: RGDP-01, RGDP-02, RGDP-03, RGDP-04, RGDP-05, RGDP-06, RGDP-07
**Success Criteria** (what must be TRUE):
  1. Un utilisateur demande la suppression : ses sessions meurent immédiatement, sa surface publique est anonymisée, et un email de confirmation permet d'annuler la demande
  2. La demande annulée pendant 30 jours restaure le compte selon les règles de la spec, et un email d'alerte part à J-7 avant la purge
  3. La purge J+30 s'exécute en SQL/pg_cron depuis un manifest de médias construit à la demande — aucun envoi HTTP depuis le cron — et les données partagées au foyer sont anonymisées ou réattribuées, jamais cascadées (audit FK consigné en SPEC)
  4. Les profils enfants portés par le compte supprimé disparaissent avec lui selon la règle produit annoncée dans la phase, et la chaîne passe par la consolidation de `household-delete` (une seule voie de suppression vivante)

**Plans**: TBD

### Phase 28: Exploitation — sauvegardes, restauration, supervision

**Goal**: Un sinistre n'est plus une loterie : sauvegardes nocturnes chiffrées (pg_dump + restic sur les volumes et la clé pgsodium sauvegardée séparément), un exercice de restauration complet joué sur un Compose isolé avec RTO mesuré et consigné, supervision Prometheus/Grafana/Loki avec alertes testées — et l'arbitrage RPO/RTO/rétention écrit dans `docs/`. **Livrable de porte : c'est l'exercice de restauration consigné (OPS-02) qui conditionne l'ouverture publique (Phase 31).**
**Depends on**: Phase 25 (les migrations peuvent s'appliquer sur la pile restaurée ; orthogonale aux phases 26-27)
**Requirements**: OPS-01, OPS-02, OPS-03, OPS-04, OPS-05
**Success Criteria** (what must be TRUE):
  1. Une sauvegarde nocturne produite automatiquement contient le dump chiffré, les volumes `storage`/`functions` et `db-config`, la clé pgsodium étant sauvegardée séparément du dump
  2. Un exercice de restauration est joué sur un Compose isolé (jamais la prod), le RTO est mesuré et consigné, et le runbook de restauration permet à une autre session de rejouer sans deviner
  3. Une alerte disque, une alerte certificat, une alerte pg_cron et une alerte erreurs Edge se déclenchent et sont visibles dans la supervision déployée — chacune prouvée par un test déclenché, pas par une promesse de configuration
  4. `check-cron-health.sh` valide les jobs pg_cron et attrape effectivement une rotation de secret ratée (prouvé rouge→vert)
  5. RPO, RTO et politique de rétention sont arbitrés et documentés dans `docs/`

**Plans**: TBD

### Phase 29: Messagerie v2

**Goal**: La messagerie évolue en v2 humainement utilisable : conversations directes démarrées par RPC avec garde anti-doublon, accusé de lecture par watermark par membre (aucune écriture par message — décision de migration, pas un retrofit), notifications groupées sans contenu de message réutilisant la chaîne push existante, et Realtime dont la publication self-hosted est testée par souscription avant d'être annoncée. La phase bénéficie de la Phase 25 : le member-picker rend les profils enfants correctement.
**Depends on**: Phase 25 (sélecteur de membres incluant les enfants gérés)
**Requirements**: MSG-01, MSG-02, MSG-03, MSG-04, MSG-05
**Success Criteria** (what must be TRUE):
  1. Un membre démarre une conversation directe depuis un autre membre, un second essai avec le même membre rouvre la conversation existante au lieu d'en créer un doublon
  2. L'émetteur voit l'accusé de lecture, alimenté par un watermark par membre — aucune écriture par message dans la base
  3. Les notifications push sont groupées par conversation (« 2 nouveaux messages de X ») sans jamais contenir le contenu du message, via la chaîne `dispatch_messages`→`push-notify` existante
  4. La publication `supabase_realtime` self-hosted est complétée et prouvée par une souscription réelle qui reçoit un événement à l'insertion

**Plans**: TBD
**UI hint**: yes

### Phase 30: Hygiène du jalon — dettes et résidus

**Goal**: Les dettes et résidus connus sont fermés avant le go-live public : l'Edge `generate-routine-occurrences` alimente enfin les routines au quotidien, les trois todos hors-ligne tombent (amorçage réseau, compteur, faux état hors-ligne), les semis démo portent des photos de recette, le panneau de version dit quelque chose de crédible sans estampille, et les feuilles mobiles ne césurent plus « Anniver-saires » ni ne régressent visuellement (arbitrage forceMount tranché).
**Depends on**: Phase 29 (orthogonale ; placée avant la porte d'ouverture pour ne pas livrer un public sur une dette connue)
**Requirements**: DET-01, DET-02, DET-03, DET-04, DET-05
**Success Criteria** (what must be TRUE):
  1. Chaque matin, une occurrence de routine est créée automatiquement (Edge branchée au pg_cron) et visible dans la vue du jour
  2. L'amorçage d'état réseau fonctionne dès la première navigation, le compteur hors-ligne affiche une valeur juste, et le faux état hors-ligne « 15 » ne réapparaît plus
  3. Les semis démo embarquent des recettes avec photos illustrant les tuiles et fiches
  4. Sans estampille de build, le panneau de version affiche un message crédible (jamais « 0.1.0 » inventé) — complément des findings de la phase 24
  5. Les feuilles mobiles rendent « Anniversaires » sans césure disgracieuse et avec animations de sortie cohérentes, e2e au vert (arbitrage forceMount consigné)

**Plans**: TBD
**UI hint**: yes

### Phase 31: Inscriptions ouvertes

**Goal**: Le serveur accueille des étrangers en sécurité et avec une voie de sortie : un MTA auto-hébergé (Stalwart) livrable au domaine (SPF/DKIM/DMARC, preuve de réception réelle sur Gmail et Outlook), confirmations email obligatoires et SMTP GoTrue durci, rate-limit Traefik sur `/auth/v1/signup|token`, invitation pré-auth traversant l'inscription, gouvernance du token de foyer (expiration 30 j défaut, max 10 utilisations, révocation), pages légales en ligne. **Dernière phase du jalon : la porte dure OUV-07 exige la voie de suppression vivante (27), l'exercice de restauration consigné (28) et la preuve SMTP.**
**Depends on**: Phase 27 (porte : voie de suppression vivante) ; Phase 28 (porte : exercice de restauration + supervision consignés) ; Phase 30 (aucune dette connue au go-live)
**Requirements**: OUV-01, OUV-02, OUV-03, OUV-04, OUV-05, OUV-06, OUV-07
**Success Criteria** (what must be TRUE):
  1. Un email de confirmation envoyé par la stack (MTA auto-hébergé, SPF/DKIM/DMARC en place) est réellement reçu et délivré en boîte de réception sur Gmail ET Outlook — preuve de réception consignée, pas supposée
  2. Une inscription sans confirmation d'email ne parvient pas à se connecter, et le rate-limit Traefik bloque effectivement les rafales sur `/auth/v1/signup` et `/auth/v1/token` (prouvé par test)
  3. Un étranger arrivant sur un lien d'invitation voit le pré-écran pré-auth (« Vous avez été invité au foyer X ») et son token traverse l'inscription jusqu'au foyer ; un admin peut définir l'expiration et le max d'utilisations du token, et le révoquer à tout moment
  4. Les pages mentions légales et confidentialité sont en ligne, avec la politique de purge et de sauvegarde rédigée en langue claire
  5. Les portes dures OUV-07 sont vérifiées sur le jalon : voie de suppression vivante + exercice de restauration consigné + preuve SMTP — séquence prouvée par l'état des phases 27-28, pas par un engagement

**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 25. Profils enfants gérés | 0/? | Not started | - |
| 26. Export RGPD | 0/? | Not started | - |
| 27. Suppression de compte RGPD | 0/? | Not started | - |
| 28. Exploitation | 0/? | Not started | - |
| 29. Messagerie v2 | 0/? | Not started | - |
| 30. Hygiène du jalon | 0/? | Not started | - |
| 31. Inscriptions ouvertes | 0/? | Not started | - |

## Couverture v1.0

38/38 exigences v1.0 mappées (ENF 25, RGEX 26, RGDP 27, OPS 28, MSG 29, DET 30, OUV 31) — aucun orphelin, aucun doublon.

## Portes de séquence (rappel)

- **25 → 26/27** : le renversement d'identité (enfants sans session) précède toute mécanique de suppression.
- **26 → 27** : l'export est proposé avant l'offre de suppression.
- **28 → 31** : l'exercice de restauration consigné (OPS-02) conditionne l'ouverture publique.
- **27 + 28 + 30 → 31** : la porte dure OUV-07 — suppression vivante, restauration consignée, preuve SMTP.
- **29 ∥ 26/27/28** : la messagerie est orthogonale mais s'appuie sur la Phase 25 (member-picker).

*(Le fichier `REQUIREMENTS.md` porte la table de traçabilité correspondante ; ces fichiers de planification vivent sur le disque uniquement, conformément à la politique du dépôt.)*
