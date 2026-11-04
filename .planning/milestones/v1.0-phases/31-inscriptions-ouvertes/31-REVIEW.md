---
phase: 31-inscriptions-ouvertes
reviewed: 2026-11-03T12:30:00Z
depth: deep
files_reviewed: 14
files_reviewed_list:
  - supabase/migrations/0176_token_list_governance.sql
  - supabase/tests/0176_token_list_governance.test.sql
  - supabase/tests/0003_invites.sql
  - supabase/functions/household-invite-preview/index.ts
  - supabase/functions/household-invite/index.ts
  - supabase-project/docker-compose.traefik.yml
  - app/src/lib/invites.ts
  - app/src/lib/invites.test.ts
  - app/src/modules/landing/join-household-page.tsx
  - app/src/modules/landing/join-household-page.test.tsx
  - app/src/modules/landing/legal-page.tsx
  - app/src/modules/landing/privacy-page.tsx
  - app/src/modules/landing/terms-page.tsx
  - app/src/modules/landing/sign-in-page.tsx
  - app/src/modules/parametres/components/invitations-panel.tsx
  - app/src/modules/parametres/components/invitations-panel.test.tsx
  - app/src/modules/parametres/api.ts
  - app/src/app/router.tsx
  - app/src/app/route-preload.ts
  - app/src/types/index.ts
findings:
  critical: 1
  major: 3
  minor: 5
  nit: 4
status: issues_found
---

# Phase 31 : Code Review Report

**Reviewed:** 2026-11-03
**Depth:** deep (cross-file : migration → Edge → lib → UI)
**Files Reviewed:** 20 (liste frontmatter, 14 sources + tests)
**Status:** issues_found

## Summary

La phase 31 est structurellement solide : la migration 0176 respecte la discipline search_path vide (§2.7 A.3), le RPC preview est une lecture pure prouvée par test négatif, l'empreinte HMAC ne quitte jamais la base, le token brut ne transite ni dans les logs ni dans les réponses, la traversée pré-auth vit en sessionStorage conformément à D-06/D-07, et les pages légales sont rendues en texte pur (aucun `dangerouslySetInnerHTML`). Les tests SQL 0176 portent des assertions négatives bornées et un second prouveur zéro-écriture.

Le défaut dominant est **une UI qui affirme une invalidation qui n'existe plus** : la migration 0176 a supprimé le bloc d'invalidation des prédécesseurs (modèle liste D-14), mais le toast du panneau ET le texte du pré-écran affirment encore que « le précédent est invalidé ». Un administrateur croit avoir coupé l'accès d'un lien déjà partagé alors qu'il reste actif — c'est une faille de sécurité par désinformation, pas une coquille.

Côté serveur, deux contournements de rate-limit sont prouvables : le RPC preview est exécutable par `anon` directement sur PostgREST (la limite 8/min de l'Edge ne protège que l'Edge), et la clé du compteur est le premier élément de `X-Forwarded-For`, forgable par le client. L'impact pratique est contenu (l'énumération reste cryptographiquement irréaliste, 256 bits de HMAC), d'où major et non critique.

Enfin, les plans 31-05 et 31-06 reposent sur des **attestations orales** de l'opérateur : aucun critère d'acceptation prod (429 relevés, preuves SMTP, RTO, `delivered` push) n'est consigné — la SPEC exige des relevés datés.

## Critical Issues

### CR-01 : L'UI affirme une invalidation des liens précédents que la migration 0176 a supprimée

**File:** `app/src/modules/parametres/components/invitations-panel.tsx:119` (toast), `:111` du test qui l'assert ; et `app/src/modules/landing/join-household-page.tsx:222-223` (texte public)

**Issue:** 0176 retire le bloc d'invalidation de `create_household_invite_token` (« le précédent bloc UPDATE invalidant tous les tokens actifs du foyer a DISPARU ») — c'est le fondement même du modèle liste D-14. Or :
- le toast de génération dit « Nouveau lien généré. Les liens précédents sont invalidés. » — **faux** : tous les liens actifs précédents restent utilisables ;
- le pré-écran public dit « il peut en générer un nouveau à tout moment depuis les préférences, ce qui invalide immédiatement le précédent » — **faux** aussi.

