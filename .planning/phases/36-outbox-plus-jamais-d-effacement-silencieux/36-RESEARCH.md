# Phase 36: Outbox — plus jamais d'effacement silencieux - Research

**Researched:** 2026-11-07
**Domain:** File d'écriture hors-ligne (outbox TanStack Query) — classification d'échecs, libellés français, audit par tests, retrait du toast D-12
**Confidence:** HIGH (domaine 100 % interne au dépôt, code lu intégralement ce session)

## Summary

La mécanique outbox v1.1 est complète et non refondue : enfilage par `MutationCache.onError` (D-02), moteur de rejeu FIFO `replayOutbox` avec upsert idempotent (D-14), classification `classifyFailure` (D-10), entrée failed jamais rejouée automatiquement, badge « N en attente / N bloquées » (D-11/D-13) et panneau Paramètres avec Réessayer/Abandonner. La phase 36 ne touche PAS à cette mécanique ; elle ajoute trois choses : un catalogue code→famille→libellé français rendu dans le panneau, la removal propre du toast D-12 (une fois par passe), et une matrice de tests exhaustive qui EST l'audit OBOX-02 (D-04).

Lecture du code ce session — points clés vérifiés :

1. `classifyFailure` (outbox.ts:336-354) applique déjà « tout code présent → terminal », `REMOVE_*_MISSING` → terminal, tout le reste → retryable. La matrice du critère 2 (404/PGRST116, 400, 403/42501, 23514, 23503, 23505 → terminal ; TypeError, 5xx, AbortError → retryable) correspond au comportement actuel — la phase la CODIFIE en tests, elle ne la réinvente pas.
2. Le libellé affiché par le panneau (offline-panel.tsx:271-274) est aujourd'hui `Bloquée ({entry.failure.code}) — {entry.failure.message}` où `message` est le message brut PostgREST anglais (ex. « JSON object requested, multiple (or no) rows returned » pour PGRST116). C'est le « sans message clair » de la dette v1.1. Le champ `failure` persisté reste tel quel : le libellé français se DÉRIVANT au rendu (fonction pure), aucune migration de données persistées n'est nécessaire — même esprit que les compteurs dérivés (D-13).
3. Le toast D-12 vit dans `use-outbox-replay-badge.ts` (bloc 53-84 : ref `previousFailed`, timer antirebond 400 ms, émission « N écritures n'ont pas pu être appliquées ») et son describe de test dans `use-outbox-replay-badge.test.ts` (l.143-186). Le badge lui-même (bloc 39-51, push banner-store priorité 4) reste intact.
4. La chaîne `DataError(message, cause)` (adapter.ts:119-127) transporte le `PostgrestError` de supabase-js 2.117.2 en `cause` ; `PostgrestError.code` est présent sur les refus PG. `classifyFailure` parcourt déjà la chaîne `[error, cause]` — le catalogue s'y greffe sans toucher l'adaptateur.

**Nuance importante sur la dette « évaporée »** (voir Open Questions Q1) : la lecture statique ne trouve aucun chemin où une entrée rejetée PGRST116 est *retirée* de la file — elle passe à `failed` avec un message de jargon anglais. Le test rouge d'intégration (D-09) est précisément l'instrument qui tranchera ce que fait le code actuel sur le scénario exact du critère 1 ; le plan doit l'écrire EN PREMIER et consigner le comportement observé avant de corriger.

**Primary recommendation:** Codifier la matrice comme données exportées de `outbox.ts` (familles + libellés) consommées à la fois par `classifyFailure`/le panneau et par les tests itératifs (l'audit vit dans le code, D-04), dériver le libellé au rendu (zéro migration), retirer le toast D-12 avec ses tests, et ouvrir la phase par le test rouge d'intégration `replayOutbox` sur le scénario 404 (D-09).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Messages utilisateur**
- D-01 : libellé français court **par famille de code** : 404/PGRST116 → « cet élément a été supprimé entre-temps » ; 42501/403 → droits insuffisants ; 23514 → données invalides ; etc. Un code inconnu tombe sur un libellé générique — jamais de trou ni de jargon technique exposé à l'utilisateur.
- D-02 : le message apparaît **badge + panneau uniquement, pas de toast**.
- D-03 : **le toast d'échec terminal D-12 (« une fois par passe ») est retiré.**

**Forme de l'audit (OBOX-02)**
- D-04 : **le test est la source de vérité de l'audit** — chaque code de la matrice testé 2× (classification terminal/retryable ET libellé non vide/non générique).
- D-05 : matrice exhaust = 404/PGRST116, 400 (malformed), 403/42501 (RLS), 23514 (check), 23503 (FK), 23505 (unique), réseau (TypeError), 5xx, délai de lecture (AbortError).
- D-06 : **comportement par défaut : terminal** pour tout code imprévu — libellé générique. Aucun code ne peut évaporer une entrée ni boucler par défaut.

**Test rouge→vert du 404**
- D-07 : deux niveaux — intégration sur `replayOutbox` (adaptateur mocké, PGRST116 ; entrée classée failed + message visible + jamais évaporée) **plus** test unitaire sur la famille 404 du mapping.
- D-08 : tests dans les fichiers existants : `outbox-replay.test.ts`, `outbox.test.ts`, `offline-panel.test.tsx`.
- D-09 : **le rouge est démontré avant le vert** (§2.7 B).
- D-10 : le rendu du libellé côté UI est testé (offline-panel : entrée failed 404 → libellé « supprimé entre-temps », badge cohérent).

### the agent's Discretion
- Emplacement exact du catalogue code→famille→libellé (extension de `classifyFailure` dans `outbox.ts` vs module dédié).
- Libellés français exacts au-delà du 404 — à proposer dans le plan, ajustable à l'UAT.
- Comment retirer proprement le toast D-12 (tests et code concernés) sans toucher au reste du panneau.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OBOX-01 | Écriture rejouée vers une ligne supprimée serveur (404) classée terminale avec message visible « cet élément a été supprimé entre-temps » — jamais évaporée en silence | `classifyFailure` rend déjà terminal sur tout code (outbox.ts:349) ; le panneau rend `failure.code/message` bruts (offline-panel.tsx:271-274) → ajouter le catalogue de libellés dérivé au rendu + test rouge→vert d'intégration (D-07/D-09) |
| OBOX-02 | Audit exhaustif des codes de rejeu — tout échec classifié et surfaced, aucun code ne provoque d'évaporation | Matrice D-05 codifiée en données exportées + tests itératifs 2× par code (D-04) ; chaîne `DataError.cause` déjà parcourue par le classifieur |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Classification terminal/retryable | Client (lib/offline) | — | Décision locale de rejeu, hors serveur ; le CODE PG décide (Pitfall 4) |
| Catalogue code→famille→libellé | Client (lib/offline) | — | Fonction pure sur `failure.code`, dérivée au rendu (compteurs D-13 : jamais stockée) |
| Affichage badge « N bloquées » | Client (hooks/banner-store) | — | Déjà câblé via `useOutbox` ; aucun changement de comptage |
| Affichage panneau (libellé, Réessayer, Abandonner) | Client (modules/parametres) | — | `offline-panel.tsx` déjà câblé ; seul le rendu du libellé change |
| Retrait du toast D-12 | Client (hooks) | — | `use-outbox-replay-badge.ts` bloc toast, et lui seul |
| Persistance de la classification | Client (query-persistence, IndexedDB) | — | `failure` déjà sérialisé dans l'entry ; aucun changement de forme si le libellé est dérivé |

Aucune responsabilité serveur : zéro migration SQL, zéro Edge Function, zéro changement RLS. Phase 100 % client + tests.

## Standard Stack

Aucun nouveau package. Stack existante utilisée :

| Outil | Version | Rôle dans la phase | Provenance |
|-------|---------|--------------------|------------|
| @supabase/supabase-js | 2.117.2 | Source des `PostgrestError` (champ `code`) | [VERIFIED: app/node_modules/@supabase/supabase-js/package.json, lu ce session] |
| @tanstack/react-query v5 | (épinglé lockfile) | File outbox = query, `setQueryData` | [VERIFIED: app/src/lib/offline/outbox.ts:1-21] |
| vitest + @testing-library | (épinglé lockfile) | Tests unitaire/intégration/composant, fichiers existants (D-08) | [VERIFIED: outbox.test.ts, offline-panel.test.tsx lus ce session] |

**Installation:** rien à installer.

## Package Legitimacy Audit

Non applicable — **aucun package externe n'est installé par cette phase** (zéro dépendance nouvelle, code + tests uniquement).

## Architecture Patterns

### System Architecture Diagram

```
Échec de rejeu (dans replayOutbox, outbox-replay.ts:74-95)
        │  adapter.upsert/update/remove/removeWhere lève
        ▼
DataError(message, cause=PostgrestError{code})      [adapter.ts:119-127, 193-216, 254-255]
        │
        ▼
classifyFailure(error)  ──chaîne [error, cause]──►  { kind:'terminal', code, message }   (outbox.ts:336-354)
        │                                                   │
        │ retryable → entrée reste 'pending', passe stoppée │ terminal → markFailed
        ▼                                                   ▼
                                   entry.failure = { kind:'terminal', code, message }  persistée (D-01)
                                                           │
                                    ┌──────────────────────┼──────────────────────────┐
                                    ▼                      ▼                          ▼
                     failureLabel(failure) [NOUVEAU,       badge banner-slot          toast D-12
                     fonction pure, dérivé au rendu)  →   « N bloquées » (inchangé)  (RETIRÉ, D-03)
                     → offline-panel.tsx:271-274
```

### Pattern 1: Catalogue comme données partagées code↔tests (D-04)

**What:** la matrice D-05 est exportée de `outbox.ts` comme une constante typée ; `failureLabel` la consomme au rendu et les tests l'itèrent — l'audit ne peut pas diverger de l'implémentation.

**When to use:** dès qu'un mapping doit être audité exhaustivement (le test itère la constante, pas une copie).

**Example:**

```typescript
// Source: app/src/lib/offline/outbox.ts (extension près de classifyFailure, l.328-354)
// Familles D-05 — chaque entrée : codes (exact ou préfixe PG), libellé français.
export const FAILURE_FAMILIES: ReadonlyArray<{ codes: readonly string[]; label: string }> = [
  { codes: ['PGRST116', '404'], label: 'cet élément a été supprimé entre-temps' }, // verrouillé mot pour mot
  { codes: ['42501', '403'],   label: 'droits insuffisants pour cette action' },
  { codes: ['23514'],          label: 'données invalides' },
  { codes: ['23503'],          label: 'référence à un élément inexistant' },
  { codes: ['23505'],          label: 'cet élément existe déjà' },
  { codes: ['PGRST10'],        label: 'requête malformée' }, // famille 400 (PGRST10x)
];

export function failureLabel(failure: { code: string; message: string }): string {
  for (const family of FAILURE_FAMILIES) {
    if (family.codes.some((c) => failure.code === c || failure.code.startsWith(c.replace(/\d+$/, '')))) {
      return family.label;
    }
  }
  return 'cette écriture a été refusée par le serveur'; // D-06 : générique, jamais de jargon
}
```

> ⚠️ Le squelette ci-dessus illustre la FORME. Le matching exact (codes exacts vs préfixes PGRST10x/22P02) et les libellés finaux sont à trancher au plan (discretion CONTEXT). « 400 (malformed) » arrive côté client comme un `PostgrestError.code` de type `22P02` (cast invalide) ou `PGRST10x` — vérifier auquel le test mocké se rattache ; les deux sont terminaux par la règle « tout code → terminal » actuelle.

### Pattern 2: Libellé dérivé au rendu, jamais persisté

**What:** `entry.failure` garde sa forme actuelle `{ kind:'terminal', code, message }` (outbox.ts:53) ; le libellé français est calculé par `failureLabel` au rendu du panneau.

**Why:** les entrées sont PERSISTÉES (IndexedDB via query-persistence, D-01). Ajouter un champ `label` à la création obligerait à gérer les entrées anciennes déjà persistées (migration de données client). Dériver au rendu = même discipline que les compteurs D-13 (« dérivés, jamais stockés ») et zéro migration.

### Pattern 3: Retrait propre du toast D-12

**What:** supprimer dans `use-outbox-replay-badge.ts` : les imports `useToast`, le ref `previousFailed`, le ref `toastTimer`, et le second `useEffect` (l.53-84). Conserver intact le premier `useEffect` (badge, l.39-51) et `OutboxBadgeWatcher` (montage unique router.tsx). Côté tests (`use-outbox-replay-badge.test.ts`) : retirer le describe « toast d'échec terminal (D-12) » (l.143-186) et l'import `ToastProvider` s'il ne sert plus ; le `toastRegion`/`toastTexts` helpers ne servaient qu'au toast.

**Invariant à garder:** les tests restants du fichier prouvent le badge — le hook doit toujours être monté une seule fois (router.tsx, à côté d'`OutboxReplayWatcher`).

### Anti-Patterns to Avoid

- **Persister le libellé dans `entry.failure`** : migration des entrées déjà en IndexedDB, divergence label/classification. Dériver au rendu.
- **Classer par fragment de message PostgREST** : Pitfall 4 verrouillé (v1.1) — le CODE décide, jamais `message.includes(...)`.
- **Modifier `replayOutbox`/`replayEntry`** : la mécanique n'est pas refondue (CONTEXT §domain). Seuls `classifyFailure` (éventuellement), le catalogue et l'UI changent.
- **Écrire l'audit comme un doc séparé** : D-04 l'interdit — le test EST l'audit.
- **Retirer le badge en même temps que le toast** : D-02 garde le badge comme unique signal actif.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Classification terminal/retryable | Nouveau classifieur | `classifyFailure` existant (outbox.ts:336) | Chaîne `cause` déjà parcourue, Pitfall 4 posé, 36+17 tests verts derrière |
| Confirmation d'abandon | Modale maison | `ConfirmDialog` déjà câblé (offline-panel.tsx:377-386) | Exigence §6 : toute suppression destructive confirmée |
| Comptage badge | État parallèle | `useOutbox` dérivé (use-outbox.ts:48-50) | D-13 : compteurs dérivés, jamais stockés |
| Mock d'erreurs PostgREST | Réseau réel | Adaptateur mocké comme dans `outbox-replay.test.ts:100+` | Conventions D-08, reproductible, rapide |
| Idempotence du rejeu | Retester l'upsert | Migration 0177 + D-14 existants | Hors périmètre, déjà prouvé (tests SQL 104/104) |

**Key insight:** la phase est presque entièrement additive autour d'un moteur qui fonctionne — la discipline est de NE PAS le retoucher.

## Common Pitfalls

### Pitfall 1: PGRST116 — sous-chaîne « PGRST1 » vs code exact
**What goes wrong:** un matching par préfixe trop large (ex. `startsWith('PGRST116'.slice(0,6))`) attraperait des codes voisins.
**Why:** les familles PGRST sont nombreuses (PGRST100-series = 400).
**How to avoid:** matching exact sur `PGRST116` ; la famille « 400/malformed » porte SES codes propres (22P02, PGRST10x) listés explicitement.
**Warning signs:** un test de la matrice qui échoue sur un code de la mauvaise famille.

### Pitfall 2: codes PG de classe connexion/serialization classés terminaux
**What goes wrong:** la règle actuelle « tout code → terminal » classe aussi `40001` (serialization_failure), `40P01` (deadlock), `08003/08006/53300` (connexion) comme terminaux — alors qu'ils sont de nature retryable.
**Why:** `classifyFailure` actuel : `code` présent → terminal, sans nuance de classe (outbox.ts:349).
**How to avoid:** D-06 rend le défaut terminal acceptable (l'utilisateur garde Réessayer) ; MAIS le plan peut, dans la discretion du catalogue, ajouter ces codes comme famille retryable explicite. À trancher au plan — ni la matrice D-05 ni D-06 ne l'exigent.
**Warning signs:** un utilisateur voit « bloquée » pour une panne transitoire de base.

### Pitfall 3: AbortError n'est ni un TypeError ni codé
**What goes wrong:** un timeout de lecture lève un `DOMException`/`AbortError` sans `code` — mal traité, il tomberait hors matrice.
**How to avoid:** vérifié ce session : sans `code` ni `REMOVE_*`, il tombe dans le repli réseau de `classifyFailure` (retryable, outbox.ts:353) et d'`isNetworkFailure` (true). Le test de la matrice doit le prouver explicitement (D-05).

### Pitfall 4: le rouge D-09 doit viser le bon comportement
**What goes wrong:** écrire un test rouge qui échoue pour la mauvaise raison (ex. échoue sur le libellé alors qu'on prétendait prouver l'évaporation).
**Why:** la lecture statique suggère que l'entrée PGRST116 passe DÉJÀ à `failed` (jamais évaporée) avec un message de jargon — la dette v1.1 (« entrée évaporée ») n'est pas reproductible statiquement.
**How to avoid:** écrire le test d'intégration D-07, le faire tourner, CONSIGNER le comportement observé dans le plan avant d'écrire le correctif ; si l'évaporation existe, elle est ailleurs (voir Q1) et le scénario complet du critère 1 doit la reproduire de bout en bout (enfilage hors-ligne → reconnexion → passe).
**Warning signs:** le test rouge échoue sur un `expect` de libellé alors que le statut était déjà correct — c'est un rouge de libellé, légitime, mais le nommer honnêtement.

### Pitfall 5: entrées failed persistées avant la phase
**What goes wrong:** des entrées `failure` d'avant la phase existent dans l'IndexedDB des utilisateurs — avec `message` anglais brut.
**How to avoid:** le rendu par `failureLabel(code)` fonctionne pour toute entrée ancienne sans migration — c'est la raison du Pattern 2. Un test composant avec une entrée « ancienne forme » le prouve.

### Pitfall 6: retirer le toast sans casser le badge ni la gate
**What goes wrong:** suppression trop large dans `use-outbox-replay-badge.ts` (le hook sert AUSSI au badge) ou retrait du `OutboxBadgeWatcher` du router.
**How to avoid:** Pattern 3 — ne retirer que le bloc toast ; les tests badge restants doivent rester verts sans autre modification.

## Code Examples

### Emplacements exacts à toucher [VERIFIED: lecture ce session]

| Fichier | Lignes | Ce qui s'y passe |
|---------|--------|------------------|
| `app/src/lib/offline/outbox.ts` | 53 | `failure?: { kind:'terminal'; code: string; message: string }` — forme PERSISTÉE, ne pas étendre |
| `app/src/lib/offline/outbox.ts` | 328-354 | `FailureClassification` + `classifyFailure` — greffon du catalogue |
| `app/src/lib/offline/outbox-replay.ts` | 74-95 | boucle de rejeu : `classifyFailure` → `markFailed` — NE PAS refondre |
| `app/src/lib/offline/outbox-replay.ts` | 175-184 | `markFailed` attache `{kind, code, message}` — point d'attachement actuel |
| `app/src/lib/data/adapter.ts` | 25-31, 119-127 | `REMOVE_MISSING_MESSAGE` / `REMOVE_WHERE_MISSING_MESSAGE` (libellés français déjà posés), `DataError(message, cause)` |
| `app/src/lib/data/supabase-adapter.ts` | 193-194, 211-216, 254-255, 272-275, 296-299 | chaque méthode jette `DataError(error.message, error)` — le `PostgrestError.code` arrive en `cause` |
| `app/src/hooks/use-outbox-replay-badge.ts` | 53-84 | toast D-12 — À RETIRER (D-03) |
| `app/src/hooks/use-outbox-replay-badge.ts` | 39-51, 91-94 | badge + `OutboxBadgeWatcher` — CONSERVER |
| `app/src/modules/parametres/components/offline-panel.tsx` | 271-274 | `Bloquée ({entry.failure.code}) — {entry.failure.message}` — à remplacer par `failureLabel` |
| `app/src/lib/offline/outbox.test.ts` | 305-332 | describe « classification d'enfilage (D-10, Pitfall 4) » — conventions des tests de classification |
| `app/src/lib/offline/outbox-replay.test.ts` | 218-302 | describe « classification intégrée au rejeu » — mock adaptateur, non-boucle, 42501/REMOVE_* déjà prouvés |
| `app/src/modules/parametres/components/offline-panel.test.tsx` | 220-334 | describe « écritures en attente » — conventions rendu panneau |
| `app/src/hooks/use-outbox-replay-badge.test.ts` | 143-186 | describe toast D-12 — À RETIRER avec D-03 |

### Forme du test d'intégration rouge→vert (D-07/D-09)

```typescript
// Source: conventions de app/src/lib/offline/outbox-replay.test.ts (mock adaptateur, l.100+)
it('scénario critère 1 : update rejoué sur une ligne supprimée serveur (PGRST116) → failed, libellé visible, jamais évaporée', async () => {
  // 1. enfile une update hors-ligne (mock adaptateur TypeError → enfilage)
  // 2. rejoue avec l'adaptateur mocké levant { code: 'PGRST116', message: 'JSON object requested…' }
  // 3. l'entrée est TOUJOURS dans la file, status 'failed'
  // 4. failure.code === 'PGRST116'
  // 5. le libellé DÉRIVÉ est 'cet élément a été supprimé entre-temps' (rouge aujourd'hui)
  // 6. une seconde passe ne la rejoue pas (non-boucle)
});
```

### Forme du test d'audit matriciel (D-04)

```typescript
// Source: matrice D-05 du CONTEXT — le test itère la constante exportée, pas une copie
it.each(FAILURE_FAMILIES)('famille $codes : classification terminal ET libellé non générique', (family) => {
  for (const code of family.codes) {
    const classification = classifyFailure(new DataError('x', { code, message: 'raw postgrest' }));
    expect(classification.kind).toBe('terminal');
    expect(classification.code).toBe(code);
    expect(failureLabel({ code, message: 'x' })).toBe(family.label);
    expect(family.label).not.toContain('serveur'); // non générique (D-04 : 2e assertion)
  }
});
// + cas retryable : TypeError, { status: 503 } sans code, DOMException AbortError
// + D-06 : code imprévu 'XX999' → terminal + libellé générique
```

## Runtime State Inventory

Non applicable (pas de rename/migration). Point d'état persisté pertinent : les entrées outbox déjà persistées dans l'IndexedDB des clients portent la forme `failure` actuelle — couvert par Pitfall 5 (dérivation au rendu, zéro migration).

## State of the Art

Sans objet (stack interne, aucun changement d'écosystème). Rappel verrouillé : `dnd-kit` umbrella déprécié etc. ne concerne pas cette phase ; aucune nouvelle dépendance.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Le PostgrestError de supabase-js 2.117.2 porte bien `code: 'PGRST116'` sur un update `.single()` à 0 ligne ; sinon l'erreur tomberait retryable (boucle) | Summary, Q1 | Le test rouge tranchera ; si le code est absent, le correctif passe par l'ajout d'un test sur `status: 404` dans le classifieur |
| A2 | « 400 (malformed) » se présente côté client avec un code PG (`22P02` ou `PGRST10x`), pas un HTTP 400 nu | Pattern 1, Pitfall 1 | Le mock du test de matrice fixe le code réel ; si 400 arrive sans code, il tombe retryable (réseau) — à consigner au plan |
| A3 | La dette v1.1 « entrée évaporée » est en réalité un problème de message (jargon anglais) et non de perte d'entrée | Summary, Q1, Pitfall 4 | Si une vraie évaporation existe (autre chemin), le test rouge du scénario complet la révélera avant tout correctif |
| A4 | Aucune autre surface n'affiche `entry.failure` que le panneau offline (badge ne montre que des comptes) | Architecture | Grep `failure` dans les composants au moment du plan pour confirmer |

## Open Questions (RESOLVED — see 36-01-PLAN.md)

1. **Où est l'« évaporation silencieuse » exacte du scénario d'origine ?** — RESOLVED par mécanisme (D-09) : le plan ouvre par le test d'intégration D-07 (rouge documenté, 36-01 Tâche 1), consigne le comportement observé dans le SUMMARY de 36-01, puis corrige ce que le rouge révèle. La lecture statique (PATTERNS.md) indique un problème de libellé (`offline-panel.tsx:271-274`), pas une vraie perte d'entrée.
2. **Codes PG retryable de nature (40001, 40P01, 08xxx, 53300) ?** — RESOLVED : tranchés vers le défaut **terminal** de D-06 (libellé générique + Réessayer manuel), aucune famille retryable nouvelle. Décision consignée dans le frontmatter de 36-01-PLAN.md et testée explicitement en 36-01 Tâche 2.

## Environment Availability

Skip — phase purement code/config/tests, aucune dépendance externe nouvelle. La chaîne de vérification §2.7 s'exécute sur la machine de développement habituelle (Docker requis uniquement pour `test-db.sh`, non déclenché : zéro SQL dans cette phase).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest + @testing-library (React), épinglés lockfile |
| Config file | existant (`app/`, conventions des fichiers D-08) |
| Quick run command | `cd app && npm test -- outbox` (fichiers outbox*) |
| Full suite command | `cd app && npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OBOX-01 | scénario 404 complet : failed + libellé + non-boucle | intégration | `cd app && npm test -- outbox-replay` | ❌ Wave 0 (D-07/D-09, rouge documenté) |
| OBOX-01 | famille 404 du mapping | unit | `cd app && npm test -- outbox.test` | ❌ Wave 0 (fichier existe, tests nouveaux) |
| OBOX-02 | matrice D-05 : classification + libellé, 2× par code, défaut terminal (D-06) | unit | `cd app && npm test -- outbox.test` | ❌ Wave 0 |
| OBOX-01 | rendu panneau : libellé 404 + badge cohérent, entrée ancienne forme | composant | `cd app && npm test -- offline-panel` | ❌ Wave 0 (fichier existe) |
| OBOX-01/D-03 | toast D-12 retiré, badge intact | régression | `cd app && npm test -- use-outbox-replay-badge` | ✅ (describe toast à retirer) |
| — | chaîne §2.7 complète | chaîne | `cd app && npm run typecheck && npm test && npm run build && npm run test:e2e` | ✅ |

### Sampling Rate
- **Per task commit:** quick run (fichiers outbox*) + typecheck
- **Per wave merge:** suite complète + build
- **Phase gate:** chaîne §2.7 verte (`test-db.sh` non requis — zéro SQL)

### Wave 0 Gaps
- Aucun fichier de test nouveau à créer (D-08 : fichiers existants) — les gaps sont des tests à AJOUTER dans `outbox-replay.test.ts`, `outbox.test.ts`, `offline-panel.test.tsx`, listés ci-dessus.
- Le test d'intégration rouge (D-09) DOIT être écrit et vu rouge AVANT tout correctif — preuve consignée (sortie du test) dans le plan/commit.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | indirect | inchangé — la RLS reste la frontière finale (§2.6) ; 42501/403 sont classés terminaux et affichés, jamais rejetés en boucle |
| V5 Input Validation | no | aucun nouveau payload ; le rejeu passe toujours par le contrat `DataAdapter` typé (T-34-06) |
| V7 Errors & Logging | yes | le libellé français n'expose JAMAIS le message serveur brut ni les `values`/`filter` (T-34-08 : aucune valeur de ligne vers l'écran) — conserver cette règle dans `failureLabel` (dérivée du seul `code`) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Fuite du détail serveur (message PostgREST brut) à l'écran | Information Disclosure | libellé dérivé du `code` seul ; le `failure.message` brut ne doit plus atteindre le DOM |
| Rejet rejoué en boucle (DoS local réseau) | DoS | classification terminale par défaut (D-06) — déjà structurel via `status:'failed'` non relu |

Aucune nouvelle surface d'authentification, session, crypto.

## Sources

### Primary (HIGH confidence)
- Lecture directe ce session : `app/src/lib/offline/outbox.ts` (intégralité, 354 l.), `outbox-replay.ts` (184 l.), `use-outbox-replay-badge.ts` (94 l.), `offline-panel.tsx` (389 l.), `use-outbox.ts`, extraits `adapter.ts` / `supabase-adapter.ts`
- `.planning/phases/36-.../36-CONTEXT.md` (décisions D-01..D-10, verbatim)
- `.planning/REQUIREMENTS.md` OBOX-01/02 ; `.planning/ROADMAP.md` §Phase 36 ; `.planning/MILESTONES.md` §v1.1 (dette outbox silencieuse, l.21)
- Tests existants : `outbox.test.ts`, `outbox-replay.test.ts`, `offline-panel.test.tsx`, `use-outbox-replay-badge.test.ts` (index des describes)
- `app/node_modules/@supabase/supabase-js/package.json` (2.117.2)

### Secondary (MEDIUM confidence)
- Connaissance de PostgREST (PGRST116 = 0/n rows sur `.single()` ; familles PGRST/22P02) — [ASSUMED], à confirmer par les mocks de tests

### Tertiary (LOW confidence)
- — (aucune source web utilisée ; domaine interne)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zéro dépendance nouvelle, tout le code lu
- Architecture: HIGH — greffons identifiés ligne par ligne
- Pitfalls: HIGH sur les pièges de code ; MEDIUM sur A1/A2/A3 (comportement PostgREST réel au rejeu, tranché par le test rouge D-09)

**Research date:** 2026-11-07
**Valid until:** stable (code interne) — re-vérifier si la stack outbox bouge avant exécution
