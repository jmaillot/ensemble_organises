# Phase 39: Outillage prod de vérification - Context

**Gathered:** 2026-11-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Le projet dispose du moyen de créer et purger ses propres comptes e2e en mode prod réel via l'API Admin GoTrue (`createUser` avec `email_confirm: true`, sans réactiver `ENABLE_EMAIL_AUTOCONFIRM`), et la couverture e2e du parcours join-token correspond au flux actuel 31-03 (spec réelle contre stack déployée, run séparé). Script-only côté smoke ; la spec e2e réelle est le second livrable.

Exclusions explicites : le flux « Rejoindre via mon compte » ardoise (phase 40), le branchement automatique du smoke (cron/CI, idée différée), toute surface utilisateur nouvelle.

</domain>

<decisions>
## Implementation Decisions

### Spéc e2e join-token (TEST-02)

- **JT-01: Spec réelle, run séparé.** La spec réécrite exige une stack déployée (E2E_BASE_URL + comptes créés/purgés par l'outillage smoke de cette même phase) et tourne comme run séparé documenté — analogue de `test-dispatch-push.sh` pour le push. La suite e2e standard (build+preview, mode démo) reste 100 % verte sans elle, et son run ne porte plus aucun rouge assumé. — **Reversibility:** reversible — spec locale, exécution conditionnée par une variable d'environnement.
- **JT-02: Couverture = flux complet 31-03.** Création de foyer (token copiable + QR), pré-écran public `/foyer/rejoindre?token=…` nommant l'invitant (D-20), traversée sessionStorage D-06 vers l'inscription, redeem authentifié D-08 avec message D-17, atterrissage non bloquant D-09, message uniforme D-03 sur token mort/expiré. Pas de réécriture « à l'identique » de l'ancienne spec (anti-feature explicite de la recherche).
- **JT-03: Nouveau fichier dédié, ancienne supprimée.** La spec vit dans un nouveau fichier (ex. `app/e2e/join-token-real.spec.ts`) ; les 2 tests de l'ancienne spec (`critical-paths.spec.ts` l.123-139) sont supprimés. Jamais de gating conditionnel « skip sans stack » (recréerait le skip silencieux documenté en phase 38) ni de doublon permanent.
- **JT-04: Outil smoke partagé.** La spec réelle obtient ses comptes via l'outillage smoke partagé (SMOKE-01, décision CS-04) — un seul chemin d'accès à `SUPABASE_SECRET_KEY` à auditer, même discipline de secrets pour les deux consommateurs.

### Création des comptes smoke (SMOKE-01)

- **CS-01: Deux modes auto-détectés dans `scripts/smoke-test.sh`.** Autoconfirm actif (stack dev) → `POST /auth/v1/signup` comme aujourd'hui (l.237, l.358) ; autoconfirm désactivé (prod) → `POST /auth/v1/admin/users` avec `{email, password, email_confirm: true}` (chemin déjà ouvert pour la purge, l.211-212). Le parcours de test reste identique dans les deux mondes — un seul script, la création s'adapte. — **Reversibility:** reversible — script shell, détection par une lecture de config.
- **CS-02: Règles identiques dans les deux modes.** Le refus explicite sans secret (le fallback actuel l.197 « pas de clé secrète → comptes laissés en place » devient un refus, §2.7 F : un smoke partiel muet est un échec inexpliqué) et la purge vérifiée (re-delete → 404 attendu) s'appliquent aussi bien en dev qu'en prod.
- **CS-03: Parcours inchangé.** Les 5 étapes du smoke (inscription, création de foyer, relecture RLS, isolement du foyer voisin, token d'invitation + échange par le second compte) restent telles quelles — seul le mécanisme de création change. La valeur du smoke (prouver la chaîne JWT/RLS réelle) est intacte.
- **CS-04: Interface bibliothèque partagée.** Le smoke expose un mode réutilisable (sous-commandes ou fichier sourcé) que la spec e2e réelle consomme pour créer/purger ses comptes — pas de seconde implémentation de l'accès Admin.

### Déclenchement et rate limits

- **DS-01: Run manuel documenté.** Pas de cron ni de CI (les secrets en CI viole-raient §2.7 H). Le branchement automatique est noté en idée différée.
- **DS-02: 422/429 gérés explicitement.** Créations sérialisées (déjà le cas : Alice puis Bob) + en cas de 422/429 : pause fixe courte et un seul retry, puis échec nommé avec le corps de la réponse. Jamais de retry aveugle ni de backoff générique (il masquerait les vraies erreurs, contraire à §2.7 F).
- **DS-03: Documentation d'exploitation.** Une section « smoke-test prod » dans `docs/EXPLOITATION.md` : quand le lancer (avant release, après changement auth), ce qu'il prouve, comment lire son rapport.

### Emails e2e

- **EE-01: Sous-domaine réservé.** Format `e2e+<runid>@<sous-domaine-réservé>` du domaine réel (ex. `e2e+<runid>@e2e.votredomaine.fr`) — jamais de collision avec un vrai destinataire, tout email `e2e*` du sous-domaine est identifiable comme compte de test. — **Reversibility:** reversible — convention de nommage, changer le format ne coûte qu'une lecture de prefix dans les scripts.
- **EE-02: Détection résiduelle, purge par runid.** En fin de run, le script liste les comptes résiduels `e2e*@<sous-domaine>` via l'Admin API et signale tout survivant (run précédent mal purgé) sans le supprimer — la purge vérifiée reste bornée à ses propres runids (pas d'effet de bord sur un run concurrent).

### the agent's Discretion
- Le mécanisme exact de détection autoconfirm (lecture `ENABLE_EMAIL_AUTOCONFIRM` du `.env` stack vs sonde `POST /auth/v1/signup` de sonde).
- La forme concrète de l'interface bibliothèque (sous-commandes vs fichier sourcé) et le format du runid (timestamp vs uuid).
- La structure interne de la spec réelle (describe blocks, fixtures) et son nom de fichier exact.
- Le sous-domaine réservé précis (à aligner sur la config DNS réelle du déploiement — voir docs/DEPLOIEMENT-PROD.md).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Exigences et critères de la phase
- `.planning/ROADMAP.md` §Phase 39 — goal et 4 success criteria (autoconfirm resté false, purge vérifiée, secrets jamais en argv/ARG, 422/429 gérés, spec réécrite ou suppression consignée)
- `.planning/REQUIREMENTS.md` §TEST-02, SMOKE-01 — exigences verrouillées

### Garde-fous de vérification et secrets
- `AGENTS.md` §2.7 H (secrets — jamais versionnés, jamais argv, jamais `cron.job.command`), §2.7 F (un succès muet est un échec inexpliqué — purge vérifiée par re-delete → 404), §2.7 D (assertions qui peuvent échouer), §8.4 (ARG frontend = URL + clé publiable uniquement)
- `docs/EXPLOITATION.md` — cible de la section smoke-test prod (DS-03)
- `docs/DEPLOIEMENT-PROD.md` — config DNS/domaines réels (EE-01 : sous-domaine réservé à aligner)

### Recherche du jalon
- `.planning/research/SUMMARY.md` §Phase 2 — rationale de l'ordre (smoke d'abord, sert la spec join-token et la phase 40) ; anti-features : réactiver autoconfirm, réécrire la spec « à l'identique »
- `.planning/research/ARCHITECTURE.md` §chaîne smoke (l.87-97) — état actuel du script (SECRET_KEY l.55, purge admin l.211-212, signup autoconfirm l.237/l.358) et plan de branchement Admin API
- `.planning/research/PITFALLS.md` §Pitfall 6 — le smoke qui fuit la clé secrète ou laisse des comptes derrière lui (préfixe `e2e+<runid>@`, 422/429 explicites, refus sans secret)

