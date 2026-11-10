# Phase 39: Outillage prod de vérification - Research

**Researched:** 2026-11-09
**Domain:** Outillage shell/e2e contre GoTrue Admin API (Supabase auto-hébergé) + réécriture d'une spec Playwright e2e
**Confidence:** HIGH (chaque affirmation sur le code est vérifiée par lecture du fichier cette session ; comportement GoTrue vérifié via Context7 sur github.com/supabase/auth)

## Summary

La phase est **script-only + une spec e2e**, sans aucun changement frontend ni backend. Tout le socle existe déjà : `scripts/smoke-test.sh` lit déjà `SUPABASE_SECRET_KEY` via `stack_value` (l.55) et purge déjà via `DELETE /auth/v1/admin/users/$uid` (l.211-212) ; la dette est que la **création** des comptes (l.237, l.358 `POST /auth/v1/signup`) suppose l'autoconfirm, or la prod a `ENABLE_EMAIL_AUTOCONFIRM=false` (vérifié dans `supabase-project/.env.example` l.185). Le chemin GoTrue Admin est par ailleurs déjà documenté côté serveur : `POST /admin/users` avec `{"email","password","email_confirm":true}` crée un compte confirmé sans envoyer d'email, et `DELETE /admin/users/{id}` répond 200/204 — les deux vérifiés dans les sources GoTrue via Context7 [VERIFIED: Context7 /supabase/auth].

Deux découvertes de recherche que le plan doit intégrer :

1. **Le défaut de secret existe déjà dans le script cible.** La purge actuelle (l.211-212) passe `SUPABASE_SECRET_KEY` en argument curl `-H "apikey: $SECRET_KEY"` — visible dans `ps` et dans `/proc/PID/cmdline`, ce qui contredit §2.7 H. Le correctif est **déjà écrit ailleurs dans le dépôt** : `scripts/seed-test-accounts.sh` (l.58-73) passe les en-têtes par un fichier de config `curl -K` en 0600, supprimé à la sortie. Le plan doit appliquer ce même pattern (`-K`) à tout appel Admin (création ET purge), pas seulement à la création [VERIFIED: scripts/smoke-test.sh:211-212, scripts/seed-test-accounts.sh:58-73].
2. **La détection d'autoconfirm a une sonde propre, sans effet de bord.** `GET /auth/v1/settings` est public, sans authentification, et renvoie `mailer_autoconfirm` (booléen) — c'est l'auto-détection CS-01 sans sonde destructive ni lecture de `.env` distant [VERIFIED: Context7 /supabase/auth, GET /settings — « public and does not require authentication », champ `mailer_autoconfirm`].

