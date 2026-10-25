---
phase: 20-hygiene-du-depot-les-14-constats-in-de-la-revue
plan: 07
subsystem: plateforme
tags: [service-worker, push, pushsubscriptionchange, api-cache, sw-version, landing, sonde-de-configuration, d-04, d-10, in-04, in-10]

# Dependency graph
requires:
  - phase: 20-hygiene-du-depot-les-14-constats-in-de-la-revue
    provides: D-04/D-10 (décisions verrouillées) ; `sw.ts` (reçu de push `eo-push-log`, ping `EO_VERSION`), `push.ts` (`invoke`, `readPushConfig`, `ensureBrowserSubscription`, `readLastPushReceipt`) et `lib/supabase/client.ts` (`isSupabaseConfigured`) déjà en place
provides:
  - "`sw.ts` traite `pushsubscriptionchange` : reçu durable `PushRotationReceipt` dans `eo-push-log` (`/__push_rotation__`) + `postMessage({ type: 'EO_PUSH_ROTATED' })`"
  - "`SW_VERSION` = `precache-push-v2`, verrouillé par le ping `EO_VERSION`"
  - "`push.ts` : `readPushRotationReceipt`, `acknowledgePushRotation`, `syncRotatedPushSubscription` (`'none' | 'registered' | 'failed'`)"
  - "`app-shell.tsx` traite `EO_PUSH_ROTATED` à côté de `EO_PUSH`, sans fusionner les branches"
  - "`join-household-page.tsx` sonde `isSupabaseConfigured` (URL ET clé), la sonde unique de l'application"
affects: [verify-work, secure-phase]

# Actuals (#2632) — chars/4 sur le diff réalisé
actuals:
  tokens: 7161
  tasks: 3
  commits: 2
  plan_head_before: 44a99ad
  plan_head_after: 2ff8085

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Le worker n'a aucun jeton : tout ce qu'il doit faire enregistrer par le serveur traverse l'API Cache (reçu durable) puis un `postMessage` aux onglets ouverts — le reçu survit à la fermeture de l'onglet, le message non"
    - "Un échec de plateforme est ÉCRIT (dans le reçu, puis dans l'acquittement de la page), jamais avalé : un reçu immobile et un reçu d'échec ne se distinguent pas autrement (§2.7 F)"
    - "La version du worker est son seul observable : le ping `EO_VERSION` est le moyen de verrouiller l'incrément par un test, et non par une relecture"
    - "Une sonde de configuration est UNE fonction partagée : la page et le client doivent répondre à la même question, sinon une URL sans clé fait prendre une branche impossible"

key-files:
  created:
    - app/src/sw.test.ts
  modified:
    - app/src/sw.ts
    - app/src/modules/parametres/lib/push.ts
    - app/src/modules/parametres/lib/push.test.ts
    - app/src/app/app-shell.tsx
    - app/src/app/app-shell.test.tsx
    - app/src/modules/landing/join-household-page.tsx
    - app/src/modules/landing/join-household-page.test.tsx

key-decisions:
  - "Le worker écrit un reçu durable au lieu d'appeler `push-subscribe` : il n'a aucun jeton (la fonction s'authentifie par la session de l'onglet) — le reçu est le seul canal qui survit à l'absence d'onglet (D-04)"
  - "Le `postMessage` part APRÈS l'écriture du reçu : un onglet qui se ferme entre les deux laisse quand même la trace durable"
  - "Un acquittement est écrit dans les DEUX issues côté page : un échec silencieux serait le succès muet que §2.7 F interdit (D-04)"
  - "`SW_VERSION` passe à `precache-push-v2` : c'est ce qui permet au panneau de détecter un worker actif mais obsolète (D-04)"
  - "`EO_PUSH` et `EO_PUSH_ROTATED` restent deux branches distinctes : les fusionner ferait d'une rotation un rappel, ou l'inverse (D-04)"
  - "La jonction lit `isSupabaseConfigured` (URL ET clé), la même sonde que `lib/supabase/client.ts` : une URL sans clé bascule en mode démonstration au lieu de tenter un appel serveur impossible (D-10)"

