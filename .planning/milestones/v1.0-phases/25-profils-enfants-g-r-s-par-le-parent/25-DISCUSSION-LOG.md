# Phase 25: Profils enfants gérés par le parent - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-25
**Phase:** 25-Profils enfants gérés par le parent
**Areas discussed:** Gestionnaire & écran, Agir au nom de l'enfant, Enfants avec compte existant, Transition vers un vrai compte, Profil enfant & multi-foyers, Notifications enfant, Argent de poche (idée)

---

## Gestionnaire & écran

| Option | Description | Selected |
|--------|-------------|----------|
| Admin seul | Cohérent avec l'énoncé roadmap et `set_member_role` ; RLS et audits plus simples | |
| Admins + membres | Tout adulte peut créer un profil enfant | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Members-panel étendu | Le panneau existant (badge ambre enfant) accueille création/édition | ✓ |
| Section enfants dédiée | Liste distincte, deux listes pour un modèle unique | |

| Option | Description | Selected |
|--------|-------------|----------|
| Conserver les traces | Histoire du foyer exacte, seul le membre disparaît des sélecteurs | ✓ |
| Purger les traces | Réécrit l'historique visible (streaks, compteurs) | |

| Option | Description | Selected |
|--------|-------------|----------|
| Fiche membre standard | Nom, couleur, date de naissance optionnelle | |
| Fiche enrichie | Champs spécifiques à trancher | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Date de naissance + âge | Stockée, âge calculé affiché | ✓ |
| Restrictions par module | Formalisme type disabled_modules (0140) au niveau membre | ✓ |
| Photo gérée par le parent | Bucket household-media, chaîne avatars | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Tout adulte | Même règle que la création, pas de propriété individuelle | ✓ |
| Créateur + admins | Traçabilité renforcée, blocages pratiques | |

| Option | Description | Selected |
|--------|-------------|----------|
| Tout activé par défaut | Naît avec accès à tout, resserrement ensuite | |
| Socle restreint par défaut | Tâches, routines, anniversaires, menu ; reste opt-in | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Figé, codé en dur | Sans session = géré ; jamais admin, `set_member_role` réservée aux comptes réels | ✓ |
| Configurable par fiche | Booléen par fiche, critère produit de plus | |

| Option | Description | Selected |
|--------|-------------|----------|
| Tout adulte | Filiation intrinsèque, audit par la trace, pas de champ de rattachement | ✓ |
| Responsables désignés | Filiation explicite, enfant orphelin bloqué | |

| Option | Description | Selected |
|--------|-------------|----------|
| Aucune limite | Homonymes permis, départage visuel | ✓ |
| Plafond de profils | Garde-fou anti-abus avant ouverture publique | |

**Notes:** « Accès » relu à voix haute par l'agent : l'enfant n'a aucune session, « accès » = espaces où il peut figurer (être attributaire/mentionné). Utilisateur d'accord.

---

## Agir au nom de l'enfant

| Option | Description | Selected |
|--------|-------------|----------|
| Switch d'identité global | Immersif, ambigu, état à oublier | |
| Choix par action | « au nom de… » via member-picker, trace explicite | ✓ |

Périmètre v1 (multi-select) : Tâches ✓, Routines ✓ — Cercle **non coché**.

| Option | Description | Selected |
|--------|-------------|----------|
| Garder Cercle | Conforme ENF-02 tel qu'écrit | |
| Reporter Cercle | Reprendre l'énoncé d'ENF-02 | |

**Réponse libre:** « je ne veux pas que le parent puissent publier en tant que l'enfant dans le cercle, juste de la modération » — décision D-12 (déviation ENF-02 assumée), notée à la suite.

| Option | Description | Selected |
|--------|-------------|----------|
| Supprimer/masquer contenus enfant | Modération du contenu attribué à un enfant (y compris historique des anciens comptes) | ✓ |
| Modération Cercle complète | Tout le Cercle modérable, hors périmètre enfants | |