Un administrateur qui génère un nouveau lien pour « couper » un lien compromis ou trop diffusé croit la révocation faite ; le lien initial continue de fonctionner jusqu'à expiration (jusqu'à 90 jours). Le test `invitations-panel.test.tsx:111` verrouille le message faux. La révocation ne se fait plus QUE par les boutons dédiés (individuel / global).

**Fix:** remplacer le toast par un libellé vrai, ex. « Nouveau lien généré. Les liens précédents restent actifs : révoquez-les individuellement si besoin. » ; corriger le texte du pré-écran (« il peut en générer un nouveau et révoquer les anciens depuis les préférences ») ; mettre à jour l'assertion du test.

## Major Issues

### MAJ-01 : le RPC preview est exécutable par `anon` directement sur PostgREST — la rate-limit de l'Edge est contournable

**File:** `supabase/migrations/0176_token_list_governance.sql:249`

**Issue:** `grant execute on function public.preview_household_invite_token(text) to anon` rend le RPC appelable via `/rest/v1/rpc/preview_household_invite_token` avec la seule clé publiable. La prohibition de la SPEC (« le point de consultation … est rate-limité ») n'est honorée que sur le chemin Edge (`household-invite-preview`, 8/min/IP) : un appelant peut interroger le RPC en boucle sans jamais passer par l'Edge ni par Traefik (aucun middleware sur `/rest/v1/`). L'impact reste borné — la consultation exige un HMAC-SHA-256 valide (256 bits, non énumérable), le résultat ne fuit que nom de foyer + prénom — mais le point de consultation « rate-limité » promis ne l'est que sur une des deux portes.

