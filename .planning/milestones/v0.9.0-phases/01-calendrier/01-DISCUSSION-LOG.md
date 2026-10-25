# Phase 01: calendrier - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-06
**Phase:** 01-calendrier
**Areas discussed:** Commun vs Perso, Catégories, Filtres et vues, Refresh fériés/vacances

---

## Commun vs Perso

| Option | Description | Selected |
|--------|-------------|----------|
| Invisible total | Ni lecture ni écriture, même pour l'admin | ✓ |
| Lecture admin | Admin voit les persos en lecture seule pour modérer | |
| Perso = simple filtre | Pas de vrai secret entre membres | |

**User's choice:** Invisible total
**Notes:** Aligned with the 2-account isolation manual test already planned.

| Option | Description | Selected |
|--------|-------------|----------|
| Un Perso chacun | Un Perso par membre + Commun partagé | ✓ |
| Calendriers libres | Autant de calendriers que voulu | |
| Création admin | Seul l'admin crée des calendriers | |

**User's choice:** Un Perso chacun

| Option | Description | Selected |
|--------|-------------|----------|
| Couleur membre | Commun suit la couleur de l'auteur | ✓ |
| Couleur libre | Palette du foyer par événement | |
| Couleur calendrier | Une couleur fixe par calendrier | |

**User's choice:** Couleur membre (later scoped by Catégories decision: category wins on the event itself, member color stays on avatars and member-filtered views)

| Option | Description | Selected |
|--------|-------------|----------|
| Choix explicite | Calendrier choisi à la création, pas de rattachement silencieux | ✓ |
| Commun par défaut | Nouvel événement dans le Commun sauf bascule | |
| Selon la vue | Dialogue ouvert sur le calendrier de la vue courante | |

**User's choice:** Choix explicite

| Option | Description | Selected |
|--------|-------------|----------|
| Auteur libre | Déplacement libre, confirmation Perso→Commun | ✓ |
| Immuable | Jamais de changement après création | |
| Admin seul | Seul l'admin déplace | |

**User's choice:** Auteur libre (extra round after "More questions")

| Option | Description | Selected |
|--------|-------------|----------|
| Perso aussi | Un Perso invisible par enfant | |
| Commun uniquement | Événements enfants dans le Commun | ✓ |

**User's choice:** Commun uniquement (extra round after "More questions")

---

## Catégories

| Option | Description | Selected |
|--------|-------------|----------|
| Adultes créent | Seed + customs par adultes, enfants taguent | ✓ |
| Admin seul | Seul l'admin gère la liste | |
| Tout le monde | Chacun étend la liste | |

**User's choice:** Adultes créent

| Option | Description | Selected |
|--------|-------------|----------|
| Double pastille | Pastille membre + pastille catégorie | |
| Catégorie seule | Catégorie colore, membre au détail | ✓ |
| Pastille unique | Membre sur Commun, catégorie sur vues filtrées | |

**User's choice:** Catégorie seule

| Option | Description | Selected |
|--------|-------------|----------|
| Catégorie gagne | Catégorie colore toujours ; membre sur avatars/vues filtrées | ✓ |
| Membre gagne | Membre colore ; catégorie en badge texte | |

**User's choice:** Catégorie gagne (coherence check after conflicting answers)

| Option | Description | Selected |
|--------|-------------|----------|
| Seed protégé | Seed verrouillé, customs modifiables | |
| Tout modifiable | Tout modifiable par un adulte | |
| Protégé si utilisé | Interdit si des événements l'utilisent | ✓ |

**User's choice:** Protégé si utilisé

---

## Filtres et vues

| Option | Description | Selected |
|--------|-------------|----------|
| Tout cumulable | Calendriers + catégories + membres + couches | ✓ |
| Un axe à la fois | Un seul axe pour rester lisible | |
| Sans axe membre | Membres visibles par leurs couleurs | |

**User's choice:** Tout cumulable

| Option | Description | Selected |
|--------|-------------|----------|
| Toujours visibles | Fond non cliquable, jamais masquables | ✓ |
| Masquables | Chacun allège sa vue | |
| Détail lecture seule | Cliquables pour le détail, jamais modifiables | |

**User's choice:** Toujours visibles

| Option | Description | Selected |
|--------|-------------|----------|
| Tap-and-hold | Appui long ouvre le dialogue pré-rempli | ✓ |
| Bouton + seul | Grille en lecture pure | |
| Tap simple | Tap sur jour vide crée directement | |

**User's choice:** Tap-and-hold

| Option | Description | Selected |
|--------|-------------|----------|
| Mois défaut | Mois + pastilles, Jour au clic | ✓ |
| Dernière vue | Vue mémorisée par appareil | |
| Liste d'abord | Agenda 7 jours en premier | |

**User's choice:** Mois défaut

---

## Refresh fériés/vacances

| Option | Description | Selected |
|--------|-------------|----------|
| APIs officielles | data.gouv + Éducation nationale en cache base | ✓ |
| Saisie manuelle | Aucune dépendance externe | |
| Autre source |Source alternative proposée par l'utilisateur | |

**User's choice:** APIs officielles

| Option | Description | Selected |
|--------|-------------|----------|
| Janv + sept | Cron année en cours + rentrée, Europe/Paris | ✓ |
| Annuel seul | Une fois par an | |
| Manuel | Refresh à la demande en paramètres | |

**User's choice:** Janv + sept

| Option | Description | Selected |
|--------|-------------|----------|
| Cache conservé | Ancien cache affiché, retry au prochain passage | ✓ |
| Bandeau + cache | Bandeau données périmées | |
| Masquer en erreur | Couche masquée tant que le refresh échoue | |

**User's choice:** Cache conservé

| Option | Description | Selected |
|--------|-------------|----------|
| A/B/C/Corse | Sélecteur à 4 zones en paramètres | |
| A/B/C seul | Comme la spec | |
| Auto + override | Détection auto, modifiable | ✓ |

**User's choice:** Auto + override

---

## the agent's Discretion

Forme exacte de la FilterBar, libellés des confirmations, détail du rendu pastille catégorie.

## Deferred Ideas

None — discussion stayed within phase scope.
