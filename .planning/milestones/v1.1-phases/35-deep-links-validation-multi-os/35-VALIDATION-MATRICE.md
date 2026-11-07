# Grille de validation multi-OS — Phase 35 (Deep links & validation multi-OS)

**Date de création :** 2026-11-06
**Build testé :** `v1.0-109-g5c6a0cb` (code final du Plan 01 — commits `f7d281b`, `b02d32a`, et Plan 35-03 `d67f18d`)
**Rappel D-13 :** cette grille teste le **code final du Plan 01**, jamais du code intermédiaire. Avant toute étape on-device, la chaîne §2.7 du Plan 01 doit être verte : `cd app && npm run typecheck && npm test && npm run build && npm run test:e2e`.

**Ordre de passage FIXE (D-12) :** (1) Matrice offline → (2) Gate SW « file vide » → (3) Checklist « looks done but isn't » → (4) Quirks iOS attendus (lecture préalable, à confronter au réel).

**Vocabulaire de cellule — fermé, aucune case vide implicite (D-11) :**
`Passé | Échoué | Quirk: … | Non testé (appareil absent)`
Une cellule ne peut porter que l'une de ces quatre valeurs. Chaque consignation mentionne l'appareil, la version d'OS et la date. Un « Échoué » n'est pas un échec de passage : c'est un résultat consigné qui ouvre un travail correctif.

**Appareils du passage (2026-11-06) :** Desktop Chrome ; Android 16 Chrome. iOS absent → cellules `Non testé (appareil absent)`.
**Modalité :** consignation guidée question par question (session orchestrateur), réponses utilisateur directes.

---

## 1. Matrice offline complète

### 1.1 Installation

| Cas | Étapes Desktop | Étapes Android | Étapes iOS |
|---|---|---|---|
| Install (invite / guide) | 1. Ouvrir `https://app.votredomaine.fr` dans Chrome/Edge. 2. Vérifier l'icône d'installation dans la barre d'adresse (ou menu ⋮ → « Installer »). 3. Installer et relancer en fenêtre autonome. | 1. Ouvrir l'app dans Chrome. 2. Repérer l'invite d'installation (banner « Ajouter à l'écran d'accueil ») ou ⋮ → « Installer l'application ». 3. Installer ; l'icône apparaît sur l'écran d'accueil. | 1. Ouvrir l'app dans Safari. 2. Suivre le guide d'installation manuel in-app (32-03) : Partager → « Sur l'écran d'accueil ». 3. Lancer depuis l'icône (PWA, pas d'invite native). |

| Cas | Desktop | Android | iOS | Appareil / OS / date / notes |
|---|---|---|---|---|
| Install | **Passé** | **Passé** | Non testé (appareil absent) | Desktop Chrome ; Android 16 Chrome ; 2026-11-06 |

### 1.2 Raccourcis manifest

| Cas | Étapes Desktop | Étapes Android | Étapes iOS |
|---|---|---|---|
| Raccourcis « Tâches du jour » → `/taches/jour` | Pas de raccourcis app (hors périmètre desktop) — consigner `Non testé (appareil absent)` ou vérifier les éventuels raccourcis de fenêtre installée. | 1. Après mise à jour du SW + relaunch. 2. Appui long sur l'icône. 3. Le raccourci « Tâches du jour » apparaît ; le taper cold-start, app déconnectée si possible → atterrit sur `/taches/jour`. | L'OS ignore le champ `shortcuts` du manifest (quirk attendu, section 4) — vérifier que la vue est **atteignable in-app** (depuis Accueil → Tâches → bouton « jour ») plutôt qu'en raccourci natif ; consigner `Quirk:` si un raccourci natif existe malgré tout. |

