# Phase 34: File d'écriture & rejeu - Context

**Gathered:** 2026-11-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Une écriture simple effectuée hors-ligne sur un module Tier 1 (Courses, Tâches, Routines — tables alignées sur la allowlist de lecture de la phase 33) est enfilée localement dans une file d'écritures persistée, puis rejouée **exactement une fois** au retour du réseau, sans doublon ni perte silencieuse. L'idempotence est garantie côté base par une colonne `client_key` UUID sur les tables Tier 1 (migration avec backfill + NOT NULL immédiat + tests SQL négatifs §2.7). Les échecs de rejeu sont classés **terminal** (refus RLS, ligne supprimée → surfacés, retirés de la file, jamais de retry en boucle) vs **retryable** (réseau/5xx → rejetés). L'utilisateur voit en permanence le badge « N en attente » et peut inspecter/agir sur les écritures dans le panneau offline de Paramètres. Le rejeu est réconcilié avec Realtime par rapprochement par clé client — Realtime/invalidation priment sur l'overlay optimiste.

**Hors périmètre :** les écritures sur les modules hors liste blanche (Ardoise, Messages, Cadeaux, Cercle, invitations/tokens — refusées côté client, preuve par test), le rejeu en arrière-plan (background sync du SW — ici foreground uniquement : `online` + `visibilitychange`), l'extension à de nouvelles tables au-delà de l'alignement allowlist lecture, les deep links et vue « Tâches du jour » (phase 35), le retour du mode démo Dexie (D-10 jalon v1.1).

</domain>

<decisions>
## Implementation Decisions

### Architecture de la file
- **D-01:** Persistance = **clé query dédiée dans le même persister** (`persistQueryClient` + `createAsyncStoragePersister` de la phase 33, D-01/D-02) — un seul mécanisme de persistance, déjà namespacé (user, foyer) et purgé await à la déconnexion. Pas de stockage séparé, pas de Dexie. — **Reversibility:** reversible.
- **D-02:** Enfilage = **`MutationCache` central installé par `buildQueryClient`** dans `query-policy.ts` — toute mutation Tier 1 en échec réseau est enfilée automatiquement. Corrige la classe, pas l'instance (AGENTS.md §2.7 E) : aucun branchement par vue. — **Reversibility:** reversible.
- **D-03:** Lecture = **hook `use-outbox` sur la query persistée** via `useQuery` — la gate `use-outbox-gate` (stub 32-D10) et le badge « N en attente » dérivent tous deux de cette source unique. Le comptage est dérivé de la liste, jamais stocké à part. Aucun composant de la phase 32 ne change (contrat de frontière). — **Reversibility:** reversible.

### Sémantique d'enfilage
- **D-04:** **Fusion par entité** : si une écriture pendante existe déjà pour la même entité, la nouvelle écrase l'ancienne (une seule écriture par entité en attente). Coche puis décoche hors-ligne = une écriture finale. Plus simple à réconcilier, jamais de doublon. — **Reversibility:** reversible.
- **D-05:** **Annulation locale par clé client** : le create hors-ligne génère l'UUID `client_key` côté client d'emblée (c'est la clé d'idempotence) ; si la même entité est supprimée hors-ligne avant rejeu, create + delete partent ensemble — le serveur ne voit jamais un fantôme. Pas de rejeu séquentiel create→delete. — **Reversibility:** reversible.

### Liste blanche (WRQ-03)
- **D-06:** La liste blanche d'écriture vit **dans `query-policy.ts`**, à côté de la allowlist de lecture (D-07 phase 33) — un seul fichier nomme ce qui est offline-éligible, en lecture ET en écriture ; la garde de classe existante s'étend. — **Reversibility:** reversible.
- **D-07:** Refus **upfront** : une écriture sur un module hors liste est rejetée AVANT tout départ réseau, avec toast clair « module non disponible hors-ligne ». Jamais enfilée, jamais classée terminale au rejeu — on sait dès l'enfilage qu'elle n'est pas éligible. Prouvé par un test qui fait échouer une tentative hors liste. — **Reversibility:** reversible.

