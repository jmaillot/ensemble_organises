# Phase 26: Export RGPD - Pattern Map

**Mapped:** 2026-10-26
**Files analyzed:** 8 (5 créations, 3 modifications)
**Analogs found:** 8 / 8

Tous les chemins d'analogues ci-dessous ont été vérifiés suivis dans git
(`git ls-files`, non vide) — aucun chemin miroir `supabase-project/volumes/…`
n'est référencé : les Edge Functions analogues sont lues à leur origine
versionnée `supabase/functions/<nom>/index.ts`, jamais au runtime épinglé.

## File Classification

| Nouveau/Fichier modifié | Rôle | Flux de données | Analogue le plus proche | Qualité |
|-------------------------|------|-----------------|-------------------------|---------|
| `supabase/migrations/0158_gdpr_export.sql` (nouveau) | migration | DDL + job asynchrone | `supabase/migrations/0011_cron.sql` (jobs), `0010_storage_and_realtime.sql` (bucket), `0019_push_dispatch.sql` (Vault+pg_net), `0129` (cron minute), `0146` (RPC acteur), `0147` (scope push) | exact (assemblage de 5 motifs) |
| `supabase/functions/gdpr-export-run/index.ts` (nouveau) | service (Edge) | event-driven (POST cron) → batch | `supabase/functions/household-delete/index.ts` | exact (structure, pagination Storage, contrat honnête) |
| `supabase/functions/gdpr-export-purge/index.ts` (nouveau) | service (Edge) | event-driven (POST cron) → batch | `supabase/functions/push-notify/index.ts` (mode 'secret') + `household-delete/index.ts` (list/remove paginé) | exact |
| `supabase/tests/0158_gdpr_export.sql` (nouveau) | test SQL négatif | batch (testkit) | `supabase/tests/0157_voyages_d06.sql` + `_setup.sql` | exact |
| `app/src/modules/parametres/components/gdpr-export-panel.tsx` (nouveau) | component | request-response + polling | `app/src/modules/parametres/components/household-delete-panel.tsx` | exact (jumeau structurel, D-05) |
| `app/src/modules/parametres/components/gdpr-export-panel.test.tsx` (nouveau) | test (Vitest) | — | `app/src/modules/parametres/components/household-delete-panel.test.tsx` | exact |
| `app/src/modules/parametres/api.ts` (modification) | service (client) | request-response | lui-même : `deleteHousehold` (functions.invoke) + RPC `set_member_role` | exact |
| `app/src/modules/parametres/types.ts` + `parametres-page.tsx` (modification) | types / route | — | `householdColors`/`roleLabels` (types), montage de `HouseholdDeletePanel` (page) | role-match |

---

## Pattern Assignments

### `supabase/migrations/0158_gdpr_export.sql` (migration, job asynchrone)

La migration assemble cinq motifs existants, dans cet ordre : bucket+politiques
(0010), table de jobs + RPC acteur (0146), scope push (0147, recopie-modification),
fonction d'envoi Vault+pg_net (0019), installation cron (0011/0129).

**Pattern bucket + politiques (Analog: `supabase/migrations/0010_storage_and_realtime.sql` lignes 13-22 et 27-58)** — le bucket `gdpr-exports` suit le même `insert … on conflict` ; la politique de lecture est SCELLÉE sur le préfixe `<user_id>/` (pas `<household_id>/`, ici la borne est le demandeur D-08, pas le foyer) :

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('household-media', 'household-media', false, 26214400,
   array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'video/mp4', 'video/quicktime'])
  -- gdpr-exports : public=false, file_size_limit à poser (A7, 1-2 Go), mime zip/json
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

drop policy if exists household_media_read on storage.objects;
create policy household_media_read on storage.objects
  for select using (
    bucket_id in ('household-media', 'household-avatars')
    and private.is_household_member((storage.foldername(name))[1])
  );