patterns-established:
  - "Preuve rouge par retrait du gestionnaire : le test du worker échoue bruyamment (« aucun gestionnaire pushsubscriptionchange enregistré ») au lieu de passer sur un canal muet"
  - "Preuve rouge par suppression de l'écriture d'acquittement : l'assertion porte sur le reçu ÉCRIT, pas sur la valeur de retour — c'est la seule forme qui attrape un succès muet"

requirements-completed: [IN-04, IN-10]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Le worker traite `pushsubscriptionchange`, écrit le reçu durable et prévient les onglets ; sans `newSubscription` il recrée l'abonnement avec la clé de l'ancien (D-04)"
    requirement: "IN-04"
    verification:
      - kind: unit
        ref: "app/src/sw.test.ts#retient le nouvel abonnement, écrit un reçu durable et prévient les onglets"
        status: pass
      - kind: unit
        ref: "app/src/sw.test.ts#crée un abonnement avec la clé de l’ancien quand le navigateur n’en fournit pas"
        status: pass
    human_judgment: false
  - id: D2
    description: "Un échec de rotation est écrit dans le reçu (`ok: false` + `error`) et signalé, jamais avalé"
    requirement: "IN-04"
    verification:
      - kind: unit
        ref: "app/src/sw.test.ts#écrit l’échec dans le reçu et le signale, au lieu de l’avaler"
        status: pass
    human_judgment: false
  - id: D3
    description: "`SW_VERSION` = `precache-push-v2`, confirmé par le ping `EO_VERSION`"
    requirement: "IN-04"
    verification:
      - kind: unit
        ref: "app/src/sw.test.ts#répond au ping EO_VERSION avec la version courante du worker"
        status: pass
    human_judgment: false
  - id: D4
    description: "La page relit le reçu, enregistre via `push-subscribe`, et écrit son acquittement dans les deux issues"
    requirement: "IN-04"
    verification:
      - kind: unit
        ref: "app/src/modules/parametres/lib/push.test.ts#sans reçu de rotation, ne fait rien et n’enregistre aucun abonnement"
        status: pass
      - kind: unit
        ref: "app/src/modules/parametres/lib/push.test.ts#enregistre le nouvel abonnement via `push-subscribe` et acquitte `registered`"
        status: pass
      - kind: unit
        ref: "app/src/modules/parametres/lib/push.test.ts#sur échec d’enregistrement, rend `failed` ET écrit l’acquittement avec sa raison"
        status: pass
    human_judgment: false
  - id: D5
    description: "Le shell relit le reçu sur `EO_PUSH_ROTATED` et garde le comportement de `EO_PUSH`"
    requirement: "IN-04"
    verification:
      - kind: unit
        ref: "app/src/app/app-shell.test.tsx#relit le reçu de rotation quand le worker signale `EO_PUSH_ROTATED`"
        status: pass
      - kind: unit
        ref: "app/src/app/app-shell.test.tsx#affiche une popup quand le service worker relaie un push (app ouverte)"
        status: pass
    human_judgment: false
  - id: D6
    description: "La jonction utilise `isSupabaseConfigured` : URL présente + clé absente ⇒ branche locale ; configuration complète ⇒ branche Supabase"
    requirement: "IN-10"
    verification:
      - kind: unit
        ref: "app/src/modules/landing/join-household-page.test.tsx#(a) URL présente mais clé absente ⇒ la branche locale est prise"
        status: pass
      - kind: unit
        ref: "app/src/modules/landing/join-household-page.test.tsx#(b) configuration complète ⇒ la branche locale n’est PAS prise (verrou de non-régression)"
        status: pass
    human_judgment: false

# Metrics
metrics:
  duration: "~35 min"
  completed: 2026-10-16
  tasks: 3
  files: 8

status: complete
---

# Phase 20 Plan 07: Plateforme — rotation d'abonnement push et sonde de configuration Summary

