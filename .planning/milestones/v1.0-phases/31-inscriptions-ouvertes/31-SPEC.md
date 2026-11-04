# Phase 31: Inscriptions ouvertes — Specification

**Created:** 2026-11-03
**Ambiguity score:** 0.14 (gate: ≤ 0.20)
**Requirements:** 7 locked

## Goal

Le serveur accueille des étrangers en sécurité et avec une voie de sortie : inscriptions publiques avec confirmations email réellement délivrées en boîte de réception, rate-limit durci, invitation pré-auth traversant l'inscription, gouvernance complète du token de foyer, pages légales en ligne — portes dures OUV-07 prouvées (suppression vivante, restauration exécutée, SMTP et push réels).

## Background

**Ce qui existe (scout 2026-11-03) :**
- Signup email branché (`use-auth.ts:291`, mode inscription de `sign-in-page.tsx`), confirmation email **déjà requise** (`ENABLE_EMAIL_AUTOCONFIRM=false`) ;
- **Transport email réel déjà en production** : relais Gmail configuré dans le `.env` de la stack (révision D-13 du 2026-10-29, `docs/DEPLOIEMENT-PROD.md` §transport mail) — la roadmap « Stalwart + SPF/DKIM/DMARC » est **dépassée** et reformulée par cette SPEC (décision tour 1) ;
- Token d'invitation complet : HMAC serveur, redeem transactionnel (`0017`), purge cron, Edge `household-invite` avec rate-limit applicatif ; token **préservé pré-auth** dans la redirection vers sign-in (`router.test.tsx:170-209`) ;
- CGU (`terms-page.tsx`) et politique de confidentialité avec §conservation/suppression (`privacy-page.tsx:179-193`) ;
- Voie de suppression vivante (phase 27), runbook de restauration (`docs/EXPLOITATION.md:99-253`) — mais **exercice réel non exécuté** (OPS-02, absence déclarée 2026-10-29) et **push jamais prouvée** (0 abonnement, `test-dispatch-push.sh` non exécuté).