Pour la spec e2e réelle (TEST-02), la contrainte structurante est la **portée testable du flux 31-03 en prod** : la traversée du token par l'inscription (`D-06` → `/connexion` mode inscription) est testable jusqu'au hand-off (sessionStorage posé + navigation), mais **pas** au-delà de la confirmation email (aucun accès à la boîte mail du compte e2e) ; le redeem authentifié `D-08` est lui pleinement testable avec un compte créé par l'outillage smoke et une session par mot de passe (`POST /auth/v1/token?grant_type=password`, indépendant de l'autoconfirm puisque le compte est déjà confirmé) [VERIFIED: comportement confirmé par le champ email_confirm=true de l'Admin API]. La spec doit donc être écrite contre les 6 points JT-02 avec ce bornage explicite.

**Primary recommendation:** Un seul plan, deux livrables séquencés : (1) outillage smoke — sous-commandes `accounts-create`/`accounts-purge`/`accounts-list` dans `scripts/smoke-test.sh` (ou fichier sourcé `scripts/lib-smoke-accounts.sh`), appel Admin via `curl -K` 0600, sonde `mailer_autoconfirm`, purge vérifiée re-delete→404, 422/429 en pause fixe + un retry puis échec nommé ; (2) spec réelle `app/e2e/join-token-real.spec.ts` consommant l'outillage, suppression des 2 tests périmés de `critical-paths.spec.ts` l.123-140, run séparé documenté, mise à jour de la signature e2e 38.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (verbatim)

#### Spéc e2e join-token (TEST-02)
- **JT-01: Spec réelle, run séparé.** La spec réécrite exige une stack déployée (E2E_BASE_URL + comptes créés/purgés par l'outillage smoke de cette même phase) et tourne comme run séparé documenté — analogue de `test-dispatch-push.sh` pour le push. La suite e2e standard (build+preview, mode démo) reste 100 % verte sans elle, et son run ne porte plus aucun rouge assumé. — Reversibility: reversible — spec locale, exécution conditionnée par une variable d'environnement.
- **JT-02: Couverture = flux complet 31-03.** Création de foyer (token copiable + QR), pré-écran public `/foyer/rejoindre?token=…` nommant l'invitant (D-20), traversée sessionStorage D-06 vers l'inscription, redeem authentifié D-08 avec message D-17, atterrissage non bloquant D-09, message uniforme D-03 sur token mort/expiré. Pas de réécriture « à l'identique » de l'ancienne spec (anti-feature explicite de la recherche).
- **JT-03: Nouveau fichier dédié, ancienne supprimée.** La spec vit dans un nouveau fichier (ex. `app/e2e/join-token-real.spec.ts`) ; les 2 tests de l'ancienne spec (`critical-paths.spec.ts` l.123-139) sont supprimés. Jamais de gating conditionnel « skip sans stack » (recréerait le skip silencieux documenté en phase 38) ni de doublon permanent.
- **JT-04: Outil smoke partagé.** La spec réelle obtient ses comptes via l'outillage smoke partagé (SMOKE-01, décision CS-04) — un seul chemin d'accès à `SUPABASE_SECRET_KEY` à auditer, même discipline de secrets pour les deux consommateurs.

#### Création des comptes smoke (SMOKE-01)
- **CS-01: Deux modes auto-détectés dans `scripts/smoke-test.sh`.** Autoconfirm actif (stack dev) → `POST /auth/v1/signup` comme aujourd'hui (l.237, l.358) ; autoconfirm désactivé (prod) → `POST /auth/v1/admin/users` avec `{email, password, email_confirm: true}` (chemin déjà ouvert pour la purge, l.211-212). Le parcours de test reste identique dans les deux mondes — un seul script, la création s'adapte. — Reversibility: reversible — script shell, détection par une lecture de config.
- **CS-02: Règles identiques dans les deux modes.** Le refus explicite sans secret (le fallback actuel l.197 « pas de clé secrète → comptes laissés en place » devient un refus, §2.7 F : un smoke partiel muet est un échec inexpliqué) et la purge vérifiée (re-delete → 404 attendu) s'appliquent aussi bien en dev qu'en prod.
- **CS-03: Parcours inchangé.** Les 5 étapes du smoke (inscription, création de foyer, relecture RLS, isolement du foyer voisin, token d'invitation + échange par le second compte) restent telles quelles — seul le mécanisme de création change. La valeur du smoke (prouver la chaîne JWT/RLS réelle) est intacte.
- **CS-04: Interface bibliothèque partagée.** Le smoke expose un mode réutilisable (sous-commandes ou fichier sourcé) que la spec e2e réelle consomme pour créer/purger ses comptes — pas de seconde implémentation de l'accès Admin.

#### Déclenchement et rate limits
- **DS-01: Run manuel documenté.** Pas de cron ni de CI (les secrets en CI violeraient §2.7 H). Le branchement automatique est noté en idée différée.
- **DS-02: 422/429 gérés explicitement.** Créations sérialisées (déjà le cas : Alice puis Bob) + en cas de 422/429 : pause fixe courte et un seul retry, puis échec nommé avec le corps de la réponse. Jamais de retry aveugle ni de backoff générique (il masquerait les vraies erreurs, contraire à §2.7 F).
- **DS-03: Documentation d'exploitation.** Une section « smoke-test prod » dans `docs/EXPLOITATION.md` : quand le lancer (avant release, après changement auth), ce qu'il prouve, comment lire son rapport.

#### Emails e2e
- **EE-01: Sous-domaine réservé.** Format `e2e+<runid>@<sous-domaine-réservé>` du domaine réel (ex. `e2e+<runid>@e2e.votredomaine.fr`) — jamais de collision avec un vrai destinataire, tout email `e2e*` du sous-domaine est identifiable comme compte de test. — Reversibility: reversible — convention de nommage, changer le format ne coûte qu'une lecture de prefix dans les scripts.
- **EE-02: Détection résiduelle, purge par runid.** En fin de run, le script liste les comptes résiduels `e2e*@<sous-domaine>` via l'Admin API et signale tout survivant (run précédent mal purgé) sans le supprimer — la purge vérifiée reste bornée à ses propres runids (pas d'effet de bord sur un run concurrent).

### the agent's Discretion
- Le mécanisme exact de détection autoconfirm (lecture `ENABLE_EMAIL_AUTOCONFIRM` du `.env` stack vs sonde `POST /auth/v1/signup` de sonde).
- La forme concrète de l'interface bibliothèque (sous-commandes vs fichier sourcé) et le format du runid (timestamp vs uuid).
- La structure interne de la spec réelle (describe blocks, fixtures) et son nom de fichier exact.
- Le sous-domaine réservé précis (à aligner sur la config DNS réelle du déploiement — voir docs/DEPLOIEMENT-PROD.md).

### Deferred Ideas (OUT OF SCOPE)
- Branchement automatique du smoke (cron/pg_cron ou CI) — nécessiterait un verrou anti-concurrent, une notification d'échec et un accès CI aux secrets via Vault : chantier d'exploitation à part entière, hors périmètre SMOKE-01.
- Purge globale du préfixe `e2e*@<sous-domaine>` (auto-réparatrice) — écartée pour cause de risque concurrent ; à réévaluer si les runs restent toujours sérialisés et uniques.
- Flux « Rejoindre via mon compte » ardoise (phase 40) ; toute surface utilisateur nouvelle.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SMOKE-01 | Créer ET purger les comptes e2e via Admin GoTrue (`email_confirm: true`) en prod, `ENABLE_EMAIL_AUTOCONFIRM` resté false, secrets jamais en argv/ARG, préfixe `e2e+<runid>@`, purge vérifiée (re-delete → 404), 422/429 gérés | Endpoints Admin vérifiés (POST/DELETE/GET /admin/users) ; sonde `mailer_autoconfirm` sans effet de bord ; pattern `curl -K` 0600 déjà présent dans le dépôt pour la discipline argv ; détail des garde-fous §Architecture Patterns et §Common Pitfalls |
| TEST-02 | Spec e2e join-token réécrite contre le flux 31-03 (verte) ou supprimée avec couverture perdue consignée — jamais réparée au vert | Flux 31-03 lu dans `join-household-page.tsx` + `invites.ts` (D-03/D-06/D-08/D-17/D-20) ; bornage du testable en prod (pas d'accès email) documenté ; ancienne spec localisée (`critical-paths.spec.ts` l.123-140, 2 tests) ; signature e2e 38 à réviser |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Création/purge comptes e2e | Shell host (`scripts/`) | GoTrue Admin API | L'Admin exige la clé secrète : jamais côté frontend (§8.4) ni en Edge exposée au client ; le script lit le `.env` de la stack sur l'hôte |
| Détection du mode (autoconfirm ou non) | Shell host | GoTrue `GET /settings` public | Sonde sans effet de bord, une seule source de vérité (la stack interrogée), pas de lecture de config locale qui pourrait diverger de la stack réelle |
| Parcours smoke (5 étapes CS-03) | Shell host → PostgREST/Edge | — | Inchangé : c'est la valeur du smoke (JWT/RLS réels) |
| Spec e2e join-token réelle | Playwright (navigateur réel) | Outillage smoke (comptes) + Edge `household-invite`/`-preview` | La spec vérifie le vrai UI + la vraie Edge ; les comptes viennent du chemin Admin unique CS-04 |
| Documentation d'exploitation | `docs/EXPLOITATION.md` | — | DS-03 |

## Standard Stack

### Core
Aucune nouvelle dépendance. Stack déjà en place :

| Outil | Version | Purpose | Why Standard |
|-------|---------|---------|--------------|
| POSIX sh + curl | présent dans le dépôt | Script smoke + appels Admin API | `scripts/seed-test-accounts.sh` prouve que le pattern `curl -K` suffit [VERIFIED: scripts/seed-test-accounts.sh] |
| GoTrue Admin API | self-hosted snapshot épinglé | createUser / deleteUser / listUsers | Endpoints vérifiés dans les sources officielles [VERIFIED: Context7 /supabase/auth] |
| Playwright | déjà installé (`@playwright/test`, config `app/playwright.config.ts`) | Spec réelle | Le switch `E2E_BASE_URL` (l.4, l.26-30) désactive déjà le webServer build+preview — c'est exactement le run séparé JT-01 [VERIFIED: app/playwright.config.ts:4,26-30] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Sonde `mailer_autoconfirm` (GET /settings) | Lire `ENABLE_EMAIL_AUTOCONFIRM` du `.env` stack | La lecture du `.env` échoue si le smoke tourne depuis une machine qui n'est pas l'hôte de la stack (STACK_ENV absent) ; la sonde interroge LA stack réellement ciblée et coûte une requête publique. Recommandé : sonde en principal, lecture `.env` en repli si /settings indisponible. (Zone de discretion CS-01 — cette recommandation reste mutable.) |
| Fichier sourcé `scripts/lib-smoke-accounts.sh` | Sous-commandes de `smoke-test.sh` | Les sous-commandes gardent un seul point d'entrée documenté ; le fichier sourcé est plus simple à consommer depuis un script Node (la spec). Recommandé : fichier sourcé avec fonctions `smoke_accounts_create` / `smoke_accounts_purge` / `smoke_accounts_list`, consommé par `smoke-test.sh` ET par un petit wrapper shell appelé avant/après la spec (Playwright ne devrait jamais appeler du sh directement — voir Pattern 3). |

**Installation:** rien à installer.

## Package Legitimacy Audit

> Aucun package externe n'est installé par cette phase — zéro dépendance nouvelle (REQUIREMENTS.md : « réutiliser, pas créer »). Audit non applicable.

## Architecture Patterns

### System Architecture Diagram

```
 Hôte (scripts/)                     Stack Supabase auto-hébergée              Navigateur (Playwright)
 ─────────────────                   ────────────────────────────              ───────────────────────
 smoke-test.sh
   │ GET /auth/v1/settings ────────▶ GoTrue : mailer_autoconfirm ──▶ choix du mode
   │
   │ [autoconfirm=false]                                    [autoconfirm=true]
   │ POST /auth/v1/admin/users                              POST /auth/v1/signup
   │   {email, password, email_confirm:true}                     (chemin actuel)
   │   (en-têtes via curl -K 0600, jamais argv)
   │◀── id + 200
   │
   │ parcours 5 étapes (inchangé CS-03) ──────────▶ PostgREST + Edge household-invite
   │
   │ DELETE /admin/users/{id} ×N ─────────────────▶ GoTrue
   │ re-delete → 404 attendu (§2.7 F)             │
   │ GET /admin/users?filter=e2e… ────────────────▶ détection résiduelle (EE-02, signale, ne supprime pas)
   │
   └─ lib-smoke-accounts.sh (CS-04) ─── consommé par ──▶ join-token-real.spec.ts (run séparé,
       create N comptes, purge vérifiée                     E2E_BASE_URL=stack déployée)
                                                            UI : /foyer/rejoindre?token=…
                                                            Edge preview (publishable) puis redeem authentifié
```

### Recommended Project Structure
```
scripts/
├── lib-smoke-accounts.sh     # NOUVEAU — bibliothèque CS-04 (sourcée, pas exécutée) :
│                             # création/purge/liste Admin + sonde + gestion 422/429
├── smoke-test.sh             # MODIFIÉ — source la bibliothèque ; création branchée sur le
│                             # mode détecté ; cleanup = purge vérifiée ; refus sans secret
└── test-join-token-real.sh   # NOUVEAU (discretion) — wrapper du run séparé : prépare les
                              # comptes, lance `npx playwright test e2e/join-token-real.spec.ts`,
                              # purge vérifiée, exit code exact de la spec
app/e2e/
└── join-token-real.spec.ts   # NOUVEAU — spec réelle JT-02 (ancienne supprimée)
docs/EXPLOITATION.md          # MODIFIÉ — section « smoke-test prod » (DS-03)
```

### Pattern 1: En-têtes secrets via `curl -K` (jamais en argv)
**What:** Tout appel qui porte `SUPABASE_SECRET_KEY` écrit les en-têtes dans un fichier de config 0600 dans un `mktemp -d`, et passe `-K "$file"`.
**When to use:** création admin, purge admin, liste résiduelle — partout où la clé secrète circule.
**Example:**
```sh
# Source: scripts/seed-test-accounts.sh l.58-73 — pattern déjà éprouvé dans le dépôt
auth_config() {
  file="$TMP_DIR/admin-headers"
  {
    printf 'header = "apikey: %s"\n' "$SECRET_KEY"
    printf 'header = "Authorization: Bearer %s"\n' "$SECRET_KEY"
  } >"$file"
  chmod 600 "$file"
  printf '%s' "$file"
}
# curl -sS -X POST "$API/auth/v1/admin/users" -K "$cfg" -H 'Content-Type: application/json' --data "$body"
```
⚠️ La purge **actuelle** de `smoke-test.sh` (l.211-212) viole ce pattern : `-H "apikey: $SECRET_KEY"` met la clé dans `ps`/`/proc`. Le plan doit corriger cette occurrence existante, pas seulement la nouvelle création.

### Pattern 2: Choix du mode par sonde publique
**What:** Au démarrage, `GET /auth/v1/settings` (public, sans clé) → `mailer_autoconfirm` décide du chemin de création.
**When to use:** une seule fois par run, avant la création du premier compte.
**Example:**
```sh
# GoTrue renvoie {"external":{...},"mailer_autoconfirm":false,...} — champ plat, extrait par json_string existant
call "/auth/v1/settings" GET "" ""
if [ "$(json_string "$BODY" mailer_autoconfirm)" = "false" ]; then
  MODE="admin"   # prod : création via Admin API, email_confirm: true
else
  MODE="signup"  # stack dev : chemin actuel l.237/l.358
fi
```
[VERIFIED: Context7 /supabase/auth, GET /settings — endpoint public, champ `mailer_autoconfirm`]

### Pattern 3: Le wrapper sh prépare les comptes, la spec les consomme
**What:** La spec Playwright ne lit jamais `SUPABASE_SECRET_KEY` ni n'appelle l'Admin API. Le wrapper (`test-join-token-real.sh`) crée les comptes/foyer/token **avant** `npx playwright test`, transmet uniquement des valeurs **publiques ou éphémères** par variables d'environnement (`E2E_BASE_URL`, `E2E_JOIN_TOKEN`, `E2E_JOIN_EMAIL`, `E2E_JOIN_PASSWORD`), et purge en sortie même si la spec échoue (`trap`).
**When to use:**JT-04 (un seul chemin d'accès au secret) + discipline §2.7 H : le processus Node de Playwright ne voit jamais la clé secrète.
**Example:**
```sh
# test-join-token-real.sh — squelette
. "$SCRIPT_DIR/lib-smoke-accounts.sh"
RUN_ID="$(date +%s)-$$"
eval "$(smoke_accounts_create "$RUN_ID" 2)"   # exporte E2E_JOIN_* (publiques/éphémères) — JAMAIS la clé secrète
E2E_BASE_URL="$FRONT_URL" npx --prefix app playwright test e2e/join-token-real.spec.ts --project=chromium
SPEC_STATUS=$?
smoke_accounts_purge "$RUN_ID"                # purge vérifiée, re-delete → 404 attendu
exit $SPEC_STATUS                             # le statut exact de la spec, pas de la purge — les deux sont rapportés
```

### Pattern 4: Purge vérifiée (§2.7 F)
**What:** `DELETE /admin/users/{id}` puis **re-delete immédiat : 404 attendu**. Un delete silencieux (curl `|| true`, forme actuelle l.212) est un succès muet.
**Example:**
```sh
# DELETE réussi : GoTrue répond 200 (corps {}) ou 204 ; un re-delete renvoie 404
curl -sS -o /dev/null -w '%{http_code}' -X DELETE "$API/auth/v1/admin/users/$uid" -K "$cfg"
[ "$CODE" = 200 ] || [ "$CODE" = 204 ]
CODE2="$(re-delete)"; [ "$CODE2" = 404 ] || fail "purge non prouvée (re-delete: $CODE2)"
```
[VERIFIED: Context7 /supabase/auth — DELETE /admin/users/{user_id} « Returns 200 with empty object or 204 »]

### Anti-Patterns to Avoid
- **Secret en argv** : `-H "Authorization: Bearer $SECRET_KEY"` en ligne de commande → visible dans `ps` (§2.7 H, violation existante à corriger l.211-212). Toujours `-K` 0600.
- **Gating de skip dans la spec réelle** : `test.skip(!env, …)` reproduit le skip silencieux condamné en phase 38 (pattern `offline-shared-device.spec.ts` l.38 explicitement cité comme à NE PAS imiter, JT-03). La spec **échoue** sans prérequis — le gating vit dans le wrapper, qui refuse de lancer sans stack.
- **Retry/backoff générique sur 422/429** (DS-02) : un seul retry après pause fixe, puis échec nommé avec le corps. GoTrue distingue 429 (`over_request_rate_limit`) et 422 (validation, ex. email déjà existant) — un 422 email-existant après retry est une vraie erreur, pas du throttling.
- **Re-écrire l'ancienne spec « à l'identique »** : anti-feature explicite (JT-02). Les 2 tests périmés testent le mode démo (« Entrer dans la démonstration », validation de format) — ils ne couvrent pas le flux réel.
- **Compte smoke sans préfixe traçable** : garder `RUN` en runid EE-01 (`e2e+<runid>@…`), ne jamais réutiliser un email fixe type `seed-test-accounts.sh` (camille@test.local est un compte de DÉVELOPPEMENT volontairement persistant — modèle à NE PAS suivre pour le smoke prod).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Détection autoconfirm | Parse du `.env` distant, ou signup de sonde destructif | `GET /auth/v1/settings` → `mailer_autoconfirm` | Endpoint public vérifié, sans effet de bord, reflète la stack réellement interrogée |
| Extraction JSON | jq ou parseur maison | `json_string`/`json_number` existants du smoke | Déjà tolérants aux deux formats (compact GoTrue vs espacé PostgREST), commentés par les défauts passés |
| En-têtes secrets dans curl | Variables d'environnement exportées vers curl, ou `-H` inline | Fichier `-K` 0600 (pattern seed-test-accounts) | Seule forme du dépôt qui prouve l'absence du secret dans `ps` |
| Comptes persistants de dev | Réutiliser seed-test-accounts.sh pour la prod | Nouvelle bibliothèque smoke jetable | seed-test-accounts crée des comptes persistants non purgés — contrat opposé au smoke |
| Traversée de l'inscription par email réel | Lire une boîte mail e2e, ou `generate_link` Admin pour bypasser | Tester la traversée JUSQU'AU hand-off (sessionStorage + navigation), redeem avec compte pré-confirmé | Aucun accès IMAP assumé ; `generate_link` créerait un chemin que le vrai utilisateur n'emprunte jamais |

**Key insight:** tout ce que la phase ajoute existe déjà sous une forme éprouvée dans le dépôt — la valeur du plan est le **câblage**, pas l'invention.

## Runtime State Inventory

> Phase script/e2e sans rename ni migration — inventaire simplifié aux catégories concernées.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Comptes e2e résiduels possibles dans `auth.users` d'une prod si un run précédent a mal purgé — c'est précisément l'objet de EE-02 (liste via `GET /admin/users?filter=`, signale, ne supprime pas) | Détection + signalement dans le rapport |
| Live service config | `ENABLE_EMAIL_AUTOCONFIRM=false` est la config prod réelle (vérifié `.env.example` l.185) ; le smoke ne doit JAMAIS demander à la changer | Aucun — contrainte, pas un chantier |
| OS-registered state | None — aucun daemon/task scheduler touché (DS-01 : pas de cron) | None |
| Secrets/env vars | `SUPABASE_SECRET_KEY` lu du `.env` stack (canal `stack_value` existant l.55) ; nouvelle contrainte : ne jamais l'écrire en argv (voir Pattern 1) ; les ARG frontend restent `VITE_SUPABASE_URL` + clé publiable (§8.4) — la phase ne touche aucun Dockerfile | Audit de la purge existante l.211-212 |
| Build artifacts | None — aucun build touché ; la suite e2e standard reste build+preview | None |

## Common Pitfalls

### Pitfall 1: Le secret secrète en ligne de commande (existant dans le code cible)
**What goes wrong:** `curl -H "apikey: $SECRET_KEY"` (l.211-212 actuel) expose la clé dans `ps`/`/proc/PID/cmdline` — §2.7 H violé même si le code est « déjà là ».
**Why it happens:** le fallback historique « pas de secret → on laisse » (l.197) a laissé la purge en rough-edges.
**How to avoid:** pattern `-K` 0600 (seed-test-accounts.sh l.58-73) pour TOUT appel porteur du secret ; refus explicite sans secret (CS-02 transforme le fallback l.197 en `exit 1`).
**Warning signs:** `ps aux | grep curl` pendant un run affiche la clé.

### Pitfall 2: Purge non prouvée = comptes e2e polluant la prod
**What goes wrong:** la purge actuelle est `curl … || true` suivie d'un echo inconditionnel « comptes de test supprimés » (l.211-214) — un échec HTTP passe pour un succès.
**How to avoid:** purge vérifiée par re-delete → 404 (Pattern 4), statut dans le rapport pass/fail, exit code non nul si un compte survit à son run.
**Warning signs:** comptes `e2e*` visibles dans Studio en prod après un run vert.

### Pitfall 3: 422 de GoTrue mal interprété comme throttling
**What goes wrong:** un 422 `email_exists` (re-run trop rapproché avec le même runid, ou horloge) traité comme un 429 → retry futile, ou pire un compte existant jamais purgé.
**How to avoid:** distinguer dans le `case` : 429 → pause fixe + un retry (DS-02) ; 422 → échec nommé immédiat avec le corps (le corps GoTrue nomme le motif : `email_exists`, `weak_password`…).
**Warning signs:** deux runs au même `date +%s` — le runid EE-01 doit incorporer un entropy supplémentaire (`$$` est déjà utilisé l.172, à conserver).

### Pitfall 4: La spec réelle tourne sous les DEUX projets Playwright
**What goes wrong:** `playwright.config.ts` définit chromium **et** mobile (l.22-25) — un `npx playwright test` lance la spec réelle 2×, créant deux fois le même parcours (redeem consommé au 1er, 410/épuisé au 2e) et doublant les créations de comptes.
**How to avoid:** le wrapper lance `--project=chromium` (ou un projet dédié), et la spec vérifie explicitement le mobile **via le même compte** si JT-02 l'exige — jamais un second run indépendant du redeem.
**Warning signs:** un run de spec = 2N comptes créés.

### Pitfall 5: `filter=` Admin API et encodage du `+`
**What goes wrong:** la détection résiduelle EE-02 filtre sur `e2e+…` — le `+` dans une query string URL est décodé en espace par certains serveurs ; le filter serait muet et « aucun résidu » serait un succès faux (§2.7 F).
**How to avoid:** URL-encoder (`e2e%2B`) ou filtrer sur la partie avant le `+` (`filter=e2e` est un match sous-chaîne sur le user GoTrue), puis re-vérifier chaque résultat par son email avant de signaler.
**Warning signs:** la liste résiduelle renvoie 0 ligne alors que Studio montre des comptes `e2e*`.
[VERIFIED: Context7 /supabase/auth — GET /admin/users, `filter` = « Substring match on user »]

### Pitfall 6: Le run séparé régresse le mode démo de la suite standard
**What goes wrong:** supprimer les 2 tests périmés (JT-03) sans consigner change la signature e2e : le run standard passe de « 1 rouge documenté (join-token) » à 0 rouge — c'est le SUJET (TEST-03 atteint sans exception), mais la signature 38-E2E-SIGNATURE.md doit être mise à jour ou la différence sera « inexpliquée » au prochain run.
**How to avoid:** mettre à jour `38-E2E-SIGNATURE.md` (ou son successeur) : les 2 rouges join-token soldés par le nouveau fichier, la nouvelle baseline de skips re-datée.
**Warning signs:** un run standard dont le compte de tests a changé sans note.

### Pitfall 7: Atterritmage D-09 de la spec — le délai 3000 ms
**What goes wrong:** le post-échec navigate vers `/foyer` après `DELAI_ATERRISSAGE_MS = 3000` (join-household-page.tsx l.47, l.160) ; une assertion qui attend la navigation au-delà du timeout `expect` (8 s, config l.14) est fragile, une assertion qui la attend avant 3 s est fausse.
**How to avoid:** assert le message D-17 (`role="alert"`) immédiatement, puis `waitForURL` avec timeout > 3000 ms explicite pour la navigation — ne jamais figer l'horloge (interdit, Phase 38).
**Warning signs:** flake 1/N sur le test D-17 uniquement.

## Code Examples

### Création Admin (chemin prod)
```sh
# Source: Context7 /supabase/auth (exemple officiel de curl Admin) + pattern -K du dépôt
# Réponse : objet user plat, "id" extrait par json_string existant
body='{"email":"e2e+'"$RUN_ID"'@'"$E2E_DOMAIN"'","password":"'"$PW"'","email_confirm":true}'
CODE="$(curl -sS -o "$TMP_DIR/body" -w '%{http_code}' -X POST "$API/auth/v1/admin/users" \
  -K "$admin_cfg" -H 'Content-Type: application/json' --data "$body")"
UID="$(json_string "$(cat "$TMP_DIR/body")" id)"
```
[VERIFIED: Context7 /supabase/auth — « create a confirmed user » curl officiel avec `email_confirm:true`]

### Connexion par mot de passe (pour la session de la spec)
```sh
# Le compte créé via Admin est confirmé : le grant password fonctionne sans autoconfirm.
# Réponse : {"access_token":"…", "refresh_token":"…"} — json_string existant suffit.
call "/auth/v1/token?grant_type=password" POST \
  "{\"email\":\"$MAIL\",\"password\":\"$PASSWORD\"}" ""
```
[ASSUMED: endpoint `/auth/v1/token?grant_type=password` — standard GoTrue, non vérifié cette session ; le smoke actuel n'en a pas besoin car signup renvoie le JWT, mais le chemin prod admin n'en renvoie PAS — la session s'obtient par ce grant. Vérifier à l'exécution.]

### Extraction `mailer_autoconfirm`
```sh
# GET /auth/v1/settings — public, sans clé [VERIFIED: Context7 /supabase/auth]
call "/auth/v1/settings" GET "" ""
AUTOCONFIRM="$(json_string "$BODY" mailer_autoconfirm)"   # "false" en prod
```

### Bornage de la spec réelle (flux JT-02 → testable en prod)
| Point JT-02 | Testable en prod ? | Méthode |
|---|---|---|
| Création foyer + token copiable + QR | Oui (compte smoke connecté par mot de passe) | UI `/foyer/nouveau` → heading « Votre foyer est prêt » + QR visible |
| Pré-écran public nommant l'invitant (D-20) | Oui | naviguer `/foyer/rejoinder?token=…` SANS session → titre attendu (preview Edge publishable) |
| Traversée D-06 vers l'inscription | Oui jusqu'au hand-off | CTA « Continuer vers l'inscription » → assert navigation `/connexion` + mode inscription (state.mode) ; assert sessionStorage posée via `page.evaluate` ; PAS de passage réel par email |
| Redeem authentifié D-08 | Oui | 2e compte smoke, login par mot de passe, retour au pré-écran (sessionStorage réadopté, D-07) → CTA « Rejoindre le foyer » → toast + `/accueil` |
| Message D-17 sur token mort | Oui | token invalide ≥ 22 car → `role="alert"` « Ce lien d’invitation n’est plus valable… » (D-03, pré-écran) et verbatim redeem pour le mort authentifié |
| Atterrissage D-09 | Oui | `waitForURL('/foyer')` après > 3 s (Pitfall 7) |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Smoke dépendant de l'autoconfirm (`/signup`) | Smoke via Admin API + sonde settings | Cette phase | Le mode prod est testé en prod ; dev/prod mêmes règles CS-02 |
| Purge « best effort » (`|| true` + echo) | Purge vérifiée re-delete → 404 | Cette phase (§2.7 F formalisé en 38) | Un run sans purge prouvée est un échec |
| Spec join-token sur le mode démo (pré-31-03) | Spec réelle contre stack déployée, run séparé | 31-03 (flux) / cette phase (couverture) | Signature e2e du jalon change : 0 rouge assumé |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `POST /auth/v1/token?grant_type=password` fournit une session pour un compte confirmé via Admin | Code Examples | La spec réelle ne peut pas ouvrir de session si faux — détection immédiate au premier run, fallback : `generate_link` Admin (changerait le chemin testé, à consigner) |
| A2 | Le sous-domaine e2e n'existe pas encore dans la config DNS réelle (docs/DEPLOIEMENT-PROD.md ne mentionne que `ensemble.` / `api.jeremymaillot.fr`) | EE-01 / Open Questions | Si l'utilisateur a déjà un sous-domaine, la valeur est à remplacer ; sinon, noter qu'un compte GoTrue admin-créé n'envoie JAMAIS d'email (SMTP jamais sollicité), donc le sous-domaine n'a pas besoin d'exister dans le DNS — seule compte l'absence de collision avec un vrai destinataire |
| A3 | GoTrue Admin API n'est pas soumise au limiteur email (GOTRUE_RATE_LIMIT_EMAIL_SENT couvre /signup,/invite,/magiclink,/recover,/otp,/user — /admin/users absent) | DS-02 | Si un limiteur s'applique quand même, le traitement 429 existant (pause + 1 retry) le couvre ; aucun échec de plan |
| A4 | `filter` de GET /admin/users matche l'email en sous-chaîne | Pitfall 5 | Filtre muet → faux « aucun résidu » ; re-vérification par email des résultats obligatoire de toute façon |

## Open Questions

1. **Sous-domaine e2e (EE-01) — quelle valeur exacte ?**
   - What we know: docs/DEPLOIEMENT-PROD.md montre les hôtes réels `ensemble.` + `api.jeremymaillot.fr` ; aucun sous-domaine `e2e.*` documenté.
   - What's unclear: la valeur que l'utilisateur veut (sous-domaine DNS réel vs convention `e2e+runid@ensemble.jeremymaillot.fr`).
   - Recommendation: poser la question en discuss/planning ; en attendant, paramétrer `E2E_DOMAIN` lu du `.env` stack (variable `E2E_MAIL_DOMAIN`, défaut proposé : `ensemble.jeremymaillot.fr`) — techniquement aucun DNS requis puisque les comptes admin ne déclenchent aucun email, mais EE-01 exige l'alignement explicite.
2. **Sortie de purge concurrente avec un run humain ?** EE-02 borne la purge à son runid — suffisant ; pas de question bloquante.
3. **Un 3e point JT-02, « message uniforme D-03 sur token expiré » vs « token mort »** : le pré-écran ne distingue pas (D-03) — la spec teste le message uniforme, pas les motifs ; couvert par D-17 au redeem authentifié. Aucun arbitrage requis.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Stack Supabase déployée (prod ou dev) | Tout run smoke + spec réelle | ✗ (machine de travail — vérifiable à l'exécution via `/auth/v1/health`) | — | La chaîne standard (typecheck/vitest/build) reste exécutable localement ; le run réel est un passage obligatoire documenté (DS-01, analogue test-dispatch-push.sh) |
| curl + POSIX sh | Script smoke | ✓ | système | — |
| Playwright | Spec réelle | ✓ | déjà dans app | — |
| `SUPABASE_SECRET_KEY` dans le `.env` stack | Appels Admin | à l'exécution (hôte de la stack) | — | Refus explicite (CS-02) — jamais de contournement |

**Missing dependencies with no fallback:** le run réel contre la stack — mais c'est le contrat de la phase (run manuel documenté, pas un blocage de plan : le plan livre le code + la doc, l'exécution prouve).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5 (unités, existant) + Playwright (e2e, existant) + chaîne scripts (§2.7) |
| Config file | `app/playwright.config.ts`, `app/vitest.config.*` |
| Quick run command | `cd app && npm run typecheck && npx vitest run` |
| Full suite command | `cd app && npm run typecheck && npm test && npm run build && npm run test:e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SMOKE-01 | Création/purge/résidus/422-429 | exécution script (contre stack réelle) | `sh scripts/smoke-test.sh` (run manuel documenté, DS-01) | ❌ le script modifié est le livrable ; commandes `test-check-sql-statique.py` si scripts Python touchés (non prévu) |
| SMOKE-01 | Le script refuse sans secret | statique/lecture du script | vérification par relecture + `grep -n "SECRET_KEY" scripts/*.sh` (aucun `-H ".*SECRET.*"` inline) | manuel — consigné dans le résumé |
| TEST-02 | Spec réelle verte contre stack | e2e réel (run séparé) | `sh scripts/test-join-token-real.sh` (wrapper) | ❌ Wave 0 = le livrable |
| TEST-02 | Suite standard reste 100 % verte, 0 rouge | e2e standard | `cd app && npm run test:e2e` | ✅ existant |
| — | Régression des unités | unit | `cd app && npm test` | ✅ existant |

### Sampling Rate
- **Per task commit:** `cd app && npm run typecheck && npm test` (aucun changement app excepté suppression des 2 tests — la suite standard doit rester verte).
- **Per wave merge:** chaîne complète §2.7 (build + test:e2e inclus).
- **Phase gate:** run réel du smoke + de la spec contre la stack (documenté, DS-03) + signature e2e mise à jour.

### Wave 0 Gaps
- None — aucun framework à installer ; les « tests » de cette phase SONT les scripts/spec livrés.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | GoTrue Admin API (clé secrète service) ; comptes e2e via le même GoTrue que les vrais inscrits |
| V3 Session Management | yes | JWT émis par GoTrue, éphémères, jamais persistés ; session spec par grant password |
| V4 Access Control | yes | RLS inchangée ; le smoke la vérifie (CS-03) ; aucun privilège admin côté client |
| V5 Input Validation | yes | Zod min 22 (page + Edge) inchangé ; le smoke n'injecte aucune donnée utilisateur |
| V6 Cryptography | yes | HMAC token inchangé ; la clé secrète ne circule QUE via `.env` stack → fichier `-K` 0600 |
| V7 Secrets | yes | §2.7 H : jamais argv (`-K`), jamais ARG frontend, jamais log ; correction de la violation existante l.211-212 |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Clé secrète dans `ps`/logs | Information Disclosure | `curl -K` 0600 + suppression à la sortie ; aucun echo de clé (le script actuel l.19 dit « Aucune clé n'est affichée » — à préserver) |
| Comptes e2e résiduels en prod | Spoofing/Repudiation | Purge vérifiée (re-delete → 404) + détection résiduelle EE-02 qui signale (§2.7 F) |
| Email e2e collidant avec un vrai destinataire | Spoofing | Préfixe `e2e+<runid>@` sur domaine réservé (EE-01) — et les comptes admin ne déclenchent aucun email réel |
| Skip silencieux donnant un vert mensonger | Repudiation | Pas de `test.skip` conditionnel (JT-03) ; refus explicite sans prérequis ; signature e2e re-datée |
| Retry générique masquant une vraie erreur | Repudiation | 422/429 distingués, un seul retry, échec nommé avec corps (DS-02, §2.7 F) |

## Sources

### Primary (HIGH confidence)
- Context7 `/supabase/auth` (github.com/supabase/auth) — POST /admin/users avec `email_confirm:true` (exemple curl officiel), DELETE /admin/users (200 {} ou 204), GET /admin/users (`filter` sous-chaîne, pagination), GET /settings (`mailer_autoconfirm`, public), rate limiting (429 `over_request_rate_limit`, GOTRUE_RATE_LIMIT_EMAIL_SENT par endpoint)
- Code lu cette session : `scripts/smoke-test.sh` (intégralité), `scripts/seed-test-accounts.sh` (l.1-90), `app/playwright.config.ts`, `app/e2e/critical-paths.spec.ts` (l.100-174), `app/src/modules/landing/join-household-page.tsx`, `app/src/lib/invites.ts`, `app/e2e/offline-shared-device.spec.ts` (l.30-50), `supabase-project/.env.example` (l.178-196)
- `.planning/research/ARCHITECTURE.md` (§4 smoke, §6 spec périmée), `.planning/research/PITFALLS.md` (Pitfall 6), `.planning/milestones/.../31-03-SUMMARY.md`, `.planning/phases/38-*/38-E2E-SIGNATURE.md` (cité par CONTEXT.md)

### Secondary (MEDIUM confidence)
- docs/DEPLOIEMENT-PROD.md — hôtes réels (`ensemble.` / `api.jeremymaillot.fr`) ; aucun sous-domaine e2e documenté (→ Open Question 1)

### Tertiary (LOW confidence)
- A1 (`grant_type=password` sur compte admin-créé) — [ASSUMED], vérification triviale au premier run

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — tout existe dans le dépôt, endpoints GoTrue vérifiés officiellement
- Architecture: HIGH — patterns éprouvés localement (seed-test-accounts) + contrats de phase 38/31-03 lus
- Pitfalls: HIGH — la plupart sont des défauts observés (l.211-212 secret en argv ; l.211-214 purge muette ; double projet Playwright)
- Assumptions: A1-A4 explicitement taguées, aucune bloque le plan

**Research date:** 2026-11-09
**Valid until:** 2026-12-09 (stable — endpoints GoTrue self-hosted épinglés par snapshot)
