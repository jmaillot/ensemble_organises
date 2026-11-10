---
phase: 40-ardoise-rejoindre-via-mon-compte
reviewed: 2026-11-09T00:00:00Z
depth: deep
files_reviewed: 13
files_reviewed_list:
  - supabase/migrations/0180_ardoise_bridge_token.sql
  - supabase/migrations/0180b_ardoise_bridge_fill.sql
  - supabase/migrations/0181_ardoise_reconciliation.sql
  - supabase/tests/0180_ardoise_bridge.test.sql
  - supabase/functions/ardoise-invite/index.ts
  - app/src/modules/ardoise/api.ts
  - app/src/modules/ardoise/guest-ardoise-page.tsx
  - app/src/modules/ardoise/guest-ardoise-page.test.tsx
  - app/src/modules/landing/join-household-page.tsx
  - app/src/modules/landing/join-household-page.test.tsx
  - app/src/modules/calendrier/calendrier-page.test.tsx
  - app/src/lib/invites.ts
  - app/src/components/ui/confirm-dialog.tsx
findings:
  critical: 1
  major: 3
  minor: 4
  total: 8
status: issues_found
---

# Phase 40 : Rapport de revue de code

**Revu le :** 2026-11-09
**Profondeur :** deep (traces inter-modules Edge ↔ RPC ↔ frontend)
**Fichiers revus :** 13
**Statut :** issues_found

## Résumé

La phase 40 est globalement solide sur les axes de sécurité demandés : `search_path = ''` avec noms qualifiés partout (0180/0180b/0181), comparaison de hash à temps constant via `private.token_hash_matches` (0181 l.77), secrets distincts `ARDOISE_HMAC_SECRET` / `INVITE_TOKEN_HMAC_SECRET` jamais journalisés, 404 uniforme « Lien invalide. » sur code inconnu/révoqué/expiré (pas d'oracle), RPC bridge en `service_role` seul avec contrôle négatif prouvé, bornes max_uses=1/15 min en dur, réconciliation doublement bornée (pont user+foyer ET `expenses.household_id`), tests SQL vu ROUGE avant vert, `check-sql-statique` vert (231 fonctions, aucun défaut).

Un défaut d'autorisation réel subsiste toutefois dans l'action Edge `household-token` : elle n'honore pas `max_uses` du code de partage ardoise. Trois avertissements complémentaires (marqueur d'atterrissage non nettoyé sur échec, garde enfant absent de la nouvelle action, comparaison ISO lexicographique fragile).

---

## Problèmes critiques

### CR-01 : `household-token` ignore `max_uses`/`use_count` du code de partage ardoise — contournement du quota d'utilisations

**Fichier :** `supabase/functions/ardoise-invite/index.ts:572-583` (comparé à `redeem_ardoise_invite`, migration `0113_enfant_perimeter.sql:1080-1084`)
**Sévérité :** critique (autorisation)

**Problème.** Le chemin de référence (`redeem_ardoise_invite`, l.1082) refuse un code quand `max_uses is not null and use_count >= max_uses`. Le nouveau chemin `household-token` ne vérifie que `is_active` et `expires_at` :

```ts
const { data: ardoise } = await admin
  .from('ardoises')
  .select('id,household_id,is_active,expires_at')   // ← use_count / max_uses absents
  .eq('invite_hash', codeHash)
  .maybeSingle();
if (!row || !row.is_active) throw new ArdoiseInviteError(404, 'Lien invalide.');
if (row.expires_at && row.expires_at <= new Date().toISOString()) { … }
```

