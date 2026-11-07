---
status: partial
phase: 35-deep-links-validation-multi-os
source: [35-VERIFICATION.md]
started: 2026-11-06T18:30:00Z
updated: 2026-11-06T20:10:00Z
---

## Current Test

number: 3
name: Rejeu Android §1.4 — PASSÉ post-35-10 (chaîne G-35-3 → G-35-6 close)
awaiting: [none]

## Tests

### 1. Matrice iOS réelle (install, raccourcis, lecture offline avec bandeau, rejeu foreground, purge A→B, deep link cold-start, quirks ITP/éviction)
expected: Chaque cellule iOS consigne un statut réel daté ; rien n'est coché à tort. Le critère roadmap « trois OS » ne peut être déclaré atteint qu'après ce passage.
result: skipped
reason: "Appareil iOS non disponible — archivé par l'utilisateur ; les cellules matrice restent « Non testé (appareil absent) », l'absence reste consignée honnêtement (jamais cochée à tort)"

### 2. Gate SW « file vide » déclenché on-device (à la prochaine mise en production)
expected: |
  Avec une file d'écriture non vide et une proposition de mise à jour SW réelle : bouton désactivé + label « Mise à jour en préparation… » sur update-banner ET panneau Paramètres, zéro reload pendant le rejeu, puis file vidée → bouton actif.
result: skipped
reason: "Reporté au jour d'un rebuild réel — le gate exige une proposition de mise à jour SW réelle (aucun build publié pendant les passages) ; le code est vérifié (update-banner.tsx:29, offline-panel.tsx:142), rejeu consigné dans la matrice §2 à la prochaine mise en production"

