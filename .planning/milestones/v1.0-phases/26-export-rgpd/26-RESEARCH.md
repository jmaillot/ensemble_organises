# Phase 26: Export RGPD - Research

**Researched:** 2026-10-26
**Domain:** Supabase self-hosted — Storage privé + URL signée, job asynchrone piloté par pg_cron/pg_net, Edge Function Deno (assembly ZIP), RLS multi-foyers, panneau Paramètres React
**Confidence:** HIGH (contraintes runtime) / MEDIUM (mécanique streaming ZIP, à prouver par spike tôt dans l'exécution)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** À l'achèvement du job, le membre est prévenu par **push** (via la chaîne existante `dispatch_messages` → `push-notify`) **et** voit le statut mis à jour dans l'app. Réutilise le mécanisme de notification D-23 de la phase 25.
- **D-02:** En cas d'**échec** du job, l'échec est **notifié comme le succès** : push + statut d'erreur dans l'app, et l'opération reste **retentable**. Jamais d'échec silencieux.
- **D-03:** Pendant le job, l'écran affiche **3 états** (en attente → en cours → prêt) + la **durée écoulée**. Pas de pourcentage de progression.
- **D-04:** La push et la notification in-app disent seulement « votre archive est prête » ; le **téléchargement passe obligatoirement par l'écran export** (via l'historique). Un seul endroit où vit le lien signé.
- **D-05:** Le déclencheur vit dans un **panneau « Mes données (RGPD) »** dans Paramètres (`app/src/modules/parametres/`), à côté de `household-delete-panel.tsx`. Le panneau porte aussi le statut du job et l'historique.
- **D-06:** **Un seul job actif à la fois par membre** ; un nouveau déclenchement possible dès que le job en cours est terminé (succès **ou** échec). Pas de plafond 1/24 h.
- **D-07:** Le panneau liste l'**historique des exports passés** (date, statut, lien signé tant qu'il est vivant ≤ 24 h).
- **D-08:** **Tout membre avec session** peut déclencher son export — pas de restriction admin. Les profils enfants n'entrent pas en jeu : ils n'ont aucune session (invariant 0145).

### the agent's Discretion
- Portée multi-foyers et périmètre exact du JSON — **tranchés en SPEC produit avant toute requête SQL** (exigence du ROADMAP). D-22 phase 25 (un enfant = un foyer) est une contrainte d'entrée, pas la réponse.
- Format du JSON, organisation interne du ZIP, nom du fichier archive.
- Détails de la table de jobs : colonnes, états, index.
- Mécanique de construction du ZIP et taille de lot de copie des médias.
- Message exact des push et libellés UI.
- Politique Storage du bucket `gdpr-exports` (chemins, durées de signature ≤ 24 h).

