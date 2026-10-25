# Phase 01: calendrier - Research

**Researched:** 2026-10-06
**Domain:** Calendrier foyer (SQL RLS + Edge cron + React 19 multi-vues)
**Confidence:** HIGH

## Summary

Le socle existe déjà : migrations 0047/0048/0049 (catégories, calendriers, cache fériés/vacances, RLS, Realtime), seed `create_household` (0054), UI 4 vues + filtres + tap-and-hold, hooks `use-ref-days`/`use-school-zone`/`zone-resolver`, tests 0016. Le travail de phase est un **delta précis**, pas une construction : resserrer la RLS Perso (D-01, admin-read à retirer), auto-créer le Perso par adulte (D-02), verrouiller les catégories en usage (D-08), remplacer le fetch direct API par un cache base + Edge `refresh-calendrier-ref` + pg_cron janv/sept (D-13/14/15), et rendre fériés/vacances non-masquables en fond non cliquable (D-10).

Le point le plus risqué est D-01 : la RLS actuelle autorise l'admin en **lecture** du Perso (`0047_calendrier.sql:203-210`, helper `is_calendar_visible` l.144-149) alors que la décision exige l'invisibilité totale. Correction vers l'avant obligatoire + mise à jour du test 0016 §2 qui asserte l'ancien comportement.