| Option | Description | Selected |
|--------|-------------|----------|
| Filiation toujours visible | « cochée par Marie pour Jules » | |
| Attributaire seul affiché | Acteur en base pour l'audit seulement | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Enfants uniquement | La délégation s'arrête aux enfants | ✓ |
| Délégation étendue | Adulte → adulte, hors périmètre, reporté | |

---

## Enfants avec compte existant

| Option | Description | Selected |
|--------|-------------|----------|
| Conversion totale | Une migration, la condition de RGDP-06 | ✓ |
| Coexistence | Deux formes d'identité enfant à supporter partout | |

**Réponse libre:** « suppression du compte, par contre comment l'enfant se connecte t'il a l'application ? » — l'agent a répondu : l'enfant ne se connecte plus, c'est le renversement voulu ; l'accès futur = zone transition. Utilisateur a confirmé via la question suivante (« Confirmer »).

| Option | Description | Selected |
|--------|-------------|----------|
| Suppression du compte auth | Réelle, preuve forte du critère n°4 | ✓ (réponse libre) |
| Compte dissocié conservé | Comptes zombie, preuve plus faible | |

| Option | Description | Selected |
|--------|-------------|----------|
| Confirmer | L'enfant ne se connecte jamais, tout passe par un adulte | ✓ |
| Accès enfant en v1 | Réouvrirait une surface de session | |

| Option | Description | Selected |
|--------|-------------|----------|
| Sens unique | Migration définitive, correction vers l'avant | ✓ |
| Retour prévu | Chemin profil → compte dans la même phase | |

---

## Transition vers un vrai compte

| Option | Description | Selected |
|--------|-------------|----------|
| Liaison à l'invitation | Invitation standard crée le compte ; adulte lie et fusionne | ✓ |
| Pas de transition v1 | Nouvelle fiche vierge, historique perdu | |

| Option | Description | Selected |
|--------|-------------|----------|
| Tout réattribuer | Toutes les traces suivent l'identité, sans fenêtre temporelle | ✓ |
| Fenêtre limitée | Deux identités pour une même personne dans les compteurs | |

| Option | Description | Selected |
|--------|-------------|----------|
| Fusion définitive | Opération serveur unique irréversible, même transaction | ✓ |
| Lien réversible | État hybride à supporter en RLS et sélecteurs | |

| Option | Description | Selected |
|--------|-------------|----------|
| Parcours minimal | Bouton « Donner accès » sur la fiche enfant | ✓ |
| Assistant dédié | Nouvel écran complet à concevoir | |

---

## Profil enfant & multi-foyers

| Option | Description | Selected |
|--------|-------------|----------|
| Par foyer | Ligne household_members, deux profils pour deux foyers, purge RGDP-06 par foyer | ✓ |
| Enfant global | Entité partageable, nouvelle racine, interagit avec la phase 26 | |

---

## Notifications enfant

| Option | Description | Selected |
|--------|-------------|----------|
| Aux adultes | Échéances enfant notifiées aux adultes du foyer, chaîne push existante | ✓ |
| Aucune | Visibilité UI seulement, rien ne rappelle la routine | |

---

## Argent de poche (idée)

| Option | Description | Selected |
|--------|-------------|----------|
| Reporté au backlog | Hors périmètre ENF, exclusion 0113/0115 inchangée | ✓ |
| Intégrer en v1 | Réouvrirait la surface ardoise, gonflerait l'audit RLS | |

---

## the agent's Discretion

Aucun « tu décides » explicite ; mais après sept zones couvertes, l'utilisateur a accepté de laisser au chercheur/planificateur : le schéma exact (nullable `user_id` vs table dédiée, stockage des restrictions par module), la forme des opérations serveur « au nom de », les détails de modération, l'ordre des migrations et l'annonce produit de la conversion.

## Deferred Ideas

- Argent de poche (Ardoise enfant) — backlog roadmap
- Délégation adulte → adulte — capacité transverse hors périmètre ENF