### Rejeu (WRQ-02, WRQ-04)
- **D-08:** Déclencheurs foreground = **`online` ET `visibilitychange`** (retour d'onglet), via `onlineManager`/`useOnlineStatus` (source réseau unique). Pas de polling. — **Reversibility:** reversible.
- **D-09:** Ordre de rejeu = **FIFO + create d'abord** : les creates passent avant update/delete de la même entité (par clé client), puis ordre d'enfilage global. Les dépendances naturelles sont respectées sans analyse fine. — **Reversibility:** reversible.
- **D-10:** Classification des échecs : refus RLS ou ligne supprimée = **terminal** (surfacé à l'utilisateur, retiré de la file, jamais rejoué) ; échec réseau/5xx = **retryable** (reste en file). Jamais de retry en boucle, jamais d'effacement silencieux. — **Reversibility:** reversible.

### Surface des échecs (WRQ-05)
- **D-11:** Échec terminal consultable dans le **panneau offline de Paramètres** (32-D12, déjà enrichi SW/version) : liste des écritures, statut, actions Réessayer/Abandonner. Le badge « N en attente » devient « N bloquées » cliquable quand au moins un échec terminal existe. Un seul point d'observation. — **Reversibility:** reversible.
- **D-12:** **Toast discret une fois** par échec terminal (« 1 écriture n'a pas pu être appliquée — voir détails ») — l'utilisateur est averti sans aller dans Paramètres ; les simples retards réseau ne tosant pas. — **Reversibility:** reversible.
- **D-13:** Badge « N en attente » **visible tant que N > 0, en ligne comme hors ligne** — pendant le rejeu on voit le compteur descendre, preuve visible que ça s'applique ; retombe à zéro après rejeu complet. — **Reversibility:** reversible.

### Idempotence SQL (WRQ-01)
- **D-14:** Modèle = **colonne `client_key uuid` par table Tier 1** (`shopping_list_items`, `tasks`, `task_assignees`, `routines`, `routine_completions` — aligné sur la allowlist de lecture, ni plus ni moins) + contrainte unique (household_id, client_key) + upsert `on conflict` au rejeu. Pas de table outbox générique (RLS par table ne protègerait pas naturellement un payload jsonb). — **Reversibility:** one-way — une migration ajoute des colonnes et des contraintes uniques sur des tables en production ; le retrait exigerait une migration inverse et invaliderait le format des écritures déjà rejouées.
- **D-15:** **Backfill + NOT NULL immédiat** dans la même migration : les lignes existantes reçoivent `gen_random_uuid()`, la contrainte est vraie dès le premier déploiement, les tests SQL négatifs §2.7 couvrent le cas backfill. — **Reversibility:** one-way — même raison que D-14.

### Réconciliation Realtime (WRQ-06)
- **D-16:** **Rapprochement par clé client** : l'écriture enfile sa clé client ; à l'arrivée du row Realtime, l'overlay optimiste est remplacé par les données serveur quand la clé correspond, et l'entrée est retirée de la file. Realtime/invalidation priment TOUJOURS sur l'optimiste (pattern du goal). Pas d'invalidation seule (flash visuel + risque de réintroduction d'ancien état). — **Reversibility:** reversible.

### Purge de la file
- **D-17:** À la déconnexion : la file est **scannée AVANT purge** — écritures pendantes = avertissement bloquant (« N écritures en attente, elles seront perdues ») avec confirmation, puis purge awaitée dans `signOut()` (D-05 phase 33). Au changement de foyer : purge sans confirmation (écritures namespacées par foyer, elles ne concernent que celui quitté). Pas de rejeu forcé dans `signOut()`, pas de persistance inter-sessions. — **Reversibility:** reversible.

### the agent's Discretion
- Format exact de l'entrée de file (table, operation, values, client_key, enfiled_at, status) — l'agent affine.
- Forme exacte du toast (libellé, icône, déduplication si plusieurs échecs en un rejeu).
- Placement précis du hook `use-outbox` et de son test (fichier unique vs partagé avec la gate).
- Détails du MutationCache (onError vs onSuccess selon les mutations) dans les limites de D-02.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requis & roadmap
- `.planning/ROADMAP.md` §Phase 34 — Goal, Success Criteria 1-5
- `.planning/REQUIREMENTS.md` §File d'écriture (WRQ) — WRQ-01 à WRQ-06

### Convictions projet
- `AGENTS.md` §2.7 — chaîne de vérification avant commit ; tests SQL négatifs ; contrôle statique prouvé sur un cas qui doit échouer ; « un succès muet est un échec inexpliqué » ; assertions bornées par foyer
- `AGENTS.md` §2.6 — RLS frontière finale ; tests PostgreSQL incluant cas négatifs (refus inter-foyer, escalade de privilèges)
- `AGENTS.md` §5 (Tables) — schéma des tables Tier 1 (shopping_list_items, tasks, task_assignees, routines, routine_completions)

### Phases 32-33 (infra posée, à consommer)
- `.planning/phases/32-install-raccourcis/32-CONTEXT.md` — D-10 (gate outbox stub, contrat « sans changer aucun composant »), D-12 (panneau offline Paramètres)
- `.planning/phases/33-cache-de-lecture-offline/33-CONTEXT.md` — D-01/D-02 (persister IndexedDB), D-03/D-05 (namespacing + purge awaitée signOut), D-07 (allowlist dans query-policy.ts), D-13 (useOnlineStatus/onlineManager)

### Code
- `app/src/lib/query-policy.ts` — QUERY_POLICY source unique + garde de classe ; le MutationCache s'y installe
- `app/src/hooks/use-outbox-gate.ts` — stub 32-D10 à brancher
- `app/src/hooks/use-online-status.ts` — source réseau unique (déclencheurs D-08)
- `app/src/lib/data/useResource.ts` — mutations centralisées (createMutation, updateMutation, removeMutation)
- `app/src/lib/offline/query-persistence.ts` — persister + filtre dehydrate de la phase 33
- `app/src/hooks/use-auth.ts` — signOut() (purge awaitée, point d'ancrage D-17)
- `app/src/modules/parametres/components/offline-panel.tsx` — réceptacle des échecs terminaux (D-11)
- `app/src/components/banners/banner-store.ts` — slot bannières (badge N en attente)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/src/lib/offline/query-persistence.ts` — persister existant : la file vit dans une clé query supplémentaire, filtrée par le même mécanisme
- `app/src/hooks/use-outbox-gate.ts` — le stub expose déjà le contrat `{ isEmpty }` ; la phase 34 le fait lire la vraie file
- `app/src/hooks/use-online-status.ts` + `onlineManager` — déclencheurs de rejeu et visibilité du badge sans nouvelle source réseau
- `app/src/modules/parametres/components/offline-panel.tsx` — panneau enrichi en 32-D12 : y ajouter la liste des écritures et leurs actions
- `app/src/lib/data/useResource.ts` — les 3 mutations centralisées : le MutationCache central les couvre sans toucher les vues
- fake-indexeddb + tests SQL §2.7 (testkit) — chaînes de preuve existantes pour la file et la migration

### Established Patterns
- Source unique + garde de classe (`query-policy.ts`) : la liste blanche d'écriture et le MutationCache y vivent, étendre la garde
- Migrations vers l'avant uniquement (AGENTS.md §2.7 A) : backfill D-15 dans une migration unique, jamais de réécriture
- Purge awaitée avant navigation (33-D05) : le scan-avertir-purger D-17 s'y raccroche, pas de fire-and-forget
- `networkMode: 'always'` : une lecture hors ligne échoue honnêtement ; la file d'écriture ne change pas ce mode

### Integration Points
- `app/src/lib/query-policy.ts` — buildQueryClient : installer le MutationCache (D-02)
- `app/src/hooks/use-outbox-gate.ts` — brancher la vraie file (D-03)
- `app/src/hooks/use-auth.ts` — signOut() : scan-avertir-purger (D-17)
- `app/src/stores/household-store.ts` — switchHousehold : purge file (D-17)
- `supabase/migrations/` — migration client_key + backfill + tests SQL négatifs (D-14/D-15)
- `app/src/sw.ts` — NE RIEN y cacher d'API, ne pas y mettre de background sync (hors périmètre)

</code_context>

<specifics>
## Specific Ideas

- « Exactement une fois » est le fil conducteur : fusion par entité (D-04), annulation par clé client (D-05), upsert on conflict (D-14) — chaque décision élimine un chemin vers le doublon.
- L'honnêteté continue (phase 33) : un échec terminal est VISIBLE (badge → panneau → toast une fois), jamais effacé en silence ; un retard réseau n'alerte pas.
- Le contrat 32-D10 est sacré : brancher `use-outbox-gate` sur la vraie file sans changer aucun composant de la phase 32.
- Frontière background : rejeu foreground uniquement (`online` + `visibilitychange`) — le background sync SW est une autre phase.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 34-File d'écriture & rejeu*
*Context gathered: 2026-11-05*
