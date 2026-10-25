# Phase 12: Voyages + Animaux — Context

**Gathered:** 2026-10-12 (read-only audits, no code touched)
**Status:** Ready for planning

<domain>
## Phase Boundary

Remettre d'aplomb deux modules construction inachevée : temps réel
mort, suppressions promises mais refusées, champs morts et modèles
trompeurs — côté serveur (publication + preuves) puis côté client.
Pas de nouveau modèle métier (pas de checklist/participants par
voyage, pas de fiche privée), pas de vidéo, pas de carte géo —
hors phase.

</domain>

<decisions>
## Implementation Decisions

### Serveur (constats audit, HIGH)
- **D-01:** `trips`, `pets`, `pet_records` (et `recipes` en passant,
  sans client) entrent dans la publication Realtime — les
  abonnements existants (voyages) et futurs cessent d'être sourds.
- **D-02:** Preuves SQL d'isolation (inter-foyer, enfant, escalade)
  pour trips/pets/pet_records — même forme que 0002, nouveau fichier
  ou extension documentée.
- **D-03:** Suppression = admin-only partout ici (pas de colonne
  auteur/owner sur ces tables) : l'UI masque au lieu de promettre.

### Voyages (constats audit)
- **D-04:** Sélecteur « Statut » mort retiré (jamais persisté, casse
  même la validation) ; dates requises partout comme la base
  (fin du chemin « dates à définir »).
- **D-05:** Cartes honnêtes : « tâches du foyer » / « membres du
  foyer » nommés comme tels (pas de périmètre voyage inexistant) ;
  échec tasksQuery visible au lieu d'invisible.
- **D-06:** `cover_photo` : garde http(s) côté client (même motif que
  T-06-10 invités) — pas d'URL arbitraire rendue en hero.

### Animaux (constats audit)
- **D-07:** Abonnement temps réel client (publication D-01) +
  conservé `invalidateTables` après mutations propres.
- **D-08:** Édition d'un suivi branchée (le dialogue sait déjà faire,
  `updatePetRecord` existe) + tests.
- **D-09:** Suppressions masquées aux non-admins (3 endroits :
  fiche, suivi, pièces jointes).
- **D-10:** Ligne magique « Informations de la fiche » remplacée par
  de vraies colonnes (`notes`, rappel) avec backfill, puis lecture
  exclusive sur colonnes (comptes/timeline assainis) ; colonne morte
  `attachment_url` supprimée dans la même migration ; seed
  `pet_attachments` complété.
- **D-11 :** couverture voyage téléversable au bucket (comme contacts
  et carnets) : dépôt via le helper partagé, chemin stocké, URL
  signée à la lecture ; champ URL gardé avec garde http(s).

### Explicitement différé (pas des gaps)
- Checklist/invités par voyage, fiche privée animaux, vidéo,
  carte géo adresses, pluriels/cosmétiques, `markUsed` created_at.

### the agent's Discretion
Libellés honnêtes des cartes, noms des nouvelles colonnes
(convention du schéma), détail des copies de modales.
</decisions>
