# Phase 29: Messagerie v2 - Context

**Gathered:** 2026-10-29
**Status:** Ready for planning

<domain>
## Phase Boundary

La messagerie devient v2 humainement utilisable : conversations directes démarrées depuis le member-picker via un RPC serveur avec garde anti-doublon, accusé de lecture alimenté par un **watermark par membre et par conversation** (aucune écriture par message — décision de migration verrouillée au roadmap, pas un retrofit), notifications push groupées sans contenu de message via la chaîne `dispatch_messages`→`push-notify` existante, et publication Realtime `supabase_realtime` self-hosted complétée et prouvée par une souscription réelle.

**Hors périmètre :** groupements de conversation, recherche, messagerie privée inter-foyer, accusés d'écriture (typing indicators), indiqués comme idées futures. La Phase 25 fournit déjà le member-picker correct pour les profils enfants.

</domain>

<decisions>
## Implementation Decisions

### Watermark de lecture & accusés
- **D-01:** Le watermark d'un membre est mis à jour **à l'ouverture du fil** (et au retour sur l'onglet), pas à chaque message affiché. Une écriture par session de lecture, pas par message reçu en direct. — **Reversibility:** reversible.
- **D-02:** Côté émetteur, l'accusé de lecture s'affiche sous le dernier message envoyé : **avatars colorés des membres qui ont lu + horodatage** (cohérent avec les colorTags de l'app). — **Reversibility:** reversible.
- **D-03:** Le localStorage existant (`ensemble-organises-messages-read`, via `useSyncedReads`) est **porté vers la table serveur au premier chargement** (migration client) — pas de départ vierge, pas de faux non-lus. La clé est ensuite retirée. — **Reversibility:** one-way — une fois la clé locale effacée après migration, l'horodatage local n'existe plus ; le serveur devient la seule référence.

### Démarrage direct & anti-doublon
- **D-04:** Entrée = **member-picker** (phase 25) : un tap sur un membre démarre ou rouvre la conversation directe — conforme au critère 1 « démarrer depuis un autre membre ».
- **D-05:** Le RPC de démarrage **rouvre la directe existante** s'il existe une directe entre les deux membres où les deux participations sont **actives** (ni quittée via pierre tombale 0101, ni archivée-désactivée). Si l'un des deux l'avait quittée, une **nouvelle** conversation est créée (la pierre tombale reste). — **Reversibility:** reversible.

### Notifications groupées
- **D-06:** Le compteur « 2 nouveaux messages de X » est calculé **côté dispatch** : une seule notification par conversation, comptant les messages accumulés depuis la dernière notification envoyée à ce membre pour cette conversation. Le `tag` conversation existant (0042) reste la clé de regroupement OS.
- **D-07:** Rythme = **au cycle du dispatch** (5 min) : ce qui arrive pendant un cycle s'ajoute au compteur de la notification suivante — pas d'antidébordement type « première immédiate puis pause » (état supplémentaire refusé). — **Reversibility:** reversible.
- Rappel verrouillé (repris du roadmap, non re-discuté) : les notifications ne portent **jamais le contenu du message**.

### Realtime self-hosted
- **D-08:** L'événement Realtime sert à **rafraîchir le fil ouvert et la liste** (nouveaux messages, badges) — pas d'accusés de lecture en temps réel (pas de souscription aux watermarks, surface à prouver réduite). — **Reversibility:** reversible.
- **D-09:** La preuve (critère 4) = **test avec vraie souscription** : le test SQL appelle une souscription réelle via le runtime Realtime du conteneur et prouve qu'un événement INSERT arrive à l'insertion — philosophie « vu rouge avant vert » (§2.7-B). Pas d'e2e Playwright à deux contexts.

### the agent's Discretion
- Forme exacte de la table de watermark (`conversation_reads` dédiée vs colonne) et son RLS — le chercheur/planner tranche avec les contraintes existantes (fonctions SECURITY DEFINER, `search_path` vide).
- Détails de la migration client du localStorage (seuil de déclenchement, effacement après confirmation serveur).
- Présentation exacte des avatars d'accusé (taille, ordre) — arbitrage UI en plan, sur les tokens existants.
- Structure du RPC anti-doublon (signature, transaction, verrou anti-course pour deux démarrages simultanés de la même paire).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Exigences verrouillées
- `.planning/REQUIREMENTS.md` § Messagerie — MSG-01…MSG-05 (table de traçabilité)
- `.planning/ROADMAP.md` § Phase 29 — objectif, dépendance 25, critères de succès 1-4, UI hint: yes
- `.planning/research/SUMMARY.md` — recherche jalon v1.0

### Code de référence direct (fondations de la phase)
- `app/src/modules/messages/hooks/use-messages.ts` — `useReadConversations` / `useSyncedReads` (localStorage `ensemble-organises-messages-read`), commentaire qui annonce explicitement son remplacement par un accusé serveur ; `unread` 1/0 borne inférieure honnête
- `app/src/modules/messages/api.ts` — `createConversation` actuel (sans garde anti-doublon) : le RPC MSG-01 le remplace pour les directes
- `supabase/migrations/0042_message_notifications.sql` — file `message_notifications`, ventilateur à la lecture, `tag` conversation, job `eo-push-messages` 5 min
- `supabase/migrations/0041_conversation_lifecycle.sql` — cycle de vie des conversations
- `supabase/migrations/0101_message_system_leave.sql` — pierre tombale `left_at` (condition de D-05)
- `supabase/migrations/0010_storage_and_realtime.sql`, `0049_calendrier_realtime.sql`, `0110_realtime_voyages_animaux.sql` — publication `supabase_realtime` existante, gabarit à étendre
- `supabase/functions/dispatch_messages` → `push-notify` — chaîne push à étendre (compteur D-06)
- `scripts/test-dispatch-push.sh` — preuve push attribuable (§2.7), à étendre pour le groupement
- `app/src/modules/messages/components/chat-panel.tsx` — emplacement des avatars d'accusé (D-02)

### Disciplines héritées
- `AGENTS.md` §2.7 — chaîne de vérification avant commit ; assertions bornées par foyer ; contrôle statique SQL
- `.planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-CONTEXT.md` — member-picker incluant les profils enfants (D-04)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useSyncedReads` : mécanisme de read-map synchronisé à migrer vers le serveur (D-03) — la surface d'appel (`readMap`, `markRead`) peut rester identique
- Chaîne push 0042 : `enqueue_message_notification` (trigger) → `due_push_notifications` → `consume_push_reminders` + job 5 min — le compteur (D-06) s'insère au dispatch, pas dans le trigger
- Publication Realtime existante (0010/0049/0110) : gabarit SQL pour ajouter les tables messages au `supabase_realtime`
- Member-picker phase 25 : point d'entrée des directes (D-04), inclut déjà les enfants gérés

### Established Patterns
- Fonctions SQL : `security definer`, `set search_path = ''`, noms qualifiés — s'applique au RPC anti-doublon et à la mise à jour du watermark
- Preuve par déclenchement réel (§2.7-B) : la souscription Realtime (D-09) et le groupement push (`test-dispatch-push.sh`) doivent être vus rouge avant vert
- `test-db.sh` s'arrête à la frontière HTTP : la preuve Realtime exige le runtime Realtime du conteneur, pas seulement psql

### Integration Points
- `eo-push-messages` (pg_cron, 5 min) : point d'insertion du compteur groupé (D-06/D-07)
- Badges non-lus de la liste (1/0 aperçu) : le watermark serveur (MSG-02) les alimente à la place du localStorage
- TanStack Query : les événements Realtime invalident les caches fil/liste (D-08)

</code_context>

<specifics>
## Specific Ideas

- L'utilisateur a choisi les avatars + horodatage pour l'accusé (D-02), plus riche que le simple « Vu par » texte — assumé comme plus cohérent avec les colorTags membres.
- Le rythme des notifications reste volontairement au cycle 5 min (D-07) : pas de notif instantanée par message, cohérent avec le groupement « sans spam » des guidelines §6 (Cercle).

</specifics>

<deferred>
## Deferred Ideas

- Accusés de lecture en temps réel via souscription aux watermarks (variante refusée de D-08) — réouvrable si un besoin d'instantanéité se manifeste.
- Antidébordement de notifications type Android (« première immédiate puis pause ») — variante refusée de D-07, état serveur supplémentaire.
- Indicateurs d'écriture (typing indicators) — jamais dans le périmètre v2, classé hors phase depuis le roadmap.

</deferred>

---

*Phase: 29-Messagerie v2*
*Context gathered: 2026-10-29*
