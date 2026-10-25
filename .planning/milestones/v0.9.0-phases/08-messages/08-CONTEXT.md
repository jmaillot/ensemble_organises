# Phase 08: Messages — Context

**Gathered:** 2026-10-08 (read-only audits, no code touched)
**Status:** Ready for planning

<domain>
## Phase Boundary

Combler les manques de la messagerie privée (direct + groupes déjà en
place, temps réel + push + lectures synchronisées déjà câblés) : un bug
réel bloquant (image enfant), trois affordances RLS-prêtes mais sans
bouton, la pagination absente, et les preuves SQL manquantes. Pas de
modification du scope produit (fil simple vs privé déjà tranché par
l'existant : privé complet), pas d'indicateurs de frappe ni d'accusés
par message — hors phase.

</domain>

<decisions>
## Implementation Decisions

### Bug bloquant
- **D-01:** Les enfants conversent (texte OK) mais l'envoi d'image échoue
  (403) : le Storage `household-media` exige `can_write_household`
  (admin/membre). Aligner le dépôt d'images messages sur la décision
  produit (membre de la conversation, enfant inclus) — RLS Storage
  uniquement, jamais de contournement client.

### Affordances manquantes (toutes RLS-prêtes, prouvé par l'audit)
- **D-02:** Édition de ses propres messages (déjà autorisée sender-only).
- **D-03:** Suppression d'un message seul (sender ou admin).
- **D-04:** Quitter une conversation (self-removal déjà permis).
- Chacune avec confirmation modale quand destructrice (AGENTS.md §6).

### Échelle
- **D-05:** Pagination : chargement par conversation (limit/order),
  chargement progressif, fin du dump complet du foyer.

### Preuves SQL manquantes
- **D-06:** Matrice outsider-SELECT, update/delete sender-vs-autrui,
  self-leave vs non-membre, isolation `notification_reads` —
  étendre les suites existantes (pas de suite fourre-tout neuve si
  l'extension tient).

### Explicitement accepté (pas des gaps)
- Direct à N participants non contraint, CHECK titre `''` tolérant :
  dérive design mineure, documentée, non bloquante.
- Pas d'accusé par message ni de frappe en cours : scope assumé.

### Amendement UAT 2026-10-08 (retours re-test)
- **D-07 :** suppression d'un message = son auteur seul (retrait du
  delete admin sur autrui, RLS comprise ; la suppression admin du fil
  entier reste le levier de modération).
- **D-08 :** départ = pierre tombale (`left_at`) au lieu de suppression
  du rang : le partant relit l'historique (lecture seule), ne réécrit
  plus ; section « Quittées » + retrait de ses archives (suppression
  de sa propre pierre). Réadhésion : par un admin/gestionnaire comme
  avant (le partant seul ne se ré-ajoute pas).
- **D-09 :** départ annoncé dans le fil (ligne système figée serveur,
  infalsifiable, sans push ni non-lus) ; actions bulle en icônes
  compactes sur la ligne du texte (labels + modale conservés).
- **D-10 :** archives figées au départ : le partant relit les messages
  jusqu'à son `left_at`, jamais les suivants (borne serveur, pas un
  tri client) ; réadhésion puis nouveau départ = nouvelle borne.
- **D-11 :** arrivée annoncée comme le départ (ligne système figée,
  mêmes garanties) — sauf les membres présents à la création (pas de
  spam initial) ; fil solo (un seul membre actif) signalé au
  compositeur, envoi toujours permis.
- **D-12 :** réadhésion = effacement du `left_at` (jamais
  supprimer+recréer) : le ré-ajouté relit tout (membre actif, borne
  levée), son arrivée s'annonce comme tout ajout ultérieur ; même
  habilitation que l'ajout (participant actif ou admin).
- **D-13 (amende D-12, UAT 2026-10-09) :** les absences sont mémorisées
  (périodes) : le ré-ajouté ne relit PAS les messages parus pendant
  ses absences — ni les annonces système de la période. Réadhésion
  ultérieure : nouvelle période, trous cumulés. Membres déjà
  ré-ajoutés avant ce changement : trou irrattrapable (borne perdue),
  historique complet conservé et documenté.
- **D-14 :** suppression admin = archivage-pour-tous : tombe tous les
  membres actifs (fenêtres figées chacun à l'instant d'archivage),
  jamais les déjà-partis (leur borne est intouchable) ; fil figé,
  relisible en archives par tous, inscriptible par personne ;
  restauration = non demandée, notée en différé.

### the agent's Discretion
Libellés des boutons, taille de page, détail du compteur de non-lus.
</decisions>
