# Phase 13: Hygiène données — Context

**Gathered:** 2026-10-12 (read-only audits, no code touched)
**Status:** Ready for planning

<domain>
## Phase Boundary

Assainir fidélité/prestataires/adresses :preuves d'isolation,
fichiers qui pourrissent (URLs signées mortes, orphelins, data-URLs
en base), bogue visité, copies mensongères post-offline — sans
changer le modèle de visibilité (foyer entier, enfants inclus :
décision produit en attente, pas un gap).

</domain>

<decisions>
## Implementation Decisions

### Serveur (constats audit, HIGH)
- **D-01:** Preuves SQL d'isolation (inter-foyer, enfant, escalade)
  pour providers, provider_types, loyalty_cards, places — même
  forme que 0048, nouveau fichier ou extension documentée.
- **D-02:** Garde foyer sur `providers.provider_type_id` (trigger,
  même motif que validate_member_refs) : jamais de type d'un autre
  foyer — + preuves.

### Fichiers (constats audit, MEDIUM)
- **D-03:** Prestataires : stocker le path, forger l'URL signée à la
  lecture (motif photo invitée 06-04), supprimer le fichier au
  retrait de la pièce/fiche (removeHouseholdFile comme courses).
- **D-04:** Adresses : téléverser les photos au bucket (motif
  storage.ts commun), signer à la lecture ; data-URLs existantes
  conservées en rendu + documentées (pas de ré-upload forcé).
- **D-05:** Fidélité : rien côté fichiers (codes en clair en base).

### Client (constats audit, LOW)
- **D-06:** Adresses : édition ne touche plus à `visited` + test ;
  « Vue carte » renommée en intitulé honnête (regroupement par
  ville, pas de carte géo).
- **D-07:** Copies post-offline balayées partout (landing ×3,
  sign-in, CGU art.7, route-error, fidélité « Synchronisation
  Auto ») : en-ligne-d'abord honnête, jamais de promesse de file.
- **D-08:** Métrique « Partagés » prestataires reformulée (email ≠
  partage) ; `markUsed` created_at et réassignation memberId
  inchangés (design acté, documenté).

### Explicitement en attente produit (pas des gaps)
- Visibilité enfants sur codes fidélité et pièces prestataires :
  signalé, non tranché — question posée à l'utilisateur, plan
  séparé si resserrement demandé.

### the agent's Discretion
Libellés honnêtes exacts, intitulé du regroupement villes.
</decisions>
