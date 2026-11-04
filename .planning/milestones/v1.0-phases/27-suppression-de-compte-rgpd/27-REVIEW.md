---
phase: 27-suppression-de-compte-rgpd
reviewed: 2026-10-27T18:30:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - supabase/migrations/0166_account_deletion_tables.sql
  - supabase/migrations/0167_account_deletion_rpc.sql
  - supabase/migrations/0168_account_deletion_purge_cron.sql
  - supabase/migrations/0169_account_deletion_manifest_rpc.sql
  - supabase/tests/0166_account_deletion_tables.test.sql
  - supabase/tests/0168_account_deletion_purge.test.sql
  - supabase/tests/0169_account_deletion_manifest_rpc.test.sql
  - supabase/functions/household-delete/index.ts
  - app/src/modules/parametres/api.ts
  - app/src/modules/parametres/components/gdpr-delete-panel.tsx
  - app/src/modules/parametres/gdpr-cancel-page.tsx
  - app/src/modules/parametres/types.ts
  - app/src/app/router.tsx
  - app/src/app/route-preload.ts
findings:
  critical: 2
  warning: 4
  info: 4
  total: 10
status: issues_found
---

# Phase 27: Code Review Report

**Reviewed:** 2026-10-27T18:30:00Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Revue des migrations 0166–0169, de l'Edge unifiée `household-delete`, des tests SQL et du front Paramètres RGPD. Le socle SQL est globalement solide : RLS correcte sur les deux nouvelles tables (select-own / aucune politique client), `search_path = ''` et noms qualifiés partout, privilèges service_role/authenticated prouvés en migration, purge J+30 réellement 100 % SQL, instantané avant déshumanisation, et le manifest construit avant suppression de l'orphelin.

Deux défauts critiques ont néanmoins été prouvés : **le kill global de sessions (RGDP-01, cœur du phase) ne fonctionne jamais** — `admin.auth.signOut(jwt, { scope: 'global' })` lève une erreur avant toute requête HTTP car `signOut` attend un `scope` de type chaîne, pas un objet (prouvé dans le code de `@supabase/auth-js` en `node_modules`) ; et **la déshumanisation/annulation corrompt les noms affichés d'un utilisateur membre de plusieurs foyers** (un seul instantané pour N lignes membres).

## Critical Issues

### CR-01: Le kill global des sessions ne part jamais — signature `signOut` invalide (RGDP-01 cassé)

**File:** `supabase/functions/household-delete/index.ts:382`

**Issue:** `handleCompte` appelle `admin.auth.signOut(jwt, { scope: 'global' })`. Or `GoTrueAdminApi.signOut(jwt: string, scope?: SignOutScope)` attend `scope` comme **chaîne** (`'global' | 'local' | 'others'`) et commence par :

```js
if (SIGN_OUT_SCOPES.indexOf(scope) < 0) {
  throw new Error(`@supabase/auth-js: Parameter scope must be one of global, local, others`);
}
```

(prouvé dans `app/node_modules/@supabase/auth-js/dist/main/GoTrueAdminApi.js:67-70`). Un objet ne matche jamais : la fonction **lève avant tout appel HTTP** — le commentaire SONDE F1 (« le client GoTrue poste `/auth/v1/logout?scope=global` avec CE jwt ») est faux. Le `throw` est absorbé par le `catch (signOutUnknown)` ligne 385, `sessionsRevoked` reste `false`, et la réponse est un 200 : **toutes les sessions de l'utilisateur restent actives** après une demande de suppression de compte. Le panneau affiche en plus « Vos sessions ont été coupées » (voir WR-04), donc personne ne s'en aperçoit. C'est le must-have central du phase (RGDP-01, « sessions tuées immédiatement »), silencieusement inopérant.

**Fix:**
```ts
// signOut(jwt, scope: SignOutScope) — scope en chaîne, pas un objet
const { error: signOutError } = await admin.auth.signOut(jwt, 'global');
```
Puis ajouter un test (vitest ou e2e) qui prouve `sessions_revoked === true` sur le mode 'compte' — le contrat actuel ne peut pas distinguer ce bug d'un succès.

### CR-02: Déshumanisation de N lignes membres avec un seul instantané — l'annulation réécrit les noms des autres foyers

