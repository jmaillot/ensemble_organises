# Mesures du cold start offline — phase 42

**Exigence couverte :** COLD-01 (partie protocole) — le protocole et les critères sont écrits AVANT toute mesure (CA-02).
**Phase :** 42-cold-start-mesuré-puis-corrigé-décision-cache
**Écrit le :** 2026-11-10
**Exécuté par :** Plan 03 — campagne 2026-11-10, **différé d'appareil consigné (§7.1, §7.5)** : les 5 runs n'ont pas été réalisés, aucune valeur n'est inventée (§2.7 I)
**Estampille du build mesuré :** aucun build mesuré on-device dans cette campagne — la validité de l'estampille quatre canaux du SHA `a31e965…` est prouvée par `check-version-stamp.sh` (§7.6)
**Discipline de preuve :** même forme que `38-E2E-SIGNATURE.md` — chaque étape est citée avec sa commande et son résultat ; un succès muet est un échec inexpliqué (§2.7 F).

Ce document est la référence des mesures (PM-03) : les mesures ne persistent PAS dans l'app — le panneau « Amorçage » ne porte que la session en cours (PD-02), la référence versionnée est ce fichier.

---

## 1. Protocole de mesure (écrit avant toute mesure — PM-01/PM-02)

Ce protocole est écrit **avant** la première mesure et avant la lecture du panneau diagnostic pour CACHE-01 (CA-02). Les critères de la section 5 sont contraignants : la décision applique ces critères sans les réinventer.