Un abonnement push rotaté par le navigateur est désormais **renouvelé**, **tracé durablement** (reçu dans l'API Cache, le seul canal qui survit à l'absence d'onglet — le worker n'a pas de jeton) et **signalé** aux onglets ouverts, la page relisant ce reçu pour enregistrer le nouvel endpoint via `push-subscribe` et écrivant son propre résultat dans les deux issues ; la page de jonction lit la **même** sonde de configuration que le reste de l'application (`isSupabaseConfigured`, URL **et** clé).

## Performance

- **Duration:** ~35 min
- **Started:** 2026-10-16T10:39Z
- **Completed:** 2026-10-16T11:14Z
- **Tasks:** 3/3
- **Files modified:** 8 (1 créé, 7 modifiés)

## Accomplishments

- **D-04 / IN-04 — la rotation est renouvelée ET signalée.** `sw.ts` n'écoutait pas `pushsubscriptionchange` : après une rotation décidée par le navigateur, le serveur gardait l'ancien endpoint et les rappels partaient dans le vide — ni erreur, ni trace. Le worker retient `event.newSubscription`, ou en crée un avec la clé de l'ancien quand le navigateur invalide sans fournir de remplaçant ; il écrit un reçu durable dans `eo-push-log` (`/__push_rotation__`) puis prévient les clients ouverts. Côté page, `syncRotatedPushSubscription` relit le reçu, enregistre via `push-subscribe` et **écrit** son acquittement dans les deux issues. `SW_VERSION` passe à `precache-push-v2`.
- **D-10 / IN-10 — une seule sonde de configuration.** `join-household-page.tsx` testait `import.meta.env.VITE_SUPABASE_URL` seul, alors que `lib/supabase/client.ts` décide de l'existence du client sur l'URL **et** la clé. Une URL sans clé faisait croire à un backend présent : la branche locale n'était pas prise, et l'appel serveur échouait au lieu de tourner en démonstration.
- **Task 3 — la chaîne complète de §2.7 AGENTS.md** est exécutée sur l'état final de la phase, chaque sortie consignée ci-dessous, y compris l'étape qui n'a pas pu tourner et pourquoi.

## Task Commits

Each task was committed atomically (directly on `main`, `branching_strategy: none`) :

1. **Task 1 (tracer) : la rotation traverse les trois couches — worker, page, shell (D-04)** — `052e3be` (feat)
2. **Task 2 : la sonde de configuration de la jonction est celle de toute l'application (D-10)** — `2ff8085` (fix)
3. **Task 3 : chaîne de vérification de la phase** — aucun commit (aucun fichier de production modifié)

**Plan metadata:** non commité (`commit_docs: false`, `.planning/` gitignoré).

## Files Created/Modified

- `app/src/sw.ts` — `SW_VERSION` → `'precache-push-v2'` (`:51`) ; `PUSH_ROTATION_RECEIPT_URL` (`:62`) ; `PushRotationReceipt` (`:78-83`) ; `writePushRotationReceipt` (`:114`) ; gestionnaire `pushsubscriptionchange` (`:251`)
- `app/src/sw.test.ts` — **nouveau** : `self` et `caches` factices, `Request` doublé (Node exige une URL absolue), gestionnaires collectés par type, 4 cas
- `app/src/modules/parametres/lib/push.ts` — `PUSH_ROTATION_RECEIPT_URL` / `PUSH_ROTATION_ACK_URL`, `PushRotationReceipt`, `readPushRotationReceipt`, `acknowledgePushRotation`, `syncRotatedPushSubscription`
- `app/src/modules/parametres/lib/push.test.ts` — `installCache` hissé au niveau module, sert **deux** URL et **retient** les `put` ; nouveau `describe('rotation d’abonnement (D-04)')` avec 3 cas
- `app/src/app/app-shell.tsx` — import de `syncRotatedPushSubscription` ; le gestionnaire de messages (`:108`) traite `EO_PUSH` et `EO_PUSH_ROTATED` en deux branches
- `app/src/app/app-shell.test.tsx` — mock partiel de `@/modules/parametres/lib/push` ; assertion du pendant sur `EO_PUSH` ; nouveau `describe('AppShell — rotation d’abonnement (D-04)')`
- `app/src/modules/landing/join-household-page.tsx` — `isSupabaseConfigured` au lieu de `import.meta.env.VITE_SUPABASE_URL` (`:53`)
- `app/src/modules/landing/join-household-page.test.tsx` — mock complet de `@/lib/supabase/client` (accesseur), mock partiel de `@/stores/session-store`, stub d'environnement ; 2 cas D-10

