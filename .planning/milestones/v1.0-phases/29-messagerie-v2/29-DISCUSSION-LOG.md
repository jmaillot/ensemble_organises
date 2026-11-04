# Phase 29: Messagerie v2 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-29
**Phase:** 29-Messagerie v2
**Areas discussed:** Watermark de lecture & accusés, Démarrage direct & anti-doublon, Notifications groupées, Realtime self-hosted

---

## Watermark de lecture & accusés

| Option | Description | Selected |
|--------|-------------|----------|
| À l'ouverture du fil | Une écriture par session de lecture, pas par message affiché | ✓ |
| Ouverture + messages affichés | Accusé plus juste, mais une écriture à chaque message reçu en direct | |
| Texte « Vu par » | « Vu par Marie à 14:32 » sous le dernier message | |
| Avatars + horodatage | Avatars colorés des membres ayant lu + horodatage au survol | ✓ |
| Départ vierge | Table serveur vierge, localStorage effacé, faux non-lus acceptés une fois | |
| Porter le localStorage | Migration client des horodatages locaux vers la table serveur | ✓ |

**User's choice:** Ouverture du fil ; avatars + horodatage ; porter le localStorage.
**Notes:** L'accusé avatars + horodatage est préféré au simple « Vu par » pour la cohérence avec les colorTags membres.

---

## Démarrage direct & anti-doublon

| Option | Description | Selected |
|--------|-------------|----------|
| Member-picker | Tap sur un membre (phase 25) démarre ou rouvre la directe | ✓ |
| Bouton dans la liste | « Nouvelle conversation » avec sélecteur, côté messagerie seulement | |
| Rouvrir si active | Rouvre si les deux participations actives ; nouvelle directe si l'un avait quitté | ✓ |
| Toujours rouvrir | Réactivation de la participation quittée — un seul fil par paire pour toujours | |

**User's choice:** Member-picker ; rouvrir si active.
**Notes:** La pierre tombale (0101) reste respectée — un fil quitté n'est pas ressuscité.

---

## Notifications groupées

| Option | Description | Selected |
|--------|-------------|----------|
| Tag OS uniquement | Pas de compteur, notif « message de X » répétée fusionnée par l'OS | |
| Compteur côté dispatch | Une seule notif « N nouveaux messages de X » depuis la dernière envoyée | ✓ |
| Au cycle du dispatch | Ce qui arrive pendant le cycle s'ajoute au compteur suivant | ✓ |
| Première immédiate puis pause | Antidébordement type Android, état par membre+conversation | |

**User's choice:** Compteur côté dispatch ; rythme au cycle du dispatch.
**Notes:** L'antidébordement est refusé comme état serveur supplémentaire — noté en idée différée.

---

## Realtime self-hosted

| Option | Description | Selected |
|--------|-------------|----------|
| Rafraîchir fil + liste | Nouveaux messages et badges sans pull manuel, rien de plus | ✓ |
| Fil + liste + accusés en direct | Souscription aux watermarks aussi — surface plus large | |
| Test avec vraie souscription | Test SQL via le runtime Realtime, événement reçu à l'insertion | ✓ |
| E2E Playwright à deux contexts | Preuve bout en bout plus chère à maintenir | |

**User's choice:** Rafraîchir fil + liste ; test avec vraie souscription.
**Notes:** Pas d'accusés en temps réel — la souscription aux watermarks est notée comme idée différée.

---

## the agent's Discretion

- Forme de la table de watermark (table dédiée vs colonne) et RLS associée
- Détails de la migration client localStorage (seuil, effacement après confirmation)
- Présentation exacte des avatars d'accusé (tokens existants)
- Signature du RPC anti-doublon et verrou anti-course pour démarrages simultanés

## Deferred Ideas

- Accusés de lecture en temps réel via souscription aux watermarks (variante refusée de D-08)
- Antidébordement de notifications type Android (variante refusée de D-07)
- Indicateurs d'écriture (typing indicators) — hors périmètre v2 depuis le roadmap
