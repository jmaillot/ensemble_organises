# Phase 40: Ardoise « Rejoindre via mon compte » - Research

**Researched:** 2026-11-09
**Domain:** Edge Function (Deno) + SQL migrations (PostgreSQL/RLS) + React Router flow — pont code de partage ardoise → adhésion foyer
**Confidence:** HIGH (toutes les affirmations clés sont vérifiées dans le code source ce session)

## Summary

La phase remplace le chemin `joinArdoise(code)` (action `join` de l'Edge `ardoise-invite`, refus 403 du modèle binaire pour un non-membre) par un pont vers le flux d'invitation foyer existant : un invité **connecté** confirme dans un dialog, le serveur échange son code de partage ardoise contre un **token d'invitation foyer à usage unique**, puis l'UI consomme tel quel le pré-écran `/foyer/rejoindre?token=…` et son échange `household-invite`. La seule écriture SQL nouvelle porte sur la réconciliation `invite:` → `membre:` dans la même transaction que l'adhésion.

Deux découvertes structurent le plan. **(1)** Le RPC existant `create_household_invite_token` exige le rôle **admin** (`private.assert_household_admin`, 0176) — l'invité n'est même pas membre du foyer, donc l'action `household-token` ne peut PAS le réutiliser : il faut une nouvelle fonction SQL `SECURITY DEFINER` (usage `service_role` uniquement) qui émet un token bridge `max_uses=1`, expiration courte. **(2)** La réconciliation (décision 3, verrouillée) doit vivre dans `redeem_household_invite_token` (nouvelle version de migration, correction vers l'avant) car c'est la seule transaction d'adhésion — mais cette fonction ne connaît NI l'ardoise ni l'invité ; la règle d'identité « guest_id correspond à l'invité » n'est pas encore tranchée (Open Question 1, à vérifier avec l'utilisateur avant verrouillage du plan).

