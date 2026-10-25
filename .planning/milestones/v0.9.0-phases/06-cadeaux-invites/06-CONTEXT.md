# Phase 06: Cadeaux invites - Context

**Gathered:** 2026-10-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Deux capacités liées autour du partage des listes cadeaux : (1) envoi réel
de l'invitation par email via le SMTP de la stack, gabarit sobre + message
personnel de l'hôte ; (2) invité sans compte : nom auto-déclaré via le lien
(code requis) + réservation d'articles, avec libération possible par
l'organisateur. Pas d'envoi email pour les autres modules, pas de proposition
d'idées par l'invité, pas de compte invité persistant — hors phase.

</domain>

<decisions>
## Implementation Decisions

### Envoi email
- **D-01:** Envoi réel via SMTP stack (SMTP_HOST/PORT/USER/PASS), depuis une
  action Edge serveur (`gift-list-invite`, user-only) — jamais depuis le client.
  Secrets lus côté serveur uniquement, 500 explicite si absents (fail-closed).
- **D-02:** Gabarit sobre : qui invite (nom membre + foyer), nom de la liste,
  lien d'invitation avec code, expiration si bornée. Rien d'autre en contenu
  fixe.
- **D-03:** Champ message personnel (optionnel) saisi par l'hôte dans le
  dialogue de partage au moment de l'envoi ; texte brut, longueur bornée.
- **D-04:** L'envoi conserve le comportement existant de la part email
  (création de la part lecture) : l'email embarque le lien à code, le redeem
  avec compte suit la branche e-mail existante (OQ-1 A inchangée pour ce cas).
  — **Amendement UAT 2026-10-07 (G-06-21) :** la part créée/garantie est
  désormais `reservation` (dialogue et send-email) — plus de lecture seule
  par défaut ; les parts `lecture` stockées restent honorées (surclassées
  au redeem, 0082).

### Invité anonyme (override OQ-1 acté le 2026-10-06)
- **D-05:** Override explicite de OQ-1 OPTION A (compte exigé) pour la
  réservation uniquement : un visiteur porteur d'un lien à code valide peut
  réserver sans compte. Le redeem avec compte reste inchangé.
  — **Reversibility:** costly — schéma (colonne auteur anonyme), RPC
  publishable, Edge et UI invité écrits contre ; revenir en arrière impose
  migration + retrait d'action Edge.
- **D-06:** Garde-fous : code requis (pas d'accès sans lien), nom
  auto-déclaré requis (1-80 caractères, même borne que les dossiers),
  rate-limit côté Edge sur l'action anonyme, oracle unique `code invalide`
  préservé (T-05-04).
- **D-07:** Attribution : la réservation anonyme porte le nom déclaré (jamais
  une FK membre) ; le masquage surprise au propriétaire (0080, T-05-03)
  s'applique pareil (le owner voit « réservé », pas le nom).
- **D-08:** Modération : l'organisateur (owner ou admin) peut libérer une
  réservation (anonyme comme membre) ; toute libération par un non-gestionnaire
  est refusée (preuve négative exigée).
- **D-09:** Pas d'email exigé de l'invité, pas de proposition d'idées, pas de
  compte persistant. Usurpation de nom connue et acceptée comme limite
  (lien privé + modération), à documenter en risques acceptés.

### the agent's Discretion
Forme exacte du gabarit email (HTML minimal vs texte), libellés des boutons
invité, détail du compteur rate-limit.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase et produit
- `.planning/PHASES/06-cadeaux-invites.md` — spec de phase
- `.planning/ROADMAP.md` — Phase 5 : envoi email + invité anonyme
- `.planning/phases/05-cadeaux-contacts/05-CONTEXT.md` — D-15…D-18 (codes), D-16/D-17 (rachat, droits)
- `AGENTS.md` §2.6 — RLS, §2.7 — chaîne de vérification, §8.4 — variables SMTP

### Code à réutiliser
- `supabase/functions/gift-list-invite/index.ts` — Edge user-only, HMAC, oracle unique, rate-limit mémoire (à étendre : actions send-email + redeem-guest)
- `app/src/modules/cadeaux/components/gift-share-dialog.tsx` — dialogue partage + panneau code (champ message + bouton Envoyer à ajouter)
- `app/src/modules/cadeaux/guest-cadeau-page.tsx` — page invitée (parcours nom + réserver à ajouter)
- `app/src/modules/cadeaux/api.ts` — `redeemGiftListInvite`, `giftInviteLink`
- `supabase/migrations/0079_*` (invites RPC), `0080_gift_items_mask.sql` (vue masquée), `0081_author_update_fix.sql` (motif auteur immuable + WITH CHECK assoupli)
- `supabase/migrations/0004_tables_shared.sql:77` — `gift_items.reserved_by` FK membre (à compléter pour l'anonyme)
- `supabase/tests/0026_*` (invites + oracle + vue) — étendre pour l'anonyme et la libération

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Panneau code (Copier/Partager/QR/Régénérer/Arrêter) : l'email embarque le même lien à code
- `guard_author_immutable` (0081) : motif pour figer l'auteur d'une réservation anonyme
- Rate-limit mémoire Edge (ardoise-invite, gift-list-invite) : à réutiliser pour l'action anonyme

### Established Patterns
- RPC `SECURITY DEFINER` service_role seuls, gestion revérifiée en base, oracle unique
- Secrets serveur jamais en base ni en clair ; 500 explicite si secret absent
- Enfant lecture seule ; Europe/Paris ; suppressions confirmées par modale

### Integration Points
- `gift_list_invites` (codes) → lien email + redeem anonyme
- `gift_items.reserved_by` (FK membre) → auteur anonyme à modéliser (colonne texte ou table dédiée — à trancher en recherche/plan)
- Vue `gift_items_for_list` (0080) → noms anonymes masqués au owner comme les membres
- SMTP stack (env serveur) → action send-email

</code>

<specifics>
## Specific Ideas

- Exemple d'usage : grands-parents hors foyer recevant l'email, ouvrant le lien, indiquant « Mamie », réservant un article — sans créer de compte
- L'organisateur garde la main : libérer une réservation douteuse en un clic

</specifics>

<deferred>
## Deferred Ideas

- Proposition d'idées par l'invité anonyme — refusé pour cette phase (réserver uniquement)
- Envoi email pour ardoise/autres modules — hors phase (cadeaux uniquement)
- Compte invité persistant / magic link — hors phase

</deferred>

---

*Phase: 06-Cadeaux invites*
*Context gathered: 2026-10-06*