### Deferred Ideas (OUT OF SCOPE)
- Suppression de compte RGPD (RGDP-01…07, phase 27), purge des profils enfants avec le parent (RGDP-06), consolidation de l'Edge `household-delete` (RGDP-07). Aucune modification de la chaîne de suppression.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RGEX-01 | Export complet (JSON + médias, ZIP) via lien signé sur bucket privé, URL expirée ≤ 24 h | `createSignedUrl(path, seconds)` officiel [VERIFIED: Context7 supabase storage/serving/downloads] ; précédent in-repo ardoise 30 j, recettes 3600 s [VERIFIED: app/src/modules/ardoise/api.test.ts:138] ; bucket privé créé en migration sur le formalisme 0010 |
| RGEX-02 | Asynchrone (statut visible, notification) pour un foyer de plusieurs centaines de Mo | **Contrainte dure découverte** : worker Edge Runtime = 150 Mo / 60 s [VERIFIED: volumes/functions/main/index.ts:203-204] → job multipasse obligatoire, ZIP assemblé en streaming (fflate) et uploadé en flux |
| RGEX-03 | Borné à la seule donnée du demandeur ; tests SQL négatifs inter-foyers obligatoires | Extraction via RPC `SECURITY DEFINER` bornée au demandeur (motif 0146/0148) ; cas négatifs testkit (`expect_denied`, comptages bornés §2.7D) [VERIFIED: supabase/tests/_setup.sql, 0157] |
| RGEX-04 | Contenu de `gdpr-exports` purgé à 7 jours par le pg_cron existant | Purge = job pg_cron (formalisme 0011 `schedule_in_database` + `eo-` prefix) → pg_net → Edge mode `secret` (le seul chemin qui supprime réellement les octets disque) ; preuve en base : `cron.job_run_details` + table d'audit de purge |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- **§2.6 RLS** : frontière d'autorisation finale en base ; opérations sensibles côté serveur avec la clé secrète, jamais depuis le client ; jamais d'URL signée stockée en base (précédent phase 25 : « précédent du dépôt : jamais une URL signée stockée ») — le lien signé de l'export est **calculé à la demande** et ne persiste jamais.
- **§2.7 Chaîne avant commit** : `npm run typecheck && npm test && npm run build`, e2e, `check-sql-statique.py` (+ ses propres tests), `test-db.sh` **obligatoire pour tout changement SQL** ; `test-dispatch-push.sh` en plus quand une chaîne pg_net → push réelle est touchée (ici : la purge et la notification d'achèvement).
- **§2.7A** : jamais de réécriture de migration appliquée ; corrections vers l'avant ; `search_path = ''` + qualification `public.<table>` partout.
- **§2.7F** : un succès muet est un échec inexpliqué — le job d'export doit rendre compte de chaque passage (état + erreur), purge et isolement prouvés, pas présumés.
- **Aucun linter** ; commentaires en français qui nomment la raison ; pas de directive d'omission de dépendance.
- **§8** : Edge Functions déployées par `scripts/deploy-functions.sh` dans `supabase/functions/` ; déclaration explicite des modes `withSupabase` ; secrets via Vault, jamais dans `cron.job.command`.
- **UI** : zones tactiles, états vides soignés, modale de confirmation pour actions destructrices (§6) ; le panneau suit les conventions `parametres/` (`components/`, `api.ts`, `types.ts`).

## Summary

L'infrastructure nécessaire existe déjà dans le dépôt : buckets privés avec politiques par préfixe (0010), jobs pg_cron installés par `cron.schedule_in_database` avec préfixe `eo-` (0011, 0129), déclenchement HTTP depuis SQL via `net.http_post` avec clé lue dans Vault (0019 `post_push_dispatch`), Edge Functions à modes d'auth déclarés (`household-delete`, `push-notify`), chaîne push multi-scopes (`due_push_notifications(scope)`), et un panneau Paramètres dont `household-delete-panel.tsx` est le jumeau structurel. La phase est donc un **assemblage de motifs existants**, pas une nouvelle infrastructure.

La découverte déterminante de cette recherche est la contrainte de runtime **verifiée dans le dépôt** : le worker edge exécute chaque requête avec `memoryLimitMb = 150` et `workerTimeoutMs = 60 000` (bootstrap épinglé du snapshot). Un export de « plusieurs centaines de Mo » (RGEX-02) ne peut donc **pas** être assemblé en un seul appel de fonction — il exige un job **multipasse** : copie serveur-à-serveur des médias (cross-bucket `copy`, zéro mémoire), extraction JSON par lots, puis assemblage final du ZIP **en streaming** (fflate, STORE pour les médias déjà compressés), uploadé en flux vers `gdpr-exports`. Le pilote du job est le pg_cron existant (chaque passage ≤ 60 s, idempotent, relancé à la minute) — un passage tué par le timeout est naturellement redriven, ce qui répond à D-02 sans mécanisme de retry dédié.

Deux frontières doivent être prouvées, pas présumées : (1) l'upload de flux ReadableStream via storage-js dans Deno [ASSUMED — motif documenté côté Supabase mais jamais exercé dans ce dépôt] → **spike de validation en début d'exécution** ; (2) la purge des octets — supprimer une ligne `storage.objects` en SQL laisse le fichier sur disque, la purge doit donc traverser l'API Storage (exactement le motif pg_net → Edge `secret` du dispatch push, qui fait déjà la même chose chaque minute depuis cron).

**Primary recommendation :** table `gdpr_export_jobs` + bucket `gdpr-exports` (<user_id>/<job_id>/) ; déclenchement par RPC vérifiant l'acteur ; job piloté par cron-minute idempotent multipasse ; extraction JSON par RPC `SECURITY DEFINER` bornées au demandeur avec tests SQL négatifs ; assemblage ZIP streaming fflate ; URL signée calculée à la demande (jamais stockée) ; purge par cron quotidien → Edge `secret` + table d'audit ; notification par nouveau scope push suivant le patron 0147.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Déclenchement + unicité du job (D-06) | Database (RPC) | — | Vérification d'acteur + index unique partiel en base ; jamais d'écriture client directe (§2.6) |
| Extraction JSON (périmètre du demandeur) | Database (RPC `SECURITY DEFINER`) | Edge Function (appels) | La borne d'isolement vit en SQL, testée par test-db.sh ; la fonction ne fait que lire via le RPC |
| Copie des médias vers le staging | Edge Function | Storage API (cross-bucket copy) | Copie serveur-à-serveur, mémoire nulle ; l'API Storage fait le travail |
| Assemblage ZIP + upload | Edge Function (Deno) | Storage API | Streaming fflate → upload flux ; contrainte 150 Mo / 60 s du worker |
| Statut + historique (D-03, D-07) | Database (lecture RLS) | Frontend (TanStack Query polling) | La ligne de job appartient au demandeur, RLS suffit ; polling naturel avec durée écoulée |
| Lien signé (D-04, RGEX-01) | Edge Function ou RPC serveur | Frontend (téléchargement) | `createSignedUrl` avec la clé nécessaire, après contrôle que le job appartient au demandeur ; jamais persisté |
| Notification d'achèvement (D-01) | Database (chaîne push) | Edge `push-notify` | Nouveau scope suivant le patron `due_push_notifications`/0147 — aucune infrastructure nouvelle |
| Purge 7 jours (RGEX-04) | Database (pg_cron + pg_net) | Edge `secret` | Seul chemin supprimant les octets disque ; le SQL purge déjà les tables (motif `prune_expired_invite_tokens` 0011) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Supabase Storage API | épinglé (stack self-hosted v0.8.2) | Bucket privé `gdpr-exports`, `createSignedUrl`, cross-bucket `copy` | Officiel, motifs 0010 existants [VERIFIED: supabase/migrations/0010_storage_and_realtime.sql:13-22] |
| pg_cron + pg_net + Vault | fournis par le snapshot | Pilotage minute du job, purge quotidienne, déclenchement HTTP sans secret en clair | Motifs 0011/0129/0019 existants [VERIFIED: supabase/migrations/0011_cron.sql:376-388] |
| @supabase/supabase-js@2 (Deno, `npm:`) | v2 | Accès DB admin + Storage depuis l'Edge Function | Conventions de toutes les fonctions existantes [VERIFIED: household-delete/index.ts:27-29] |
| fflate | 0.8.3 | ZIP en streaming (ZipPassThrough, STORE pour médias) dans Deno | Streaming + faible mémoire ; 49,6 M téléch./sem., repo actif [VERIFIED: gsd package-legitimacy + npm view] |
| TanStack Query v5 | v5 (déjà en place) | Polling du statut (3 états + durée écoulée) | Conventions modules existantes ; pas de Realtime à ajouter |
| React Hook Form v7 + Zod v4 | déjà en place | Aucun formulaire complexe ici ; zod inutile côté panneau — usage minimal | — |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| web-push (existence) | — | Non touché : la chaîne `push-notify` réexpédie | D-01 uniquement via nouveau scope SQL |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fflate streaming | jszip 3.10.2 | jszip exige tout l'archive en mémoire (Blob emit) — incompatible avec la limite 150 Mo du worker ; écarté |
| Cross-bucket `copy` | download+upload manuel | copy est serveur-à-serveur (0 mémoire, rapide) ; option officielle `destinationBucket` [CITED: supabase docs copy-move-objects] — le download+upload reste le fallback si la storage-api épinglée refuse |
| Polling TanStack Query | Realtime sur la table de jobs | Nécessiterait `alter publication supabase_realtime` sur le self-hosted (pièce pointée en STATE.md) ; D-03 exige de toute façon un timer (dure écoulée) → polling plus simple, une dépendance de moins |
| Fonction auto-récursive (se ré-appelle via pg_net) | Driver cron-minute | Le cron redrive tout passage tué/échoué sans code de retry ; bornage par lease sur la ligne de job |

**Installation:** aucune dépendance npm côté `app/` (frontend). Côté Edge : `npm:fflate@0.8.3` dans les imports Deno (résolu par le cache Deno de la stack au déploiement `deploy-functions.sh`).

**Version verification:** `npm view fflate version` → 0.8.3 (publié 2026-05-16) ; `npm view jszip version` → 3.10.2 (2026-09-08) [VERIFIED: npm registry, this session].

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| fflate | npm | actif (0.8.3, 2026-05) | ~49,6 M/sem | github.com/101arrowz/fflate | OK | Approved (usage Edge Deno uniquement) |
| jszip | npm | actif (3.10.2, 2026-09) | ~44,7 M/sem | github.com/Stuk/jszip | OK | Non retenu (mémoire) — non installé |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

⚠️ fflate est consommé **uniquement** par l'Edge Function via `npm:fflate@0.8.3` (résolu Deno, pas par `package.json` de `app/`). Compat Deno parfaitement standard pour fflate/ESM mais **non exercée dans ce dépôt** → couverte par le spike de validation (Wave 0).

## Architecture Patterns

### System Architecture Diagram

```
[UI panneau RGPD] ── bouton « exporter » ──▶ [RPC public.request_gdpr_export]
                                                │ vérifie acteur + unicité (index partiel,
                                                │ statut ready/failed ⇒ nouveau job autorisé)
                                                ▼
                                        [gdpr_export_jobs : status='en_attente']
                                                │
              ┌─────────────────────────────────┴──────────────────────────────┐
              │ driver : pg_cron minute (redrive tout job non terminé, lease)  │
              │ + déclenchement immédiat au moment de la demande (snappy)      │
              └───────────────┬────────────────────────────────────────────────┘
                              │ net.http_post (clé Vault, motif 0019:475-514)
                              ▼
              [Edge gdpr-export-run — auth 'secret', passe unique ≤60s/150Mo]
                    │ passe Extraction : RPC SECURITY DEFINER bornées au
                    │   demandeur → JSON par module (lot suivant selon curseur)
                    │ passe Médias : storage.from('household-media'|'household-avatars')
                    │   .copy(chemin source, staging, { destinationBucket: 'gdpr-exports' })
                    │ passe Finale : list(staging) → stream fflate (STORE médias,
                    │   DEFLATE JSON) → upload flux → gdpr-exports/<uid>/<job>.zip
                    ▼
              statut.job = 'pret' (ou 'echec' + raison) ; notifié_push = false
                              │
        ┌─────────────────────┴──────────────────────┐
        ▼                                            ▼
[chaîne push : scope 'export' de                  [UI : polling 3 états +
 due_push_notifications (patron 0147)]             durée écoulée, bouton
        │ eo-push-dispatch * * * * *               « télécharger » si vivant]
        ▼
[push-notify] ── push « votre archive est prête » ─▶ appareils du demandeur

Téléchargement : UI → [RPC/Edge contrôle job∩demandeur] → createSignedUrl(TTL ≤ 24h)
                     → URL signée jetable (jamais stockée)

Purge : pg_cron quotidien (fuseau Europe/Paris, motif 0011) → net.http_post
        → [Edge gdpr-export-purge — auth 'secret'] supprime objets ≥ 7 j
        → table d'audit de purge (preuve en base, cron.job_run_details)
```

### Recommended Project Structure

```
supabase/migrations/0158_gdpr_export.sql        # bucket + policies + table jobs + RPC + scope push + cron
supabase/functions/gdpr-export-run/index.ts     # passes du job (extraction/médias/ZIP)
supabase/functions/gdpr-export-purge/index.ts   # purge 7 j (mode 'secret')
supabase/tests/0158_gdpr_export.sql             # négatifs inter-foyers + garde unicité + purge SQL
app/src/modules/parametres/
  ├── components/gdpr-export-panel.tsx          # D-05 : déclencheur + 3 états + historique
  ├── components/gdpr-export-panel.test.tsx
  ├── api.ts                                    # + requestGdprExport, fetchGdprExports (ou api dédié)
  └── types.ts
```

### Pattern 1 : Job multipasse idempotent, driver cron

**What:** chaque invocation de la Edge Function accomplit un lot borné (curseur de progression sur la ligne de job : `cursor_module`, `cursor_offset`, `staging_ready`…) puis **retourne** ; le cron-minute redrive jusqu'à achèvement. Une passe en cours est protégée par un lease (`pass_started_at` + délai de grâce) pour éviter deux workers en parallèle.
**When to use:** tout travail dont la durée peut dépasser 60 s ou la mémoire 150 Mo.
**Example (contrainte fondatrice — in-repo) :**
```ts
// Source: supabase-project/volumes/functions/main/index.ts:203-204 (verbatim)
const memoryLimitMb = 150
const workerTimeoutMs = 1 * 60 * 1000
```

### Pattern 2 : Déclenchement HTTP depuis SQL avec secret Vault (motif existant)

**What:** une fonction privée `security definer` lit l'URL de la gateway et la clé secrète dans `vault.decrypted_secrets` et POSTe via `net.http_post` — jamais de secret dans `cron.job.command` (§2.2/§2.7H).
**Source:** `private.post_push_dispatch` (0019:475-514), extrait verbatim :
```sql
-- perform net.http_post(
--   url := rtrim(v_url, '/') || '/functions/v1/push-notify',
-- ...
-- comment: 'POST /functions/v1/push-notify, clé secrète lue dans Vault.';
```

### Pattern 3 : Panneau Paramètres jumeau

**What:** `gdpr-export-panel.tsx` suit `household-delete-panel.tsx` : composant dans `components/`, mutations via `api.ts`, TanStack Query, modale de confirmation si action lourde, état vide soigné. Le polling D-03/D-07 est un simple `useQuery({ refetchInterval: 4000 })` tant qu'un job est en attente/en cours.

### Anti-Patterns to Avoid

- **Assemblage du ZIP en mémoire (ArrayBuffer/Blob complet) :** dépasse les 150 Mo du worker dès ~100 Mo de médias → streaming fflate obligatoire.
- **Dépendre d'un seul appel HTTP pour le résultat (motif proscrit §2.7) :** une passe qui meurt au timeout doit être redriva­ble par cron, jamais « perdue ».
- **Stocker l'URL signée en base :** contrevenant au précédent du dépôt (phase 25) ; elle se calcule à la demande et meurt au TTL.
- **Supprimer des lignes `storage.objects` en SQL pour purger :** les octets restent sur disque — la purge Storage doit passer par l'API Storage (HTTP), avec audit en base pour la preuve RGEX-04.
- **Extraire les données directement avec le client admin dans la Edge Function :** la borne d'isolement vit dans des RPC `SECURITY DEFINER` testées en base ; le client admin sert au transport, jamais à la définition du périmètre (RGEX-03).
- **Realtime sur la table de jobs :** publication à modifier sur le self-hosted, dépendance inutile — le polling suffit (D-03).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Format ZIP | Écrire un writer ZIP maison | fflate (Zip/ZipPassThrough) | Conteneur ZIP centrale-répertoire, CRC32, multi-entrée : très piégeux à la main |
| Lien de téléchargement expirant | Token maison dans une Edge | `createSignedUrl(path, seconds)` | Signé par la storage-api, TTL borné, mécanisme déjà utilisé (ardoise/recettes) |
| Notification push | Nouveau canal | Scope de `due_push_notifications` + `push-notify` existants | Chaîne éprouvée, chiffrement RFC 8291 déjà vérifié par Vitest |
| Planification/purge vieillie | Daemon hors SQL | pg_cron `schedule_in_database` (formalisme 0011) | Fuseau, unschedule idempotent, historique `cron.job_run_details` |
| Secrets d'appel serveur | Clé dans le code/env du job | Vault `decrypted_secrets` (motif 0019) | §2.7H : jamais de secret en ligne de commande ni dans `cron.job.command` |
| Unicité « un job actif par membre » | Vérif applicative seule | Index unique partiel en base | La course concurrente ne se règle pas dans l'app |

**Key insight:** tout ce qui est sensé est déjà un motif in-repo ; la seule mécanique réellement nouvelle (ZIP streaming dans Deno) doit être prouvée par un spike, pas supposée.

## Runtime State Inventory

Phase non-rename / non-migration — inventaire limité à ce que la phase doit *découvrir* :

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Données exportables = tables métier (tasks/events/notes/expenses/posts/recipes/…) + Storage `household-media`/`household-avatars` sous `<household_id>/…` [VERIFIED: 0010_storage_and_realtime.sql:4-6] | Périmètre exact tranché en SPEC AVANT les requêtes (exigence ROADMAP) |
| Live service config | Jobs pg_cron existants (`eo-*`) — aucun lié à GDPR ; publication Realtime non concernée (polling) | Aucun ; nouveaux jobs ajoutés en 0158 |
| OS-registered state | Aucun (tout vit dans Docker/Postgres) | Vérifié : rien — dépôt exclusivement conteneurisé |
| Secrets/env vars | Clés push/VAPID existantes ; nouvelle clé **non requise** (la purge et le run utilisent la clé secrète service déjà dans Vault) | Aucun nouveau secret |
| Build artifacts | Functions copiées dans `supabase-project/volumes/functions` par `deploy-functions.sh` | Relancer le script après ajout des deux fonctions |

## Common Pitfalls

### Pitfall 1 : dépasser 150 Mo / 60 s du worker edge
**Cause supposée connue et ignorée** → crash OOM ou kill au timeout en plein build ZIP. **Source vérifiée** : bootstrap `main/index.ts:203-204` du snapshot épinglé. **Éviter** : multipasse + streaming + STORE (les médias jpeg/png/webp/mp4 sont déjà compressés, les re-déflater ne gagne rien et coûte du CPU). **Signe d'alerte** : `worker fetch` renvoyant 500 `{ msg: ... }` côté `main/index.ts:225-229`.

### Pitfall 2 : l'upload en flux via storage-js n'est pas encore prouvé ici
**Cause** : la doc officielle montre `upload(path, fileContent.body!)` avec un stream [CITED: supabase docs functions/storage-caching], mais aucun code du dépôt n'upload un ReadableStream. **Éviter** : spike dédié en tout début d'exécution (tâche plan 26-01), fallback documenté : upload par lots `Blob` bornés (sous-chunks) ou邮政 pieces.

### Pitfall 3 : cross-bucket copy refusée par la version épinglée de la storage-api
**Cause** : l'option `destinationBucket` de `copy` est documentée côté supabase-js [CITED: supabase docs copy-move-objects] mais dépend de la version de storage-api de la stack. **Éviter** : tester la copie dans le spike ; fallback = download stream + upload stream (mémoire ≈ 1 objet, acceptable passe par passe).

### Pitfall 4 : isolement inter-foyers quand la fonction porte la clé secrète
**Cause** : le client admin court-circuite la RLS ; toute erreur de filtre livre le foyer voisin. **Éviter** : RPC `SECURITY DEFINER` qui **rece­illent** l'identité du demandeur côté SQL et filtrent dur ; tests négatifs obligatoires : membre de deux foyers, foyer voisin, contenu d'un autre membre du même foyer (RGEX-03), sur le modèle `0157` (semis postgres + `testkit.as_user` + comptages bornés §2.7D).

### Pitfall 5 : « purge vérifiée en base, pas par un pari HTTP » (RGEX-04)
**Cause** : la preuve du purge se réduit à un curl réussi une fois au déploiement. **Éviter** : table d'audit de purge écrite par la fonction (chemins supprimés, résultat), job visible dans `cron.job` et exécutions dans `cron.job_run_details`, vérification SQL par `test-db.sh` ; la preuve réseau bout-en-bout reste un script à la `test-dispatch-push.sh` mené à la main sur une machine équipée (§2.7, à déclarer, jamais à passer sous silence).

### Pitfall 6 : URL signée trop large ou fuyarde
**Cause** : le lien est un porteur — qui l'obtient télécharge. **Éviter** : D-04 (le lien ne vit QUE dans l'écran export, calculé à la demande), TTL ≤ 24 h (RGEX-01), chemin scellé `<user_id>/<job_id>.zip` — les policies du bucket rendent le préfixe d'autrui invisible même en cas de bug de génération.

