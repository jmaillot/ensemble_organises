# Phase 15: Espace voyage — Context

**Gathered:** 2026-10-12 (questions UAT + recherche dédiée)
**Status:** Ready for planning

<domain>
## Phase Boundary

Faire du voyage un conteneur collaboratif : création (infos +
composants + participants), fiche à onglets (Infos, Courses, Notes,
Tâches, Adresses, Budget, Paramètres), participants sélectionnés +
invités code, ardoise liée avec répartition, fermeture douce. Pas de
checklist/participants par voyage au-delà des membres, pas de vidéo,
pas de carte géo — hors phase.

</domain>

<decisions>
## Implementation Decisions (locked — UAT 2026-10-12 + recherche)

- **Participants :** sélectionnés à la création (admin/membre, enfants
  exclus comme ardoise) + invités externes via code (motif HMAC des
  invites cadeaux/ardoise). Pas de visibilité foyer automatique.
- **Données :** propres au voyage (`trip_id` nullable sur
  shopping_lists/notes/tasks/places + ardoise liée via
  `ardoises.trip_id` UNIQUE ; expenses via son ardoise, jamais de
  `trip_id` direct). Hybride recommandé par la recherche — voir
  résumé ci-dessous.
- **Budget :** ardoise complète liée (1 voyage = 1 ardoise max) :
  `fetchArdoiseSettlement` tel quel, participants trip↔ardoise
  synchronisés, invités avec part guests (0064 déjà dual).
- **Invités externes :** créent leurs dépenses directement (décision
  UAT, contre l'avis recherche) — via action Edge dédiée sous ticket
  vérifié, jamais en PostgREST direct.
- **Onglets désactivés :** conservés masqués (jamais supprimés).
- **Anciens voyages :** table rase (DELETE, seeds démo intacts).
- **Admins :** voient tous les voyages (modération) sans y participer.
- **Suppression :** fermeture douce (figé, réouvrable admin),
  jamais de cascade destructive.
- **Réutilisation :** détail/répartition ardoise tels quels ;
  listes/notes/tâches/adresses = forks à filtre `tripId` (pas de
  drop-in) ; dialogue d'invitation calqué sur gift-share-dialog.

## Résumé recherche (recommandations à suivre sauf preuve contraire)

- Tables neuves : `trip_members` (FK membres uniquement),
  `trip_guests` (miroir ardoise_guests, ticket nullable),
  `trip_invites` (miroir gift_list_invites, secret dédié
  `TRIP_INVITE_HMAC_SECRET`), `tab_state` jsonb sur trips,
  `created_by` sur trips.
- Nouvelle Edge `trip-invite` (`auth: user+publishable`) : copier
  byte-motif (HMAC, oracle unique, rate-limits, child-guard),
  adapter les actions (create-trip atomique, join idempotent,
  redeem-guest, guest-view/link-view sans conso use_count,
  member-leave) ; header guest dédié + CORS ; ticket en
  localStorage `eo:trip:ticket:<tripId>`.
- RLS : helper `is_trip_member` conjoncté sur les 4 tables +
  trips (membre/participant/admin) ; alignement `trip_id→household`
  par triggers (anti-forge) ; `task_lists`/`note_folders` restent
  foyer (`folder_id=NULL`) ; ardoise liée hérite via enrollment
  synchronisée (create/join/leave/remove dans les deux tables).
- Ranges : tâche assignée ∈ membres du voyage ; réadhésion par
  admin/gestionnaire ; `paid_by` jamais inter-foyer (une ardoise =
  un voyage = un foyer).
- Risques top : conjonct `trip_id` oublié (négatifs par table),
  escalation invité (aucun PostgREST, Edge seule), mélange
  inter-voyages via ardoise (garde même-foyer trip↔ardoise),
  orphelins Storage `trips/<id>/` (sweep à la fermeture),
  realtime par voyage ouvert uniquement (+ publication additive).
- E2E : nouveau spec voyage-workspace en démo (création, onglets
  étanches, budget, code, toggle onglet, départ) + seeds démo
  (membres, invité, lignes tripées, ardoise liée).

## Plan de validation (exigé, Playwright demandé par l'utilisateur)

- Parcours Playwright demo exigé en preuve finale (création →
  onglets → budget → partage → départ), desktop + mobile.
- SQL : atomicité create-trip, oracle uniforme, idempotence join,
  cascade... non — fermeture douce : pas de cascade ; étanchéité
  RLS par table ; `check-sql-statique.py` vert.

### the agent's Discretion
Forme `tab_state`, taille de page, libellés onglets/modales, nom
exact des colonnes (convention du schéma), détail du sweep Storage.
