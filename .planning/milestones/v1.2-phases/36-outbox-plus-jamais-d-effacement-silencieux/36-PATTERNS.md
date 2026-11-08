# Phase 36: Outbox — plus jamais d'effacement silencieux - Pattern Map

**Mapped:** 2026-11-07
**Files analyzed:** 9 (6 modifiés + 3 fichiers de test modifiés ; aucun fichier source créé — le catalogue peut être un module dédié à la discretion du planneur, voir §No Analog)
**Analogs found:** 9 / 9 — la phase est 100 % additive sur des fichiers existants qui SONT leurs propres analoges ; les conventions à copier sont extraites des mêmes fichiers.

## File Classification

| Fichier modifié | Rôle | Data Flow | Analoge (conventions à suivre) | Match Quality |
|---|---|---|---|---|
| `app/src/lib/offline/outbox.ts` | utility (classification + catalogue D-05) | transform (erreur → classification → libellé) | lui-même — `classifyFailure` (l.336-354), `isNetworkFailure` (l.301-326), `outboxEntryLabel` (l.255-279 : modèle du catalogue statique FR) | exact |
| `app/src/hooks/use-outbox-replay-badge.ts` | hook | event-driven (réaction au compteur dérivé) | lui-même — bloc badge l.39-51 à CONSERVER, bloc toast l.53-84 à RETIRER | exact (retrait ciblé) |
| `app/src/modules/parametres/components/offline-panel.tsx` | component | request-render (rendu dérivé de la query outbox) | lui-même — bloc l.271-274 à remplacer par `failureLabel` | exact |
| `app/src/lib/offline/outbox.test.ts` | test (unit) | — | lui-même — describe l.305-332 (conventions classification) | exact |
| `app/src/lib/offline/outbox-replay.test.ts` | test (intégration) | — | lui-même — `makeAdapterMock` l.36-77, describe l.218-302 | exact |
| `app/src/modules/parametres/components/offline-panel.test.tsx` | test (composant) | — | lui-même — describe l.220-325 | exact |
| `app/src/hooks/use-outbox-replay-badge.test.ts` | test (régression badge) | — | lui-même — describe toast l.143-187 à RETIRER, describes badge l.72-141 à CONSERVER | exact (retrait ciblé) |
| `app/src/lib/data/adapter.ts` | utility (types + messages) | — | référence en lecture seule : `DataError` l.119-127, `REMOVE_*_MISSING_MESSAGE` l.25-31 — AUCUNE modification prévue | reference-only |
| `app/src/lib/offline/outbox-replay.ts` | service (moteur de rejeu) | batch FIFO séquentiel | référence en lecture seule : NE PAS refondre (CONTEXT §domain). Seul point d'attachement confirmé : `markFailed` l.175-184 reçoit la classification | reference-only |

Vérification tracked-source : les 10 fichiers listés sont tous sous `git ls-files` (contrôle exécuté ce session). Aucun miroir gitignore.

## Pattern Assignments

### `app/src/lib/offline/outbox.ts` — catalogue code→famille→libellé (OBOX-02, D-01/D-04/D-06)

**Analoges internes :** `classifyFailure` (l.336-354) pour l'insertion, `outboxEntryLabel` (l.255-279) pour la FORME du catalogue statique, `isNetworkFailure` (l.301-326) pour le parcours de chaîne `cause`.

**Chaîne d'erreur déjà parcourue — le catalogue s'y greffe tel quel** (l.336-354) :
```typescript
export function classifyFailure(error: unknown): FailureClassification {
  const chain: unknown[] = [error];
  const cause = (error as { cause?: unknown } | null | undefined)?.cause;
  if (cause !== undefined && cause !== error) chain.push(cause);
  const message =
    chain.find(
      (candidate): candidate is { message: string } =>
        Boolean(candidate) && typeof candidate === 'object' && typeof (candidate as { message?: unknown }).message === 'string',
    )?.message ?? String(error);
  for (const candidate of chain) {
    const c = candidate as { code?: unknown; message?: unknown } | null | undefined;
    if (!c || typeof c !== 'object') continue;
    // Pitfall 4 : le CODE décide, jamais un fragment de message PostgREST.
    if (typeof c.code === 'string' && c.code.length > 0) return { kind: 'terminal', code: c.code, message };
    if (c.message === REMOVE_MISSING_MESSAGE) return { kind: 'terminal', code: 'REMOVE_MISSING', message };
    if (c.message === REMOVE_WHERE_MISSING_MESSAGE) return { kind: 'terminal', code: 'REMOVE_WHERE_MISSING', message };
  }
  return { kind: 'retryable' }; // réseau / 5xx : rejeté, reste en file (D-10)
}
```
→ `failureLabel` reproduit EXACTEMENT ce parcours `[error, cause]` pour trouver le `code` — même technique, pas de nouvelle mécanique.