## Texte exact des commentaires ajoutés

### `app/src/sw.ts` — l'énoncé de la rotation (`:237-250`)

```
/**
 * Une rotation d'abonnement décidée par le navigateur.
 *
 * POURQUOI LE WORKER ÉCRIT AU LIEU D'APPELER LA FONCTION SERVEUR : il n'a
 * aucun jeton — `push-subscribe` s'authentifie par la session de l'onglet — et
 * ne peut donc pas enregistrer lui-même le nouvel endpoint. Le reçu dans l'API
 * Cache est le seul canal qui survit à l'absence d'onglet : la page le relit à
 * son prochain chargement et fait l'enregistrement à sa place.
 *
 * POURQUOI C'EST UN CAS À PART : le service Push peut invalider un abonnement
 * et en fournir un autre sans prévenir personne. Sans ce gestionnaire, le
 * serveur garde l'ancien endpoint et les rappels partent dans le vide — ni
 * erreur, ni trace, nulle part.
 */
```

### `app/src/sw.ts` — la tolérance d'écriture (`:106-113`)

```
/**
 * Écrit le reçu de rotation, avec la MÊME tolérance que `writePushReceipt`.
 *
 * L'écriture est isolée pour la même raison : un stockage indisponible ne doit
 * pas faire perdre l'information de rotation — c'est la seule trace qu'un
 * endpoint connu du serveur est devenu caduc, et sans elle la page ne peut
 * rien réparer.
 */
```

### `app/src/modules/landing/join-household-page.tsx` (`:48-53`)

```
      // La MÊME sonde que le reste de l'application (`lib/supabase/client.ts`) :
      // URL ET clé publiable. Tester l'URL seule faisait croire à un backend
      // présent alors que le client Supabase, lui, n'existait pas — la branche
      // locale n'était pas prise, et l'appel serveur échouait au lieu de
      // tourner en mode démonstration (D-10).
      if (!isSupabaseConfigured) {
        await joinHouseholdLocal();
      }
```

## Corps exact du gestionnaire `pushsubscriptionchange`

```ts
self.addEventListener('pushsubscriptionchange', (event: PushSubscriptionChangeEvent) => {
  event.waitUntil(
    (async () => {
      const receipt: PushRotationReceipt = { at: Date.now(), endpoint: '', ok: false, error: null };
      try {
        // Le navigateur fournit souvent le remplaçant ; quand il invalide sans
        // en fournir, on en crée un avec la clé de l'ancien abonnement — la
        // seule clé dont dispose le worker.
        const replacement =
          event.newSubscription ??
          (await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: event.oldSubscription?.options?.applicationServerKey ?? null,
          }));
        receipt.endpoint = replacement.endpoint;
        receipt.ok = true;
      } catch (error) {
        // L'échec est ÉCRIT, jamais avalé (AGENTS.md §2.7 F) : un reçu qui ne
        // bouge pas et un reçu d'échec ne se distingueraient pas autrement.
        receipt.error = error instanceof Error ? error.name : 'inconnue';
      }
      await writePushRotationReceipt(receipt);
      // Le message part APRÈS l'écriture : un onglet qui se ferme entre les
      // deux laisse quand même la trace durable, le canal de secours prévu.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        client.postMessage({ type: 'EO_PUSH_ROTATED', endpoint: receipt.endpoint, ok: receipt.ok });
      }
    })(),
  );
});
```