**File:** `supabase/migrations/0167_account_deletion_rpc.sql:90-135` (request) et `:187-196` (cancel)

**Issue:** Le projet autorise un utilisateur dans **plusieurs foyers** (AGENTS §1, `household_members` en 0..n par user). `request_account_deletion` déshumanise **toutes** les lignes membres de l'acteur, tous foyers confondus :

```sql
update public.household_members
   set account_deleted_at = now(), display_name = 'Ancien membre', avatar_url = null
 where user_id = v_actor and account_deleted_at is null;
```

mais l'instantané D-04 ne capture que **la plus ancienne** ligne (`order by created_at asc limit 1`, une seule ligne dans `account_deletion_restorations`). À l'annulation, `cancel_account_deletion` restaure le nom de CETTE ligne sur **toutes** les lignes (`where user_id = v_actor`, sans filtre) : les noms et avatars d'origine des lignes membres des **autres foyers** sont définitivement perdus et remplacés par celui du foyer d'ancrage (dès la demande, ligne 130 — l'annulation ne peut que propager la mauvaise valeur). Perte de données utilisateur silencieuse, sans garde en base.

**Fix:** soit borne la déshumanisation ET la restauration à la ligne d'ancrage (et traite les autres lignes à la purge, où le `set null` du FK suffit), soit stocke l'instantané **par ligne membre** (table enfant `account_deletion_restoration_members (member_row_id, display_name, avatar_url)`) et restaure ligne par ligne.

## Warnings

### WR-01: Le rappel J-7 est perdu définitivement si le POST échoue — le commentaire « le redrive du cron est le retry » est faux

**File:** `supabase/migrations/0168_account_deletion_purge_cron.sql:307-327`

**Issue:** Le flag `rappel_envoye = true` (+ statut `rappellee`) est posé **avant** `perform net.http_post(...)`. Mais pg_net est asynchrone et fire-and-forget : le succès du `perform` ne prouve aucune livraison. Au redrive du cron suivant, le comptage filtre `rappel_envoye = false` → 0 ligne → `return false` : **aucun retry n'a jamais lieu**. Le commentaire lignes 304-306 (« le redrive du cron est le retry, jamais un doublon ») décrit l'inverse de ce que fait le code : le flag-avant-POST élimine les doublons en échange de la perte garantie du rappel en cas d'échec HTTP. De plus, l'Edge ne rejoue que les demandes `updated_at >= now() - 24h` (`handleReminder`, index.ts:449) : un jour de cron manqué perd aussi le rappel. RGDP-03 (alerte J-7) est donc « best effort sans retry », alors que le SUMMARY le présente comme idempotent-retry.

**Fix:** à minima, documenter honnêtement la perte possible ; mieux : réarmer le flag si la livraison échoue (vérifier `net._http_response` comme le fait `test-dispatch-push.sh`, qui est précisément attribuable pour ce motif), ou élargir la fenêtre de relecture Edge au-delà de 24 h.

### WR-02: Le manifest de médias ignore `bucket_id` — fragilité cross-bucket et jumeaux non purgés

**File:** `supabase/migrations/0168_account_deletion_purge_cron.sql:130-135` et `supabase/functions/household-delete/index.ts:517-525`

**Issue:** L'insertion du manifest sélectionne `storage.objects o where o.name like v_hh.household_id || '/%'` **sans filtre sur `o.bucket_id`**, et la table ne porte pas de colonne bucket. Aujourd'hui les deux buckets du foyer utilisent le préfixe `<household_id>/` donc ça marche, mais (a) tout bucket futur avec la même convention polluerait le manifest, et (b) l'Edge compense en essayant chaque bucket et marque `purged` dès le **premier** succès : un chemin homonyme présent dans les **deux** buckets ne serait purgé que dans le premier, l'autre restant orphelin pour toujours (manifest marqué, plus jamais relu).

**Fix:** ajouter `bucket_id` au manifest, filtrer `o.bucket_id in ('household-media','household-avatars')` à l'insertion, et faire supprimer par l'Edge le chemin dans SON bucket (claim renvoie le bucket) plutôt que « essayer chaque bucket ».

### WR-03: « Les sélecteurs excluent les lignes `account_deleted_at` » — affirmation fausse (AGENTS §2.7 I)

**File:** `app/src/types/database.ts:107-109` et entête de `supabase/migrations/0166_account_deletion_tables.sql:5-6`

**Issue:** Les deux commentaires affirment que « les sélecteurs excluent les lignes où `account_deleted_at` ou `deleted_at` est posée ». Un `grep account_deleted_at app/src supabase/migrations` ne trouve **aucun** sélecteur ni vue SQL filtrant cette colonne (seul le commentaire la mentionne). Conséquence : entre la demande et la purge J+30, la ligne « Ancien membre » reste dans les listes de membres, les assignations, les soldes, etc. C'est peut-être le comportement voulu (déshumanisation visible plutôt que masquage), mais alors la documentation ment — précisément le piège §2.7 I : une limite périmée dissuade le prochain lecteur de chercher.

**Fix:** trancher : soit filtrer `account_deleted_at is null` dans les sélecteurs de membres (comme `deleted_at`), soit corriger les deux commentaires pour dire que la ligne reste visible sous le nom « Ancien membre ».

### WR-04: Le panneau affiche « Vos sessions ont été coupées » même quand `sessions_revoked` est false

**File:** `app/src/modules/parametres/components/gdpr-delete-panel.tsx:70-74`

**Issue:** Le message de succès ne dépend que de `result.email_sent` ; `sessions_revoked` est ignoré. Combiné à CR-01 (toujours false), l'utilisateur reçoit une affirmation fausse sur une opération destructive — et le bug CR-01 est invisible. Par ailleurs l'Edge renvoie `email_error` (message d'exception SMTP brut, index.ts:430) que l'UI affiche tel quel : fuite de détails d'infrastructure vers le client.

**Fix:** brancher le message sur les deux champs (« Demande enregistrée. Sessions coupées : oui/non. E-mail : envoyé/non ») et afficher un libellé générique côté client plutôt que `email_error` brut.

## Info

### IN-01: Destinataire incohérent entre e-mail de confirmation et rappel J-7

**File:** `supabase/functions/household-delete/index.ts:401` vs `:464-469`

**Issue:** Le mode 'compte' envoie à `ctx.userClaims?.email` (claim du JWT, potentiellement périmé ou non vérifié) ; le rappel J-7 lit `profiles.email`. Un utilisateur ayant changé d'adresse recevrait la confirmation à l'ancienne et le rappel à la nouvelle.

**Fix:** lire `profiles.email` dans les deux chemins (l'admin client est déjà disponible).

### IN-02: Libellés promettant la « restauration des sessions »

**File:** `app/src/modules/parametres/components/gdpr-delete-panel.tsx:126` et `gdpr-cancel-page.tsx:91`

**Issue:** « l'annulation restaure votre nom, votre photo et vos sessions » / « vos accès seront restaurés immédiatement » : les sessions ne sont pas restaurées (elles ont été tuées côté serveur) ; l'utilisateur doit se reconnecter. Promesse non tenue dans l'UI.

**Fix:** reformuler (« reconnectez-vous, tout est comme avant »).

### IN-03: Coquille dans l'e-mail J-7

**File:** `supabase/functions/household-delete/index.ts:480`

**Issue:** « **Sa** demande de suppression de compte sera exécutée… » — le mail s'adresse au destinataire (« Votre demande… »).

**Fix:** `'Votre demande de suppression de compte sera exécutée définitivement le ' + …`

### IN-04: `parseBody` — la branche compat 'foyer' matche aussi un corps avec `mode` absent mais `action` invalide

**File:** `supabase/functions/household-delete/index.ts:138-148`

**Issue:** Ordre de validation : un corps `{ action: 'inconnu', householdId: 'x' }` reçoit d'abord l'injection `mode:'foyer'` ? Non — la garde exige `'action' in raw` faux, donc il n'est pas injecté, mais `{ householdId: 42 }` (mauvais type) est injecté 'foyer' puis échoue en 400 générique : correct mais le message ne dit pas quel champ a échoué. Cosmétique, gardes de sécurité intactes (action cron bien refusée 403 pour un JWT utilisateur, vérifié lignes 574-579).

**Fix:** optionnel — propager les issues Zod dans le message 400 en dev.

---

_Reviewed: 2026-10-27T18:30:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
