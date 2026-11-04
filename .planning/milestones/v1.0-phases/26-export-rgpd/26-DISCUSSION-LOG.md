# Phase 26: Export RGPD - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-26
**Phase:** 26-export-rgpd
**Areas discussed:** Notification d'achèvement, Accès UI & cadence

---

## Sélection des zones (présentation initiale)

Zones proposées : Portée multi-foyers, Périmètre de la donnée, Notification d'achèvement, Accès UI & cadence.

Sélectionnées : **Notification d'achèvement**, **Accès UI & cadence**.
Non sélectionnées : Portée multi-foyers et Périmètre de la donnée — restent à la SPEC produit exigée par le ROADMAP (tranchées avant toute requête SQL), notées dans CONTEXT.md `<domain>` et dans la discrétion de l'agent.

---

## Notification d'achèvement

| Option | Description | Selected |
|--------|-------------|----------|
| Push + in-app (Recommandé) | Push via dispatch_messages → push-notify + visible dans l'app ; réutilise le mécanisme D-23 de la phase 25 | ✓ |
| In-app seulement | Statut visible dans l'app mais aucune push ; le membre doit revenir vérifier | |
| Push + in-app + email | Triple canal via le SMTP configuré ; plus de surface à tester | |

**User's choice:** Push + in-app
**Notes:** —

### Échec du job

| Option | Description | Selected |
|--------|-------------|----------|
| Notifié, retentable (Recommandé) | Échec notifié comme le succès : push + statut d'erreur, retentable depuis l'écran | ✓ |
| Statut seulement | Échec silencieux côté notification, visible dans le statut si le membre retourne sur l'écran | |

**User's choice:** Notifié, retentable
**Notes:** —

### Progression pendant le job

| Option | Description | Selected |
|--------|-------------|----------|
| 3 états + durée (Recommandé) | En attente → en cours → prêt, avec durée écoulée ; pas de pourcentage factice | ✓ |
| Spinner indéterminé | Attente indéterminée jusqu'à la notification de fin | |

**User's choice:** 3 états + durée
**Notes:** —

### Emplacement du lien de téléchargement

| Option | Description | Selected |
|--------|-------------|----------|
| Lien direct partout | Lien signé affiché dans la push et la notification in-app, téléchargement en un tap | |
| Via l'écran export | La push dit « votre archive est prête » ; téléchargement obligatoirement via l'écran export | ✓ |

**User's choice:** Via l'écran export
**Notes:** Un seul endroit où vit le lien signé — surface de fuite minimale.

---

## Accès UI & cadence

| Option | Description | Selected |
|--------|-------------|----------|
| Panneau Paramètres (Recommandé) | Panneau « Mes données (RGPD) » dans Paramètres, à côté de household-delete-panel ; porte l'historique | ✓ |
| Bouton dans le profil | Bouton « Exporter mes données » dans profile-form.tsx, sans écran dédié | |

**User's choice:** Panneau Paramètres
**Notes:** —

### Cadence

| Option | Description | Selected |
|--------|-------------|----------|
| 1 job actif, pas de plafond (Recommandé) | Un seul job actif à la fois par membre ; nouveau déclenchement possible dès la fin (succès ou échec) | ✓ |
| 1 job actif + 1/24 h | Plafond d'une demande par 24 h ; en tension avec « échec retentable » | |

**User's choice:** 1 job actif, pas de plafond
**Notes:** —

### Historique des exports

| Option | Description | Selected |
|--------|-------------|----------|
| Avec historique (Recommandé) | Liste des exports passés (date, statut, lien signé tant qu'il est vivant) | ✓ |
| Sans historique | Seul l'export en cours/prêt est affiché | |

**User's choice:** Avec historique
**Notes:** —

### Qui peut exporter

| Option | Description | Selected |
|--------|-------------|----------|
| Tout membre avec session (Recommandé) | Droit d'accès RGPD = droit personnel ; les profils enfants n'ont pas de session (D-17 phase 25) | ✓ |
| Admins seulement | Incohérent avec RGEX-01 (« un membre ») et le RGPD | |

**User's choice:** Tout membre avec session
**Notes:** —

## the agent's Discretion

- Portée multi-foyers et périmètre de la donnée JSON — tranchés en SPEC produit avant toute requête SQL (exigence ROADMAP), avec D-22 phase 25 comme contrainte d'entrée
- Format du JSON, organisation du ZIP, nom de l'archive
- Schéma de la table de jobs, mécanique de construction du ZIP, politique Storage du bucket `gdpr-exports`
- Messages push et libellés UI

## Deferred Ideas

*Aucune — la discussion est restée dans les limites de la phase.*