## Valeur finale de `SW_VERSION` et réponse du ping

- `SW_VERSION = 'precache-push-v2'` (`app/src/sw.ts:51`, remplace `'precache-push-v1'`).
- Ping `EO_VERSION` → `EO_VERSION_REPLY` porte `version: 'precache-push-v2'` — asserté par `sw.test.ts#répond au ping EO_VERSION avec la version courante du worker`.

## Preuves rouge → vert

### D-04 — worker (`sw.test.ts`)

**Rouge** : gestionnaire renommé en `'pushsubscriptionchange-DESACTIVE'` (donc plus enregistré) :

```
 Test Files  1 failed (1)
      Tests  3 failed | 1 passed (4)
Error: le worker n'a enregistré aucun gestionnaire « pushsubscriptionchange »
```

**Vert** (restauré) : `Test Files 1 passed (1) / Tests 4 passed (4)`.

### D-04 — page (`push.test.ts`)

**Rouge** : ligne `await acknowledgePushRotation(receipt.at, 'registered', null);` retirée du chemin `'registered'` :

```
 FAIL  src/modules/parametres/lib/push.test.ts > rotation d’abonnement (D-04) > enregistre le nouvel abonnement via `push-subscribe` et acquitte `registered`
AssertionError: expected undefined to deeply equal { at: 1720000000000, …(2) }
 Test Files  1 failed (1)
      Tests  1 failed | 37 passed (38)
```

**Vert** (restauré) : `Test Files 1 passed (1) / Tests 38 passed (38)`.

### D-10 — jonction (`join-household-page.test.tsx`)

**Rouge** : sonde d'origine `import.meta.env.VITE_SUPABASE_URL` remise à `:53` :

```
 FAIL  … > (a) URL présente mais clé absente ⇒ la branche locale est prise
AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
 FAIL  … > (b) configuration complète ⇒ la branche locale n’est PAS prise (verrou de non-régression)
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
 Test Files  1 failed (1)
      Tests  2 failed | 2 passed (4)
```

**Vert** (restauré) : `Test Files 1 passed (1) / Tests 4 passed (4)`.

### Les quatre preuves seules (vérification 1 du plan)

```
$ npx vitest run src/sw.test.ts src/modules/parametres/lib/push.test.ts src/app/app-shell.test.tsx src/modules/landing/join-household-page.test.tsx
 Test Files  4 passed (4)
      Tests  66 passed (66)
```

## Chaîne de vérification §2.7 — sorties verbatim

Toutes les étapes ont été exécutées sur l'**état final** de la phase (`2ff8085`).

### 1. `cd app && npm run typecheck && npm test && npm run build`

```
> tsc --noEmit
TYPECHECK_EXIT=0

 Test Files  143 passed (143)
      Tests  1202 passed (1202)
   Duration  480.42s
TEST_DONE

✓ built in 981ms
PWA v1.3.0 — mode injectManifest — format: es
precache  100 entries (2195.38 KiB)
files generated
  dist/sw.js
  dist/sw.js.map
```

Aucun `error TS`, aucun `error during build`. **1202 tests** (1200 avant la phase… cf. 20-06 qui en comptait 1192 ; +4 `sw.test.ts`, +3 `push.test.ts`, +1 `app-shell.test.tsx`, +2 `join-household-page.test.tsx`).

### 2. `cd app && npm run test:e2e`

```
  5 skipped
  121 passed (2.0m)
```

**Exactement l'attendu** : 121 passés / 5 sautés. Les 5 sauts sont les `test.skip` conditionnels de viewport (phase 19) — aucun échec, aucune régression introduite par la phase.

### 3. `python3 scripts/check-sql-statique.py` → exit **0**