- **Appareil de référence unique (PM-01) :** un seul appareil Android réel, celui validé pour la chaîne offline complète. **L'émulateur est explicitement exclu** : aucune mesure prise sur émulateur n'est consignée dans ce document — il n'est jamais une source de mesure.
- **Nombre de runs (N = 5) :** chaque condition (avant correction, après correction, et toute lecture CACHE-01) est mesurée sur **N = 5 runs**. La valeur consignée par condition est la **médiane** des 5 runs. Ni le minimum ni le maximum ne sont consignés comme valeur de référence ; un run aberrant n'est jamais retiré — s'il diverge, c'est un fait à consigner dans la section Écarts (§7), pas à lisser.
- **Build prod (PM-02) :** les mesures portent exclusivement sur un build de production déployé, identifié par son estampille quatre canaux (`sh scripts/check-version-stamp.sh` — preuve exigée §2.7 I). Aucune mesure sur build dev : en dev, StrictMode double-monte l'amorçage et les mesures seraient fausses.
- **Réseau coupé au lancement de mesure :** chaque run mesuré démarre avec le réseau de l'appareil coupé (mode avion), une fois la PWA installée selon la séquence §2.
- **Séquence identique par run :** chaque run suit la séquence de purge et de lancement de la section 2, à l'identique. Un écart de séquence invalide le run : il est refait, ou consigné comme écart.
- **Branche auth consignée par run (OQ-1) :** la branche réellement empruntée par le bootstrap auth (session+foyer hors ligne via `cheminHorsLigneValide`, ou branche en ligne) est consignée pour chaque run dans le tableau de résultats §7 — le segment auth absorbe les délais de repli hors ligne (sonde de joignabilité, gardien d'amorçage 10 s : `DELAI_GARDIEN_AMORCAGE_MS` dans `app/src/hooks/use-auth.ts`).
- **Segment SW absent ou ~0 :** consigné tel quel, jamais lissé (Pitfall 3 — voir §2 et §3).

## 2. Séquence de purge cache froid (PM-02, Pitfall 3)

Le « cache froid » exige que l'app reparte **sans aucun état persistant** : IndexedDB (`eo-offline-cache`), storage de l'application et service worker précaché. La purge est la **désinstallation complète de la PWA** — ni `clearDatabase` (Dexie, mode démo) ni `purgeUserCache` ne suffisent : le SW précaché et tout le storage doivent partir.

L'ordre exact, identique pour chaque run :

1. **PWA installée avec le réseau actif** — le service worker se précache pendant l'installation. Couper le réseau AVANT l'installation ferait démarrer sans SW du tout : l'ordre est imposé.
2. **Un lancement une fois** (réseau actif) — pour que l'installation et le précache soient terminés ; ce lancement n'est PAS mesuré.
3. **Réseau coupé** (mode avion).
4. **Purge = désinstallation complète de la PWA** — la désinstallation efface IndexedDB `eo-offline-cache` et le storage de l'application (comportement standard Chromium). Si un résidu est constaté (panneau affichant des données persistées au lancement suivant), l'alternative documentée est le wipe « site data » du site dans Chrome avant réinstallation — le recours à cette alternative est consigné dans la section Écarts (§7).
5. **Réinstallation de la PWA** (réseau toujours coupé pour l'installation post-purge — le précache du SW est déjà en place par l'installation initiale ; cf. Pitfall 3).
6. **Lancement mesuré** — premier lancement après réinstallation, réseau coupé, l'ouverture jusqu'au contenu est ce que mesurent les 4 segments.

Chaque run reprend la séquence depuis l'étape 1. Le comportement attendu au premier lancement post-purge : le panneau cache part d'un état « rien de persisté » ; c'est aussi la vérification A3 de la RESEARCH (la désinstallation efface bien `eo-offline-cache`).

### 2.1 Purge réellement utilisée (campagne 2026-11-10) — consignation

La campagne de mesure du Plan 03 utilise comme purge l'alternative documentée de l'étape 4, via les **paramètres Android** : « vider le cache » de l'application installée (wipe du storage système) à la place de la désinstallation complète. **Limite connue et vérifiée à chaque run :** selon la version d'Android, « Vider le cache » peut effacer le storage/IndexedDB tout en laissant le service worker et le précache intacts ou partiels. Une purge n'est donc déclarée **froide** que si les deux faits sont vrais au lancement mesuré :

1. le panneau cache affiche « rien de persisté » (vérification A3 de la RESEARCH) ;
2. le segment SW du panneau Amorçage est absent ou ~0 ms OU le lancement ne réactive pas de SW résiduel.

Si l'un des deux faits manque, **le run n'est pas froid** : il est consigné comme écart (§7.5) et la purge est refaite avec **« Effacer le stockage »** (et non seulement « Vider le cache ») ou la désinstallation complète de l'étape 4 — puis le run est refait. Aucune mesure prise sur un run non froid n'entre dans les médianes.

## 3. Définition des segments

Les 4 segments sont bornés par des `performance.mark` posés dans la séquence de démarrage réelle (instrumentation du plan 42-01, `app/src/lib/boot-marks.ts`). Ce que chaque segment contient :

| Segment | Borne début | Borne fin | Contenu |
|---|---|---|---|
| **entry chunk** | `boot:entry:debut` (niveau module, `main.tsx`, avant toute autre action) | fin de l'évaluation du bundle d'entrée jusqu'au premier rendu | évaluation du bundle d'entrée : imports de niveau module (`seedOnlineStatus`, import `sw-register`, sonde de joignabilité) et rendu initial |
| **SW** | borne entry commune (convention 42-01) | `onRegisteredSW` (`sw-register.ts`) | enregistrement du service worker ; **peut être absent hors ligne ou à ~0 ms** au cold start post-purge — l'écart entre runs est un fait à consigner, jamais lissé (Pitfall 3, hypothèse A2) |
| **idb** | autour de l'appel de `connectOfflineCache` | retour de `connectOfflineCache` | chaque appel : restore du cache TanStack depuis IndexedDB → `pruneExpiredFamilies` → `persistNow` ; les deux branches du bootstrap (`use-auth.ts` l.262 et l.402) sont marquées, la branche réellement empruntée est consignée par run |
| **auth** | borne entry commune (convention 42-01) | `setReady(true)` final (`marquerSegmentFin('auth')`) | bootstrap complet de la session : `getSession`, `applySession`/`cheminHorsLigneValide`, branches hors-ligne ; **absorbe les délais de repli hors ligne** — la sonde de joignabilité (4 s) et le gardien d'amorçage (10 s) : hors ligne, ce segment reflète ces attentes, pas du travail CPU (Pitfall 4) |

**Total = borne à borne, pas la somme (Pattern 2) :** le total consigné est `boot:done − boot:entry:debut`. Les segments se chevauchent (le SW s'active en parallèle de l'entry chunk ; l'idb est imbriqué dans l'auth) — sommer les 4 produirait un total mensonger. Le panneau affiche les deux faits (4 segments + total) sans les faire converger.

## 4. Axes candidats de correction (CU-02)

Les axes candidats sont ceux cartographiés par la RESEARCH. Toute correction livrée **nomme l'axe du profil qui la désigne** ; une correction hors profil (ex. bug découvert pendant l'instrumentation) est livrée mais consignée comme **écart** (CU-03) dans la section dédiée §7.

