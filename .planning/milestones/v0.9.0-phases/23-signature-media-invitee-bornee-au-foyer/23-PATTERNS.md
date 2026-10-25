# Phase 23: Signature média invitée bornée au foyer (R3) — Pattern Map

**Mapped:** 2026-10-17
**Files analyzed:** 10 (6 new/modified named by SPEC + 1 discovered + 3 client test files)
**Analogs found:** 10 / 10 (aucun fichier sans analogue)

> Tous les chemins d'analogue cités ci-dessous sont **git-tracked** (`git ls-files`
> vérifié le 2026-10-17). Aucun miroir gitignoré (`supabase-project/volumes/functions/…`)
> n'est utilisé comme source.

## Faits de base vérifiés (requis par le brief)

### 1. Signature et forme de retour **effectives** de `public.guest_view_gift_list(text)`

Lue en base (`scripts/psql.sh`, `pg_get_functiondef`) — la définition effective est
**byte-identique à `0092:33-96`** :

```
guest_view_gift_list(p_token_hash text) RETURNS jsonb
LANGUAGE plpgsql STABLE->VOLATILE, SECURITY DEFINER, SET search_path TO ''
acl = supabase_admin=X/supabase_admin | postgres=X/supabase_admin | service_role=X/supabase_admin
```

Forme de retour (retour exact lu en base, `0092:90-94`) :

```jsonb
{ "list_id": <text>, "list_name": <text>,
  "items": [ { "id","name","price","comment","url","photo_url","reserved" } ] }
```

- `photo_url` = `i.photo_url` **brut** (`0092:81`) — c'est la valeur que l'Edge signe.
- Aucune clé de foyer, aucune clé d'auteur (`0127:116-120` pour la doctrine jumelle).
- `comment on function` effectif = celui de `0092:98-99` ; il devra être **remplacé**
  par `0128` (le mot « valeur brute » y devient faux).
- Privilèges : `revoke all … from public, anon, authenticated` +
  `grant execute … to service_role`, **puis** le bloc `do $$ … has_function_privilege …`
  qui les prouve (`0092:101-118`). `0128` doit **ré-émettre** cette section après le
  `create or replace`.
- Check clé du corps (`0092:45-47`) : `p_token_hash !~ '^[0-9a-f]{64}$'` → `raise … 'code invalide' errcode 22023`.
  Le test `0128` doit donc semer un hash de 64 car. (`testkit.hashes` de `0032:76-84` est le motif).

### 2. `gift_lists.household_id` ↔ `gift_list_invites.list_id`

- `0004_tables_shared.sql:54-62` :
  ```sql
  create table public.gift_lists (
    id text primary key default private.new_id('gift-list'),
    household_id text not null references public.households (id) on delete cascade,
    …
  ```
- `0079_gift_invites.sql:38-50` :
  ```sql
  create table public.gift_list_invites (
    id text primary key default private.new_id('gift-invite'),
    list_id text not null references public.gift_lists (id) on delete cascade,
    token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
    …
  ```
- Donc : `gift_list_invites.list_id → gift_lists.id → gift_lists.household_id`.
  Le RPC charge **déjà** `v_invite` (`gift_list_invites%rowtype`, `0092:51-54`) et charge
  **déjà** la ligne `gift_lists` pour `l.name` (`0092:64-65`) : le foyer s'obtient par
  **une colonne de plus sur la requête existante**, sans jointure ni requête nouvelle.