| Cas | Desktop | Android | iOS | Appareil / OS / date / notes |
|---|---|---|---|---|
| Raccourcis (DLNK-03, cible `/taches/jour`) | **Passé** (raccourcis de fenêtre installée vérifiés) | **Passé** (raccourci visible à l'appui long, cold-start déconnecté atterrit sur `/taches/jour`) | Non testé (appareil absent) | Desktop Chrome ; Android 16 Chrome ; 2026-11-06 |

### 1.3 Lecture offline avec bandeau de fraîcheur — par module Tier 1 (chaque module, pas un seul)

Modules Tier 1 d'après `OFFLINE_FAMILIES` (`app/src/lib/query-policy.ts`) : **Courses** (shopping_lists, shopping_list_items, products), **Tâches** (task_lists, tasks, task_assignees — dont la vue `/taches/jour`), **Routines** (routine_folders, routines, routine_completions). Annexes de rendu : household_members, profiles (avatars, color_tag).

Étapes communes : 1. Se connecter et naviguer dans chaque module pour hydrater le cache. 2. Couper le réseau (Wi-Fi off / mode avion). 3. Fermer puis relancer l'app (cold-start). 4. Ouvrir chaque module et vérifier : rendu depuis le cache + bandeau « dernier état connu » (horodatage de fraîcheur) présent. 5. Vérifier `/taches/jour` spécifiquement : retards en rouge en haut, tâches du jour ensuite, assignés avec color_tag visibles.

| Module | Desktop | Android | iOS | Appareil / OS / date / notes |
|---|---|---|---|---|
| Courses (listes + items + produits) | **Passé** | **Passé** | Non testé (appareil absent) | Desktop Chrome ; Android 16 Chrome ; 2026-11-06 |
| Tâches (page complète) | **Passé** | **Passé** | Non testé (appareil absent) | Desktop Chrome ; Android 16 Chrome ; 2026-11-06 |
| Tâches du jour `/taches/jour` (retards rouges, assignés color_tag) | **Passé** | **Passé** | Non testé (appareil absent) | Desktop Chrome ; Android 16 Chrome ; 2026-11-06 |
| Routines (dossiers + complétions) | **Passé** | **Passé** | Non testé (appareil absent) | Desktop Chrome ; Android 16 Chrome ; 2026-11-06 |
| Bandeau de fraîcheur affiché sur CHACUN de ces modules | **Passé** | **Passé** | Non testé (appareil absent) | Desktop Chrome ; Android 16 Chrome ; 2026-11-06 |

### 1.4 Deep link raccourci, cold-start déconnecté, AVEC session (DLNK-02)

Étapes par OS : 1. Connecté, cache hydraté. 2. Couper le réseau. 3. Cold-start (fermer/rouvrir) via le raccourci « Tâches du jour » (Android : appui long ; desktop : URL `…/taches/jour` en fenêtre installée ; iOS : icône puis navigation in-app). 4. Constater : `/taches/jour` rendue depuis le cache, pas d'écran de connexion, pas d'erreur technique.

| Cas | Desktop | Android | iOS | Appareil / OS / date / notes |
|---|---|---|---|---|
| Cold-start déconnecté avec session → vue cible | **Échoué** — écran blanc / erreur technique au lieu de la vue | **Échoué** — écran blanc / erreur technique au lieu de la vue | Non testé (appareil absent) | Desktop Chrome ; Android 16 Chrome ; 2026-11-06. Attendu : vue rendue depuis le cache. Observé : erreur technique / écran blanc, sur les deux OS. **Ouvre un travail correctif (DLNK-02).** |

**Rejeu après correctif 35-04 (2026-11-06, build ≥ v1.0-116) — §1.4 deep link cold-start hors-ligne AVEC session (résultat : Desktop **Passé**, Android 16 **Échoué**) :**

| Cas | Desktop | Android | Appareil / OS / date / notes |
|---|---|---|---|
| Cold-start déconnecté avec session → vue cible (rejeu §1.4) | **Passé** — « ça a bien marché sur desktop » | **Échoué** — l'écran de chargement du bootstrap « Chargement de votre foyer » s'affiche encore au cold-start hors-ligne avec session, au lieu de `/taches/jour` rendue depuis le cache | Desktop Chrome ; Android 16 Chrome ; 2026-11-06 (rejeu après 35-04). **Gap 1 partiellement clos on-device : Desktop Passé, Android Échoué.** Ouvre une vérification complémentaire (Android) — symptôme : « encore chargement de votre foyer ». Piste diagnostique (à vérifier, pas un correctif) : le SW n'a peut-être pas pris le contrôle sur Android malgré le version check, ou le chemin de restauration du foyer persisté (zustand persist) se comporte différemment au cold-start Android. |

**Rejeu final après chaîne de correctifs 35-06→35-10 (2026-11-07, bundle v1.0-149-g0e65444) — §1.4 deep link cold-start hors-ligne AVEC session (résultat : Android 16 **Passé** — DLNK-02 CLOS) :**

| Cas | Android | Appareil / OS / date / notes |
|---|---|---|
| Cold-start déconnecté avec session → vue cible (rejeu final §1.4) | **Passé** — « ca marche ! » | Android 16 Chrome ; 2026-11-07 (mode avion, fermeture complète, deep link `/taches/jour`, bundle v1.0-149-g0e65444). Bandeau hors-ligne affiché (sonde 35-07), session conservée (35-08), lignes des tâches rendues depuis le cache sans carte d'erreur (35-10). Chaîne de re-tests intermédiaires consignée dans 35-UAT.md test 3 : post-35-06 « Failed to fetch » (H1) → post-35-07 « connexion requise » (purge gardien) → post-35-09 TypeError résiduel (annexes) → post-35-10 **Passé**. **DLNK-02 Android clos ; Desktop déjà Passé au rejeu 35-05. iOS reste Non testé (appareil absent).** |

### 1.5 Deep link hors-ligne SANS session (D-07)

Étapes par OS : 1. Déconnecter (signOut) puis couper le réseau. 2. Cold-start sur la cible du raccourci (Android : appui long ; desktop : URL directe en fenêtre installée ; iOS : navigation in-app après ouverture). 3. Constater : écran explicite « connexion requise pour cette vue » (Plan 35-03) — jamais une erreur technique générique ni le formulaire qui échoue en boucle.

| Cas | Desktop | Android | iOS | Appareil / OS / date / notes |
|---|---|---|---|---|
| Hors-ligne sans session → écran « connexion requise » | **Échoué** — écran « Chargement de votre foyer » puis « Votre foyer n'a pas pu être chargé » + bouton Réessayez | **Échoué** — idem | Non testé (appareil absent) | Desktop Chrome ; Android 16 Chrome ; 2026-11-06. Attendu : écran D-07 « connexion requise pour cette vue ». Observé : écran de chargement de foyer + erreur foyer, sur les deux OS. **Ouvre un travail correctif (D-07) : l'écran 35-03 n'est pas atteint sur ce chemin.** |

**Rejeu après correctif 35-04 (2026-11-06, build ≥ v1.0-116) — §1.5 deep link hors-ligne SANS session (résultat : **Passé** sur Desktop Chrome ET Android 16) :**

| Cas | Desktop | Android | Appareil / OS / date / notes |
|---|---|---|---|
| Hors-ligne sans session → écran « connexion requise » (rejeu §1.5) | **Passé** — « ok » | **Passé** — « ok pour les 2 » | Desktop Chrome ; Android 16 Chrome ; 2026-11-06 (rejeu après 35-04). Écran D-07 « connexion requise pour cette vue » atteint sur les deux OS. **Gap 2 clos on-device.** |

### 1.6 Rejeu foreground avec badge / panneau

Étapes par OS : 1. Connecté. 2. Couper le réseau, faire une écriture (cocher une tâche) → la file la met en attente, badge visible. 3. Ouvrir Paramètres → panneau offline : l'entrée est listée « en attente ». 4. Rétablir le réseau et ramener l'app au premier plan (sur mobile : passer en arrière-plan puis revenir — le rejeu se déclenche au foreground, pas en Background Sync). 5. Constater : la file se vide, l'écriture atteint le serveur, le badge disparaît.

| Cas | Desktop | Android | iOS | Appareil / OS / date / notes |
|---|---|---|---|---|
| Rejeu au foreground, badge + panneau cohérents | **Passé** | **Passé** | Non testé (appareil absent) | Desktop Chrome ; Android 16 Chrome ; 2026-11-06 |

### 1.7 Purge inter-utilisateurs A→B, même appareil

Étapes par OS : 1. Utilisateur A connecté, cache hydraté (ouvrir les 3 familles Tier 1), faire une écriture hors-ligne en file. 2. Déconnecter A (signOut) → purge `queryClient.clear()` + persister + file awaitée avant navigation. 3. Se connecter avec B. 4. Constater : aucune donnée de A visible dans B (tâches, courses, routines, assignés), badge de file à zéro pour B. 5. Ramener le réseau : la file de B est vide, rien de A ne rejoue.

| Cas | Desktop | Android | iOS | Appareil / OS / date / notes |
|---|---|---|---|---|
| Purge A→B, zéro fuite de cache ou de file | **Passé** | **Passé** | Non testé (appareil absent) | Desktop Chrome ; Android 16 Chrome ; 2026-11-06. **Procédure corrigée en cours de test** : la connexion de B hors-ligne est impossible par construction (auth exige le réseau — « Failed to fetch » attendu) ; B est connecté après retour du réseau. Aucune donnée de A visible dans B, badge à zéro. Observation : un avertissement « Écritures en attente — perdues si vous vous déconnectez » s'affiche au signOut avec file non vide. **Défaut de la grille elle-même** (étape 3 irréalisable hors-ligne) — à corriger dans une révision. |

---

## 2. Gate SW « file vide » (critère 4 — vérification seulement, code branché en 32/34)

Code : `app/src/components/banners/update-banner.tsx:19,29-32` (bouton `disabled={!isEmpty}`, labels « Recharger » / « Mise à jour en préparation… ») et `app/src/modules/parametres/components/offline-panel.tsx:60,137-145` (même gate, « Appliquer maintenant »).

Étapes par OS : 1. Connecté, réseau coupé. 2. Faire une écriture hors-ligne (la file porte ≥ 1 entrée). 3. Déclencher le bandeau de mise à jour (nouvelle version du SW proposée — publier un build ou attendre la re-proposition) ; en parallèle, ouvrir Paramètres → panneau offline. 4. Constater sur les DEUX points : bouton désactivé, label « Mise à jour en préparation… ». 5. Observer pendant le rejeu de la file : **ZÉRO reload** de l'app (le rejeu ne déclenche jamais `updateSW`). 6. Vider la file (réseau revenu, rejeu terminé) → le bouton devient actif (« Recharger » / « Appliquer maintenant »). 7. Appliquer la mise à jour : reload contrôlé, aucune écriture pendante perdue.

| Cas | Desktop | Android | iOS | Appareil / OS / date / notes |
|---|---|---|---|---|
| Bouton désactivé + label « Mise à jour en préparation… » (file non vide) — bandeau | Non testé (mise à jour SW non déclenchable pendant le passage) | Non testé (idem) | Non testé (appareil absent) | 2026-11-06 — aucun nouveau build publié pendant le passage ; le gate nécessite une proposition de mise à jour SW. **À rejouer à la prochaine mise en production.** |
| Même constat — panneau Paramètres (« Appliquer maintenant ») | Non testé (mise à jour SW non déclenchable pendant le passage) | Non testé (idem) | Non testé (appareil absent) | idem |
| ZÉRO reload pendant le rejeu | Non testé (mise à jour SW non déclenchable pendant le passage) | Non testé (idem) | Non testé (appareil absent) | idem |
| File vidée → bouton actif, application sans perte | Non testé (mise à jour SW non déclenchable pendant le passage) | Non testé (idem) | Non testé (appareil absent) | idem |

> Note de consignation (D-11, honnêteté) : « Non déclenchable » ne fait pas partie du vocabulaire fermé ; consigné en `Non testé` avec la raison explicite ci-dessus, jamais coché.

---

## 3. Checklist « looks done but isn't » (PITFALLS.md:248-259)

> Note de consignation : le plan annonce 11 items ; `PITFALLS.md:248-259` contient **10 items** (relecture directe, 2026-11-06). Les 10 sont intégrés intégralement ci-dessous — rien n'a été omis. Cet écart est documenté dans le SUMMARY.

Chaque item porte sa preuve attendue nommée (commande, e2e existant, ou étape on-device). Les e2e/命令 automatisés peuvent être (re)passés avant la mise sur appareils ; les items on-device se consignent ici.

| # | Item | Preuve attendue (nommée) | Statut (Preuve exécutée / Quirk / Échec, + OS concernés, date) |
|---|---|---|---|
| 1 | **Offline read :** chaque module offline affiche l'horodatage de fraîcheur — vérifier chaque module, pas un seul | Étape on-device : section 1.3 ci-dessus (ligne « Bandeau de fraîcheur »), constaté sur Courses + Tâches + `/taches/jour` + Routines | **Passé** — cf. section 1.3 (Desktop Chrome, Android 16, 2026-11-06) |
| 2 | **Write queue :** écriture vers une ligne supprimée serveur → échec **surfaced** au reconnect | e2e existant du module outbox (`cd app && npm run test:e2e`, specs outbox) ; complément on-device : supprimer côté serveur une tâche cochée hors-ligne par un autre membre, ramener le réseau → échec visible (réessayer/abandonner) | **Échoué** — Desktop Chrome ; Android 16 ; 2026-11-06. Scénario : tâche cochée hors-ligne par A, supprimée côté serveur pendant ce temps, réseau revenu. Observé : **échec silencieux, entrée de file évaporée** — aucun message surfaced, pas d'option réessayer/abandonner. **Ouvre un travail correctif (outbox).** Premier essai (cochage concurrent A/B sans suppression) hors sujet, consigné pour mémoire. |
| 3 | **Idempotence :** une écriture ambiguë rejouée crée exactement une ligne | Contrainte unique + test SQL négatif : `sh scripts/test-db.sh` (machine avec Docker) ; complément on-device : cocher la même tâche deux fois hors-ligne puis rejouer → une seule mutation serveur | **Passé** — complément on-device (Desktop Chrome ; Android 16 ; 2026-11-06). Preuve SQL `test-db.sh` non exécutée pendant ce passage (voir SUMMARY). |
| 4 | **Logout / switch foyer :** `queryClient.clear()` + purge persister + purge file awaitées avant navigation | e2e deux utilisateurs : `cd app && npm run test:e2e` (spec offline-shared-device si backend configuré) ; complément on-device : section 1.7 ci-dessus | **Passé** — cf. section 1.7 (Desktop Chrome, Android 16, 2026-11-06) |
| 5 | **Rejeu sous mauvaise identité :** entrée de A ne rejoue que sous A | e2e / test unitaire outbox (`cd app && npm test`, tests use-outbox / rejeu) ; complément on-device : file de A non vide → déconnexion → connexion B → reseau : rien ne rejoue sous B (cf. 1.7) | **Passé** — cf. section 1.7 (2026-11-06) |
| 6 | **Update flow :** nouvelle version SW proposée, gated sur file vide, application sans perte d'écritures pendantes | **Sur appareil** : section 2 ci-dessus (gate SW complète) | **Non testé** — cf. section 2 (mise à jour SW non déclenchable, 2026-11-06) |
| 7 | **Manifest shortcuts :** apparaissent après update SW + relaunch sur Android ; chaque deep link résout cold-start déconnecté — les 3 OS | Étape on-device : sections 1.2 + 1.4 (Android appui long ; desktop URL directe ; iOS navigation in-app, quirk attendu) | **Échoué** — raccourcis OK (section 1.2, Desktop + Android 16) mais le deep link cold-start déconnecté échoue (section 1.4, écran blanc/erreur). 2026-11-06. |
| 7-rejeu | **Rejeu item 7 après 35-04** (rejeu §1.4 + §1.5, 2026-11-06, build ≥ v1.0-116) | Sections 1.4 + 1.5 (tables « Rejeu ») | **Échoué (partiel)** — rejeu §1.4 : Desktop **Passé**, Android 16 **Échoué** (« encore chargement de votre foyer » au cold-start hors-ligne avec session). Rejeu §1.5 : Desktop + Android 16 **Passé**. 2026-11-06. |
| 8 | **iOS :** push depuis PWA installée, demande de persistance du stockage, guide d'install manuel, rejeu au foreground | **Vrai iPhone** : 1. push de test reçue avec l'app installée ; 2. panneau Paramètres → persistance demandée et accordée ; 3. guide 32-03 suivi (cf. 1.1) ; 4. rejeu au retour foreground (cf. 1.6) | Non testé (appareil absent) — 2026-11-06 |
| 9 | **SW denylist :** aucune route de cache runtime ne matche `/rest/`, `/auth/`, `/storage/`, `/realtime/`, `/functions/` | Commande : `python3 scripts/check-sql-statique.py` (contrôle statique livré OFFR-05 phase 33, prouvé must-fail) — doit rester vert | **Passé** — exécuté 2026-11-06 : « 230 fonction(s) effective(s) sur 179 migration(s) et 106 test(s), aucun défaut », exit 0 |
| 10 | **Connectivity truth :** portail captif ne rejoue pas la file dans le vide | Étape on-device / mock : `navigator.onLine` true mais réponses rejetées (portail captif hôtel/café ou AP bloquant) → la file reste en attente, échecs surfaced, pas de perte silencieuse | Non testé (pas de portail captif disponible) — 2026-11-06 |

---

## 4. Quirks iOS attendus (pré-remplis — à confronter au réel, D-11)

Ces comportements sont **attendus** sur iOS, documentés à l'avance pour la lecture honnête de la grille. La consignation réelle corrige si le comportement diffère — c'est exactement l'objet de la matrice.

**Confrontation non réalisée ce passage (appareil iOS absent, 2026-11-06).**

| Quirk | Comportement attendu | Constat réel (appareil / version iOS / date) |
|---|---|---|
| ITP — éviction du stockage script-writable ≈ 7 jours sans visite ([ASSUMED] A2 du RESEARCH.md, MEDIUM non prouvable hors appareil) | Le cache IndexedDB de lecture peut être purgé par Safari/WebKit après ~7 jours sans ouverture de la PWA : la vue `/taches/jour` cold-start déconnecté peut alors être vide jusqu'à reconnexion. Consigner le comportement observé même s'il diffère de l'hypothèse. | Non confronté (appareil absent) |
| Raccourcis du manifest ignorés par l'OS | iOS n'affiche pas les raccourcis au appui long : la vue « Tâches du jour » est atteignable in-app uniquement. Consigner `Quirk:` sur la ligne raccourcis iOS. | Non confronté (appareil absent) |
| Background Sync absent → rejeu foreground seulement | Le rejeu de la file ne survient qu'au retour au premier plan (jamais en arrière-plan) : cf. étape 1.6 sur iOS. | Non confronté (appareil absent) |
| Installation manuelle Safari (pas d'invite native) | L'install passe par le guide in-app 32-03 (Partager → Sur l'écran d'accueil) : cf. étape 1.1. | Non confronté (appareil absent) |

---

## Mode d'emploi de la consignation (rappel)

1. Remplacer chaque cellule `☐ Passé / Échoué / Quirk: … / Non testé (appareil absent)` par **exactement une** des quatre valeurs, avec appareil, version d'OS et date dans les colonnes/notes.
2. Un `Échoué` se consigne tel quel, avec contexte (ce qui était attendu, ce qui a été observé) — il ouvre un travail correctif, il ne « rate » pas le passage.
3. Les appareils absents restent `Non testé (appareil absent)`, jamais cochés (Pitfall 1, §2.7 F).
4. Une fois TOUTE la grille consignée et confirmée par l'utilisateur, la ligne `CONFIRMATION-CONSIGNATION` est apposée en fin de document (jamais avant la confirmation explicite).

## Récapitulatif du passage (2026-11-06)

| Résultat | Compte | Détail |
|---|---|---|
| Passé | 1.1, 1.2, 1.3 (×5), 1.6, 1.7, items 1/3/4/5/9 | Offline read + bandeau, raccourcis, rejeu foreground, purge A→B, idempotence, denylist |
| Échoué | 1.4, 1.5, item 2, item 7 | **DLNK-02** : cold-start déconnecté avec session → écran blanc (2 OS). **D-07** : sans session → écran « Chargement de votre foyer » au lieu de « connexion requise » (2 OS). **Outbox** : écriture vers ligne supprimée = échec silencieux (entrée évaporée). |
| Non testé | Section 2 (×4), item 6, item 8, item 10, section 4 (×4), iOS partout | Mise à jour SW non déclenchable (aucun build publié) ; iOS absent ; pas de portail captif |

**Défaut de grille identifié** : 1.7 étape 3 (connecter B hors-ligne) est irréalisable par construction — corrigé en cours de passage (connexion de B après retour du réseau).

---

`CONFIRMATION-CONSIGNATION` — consignation complète confirmée explicitement par l'utilisatrice/utilisateur le 2026-11-06 (passage guidé question par question, desktop Chrome + Android 16 Chrome ; iOS absent). Trois résultats `Échoué` consignés (DLNK-02, D-07, outbox silencieux) et des `Non testé` raisonnés — ils ouvrent des travaux correctifs, ils n'invalident pas le passage.

**Rejeu du 2026-11-06 (plan 35-05, après correctif 35-04, build ≥ v1.0-116) :** résultats rapportés par l'utilisateur dans la conversation le 2026-11-06 et consignés en tables « Rejeu » des sections §1.4 et §1.5 ainsi qu'à l'item 7-rejeu. Rejeu §1.5 : **Passé** sur Desktop Chrome et Android 16. Rejeu §1.4 : **Passé** sur Desktop Chrome, **Échoué** sur Android 16 (« encore chargement de votre foyer » au cold-start hors-ligne avec session) — consigné avec symptôme, l'historique du passage initial est intact.
