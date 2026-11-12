# Phase 43: Preuve prod du bridge ardoise (W1) - Research

**Researched:** 2026-11-11
**Domain:** Script sœur de preuve HTTP réelle (sh + curl -K + psql.sh) contre la stack prod déployée — Edge `ardoise-invite` / `household-invite`, RPC bridge 0180b, réconciliation 0181
**Confidence:** HIGH (code et patrons sœurs lus intégralement ce session)

## Summary

La surface bridge ardoise existe, est déployée, et son code est entièrement lisible : l'Edge `ardoise-invite` action `household-token` échange un code de partage ardoise contre un token foyer (RPC `create_household_bridge_token`, 0180b — usage unique, 15 min en dur, remplit la table pont `private.ardoise_bridge_identities`), et la redemption passe par l'Edge **`household-invite`** action **`redeem`** (RPC `redeem_household_invite_token`, 0181 — réconciliation `guest:` → `membre:` dans la même transaction). La phase ne touche **aucun code produit** : elle écrit un script sœur `scripts/test-ardoise-bridge-real.sh` frère de `test-join-token-real.sh` / `test-dispatch-push.sh`, et un document de consignation auto-rédigé `docs/BRIDGE-ARDOISE-PREUVE.md`.

Deux corrections matérielles à l'intention du planner, issues de la lecture du code ce session :