**Fix:** accepter explicitement l'écart (documenter que la protection du RPC repose sur l'entropie du token, cf. D-03), ou intercaler une garde : par exemple renvoyer l'appel anon systématiquement côté RPC et n'autoriser que `service_role` (l'Edge passe par `supabaseAdmin`), en ajustant le test 0176 cas D qui exige `has_function_privilege('anon', …)`.

### MAJ-02 : clé de rate-limit = premier élément de `X-Forwarded-For`, forgable par le client

**File:** `supabase/functions/household-invite-preview/index.ts:155-158` (copié du gabarit `household-invite/index.ts`, même code)

**Issue:** `clientAddress` prend `x-forwarded-for.split(',')[0]`. Traefik **ajoute** l'IP réelle à un en-tête existant plutôt que de l'écraser : un client qui envoie `X-Forwarded-For: 1.2.3.4` se voit attribuer une clé de compteur arbitraire (`preview:1.2.3.4`), contournant la limite 8/min (et `redeem: 8`, `create: 20`… sur household-invite). Le verrou applicatif D-04 est donc contournable par un simple en-tête.

**Fix:** derrière Traefik, prendre le **dernier** saut ajouté par le proxy (`split(',').pop()` sur le XFF, ou lire l'IP source du socket si disponible), ou épingler dans Traefik `--entryPoints.https.forwardedHeaders.trustedips` et consommer l'élément de confiance. Corriger le gabarit une fois (§2.7 E — corriger la classe, pas l'instance : les deux Edges + tout futur gabarit).

### MAJ-03 : critères d'acceptation prod non prouvés — attestations orales seules (31-05/31-06)

**File:** `.planning/phases/31-inscriptions-ouvertes/31-05-SUMMARY.md`, `31-06-SUMMARY.md`

**Issue:** les AC de la SPEC exigent des relevés datés (4ᵉ signup → 429, 11ᵉ token → 429, boîte de réception Gmail + Outlook, RTO chiffré, ≥ 1 `delivered` push). Les summaries constatent eux-mêmes : « Les relevés 429 datés et les captures ne sont PAS consignés », « Aucune capture datée ni relevé n'est consigné ». Le dépôt est propre, mais la phase ne peut pas être déclarée validée sur « ça marche » (§2.7 F — un succès muet est un échec inexpliqué ; §2.7 I — l'affirmation d'autrui n'est pas une preuve vérifiée).

**Fix:** avant clôture de phase, consigner les preuves manquantes dans `31-UAT.md` (relevés 429 datés, en-têtes des emails reçus, RTO mesuré, sortie `test-dispatch-push.sh`) ; sinon marquer la phase `blocked`/`partial` sur OUV-01/02/03/07.

## Minor Issues

### MIN-01 : garde client `redeemInviteToken` incohérente — seuil 16, message 22

**File:** `app/src/lib/invites.ts:135-137`

**Issue:** `if (normalized.length < 16)` mais le message dit « Il fait au moins 22 caractères. » — un token de 16 à 21 caractères passe la garde client puis reçoit le refus serveur ; le message promet un seuil non appliqué. Tous les autres contrôles (Zod Edge, `tokenSchema` du pré-écran) utilisent 22.

**Fix:** `if (normalized.length < 22)`.

### MIN-02 : expiration construite en UTC arbitraire côté panneau, en heure locale côté lib

**File:** `app/src/modules/parametres/components/invitations-panel.tsx:102`

**Issue:** `createInviteToken({ expiresAt: \`${expiresOn}T23:59:00.000Z\` })` fige 23h59 **UTC**, alors que `toInstant()` (`invites.ts:52-56`) convertit en heure locale. Pour un utilisateur en UTC+2, un lien « expire le 5 » meurt le 6 à 01h59 locales ; la date affichée dans la liste (« Expire le », tronquée à la date) ne correspond pas à l'instant réel. Incohérence de classe entre les deux chemins de création.

**Fix:** passer `expiresOn` brut à `createInviteToken` et laisser `toInstant` faire la conversion unique (ou utiliser `todayIso()` + constructeur de fin de jour local) — une seule classe de conversion.

### MIN-03 : rate-limit appliqué APRÈS `parseBody` — rafale de corps invalides non limitée

**File:** `supabase/functions/household-invite-preview/index.ts:198-199` (idem `household-invite/index.ts`)

**Issue:** `enforceRateLimit` vient après le parsing Zod : une rafale de JSON invalides ou de tokens hors-format reçoit des 400 sans jamais toucher le compteur. Coût limité (pas d'HMAC ni de SQL), mais l'instrument de discrétion D-04 a un angle mort gratuit.

**Fix:** déplacer `enforceRateLimit(request, action)` avant `parseBody` (la limite par IP ne dépend pas du corps).

### MIN-04 : message 404 trompeur de `resolveHousehold`

**File:** `supabase/functions/household-invite/index.ts:203-205`

**Issue:** quand `householdId` est fourni et que l'appelant n'en est pas membre, la réponse 404 dit « Vous n'appartenez à aucun foyer. » — l'utilisateur appartient à un foyer, juste pas à celui-ci. Cosmétique côté admin uniquement (l'action exige ensuite le rôle admin en base), mais le message induit en erreur au diagnostic.

**Fix:** message distinct « Vous n'êtes pas membre de ce foyer. » quand `requested` est fourni.

### MIN-05 : `QrCode` encode le token brut, pas l'URL d'invitation

**File:** `app/src/modules/parametres/components/invitations-panel.tsx` (bloc `displayed`, `<QrCode value={displayed.token} …>`)

**Issue:** le partage copie l'URL complète `${origin}/foyer/rejoindre?token=…`, mais le QR n'encode que le token : un scan avec l'appareil photo standard donne un texte brut, pas un lien cliquable. Si volontaire (le pré-écran reconstruit ?), ce n'est documenté nulle part ; sinon, expérience cassée par rapport au bouton « Partager ».

**Fix:** encoder l'URL complète (`value={`${window.location.origin}/foyer/rejoindre?token=${encodeURIComponent(displayed.token)}`}`) ou documenter le choix.

## Nits

### NIT-01 : code mort — `inviteHeaders` et `INVITE_SECRET_HEADER`

**File:** `app/src/lib/invites.ts:15,148`

**Issue:** exporté, jamais utilisé (aucun appelant dans `app/src`, aucun lecteur du header `x-invite-token` côté Edge qui l'annonce pourtant dans CORS).

**Fix:** supprimer la constante, l'export et l'entrée CORS `x-invite-token` (ou documenter le contrat prévu).

### NIT-02 : backticks rendus tels quels dans l'UI

**File:** `app/src/modules/parametres/components/invitations-panel.tsx:311`

**Issue:** « La rotation de la clé \`INVITE_TOKEN_HMAC_SECRET\`… » affiche les backticks à l'écran — jargon technique + délimiteur markdown dans un panneau utilisateur (le panneau a par ailleurs travaillé à faire disparaître le mot « token »).

**Fix:** retirer les backticks, reformuler « la clé de signature des liens ».

### NIT-03 : router Traefik `PathPrefix` sans frontière de segment

**File:** `supabase-project/docker-compose.traefik.yml` (routers `eo-api-signup-rtr` / `eo-api-token-rtr`)

**Issue:** `PathPrefix(/auth/v1/signup)` matche aussi `/auth/v1/signupX`. Sans risque connu (aucune route sœur), mais la règle exacte de la SPEC (« par route exacte ») s'écrirait `Path(\`/auth/v1/signup\`)`.

**Fix:** remplacer par `Path(...)` ou accepter l'écart documenté.

### NIT-04 : abandon d'inscription — token en attente non purgé

**File:** `app/src/modules/landing/join-household-page.tsx` (effet `preview.phase === 'dead'`)

**Issue:** la purge D-06 ne couvre que le lien mort ; un étranger qui pose le token en sessionStorage puis abandonne l'inscription laisse le token dans la sessionStorage jusqu'à la fermeture de l'onglet. Périmètre volontaire (par onglet, jamais persistant) — à documenter plutôt qu'à corriger.

**Fix:** aucune action requise ; une phrase dans `deferred-items.md` suffit.

## Points vérifiés sans défaut (anti-laxisme, constatés explicitement)

- **search_path** : les cinq fonctions de 0176 posent `set search_path = ''` et qualifient `public.x` partout ; les colonnes de `returns table` de `household_invite_tokens_list` sont toujours préfixées `t.` (§2.7 A.5).
- **HMAC / secret** : `INVITE_TOKEN_HMAC_SECRET` lu uniquement côté Edge, jamais loggé, jamais renvoyé ; la comparaison se joue exclusivement en base (`private.token_hash_matches`) ; le brut n'est persisté nulle part côté serveur (le rappel localStorage est un choix documenté, cf. NIT-04/panneau).
- **RLS / privilèges** : create/revoke-one/list réservés à `service_role` après `revoke … from public, anon, authenticated` ; la table porte RLS sans politique ; `assert_household_admin` revérifié en base pour chaque action admin.
- **Token en sessionStorage (D-06/D-07)** : conforme — jamais dans une URL d'email (aucun `redirectTo` porteur du token dans `use-auth.ts`), jamais dans `localStorage`, accès blindés try/catch.
- **Anti-énumération (D-03)** : 404 uniforme y compris sur erreur interne Edge ; preview SQL renvoie `{}` pour les cinq motifs ; la distinction expiré/épuisé n'existe qu'au redeem authentifié.
- **XSS** : pages légales et pré-écran rendent du texte pur ; aucun `dangerouslySetInnerHTML`/`innerHTML`/`eval` dans le périmètre ; le token est `encodeURIComponent` dans l'URL de partage.
- **Traefik** : middlewares aux seuils exacts du tour 3 (3/min rafale 6, 10/min rafale 20), routers dédiés priority 200, router général intact ; `ports: !override []` conservé.
- **Tests 0176** : no-consume prouvé par assertion négative bornée (§2.7 B.2), cas qui doit échouer présents, uniformité des cinq motifs couverte.

---

_Consigne de correction prioritaire : CR-01 avant tout déploiement du panneau — le message faux est déjà versionné et testé comme vrai._

_Reviewed: 2026-11-03T12:30:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
