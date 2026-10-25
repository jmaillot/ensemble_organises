# Phase 11: Cercle — Context

**Gathered:** 2026-10-12 (read-only audit, no code touched)
**Status:** Ready for planning

<domain>
## Phase Boundary

Réparer l'intégrité du Cercle : le contenu d'autrui ne doit plus être
modifiable par n'importe quel membre, et la suppression doit suivre
la même règle auteur-ou-admin côté serveur comme côté UI — plus
l'édition/suppression de ses propres commentaires qui manque. Pas de
vidéo (dépôt non outillé), pas d'historique d'édition, pas d'audience
par publication — hors phase.

</domain>

<decisions>
## Implementation Decisions

### Contenu d'autrui modifiable (constat audit, HIGH)
- **D-01:** La relaxation 0081 (WITH CHECK = écrivain) a levé la seule
  barrière d'auteur sur le *contenu* des posts/commentaires. Correctif :
  trigger garde-fou (auteur-ou-admin pour UPDATE sur posts/comments,
  `author_id` déjà gelé) + preuves, même forme que les gardes gift.
- **D-02:** Réactions : bascule existante inchangée (déjà auteur-bornée
  par l'unicité) ; variété `reaction_type` toujours hors scope.

### Suppression incohérente (constat audit, HIGH)
- **D-03:** Règle unique auteur-ou-admin pour DELETE sur
  posts/comments/reactions (même forme que messages 08-03) : l'UI
  `canDelete = mine||admin` devient vraie côté serveur aussi.
  Suppression du fil entier : inchangée (cascade, admin ou auteur
  selon l'existant — à vérifier, pas à élargir).

### UI manquante (constat audit, MEDIUM)
- **D-04:** Éditer (auteur seul, inline) et supprimer (auteur seul,
  admin sur autrui, modale AGENTS.md §6) ses posts et commentaires.
  Règle unique, même forme que messages : l'auteur écrit le sien,
  l'admin modère, personne ne touche à autrui.
- **D-05:** Plafonds UI alignés sur la base (commentaire 2000,
  post 4000) au lieu des 400/600 actuels — sans changer la base.
- **D-06 :** réponse inline sous chaque post (derniers commentaires
  visibles + champ d'envoi direct, dialogue complet conservé pour
  l'historique) — même RLS, même modération, pas de nouveau modèle.
- **D-07 :** suppression strictement auteur (posts, commentaires,
  réactions, messages — ces derniers déjà auteur-seul depuis 08-03) :
  branche admin retirée des politiques de suppression unitaire ;
  l'archivage admin d'un fil (08-09) reste — il fige sans détruire,
  fonction de gestion distincte de la suppression.

### Explicitement différé (pas des gaps)
- Vidéo (dépôt + compression non outillés), historique d'édition,
  audience par publication, compteurs/pluriels cosmétiques.

### the agent's Discretion
Libellés éditer/supprimer, détail des copies de modale.
</decisions>
