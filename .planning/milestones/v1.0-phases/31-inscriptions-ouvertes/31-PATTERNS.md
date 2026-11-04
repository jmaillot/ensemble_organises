# Phase 31: Inscriptions ouvertes - Pattern Map

**Mapped:** 2026-11-03
**Files analyzed:** 11 (7 code + 3 infra/docs + 1 migration)
**Analogs found:** 11 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/0176_*.sql` | migration | transform (DML + CREATE OR REPLACE) | `supabase/migrations/0174_folder_default_dedup.sql` | exact |
| `supabase/tests/0176_*.test.sql` | test | batch | `supabase/tests/0174_folder_default_dedup.test.sql` | exact |
| `supabase/functions/household-invite-preview/index.ts` | service (Edge) | request-response | `supabase/functions/household-invite/index.ts` | exact |
| `supabase/functions/household-invite/index.ts` (modify) | service (Edge) | request-response | itself + `ardoise-invite` | exact (in-place) |
| `app/src/modules/landing/join-household-page.tsx` (rewrite → pré-écran) | component (page) | request-response | itself + `sign-in-page.tsx` | exact |
| `app/src/lib/invites.ts` (modify) | utility (API client) | request-response + localStorage | itself (callInviteFunction, remember/recall pattern) | exact |
| `app/src/modules/parametres/components/invitations-panel.tsx` (modify) | component (panel) | CRUD | itself + `household-delete-panel.test.tsx` pattern | exact |
| `app/src/modules/landing/legal-page.tsx` | component (page publique) | static render | `app/src/modules/landing/terms-page.tsx` | exact |
| `app/src/app/router.tsx` + `route-preload.ts` (modify) | route config | — | itself (routes publiques `/confidentialite`) | exact |
| `supabase-project/docker-compose.traefik.yml` (modify) | config | — | itself (labels api-gw, bloc functions env) | exact |
| `.env` stack (non versionné, modify) | config | — | `supabase-project/.env.example` (gabarit) | role-match |

**Tracked-source gate (#3645):** tous les analoges cités sont vérifiés `git ls-files` : `supabase/functions/household-invite/index.ts`, `app/src/app/router.tsx`, `app/src/lib/invites.ts`, `app/src/modules/parametres/components/invitations-panel.tsx`, `supabase-project/docker-compose.traefik.yml`. Aucun miroir gitignore.

---

## Pattern Assignments

### `supabase/migrations/0176_*.sql` (migration, transform)

**Analog:** `supabase/migrations/0174_folder_default_dedup.sql` (dernière migration du dépôt, structure exemplaire)

**Structure de migration** (0174, lignes 1-28) : en-tête commentaire narratif (pourquoi, diagnostic, ce qui est touché), `begin;` … `commit;` une transaction, fonctions redéfinies par `create or replace` (jamais d'édition de migration appliquée) :

```sql
-- 0174_folder_default_dedup.sql
-- [en-tête narratif : gap, diagnostic daté, trois blocs annoncés]
begin;
create or replace function private.dedup_folder_defaults()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$ ... $$;
comment on function private.dedup_folder_defaults() is '...';
select private.dedup_folder_defaults();
...
commit;
```

**Fonction token existante à réécrire** (0006, lignes 286-317) — le bloc à FAIRE DISPARAÎTRE dans `create_household_invite_token` :

```sql
  perform private.assert_household_admin(p_household_id, p_actor_id);
  v_max_uses := least(greatest(coalesce(p_max_uses, 10), 1), 100);
  if p_expires_at is not null then
    if p_expires_at <= now() then
      raise exception 'expiration doit être dans le futur' using errcode = '22023';
    end if;
    v_expires_at := least(p_expires_at, now() + interval '90 days');
  end if;

  -- Régénération : le token précédent est invalidé immédiatement.   ← SUPPRIMER ce bloc
  update public.household_invite_tokens                              ← (modèle liste D-14)
     set is_active = false
   where household_id = p_household_id
     and is_active;