**Primary recommendation:** Corriger vers l'avant en 4 migrations (0084 RLS Perso total + 0085 Perso auto + 0086 garde catégories + 0087 cron Vault/dispatch), 1 Edge `refresh-calendrier-ref` mode `secret`, puis basculer `useRefDays` sur le cache base et verrouiller la FilterBar (D-09/D-10).

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Perso invisible total : ni lecture ni écriture pour les autres membres, même admin. — **Reversibility:** costly.
- **D-02:** Un Perso par membre adulte, créé avec le foyer, plus le Commun partagé. Pas de création libre de calendriers.
- **D-03:** Nouvel événement : choix explicite du calendrier à la création, jamais de rattachement silencieux. (Le défaut 0048 Commun-assignment reste un filet serveur, pas l'UX.)
- **D-04:** L'auteur déplace son événement librement Commun↔Perso, avec confirmation Perso→Commun (sortie du secret).
- **D-05:** Enfants : pas de Perso, leurs événements vivent dans le Commun.
- **D-06:** Seed Repas/Médical/École/Sport + customs créés par tout membre adulte ; les enfants taguent sans créer.
- **D-07:** La catégorie colore l'événement ; la couleur membre reste sur avatars et vues filtrées par membre. En cas de conflit catégorie gagne.
- **D-08:** Renommage/suppression interdits si des événements utilisent la catégorie ; sinon libres pour un adulte (seed inclus).
- **D-09:** FilterBar tout cumulable : calendriers + catégories + membres + couches fériés/vacances.
- **D-10:** Fériés et vacances toujours visibles, en fond non cliquable, jamais masquables ni modifiables.
- **D-11:** Création depuis la grille par tap-and-hold (date pré-remplie, calendrier explicite) ; le bouton + reste l'autre entrée.
- **D-12:** Vue Mois par défaut avec pastilles, Jour au clic sur une date, Semaine et Liste en onglets.
- **D-13:** Sources officielles : data.gouv (fériés) + Éducation nationale (vacances par zone), mises en cache en base (tables 0047).
- **D-14:** Cron janvier (année en cours) + septembre (rentrée), Europe/Paris, via Edge `refresh-calendrier-ref`.
- **D-15:** API en panne au refresh : ancien cache conservé et affiché, sans erreur bloquante, retry au prochain passage.
- **D-16:** Zone scolaire auto-détectée avec override manuel en paramètres du foyer.

### Agent's Discretion
Forme exacte de la FilterBar, libellés des confirmations de déplacement, détail du rendu pastille catégorie.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. Hors phase explicite : récurrence d'événements, partage hors foyer, invitations/RSVP.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| RLS Perso invisible + garde catégories | Database / Storage | — | Frontière d'autorisation finale (AGENTS.md §2.6) ; le client ne filtre jamais la confidentialité |
| Refresh fériés/vacances | Edge Function + pg_cron | Database (cache) | Secrets côté serveur, fetch externe hors client ; base = cache lecture seule |
| Zone scolaire A/B/C | API / Backend (colonne `households.school_zone`) | Frontend (select + suggestion) | Stockée en base, lue par tous, écrite par admin |
| 4 vues + FilterBar + RefDayLayer | Frontend (React) | — | Rendu pur, données via TanStack Query stale 24h + Dexie |
| Offline cache | Frontend (Dexie IndexedDB) | — | `app/src/lib/data/dexie.ts` existe déjà, couche `data.list` inchangée |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React + React DOM | 19.3.0 [VERIFIED: app/package.json] | UI 4 vues | Stack projet §2.1 |
| TypeScript | 7.0.2 [VERIFIED: app/package.json] | Type-check | `npm run typecheck` chaîne §2.7 |
| date-fns + @date-fns/tz | 4.4.0 / 1.5.0 [VERIFIED: app/package.json] | Jours, Europe/Paris | `toParisDay` existant dans `use-ref-days.ts:27-29` |
| TanStack Query | 5.103.2 [VERIFIED: app/package.json] | Cache serveur stale 24h | `STALE_MS = 24*3600*1000` déjà dans `use-ref-days.ts:16` |
| Dexie | 4.4.6 [VERIFIED: app/package.json] | Cache offline | `EnsembleDatabase` (`app/src/lib/data/dexie.ts:23-32`) : tables `rows`, `mutations` |
| RHF 7.88 + Zod 4.6.5 [VERIFIED: app/package.json] | Formulaires événement | `eventSchema` existant (`event-form-dialog.tsx:19-42`) |
| @supabase/supabase-js | 2.117.2 [VERIFIED: app/package.json] | PostgREST + Realtime | Couche `data.*` + `useResource` |
| pg_cron + Vault + pg_net | Stack Supabase self-hosted | Jobs janv/sept + dispatch secret | Motif `0011_cron.sql` éprouvé (jobs `eo-*`, `schedule_in_database`, secrets via `vault.decrypted_secrets`) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest 5 + RTL + user-event | [VERIFIED: app/package.json] | Tests composants/hooks | `calendrier-page.test.tsx`, `use-ref-days.test.ts` existants |
| MSW 2.15 + fake-indexeddb 6.2.5 | [VERIFIED: app/package.json] | Mock réseau + Dexie en test | Nouveau fetch DB : mocker PostgREST, pas les API gouv |
| Playwright 1.63 | [VERIFIED: app/package.json] | e2e 2 comptes | `app/e2e/*.spec.ts` existants (pattern `courses-scan.spec.ts`) ; comptes `alice-cal`/`bob-cal` (STATE.md) |

**Aucune installation requise.** Tout le stack est déjà dans `package.json` ; l'Edge réutilise `npm:zod@4.6.5` comme `gift-list-invite/index.ts:66` [VERIFIED].

## Package Legitimacy Audit

Aucun package externe à installer pour cette phase (stack existante uniquement, Edge en `npm:zod` déjà éprouvé). Audit sans objet — aucune ligne `npm install` à planifier.

## Architecture Patterns

### System Architecture Diagram

```
pg_cron (janv + sept, Europe/Paris)
  │  SELECT private.dispatch_calendrier_refresh()   (lit Vault, pas de secret en clair)
  ▼
Edge refresh-calendrier-ref  (mode secret seul, apikey header)
  │  fetch data.gouv fériés + EN vacances (fail-open : erreur → cache conservé)
  ▼
public.public_holidays + public.school_holidays  (upsert service_role, RLS select-only client)
  │
  ▼
Frontend useRefDays (réécrit : lit la BASE, plus de fetch direct)
  │  TanStack stale 24h + Dexie rows
  ▼
CalendarShell : Mois(defaut)/Semaine/Jour/Liste + FilterBar cumulable + RefDayLayer (fond non cliquable)
```

### Recommended Project Structure

```
supabase/migrations/0084_calendrier_perso_total.sql   # D-01 : retire admin-read
supabase/migrations/0085_calendrier_perso_auto.sql    # D-02/D-05 : trigger insert member + backfill
supabase/migrations/0086_calendrier_category_guard.sql # D-08 : trigger garde rename/delete
supabase/migrations/0087_calendrier_refresh_cron.sql  # D-14 : dispatch Vault + jobs janv/sept
supabase/functions/refresh-calendrier-ref/index.ts    # D-13/D-15 : fetch + upsert, fail-open
supabase/tests/0017_calendrier_phase.sql              # RLS négatifs D-01/D-02/D-05/D-06/D-08 + cron
app/src/modules/calendrier/hooks/use-ref-days.ts      # réécrit sur cache base (garder helpers purs)
```

### Pattern 1: RLS Perso invisible total (D-01)
**What:** Retirer la branche `or private.is_household_admin(...)` de `event_calendars_select` (0047 l.203-210) et de `is_calendar_visible` (0047 l.144-149). Le helper devient : membre + (commun OU owner). [VERIFIED: supabase/migrations/0047_calendrier.sql:132-150,200-210]
**When to use:** Migration 0084, `CREATE OR REPLACE` des deux objets + commentaire à jour.
**Conséquence à planifier :** `events_delete_admin` (0047 l.297-310) autorise l'admin à supprimer un event Perso par id. Sous invisibilité totale, restreindre la suppression au owner pour le Perso (admin garde le Commun) — sinon un admin peut détruire ce qu'il ne voit pas. Aussi : `event_calendars_update` (l.230-252) laisse un `or private.is_household_admin` générique — à resserrer de la même façon.
**Test à mettre à jour :** `supabase/tests/0016_calendrier_rls.sql:78-87` asserte actuellement l'admin-read (« Alice admin lit ») — réécrire en `expect_denied`/count 0.

### Pattern 2: Perso auto par adulte (D-02/D-05)
**What:** Trigger `BEFORE/AFTER INSERT` sur `public.household_members` : si `NEW.role IN ('admin','membre')`, insère `event_calendars (household_id, name, 'perso', NEW.id)` s'il n'existe pas déjà pour ce membre. Enfants (`'enfant'`) exclus — rôles vérifiés : `'admin'` écriture+gestion, `'membre'` écriture, `'enfant'` lecture seule [VERIFIED: 0006_security_helpers.sql:9-13,77-85]. Backfill : un Perso par membre adulte existant sans Perso. Nom : contrainte `event_categories_name_unique`-like `(household_id, name)` existe aussi sur calendars [VERIFIED: 0047_calendrier.sql:43] → nommer `'Perso'` + gérer le conflit (un seul Perso par membre garantit l'unicité si nom fixe `'Perso'` par owner ; vérifier l'unicité par `(household_id, owner_member_id)` via index partiel plutôt que par nom).
**Trigger discipline (AGENTS.md §2.7A) :** `SECURITY DEFINER`, `set search_path = ''`, tables `public.*` qualifiées, `REVOKE ALL ... FROM public, anon, authenticated` (motif 0048 l.39).
**Note :** `create_household` (0054) ne sème que Commun + 4 catégories [VERIFIED: 0054_create_household_seeds.sql:65-72] — le trigger couvre les futurs membres ; le backfill 0085 couvre l'existant. Ne pas toucher 0054 (migration appliquée, forward-only).

### Pattern 3: Garde catégorie en usage (D-08)
**What:** Trigger `BEFORE UPDATE OF name ON event_categories` + `BEFORE DELETE` : si `EXISTS (SELECT 1 FROM public.events WHERE category_id = OLD.id)` → `RAISE EXCEPTION ... USING errcode='23514'`. Seed inclus (pas d'exception pour `is_default` au-delà de l'existante `not is_default` sur delete).
**Rappel contrôle statique n°8 :** DML puis ALTER même table dans la même transaction = `pending trigger events` en réel (incident 0055, STATE.md). Donc trigger d'abord, **pas** de backfill+contrainte dans la même transaction sur `events`. Ici trigger seul sur `event_categories` : sans risque, mais ne pas combiner avec un ALTER de `events` dans 0086.

### Pattern 4: Edge refresh-calendrier-ref + dispatch Vault (D-13/14/15)
**What:** Miroir exact du motif push éprouvé :
- SQL `private.dispatch_calendrier_refresh()` : lit `project_url`/`service_role_key` dans `vault.decrypted_secrets`, teste `to_regproc('net.http_post')`, POST `/functions/v1/refresh-calendrier-ref` avec clé en header **`apikey`** (jamais Bearer — §2.7D : Bearer+clé = `401 UNUSABLE_CREDENTIAL` avant le corps) [CITED: 0011_cron.sql:310-338 + test 0004_cron.sql:260-275].
- Jobs : `cron.schedule_in_database('eo-calendrier-refresh-jan', '0 4 1 1 *', 'select private.dispatch_calendrier_refresh()', current_database())` + septembre `'0 4 1 9 *'`. Fuseau : les jobs existants n'ont pas de TZ explicite (`eo-routine-maintenance` à `5 6 * * *` [VERIFIED: 0004_cron.sql:184-188]) — le serveur tourne en Europe/Paris par convention projet [ASSUMED — vérifier `cron.timezone` sur la stack au plan].
- Edge : `withSupabase({ auth: ['secret'] })` (appel serveur seul ; AGENTS.md §2.2 : `secret` = appel serveur). Fetch `https://calendrier.api.gouv.fr/jours-feries/metropole/{year}.json` [VERIFIED: use-ref-days.ts:18] et dataset EN `fr-en-calendrier-scolaire` avec `where zones="Zone {Z}"` + `annee_scolaire` [VERIFIED: use-ref-days.ts:20-24]. Upsert `public_holidays` (PK `holiday_date`) et `school_holidays` (unique zone+bornes) [VERIFIED: 0047_calendrier.sql:59-77]. **Fail-open (D-15) :** toute erreur fetch → log + 200 avec `refreshed:false`, cache intact, retry au prochain passage. Années : année en cours en janvier ; septembre : année scolaire `schoolYearFor` (sept→`YYYY-YYYY+1`) [VERIFIED: use-ref-days.ts:32-36].
- Test cron : étendre le motif 0004 §4 (jobs présents, `database is not distinct from current_database()`, aucun secret dans `command`, `command ~ '^select private\.[a-z_]+\(\)$'`) au nouveau job.

### Pattern 5: useRefDays sur cache base (D-13/D-15)
**What:** Réécrire `useRefDays(year, zone)` : `useResource`/`data.list` sur `public_holidays` (filtre `year`) + `school_holidays` (filtre `zone`), `staleTime: 24h` conservé. Garder les helpers purs `toParisDay`, `schoolYearFor`, `parseVacationRecords`, `vacationsOfDay`, `nextSchoolDay` (déjà testés par `use-ref-days.test.ts`). Supprimer le fetch direct (ou le garder en fallback manuel hors ligne ? Non — D-13 dit cache en base ; le fallback direct contredirait la source unique. Trancher : suppression).
**Dexie :** la couche `data.list` met déjà en cache dans `rows` [VERIFIED: app/src/lib/data/dexie.ts:23-32] → offline gratuit, rien à construire.

### Pattern 6: FilterBar cumulable + RefDayLayer toujours visible (D-09/D-10)
**What:** L'état actuel (`calendrier-page.tsx:77-81,243-341`) a 3 Selects + 3 toggles dont `showHolidays`/`showVacations` — **ces deux toggles violent D-10** (« jamais masquables »). Plan : supprimer les toggles fériés/vacances (garder le toggle Anniversaires ? Anniversaires n'est pas une couche ref — D-09 liste « couches fériés/vacances » comme cumulables mais D-10 dit toujours visibles ; lecture retenue : les couches ref sont toujours ON, les filtres calendriers/catégories/membres restent cumulables. Le toggle Anniversaires existant peut rester — hors couches ref).
**RefDayLayer :** fériés/vacances en fond de case (bandeau/pastille ambre/bleu existants dans `buildDayMarkers` [VERIFIED: types.ts:291-329]) + lignes d'agenda **sans actions** (déjà le cas : boutons edit/delete seulement pour `kind==='event'`, `onOpenTask` pour tâches [VERIFIED: agenda-list.tsx:81-111]) → verrouiller : aucun `onClick`/`onEdit` sur `ferie`/`vacances`, cases non cliquables pour création sur ces couches (le tap-and-hold crée un événement du foyer ce jour-là — autorisé, c'est la couche event qui reçoit, pas la ref).