**Modèle du catalogue statique typé** (`outboxEntryLabel`, l.255-279) :
```typescript
export function outboxEntryLabel(entry: OutboxEntry): string {
  const operations: Record<OutboxOperation, string> = {
    create: 'Ajout', update: 'Modification', remove: 'Suppression', removeWhere: 'Suppression multiple',
  };
  const tables: Partial<Record<string, string>> = { tasks: 'tâche', /* … */ };
  const table = tables[entry.table] ?? entry.table;
  return `${operations[entry.operation]} — ${table}`;
}
```
→ `FAILURE_FAMILIES` (constante exportée) + `failureLabel(failure)` (fonction pure) suivent cette discipline : données déclaratives + repli générique (`??` sur code inconnu = libellé générique D-06). Le libellé 404 est verrouillé mot pour mot : « cet élément a été supprimé entre-temps ».

**Forme PERSISTÉE à ne pas étendre** (`OutboxEntry.failure`, l.53) :
```typescript
failure?: { kind: 'terminal'; code: string; message: string };
```
→ Le libellé est DÉRIVÉ au rendu (D-13 : dérivé, jamais stocké — zéro migration des entrées IndexedDB anciennes, Pitfall 5 du 36-RESEARCH).

**Convention de commentaire :** chaque règle porte un commentaire français nommant SA raison (référence décision `D-xx`/Pitfall), jamais « dépendances omises » — style §2.7 visible sur tout le fichier.

---

### `app/src/modules/parametres/components/offline-panel.tsx` — rendu du libellé (OBOX-01)

**Analoges internes :** le bloc à remplacer lui-même (l.269-277) et `outboxEntryLabel` déjà importé (à étendre à `failureLabel`).

**Bloc actuel à remplacer** (l.271-274) :
```tsx
{entry.status === 'failed' && entry.failure ? (
  <span className="block text-[11px] font-semibold text-coral-text">
    Bloquée ({entry.failure.code}) — {entry.failure.message}
  </span>
) : (
  <span className="block text-[11px] text-muted">En attente du réseau</span>
)}
```
→ Remplacer `entry.failure.message` (jargon PostgREST brut) par `failureLabel(entry.failure)` ; conserver la structure `strong` (l.270 : `outboxEntryLabel(entry)`), les classes, la branche « En attente du réseau ». Le `failure.message` brut ne doit PLUS atteindre le DOM (V7 : dérivation du seul `code`).

**Imports du composant** (convention à suivre) :
```typescript
import { outboxEntryLabel } from '@/lib/offline/outbox';
```
→ ajouter `failureLabel` à cet import existant si le catalogue vit dans `outbox.ts`.

---

### `app/src/hooks/use-outbox-replay-badge.ts` — retrait du toast D-12 (D-02/D-03)

**Analoges internes :** le fichier lui-même. Bloc badge CONSERVÉ (l.39-51) :
```typescript
useEffect(() => {
  if (pendingCount + failedCount > 0) {
    useBannerStore.getState().push({
      kind: OUTBOX_BANNER_KIND,
      priority: 4,
      payload: { pending: pendingCount, failed: failedCount },
    });
  } else {
    useBannerStore.getState().dismiss(OUTBOX_BANNER_KIND);
  }
}, [pendingCount, failedCount]);
```

**Bloc toast RETIRÉ** (l.53-84, dans son intégralité) : `previousFailed` ref, `toastTimer` ref, second `useEffect`, et l'import `useToast` (l.4). Mettre à jour le doc-comment du hook (l.9-33) : retirer le point (c) et les références D-12. `OutboxBadgeWatcher` (l.91-94) et son montage unique dans `router.tsx` restent INTACTS (badge = unique signal actif, D-02).

**Invariant :** le hook reste monté une seule fois ; les tests badge restants doivent passer verts sans autre modification (Pitfall 6 du 36-RESEARCH).

---

### `app/src/lib/offline/outbox-replay.test.ts` — test d'intégration rouge→vert 404 (OBOX-01, D-07/D-09)

**Analoges internes :** `makeAdapterMock` (l.36-77) + describe « classification intégrée au rejeu » (l.218-302). Le NOUVEAU test copie le test 42501 (l.219-237) en changeant le code mocké.

**Mock d'erreur PostgREST** (l.222) :
```typescript
adapter.upsert.mockRejectedValue(new DataError('refus RLS', { code: '42501', status: 403 }));
```
→ pour le scénario 404 : `new DataError('JSON object requested, multiple (or no) rows returned', { code: 'PGRST116', status: 406 })` sur `adapter.update` (update rejoué sur une ligne supprimée). Le `PostgrestError` passe en `cause` de `DataError` — le classifieur le voit déjà.

