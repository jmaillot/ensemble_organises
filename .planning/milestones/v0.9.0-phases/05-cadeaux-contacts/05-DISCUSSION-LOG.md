# Phase 5: Cadeaux/Contacts - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-05
**Phase:** 05-cadeaux-contacts
**Areas discussed:** Contenu initial contacts, Idées → Listes, Contacts ↔ Anniversaires, Codes d'invitation

---

## Contenu initial contacts

| Option | Description | Selected |
|--------|-------------|----------|
| Liste foyer partagée | Une seule liste défaut par foyer | |
| Liste perso par membre | Chacun sa liste défaut privée | |
| Les deux | Liste foyer partagée + liste perso par membre | ✓ |

**User's choice:** Les deux
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Tous, enfants inclus | Chaque membre devient contact lié | |
| Adultes seulement | Admins/membres liés, enfants exclus | ✓ |
| Liste vide | Aucun pré-remplissage | |

**User's choice:** Adultes seulement
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Import auto au backfill | Chaque birthday devient contact | |
| Import manuel | Bouton importer au cas par cas | |
| Cohabitation | Birthdays et contacts séparés, trigger sur nouveaux uniquement | ✓ |

**User's choice:** Cohabitation
**Notes:** Risque de double saisie durable assumé ; déduplication d'affichage traitée en zone Contacts ↔ Anniversaires (fusion nom+date).

| Option | Description | Selected |
|--------|-------------|----------|
| Avertissement UI | Bandeau doublon probable, l'utilisateur tranche | ✓ |
| Blocage strict | Index unique nom + date | |
| Rien | Nettoyage manuel | |

**User's choice:** Avertissement UI
**Notes:** —

---

## Idées → Listes

| Option | Description | Selected |
|--------|-------------|----------|
| Promotion explicite | Bouton 'ajouter à une liste' crée un gift_item lié | ✓ |
| Rattachement dès création | Chaque idée naît liée à une liste | |
| Aucun lien | Recopie manuelle | |

**User's choice:** Promotion explicite
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Propagation | L'item lié marqué acheté/offert aussi | ✓ |
| Archive simple | L'idée disparaît de 'à offrir', liste intacte | |
| Rien | Statut purement informatif | |

**User's choice:** Propagation
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Les deux, contact optionnel | Texte toujours + lien contact si existe | ✓ |
| Contact obligatoire | Pas d'idée sans fiche contact | |
| Texte seul | Ni nextOccasion ni synchro | |

**User's choice:** Les deux, contact optionnel
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Masquées au destinataire | Même règle surprise que les listes | ✓ |
| Visibles à tous | Pense-bêtes partagés | |
| Configurable par idée | Case par idée | |

**User's choice:** Masquées au destinataire
**Notes:** —

---

## Contacts ↔ Anniversaires

| Option | Description | Selected |
|--------|-------------|----------|
| Anniversaires agrège | Birthdays + contacts datés en une vue | ✓ |
| Anniversaires inchangé | Birthdays seuls, dates contacts côté Contacts | |
| Contacts portent tout | Anniversaires en lecture seule du miroir | |

**User's choice:** Anniversaires agrège
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Case à cocher | 'Créer aussi un contact', cochée par défaut | ✓ |
| Oui, toujours | Tout anniversaire devient contact | |
| Non, jamais | Birthday pur | |

**User's choice:** Case à cocher
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Helper partagé | Un seul calcul nextDate Europe/Paris | ✓ |
| Calculs séparés | Doublon assumé | |
| Côté idées seulement | Deux vérités possibles | |

**User's choice:** Helper partagé
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Fusion nom+date | Une ligne badgée deux sources | ✓ |
| Deux lignes | Une par source | |
| Badge source, sans fusion | Lignes séparées badgées | |

**User's choice:** Fusion nom+date
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Photo contact prioritaire | Repli photo birthday | ✓ |
| Chacun la sienne | Cas mixtes non tranchés | |
| Photo unique partagée | Écritures couplées | |

**User's choice:** Photo contact prioritaire
**Notes:** Question d'approfondissement demandée par l'utilisateur (« encore des questions »).

| Option | Description | Selected |
|--------|-------------|----------|
| Cascade avec confirmation | Modale comme suppressions existantes | ✓ |
| Cascade silencieuse | Destructeur en un tap | |
| Jamais | Orphelins nettoyés à la main | |

**User's choice:** Cascade avec confirmation
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Une seule | Dédupliquée nom+date | ✓ |
| Une par source | Redondant pendant la cohabitation | |
| Uniquement birthdays | Trous de couverture | |

**User's choice:** Une seule
**Notes:** —

---

## Codes d'invitation

| Option | Description | Selected |
|--------|-------------|----------|
| 30 jours / 5 usages | Équilibré anniversaire proche | |
| 7 jours / 1 usage | Code ponctuel strict | |
| 90 jours / 20 usages | Liste quasi-permanente type Noël | ✓ |

**User's choice:** 90 jours / 20 usages
**Notes:** Exemple cité : « Noël en famille ».

| Option | Description | Selected |
|--------|-------------|----------|
| Membres + externes email | Externe réserve via email sans compte | |
| Membres connectés seuls | Pas de réservation anonyme | |
| Au choix par code | L'owner décide à la création | |

**User's choice:** Free-text — « membres cochés + externe via lien »
**Notes:** L'owner coche les membres concernés + un lien pour les externes. Interprété et confirmé ensuite (lecture + réservation).

| Option | Description | Selected |
|--------|-------------|----------|
| Lecture + réservation | Comme listes partagées actuelles | ✓ |
| Réservation aveugle | Surprise max, UX frustrante | |
| Lecture seule d'abord | Deux temps | |

**User's choice:** Lecture + réservation
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Identique à l'ardoise | Copier / Partager / Régénérer / Arrêter | ✓ |
| Simplifiée | Copier + Arrêter | |

**User's choice:** Identique à l'ardoise
**Notes:** —

---

## the agent's Discretion

Forme exacte des onglets, libellés des avertissements doublons, détail du badge double-source.

## Deferred Ideas

None — discussion stayed within phase scope.