| # | Axe candidat | Emplacement code réel |
|---|---|---|
| 1 | Taille du entry chunk | bundle Vite (`app/dist/assets/*`) — évalué avant le premier rendu ; code-splitting du bundle d'entrée, taille précachée par le SW |
| 2 | Hydratation IndexedDB | `connectOfflineCache` (`app/src/lib/offline/query-persistence.ts`) — volume sérialisé (familles × lignes), désérialisation TanStack, prune |
| 3 | Séquence auth bootstrap | `app/src/hooks/use-auth.ts` — gardien d'amorçage 10 s (`DELAI_GARDIEN_AMORCAGE_MS`), sonde de joignabilité, branches hors-ligne ; ordre `getSession` → `applySession` → foyer |
| 4 | Activation SW | `app/src/lib/sw-register.ts` (`registerSW` → `onRegisteredSW`) — précaché lourd, enregistrement bloquant ou tardif |

Fin de boucle (CU-01) : **aucune cible chiffrée de fin de boucle n'est fixée par ce protocole.** La boucle profilage → correction → re-mesure s'arrête quand plus aucun axe à fort gain n'est désigné par le profil. La fin est désignée par le profil, pas par un seuil.

Règle de comparabilité : si une correction change la séquence de démarrage, les bornes des segments restent comparables avant/après ; tout déplacement de borne est consigné dans la section Écarts (§7) — sinon l'avant/après devient incomparable.

## 5. Critères d'arbitrage CACHE-01 par famille (CA-02, écrits AVANT la lecture du panneau)

**L'arbitrage est PAR famille (CA-01)** — jamais en deux blocs globaux « 24 h / 7 j ». Les 11 familles de `OFFLINE_FAMILIES` (`app/src/lib/query-policy.ts`) sont arbitrées individuellement, chacune selon trois critères mesurables :

- **(a) Volume réhydraté** — mesuré au panneau : lignes restaurées par famille via `inspectPersistedCache` (`ageMs`, `maxAgeMs`, `pruneEligible` par famille) et delta de prune via `getRestoreOutcome`.
- **(b) Tolérance produit à la donnée périmée** — énoncée **par espace, avant de lire les données**, une phrase par famille ci-dessous.
- **(c) Coût réseau du re-fetch après péremption** — la famille périmée est élaguée au restore puis re-chargée ; le coût est acceptable si la requête reste bornée par foyer (jointure sur `household_id`, pas de lecture globale).

**Règle de décision :** la valeur `maxAgeMs` d'une famille est **confirmée** si les trois critères (a), (b), (c) restent dans la tolérance énoncée ; sinon une nouvelle valeur est **proposée avec justification** (et si elle est retenue : un seul commit par changement de famille, `OFFLINE_FAMILIES` + tests à jour dans le même commit — Test H de `query-policy.test.ts`, commentaire gcTime à re-regarder si une valeur dépasse 7 jours). **Un statu quo justifié est une décision valide (CA-03)** : confirmer 24 h vivantes / 7 j annexes tranche CACHE-01 au même titre qu'un changement.

