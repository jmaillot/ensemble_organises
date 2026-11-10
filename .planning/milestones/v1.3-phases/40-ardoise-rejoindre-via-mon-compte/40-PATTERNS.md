# Phase 40: Ardoise « Rejoindre via mon compte » - Pattern Map

**Mapped:** 2026-11-09
**Files analyzed:** 8 (3 modifiés frontend, 1 modifié Edge, 2 nouvelles migrations, 1 nouveau test SQL, 2 tests unitaires étendus)
**Analogs found:** 8 / 8 — tous pistés dans git (gate #3645 vérifié via `git ls-files`)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/src/modules/ardoise/guest-ardoise-page.tsx` (modif) | component (page) | request-response | lui-même + `app/src/components/ui/confirm-dialog.tsx` | exact |
| `app/src/modules/ardoise/api.ts` (modif) | service (client API) | request-response | `joinArdoise` / `callArdoiseInvite` dans le même fichier | exact |
| `app/src/modules/landing/join-household-page.tsx` (modif) | component (page) | request-response | lui-même + `app/src/lib/invites.ts` (sessionStorage pending-*) | exact |
| `supabase/functions/ardoise-invite/index.ts` (modif) | controller (Edge) | request-response | lui-même — action `join` (l.134-142, 241, 837-855) et `handleLinkView` (l.793-809) | exact |
| `supabase/migrations/0180_*.sql` (nouveau) | migration (RPC SECURITY DEFINER) | CRUD (transaction) | `0176_token_list_governance.sql:54-113` + `0145:178-289` | role-match |
| `supabase/tests/00XX_ardoise_bridge.sql` (nouveau) | test (SQL testkit) | batch | `supabase/tests/0176_token_list_governance.test.sql` | exact |
| `app/src/modules/ardoise/guest-ardoise-page.test.tsx` (extension) | test (RTL) | request-response | fichier existant (étendre, pas créer) | exact |
| `app/src/modules/landing/join-household-page.test.tsx` (extension) | test (RTL) | request-response | fichier existant (étendre, pas créer) | exact |

**Aucun fichier nouveau frontend** : la phase modifie trois fichiers existants et ajoute uniquement du SQL (migration + test).

## Pattern Assignments

### `app/src/modules/ardoise/api.ts` — nouvelle `exchangeArdoiseCodeForHouseholdToken()` (service, request-response)

**Analog:** `joinArdoise` (l.370-372) et `callArdoiseInvite` (l.296-329) — même fichier, même goulot, zéro nouvelle mécanique.

**Core pattern** (l.370-372) — copier la forme exacte :
```typescript
export async function joinArdoise(code: string): Promise<{ ardoise_id: string; already_member?: boolean }> {
  return callArdoiseInvite('join', { code: code.trim() });
}
// Nouvelle fonction, même forme :
export async function exchangeArdoiseCodeForHouseholdToken(code: string): Promise<{ token: string }> {
  return callArdoiseInvite('household-token', { code: code.trim() });
}
```

**Error handling** (l.321-329) — `InviteRequestError` porte le statut HTTP (WR-02), rien à créer :
```typescript
export class InviteRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.name = 'InviteRequestError'; this.status = status; }
}
```

**Enrichissement vue invitée** (l.383-395) — `GuestArdoiseView` : ajouter `householdName: string | null` (rétro-compatible ; le null = foyer supprimé, Pitfall 5 de RESEARCH.md).

---

### `app/src/modules/ardoise/guest-ardoise-page.tsx` — dialog avant l'échange (component, request-response)

**Analog 1:** son propre `rejoindre` (l.119-142) — le chemin qu'on REMPLACE. La structure d'états (`joinState`, `setJoinError`, distinction par statut WR-02) reste ; seul le corps change : `joinArdoise(activeCode)` → ConfirmDialog puis `exchangeArdoiseCodeForHouseholdToken` puis `navigate('/foyer/rejoindre?token=…')`.
```typescript
// l.133-141 : le message serveur s'affiche tel quel, jamais maquillé —
// ce contrat est conservé pour les échecs du nouvel appel (401 session
// expirée, 404 code mort) :
const status = cause instanceof InviteRequestError ? cause.status : 0;
setJoinError(cause instanceof Error ? cause.message : 'Rattachement impossible.');
setJoinIs403(status === 403);
```

**Analog 2:** `app/src/components/ui/confirm-dialog.tsx` (lu intégral) — usage non destructif :
```typescript
// l.22-32 : props ; l.58 : bouton primary si destructive={false}
<ConfirmDialog
  open={confirmOpen}
  onOpenChange={setConfirmOpen}
  title="Vous allez rejoindre le foyer X"   // fallback si householdName null (Open Q2) :
                                            // « Vous allez rejoindre le foyer de cette ardoise »
  description="Vous confirmerez sur l'écran suivant."   // Pitfall 4 : deux confirmations assumées
  destructive={false}                        // → bouton primary, pas danger
  onConfirm={() => void echangerCodePourToken()}
/>
```
⚠️ Icône `trash` figée (l.43-45) — si l'UI-SPEC la retient, ajouter une prop `icon` optionnelle (défaut `trash`, rétro-compatible).

**Anti-pattern (l.120-142) :** le rattachement au clic SANS confirmation est le comportement supprimé. Ne jamais appeler l'Edge avant `onConfirm`.

---

### `app/src/modules/landing/join-household-page.tsx` — atterrissage conditionnel `/ardoise` (component, request-response)

**Analog:** lui-même. Le changement minimal est à la ligne 152 :
```typescript
// l.148-152 — existant :
await loadHousehold();
clearPendingInviteToken();
toast('Vous avez rejoint le foyer.');
navigate('/accueil');          // ← devient : navigate( marquesrDAtterrissage ?? '/accueil' )
```
**Mécanique du marqueur — copier le pattern pending-* de `app/src/lib/invites.ts`** (l.214-243) :
```typescript
const PENDING_INVITE_KEY = 'ensemble-organises-pending-invite-token';
export function setPendingInviteToken(token: string): void { /* try/catch sessionStorage.setItem */ }
export function clearPendingInviteToken(): void { /* sessionStorage.removeItem */ }
// Nouveau pair miroir : PENDING_DEST_KEY = 'ensemble-organises-pending-ardoise-landing'
// posé par guest-ardoise-page AVANT navigate('/foyer/rejoindre?token=…'),
// lu puis EFFACÉ par join-household-page après redeem (miroir l.111-113 : un
// preview mort n'y laisse rien traîner).
```
- Le navigate du succès ne lit le marqueur qu'après `loadHousehold()` (la garde `RequireHousehold`, router.tsx:156-162, doit passer).
- Ne JAMAIS modifier la condition D-08 (redeem au clic uniquement, l.135-136) — verrouillé.

---

### `supabase/functions/ardoise-invite/index.ts` — action `household-token` (controller, request-response)

**Analog:** même fichier, trois points précis.

**1. Schéma Zod** (l.134-142, membre `join` du `discriminatedUnion`) — copier la validation code :
```typescript
z.object({
  action: z.literal('household-token'),
  code: z.string().trim().min(22, 'Un code fait au moins 22 caractères.')
    .max(512).regex(/^[A-Za-z0-9_-]+$/, 'Code invalide.'),
}),
```

**2. Rate limit** (l.241) — ajouter à `LIMITS` :
```typescript
const LIMITS: Record<string, number> = { /* … */ 'household-token': 8, join: 8, /* … */ };
```

**3. Vérification « code actif, non expiré »** — répliquer `handleLinkView` (l.793-809) :
```typescript
const codeHash = await hmacSha256Hex(body.code, secret);
const { data: ardoise } = await admin.from('ardoises')
  .select('id, household_id, is_active, expires_at').eq('invite_hash', codeHash).single();
if (!ardoise || !ardoise.is_active
    || (ardoise.expires_at && ardoise.expires_at <= new Date().toISOString())) {
  throw new ArdoiseInviteError(404, 'Lien invalide.');   // réponse uniforme D-03
}
// puis émission : generateToken() (helper existant) → hmacSha256Hex(token,
// env('INVITE_TOKEN_HMAC_SECRET')) → admin.rpc('create_household_bridge_token', …)
// → return json({ token }) — brut rendu UNE fois, jamais journalisé.
```

**4. Point d'entrée** (l.837-855) — le garde session, dans l'ordre :
```typescript
// link-view/redeem-guest/guest-view AVANT le garde (anonymes autorisés) ;
// 'household-token' APRÈS — mode 'user' uniquement :
if (!isUser || !userId) {
  return json({ error: 'Connectez-vous pour rejoindre une ardoise.' }, 401);
}
// brancher : if (body.action === 'household-token') return await handleHouseholdToken(admin, userId, body);
```
⚠️ L'Edge gagne une lecture `env('INVITE_TOKEN_HMAC_SECRET')` (env serveur, jamais client) en plus d'`ARDOISE_HMAC_SECRET`.

---

### `supabase/migrations/0180_*.sql` — émission bridge + réconciliation (migration, CRUD transactionnel)

**Analog 1 — RPC d'émission** : `0176_token_list_governance.sql:54-113`. Copier la forme (`security definer set search_path = ''`, `returns jsonb`, validation hash `'^[0-9a-f]{64}$'` l.74-76, insert l.96-101, `returning id into`, commentaire `USAGE SERVEUR UNIQUEMENT` l.112-113). Deux différences volontaires :
- PAS d'`assert_household_admin` (l.78) — c'est précisément ce qui rend le RPC existant inutilisable pour l'invité ;
- bornes en dur : `max_uses := 1`, expiration courte (ex. 15-60 min, à trancher au plan — A3).

**Grants** — miroir du pattern projet (0009, référencé par RESEARCH Pattern 2) :
```sql
revoke all on function public.create_household_bridge_token(text, text) from public, anon, authenticated;
grant execute on function public.create_household_bridge_token(text, text) to service_role;
```

**Analog 2 — réconciliation dans redeem** : `0145_convert_managed_children.sql:178-289` (définition effective à recopier INTÉGRALEMENT dans la nouvelle migration — jamais réécrire 0145, AGENTS §2.7-A). Point d'insertion : APRÈS l'insert `household_members` (l.266-276) et AVANT l'`update household_invite_tokens` (l.278-281), même transaction.
```sql
-- Squelette illustratif (règle d'identité : Open Question 1, BLOQUANT avant plan)
update public.expense_participants ep
   set participant_type = 'membre', member_id = v_member_id, guest_id = null
  where ep.participant_type = 'invite'
    and ep.guest_id in (/* règle à trancher */)
    and not exists (select 1 from public.expense_participants keep
                     where keep.expense_id = ep.expense_id and keep.member_id = v_member_id);
-- + delete des lignes invite: en conflit (Pitfall 3 : politique de fusion à
-- trancher — recommandation : garder la part membre, supprimer la ligne invite).
```
Contraintes vérifiées : `expense_participants_member_unique (expense_id, member_id)` nulls not distinct (`0015_share_uniqueness.sql:9,37-40`) ; `search_path = ''` → `public.` partout ; `returns jsonb` (pas de variable de `returns table`) ; `private.token_hash_matches` pour la comparaison à temps constant (l.223) ; `v_role := 'membre'` en dur (l.214) reste inchangé.

⚠️ Ne PAS supprimer les lignes `ardoise_guests` : `expenses.paid_by_guest` pointe dessus via FK restrict (`0056_ardoise_guests_parts.sql:14`).

---

### `supabase/tests/00XX_ardoise_bridge.sql` (test SQL, batch)

**Analog:** `supabase/tests/0176_token_list_governance.test.sql` (lu l.1-60). Copier la structure :
- en-tête commentaire listant chaque test et son intention (§2.7-F : un contrôle prouve son efficacité) ;
- `begin;` unique par fichier (annulé en fin — `scripts/test-db.sh`) ;
- semis dans un `do $$ declare … $$;` avec `testkit.auth_user`, `testkit.household`, `testkit.member`, fx registry (l.25-44) ;
- assertions `testkit.eq(testkit.count($t$…$t$), 0::bigint, '…')` — les DEUX arguments du même type ; comptages bornés par foyer (rôle `postgres` : RLS court-circuitée, §2.7-D.2) ;
- dollar-quotes nommés (`$t$…$t$`) autorisés à traverser des lignes — ouverts seulement si refermés (contrôle 3, check-sql-statique).

Cas exigés (ARD-02/03) : positif lignes migrées + part du passé conservée ; déjà admin ; déjà membre (idempotent, l.246-258) ; double redemption concurrente (FOR UPDATE, l.220-224) ; rôle forcé (`p_role='enfant'` refusé, l.207-210) ; doublon membre+invite même dépense (Pitfall 3) ; refus service_role uniquement sur le RPC bridge (grants).

## Shared Patterns

### Erreurs Edge : statut porté, message affiché tel quel
**Source:** `app/src/modules/ardoise/api.ts:306-329` (WR-02), `guest-ardoise-page.tsx:133-141`
**Apply to:** les deux pages frontend et la nouvelle action Edge. Un 401/403/404 se distingue par `InviteRequestError.status`, jamais par la copie du message ; réponse uniforme 404 « Lien invalide. » côté serveur (D-03).

### Confirmation avant écriture
**Source:** `confirm-dialog.tsx` + D-08 (`join-household-page.tsx:135-136`)
**Apply to:** guest-ardoise-page (dialog avant l'échange) ; le pré-écran conserve son clic explicite. Deux confirmations successives = assumées, jamais automatisées.

### sessionStorage pending-* (mémoire de parcours)
**Source:** `app/src/lib/invites.ts:214-243`, `join-household-page.tsx:69-79,111-113,125-133`
**Apply to:** marqueur d'atterrissage ardoise (posé par la page invitée, lu+effacé par join-household-page). Le token foyer reste le seul paramètre URL ; `state.from` (l.132) voyage déjà.

### Fonctions SQL SECURITY DEFINER
**Source:** `0176:54-113` (forme), `0145:178-289` (redeem effectif)
**Apply to:** toute nouvelle fonction : `set search_path = ''`, `public.` qualifié partout, `errcode` explicites, commentaire `USAGE SERVEUR UNIQUEMENT`, grants minimalistes (service_role seul pour le bridge), correction vers l'avant (jamais réécrire une migration appliquée).

### Tests SQL négatifs obligatoires
**Source:** `supabase/tests/0176_token_list_governance.test.sql`, `AGENTS.md §2.7`
**Apply to:** le nouveau fichier de test — cas négatifs ET positifs, assertions bornées par foyer, vu rouge avant vert.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `create_household_bridge_token` (fonction SQL) | migration | CRUD | Aucun RPC existant n'émet un token SANS vérification admin — le bridge est une émission serveur privilégiée nouvelle. Le pattern de FORME reste 0176. |
| Réconciliation `expense_participants` dans une transaction d'adhésion | migration | transform | Première migration qui modifie des participations à l'adhésion. Pattern de corps : 0145 ; règle d'identité : Open Question 1, à trancher avant le plan. |

## Metadata

**Analog search scope:** `app/src/modules/ardoise/`, `app/src/modules/landing/`, `app/src/components/ui/`, `app/src/lib/`, `supabase/functions/ardoise-invite/`, `supabase/migrations/`, `supabase/tests/`
**Files scanned:** 12 (8 lus en ciblé, restes par grep)
**Pattern extraction date:** 2026-11-09
**Tracked-source gate:** tous les analogs nommés vérifiés `git ls-files` — aucun chemin miroir.
