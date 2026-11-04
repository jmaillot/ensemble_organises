# Phase 31: Inscriptions ouvertes - Research

**Researched:** 2026-11-03
**Domain:** Self-hosted Supabase hardening (GoTrue SMTP + rate-limit, Traefik middleware), pre-auth invitation flow (Edge preview + token traversal), token governance (SQL/Edge/UI), legal pages, hard-gate proofs (restoration exercise, push, SMTP delivery)
**Confidence:** HIGH (spec is tightly locked; all key in-repo facts opened and quoted this session; external facts verified against official GoTrue and Traefik docs via Context7)

## Summary

This phase is mostly **hardening and proof, not greenfield**. The signup path already exists and already requires email confirmation (`GOTRUE_MAILER_AUTOCONFIRM` default `false` [CITED: supabase/auth configuration.md — MailerConfiguration, Autoconfirm default `false`]; the stack does not override it). The deltas are: (1) point GoTrue's SMTP at a deliverable transport and prove inbox delivery on Gmail AND Outlook, (2) pin explicit GoTrue `GOTRUE_RATE_LIMIT_*` variables in the stack `.env` and add Traefik `rateLimit` middlewares on two exact routes, (3) build a pre-auth invitation preview (new dedicated Edge Function) plus token traversal through signup via sessionStorage, (4) extend token governance (mandatory expiry, list of active tokens, individual revocation), (5) ship `/mentions-legales`, and (6) execute the operator gates (restoration exercise with RTO, `test-dispatch-push.sh`, delivery screenshots).

Two findings materially reshape the plan and must not be missed:

