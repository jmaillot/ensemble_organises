# Phase 29: Messagerie v2 - Research

**Researched:** 2026-10-29
**Domain:** Messagerie (Supabase SQL + Edge push + React/TanStack Query), watermark de lecture, notifications groupées, Realtime self-hosted
**Confidence:** HIGH (domaine interne au dépôt, tout vérifié par lecture directe des sources)

## Summary

La phase 29 n'est **pas une phase greenfield** : les fondations existent presque toutes et le travail réel consiste en (1) un RPC anti-doublon de démarrage de directe, (2) la remontée côté émetteur des accusés déjà synchronisés serveur, (3) une réécriture du ventilateur de notifications 0042 qui **fuit aujourd'hui le contenu des messages** — en violation de la règle verrouillée — et qui groupe par conversation, (4) la preuve par souscription réelle d'une publication Realtime qui contient déjà les tables messages depuis 0010.

Découverte majeure #1 : **la table serveur de watermark existe déjà**. `notification_reads` (migration 0046) porte une ligne par `(user_id, scope='conversation', scope_id)` avec `read_at`, unique — c'est exactement un watermark par membre et par conversation. `useSyncedReads` écrit déjà dessus (upsert create-or-update) et fusionne serveur + localStorage. Le travail MSG-02/MSG-03 est donc : migrer le localStorage vers cette table (D-03), lire les watermarks **des autres membres** d'un fil (impossible aujourd'hui : RLS `notification_reads_select_own` restreint la lecture à ses propres lignes — un RPC SECURITY DEFINER est la voie qui respecte les patterns du dépôt), et écrire le watermark **à l'ouverture du fil** (le point d'écriture existe déjà : `messages-page.tsx:47`).

Découverte majeure #2 : **`private.push_message_notifications` (0042:82-83) met le contenu du message dans le body du push** (`left(btrim(msg.content), 120)`), et le titre contient le prénom de l'expéditeur. La règle verrouillée « les notifications ne portent jamais le contenu du message » est donc aujourd'hui violée en production — la phase doit corriger cette fonction, pas seulement grouper. Le groupement (D-06) tombe presque gratuitement de la file existante : `message_notifications` contient une ligne par message non encore consommé, donc au moment du dispatch, `GROUP BY (destinataire, conversation)` sur la file donne le compteur « N nouveaux messages » **sans aucun état serveur supplémentaire** — exactement ce que D-07 a refusé d'ajouter.

Découverte majeure #3 : **la publication `supabase_realtime` contient déjà `messages`, `conversations`, `conversation_members`** (0010:76-78) et `notification_reads` (0046:62). Le critère MSG-05 « publication complétée » ne demande donc presque aucun ALTER — ce qui manque est la **preuve** (D-09) : une souscription réelle via le runtime Realtime du conteneur qui reçoit un INSERT, sur le modèle attribuable de `test-dispatch-push.sh` (le SQL de `test-db.sh` s'arrête à la frontière HTTP et ne peut pas prouver cela seul).