### Pitfall 7 : crash du milieu de job = job fantôme « en cours »
**Cause** : pas de lease/pas de statue d'erreur → le membre reste bloqué (contrevient à D-02/D-06). **Éviter** : lease (`pass_started_at`, grâce ~5 min), passe qui touche un job au-delà de la grâce le repren ou le bascule en `echec` ; l'index partiel d'unicité ne couvre que `en_attente`/`en_cours`.

### Pitfall 8 : fuseau et cadence du cron
**Cause** : `cron.schedule` s'évalue dans le fuseau du serveur (motif documenté 0087:7-9) — l'heure de purge varie si on utilise `cron.schedule` simple. **Éviter** : `cron.schedule_in_database(..., current_database())` comme toutes les migrations (0011:9, 0129:35-39), expression quotidienne, pas d'heure critique (purge « le jour » suffit).

## Code Examples

### Bucket + politiques (formalisme 0010, à écrire en 0158)
```sql
-- Source: motif supabase/migrations/0010_storage_and_realtime.sql:13-22 (adapté)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gdpr-exports', 'gdpr-exports', false, <LIMITE_A decisionsplanifie>, null)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

-- lecture : SEULEMENT le préfixe de son propre user_id (le zip vit sous <uid>/)
drop policy if exists gdpr_exports_read on storage.objects;
create policy gdpr_exports_read on storage.objects
  for select using (
    bucket_id = 'gdpr-exports'
    and text (storage.foldername(name))[1] = auth.uid()::text
  );
-- pas de insert/update/delete client : la fonction (clé secrète) bypass la RLS,
--蛍 l'écriture se fait exclusivement par le backend.
```