```

**Révocation (globale) existante à imiter pour la révocation individuelle** (0006, lignes 322-342) :

```sql
create or replace function public.revoke_household_invite_tokens(p_actor_id uuid, p_household_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revoked integer;
begin
  perform private.assert_household_admin(p_household_id, p_actor_id);
  update public.household_invite_tokens
     set is_active = false
   where household_id = p_household_id
     and is_active;
  get diagnostics v_revoked = row_count;
  return jsonb_build_object('household_id', p_household_id, 'revoked', v_revoked);
end;
$$;
comment on function public.revoke_household_invite_tokens(uuid, text) is
  'USAGE SERVEUR UNIQUEMENT. Révoque tous les tokens actifs du foyer.';
```

La nouvelle `revoke_household_invite_token(p_actor_id, p_household_id, p_token_id)` copie ce gabarit et borne l'UPDATE : `where id = p_token_id and household_id = p_household_id and is_active`.

**Discipline SQL AGENTS §2.7** : `set search_path = ''` ⇒ toute table qualifiée `public.household_invite_tokens` ; `returns table` = variables PL/pgSQL (qualifier les colonnes) ; après commit : `python3 scripts/check-sql-statique.py` + `test-check-sql-statique.py` + `sh scripts/test-db.sh`.

**Jetables** (SPEC req. 5) : en tête de migration, `update public.household_invite_tokens set is_active = false;` (tous actifs) — décision « jetables », sans cérémonie.

---

### `supabase/tests/0176_*.test.sql` (test, batch)

**Analog:** `supabase/tests/0174_folder_default_dedup.test.sql`

**Gabarit testkit** (lignes 20-40) : en-tête narratif listant les tests A/B/C, `begin;` + `do $$` avec `testkit.auth_user` / `testkit.household` / `testkit.member`, semis via `testkit.fx` :

```sql
begin;
do $$
declare
  alice uuid := testkit.auth_user('dedup-alice@example.fr', 'Alice Dédupe');
  home text := testkit.household(alice, 'Foyer Dédupe');
  alice_m text;
begin
  alice_m := testkit.member(home, alice, 'Alice Dédupe', 'admin', 'accent');
  insert into testkit.fx (key, user_id) values ('alice', alice);
  insert into testkit.fx (key, household_id) values ('home', home);
  insert into testkit.fx (key, row_id) values ('alice_m', alice_m);
end;
$$;
```

Pour 0176, les tests obligatoires : (a) la création ne valide plus les prédécesseurs (2 tokens actifs coexistent), (b) expiration obligatoire → `create` sans/avec date passée échoue, (c) révocation individuelle ne touche que le token visé, (d) **no-consume preview** : après l'appel au RPC de preview, `use_count` inchangé (test négatif D-05, §2.7-B : cas qui doit échouer).

---

### `supabase/functions/household-invite-preview/index.ts` (service Edge, request-response) — NOUVEAU

**Analog:** `supabase/functions/household-invite/index.ts` (toute la mécanique est là)

**Imports + gabarit `withSupabase`** (lignes 55-70, 433-434) :

```typescript
import { withSupabase } from '@supabase/server';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@4.6.5';

Deno.serve(
  withSupabase({ auth: ['user', 'publishable'] }, async (request, ctx) => { ... }),
);
```

⚠️ Spécificateur bare `'@supabase/server'` (pas `npm:`), épinglage porté par `volumes/functions/deno.jsonc` (commentaire lignes 55-67 — à recopier tel quel).

**Headers + erreur applicative + json()** (lignes 72-102) :

```typescript
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-invite-token',
  'access-control-allow-methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200): Response { ... }
class InviteError extends Error { readonly status: number; constructor(status: number, message: string) {...} }
```

**Zod token rule** (lignes 144-151, règle redeem à reprendre exactement pour la preview) :

```typescript
token: z.string().trim()
  .min(22, 'Un token fait au moins 22 caractères.')
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/, 'Token invalide.'),
```

**Rate-limit applicatif (gabarit D-04)** (lignes 211-243) :

```typescript
const WINDOW_MS = 60_000;
const LIMITS: Record<string, number> = { redeem: 8, create: 20, revoke: 20, summary: 30 };
const MAX_TRACKED_CLIENTS = 5_000;
const counters = new Map<string, { count: number; resetAt: number }>();
function clientAddress(request: Request): string { /* x-forwarded-for → cf-connecting-ip → 'inconnu' */ }
function enforceRateLimit(request: Request, action: string): void { /* compteur IP:action + purge opportuniste + 429 */ }
```

La preview ajoute `preview: <seuil>` à ses propres `LIMITS` (discretion D-04 ; ≤ 8/redeem pour une route publique).

**HMAC (calcul du hash côté Edge, comparaison EN BASE)** (lignes 187-202 + 402-403) :

```typescript
async function hmacSha256Hex(token: string, secret: string): Promise<string> { /* crypto.subtle HMAC-SHA-256 → hex */ }
// ...
const tokenHash = await hmacSha256Hex(body.token, env('INVITE_TOKEN_HMAC_SECRET'));
```

**Structure du handler + try/catch central** (lignes 433-471) :

```typescript
Deno.serve(
  withSupabase({ auth: [...] }, async (request, ctx) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
    try {
      if (request.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);
      const body = await parseBody(request);
      enforceRateLimit(request, body.action);
      // ...
    } catch (error) {
      if (error instanceof InviteError) return json({ error: error.message }, error.status);
      console.error('household-invite-preview: erreur inattendue', { message: ... });
      return json({ error: 'Opération impossible.' }, 500);
    }
  }),
);
```

**Spécificités preview (D-01/D-03/D-05)** : mode `auth: ['publishable']` (pas de JWT requis) ; le RPC appelé est un NOUVEAU `preview_household_invite_token(p_token_hash)` `SECURITY DEFINER` qui fait la comparaison via `private.token_hash_matches` en base et lit `households.name` + `profiles.display_name` du `created_by` ; **aucune écriture** sur la ligne du token ; réponse 200 `{ householdName, inviterFirstName? }` (D-02) ; token mort → **réponse uniforme** même code même message (D-03 — PAS la distinction inconnu/expiré/épuisé, qui reste côté redeem lignes 306-311).

**Traduction d'erreurs RPC** (lignes 297-330) : gabarit `translateRpcError` — la preview le simplifie : tout motif → une seule réponse générique.

**Déploiement** : `sh scripts/deploy-functions.sh` copie `supabase/functions/*` dans `volumes/functions` (Runtime State Inventory).

---

### `supabase/functions/household-invite/index.ts` (modify)

Le fichier lui-même est le gabarit. Deltas attendus :
- `summary` devient une **liste** : action `summary` → RPC `household_invite_tokens_list` renvoyant un ensemble anonymisé `{ token_id, created_at, expires_at, max_uses, use_count, is_active }` (D-15 : jamais `token_hash`, jamais le brut).
- Nouvelle action `revoke-one` (ou `revoke` avec `tokenId`) : RPC `revoke_household_invite_token(p_actor_id, p_household_id, p_token_id)` (D-16). Étendre `requestSchema` (lignes 126-152) : le schéma Zod discriminated union est la structure à étendre.
- Le message `create` retourne déjà `expires_at ?? null` / `maxUses` (lignes 356-365) : après migration, `expires_at` devient obligatoire côté serveur — la ligne 350 `p_expires_at: body.expiresAt ?? null` doit refuser null (Edge 400, la base fait foi).
- Ne pas toucher aux lignes 297-330 (`translateRpcError`) : les quatre motifs redeem distincts (404 introuvable / 410 révoqué / 410 expiré / 410 épuisé) sont déjà exactement ce que D-17 traduit côté client.

---

### `app/src/modules/landing/join-household-page.tsx` (component page, request-response) — transformé en pré-écran

**Analog:** lui-même (gabarit de page hors-shell) + `sign-in-page.tsx` (branchement auth)

**Gabarit de page publique/hors-shell** (lignes 66-120) : conteneur centré, lien retour, eyebrow, h1 clamp, lede, primitives Field/Input/Button, bloc bordure pointillée `bg-accent-faint`, lien secondaire. À conserver comme squelette ; le formulaire token-saisie devient le pré-écran D-18/D-19/D-20.

**Branchement auth à réutiliser** (`sign-in-page.tsx` via `use-auth.ts:291`) : `supabase.auth.signUp` / session → le pré-écran affiche « Rejoindre » (connecté) ou « Continuer vers l'inscription » (étranger). Détecter la session avec `useIsAuthenticated` (déjà importé dans router.tsx l.13).

**Validation Zod client** (lignes 15-22) : même règle min(22) que l'Edge.

**Traversée sessionStorage (D-06/D-07)** : nouveau helper dans `app/src/lib/invites.ts` (gabarit `rememberInviteToken`/`recallInviteToken`/`forgetInviteToken` lignes 140-181 — setItem/getItem/removeItem avec try/catch « le stockage est un confort »). Clé `sessionStorage`, nettoyage après application ou abandon (discretion).

**Messages D-17** : `redeemInviteToken` (invites.ts l.112-125) lève déjà `Error` avec le message serveur ; la traduction verbatim « Ce lien est invalide. » / « Ce lien a expiré. … » / « Ce lien a atteint sa limite d'utilisations. » se pose côté client en mappant les messages de `translateRpcError` (« Ce token est introuvable. » → « Ce lien est invalide. » etc.).

---

### `app/src/lib/invites.ts` (modify)

**Analog:** lui-même — les fonctions existantes sont le gabarit à étendre :
- `callInviteFunction<T>` (lignes 17-35) : fetch POST Edge avec `apikey` + Bearer optionnel, gestion erreur `detail.error`. Une fonction `previewHouseholdInvite(token)` **publique** (sans Bearer) copie ce gabarit en visant `/household-invite-preview`.
- `getInviteTokenSummary` (lignes 87-110) : gabarit à transformer en `listInviteTokens(): Promise<InviteTokenSummary[]>` (l'interface `InviteTokenSummary` de `@/types` gagne un `tokenId`, le type passe d'objet unique à tableau).
- `revokeInviteToken` (lignes 74-85) : gabarit pour `revokeInviteTokenById(tokenId)`.
- `isRecallValid` (lignes 184-191) : matche un seul token par `createdAt` — à adapter au modèle liste (match par `tokenId` dans la liste, Pitfall 5).
- Le toast côté panneau « Le précédent est invalidé. » (invitations-panel l.62) doit disparaître avec le modèle un-actif.

---

### `app/src/modules/parametres/components/invitations-panel.tsx` (modify)

**Analog:** lui-même — structure à enrichir (D-14/D-15/D-16) :
- Défauts pré-remplis déjà en place (lignes 24-25) : `useState(() => addDays(todayIso(), 30))` et `useState(10)` — conformes 30 j/10, rendre l'expiration non-optional dans le Field (retirer `hint="Laissez vide…"` et `optional`).
- **Liste des tokens actifs** : le bloc « Token en cours » (lignes 179-199, lignes `flex items-center justify-between` bordées) devient une liste mappée sur `InviteTokenSummary[]` — colonnes : création, expiration, `useCount/maxUses`, statut. Anonymisé (D-15).
- **Révocation individuelle par modale** : gabarit ConfirmDialog existant (lignes 202-222) : `ConfirmDialog open onOpenChange title description confirmLabel onConfirm` — un state `confirmRevokeId: string | null` remplace le booléen ; le pattern `invalidateQueries` + toast + gestion d'erreur est à recopier.
- TanStack Query : `inviteKeys` (l.16) + `useQuery`/`invalidateQueries` déjà en place ; la queryKey gagne un sens « liste ».
- Validation client du formulaire : refuser expiration vide/passée et `maxUses` hors 1-100 avant l'appel (la base clampe silencieusement à 90 j — Pitfall 6 : afficher la contrainte).

---

### `app/src/modules/landing/legal-page.tsx` (component, static) — NOUVEAU

**Analog:** `app/src/modules/landing/terms-page.tsx`

**Gabarit** (lignes 1-45) :

```tsx
import { Link } from 'react-router';
import { SectionHeading } from '@/components/ui/section-heading';

const EFFECTIVE_DATE = '3 octobre 2026';
const CONTACT_EMAIL = 'jeremymaillot@gmail.com';

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-[780px] px-5 py-10 max-[650px]:px-[15px]">
      <p className="mb-2 text-[11px] font-extrabold tracking-wide text-muted uppercase">
        <Link to="/" className="text-accent-strong">Ensemble &amp; Organisés</Link> · CGU
      </p>
      <h1 className="mb-2 font-display text-[clamp(26px,3vw,38px)] leading-[1.05] tracking-[-0.03em]">…</h1>
      <p className="mt-0 mb-8 text-[13px] text-muted">En vigueur depuis le {EFFECTIVE_DATE}.</p>
      <div className="grid gap-7 text-[14px] leading-relaxed">
        <section aria-labelledby="cgu-objet">
          <SectionHeading id="cgu-objet" className="mb-2 font-display text-[19px] tracking-[-0.02em]">…</SectionHeading>
          <p className="m-0">…</p>
        </section>
```

Pour `/mentions-legales` (D-13) : éditeur = Jeremy Maillot (entrepreneur individuel) ; hébergement auto-hébergé ; contact = `contact@jeremymaillot.fr`. Relier depuis `terms-page.tsx` et `privacy-page.tsx` (notamment leur §conservation/suppression, l.179-193) — relecture langue claire exigée. Un test gabarit existe : `terms-page.test.tsx` / `privacy-page.test.tsx` à copier pour `legal-page.test.tsx`.

---

### `app/src/app/router.tsx` + `route-preload.ts` (modify)

**Analog:** lui-même. Deux patterns à suivre :

**Route publique sans garde** (lignes 254-265, `/confidentialite` et `/conditions-utilisation`) — gabarit exact pour `/mentions-legales` et pour la route `/foyer/rejoindre` sortie de `RequireAuth` :

```tsx
<Route
  path="/confidentialite"
  element={
    <LazyRoute load={routeChunkLoaders.privacy} />
  }
/>
```

**Route à dé-gater** (lignes 222-229, état actuel) :

```tsx
<Route
  path="/foyer/rejoindre"
  element={
    <RequireAuth>
      <LazyRoute load={routeChunkLoaders.joinHousehold} />
    </RequireAuth>
  }
/>
```

→ retirer `RequireAuth` (OUV-04) ; la préservation `state.from` (lignes 28-33, « le jeton EST le contrôle d'accès (AGENTS.md §4) ») reste valable pour les autres routes gatées. **Nouvelle entrée obligatoire dans `route-preload.ts`** : « Ajouter une route, c'est ajouter UNE entrée ici » (commentaire lignes 1-15) — ex. `legal: () => import('@/modules/landing/legal-page')`.

**Tests existants à étendre** : `router.test.tsx:170-209` (préservation du token pré-auth) ; ajout : la route `/foyer/rejoindre` rend le pré-écran SANS session.

---

### `supabase-project/docker-compose.traefik.yml` (modify)

**Analog:** lui-même. Le bloc `api-gw` (lignes 140-151) est le point d'insertion des routers dédiés :

```yaml
  api-gw:
    ports: !override []
    networks:
      - default
      - frontend
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.eo-api-rtr.entrypoints=https"
      - "traefik.http.routers.eo-api-rtr.rule=Host(`${EO_API_HOST:-api.votredomaine.fr}`)"
      - "traefik.http.routers.eo-api-rtr.service=eo-api-svc"
      - "traefik.http.services.eo-api-svc.loadbalancer.server.port=8000"
      - "traefik.docker.network=frontend"
```

Ajouter (RESEARCH Pattern 1, syntaxe Traefik vérifiée) : deux routers `eo-api-signup-rtr` / `eo-api-token-rtr` avec `rule=Host(...) && PathPrefix(\`/auth/v1/signup\`)`, `priority=200`, `middlewares=eo-signup-rl` (average=3, period=1m, burst=6) / `eo-token-rl` (average=10, burst=20), `service=eo-api-svc` explicite. Conventions du fichier à respecter : `${VAR:-default}` (le bloc auth lignes 40-43 explique pourquoi — GoTrue ne distingue pas absent/vide), commentaires narratifs par bloc, `!override` pour retirer des valeurs héritées.

---

## Shared Patterns

### HMAC serveur uniquement, brut jamais persisté
**Source:** `supabase/functions/household-invite/index.ts` lignes 187-202 + 344-344 ; `docker-compose.traefik.yml` lignes 45-50
**Apply to:** Edge preview, migration, panneau UI

```typescript
async function hmacSha256Hex(token: string, secret: string): Promise<string> { /* crypto.subtle */ }
```
La base ne stocke que le HMAC (`token_hash text check (token_hash ~ '^[0-9a-f]{64}$')`) ; le brut n'est affiché qu'à la génération ; la comparaison vit en base (`private.token_hash_matches`), jamais en JS.

### Réponse d'erreur uniforme / traduction RPC
**Source:** `household-invite/index.ts` lignes 297-330 (redeem, distinct) et 461-469 (catch central, générique)
**Apply to:** Edge preview (uniforme D-03) et client (verbatim D-17 mappé sur les messages serveur)

### Rate-limit applicatif en mémoire par IP
**Source:** `household-invite/index.ts` lignes 211-243
**Apply to:** Edge preview uniquement (D-04) — pas de double barrière Traefik sur `/functions/v1/household-invite-preview`.

### ConfirmDialog pour action destructrice
**Source:** `invitations-panel.tsx` lignes 202-222
**Apply to:** révocation individuelle (D-16), règle transverse AGENTS §6.

### Stockage local en « confort » (try/catch, jamais bloquant)
**Source:** `invites.ts` lignes 148-181
**Apply to:** sessionStorage du token en attente (D-06) — setItem/getItem/removeItem try/catch avec commentaire.

### Migration corrective vers l'avant
**Source:** `0174_folder_default_dedup.sql` (create or replace, transaction unique, commentaires narratifs) + AGENTS §2.7 A/B
**Apply to:** 0176 — jamais d'édition de 0002/0006 ; contrôle statique + cas qui doit échouer dans le test SQL.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `.env` stack (SMTP_*, GOTRUE_RATE_LIMIT_*) | config infra | — | Non versionné par design ; gabarit = `supabase-project/.env.example` (ligne 267 : seul `SAML_RATE_LIMIT_ASSERTION` y figure). Valeurs à prendre de la doc GoTrue citée dans 31-RESEARCH.md (D-12 : jamais de valeur inventée). |
| Middlewares Traefik rateLimit | config infra | — | Aucun middleware rateLimit dans le dépôt — pattern à créer, gabarit syntaxique dans 31-RESEARCH.md Pattern 1 (vérifié Context7 /traefik). |
| Preuves opérateur (restauration RTO, captures SMTP, `test-dispatch-push.sh`) | runbook | — | Pas du code : runbooks `docs/EXPLOITATION.md:99-253` et script existant à exécuter et dater (§2.7-F). |

## Metadata

**Analog search scope:** `supabase/functions/`, `supabase/migrations/`, `supabase/tests/`, `app/src/modules/landing/`, `app/src/modules/parametres/components/`, `app/src/lib/`, `app/src/app/`, `supabase-project/`
**Files scanned:** ~40 (globs répertoires + lectures ciblées)
**Pattern extraction date:** 2026-11-03
