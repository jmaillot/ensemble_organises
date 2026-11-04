# Phase 27: Suppression de compte RGPD - Research

**Researched:** 2026-10-27
**Domain:** Suppression de compte auto-hébergée (Supabase Auth + PostgreSQL/pg_cron + Edge Functions), réversibilité 30 j, anonymisation de surface publique
**Confidence:** HIGH (codebase) / HIGH (canal email — preuve in-repo) / MEDIUM (API GoTrue admin — citée, non exécutée)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01** : contenu porté par le compte supprimé dans les espaces partagés **conservé et déshumanisé** (D-04 phase 25 étendue aux comptes adultes). One-way — seule la restauration D-05 pendant 30 j revient en arrière.
- **D-02** : pseudonyme générique unique « Ancien membre » partout, sans avatar, homogène. Pas de période de présence affichée, pas de renommage par le foyer.
- **D-03** : la ligne `household_members` **reste en base** en statut « ancien membre » : sélecteurs l'excluent, audits et restauration gardent un point d'ancrage stable. Jamais de suppression de la ligne membre.
- **D-04** : **instantané en base de restauration** (ancien nom, avatar, liens user_id) dans des tables de restauration, purgeable J+30, accessible au pg_cron existant — aucune logique de purge hors SQL.
- **D-05** : à l'annulation, l'état est restauré depuis l'instantané et l'utilisateur **se reconnecte normalement** — le lien email ne crée jamais de session.
- **D-06** : **une seule demande active à la fois** ; nouvelle demande annule/remplace et rejoue l'horloge. Demande refusée ou annulée reposable immédiatement.
- **D-07** : les **médias du foyer restent** à la purge J+30 (objets sous `<household_id>/…`, 0010). Seules les références strictement personnelles (avatar du compte) sont supprimées. L'audit FK RGDP-05 vérifie référence par référence qu'aucun objet ne devient orphelin.
- **D-08** : profils enfants purgés avec le compte **si le compte était l'unique adulte du foyer** ; transférés aux adultes restants sinon.
- **D-09** : foyer orphelin (aucun adulte restant) supprimé avec ses médias, comme le fait déjà `household-delete` (0074 + Edge).
- **D-10** : **une seule Edge unifiée de suppression** avec deux modes déclarés : « foyer » (panneau admin existant bascule dessus, comportement visible inchangé) et « compte » (nouvelle chaîne). Un seul code de purge, deux intentions.