Tolérance énoncée par famille (écrite avant toute lecture du panneau) :

| Famille (prefix) | maxAge en vigueur | Tolérance produit énoncée (critère b) |
|---|---|---|
| `shopping_lists` | 24 h | Une liste de courses rendue peut dater de 24 h : les modifications faites entre-temps (renommage, création) manquent jusqu'au re-fetch au retour du réseau — acceptable car la liste est de toute façon re-chargée à la première interaction en ligne et le coût re-fetch est borné au foyer. |
| `shopping_list_items` | 24 h | Des articles affichés peuvent dater de 24 h : des articles ajoutés ou cochés par un autre membre manquent — acceptable car le cocher en magasin part de la liste rendue et le re-fetch au retour du réseau comble l'écart ; coût re-fetch borné à la liste. |
| `products` | 24 h | Un produit du catalogue (fidélité) rendu peut dater de 24 h : un changement de code ou de couleur manque — acceptable car le catalogue d'un foyer évolue rarement en une journée et le re-fetch est borné au foyer. |
| `task_lists` | 24 h | Une liste de tâches rendue peut dater de 24 h : une liste créée entre-temps manque — acceptable car la vue tâches est le point d'entrée naturel du re-fetch et le coût est borné au foyer. |
| `tasks` | 24 h | Une tâche rendue peut dater de 24 h : une tâche créée ou terminée hier soir manque — c'est le cas le plus sensible (données vivantes) ; acceptable tant que le re-fetch au retour du réseau est immédiat et que l'élagage n'a pas rendu une liste vide mensongère pour un foyer actif. |
| `task_assignees` | 24 h | Un assigné rendu peut dater de 24 h : une réassignation de la veille manque — acceptable car la pastille d'assigné est indicative hors ligne et le coût re-fetch est négligeable (table d'association petite). |
| `routine_folders` | 24 h | Un dossier de routines rendu peut dater de 24 h : un dossier créé entre-temps manque — acceptable car les dossiers changent rarement et le re-fetch est borné au foyer. |
| `routines` | 24 h | Une routine rendue peut dater de 24 h : une modification de RRULE de la veille manque, l'occurrence du jour peut être fausse — acceptable tant que la case du jour reste cochalbe depuis `routine_completions` (voir ligne suivante) et que le re-fetch au retour du réseau corrige la règle. |
| `routine_completions` | 24 h | Un acomplissement rendu peut dater de 24 h : la case du jour peut manquer ou paraître faite à tort — acceptable car l'écriture d'un acomplissement est validée par le backend et le re-fetch au retour du réseau réconcilie ; coût re-fetch borné à la routine. |
| `household_members` | 7 j | Un membre rendu peut dater de 7 j : avatar, nom affiché ou couleur peuvent être périmés une semaine — acceptable car ce sont des annexes de rendu (D-10) : un avatar périmé ne fait perdre aucune donnée, et la famille est petite (re-fetch négligeable). |
| `profiles` | 7 j | Un profil rendu peut dater de 7 j : nom affiché ou avatar périmé — même justification que `household_members` ; famille lisible RLS-borne, coût re-fetch négligeable. |

La purge de l'outbox est **indépendante du maxAge** (anti-feature v1.3 verrouillée, non re-discutée) : aucune décision de cette section ne touche l'outbox.

## 6. Biais d'ordre (CA-04)

L'ordre des opérations est consigné et non négociable :

1. **Instrumentation** (plan 42-01 — marks posés, section Amorçage du panneau) ;
2. **Lecture du panneau** (Plan 03 — volumes réhydratés, segments, mesures N = 5) ;
3. **Décision CACHE-01** (Plan 03 — application des critères §5, famille par famille).