### Code (source de vérité du comportement actuel)
- `scripts/smoke-test.sh` — script cible ; fallback l.197 à rendre refus, purge admin existante l.211-212 à vérifier par 404
- `app/playwright.config.ts` l.26-30 — la suite standard tourne build+preview (frontend seul) ; la spec réelle devra s'en écarter via E2E_BASE_URL de stack
- `app/e2e/critical-paths.spec.ts` l.123-139 — l'ancienne spec join-token à supprimer
- `app/src/modules/landing/join-household-page.tsx` + `app/src/lib/invites.ts` — le flux 31-03 que la spec réelle vérifie (preview Edge, D-03/D-06/D-08/D-20)
- `app/e2e/offline-shared-device.spec.ts` l.38 — le pattern de gating credentials à NE PAS imiter pour la spec réelle (JT-03 : pas de skip conditionnel)
- `.planning/milestones/v1.0-phases/31-inscriptions-ouvertes/31-03-SUMMARY.md` — définition du flux de référence (D-06/D-07/D-03/D-17/D-09/D-19/D-20, preview Edge 31-02)

### Contexte des phases précédentes
- `.planning/phases/38-filet-de-tests-fiable/38-CONTEXT.md` — J-01/J-02 (la spec a tourné avec son rouge documenté pendant la 38 ; soldée ici) ; gardes anti-skip/anti-renommage à respecter
- `.planning/phases/38-filet-de-tests-fiable/38-E2E-SIGNATURE.md` — baseline des 8 skips datée (2 viewport-gating l.340-547 critical-paths, 1 credentials l.38 offline-shared-device) — la suppression des 2 tests join-token change la signature du run standard

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/smoke-test.sh` — la chaîne complète existe déjà : lecture `.env` sans sourcer (`stack_value`), purge Admin (header `apikey` + `Bearer`), rapport pass/fail structuré ; la phase branche la création admin et l'interface bibliothèque dessus
- `scripts/seed-test-accounts.sh` — cohabite déjà avec le smoke (création de comptes de test) ; modèle de séparation des responsabilités
- Pattern `call`/`json_string` du smoke — réutilisable pour les appels Admin API avec gestion de codes
- La suite e2e standard et son `openDemoSession` — restent intacts ; la spec réelle est un nouveau fichier, pas une branche

### Established Patterns
- §2.7 F : toute purge est vérifiée par un contrôle qui peut échouer (re-delete → 404)
- §2.7 H : secrets lus depuis le `.env` de la stack via `stack_value`, jamais en argv ni dans les ARG frontend
- Gating par environnement : `E2E_BASE_URL` commute build+preview local vs stack déployée (playwright.config) — la spec réelle s'y accroche sans gating de skip
- Les décisions D-xx du flux 31-03 (messages uniformes, traversée sessionStorage) sont testées au niveau unitaire (`join-household-page.test.tsx`) — la spec réelle vérifie la traversée réelle de bout en bout, pas les messages isolés

### Integration Points
- La spec e2e réelle consomme l'interface bibliothèque du smoke (CS-04) : création de N comptes + foyer + token, puis purge vérifiée en teardown
- La signature e2e du jalon change avec cette phase : les 2 rouges join-token disparaissent du run standard (TEST-03 atteint sans exception), le run séparé est documenté
- La phase 40 (ardoise « Rejoindre via mon compte ») dépend de cet outillage pour ses parcours d'adhésion e2e en prod réel

</code_context>

<specifics>
## Specific Ideas

- L'analogie explicite donnée par l'utilisateur : la spec réelle se comporte vis-à-vis de la suite e2e comme `test-dispatch-push.sh` vis-à-vis de `test-db.sh` — un run séparé qui exige une ressource réelle (appareil abonné / stack déployée), documenté, et dont l'absence sur une machine est dite, jamais passée sous silence.
- Le refus sans secret doit « s'arranger à le dire » (comme test-dispatch-push.sh exige un abonnement réel) : un endpoint factice ou un compteur faux serait un chiffre juste et une preuve fausse.

</specifics>

<deferred>
## Deferred Ideas

- Branchement automatique du smoke (cron/pg_cron ou CI) — nécessiterait un verrou anti-concurrent, une notification d'échec et un accès CI aux secrets via Vault : chantier d'exploitation à part entière, hors périmètre SMOKE-01.
- Purge globale du préfixe `e2e*@<sous-domaine>` (auto-réparatrice) — écartée pour cause de risque concurrent ; à réévaluer si les runs restent toujours sérialisés et uniques.

</deferred>

---

*Phase: 39-outillage-prod-de-vérification*
*Context gathered: 2026-11-09*