### Ligne de job (squelette, noms à finaliser au plan)
```sql
create table public.gdpr_export_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'en_attente'
    check (status in ('en_attente','en_cours','pret','echec')),
  storage_path text,                          -- '<uid>/<job>.zip' chemin, JAMAIS d'URL signée
  error text,
  cursor_module text, cursor_offset integer default 0, staging_ready boolean default false,
  pass_started_at timestamptz, pass_count integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz                       -- created_at + 7 j, lu par la purge
);
create unique index gdpr_export_jobs_one_active
  on public.gdpr_export_jobs (user_id) where status in ('en_attente','en_cours');
alter table public.gdpr_export_jobs enable row level security;
-- select limité à ses propres lignes ; aucune écriture client (RPC + service).
```

### Assemblage ZIP streaming (sketch Deno — à prouver par spike)
```ts
// Source: mécanique officielle fflate Zip/ZipPassThrough + upload-stream
// [assumptions: voir Assumptions A1/A2 — spike obligatoire avant les autres tâches]
import { Zip, ZipPassThrough } from 'npm:fflate@0.8.3';
// Pour chaque objet du staging : download en stream (fetch signed ou /object/authenticated
// avec clé secrète), emballer dans un ZipPassThrough (level 0 = STORE), brancher le
// ReadableStream résultant sur l'upload Storage ; JSON en DEFLATE (niveau léger).
```

