# Phase 42: Cold start mesuré puis corrigé + décision cache - Research

**Researched:** 2026-11-10
**Domain:** Instrumentation `performance` (Web Performance API native), protocole de mesure on-device, décision produit sur `OFFLINE_FAMILIES` maxAge
**Confidence:** HIGH (code lu directement ce session ; aucun package externe requis)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Protocole de mesure (COLD-01)**
- **PM-01** : 1 appareil réel de référence (Android, appareil validé chaîne offline complète), médiane de N runs. Jamais l'émulateur.
- **PM-02** : cache froid = purge IndexedDB + réinstallation de la PWA entre chaque run. Réseau coupé, build prod.
- **PM-03** : doc mesures versionné dans le dépôt (protocole, appareil, date, estampille quatre canaux, 4 segments médians avant/après). Les mesures ne persistent PAS dans l'app.

**Cible UX & fin de boucle (COLD-02)**
- **CU-01** : pas de cible chiffrée imposée — boucle profilage → correction → re-mesure jusqu'à plus aucun axe à fort gain désigné.
- **CU-02** : chaque correction nomme le segment source du profil qui la désigne. Axes candidats : taille entry chunk, hydratation IndexedDB, séquence auth bootstrap, activation SW.
- **CU-03** : correction hors profil autorisée mais consignée comme **écart** dans le doc mesures.

**Arbitrage CACHE-01**
- **CA-01** : arbitrage PAR famille de `OFFLINE_FAMILIES` (pas de blocs 24 h / 7 j globaux).
- **CA-02** : critères (volume réhydraté, tolérance produit à la donnée périmée, coût réseau du re-fetch) écrits dans le protocole AVANT les mesures.
- **CA-03** : statu quo justifié = décision valide (24 h vivantes / 7 j annexes peuvent être confirmées).
- **CA-04** : biais d'ordre instrumentation → lecture panneau → décision consigné dans le doc mesures.
- Purge outbox indépendante du maxAge : verrouillée, non re-discutée.

**Panneau diagnostic**
- **PD-01** : section « Amorçage » dans `offline-panel.tsx` — 4 segments + total, même style que le reste du panneau.
- **PD-02** : mesures en session seule (state), **aucune persistance IndexedDB supplémentaire**.
- **PD-03** : marks `performance.mark`/`measure` toujours actifs, sans flag de build.

### the agent's Discretion
- Format exact du doc mesures (versionné) et définition précise de la purge PM-02.
- N du nombre de runs et structure des axes candidats dans le protocole.

### Deferred Ideas (OUT OF SCOPE)
- GATE-01 en conditions réelles (observatoire événementiel hors jalon).
- Toute autre dette v1.1/v1.2 déjà soldée ; extension du modèle de partage ardoise.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COLD-01 | Protocole écrit d'abord + marks `performance.mark` aux 4 segments alimentant le panneau diagnostic | Surface d'insertion vérifiée : `main.tsx` (entry chunk), `sw-register.ts` (SW), `query-persistence.ts` / `use-auth.ts` (restore IndexedDB + auth bootstrap) ; aucun `performance.*` n'existe dans le code [VERIFIED: grep app/src, 0 hits] |
| COLD-02 | Corrections désignées par le profilage, avant/après documenté au même protocole | Axes candidats mappés au code réel (§ Axes candidats) ; doc mesures à la place de `38-E2E-SIGNATURE.md` (discipline §2.7) |
| CACHE-01 | Décision maxAge par famille, documentée dans PROJECT.md, purge outbox indépendante | `OFFLINE_FAMILIES` lue verbatim (11 familles : 9 à 24 h, 2 à 7 j) ; `inspectPersistedCache` fournit déjà les données panneau (âge, pruneEligible par famille) [VERIFIED: query-persistence.ts:422-453] |
</phase_requirements>

## Summary

Cette phase est une phase d'**instrumentation native + mesure** : aucun package externe à installer. La Web Performance API (`performance.mark` / `performance.measure` / `performance.getEntriesByName`) est native dans tous les navigateurs cibles (Chromium Android) — elle suffit intégralement. Le panneau `offline-panel.tsx` expose déjà `RestoreOutcome`, `InspectCachePersiste`, version SW, estampille de build : la section « Amorçage » est un ajout de rendu dans une surface existante, pas une nouvelle route.

