# Phase 27: Suppression de compte RGPD - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-27
**Phase:** 27-Suppression de compte RGPD
**Areas discussed:** Anonymisation de la surface publique, Réversibilité 30 j, Règles produit (médias, profils enfants, foyers orphelins, consolidation)

---

## Anonymisation de la surface publique

| Option | Description | Selected |
|--------|-------------|----------|
| Conserver + déshumaniser | `created_by` NULL, pseudonyme générique, historique intact (motif D-04 phase 25) | ✓ |
| Purger le personnel, anonymiser le fonctionnel | Posts/messages supprimés, traces fonctionnelles anonymisées | |
| Purger tout le contenu personnel | Tout ce qui porte l'identité disparaît | |

| Option | Description | Selected |
|--------|-------------|----------|
| Pseudonyme générique unique | « Ancien membre », sans avatar, homogène | ✓ |
| Générique + période | « Ancien membre (nov. 2026) » | |
| Renommable par le foyer | Champ éditable en base | |

| Option | Description | Selected |
|--------|-------------|----------|
| Membre transformé en « ancien membre » | Ligne `household_members` conservée en statut supprimé | ✓ |
| Ligne membre supprimée | Traces réattribuées à NULL | |

**Notes:** Aucune note additionnelle — les recommandations ont été suivies.

---

## Réversibilité 30 jours

| Option | Description | Selected |
|--------|-------------|----------|
| Instantané en base de restauration | État pré-anonymisation en tables purgeables J+30 | ✓ |
| Anonymisation différée à J+30 | Rejetée : contraire à RGDP-01 (anonymisation immédiate) | |

| Option | Description | Selected |
|--------|-------------|----------|
| Reconnexion normale après confirmation | Le lien email ne crée jamais de session | ✓ |
| Session restaurée via le lien email | Rejetée : surface d'attaque supplémentaire | |

| Option | Description | Selected |
|--------|-------------|----------|
| Une demande active, horloge rejouable | Nouvelle demande = remplacement + horloge rejouée | ✓ |
| Une seule fenêtre, non rejouable | Refus jusqu'à purge ou annulation | |

**Notes:** Aucune note additionnelle.

---

## Règles produit

| Option | Description | Selected |
|--------|-------------|----------|
| Les médias du foyer restent | Chemins `<household_id>/…` = propriété du foyer ; seuls avatars/restrictions perso supprimés | ✓ |
| Supprimer les médias perso, garder les partagés | Audit référence par référence obligatoire | |

| Option | Description | Selected |
|--------|-------------|----------|
| Purges si seul adulte, sinon transférés | RGDP-06 appliqué au seul adulte du foyer | ✓ |
| Toujours purgés | Même si d'autres adultes restent | |
| Toujours transférés | Jamais purgés | |

| Option | Description | Selected |
|--------|-------------|----------|
| Foyer supprimé si aucun adulte | Réutilise la sémantique `household-delete` (0074) | ✓ |
| Foyer gelé | Rejeté : résidus indéfinis | |

| Option | Description | Selected |
|--------|-------------|----------|
| Un socle commun, deux entrées UI | Edge `household-delete` conservée, code mutualisé | |
| Une seule Edge, tout fusionné | `household-delete` remplacée par une Edge unifiée | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Une Edge, deux modes déclarés | Modes « foyer » et « compte », panneau admin bascule dessus | ✓ |
| Une Edge, deux fonctions SQL | Deux fonctions distinctes sous une seule Edge | |

**Notes:** L'utilisateur a choisi l'option la plus consolidante (tout fusionné) — l'Edge existante disparaît au profit d'une Edge unique à deux modes déclarés.

---

## the agent's Discretion

- **Tension SMTP non discutée** (zone proposée non sélectionnée) : comment satisfaire RGDP-02/03 (emails) avant le MTA livrable de la phase 28 — entrée principale du chercheur.
- Schéma des tables de demande/restauration, audit FK détaillé, manifest de médias, libellés UI/emails.

## Deferred Ideas

Aucune — la discussion est restée dans le cadre de la phase.
