# Phase 31: Inscriptions ouvertes - Context

**Gathered:** 2026-11-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Le serveur accueille des étrangers en sécurité et avec une voie de sortie : preuve de livraison SMTP réelle (boîte de réception Gmail + Outlook), rate-limit Traefik + GoTrue durcis, pré-écran d'invitation pré-auth avec traversée automatique du token jusqu'au foyer, gouvernance complète du token de foyer (expiration obligatoire, max d'utilisations, révocation), mentions légales en ligne — le tout derrière les portes dures OUV-07 (exercice de restauration réel, push réelle prouvée).

**Hors périmètre :** Stalwart/SPF/DKIM/DMARC (relais Gmail existant), refonte OAuth Google, évolutions messagerie/push au-delà de la preuve, changement d'hébergement, traductions des pages légales, évolution du format du token.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**7 requirements are locked.** See `31-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `31-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
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

**Out of scope (from SPEC.md):**
- Stalwart, SPF/DKIM/DMARC, enregistrements DNS — le relais Gmail existant les rend sans objet
- Refonte OAuth Google — déjà en place
- Messagerie/push au-delà de la re-diligence push
- Changement d'hébergement ou de topologie infra
- Traductions des pages légales
- Évolution du format du token (base64url court, HMAC)

</spec_lock>

<decisions>
## Implementation Decisions

### Point de consultation pré-auth (pré-écran)
- **D-01:** Le point de consultation est une **Edge Function dédiée** (ex. `household-invite-preview`) — pas un mode ajouté à l'Edge `household-invite` existante. La Edge de redeem conserve sa seule responsabilité ; la surface publique de consultation reste minimale. — **Reversibility:** reversible.
- **D-02:** Sur un token valide, la réponse ne porte que le **nom du foyer** et, si disponible, le **prénom de l'inviteur** — rien d'autre (pas de couleur, pas d'avatar, pas de métadonnées).
- **D-03:** Sur un token non valide (inconnu, expiré, épuisé), la réponse est **uniforme** : même code HTTP et même message générique — impossible de distinguer un foyer existant d'un token mort (anti-énumération). La distinction inconnu/expiré/épuisé n'existe que côté redeem authentifié (D-14).
- **D-04:** Le rate-limit du point de consultation suit le **gabarit applicatif existant** de l'Edge `household-invite` (même mécanique, seuil ajusté au plan) — pas de double barrière Traefik pour cette route.
- **D-05:** Le point de consultation **ne consomme jamais le token** (`use_count` inchangé) — Prohibition ① de la SPEC, prouvée par un test négatif.

### Traversée du token post-confirmation
- **D-06:** À l'arrivée sur `/foyer/rejoindre?token=…` sans session, le token est copié en **sessionStorage** avant le parcours d'inscription. Raison : la confirmation email fait sortir l'utilisateur de l'app (navigation externe), l'URL d'origine n'est pas garantie au retour. — **Reversibility:** reversible.
- **D-07:** Le lien de confirmation email ramène de façon **générique** sur l'app (`SITE_URL`) — le token ne voyage **jamais** dans la redirect URL du mail (pas de token en clair dans l'email ni dans les logs de messagerie). Au retour, sessionStorage réinjecte le token. — **Reversibility:** reversible.
- **D-08:** Après connexion/inscription avec un token en attente, le **pré-écran** s'affiche avec bouton « Rejoindre » — l'utilisateur confirme toujours avant d'entrer dans le foyer (consentement explicite), jamais d'application silencieuse.
- **D-09:** Si le token est invalide au moment de l'application après connexion : **message dédié correspondant** (inconnu/expiré/épuisé) puis l'utilisateur atterrit sur son état normal (choix créer/rejoindre s'il est sans foyer) — jamais bloqué, jamais d'aterrissage inexpliqué.

### Identité expéditeur & preuves email
- **D-10:** FROM des emails de confirmation = **contact@jeremymaillot.fr**, configuré comme alias « Envoyer en tant que » dans le compte Gmail `jeremymaillot@gmail.com` (qui reste le relais d'authentification SMTP). L'adresse Gmail personnelle brute n'apparaît jamais en FROM — Prohibition ②. (Choix explicite de l'éditeur : « Autre adresse » → contact@jeremymaillot.fr.)
- **D-11:** Les deux relevés datés (Gmail + Outlook, req. 1) proviennent d'une **inscription réelle de prod** : email de confirmation envoyé aux deux comptes, capture d'écran de la boîte de réception (pas spam) avec date visible, collée dans `31-UAT.md`.
- **D-12:** Les variables `RATE_LIMIT_*` GoTrue sont relevées de la **documentation GoTrue** (gabarit `.env.example` du snapshot + doc officielle), citées avec leur source dans le SUMMARY, puis prouvées par une **rafale manuelle** qui reçoit 429 (AGENTS.md : jamais de valeur inventée).

### Mentions légales
- **D-13:** Contenu réel : éditeur et directeur de publication = **Jeremy Maillot (entrepreneur individuel)** ; hébergement présenté en **auto-hébergé** (« hébergé par l'éditeur lui-même sur son propre serveur ») ; contact = **contact@jeremymaillot.fr**. Brouillon rédigé par l'IA, validé par l'éditeur avant mise en ligne (exigence de la SPEC).

### UI gouvernance du token
- **D-14:** La gouvernance complète vit dans le **panneau `invitations-panel.tsx` existant**, enrichi : création avec champs pré-remplis (30 j / 10) + liste des tokens actifs + révocation. Pas de nouvel écran. — **Reversibility:** reversible.
- **D-15:** La liste des tokens actifs est **anonymisée** : date de création, expiration, compteur d'utilisations, statut — jamais le token brut (seul le HMAC est stocké ; le brut n'est affiché qu'à sa génération, décision verrouillée AGENTS.md §2.5/§4).
- **D-16:** Révocation **individuelle** token par token depuis la liste, confirmée par **modale** (règle transverse « actions destructrices » AGENTS.md §6). La révocation globale existante est conservée.
- **D-17:** Côté redeem authentifié, **trois messages distincts** : « ce lien est invalide » (inconnu), « ce lien a expiré » (expiration), « ce lien a atteint sa limite d'utilisations » (épuisé) — verbatim exacts tranchés à l'écriture avec le ton existant de l'app.

### UI du pré-écran d'invitation
- **D-18:** Un **écran dédié** (ex. `join-household-page`) réutilisant les primitives existantes (Card, boutons, style sign-in) — le gabarit `sign-in-page.tsx` reste centré sur l'auth. — **Reversibility:** reversible.
- **D-19:** **Un seul gabarit, deux actions** : l'utilisateur déjà connecté voit le même pré-écran avec bouton « Rejoindre » direct ; l'étranger voit le même écran avec l'action « Continuer vers l'inscription » — pas de duplication de gabarit.
- **D-20:** Ton : nom du foyer + inviteur si possible (« Marie t'invite à rejoindre [Nom du foyer] », sinon « Vous avez été invité à rejoindre [Nom du foyer] »), en français, sans jargon — la réponse du point de consultation reste uniforme et minimale pour un token mort (aucune fuite d'existence, cf. D-02/D-03).

### the agent's Discretion
- Seuil applicatif exact du rate-limit du point de consultation (gabarit `household-invite`).
- Forme exacte de l'Edge preview (signature, mode d'auth `publishable`/`none` avec vérification HMAC interne, gabarit `withSupabase`).
- Mécanique sessionStorage exacte : durée de vie, nettoyage après application ou abandon, comportement multi-onglets.
- Verbatim finaux des messages dédiés (D-17) et du pré-écran (D-20) — ton de l'app.
- Structure du formulaire de création enrichi dans `invitations-panel.tsx` (validation client + serveur des valeurs invalides).
- Gabarit exact de la page mentions légales (primitives existantes, route publique `/mentions-legales`).
- Modalités du rafale-test GoTrue 429 (outil, cadence) — preuve datée dans l'UAT.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Exigences verrouillées
- `.planning/phases/31-inscriptions-ouvertes/31-SPEC.md` — les 7 exigences, 16 critères d'acceptation, 2 prohibitions, contraintes (seuils Traefik 3/min rafale 6 et 10/min rafale 20, défauts 30 j/10, tokens jetables)
- `.planning/REQUIREMENTS.md` — exigences OUV-01…OUV-07 (OUV-01 reformulée : relais Gmail, Stalwart sorti)
- `.planning/ROADMAP.md` § Phase 31 — objectif, portes dures, critères de succès

### Auth, token et Edge existantes
- `supabase/functions/household-invite/index.ts` — Edge de redeem : HMAC serveur, rate-limit applicatif (gabarit du D-04), mode `withSupabase` à reprendre pour l'Edge preview
- `supabase/migrations/0017_invite_tokens.sql` (redeem transactionnel, HMAC) et migrations ultérieures portant `household_invite_tokens` — source de vérité du schéma (`expires_at` nullable aujourd'hui)
- `app/src/app/router.tsx` — route `/foyer/rejoindre` (l.223) et préservation du token pré-auth (commentaire l.30)
- `app/src/app/router.test.tsx` l.170-209 — tests existants de préservation du token pré-auth, à étendre
- `app/src/modules/landing/sign-in-page.tsx` — mode inscription, `use-auth.ts:291` (signup branché) ; confirmation email déjà requise
- `app/src/modules/parametres/components/invitations-panel.tsx` — panneau à enrichir (D-14)

### Exploitation et portes dures (OUV-07)
- `docs/EXPLOITATION.md` l.99-253 — runbook de restauration (phase 28), à exécuter réellement et à dater du RTO mesuré
- `scripts/test-dispatch-push.sh` — preuve push attribuable (≥ 1 `delivered` sur abonnement réel)
- `scripts/send-mail.sh`, `scripts/test-gift-mail.sh` — canal de test SMTP existant
- `docs/DEPLOIEMENT-PROD.md` § transport mail — relais Gmail D-13 (2026-10-29), à réviser avec l'alias contact@jeremymaillot.fr

### Pages légales existantes
- `app/src/modules/landing/terms-page.tsx` et `privacy-page.tsx` (§conservation/suppression l.179-193) — gabarit et contenu à relier aux mentions légales ; relecture langue claire de la purge (≤ 30 j) et de la sauvegarde chiffrée

### Disciplines héritées
- `AGENTS.md` §2.5-2.6 (secrets, tokens HMAC, RLS), §2.7 (chaîne de vérification avant commit, preuves « vu rouge avant vert »), §4 (flux d'onboarding token)
- `.planning/phases/28-exploitation-sauvegardes-restauration-supervision/28-CONTEXT.md` D-08/D-10 — Compose isolé même hôte, runbook pas-à-pas rejouable
- `.planning/phases/27-suppression-de-compte-rgpd/27-CONTEXT.md` — suppression vivante (porte existante de OUV-07)

### Doc externe à consulter au plan
- Documentation GoTrue (`.env.example` du snapshot `self-hosted/v0.8.2` + doc officielle Supabase/Gotrue) — source obligatoire des valeurs `RATE_LIMIT_*` (D-12, SPEC req. 2)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Edge `household-invite` : validation HMAC + rate-limit applicatif — gabarit direct pour l'Edge preview (D-01/D-04)
- `sign-in-page.tsx` + `use-auth.ts` : signup/connexion branchés, confirmation requise — la traversée du token s'ajoute, l'auth ne se réécrit pas
- `invitations-panel.tsx` : création/régénération partielle — à enrichir (défauts, liste, révocation individuelle), pas à remplacer
- Pages légales `terms-page.tsx` / `privacy-page.tsx` : gabarit de page publique existant pour la route `/mentions-legales`
- Primitives UI existantes (Card, boutons, modales de confirmation) — pré-écran dédié (D-18) et modale de révocation (D-16) sur tokens existants

### Established Patterns
- Edge Functions à modes déclarés (`publishable`/`user`/`secret`/`none`) avec `withSupabase` — l'Edge preview déclare explicitement son mode
- Preuves par scripts attribuables (`test-dispatch-push.sh`, `test-db.sh`) avec preuve de leur propre efficacité — philosophie §2.7-F
- Tokens jamais en clair : HMAC en base, brut affiché une seule fois à la génération
- Rate-limit Traefik : absent aujourd'hui — les middlewares `rateLimit` par route exacte dans `docker-compose.traefik.yml` sont un pattern à créer (SPEC req. 3)

### Integration Points
- `/foyer/rejoindre?token=…` (route existante) → pré-écran dédié + sessionStorage (D-06/D-18)
- GoTrue `.env` de prod → `RATE_LIMIT_*` + alias FROM contact@jeremymaillot.fr (D-10/D-12)
- `docker-compose.traefik.yml` → middlewares rateLimit sur `/auth/v1/signup` et `/auth/v1/token`
- Migration token → invalide tous les tokens actifs pré-existants (décision « jetables », SPEC req. 5)
- Route publique `/mentions-legales` → 200 sans session, liée depuis CGU et confidentialité

</code_context>

<specifics>
## Specific Ideas

- FROM expéditeur imposé par l'éditeur : **contact@jeremymaillot.fr** (alias « Envoyer en tant que » du compte Gmail relais) — l'adresse Gmail brute n'apparaît jamais.
- Pré-écran : nom du foyer + prénom de l'inviteur si possible, ton chaleureux français (« Marie t'invite à rejoindre… »).
- Les trois messages d'erreur token (inconnu/expiré/épuisé) doivent être **distincts et aidants** pour l'admin qui teste son lien, mais la surface publique reste uniforme.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 31-inscriptions-ouvertes*
*Context gathered: 2026-11-03*