1. **Le canal de redemption de CONTEXT D-06 est erroné.** D-06 dit « Edge `ardoise-invite` action `join` » — or `ardoise-invite` `join` appelle `redeem_ardoise_invite` (code ardoise, index.ts:528), pas le RPC foyer. La redemption du token foyer passe par **Edge `household-invite`, action `redeem`** (`supabase/functions/household-invite/index.ts:449-474`), et c'est bien par là que l'app réelle appelle : `app/src/lib/invites.ts:17-35` (POST `/functions/v1/household-invite`, `apikey` + `Bearer` session, corps `{action:'redeem', token}`). L'esprit de D-06 (HTTP de bout en bout, jamais RPC PostgREST direct du RPC service_role) est **préservé et renforcé** — le canal emprunté est le canal exact de l'app réelle. Le planner doit corriger D-06 dans le plan (conserver la contrainte, corriger le nom du canal).
2. **La sonde `net._http_response` (PROOF-04) est hors sujet pour ce chemin** — ainsi que le pressentait STATE.md Todos. Le patron `test-dispatch-push.sh` s'applique aux chemins pg_cron/pg_net ; ici il n'y a **aucun pg_net sur le chemin bridge** : les Edge font leurs appels PostgREST/RPC en direct, et le seul job pg_cron voisin (`private.prune_expired_invite_tokens`, quotidien) est explicitement **hors du chemin synchrone** de redeem (0181, l.87-92 : la désactivation d'un token périmé reste au cron, mais le refus repose sur la comparaison `expires_at <= now()`). L'attribution correcte pour ce script est **la sortie curl elle-même** : méthode, statut, champs clés, estampille — chaque appel est directement observable, rien ne passe par une table intermédiaire. Le planner doit résoudre PROOF-04 dans ce sens (la discipline d'attribution reste verrouillée : un observateur relit la sortie et suit chaque appel).

**Primary recommendation:** Script sœur en sh, phases : sonde santé → comptes e2e (lib-smoke-accounts) → fixtures HTTP (foyer via RPC `create_household`, ardoise + code + guest + dépense via Edge/PostgREST) → happy path bridge (`household-token` puis `household-invite redeem`) → 4 négatifs ordonnés (dont 15 min d'attente réelle) → lecture d'état après coup `psql.sh < fichier` bornée par foyer → purge vérifiée → auto-rédaction de `docs/BRIDGE-ARDOISE-PREUVE.md`.

## User Constraints (from CONTEXT.md)

### Locked Decisions (implémentation — 43-CONTEXT §decisions)

- **D-01** : 4 négatifs (replay, forgé/muté HMAC, expiré, cross-household) ; le négatif « expiré » attend les **15 minutes réelles** ; cross-household = 2ᵉ fixture foyer.
- **D-02** : ordre des 4 négatifs **fixe, déterminé dans le script**, justifié par un commentaire français à l'endroit de l'ordre.
- **D-03** : durée ~20 min assumée (attente réelle), 2ᵉ fixture foyer assumée.
- **D-04** : composition happy path — 2 comptes e2e (payeur admin du foyer éphémère + invité), 1 ardoise, 1 dépense dont l'invité est participant `invite:` via `guest_ticket` (redeem-guest anonyme, puis authentification du compte invité).
- **D-05** : contrainte d'ordre non négociable : participations `invite:` existent **avant** l'appel `household-token` (le remplissage pont 0180b porte sur les guests de l'ardoise présentée au moment de l'appel).
- **D-06** : redemption foyer par le **canal HTTP de l'app réelle** qui appelle `redeem_household_invite_token` (0181) — **jamais d'appel direct du RPC PostgREST**. *(Correction de recherche : le canal réel est Edge `household-invite` action `redeem`, voir Summary §1.)*
- **D-07/D-08** : le script auto-rédige un **seul document réécrit** `docs/BRIDGE-ARDOISE-PREUVE.md` à chaque run, forme 38-E2E-SIGNATURE.
- **D-09** : le document consigne aussi les **seams non couverts** (dialog de copie, rendu du panneau invité…).
- **D-10** : signal mécanique dans la sortie quand un comportement HTTP s'écarte du chemin de l'app réelle (statut inattendu, header CORS absent, redirect non suivi), verdict humain ensuite.
- **D-11** : détection navigateur automatique **refusée** (zéro nouveau paquet/service, e2e navigateur = W2 déclenché par besoin).
- **STATE.md** : zéro nouveau paquet, zéro nouveau service — W1 = sh + curl -K + psql.sh stdin + lib-smoke-accounts.sh.
- **Discretion** : nom du fichier secrets curl -K 0600 ; libellés/format de sortie ; choix des champs clés affichés.
- **Deferred (OUT OF SCOPE)** : W2 — spec navigateur Playwright du flux bridge.

### Exigences (REQUIREMENTS.md, verbatim)

- **PROOF-01** : script sœur `scripts/test-ardoise-bridge-real.sh` (pas d'extension inline de `test-join-token-real.sh`), happy path sur le fil HTTP réel, preuve attribuable (méthode, statut, champs clés, estampille du build déployé), jamais SQL seul (§2.7 A).
- **PROOF-02** : ≥ 3 négatifs red-team sur le vrai fil, chacun prouvé rouge avant d'être vert.
- **PROOF-03** : réconciliation prouvée par lecture d'état après coup bornée par foyer (sans duplication ni orphelin) ; refus de ré-redemption (single-use) = assert positif.
- **PROOF-04** : discipline secrets/attribution — secrets uniquement `curl -K` 0600, comptes e2e via lib-smoke-accounts avec purge vérifiée (re-delete → 404), foyer éphémère créé et purgé.
- **PROOF-05** : consignation datée dans `docs/` (forme 38-E2E-SIGNATURE) — ce qui est prouvé, ce qui ne l'est pas, verdict par étape.
- **PROOF-06** : idempotent avec teardown automatique.
- **PROOF-07** : si seam client suspecté, e2e navigateur ajouté — déclenché par besoin, jamais préventif.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Émission token bridge | Edge `ardoise-invite` (HTTP) | RPC 0180b (base, via service_role) | L'Edge est le seul appelant légitime du RPC ; le script ne parle qu'à l'Edge |
| Redemption foyer + réconciliation | Edge `household-invite` action `redeem` (HTTP) | RPC 0181 (transaction base) | Canal exact de l'app réelle (invites.ts:17-35) |
| Fixtures (foyer, ardoise, code, guest, dépense) | HTTP : PostgREST RPC (`create_household`, `create_expense`) + Edge `ardoise-invite` (`create-ardoise`, `create`, `redeem-guest`) | — | Mêmes canaux que l'app réelle ; chaque fixture est un appel observable |
| Lecture d'état après coup | psql.sh stdin (rôle `postgres`, borné par foyer) | — | §2.7 C : frontière conteneur par stdin ; la SQL ne prouve que l'état final |
| Comptes e2e + purge | lib-smoke-accounts.sh (Admin GoTrue via `curl -K` 0600) | — | Un seul chemin vers SUPABASE_SECRET_KEY |

## Standard Stack

**Aucun paquet nouveau** — décision STATE.md verrouillée. Stack existante du dépôt, le tout déjà présent :

| Outil | Présence | Purpose | Provenance |
|-------|----------|---------|------------|
| `sh` (POSIX, `set -eu`) | système | script sœur, forme des sœurs | [VERIFIED: scripts/test-join-token-real.sh:1-47] |
| `curl` avec `-K` fichier 0600 | système | tout appel HTTP ; secrets jamais en argv/env | [VERIFIED: scripts/lib-smoke-accounts.sh:105-117] |
| `scripts/lib-smoke-accounts.sh` | dépôt | création/session/purge comptes e2e | [VERIFIED: scripts/lib-smoke-accounts.sh:22-44] |
| `scripts/psql.sh` (stdin) | dépôt | lecture d'état après coup | [VERIFIED: scripts/psql.sh:9-19] |
| `mktemp -d` + `trap EXIT` | système | répertoire secrets éphémère, teardown | [VERIFIED: scripts/lib-smoke-accounts.sh:76-90] |

`jq` : les sœurs extraient le JSON par `sed` (`smoke_json_string`, lib-smoke-accounts.sh:52-55). Ne pas introduire `jq` sans besoin — zéro nouveau paquet ; si l'extraction dépasse le `sed`, rester dans les helpers existants ou un `sed -n` local.

## Architecture Patterns

### System Architecture Diagram

```
Comptes e2e (Admin GoTrue)                    ┌─ curl -K 0600 (apikey publiable + Bearer JWT)
        │ smoke_accounts_session              │
        ▼                                     ▼
  JWT invité / payeur ──────────────► Gateway prod (Traefik → Envoy /functions/v1)
                                              │
   (1) POST create_household      (RPC PostgREST, JWT payeur) ──► foyer éphémère
   (2) POST ardoise-invite create-ardoise (JWT payeur)           ──► ardoise
   (3) POST ardoise-invite create (JWT payeur)                   ──► code brut (une fois)
   (4) POST ardoise-invite redeem-guest (publishable, sans JWT)  ──► guest_ticket + participant guest:
   (5) POST create_expense (RPC PostgREST, JWT payeur, part guest) ──► dépense   [D-05 : AVANT (7)]
   (6) POST ardoise-invite household-token (JWT invité + code)   ──► { token }
         └─ RPC create_household_bridge_token (service_role)     ──► household_invite_tokens(max_uses=1, +15 min)
                                                                    + private.ardoise_bridge_identities (tous guests)
   (7) POST household-invite redeem (JWT invité + token)         ──► { household_id }
         └─ RPC redeem_household_invite_token (0181)             ──► adhésion + réconciliation guest:→membre:
                                                                    + purge du pont, use_count=1
   Négatifs : replay (7 bis) → 410 ; token muté → 404 ; token réémis + 15 min → 410 ; cross-household (2ᵉ foyer)
   Après coup : psql.sh < fichier.sql  (postgres, borné par foyer)  ──► assertions réconciliation
   Purge : delete foyer (SQL cascade) + smoke_accounts_purge (re-delete → 404)
   Sortie : verdicts par étape + estampille /version.json → docs/BRIDGE-ARDOISE-PREUVE.md
```

### Chain HTTP exacte, valeurs vérifiées dans le code

Toutes les valeurs ci-dessous sont des définitions effectives lues ce session :

- Edge `ardoise-invite`, actions et limites de débit **verbatim** (`supabase/functions/ardoise-invite/index.ts:251`) :
  `LIMITS = { 'redeem-guest': 8, join: 8, 'household-token': 8, create: 20, 'create-ardoise': 10, revoke: 20, summary: 30, 'guest-view': 30, 'link-view': 30, 'add-guest': 20 }` — fenêtre 60 s, clé `action:IP` (`x-forwarded-for`), 429 au-delà.
- Edge `household-invite` **verbatim** (`supabase/functions/household-invite/index.ts:220-226`) :
  `LIMITS = { redeem: 8, create: 20, revoke: 20, 'revoke-one': 20, summary: 30 }`.
- Schéma `household-token` : `code` 22–512 car., regex `^[A-Za-z0-9_-]+$` (`ardoise-invite/index.ts:146-151`).
- Schéma `redeem` : `token` 22–512 car., même regex (`household-invite/index.ts:151-158`).
- Réponse `household-token` → `{ token }` (`ardoise-invite/index.ts:616`) ; le brut n'existe qu'une fois.
- Réponse `redeem` → `{ household_id }` (`household-invite/index.ts:473`).
- Réponse `redeem-guest` → `{ ardoise_id, guest_ticket }` (`ardoise-invite/index.ts:550-551`).
- RPC 0180b : `create_household_bridge_token(p_household_id, p_token_hash, p_ardoise_id, p_user_id)` — hash regex `^[0-9a-f]{64}$`, borne **verbatim** `v_expires_at := now() + interval '15 minutes'` ; insère `household_invite_tokens (…, max_uses=1, use_count=0, is_active=true)` ; upsert pont `on conflict (user_id, guest_id) do nothing` ; contrainte unique `ardoise_bridge_identities_user_guest_key unique (user_id, guest_id)` (`0180b:19-92`, `0180:28-38`).
- Refus redeem, mapping Edge **verbatim** (`household-invite/index.ts:321-325`) : `token inconnu` → **404**, `token révoqué` → **410**, `token expiré` → **410**, `token épuisé` → **410** (« Ce token a atteint son nombre d'utilisations maximal. »). Grille attendue des négatifs :
  - replay → `token épuisé` → **410** (assert positif single-use, PROOF-03) ;
  - token muté (1 caractère changé) → hash différent → `token inconnu` → **404** ;
  - token expiré (réémis puis 15 min + marge attendues) → `token expiré` → **410**.
- `redeem-guest` est le seul chemin sans session (`ardoise-invite/index.ts:946-948`) : appelable avec la seule clé publiable ; `household-token` exige `ctx.authMode === 'user'` (l.955-959).
- Privilèges RPC : `revoke … from public, anon, authenticated; grant execute … to service_role` (0180b:91-92) — le script ne doit **jamais** tenter d'appeler le RPC directement avec un JWT utilisateur : ce serait prouver un chemin qui n'existe pas. (Un négatif optionnel « RPC direct refusé » est possible mais n'est pas dans D-01 — ne pas l'ajouter sans décision.)
- Réconciliation 0181 : ordre interne (0) inscription `ardoise_members` → (1.a/1.b) fusion doublons (garder la part membre, reporter les montants) → (2) conversion `participant_type='membre', guest_id=null` bornée par `(user_id, household_id)` du pont **et** `expenses.household_id` du token → (3) purge du pont → `use_count = use_count + 1`. Les lignes `ardoise_guests` ne sont jamais supprimées (`0181:147-344`).

### Pattern 1: Structure du script sœur (frère de test-join-token-real.sh)

```
scripts/test-ardoise-bridge-real.sh
  1. En-tête commentaire : CE QUE CE SCRIPT PROUVE ET CE QU'IL NE PROUVE PAS
  2. STACK_ENV/API/E2E_BASE_URL, lecture .env sans sourcer (stack_value)
  3. Sonde santé GET $API/auth/v1/health + apikey → refus sans stack (jamais de skip)
  4. . lib-smoke-accounts.sh ; SMOKE_API / SMOKE_STACK_ENV / SMOKE_ACCOUNT_PASSWORD
  5. trap EXIT : smoke_accounts_tmp_clean + purge best-effort (comptes + foyer)
  6. Estampille : GET $E2E_BASE_URL/version.json (+ en-tête X-App-Version) au début du run
  7. Fixtures → happy path → négatifs (ordre fixe D-02, commentaire français) → psql après coup
  8. Purge vérifiée (re-delete foyer → 0 lignes ; re-delete comptes → 404)
  9. Auto-rédaction docs/BRIDGE-ARDOISE-PREUVE.md ; exit non-nul au premier verdict rouge
```

### Pattern 2: Attribution par appel (sortie attribuable)

Chaque appel HTTP imprime une ligne de la forme : `ÉTAPE n | POST <url> | HTTP <statut> | champs clés (extraits du corps, jamais un secret) | estampille`. Le corps des réponses d'erreur (message serveur) est imprimé ; les valeurs secrètes (token brut, guest_ticket, code) ne sont **jamais** imprimées — seuls leurs effets (statut, champs non sensibles comme `household_id`, `ardoise_id`, `already_member`). Le run rejoué après déploiement imprime la nouvelle estampille (PROOF-01).

### Anti-Patterns to Avoid

- **Appeler le RPC `create_household_bridge_token` ou `redeem_household_invite_token` depuis le script** : service_role only ; le chemin prouvé est l'Edge, jamais PostgREST direct (D-06, §2.7 A).
- **Falsifier `expires_at` en SQL pour tester l'expiration** : une colonne falsifiée prouve la mauvaise couche (D-01) — attendre les 15 min réelles.
- **Secrets en argv/env** : `ps` montrerait la valeur — uniquement fichiers `curl -K` 0600 dans `mktemp -d` nettoyé au trap EXIT (§2.7 H ; JWT de session inclus, même régime).
- **Assertions SQL non bornées** : toute requête de vérification est bornée `household_id = foyer du run` en `postgres` (§2.7 D.2 — la RLS ne borne pas le rôle `postgres`).
- **Tautologies** : compter `>= 0` ou vérifier `not null` sur une colonne `not null` ne prouve rien (§2.7 D.3) — chaque assert borne son périmètre et peut échouer.
- **Oublier le rate-limit** : `redeem-guest`/`household-token`/`redeem` = 8/min/IP ; un run nerveux prend des 429 qui ne prouvent rien — espacer les appels de la même action ou rester ≤ 8 par fenêtre, et traiter un 429 inattendu comme signal D-10, pas comme un verdict.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Comptes e2e (création, session, purge) | admin GoTrue maison | `lib-smoke-accounts.sh` sourcé | un seul chemin vers SUPABASE_SECRET_KEY, purge prouvée 404 (PROOF-04) |
| Fichiers secrets curl | export env / argv / echo | `smoke_admin_config` + fichiers `-K` 0600 maison (même forme) | §2.7 H, pattern seed-test-accounts |
| Extraction JSON | parseur shell complet | `smoke_json_string`/`sed -n` comme les sœurs | zéro nouveau paquet (STATE.md) |
| Estampille du build | digest d'image, label OCI | `GET <E2E_BASE_URL>/version.json` | canal officiel du dépôt, `no-cache` nginx [VERIFIED: app/nginx.conf:54 ; app/Dockerfile:31] |
| Purge foyer | delete ciblé table par table | `DELETE FROM public.households WHERE id = …` (cascade) via psql.sh | 0180/0181/ardoise/expense tous `on delete cascade` vers le foyer ; vérifier le compte à 0 |

**Key insight:** la valeur du script est sa fidélité au chemin app réelle ; toute simplification qui court-circuite un Edge prouve un chemin que personne n'emprunte (§2.7 A : « la preuve traverse le chemin complet »).

## Common Pitfalls

### Pitfall 1: Mauvais canal de redemption (D-06 tel qu'écrit)
**What goes wrong:** planifier la redemption sur `ardoise-invite` action `join` — ce chemin appelle `redeem_ardoise_invite` (code ardoise), pas le RPC foyer ; le bridge ne serait jamais traversé.
**Why it happens:** CONTEXT D-06 porte le nom du mauvais Edge/action ; le code réel dit `household-invite redeem`.
**How to avoid:** corriger D-06 dans le plan (canal `household-invite` action `redeem`, JWT invité) ; l'esprit — HTTP app réelle, jamais RPC direct — reste intact.
**Warning signs:** une étape de redemption qui renvoie `{ardoise_id, already_member}` au lieu de `{household_id}`.

### Pitfall 2: Sonde net._http_response collée au mauvais patron
**What goes wrong:** répliquer la fenêtre `net._http_response` de test-dispatch-push.sh alors qu'aucun pg_net n'est sur le chemin bridge.
**Why it happens:** PROOF-04 cite le patron verbatim ; STATE.md Todos avait déjà posé la question.
**How to avoid:** attribution = sortie curl par appel (méthode/statut/champs/estampille) ; psql ne sert qu'à la lecture d'état après coup.
**Warning signs:** un script qui lit `net._http_response` pour des jambes curl directes.

### Pitfall 3: Rate limit 8/min/IP
**What goes wrong:** les négatifs multipliés en rafale prennent des 429 → verdicts ambigus (un 429 n'est ni rouge ni vert pour la propriété testée).
**Why it happens:** compteurs mémoire `action:IP`, fenêtre 60 s, réinitialisée à la première requête de la fenêtre suivante.
**How to avoid:** espacer les appels d'une même action (sleep > 60 s entre deux usages de `redeem`, ou grouper ≤ 8 par minute) ; compter le budget d'appels par action au moment du plan.
**Warning signs:** statut 429 dans une étape de négatif.

### Pitfall 4: Participant guest sans inscription ardoise à la conversion
**What goes wrong:** la conversion exige le trigger `validate_expense_participant` (0008/0056) — 0181 insère d'abord `ardoise_members` ; si la fixture crée la dépense avec un participant guest, c'est déjà correct ; ne pas construire de fixture où la part guest existerait sans ardoise cohérente.
**How to avoid:** créer la dépense uniquement via RPC `create_expense` (canal app, payload vérifié `app/src/modules/ardoise/api.ts:455-465`) avec la part guest du `guest_ticket` ; D-05 : la dépense existe AVANT `household-token`.

### Pitfall 5: Le code de partage ardoise a ses propres bornes
**What goes wrong:** le code de partage expire (`expiresAt`) et porte `max_uses` (CR-01 : quota vérifié sur `household-token` aussi, `ardoise-invite/index.ts:588-597`) — un code épuisé ou expiré rend 404 « Lien invalide. » uniforme.
**How to avoid:** fixture `create` avec `expiresAt` futur lointain et `maxUses` par défaut (10) ; un seul code pour le run.
**Warning signs:** 404 « Lien invalide. » à l'étape `household-token`.

### Pitfall 6: Cross-household mal défini
**What goes wrong:** le token redeem ne prend **aucun paramètre foyer** — le foyer vient du token. Un « cross-household » mal conçu (redeem avec un autre foyer en paramètre) n'existe pas dans l'API.
**How to avoid:** voir Open Questions OQ-1 : la 2ᵉ fixture foyer sert à prouver la **borne de la réconciliation** (aucune participation d'un autre foyer convertie) et/ou le refus d'un token présenté dans le contexte d'un autre foyer. Choisir l'observable au plan, avant d'écrire l'assert.

### Pitfall 7: Purge incomplète du foyer éphémère
**What goes wrong:** des lignes orphelines survivent (tokens, pont, ardoise_guests) et s'accumulent au fil des runs (PROOF-06 violé).
**How to avoid:** purge par `DELETE FROM public.households` (cascade) puis **assert re-vérification** : compte à 0 sur `household_invite_tokens`/`ardoises`/`expenses` du foyer purgé ; comptes purge via `smoke_accounts_purge RUN_ID` (re-delete → 404 exigé).
**Warning signs:** `smoke_accounts_list` signale des comptes résiduels hors run.

### Pitfall 8: Un succès muet dans la consignation
**What goes wrong:** le doc auto-rédigé liste des étapes « vertes » sans la preuve (statut, champs) qui les fonde.
**How to avoid:** chaque verdict du doc cite la ligne de sortie correspondante ; le doc contient la section « ce qui n'est PAS prouvé » avec la liste des seams (D-09) et l'estampille du build.

## Code Examples

### Appel Edge avec session (canal app réelle)

```sh
# Source: app/src/lib/invites.ts:17-35 (canal réel) + household-invite/index.ts:151-158 (schéma)
# Le JWT de session va dans le fichier -K, jamais en argv :
#   header = "apikey: <PUBLISHABLE_KEY>"
#   header = "Authorization: Bearer <SMOKE_SESSION_JWT>"
redeem_code="$(mktemp -d)/redeem-body"  # le corps porte le token : fichier 0600 aussi
printf '{"action":"redeem","token":"%s"}\n' "$TOKEN_BRUT" > "$redeem_code" && chmod 600 "$redeem_code"
curl -sS -o "$reponse" -w '%{http_code}' -K "$fichier_headers" \
  -H 'content-type: application/json' --data @"$redeem_code" \
  "$API/functions/v1/household-invite"
```

### Émission bridge par l'invité

```sh
# Source: ardoise-invite/index.ts:568-617 — JWT invité + code de partage ardoise
printf '{"action":"household-token","code":"%s"}\n' "$CODE_BRUT" > "$corps" && chmod 600 "$corps"
statut=$(curl -sS -o "$reponse" -w '%{http_code}' -K "$headers_invite" \
  -H 'content-type: application/json' --data @"$corps" "$API/functions/v1/ardoise-invite")
# 200 → {"token":"…"} ; le token brut n'existe qu'une fois (jamais imprimé)
```

### Lecture d'état après coup bornée par foyer (psql.sh stdin)

```sql
-- Source: 0181:303-329 + AGENTS §2.7 C/D.2 — postgres, borne household_id du run
-- (1) conversion : plus aucune part guest pontée dans le foyer du run
select count(*) as guests_restants
  from public.expense_participants ep
  join public.expenses e on e.id = ep.expense_id
 where e.household_id = :'foyer'
   and ep.participant_type = 'guest'
   and ep.guest_id in (select guest_id from private.ardoise_bridge_identities
                        where household_id = :'foyer');            -- attendu 0 (pont purgé : borne vide = 0 parts restantes au préalable capté avant redeem)
-- (2) parts converties rattachées au nouveau membre, pas de doublon par dépense
select ep.expense_id, count(*) from public.expense_participants ep
  join public.expenses e on e.id = ep.expense_id
 where e.household_id = :'foyer' and ep.participant_type = 'membre'
   and ep.member_id = :'nouveau_membre' group by 1 having count(*) > 1;  -- attendu 0 ligne
-- (3) token consommé : use_count = 1, is_active = false
select use_count, is_active, max_uses from public.household_invite_tokens
 where household_id = :'foyer';                                     -- attendu 1 / false / 1
```

⚠️ Capter les identifiants du pont (guests, foyer, nouveau membre) **avant** le redeem — la table pont est purgée par la redemption (0181:327-329) : une assertion qui dépend du pont après coup doit être semée avant, sinon elle est tautologique (borne vide = vert sans preuve).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Signature RPC bridge 3 args (0180) | 4 args + remplissage pont DANS le RPC (0180b, correctif vers l'avant) | phase 40 | Le PostgREST n'expose pas `private` — l'Edge n'a qu'un appel ; le script n'a rien à faire pour le pont, il le vérifie |
| `participant_type='invite'` (vieux plan) | `'guest'` (vocabulaire effectif 0056/0063) | 0181 l.15-17 | Assertions en `'guest'`, jamais `'invite'` |
| Sonde net._http_response (patron dispatch-push) | sortie curl attribuable par appel | ce research | PROOF-04 résolu dans le sens STATE.md Todos |

**Deprecated/outdated:** la signature `create_household_bridge_token(text, text)` 3→2 args de 0180 est **droppée** (0180b:17) — la définition effective est la 4-arg.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | La purge du foyer éphémère par `DELETE FROM public.households` cascade sur tout le graphe (expenses, participants, ardoise, tokens, pont) | Pitfall 7 / teardown | orphelins résiduels → PROOF-06 ; vérifier les FK au plan (grep `on delete cascade`) avant de s'y engager |
| A2 | Le négatif cross-household peut s'observer par borne de réconciliation (aucune part d'un 2ᵉ foyer convertie) — l'observable exact est un choix de plan | Pitfall 6 / OQ-1 | négatif qui ne teste rien ; à trancher au plan |
| A3 | La marge après les 15 min d'expiration : +60–120 s suffit (le refus est `expires_at <= now()` côté base) | Négatifs | faux rouge si marge trop juste ; prendre 2 min et consigner l'attente réelle |
| A4 | Le SPA frontend sert `/version.json` depuis l'hôte app (pas l'API) — l'estampille du build **frontend** ; l'estampille Edge n'a pas de canal dédié connu | Pattern 2 | si un canal Edge existe et est attendu, le doc doit le dire ; sinon consigner cette limite dans « ce qui n'est pas prouvé » |

## Open Questions (RESOLVED)

1. **Observable exact du négatif cross-household (OQ-1)**
    - What we know: D-01 exige une 2ᵉ fixture foyer ; le redeem ne prend pas de foyer en entrée — le foyer vient du token.
    - What's unclear: faut-il prouver (a) que le redeem d'un invité déjà membre d'un autre foyer ne convertit que le foyer du token (borne du pont 0181 `(user_id, household_id)`), (b) qu'un token émis via l'ardoise du foyer A n'attribue jamais le foyer B, ou (c) les deux ?
    - Recommendation: (a) — c'est la borne T-40-05 du code (0181 l.137-139), observable par psql après coup borné ; le (b) n'a pas de surface HTTP distincte à attaquer. Trancher au plan avec un commentaire français (D-02).
    - **RESOLVED (43-01-PLAN)** : option (a) tranchée — voir `<corrections_to_context>` « Décision OQ-1 tranchée » et Task 3 négatif (d), commentaire français nommant le choix.
2. **Statut attendu du replay avec pont purgé** — le replay post-redemption tombe sur `token épuisé` (410) car `use_count >= max_uses` est vérifié avant tout le reste (0181 l.96-98) ; aucune ambiguïté attendue, mais l'assert doit épingler le **message** (« a atteint son nombre d'utilisations maximal ») en plus du statut pour distinguer un 429 de rate-limit.
    - **RESOLVED (43-01-PLAN)** : Task 3 négatif (a) épingle 410 **et** le message « a atteint son nombre d'utilisations maximal ».
3. **Comment reconcilier le libellé PROOF-04 (net._http_response) avec la sortie curl** — recommandation : le plan écrit explicitement que la discipline d'attribution est satisfaite par les lignes de sortie par appel, avec référence au Todos STATE.md ; le doc de consignation le mentionne.
    - **RESOLVED (43-01-PLAN)** : `<corrections_to_context>` « PROOF-04 résolu » — attribution = sortie curl par appel ; le doc de consignation mentionne ce choix.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker + service `db` actif | psql.sh (lecture/purge) | à vérifier au run (script refuse sans) | — | aucun — la preuve SQL après coup est un critère de succès |
| curl | toutes jambes HTTP | ✓ | système | aucun |
| Stack prod déployée + INVITE_TOKEN_HMAC_SECRET / ARDOISE_HMAC_SECRET dans le .env de la stack | Edge household-token / redeem / codes | à vérifier au run (500 « Configuration serveur absente » sinon) | — | aucun |
| Accès hôte de la stack (SUPABASE_SECRET_KEY pour Admin GoTrue) | lib-smoke-accounts | ✓ (patterns sœurs) | — | aucun |

**Missing dependencies with no fallback:** aucune identifiée hors machine — le script refuse explicitement sans stack joignable (patron sœur test-join-token-real.sh:101-114).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | sh + curl (script sœur, POSIX `set -eu`) — la preuve EST le livrable |
| Config file | none — sœurs sans config |
| Quick run command | `sh scripts/test-ardoise-bridge-real.sh` (⚠️ ~20 min : attente expiration réelle) |
| Full suite command | idem + `python3 scripts/check-sql-statique.py` (aucune migration touchée : attendu vert sans nouveaux objets SQL) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROOF-01 | happy path HTTP attribuable | e2e réel prod | `sh scripts/test-ardoise-bridge-real.sh` | ❌ Wave 0 (le script est le livrable) |
| PROOF-02 | 4 négatifs rouges sur le fil | e2e réel prod | idem (section négatifs) | ❌ Wave 0 |
| PROOF-03 | réconciliation bornée + single-use | e2e réel + psql après coup | idem | ❌ Wave 0 |
| PROOF-04 | discipline secrets/purge | structure du script + run | relecture + idem | ❌ Wave 0 |
| PROOF-05 | consignation auto-rédigée | vérif doc post-run | `cat docs/BRIDGE-ARDOISE-PREUVE.md` | ❌ Wave 0 |
| PROOF-06 | idempotence/teardown | run répété | idem (2ᵉ exécution) | ❌ Wave 0 |
| PROOF-07 | seam client → verdict humain | doc « seams non couverts » + sortie D-10 | lecture du doc | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** pas d'exécution prod par commit (coût + durée) ; typecheck du shell (`sh -n`) et relecture.
- **Per wave merge:** un run complet du script (la phase = 1 plan court, un run final).
- **Phase gate:** run complet vert + doc consigné + purge vérifiée avant `/gsd-verify-work`.

### Wave 0 Gaps
- Aucun gap de framework : la phase n'ajoute pas de code testé par Vitest ; le script est le test. `test-db.sh` non requis si aucune migration n'est touchée (aucune ne l'est — confirme le périmètre).

## Security Domain

Aucune nouvelle surface produit : la phase n'ajoute ni endpoint, ni migration, ni privilège. Les contrôles pertinents sont les disciplines de preuve :

| Domaine | Applicable | Contrôle |
|---------|-----------|----------|
| Secrets (§2.7 H) | yes | `curl -K` 0600 dans mktemp nettoyé ; JWT de session au même régime ; jamais de valeur secrète imprimée |
| Négligence d'oracle | yes | négatifs attendent les messages uniformes du code (404 inconnu / 410 épuisé-expiré) — l'assert épeingle statut **et** message |
| Bornage des lectures SQL | yes | chaque requête après coup porte `household_id = foyer du run` (rôle postgres, §2.7 D.2) |
| ASVS V4/V5 | no (aucun code ajouté) | surface existante déjà couverte (0180b service_role only, 0181 transactionnelle) |

## Sources

### Primary (HIGH confidence)
- `supabase/functions/ardoise-invite/index.ts` (intégralement, 975 l.) — actions, LIMITS l.251, `household-token` l.568-617, CORS l.64-68, réponses l.546-551
- `supabase/functions/household-invite/index.ts` — schéma `redeem` l.151-158, LIMITS l.220-226, `handleRedeem` l.449-474, mapping refus l.321-325
- `supabase/migrations/0180_ardoise_bridge_token.sql` + `0180b_ardoise_bridge_fill.sql` — RPC effectif 4-arg, 15 min en dur, pont unique (user_id, guest_id)
- `supabase/migrations/0181_ardoise_reconciliation.sql` (intégralement, 357 l.) — ordre interne, bornes, purge du pont
- `scripts/test-join-token-real.sh`, `scripts/test-dispatch-push.sh`, `scripts/lib-smoke-accounts.sh`, `scripts/psql.sh` — patrons sœurs
- `app/src/lib/invites.ts:17-35` — canal réel de redemption ; `app/src/modules/ardoise/api.ts:455-465` — `create_expense` payload ; `app/src/lib/data/supabase-adapter.ts:235` — `create_household` RPC
- `.planning/phases/43-.../43-CONTEXT.md`, `.planning/REQUIREMENTS.md` §PROOF, `.planning/STATE.md`
- `.planning/milestones/v1.3-phases/38-filet-de-tests-fiable/38-E2E-SIGNATURE.md` — forme de consignation

### Secondary (MEDIUM confidence)
- `app/nginx.conf:54`, `app/Dockerfile:31`, `docs/DEPLOIEMENT-PROD.md:161` — canal estampille `/version.json`

### Tertiary (LOW confidence)
- A1–A4 (Assumptions Log)

## Metadata

**Confidence breakdown:**
- Canal bridge (Edges, RPC, réponses, refus) : HIGH — code source lu intégralement ce session
- Patrons de script (sœurs, secrets, psql) : HIGH — fichiers lus intégralement
- Observables des négatifs : MEDIUM — statuts/messages vérifiés, l'observable cross-household reste à trancher (OQ-1)
- Teardown cascade : MEDIUM — basé sur les FK vues dans 0180/0181, vérification complète au plan (A1)

**Research date:** 2026-11-11
**Valid until:** stable — le périmètre est 100 % lecture de code existant ; revalider si les Edges bridge changent (diff git sur `supabase/functions/ardoise-invite` et `household-invite`).
