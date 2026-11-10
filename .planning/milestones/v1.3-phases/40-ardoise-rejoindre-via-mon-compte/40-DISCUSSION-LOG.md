# Discussion log — Phase 40

Date : 2026-11-09 · Mode : default · Zones : 4/4 discutées

## Zone 1 — Pont code partage → adhésion foyer
Options : échange serveur code→token / attach direct côté serveur / token dans le lien dès la création
**Choix** : échange serveur code→token (recommandé).
Notes : nouvelle action Edge sur `ardoise-invite` ; token foyer à usage unique émis serveur après validation du code ; l'UI réutilise `/foyer/rejoindre?token=…` tel quel ; espaces de clés intacts (ARD-03).

## Zone 2 — Confirmation pré-adhésion
Options : pré-écran D-20 existant / dialog maison sur la page invitée
**Choix** : dialog maison sur la page invitée (contre la recommandation).
Notes : confirmation AVANT l'échange code→token ; jamais d'adhésion implicite au clic. Suivi — source du nom du foyer : **depuis la vue invitée** (`link-view` enrichie, l'ardoise porte déjà `household_id`) contre l'aperçu dédié de l'action d'échange.

## Zone 3 — Réconciliation `invite:` → `membre:` (ARD-02)
Options : transactionnelle à l'adhésion / refus justifié (deux vies séparées)
**Choix** : transactionnelle à l'adhésion (recommandé).
Notes : dans la même transaction que l'adhésion ; `expense_participants` guest_id → membre ; tests SQL prouvant la migration, le part zéro du passé, les cas négatifs ARD-03.

## Zone 4 — Atterrissage post-adhésion
Options : `/ardoise` du foyer / dashboard (flux standard)
**Choix** : `/ardoise` du foyer (recommandé).
Notes : conforme au success criterion 1 d'ARD-01.

## Discrétion agent (à trancher en research/plan)
- Signature exacte et nom de la nouvelle action Edge (proposition : `household-token`).
- Détail de l'enrichissement de `link-view` (nom du foyer + slug household pour le dialog).
- Point d'entrée SQL de la réconciliation (RPC transactionnelle vs logique dans la transaction d'échange).

## Idées différées
- (aucune)