1. **The token data model changes.** Today there is exactly **one active token per household**: creation invalidates all previous tokens [VERIFIED: supabase/migrations/0006_security_helpers.sql:297-308 — « Régénération : le token précédent est invalidé immédiatement. / update public.household_invite_tokens set is_active = false where household_id = p_household_id and is_active; »], the summary returns a single row, and revoke hits every active token of the household [VERIFIED: supabase/migrations/0006_security_helpers.sql:333-336]. D-14/D-15/D-16 require a **list** of coexisting active tokens with **individual** revocation. This touches: the create SQL function (stop invalidating predecessors), a new per-token revoke function, the `summary` action (becomes a list), the Edge contract, `lib/invites.ts`, the localStorage recall model (`isRecallValid` matches one token), and the UI panel. The planner must size this as a real model migration, not a cosmetic panel tweak.
2. **`/foyer/rejoindre` is currently auth-gated.** The route sits inside `<RequireAuth>` [VERIFIED: app/src/app/router.tsx:219-226 — `path="/foyer/rejoindre" element={ <RequireAuth> … }]`, and the auth redirect preserves the full query string [VERIFIED: app/src/app/router.tsx:25-33 — comment « le jeton EST le contrôle d'accès (AGENTS.md §4) »]. OUV-04 requires the pre-screen to be visible to a **stranger without session** — the route must leave `RequireAuth` (or a new pre-auth page be mounted on the same path), which also touches the existing pre-auth token-preservation tests in `router.test.tsx:170-209`.

On SMTP there is an important subtlety vs. the CONTEXT wording: GoTrue currently reads the stack's `SMTP_*` variables, which are set to `supabase-mail:2500` — the internal Stalwart container name [VERIFIED: docs/DEPLOIEMENT-PROD.md:196-197 — « Le `.env` de la stack définit `SMTP_HOST=supabase-mail`, `SMTP_PORT=2500`. `supabase-mail` est un **nom de réseau Docker interne** »]. The Gmail relay (msmtp → smtp.gmail.com:587) proven on 2026-10-29 serves the **host-side ops scripts**, not GoTrue. For D-10/D-11 the plan must repoint the stack `.env` `SMTP_*` (consumed as `GOTRUE_SMTP_*` by the `auth` service [VERIFIED: supabase-project/docker-compose.yml:164-170]) at smtp.gmail.com:587 with an app password, and configure `contact@jeremymaillot.fr` as a Gmail "Send mail as" alias — deliverability caveats are flagged under Pitfalls.

**Primary recommendation:** Plan six task clusters in this order — (A) SQL migration (tokens jetables + expiry mandatory + list model), (B) Edge changes (preview function + list/individual-revoke actions), (C) frontend (pre-screen page, router de-gating, sessionStorage traversal, invitations-panel enrichment, legal page), (D) infra `.env` + Traefik middlewares with 429 proofs, (E) operator gates (restoration exercise, push, Gmail+Outlook screenshots), (F) ROADMAP OUV-01 reformulation. Clusters E and the proofs are blocking phase-exit conditions, not nice-to-haves.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Le point de consultation est une **Edge Function dédiée** (ex. `household-invite-preview`) — pas un mode ajouté à l'Edge `household-invite` existante. La Edge de redeem conserve sa seule responsabilité ; la surface publique de consultation reste minimale.
- **D-02:** Sur un token valide, la réponse ne porte que le **nom du foyer** et, si disponible, le **prénom de l'inviteur** — rien d'autre.
- **D-03:** Sur un token non valide (inconnu, expiré, épuisé), la réponse est **uniforme** : même code HTTP et même message générique — impossible de distinguer un foyer existant d'un token mort (anti-énumération). La distinction inconnu/expiré/épuisé n'existe que côté redeem authentifié (D-14).
- **D-04:** Le rate-limit du point de consultation suit le **gabarit applicatif existant** de l'Edge `household-invite` (même mécanique, seuil ajusté au plan) — pas de double barrière Traefik pour cette route.
- **D-05:** Le point de consultation **ne consomme jamais le token** (`use_count` inchangé) — Prohibition ①, prouvée par un test négatif.
- **D-06:** À l'arrivée sur `/foyer/rejoindre?token=…` sans session, le token est copié en **sessionStorage** avant le parcours d'inscription (la confirmation email fait sortir de l'app ; l'URL d'origine n'est pas garantie au retour).
- **D-07:** Le lien de confirmation email ramène de façon **générique** sur l'app (`SITE_URL`) — le token ne voyage **jamais** dans la redirect URL du mail.
- **D-08:** Après connexion/inscription avec un token en attente, le **pré-écran** s'affiche avec bouton « Rejoindre » — consentement explicite, jamais d'application silencieuse.
- **D-09:** Si le token est invalide au moment de l'application après connexion : **message dédié correspondant** (inconnu/expiré/épuisé) puis atterrissage sur l'état normal — jamais bloqué.
- **D-10:** FROM des emails de confirmation = **contact@jeremymaillot.fr**, alias « Envoyer en tant que » dans le compte Gmail `jeremymaillot@gmail.com` (relais SMTP). L'adresse Gmail brute n'apparaît jamais en FROM — Prohibition ②.
- **D-11:** Les relevés datés (Gmail + Outlook) proviennent d'une **inscription réelle de prod**, capture boîte de réception (pas spam) avec date, collée dans `31-UAT.md`.
- **D-12:** Les variables `RATE_LIMIT_*` GoTrue sont relevées de la **documentation GoTrue**, citées avec leur source dans le SUMMARY, puis prouvées par une **rafale manuelle** qui reçoit 429.
- **D-13:** Mentions légales : éditeur = **Jeremy Maillot (entrepreneur individuel)** ; hébergement **auto-hébergé** ; contact = **contact@jeremymaillot.fr**. Brouillon IA validé par l'éditeur avant mise en ligne.
- **D-14:** La gouvernance vit dans le **panneau `invitations-panel.tsx` existant**, enrichi : création pré-remplie (30 j / 10) + liste des tokens actifs + révocation. Pas de nouvel écran.
- **D-15:** Liste des tokens actifs **anonymisée** : date de création, expiration, compteur, statut — jamais le token brut.
- **D-16:** Révocation **individuelle** token par token, confirmée par **modale**. La révocation globale existante est conservée.
- **D-17:** Côté redeem authentifié, **trois messages distincts** : « ce lien est invalide » / « ce lien a expiré » / « ce lien a atteint sa limite d'utilisations ».
- **D-18:** Un **écran dédié** (ex. `join-household-page`) réutilisant les primitives existantes — `sign-in-page.tsx` reste centré auth.
- **D-19:** **Un seul gabarit, deux actions** (connecté → « Rejoindre » ; étranger → « Continuer vers l'inscription »).
- **D-20:** Ton : « Marie t'invite à rejoindre [Nom du foyer] », sinon « Vous avez été invité à rejoindre [Nom du foyer] », français, sans jargon.

### the agent's Discretion
- Seuil applicatif exact du rate-limit du point de consultation (gabarit `household-invite`).
- Forme exacte de l'Edge preview (signature, mode d'auth `publishable`/`none` avec vérification HMAC interne, gabarit `withSupabase`).
- Mécanique sessionStorage exacte : durée de vie, nettoyage, multi-onglets.
- Verbatim finaux des messages D-17 et du pré-écran D-20 (le `31-UI-SPEC.md` approuvé fournit déjà la copie — l'adopter).
- Structure du formulaire de création enrichi (validation client + serveur).
- Gabarit exact de `/mentions-legales` (primitives existantes, route publique).
- Modalités du rafale-test GoTrue 429 (outil, cadence).

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. (SPEC out-of-scope : Stalwart/SPF/DKIM/DMARC, refonte OAuth Google, messagerie/push au-delà de la re-diligence, changement d'hébergement, traductions légales, évolution du format du token.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OUV-01 | Preuve de réception réelle Gmail + Outlook (reformulée : relais Gmail, Stalwart sorti) | GoTrue SMTP variables are `SMTP_*` in stack `.env` mapped to `GOTRUE_SMTP_*` in compose [VERIFIED: docker-compose.yml:164-170]; repoint at smtp.gmail.com:587 + Send-as alias; delivery proof protocol in Pitfalls/Code Examples |
| OUV-02 | Confirmations obligatoires + GoTrue durci (`RATE_LIMIT_*` explicites, rafale → 429) | Verified variable list + value format from official GoTrue docs (Standard Stack); `AUTOCONFIRM` already `false` |
| OUV-03 | Rate-limit Traefik sur `/auth/v1/signup` (3/min, rafale 6) et `/auth/v1/token` (10/min, rafale 20) | Traefik `rateLimit` average/period/burst syntax verified; per-route routers with `PathPrefix` + priority needed (Architecture Patterns) |
| OUV-04 | Pré-écran pré-auth + traversée du token | Route currently behind `RequireAuth` [VERIFIED: router.tsx:219-226]; preview Edge pattern = existing `household-invite` (rate-limit map, `withSupabase`, HMAC) ; sessionStorage traversal per D-06/D-07 |
| OUV-05 | Gouvernance token (expiration obligatoire 30 j, max 10, révocation, messages dédiés) | Current schema quoted (expires_at nullable, max_uses check 1..100) ; **one-active-token model must change to list model** (Summary finding 1) ; redeem errors already distinct server-side (Edge lines 306-311) |
| OUV-06 | Mentions légales + purge/sauvegarde en langue claire | Public page gabarit `terms-page.tsx`/`privacy-page.tsx` exists ; UI-SPEC copy contract locked |
| OUV-07 | Portes dures : suppression vivante (27 OK) + exercice de restauration réel (RTO ≤ 4 h) + push réelle (≥ 1 `delivered`) | Runbook at docs/EXPLOITATION.md:99-253 (Compose isolé `eo-restore`, pg_cron disabled before start) ; `test-dispatch-push.sh` refuses fake endpoints — needs a real device subscription; push was never proven (STATE.md:205) |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- **Chaîne de vérification avant commit (§2.7)** : `cd app && npm run typecheck && npm test && npm run build`, `npm run test:e2e`, `python3 scripts/check-sql-statique.py`, `python3 scripts/test-check-sql-statique.py`, `sh scripts/test-db.sh` (Docker), `sh scripts/test-dispatch-push.sh` (s'il y a un appareil abonné). **Aucun linter** — interdiction de directive ESLint ; un effet dont on omet une dépendance porte un commentaire **nommant la raison**.
- **Jamais de valeur inventée (§2.7 / D-12)** : les valeurs `RATE_LIMIT_*` viennent de la doc GoTrue — fournies ci-dessous avec source. Toute commande exécutée doit citer son résultat ; « vu rouge avant vert » pour tout nouveau contrôle.
- **SQL (§2.7 A/B)** : ne jamais réécrire une migration appliquée (migration corrective vers l'avant) ; `search_path = ''` ⇒ tables toujours qualifiées `public.x` ; `returns table` = variables en PL/pgSQL ; contrôle statique 8 points.
- **Secrets (§2.7 H / §2.6)** : jamais versionnés, jamais en argv, jamais dans `cron.job.command` — le `.env` de stack et les fichiers 600 uniquement.
- **Tokens (§2.5/§4)** : HMAC uniquement en base, brut affiché une seule fois à la génération, ≥ 128 bits, base64url ; redeem transactionnel serveur ; `household_invite_tokens` invisible du client (RLS sans politique).
- **Composants UI** : aucune dépendance UI nouvelle — bibliothèque first-party locale (31-UI-SPEC : « Aucun nouveau composant UI générique ne doit être créé dans cette phase »).
- **Email FROM** : jamais l'adresse Gmail brute (Prohibition ②).
- **Actions destructrices** : toujours modale de confirmation (§6).
- **Un succès muet est un échec (§2.7 F)** : chaque preuve (429, livraison, `delivered`, RTO) doit être consignée avec date et valeur observée.

## Standard Stack

### Core (aucune nouvelle dépendance applicative)

| Élément | Version / Source | Purpose | Provenance |
|---------|-----------------|---------|------------|
| GoTrue `GOTRUE_RATE_LIMIT_EMAIL_SENT` | `Rate` type : nombre simple = événements/heure fixe ; ou `events/durée` (burst, ex. `3/1m`) — default `30` | Limite les emails envoyés sur `/signup`, `/invite`, `/magiclink`, `/recover`, `/otp`, `/user` | [VERIFIED: Context7 /supabase/auth — _autodocs/configuration.md (GlobalConfiguration, `RateLimitEmailSent default:"30"`) + README (« Rate limit the number of emails sent per hour on the following endpoints: /signup, /invite, /magiclink, /recover, /otp, & /user ») + internal/conf/rate.go (`Decode` : `"30"` → interval 30/hour ; `"100/5m"` → burst)] |
| GoTrue `GOTRUE_RATE_LIMIT_TOKEN_REFRESH` | float64, default `150` | Limite `/token?grant_type=refresh_token` | [VERIFIED: Context7 /supabase/auth — configuration.md] |
| GoTrue `GOTRUE_RATE_LIMIT_VERIFY` | float64, default `30` | Limite `/verify` (donc les liens de confirmation cliqués) | [VERIFIED: Context7 /supabase/auth — configuration.md] |
| GoTrue `GOTRUE_RATE_LIMIT_OTP` | float64, default `30` | Limite resend OTP | [VERIFIED: Context7 /supabase/auth — configuration.md] |
| GoTrue `GOTRUE_RATE_LIMIT_ANONYMOUS_USERS` / `_SSO` | float64, default `30` | Sans objet direct mais posables explicitement | [VERIFIED: Context7 /supabase/auth — configuration.md] |
| GoTrue `GOTRUE_MAILER_AUTOCONFIRM` | default `false` | Confirmation email obligatoire — déjà le comportement de la stack | [CITED: supabase/auth configuration.md — Autoconfirm default false] |
| Traefik middleware `rateLimit` | `average`, `period`, `burst` (défauts : burst=1, period=1s) ; Docker labels `traefik.http.middlewares.<name>.ratelimit.average=…` etc. | Barrière par route sur la gateway | [VERIFIED: Context7 /traefik/traefik — docs ratelimit.md + pkg/config/dynamic/middlewares.go (SetDefaults burst=1, period=1s)] |
| Edge Functions runtime épinglé | `@supabase/server` épinglé via `volumes/functions/deno.jsonc` ; gabarit `withSupabase` | Edge preview + actions liste/révocation | [VERIFIED: supabase/functions/household-invite/index.ts:55-68] |
| React Router 8 / TanStack Query / first-party UI | existants | Pré-écran, traversée, panneau | [VERIFIED: join-household-page.tsx, invitations-panel.tsx] |

**Important sur le format `RATE_LIMIT_EMAIL_SENT` :** la valeur `"30"` (nombre simple) est un **quota horaire à intervalle fixe**, pas un rafal limiter — un test « 31 inscriptions en 2 minutes » la déclencherait, mais un test attendu « 429 à la 4ᵉ inscription de la minute » ne passera PAS avec un quota horaire. Pour une preuve de rafale lisible, poser un format burst `events/durée` (ex. `GOTRUE_RATE_LIMIT_EMAIL_SENT=6/1m`) — le `Decode` GoTrue accepte les deux formes [VERIFIED: Context7 /supabase/auth — rate.go Decode]. Les valeurs exactes restent à trancher au plan à partir de cette sémantique (D-12 : citées dans le SUMMARY).

**Note `.env.example` du snapshot :** il ne contient **aucune** variable `GOTRUE_RATE_LIMIT_*` prête (seul `SAML_RATE_LIMIT_ASSERTION=15` y figure) [VERIFIED: supabase-project/.env.example — grep RATE_LIMIT → ligne 267 uniquement]. Les variables sont donc à ajouter à la main dans `.env` + au bloc `auth` de docker-compose si le passthrough n'existe pas encore — vérifier au plan que le service `auth` de la stack transmet `GOTRUE_RATE_LIMIT_*` (envconfig les lit directement depuis l'environnement du conteneur ; ajouter `GOTRUE_RATE_LIMIT_EMAIL_SENT: ${GOTRUE_RATE_LIMIT_EMAIL_SENT}` etc. si absent).

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Middlewares Traefik par route dédiée | Un seul middleware sur le router `api-gw` existant | Refusé : s'appliquerait à TOUTES les routes API (Storage, Functions, Realtime) — les seuils très stricts bloqueraient des usages légitimes hors auth |
| Rate-limit GoTrue seul | + Traefik | Les deux sont exigés par la SPEC (OUV-02 + OUV-03) — défense en profondeur, Traefik protège aussi `/token` password grant |
| Une Edge preview avec HMAC vérifié en fonction | Mode `publishable` + RPC serveur `SECURITY DEFINER` qui fait la comparaison HMAC en base | Le gabarit existant (`household-invite`) fait la comparaison **en base** à temps constant (`private.token_hash_matches`, 0006) — reprendre ce mécanisme pour la preview, la fonction Edge ne compare rien en JS |

## Package Legitimacy Audit

> Aucun package externe nouveau n'est installé par cette phase (aucune dépendance UI ni lib ajoutée ; Edge = runtime épinglé existant ; Traefik/GoTrue = images de stack existantes).

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Étranger (sans session)
   │  GET /foyer/rejoindre?token=…        [route DÉ-TRACÉE de RequireAuth]
   ▼
join-household-page (pré-écran D-18)
   │  POST /functions/v1/household-invite-preview {token}
   │      (Edge dédiée D-01, mode publishable, rate-limit applicatif D-04,
   │       HMAC comparé en base, use_count JAMAIS touché — D-05)
   ▼
   ├─ token valide → { householdName, inviterFirstName? } (D-02)
   │      │  copie token → sessionStorage (D-06)
   │      ▼
   │  « Continuer vers l'inscription » → sign-in (mode inscription)
   │      │  supabase.auth.signUp → email de confirmation
   │      │      FROM contact@jeremymaillot.fr (alias Gmail, D-10)
   │      │      transport SMTP: stack .env SMTP_* → smtp.gmail.com:587
   │      │      redirect GÉNÉRIQUE vers SITE_URL (D-07 — token jamais dans le mail)
   │      ▼
   │  confirmation cliquée → retour app → sessionStorage réinjecte le token
   │      ▼
   │  pré-écran re-affiché + « Rejoindre le foyer » (D-08, consentement)
   │      ▼
   │  POST household-invite {action: redeem} → RPC transactionnel → foyer
   │      └─ invalide/expiré/épuisé → messages D-17 distincts → état normal (D-09)
   │
   └─ token mort → réponse UNIFORME (même code, même message) (D-03)

Admin (connecté)
   └─ invitations-panel enrichi (D-14) : création 30 j/10 pré-remplie,
      liste anonymisée des tokens actifs (D-15), révocation individuelle
      par modale (D-16) + révocation globale conservée

Abus (étranger ou bot)
   ├─ /auth/v1/signup → router Traefik dédié (PathPrefix) + middleware
   │      rateLimit signup: average=3, period=1m, burst=6 → 429 à la 4ᵉ
   ├─ /auth/v1/token  → idem: average=10, burst=20 → 429 à la 11ᵉ
   └─ GoTrue applicatif: GOTRUE_RATE_LIMIT_EMAIL_SENT (burst) → 429

Portes OUV-07 (opérateur, prod)
   ├─ exercice restauration (runbook EXPLOITATION.md, Compose isolé eo-restore)
   ├─ sh scripts/test-dispatch-push.sh → ≥ 1 "delivered"
   └─ captures boîte de réception Gmail + Outlook datées → 31-UAT.md
```

### Recommended Project Structure (delta)

```
supabase/migrations/0176_*.sql        # tokens jetables + expiration obligatoire + modèle liste
supabase/functions/household-invite-preview/index.ts   # Edge dédiée (D-01)
supabase/functions/household-invite/index.ts           # actions create/summary/revoke enrichies
app/src/modules/landing/join-household-page.tsx         # pré-écran (page, pas composant)
app/src/lib/invites.ts                                  # liste + révocation individuelle + sessionStorage
app/src/modules/parametres/components/invitations-panel.tsx  # enrichi
app/src/modules/landing/legal-page.tsx                  # /mentions-legales (gabarit terms-page)
supabase-project/docker-compose.traefik.yml             # routers dédiés + middlewares rateLimit
.env (stack, non versionné)                             # SMTP_*, GOTRUE_RATE_LIMIT_*
```

### Pattern 1: Routers Traefik par route exacte avec priorité

Le router existant `eo-api-rtr` route `Host(api.votredomaine.fr)` entier vers `api-gw`. Les middlewares ne peuvent pas s'attacher « à un chemin » d'un router existant : créer **deux routers dédiés** avec une règle plus spécifique et une priorité supérieure, qui passent par les middlewares, plus le router général sans middleware pour le reste :

```yaml
# supabase-project/docker-compose.traefik.yml — section api-gw (labels)
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.eo-api-rtr.rule=Host(`api.votredomaine.fr`)"
  - "traefik.http.routers.eo-api-rtr.priority=100"          # priorité par défaut, route générale
  - "traefik.http.services.eo-api-svc.loadbalancer.server.port=8000"
  - "traefik.docker.network=frontend"
  # Router signup : plus spécifique → priorité supérieure
  - "traefik.http.routers.eo-api-signup-rtr.rule=Host(`api.votredomaine.fr`) && PathPrefix(`/auth/v1/signup`)"
  - "traefik.http.routers.eo-api-signup-rtr.priority=200"
  - "traefik.http.routers.eo-api-signup-rtr.middlewares=eo-signup-rl"
  - "traefik.http.routers.eo-api-signup-rtr.service=eo-api-svc"
  - "traefik.http.middlewares.eo-signup-rl.ratelimit.average=3"
  - "traefik.http.middlewares.eo-signup-rl.ratelimit.period=1m"
  - "traefik.http.middlewares.eo-signup-rl.ratelimit.burst=6"
  # Router token : average=10, burst=20
  - "traefik.http.routers.eo-api-token-rtr.rule=Host(`api.votredomaine.fr`) && PathPrefix(`/auth/v1/token`)"
  - "traefik.http.routers.eo-api-token-rtr.priority=200"
  - "traefik.http.routers.eo-api-token-rtr.middlewares=eo-token-rl"
  - "traefik.http.routers.eo-api-token-rtr.service=eo-api-svc"
  - "traefik.http.middlewares.eo-token-rl.ratelimit.average=10"
  - "traefik.http.middlewares.eo-token-rl.ratelimit.period=1m"
  - "traefik.http.middlewares.eo-token-rl.ratelimit.burst=20"
```
[VERIFIED: syntaxe average/period/burst + labels Docker — Context7 /traefik/traefik docs ratelimit.md ; sémantique = rate = average/period, burst en plus]  ⚠️ Les valeurs `priority=` explicites sont une **pratique de sûreté** : Traefik calcule la priorité par longueur de règle, mais l'expliciter évite toute surprise [ASSUMED: comportement de priorité par longueur — stable mais à vérifier au test 429, qui est la vraie preuve].

### Pattern 2: Edge preview = gabarit household-invite, comparaison HMAC en base

L'Edge preview reprend : `withSupabase({ auth: ['publishable'] })` (ou `none` + vérification interne — discretion D-01), rate-limit applicatif en mémoire (même mécanique que [VERIFIED: supabase/functions/household-invite/index.ts:211-243 — `WINDOW_MS = 60_000`, `LIMITS: Record<string, number> = { redeem: 8, create: 20, revoke: 20, summary: 30 }`, compteur par IP/action, purge opportuniste]), un RPC serveur `SECURITY DEFINER` qui fait `private.token_hash_matches` (comparaison à temps constant sous verrou de ligne) et renvoie **uniquement** `household_name` + prénom inviteur. Aucune écriture sur la ligne du token (D-05, test négatif).

### Pattern 3: Traversée du token (D-06/D-07/D-08)

- À l'arrivée sur `/foyer/rejoindre?token=…` sans session : `sessionStorage.setItem(<clé>, token)` avant de naviguer vers l'inscription.
- Le mail de confirmation redirige génériquement vers `SITE_URL` — ne PAS toucher `MAILER_URLPATHS_CONFIRMATION` pour y passer le token [D-07 ; les paths existent dans le snapshot [VERIFIED: supabase-project/.env.example:178]].
- Au retour (n'importe quelle route publique de l'app), un effet réinjecte le token depuis sessionStorage vers le pré-écran ; nettoyage après application ou abandon (discretion).
- Après connexion avec token en attente : afficher le pré-écran + bouton « Rejoindre » — jamais de redeem silencieux.

### Anti-Patterns to Avoid
- **Poser `GOTRUE_RATE_LIMIT_EMAIL_SENT=30` (nombre simple) puis tester « 4 inscriptions en 1 minute »** : 30 = quota horaire à intervalle fixe, la 4ᵉ requête passera et la preuve échouera — utiliser la forme burst `N/durée` ou tester sur l'heure.
- **Attacher le middleware rateLimit au router `Host(api…)` général** : tout l'API serait limité.
- **Renvoyer le motif exact (inconnu/expiré/épuisé) depuis l'Edge preview** : c'est l'anti-énumération D-03, la distinction ne vit que côté redeem authentifié.
- **Mettre le token dans la redirect URL du mail de confirmation** : le token atterrirait dans les logs du MTA (D-07).
- **Modifier la migration 0002/0006** : migration corrective vers l'avant uniquement (AGENTS §2.7 A).
- **Stocker le token brut en base ou dans la liste admin** : HMAC only (D-15, §2.5).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate-limit applicatif de la preview Edge | Un compteur à part | Le gabarit `enforceRateLimit` de `household-invite` (D-04) | Éprouvé, purge, format clé identique |
| Comparaison HMAC de token | Une comparaison JS dans l'Edge | RPC `SECURITY DEFINER` + `private.token_hash_matches` en base | Timing-safe + verrou de ligne + un seul point de comparaison (0006) |
| Preuve de réception SMTP | Un script « qui envoie » | Une **inscription réelle de prod** + capture boîte de réception (D-11) | Seul le chemin complet GoTrue → Gmail → destinataire fait preuve |
| Preuve push | Un endpoint factice | `scripts/test-dispatch-push.sh` tel quel | Le script refuse lui-même un endpoint factice (`dropped` ≠ `delivered`) — §2.7 |
| Exercice de restauration | Restauration « vite fait » sur la prod | Runbook `docs/EXPLOITATION.md:99-253` (Compose isolé `eo-restore`, pg_cron coupé avant démarrage) | Porte OUV-07 ; cron `eo-push-dispatch` enverrait des push réelles depuis le clone sinon |
| Composants UI | Nouvelles primitives | Inventory 31-UI-SPEC (Button, Field, Input, ConfirmDialog, QrCode, Toast, EmptyState, Skeleton, Icon) | Contrat approuvé |

## Runtime State Inventory

> Phase à cheval infra/état runtime — volet « ouverture aux étrangers », pas un rename.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `household_invite_tokens` existants en prod (HMAC only) — la migration « jetables » les invalide ; `expires_at` actuellement NULL sur certains | Migration : `is_active = false` (ou suppression) sur tous les actifs + politique d'expiration obligatoire. Décision « jetables », sans cérémonie |
| Live service config | `.env` de prod de la stack (non versionné) : `SMTP_*` (actuellement `supabase-mail:2500`), `SITE_URL`, secrets ; compte Gmail : mot de passe d'application + alias « Envoyer en tant que » `contact@jeremymaillot.fr` à créer côté Google Console/Gmail | Modifier `.env` + `recreate` du service `auth` (le recreate est obligatoire : le service lit `SMTP_*` à sa [ré]initialisation — docs/DEPLOIEMENT-PROD.md:82-83) ; config Gmail manuelle opérateur |
| OS-registered state | Cron root de l'hôte : `backup.sh` (02:15) + checks phase 28 ; runbook de restauration `supabase-project-restore/` créé à la volée | Exercice réel à jouer et dater (RTO) — créations/notations, rien à modifier |
| Secrets/env vars | `INVITE_TOKEN_HMAC_SECRET` (inchangé), mot de passe d'application Gmail (fichier 600/`.env`, jamais argv), `VAPID` push | Aucun renouvellement prévu ; le SMTP_USER/PASS Gmail change de valeurs dans le `.env` de stack (noms inchangés) |
| Build artifacts | `volumes/functions` (Edge déployées via `scripts/deploy-functions.sh`) | Re-déployer après ajout de `household-invite-preview` + modifications de `household-invite` |

## Common Pitfalls

### Pitfall 1: Le test 429 GoTrue rate avec le mauvais format de valeur
**What goes wrong:** `GOTRUE_RATE_LIMIT_EMAIL_SENT=30` est interprété comme *30 par heure, intervalle fixe* [VERIFIED: Context7 /supabase/auth — internal/ratelimit/interval.go : compteur réinitialisé par bornes d'intervalle, pas fenêtre glissante].
**Why:** le type `Rate` accepte deux formes (`"30"` → intervalle horaire ; `"N/durée"` → burst).
**How to avoid:** poser la forme burst (ex. `6/1m`) si l'on veut un test minute-lisible ; consigner la sémantique choisie dans le SUMMARY (D-12).
**Warning signs:** la 4ᵉ inscription de la minute reçoit 200.

### Pitfall 2: Le middleware Traefik 429 ne se déclenche pas
**What goes wrong:** middleware défini mais jamais instancié (router non branché au service, priorité inférieure au router général, réseau manquant).
**Why:** un middleware sans router qui l'utilise n'existe pas ; `api-gw` a déjà un router.
**How to avoid:** routers dédiés avec `PathPrefix` + priorité supérieure + `service=eo-api-svc` explicites ; test curl en rafale avec relevé des codes (3e passe / 4e 429, 10e passe / 11e 429).
**Warning signs:** curl répété renvoie toujours 200/401 et jamais 429.

### Pitfall 3: Livrabilité Outlook avec un alias externe via Gmail
**What goes wrong:** l'email part de gmail.com avec `From: contact@jeremymaillot.fr` ; Outlook peut le classer indésirable si le domaine n'annonce pas Google comme expéditeur légitime, ou afficher « via gmail.com ».
**Why:** Gmail « Send mail as » sans serveur SMTP dédié pour l'alias → envoi via les serveurs Google, DKIM `d=gmail.com`.
**How to avoid:** (a) créer l'alias « Envoyer en tant que » **avec** les coordonnées SMTP du domaine si disponible, sinon « Traiter comme un alias : oui » et assumer l'envoi Google ; (b) vérifier l'enregistrement **SPF de jeremymaillot.fr inclut `_spf.google.com`** (absence = rejet probable côté Outlook) ; (c) jouer la preuve D-11 tôt dans la phase, pas à la fin — si Outlook met en spam, il reste du temps pour corriger.
**Warning signs:** capture Outlook ≠ boîte de réception principale.
**Provenance:** comportement de délivrabilité Gmail/Outlook = [ASSUMED] (connaissance générale délivrabilité ; non vérifiable sans envoi réel) — c'est précisément pourquoi la preuve D-11 existe.

### Pitfall 4: Le pré-écran reste inaccessible aux étrangers
**What goes wrong:** la page est montée mais `RequireAuth` renvoie `Navigate to /connexion` avant rendu.
**Why:** la route `/foyer/rejoindre` est DANS `RequireAuth` aujourd'hui [VERIFIED: router.tsx:219-226].
**How to avoid:** sortir la route du garde auth ; conserver le `state.from` (la préservation du token pré-auth existe déjà [VERIFIED: router.tsx:25-33 + router.test.tsx:170-209]) ; étendre ces tests.
**Warning signs:** un navigateur privé redirigé vers /connexion dès l'arrivée.

### Pitfall 5: La migration « liste de tokens » casse le modèle « un seul actif »
**What goes wrong:** créer un 2ᵉ token invalide le 1er (comportement actuel codé dans la fonction), la liste n'affiche jamais plus d'une ligne.
**How to avoid:** la migration réécrit `create_household_invite_token` (via CREATE OR REPLACE dans une migration neuve) pour ne plus invalider les prédécesseurs, ajoute `revoke_household_invite_token(p_actor_id, p_household_id, p_token_id)`, et transforme `summary` en liste. Attention : `lib/invites.ts` (`isRecallValid` matche un seul token via createdAt) et le toast « Le précédent est invalidé » doivent suivre.
**Warning signs:** la liste admin n'affiche qu'une ligne ; un second lien partagé tue le premier.

### Pitfall 6: max_uses « entre 1 et 100 » déjà contraint, mais expiration plafonnée à 90 jours
**What goes wrong:** l'UI propose une expiration à plus de 90 jours, la base la clampe silencieusement (`least(p_expires_at, now() + interval '90 days')` [VERIFIED: 0006_security_helpers.sql:294]).
**How to avoid:** contrainte affichée côté client OU choix de clamper explicitement avec message ; défaut 30 j conforme.
**Warning signs:** « Expire le » affiché ≠ expiration réellement stockée.

### Pitfall 7: Le service `auth` ne prend pas les variables sans recreate
**What goes wrong:** `.env` modifié mais GoTrue garde les anciennes limites/SMTP.
**How to avoid:** `sh run.sh recreate auth` après toute modification du bloc env (docs/DEPLOIEMENT-PROD.md:82 : le `recreate` est obligatoire, le service lit `SMTP_*` au démarrage).
**Warning signs:** 429 jamais observé, FROM inchangé.

### Pitfall 8: Le clone de restauration envoie des push réelles
**How to avoid:** désactiver pg_cron **avant** le démarrage complet du clone (runbook, Pitfall 3 phase 28). Porte : échec ou RTO > 4 h ⇒ phase bloquée.

## Code Examples

### Variables GoTrue à poser dans le `.env` de la stack (source officielle)

```dotenv
# Source : github.com/supabase/auth — _autodocs/configuration.md + README (Context7 /supabase/auth)
# Format Rate : "30" = 30/heure (intervalle fixe) ; "6/1m" = burst 6 par minute (conf/rate.go Decode)
GOTRUE_RATE_LIMIT_EMAIL_SENT=6/1m      # /signup, /invite, /magiclink, /recover, /otp, /user
GOTRUE_RATE_LIMIT_TOKEN_REFRESH=150
GOTRUE_RATE_LIMIT_VERIFY=30            # /verify — cliqué à chaque confirmation email
GOTRUE_RATE_LIMIT_OTP=30
GOTRUE_RATE_LIMIT_ANONYMOUS_USERS=30
# (valeurs exactes à trancher au plan ; le format burst est requis pour la preuve 429 minute-lisible)
```
[VERIFIED: noms de variables + défauts + sémantique — Context7 /supabase/auth ; les noms sont préfixés `GOTRUE_` dans la stack auto-hébergée, cf. bloc existant `GOTRUE_SMTP_*` [VERIFIED: supabase-project/docker-compose.yml:164-170]]

### Transport SMTP GoTrue via Gmail (D-10)

```dotenv
# .env de la stack (non versionné) — consommé par le service auth (docker-compose.yml:165-170)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=jeremymaillot@gmail.com          # + mot de passe d'application (SMTP_PASS)
SMTP_SENDER_NAME=Ensemble & Organisés
```
Côté Gmail : valider en 2 étapes + mot de passe d'application [VERIFIED: docs/DEPLOIEMENT-PROD.md:253-256] ; ajouter `contact@jeremymaillot.fr` comme « Envoyer en tant que » (détail de configuration Gmail = manuel opérateur). ⚠️ **Conflit potentiel à arbitrer au plan :** les scripts d'exploitation hôtes utilisent le MÊME compte Gmail avec msmtp (D-13 révisée) — aucune collision de secret prévisible (`.env` de stack vs `/etc/msmtprc`), mais les deux usages dépendent du même mot de passe d'application ; le documenter dans le SUMMARY. Le FROM de l'email de confirmation GoTrue est `SMTP_SENDER_NAME <SMTP_ADMIN_EMAIL>` par défaut GoTrue — vérifier au plan que `SMTP_ADMIN_EMAIL=contact@jeremymaillot.fr` est la bonne variable pour le FROM (l'adresse admin sert d'expéditeur dans le gabarit mailer GoTrue [ASSUMED: mapping exact FROM = SMTP_ADMIN_EMAIL — vérifier sur le premier email reçu, preuve D-11 de toute façon]).

### Edge preview — squelette (gabarit existant)

```typescript
// supabase/functions/household-invite-preview/index.ts — reprend le gabarit household-invite
Deno.serve(
  withSupabase({ auth: ['publishable'] }, async (request, ctx) => {
    // 1. Zod : { token: min(22).max(512).regex(/^[A-Za-z0-9_-]+$/) }  (même règle que redeem)
    // 2. enforceRateLimit(request, 'preview')  — LIMITS['preview'] = <seuil, discretion D-04>
    // 3. rpc('preview_household_invite_token', { p_token_hash })  → SECURITY DEFINER,
    //    compare via private.token_hash_matches, lit household.name + created_by→profiles.display_name
    // 4. JAMAIS d'update sur household_invite_tokens (D-05, test négatif)
    // 5. Réponse : 200 { householdName, inviterFirstName? } | 404 uniforme { error: '…générique…' } (D-03)
  }),
);
```
[Gabarits vérifiés : supabase/functions/household-invite/index.ts (68 withSupabase, 118-152 Zod, 144-151 token rule, 211-243 rate-limit) ; comparaison base : 0006 `private.token_hash_matches`]

### Migration modèle liste — cibles à réécrire

```sql
-- 0176_xxx.sql (nouvelle migration, JAMAIS d'édition de 0002/0006)
-- 1. Jetables : update public.household_invite_tokens set is_active = false;  (tous)
-- 2. Expiration obligatoire : create/recreate create_household_invite_token
--    sans le bloc d'invalidation des prédécesseurs (0006:297-301), expires_at NOT-NULL-by-construction
-- 3. revoke_household_invite_token(p_actor_id uuid, p_household_id text, p_token_id text)
--    assert_household_admin + update ciblé is_active = false where id = p_token_id and household_id = …
-- 4. household_invite_tokens_list(p_actor_id, p_household_id) → ensemble anonymisé
--    (id, created_at, expires_at, max_uses, use_count, is_active — JAMAIS token_hash ? oui jamais le brut ; le hash n'est pas un secret mais ne sert à rien à l'UI)
```
Schéma actuel cité pour référence [VERIFIED: supabase/migrations/0002_tables_identity.sql:67-79] :
```sql
create table public.household_invite_tokens (
  id text primary key default private.new_id('invite'),
  household_id text not null references public.households (id) on delete cascade,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz,
  max_uses integer not null default 10 check (max_uses between 1 and 100),
  use_count integer not null default 0 check (use_count >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint household_invite_tokens_hash_key unique (token_hash),
  constraint household_invite_tokens_uses_check check (use_count <= max_uses)
);
```
Note : `max_uses` porte déjà `check (max_uses between 1 and 100)` et la fonction clampe `least(greatest(coalesce(p_max_uses,10),1),100)` [VERIFIED: 0006_security_helpers.sql:288] — le refus serveur de `max_uses < 1` existe déjà en base ; le delta est côté UI (validation) et expiration (aujourd'hui optionnelle, plafonnée 90 j).

### Messages redeem — déjà distincts côté serveur

L'Edge `household-invite` traduit déjà les motifs PostgreSQL en erreurs distinctes [VERIFIED: supabase/functions/household-invite/index.ts:306-311] : « Ce token est introuvable. » (404) / « Ce token a été révoqué. » (410) / « Ce token est expiré. » (410) / « Ce token a atteint son nombre d'utilisations maximal. » (410). Le verbatim D-17 (« Ce lien est invalide. » / « Ce lien a expiré. Demandez-en un nouveau à l'administrateur. » / « Ce lien a atteint sa limite d'utilisations. ») se pose côté client sur la traduction de ces réponses — pas de changement serveur requis pour D-17.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ROADMAP Phase 31 : MTA Stalwart + SPF/DKIM/DMARC | Relais Gmail existant (OUV-01 reformulée) | Tour 1 discuss (2026-11-03) | Aucun MTA à déployer ; le travail devient transport + preuve |
| Un seul token actif par foyer | Liste de tokens actifs, révocation individuelle | Cette phase (D-14/D-15/D-16) | Migration SQL + Edge + client + UI |
| SMTP stack interne `supabase-mail` (Stalwart) | smtp.gmail.com:587 via `.env` de stack | Cette phase (D-10) | Recreate du service auth obligatoire |
| Test statique SQL : 7 contrôles | 8 contrôles (CTE récursif, dollar-quote nommé… sur 0005/0138) | 2026-10-22 (AGENTS §2.7 B) | Les nouveaux SQL passent par `check-sql-statique.py` + ses propres tests |

**Drift note (demandée par le precheck) :** ROADMAP.md:218 décrit encore Stalwart/SPF/DKIM/DMARC — ce texte est **dépassé** et la réforme d'OUV-01 est explicitement un livrable de la phase (SPEC in-scope : « Révision de la ROADMAP : OUV-01 reformulée »). REQUIREMENTS.md:51 porte la formulation Stalwart originale. **Aucun conflit de fond** : 31-CONTEXT.md et 31-SPEC.md (hors-périmètre « Stalwart, SPF/DKIM/DMARC ») sont cohérents entre eux et postérieurs ; le planner doit simplement planifier la révision des deux documents. UI-SPEC et CONTEXT/SPEC sont alignés (aucun écart de copie constaté).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Gmail « Send mail as » externe (contact@jeremymaillot.fr) passe par les serveurs Google et peut déclencher du classement spam côté Outlook si le SPF du domaine n'inclut pas Google | Pitfall 3 | Preuve OUV-01 en échec → corriger SPF ou config alias SMTP avant la capture |
| A2 | Le FROM GoTrue est piloté par `SMTP_ADMIN_EMAIL` (pas une variable FROM dédiée) | Code Examples / SMTP | FROM affiché ≠ contact@… → Prohibition ② violée, à corriger avant la preuve D-11 |
| A3 | Priorité explicite des routers Traefik nécessaire/utile pour que les routers PathPrefix gagnent | Pattern 1 | 429 jamais déclenché → le test curl le révèle immédiatement |
| A4 | Le service `auth` transmet les variables d'environnement natives `GOTRUE_*` sans passthrough compose additionnel (envconfig lit l'environnement du conteneur) | Standard Stack | Variables ignorées → ajouter des entrées au bloc env du service auth ; test 429 le révèle |
| A5 | Défaillance possible du second foyer : `redeem` pour un utilisateur déjà membre d'un foyer n'est pas re-spécifié (comportement existant conservé) | — | Comportement surprenant, non bloquant (à constater en UAT) |

## Open Questions (RESOLVED — au plan, 2026-11-03)

1. **Quel format de `GOTRUE_RATE_LIMIT_EMAIL_SENT` choisir pour la preuve ?** (RESOLVED → 31-06 Task 1)
   - What we know: le quota `/signup` email est horaire par défaut ; la SPEC exige une rafale 429 prouvée ; format burst `N/durée` supporté [VERIFIED: rate.go Decode].
   - **Résolution :** le plan 31-06 Task 1 pose `GOTRUE_RATE_LIMIT_EMAIL_SENT=6/1m` (format burst, pas le quota horaire), cite la source (configuration.md + rate.go Decode) dans le SUMMARY (D-12), preuve 429 en rafale dans 31-06 Task 2.
2. **`/auth/v1/token` limite aussi les refresh tokens** — 10/min/IP peut-il toucher les utilisateurs légitimes (TanStack Query multi-onglets) ? (RESOLVED → 31-05 Task 2/3)
   - What we know: seuil « très strict » assumé par l'éditeur (SPEC constraints).
   - **Résolution :** seuil verrouillé 10/min rafale 20 dans 31-05 Task 2 (les seuils ne sont pas « arrangés ») ; l'arbitrage est tracé comme menace acceptée T-31-12 (31-05) et mesuré en UAT (SPEC, tour 3).
3. **SPF actuel de jeremymaillot.fr** (inclut-il `_spf.google.com` ?) (RESOLVED → 31-06 Task 2)
   - **Résolution :** vérification opérateur au moment de la preuve SMTP (31-06 Task 2, étape 2 / A1) : si Outlook classe en indésirable, vérifier/ajouter `_spf.google.com` au SPF puis rejouer — consigné dans le must_have « deux relevés datés » de 31-06.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker + Compose ≥ 2.24.4 | migrations, tests db, restore | ✓ (stack en prod) | stack épinglée self-hosted/v0.8.2 | — |
| msmtp + mot de passe d'application Gmail | transport ops (déjà prouvé 2026-10-29) | ✓ | — | mode conteneur jetable |
| Compte Gmail avec app password + alias Send-as | FROM D-10 | partiel (app password oui ; alias contact@ à créer) | — | manuel opérateur |
| Appareil réel abonné au push (prod) | preuve `delivered` | ✗ à ce jour (0 abonnement, STATE.md:205) | — | **aucun — bloque OUV-07 ; nécessite un appareil physique de l'éditeur** |
| Comptes Outlook réels | preuve OUV-01 | à obtenir de l'opérateur | — | aucun — capture exigée |

**Missing dependencies with no fallback:**
- Appareil abonné réel pour `test-dispatch-push.sh` (porte OUV-07) — à prévoir par l'opérateur avant l'exécution de la phase.
- Compte Outlook réel pour la capture (OUV-01).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5 + React Testing Library (composants), Playwright (e2e), scripts SQL testkit (test-db.sh) |
| Config file | `app/vitest.config.*` (existant), `playwright.config.*` (existant) |
| Quick run command | `cd app && npm test` |
| Full suite command | `cd app && npm run typecheck && npm test && npm run build && npm run test:e2e && python3 scripts/check-sql-statique.py && python3 scripts/test-check-sql-statique.py` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OUV-01 | Confirmation email reçue en boîte Gmail + Outlook | manual (capture datée → 31-UAT.md) | — | n/a |
| OUV-02 | Inscription non confirmée ne se connecte pas ; rafale → 429 | manual + e2e partiel | rafale curl (consignée) ; e2e signup existant | e2e existant |
| OUV-03 | 4ᵉ signup/min → 429, 3ᵉ passe ; 11ᵉ token/min → 429 | manual (curl en rafale, consigné) | curl loop | — |
| OUV-04 | Pré-écran pré-auth, traversée, token mort uniforme | unit + integration | `cd app && npm test -- router.test join-household-page.test` | ✅ à étendre (router.test.tsx:170-209, join-household-page.test.tsx) |
| OUV-05 | D-05 no-consume (test négatif use_count), refus valeurs invalides, jetables, messages D-17 | SQL + unit | `sh scripts/test-db.sh` (fichier nouveau 0176) + `npm test -- invitations-panel` | ❌ Wave 0 |
| OUV-06 | `/mentions-legales` 200 sans session | unit/e2e | test route publique (gabarit terms-page.test si existant) | ❌ Wave 0 |
| OUV-07 | RTO mesuré ≥ cible 4 h ; push `delivered` ≥ 1 | manual opérateur | `sh scripts/test-dispatch-push.sh` ; runbook EXPLOITATION.md | script ✅ existant |

### Sampling Rate
- **Per task commit:** `cd app && npm test` (+ typecheck pour les tâches TS)
- **Per wave merge:** chaîne §2.7 complète
- **Phase gate:** chaîne verte + test-db.sh (migration SQL) + preuves opérateur consignées avant `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `supabase/tests/0176_*.sql` — tokens jetables, expiration obligatoire, révocation individuelle, no-consume preview (REQ OUV-05, D-05)
- [ ] `app/src/modules/landing/join-household-page.test.tsx` — extension pré-écran (token mort uniforme, deux CTA, sessionStorage)
- [ ] `app/src/app/router.test.tsx` — route `/foyer/rejoindre` hors RequireAuth + préservation conservée
- [ ] Test unitaire `invitations-panel` — liste, révocation individuelle, refus valeurs invalides

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | GoTrue (email confirm obligatoire), rate-limit applicatif + Traefik anti brute-force signup |
| V3 Session Management | no (inchangé) | GoTrue JWT existant |
| V4 Access Control | yes (inchangé) | RLS sans politique sur `household_invite_tokens` ; `SECURITY DEFINER` + assert admin ; Edge modes déclarés |
| V5 Input Validation | yes | Zod côté Edge (gabarit 118-152), validation client Zod (gabarit join-household-page) |
| V6 Cryptography | yes (inchangé) | HMAC-SHA-256 serveur, comparaison timing-safe en base — jamais hand-rolled |
| V7/V9 (logs/headers) | no | headers gérés par nginx/Traefik existants |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Énumération de foyers par tokens | Information Disclosure | D-03 : réponse uniforme de la preview ; D-02 : réponse minimale ; rate-limit applicatif D-04 |
| Rafale d'inscriptions / spam SMTP | DoS / Spoofing | Traefik rateLimit par route + `GOTRUE_RATE_LIMIT_EMAIL_SENT` (burst) |
| Token fuité dans le mail / les logs MTA | Information Disclosure | D-07 : redirect générique, token uniquement en sessionStorage client |
| FROM spoofé / adresse brute exposée | Spoofing | Prohibition ② : alias contact@ uniquement ; constat sur les emails reçus |
| Épuisement du quota de tokens par consultation | DoS | D-05 : no-consume prouvé par test négatif (lecture seule) |
| Consume-after-migration | Tampering | Migration jetables dans une transaction avec ON_ERROR_STOP (§2.7, migrate.sh) |

## Sources

### Primary (HIGH confidence)
- Context7 `/supabase/auth` — `_autodocs/configuration.md` (GlobalConfiguration, Rate fields + defaults, MailerConfiguration), README (sémantique GOTRUE_RATE_LIMIT_EMAIL_SENT), internal/conf/rate.go (Decode « 30 » vs « 100/5m »), internal/ratelimit/interval.go (intervalle fixe)
- Context7 `/traefik/traefik` — docs ratelimit.md (labels Docker average/period/burst), pkg/config/dynamic/middlewares.go (défauts burst=1, period=1s, SourceCriterion)
- In-repo (ouverte ce session, citées avec lignes) : supabase/functions/household-invite/index.ts ; supabase/migrations/0002_tables_identity.sql:59-81 ; supabase/migrations/0006_security_helpers.sql:288-345 ; app/src/app/router.tsx:25-33,215-226 ; app/src/lib/invites.ts ; app/src/modules/parametres/components/invitations-panel.tsx ; app/src/modules/landing/join-household-page.tsx ; supabase-project/docker-compose.yml:164-170 ; supabase-project/.env.example:171-267 ; docs/DEPLOIEMENT-PROD.md:187-307 ; docs/EXPLOITATION.md:99-140

### Secondary (MEDIUM confidence)
- 31-SPEC.md, 31-CONTEXT.md, 31-UI-SPEC.md (artefacts de phase approuvés)
- .planning/STATE.md, .planning/REQUIREMENTS.md, .planning/ROADMAP.md

### Tertiary (LOW confidence)
- Comportements délivrabilité Gmail/Outlook (A1), mapping FROM GoTrue = SMTP_ADMIN_EMAIL (A2), priorités Traefik explicites (A3) — à confirmer par les preuves réelles de la phase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — variables GoTrue et middleware Traefik vérifiés aux sources officielles ; aucune dépendance nouvelle
- Architecture: HIGH — le changement de modèle token (un-actif → liste) est documenté par le code lui-même
- Pitfalls: MEDIUM — les pitfalls applicatifs sont prouvés par le code ; les risques délivrabilité email restent empiriques (d'où la preuve D-11)

**Research date:** 2026-11-03
**Valid until:** ~2026-12-03 (stable : snapshot épinglé, pas de lib nouvelle)