### the agent's Discretion
- **Tension SMTP** (entrée principale du chercheur — TRANCHÉE, voir § « Canal d'envoi d'emails ») : le canal disponible est déjà dans le dépôt.
- Schéma exact des tables de restauration et de demande (états, index, colonnes d'horloge).
- Détail de l'audit FK vers `auth.users` (règles par table) — posé ci-dessous, à consigner avant toute migration.
- Forme du manifest de médias construit à la demande.
- Libellés UI du panneau « Mes données (RGPD) » et des emails.

### Deferred Ideas (OUT OF SCOPE)
- Export RGPD (phase 26, livré) ; SMTP livrable/spam-proof (phase 28/31) ; sauvegardes/supervision (phase 28).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RGDP-01 | Demande de suppression — sessions tuées immédiatement, surface publique anonymisée | Edge unifiée mode « compte » : `signOut` global GoTrue (§ Code Examples), anonymisation via instantané D-04 puis déshumanisation D-01/D-02 |
| RGDP-02 | Annulable 30 j via email de confirmation | Table `account_deletion_requests` sur le motif `gdpr_export_jobs` (0158:95-119, index unique partiel = garde D-06) + email par `nodemailer` (§ Canal email) |
| RGDP-03 | Email d'alerte J-7 | Job cron quotidien → wrapper `private.post_*_http('reminder')` (motif 0158:389-439) → Edge unifiée/Edge email → SMTP |
| RGDP-04 | Purge J+30 purement SQL/pg_cron, manifest médias construit à la demande | `delete from auth.users` en SQL (précédent 0145:143) ; manifest = lignes de la table de restauration/manifest ; jamais de purge HTTP de données depuis cron |
| RGDP-05 | Audit FK vers `auth.users` avant toute migration | Inventaire complet vérifié ci-dessous (§ Audit FK) — 10 FK directes, dont 4 `on delete cascade NOT NULL` dangereuses |
| RGDP-06 | Profils enfants purgés/transférés | Règle D-08 ; réattribution sur le motif `link_managed_child` (0149) ; `delete_household` (0074) réutilisé pour D-09 |
| RGDP-07 | Edge `household-delete` consolidée | Edge unifiée : modes « foyer »/« compte », `withSupabase` `auth: ['user', 'publishable']` (motif household-delete:180), panneau `household-delete-panel.tsx` rebasculé sans changement visible |
</phase_requirements>

## Summary

Tous les motifs nécessaires existent déjà dans le dépôt : Edge à modes d'auth déclarés (`household-delete`), RPC SECURITY DEFINER transactionnel (0074, 0149), table d'état avec garde « un seul actif » et jobs pg_cron (0158), envoi SMTP depuis une Edge avec `nodemailer@10.0.15` épinglé (`gift-list-invite`), suppression `auth.users` en SQL (0145). La phase est une **composition** de motifs prouvés, pas une innovation. Le point que la discussion laissait ouvert — le canal d'envoi d'emails avant le MTA livrable de la phase 28 — est tranché : **`gift-list-invite` envoie déjà des emails transactionnels via `npm:nodemailer@10.0.15` avec les `SMTP_*` de la stack** (port 2500 `supabase-mail` en dev, relais de la stack en prod), motif béni par l'exemple officiel Supabase `send-email-smtp` [VERIFIED: supabase/functions/gift-list-invite/index.ts:128-156].

La principale zone de risque est l'**audit FK vers `auth.users`** (RGDP-05) : 10 FK directes existent, dont quatre `on delete cascade` sur colonnes `NOT NULL` (`household_invite_tokens.created_by`, `recipe_shares.created_by`, `trip_invites.created_by`, `gift_list_invites.created_by`, `recipes.created_by` 0122:140) qui **purgeraient des données partagées** si un `delete from auth.users` était exécuté tel quel. Chacune exige une règle explicite (set null / réattribution / hachage-anonymisation) posée dans une migration avant la purge J+30. Par ailleurs `household_members.user_id` est `on delete cascade` (0002:47) : tel quel, la purge supprimerait la ligne membre que D-03 exige de conserver — la FK doit devenir `on delete set null` (l'instantané D-04 porte l'ancien user_id).

**Primary recommendation:** Un RPC `SECURITY DEFINER` unique « demande de suppression » (instantané → déshumanisation → kill sessions) + une Edge unifiée à deux modes (foyer/compte) + deux jobs pg_cron (J-7 rappel via HTTP→Edge→SMTP ; J+30 purge purement SQL) + tables `account_deletion_requests` et `account_deletion_restorations` sur le motif 0158.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Demande / annulation de suppression | API/Backend (RPC + Edge) | Frontend (panneau RGPD) | Action destructive : opération serveur explicite, jamais d'écriture client directe (motif établi) |
| Kill des sessions immédiat | API/Backend (GoTrue admin) | Edge unifiée | GoTrue est l'autorité de session ; l'Edge orchestre avec le service key |
| Anonymisation + instantané | API/Backend (SQL SECURITY DEFINER) | — | Transactionnel, auditable, testable par test-db.sh |
| Emails confirmation / J-7 | API/Backend (Edge → SMTP) | pg_cron via pg_net | SMTP impossible depuis SQL ; le motif cron→HTTP→Edge est établi (0158) et RGDP-04 ne l'interdit que pour la **purge de données** |
| Purge J+30 | Database/Storage (SQL/pg_cron) | — | RGDP-04 verrouillé : `delete from auth.users` + manifest SQL, zéro HTTP de purge |
| Parcours UI demande | Browser/Client (React) | RPC | Panneau « Mes données (RGPD) » à côté de l'export (D-05 phase 26) |

## Canal d'envoi d'emails (tension SMTP — TRANCHÉE)

**Le canal existe déjà dans le dépôt.** `supabase/functions/gift-list-invite/index.ts` :
- `import nodemailer from 'npm:nodemailer@10.0.15'` — version épinglée, vérifiée au registre le 2026-10-06, « paquet béni par l'exemple officiel Supabase `send-email-smtp` » [VERIFIED: gift-list-invite/index.ts:128-132].
- Lit `SMTP_HOST` / `SMTP_PORT` / `SMTP_ADMIN_EMAIL` via `Deno.env` (l.650+) ; les `SMTP_*` sont injectés dans le service `functions` par le `.env` de la stack (section 8.4 AGENTS.md) [VERIFIED: gift-list-invite/index.ts:650-156].
- Fallback dev explicite : port 2500 = `supabase-mail` de la stack, seul régime où `SMTP_USER`/`SMTP_PASS` peuvent être absents [VERIFIED: gift-list-invite/index.ts:154-156].
- Règle « sobre part » : le champ From est `SMTP_ADMIN_EMAIL`, reply-to = email du contexte [VERIFIED: gift-list-invite/index.ts:39-43].

**Conséquence pour la phase :** confirmation de demande (HTTP, déclenchée par l'utilisateur) et alerte J-7 (cron → `private.post_*_http` wrapper → Edge → SMTP) suivent exactement les motifs existants. Rien à installer, aucune dépendance nouvelle. Les limitations anti-spam (réputation, SPF/DKIM) restent la phase 28/31 — cette phase « consomme le canal disponible », conformément au contexte. Pour les délais : le MTA auto-hébergé n'est exigé qu'à la porte OUV-31.

## Audit FK vers `auth.users` (RGDP-05 — inventaire vérifié)

Inventaire exhaustif des FK directes vers `auth.users` dans les migrations [VERIFIED: grep `references auth\.users` + lecture des fichiers cités] :

| Table.colonne | Migration:ligne | Clause actuelle | Risque au `delete from auth.users` | Règle à poser (proposition, à confirmer en plan) |
|---|---|---|---|---|
| `profiles.id` | 0002:15 | cascade | OK — purge du profil | Aucune (l'instantané D-04 a copié display_name/avatar) |
| `households.created_by` | 0002:33 | set null | OK | Aucune |
| `household_members.user_id` | 0002:47 | **cascade** | **Supprime la ligne membre — contredit D-03** | ALTER → `on delete set null` (instantané porte l'user_id) |
| `household_invite_tokens.created_by` | 0002:71 | **cascade NOT NULL** | Purge des tokens d'invitation du foyer (donnée partagée) | set null (colonne rendue nullable) ou anonymisation |
| `push_subscriptions.user_id` | 0018:65 | cascade | OK — abonnements morts | Aucune |
| `notification_reads.user_id` | 0046:22 | cascade | OK | Aucune |
| `gift_list_invites.created_by` | 0079:42 | **cascade NOT NULL** | Purge d'invitations partageables | idem invite tokens |
| `trip_invites.created_by` | 0118:109 | **cascade NOT NULL** | idem | idem |
| `recipes.created_by` | 0122:140 | **cascade NOT NULL** | **Supprime les recettes partagées du foyer — contredit D-01** | set null ou réattribution au foyer (colonne nullable) |
| `gdpr_export_jobs.user_id` | 0158:92 | cascade | OK — jobs du compte morts | Aucune |

**Tout le reste du schéma référence `household_members.id`, pas `auth.users`** — c'est le fichier d'ancrage de D-01/D-03 : le contenu partagé (posts, messages, tâches, dépenses…) est lié à la ligne membre conservée, donc survit naturellement à la purge du compte. Le travail RGDP-05 se concentre sur les 10 FK ci-dessus.

**Piège connexe (0150) :** les FK vers `household_members` sont presque toutes `on delete cascade` — un DELETE brut de la ligne membre purgerait tout l'historique. La suppression d'un membre adulte ne passe JAMAIS par un DELETE direct : fonction SECURITY DEFINER transactionnelle qui réattribue d'abord (motif 0149) [VERIFIED: 0150_household_members_delete_durci.sql:1-25].

## Standard Stack

### Core
Aucun paquet nouveau. Tout le socle existe :

| Composant | Version | Purpose | Preuve in-repo |
|---------|---------|---------|----------------|
| `npm:nodemailer` | 10.0.15 | Envoi SMTP depuis Edge | gift-list-invite:132 |
| `npm:zod` | 4.6.5 | Validation corps Edge | household-delete:29 |
| `@supabase/server` (withSupabase) | stack | Modes d'auth Edge déclarés | household-delete:27,180 |
| pg_cron + pg_net | stack | Jobs cron, wrappers HTTP | 0011, 0129, 0158:409-439 |
| Vault | stack | Secrets hors `cron.job.command` | motif 0162 |

**Package Legitimacy Audit** : aucun paquet installé par cette phase — `nodemailer@10.0.15` et `zod@4.6.5` sont déjà épinglés et consommés en prod. Audit préexistant (06-RESEARCH.md cité par gift-list-invite). Rien à vérifier de neuf.

## Architecture Patterns

### System Architecture Diagram

```
Utilisateur (panneau RGPD)
   │ POST demande
   ▼
Edge unifiée (mode 'compte', withSupabase auth:['user','publishable'])
   │ 1. RPC public.request_account_deletion(user, JWT)
   │      ├─ instantané (nom, avatar, user_id) → tables de restauration  (D-04)
   │      ├─ déshumanisation : display_name='Ancien membre', avatar=NULL,
   │      │   statut 'ancien membre' sur la ligne membre               (D-01/D-02/D-03)
   │      ├─ insert account_deletion_requests (garde D-06 : index unique partiel)
   │      └─ kills sessions : signOut JWT scope global                  (RGDP-01)
   │ 2. email de confirmation (nodemailer, SMTP_*)  ── lien → page d'annulation
   │      (le lien ne crée JAMAIS de session — D-05)
   ▼
pg_cron quotidien (fuseau Europe/Paris, motif 0158)
   ├─ J-7 : wrapper private.post_*_http('reminder') → Edge → email d'alerte   (RGDP-03)
   └─ J+30 : PURGE 100% SQL (RGDP-04) — aucune HTTP :
          ├─ restore/enfants : D-08 (transfert motif 0149) ou purge
          ├─ foyer orphelin : delete_household (0074) + manifest médias    (D-09/D-07)
          └─ delete from auth.users (précédent 0145:143) → cascades FK auditées (RGDP-05)
```

### Machine à états de la demande (motif 0158)

| État | Signification | Sortie |
|---|---|---|
| `demandee` | Instantané posé, compte déshumanisé, sessions tuées | → `confirmee` (email cliqué ? — voir OQ-2) ou `annulee` |
| `annulee` | Restauration jouée depuis l'instantané (D-05) | terminal, reposable immédiatement (D-06) |
| `rappellee` | Email J-7 envoyé (flag, motif `notified_push` 0158) | → purge à J+30 |
| `purgee` | `delete from auth.users` exécuté | terminal |

Garde D-06 : `create unique index … on account_deletion_requests (user_id) where status in ('demandee')` — copie exacte de `gdpr_export_jobs_one_active` (0158:110-112). Une nouvelle demande annule/remplace l'ancienne et rejoue l'horloge.

### Anti-Patterns to Avoid
- **Purge HTTP depuis cron** : RGDP-04 l'interdit pour les données (frontière non couverte par test-db.sh). Seuls les emails (pas de données) passent par HTTP depuis cron, sur le motif 0158 éprouvé.
- **DELETE brut de la ligne membre** : cascades historiques (0150). Toujours SECURITY DEFINER + réattribution.
- **Réécriture d'une migration appliquée** : corrections vers l'avant (AGENTS §2.7 A). Les ALTER FK (0002) sont posés en nouvelles migrations.
- **Secret dans `cron.job.command`** : wrappers sans paramètre `private.*()` (motif 26-02, 0158:389-406).
- **`search_path = ''` avec noms non qualifiés** : `public.tasks` partout, contrôle statique 1 et 4 les attrapent.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Envoi email | Client SMTP maison, ou attendre le MTA phase 28 | `nodemailer@10.0.15` + `SMTP_*` (motif gift-list-invite) | Preuve en prod, bénit par l'exemple officiel Supabase |
| Kill sessions | Purge manuelle de refresh tokens en SQL | GoTrue admin `signOut` scope global | GoTrue est l'autorité ; SQL ne connaît pas la session courante |
| Purge de foyer orphelin | Nouvelle logique D-09 | `delete_household` (0074) réutilisée par l'Edge unifiée | Dépenses d'abord, cascades ensuite, déjà prouvé |
| Transfert d'enfants | Nouvelle réattribution ad hoc | Motif `link_managed_child` (0149) | Réattribution transactionnelle déjà prouvée |
| Garde « un seul actif » | Vérif applicative | Index unique partiel (0158:110-112) | Course concurrente : seule la base garantit |
| Parcours paginé Storage | list() naïf | `listHouseholdObjects` (household-delete:117-139) | Pagination + distinction dossier/fichier prouvée |

## Common Pitfalls

### Pitfall 1: Cascades `NOT NULL` sur `created_by` de tokens/recettes
**What goes wrong:** le `delete from auth.users` de J+30 supprime `household_invite_tokens`, `recipe_shares`, `trip_invites`, `gift_list_invites`, `recipes` du foyer.
**Why it happens:** FK `on delete cascade NOT NULL` posées en 0002/0079/0118/0122.
**How to avoid:** migrations ALTER vers l'avant AVANT que la purge soit armée ; règle par table consignée (table audit ci-dessus).
**Warning signs:** test SQL de purge où des lignes du foyer disparaissent avec le compte.

### Pitfall 2: La ligne membre disparaît à la purge (D-03 violée)
**What goes wrong:** `household_members.user_id` est cascade (0002:47) → la purge supprime la ligne « Ancien membre » et, par les cascades 0150, tout son historique attribué.
**How to avoid:** ALTER de la FK en `on delete set null` dans la même vague de migrations ; l'instantané D-04 a déjà copié l'user_id pour la restauration.

### Pitfall 3: Le lien email crée une session (D-05 violée)
**What goes wrong:** réutiliser un email GoTrue natif (recovery/magic link) recrée une session — contredit D-05.
**How to avoid:** emails envoyés par l'Edge via nodemailer, lien vers une page d'app pure qui appelle l'Edge d'annulation ; jamais de route `/auth/v1/*` dans le lien.

### Pitfall 4: Le J-7 part deux fois ou jamais
**What goes wrong:** cron quotidien relancé → double email ; ou cron raté → pas d'alerte.
**How to avoid:** flag `rappel_envoye` posé DANS la transaction SQL avant l'appel HTTP (motif `notified_push`, 0158) ; le cron-minute/quotidien redrive (le redrive EST le retry, AGENTS §2.7).
**Warning signs:** observation 26-07 — un dispatch répondu `dispatched:true` sans requête servie ; la philosophie cron-retry couvre ce cas.

### Pitfall 5: Assertions de purge non bornées
**What goes wrong:** compter sur toute la table échoue sur base peuplée (§2.7 D).
**How to avoid:** assertions bornées par foyer ; la RLS en `authenticated` borne déjà, en `postgres` borner à la main.

### Pitfall 6: Contrôles statiques SQL
`check-sql-statique.py` doit passer (vert) + ses propres tests (`test-check-sql-statique.py`) ; noms qualifiés `public.*`/`private.*` sous `search_path = ''` ; dollar-quotes nommés fermés. `test-db.sh` obligatoire pour tout changement SQL (Docker). Chaîne complète §2.7 : typecheck → vitest → build → e2e → SQL statique → test-db.

## Code Examples

### Kill global des sessions (RGDP-01)
```typescript
// Source: docs supabase (guides/auth/signout.mdx) — GoTrueAdminApi.signOut(jwt, scope)
// 'global' révoque les refresh tokens de TOUTES les sessions de l'utilisateur.
// L'Edge reçoit le JWT de l'appelant (header Authorization) — il signe lui-même.
const { error } = await admin.auth.signOut(userJwt, { scope: 'global' }); // [CITED: supabase.com/docs/guides/auth/signout]
```
Alternative directe : `POST /auth/v1/admin/logout?scope=global` avec service key + JWT utilisateur. Détail de plumbing (récupération du JWT brut dans `withSupabase`) à trancher au plan — vérifier ce que `ctx` expose (OQ-1). [ASSUMED]

### Garde D-06 (motif 0158)
```sql
-- Source: supabase/migrations/0158_gdpr_export.sql:95-112
create unique index account_deletion_requests_one_active
  on public.account_deletion_requests (user_id)
 where status in ('demandee');
```

### Suppression auth.users en SQL (précédent purge J+30)
```sql
-- Source: supabase/migrations/0145_convert_managed_children.sql:143
delete from auth.users where id = any(v_converted);
-- Le propriétaire (ici service_role via pg_cron) peut delete from auth.users (sonde A1).
```

### Job pg_cron sans secret (motif 0158:415)
```sql
-- Source: supabase/migrations/0158_gdpr_export.sql:415
-- array['eo-gdpr-export-purge', '27 4 * * *', 'select private.post_gdpr_export_http(''purge'')']
-- Le wrapper lit la clé dans Vault ; les jobs n'appellent QUE private.*() sans paramètre.
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `withSupabase` expose le JWT utilisateur brut (ou le header Authorization) pour appeler `signOut(jwt, 'global')` depuis l'Edge | Code Examples / RGDP-01 | Fall-back : appel direct `POST /auth/v1/admin/logout?scope=global` — impact faible, à vérifier au plan |
| A2 | `private.post_*_http` nouveau wrapper pour le J-7 suit strictement le motif 0158 (clé Vault, garde « seulement si dû ») | Architecture | Faible — motif copié |
| A3 | Le SMTP configuré de la stack délivre correctement les emails de confirmation (livrabilité non mesurée avant phase 28/31) | Canal email | Emails peuvent tomber en spam — acceptable : le canal est déclaré « disponible, pas spam-proof » par le contexte |
| A4 | Statut « ancien membre » sur `household_members` : nouvelle valeur de statut ou colonne dédiée — la table actuelle porte `role` (admin/membre/enfant) et `deleted_at` (0144) ; « ancien membre » nécessite une colonne/état distinct de `deleted_at` | D-02/D-03 | Choix de schéma à trancher au plan (discrétion du chercheur assumée) |
| A5 | `households.created_by` set null ne casse aucun rendu frontend (jamais affiché comme identité) | Audit FK | Faible — vérifier par grep au plan |

## Open Questions

1. **Plumbing du kill de sessions dans `withSupabase`**
   - What we know: `ctx.userClaims?.id` et `ctx.authMode` existent (household-delete:190-191) ; GoTrue admin `signOut` exige un JWT.
   - What's unclear: `ctx` expose-t-il le token brut ?
   - Recommendation: sonde au plan (T-1) ; fallback endpoint admin HTTP documenté.

2. **Faut-il cliquer un lien de confirmation pour que la demande devienne effective ?**
   - What we know: RGDP-02 dit « annulable via confirmation email » ; D-05 « confirmation par email » ; le contexte décrit « réversibilité 30 j par email de confirmation ». Lecture la plus cohérente : la demande est effective immédiatement (sessions tuées, RGDP-01 dit « immédiatement »), l'email CONFIRME et porte le lien d'annulation. Alternative (demande inactive jusqu'au clic) contredirait « sessions tuées immédiatement ».
   - Recommendation: état `demandee` actif dès la demande ; email = confirmation + lien d'annulation. À faire valider par l'utilisateur au plan (checkpoint léger).

3. **Statut « ancien membre » : colonne vs valeur**
   - Recommendation: discrétion chercheur (A4) — trancher au plan en lisant la définition effective de `household_members` (0002 + 0144 + 0150).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | test-db.sh | à vérifier machine (phase 26 l'a exécutée : ✓, 94 tests) | — | Chaîne sans SQL impossible à valider — test-db obligatoire |
| SMTP de la stack | Emails confirmation/J-7 | ✓ (motif gift-list-invite en prod depuis phase 06) | SMTP_* | Dev : supabase-mail:2500 |
| pg_cron + pg_net | Jobs J-7/J+30 | ✓ (0011, 0129, 0158) | — | — |
| Vault | Clé des wrappers cron | ✓ (0162) | — | — |

**Missing dependencies with no fallback:** aucune.
**Missing dependencies with fallback:** aucun — le MTA livrable (phase 28) n'est PAS requis par cette phase.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5 (unitaires, 1636 tests/202 fichiers) + test-db.sh (94 tests SQL) + Playwright e2e (155) |
| Config file | `app/vitest.config.*`, `supabase/tests/` |
| Quick run command | `cd app && npm run typecheck && npm test` |
| Full suite command | `cd app && npm run build && npm run test:e2e && python3 scripts/check-sql-statique.py && python3 scripts/test-check-sql-statique.py && sh scripts/test-db.sh` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RGDP-01 | Kill sessions + déshumanisation transactionnelle | SQL (test-db) | `sh scripts/test-db.sh` (fichier nouveau) | ❌ Wave 0 |
| RGDP-02 | Garde D-06 (index unique partiel), annulation → restauration D-05 | SQL négatifs | `sh scripts/test-db.sh` | ❌ Wave 0 |
| RGDP-05 | Cascades FK auditées : purge J+30 ne supprime AUCUNE donnée partagée | SQL (purge sur foyer de test) | `sh scripts/test-db.sh` | ❌ Wave 0 |
| RGDP-06 | Enfants transférés (autres adultes) / purgés (foyer orphelin D-09) | SQL | `sh scripts/test-db.sh` | ❌ Wave 0 |
| RGDP-07 | Edge unifiée : mode foyer inchangé (e2e existant passe), mode compte | e2e + unit | `npm run test:e2e` | partiel (e2e foyer existant) |
| RGDP-03 | Flag J-7 posé avant HTTP, redrive idempotent | SQL | `sh scripts/test-db.sh` | ❌ Wave 0 |
| RGDP-04 | Purge 100% SQL : `delete from auth.users` sur fixture | SQL | `sh scripts/test-db.sh` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** typecheck + vitest + check-sql-statique
- **Per wave merge:** suite complète §2.7 (test-db.sh inclus — Docker)
- **Phase gate:** suite verte + e2e 155+ verts (baseline autoritaire, à maintenir)

### Wave 0 Gaps
- [ ] `supabase/tests/` nouveau fichier : purge + garde D-06 + restauration + audit FK (cas négatifs : autre foyer, escalation, tautologies interdites §2.7 D)
- [ ] Aucun framework à installer

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | GoTrue ; kill sessions via admin API ; suppression `auth.users` = service_role/cron uniquement (0145) |
| V3 Session Management | yes | `signOut` scope global ; lien email ne crée jamais de session (D-05) |
| V4 Access Control | yes | RLS frontière finale ; RPC SECURITY DEFINER avec revérification en base ; policies durcies 0150 |
| V5 Input Validation | yes | zod sur corps Edge (motif household-delete) ; CHECK SQL |
| V6 Cryptography | yes | secrets Vault/`Deno.env`, jamais dans `cron.job.command` (§2.7 H) |

### Known Threat Patterns for Supabase self-hosted

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Purge par un tiers (Suppression d'un compte d'autrui) | Spoofing/Elevation | RPC revérifie l'identité en base ; Edge exige `authMode === 'user'` (motif household-delete:191) |
| Réactivation d'un compte purgé via anciens tokens d'invitation | Tampering | tokens `created_by` réglés par l'audit FK ; rotation impossible post-purge (compte inexistant) |
| Email de confirmation usurpé (phishing annulation) | Spoofing | From fixe `SMTP_ADMIN_EMAIL`, libellés sobres, lien vers l'app authentifiée — anti-spam complet reste phase 28/31 |
| Données résiduelles orphelines dans Storage | Information Disclosure | manifest médias vérifié avant purge (D-07), audit FK par référence |

## Sources

### Primary (HIGH confidence)
- `supabase/functions/household-delete/index.ts` (intégralité lue) — Edge à consolider
- `supabase/migrations/0002/0074/0145/0150/0158` (extraits lus, lignes citées) — FK audit, RPC purge, garde D-06, jobs cron
- `supabase/functions/gift-list-invite/index.ts:38-156,650+` — canal SMTP/nodemailer
- `.planning/phases/27-*/27-CONTEXT.md`, `REQUIREMENTS.md`, `STATE.md`

### Secondary (MEDIUM confidence)
- Context7 `/supabase/supabase` — `GoTrueAdminApi.signOut` scopes (global/local/others) [CITED: supabase.com/docs/guides/auth/signout]

### Tertiary (LOW confidence)
- A1-A5 (log des hypothèses)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — tous motifs déjà en prod dans ce dépôt
- Architecture: HIGH — composition de motifs 0149/0158/0074/household-delete
- Audit FK: HIGH (inventaire) / MEDIUM (règles par table — propositions à valider au plan)
- Canal email: HIGH (preuve in-repo) ; livrabilité: hors périmètre (phase 28/31)
- Pitfalls: HIGH — appuyés sur AGENTS §2.7 et l'historique 0145/0150

**Research date:** 2026-10-27
**Valid until:** ~2026-11-26 (stable — motifs internes au dépôt)