### URL signée calculée à la demande (déjà en place dans le dépôt)
```ts
// Source: app/src/modules/ardoise — createSignedUrl(path, 60*60*24*30) [VERIFIED test:138]
// Ici : createSignedUrl(storagePath, 3600..86400) ≤ 24 h, après contrôle job∩demandeur.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| dnd-kit umbrella / réponses HMR | — (non concerné) | — | — |
| Storage : URL signées longues (ardoise 30 j) pour médias consultables | Pour GDPR : TTL court ≤ 24 h + chemin scellé + re-calcul à la demande | Phase 26 | La donnée exportée est plus sensible que la photo d'une dépense — surface minimale |
| Notifications : scopes 'rappels'/'anniversaires'/'messages' | Ajout scope 'export' suivant le patron 0147 (recopie-modification vers l'avant) | Phase 26 | Aucune breaking change : signatures conservées |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | storage-js v2 `upload()` accepte un `ReadableStream` comme corps (flux) dans le contexte Deno de la stack | Code Examples / Pitfall 2 | Fallback prévu : upload par sous-archives/parties ou Blob borné — coût de replanification, pas de blocage |
| A2 | fflate fonctionne sans réserve dans l'edge-runtime épinglé (v1.76.2) | Standard Stack | Remplaçant : jszip (mémoire) ou zlib+conteneur maison — spike le détecte en premier |
| A3 | Cross-bucket `copy` avec `destinationBucket` supporté par la storage-api de la stack épinglée | Pitfall 3 | Fallback download+upload stream (mémoire ≈ 1 média) |
| A4 | Nom de colonne `created_at` sur `storage.objects` pour dater les objets de staging (la purge peut aussi se fonder sur `expires_at` de la table jobs — plus sûr) | Pitfall 5 / purge | Sans gravité : la purge peut se fonder uniquement sur `gdpr_export_jobs.expires_at` + listing du préfixe `<uid>/` |
| A5 | Le scope push ajouté s'appelle `'export'` et la fonction `due_push_notifications` reste recopiable-modifiable sans rupture (patron 0147) | D-01 | Conflictuel : plan B = fonction dédiée consommée par un nouveau job cron-minute |
| A6 | La purge Storage via Edge `secret` est compatible avec l'interprétation de RGEX-04 (le « pas un pari HTTP » vise la *preuve*, d'où l'audit en base) | Pitfall 5 | Si l'utilisateur exige une purge 100 % SQL, elle ne peut supprimer que les lignes visibles — octets orphelins sur disque ; à confirmer en plan |
| A7 | Un fichier ZIP `gdpr-exports/<uid>/<job>.zip` peut dépasser la `file_size_limit` par défaut — la limite du bucket se règle à la création | Bucket SQL | Réglable : valeur à décider au plan (ex : 1-2 Go) |

## Open Questions (RESOLVED — dispositions plan-ancrées, 2026-10-26)

1. **Portée multi-foyers et périmètre JSON — SPÉC PRODUIT AVANT TOUT SQL (imposé par le ROADMAP).**
   - Ce qu'on sait : D-08 (tout membre avec session) ; 0145 (enfants sans session — rien à exporter pour eux en tant que sujets) ; D-22 phase 25 (un enfant = un foyer).
   - Ce qui manque : membre de 2 foyers → un export couvre-t-il les foyers choisis/tous ? Le JSON contient-il « ce que j'ai authored » (créé) ou « ce qui me concerne » (assignations, participations ardoise, mentions) ? Les médias du foyer dont je ne suis pas l'auteur entrent-ils ?
   - **Disposition (REGISTRE)** : tranchée par l'utilisateur au checkpoint:decision bloquant de 26-01 Task 1 (`gate="blocking-human"`, consignée dans 26-SPEC-DECISION.md) ; `26-02 depends_on 26-01` garantit qu'aucune requête SQL n'est écrite avant le tranchement.
2. **Nom/taille/nomenclature du ZIP** (discret, agent) : `export-rgpd-<date>.zip` ?; limite bucket à poser.
   - **Disposition (REGISTRE)** : le nom et l'arborescence interne du ZIP restent une discrétion nommée du le planificateur (26-CONTEXT.md, the agent's Discretion — 26-03 Task 1 la nomme et la tient) ; la limite de taille du bucket est tranchée au même checkpoint 26-01 Task 1 avec une valeur chiffrée obligatoire (critère d'acceptation 26-01 T1).
3. **Preuve bout-en-bout de la purge** : un script `test-purge-cgdpr.sh` sur le modèle de `test-dispatch-push.sh` est-il de mise (machine avec stack) — à inscrire comme tâche de campagne, jamais exigible de test-db.sh.
   - **Disposition (REGISTRE)** : la preuve en base RGEX-04 est portée par la suite SQL de 26-02 (26-04 Task 3 la vérifie) ; la preuve réseau de purge est une vérification manuelle inscrite au checkpoint d'acceptation de fin de phase 26-07 Task 3 (déclarée si pas d'appareil/stack, reprise à la phase 31) — jamais exigée de test-db.sh.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker + stack Supabase épinglée | test-db.sh, déploiement functions | ✓ (chaîne standard du dépôt) | postgres 17.6.1.136 snapshot / edge-runtime v1.76.2 | — |
| pg_cron, pg_net, Vault | driver job, purge, notation push | ✓ (0011/0012/0019 en prod) | — | — |
| Node 24 + npm (frontend) | tests Vitest, build | ✓ | chaîne standard §2.1 | — |
| Deno CLI local | dev des Edge Functions (typecheck manuel) | à vérifier au plan | — | La syntaxe peut être validée par déploiement + curl sur la stack (déjà le modus operandi du dépôt) |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** Deno CLI (non bloquant — la chaîne du dépôt valide par déploiement).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5 (frontend) + suite SQL `testkit` (`sh scripts/test-db.sh`) |
| Config file | existants (`app/` vitest, `supabase/tests/_setup.sql`) |
| Quick run command | `cd app && npm test` / `sh scripts/test-db.sh 0158` |
| Full suite command | `cd app && npm run typecheck && npm test && npm run build && npm run test:e2e` + `python3 scripts/check-sql-statique.py` + `python3 scripts/test-check-sql-statique.py` + `sh scripts/test-db.sh` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RGEX-01 | URL signée ≤ 24 h, chemin scellé, jamais stockée | unit (Vitest) + SQL (policies) | `cd app && npm test -- gdpr` / `sh scripts/test-db.sh 0158` | ❌ Wave 0 |
| RGEX-02 | Job asynchrone multipasse ; statuts 3 états ; notification | SQL (machine à états, garde unicité) + Vitest panel + spike streaming | idem + spike manuel documenté | ❌ Wave 0 |
| RGEX-03 | Isolement inter-foyer et inter-membres | SQL négatif (expect_denied, comptages bornés §2.7D) | `sh scripts/test-db.sh 0158` | ❌ Wave 0 |
| RGEX-04 | Purge 7 j : job cron présent, paths expirés visés, audit écrit | SQL (job installé, fonction de sélection des expirés) + script réseau manuel | `sh scripts/test-db.sh 0158` (+ script à la test-dispatch-push) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `sh scripts/test-db.sh 0158` + `cd app && npm test`
- **Per wave merge:** suite complète ci-dessus
- **Phase gate:** full suite green avant `/gsd-verify-work` ; test-dispatch mené si un appareil est abonné (à déclarer, §2.7)

### Wave 0 Gaps
- [ ] `supabase/tests/0158_gdpr_export.sql` — négatifs RGEX-03 + machine à états + job purge
- [ ] Spike Deno (streaming fflate + upload flux + cross-bucket copy) — débloquent A1/A2/A3
- [ ] `app/src/modules/parametres/components/gdpr-export-panel.test.tsx`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Supabase Auth session ; Edge `gdpr-export-run`/`purge` en mode `'secret'` uniquement (jamais appelables par un navigateur) |
| V3 Session Management | yes | Session requise pour RPC ; lien signé court-TTL remplace toute session côté téléchargement |
| V4 Access Control | yes | RLS sur `gdpr_export_jobs` (select propre au demandeur), policies bucket SCELLÉES par `<uid>/` préfixe, RPC d'extraction bornées en SQL |
| V5 Input Validation | yes | zod côté Edge (corps), validation serveur des IDs ; aucun input client ouvert |
| V6 Cryptography | yes | URLs signées par la storage-api (clé de signature dédiée) ; jamais de crypto maison |
| V14 File Download | **dominante ici** | Signed URLs TTL ≤ 24 h, chemin scellé, purge 7 j, lien non persisté, pas de listing public |
| V7/V9 Logging | yes | Audit de purge en base, traçabilité de l'historique des exports (D-07) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR sur job d'export (lire l'archive d'autrui par id) | Elevation of Privilege | RPC vérifie `user_id = acteur` ; RLS select propre ; id uuid non devinable en plus |
| Fuite du lien signé (partage/logs/historique serveur) | Information Disclosure | D-04 : un seul endroit où il vit, calculé à la demande, TTL ≤ 24 h, jamais en base ni dans les push |
| Débordement inter-foyer dans le JSON | Information Disclosure | Extraction exclusivement via RPC `SECURITY DEFINER` bornes demandeur + tests SQL négatifs RGEX-03 |
| Zip-slip à la consommation | Tampering | Entrées ZIP avec chemins simples (prefixes `<uid>/<job>/`), pas de `../` générés ; le lecteur reste l'utilisateur, surfaceه mineure |
| Énumération/abus de jobs (DoS) | Denial of Service | Index unique partiel D-06 + cadence cron minute + lots bornés |
| Storage pollué / données non purgées | Information Disclosure | Purge cron + audit en base (RGEX-04), `expires_at` sur la ligne de job |
| Secret du job dans `cron.job.command` | Information Disclosure | Interdit (§2.7H) ; secret dans Vault, lu par la fonction d'envoi (motif 0019) |

## Sources

### Primary (HIGH confidence)
- In-repo [VERIFIED] : `supabase-project/volumes/functions/main/index.ts:203-204` (limits worker) ; `0010_storage_and_realtime.sql:13-58` (buckets+policies) ; `0011_cron.sql:355-395` (jobs, purge de tokens) ; `0129_push_dispatch_every_minute.sql:24-41` (cron minute) ; `0019_push_dispatch.sql:475-514` (pg_net+Vault) ; `household-delete/index.ts` (Edge motif, pagination, modes) ; `push-notify/index.ts:1-60` (modes 'secret'/'user') ; `0147_child_push_adults.sql:1-25` (patron recopie-modification) ; `0130_fix_dispatch_messages.sql` (chain messages) ; `app/src/modules/parametres/` (panneaux) ; `app/src/modules/ardoise/api.test.ts:137-138` (signed URL 30 j) ; `scripts/test-db.sh` ; `supabase/tests/_setup.sql` (testkit)
- Context7 /supabase/supabase : `createSignedUrl` (downloads.mdx), cross-bucket `copy` + `destinationBucket` (copy-move-objects.mdx), upload stream (storage-caching.mdx), memory limit 256 MB side note (compression.mdx)

### Secondary (MEDIUM confidence)
- npm registry via gsd-tools (fflate 0.8.3, jszip 3.10.2, downloads, repos) — this session
- `gsd-tools query package-legitimacy check` — verdicts OK/OK

### Tertiary (LOW confidence)
- A1, A2, A3, A5, A6 (Assumptions Log) — à prouver par spike ou à trancher au plan/SPEC

## Metadata

**Confidence breakdown:**
- Contraintes runtime & motifs existants : HIGH — tout a été lu dans le dépôt ce session
- Architecture du job (multipasse, driver cron, purge) : HIGH sur les frontières, MEDIUM sur la mécanique streaming (A1-A3, spike exigé)
- RGEX-03 (isolement) : HIGH — motif testkit + RPC definer déjà éprouvés (0146/0148/0150)
- D-01 push : MEDIUM — le patron 0147 est sûr, le nommage du scope est un détail à finaliser

**Research date:** 2026-10-26
**Valid until:** 2026-11-25 (stable — dépendances de la stack épinglées)
