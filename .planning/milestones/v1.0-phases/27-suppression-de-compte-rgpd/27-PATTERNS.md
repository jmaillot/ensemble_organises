# Phase 27: Suppression de compte RGPD - Pattern Map

**Mapped:** 2026-10-27
**Files analyzed:** 9 (fichiers nouveaux/modifiés déduits de 27-CONTEXT.md D-01…D-10 et 27-RESEARCH.md)
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/0XXX_account_deletion.sql` (tables `account_deletion_requests` + `account_deletion_restorations`) | migration / model | CRUD | `supabase/migrations/0158_gdpr_export.sql` (§2, l.90-119) | exact |
| `supabase/migrations/0XXX_account_deletion_rpc.sql` (RPC `request_account_deletion` / `cancel_account_deletion` / purge J+30) | migration / service | CRUD (transactionnel) | `supabase/migrations/0074_household_delete.sql` + `0158_gdpr_export.sql` | exact |
| `supabase/migrations/0XXX_account_deletion_fk_audit.sql` (ALTER FK vers `auth.users`) | migration | transform | `supabase/migrations/0002_tables_identity.sql` (FK cibles l.15-92) | role-match (ALTER, pas CREATE) |
| `supabase/migrations/0XXX_account_deletion_cron.sql` (jobs J-7 / J+30 + wrapper `private.post_account_deletion_http`) | migration / config | event-driven | `supabase/migrations/0158_gdpr_export.sql` (§6-7, l.340-440) | exact |
| `supabase/functions/household-delete/index.ts` (modifiée → Edge unifiée 2 modes) | controller / edge | request-response | elle-même (base à étendre) + `gift-list-invite` (partie SMTP) | exact |
| `supabase/functions/account-deletion-notify/index.ts` (ou action de l'Edge unifiée — emails confirmation/J-7) | controller / edge | event-driven | `supabase/functions/gift-list-invite/index.ts` (l.128-156, 650-680) | role-match |
| `app/src/modules/parametres/components/gdpr-delete-panel.tsx` (nouveau panneau « Mes données ») | component | request-response | `app/src/modules/parametres/components/gdpr-export-panel.tsx` | exact |
| `app/src/modules/parametres/api.ts` (modifié : `requestAccountDeletion`, `cancelAccountDeletion`) | service (client RPC) | request-response | `api.ts` `requestGdprExport` (l.428-436) | exact |
| `supabase/tests/0XXX_account_deletion.test.sql` (test SQL Wave 0) | test | batch | `supabase/tests/0165_gdpr_export_batch_start.sql` + `_setup.sql`/`_teardown.sql` | role-match |

## Pattern Assignments

### Tables `account_deletion_requests` / `account_deletion_restorations` (migration, CRUD)

**Analog:** `supabase/migrations/0158_gdpr_export.sql` (table `gdpr_export_jobs`, l.90-119)

**Table d'état + horloge + états CHECK** (0158:90-112) :
```sql
create table public.gdpr_export_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'en_attente'
    check (status in ('en_attente','en_cours','pret','echec')),
  ...
  notified_push boolean not null default false,   -- motif du flag J-7 « rappel_envoye »
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);

-- D-06 : garde « un seul actif » EN BASE (index unique partiel), jamais applicative
create unique index gdpr_export_jobs_one_active
  on public.gdpr_export_jobs (user_id)
 where status in ('en_attente','en_cours');
