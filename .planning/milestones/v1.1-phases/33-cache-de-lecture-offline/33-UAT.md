---
status: complete
phase: 33-cache-de-lecture-offline
source: [33-VERIFICATION.md]
started: 2026-11-05T00:45:00Z
updated: 2026-11-05T11:05:00Z
---

## Current Test

[testing complete]

## Tests

### 1. CR-01 sur appareil réel — purge inter-utilisateurs (deux comptes réels)
expected: A consulte des vues Tier 1 → déconnexion → B se connecte → les mêmes vues sont vides/téléchargent les données de B, jamais celles de A (cache mémoire et IndexedDB).
result: pass
source: human
note: Cache IndexedDB (eo-offline-cache) vérifié vide après déconnexion via DevTools → purgeUserCache effective. Données visibles pour B = partage de foyer normal (A et B même foyer), pas une fuite inter-foyers.

### 2. Mode avion réel Tier 1 — lecture depuis le cache + bandeau
expected: En ligne, consulter des vues Tier 1 → couper le réseau (mode avion) → recharger/rouvrir l'app → les vues Tier 1 restent lisibles depuis le cache et le bandeau ambre « dernier état connu le [horodatage] » s'affiche ; au retour du réseau, le bandeau disparaît.
result: pass
source: human

### 3. Mode avion hors allowlist — erreur d'origine, jamais de cache
expected: Hors ligne, ouvrir un espace non allowlisté (ex. une vue non couverte par OFFLINE_FAMILIES) → erreur d'origine honnête affichée, jamais de donnée servie depuis le cache.
result: pass
source: human
note: Re-test post-fix 33-06 (G-33-3) : les vues allowlistées restent lisibles après navigation prolongée hors ligne ; erreur d'origine conservée hors allowlist. Validé par l'utilisateur.

### 4. Contrôle visuel du bandeau « dernier état connu »
expected: Le bandeau est ambre (jamais corail), affiche un horodatage absolu en français, et n'est pas dismissable (pas de croix, pas de swipe).
result: pass
source: human
note: Libellé observé « Dernier état connu le 5 nov. à 08:57 » — horodatage absolu fr, ambre, non-dismissable.

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-33-3
  truth: "Hors ligne, une vue allowlistée Tier 1 reste lisible depuis le cache avec le bandeau ambre, même après plusieurs navigations."
  status: resolved
  resolved_by: 33-06-PLAN.md (gap_closure: true, gap_ids: [G-33-3]) — commits 8f8f37e, 4beaddb, c469fa5, 6a5ccc9
  resolved_at: 2026-11-05
  verified_at: 2026-11-05 (RE-UAT test 3 : pass)
  reason: "User reported: les vues allowlistées fonctionnent au début du mode avion, mais après quelques navigations elles affichent exactement le même message d'erreur que les vues hors allowlist (Ce contenu n'a pas pu être chargé — TypeError: NetworkError)."
  severity: major
  test: 3
  artifacts:
    - app/src/lib/query-policy.ts:39-50 — `networkMode: 'always'` : hors ligne, une requête part réellement et échoue (comportement voulu pour l'état honnête) ; `staleTime: 30_000` : toute donnée de plus de 30 s est stale → refetch au montage.
    - app/node_modules/@tanstack/query-core/build/modern/query.js (~l.441, case "error") — le reducer v5 pose `status: "error"` sans condition, même quand `state.data` existe : après un refetch échoué, `isError` vaut `true` ET `data` est toujours défini. Preuve directe du mécanisme.
    - app/src/lib/data/useResource.ts:160 — `isError: query.isError` sans test de présence de données ; idem useLinkedRows. Les hooks composés (use-taches.ts:348, use-routines.ts:393, use-courses.ts:523…) font un `||` sur ces isError.
    - Pages (ex. app/src/modules/courses/courses-page.tsx:365, taches-page.tsx:346, routines-page.tsx:158) — rendu `isError ? <ErrorState message={error?.message}/> : données` : l'erreur gagne même quand les lignes du cache existent. ErrorState (app/src/components/ui/empty-state.tsx:65-69) affiche le titre « Ce contenu n'a pas pu être chargé » et `error?.message` = « TypeError: NetworkError when attempting to fetch resource. » — message identique aux vues hors allowlist.
    - app/src/lib/offline/query-persistence.ts:224-228, 281-294 — ÉCARTÉ : la persistance n'échoue pas. `shouldDehydrateQuery` ne filtre pas sur le statut (les queries en erreur avec données restent sérialisées), la prune ne court qu'au restore, pas en navigation.
    - app/src/app/router.tsx:84 — ÉCARTÉ : aucune invalidation par route à la navigation (seule invalidation ciblée profile/attestation au bootstrap).
  missing:
    - Cloisonnement erreur/données dans la couche de lecture : `useResource` (useResource.ts:160) et `useLinkedRows` (l.214) doivent exposer `isError: query.isError && query.data === undefined` (l'erreur n'est honnête que SANS données en cache) — les hooks composés qui agrègent par `||` en héritent.
    - Audit des usages directs de `useQuery` hors useResource qui rendent `isError` sans garde `data === undefined` (ex. onglets voyages, calendrier useRefDays, messages) — même cloisonnement à appliquer.
    - Garde de test : un test offline « refetch échoué avec données en cache → les lignes restent rendues, pas d'ErrorState » (le cas exact du G-33-3), à ajouter près de courses-offline.test.tsx.
    - Décision produit à trancher : signaler quand même la donnée comme périmée/échouée (badge « hors ligne, dernière version connue ») plutôt que de masquer l'échec derrière les données — cohérence avec D-09/D-12 (bandeau MIN existe déjà via use-offline-stale-banner.ts).