Le biais connu : **le maxAge en vigueur influence le volume réhydraté observé** — une famille à maxAge court élaguera plus au restore et montrera un volume réhydraté plus faible, qui n'est pas un argument en soi pour la raccourcir ou l'allonger. Les critères (b) et (c), écrits avant la lecture des données, sont ceux qui tranchent ; le volume réhydraté (a) est un fait d'instrumentation, pas un critère de décision à lui seul. Modifier un maxAge change ce que le panneau montrera à la lecture suivante : la décision s'applique donc aux critères, jamais à l'inversion « le panneau montre peu → j'allonge ».

## 7. Résultats (vides à ce stade — à remplir au Plan 03)

> Les sections ci-dessous sont des emplacements de consignation. Aucune valeur n'y figure tant que les N = 5 runs du Plan 03 n'ont pas tourné sur l'appareil de référence.

### 7.1 Runs avant correction

**Campagne clôturée le 2026-11-10 — abandon des runs 3/4/5 (décision produit de l'utilisateur)** : les 2 runs dictés restent la totalité de la campagne. Le protocole N=5 n'est pas atteint et ne le sera pas dans cette phase : **aucune médiane, aucune conclusion de profilage, aucune décision CACHE-01**. COLD-02 et CACHE-01 sont **reportés hors phase**, leur état documenté dans PROJECT.md. Les valeurs sont dictées depuis la section « Amorçage » du panneau offline — aucune n'est inventée.

| Run | Estampille | Branche auth | entry chunk | SW | idb | auth | Total (borne à borne) |
|---|---|---|---|---|---|---|---|
| 1 | v1.2-71- | hors ligne (mode avion) | 3 ms | 20 ms | 6 ms | 437 ms | 437 ms |
| 2 | v1.2-71- | hors ligne (mode avion) | 1 ms | 9 ms | 20 ms | 17 200 ms | 17 200 ms |
| 3–5 | — | — | — | — | — | — | — |

**Observations consignées (sans conclusion, N insuffisant)** : le segment auth domine le total aux deux runs et sa variance est extrême (437 ms → 17 200 ms, ×39) — le run 2 colle au comportement documenté du protocole (Pitfall 4 : hors ligne, l'auth absorbe la sonde de joignabilité 4 s et le gardien d'amorçage 10 s). Les segments entry chunk / SW / idb restent négligeables (< 30 ms) aux deux runs.

**Écart procédure consigné (§7.5)** : après un « Effacer le stockage », la session hors ligne est détruite — le lancement suivant en mode avion atterrit sur l'écran de connexion (aucune session à restaurer) et le run n'est plus comparable (branche « session absente », non mesurée ici). Procédure de reprise après purge complète : reconnexion réseau → connexion → mode avion → « Vider le cache » seul (préserve la session dans IndexedDB) → run froid comparable.

### 7.2 Runs après correction

**Différé consigné :** aucune correction livrée — le profilage (segments du panneau on-device) n'existe pas sans mesure, et aucune correction ne peut désigner son segment source (CU-02) sans le profil. Les colonnes « après » restent vides pour la même raison que §7.1.

Condition : _estampille du build_ — à remplir. Correction livrée et axe désigné par le profil : _à remplir_.

| Run | Estampille | Branche auth | entry chunk | SW | idb | auth | Total (borne à borne) |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |
| 4 | | | | | | | |
| 5 | | | | | | | |
| **Médiane** | — | — | | | | | |

### 7.3 Volumes réhydratés par famille (lecture panneau, CACHE-01)

**Différé consigné :** la lecture du panneau (inspectPersistedCache) exige l'appareil — la campagne 2026-11-10 n'a pas produit de lecture (cf. §7.1). Les critères §5 restent écrits et contraignants ; la décision §7.4 n'est PAS rendue à partir d'aucune donnée absente (CA-02 — jamais « parce que le panneau montre… » sans panneau).

Via `inspectPersistedCache` + `getRestoreOutcome` au lancement mesuré — à remplir (N = 5, médiane).

| Famille | maxAge | Lignes restaurées (médiane) | pruneEligible (médiane) | Delta prune |
|---|---|---|---|---|
| `shopping_lists` | 24 h | | | |
| `shopping_list_items` | 24 h | | | |
| `products` | 24 h | | | |
| `task_lists` | 24 h | | | |
| `tasks` | 24 h | | | |
| `task_assignees` | 24 h | | | |
| `routine_folders` | 24 h | | | |
| `routines` | 24 h | | | |
| `routine_completions` | 24 h | | | |
| `household_members` | 7 j | | | |
| `profiles` | 7 j | | | |

### 7.4 Décision CACHE-01 par famille

**Différé consigné :** CACHE-01 n'est PAS tranchée dans cette campagne — aucune donnée du panneau (§7.3), et l'ordre consigné §6 interdit de décider sans lecture (CA-04). Les critères §5 écrits avant toute mesure demeurent la grille de décision de la campagne future ; PROJECT.md ne porte pas de section « Décision CACHE-01 » tant qu'aucune donnée ne la justifie (§2.7 I). À remplir : pour chaque famille — décision (statu quo justifié / nouvelle valeur), justification par les critères (a)(b)(c), et report de la valeur retenue dans PROJECT.md le cas échéant.

| Famille | Décision | Justification (critères a/b/c) |
|---|---|---|
| `shopping_lists` | | |
| `shopping_list_items` | | |
| `products` | | |
| `task_lists` | | |
| `tasks` | | |
| `task_assignees` | | |
| `routine_folders` | | |
| `routines` | | |
| `routine_completions` | | |
| `household_members` | | |
| `profiles` | | |

### 7.5 Écarts (CU-03)

À remplir : toute correction hors profil, tout recours au wipe « site data » à la place de la désinstallation, tout déplacement de borne de segment, tout run refait et sa cause.

- **Purge par paramètres Android (consignée 2026-11-10) :** la purge de la campagne utilise « vider le cache » via les paramètres applications Android au lieu de la désinstallation complète (alternative documentée §2.1). Chaque run est validé froid par les deux faits de §2.1 ; tout run non froid est refait après purge renforcée (« Effacer le stockage » ou désinstallation) et consigné ici.
- **Différé d'appareil (2026-11-10) :** aucune mesure de la campagne — cf. §7.1. Ce différé est la consignation de l'absence (§2.7 I), jamais un maquillage : aucune valeur de mesure, aucune valeur d'émulateur, aucune décision CACHE-01 sans données.

### 7.6 Chaîne §2.7 exécutée à l'état final du dépôt (2026-11-10)

Chaque étape citée avec son résultat (§2.7 F — un succès muet est un échec inexpliqué). Docker **disponible** : les e2e réels ont été exécutés, leur absence n'a pas à être consignée.

| Étape | Commande | Résultat |
|---|---|---|
| Estampille quatre canaux | `sh scripts/check-version-stamp.sh` | **OK** — canaux égaux au SHA `a31e965…` avec estampille, `unknown` sans, les deux familles différentes |
| Gate SW simulable | `sh scripts/test-sw-gate.sh` | **4/4 verts** (deux builds réels, même origin) |
| Typecheck | `cd app && npm run typecheck` | **OK** |
| Tests unitaires | `cd app && npm test` | **2006 passed / 245 fichiers** — 0 failed |
| Build prod | `cd app && npm run build` | **OK** — precache 152 entrées (2751,51 KiB) |
| e2e (Docker disponible) | `cd app && npm run test:e2e` | **163 passed / 9 skipped** (skips = baseline préexistante datée, 38-E2E-SIGNATURE.md) |
| Contrôle SQL statique | `python3 ../scripts/check-sql-statique.py` | **aucun défaut** — 231 fonctions effectives sur 182 migrations, 107 tests ; aucune migration ajoutée dans la phase 42, son absence de requête est un fait vérifié |
| Auto-exercice du contrôle | `python3 ../scripts/test-check-sql-statique.py` | **OK** (cas qui doivent échouer refusés) |

**CHAINE-42-VERTE** — affichée en fin de chaîne, état du dépôt après les deux commits du plan 42-03 (`17bbca0` boot:done, `a31e965` purge §2.1).