**Primary recommendation:** nouvelle action Edge `household-token` sur `ardoise-invite` (mode `user` uniquement) + nouvelle migration (fonction d'émission bridge + version enrichie de `redeem_household_invite_token` avec réconciliation transactionnelle) + enrichissement `link-view` (nom du foyer) + dialog ConfirmDialog sur la page invitée + atterrissage `/ardoise` conditionnel dans `join-household-page`. Aucune dépendance npm nouvelle.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**1. Pont code partage → adhésion foyer : échange serveur code→token**
- Nouvelle action Edge (sur `ardoise-invite`, ex. `household-token`) : un utilisateur **connecté** qui présente un code de partage ardoise valide reçoit un **token d'invitation foyer à usage unique émis côté serveur**.
- L'UI suit ensuite le flux existant `/foyer/rejoindre?token=…` (échange `household-invite`, transaction, HMAC) — **rien du flux foyer n'est réinventé**.
- Espaces de clés intacts : le code de partage ardoise reste hashé dans son modèle (jamais de colonne `household_id` ajoutée, ARD-03) ; le token foyer vit le temps de la redirection seulement.

**2. Confirmation pré-adhésion : dialog maison sur la page invitée**
- Le clic « Rejoindre via mon compte » ouvre une **confirm-dialog sur la page invitée** (« Vous allez rejoindre le foyer X ») AVANT de lancer l'échange code→token. Jamais d'adhésion implicite au clic (anti-feature confirmée, REQUIREMENTS.md).
- Le **nom du foyer** affiché vient de la **vue invitée** (`link-view` enrichie) — l'ardoise porte déjà `household_id` côté serveur, l'enrichissement est naturel, pas d'appel supplémentaire.
- Le token foyer n'est émis qu'après confirmation — la confirmation précède l'échange.

**3. Réconciliation `invite:` → `membre:` : transactionnelle à l'adhésion (ARD-02 tranchée)**
- Dans la **même transaction** que l'adhésion au foyer : les lignes `expense_participants` où `guest_id` correspond à l'invité basculent en `participant_type='membre'` + `member_id`.
- Le solde du foyer intègre le passé invité ; aucun orphelin silencieux.
- Prouvé par tests SQL négatifs ET positifs : lignes migrées, part zéro du passé respectée, déjà admin, déjà membre, double redemption concurrente (`FOR UPDATE`), rôle forcé côté serveur uniquement (ARD-03).

**4. Atterrissage post-adhésion : `/ardoise` du foyer**
- Après l'échange du token, redirection vers **`/ardoise`** (module ardoise du foyer), pas le dashboard. ARD-01 l'exige explicitement.
- Le mapping participant des dépenses reflète la réconciliation (décision 3) : le solde affiché inclut les participations passées « invité ».

### Code context (actifs réutilisables, du CONTEXT.md)
- `app/src/modules/ardoise/guest-ardoise-page.tsx` — la page invitée ; c'est le chemin `join` qui est remplacé par le flux foyer.
- `app/src/modules/ardoise/api.ts` — `joinArdoise`, `GuestArdoiseView` (vue invitée : `link-view`), pattern `InviteRequestError`.
- `supabase/functions/ardoise-invite/index.ts` — Edge avec schéma Zod `discriminatedUnion`, rate-limit mémoire par action, résolution de rôle `service_role` (l.320+), modes `user`.
- `app/src/modules/landing/join-household-page.tsx` — pré-écran join foyer + pattern `state.from` (l.126).
- `supabase/functions/household-invite/index.ts` — échange existant (`redeem`, transaction, HMAC) — **NE PAS le modifier**.
- `app/src/components/ui/confirm-dialog.tsx` — dialog de confirmation standard.
- Migration `0176_token_list_governance.sql` — pattern de preview RPC (pré-écran public).
- Leçon phase 39 (fix `5618352`) : l'Admin API GoTrue brut attend `user_metadata` (pas `data`).

### Anti-features (REQUIREMENTS.md v1.3)
- Adhésion foyer implicite au clic : INTERDITE.
- Toute autre nouvelle fonctionnalité produit : hors périmètre.

### the agent's Discretion
(aucune section explicite — les choix techniques internes, règle d'identité de réconciliation et mécanisme d'atterrissage sont à recommander et à confirmer)

### Deferred Ideas (OUT OF SCOPE)
- (aucune soulevée — la discussion est restée dans le périmètre ARD-01..03)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ARD-01 | Rejoindre le foyer via le flux d'invitation existant, confirmation explicite, atterrissage `/ardoise`, `?code=` préservé via `state.from` | Patterns 2/4/5 ; `state.from` vérifié (sign-in-page l.65-74, join-household-page l.132) ; atterrissage `/accueil` actuel à changer (join-household-page l.152) |
| ARD-02 | Réconciliation `invite:` → `membre:` transactionnelle à l'adhésion | `redeem_household_invite_token` = transaction d'adhésion (0145:178-289) ; réconciliation en nouvelle migration ; Open Question 1 (règle d'identité) |
| ARD-03 | Espaces de clés distincts, jamais de colonne `household_id` sur le modèle de partage, tests SQL négatifs | `ardoises.invite_hash` HMAC `ARDOISE_HMAC_SECRET` ≠ `household_invite_tokens.token_hash` HMAC `INVITE_TOKEN_HMAC_SECRET` (deux secrets dédiés, VERIFIED) ; `redeem_household_invite_token` verrouille `FOR UPDATE` (0145:220-224) ; `supabase/tests/` + `test-db.sh` pour les négatifs |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Vérification du code de partage (actif, non expiré) | API / Backend (Edge `ardoise-invite`) | — | Le HMAC vit côté serveur (`ARDOISE_HMAC_SECRET`), jamais au client |
| Émission du token bridge (max_uses=1, courte expiration) | API / Backend (Edge + nouvelle fonction SQL) | Database | Le RPC existant exige admin ; le bridge est une émission serveur privilégiée |
| Confirmation pré-adhésion (dialog) | Browser / Client | — | Surface UI pure, données issues de `link-view` |
| Adhésion au foyer (redeem, transaction, HMAC, `FOR UPDATE`) | API / Backend (Edge `household-invite`, non modifié) | Database | Consommé tel quel — verrouillé |
| Réconciliation `invite:` → `membre:` | Database (dans la transaction redeem) | — | « Même transaction que l'adhésion » : seule la fonction SQL redeem possède cette transaction |
| Préservation `?code=`/token à travers `/connexion` | Browser / Client (React Router `state` + sessionStorage) | — | Pattern établi D-06/D-07 |
| Atterrissage post-adhésion | Browser / Client (`join-household-page` navigate) | — | Changement de cible de navigation conditionnel |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod (Deno) | `npm:zod@4.6.5` | Validation des entrées Edge (`discriminatedUnion`) | Déjà épinglé dans les deux Edge Functions [VERIFIED: supabase/functions/ardoise-invite/index.ts:54] |
| `@supabase/server` | épinglé par le runtime (`volumes/functions/deno.jsonc`) | `withSupabase({ auth: [...] })` | Spécificateur BARE obligatoire, jamais `npm:@supabase/server` direct [VERIFIED: supabase/functions/ardoise-invite/index.ts:50-52] |
| React Router | 8.x, mode déclaratif, imports depuis `react-router` | `useNavigate`, `useSearchParams`, `state.from` | Convention projet (AGENTS.md §2.1) |
| Radix `react-alert-dialog` | déjà installé | ConfirmDialog | `ConfirmDialog` construit dessus [VERIFIED: app/src/components/ui/confirm-dialog.tsx:1] |
| TanStack Query v5 | déjà installé | `viewQuery` de la page invitée | Existant, inchangé |
| testkit SQL + `test-db.sh` | interne | Tests SQL négatifs/positifs | `sh scripts/test-db.sh [numéro]`, chaque fichier dans SA transaction annulée [VERIFIED: scripts/test-db.sh:1-14] |

### Supporting
Aucune dépendance nouvelle. Tout est déjà présent.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Nouvelle fonction SQL d'émission bridge | Insert direct dans `household_invite_tokens` via `ctx.supabaseAdmin` depuis l'Edge | L'insert direct contourne la pattern RPC du projet (0176, grants explicites) et éparpille la logique de bornes (clamp expiration, max_uses) hors de la base. Recommandé : RPC `SECURITY DEFINER` nouveau, grant `service_role` uniquement, miroir des bornes 0176 |
| Réconciliation dans `redeem_household_invite_token` (migration) | Réconciliation côté Edge après le redeem | Edge = plusieurs appels = pas la « même transaction » exigée par la décision 3 ; refusé |

**Installation:** rien à installer.

**Version verification:** N/A — aucune dépendance externe nouvelle.

## Package Legitimacy Audit

> Aucun paquet externe n'est installé par cette phase (Edge Deno : imports existants épinglés ; frontend : dépendances existantes).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (aucun) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Invité connecté, sans foyer
        │  GET /invitation/ardoise?code=…
        ▼
[guest-ardoise-page] ── useQuery ──► Edge ardoise-invite {action:'link-view'}
        │                              └─► réponse {ardoise:{name…}, expenses, settlement}
        │                                  (ENRICHIE: householdName — Open Q2)
        ▼
Clic « Rejoindre via mon compte » ──► ConfirmDialog « Vous allez rejoindre le foyer X »
        │  (aucun réseau tant que pas confirmé)
        ▼ confirmation
Edge ardoise-invite {action:'household-token', code}      [NOUVEAU, mode 'user' uniquement]
        │  1. HMAC(code, ARDOISE_HMAC_SECRET) → ardoise active, non expirée
        │  2. foyer = ardoise.household_id
        │  3. NOUVELLE fonction SQL : émet token foyer max_uses=1, expiration courte
        │     (HMAC INVITE_TOKEN_HMAC_SECRET — secret distinct)
        ▼
navigate('/foyer/rejoindre?token=…')
        │  (si session perdue en chemin : /connexion avec state.from — pattern existant)
        ▼
[join-household-page] (existant) ── clic explicite ──► Edge household-invite {action:'redeem'}  [NON MODIFIÉ]
        │                                                └─► RPC redeem_household_invite_token
        │                                                    UNE transaction, FOR UPDATE :
        │                                                    - contrôle token, use_count<max_uses
        │                                                    - insert household_members (rôle 'membre' forcé)
        │                                                    - NOUVEAU: réconciliation expense_participants
        │                                                      invite:→membre:  [NOUVELLE MIGRATION]
        ▼
loadHousehold() → navigate('/ardoise')   [CHANGEMENT: était '/accueil']
```

### Recommended Project Structure
```
app/src/modules/ardoise/guest-ardoise-page.tsx    # + dialog, nouvel appel household-token
app/src/modules/ardoise/api.ts                    # + exchangeArdoiseCodeForHouseholdToken()
app/src/modules/landing/join-household-page.tsx   # + atterrissage conditionnel /ardoise
supabase/functions/ardoise-invite/index.ts        # + action 'household-token' (user only)
supabase/migrations/0180_*.sql                    # émission bridge + redeem enrichi (réconciliation)
supabase/tests/00XX_ardoise_bridge.sql            # négatifs ET positifs ARD-03
```

### Pattern 1: Ajout d'une action Edge sur `ardoise-invite`
**What:** nouveau membre du `discriminatedUnion` + entrée `LIMITS` + handler + branchement dans le point d'entrée.
**When to use:** l'action `household-token`.
**Example:**
```typescript
// Source: supabase/functions/ardoise-invite/index.ts:108-174, 241, 837-855
// 1. Schéma (code même validation que 'join', l.134-142)
z.object({ action: z.literal('household-token'), code: z.string().trim().min(22).max(512)
  .regex(/^[A-Za-z0-9_-]+$/, 'Code invalide.') }),
// 2. Rate limit (l.241) — ajouter 'household-token' à LIMITS (ex. 8 comme join/redeem)
// 3. Point d'entrée : l'action DOIT être traitée après le garde isUser (l.846-848)
//    — mode 'user' uniquement, JAMAIS accessible en publishable.
```
**Point d'attention :** `handleLinkView` (l.793-809) est le modèle de vérification « code actif, non expiré » à répliquer.

### Pattern 2: Émission du token bridge — le RPC existant est inutilisable
**What:** `create_household_invite_token` appelle `private.assert_household_admin(p_household_id, p_actor_id)` — l'invité n'est pas admin, l'appel lèverait 403.
**Example:**
```sql
-- Source: supabase/migrations/0176_token_list_governance.sql:78
perform private.assert_household_admin(p_household_id, p_actor_id);
-- Source: 0145_convert_managed_children.sql:214 — le redeem force le rôle :
v_role := 'membre';
```
**When to use:** nouvelle fonction `create_household_bridge_token(p_household_id text, p_token_hash text)` `SECURITY DEFINER set search_path = ''`, `max_uses := 1` en dur, expiration courte en dur (ex. 15 min — valeur à trancher au plan), grants : `revoke all … from public, anon, authenticated; grant execute … to service_role;` (miroir 0009:78-86). `created_by` : la colonne existe (insert 0176:96-101) — passer l'actor ou un marqueur.

### Pattern 3: Migration SQL — correction vers l'avant, définition effective
**What:** ne jamais réécrire 0145 ; copier la définition effective de `redeem_household_invite_token` (celle de 0145, qui recopie 0017) dans une nouvelle migration et y insérer la réconciliation APRÈS l'insert `household_members` et AVANT le `update household_invite_tokens` (même transaction).
**Rules (AGENTS.md §2.7, toutes vérifiées applicables ici):**
- `set search_path = ''` → toute table s'écrit `public.xxx` [VERIFIED: 0145:188 et corps]
- `returns jsonb` (pas `returns table`) — pas de risque de variable ambiguë ici
- L'identité du guest doit être résoluble dans CETTE fonction (Open Question 1)
- Conflit d'unicité : `expense_participants_member_unique` sur `(expense_id, member_id)` nulls not distinct [VERIFIED: migrations/0015_share_uniqueness.sql:47-48] — si l'utilisateur participe déjà en tant que membre à une dépense où son guest participe aussi, l'UPDATE doit choisir (fusionner = garder la ligne membre existante et supprimer la ligne invite ? à trancher au plan ; `on conflict do nothing` après conversion laisse un doublon invité — interdit par la contrainte seulement si member_id identique)
- Test SQL : chaque fichier de `supabase/tests/` tourne dans sa transaction annulée ; assertions bornées par foyer ; `testkit.eq` exige des arguments du même type ; un échec sur fichier nouveau est la norme

### Pattern 4: Préservation de paramètre via `state.from`
**Verified flow:** `join-household-page` navigue vers `/connexion` avec `{ state: { from: '/foyer/rejoindre?token=…', mode: 'inscription' } }` [VERIFIED: app/src/modules/landing/join-household-page.tsx:132] ; `sign-in-page` lit `location.state.from` et le filtre par `internalPathOf` (même origine uniquement) [VERIFIED: app/src/modules/landing/sign-in-page.tsx:65-74,134]. Le token foyer traverse déjà les redirections par ce mécanisme. Pour le `?code=` de la page invitée : le guest connecté n'est pas redirigé vers `/connexion` dans le flux nominal ; le cas « session expirée pendant l'échange » reçoit un 401 du garde `isUser` (ardoise-invite l.846-848) — l'afficher tel quel (WR-02) et proposer « Créer un compte » (chemin existant). Le critère de succès 2 est satisfait si le `?code=` reste dans l'URL de la page invitée jusqu'à la confirmation, puis le token voyage par URL vers `/foyer/rejoindre` — rien à inventer.

### Pattern 5: Atterrissage conditionnel `/ardoise`
**Verified:** `join-household-page` navigue `'/accueil'` après succès [VERIFIED: join-household-page.tsx:152]. Le changement minimal : un marqueur de provenance posé par `guest-ardoise-page` avant la navigation vers `/foyer/rejoindre` (sessionStorage sur le modèle `setPendingInviteToken` [VERIFIED: app/src/lib/invites.ts:216-243], ou paramètre URL `&dest=ardoise` porté par le lien). sessionStorage est préféré : le token reste le seul paramètre URL, et le pattern pending-* est établi (D-06). Effacer le marqueur après usage (miroir `clearPendingInviteToken`). Après redeem : `loadHousehold()` rafraîchit l'appartenance — la garde `RequireHousehold` (router.tsx:156-162) passe alors.

### Anti-Patterns to Avoid
- **Réutiliser `create_household_invite_token` pour le bridge :** il exige admin (0176:78) — 403 garanti.
- **Réconcilier depuis l'Edge après le redeem :** plusieurs appels = pas la même transaction ; orphelin possible en cas d'échec entre les deux.
- **Maquiller un échec serveur en succès** (WR-01/WR-02) : le statut HTTP porte la distinction, jamais la copie du message.
- **Ajouter `household_id` au modèle de partage ardoise :** interdit par ARD-03.
- **Modifier l'Edge `household-invite` :** verrouillé (CONTEXT).
- **Redeem au chargement d'une page** (D-08) : le pré-écran exige déjà un clic explicite ; ne pas l'automatiser.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Génération token + HMAC | nouvel utilitaire | copier les helpers existants des Edge (generateToken/hmacSha256Hex identiques dans les deux fonctions) | Même format base64url ≥128 bits, tests existants |
| Rate limiting | compteur ad hoc | entrée dans `LIMITS` de ardoise-invite | Mécanisme en place par action [VERIFIED: index.ts:240-271] |
| Confirmation non destructive | dialog ad hoc | `ConfirmDialog` avec `destructive={false}` | Bouton primary automatique [VERIFIED: confirm-dialog.tsx:58] |
| Tests SQL négatifs | script psql maison | `testkit` + `sh scripts/test-db.sh <fichier>` | Transactions annulées, assertions typées |
| Traduction d'erreurs RPC | mapping nouveau | `translateRpcError` existante + motifs posés en base | La base est l'unique source de vérité des refus |

**Key insight:** toute la mécanique dure (HMAC, transaction, verrou, rate limit) existe et est testée ; la phase n'ajoute qu'un pont et une réconciliation.

## Common Pitfalls

### Pitfall 1: Le RPC d'émission exige admin
**What goes wrong:** appeler `create_household_invite_token` depuis `household-token` → 403 « réservée aux administrateurs ».
**Why:** `private.assert_household_admin` (0176:78).
**How to avoid:** nouvelle fonction SQL dédiée au bridge, bornes en dur (max_uses=1, expiration courte), grant service_role seul.
**Warning signs:** erreur 42501 au test de l'action.

### Pitfall 2: La règle d'identité de la réconciliation est indéterminée
**What goes wrong:** `redeem_household_invite_token` ne connaît ni l'ardoise ni l'invité (arguments : token_hash, user_id, display_name, avatar_url, role) [VERIFIED: 0145:178-184] ; un link-view visiteur n'a CRÉÉ AUCUNE ligne `ardoise_guests` (lecture anonyme, « aucune ligne invitée créée ») — seul un ancien passage `redeem-guest` (pseudonyme + ticket) laisse des participations `invite:`.
**Why:** le lien est anonyme par conception ; l'invité n'a pas d'identité liée à son pseudonyme.
**How to avoid:** trancher AVANT le plan (Open Question 1). Deux options : (a) correspondance par `display_name` (profil vs `ardoise_guests` des ardoises du foyer, insensible à la casse) — zéro schéma nouveau, ambigu en cas d'homonymes ; (b) pont d'identité persisté par l'action `household-token` (elle connaît code→ardoise et user) dans une petite table nouvelle, lue par le redeem enrichi — précis, mais ajoute une table (vérifier avec l'utilisateur que ce n'est pas un « modèle de partage » au sens ARD-03 — ce n'en est pas un : aucune colonne `household_id` sur `ardoises`/`ardoise_guests`).
**Warning signs:** au plan, une tâche « réconciliation » sans règle de correspondance écrite.

### Pitfall 3: Conflit d'unicité à la réconciliation
**What goes wrong:** `expense_participants_member_unique (expense_id, member_id)` — si l'utilisateur participe déjà à la dépense en tant que membre ET que son guest y participe aussi, la conversion crée un doublon et la transaction échoue (23505).
**How to avoid:** décider la politique de fusion (typiquement : supprimer la ligne `invite:` quand une ligne `membre:` existe déjà pour la même dépense — les parts s'additionnent ou non, à trancher) et l'écrire dans la migration + un test dédié.
**Warning signs:** test « guest et membre déjà présents sur la même dépense » absent.

### Pitfall 4: Deux confirmations successives
**What goes wrong:** l'utilisateur confirme dans le dialog, puis le pré-écran `/foyer/rejoindre` lui demande de re-confirmer (« Rejoindre le foyer ») — sensation de double question.
**Why:** D-08 interdit le redeem au chargement ; le pré-écran est consommé tel quel.
**How to avoid:** assumer les deux confirmations (anti-feature prioritaire) et le dire dans le plan ; ne PAS auto-cliquer ni modifier join-household-page pour reddem au montage. Éventuellement le mentionner dans la copy du dialog (« Vous confirmerez sur l'écran suivant ») — décision copy au plan.

### Pitfall 5: Enrichissement `link-view` sans casser le contrat
**What goes wrong:** `GuestArdoiseView` est typé côté client [VERIFIED: api.ts:383-395] ; ajouter un champ est rétro-compatible, mais le nom du foyer peut être NULL (foyer supprimé).
**How to avoid:** `householdName: string | null` dans la réponse et le type ; titre de repli du dialog à définir (UI-SPEC ⚠ unresolved : « Vous allez rejoindre le foyer de cette ardoise » proposé).
**Warning signs:** crash de rendu du dialog sur foyer supprimé.

### Pitfall 6: SQL — noms non qualifiés et dollar-quotes
**What goes wrong:** sous `search_path = ''`, `join tasks` résout NULL/erreur ; le contrôle statique signale les CTE auto-référencés et les littéraux ouverts.
**How to avoid:** `public.` partout ; `python3 scripts/check-sql-statique.py` + ses propres tests avant tout commit ; ne pas raffiner un motif d'assertion texte jusqu'au vert (AGENTS §2.7D).

### Pitfall 7: 401 session expirée pendant l'échange
**What goes wrong:** `household-token` exige `authMode === 'user'` ; session expirée → 401 « Connectez-vous pour rejoindre une ardoise. »
**How to avoid:** afficher tel quel + conserver le chemin existant « Créer un compte »/reconnexion avec `state.from` vers la page invitée (l'URL porte encore `?code=`) — c'est le critère de succès 2.

## Runtime State Inventory

> Phase feature (pas de rename/migration de données à grande échelle) — inventaire ciblé : la réconciliation EST une migration de données vivantes.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `expense_participants` lignes `participant_type='invite'` (guest_id) d'ardoises dont le foyer sera rejoint via bridge — migrées à la volée dans la transaction redeem | Migration SQL transactionnelle (nouvelle version redeem) |
| Stored data | `ardoise_guests` : lignes conservées après réconciliation (historique, `paid_by_guest` référencé par FK `restrict` [VERIFIED: 0056_ardoise_guests_parts.sql:14]) | NE PAS supprimer les guests : les payeurs passés `expenses.paid_by_guest` pointent dessus |
| Live service config | Variables `ARDOISE_HMAC_SECRET` (existe) et `INVITE_TOKEN_HMAC_SECRET` (existe, utilisé par household-invite) — la nouvelle fonction SQL réutilise le second via le hash fourni par l'Edge | Aucune nouvelle variable — l'Edge ardoise-invite doit lire `INVITE_TOKEN_HMAC_SECRET` en plus (env serveur, jamais client) |
| OS-registered state | None — verified: aucun service OS concerné | — |
| Secrets/env vars | L'Edge `ardoise-invite` gagne une lecture `env('INVITE_TOKEN_HMAC_SECRET')` — noms inchangés | Code only |
| Build artifacts | `volumes/functions/ardoise-invite` — `sh scripts/deploy-functions.sh` à rejouer après modification de l'Edge | Redeploy functions |

## Code Examples

### Nouvelle action Edge (squelette, patterns existants)
```typescript
// Source: patterns vérifiés dans supabase/functions/ardoise-invite/index.ts
async function handleHouseholdToken(admin: AdminClient, userId: string, body: RequestBody & { action: 'household-token' }) {
  const secret = checkSecret();                       // ARDOISE_HMAC_SECRET (code)
  const codeHash = await hmacSha256Hex(body.code, secret);
  // 1. Vérifier le code comme handleLinkView (l.797-807): actif, non expiré
  const { data: ardoise } = await admin.from('ardoises')
    .select('id, household_id, is_active, expires_at')
    .eq('invite_hash', codeHash).single();
  if (!ardoise || !(ardoise as { is_active: boolean }).is_active) {
    throw new ArdoiseInviteError(404, 'Ce code est invalide.');
  }
  // 2. Émettre le token bridge (NOUVELLE fonction SQL — PAS create_household_invite_token)
  const token = generateToken();                      // helper existant identique
  const tokenHash = await hmacSha256Hex(token, env('INVITE_TOKEN_HMAC_SECRET'));
  const { error } = await admin.rpc('create_household_bridge_token', {
    p_household_id: (ardoise as { household_id: string }).household_id,
    p_token_hash: tokenHash,
  });
  if (error) throw translateRpcError(error);
  return json({ token });                             // brut rendu UNE fois, jamais journalisé
}
// LIMITS: ajouter 'household-token': 8 (miroir join/redeem)
// Point d'entrée: APRÈS le garde isUser (l.846-848) — mode 'user' uniquement
```

### Réconciliation (squelette, corps de la nouvelle version redeem)
```sql
-- Source: définition effective 0145:178-289 ; insertion APRÈS l'insert household_members
-- (règle d'identité: Open Question 1 — squelette illustratif, pas prescriptif)
update public.expense_participants ep
   set participant_type = 'membre',
       member_id = v_member_id,
       guest_id = null
  where ep.participant_type = 'invite'
    and ep.guest_id in (/* guests de l'invité, règle à trancher */)
    and not exists (                                  -- Pitfall 3: fusion avant conversion
      select 1 from public.expense_participants keep
       where keep.expense_id = ep.expense_id
         and keep.member_id = v_member_id);
-- + delete des lignes invite: en conflit (politique de fusion à trancher)
-- + test positif: lignes migrées, part du passé conservée
-- + négatifs: déjà admin (idempotent), déjà membre, double redemption concurrente, rôle forcé
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Modèle binaire : join refuse le non-membre (403) | Pont vers le flux foyer via token bridge | Cette phase | Le 403 reste correct pour un non-membre SANS passer par le bridge ; le bridge est le chemin nouveau |
| Join = part zéro sur le passé | Réconciliation : le passé invité est repris tel quel | Décision 3 (2026-11-09) | Les copies UI « part zéro sur le passé » de la page invitée (l.225-226, 261-262) deviennent fausses — à mettre à jour dans la même phase |
| Token foyer généré par l'admin depuis les paramètres | Token bridge émis par le serveur pour un invité | Cette phase | max_uses=1, expiration courte, usage interne — invisibles dans la liste des tokens admin ? (à trancher : les tokens bridge apparaîtront dans `household_invite_tokens_list` du foyer — bénin, mais à savoir) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | La règle d'identité de la réconciliation (display_name vs table pont) n'est pas tranchée par CONTEXT.md | Pitfall 2 / Open Q1 | Mauvaise adhésion de participations (homonyme) ou refus produit |
| A2 | Les tokens bridge apparaissent dans la liste admin `household_invite_tokens_list` (aucun filtrage vérifié) | State of the Art | Bruit cosmétique dans le panneau invitations |
| A3 | Une expiration de ~15 min pour le token bridge est acceptable (redirection immédiate dans le flux nominal) | Pattern 2 | Si l'utilisateur tarde entre dialog et pré-écran, token expiré → message « lien invalide » ; une expiration plus longue (1 h) est aussi défendable |
| A4 | La copie « part zéro sur le passé » de la page invitée doit être mise à jour (réconciliation change la promesse) | State of the Art | Incohérence copy/produit |

## Open Questions (RESOLVED)

1. **Règle d'identité de la réconciliation** — RÉSOLU (décision verrouillée 2026-11-09) : option B, table pont `private.ardoise_bridge_identities` remplie par `household-token` ; jamais de correspondance par display_name (portée au plan 40-02).
2. **Nom du foyer absent dans le dialog** — RÉSOLU : titre de repli « Vous allez rejoindre le foyer de cette ardoise » quand householdName est null (porté au plan 40-03, testé RTL).
3. **ConfirmDialog icône figée `trash`** — RÉSOLU : prop `icon` optionnelle, défaut `trash`, rétro-compatible (portée au plan 40-03 T1).
4. **Politique de fusion doublon membre+invite** — RÉSOLU : garder la part membre, supprimer la ligne invite, pas de double comptage, test SQL dédié (porté au plan 40-02, cas 3).
5. **Visibilité des tokens bridge dans le panneau admin** — RÉSOLU : accepter (A2), aucun filtrage nouveau — bruit cosmétique assumé, décision orchestrator verrouillée.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker (stack Supabase) | test-db.sh, migrations | à vérifier à l'exécution | — | Les 3 premières étapes de la chaîne (typecheck, tests, build) ne demandent pas Docker ; test-db.sh reste passage obligatoire avant de déclarer le SQL validé (AGENTS §2.7) |
| Node.js | vitest, build | ✓ (projet) | 24 LTS | — |
| psql.sh | inspection base | ✓ | — | stdin uniquement (`psql.sh < fichier`), jamais `-f` ni `-c` avec secret (AGENTS §2.7C) |

**Missing dependencies with no fallback:** none identified.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5 + React Testing Library (frontend) ; testkit SQL (base) |
| Config file | config Vitest existante du projet ; `supabase/tests/_setup.sql` |
| Quick run command | `cd app && npx vitest run src/modules/ardoise/guest-ardoise-page.test.tsx` |
| Full suite command | `cd app && npm run typecheck && npm test && npm run build && python3 scripts/check-sql-statique.py && python3 scripts/test-check-sql-statique.py && sh scripts/test-db.sh` (+ `npm run test:e2e`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ARD-01 | Dialog avant tout réseau ; aucun redeem au clic sans confirmation | unit (RTL) | `npx vitest run src/modules/ardoise/guest-ardoise-page.test.tsx -t dialog` | ❌ Wave 0 (étendre le fichier existant) |
| ARD-01 | Atterrissage `/ardoise` après redeem depuis le bridge | unit (RTL) | `npx vitest run src/modules/landing/join-household-page.test.tsx` | ❌ Wave 0 (étendre le fichier existant) |
| ARD-01 | `?code=`/token préservés via state.from | unit (RTL) | `npx vitest run src/modules/landing/join-household-page.test.tsx` | ✅ partiel (pattern testé l.178) |
| ARD-02 | Réconciliation : lignes migrées, part du passé conservée | SQL (testkit) | `sh scripts/test-db.sh <nouveau_fichier>` | ❌ Wave 0 |
| ARD-03 | Négatifs : déjà admin, déjà membre, double redemption concurrente (FOR UPDATE), rôle forcé | SQL (testkit) | `sh scripts/test-db.sh <nouveau_fichier>` | ❌ Wave 0 |
| ARD-03 | Pas de colonne household_id sur le modèle de partage | statique | revue de la migration + check-sql-statique | ✅ (contrôle existant) |
| — | Edge : `household-token` refuse publishable (401), refuse code mort (404) | unit Edge (si harnais existant) / revue + e2e | suite e2e existante | à vérifier |

### Sampling Rate
- **Per task commit:** vitest des fichiers touchés + `check-sql-statique.py` si migration.
- **Per wave merge:** chaîne complète §2.7 (typecheck, tests, build, e2e, SQL statique + test-db.sh).
- **Phase gate:** `test-db.sh` vert ET `test-dispatch-push.sh` sans objet ici (pas de push) ; e2e parcours : lien ardoise → dialog → adhésion → `/ardoise`.

### Wave 0 Gaps
- [ ] Extension `guest-ardoise-page.test.tsx` — dialog, copy, 401/403/404, aucun appel réseau avant confirmation
- [ ] Extension `join-household-page.test.tsx` — atterrissage conditionnel `/ardoise`
- [ ] `supabase/tests/00XX_ardoise_bridge.sql` — positifs et négatifs ARD-02/03 (rédigé APRÈS tranchage Open Q1)
- [ ] Cas SQL « doublon membre+invite même dépense » (Pitfall 3)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Session JWT `user` obligatoire pour `household-token` (garde isUser existant) |
| V3 Session Management | yes | `state.from` filtré par `internalPathOf` (même origine) |
| V4 Access Control | yes | RLS + RPC `SECURITY DEFINER` service_role uniquement ; rôle forcé côté serveur (`v_role := 'membre'`) |
| V5 Input Validation | yes | Zod `discriminatedUnion` Edge ; format code/token regex base64url |
| V6 Cryptography | yes | HMAC-SHA-256, secrets dédiés (`ARDOISE_HMAC_SECRET` / `INVITE_TOKEN_HMAC_SECRET`), comparaison à temps constant EN BASE (`private.token_hash_matches`) — ne jamais hand-roller |

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Énumération de codes/foyers | Information Disclosure | Réponses uniformes 404 « code invalide » ; jamais distinguer inconnu/expiré/révoqué (D-03, l.284-286) |
| Bruteforce du code de partage | Tampering | Rate limit mémoire par action+IP (8/min pour les actions sensibles) |
| Élévation de rôle via bridge | Elevation of Privilege | `max_uses=1`, expiration courte, rôle `membre` forcé en base (0145:214), refus `p_role='enfant'` (0145:207-210) |
| Double redemption concurrente | Tampering | `select … for update` sous verrou de ligne (0145:220-224) — test SQL dédié exigé (ARD-03) |
| Fuite du token brut | Information Disclosure | Rendu une seule fois, jamais persisté ni journalisé ; sessionStorage côté client, jamais URL du mail |
| Cross-household leakage | Information Disclosure | Bornage des requêtes service_role DANS la requête PostgREST (I-02), jamais filtrage JS post-lecture ; réconciliation bornée au foyer du token |

## Sources

### Primary (HIGH confidence)
- `supabase/functions/ardoise-invite/index.ts` (lu intégral) — actions, HMAC, rate limit, modes, buildGuestView/link-view
- `supabase/functions/household-invite/index.ts` (lu intégral) — contrat redeem, non modifiable
- `supabase/migrations/0145_convert_managed_children.sql:170-293` — définition effective `redeem_household_invite_token` (FOR UPDATE, rôle forcé, idempotence)
- `supabase/migrations/0176_token_list_governance.sql:54-113` — `create_household_invite_token` + assert admin
- `supabase/migrations/0062_redeem_crypto_schema.sql:30-71` — `redeem_ardoise_invite` (guest, ticket, use_count)
- `app/src/modules/ardoise/guest-ardoise-page.tsx` (lu intégral), `app/src/modules/ardoise/api.ts` (lu intégral)
- `app/src/modules/landing/join-household-page.tsx` (lu intégral), `app/src/lib/invites.ts` (lu intégral)
- `app/src/modules/landing/sign-in-page.tsx:65-74,134` — `internalPathOf`, lecteur `state.from`
- `app/src/components/ui/confirm-dialog.tsx` (lu intégral)
- `scripts/test-db.sh:1-14` — mécanique des tests SQL

### Secondary (MEDIUM confidence)
- `app/src/app/router.tsx:155-176` — gardes RequireHousehold/RequireNoHousehold (lu partiel)

### Tertiary (LOW confidence)
- Comportement du panneau admin vis-à-vis des tokens bridge (A2, non vérifié)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — aucune dépendance nouvelle, tout vérifié dans le dépôt
- Architecture: HIGH — flux complet lu ; seule l'identité de réconciliation est ouverte (documentée)
- Pitfalls: HIGH — chaque piège ancré sur une ligne de code vérifiée

**Research date:** 2026-11-09
**Valid until:** 2026-12-09 (code stable, jalon en cours)