La séquence de démarrage réelle est entièrement cartographiée : `main.tsx` pose l'état réseau et la sonde de joignabilité au niveau module (avant tout rendu), importe `sw-register` (effet de bord : `registerSW` immédiat), puis `useAuthBootstrap` gère le restore de session avec gardien 10 s (`DELAI_GARDIEN_AMORCAGE_MS = 10_000` [VERIFIED: app/src/hooks/use-auth.ts:111]) et branches hors-ligne (`cheminHorsLigneValide`, repli foyer persisté). Le restore IndexedDB passe par `connectOfflineCache` → `restoreOfflineCache` → `pruneExpiredFamilies` → `persistNow`, appelé AVANT `setReady(true)` — c'est le point exact où le mark « restore IndexedDB » se termine.

**Primary recommendation:** Instrumenter en 4 points de la chaîne réelle (marks posés au plus tôt dans `main.tsx`, marks de fin dans `sw-register.ts`, `connectOfflineCache` et le point `setReady(true)`), agréger par `performance.measure` dans un module dédié hors React (`boot-marks.ts`, patron `sw-register.ts`), afficher via un store zustand lu par le panneau, et écrire le protocole + critères CACHE-01 dans le doc mesures AVANT la première mesure on-device.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Marks de démarrage (4 segments) | Browser/Client (Web Performance API) | — | API native navigateur ; aucune donnée réseau ni serveur |
| Affichage section Amorçage | Frontend (composant `offline-panel.tsx`) | — | Surface existante, patron établi (RestoreOutcome déjà affiché) |
| Purge cache froid (protocole PM-02) | Browser/Client (IndexedDB + PWA uninstall) | — | Purge on-device manuelle guidée par le protocole ; `purgeUserCache`/`clearDatabase` existent côté app mais la PM-02 exige uninstall PWA (plus radical) |
| Arbitrage CACHE-01 | Produit (décision humaine) | Panneau on-device comme données | CA-02 : critères écrits avant, décision documentée dans PROJECT.md |
| Doc mesures versionné | Repo (markdown) | — | PM-03 : le doc est la référence, pas l'app |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Web Performance API (`performance.mark`/`measure`) | native | Mesure des 4 segments | Native, zéro dépendance, lisible en prod réel (PD-03) [ASSUMED: support universel Chromium Android — connaissance standard, non re-vérifiée ce session] |
| zustand store (existant `useSwState` patron) | v5 (déjà dans le projet) | Porter les mesures de session vers le panneau (PD-02 : session seule) | Même patron que `sw-register.ts` : store hors-React accessible depuis code non-composant [VERIFIED: sw-register.ts:20-24] |
| `idb-keyval` (existant) | déjà dans le projet | Lecture introspection existante — NE PAS ajouter d'écriture (PD-02) | Déjà la couche de `query-persistence.ts` |

### Supporting
Aucun nouveau package. **Le plan ne doit contenir AUCUNE tâche d'installation npm** — c'est un point de vigilance : le Package Legitimacy Audit est vide par conception.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `performance.mark` natif | User Timing via lib (web-vitals, sentry) | Rejeté : nouvelle dépendance, télémétrie tierce contraire à PD-02/PM-03 (mesures = doc versionné, pas service externe) |
| Store dédié zustand | `performance.getEntriesByName` lu au montage du panneau | Acceptable en repli, mais `getEntriesByName` retourne des entrées brutes de toutes les occurrences ; un store typé (4 durées + total) est plus lisible et testable. Recommandé : store, alimenté par les mesures |

**Installation:** aucun — à écrire explicitement dans le plan.

## Package Legitimacy Audit

> Aucun package externe n'est installé dans cette phase. Audit vide par conception.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
[Build prod déployé] → [App PWA Android, réseau coupé, cache froid]
        │
        ▼
main.tsx (module scope) ── mark: boot:start ──────────────────┐
  ├─ seedOnlineStatus() / demarrerSondeJoignabilite()          │
  ├─ import sw-register (registerSW immédiat)                  │
  │     └─ onRegisteredSW ── mark: sw:activated ──► [seg SW]   │
  ├─ createRoot().render(Root)                                 │
  │     └─ entry chunk évalué ── mark: entry:done ──► [seg 1]  │
  ▼                                                            │