### Pattern 7: Choix calendrier explicite + confirmation Perso→Commun (D-03/D-04)
**What:** État actuel : le Select calendrier n'apparaît que si `calendars.length > 1` avec option vide « Commun du foyer » [VERIFIED: event-form-dialog.tsx:201-217], et `use-calendrier.ts:105-108` résout silencieusement vers le Commun. D-03 : rendre le choix explicite — présélectionner visiblement « Commun » (pas de valeur vide silencieuse), validation Zod `calendarId` non vide quand plusieurs calendriers. D-04 : dans `calendrier-page.tsx` `onSubmit` (l.507-516), si `editing && editing.calendarId !== values.calendarId` et sortie du Perso vers Commun → `ConfirmDialog` (pattern existant `pendingDelete` l.655-673) avec libellé (discrétion agent : ex. « Rendre visible à tout le foyer ? »). D-11/D-12 déjà OK : `onLongPress` (calendar-grid.tsx:67-69) + bouton + (l.204-206), Mois défaut (l.38-45).

### Anti-Patterns to Avoid
- **Filtrer le Perso côté client :** la confidentialité est RLS, jamais un `filter()` React. Un filtre client fuit via Realtime/devtools.
- **Réécrire 0047/0048/0054 :** migrations appliquées → forward-only (AGENTS.md §2.7A.1).
- **Secret dans `cron.job.command` ou en CLI `psql -c` :** Vault uniquement ; stdin pour psql (AGENTS.md §2.7C/H). Le test 0004 §4 rejette tout secret dans `command`.
- **DML + ALTER même table même txn :** incident 0055 (`pending trigger events`) — contrôle statique n°8.
- **Bearer + clé secrète :** `401 UNUSABLE_CREDENTIAL` muet (0004 l.260-275). Header `apikey`.
- **Assertion non bornée en `postgres` :** la RLS est court-circuitée sous ce rôle → borner par foyer/marquee `Aaaa` (AGENTS.md §2.7D.2, motif 0016).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth Edge secret-only | Middleware maison | `withSupabase({auth:['secret']})` (`@supabase/server`, table d'import `volumes/functions/deno.jsonc` [VERIFIED]) | Modes publishable/user/secret/none imposés §2.2 ; `FUNCTIONS_VERIFY_JWT=false` sur la stack |
| Rate-limit Edge | Compteur Redis externe | Compteur mémoire `Map` + `LIMITS` par action (motif gift-list-invite l.211-242) | Mono-instance, éprouvé, fail-closed 429 |
| Calcul fériés FR | Algorithme Pâques maison | `calendrier.api.gouv.fr` mis en cache | 11 fériés + Alsace-Moselle ? Non — métropole seule, comme aujourd'hui |
| Vacances par zone | Table académies maison côté SQL | Cache EN + `schoolYearFor` + `resolveZoneFromPostcode` existants | Table DEPT_TO_ZONE déjà exhaustive [VERIFIED: zone-resolver.ts:25-55] |
| Pastilles multi-sources | Nouveau composant grille | Étendre `buildDayMarkers`/`buildAgenda` (purs, testés) | D-07 : catégorie colore, membre sur avatar — ajouter `categoryColor` au marker, pas un 2e système |

## Common Pitfalls

### Pitfall 1: 0048 silent-default vs D-03 explicit choice
**What goes wrong:** Le trigger `assign_default_calendar` assigne le Commun quand `calendar_id` est NULL [VERIFIED: 0048_calendrier_default.sql:8-37] — le plan pourrait croire D-03 satisfait.
**Why:** C'est un filet serveur, pas l'UX (CONTEXT D-03 le dit).
**How to avoid:** Validation formulaire explicite + présélection visible ; garder 0048 intact pour les vieux clients.
**Warning signs:** `calendarId: ''` qui transite jusqu'à `saveEvent`.

### Pitfall 2: Unicité nom calendrier bloque le Perso auto
**What goes wrong:** `event_calendars_name_unique (household_id, name)` [VERIFIED: 0047:43] — deux Perso nommés pareil → 23505 dans le trigger d'auto-création.
**How to avoid:** Nom fixe par owner + index unique partiel `(household_id, owner_member_id) WHERE visibility='perso'`, ou suffixe incrémental. Tester la double-insertion membre (idempotence `ON CONFLICT DO NOTHING`).

### Pitfall 3: Test 0016 §2 prouve l'ancien monde
**What goes wrong:** Le test existant commente « Alice admin lit » le Perso (l.78-81) sans l'asserter strictement, mais 0016 passe avec l'admin-read actuel. Après 0084, toute suite qui suppose l'admin-read casse silencieusement si non mise à jour.
**How to avoid:** Nouvelle suite `0017` (pas de réécriture de 0016 — fichier de test appliqué ? Les tests ne sont pas des migrations ; la convention repo est forward : 0016 reste l'histoire, 0017 prouve D-01 avec `expect_denied` admin sur select/update/delete du Perso + events du Perso invisibles).

### Pitfall 4: `returns table` variable ambiguity dans le dispatch
**What goes wrong:** `private.dispatch_calendrier_refresh()` copié de `post_push_dispatch` : variables PL/pgSQL qui collisionnent avec colonnes `OUT`.
**How to avoid:** Qualifier `v_` + `public.`/`private.` partout ; contrôle statique n°4 vert avant commit.

### Pitfall 5: useRefDays réécrit casse `use-ref-days.test.ts`
**What goes wrong:** Les tests actuels couvrent `fetchFrenchHolidays`/`parseVacationRecords` (fetch direct). Supprimer le fetch casse la suite.
**How to avoid:** Garder les helpers purs + leurs tests ; ajouter tests du mapping lignes DB → `FrenchHoliday`/`VacationRange` (MSW sur PostgREST ou rows injectées) ; supprimer uniquement les tests du fetch direct.

## Code Examples

### Dispatch Vault → Edge (motif à copier depuis 0011/0019)
```sql
-- Source: supabase/migrations/0011_cron.sql:310-338 (motif éprouvé, à adapter)
-- private.dispatch_calendrier_refresh() lit project_url/service_role_key
-- dans vault.decrypted_secrets, teste to_regproc('net.http_post'),
-- POST {project_url}/functions/v1/refresh-calendrier-ref, clé en header 'apikey'.
-- Jobs: '0 4 1 1 *' (janvier) + '0 4 1 9 *' (septembre) via cron.schedule_in_database(..., current_database()).
```

### Edge secret-only fail-open (D-15)
```typescript
// Source: supabase/functions/gift-list-invite/index.ts:388-389 + 221-242
import { withSupabase } from '@supabase/server';
Deno.serve(
  withSupabase({ auth: ['secret'] }, async (request, ctx) => {
    // fetch API gouv → upsert service_role → catch: return json({ refreshed: false }, 200)
  }),
);
```

### Garde catégorie (D-08, search_path vide, noms qualifiés)
```sql
create or replace function private.guard_event_category()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.events where public.events.category_id = old.id) then
    raise exception 'catégorie utilisée' using errcode = '23514';
  end if;
  return old; -- DELETE ; pour UPDATE OF name: return new après même test
end;
$$;
-- Note: pas de CTE auto-joint, pas de colonne returns-table — trigger simple, contrôle n°1/2 OK.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fetch direct API gouv depuis le navigateur (`use-ref-days.ts:38-80`) | Cache base + Edge cron (cette phase, D-13) | Phase 01 | Source unique, offline, pas de CORS/rate-limit client |
| Perso lisible par admin (0047) | Perso invisible total (D-01, 0084) | Phase 01 | Rupture assumée, `costly reversibility` |
| Toggles fériés/vacances masquables | Couches toujours visibles (D-10) | Phase 01 | Supprimer 2 toggles, garder Anniversaires |

**Deprecated/outdated:**
- Option vide « Commun du foyer » silencieuse du Select calendrier → présélection explicite (D-03).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `cron.timezone = Europe/Paris` disponible sur la stack (jobs existants sans TZ) | Pattern 4 | Refresh à 04h UTC au lieu de Paris → décaler l'heure planifiée après vérif `show cron.timezone` |
| A2 | API `calendrier.api.gouv.fr/{year}.json` et dataset EN `fr-en-calendrier-scolaire` inchangés (schéma `description/start_date/end_date/zones/annee_scolaire`) | Pattern 4 | Refresh partiel → contrat Edge à ajuster, fail-open protège l'affichage |
| A3 | `households_update` restreint aux admins (override zone D-16 admin-only cohérent) | Pattern 6/Validation | Si membre peut éditer, le select zone doit être visible à tous — vérifier 0007 l.257-261 au plan |
| A4 | Corse/OM : pas de suggestion de zone (`resolveZoneFromPostcode` → null) + select manuel suffit (D-16) | Zone | Aucun — comportement existant conservé |

## Open Questions

1. **Suppression admin d'un event Perso invisible (D-01)**
   - What we know: `events_delete_admin` autorise l'admin par id sans visibilité.
   - Recommendation: restreindre en 0084 (owner seul pour Perso, admin pour Commun) — le planner tranche, défaut recommandé oui.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker engine | test-db.sh, stack locale | ✓ | 29.8.1 (client) | Chaîne sans Docker (typecheck+Vitest+e2e+statique) puis test-db obligatoire avant merge (§2.7) |
| Node/npm | build/test frontend | ✓ | 24.21.0 / 11.19.0 | — |
| pg_cron / pg_net / Vault | jobs + dispatch | À vérifier sur stack locale | — | Tests avec `raise notice` + skip si absents (motif 0004 l.144-147, 296-307) |
| data.gouv / EN / Open-Meteo | refresh + détection zone | Non probé (pas d'outil web cette session) | — | Fail-open D-15 ; zone manuelle |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5 + Playwright 1.63 + suites SQL testkit (`sh scripts/test-db.sh`) + `python3 scripts/check-sql-statique.py` (8 contrôles) |
| Config file | `app/package.json` scripts (`test`, `test:e2e`, `typecheck`, `build`) |
| Quick run command | `cd app && npm run typecheck && npm test` |
| Full suite command | `cd app && npm run typecheck && npm test && npm run build && cd app && npm run test:e2e && python3 scripts/check-sql-statique.py && sh scripts/test-db.sh` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-01 | Perso invisible admin (select/update/delete + events) | SQL négatif | `sh scripts/test-db.sh` (suite 0017) | ❌ Wave 0 (0016 à compléter par 0017) |
| D-02/D-05 | Perso auto adulte, rien pour enfant | SQL | `sh scripts/test-db.sh` (0017) | ❌ Wave 0 |
| D-06 | Enfant tague sans créer | SQL négatif | `sh scripts/test-db.sh` (0016 §3 existe déjà) | ✅ |
| D-08 | Rename/delete catégorie en usage refusés | SQL 23514 | `sh scripts/test-db.sh` (0017) | ❌ Wave 0 |
| D-13/15 | useRefDays lit le cache base ; panne = ancien affiché | Vitest | `npm test` (étendre `use-ref-days.test.ts`) | ✅ partiel |
| D-09/10 | FilterBar cumulable, ref non masquable/non cliquable | Vitest + e2e 2 comptes | `npm test` + `npm run test:e2e` | ❌ Wave 0 (nouveau spec e2e calendrier) |
| D-14 | Jobs janv/sept + Vault + pas de secret en clair | SQL catalogue | `sh scripts/test-db.sh` (0017, motif 0004 §4) | ❌ Wave 0 |
| D-03/04 | Choix explicite + confirmation Perso→Commun | Vitest (dialog) | `npm test` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd app && npm run typecheck && npm test` + `python3 scripts/check-sql-statique.py` (si SQL touché)
- **Per wave merge:** full suite ci-dessus
- **Phase gate:** Full suite green avant `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `supabase/tests/0017_calendrier_phase.sql` — D-01/D-02/D-05/D-08/D-14 (marque `Aaaa`, rôle `postgres` borné + `authenticated` négatifs)
- [ ] `app/e2e/calendrier.spec.ts` — 2 comptes alice-cal/bob-cal : Perso invisible inter-compte, toggles ref absents, tap-and-hold/+ créent avec calendrier explicite
- [ ] `supabase/functions/refresh-calendrier-ref/index.ts` + entrée `scripts/deploy-functions.sh` (vérifier qu'il copie tout `supabase/functions/*` sauf `main`/`hello`)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Supabase Auth JWT ; Edge `secret` (cron) — jamais `none` sans signature |
| V3 Session Management | no | — (pas de session custom) |
| V4 Access Control | yes | RLS Perso total (0084) + tests négatifs inter-foyer + inter-membres |
| V5 Input Validation | yes | Zod côté Edge (`npm:zod@4.6.5`) + `eventSchema` + CHECK SQL (`^#[0-9a-fA-F]{6}$`, 1–40 chars) |
| V6 Cryptography | yes | Aucun secret en clair (Vault/`cron.job.command` testé) ; HMAC non requis ici (pas de token) — ne pas réutiliser `INVITE_TOKEN_HMAC_SECRET` |

### Known Threat Patterns for Supabase self-hosted + React

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Admin lit le Perso via PostgREST direct | Information disclosure | 0084 : RLS sans branche admin + `expect_denied` en 0017 |
| Calendrier/category_id inter-foyer forgé | Tampering | Trigger `validate_event_scope` existant (0047 l.374-411) — inchangé, couvert par 0016 §5 |
| Secret Edge en clair (cron/env) | Information disclosure | Vault + header `apikey` ; test `command !~ secret|...` (motif 0004 l.165-172) |
| Enfant crée catégorie/calendrier | Elevation of privilege | `can_write_household` exclut déjà `enfant` [VERIFIED 0006:77-85] + masquer les boutons + si rôle `enfant` |
| Suppression catégorie en usage → events orphelins | Denial / Tampering | Trigger garde 0086 (23514) + ConfirmDialog côté UI (actions destructrices §6) |

## Sources

### Primary (HIGH confidence)
- `supabase/migrations/0047_calendrier.sql` (lues l.1-420 : tables, RLS, helpers, trigger) + `0048` + `0049` + `0054` (seed) + `0006_security_helpers.sql:1-100` (rôles) + `0011_cron.sql:360-387` (jobs)
- `app/src/modules/calendrier/` : `api.ts`, `types.ts`, `calendrier-page.tsx`, `use-calendrier.ts`, `use-ref-days.ts`, `use-school-zone.ts`, `lib/zone-resolver.ts`, `components/*`
- `supabase/tests/0016_calendrier_rls.sql`, `0004_cron.sql` (motifs d'assertion), `supabase/functions/gift-list-invite/index.ts` (pattern Edge)
- `app/package.json` (versions), `app/src/lib/data/dexie.ts`, `AGENTS.md` §§2/2.6/2.7/6

### Secondary (MEDIUM confidence)
- `.planning/PHASES/01-calendrier.md`, `01-CONTEXT.md` (décisions D-01..D-16), `STATE.md` (comptes e2e, incident 0055)

### Tertiary (LOW confidence)
- Fuseau pg_cron Europe/Paris (A1), stabilité schémas API gouv (A2) — à confirmer au plan, fail-open comme garde-fou.

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH - versions lues dans `package.json` cette session
- Architecture: HIGH - fondation SQL + UI lues ligne à ligne, deltas identifiés précisément
- Pitfalls: HIGH - incidents repo (0055, Bearer/apikey, CTE) documentés en AGENTS.md/RETROSPECTIVE

**Research date:** 2026-10-06
**Valid until:** 2026-11-05 (stack stable, APIs publiques en hypothèse)

## Project Constraints (from AGENTS.md)

- Stack : React 19.3 + Vite 8.3 + TS 7 + Tailwind 4 + TanStack Query 5 + Zustand 5 + RHF 7 + Zod 4 + Dexie 4 + `vite-plugin-pwa` ; React Router 8.4 depuis `react-router` uniquement ; composant calendrier maison (`react-big-calendar` exclu) ; `rrule.js` réservé aux routines (pas d'événements récurrents ici).
- RLS (§2.6) : frontière finale ; `SECURITY DEFINER` + `search_path=''` + privilèges minimaux ; politiques SELECT/INSERT/UPDATE/DELETE explicites ; tests négatifs (sans foyer, 2 foyers, inter-foyer, escalade).
- Chaîne §2.7 dans l'ordre : typecheck + tests + build, e2e, `check-sql-statique.py` vert, `test-db.sh` obligatoire (Docker), secrets jamais en clair/CLI/cron.command, forward-only, triggers qualifiés `public.*`, pas de CTE auto-joint, pas de DML+ALTER même txn.
- UX §6 : tuiles ≥44px, code couleur membre, suppressions confirmées par modale, tap-and-hold/swipe jamais uniques (alternative bouton/clavier), états vides soignés, Mois défaut + pastilles + Jour au clic.
- Hébergement : Docker Compose + Traefik, `FUNCTIONS_VERIFY_JWT=false` → chaque Edge déclare son mode ; CORS Envoy permissif assumé, autorisation par clé/JWT/RLS.