**Primary recommendation:** quatre chantiers SQL+1 Edge+frontend : RPC `open_direct_conversation` (garde anti-doublon, verrou consultatif anti-course), RPC de lecture des watermarks de co-membres, réécriture groupée et sans contenu de `push_message_notifications` + `consume_push_reminders` (liste d'ids), script de preuve Realtime par souscription réelle, puis wiring frontend (member-picker → RPC, accusés sous la dernière bulle, markRead au focus). Migration suivante : **0171**.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 :** watermark mis à jour à l'ouverture du fil (et au retour sur l'onglet), pas à chaque message affiché. Une écriture par session de lecture.
- **D-02 :** côté émetteur, accusé sous le dernier message envoyé : avatars colorés des membres qui ont lu + horodatage.
- **D-03 :** localStorage `ensemble-organises-messages-read` (via `useSyncedReads`) porté vers la table serveur au premier chargement, puis clé retirée. One-way.
- **D-04 :** entrée = member-picker (phase 25), un tap démarre ou rouvre la directe.
- **D-05 :** RPC rouvre la directe existante si les deux participations sont actives (ni quittée via pierre tombale 0101, ni archivée-désactivée) ; si l'un a quitté, nouvelle conversation (la pierre reste).
- **D-06 :** compteur « 2 nouveaux messages de X » calculé côté dispatch ; une seule notification par conversation ; le `tag` conversation (0042) reste la clé de regroupement OS.
- **D-07 :** rythme = cycle dispatch (5 min), pas d'antidébordement (état supplémentaire refusé).
- **Règle verrouillée :** les notifications ne portent **jamais** le contenu du message.
- **D-08 :** Realtime sert à rafraîchir fil ouvert + liste ; pas d'accusés en temps réel (pas de souscription aux watermarks).
- **D-09 :** preuve = test avec vraie souscription via le runtime Realtime du conteneur, « vu rouge avant vert » ; pas d'e2e Playwright à deux contexts.

### the agent's Discretion
- Forme exacte de la table de watermark (`conversation_reads` dédiée vs colonne) et son RLS.
- Détails de la migration client du localStorage (seuil de déclenchement, effacement après confirmation serveur).
- Présentation exacte des avatars d'accusé (taille, ordre) — sur les tokens existants.
- Structure du RPC anti-doublon (signature, transaction, verrou anti-course).

### Deferred Ideas (OUT OF SCOPE)
- Accusés de lecture en temps réel via souscription aux watermarks.
- Antidébordement de notifications type Android.
- Indicateurs d'écriture (typing indicators).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MSG-01 | Démarrer une directe via RPC serveur avec garde anti-doublon | RPC `open_direct_conversation` modelé sur `create_conversation` (0041) + verrou consultatif `pg_advisory_xact_lock` ; condition D-05 sur `conversation_members.left_at` |
| MSG-02 | Badges non-lus sur watermark par membre, jamais écriture par message | Table `notification_reads` (0046) déjà en place, déjà écrite par `useSyncedReads` ; D-01 = markRead à l'ouverture (point d'appel existant `messages-page.tsx:47`) + migration localStorage D-03 |
| MSG-03 | Accusé de lecture visible côté émetteur | RPC SECURITY DEFINER lisant les `notification_reads` des co-membres actifs du fil (RLS actuelle ne permet que ses propres lignes, 0046:34-35) ; rendu dans `chat-panel.tsx` (UI-SPEC approuvée) |
| MSG-04 | Push groupés par conversation, sans contenu, chaîne existante | Réécriture de `private.push_message_notifications` (0042:60-99, fuite de contenu actuelle) en GROUP BY sur la file `message_notifications` ; `consume_push_reminders` (0042:200-244) passe à une liste d'ids pour kind `message` ; Edge `push-notify` (champ `reminder_id` → ids) |
| MSG-05 | Publication Realtime testée par souscription réelle | Publication déjà peuplée (0010:76-78, 0046) ; nouveau script de preuve sur le modèle `test-dispatch-push.sh`, contre le service `realtime` du conteneur |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Garde anti-doublon directe | API/Backend (SQL RPC) | Frontend (appel depuis picker) | La transaction et le verrou anti-course vivent en base ; le client ne fait qu'appeler |
| Watermark de lecture | API/Backend (table + RPC) | Frontend (markRead à l'ouverture) | Source de vérité partagée = serveur ; le localStorage n'est plus qu'un cache optimiste à retirer (D-03) |
| Accusés côté émetteur | Frontend (rendu) | API (RPC de lecture des co-membres) | La donnée est lue en base, la présentation est UI |
| Notifications groupées | API/Backend (SQL dispatch + Edge) | — | Toute la chaîne 0042 → push-notify est serveur ; l'OS ne fait que regrouper par `tag` |
| Preuve Realtime | API/Backend (runtime conteneur) | Scripts de test | `test-db.sh` ne traverse pas la frontière HTTP ; la preuve exige le service `realtime` démarré |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| PostgreSQL (stack Supabase self-hosted) | 17, snapshot épinglé | RPC, triggers, RLS, pg_cron, pg_net | [VERIFIED: AGENTS.md §2.2] contrat du projet, aucune dépendance nouvelle |
| supabase-js v2 | déjà installé (app/package.json) | rpc(), realtime channels | [VERIFIED: app/src/modules/messages/api.ts:151, app/src/lib/data/supabase-adapter.ts:262] |
| TanStack Query v5 | déjà installé | invalidation caches fil/liste sur événement Realtime | [VERIFIED: app/src/modules/messages/hooks/use-messages.ts:751-764] |
| Vitest 5 + RTL | déjà installé | tests frontend (accusés, migration localStorage) | [VERIFIED: AGENTS.md §2.4] |

### Supporting
| Library | Purpose | When to Use |
|---------|---------|-------------|
| `pg_advisory_xact_lock` (natif PostgreSQL) | verrou anti-course du RPC anti-doublon | deux démarrages simultanés de la même paire |
| `scripts/test-db.sh` + `testkit` | assertions SQL de la migration | chaque fonction nouvelle |
| `scripts/test-dispatch-push.sh` (à étendre) | preuve push groupée attribuable | D-06, §2.7 |

**Aucune dépendance externe nouvelle.** Aucune installation npm — la phase est du SQL + du code app existant. Pas de Package Legitimacy Audit requis (aucun paquet installé).

## Architecture Patterns

### System Architecture Diagram

```
Membre A tappe membre B (member-picker, D-04)
        │
        ▼
RPC open_direct_conversation ── pg_advisory_xact_lock(hash paire)
        │  directe active entre les deux ? ──oui──► retour id existant (rouvrir)
        │            non (ou l'un a quitté)
        ▼
INSERT conversations + conversation_members  ──► realtime: conversations, conversation_members
                                                        │
Membre B (app ouverte) ◄──── postgres_changes ──────────┘
        │ invalidate TanStack Query (D-08)
        ▼
Message envoyé (createMessage existant)
        │ trigger enqueue_message_notification (0042:44)
        ▼
message_notifications (file, 1 ligne/message)
        │ job eo-push-messages (5 min, 0042:287)
        ▼
push_message_notifications réécrit : GROUP BY (destinataire, conversation)
        │  title = « N nouveaux messages de {prénom} », body SANS contenu
        ▼
due_push_notifications('messages') ──► Edge push-notify ──► Web Push (tag = message-<conv>)
        │                                                  (regroupement OS, D-06)
        └── consume_push_reminders(ids du groupe) si sent > 0

Membre B ouvre le fil (D-01)
        │ markRead (messages-page.tsx) → upsert notification_reads
        ▼
Membre A : RPC lecture watermarks co-membres ──► accusés (avatars + heure) sous sa dernière bulle
```

### Recommended Project Structure

Aucun nouveau répertoire. Surfaces touchées :

```
supabase/migrations/0171_*.sql          # RPC anti-doublon, RPC watermarks, push groupé sans contenu
supabase/functions/push-notify/index.ts # reminder_id → liste d'ids (kind message)
app/src/modules/messages/api.ts          # openDirectConversation, fetchReadReceipts
app/src/modules/messages/hooks/use-messages.ts  # markRead à l'ouverture/focus, migration D-03
app/src/modules/messages/components/chat-panel.tsx  # accusés (D-02, gabarit UI-SPEC)
app/src/modules/messages/components/conversation-list.tsx  # picker de démarrage, badges watermark
scripts/test-dispatch-push.sh            # extension groupement
scripts/test-realtime-subscription.sh    # NOUVEAU : preuve D-09
```

### Pattern 1: RPC anti-doublon avec verrou consultatif
**What:** le verrou pose un ordre total sur la paire {membre courant, autre membre}, la recherche d'existing puis l'insertion se font sous verrou — deux appels simultanés ne créent pas deux fils.
**When to use:** le RPC de démarrage (D-05) ; la discrétion D-04 le laisse au planner, ce pattern est la recommandation.
**Example:**
```sql
-- Source: pattern PostgreSQL standard ; signature calquée sur create_conversation (0041)
perform pg_advisory_xact_lock(
  ('x' || md5(least(p_other_member_id, v_self) || '>' || greatest(p_other_member_id, v_self)))::bit(64)::bigint
);
-- recherche : conversation type 'direct' où les DEUX lignes conversation_members
-- sont actives (left_at is null) — participations actives de D-05
-- trouvée → return jsonb_build_object('id', existante, 'created', false)
-- sinon    → insertion conversation + 2 membres, return (…, 'created', true)
```
**Point d'attention D-05 :** « active » se lit sur `left_at` (pierre tombale 0101). L'archive personnelle (`archived_at`, 0131) **n'empêche pas d'écrire** — écrire désarchive (`unarchive_on_send`). Le planner doit trancher explicitement si `archived_at is not null` fait rouvrir ou recréer ; la lecture la plus cohérente du texte D-05 est : rouvrir dès que `left_at is null` des deux côtés (un fil archivé pour moi reste un fil qui existe et se réveille à l'écriture).

### Pattern 2: RPC SECURITY DEFINER pour lire les watermarks des autres
**What:** la RLS `notification_reads_select_own` (0046:34-35) interdit de lire les lignes d'autrui — le bon pattern du dépôt est un RPC `security definer set search_path = ''` qui vérifie que l'appelant est membre **actif** de la conversation puis retourne `(member_id, display_name, color_tag, read_at)` des co-membres.
**Why:** même forme que `leave_conversation` (0100), `archive_conversation` (0106) ; évite d'élargir la RLS de `notification_reads` à des lignes tierces.
**Caveat §2.7-D:** toute référence à une colonne de `returns table` est une variable plpgsql — qualifier `public.notification_reads.read_at` etc., le contrôle statique (`scripts/check-sql-statique.py`) l'exige.

### Pattern 3: groupement push sans état supplémentaire (D-06/D-07)
**What:** la file `message_notifications` EST la fenêtre d'accumulation : une ligne par message non consommé. Au dispatch, grouper la file par (destinataire, conversation) produit le compteur « N nouveaux messages » sans aucune table d'état nouvelle — D-07 refuse un état supplémentaire, ce design n'en ajoute pas.
**Example:**
```sql
-- push_message_notifications réécrite : une ligne par (user_id, conversation)
select
  cm.user_id,
  'message-' || msg.conversation_id as conversation_key,
  count(*) as message_count,
  jsonb_agg(mn.id) as reminder_ids,          -- consommation du groupe entier
  max(sender.display_name) as sender_name    -- « de X » (dernier expéditeur)
from public.message_notifications mn
join public.messages msg on msg.id = mn.message_id
join public.conversation_members cm on cm.conversation_id = msg.conversation_id
join public.household_members sender on sender.id = msg.sender_id
where cm.left_at is null ...  -- participants actifs, auteur exclu, fenêtre 24 h inchangée
group by cm.user_id, msg.conversation_id
```
**Conséquences en chaîne :**
- `due_push_notifications` (0042:107-198) agrège ces groupes ; `reminder_id` devient `reminder_ids` (jsonb) pour scope `messages` — les scopes `rappels`/`anniversaires`/`test` gardent un id scalaire, l'Edge gère les deux formes.
- `consume_push_reminders` (0042:200-244) : pour kind `message`, itérer une **liste** d'ids (supprimer chaque ligne de `message_notifications`). Un `id` manquant reste un no-op compté, pas une erreur.
- Edge `push-notify/index.ts:263,307` : `consumed.push({ kind, id })` devient `consumed.push({ kind, ids: [...] })` pour `message` ; la condition de consommation reste `sent > 0` (un groupe livré au moins une fois est consommé en entier — cohérent avec le commentaire 0042 « le rappel n'est retiré que si un appareil l'a réellement reçu »).
- `title` groupé : « N nouveaux messages de {prénom} » ; `body` : texte neutre sans contenu (ex. « dans {titre du fil ou "votre conversation"} ») — la règle verrouillée interdit le contenu, le titre et le body doivent être audités ensemble.

### Anti-Patterns to Avoid
- **Réécrire une migration appliquée (0042, 0046) :** corriger vers l'avant en `create or replace function` dans une nouvelle migration (précédent 0130, qui a corrigé 0042 sans la réécrire).
- **Mettre le compteur dans un trigger :** D-06 dit « calculé côté dispatch » ; le trigger 0042 reste exactement ce qu'il est (une ligne par message), le groupement se fait à la lecture.
- **Souscrire aux watermarks en Realtime :** refusé par D-08 ; `useMessagesRealtime` (use-messages.ts:751) ne touche que `messages`/`conversations`.
- **État serveur pour le rythme des notifications :** refusé par D-07 ; la file existante est la fenêtre d'accumulation.
- **`archived_at` traité comme « inactive » dans l'anti-doublon sans décision explicite :** voir Pattern 1, point d'attention.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fusion des instants de lecture | comparaison lexicographique ISO | `latestRead`/`readTime` (`app/src/lib/notification-reads.ts:44-61`) | ISO hétérogènes (Z, +00:00, local démo) ; déjà corrigé et testé |
| Regroupement OS des notifications | logique de pile côté app | champ `tag` (`message-<conv>`, 0042:85) | le service push et l'OS le font ; D-06 verrouille ce choix |
| Lecture synchro multi-appareils | nouvelle table watermark | `notification_reads` (0046) existante | même forme, unique `(user_id, scope, scope_id)`, realtime déjà branché |
| Preuve de bout en bout base→push | simulateur de réponse | `net._http_response` lu après `max(id)` (test-dispatch-push.sh:204) | attribuabilité §2.7 : le rapport lu est celui de l'appel du script |
| Événements temps réel | polling | `data.subscribe` (supabase-adapter.ts:262) + invalidation TanStack | déjà en place, `useMessagesRealtime` ne demande que la publication alimentée |

**Key insight:** presque tout existe ; chaque chantier de cette phase est un **remplacement ciblé** (une fonction SQL, un point d'appel), pas une construction.

## Common Pitfalls

### Pitfall 1: La fuite de contenu actuelle du push (0042)
**What goes wrong:** `left(btrim(msg.content), 120)` (0042:83) envoie le contenu du message dans le body — violation directe de la règle verrouillée. Corriger uniquement le groupement sans toucher au body livrerait un MSG-04 faux.
**Why it happens:** 0042 précède la règle ; personne n'a relu le body depuis.
**How to avoid:** la migration 0171 réécrit `push_message_notifications` d'un bloc (groupement + title + body sans contenu) ; `test-dispatch-push.sh` étendu vérifie le **format** (compteur dans le title, body sans le contenu semé).
**Warning signs:** un push reçu en développement affichant le texte d'un message.

### Pitfall 2: `returns table` et noms non qualifiés
**What goes wrong:** dans une fonction plpgsql `returns table (read_at …)`, `read_at` est une variable — la référence non qualifiée à la colonne est ambiguë ou NULL silencieux (AGENTS §2.7-A.5).
**Why it happens:** corps recopié d'une fonction sans colonnes homonymes.
**How to avoid:** tout nom qualifié (`public.notification_reads.read_at`), `search_path = ''`, le contrôle statique attrape le cas.
**Warning signs:** `check-sql-statique.py` rouge, ou RPC retournant des NULL.

### Pitfall 3: Course sur le démarrage d'une directe
**What goes wrong:** deux taps/appareils sur le même membre créent deux fils (exactement le doublon que MSG-01 interdit).
**How to avoid:** `pg_advisory_xact_lock` transactionnel sur la paire triée (Pattern 1) ; la recherche puis l'insertion sont sérialisées, le second appel rouvre.
**Warning signs:** test SQL semant deux appels concurrents et comptant deux `conversations`.

### Pitfall 4: La preuve Realtime n'est pas une assertion SQL
**What goes wrong:** `test-db.sh` s'arrête à la frontière HTTP/WS : une souscription Realtime n'est pas prouvable par psql seul (AGENTS §2.7 intro).
**Why it happens:** la tentation d'« tester » la publication par `select * from pg_publication_tables` — cela prouve l'inscription, pas la livraison.
**How to avoid:** script dédié (modèle test-dispatch-push.sh) : souscription **réelle** via le runtime `realtime` du conteneur (wscat/curl WebSocket ou un petit client dans le conteneur), INSERT, attente de l'événement, verdict ; vu rouge avant vert (D-09, §2.7-B).
**Warning signs:** « la publication contient la table » présenté comme critère 4 satisfait.

### Pitfall 5: Migration localStorage D-03 one-way
**What goes wrong:** effacer la clé locale avant confirmation serveur perd les horodatages (D-03 est marqué one-way).
**How to avoid:** au premier chargement en ligne : lire la clé locale, pousser chaque entrée vers `notification_reads` (upsert, keep max — `latestRead`), **puis** `localStorage.removeItem` seulement après succès réseau ; repli hors ligne = ne rien effacer. `useSyncedReads` fusionne déjà max(local, serveur) : la migration peut se jouer sur ce hook existant.
**Warning signs:** faux non-lus signalés par un utilisateur après mise à jour.

### Pitfall 6: D-01 — une écriture par session, pas par message
**What goes wrong:** brancher markRead sur le rendu de chaque message écrit à chaque message reçu.
**How to avoid:** markRead sur changement d'`activeId` (existant, messages-page.tsx:47) + effet `visibilitychange`/focus pour « retour sur l'onglet ». `markRead` garde le garde-fou `current[id] >= at` (notification-reads.ts:151) qui rend les appels redondants inoffensifs.
**Warning signs:** une ligne `notification_reads` par message dans la base.

## Code Examples

### Lecture des accusés côté émetteur (frontend)
```typescript
// Source: patterns existants du dépôt (api.ts:151 rpc leave_conversation)
export async function fetchReadReceipts(conversationId: string): Promise<ReadReceipt[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('conversation_read_receipts', {
      p_conversation_id: conversationId,
    });
    if (error) throw new DataError(error.message, error);
    return data as ReadReceipt[];
  }
  // démo locale : lecture directe des notification_reads filtrées sur le fil
  return readReceiptsLocal(conversationId);
}
```

### Preuve Realtime (squelette, modèle test-dispatch-push.sh)
```sh
# 1. souscription réelle : connexion WebSocket au service realtime du conteneur
#    (phx protocol, join canal postgres_changes sur public.messages)
# 2. INSERT de semure via psql.sh (stdin, jamais -f, jamais secret en -c)
# 3. attente bornée de l'événement INSERT sur le canal
# 4. nettoyage vérifié par comptage (même discipline que test-dispatch-push.sh:146-175)
```

## Runtime State Inventory

Rename/refactor ? Non — mais des **données existantes** migrent (D-03) :

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `notification_reads` lignes existantes (scope `conversation`) déjà présentes pour les comptes synchronisés ; lignes `message_notifications` en file (0130 en a retrouvé 10 accumulées) | aucune migration de données ; la migration D-03 pousse le localStorage restant |
| Live service config | job pg_cron `eo-push-messages` (`*/5 * * * *`, 0042:287) ; publication `supabase_realtime` peuplée (0010/0046/0049/0110) | job inchangé ; publication complétée seulement si une table manque |
| OS-registered state | abonnements push réels sur appareils (tag `message-<conv>` déjà en place) | aucun ; le regroupement OS continue sur le même tag |
| Secrets/env vars | `project_url`, `service_role_key` dans Vault (test-dispatch-push.sh:83-91) ; `INVITE_TOKEN_HMAC_SECRET` hors périmètre | aucun changement |
| Build artifacts | migrations suivante = **0171** (dernière : 0170_account_deletion_multifoyer_snapshot.sql) | numéroter en 0171+ |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | D-05 : « participations actives » = `left_at is null` seul ; l'archive personnelle n'empêche pas la réouverture (un fil archivé pour moi se réveille à l'écriture, `unarchive_on_send` 0131) | Pattern 1 | si le planner lit autrement, un fil archivé recréerait un doublon — trancher explicitement en plan |
| A2 | Le runtime Realtime self-hosted délivre les événements `postgres_changes` des tables de la publication dès que le service `realtime` tourne (wal_level logical par défaut de l'image Supabase) | Pitfall 4 / MSG-05 | la preuve D-09 pourrait révéler un défaut de config (realtime.listeners, sec. ws) — c'est précisément son rôle |
| A3 | Le compteur groupé depuis la file (Pattern 3) satisfait D-06 « depuis la dernière notification envoyée » : la file est vidée à chaque envoi, donc son contenu = messages depuis le dernier envoi | Architecture Patterns | si un groupe non consommé (0 appareil livré) s'accumule, le compteur grossit — comportement souhaitable et conforme « s'ajoute au compteur de la notification suivante » (D-07) |
| A4 | L'Edge accepte la mutation `reminder_id` → liste d'ids sans rupture pour les scopes rappels/anniversaires (payload conditionnel par kind) | Pattern 3 | à couvrir par l'extension de test-dispatch-push.sh (consumed par groupe) |

## Open Questions (RESOLVED — voir 29-02-PLAN.md)

Les deux questions ci-dessous sont tranchées dans 29-02-PLAN.md et ne sont plus ouvertes :

1. **Forme exacte du payload groupé entre SQL et Edge** (scalaire vs jsonb, rétro-compat des trois scopes) — **RÉSOLU (29-02-PLAN.md)** : champ additionnel `reminder_ids` jsonb sur les notifications de scope `messages`, Edge consomme `reminder_ids ?? [reminder_id]` ; aucun scope existant ne change.
   - What we know: `due_push_notifications` retourne `reminder_id` scalaire ; l'Edge pousse `{ kind, id }` à `consume_push_reminders`.
   - What's unclear: préférer un champ `reminder_ids` ajouté (rétro-compatible) ou une forme conditionnelle par kind.
   - Recommendation: champ additionnel `reminder_ids` sur les notifications de scope `messages`, Edge consomme `reminder_ids ?? [reminder_id]` — aucun scope existant ne change.

2. **Le title groupé (« 2 nouveaux messages de X ») quand plusieurs expéditeurs dans un fil de groupe** — **RÉSOLU (29-02-PLAN.md)** : « N nouveaux messages dans {fil} » pour les groupes, « de {prénom} » pour les directs — règle verrouillée : jamais le contenu ; le titre du fil, lui, n'est pas du contenu de message.
   - What we know: D-06 cite une directe (« de X ») ; 0042 utilise le prénom du dernier expéditeur.
   - Recommendation: « N nouveaux messages dans {fil} » pour les groupes, « de {prénom} » pour les directs — arbitrage plan (règle verrouillée : jamais le contenu ; le titre du fil, lui, n'est pas du contenu de message).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker + stack Supabase | migrations, tests SQL, preuves push/realtime | ✓ (scripts db_* existent, run.sh) | snapshot épinglé | — |
| pg_cron | job `eo-push-messages` | ✓ (0042 l'installe, garde `to_regclass('cron.job')`) | — | notice + job absent (déjà géré) |
| pg_net + Vault | dispatch push réel | ✓ (test-dispatch-push.sh:70-92 le vérifie) | — | le script s'arrête et le dit (§2.7) |
| Service `realtime` du conteneur | preuve D-09 | à vérifier en exécution (`sh run.sh ps`) | — | si absent : bloquant pour MSG-05, aucun fallback honnête |
| Abonnement push réel (appareil) | extension test-dispatch-push.sh | exigé par le script existant (ligne 103-120) | — | script s'arrête avec consigne de réinscription |

**Missing dependencies with no fallback:**
- aucune identifiée ; le service `realtime` est dans le snapshot officiel — sa présence se vérifie à l'exécution (run.sh ps) et la preuve D-09 l'exige.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5 (app) + testkit SQL (`scripts/test-db.sh`) + scripts shell de preuve |
| Config file | app/vitest config existante ; `supabase/tests/` pour le SQL |
| Quick run command | `cd app && npm run typecheck && npm test` |
| Full suite command | chaîne §2.7 complète : typecheck + tests + build + e2e + check-sql-statique + test-db.sh + test-dispatch-push.sh (+ nouveau test-realtime) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MSG-01 | RPC rouvre au second appel, recrée après départ, course à deux appels = 1 fil | SQL (testkit, assertions bornées par foyer) | `sh scripts/test-db.sh` | ❌ Wave 0 (migration 0171) |
| MSG-02 | watermark écrit à l'ouverture/focus, jamais par message ; migration localStorage | Vitest (hooks) + SQL (upsert RLS own) | `cd app && npm test` ; `sh scripts/test-db.sh` | ❌ Wave 0 |
| MSG-03 | RPC refuse un non-membre, retourne co-membres actifs + read_at | SQL (cas négatifs : hors foyer, non-membre) | `sh scripts/test-db.sh` | ❌ Wave 0 |
| MSG-04 | title groupé sans contenu, consumed par groupe, compteur juste | shell attribuable | `sh scripts/test-dispatch-push.sh` (étendu) | ❌ extension du script |
| MSG-05 | événement INSERT reçu par souscription réelle | shell (WS runtime conteneur) | `sh scripts/test-realtime-subscription.sh` | ❌ Wave 0 (nouveau) |
| — | contrôle statique SQL | python | `python3 scripts/check-sql-statique.py && python3 scripts/test-check-sql-statique.py` | ✅ |

### Sampling Rate
- **Per task commit:** typecheck + tests app + check-sql-statique
- **Per wave merge:** test-db.sh (Docker requis)
- **Phase gate:** chaîne §2.7 complète + les deux scripts de preuve (push groupé, Realtime) verts, chacun attribuable

### Wave 0 Gaps
- [ ] Migration 0171 et ses tests SQL (MSG-01/02/03/04)
- [ ] `scripts/test-realtime-subscription.sh` (MSG-05, D-09)
- [ ] Extension `test-dispatch-push.sh` (groupement D-06)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | oui (existant) | Supabase Auth, `auth.uid()` dans chaque RPC (0041:41) |
| V3 Session Management | non | rien de nouveau |
| V4 Access Control | **oui, cœur de la phase** | RLS + RPC SECURITY DEFINER `search_path = ''` ; le RPC de watermarks vérifie l'appartenance active au fil |
| V5 Input Validation | oui | validation des paramètres en tête de RPC (errcode 22023, modèle 0041:52-67) ; Zod côté app inchangé |
| V6 Cryptography | non (chiffr. push VAPID existant) | inchangé (`encryptPayload` push-notify) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Lecture des watermarks d'autrui (allongement de surface : lire `notification_reads` de co-membres) | Information Disclosure | RPC SECURITY DEFINER borné à la conversation dont l'appelant est membre actif ; jamais de lecture globale |
| Doublon de conversation par course | Tampering | `pg_advisory_xact_lock` transactionnel |
| Fuite de contenu via push (existant) | Information Disclosure | body sans contenu, testé par le script d'attribut |
| Escalade via `returns table` non qualifié | Elevation | §2.7-A : `search_path = ''`, noms qualifiés, contrôle statique |

**RLS :** aucune table nouvelle si le watermark reste sur `notification_reads` (recommandé, discrétion D-04 : table existante). Si le planner crée `conversation_reads` dédiée : RLS activée, politiques propres-owner + RPC de lecture des co-membres, tests négatifs inter-foyer (§2.6).

## Sources

### Primary (HIGH confidence)
- `supabase/migrations/0042_message_notifications.sql` — file, ventilateur, job 5 min, **fuite de contenu lignes 82-85**
- `supabase/migrations/0130_fix_dispatch_messages.sql` — forme corrigée du dispatch (précédent de correction vers l'avant)
- `supabase/migrations/0046_notification_reads.sql` — table watermark existante, RLS own-only, realtime
- `supabase/migrations/0041_conversation_lifecycle.sql` — gabarit du RPC `create_conversation` (acteur, validation, transaction)
- `supabase/migrations/0010_storage_and_realtime.sql:76-78` — tables messages déjà publiées
- `app/src/lib/notification-reads.ts` — `useSyncedReads`, fusion max(local, serveur), `latestRead`
- `app/src/modules/messages/hooks/use-messages.ts` + `api.ts` — readMap, mutations, realtime client
- `app/src/modules/messages/messages-page.tsx:47` — point d'écriture markRead à l'ouverture
- `supabase/functions/push-notify/index.ts:263-337` — consommation par `{ kind, id }`, rapport
- `scripts/test-dispatch-push.sh` — discipline de preuve attribuable (seminate, max(id), nettoyage vérifié)
- `.planning/phases/29-messagerie-v2/29-UI-SPEC.md` — surfaces UI approuvées, MemberAvatar sm 23px, pas de nouveau composant

### Secondary (MEDIUM confidence)
- A2 (config Realtime self-hosted) — à confirmer par la preuve D-09 elle-même

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zéro dépendance nouvelle, tout est dans le dépôt
- Architecture: HIGH — chaque chantier remplace un point précis déjà lu dans la source
- Pitfalls: HIGH — fuite de contenu et ambiguïtés `returns table` vérifiées sur les fichiers

**Research date:** 2026-10-29
**Valid until:** 2026-11-28 (code interne ; revalider si des migrations messages sont ajoutées d'ici là)
