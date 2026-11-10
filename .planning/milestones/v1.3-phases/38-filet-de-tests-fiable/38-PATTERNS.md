# Phase 38: Filet de tests fiable - Pattern Map

**Mapped:** 2026-11-08
**Files analyzed:** 8 chantiers (fichiers créés/modifiés)
**Analogs found:** 8 / 8 (dont 5 auto-analogs : le fichier modifié est lui-même l'analogon de sa propre transformation)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/src/lib/datetime.ts` (helpers `debutSemaineIso`/`jourSemaine`) | utility | transform (dates ISO pures) | `app/src/modules/menu/types.ts:54-72` (`weekStartOf`/`toUtcDate`) | exact |
| `app/src/lib/datetime.test.ts` (+ cas 7 jours) | test (unit paramétrique) | transform | `app/src/lib/datetime.test.ts:1-50` (style existant, TZ épinglé) | exact |
| `app/src/lib/data/seed.ts` (recalage meals) | service (semis démo) | batch/transform | `app/src/lib/data/seed.ts:63-164` (primitifs `day`/`at`/`minutesAgo`) | exact (auto) |
| `app/src/lib/data/seed.test.ts` (garde anti-récidive semaine) | test (garde de classe) | batch | `app/src/lib/seed-instants.test.ts:1-45` | exact |
| `app/src/modules/menu/types.ts` (délégation `weekStartOf`) | utility | transform | lui-même + nouveau `debutSemaineIso` | exact (auto) |
| `app/src/modules/menu/hooks/use-menu.ts` / `menu-page.tsx` | hook / component | request-response | eux-mêmes — AUCUN changement prévu (le défaut est le semis) | — |
| `app/src/stores/household-store.test.ts` (durcissement WR-03 l.316-335) | test (timing) | event-driven (persistance async) | `app/src/components/ui/route-error.test.tsx:39` (`vi.waitFor`) | role-match |
| `app/src/modules/ardoise/api.ts` (IN-01, l.314-316) | service (client API) | request-response | `37-REVIEW-FIX.md` l.48 (forme cible) | exact (auto) |
| `supabase/functions/ardoise-invite/index.ts` (IN-02, `buildGuestView` l.627-679) | service (Edge Function) | request-response | même fichier l.648-653 (lecture `expenses` BORNÉE + ordonnée) | exact (auto) |
| `app/e2e/critical-paths.spec.ts` (l.134, rouge join-token) | test (e2e) | request-response | aucun changement — cohabitation J-01/J-02 | — |
| `docs/RETROSPECTIVE.md` (campagne v1.3) | doc | — | sections « campagnes » existantes (l.1, l.411, l.507 : une campagne = un titre `#` + numérotation continue) | exact |

---

## Pattern Assignments

### `app/src/lib/datetime.ts` — helpers `debutSemaineIso` / `jourSemaine` (utility, transform)

**Analog:** `app/src/modules/menu/types.ts:54-72` — le code de référence pour l'arithmétique semaine lundi-based. RESEARCH recommande la factorisation : `weekStartOf` (menu) délègue à `debutSemaineIso` (datetime) — §2.7 E, une seule source.

**Semaine lundi→dimanche en UTC pur** (menu/types.ts:54-72) :
```typescript
const toUtcDate = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
};
const isoOfUtc = (date: Date): string => date.toISOString().slice(0, 10);

/** Lundi de la semaine contenant la date ISO donnée. */
export function weekStartOf(isoDate: string): string {
  const date = toUtcDate(isoDate);
  const offset = (date.getUTCDay() + 6) % 7; // lundi = 0
  date.setUTCDate(date.getUTCDate() - offset);
  return isoOfUtc(date);
}
```

**Style de commentaire du module datetime** (datetime.ts:3-15) : chaque fonction porte un récit de son pourquoi en français, nommant le défaut d'origine (WR-07 ici). Les nouveaux helpers suivent : `debutSemaineIso` = lundi de la semaine d'une date ISO ; `jourSemaine(debut, index)` = 0 = lundi … 6 = dimanche (sémantique de `weekDatesOf`, menu/types.ts:75-78, à lire pour le second helper).

---

### `app/src/lib/datetime.test.ts` — cas paramétriques 7 jours (test, S-02)

**Analog:** `app/src/lib/datetime.test.ts:1-17` — convention de fichier : TZ épinglé avec restauration `afterAll` (le worker `pool: 'forks'` est réutilisé).

```typescript
const PREVIOUS_TZ = process.env.TZ;
process.env.TZ = 'Europe/Paris';
afterAll(() => {
  if (PREVIOUS_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = PREVIOUS_TZ;
});
```

**Forme du paramétrage** (RESEARCH Pattern 2) : `it.each` avec la date en ENTRÉE — jamais `vi.setSystemTime`. Les 7 ISO couvrent chaque jour de semaine, dimanche en dernier ligne étiquetée « le jour qui cassait avant le fix ». Note : les helpers prennent l'ISO en argument → pour les helpers purement ISO, le pin TZ est inutile (UTC pur) ; ne l'ajouter que si un cas touche un instant local.

---

### `app/src/lib/data/seed.ts` — recalage des meals (service/semis, S-01)

**Analog:** lui-même — primitifs à conserver (seed.ts:69-109) :

```typescript
const now = () => new Date().toISOString();
const day = (offset: number) => addDays(todayIso(), offset);
const at = (time: string) => `${day(0)}T${time}:00`;
```

**Zone à convertir** (seed.ts:160-164) — les seules lignes dont la visibilité dépend d'une grille semaine :
```typescript
export const demoMealEntries = [
  { id: 'meal-1', ..., entry_date: day(0), slot: 'soir', ... },
  { id: 'meal-2', ..., entry_date: day(1), slot: 'midi', free_text: 'Restes du frigo', ... },
  { id: 'meal-3', ..., entry_date: day(2), slot: 'soir', ... },
];
```
→ forme cible : `entry_date: jourSemaine(debutSemaineIso(todayIso()), 0|1|2)` — ancre lundi ET foyer vivant (Pitfall 2 : ne jamais figer un lundi calendaire).

**Inventaire des usages à NE PAS toucher** (RESEARCH, périmètre S-01 lu en entier) : `minutesAgo` (l.77), `at`/`atInstant` (l.98-109), pantry `expires_on: day(±n)` (l.147-152), events `day(2)`/`day(4)` (l.324, 339), tasks/completions/expenses/pet-records (l.442-1022), année scolaire (l.880, 923-926). La classe corrigée = « données dont la visibilité dépend d'une grille semaine » uniquement ; les relatifs au jour restent, documentés comme tels dans les commentaires du fichier.

---

### Garde anti-récidive dans `seed.test.ts` (test de classe)

**Analog:** `app/src/lib/seed-instants.test.ts:1-45` — LE patron du contrôle de classe sur la graine, à copier pour la garde « aucun `day(n)` nu dans les données à structure de semaine » (ou « toutes les `entry_date` de `demoMealEntries` tombent dans la semaine lundi-based courante »). Points à reproduire :

- Boucle sur `seedRows()` / les exports du semis, collecte des contrevenants, message listant les occurrences.
- Garde §2.7 F : le contrôle doit prouver qu'il regarde quelque chose —
```typescript
expect(checked, 'aucun `created_at` trouvé — le contrôle ne regarde rien').toBeGreaterThan(0);
```
- Commentaire d'en-tête expliquant la classe (le défaut du dimanche, seed.ts:160-164) et la borne choisie (AGENTS §2.7 B) — calqué sur seed-instants.test.ts:4-18.

---

### `app/src/stores/household-store.test.ts` — durcissement WR-03 (test timing, W-01/W-02)

**Analog (attente d'état):** `app/src/components/ui/route-error.test.tsx:39` — seul usage `vi.waitFor` du dépôt :
```typescript
await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
```
(Autres occurrences : `app/src/app/route-preload.test.tsx:167,189`, même forme.)

**Code à remplacer** (household-store.test.ts:316-335, le sommeil fixe = course assumée) :
```typescript
client.setQueryData(['tasks', 'h-new', {}, null], [{ id: 't1', name: 'post-switch' }]);
await new Promise((resolve) => setTimeout(resolve, 1200));   // l.330 — À SUPPRIMER
await expect(get(cacheKey('u1', 'h-new'), probeStore)).resolves.toContain('post-switch');
```
→ forme cible : `await vi.waitFor(() => expect(get(cacheKey('u1', 'h-new'), probeStore)).resolves.toContain('post-switch'))` + mise à jour du commentaire l.326-328 (« Le throttle par défaut du persister est 1 s : la fenêtre couvre son échéance » — ce contrat de course disparaît avec le sommeil).

**Contexte du test à préserver** : `createStore('eo-offline-cache', 'query')` (l.320, sonde brute IndexedDB), `switchWithPurge('h-new', …, client, 'u1')` (l.324), throttle par défaut 1000 ms (`src/lib/offline/query-persistence.ts:71`) — correction test-only sauf si le protocole W-02 désigne le code de production.

---

### `app/src/modules/ardoise/api.ts` — suppression IN-01 (service, l.314-316)

**Analog:** lui-même + la forme cible de `37-REVIEW-FIX.md` l.48. Diff minimal, un seul argument change :
```typescript
// AVANT (garde morte — Response.status est typé number) :
throw new InviteRequestError(
  typeof response.status === 'number' ? response.status : 0,
  (detail as { error?: string | null }).error ?? 'Partage impossible.',
);
// APRÈS :
throw new InviteRequestError(response.status, (detail as { error?: string | null }).error ?? 'Partage impossible.');
```
Validation : `npx vitest run src/modules/ardoise/guest-ardoise-page.test.ts` (11 tests verts) + `grep -rn "typeof response.status" app/src` = 0.

---

### `supabase/functions/ardoise-invite/index.ts` — bornage IN-02 (Edge Function, I-01/I-02)

**Analog:** le même fichier, `buildGuestView` — la lecture `expenses` (l.648-653) est le patron du bornage correct déjà présent :
```typescript
admin
  .from('expenses')
  .select('id,title,amount,expense_date,paid_by,paid_by_guest')
  .eq('ardoise_id', ardoiseId)
  .order('expense_date', { ascending: false })
  .order('created_at', { ascending: false }),
```

**Lectures non bornées à corriger** (l.654-655, dans le même `Promise.all` l.647-657) :
```typescript
admin.from('expense_participants').select('expense_id,participant_type,member_id,guest_id,share_amount'),  // table ENTIÈRE
admin.from('household_members').select('id,display_name,role'),                                            // table ENTIÈRE
```

**Forme cible** (RESEARCH, forme (a) TypeScript-only — `expense_participants` n'a PAS de `household_id`, migrations/0004 l.32-47 ; réordonnancer : `expenses` d'abord, puis `.in`) :
```typescript
const { data: expenses } = await admin.from('expenses')…  // l.648-653 inchangée
const expenseIds = ((expenses ?? []) as { id: string }[]).map((e) => e.id);
const [{ data: parts }, { data: members }, { data: guests }] = await Promise.all([
  admin.from('expense_participants')
    .select('expense_id,participant_type,member_id,guest_id,share_amount')
    .in('expense_id', expenseIds),
  admin.from('household_members')
    .select('id,display_name,role')
    .eq('household_id', householdId)          // disponible l.645
    .order('id', { ascending: true }),        // ordre déterministe (I-02)
  admin.from('ardoise_guests').select('id,display_name').eq('ardoise_id', ardoiseId),
]);
```

**Balayage I-01 (classe entière dans la fonction)** : `grep admin\.from\(` sur le fichier ne rend que ces 3 lectures dans `buildGuestView` — la 3e (`ardoise_guests`, l.656) est déjà bornée. Le plan doit refaire le balayage sur le fichier entier (847 lignes, autres clients que `admin` inclus) pour confirmer A2. Le bornage passe par le besoin réel du consommateur (participants des dépenses de CETTE ardoise) — pas une limite arbitraire (I-02). Aucun SQL touché → `test-db.sh` non requis (I-03).

---

### `docs/RETROSPECTIVE.md` — campagne v1.3 (doc)

**Analog:** structure du fichier : une campagne = un titre de niveau 1 (# Première mise en œuvre l.1, # Seconde campagne l.411, # Troisième campagne l.507) avec sections numérotées en continu (§1-5, §6-7, …). La campagne v1.3 s'ajoute à la suite : titre `# <campagne v1.3 — filet de tests fiable>`, numérotation poursuivie, et le diagnostic W-02 des deux flakes (taux de reproduction, preuve d'innocence production, correction) y est consigné — c'est l'exigence W-02, même discipline que le flocon test D de la phase 37.

---

## Shared Patterns

### « Corriger le semis, pas l'horloge » (S-02, §2.7)
**Source:** RESEARCH Pitfall 1 + `datetime.test.ts:1-17` (TZ épinglé avec restauration) + `seed-instants.test.ts:4-18`
**Apply to:** tous les tests de la phase. La date est une entrée (`it.each` sur 7 ISO) ; jamais `vi.setSystemTime`, jamais de fixture de lundi calendaire figé (Pitfall 2 : ancre `debutSemaineIso(todayIso())`).

### Contrôle qui prouve qu'il regarde (§2.7 F)
**Source:** `app/src/lib/seed-instants.test.ts:37-39`
**Apply to:** garde de classe `seed.test.ts` et tout nouveau contrôle.
```typescript
expect(checked, 'aucun `created_at` trouvé — le contrôle ne regarde rien').toBeGreaterThan(0);
```

### Bornage des lectures service_role dans la requête (§2.6)
**Source:** `ardoise-invite/index.ts:648-656` — `.eq('ardoise_id', …)` / `.order(…)` déjà là, `.in('expense_id', ids)` / `.eq('household_id', …)` à ajouter. Jamais de filtrage JS après lecture complète.
**Apply to:** toute lecture `admin.` de l'Edge Function (balayage fichier entier).

### Attente d'état, jamais de sommeil (§2.7 F)
**Source:** `route-error.test.tsx:39` (`vi.waitFor`) vs `household-store.test.ts:330` (anti-pattern à éradiquer)
**Apply to:** WR-03 et tout test attendant une écriture async throttlée.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `app/e2e/critical-paths.spec.ts` | test e2e (rouge join-token) | request-response | Aucun changement attendu : cohabitation documentée J-01/J-02 (pas de skip, pas de renommage) ; le planner n'y écrit rien en 38 |

## Metadata

**Analog search scope:** `app/src/lib`, `app/src/stores`, `app/src/modules/menu`, `app/src/modules/ardoise`, `app/src/components/ui`, `supabase/functions/ardoise-invite`, `docs/`
**Files scanned:** ~12
**Pattern extraction date:** 2026-11-08
