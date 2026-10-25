# Phase 14: Périmètre enfants — Context

**Gathered:** 2026-10-12 (décision produit UAT, audits en main)
**Status:** Ready for planning

<domain>
## Phase Boundary

Sortir 5 modules du périmètre enfant (ardoise, cadeaux, fidélité,
prestataires, animaux) : ni lecture ni écriture côté serveur pour le
rôle `enfant`, aucune entrée de navigation ni route accessible côté
client. Tout le reste (messages, contacts, calendrier, courses,
tâches, notes, routines, anniversaires, cercle, dashboard) inchangé.

</domain>

<decisions>
## Implementation Decisions

### Serveur (décision produit UAT 2026-10-12)
- **D-01:** Lectures RLS des tables des 5 modules : `is_household_member`
  → `can_write_household` (admin/membre, enfant exclu — helper
  existant sur `household_role`, aucune fonction neuve requise sauf
  preuve du contraire). Tables : ardoises (+members/guests),
  expenses (+participants), gift_lists/items/shares/ideas/invites,
  loyalty_cards, provider_types/providers (+attachments),
  pets/records (+attachments).
- **D-02:** Écritures déjà refusées (can_write) — vérifier, pas
  supposer ; resserrer seulement ce qui fuit encore.
- **D-03:** Edge `gift-list-invite` + `ardoise-invite` : actions
  `user` refusées au rôle enfant (résolu serveur via la ligne
  membre, jamais un claim client) — les parcours code-anonyme
  restent ouverts à tous par construction (pas d'identité).
- **D-04:** Données enfant préexistantes dans ces modules : masquées,
  jamais effacées (documenté ; pas de backfill destructeur).

### Client (précédent D-06 phase 01 : gating enfant)
- **D-05:** Tuiles catalogue + tiroir + dashboard : entrées des
  5 modules masquées au rôle enfant (même motif que le gating
  existant).
- **D-06:** Garde de route : accès direct URL → page « non autorisé »
  sobre (pas de 404 mensongère, pas de redirection silencieuse).
- **D-07:** Widgets/agrégations inter-modules (idées cadeaux,
  anniversaires miroirs, notifications) : aucune donnée des 5
  modules ne doit fuir via un autre module — audité, pas supposé.

### Explicitement hors phase (pas des gaps)
- Resserrement autre rôle, autres modules, suppression des données
  enfant existantes, notifications push par rôle.

### the agent's Discretion
Libellé de la page non-autorisé, détail des copies.
</decisions>