```

À copier pour `account_deletion_requests` : états `demandee/annulee/rappellee/purgee` (machine à états 27-RESEARCH), colonne d'horloge `purge_due_at timestamptz` (remplace `expires_at`), flag `rappel_envoye boolean not null default false` (motif `notified_push`), même garde D-06 `where status in ('demandee')`. RLS : `select` limité à ses propres lignes, **aucune écriture client** (0158:118-123). La table de restauration D-04 suit la même forme sans machine à états (lignes instanciées, purgeables J+30).

### RPC SECURITY DEFINER (service, CRUD transactionnel)

**Analog:** `supabase/migrations/0074_household_delete.sql` (l.22-58)

**Forme canonique RPC destructif** (0074:22-58) :
```sql
create or replace function public.delete_household(p_actor_id uuid, p_household_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''          -- ⇒ TOUT nom qualifié : public.expenses, private.*
as $$
declare ... begin
  if p_actor_id is null then raise exception 'session requise' using errcode = '28000'; end if;
  ...
  perform private.assert_household_admin(p_household_id, p_actor_id);  -- revérification EN BASE
  -- opérations dans l'ordre qui limite les dégâts, get diagnostics pour le contrat
  return jsonb_build_object('household_id', p_household_id, 'expenses', v_expenses);
end;
$$;

revoke all on function public.delete_household(uuid, text) from public, anon, authenticated;
grant execute on function public.delete_household(uuid, text) to service_role;
-- + bloc do $$ has_function_privilege ... raise exception $$ : preuve des privilèges
```

Ordre interne du RPC `request_account_deletion` (une seule transaction, D-04 puis D-01/D-03) : 1) INSERT instantané dans la table de restauration (ancien display_name, avatar, user_id), 2) déshumanisation (`display_name = 'Ancien membre'`, `avatar_url = null`, statut « ancien membre »), 3) INSERT `account_deletion_requests`, 4) les sessions sont tuées côté Edge après le RPC. Réattribution enfants : motif `link_managed_child` (0149_child_message_reassign.sql — réattribution transactionnelle SECURITY DEFINER). Purge J+30 : `delete from auth.users where id = any(...)` (précédent 0145:143), exécutée en SQL pur par le job cron — **jamais via HTTP** (RGDP-04).

### ALTER FK vers `auth.users` (migration, transform)

**Analog:** `supabase/migrations/0002_tables_identity.sql` (FK inventoriées l.15-92)

Points à modifier (inventaire vérifié 27-RESEARCH § Audit FK) : `household_members.user_id` cascade → **set null** (l.47, sinon D-03 violée) ; `household_invite_tokens.created_by` (l.71), `gift_list_invites.created_by` (0079:42), `trip_invites.created_by` (0118:109), `recipes.created_by` (0122:140) — cascades `NOT NULL` à convertir (colonne rendue nullable ou réattribution). Migration **nouvelle** jamais de réécriture (AGENTS §2.7 A).

### Jobs pg_cron + wrapper HTTP sans secret (migration/config, event-driven)

**Analog:** `supabase/migrations/0158_gdpr_export.sql` (§6-7, l.380-440)

**Wrapper `private.post_*_http`** (0158:340-405, forme) :
```sql
perform net.http_post(
  url := rtrim(v_url, '/') || '/functions/v1/...' ,
  headers := jsonb_build_object('content-type','application/json','authorization','Bearer ' || v_key), -- clé lue dans Vault
  body := jsonb_build_object('action', p_action),
  timeout_milliseconds := 30000
);
-- Le wrapper ne POSTe que si quelque chose est dû (« seulement si dû », forme 0019)
```

**Enregistrement des jobs** (0158:409-430) :
```sql
declare
  v_jobs text[][] := array[
    array['eo-gdpr-export-run', '* * * * *', 'select private.post_gdpr_export_http(''run'')'],
    array['eo-gdpr-export-purge', '27 4 * * *', 'select private.post_gdpr_export_http(''purge'')']
  ];
  ...
  if exists (select 1 from cron.job where jobname = v_job[1]) then perform cron.unschedule(v_job[1]); end if;
  perform cron.schedule_in_database(v_job[1], v_job[2], v_job[3], current_database());
```

**Différence clé pour cette phase** : le job J-7 appelle `private.post_account_deletion_http('reminder')` (HTTP → Edge → SMTP, pas de données) ; le job J+30 est **purge purement SQL** — la fonction cron appelée fait `delete from auth.users` + réattributions directes, AUCUN HTTP (RGDP-04). Flag `rappel_envoye` posé DANS la transaction SQL avant l'appel HTTP (redrive idempotent, pitfall 4). Aucun secret dans `cron.job.command`.

### Edge unifiée `household-delete` (controller, request-response)

**Analog:** `supabase/functions/household-delete/index.ts` (intégralité, 205 lignes) — c'est le fichier à transformer.

**Structure à conserver telle quelle** :
- En-tête documenté + `withSupabase({ auth: ['user', 'publishable'] }, async (request, ctx) => ...)` (l.180) avec garde `ctx.authMode !== 'user' || !userId → 401` (l.190-193) ;
- Schéma zod du corps (`z.object({...}).trim().min(1).max(128)`, l.67-83) ;
- `class HouseholdDeleteError extends Error { readonly status }` + `translateRpcError` (traduction des messages posés en base, l.55-110) ;
- `json()` helper avec CORS_HEADERS (l.31-52) ;
- Parcours paginé Storage `listHouseholdObjects` (PAGE_SIZE 100, distinction dossier/fichier par sous-listage, l.117-139) — réutilisé pour le manifest médias D-07 ;
- Contrat de réponse honnête `storage_cleanup: 'ok' | 'partial'` (l.171-176).

**Transformation D-10** : introduire un discriminant de mode dans le corps (`{ mode: 'foyer', householdId } | { mode: 'compte' }` via `z.discriminatedUnion`) ; le mode « foyer » rejoue exactement le parcours actuel (assertAdmin → `rpc delete_household` → purge Storage) ; le mode « compte » : `rpc request_account_deletion` puis kill sessions GoTrue (`admin.auth.signOut(userJwt, { scope: 'global' })` — vérifier au plan ce que `ctx` expose, OQ-1/RESEARCH A1) puis envoi email de confirmation. Le panneau `household-delete-panel.tsx` bascule dessus sans changement visible.

### Edge envoi d'email (controller, event-driven)

**Analog:** `supabase/functions/gift-list-invite/index.ts` (l.128-156, 650-680)

**Imports** (l.128-132) :
```typescript
import { z } from 'npm:zod@4.6.5';
// Version exacte épinglée — jamais de plage flottante (AGENTS.md §2.1).
import nodemailer from 'npm:nodemailer@10.0.15';
```

**Lecture SMTP à échec fermé** (l.650-680) :
```typescript
const smtpHost = Deno.env.get('SMTP_HOST');
const smtpPortRaw = Deno.env.get('SMTP_PORT');
const smtpAdminEmail = Deno.env.get('SMTP_ADMIN_EMAIL');
if (!smtpHost || !smtpPortRaw || !smtpAdminEmail) {
  throw new GiftListInviteError(500, 'Envoi d’e-mail indisponible : relais SMTP non configuré.');
}
...
// Régime sans authentification : UNIQUEMENT le relais de développement (Inbucket :2500).
if ((!smtpUser || !smtpPass) && smtpPort !== DEV_SMTP_PORT) { throw ... }
const smtpSenderName = Deno.env.get('SMTP_SENDER_NAME') || undefined;
```

À copier : `from` fixe = `SMTP_ADMIN_EMAIL` (règle « sobre part », 0079), reply-to = email de contexte, échec fermé AVANT toute tentative. **Piège D-05** : le lien d'annulation pointe vers une page de l'app (route React), jamais vers `/auth/v1/*` — aucun email GoTrue natif, sinon le lien recréerait une session.

### Panneau RGPD frontend (component, request-response)

**Analog:** `app/src/modules/parametres/components/gdpr-export-panel.tsx` (230 lignes)

**Imports + forme** (l.1-7, 73-118) :
```typescript
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/shared/module-shell';
import { useToast } from '@/components/ui/toast';
import { fetchGdprExports, requestGdprExport, ... } from '../api';
```

Patterns à reproduire :
- **Mutation + invalidation + toast** (l.93-108) : `onSuccess` → `invalidateQueries` + toast ; `onError` → **inline ET toast** (D-02 : jamais d'échec silencieux) ;
- **Confirmation d'action destructive** : la demande de suppression de compte exige une modale de confirmation (guideline §6 AGENTS) — s'inspirer de `household-delete-panel.tsx` (garde + confirmation) plutôt que du bouton direct de l'export ;
- **Machine à états affichée** : demande active (« Suppression programmée le … » avec horloge locale type `useElapsedClock`, l.44-53) vs annulation possible ; `aria-live="polite"` (l.132) ;
- Pas de garde admin (droit personnel, comme l'export D-08 phase 26, docstring l.9-17).

### api.ts (service client RPC)

**Analog:** `app/src/modules/parametres/api.ts` `requestGdprExport` (l.428-436) :
```typescript
export async function requestGdprExport(): Promise<void> {
  const { error } = await supabase.rpc('request_gdpr_export');
  ...
}
```
Ajouter `requestAccountDeletion()` / `cancelAccountDeletion()` / `fetchAccountDeletionRequests()` sur le même gabarit : RPC purs, erreurs renvoyées comme `Error` au panneau, aucun écrit direct de table (motif « opération serveur explicite »).

### Tests SQL (test, batch)

**Analog:** `supabase/tests/0165_gdpr_export_batch_start.sql` + `_setup.sql` / `_teardown.sql`

Règles héritées (AGENTS §2.7 D) : assertions **bornées par foyer** ; en `authenticated` la RLS borne déjà, en `postgres` borner à la main ; cas négatifs explicites (autre foyer, double demande refusée par l'index D-06, escalade de privilèges, purge J+30 ne supprime AUCUNE donnée partagée) ; `testkit.eq` mêmes types ; aucun test tautologique.

## Shared Patterns

### Opération destructive = RPC SECURITY DEFINER + revérification en base
**Source:** `0074_household_delete.sql:22-58`, `household-delete/index.ts:86-110`
**Apply to:** RPC de demande/annulation, Edge unifiée. Jamais d'écriture client directe ; l'acteur est un paramètre vérifié en base, jamais `auth.uid()` sans contrôle.

### Contrat de réponse honnête sur l'échec partiel
**Source:** `household-delete/index.ts:171-176` (`storage_cleanup: 'partial'`)
**Apply to:** purge J+30 et manifest médias — un échec partiel Storage est signalé, jamais masqué.

### Garde de concurrence en base (index unique partiel)
**Source:** `0158_gdpr_export.sql:110-112`
**Apply to:** table `account_deletion_requests` (D-06).

### Flag posé en SQL avant l'effet de bord HTTP (idempotence cron)
**Source:** `0158_gdpr_export.sql` (colonne `notified_push`, wrapper « seulement si dû »)
**Apply to:** job J-7 (`rappel_envoye`).

### Secrets hors portée client / cron
**Source:** `gift-list-invite/index.ts:650-680` (`Deno.env`), `0158_gdpr_export.sql:415` (Vault)
**Apply to:** SMTP_* dans l'Edge, clé functions dans Vault, jamais dans `cron.job.command` ni `.env.app`.

### Noms qualifiés sous `search_path = ''`
**Source:** `0074_household_delete.sql:27,44,47` (`public.expenses`, `public.households`)
**Apply to:** tous les nouveaux RPC/SQL — contrôle statique 1 et 4 les vérifient.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| Kill global des sessions GoTrue (`signOut(jwt, {scope:'global'})`) | edge integration | request-response | Aucun appel admin GoTrue existant dans le dépôt — plumbing du JWT brut dans `withSupabase` à sonder au plan (OQ-1, fallback `POST /auth/v1/admin/logout?scope=global` documenté dans 27-RESEARCH Code Examples) |

## Metadata

**Analog search scope:** `supabase/migrations/`, `supabase/functions/`, `supabase/tests/`, `app/src/modules/parametres/`
**Files scanned:** ~15 (analogs lus en intégralité : household-delete/index.ts 205 l., gdpr-export-panel.tsx 230 l., 0074 71 l. ; extraits ciblés : 0158, gift-list-invite, 0002)
**Pattern extraction date:** 2026-10-27
