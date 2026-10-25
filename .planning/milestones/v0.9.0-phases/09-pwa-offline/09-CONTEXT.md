# Phase 09: PWA offline — Context

**Gathered:** 2026-10-08 (read-only audits, no code touched)
**Status:** Ready for planning

<domain>
## Phase Boundary

Rendre l'offline-first réel et l'installation crédible : lectures
offline qui marchent, file de synchro élargie au-delà du signal
`onLine`, installabilité prouvée (icônes + manifeste unique), panneau
honnête, et fondations testées. Pas de refonte du protocole de
synchro (pas de vectoriel/fusion — dernier-écrivain documenté), pas
de push invités/Cercle — hors phase.

</domain>

<decisions>
## Implementation Decisions

### Lectures offline (promesse cœur brisée)
- **D-01:** Brancher le repli `readCached` : en mode Supabase, un `list`
  en échec sert les lignes Dexie au lieu de lever (signal : échec
  réel, pas seulement `navigator.onLine === false`).
- **D-02:** La file déclenche sur l'échec constaté (timeout, 5xx,
  portail captif), pas sur le seul drapeau navigateur ; `removeWhere`
  rejoint la file.

### Installabilité (prétention non prouvée)
- **D-03:** Icônes raster 192 + 512 (maskable), manifeste unique
  (supprimer ou aligner la source statique vs bloc inline),
  nom de sortie SW vérifié contre la règle nginx (`sw.js`).
  Preuve : build + audit Lighthouse PWA joint au SUMMARY.

### Honnêteté et arrière-plan
- **D-04:** Panneau offline et bannière disent le réel (lectures
  servies, file en attente visible, dernière synchro) ; plus de
  sur-promesse.
- **D-05:** Handler Background Sync dans le SW + enregistrement côté
  client quand disponible (dégradation propre sinon) : la file
  rejouée onglet fermé quand le navigateur le permet.
- **D-06:** Conflits documentés (dernier-écrivain, replay sans
  idempotence au-delà du randomId) + tests file/synchro/SW-handlers.

### Étapes opérateur (manuelles, pas des plans)
- **M-01:** Preuve push prod : `sh scripts/test-dispatch-push.sh` avec
  un vrai appareil abonné (un endpoint factice rend `dropped`).
- **M-02:** VAPID prod : clés générées + copiées dans le `.env` stack
  (service functions), vérifiées via le panneau notifications.

### Retour re-test UAT 2026-10-09 (premier lancement hors ligne)
- **D-07 :** cache vide = état explicite (« reconnecte-toi pour
  charger » + réessai au retour réseau), jamais une liste vide
  muette ; les créations en file restent visibles en attendant
  le rejeu.
- **Limites connues actées (09-05, pas des gaps) :** créations
  Edge/RPC/Supabase-directes (ardoise, idées/listes cadeaux,
  conversations) non mettables en file — pages honnêtes, reste
  en ligne par construction ; `resource.create` retient sans
  confirmation explicite ; toasts dans hooks cercle/voyages
  inchangés (hors bornes).
- **D-08 :** synchro foyer complet : bouton manuel (télécharge toutes
  les tables du foyer pour l'usage hors ligne) + synchro périodique
  automatique tant que l'app est ouverte et en ligne (intervalle
  documenté) ; progression visible, échec par table sans tout
  arrêter, file de mutations rejouée avant le plein (le serveur
  gagne, puis on recharge).
- **D-09 :** navigation fiable hors ligne : préchargement des pages en
  arrière-plan (en ligne, à l'idle), garde d'erreur par route avec
  réessai au lieu du fallback figé, précache SW vérifié couvrant
  les morceaux — sans retirer le offline.
- **D-10 (retrait demandé UAT 2026-10-12) :** le mode offline données est
  retiré : plus de cache Dexie côté Supabase, plus de file, plus de
  repli, plus de synchro foyer/timer, plus de panneau/bannière/états
  offline (les listes vides authentiques et les erreurs réseau
  d'origine reviennent). Conservés : PWA installable + push (SW
  allégé : précache + push, sans cache données), mode démo local
  (IndexedDB), manifest, docs/PWA.md mise à jour. La garde par route
  09-06 reste (coquille d'erreur avec réessai, utile en ligne aussi).

### the agent's Discretion
Taille de page Background Sync, détail des icônes (maskable),
formulation des notes iOS.
</decisions>