-- Pour gdpr-exports : select seulement, prédicat
-- `(storage.foldername(name))[1] = auth.uid()::text`. AUCUNE politique
-- insert/update/delete client : la fonction (clé secrète) court-circuite la RLS,
-- l'écriture vit exclusivement côté backend (§2.6).
```

**Pattern RPC `public` avec acteur résolu en SQL (Analog: `supabase/migrations/0146_child_behavior_guards.sql` lignes 144-177)** — le RPC de déclenchement `request_gdpr_export` recopie cette forme : `security definer`, `set search_path = ''`, acteur depuis `auth.uid()` JAMAIS un paramètre, erreurs avec errcodes stables traduits côté client :

```sql
create or replace function public.create_managed_child_profile(
  p_household_id text, …
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_household_id is null then
    raise exception 'foyer obligatoire' using errcode = '22023';
  end if;
  -- garde d'appartenance via private.can_write_household / private.current_member_id
  …
end;
$$;
```

Pour la phase 26 : `v_actor = auth.uid()` est la clé de la borne RGEX-03 — les RPC
d'extraction JSON reçoivent l'acteur ainsi, filtrent dur en SQL, et les tests
négatifs 0158 le prouvent (ci-dessous). Le RPC de déclenchement insère la ligne de
job ; l'unicité D-06 est tenue par l'INDEX UNIQUE PARTIEL
`(user_id) where status in ('en_attente','en_cours')`, pas par une vérif applicative.

**Pattern de privilèges RPC (Analog: `supabase/migrations/0147_child_push_adults.sql` lignes 281-285)** — tout `create or replace` recrée les ACL, re-grants idempotents obligatoires ; les fonctions `private` hors session client sont réservées à `service_role` :

```sql
revoke all on function private.push_reminder_notifications(timestamptz) from public, anon, authenticated;
grant execute on function private.push_reminder_notifications(timestamptz) to service_role;
```

Les RPC `public` appelés par le panneau (déclencheur, historique) restent au
contraire exécutables par `authenticated` — l'acteur y est revérifié par `auth.uid()`.

**Pattern scope push (Analog: `supabase/migrations/0147_child_push_adults.sql` lignes 52-66, 216-217)** — la notification D-01 ajoute un jeu de lignes au `returns table` existant (`user_id, reminder_id, household_id, title, body, url, tag, preference`) par RECOP IE-MODIFICATION vers l'avant : signature identique, les jobs `eo-push-dispatch` appellent par leur nom sans redéploiement. En-tête de fonction à recopier :

```sql
create or replace function private.push_reminder_notifications(p_now timestamptz)
returns table (
  user_id uuid, reminder_id text, household_id text,
  title text, body text, url text, tag text, preference text
)
language plpgsql stable
security definer
set search_path = ''
as $$ begin return query … end; $$;

comment on function … is '…';
```

Pour l'export : un CTE `exports_prets` sélectionne les lignes `gdpr_export_jobs`
passées à `pret`/`echec` avec `notified_push = false`, produit
`title='Votre export est prêt'`, `url='/parametres'` (D-04 — JAMAIS le lien signé
dans la push), puis marque les lignes notifiées. D-02 : l'échec est notifié comme
le succès (même CTE, deux statuts).

**Pattern Vault + pg_net (Analog: `supabase/migrations/0019_push_dispatch.sql` lignes 475-514)** — la fonction qui éveille l'Edge Function (payload `{action:'run'|'purge'}`) recopie verbatim la forme de `private.post_push_dispatch` :

```sql
create or replace function private.post_push_dispatch(p_scope text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
begin
  if to_regclass('net.http_post') is null or to_regclass('vault.decrypted_secrets') is null then
    raise notice 'pg_net ou Vault absent : envoi des notifications désactivé.';
    return false;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'service_role_key';

  if v_url is null or v_key is null then
    raise warning 'Secrets Vault project_url / service_role_key absents : envoi ignoré.';
    return false;
  end if;

  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/push-notify',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object('scope', p_scope),
    timeout_milliseconds := 30000
  );

  return true;
end;
$$;
```

Aucun secret dans `cron.job.command` (§2.7H) : la commande cron appelle la
fonction SQL, la fonction lit Vault.

**Pattern installation de jobs cron (Analog: `supabase/migrations/0011_cron.sql` lignes 362-387 pour la forme, `0129_push_dispatch_every_minute.sql` lignes 24-41 pour le cron-minute)** — `schedule_in_database` + `current_database()`, unschedule idempotent, préfixe `eo-`, garde `to_regclass('cron.job')` :

```sql
do $$
declare
  v_jobs text[][] := array[
    array['eo-routine-maintenance', '5 6 * * *', 'select private.run_daily_routine_maintenance()'],
    array['eo-invite-token-prune', '20 6 * * *', 'select private.prune_expired_invite_tokens()']
  ];
  v_job text[];
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron absent : jobs non installés.';
    return;
  end if;

  foreach v_job slice 1 in array v_jobs loop
    if exists (select 1 from cron.job where jobname = v_job[1]) then
      perform cron.unschedule(v_job[1]);
    end if;
    perform cron.schedule_in_database(
      v_job[1], v_job[2], v_job[3], current_database()
    );
  end loop;
end;
$$;
```

Pour 0158 : job minute `eo-gdpr-export-run` (`'* * * * *'`, forme 0129) qui ne
POSTe que si une ligne de job est due (comptage d'abord, forme `0019:519-541`),
et job quotidien `eo-gdpr-export-purge` (expression quotidienne, pas d'heure
critique, fuseau `Europe/Paris` imposé par §2.2). En-tête de migration : une
prose française qui NAMME la raison de la migration (forme 0129 lignes 1-20),
jamais une seule ligne de code sans son pourquoi.

---

### `supabase/functions/gdpr-export-run/index.ts` (Edge, event-driven → batch)

**Analog:** `supabase/functions/household-delete/index.ts` (structure intégrale, 205 lignes)

Le fichier est un jumeau structurel : doc-comment d'ouverture qui énonce les
modes d'auth, zod pour le corps, erreur applicative typée, client admin de
`ctx.supabaseAdmin`, pagination Storage, contrat de réponse honnête.

**Imports + en-tête** (analog lignes 1-46) :

```ts
/**
 * Edge Function `household-delete`.
 * MODES D'AUTHENTIFICATION DÉCLARÉS
 *   `auth: ['user', 'publishable']`, comme `household-invite` : la passerelle
 *   accepte les deux, mais seule une session `user` exécute quoi que ce soit…
 * CONTRAT DE RÉPONSE
 *   -> { household_id, expenses, storage_objects, storage_cleanup: 'ok' | 'partial' }
 */
import { withSupabase } from '@supabase/server';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@4.6.5';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};
```

Pour `gdpr-export-run` : `auth: ['secret']` UNIQUEMENT (jamais appelable par un
navigateur ; ASVS V2/Trait modèle « secret du job ») — le mode exact à recopier
est celui documenté dans push-notify/index.ts lignes 7-15, pas `['user','publishable']`.

**Pagination Storage (analog lignes 117-139)** — à recopier telle quelle pour le
listing du staging `<uid>/<job>/` avant la passe ZIP :

```ts
async function listHouseholdObjects(admin: AdminClient, bucket: string, prefix: string): Promise<string[]> {
  const paths: string[] = [];

  async function walk(folder: string): Promise<void> {
    let offset = 0;
    for (;;) {
      const { data, error } = await admin.storage.from(bucket).list(folder, { limit: PAGE_SIZE, offset });
      if (error) throw new HouseholdDeleteError(500, 'Inventaire des fichiers impossible.');
      const entries = data ?? [];
      for (const entry of entries) {
        const child = folder ? `${folder}/${entry.name}` : entry.name;
        const { data: sub } = await admin.storage.from(bucket).list(child, { limit: 1 });
        if (sub && sub.length > 0) await walk(child);
        else paths.push(child);
      }
      if (entries.length < PAGE_SIZE) return;
      offset += PAGE_SIZE;
    }
  }

  await walk(prefix);
  return paths;
}
```

**Traduction d'erreur RPC honnête (analog lignes 100-110)** — le serveur traduit
les errcodes posés en base par des messages français ; la base fait foi :

```ts
function translateRpcError(error: { code?: string; message: string }): HouseholdDeleteError {
  const message = error.message ?? '';
  // Les motifs sont posés en base (migration 0074) : la base fait foi.
  if (message.includes('réservée aux administrateurs')) { … }
  if (message.includes('session requise')) return new HouseholdDeleteError(401, 'Connectez-vous pour continuer.');
  console.error('household-delete: erreur RPC', { code: error.code, message });
  return new HouseholdDeleteError(500, 'Opération impossible.');
}
```

**Pas de travail HTTP à cheval (analog lignes 179-204)** — `Deno.serve(withSupabase(...))`, try/catch global, erreur applicative → status dédié, erreur inattendue → 500 loggé. La fonction export-run ne traite qu'UN lot par invocation (curseur sur la ligne de job) puis retourne : le cron-minute redrivalise (Pattern 1 du RESEARCH, contrainte 150 Mo / 60 s — `supabase-project/volumes/functions/main/index.ts:203-204`, contrainte fondatrice, NE PAS assembler l'archive en mémoire).

---

### `supabase/functions/gdpr-export-purge/index.ts` (Edge, secret, batch)

**Analogs:** `push-notify/index.ts` (mode secret, doc-comment lignes 1-45) + `household-delete/index.ts` (pagination + suppression par lots lignes 159-169)

```ts
// suppression par lots (household-delete/index.ts:159-169, forme exacte) :
for (let at = 0; at < paths.length; at += PAGE_SIZE) {
  const { error: removeError } = await admin.storage.from(bucket).remove(paths.slice(at, at + PAGE_SIZE));
  if (removeError) {
    console.error('household-delete: nettoyage Storage partiel', { bucket, message: removeError.message });
    partial = true;   // RGEX-04/Pitfall 5 : l'échec partiel est SIGNALÉ, jamais muet (§2.7F)
  } else { … }
}
```

La purge liste le préfixe via la table `gdpr_export_jobs` (`expires_at` <
maintenant, statut terminal) puis appelle `.remove()` — la suppression passe par
l'API Storage (les octets disque meurent), et écrit une table d'audit de purge
(chemins supprimés, résultat, horodaté). Le `partial` de household-delete est le
contrat à suivre : échec partiel ≠ succès.

---

### `supabase/tests/0158_gdpr_export.sql` (test SQL négatif)

**Analog:** `supabase/tests/0157_voyages_d06.sql` (intégral, 263 lignes) + `_setup.sql` (testkit)

Structure à recopier : `begin;` / semis en `postgres` via `testkit.auth_user`,
`testkit.household`, `testkit.member` / `testkit.fx` pour partager les id entre
blocs / sections numérotées en français / comptages BORNÉS §2.7D (`testkit.count(format(...))`
filtrés par id) / `rollback;` final. Les invariantes :

```sql
-- Semis (postgres) — _setup.sql:31-39 pour eq ; 0157:16-48 pour les fixtures :
adam uuid := testkit.auth_user('t157-adam@example.fr', 'Adam 157');
home text := testkit.household(adam, 'Foyer 157');
adam_m text := testkit.member(home, adam, 'Adam 157', 'admin', 'accent');
insert into testkit.fx (key, user_id) values ('adam', adam), …

-- Passer en authenticated avec l'identité d'un utilisateur :
select testkit.as_user((select user_id from testkit.fx where key = 'adam'), 't157-adam@example.fr');
set local role authenticated;

-- Attendre un refus avec un SQLSTATE précis (0157:74-97) :
begin
  perform public.trip_add_member(…);
  v_state := 'AUCUNE_ERREUR';
exception when others then
  v_state := SQLSTATE;
end;
perform testkit.ok(v_state = '42501', '… : 42501 attendu, obtenu ' || v_state || …);

-- Refus cross-foyer par oracle générique (0157:222-231) :
perform testkit.expect_denied(format(
  'select public.trip_add_member(%L, %L, %L)', …),
  'un membre d''un autre foyer n''entre pas dans le voyage');

-- Comptage borné, JAMAIS une table entière (0157:93-97) :
perform testkit.eq(testkit.count(format(
  'select 1 from public.trip_members where trip_id = %L', trip_id)), 1::bigint,
  'un seul participant (le refus n''a rien inscrit)');
```

Pour 0158 : cas négatifs RGEX-03 (membre de deux foyers lit le contenu d'un
autre foyer = rien ; foyer voisin (P0002/expect_denied) ; contenu d'un autre
membre du même foyer ; tentative d'appeler le RPC d'extraction avec l'id de job
d'autrui), garde d'unicité D-06 (deuxième `request_gdpr_export` tant que actif →
erreur), machine à états (en_attente→en_cours→pret, lease dépassé→echec), et
vérification SQL du job de purge (répertoire purgé, ligne d'audit attendue).

---

### `app/src/modules/parametres/components/gdpr-export-panel.tsx` (component)

**Analog:** `app/src/modules/parametres/components/household-delete-panel.tsx` (jumeau structurel, intégral cité ci-dessus 83 lignes)

**Imports** (analog lignes 1-9) :

```tsx
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Panel } from '@/components/shared/module-shell';
import { useToast } from '@/components/ui/toast';
import { useHouseholdStore, useIsAdmin } from '@/stores/household-store';
import { deleteHousehold } from '../api';
```

**Structure interne** (analog lignes 16-49) : toast + `queryClient` + état local
(`pending`, `error`), doc-comment qui nomme la raison du composant, action
asynchrone avec `try/catch/finally` et `setError(message instanceof Error ? …)`.

** Différences imposées par la phase** :
- **Pas de garde admin** — analog `if (!isAdmin || !householdId) return null;` est
  à NE PAS recopier : D-08 donne le droit à tout membre avec session (le panneau
  reste rendu pour tout membre).
- **Polling D-03/D-07** — ajout d'un `useQuery` avec `refetchInterval: 4000`
  tant qu'un job est `en_attente`/`en_cours` (TanStack Query v5, convention
  modules) ; trois états affichés (en attente → en cours → prêt) + durée écoulée,
  JAMAIS de pourcentage (D-03).
- **Pas de ConfirmDialog** — le déclenchement n'est pas destructif ; la modale
  n'a de sens que si l'agent en ajoute une pour une action lourde (rien ne
  l'exige ici). `Panel` + états vides soignés (§6) + bouton « Télécharger »
  conditionné à un lien vivant (historique D-07, TTL ≤ 24 h).

---

### `app/src/modules/parametres/components/gdpr-export-panel.test.tsx` (test Vitest)

**Analog:** `app/src/modules/parametres/components/household-delete-panel.test.tsx` (lignes 1-51)

```tsx
const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}));

