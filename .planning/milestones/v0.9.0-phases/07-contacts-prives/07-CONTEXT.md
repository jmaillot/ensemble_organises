# Phase 07: Contacts privés - Context

**Gathered:** 2026-10-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Deux volets autour des listes de contacts personnelles : (1) boucher la
fuite par laquelle un contact personnel daté devient visible à tout le
foyer via le miroir anniversaires ; (2) permettre de déplacer un contact
d'une liste personnelle vers la liste « Famille ». Pas de resserrement
OQ-2 (les admins gardent l'accès aux personnelles), pas de déplacement
Famille→personnel, pas de nouveau module — hors phase.

</domain>

<decisions>
## Implementation Decisions

### Fuite miroir (constat UAT 2026-10-08)
- **D-01:** Le trigger `mirror_contact_birthday` (0078) miroite tout contact
  daté, y compris ceux des listes personnelles — or les `birthdays` sont
  lisibles à tout le foyer. Un contact personnel (nom + date + photo)
  fuit donc vers tous les membres via Anniversaires.
- **D-02:** Correctif : le miroir ne sert que les listes « Famille »
  (`owner_member_id IS NULL`) ; purge des miroirs existants issus de
  listes personnelles, en migration forward-only (0078 intouchée).
- **D-03:** Preuve rouge→vert exigée : un membre B lit les birthdays —
  contact personnel daté invisible, contact Famille visible.

### Déplacement vers Famille
- **D-04:** Action « Déplacer vers Famille » sur les contacts des listes
  personnelles, modale de confirmation (changement de visibilité,
  sensible vie privée). Écriture client directe (`list_id` + RLS :
  écriture requise sur l'ancienne ET la nouvelle liste — à prouver).
  Le miroir suit automatiquement via le trigger (D-01 corrigé).
- **D-05:** Un seul sens : personnel→Famille. Famille→personnel refusé
  (assignation d'un propriétaire + arbitrage : hors phase).

### Explicitement conservé
- **OQ-2 inchangée :** les admins du foyer gardent lecture/écriture sur
  les listes personnelles (gestion : suppression de liste admin-only).
  Resserrement au seul propriétaire = décision produit ultérieure,
  notée en différé, pas un gap.
- **Amendement UAT 2026-10-08 (resserrement demandé) :** les listes
  personnelles deviennent strictement propriétaire-only en lecture ET
  écriture — les admins perdent l'accès en lecture. Conservé admin-only :
  la suppression de liste et la suppression de contacts (hygiène,
  aveugle). Plan 07-02.
- **Constat 07-02 prouvé (blind-delete) :** l'hygiène aveugle admin ne
  survit pas au resserrement — PostgreSQL exige la visibilité SELECT
  pour DELETE, donc les suppressions admin sur lignes illisibles ne
  matchent rien (sans erreur). Accepté : l'hygiène des départs est
  couverte par cascade (prouvé), et aucune UI admin ne gérait les
  personnelles d'autrui. Une purge modérée d'un membre courant
  demanderait une fonction purge + design produit — différé explicite.

### the agent's Discretion
Libellé exact du bouton de déplacement, détail du compteur de listes
dans l'onglet contacts Cadeaux (comptes RLS-filtrés uniquement).
</decisions>