```
Définitions dépassées, sans effet sur la base (corrigées plus loin) :
    0019_push_dispatch.sql  private.push_reminder_notifications(p_now timestamptz) (plpgsql)

Motif DML→ALTER déjà survenu, sans effet prévisible (exempté, voir EXEMPTES_DML_ALTER) :
    0039_ardoise_drop_external_parts.sql:30  delete from public.expense_participants where participant_type = ' (risque connu, inerte)

check-sql-statique : 181 fonction(s) effective(s) sur 124 migration(s) et 63 test(s), aucun défaut
EXIT=0
```

Les deux mentions ci-dessus sont des **informations préexistantes** (définition dépassée, motif exempté) : ni `KO`, ni `ERREUR`.

### 4. `sh scripts/migrate.sh` → exit **0** (Docker disponible)

```
NOTICE:  relation "schema_migrations" already exists, skipping
Toutes les migrations sont déjà appliquées.
MIGRATE_EXIT=0
```

Docker est **disponible** sur cet hôte (`docker info` OK ; services `supabase-db`, `supabase-rest`, `supabase-envoy`, `supabase-functions`… en marche).

### 5. `sh scripts/test-db.sh` → exit **0**

```
  → 0124_media_path_backfill.sql
    OK 0124_media_path_backfill.sql

Tests SQL : 61 fichier(s), tous verts.
TESTDB_EXIT=0
```

**61/61**, exactement l'attendu.

### 6. `sh scripts/test-dispatch-push.sh` → exit **1** — **NON EXÉCUTÉ, et voici pourquoi**

```
test-dispatch-push.sh: aucun abonnement de push réel sur cette instance.
  Ouvrir l'application sur un appareil, autoriser les notifications,
  puis relancer. Un endpoint factice ne prouverait rien.
DISPATCH_EXIT=1
```

**Cette étape n'a pas pu tourner, et ce n'est pas un échec du changement.** Le script exige un abonnement de push **réel** : un endpoint factice serait `dropped` et non `delivered`, donc un chiffre juste et une preuve fausse — il refuse explicitement de le fabriquer. Vérification directe et sans secret de l'état de l'instance :

```
$ sh scripts/psql.sh -t -A -c "select count(*) as total, count(*) filter (where endpoint ~ 'a{50,}$') as synthetiques from public.push_subscriptions;"
0|0
```

La table `push_subscriptions` est **vide** (0 abonnement réel, 0 abonnement synthétique) : aucun appareil ne s'est jamais abonné sur cette instance. Les préalables du script (pg_net, Vault, `project_url` + `service_role_key`) sont franchis — il s'arrête sur la seule condition qu'il ne peut pas fabriquer. C'est l'étape qui couvre le plus directement l'objet de ce plan (`sw.ts`, `push.ts`) : elle est donc consignée ici avec le plus de soin, et **elle reste à rejouer depuis un appareil abonné**. Ce que ce plan prouve par ailleurs est la logique du worker et de la page, pas le trajet `base → Edge Function → service Push`.

### 7. Preuves de classe de la phase

**IN-01** — `grep -rn "eslint-disable" app/src` :

```
occurrences=1 (1 = aucune trouvée)
0
```
→ **0** occurrence. Le garde de classe `app/src/lib/no-eslint-directive.test.ts` est vert dans la suite (1202 tests).

**IN-02** — `git status --porcelain --untracked-files=all` :

```
(aucune sortie)
--- familles IN-02 ---
0
--- le fichier existe toujours ? ---
present: app/shot-toggle-on.mjs
```
→ plus aucune entrée non suivie et non ignorée ; les trois familles (`.claude/worktrees/`, `.gsd/`, `app/shot-toggle-on.mjs`) sont absentes ; le script de debug **existe toujours sur le disque** (`test -f` = present), il est seulement hors du champ de `git add -A`.

**IN-15** — `app/src/modules/parametres/lib/push.ts` :

```
=== écritures non latines (CJK, kana, hangul, cyrillique, arabe, hébreu) ===
0
=== artefacts de double-encodage UTF-8 (Ã[\x80-\xBF], â€, Â[\x80-\xBF]) ===
0
```
→ **0** pour les deux familles. Aucun garde permanent par plage de caractères n'a été ajouté (D-15) : la preuve est le compte, pas un verrou.