**Ce qui manque (deltas) :**
- Preuve de réception réelle Gmail **et** Outlook (jamais consignée) ;
- Rate-limit Traefik (0 middleware RateLimit dans les compose) + rate-limit GoTrue applicatif ;
- Pré-écran « Vous avez été invité au foyer X » (inexistant — l'utilisateur tombe sur la connexion générique) ;
- Gouvernance token : `expires_at` **nullable**, pas de défaut 30 j / max 10, UI partielle ;
- Mentions légales dédiées (inexistantes) ;
- Exercice de restauration réel + preuve push.

## Requirements

1. **Preuve de réception email (OUV-01 reformulée)** : les emails de confirmation envoyés par la stack de prod (relais Gmail) sont réellement délivrés **en boîte de réception** (pas en spam) sur Gmail ET Outlook.
   - Current: relais Gmail configuré mais aucune preuve de réception consignée ; FROM = adresse Gmail (à corriger, cf. Prohibitions)
   - Target: preuve datée (captures/relevés) de réception en boîte de réception sur deux comptes réels (Gmail personnel de l'éditeur + un compte Outlook), consignée dans l'UAT
   - Acceptance: deux relevés datés en boîte de réception (pas spam/dossier indésirable) dans `31-UAT.md`, un par fournisseur

2. **Confirmation obligatoire + GoTrue durci (OUV-02)** : sans confirmation d'email, pas de connexion ; les limites de débit applicatives GoTrue sont activées.
   - Current: confirmation déjà requise ; `RATE_LIMIT_*` GoTrue non posés explicitement dans le `.env` de prod
   - Target: variables `RATE_LIMIT_*` GoTrue posées explicitement dans le `.env` de prod (valeurs choisies au plan à partir de la doc GoTrue, pas inventées), documentées dans le SUMMARY
   - Acceptance: une rafale d'inscriptions au-delà de la limite reçoit 429 ; le `.env` porte les variables et le SUMMARY les nomme avec leur source

3. **Rate-limit Traefik (OUV-03)** : `/auth/v1/signup` limité à 3 requêtes/min/IP (rafale 6), `/auth/v1/token` à 10 requêtes/min/IP (rafale 20) — décision « très strict » du tour 3.
   - Current: aucun middleware Traefik RateLimit
   - Target: middlewares `rateLimit` dans l'override Traefik, appliqués par route exacte sur la gateway
   - Acceptance: test effectif — la 4ᵉ requête signup d'une même minute/IP reçoit 429, la 3ᵉ passe ; la 11ᵉ requête token reçoit 429

4. **Pré-écran d'invitation pré-auth (OUV-04)** : un étranger arrivant sur `/foyer/rejoindre?token=…` voit « Vous avez été invité au foyer X » et son token traverse l'inscription jusqu'au foyer.
   - Current: token préservé dans la redirection pré-auth, mais aucun pré-écran — la page générique s'affiche
   - Target: pré-écran nommant le foyer (via un point de consultation pré-auth qui ne consomme pas le token, cf. Prohibitions), puis le token est appliqué automatiquement après inscription/connexion
   - Acceptance: un nouvel utilisateur complet (inscription → confirmation → connexion) atterrit dans le foyer invité sans ressaisie ; l'utilisateur **déjà connecté** ouvrant le lien voit le pré-écran avec bouton « Rejoindre » direct ; un token inconnu affiche le message dédié sans révéler l'existence d'un foyer

5. **Gouvernance du token (OUV-05)** : expiration obligatoire (défaut 30 j), max d'utilisations (défaut 10), révocation à tout moment, message dédié pour token expiré/épuisé.
   - Current: `expires_at` nullable, `max_uses` sans défaut affiché, UI partielle (`invitations-panel.tsx`)
   - Target: création impose expiration (pré-remplie à 30 j) et max_uses (pré-rempli à 10), refuse `max_uses < 1` et une expiration dans le passé ; révocation existante conservée ; migration qui invalide les tokens existants (décision « jetables », tour 1)
   - Acceptance: `use_count` atteint `max_uses` → rejet avec message dédié « ce lien a atteint sa limite » ; token expiré → message dédié « ce lien a expiré » ; création refuse les valeurs invalides ; après migration, aucun token actif pré-existant

6. **Pages légales (OUV-06)** : mentions légales dédiées en ligne + politique de purge/sauvegarde en langue claire.
   - Current: CGU et confidentialité existent ; mentions légales (éditeur, hébergeur, directeur de publication) inexistantes
   - Target: page mentions légales publique ; brouillon rédigé par l'IA, **validé par l'éditeur avant mise en ligne** ; la politique de purge (≤ 30 j) et de sauvegarde chiffrée relue en langue claire dans la confidentialité
   - Acceptance: `/mentions-legales` répond 200 sans session ; le contenu porte la validation de l'éditeur (constat UAT)

7. **Portes dures + push (OUV-07)** : l'ouverture passe les portes prouvées, pas promises.
   - Current: suppression vivante (phase 27) OK ; restauration = runbook seul, exercice réel non joué ; push jamais prouvée
   - Target: exercice de restauration réel exécuté et consigné (RTO mesuré dans `docs/EXPLOITATION.md`) ; push réelle — un abonnement réel sur prod, livraison `delivered` prouvée par `sh scripts/test-dispatch-push.sh` ; preuve SMTP du req. 1
   - Acceptance: l'exercice est consigné avec RTO réel ; `test-dispatch-push.sh` rapporte ≥ 1 `delivered` sur abonnement réel ; si l'exercice échoue ou RTO > cible 4 h, la phase est **bloquée** (porte)

## Boundaries

**In scope:**
- Preuve de réception SMTP réelle (Gmail + Outlook) avec alias noreply
- Variables `RATE_LIMIT_*` GoTrue dans le `.env` de prod
- Middlewares Traefik rateLimit sur `/auth/v1/signup` et `/auth/v1/token`
- Pré-écran d'invitation + point de consultation pré-auth (no-consume, rate-limité)
- Traversée automatique du token après inscription/connexion
- Gouvernance token : migration (invalide les tokens existants), défauts 30 j/10, UI complète, messages dédiés
- Page mentions légales (brouillon IA + validation éditeur), relecture langue claire de la purge/sauvegarde
- Exercice de restauration réel + consignation RTO
- Preuve push réelle (`test-dispatch-push.sh`, ≥ 1 `delivered`)
- Révision de la ROADMAP : OUV-01 reformulée (relais Gmail, Stalwart sorti)

**Out of scope:**
- Stalwart, SPF/DKIM/DMARC, enregistrements DNS — le relais Gmail existant les rend sans objet (décision tour 1, OUV-01 reformulée)
- Refonte OAuth Google — déjà en place, aucun changement d'exigence
- Messagerie/push au-delà de la re-diligence push — pas d'évolution fonctionnelle
- Changement d'hébergement ou de topologie infra — la prod reste la stack actuelle
- Traductions des pages légales — le public est francophone
- Évolution du format du token (base64url court, HMAC) — déjà conforme AGENTS.md §4

## Constraints

- Le FROM des emails de confirmation n'est **pas** l'adresse Gmail personnelle brute : alias « Envoyer en tant que » `noreply@…` configuré dans Gmail, prouvé par un email reçu (Prohibition ②)
- Le point de consultation du pré-écran ne consomme jamais le token (`use_count` inchangé) et est rate-limité (Prohibition ①)
- Les valeurs `RATE_LIMIT_*` GoTrue proviennent de la documentation GoTrue, jamais de devinette (AGENTS.md)
- Les seuils Traefik sont ceux du tour 3 : signup 3/min rafale 6, token 10/min rafale 20 — le compromis « très strict » est assumé (risque de blocage de connexions légitimes simultanées accepté par l'éditeur)
- Migration token : décision « jetables » — les tokens pré-existants sont invalidés sans cérémonie
- Les pages légales ne passent en ligne qu'après validation du contenu par l'éditeur

## Acceptance Criteria

- [ ] Un email de confirmation de prod arrive **en boîte de réception** (pas spam) sur un compte Gmail réel — relevé daté consigné
- [ ] Idem sur un compte Outlook réel — relevé daté consigné
- [ ] Le FROM des emails est un alias noreply, pas l'adresse Gmail personnelle brute
- [ ] Une inscription sans confirmation d'email ne parvient pas à se connecter
- [ ] Les `RATE_LIMIT_*` GoTrue sont posés dans le `.env` de prod et une rafale au-delà reçoit 429
- [ ] La 4ᵉ requête `/auth/v1/signup` d'une même minute/IP reçoit 429 ; la 3ᵉ passe
- [ ] La 11ᵉ requête `/auth/v1/token` d'une même minute/IP reçoit 429 ; la 10ᵉ passe
- [ ] Un nouvel utilisateur (inscription → confirmation → connexion) sur un lien d'invitation atterrit dans le foyer sans ressaisie du token
- [ ] Un utilisateur déjà connecté ouvrant le lien voit le pré-écran avec bouton « Rejoindre » direct
- [ ] Un token inconnu/expiré/épuisé affiche un message dédié (distinct, sans révéler l'existence d'un foyer)
- [ ] Consulter le pré-écran ne modifie pas `use_count` (test négatif)
- [ ] La création d'un token refuse `max_uses < 1` et une expiration dans le passé ; défauts 30 j / 10 pré-remplis
- [ ] Après migration, aucun token actif pré-existant ; les nouveaux tokens portent l'expiration obligatoire
- [ ] `/mentions-legales` répond 200 sans session, contenu validé par l'éditeur
- [ ] Exercice de restauration réel consigné avec RTO mesuré (porte : échec ou RTO > 4 h bloque la phase)
- [ ] `sh scripts/test-dispatch-push.sh` rapporte ≥ 1 `delivered` sur abonnement réel de prod

## Edge Coverage

**Coverage:** 12/12 applicable edges resolved · 0 unresolved

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| unclassified | OUV-01 | ✅ covered | Preuve sur comptes réels (Gmail perso + Outlook), relevés datés en boîte de réception — critère req. 1 (verification: explicit) |
| boundary | OUV-02 | ✅ covered | `RATE_LIMIT_*` GoTrue posés explicitement, rafale au-delà → 429 — critère req. 2 (verification: explicit) |
| precision | OUV-02 | ⛔ dismissed | Aucun calcul numérique dans le flux SMTP/confirmation — catégorie sans objet |
| boundary | OUV-03 | ✅ covered | 4ᵉ signup/min → 429, 3ᵉ passe ; 11ᵉ token/min → 429 — critères req. 3, aux seuils exacts (verification: explicit) |
| precision | OUV-03 | ⛔ dismissed | Les compteurs appartiennent à Traefik — aucun arrondi à contractualiser de notre côté |
| unclassified | OUV-04 | ✅ covered | Utilisateur connecté → pré-écran + « Rejoindre » direct ; token inconnu → message dédié sans révélation (verification: explicit) |
| boundary | OUV-05 | ✅ covered | use_count = max_uses → rejet dédié ; migration invalide l'existant (verification: explicit) |
| empty | OUV-05 | ✅ covered | Création refuse max_uses < 1 et expiration dans le passé (verification: explicit) |
| encoding | OUV-05 | ⛔ dismissed | Format du token déjà imposé (0002, base64url, HMAC) — aucune nouveauté |
| precision | OUV-05 | ⛔ dismissed | 30 j = now() + interval, timestamptz — aucun arrondi |
| unclassified | OUV-06 | ✅ covered | Pages publiques (200 sans session) (verification: explicit) |
| unclassified | OUV-07 | ✅ covered | Exercice échoué ou RTO > 4 h ⇒ phase bloquée — porte explicite (verification: explicit) |

## Prohibitions (must-NOT)

**Coverage:** 2/2 applicable prohibitions resolved · 0 unresolved

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT : le point de consultation du pré-écran ne consomme jamais le token et est rate-limité (pas d'énumération, pas de consommation par consultation) | OUV-04 | resolved | verification: test — test négatif sur `use_count` + rate-limit du point de consultation (descriptor: à fixer au plan) |
| MUST NOT : aucun email d'inscription n'est envoyé depuis l'adresse Gmail personnelle brute (alias noreply obligatoire) | OUV-01 | resolved | verification: judgment — constat sur les emails reçus (preuve ①) ; descriptor: constat UAT |

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                        |
|--------------------|-------|------|--------|----------------------------------------------|
| Goal Clarity       | 0.90  | 0.75 | ✓      | Transport email tranché (relais Gmail)        |
| Boundary Clarity   | 0.85  | 0.70 | ✓      | Liste hors-périmètre confirmée au tour 3      |
| Constraint Clarity | 0.85  | 0.65 | ✓      | Seuils rate-limit verrouillés, tokens jetables |
| Acceptance Criteria| 0.82  | 0.70 | ✓      | 16 critères pass/fail                          |
| **Ambiguity**      | 0.14  | ≤0.20| ✓      |                                                |

## Interview Log

| Round | Perspective     | Question summary | Decision locked |
|-------|-----------------|------------------|-----------------|
| 1 | Researcher | Où vit Stalwart ? / c'est quoi Stalwart ? | L'éditeur révèle que le relais Gmail est **déjà configuré en prod** (D-13) → OUV-01 reformulée, Stalwart sorti ; tokens existants = jetables |
| 2 | Researcher + Simplifier | Reformuler OUV-01 ? Qui rédige les mentions légales ? Push dans le périmètre ? | Reformulation confirmée ; mentions légales = brouillon IA + validation éditeur ; **push incluse** dans 31 |
| 3 | Boundary Keeper | Seuils rate-limit ? Hors-périmètre ? Message token expiré ? | Très strict (signup 3/min rafale 6, token 10/min rafale 20) ; liste hors-périmètre confirmée ; message dédié distinct pour expiré/épuisé |
| Probes | Edge + Prohibition | 12 limites, 2 prohibitions | 9 limites spécifiées, 3 écartées (sans objet) ; 2 prohibitions gardées (no-consume pré-écran, alias noreply) |

---

*Phase: 31-inscriptions-ouvertes*
*Spec created: 2026-11-03*
*Next step: /gsd-discuss-phase 31 — implementation decisions (how to build what's specified above)*