useAuthBootstrap                                               │
  ├─ getSession / profil / foyer (réseau coupé → branches     │
  │   hors-ligne : cheminHorsLigneValide, gardien 10 s)        │
  ├─ connectOfflineCache ── mark avant/après ──► [seg IDB]     │
  │     restore → prune → persistNow                           │
  └─ setReady(true) ── mark: boot:done ──► [seg auth + total]  │
        │                                                      │
        ▼                                                      ▼
Store boot-marks (zustand, session seule) ──► offline-panel.tsx
        │                                        section « Amorçage »
        ▼                                        4 segments + total
Protocole PM-01/02 (N runs, médiane) ──► doc mesures versionné
        │                                        (avant / après)
        ▼
Lecture panneau par famille (inspectPersistedCache déjà présent)
        │
        ▼
Décision CACHE-01 par famille → PROJECT.md (valeur + justification)
```

### Recommended Project Structure
```
app/src/lib/
├── boot-marks.ts           # NOUVEAU : module hors-React — pose les marks,
│                           # mesure les 4 segments, store zustand de session
├── boot-marks.test.ts      # tests unitaires (patron sw-register)
└── offline/query-persistence.ts   # mark avant/après dans connectOfflineCache
                                   # (ou marks posés par boot-marks via injections)
```

### Pattern 1: Marks posés au point d'insertion réel, mesure centrale
**What:** Chaque segment est borné par deux `performance.mark()` posés dans le code de démarrage réel ; un module central `boot-marks.ts` convertit les paires en `performance.measure()` et alimente un store zustand. Les composants n'appellent jamais `performance` directement.
**When to use:** Toujours dans cette phase — les 4 segments traversent trois fichiers (`main.tsx`, `sw-register.ts`, `use-auth.ts`) ; centraliser la lecture évite quatre implémentations divergentes (§2.7 E : garde de classe).
**Example:**
```typescript
// Source: Web Performance API standard, patron existant sw-register.ts (zustand hors-React)
let debut = 0;
export function marquerSegmentDebut(segment: 'entry' | 'sw' | 'idb' | 'auth'): void {
  debut = performance.now();
  performance.mark(`boot:${segment}:debut`);
}
export function marquerSegmentFin(segment: 'entry' | 'sw' | 'idb' | 'auth'): void {
  performance.mark(`boot:${segment}:fin`);
  const duree = performance.now() - debut;
  // → store zustand, session seule (PD-02 : jamais IndexedDB)
}
```

### Pattern 2: Segments bornés par des instants, pas par des promesses
**What:** Les 4 segments se chevauchent partiellement (SW s'active en parallèle de l'entry chunk ; l'auth bootstrap contient le restore IDB). Mesurer chaque segment par ses **bornes propres** (début/fin réels) et calculer le **total** = `boot:done − boot:start`, pas la somme des 4.
**When to use:** Toujours — sommer des segments chevauchants produit un total mensonger ; le panneau doit dire les deux faits (segments + total réel) sans les faire converger.

### Pattern 3: Purge PM-02 = uninstall PWA, pas clearDatabase
**What:** Le protocole de cache froid exige purge IndexedDB **et** réinstallation PWA. `clearDatabase` (Dexie, mode démo) et `purgeUserCache` ne suffisent pas : le SW précaché et le storage IndexedDB de l'app doivent partir. Le protocole écrit la séquence exacte : désinstallation PWA → (optionnel wipe site data dans Chrome) → réinstallation → premier lancement réseau coupé.
**When to use:** Rédaction du protocole, avant la première mesure.

### Anti-Patterns to Avoid
- **Persister les mesures** : ajouter une écriture IndexedDB au démarrage fausse la mesure par l'instrumentation elle-même (PD-02 explicite). Le doc mesures versionné est la seule référence.
- **Flag de build pour les marks** : rejeté (PD-03) — contrairement au harnais e2e phase 41 (`VITE_E2E_SW_HARNESS`), les marks sont du produit.
- **Corriger avant d'avoir mesuré** : success criterion 3 — toute correction nomme le segment du profil qui la désigne (CU-02) ; sinon consignée comme écart (CU-03).
- **Sommer des segments chevauchants** pour le total (voir Pattern 2).
- **Déplacer les marks pendant les corrections** : si la correction change la séquence de démarrage, les bornes des segments doivent rester comparables avant/après ; tout déplacement de borne est consigné dans le doc mesures (sinon l'avant/après devient incomparable).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Lecture cache par famille pour CACHE-01 | Nouvelle fonction d'inspection | `inspectPersistedCache` (existe, testée T-35-18/19) | Fournit déjà `ageMs`, `maxAgeMs`, `pruneEligible` par famille — exactement les données du panneau requises par CA-01 [VERIFIED: query-persistence.ts:422-453] |
| Delta de prune / familles restaurées | Nouveau comptage | `getRestoreOutcome` (existe) | Déjà affiché dans le panneau ; le réutiliser évite une deuxième source de vérité [VERIFIED: query-persistence.ts:475-480] |
| Horloges / mesures de temps | `Date.now()` à la main pour les durations de segments | `performance.now()` / `performance.measure` | Monotone, haute résolution, natif |
| Purge cache froid | Bouton in-app de purge | Séquence uninstall/reinstall écrite dans le protocole | PM-02 exige l'état « aucune donnée persistante » — seule la désinstallation la garantit (SW + IndexedDB + storage) |
| Affichage panneau | Nouvelle surface/route | `offline-panel.tsx`, section additionnelle | PD-01 : point d'affichage unique |

**Key insight:** Cette phase ajoute de l'observation, pas de la mécanique. Quatre cinquièmes des fonctions nécessaires existent et sont testées ; la nouveauté est uniquement le câblage des marks + le rendu + le protocole.

## Common Pitfalls

### Pitfall 1: L'instrumentation modifie ce qu'elle mesure
**What goes wrong:** Poser des marks coûte ~µs, mais un store zustand mis à jour à chaque segment déclenche des re-renders pendant le démarrage — mesurable sur un Android lent.
**Why it happens:** Le store est branché naïvement dans le chemin de démarrage.
**How to avoid:** Le store n'est **lu** qu'au montage du panneau (Paramètres) — aucune subscription React active pendant le démarrage ; les mises à jour zustand hors abonnés ne coûtent rien.
**Warning signs:** Le profil avant/après instrumentation diverge inexplicablement.

### Pitfall 2: StrictMode double-monte l'effet d'amorçage
**What goes wrong:** `main.tsx` rend dans `<StrictMode>` [VERIFIED: main.tsx:87-90] : en dev, `useAuthBootstrap` s'exécute deux fois — deux jeux de marks, mesures fausses.
**How to avoid:** Le protocole mesure un **build prod** (PM-02) où StrictMode ne double-invoque pas ; mais les tests et la lecture du panneau en dev doivent tolérer/écraser les marks d'un second passage (le dernier gagne).
**Warning signs:** Total incohérent avec la somme des bornes en dev.

### Pitfall 3: Le mark « activation SW » n'existe peut-être pas au cold start hors ligne
**What goes wrong:** Au premier lancement post-installation hors ligne, le SW vient d'être précaché pendant l'install (réseau encore là). Si le réseau est coupé AVANT l'installation, il n'y a pas de SW du tout. La séquence PM-02 (réinstall puis coupure) doit être explicite : le SW s'installe pendant l'installation initiale ; le mark borne alors l'`onRegisteredSW` du lancement suivant.
**How to avoid:** Le protocole fixe l'ordre : installer PWA (réseau OK) → lancer une fois → couper réseau → purge (uninstall+reinstall ou wipe) → mesurer. Chaque run suit la MÊME séquence.
**Warning signs:** Segment SW à 0 ms ou manquant sur certains runs — l'écart entre runs est un fait à consigner, pas à lisser.

### Pitfall 4: Segment auth bootstrap vs gardien 10 s
**What goes wrong:** Hors ligne, le bootstrap auth peut attendre le gardien (`DELAI_GARDIEN_AMORCAGE_MS = 10_000`) ou la sonde de joignabilité (4 s) — le segment « auth bootstrap » absorbe alors une attente réseau, pas du travail CPU.
**How to avoid:** Le protocole définit ce que le segment auth contient (getSession + applySession/cheminHorsLigneValide jusqu'à `setReady(true)`), et le doc mesures consigne que hors ligne, ce segment reflète les délais de repli (sonde/gardien) — c'est précisément l'axe « séquence auth bootstrap » des axes candidats (CU-02). Un gain réel peut venir de réduire ces délais de repli, mais SEULEMENT si le profil le désigne.
**Warning signs:** Segment auth ≈ 4 000 ou 10 000 ms constant → la borne est l'attente, l'axe est la séquence de repli.

### Pitfall 5: CACHE-01 lu après instrumentation = biais d'ordre déjà connu
**What goes wrong:** Les données du panneau (volume réhydraté) dépendent du maxAge en vigueur : modifier maxAge change ce que le panneau montrera (biais d'ordre STATE.md, CA-04).
**How to avoid:** L'ordre instrumentation → lecture panneau → décision est consigné ; les critères CA-02 sont écrits AVANT de lire le panneau ; l'arbitrage est PAR famille (CA-01) en utilisant `inspectPersistedCache` (age vs maxAge par famille).
**Warning signs:** Une décision maxAge prise « parce que le panneau montre peu de données » sans critère écrit avant.

### Pitfall 6: Changer OFFLINE_FAMILIES = plusieurs surfaces à mettre à jour ensemble
**What goes wrong:** Si la décision modifie un maxAge, il faut mettre à jour : `OFFLINE_FAMILIES` (query-policy.ts:79-93), les tests (`query-policy.test.ts` Test H refuse toute divergence préfixes/hooks ; test de la politique), et le commentaire D-08/D-09. Le gcTime (7 j, query-policy.ts:37) est couplé à l'horizon maxAge des annexes — l'augmenter au-delà de 7 j imposerait de re-regarder gcTime.
**How to avoid:** Un seul commit par changement de famille, tests à jour dans le même commit ; si un maxAge dépasse 7 j, vérifier le commentaire gcTime du fichier.
**Warning signs:** Test H rouge ; commentaire obsolète.

## Code Examples

### Insertion des marks dans use-auth (segment IDB + fin de bootstrap)
```typescript
// Source: app/src/hooks/use-auth.ts (branches vérifiées lignes 262, 402, 414)
// Autour de connectOfflineCache :
marquerSegmentDebut('idb');
await connectOfflineCache(queryClient, userId, householdId);
marquerSegmentFin('idb');
// Au point setReady(true) final :
marquerSegmentFin('auth'); // + total = boot:done − boot:start
```
La pose exacte (avant/après quels awaits, une ou les deux branches hors-ligne/en-ligne) est un choix de plan — les deux branches `connectOfflineCache` (use-auth.ts:262 et :402) doivent être couvertes ou explicitement écartées par le protocole.

### Rendu panneau (section Amorçage)
```typescript
// Source: patron existant offline-panel.tsx (libelleDureeConservation, lignes 71-77)
function libelleMs(dureeMs: number): string {
  return dureeMs < 1000 ? `${Math.round(dureeMs)} ms` : `${(dureeMs / 1000).toFixed(1)} s`;
}
// Section « Amorçage » : 4 lignes segment + 1 ligne total,
// libellés descriptifs (faits, pas jugements — même discipline D-11).
```

## Axes candidats mappés au code réel (CU-02)

| Axe candidat | Emplacement code | Ce que le profil peut désigner |
|--------------|------------------|-------------------------------|
| Taille du entry chunk | bundle Vite (`app/dist/assets/*`), évalué avant le premier rendu | Code-splitting du bundle d'entrée ; taille précachée par le SW |
| Activation SW | `sw-register.ts` (`registerSW` → `onRegisteredSW`) | Précaché lourd, enregistrement bloquant ou tardif |
| Restore IndexedDB | `connectOfflineCache` (query-persistence.ts:349-371) | Volume sérialisé (families × lignes), déserialize TanStack, prune |
| Séquence auth bootstrap | `use-auth.ts` (gardien 10 s l.111, sonde 4 s, branches hors-ligne) | Délais de repli réseau, ordre getSession → applySession → foyer |

## Runtime State Inventory

> Non applicable (pas de rename/migration). Toutefois, note de mesure : le cache IndexedDB `eo-offline-cache` (clé `eo-query-cache:<userId>:<householdId>`, buster `v2` [VERIFIED: query-persistence.ts:21-46]) EST l'état runtime que le protocole purge — d'où la PM-02 uninstall.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Appareil Android réel (chaîne offline validée) | PM-01 mesures | à vérifier à l'exécution | — | AUCUN fallback (STATE.md : blocker connu — si indisponible, différé consigné honnêtement §2.7 I, jamais maquillé) |
| Build prod déployé (estampille 4 canaux) | PM-02/PM-03 | ✓ pipeline existant (`build-app.sh`, `check-version-stamp.sh`) | — | — |
| Chrome DevTools on-device (remote debugging USB) | lecture `performance` si besoin de trace brute | à vérifier | — | Le panneau suffit pour les 4 segments ; DevTools optionnel pour creuser un axe |

**Missing dependencies with no fallback:**
- Appareil on-device si absent au moment de l'exécution → consigner le différé (CONTEXT.md blocker rappelé).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest + React Testing Library (config existante `app/`) |
| Config file | existant (chaîne `npm test`) |
| Quick run command | `cd app && npm test` |
| Full suite command | `cd app && npm run typecheck && npm test && npm run build` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COLD-01 | Les 4 segments sont mesurés et le total = borne à borne (pas la somme) | unit | `npm test -- boot-marks` | ❌ Wave 0 |
| COLD-01 | La section Amorçage rend 4 segments + total (faits, libellés honnêtes) | component | `npm test -- offline-panel` (fichier existant à étendre) | ✅ étendre |
| COLD-01 | Aucune écriture IndexedDB ajoutée au démarrage (PD-02) | unit (grep/test) | test qui refuse tout `set(`/`persistQueryClientSave` nouveau dans boot-marks | ❌ Wave 0 |
| COLD-02 | — (mesure on-device, non automatisable) | manual-only | protocole doc mesures ; justification : PM-01 exige l'appareil réel | — |
| CACHE-01 | Si maxAge change : politique et tests divergents refusés | unit | `npm test -- query-policy` (Test H existe) | ✅ |
| CACHE-01 | Purge outbox indépendante du maxAge (régression) | unit | `npm test -- query-persistence` | ✅ |

### Sampling Rate
- **Per task commit:** `cd app && npm run typecheck && npm test`
- **Per wave merge:** chaîne §2.7 complète (typecheck, tests, build, e2e si Docker ; check-sql-statique non requis — aucune migration SQL dans cette phase)
- **Phase gate:** build prod vert + doc mesures versionné avec mesures avant/après consignées + décision CACHE-01 dans PROJECT.md

### Wave 0 Gaps
- [ ] `app/src/lib/boot-marks.test.ts` — module de marks (bornes, store, total)
- [ ] Extension `offline-panel` tests — section Amorçage
- [ ] Aucun framework à installer

## Security Domain

> security_enforcement absent de config.json = activé. Cette phase n'ajoute aucune surface d'auth, de réseau ni de stockage de données personnelles : les marks portent des durées, le panneau affiche des durées et des compteurs (discipline T-35-18 déjà en place : aucun contenu de ligne).

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2/V3/V4/V6 | no | Aucune auth/session/crypto touchée |
| V5 Input Validation | no | Aucune entrée utilisateur nouvelle |
| V9 Communications | no | Aucun appel réseau nouveau (PD-03 : marks locaux uniquement) |

**Point de vigilance unique :** la section Amorçage ne doit jamais afficher plus que des durées et compteurs — pas d'identifiants, pas de clés de cache complètes (l'estampille de build existante suit déjà la règle D-11 : SHA court à l'écran, complet au survol ; s'inspirer de ce patron si une valeur technique devait être montrée).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Support `performance.mark`/`measure` universel sur l'appareil Android cible (Chromium) | Standard Stack | Faible : API core depuis des années ; vérifiable au premier run |
| A2 | `registerSW` avec `immediate: true` → `onRegisteredSW` se déclenche de façon mesurable au cold start (et pas seulement après activation différée) | Pitfall 3 / axes | Moyen : si l'activation SW est post-`ready`, le segment SW déborde de la fenêtre de mesure — le protocole doit alors définir sa borne explicitement (consigner si SW hors fenêtre) |
| A3 | La purge par uninstall PWA efface bien `eo-offline-cache` (IndexedDB d'origine app) | Pattern 3 | Faible : comportement standard Chromium ; vérifiable au premier run (panneau « pas encore sur cet appareil ») |
| A4 | La lecture du panneau pour CACHE-01 suffit sans trace DevTools supplémentaire | Architecture | Faible : `inspectPersistedCache` fournit age/maxAge/pruneEligible par famille ; DevTools reste un repli optionnel |

## Open Questions

1. **Quelle branche hors-ligne du bootstrap porte le mark « auth bootstrap » ?**
   - What we know: deux chemins existent — `cheminHorsLigneValide` (rejet applySession hors-ligne, use-auth.ts:355-361) et la branche session+foyer en ligne (use-auth.ts:383-414) ; les deux appellent `connectOfflineCache` (l.262 et l.402).
   - What's unclear: lequel est emprunté dans les conditions PM-02 (réseau coupé, session déjà établie avant coupure ?) — dépend de l'état du jeton GoTrue au moment du cold start.
   - Recommendation: le protocole décrit le scénario exact (PWA déjà installée, session existante, réseau coupé au lancement) ; les marks sont posés dans les DEUX branches (le segment est le même), et le doc mesures consigne la branche réellement empruntée par run.

2. **N = combien de runs par condition ?**
   - What we know: PM-01 exige médiane de N, N au discretion de l'agent.
   - Recommendation: N = 5 (compromis variance/coût sur appareil manuel) ; consigné dans le protocole AVANT les mesures (CA-02 l'impose pour les critères, l'étendre au N).

## Sources

### Primary (HIGH confidence)
- `app/src/lib/query-policy.ts` (lu intégral) — OFFLINE_FAMILIES verbatim : 9 familles `maxAgeMs: 24 * 60 * 60 * 1000`, 2 familles (`household_members`, `profiles`) `maxAgeMs: 7 * 24 * 60 * 60 * 1000` [VERIFIED: app/src/lib/query-policy.ts:79-93] ; gcTime 7 j l.37
- `app/src/lib/offline/query-persistence.ts` (lu intégral) — `connectOfflineCache`, `restoreOfflineCache`, `pruneExpiredFamilies`, `famillePerimee`, `inspectPersistedCache`, `getRestoreOutcome`, outbox exempte de prune et sans maxAge [VERIFIED: app/src/lib/offline/query-persistence.ts:289-326, 349-371, 422-453, 475-488]
- `app/src/lib/sw-register.ts` (lu intégral) — `registerSW({ immediate: true, onRegisteredSW })`, store `useSwState` [VERIFIED: app/src/lib/sw-register.ts:26-36]
- `app/src/main.tsx` (lu intégral) — ordre module : seedOnlineStatus → sw-register import → sonde → StrictMode render ; harnais e2e conditionnel [VERIFIED: app/src/main.tsx:5-40, 75-90]
- `app/src/hooks/use-auth.ts` — `DELAI_GARDIEN_AMORCAGE_MS = 10_000` (l.111), branches bootstrap et `connectOfflineCache` (l.262, l.402) [VERIFIED: lectures ciblées]
- `app/src/modules/parametres/components/offline-panel.tsx` (l.1-120) — patron d'affichage, RestoreOutcome + inspectPersistedCache déjà consommés, estampille D-11/D-13 [VERIFIED: app/src/modules/parametres/components/offline-panel.tsx:16-22, 32-55]
- `.planning/phases/42-.../42-CONTEXT.md` — décisions verbatim
- Grep `performance\.` dans app/src : **0 hits** — aucune instrumentation existante [VERIFIED: grep ce session]

### Secondary (MEDIUM confidence)
- `.planning/PROJECT.md` (grep) — CACHE-01 décision produit, amorçage ≈ 30-40 s observé, doc à créer dans PROJECT.md
- `.planning/STATE.md` (grep) — signature 38-E2E-SIGNATURE.md comme patron de doc versionné ; biais d'ordre maxAge

### Tertiary (LOW confidence)
- Web Performance API support [ASSUMED]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zéro dépendance nouvelle, API native
- Architecture (points d'insertion des marks): HIGH — tous les fichiers lu ce session
- Pitfalls: MEDIUM — Pitfall 2/3 reposent sur le comportement prod de StrictMode et du cycle de vie SW [ASSUMED], à confirmer au premier run

**Research date:** 2026-11-10
**Valid until:** 30 jours (code stable, aucune dépendance mouvante)