function renderPanel() {
  return renderWithProviders(
    <Routes>
      <Route path="/parametres" element={<HouseholdDeletePanel />} />
      <Route path="/foyer" element={<p>Choisissez votre foyer</p>} />
    </Routes>,
    { route: '/parametres' },
  );
}
```

Si le panneau passe par `supabase.rpc(...)` plutôt que `functions.invoke`,
mocker `supabase.rpc` sur le même modèle. Assertions user-event + `waitFor`,
libellés français de boutons cherchés par rôle accessible.

---

### `app/src/modules/parametres/api.ts` (modification)

**Analog:** lui-même — deux formes de transport à recopier.

**Forme Edge Function (lignes 386-412)** — pour `requestGdprExport`/liens
gérés côté fonction :

```ts
export async function deleteHousehold(householdId: string): Promise<HouseholdDeleteResult> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Connectez-vous pour supprimer le foyer.');
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Hors ligne : reconnectez-vous pour supprimer le foyer.');
  }
  const { data: body, error, response } = await supabase.functions.invoke('household-delete', {
    body: { householdId },
  });
  if (error) {
    throw new Error(await readFunctionError(response, 'Suppression du foyer impossible pour le moment.'));
  }
  return body as HouseholdDeleteResult;
}

async function readFunctionError(response: Response | undefined, fallback: string): Promise<string> {
  if (response) {
    try {
      const parsed = (await response.clone().json()) as { error?: unknown };
      if (typeof parsed?.error === 'string' && parsed.error) return parsed.error;
    } catch {
      // Corps vide ou non JSON : repli générique ci-dessous.
    }
  }
  return fallback;
}
```

**Forme RPC (lignes 349-363, `setMemberRole`)** — pour le déclencheur et
l'historique (via RPC serveur avec acteur revérifié en base) :

```ts
if (isSupabaseConfigured && supabase) {
  const { error } = await supabase.rpc('set_member_role', { p_member_id: memberId, p_role: role });
  if (error) throw new Error(error.message || 'Changement de rôle impossible.');
  return;
}
// repli démo : `data.update(...)` — pour l'export RGPD il n'y a PAS de repli démo
// (le job vit côté serveur uniquement, comme `linkChildToAccount` lignes 318-327
// qui lève au lieu de simuler).
```

Convention doc-comment : chaque fonction exportée porte un bloc `/** … */` qui
dit QUI décide côté base et pourquoi (analog lignes 117-124, 238-242, 329-341).

---

### `app/src/modules/parametres/types.ts` + `parametres-page.tsx` (modifications)

**Analog types.ts (lignes 16-32)** :

```ts
export const householdColors = ['accent', 'coral', 'amber', 'ink'] as const;
export type HouseholdColor = (typeof householdColors)[number];
```

Pour le panneau : les labels français des statuts de job
(`en_attente`/`en_cours`/`pret`/`echec`) suivent la convention `roleLabels`
(ligne 35 : « Libellés français … jamais de valeur SQL dans l'interface ») :
un `Record<StatutJob, string>` exporté de `types.ts`, valeurs SQL interdites
dans le JSX.

**Analog montage (parametres-page.tsx, lignes 4-11 + 53)** : importer
`GdprExportPanel` en tête avec les autres panneaux et le monter dans la
`<section data-module="parametres">` — voisinage D-05 immédiat de
`<HouseholdDeletePanel />` (ligne 53).

---

## Shared Patterns

### RLS = dernière frontière, secrets jamais côté client (§2.6)
**Sources :** 0010_storage_and_realtime.sql:27-58 (politiques scellées sur préfixe), 0019:475-514 (secret lu dans Vault), AGENTS.md §2.6
**Appliquer à :** 0158_gdpr_export.sql (politiques bucket + RLS de `gdpr_export_jobs` SELECT limitée à `auth.uid()` et AUCUNE écriture client : RPC + service), les deux Edge Functions (mode `secret` exclusif)

```sql
-- La borne est le DEMANDEUR (D-08), pas le foyer : les politiques gdpr-exports
-- scellent le préfixe <user_id>/ ; et le lien signé n'est JAMAIS stocké en base
-- (précédent du dépôt, phase 25) — il se calcule à la demande et meurt au TTL ≤ 24 h.
```

### Erreurs avec SQLSTATE stables, traduites côté consommateur
**Sources :** 0146_child_behavior_guards.sql:162-177, household-delete/index.ts:100-110
**Appliquer à :** les RPC `public` de 0158 ET leur consommation dans api.ts / Edge
(oraux de tests : `28000` session, `22023` invalide, `42501` interdit, `P0002` absence,
`23P01`/`23000` pour la garde d'unicité — à retenir dans les tests négatifs).

### Échec signalé, jamais muet (§2.7F)
**Sources :** household-delete/index.ts:159-176 (`storage_cleanup: 'partial'`), D-02
**Appliquer à :** export-purge (audit de purge + statut partiel), gdpr_export_jobs
(`status='echec'` + `error`, notifié comme le succès), panneau (erreur visible,
retente possible — D-02/D-06).

### Corrections vers l'avant + commentaires français qui nomment la raison
**Sources :** 0129 lignes 1-20 (en-tête « POURQUOI CETTE MIGRATION »), 0147 lignes 1-44
**Appliquer à :** 0158 (récit en tête), 0147 est aussi le patron à recopier si un
comportement `private.push_*` existant doit cohabiter avec le nouveau scope :
`create or replace` avec signature et contrat inchangés.
**Interdits :** aucune directive de linter (§2.7/AGENTS, tooling `no-eslint-directive.test.ts`)
; pas de commentaire « dépendances volontairement omises ».

### Suite de vérification avant commit (§2.7, non négociable)
**Appliquer à :** tout changement de la phase

```sh
cd app && npm run typecheck && npm test && npm run build
cd app && npm run test:e2e
python3 scripts/check-sql-statique.py
python3 scripts/test-check-sql-statique.py   # ses propres cas qui doivent échouer
sh scripts/test-db.sh                        # OBLIGATOIRE (changement SQL) — sh scripts/test-db.sh 0158 en itération
sh scripts/test-dispatch-push.sh             # en plus : la chaîne pg_net → push est touchée (D-01, purge)
```

---

## No Analog Found

| Fichier | Rôle | Flux | Raison |
|---------|------|------|--------|
| Assemblage ZIP streaming (fflate `ZipPassThrough` + upload ReadableStream vers Storage) | utility (Deno) | streaming | Aucun upload en flux n'existe dans le dépôt ; l'import `npm:fflate@0.8.3` n'a jamais été consommé. **C'est le spike Wave 0** (RESEARCH A1/A2, cross-bucket copy A3) — le planificateur doit le planifier en premier, pas chercher un analogue. |
| Lease multipasse du job (`pass_started_at` + grâce, reprise par cron-minute) | service | batch | Genre de code nouveau, mais la frontière (job redrivable sans code de retry) est motivée par le RESEARCH Pattern 1 et la contrainte worker `main/index.ts:203-204` — s'appuyer sur le RESEARCH, pas sur un analogue in-repo. |

## Metadata

**Analog search scope :** `supabase/migrations/`, `supabase/functions/`, `supabase/tests/_setup.sql` + `0157`, `app/src/modules/parametres/`
**Fichiers lus pour extraction :** 0010, 0011(330-400), 0012(0129), 0019(455-529), 0146(140-214), 0147, 0148(1-45), household-delete/index.ts, push-notify/index.ts(1-60), tests/0157, tests/_setup.sql(1-50), household-delete-panel.tsx(+test), api.ts, types.ts, parametres-page.tsx (grep)
**Vérification tracked-source :** tous les analogues cités vérifiés via `git ls-files` — aucun chemin `supabase-project/volumes/…` (miroir) émis.
**Date d'extraction :** 2026-10-26