- `gift_items.household_id` existe aussi (dénormalisé, `0004_tables_shared.sql:69-70`),
  mais la cible retenue par le SPEC est le foyer **de la liste** (`v_list_household`),
  ce qui est le foyer dont l'invité lit la fiche — même choix que `0127:119-120`
  (« le foyer de la RECETTE, pas celui de l'étape »).
- Le seul chemin de l'Edge vers une valeur à signer : `gift-list-invite/index.ts:877-896`
  (`admin.rpc('guest_view_gift_list', …)` → `resolveGuestPhotoUrl(admin, item.photo_url)`).
  Aucun autre appelant : `grep -rn guest_view_gift_list supabase/functions/` ne rend que `:877`.

### 3. `ardoises.household_id` lu dans `buildGuestView`

- Colonne : `0055_ardoises.sql:14` — `household_id text not null references public.households (id) on delete cascade`.
- Aujourd'hui `buildGuestView` **ne la sélectionne pas** (`ardoise-invite/index.ts:663-667`) :
  ```ts
  const { data: ardoise, error: ardoiseError } = await admin
    .from('ardoises')
    .select('id,name,description,cover_url,is_active')
    .eq('id', ardoiseId)
    .single();
  ```
  → ajouter `household_id` à la liste de colonnes (une requête, pas deux).
- Motif de lecture déjà présent dans le même fichier (`ardoise-invite/index.ts:341-347`) —
  c'est l'analogue exact de la lecture à écrire, si une requête séparée était préférée :
  ```ts
  /** Foyer d'une ardoise, ou `null` si inconnue (le RPC possède cet oracle). */
  async function ardoiseHousehold(admin: AdminClient, ardoiseId: string): Promise<string | null> {
    const { data, error } = await admin
      .from('ardoises')
      .select('household_id')
      .eq('id', ardoiseId)
      .maybeSingle();
    if (error || !data) return null;
    const householdId = (data as { household_id?: unknown }).household_id;
    return typeof householdId === 'string' ? householdId : null;
  }
  ```
- Les **deux** appelants de `buildGuestView` passent par lui, donc héritent du verdict
  par construction : `handleGuestView` / ticket `index.ts:600` et `handleLinkView` /
  code vérifié `index.ts:773`.
- Le foyer est **déjà** dans le handler : `handleLinkView` lit `ardoises.invite_hash`
  (`:762-766`) ; la valeur n'a donc pas à être rendue dans la réponse (`:739-750`).

---

## File Classification

| New/Modified File | Rôle | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/0128_*.sql` (NEW) | migration (RPC verdict lecture) | request-response | `supabase/migrations/0127_guest_media_household.sql` | **exact** |
| `supabase/functions/gift-list-invite/index.ts:857-871` (MODIFY) | edge handler + signeur | request-response | lui-même + `recipe-invite/guest-steps.ts` (doctrine signeur) | **exact** |
| `supabase/functions/ardoise-invite/index.ts:637-751` (MODIFY) | edge handler + signeur | request-response | lui-même + `recipe-invite/index.ts` | **exact** |
| `supabase/functions/ardoise-invite/guest-media.ts` (NEW) | utility **pure** (prédicat × signeur) | transform | `supabase/functions/recipe-invite/guest-steps.ts` | **exact** |
| `supabase/functions/ardoise-invite/guest-media.test.ts` (NEW) | test unitaire (Vitest) | transform | `supabase/functions/recipe-invite/guest-steps.test.ts` | **exact** |
| `supabase/tests/0128_guest_media_household.sql` (NEW) | test SQL (`test-db.sh`) | request-response | `supabase/tests/0127_guest_media_household.sql` + `supabase/tests/0032_guest_view_details.sql` | **exact** |
| `supabase/tests/0032_guest_view_details.sql:207-232` (**MODIFY — découvert, absent de la liste candidate**) | test SQL | request-response | lui-même | **exact** |
| `app/src/modules/cadeaux/api.test.ts:165-218` (MODIFY) | test client (Vitest) | request-response | lui-même | **exact** |
| `app/src/modules/cadeaux/guest-cadeau-page.test.tsx:318-350` (MODIFY) | test composant (Vitest) | request-response | lui-même | **exact** |
| `app/src/modules/ardoise/api.test.ts:124-170` (MODIFY) | test client (Vitest) | request-response | lui-même | **exact** |

---

## Pattern Assignments

### `supabase/migrations/0128_*.sql` (migration, request-response)

**Analog :** `supabase/migrations/0127_guest_media_household.sql` — même phase de fermeture,
même classe (verdict de **lecture** dans un RPC qui rend une valeur média), même auteur,
même numéro de série. **Copier la structure du fichier, pas seulement le `case`.**

**Structure d'en-tête (doctrine, `0127:1-47`)** — le commentaire doit dire : quelle classe
est fermée, pourquoi le trou n'est pas l'écriture, pourquoi pas de contrainte, correction
vers l'avant, et pourquoi `strpos` et non un motif :

```sql
-- supabase/migrations/0127_guest_media_household.sql
-- Phase 22 — Une référence média rendue à un invité est bornée à son foyer
-- (plan 22-01 ; ferme AR-21-01 et AR-21-02 de `21-SECURITY.md`).
…
-- Pourquoi pas une contrainte d'écriture sur `recipes.cover_photo` : la colonne
-- est ANTÉRIEURE à toute borne, sa forme `http(s)` est tolérée …
-- Correction VERS L'AVANT : `0125` et `0126` sont APPLIQUÉES, elles ne sont
-- jamais réécrites (AGENTS.md §2.7 A.1).
--
-- Le segment relatif se teste par `strpos(valeur, '..') = 0`, jamais par un
-- motif `like` : les noms de fichier déposés sont `file_<uuid>.<ext>` …
begin;
…
commit;
```

**Le verdict (à recopier, `0127:156-162` et `0127:189-195`)** :

```sql
'photo_url', case
  when st.photo_path is null then null
  when starts_with(st.photo_path, v_recipe_household || '/')
   and strpos(st.photo_path, '..') = 0
    then st.photo_path
  else null
end
```

**Le foyer lu une fois, jamais rendu (`0127:116-124`)** :

```sql
-- `household_id` est lu ici, et n'est JAMAIS rendu au visiteur : l'Edge
-- construit sa réponse champ par champ (`index.ts:478-489`), il ne recopie
-- pas le jsonb du RPC. Le foyer sert uniquement à prononcer le verdict …
select r.title, …, r.household_id
  into v_recipe_title, …, v_recipe_household
  from public.recipes r
 where r.id = v_share.recipe_id;
```

À transposer pour `0128` : `select l.name, l.household_id into v_list_name, v_list_household
from public.gift_lists l where l.id = v_invite.list_id;` — puis `case` sur `i.photo_url`.

**Commentaire de fonction + privilèges (à recopier, `0092:98-118`)** : `comment on function`
mis à jour (les mots « valeur brute » doivent disparaître) et le bloc de preuve de privilèges
ré-émis intégralement.

**Contrainte de forme** : `set search_path = ''` → toute table s'écrit `public.`
(contrôles 1 et 2 de `scripts/check-sql-statique.py`). `starts_with`, **jamais** `like`
(`0126:22-31` : `household_id` est un texte `household_<uuid>` qui contient `_`).
`strpos(valeur, '..') = 0`, jamais un motif (`0127:42-47`).

**Ce qui ne doit PAS être fait (Prohibition SPEC)** : aucun `alter table … add constraint`
sur `gift_items` ni sur `ardoises` dans `0128`.

---

### `supabase/functions/gift-list-invite/index.ts` (MODIFY — `resolveGuestPhotoUrl`, `:857-871`)

**Analog :** lui-même ; la partie « signeur » est la jumelle exacte de
`recipe-invite/guest-steps.ts:59-76` (une seule forme de sortie : URL signée ou `null`).

**État actuel (à corriger)** :

```ts
// gift-list-invite/index.ts:849-871
/**
 * Résout la valeur brute `photo_url` du RPC en URL servable (G-06-1a) :
 * une URL http(s) héritée passe telle quelle ; un chemin relatif au bucket
 * `household-media` (forme actuelle des dépôts) reçoit une URL signée
 * courte ; TOUT le reste … rend null — échec fermé …
 */
async function resolveGuestPhotoUrl(admin: AdminClient, raw: unknown): Promise<string | null> {
  const value = asTextOrNull(raw);
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;   // ← ligne :860, le relais à retirer
  try {
    const path = value.replace(/^\/+/, '');
    const { data, error } = await admin.storage
      .from(HOUSEHOLD_MEDIA_BUCKET)
      .createSignedUrl(path, GUEST_PHOTO_TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}
```

**Le bornage lui-même n'est PAS ici** (D-01) : il est dans le RPC. Ce site ne change que
par le **retrait du relais `http(s)`** (`:860`) et la mise à jour du commentaire. Le seul
appelant est `:896` (`photoUrl: await resolveGuestPhotoUrl(admin, item.photo_url)`).

**Constantes locales** (`:837-847`) : `HOUSEHOLD_MEDIA_BUCKET = 'household-media'`,
`GUEST_PHOTO_TTL_SECONDS = 3600`, `asTextOrNull` — miroirs de `guest-steps.ts:20-30`.
Le fichier importe déjà ses modules locaux par `./child-guard.ts` (`:125-126`) : c'est le
style d'import du dépôt pour un module pur d'Edge.

**Imports du fichier (motif à ne pas casser, `:122-131`)** :

```ts
import { withSupabase } from '@supabase/server';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@4.6.5';
import { childRefusal, isChildRole } from './child-guard.ts';
import type { ChildGuardAction } from './child-guard.ts';
import nodemailer from 'npm:nodemailer@10.0.15';
```

---

### `supabase/functions/ardoise-invite/index.ts` (MODIFY — `buildGuestView :657-751`, `resolveGuestCoverUrl :637-651`)

**Analog :** lui-même ; doctrine signeur = `recipe-invite/guest-steps.ts:1-17, 59-76` +
`ardoise-invite/child-guard.ts:1-20` (module pur voisin, même fichier de doctrine).

**État actuel (les deux points à changer)** :

```ts
// ardoise-invite/index.ts:629-651
/**
 * Résout la valeur brute `cover_url` de la colonne en URL servable : une URL
 * `http(s)` héritée passe telle quelle ; un chemin relatif au bucket … reçoit une URL signée
 * courte ; TOUT le reste (absent, forme inconnue, erreur de signature) rend
 * null — échec fermé, sans erreur, sans journaliser la valeur (T-19-41 …).
 */
async function resolveGuestCoverUrl(admin: AdminClient, raw: unknown): Promise<string | null> {
  const value = asTextOrNull(raw);
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;   // ← :640, le relais à retirer
  try {
    const path = value.replace(/^\/+/, '');
    const { data, error } = await admin.storage
      .from(HOUSEHOLD_MEDIA_BUCKET)
      .createSignedUrl(path, GUEST_PHOTO_TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}
```

```ts
// ardoise-invite/index.ts:663-668 — le select qui doit gagner `household_id`
const { data: ardoise, error: ardoiseError } = await admin
  .from('ardoises')
  .select('id,name,description,cover_url,is_active')
  .eq('id', ardoiseId)
  .single();
if (ardoiseError || !ardoise) throw new ArdoiseInviteError(404, 'Ardoise introuvable.');
```

```ts
// ardoise-invite/index.ts:734-744 — le point d'appel du verdict
// Le nom dit la nature de la valeur : la colonne porte un CHEMIN de bucket
// (`cover_url`), la charge utile porte une URL servable (`coverUrl`). Un
// invité anonyme ne peut pas signer lui-même, c'est le serveur qui le fait.
const coverUrl = await resolveGuestCoverUrl(admin, (ardoise as { cover_url: string | null }).cover_url);

return json({
  ardoise: {
    id: (ardoise as { id: string }).id,
    …
    coverUrl,
```

**Signature du constructeur à ne pas casser (deux appelants, `:600` et `:773`)** :

```ts
// ardoise-invite/index.ts:657-662
async function buildGuestView(
  admin: AdminClient,
  ardoiseId: string,
  guestDisplayName: string | null,
  auth: { ticketHash: string } | { open: true },
) {
```

Le foyer se lit par la sélection élargie (une requête) ; `ardoiseHousehold` (`:341-347`)
est l'analogue si une lecture séparée est choisie. **Le foyer ne doit apparaître dans
aucune clé de la réponse** (`:739-750` : `ardoise{id,name,description,coverUrl,is_active}`,
`guest`, `expenses`, `settlement`).

**Type d'entrée du signeur** : `type AdminClient = SupabaseClient;` (`:277`). Le module pur
ne doit **jamais** importer ce type : il décrit une interface **structurelle** (voir ci-dessous).

---

### `supabase/functions/ardoise-invite/guest-media.ts` (NEW — module PUR)

**Analog EXACT : `supabase/functions/recipe-invite/guest-steps.ts` — rapporté en entier
(110 lignes), à recopier dans sa forme :**

```ts
/**
 * Projection des étapes du lien invité (phase 21, R4/D-15/D-16) — logique
 * PURE : aucun import Deno ni `npm:`, donc exécutable par la suite Vitest du
 * dépôt (`guest-steps.test.ts`, dont l'`include` couvre
 * `../supabase/functions/**`). Même doctrine que `child-guard.ts:1-6`.
 *
 * Un seul endroit signe, un seul endroit décide du TTL. La couverture
 * (`coverPhotoUrl`) et la photo de chaque étape (`steps[].photoUrl`) passent
 * littéralement par le même signeur : le TTL invité ne peut donc pas diverger
 * d'une surface à l'autre (D-16).
 *
 * Échec fermé : une valeur absente, une forme inconnue, une erreur de
 * signature ou une exception rendent `null`, sans erreur remontée et sans
 * journaliser ni le chemin ni l'URL — rien de sensible ne fuite dans les logs
 * (T-21-02). Un chemin brut de bucket ne quitte jamais l'Edge : la valeur
 * signée REMPLACE le chemin, elle ne l'accompagne pas.
 */

/** Bucket privé des fichiers du foyer : seul nom que les politiques connaissent. */
export const HOUSEHOLD_MEDIA_BUCKET = 'household-media';

/** Validité des URL photo invitées : courte (une heure), forgée par requête. */
export const GUEST_PHOTO_TTL_SECONDS = 3600;

/** Chaîne non vide telle quelle, sinon null (échec fermé, jamais ''). */
export function asTextOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Type STRUCTUREL décrivant seulement ce qui est consommé par la signature —
 * jamais `SupabaseClient`, sinon ce module dépendrait de
 * `npm:@supabase/supabase-js@2` et cesserait d'être exécutable par Vitest. Le
 * client privilégié de l'Edge le satisfait par structure.
 */
export interface GuestMediaSigner {
  storage: {
    from(bucket: string): {
      createSignedUrl(
        path: string,
        expiresIn: number,
      ): Promise<{ data: { signedUrl: string } | null; error: unknown }>;
    };
  };
}

/**
 * Résout une valeur brute (`cover_photo` ou `photo_path`) en URL servable :
 * une forme `http(s)://` déjà signée est rendue telle quelle ; un chemin
 * relatif au bucket `household-media` reçoit une URL signée courte ; TOUT le
 * reste (absent, vide, forme inconnue, erreur de signature, exception) rend
 * `null` — échec fermé, sans erreur, sans journaliser ni le chemin ni l'URL.
 *
 * Jumelle exacte de l'ancien `resolveGuestCoverUrl` : les deux surfaces
 * partagent désormais ce seul signeur (D-16).
 */
export async function resolveGuestMediaUrl(
  signer: GuestMediaSigner,
  raw: unknown,
): Promise<string | null> {
  const value = asTextOrNull(raw);
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;   // ← phase 23 : la branche à NE PAS recopier
  try {
    const path = value.replace(/^\/+/, '');
    const { data, error } = await signer.storage
      .from(HOUSEHOLD_MEDIA_BUCKET)
      .createSignedUrl(path, GUEST_PHOTO_TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/** Une étape projetée pour la vue invitée : texte + URL signée ou `null`. */
export interface GuestStep {
  id: string;
  content: string;
  position: number;
  photoUrl: string | null;
}

/**
 * Projette les étapes rendues par le RPC en charge invitée : `id`/`content`
 * normalisés en `String(...)`, `position` numérique ou `0`, et `photoUrl`
 * signée par `resolveGuestMediaUrl` (ou `null` en échec fermé). La signature
 * étant asynchrone, la projection l'est aussi — un échec sur une étape rend
 * `null` pour celle-là seulement, jamais une exception globale.
 */
export async function toGuestSteps(
  signer: GuestMediaSigner,
  steps: readonly {
    id?: unknown;
    content?: unknown;
    position?: unknown;
    photo_path?: unknown;
  }[],
): Promise<GuestStep[]> {
  return Promise.all(
    steps.map(async (step) => ({
      id: String(step.id ?? ''),
      content: String(step.content ?? ''),
      position: typeof step.position === 'number' ? step.position : 0,
      photoUrl: await resolveGuestMediaUrl(signer, step.photo_path),
    })),
  );
}
```

**Ce qui change pour la phase 23** (`guest-steps.ts` **n'est pas touché**, D-05) :

1. **Le relais `http(s)` disparaît** de la nouvelle copie : plus de
   `if (/^https?:\/\//i.test(value)) return value;` — un `http(s)` tombe dans
   l'échec fermé (`null`) car il ne satisfait pas le préfixe de foyer.
2. **Le prédicat de bornage est un paramètre, pas une constante** :
   `(value: string, householdId: string) => string | null` exigeant
   `startsWith(householdId + '/')` **et** `!value.includes('..')` — la barre finale
   est ce qui ferme le cas « foyer homonyme » (`household_ab` ≠ `household_abc/…`,
   SPEC Edge Coverage ligne 199). Jamais un `includes` nu, jamais un préfixe sans barre.
3. La forme structurelle `GuestMediaSigner` (`guest-steps.ts:38-47`) est
   **réutilisée telle quelle** : elle est ce qui permet au test de passer un double
   sans `npm:`. Le `AdminClient` (`ardoise-invite/index.ts:277`, `= SupabaseClient`)
   la satisfait par structure.
4. **Interdits** : aucun `import` Deno (`Deno.serve`, `https://deno.land/…`), aucun
   `npm:` — sinon Vitest ne peut plus l'exécuter (doctrine `guest-steps.ts:1-6`,
   et `app/vite.config.ts` `include: ['src/**/*.test.{ts,tsx}', '../supabase/functions/**/*.test.ts']`).
5. `ardoise-invite/child-guard.ts:1-20` est le `child-guard.ts:1-6` local cité par la
   doctrine, et le **voisin** du nouveau module (deux modules purs par Edge est déjà le cas).

**Import depuis l'Edge** : `import { … } from './guest-media.ts';` — le dépôt importe
ses modules locaux d'Edge avec l'extension `.ts` (`ardoise-invite/index.ts:55-56`).

---

### `supabase/functions/ardoise-invite/guest-media.test.ts` (NEW — test Vitest)

**Analog EXACT : `supabase/functions/recipe-invite/guest-steps.test.ts` (227 lignes).**

**En-tête de doctrine (à recopier, `:1-15`)** :

```ts
/**
 * Preuves de la projection des étapes invitées (phase 21, R4/D-15/D-16) côté
 * Edge `recipe-invite`.
 *
 * Ces assertions portent sur le CONTRAT, pas sur l'auto-cohérence : le module
 * `guest-steps.ts` est PUR (aucun import Deno ni `npm:`), donc exécutable ici.
 * Le comportement de l'Edge DÉPLOYÉE reste vérifié manuellement (VALIDATION.md,
 * « Manual-Only ») : aucun test du dépôt n'importe un `index.ts` d'Edge (deno
 * absent).
 *
 * Le signeur factice est écrit à la main (aucun mock de module) : il enregistre
 * `(bucket, path, expiresIn)` et rend une `signedUrl` qui NE CONTIENT PAS le
 * chemin d'entrée — de sorte qu'un signeur qui rendrait le chemin tel quel
 * ferait réellement tomber l'assertion « aucun chemin brut ne sort ».
 */
```

**Le double de test enregistrant les appels (à recopier, `:18-60`) — c'est lui qui porte
l'AC 5 « le signeur n'est pas appelé » :**

```ts
import { describe, expect, it } from 'vitest';
import { GUEST_PHOTO_TTL_SECONDS, asTextOrNull, resolveGuestMediaUrl, toGuestSteps } from './guest-steps';
import type { GuestMediaSigner } from './guest-steps';

interface SignCall { bucket: string; path: string; expiresIn: number; }
interface SignerOptions {
  /** Rend `{ data: null, error }` pour ces chemins (échec de signature). */
  fail?: (path: string) => boolean;
  /** Lève pour ces chemins (le signeur lui-même est indisponible). */
  throwOn?: (path: string) => boolean;
  /** URL rendue ; par défaut `https://signe.example/<chemin>`. */
  signedUrl?: (path: string) => string;
}

/** Signeur factice enregistrant ses appels ; aucune dépendance à Supabase. */
function makeSigner(options: SignerOptions = {}): { signer: GuestMediaSigner; calls: SignCall[] } {
  const calls: SignCall[] = [];
  const signer: GuestMediaSigner = {
    storage: {
      from(bucket: string) {
        return {
          async createSignedUrl(path: string, expiresIn: number) {
            calls.push({ bucket, path, expiresIn });
            if (options.throwOn?.(path)) throw new Error('signature indisponible');
            if (options.fail?.(path)) return { data: null, error: { message: 'refus' } };
            const signedUrl = options.signedUrl?.(path) ?? `https://signe.example/${path}`;
            return { data: { signedUrl }, error: null };
          },
        };
      },
    },
  };
  return { signer, calls };
}
```

**L'assertion « le signeur n'est PAS appelé » (AC 5 — motif exact à reprendre, `:93-114`)** :

```ts
it('rend une forme http(s) déjà signée telle quelle, sans appeler le signeur', async () => {
  const { signer, calls } = makeSigner();
  expect(await resolveGuestMediaUrl(signer, 'https://externe.example/photo.jpg')).toBe(/* … */);
  expect(calls).toHaveLength(0);            // ← le cœur de l'AC 5
});
it('rend null sans appeler le signeur sur une valeur absente ou vide', async () => {
  const { signer, calls } = makeSigner();
  expect(await resolveGuestMediaUrl(signer, null)).toBeNull();
  expect(await resolveGuestMediaUrl(signer, '   ')).toBeNull();
  expect(await resolveGuestMediaUrl(signer, 42)).toBeNull();
  expect(calls).toHaveLength(0);
});
```

Transposition phase 23 — les cas à couvrir (SPEC AC 4/5, Edge Coverage) :
`<foyerA>/…` → URL signée **et** `calls` = 1 ; `<foyerB>/…` → `null` **et** `calls` = 0 ;
`<foyerA>/../<foyerB>/x.webp` → `null` **et** `calls` = 0 ; `https://…` → `null` **et**
`calls` = 0 ; absent/vide/non-chaîne → `null`, `calls` = 0 ; foyer homonyme
(`household_ab` ne doit pas accepter `household_abc/…`) → `null`, `calls` = 0 ;
échec de signature → `null` ; `createSignedUrl` qui lève → `null` ;
`data.signedUrl` vide → `null` (motif `:124-135`).

**`calls[0]!.expiresIn` se compare à la constante exportée, jamais au littéral 3600
(`:217-226`)** — « le test suit la constante, donc un changement de constante se propage
sans qu'aucun autre site ne le décide ».

**Découverte par la suite** : `app/vite.config.ts` →
`include: ['src/**/*.test.{ts,tsx}', '../supabase/functions/**/*.test.ts']`. Aucun
enregistrement manuel n'est requis.

---

### `supabase/tests/0128_guest_media_household.sql` (NEW — test SQL)

**Analog A (structure — verdict de lecture, `0127_guest_media_household.sql`)** : mêmes
bornes d'assertions, mêmes helpers, même `rollback` final.

**En-tête + bornes (`0127:1-24`)** :

```sql
-- Prouve, sur la base ENTIEREMENT MIGREE :
--   (a) … (b) le RPC ne rend plus une couverture d'un autre foyer ni une forme
--       `http(s)` : c'est le SEUL chemin par lequel l'Edge obtient une valeur a
--       signer, donc le verdict ferme la fuite inter-foyers (AR-21-01) ;
--
-- Bornes (AGENTS.md §2.7D) : chaque assertion porte sur une VALEUR rendue ou
-- sur une ligne designee par `testkit.fx`, jamais sur un total nu. Role
-- `postgres` pour les fixtures et le RPC service_role (comme l'Edge, motif
-- 0026) ; `authenticated` pour la preuve d'ecriture cliente.
--
-- Rouge→vert : avant 0127, (a) `..` est ACCEPTE et (b) la couverture sort
-- TELLE QUELLE — les deux assertions tombent.

begin;
```

**Fixtures (`0127:28-57`)** : `testkit.auth_user` / `testkit.household` / `testkit.member`,
puis des `insert into testkit.fx (key, user_id|household_id|row_id)`.
`testkit.household` rend `household_<uuid>` (`supabase/tests/_setup.sql:220-232`,
`private.new_id('household')`) — c'est cette valeur qui doit préfixer un chemin légitime.

**Le motif d'assertion sur une valeur rendue (`0127:112-142`)** :

```sql
do $$
declare
  v_view jsonb;
  v_cover text;
begin
  -- (b1) Couverture LEGITIME : traverse le RPC inchangee.
  v_cover := v_home_a || '/recipes/' || v_recipe || '/cover.jpg';
  update public.recipes set cover_photo = v_cover where id = v_recipe;
  perform public.create_recipe_share(v_alice, v_recipe, repeat('7', 64), null, 5);
  v_view := public.view_recipe_share(repeat('7', 64));
  perform testkit.eq(v_view ->> 'cover_photo', v_cover,
    'une couverture du foyer de la recette traverse le RPC');

  -- (b2) Couverture d'un AUTRE foyer : ne sort pas (AR-21-01).
  update public.recipes set cover_photo = v_home_b || '/recipes/x/cover.jpg' where id = v_recipe;
  …
  perform testkit.ok(v_view -> 'cover_photo' = 'null'::jsonb,
    'une couverture d''un autre foyer ne sort pas du RPC');
end;
$$;
```

Note : `testkit.ok(x = 'null'::jsonb)` est la forme pour un `jsonb` nul ;
`testkit.eq(...)` est `eq(anyelement, anyelement, text)` — **les deux valeurs doivent être
du même type** (AGENTS.md §2.7 D.5, contrôle de `check-sql-statique.py`).

**Analog B (le seeding d'une vue invitée cadeaux — `0032_guest_view_details.sql`)** :
c'est l'analogue **exact** du scénario cadeaux à écrire.

```sql
-- 0032:36-50 — tables et articles
insert into public.gift_lists (id, household_id, owner_member_id, name, visibility)
values ('gl32_part', home_a, bob_m, 'Noel 32 Partage', 'partagee'), …;

insert into public.gift_items (id, list_id, household_id, name, price, comment, url, photo_url)
values ('gitem32_a', 'gl32_part', home_a, 'Puzzle Lumineux 32-aaaa', 25, 'Bois naturel',
        'https://boutique32.example.fr/puzzle-lumineux-32-aaaa',
        'maison32/cadeaux/puzzle32-aaaa.jpg'),
       …
```

```sql
-- 0032:76-84 — les hashes, puis l'invite créée par le RPC (chemin officiel)
create table testkit.hashes ("h1" text, "h2" text, "h3" text, "h4" text);
insert into testkit.hashes values
  ('aaaaaaaa…64', 'bbbbbbbb…64', 'cccccccc…64', 'dddddddd…64');
grant select on testkit.hashes to anon, authenticated;

select public.create_gift_list_invite(
  p_actor_id => (select user_id from testkit.fx where key = 'bob'),
  p_list_id => 'gl32_part',
  p_token_hash => (select h1 from testkit.hashes),
  p_max_uses => 10
);
```

> ⚠️ `create_gift_list_invite` **désactive le code précédent de la MÊME liste** :
> un seul code par liste si l'on veut plusieurs états (`0032:86-95`). Pour `0128`,
> un seul code suffit → une seule liste.

```sql
-- 0032:190-195 — l'assertion « valeur exacte par article », jamais un total
select testkit.eq(
  (select e ->> 'url'
     from jsonb_array_elements(public.guest_view_gift_list((select h1 from testkit.hashes)) -> 'items') e
    where e ->> 'id' = 'gitem32_a'),
  'https://boutique32.example.fr/puzzle-lumineux-32-aaaa',
  'la vue invitée expose le lien exact de l''article avec contenu');
```

**AC 3 (le foyer n'apparaît dans aucune clé)** — motif d'assertion **sur le jsonb rendu**,
pas sur le texte source (`0032:236-244` montre la forme `testkit.count(...)` sur
`jsonb_array_elements`) :

```sql
-- 0032:236-244 (forme à transposer)
select testkit.eq(testkit.count(
  'select 1 from jsonb_array_elements(public.guest_view_gift_list((select h1 from testkit.hashes)) -> ''items'') e'
  ' where (e ? ''reserved_by'') or (e ? ''reserved_by_name'') or (e ? ''author'')'),
  0::bigint,
  'aucun objet article de la charge invitée ne porte d''identifiant d''auteur');
```

Pour l'AC 3 : compter les occurrences de la chaîne du foyer dans `guest_view_gift_list(h1)::text`
doit rendre **0**. ⚠️ `testkit.count('…')` exécute la chaîne dans une **fonction séparée** :
une variable plpgsql du bloc appelant n'y existe pas (AGENTS.md §2.7 D.5). Passer la valeur
par `format(...)`/littéral, ou compter via `testkit.eq` sur une sous-requête bornée.

**Escalier `rollback`** : `0127:226` — `begin;` … `rollback;` (dernière ligne du fichier).

**Migration en base** : `0128` doit être appliquée avant que `sh scripts/test-db.sh 0128`
ne passe (`sh scripts/migrate.sh`, `scripts/test-db.sh:1-60`).

---

### `supabase/tests/0032_guest_view_details.sql` (**MODIFY — fichier découvert, absent de la liste candidate**)

**Pourquoi il casse.** La section 3 (`:207-232`) affirme la valeur **brute** de `photo_url`,
et ses deux fixtures ne satisfont **aucune** des deux clauses du nouveau verdict :

- `:212-218` — `gitem32_a.photo_url = 'maison32/cadeaux/puzzle32-aaaa.jpg'` (`:47-50`).
  Le foyer de `gl32_part` est `testkit.household(alice, 'Foyer 32')` → `household_<uuid>`
  (`_setup.sql:220-232`). `'maison32/…'` **ne commence pas** par ce préfixe → `null`.
  L'assertion « expose la valeur brute du chemin bucket » **échouera**.
- `:219-223` — `gitem32_c.photo_url = 'https://cdn32.example.fr/photos/livre32-cccc.jpg'`
  (`:54-55`) → forme non-chemin → `null`. L'assertion « expose la valeur brute de la forme
  héritée » **échouera**, et c'est **exactement** l'AC 2 du SPEC porté par un autre fichier.

**Forme actuelle (à corriger)** :

```sql
-- 0032:207-232
-- 3. Exposition exacte de la valeur brute photo (G-06-1a) : la base rend tel
--    que stocké (chemin bucket OU url héritée) ; l'article nu porte les clés
--    avec des valeurs nulles — présent, jamais d'erreur (échec fermé).
select testkit.eq(
  (select e ->> 'photo_url'
     from jsonb_array_elements(public.guest_view_gift_list((select h1 from testkit.hashes)) -> 'items') e
    where e ->> 'id' = 'gitem32_a'),
  'maison32/cadeaux/puzzle32-aaaa.jpg',
  'la vue invitée expose la valeur brute du chemin bucket');
select testkit.eq(
  (select e ->> 'photo_url'
     from jsonb_array_elements(public.guest_view_gift_list((select h1 from testkit.hashes)) -> 'items') e
    where e ->> 'id' = 'gitem32_c'),
  'https://cdn32.example.fr/photos/livre32-cccc.jpg',
  'la vue invitée expose la valeur brute de la forme héritée');
```

**Deux issues, au choix du plan** (les deux sont défendables ; la seconde est la moins
invasive et préserve le sens de `gitem32_c` « forme héritée ») :

1. **Réécrire les fixtures** : semer `gitem32_a.photo_url` =
   `(select household_id from … 'home_a') || '/cadeaux/puzzle32-aaaa.jpg'` — mais les
   fixtures sont dans le même fichier, et une assertion qui lit le foyer doit alors
   le lire depuis `testkit.fx`.
2. **Réécrire les assertions** : `gitem32_a` et `gitem32_c` rendent `null`, avec un
   commentaire qui **nomme la raison** (verdict de lecture borné au foyer, `0128`) —
   même geste que `0127:149-152` (« sans cette mise de côté, l'assertion serait
   inatteignable — donc incapable d'échouer, donc inutile »).

Dans les deux cas, **les assertions restantes du fichier ne bougent pas** : `url`
(`:190-204`), `reserved` (`:246-273`), privilèges (`:277-290`), vue masquée (`:292+`).
La ligne `:226-232` (« l'article nu porte quand même les clés ») reste vraie et devient
le cas nominal des trois articles.

**Autres fichiers SQL vérifiés sans impact** : `grep -rn "photo_url" supabase/tests/`
ne montre, hors `0001_schema_contract.sql` (contrat de colonnes) et les tables `contacts`/
`birthdays`, que `0032` et `0124`. Aucun autre fichier n'exerce `guest_view_gift_list`
sur une valeur média : `0029_gift_guest.sql`, `0031_guest_reserve_purchased.sql`,
`0051_enfant_perimeter.sql` n'assertent que `list_name`, `items`, `reserved`,
`reserved_by*` et les privilèges.

---

### `app/src/modules/cadeaux/api.test.ts` (MODIFY)

**Analog :** lui-même (les tests de la couche données invitée, `describe('guest helpers (D-05/D-06/D-07)')`).

**L'assertion à traiter (`:165-199`)** :

```ts
it('la vue invitée ne porte aucun champ auteur (assertion runtime sur les clés)', async () => {
  stubGuestFetch(() => ({
    listId: 'gift-list-1',
    listName: 'Noël Mamie',
    items: [
      { id: 'gift-item-1', name: 'Foulard', price: 29, comment: null, reserved: true,
        url: 'https://boutique.example.fr/foulard-32',
        photoUrl: 'https://cdn.example.fr/foulard-32.jpg',   // ← :178, le relais à retirer
        reserved_by: 'member-thomas', reserved_by_name: 'Thomas', author: 'member-thomas' },
    ],
  }));
  const view = await fetchGuestGiftView(GUEST_CODE);
  expect(Object.keys(item).sort()).toEqual(['comment', 'id', 'name', 'photoUrl', 'price', 'reserved', 'url']);
  …
  expect(view.items[0]?.photoUrl).toBe('https://cdn.example.fr/foulard-32.jpg');  // ← :198
});
```

**Pourquoi le test est concerné malgré un changement serveur** : la charge **servie** change
(le RPC ne rend plus `http(s)`), donc le cas « photoUrl http(s) » n'est plus un cas
légitime mais un cas **impossible** à couvrir par la couche client. La forme `stubGuestFetch`
(`:147-160`) et le mapping client `toGuestGiftItem` (`app/src/modules/cadeaux/api.ts:549-562`,
`photoUrl: asGuestText(row.photoUrl)`) ne changent pas — seule la **valeur du doublon de
test** et l'assertion changent.

**Ce qui ne bouge pas** : `:201-218` (« non-chaînes ou vides → null défensif »), `:220-263`
(en-têtes publishable/session), `:265-289` (gardes clientes, oracle).

---

### `app/src/modules/cadeaux/guest-cadeau-page.test.tsx` (MODIFY)

**Analog :** lui-même. Le test « lien ou photo non-http : rien rendu (échec fermé, T-06-10) »
(`:318-350`) porte le `data:` à `:328` :

```tsx
it('lien ou photo non-http : rien rendu (échec fermé, T-06-10)', async () => {
  mockGuestFetch({ view: { listId: 'gift-list-1', listName: 'Noël Mamie',
    items: [{ id: 'gift-item-1', name: 'Piège', price: 1, comment: null,
      url: 'javascript:alert(1)',
      photoUrl: 'data:image/png;base64,eG1s',   // ← :328
      reserved: false }] } });
  …
      // La couche données laisse passer la chaîne, le rendu refuse le schéma —
      // jusque dans le détail déplié (même garde que la vignette).
      await user.click(screen.getByRole('button', { name: /Piège/ }));
      expect(container.querySelector('#guest-item-detail-gift-item-1')).not.toBeNull();
      expect(container.querySelector('li img')).toBeNull();
      expect(container.querySelector('li a')).toBeNull();
```

**Garde de rendu côté client, à ne PAS supprimer (défense en profondeur)** —
`app/src/modules/cadeaux/guest-cadeau-page.tsx:199-206` :

```tsx
/**
 * Garde de rendu des valeurs servies (T-06-10) : seules les URL http(s)
 * — liens organizers et photoUrl forgées par l'Edge (passage hérité ou
 * signée https) — atteignent le DOM. Toute autre forme (donnée corrompue,
 * schéma non-http) ne rend rien : échec fermé côté client aussi.
 */
function isServableHttpUrl(value: string | null): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}
```

> La parenthèse « (passage hérité ou signée https) » devient **fausse** avec D-03 :
> c'est le seul mot à corriger si le fichier est ouvert. **`guest-cadeau-page.tsx` n'est
> pas listé dans le Scope du SPEC** — le signaler plutôt que l'élargir silencieusement.

---

### `app/src/modules/ardoise/api.test.ts` (MODIFY)

**Analog :** lui-même, `describe('couverture d'ardoise — résolution (D-01)')` (`:125-170`).

**Assertions concernées (`:148-170`)** :

```ts
it('valeur unique : un chemin se signe, une forme non-chemin n'est pas un objet à signer', async () => {
  supabaseState.configured = true;
  expect(await resolveArdoiseCoverUrl('foyer-1/ardoises/plage.webp')).toBe(
    'https://signe.example/foyer-1/ardoises/plage.webp',
  );
  expect(await resolveArdoiseCoverUrl('https://externe.example/photo.jpg')).toBeNull();
  expect(await resolveArdoiseCoverUrl(null)).toBeNull();
  expect(storageMocks.createSignedUrl).toHaveBeenCalledTimes(1);
});

it('coverUrlOf : URL résolue pour un chemin, brute pour une forme non-chemin, null si blanc ou non signé', () => {
  const row = (cover_url: string | null): ArdoiseRow => ({ id: 'ardoise-1', cover_url }) as ArdoiseRow;
  const resolved = { 'ardoise-1': 'https://signe.example/foyer-1/ardoises/plage.webp' };
  expect(displayableCoverUrl(row('foyer-1/ardoises/plage.webp'), resolved)).toBe(
    'https://signe.example/foyer-1/ardoises/plage.webp',
  );
  expect(displayableCoverUrl(row('foyer-1/ardoises/plage.webp'), {})).toBeNull();
  expect(displayableCoverUrl(row('https://externe.example/photo.jpg'), {})).toBe('https://externe.example/photo.jpg');
  //                                                                                ↑ :170, la seule ligne qui « affirme le relais »
});
```

**Lecture** : `resolveArdoiseCoverUrl` (`app/src/modules/ardoise/api.ts:193-201`) rend
**déjà** `null` sur `http(s)` — les assertions `:155-157` sont déjà conformes. La ligne
`:170` porte la doctrine inverse sur `displayableCoverUrl`/`coverUrlOf`
(`api.ts:203-231`, `householdMediaPathOf(row?.cover_url ?? null)`), qui sert la vue
**propriétaire** et non la surface invitée. Deux issues : (a) l'ajuster avec un commentaire
qui nomme la surface (propriétaire ≠ invitée), ou (b) la laisser et l'écrire comme telle.
**Aucun comportement client n'a besoin de changer** : le changement est côté Edge (`buildGuestView`).

---

## Shared Patterns

### 1. Un seul signeur, un seul TTL, un seul verdict
**Sources :** `recipe-invite/guest-steps.ts:20-23, 38-47, 59-76` · `0127:156-162, 189-195`
**S'applique à :** `ardoise-invite/guest-media.ts`, `gift-list-invite/index.ts:857-871`,
`ardoise-invite/index.ts:637-651`
Le signeur est unique par surface, décrit par une interface **structurelle**
(`GuestMediaSigner`) pour rester hors de `npm:` ; le TTL est une constante **exportée**,
jamais un littéral recopié dans un test (motif `guest-steps.test.ts:217-226`).

### 2. Échec fermé (absent, vide, forme inconnue, `http(s)`, erreur, exception → `null`)
**Sources :** `0127:36-37, 163-167` · `guest-steps.ts:66-75` · `ardoise-invite/index.ts:641-650`
**S'applique à :** les trois sites ci-dessus + le `case` du RPC.
Aucune erreur remontée, **rien de sensible journalisé** (ni chemin ni URL).

### 3. Le foyer sert au verdict, il n'est jamais rendu
**Source :** `0127:116-120` (« il ne recopie pas le jsonb du RPC ») · `23-SPEC.md:159` (constante)
et `23-SPEC.md:173-174` (AC 3)
**S'applique à :** `0128` (le RPC) et `ardoise-invite/index.ts:739-750` (la charge JSON
est construite champ par champ ; `household_id` ne doit apparaître dans **aucune** clé).
Assertion : compter les occurrences de la chaîne du foyer dans la charge sérialisée → 0.

### 4. `starts_with(valeur, foyer || '/')` et `strpos(valeur, '..') = 0`
**Sources :** `0126:22-31` (pourquoi `starts_with` et non `like`) · `0127:42-47` (pourquoi
`strpos` et non un motif) · `0127:63` (les deux clauses ensembles)
**S'applique à :** le `case` de `0128` **et** au prédicat TypeScript du module pur —
la barre finale ferme le foyer homonyme, les deux points fermés ferment la remontée.

### 5. Correction vers l'avant, preuve sans `deno`
**Sources :** `0127:39-40` (jamais réécrire une migration appliquée) ·
`guest-steps.ts:1-6` + `app/vite.config.ts` (`include: '../supabase/functions/**/*.test.ts'`)
**S'applique à :** `0128` (seule migration nouvelle), `guest-media.ts` + son test
(aucun import Deno ni `npm:`), `supabase/tests/0128_*.sql` (prouvé par `scripts/test-db.sh`).

### 6. Aucune directive de linter
**Source :** `AGENTS.md` §2.7 (aucun linter configuré ; `app/src/lib/no-eslint-directive.test.ts`
refuse la réintroduction) · `23-CONTEXT.md` Prohibitions.
Une omission de dépendance porte un **commentaire qui nomme la raison** en français.

---

## No Analog Found

Aucun. Chaque fichier de la phase a un analogue exact :

| File | Role | Data Flow | Analogue |
|---|---|---|---|
| `ardoise-invite/guest-media.ts` | utility pure | transform | `recipe-invite/guest-steps.ts` (module pur, interface structurelle, doctrine en tête) |
| `ardoise-invite/guest-media.test.ts` | test | transform | `recipe-invite/guest-steps.test.ts` (double de test enregistrant `calls`) |
| `supabase/tests/0128_*.sql` | test SQL | request-response | `0127_guest_media_household.sql` (structure) + `0032_guest_view_details.sql` (seeding cadeaux) |

---

## Metadata

**Analog search scope :** `supabase/migrations/`, `supabase/tests/`, `supabase/functions/*/`,
`app/src/modules/{cadeaux,ardoise}/`, `app/vite.config.ts`, `scripts/` (lecture seule)
**Files scanned :** ~26 (dont 14 lus intégralement)
**Vérifications d'exécution :** `pg_get_functiondef('public.guest_view_gift_list')` et
`obj_description` lus sur la base vivante (`scripts/psql.sh`) le 2026-10-17 —
définition effective = `0092:33-96` ; `git ls-files` sur les 12 chemins d'analogue
(10 tracked, 2 à créer)
**Pattern extraction date :** 2026-10-17

**Écart avec la liste candidate du brief :** `supabase/tests/0032_guest_view_details.sql`
n'y figurait pas et **doit** être modifié (deux assertions `photo_url` deviennent fausses
sous le verdict de `0128`, cf. section dédiée). Aucun autre écart : le nom du module pur
(`guest-media.ts`) et de son test suit la convention du dossier voisin
(`child-guard.ts` / `child-guard.test.ts`).