### 3. Rejeu Android §1.4 après le diagnostic DLNK-02 Android
expected: |
  Cold-start déconnecté avec session sur Android 16, deep link /taches/jour → la vue rend depuis le cache persisté (plus d'écran « Chargement de votre foyer »). Sur Passé consigné : celler l'item deferred-items.md et lever le bloqueur STATE.md.
result: passed
reported: "ca marche !" (2026-11-07, bundle v1.0-149-g0e65444)
analysis: |
  PASSÉ on-device — chaîne complète : bandeau hors-ligne (sonde 35-07 prouvée), session conservée (35-08, chemin authentifié-hors-ligne), lignes des tâches rendues depuis le cache SANS carte d'erreur (35-10, composeOfflineAwareError sur les annexes non persistées, isError gaté sur hasData). Historique des re-tests intermédiaires : post-35-06 « chargement puis Failed to fetch » (H1) ; post-35-07 « connexion requise » (purge de session au gardien, G-35-5) ; post-35-09 bandeau OK mais TypeError résiduel (annexes, G-35-6). Chaîne G-35-3 → G-35-6 CLOSE.
next: "Celler l'item DLNK-02 Android dans deferred-items.md et lever le bloqueur STATE.md."

## Summary

total: 3
passed: 1
issues: 0
pending: 0
skipped: 2
blocked: 0

## Gaps

- gap_id: G-35-6
  truth: "Cold-start déconnecté avec session valide sur Android 16, deep link /taches/jour → la vue rend depuis le cache persisté SANS carte d'erreur réseau brute (le message honnête 35-09 « pas encore sur cet appareil » si cache vide, lignes rendues si cache présent)"
  status: failed
  reason: "Rejeu post-35-09 (2026-11-07, bundle v1.0-143) : bandeau « vous êtes hors ligne » affiché (sonde 35-07 PROUVÉE on-device), puis vue Tâches du jour avec « TypeError: failed to fetch ». Cause localisée : use-taches.ts:352-357 compose isError/error au-dessus de useResource avec les requêtes d'annexe assignees/reminders — hors allowlist/persistance (décision 33-03, G-33-3) — donc SANS cache au cold-start : leur error brute écrase le MESSAGE_HORS_LIGNE_SANS_DONNEES substitué par useResource. Le garde G-33-3 n'avait prévu que le cas « cache tâches présent » ; le cas « cache tâches ABSENT » ré-affiche l'erreur réseau brute."
  severity: major
  test: 3
  artifacts:
    - app/src/modules/taches/hooks/use-taches.ts:352-357 (composition isError/error : error ?? annexe — l'annexe gagne si error principal est null… et le error principal substitué n'est pris que si non-null ; vérifier l'ordre)
    - app/src/lib/data/useResource.ts:307-313 (substitution 35-09 — fonctionne, mais son résultat est écrasé en aval)
    - app/src/modules/taches/taches-jour-page.tsx:55-58 (ErrorState rend error?.message verbatim)
    - app/src/lib/query-policy.ts:45 (D-10 networkMode 'always' — intouchable)
    - .planning/debug/35-07-probe-offline-not-flipping.md (la carte prouve cache manquant ; le bandeau prouve la sonde)
  missing:
    - Dans use-taches.ts, composer les erreurs en respectant l'état honnête : si !isOnline && data === undefined (principal OU annexe), l'error exposé doit être le MESSAGE_HORS_LIGNE_SANS_DONNEES (ou déléguer au message de useResource quand il est posé) — jamais le TypeError brut ; classe, pas instance : vérifier les autres pages qui composent isError au-dessus de useResource (grep isError ?? / composition) et appliquer le même garde
    - La sous-cause « cache absent » reste ouverte (pourquoi l'entrée tasks manquait) : le panneau « Cache hors-ligne » 35-09 doit être lu pour trancher (élagué 24h ? jamais persisté ?) — le correctif UX ci-dessus est indépendant et ne la ferme pas
    - Les requêtes d'annexe restent hors persistance (décision 33-03 inchangée) : le garde est une composition d'erreur, pas un changement de persistance
  status: failed
  reason: "Rejeu post-35-07 (2026-11-07) : sonde OK (l'app se sait hors-ligne), mais le gardien 35-06 déclenche à 10 s → cheminInvite() purgé la session persistée valide (signOut inconditionnel, use-auth.ts:192-196) car getSession() hang (H2) → RequireAuth sans session → écran D-07 « connexion requise pour cette vue ». Déconnexion de fait en mode avion."
  severity: major
  test: 3
  artifacts:
    - app/src/hooks/use-auth.ts:192-196 (cheminInvite : signOut inconditionnel — purge même d'une session valide)
    - app/src/hooks/use-auth.ts:229 (déclenchement du gardien → cheminInvite, getSession hang en mode avion, H2)
    - .planning/debug/dlnk02-android-cold-start-offline.md (H2 confirmé : GoTrue _recoverAndRefresh backoff 30s sans timeout applicatif)
    - goTrue persiste la session dans localStorage (`sb-<host>-auth-token`) avec expires_at lisible de façon SYNCHRONE — utilisable sans réseau
  missing:
    - Au déclenchement du gardien (et de tout chemin invité hors-ligne), lire la session persistée de façon synchrone (stockage GoTrue) et vérifier expires_at : VALIDE → chemin authentifié-hors-ligne (session appliquée depuis le cache sans réseau, foyer persisté, cache + bandeau — le même rendu que Desktop) ; EXPIRÉE ou absente → purge (T-35-06 inchangé : jamais de session expirée authentifiée)
    - Ne pas faire confiance au contenu au-delà de expires_at : la validité cryptographique reste une affaire de serveur — la session appliquée hors-ligne est « présumée valide jusqu'à reconnexion », toute écriture passe par l'outbox existant et la RLS serveur reste la frontière
    - Interplay D-07 : l'écran « connexion requise » doit rester réservé au VRAI sans-session (purge légitime d'une session expirée) ; avec session valide persistée il ne doit pas s'afficher

- gap_id: G-35-4
  truth: "Cold-start déconnecté avec session sur Android 16, deep link /taches/jour → la vue rend depuis le cache persisté AVEC bandeau hors-ligne (pas de carte d'erreur « Failed to fetch »)"
  status: failed
  reason: "Rejeu post-35-06 (2026-11-07) : le gardien fonctionne (routeur monté, plus de blocage infini), mais la requête des tâches part sur le réseau car navigator.onLine=true en mode avion (H1 confirmé) → carte « TypeError: Failed to fetch — Réessayer » au lieu du rendu depuis le cache + bandeau"
  severity: major
  test: 3
  artifacts:
    - .planning/debug/dlnk02-android-cold-start-offline.md (H1 : navigator.onLine non fiable sur Android — seed onlineManager depuis navigator.onLine)
    - app/src/main.tsx (seedOnlineStatus avant premier rendu)
    - app/src/hooks/use-online-status.ts (source onlineManager — le chemin « cache + bandeau » existe et est prouvé sur Desktop quand isOnline=false)
    - confirmation on-device : « Failed to fetch » affiché pendant le mode avion = l'app croit être en ligne
  missing:
    - Sonde de joignabilité RÉELLE : au boot et sur événement network change, vérifier la joignabilité effective (fetch no-cors vers l'URL Supabase avec timeout court) et mettre à jour onlineManager.setOnline(false) si injoignable — jamais l'inverse sans preuve (D-11 : ne jamais proclamer en ligne sans preuve)
    - Réévaluer la sonde au retour de l'événement online du navigateur (re-probe, pas confiance aveugle)
    - Le chemin existant « isOnline=false → cache + bandeau » reste la seule source de rendu hors-ligne (pas de nouveau mécanisme de cache)

- gap_id: G-35-3
  truth: "Cold-start déconnecté avec session sur Android 16, deep link /taches/jour → la vue rend depuis le cache persisté"
  status: fix-applied  # was: failed — plan 35-06 exécuté (commits 2c6725c..5f458fc, poussés 2026-11-06)
  fix: "35-06 : gardien d'amorçage 10 s (Promise.race sur la chaîne getSession → applySession → connectOfflineCache, échéance → chemin invité, JAMAIS onlineManager — couvre H2 hang ET H1 onLine=true) + AbortController manuel 10 s sur SupabaseAdapter.list (contrat outbox intact). Tests W1-W4 et X1-X3 vus ROUGES avant implémentation, verts après. Chaîne §2.7 : 1902/1902, e2e 6/6, build OK."
  reason: "User reported (avant correctif): j'ai toujours chargement de votre foyer sur android — re-testé sans 35-06 appliqué"
  severity: major
  test: 3
  artifacts:  # Diagnostic 2026-11-06 (.planning/debug/dlnk02-android-cold-start-offline.md)
    - app/src/hooks/use-auth.ts (gardes 35-04 tous DOWNSTREAM de getSession — dead code si la promesse hang)
    - app/src/stores/session-store.ts:177-192 (repli hors-ligne uniquement dans le catch)
    - app/src/main.tsx:25 + online-status.ts:23-31 (seedOnlineStatus depuis navigator.onLine non fiable sur Android)
    - supabase GoTrue 2.117.2 getSession → _recoverAndRefresh → _refreshAccessToken (backoff 30s, fetch sans timeout applicatif)
    - app/e2e/deep-link-redirect.spec.ts + playwright.config.ts (webServer sans VITE_SUPABASE_URL → chemin démo, jamais le chemin Supabase réel)
  missing:    # Fix direction (3 couches, la 1 suffit)
    - Watchdog de bootstrap : Promise.race sur la chaîne getSession → applySession → connectOfflineCache (8-10s), échéance → chemin invité existant (idempotent via garde active)
    - Rendre le repli loadHousehold indépendant du rejet (AbortSignal.timeout côté adaptateur, ou couvert par le watchdog)
    - Cesser de faire confiance à navigator.onLine au boot pour les branches de repli (probe de joignabilité ou traitement « onLine=true mais rejet réseau » comme hors-ligne)
  closure: "G-35-3 passe à clos UNIQUEMENT après le rejeu on-device du test 3 (D-11 — jamais clos sur la seule preuve automatisée)"