Or `redeem` incrémente `use_count` sans désactiver le code : un code `max_uses=1` déjà consommé reste `is_active=true`. Concrètement, un code **épuisé** (refusé à tout invité) permet encore à **n'importe quel utilisateur connecté** de minter des tokens d'invitation foyer — l'action qui mène à une **adhésion au foyer**, un privilège supérieur au rattachement invité que `max_uses` est censé borner. Seule la limite de débit (8/min/IP, par IP usurpable via `x-forwarded-for`) borne l'abus. Le texte UI de la page invitée (« le compteur d'utilisations du lien compte les rachats ») devient également faux pour ce chemin.

**Correctif suggéré :**

```ts
.select('id,household_id,is_active,expires_at,use_count,max_uses')
// …
if (row.max_uses !== null && row.use_count >= row.max_uses) {
  throw new ArdoiseInviteError(404, 'Lien invalide.'); // même 404 uniforme
}
```

Idéalement, déplacer ce garde dans un RPC serveur (miroir du l.1082) pour qu'il soit prouvé par `test-db.sh`, et ajouter le cas négatif au fichier de test SQL.

---

## Avertissements

### WR-01 : le marqueur d'atterrissage ardoise survit à un échec de redeem — mauvaise destination différée

**Fichier :** `app/src/modules/landing/join-household-page.tsx:159-167`
**Sévérité :** majeure (comportement utilisateur)

**Problème.** `setArdoiseLanding()` est posé par la page invitée AVANT la navigation vers `/foyer/rejoindre` ; `getArdoiseLanding()` n'est lu **qu'au succès** (l.159). Sur échec du redeem, le `catch` (l.160-167) nettoie `pendingInviteToken` mais **jamais** le marqueur ardoise. Scénario : l'échange code→token réussit (marqueur posé), le redeem échoue (token expiré entre-temps, 15 min), l'utilisateur quitte, puis rejoint PLUS TARD un autre foyer via une invitation ordinaire → `getArdoiseLanding()` consomme le marqueur périmé et l'atterrissage se fait sur `/ardoise` du mauvais foyer.

**Correctif suggéré :** dans le `catch`, appeler `clearArdoiseLanding()` à côté de `clearPendingInviteToken()`.

### WR-02 : `household-token` n'applique pas le garde enfant (D-03), incohérent avec toutes les autres actions `user`

**Fichier :** `supabase/functions/ardoise-invite/index.ts:568-597`
**Sévérité :** majeure (cohérence du périmètre enfant)

**Problème.** Toutes les actions `user` (`create-ardoise`, `create`, `revoke`, `summary`, `join`, `add-guest`) résolvent le rôle côté serveur et refusent `enfant`. `handleHouseholdToken` ne le fait pas : un membre enfant porteur d'un code valide obtient un token foyer ; le redeem idempotent le laisse passer (déjà membre) et la réconciliation 0181 convertit des parts guest au nom d'un membre **enfant** — des parts que la vue publique filtre précisément (WR-04, 37-REVIEW) et que l'UI interne ne propose jamais. Rappel : le refus doit rester sous l'oracle uniforme (404 « Lien invalide. ») et n'arriver qu'APRÈS validation du code, pour ne pas créer d'oracle sur les codes.

**Correctif suggéré :** après la validation is_active/expiry/max_uses (cf. CR-01) et avant le RPC, résoudre le rôle via `callerRole(admin, row.household_id, userId)` et jeter `ArdoiseInviteError(404, 'Lien invalide.')` si `isChildRole(role)`.

### WR-03 : comparaison lexicographique de formats ISO différents sur l'expiration

**Fichier :** `supabase/functions/ardoise-invite/index.ts:581-582` (même motif l.894 pour `link-view`, préexistant)
**Sévérité :** majeure (fragilité, frontière exacte)

**Problème.** `row.expires_at <= new Date().toISOString()` compare la chaîne PostgREST (format `2026-11-09T12:00:00+00:00`) à une chaîne `toISOString()` (format `2026-11-09T12:00:00.000Z`). L'ordre lexicographique entre `+00:00` (0x2B) et `.000Z` (0x2E) est correct par coïncidence au même décalage zéro, mais casse pour un fuseau non-UTC et ne compare pas des instants. Le préfixe date domine en pratique, d'où un défaut invisible hors seconde de frontière — exactement la classe de défaut que §2.7-A documente (vert au test, faux à l'exécution).

**Correctif suggéré :** comparer des instants : `if (row.expires_at && Date.parse(row.expires_at) <= Date.now())`. Corriger les deux occurrences (household-token et link-view) — même classe, cf. AGENTS §2.7-E.

---

## Points mineurs

### IN-01 : branche dupliquée morte dans `translateRpcError`

**Fichier :** `supabase/functions/ardoise-invite/index.ts:297-299`
**Sévérité :** mineure (qualité)

`if (message.includes('session requise'))` apparaît deux fois (l.297 et l.299), la seconde est inatteignable. Supprimer le doublon.

### IN-02 : phrase dupliquée dans la docstring de la page invitée

**Fichier :** `app/src/modules/ardoise/guest-ardoise-page.tsx:31-33`
**Sévérité :** mineure (qualité)

« il faut un compte puis rejoindre l'ardoise (l'adhésion » est recopié deux fois. Nettoyer.

### IN-03 : émission bridge non bornée en volume côté base

**Fichier :** `supabase/migrations/0180b_ardoise_bridge_fill.sql:63-68`
**Sévérité :** mineure (acceptée, à documenter)

Chaque confirmation insère une ligne `household_invite_tokens` (TTL 15 min, purge pg_cron quotidienne). Un utilisateur peut en générer plusieurs à la minute (rate limit 8/min). Acceptable, mais un commentaire de migration ou une note de runbook le noterai explicitement — « une absence affirmée est une affirmation » (§2.7-I).

### IN-04 : pastille du ConfirmDialog reste dans la palette destructive pour une adhésion

**Fichier :** `app/src/components/ui/confirm-dialog.tsx:51`
**Sévérité :** mineure (cosmétique)

Avec `destructive={false} icon="users"`, la pastille conserve `bg-coral-soft text-coral-text` (sémantique suppression). Un fond neutre/accent quand `destructive=false` rendrait la sémantique visuelle cohérente avec l'icône introduite par 01c013c.

---

## Points vérifiés sans défaut (preuves)

- **RLS / privilèges** : `create_household_bridge_token` en `security definer`, `search_path = ''`, noms qualifiés (`public.`, `private.`) partout ; `revoke` public/anon/authenticated + `grant` service_role seul, cas négatif 42501 prouvé (test cas 8). Cohérence pont vérifiée dans le RPC (ardoise active ET appartenant au foyer, 0180b l.51-58) — un appelant mensonger ne peut pas minter un token pour un foyer non contrôlé.
- **Secrets** : `ARDOISE_HMAC_SECRET` (code ardoise) et `INVITE_TOKEN_HMAC_SECRET` (token foyer) restent des espaces de clés distincts (ARD-03) ; aucun secret persisté ni journalisé ; le token bridge brut n'est rendu qu'une fois (l.596) et le client ne le stocke pas (navigation directe).
- **Anti-oracle** : 404 uniforme « Lien invalide. » sur inconnu/inactif/expiré ; le pré-écran foyer conserve son message unique D-03.
- **Réconciliation (0181)** : double borne foyer, fusion doublon delete-avant-update (23505 impossible), report des parts pour le trigger différé de somme, inscription `ardoise_members` avant conversion (23514 évité), purge du pont consommé, idempotence déjà-membre préservée avec réconciliation exécutée — le tout dans LA même transaction que l'adhésion (ARD-02). Aucune correspondance par `display_name`.
- **Tests** : 8 cas SQL non tautologiques vus ROUGE avant application de 0181 ; 17 + 16 cas RTL ciblés (confirmation avant tout appel Edge, aucun redeem au montage, 403/401/404 affichés tels quels, marqueur lu-et-effacé) ; `check-sql-statique` : vert.

---

_Revu le : 2026-11-09_
_Relecteur : the agent (gsd-code-reviewer)_
_Profondeur : deep_