**Squelette du test d'intégration** (conventions l.218-237 : setup scope, enqueue, passe, non-boucle) :
```typescript
it('scénario critère 1 : update rejoué sur une ligne supprimée serveur (PGRST116) → failed, libellé visible, jamais évaporée', async () => {
  const client = makeClient();
  const adapter = makeAdapterMock();
  adapter.update.mockRejectedValue(new DataError('…', { code: 'PGRST116', status: 406 }));
  enqueueEntry(client, { table: 'tasks', operation: 'update' }, { id: 't1', values: { name: 'x' }, client_key: 'ck-u' });
  await replayOutbox(client, SCOPE.userId, SCOPE.householdId, adapter);
  const entries = outboxEntries(client);
  expect(entries).toHaveLength(1);                       // jamais évaporée
  expect(entries[0].status).toBe('failed');
  expect(entries[0].failure?.code).toBe('PGRST116');
  expect(failureLabel(entries[0].failure!)).toBe('cet élément a été supprimé entre-temps'); // ← ROUGE aujourd'hui
  // non-boucle : secondes passes sans nouvel appel adaptateur (comme l.233-236)
});
```
**D-09 :** écrire CE test en premier, le voir échouer (sur le libellé, attendu — cf. Pitfall 4 du 36-RESEARCH), CONSIGNER la sortie du rouge avant tout correctif.

**Setup obligatoire** (l.88-98) : `setOutboxScopeProvider(() => SCOPE)` + stores session/foyer en `beforeEach` ; `afterEach` remet `onlineManager.setOnline(true)` et `setOutboxScopeProvider(null)`.

---

### `app/src/lib/offline/outbox.test.ts` — tests unitaires classification + matrice (OBOX-02, D-04/D-05/D-06)

**Analoges internes :** describe « classification d'enfilage (D-10, Pitfall 4) » (l.305-332). Conventions :
- construction d'erreur : `new DataError('refus RLS', { code: '42501', status: 403 })` (l.309, 319) — le mock PG porte `code` ET `status` ;
- assertion de forme exacte : `toEqual({ kind: 'terminal', code: '42501', message: 'refus RLS' })` (l.319-323) ;
- cas réseau : `new TypeError('fetch failed')` et `{ status: 503, message: '…' }` (l.329-330) ;
- REMOVE_* via `REMOVE_MISSING_MESSAGE` importé de `@/lib/data/adapter` (l.314-315, 324-328).

**Tests nouveaux** (dans le même describe ou un describe « catalogue de libellés (D-01/D-04) ») :
1. **Matrice itérative D-04** — le test importe `FAILURE_FAMILIES` (la constante, PAS une copie) et pour chaque famille × chaque code : `classifyFailure` → terminal + `failureLabel` → libellé de la famille ≠ libellé générique. `it.each(FAILURE_FAMILIES)`.
2. **Cas retryable de la matrice D-05** : `TypeError` (réseau), `{ status: 503 }` sans code (5xx), `new DOMException('aborted', 'AbortError')` (délai de lecture — tombe dans le repli réseau de `classifyFailure`, l.353 ; à prouver explicitement, Pitfall 3 du 36-RESEARCH).
3. **D-06 code imprévu** : `{ code: 'XX999' }` → terminal + `failureLabel` → libellé générique.
4. **Famille 404 du mapping (D-07 niveau unitaire)** : `failureLabel({ code: 'PGRST116', message: '…' })` → « cet élément a été supprimé entre-temps ».

---

### `app/src/modules/parametres/components/offline-panel.test.tsx` — rendu du libellé (OBOX-01, D-10)

**Analoges internes :** describe « écritures en attente » (l.220-325). Conventions :
- ensemencement direct de la file : `client.setQueryData(fichier(), [entree])` avec `fichier() = outboxKeyFor(USER, DEMO_HOUSEHOLD_ID)` (l.229, 247) ;
- entrée failed en dur (l.265) : `failure: { kind: 'terminal', code: '42501', message: 'refus RLS' }` ;
- session posée : `poserSession()` (l.223-227) puis `renderWithProviders(<OfflinePanel />, { queryClient: client })` ;
- assertion : `screen.getByText(/Bloquée \(42501\)/)` (l.274) → devenir `screen.getByText('cet élément a été supprimé entre-temps')` (et vérifier la COHÉRENCE badge : le badge compte, ne libellise pas — rien à changer côté badge) ;
- règle T-34-08 à maintenir : `document.body.textContent` ne contient AUCUNE valeur de ligne (l.277-278) — étendre si besoin au `failure.message` brut : le jargon PostgREST ne doit plus apparaître dans le DOM.

