# Phase 5: Cadeaux/Contacts - Context

**Gathered:** 2026-10-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Idées cadeaux du foyer (gift_ideas), listes à surprise avec codes
d'invitation (gift_list_invites + Edge gift-list-invite), contacts avec dates
de naissance synchronisées vers anniversaires (contacts/contact_lists +
miroir birthdays). Tabs Listes/Idées/Contacts. Pas de messagerie autour des
cadeaux, pas d'import de contacts externes, pas de comparateur de prix —
hors phase.

</domain>

<decisions>
## Implementation Decisions

### Contacts initiaux
- **D-01:** Double liste par défaut : une liste « Famille » partagée au foyer
  + une liste perso par membre.
- **D-02:** Pré-remplissage : membres adultes (admin/membre) liés
  automatiquement (linked_member) ; enfants exclus, ajout manuel.
- **D-03:** Cohabitation birthdays/contacts : les anniversaires existants ne
  sont PAS importés ; le trigger de synchro ne couvre que les nouveaux
  contacts datés. — **Reversibility:** costly — un import ultérieur impose un
  backfill avec déduplication nom+date sur des données saisies entre-temps.
- **D-04:** Anti-doublons : avertissement UI sur doublon probable
  (nom + date), aucune contrainte dure (les homonymes réels restent possibles).

### Idées → Listes
- **D-05:** Promotion explicite : bouton « ajouter à une liste » sur l'idée
  → crée un gift_item lié ; sinon onglets indépendants.
- **D-06:** Statut « offert » : propagation à l'item lié (marqué acheté/offert).
- **D-07:** « Pour qui » : texte libre (giftee_text) + contact lié optionnel
  (giftee_contact_id) ; nextOccasion possible si le contact est daté.
- **D-08:** Idées masquées au destinataire (même règle surprise que les
  listes) : une idée « pour Maya » est invisible de Maya.

### Contacts ↔ Anniversaires
- **D-09:** Le module Anniversaires agrège birthdays + contacts datés (une
  seule vue des prochaines dates).
- **D-10:** Création d'un anniversaire : case « créer aussi un contact »
  cochée par défaut, décochable.
- **D-11:** Helper nextDate partagé Europe/Paris pour idées (nextOccasion) et
  anniversaires (compte à rebours).
- **D-12:** Fusion d'affichage sur nom normalisé + jour/mois (badge deux
  sources) ; rappels 06h40 dédupliqués pareil (une alerte par personne).
- **D-13:** Photo contact prioritaire en vue agrégée, repli photo birthday.
- **D-14:** Suppression : cascade vers le miroir avec confirmation modale
  (jamais silencieuse, comme les suppressions existantes).

### Codes d'invitation
- **D-15:** Défauts : 90 jours / 20 usages (liste quasi-permanente type Noël ;
  bornes spec ≤90j, 1-100).
- **D-16:** Rachat : membres cochés par l'owner + externes via lien (email,
  sans compte).
- **D-17:** Droits rachat : lecture + réservation (pas de réserve aveugle).
- **D-18:** UX partage identique à l'ardoise : Copier / Partager / Régénérer /
  Arrêter.

### the agent's Discretion
Forme exacte des onglets, libellés des avertissements doublons, détail du
badge double-source.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase et produit
- `.planning/PHASES/05-cadeaux-contacts.md` — spec de phase (migrations 0047-0051, Edge, UI, tests)
- `/home/jmaillot/.opencode/plan/05-cadeaux-contacts.md` — plan source détaillé (hors dépôt, ne pas modifier)
- `.planning/ROADMAP.md` — Phase 4 : gift_ideas + invites code + contacts
- `AGENTS.md` §2.6 — RLS (fonction utilitaire, politiques par table, pas d'auto-admin), §2.7 — chaîne de vérification, §5 — gift_lists/gift_items existants

### Code à réutiliser
- `app/src/modules/cadeaux/` — page, use-cadeaux, gift-form-dialog, gift-share-dialog (listes owner + partage à étendre)
- `app/src/modules/anniversaires/` — page liste/calendrier, use-anniversaires, birthday-form-dialog (agrégation D-09, helper date D-11)
- `app/src/modules/ardoise/api.ts` — pattern invite code (Copier/Partager/Régénérer/Arrêter, D-18) + Edge HMAC à mirroring côté `gift-list-invite`
- `supabase/functions/ardoise-invite/` — Edge invite de référence (HMAC Vault, rate-limit, messages oracle)
- `supabase/migrations/0006_security_helpers.sql`, `0007_rls_policies.sql`, `0075_gift_read_household_scope.sql` — helpers surprise existants (can_read/write/manage_gift_list)
- `app/src/lib/storage.ts` — dépôt fichiers (photos contacts privées compressées, cf. D-05 phase 3)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Module cadeaux existant : étendre (onglets Listes/Idées/Contacts, promotion D-05, codes D-15…D-18)
- Module anniversaires existant : agréger contacts datés (D-09), fusion nom+date (D-12), helper partagé (D-11)
- Pattern invite ardoise (Edge + UI partage) : à mirroring pour gift-list-invite

### Established Patterns
- RLS foyer + tests négatifs inter-foyer sur chaque table, surprise masquée au owner (gift_items_for_list via vue/RPC, la RLS ne filtre pas les colonnes)
- gift_list_invites SANS politique RLS : service_role + RPC uniquement
- Photos en bucket Storage privé compressées, jamais d'hotlink persistant
- Europe/Paris pour les dates, cron rappels 06h40 inchangé
- Secrets HMAC en Vault, jamais en base ni en clair

### Integration Points
- `gift_ideas.giftee_contact_id` → contacts ; `birthdays.contact_id` (unique partiel) → contacts
- Trigger synchro contacts→birthdays (nouveaux datés uniquement, D-03)
- Trigger ensure_default_contact_list + household_id dénormalisé sur contacts
- `gift_list_invites` : GIFT_LIST_INVITE_HMAC_SECRET dédié en Vault

</code>

<specifics>
## Specific Ideas

- Exemple cité : grands-parents hors foyer réservant via lien (D-16)
- Exemple cité : liste quasi-permanente « Noël en famille » (D-15)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 5-Cadeaux/Contacts*
*Context gathered: 2026-10-05*