## Deviations from Plan

**1. [Rule 3 — Obstacle] `Request` doublé dans `sw.test.ts` et l'acquittement écrit par chaîne d'URL**

- **Found during:** Task 1
- **Issue:** sous jsdom, `new Request('/__push_rotation__')` lève (`Failed to parse URL`) — Node exige une URL absolue, là où le scope worker en résout une relative. Le plan demandait de doubler `caches`, mais pas `Request` : sans ce double, `writePushRotationReceipt` levait avant d'atteindre `put`, le `catch` isolé avalait, et le test n'aurait **rien regardé** — précisément le mode de défaillance que §2.7 B décrit.
- **Fix:** `sw.test.ts` double `Request` par une classe minimale qui retient l'URL (`installWorkerScope`) ; côté page, `acknowledgePushRotation` écrit par **chaîne d'URL** (`cache.put(PUSH_ROTATION_ACK_URL, …)`) plutôt que par `new Request(…)` — `Cache.put` accepte un `RequestInfo`, la chaîne est équivalente en navigateur et évite de faire dépendre la production d'une limite de Node.
- **Files modified:** `app/src/sw.test.ts`, `app/src/modules/parametres/lib/push.ts`
- **Commit:** `052e3be`

**2. [Rule 3 — Obstacle] `installCache` hissé au niveau module dans `push.test.ts`**

- **Found during:** Task 1
- **Issue:** le stub de cache vivait à l'intérieur du `describe('reçu du dernier push')` ; les cas de rotation vivent dans un autre `describe` et ne pouvaient pas l'atteindre sans le dupliquer.
- **Fix:** hissé au niveau module (le plan demandait de l'« étendre » — il sert désormais **deux** URL et retient les `put`) ; aucun cas existant modifié.
- **Files modified:** `app/src/modules/parametres/lib/push.test.ts`
- **Commit:** `052e3be`

Aucune autre déviation. Les gestionnaires `push` et `notificationclick` n'ont pas été touchés, aucun appel serveur nouveau n'a été introduit, et le schéma de validation de la jonction ainsi que le préremplissage par `?token=` sont inchangés.

## Auth Gates

Aucune. Aucune étape n'a exigé d'authentification interactive.

## Known Stubs

Aucun. Aucun `=[]`/`={}`/`=null` de complaisance, aucun texte « à venir », aucune source de données non câblée. Le `endpoint: ''` du reçu est la valeur **initiale** avant écriture, remplacée dans les deux issues ; il est asserté tel quel dans le cas d'échec (`endpoint: ''`, `ok: false`) parce qu'aucun abonnement n'a été retenu — c'est un fait, pas un remplissage.

## Threat Flags

Aucun. Les fichiers modifiés n'introduisent aucune surface de confiance nouvelle : le gestionnaire ajouté traite un événement déjà émis par le navigateur, le reçu réutilise le cache `eo-push-log` et l'URL existante `push-subscribe`, et la sonde partagée **retire** une branche impossible au lieu d'en ajouter une. Les mitigations T-20-19 (worker qui traite la rotation), T-20-20 (résultat écrit dans les deux issues, prouvé par test) et T-20-21 (sonde unique, prouvée URL présente / clé absente) sont en place ; T-20-SC reste sans objet (aucun paquet ajouté).

## Self-Check

- Fichiers créés/modifiés présents : `app/src/sw.ts`, `app/src/sw.test.ts`, `app/src/modules/parametres/lib/push.ts`, `app/src/modules/parametres/lib/push.test.ts`, `app/src/app/app-shell.tsx`, `app/src/app/app-shell.test.tsx`, `app/src/modules/landing/join-household-page.tsx`, `app/src/modules/landing/join-household-page.test.tsx` → **FOUND** (8/8)
- Commits présents : `052e3be`, `2ff8085` → **FOUND** (`git rev-list --count 44a99ad..HEAD` = 2)

## Self-Check: PASSED