**Test entrée « ancienne forme » (Pitfall 5)** : même setup avec une entrée dont `failure.message` est le texte PostgREST anglais — le libellé dérivé reste correct (preuve zéro-migration).

---

### `app/src/hooks/use-outbox-replay-badge.test.ts` — régression retrait D-12 (D-03)

**Analoges internes :** le fichier lui-même. Retirer (l.143-187) : le describe complet « toast d'échec terminal (D-12) » (3 tests), l'import `ToastProvider` (l.6) et les helpers `toastTexts`/`toastRegion` s'ils ne servent qu'au toast (définis dans la section l.60-99, à vérifier), plus le wrapping `ToastProvider` de l'App de test (l.54-60+) si plus aucun toast n'est émis. CONSERVER intacts : `entry()` (l.33-42, qui fabrique aussi des entrées `failed` — sert au badge), `seed()` (l.44-52, avec son advanceTimersByTime(0)), les describes badge (l.72-141), le mock `react-router` (l.25-27). Le commentaire d'entête (l.14-19) perd sa mention du toast.

## Shared Patterns

### Dérivation pure au rendu, jamais stockée (D-13)
**Source :** `outbox.ts:255-279` (`outboxEntryLabel`) + `outbox-replay.ts:29` (« compteurs dérivés, jamais stockés »)
**Appliquer à :** `failureLabel` — fonction pure exportée de `outbox.ts`, consommée par le panneau ET les tests. Aucun champ `label` dans `OutboxEntry.failure` (l.53 intouché).

### Le CODE décide, jamais le message (Pitfall 4)
**Source :** `outbox.ts:348-349`
**Appliquer à :** `failureLabel` — matching sur `failure.code` exact (PGRST116 en entier, jamais un préfixe tronqué qui attraperait les PGRST10x = 400 ; les familles portent leurs propres codes listés explicitement).

### Parcours de chaîne `[error, cause]`
**Source :** `outbox.ts:305-308` (`isNetworkFailure`) et `337-339` (`classifyFailure`)
**Appliquer à :** tout nouveau code qui lit un `code` PG — la cause supabase-js vit TOUJOURS dans `DataError.cause` (`supabase-adapter.ts:193-194` : `DataError(error.message, error)`), jamais sur l'Error de surface.

### Libellés français + repli générique, zéro jargon au DOM (V7, T-34-08)
**Source :** `outbox.ts:255-279` (repli `?? entry.table`), `offline-panel.tsx:271-274` (bloc à corriger)
**Appliquer à :** code inconnu → libellé générique français (D-06) ; le `failure.message` brut ne quitte plus la file vers l'écran.

### Tests : fichier existant, double injecté, rouge documenté
**Source :** `outbox-replay.test.ts:36-77, 219-237` ; §2.7 B
**Appliquer à :** tout test de la phase — adaptateur mocké (jamais de réseau réel), erreurs `DataError(msg, { code, status })`, et le test d'intégration 404 vu ROUGE avant le correctif avec sortie consignée.

### Retrait chirurgical, invariant prouvé par les tests restants
**Source :** `use-outbox-replay-badge.ts:39-51` (badge conservé) vs `53-84` (toast retiré) ; `use-outbox-replay-badge.test.ts:72-141` (badge) vs `143-187` (toast)
**Appliquer à :** le retrait D-12 — les describes badge qui restent DOIVENT passer verts sans autre modification ; c'est la preuve que le retrait n'a rien cassé (Pitfall 6).

## No Analog Found

| Fichier potentiel | Rôle | Data Flow | Raison |
|---|---|---|---|
| (éventuel) module dédié du catalogue, ex. `app/src/lib/offline/failure-labels.ts` | utility | transform | AUCUN module de catalogue de libellés n'existe encore dans le dépôt. Si le planneur tranche pour un module dédié (discretion CONTEXT), l'analogue de FORME reste `outboxEntryLabel` (`outbox.ts:255-279`) et la décision de placement suit la règle de `abandonOutboxEntry` (`outbox.ts:229-238`) : `outbox.ts` reste sans dépendance vers l'adaptateur ; un module dédié serait importé par `outbox.ts` (ou par le panneau seul) sans créer de cycle avec `outbox-replay.ts` (qui importe déjà `./outbox`, `outbox-replay.ts:4`). |

## Metadata

**Analog search scope:** `app/src/lib/offline/`, `app/src/hooks/`, `app/src/modules/parametres/components/`, `app/src/lib/data/`
**Files scanned:** 10 lus (dont sections ciblées des 4 fichiers de test) + 1 grep de confirmation (`\.failure` sur `app/src/` — 15 occurrences, la seule surface UI qui lit `entry.failure` est `offline-panel.tsx:271-274`, confirmant l'hypothèse A4 du 36-RESEARCH)
**Pattern extraction date:** 2026-11-07
