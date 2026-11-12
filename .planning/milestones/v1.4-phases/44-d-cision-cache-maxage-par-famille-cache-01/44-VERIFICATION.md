---
phase: 44-d-cision-cache-maxage-par-famille-cache-01
verified: 2026-11-12T08:25:00Z
status: passed
score: 10/10 must-haves verified
covered_files:
  - .planning/phases/44-d-cision-cache-maxage-par-famille-cache-01/44-01-PLAN.md
  - .planning/phases/44-d-cision-cache-maxage-par-famille-cache-01/44-02-PLAN.md
  - .planning/phases/44-d-cision-cache-maxage-par-famille-cache-01/44-01-SUMMARY.md
  - .planning/phases/44-d-cision-cache-maxage-par-famille-cache-01/44-02-SUMMARY.md
  - .planning/PROJECT.md
  - docs/MESURES-COLD-START-42.md
  - app/src/modules/parametres/components/offline-panel.tsx
  - app/src/lib/offline/query-persistence.ts
  - app/src/lib/query-policy.ts
  - app/src/lib/query-policy.test.ts
covered_digest: "v2:sha256:3e4ed863a761e18c68f23aad82a1569df8a652f160a41d04ca09cacddb0a7c66"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed  # human_needed à la course précédente, canonicalisé `passed` par la prédicat UAT (44-UAT.md : 3/3 pass)
  previous_score: 5/10
  gaps_closed:
    - "Truth 6 — campagne OU différé honnêtement consigné : différé consigné daté 2026-11-12 (§7.1–7.5), commit 592fa18"
    - "Truth 7 — grille §7.4 : repli différé du plan (AUCUNE décision sans données, CA-04) appliqué et consigné"
    - "Truth 8 — commits de famille : sans objet, aucune famille modifiée (D-07 « Les familles au statu quo ne produisent AUCUN commit »)"
    - "Truth 9 — chaîne §2.7 consignée §7.6 avec CHAINE-44-VERTE"
    - "Truth 10 — PROJECT.md sans section « Décision CACHE-01 » (correct tant que §7.4 est vide)"
  gaps_remaining: []
  regressions: []
gaps: []
behavior_unverified_items: []
---

# Phase 44: Décision cache maxAge par famille (CACHE-01) — Verification Report

**Phase Goal:** Campagne on-device selon le protocole MESURES-COLD-START-42 §6, décision tranchée par les critères §5, au plus un commit par famille modifiée d'`OFFLINE_FAMILIES`, décision consignée dans PROJECT.md
**Verified:** 2026-11-12T08:25:00Z
**Status:** passed
**Re-verification:** Yes — après stale (commit `592fa18` a touché docs/MESURES-COLD-START-42.md, fichier couvert) et après clôture du checkpoint blocking-human par la voie différé

## Goal Achievement

Le critère de succès 1 du plan 44-02 est une disjonction explicite : « La campagne on-device §6 est menée **OU** le différé est honnêtement consigné — jamais de valeur inventée, jamais d'émulateur ». La campagne n'a pas pu tourner (environnement de mesure inaccessible, refus de dictée de l'utilisateur consigné) ; **le repli différé prévu par le plan (Task 1, clause « Si NON ») a été appliqué honnêtement et intégralement**. Le jugement porté ici est celui de ce critère, pas celui du chemin campagne.

### Observable Truths (44-01 — plan préparatoire, CACHE-04)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Squelettes §7.1–7.5 complets (tableau par run, champs D-02, validations froides D-03, règle « un run non froid n'entre pas dans les médianes ») | ✓ VERIFIED | Marqueurs de squelette présents en §7.1 (l.120 sq., `| Run |` ×6, règle froid portée en commentaire) — régression vérifiée après `592fa18` : les squelettes restent en place, les mentions différé s'y ajoutent sans les remplacer |
| 2 | Procédure de reprise post-purge portée (reconnexion → connexion → mode avion → « Vider le cache » seul) | ✓ VERIFIED | Consignée dans le squelette de campagne de §7.1 — toujours présente |
| 3 | Seuil D-15 évalué explicitement, verdict consigné avec preuves de code | ✓ VERIFIED | « D-15 » et conclusion binaire « le panneau suffit » consignés ; les faits de code cités (offline-panel.tsx rendu par famille ageMs/maxAgeMs/pruneEligible ; delta de prune global uniquement) restent exacts contre le code réel |
| 4 | Observabilité conditionnelle (D-14) livrée SEULEMENT si D-15 conclut « ne suffit pas » | ✓ VERIFIED | Verdict « suffit » → tâche non déclenchée ; `offline-panel.tsx` inchangé (aucun commit app/src/ depuis `9c78e2a`, antérieur à la phase) — conformité D-13 |
| 5 | PROJECT.md non touché (D-11) | ✓ VERIFIED | Aucune section « Décision CACHE-01 » (grep = 0) ; aucun commit sur .planning/PROJECT.md en phase 44 |

### Observable Truths (44-02 — campagne + décision, voie différé)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 6 | Campagne on-device §6 menée OU différé honnêtement consigné — jamais de valeur inventée, jamais d'émulateur | ✓ VERIFIED | « Différé consigné (2026-11-12) » en §7.1 (l.133), §7.2 (l.200), §7.3 (l.217), §7.4 (l.235) et §7.5 ; question ouverte §1 explicitement non tranchée (l.118) ; aucun run, aucune valeur de panneau, aucune décision sans donnée (CA-04) ; commit `592fa18` docs uniquement |
| 7 | Grille §7.4 remplie à chaud, décisions justifiées (a)(b)(c) | ✓ VERIFIED (voie différé) | La clause « Si NON » du checkpoint impose « AUCUNE décision §7.4 » : §7.4 porte le différé daté + le rappel que les critères §5 restent la grille de la campagne future ; les cellules décision vides sont le squelette conservé pour la campagne suivante (D-04 : document réécrit à chaque campagne) — forme demandée, pas un stub |
| 8 | Chaque famille modifiée livrée en UN commit atomique (D-07, CACHE-02) | ✓ VERIFIED (sans objet) | Aucune famille modifiée : `OFFLINE_FAMILIES` inchangée (9 × `24 * 60 * 60 * 1000`, 2 × `7 * 24 * 60 * 60 * 1000`, expressions de ms) — « les familles au statu quo ne produisent AUCUN commit » est la règle du plan |
| 9 | Chaîne §2.7 complète exécutée UNE fois à l'état final et consignée §7.6 (D-08) | ✓ VERIFIED | §7.6 (l.260 sq.) cite chaque étape avec résultat chiffré (estampille OK, gate SW 4/4, typecheck OK, 2006 tests/245 fichiers, build OK precache 152, e2e 163/9, SQL statique 231 fonctions/182 migrations aucun défaut + auto-exercice 6 cas verts) et la bannière **CHAINE-44-VERTE** ; état final = HEAD sans code modifié, ce qui est cohérent (aucun commit de famille n'existe) |
| 10 | Section « Décision CACHE-01 » dans PROJECT.md seulement APRÈS §7.4 rempli de données réelles (D-10/D-11/D-12) | ✓ VERIFIED | §7.4 vide de données réelles → PROJECT.md correctement sans section (D-11 respecté) ; commit de consignation `592fa18` = docs/MESURES-COLD-START-42.md seul, aucun fichier app/src/ (D-12 vérifié via `git log -1 --stat`) |

**Score:** 10/10 must-haves verified (0 present, behavior-unverified ; 0 override)

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|-------------|------------|--------|----------|
| CACHE-01 | 44-02 | ✓ SATISFIED (voie différé du critère 1) | Différé honnêtement consigné daté 2026-11-12 en §7.1–7.5 : aucune valeur inventée (§2.7 I), aucun émulateur, question ouverte §1 non tranchée, remplacement du différé 2026-11-10 lui-même consigné (§7.5) — jamais un maquillage |
| CACHE-02 | 44-02 | ✓ SATISFIED (boundary) | Zéro commit de famille (aucune famille modifiée) ; outbox, bandeau offline, service worker intouchés (aucun commit app/src/ en phase 44) ; buster `'v2'` inchangé (query-persistence.ts:46) ; maxAge global de persistQueryClient toujours absent (commentaire Pitfall 3 intact, query-persistence.ts:212) |
| CACHE-03 | 44-02 | ✓ SATISFIED (voie différé) | Aucune édition de code du tout → l'ordre « grille avant code » est trivialement respecté ; PROJECT.md sans section « Décision CACHE-01 » tant qu'aucune donnée ne la justifie (§2.7 I) ; commit de consignation distinct du code (D-12) |
| CACHE-04 | 44-01 | ✓ SATISFIED (Complete) | Verdict D-15 consigné avec preuves de code réelles ; observabilité non déclenchée — « déclenché par besoin, jamais préventif » respecté |

Aucune exigence orpheline : les 4 IDs de la phase sont répartis entre les deux plans (44-01 → CACHE-04 ; 44-02 → CACHE-01/02/03) et correspondent à REQUIREMENTS.md (Phase 44).

### Prohibitions (must_haves.prohibitions — vérifiées, aucune violée)

| Prohibition | Status | Evidence |
|---|---|---|
| Ne jamais toucher outbox / bandeau offline / SW | ✓ RESPECTED | Aucun commit app/src/ en phase 44 (`git log` : dernier commit app/src = `9c78e2a`, pré-phase) |
| Ne jamais utiliser le maxAge global de persistQueryClient | ✓ RESPECTED | `maxAge: Infinity` absent ; commentaire « POURQUOI … ABSENT (Pitfall 3) » intact (query-persistence.ts:212) |
| Ne jamais livrer l'observabilité préventivement (D-13) | ✓ RESPECTED | offline-panel.tsx inchangé, verdict D-15 « le panneau suffit » |
| Ne jamais écrire dans PROJECT.md pendant la phase préparatoire | ✓ RESPECTED | grep « Décision CACHE-01 » = 0 ; aucun commit PROJECT.md |
| Ne jamais inventer une valeur ni mesurer sur émulateur (§1, §2.7 I) | ✓ RESPECTED | Aucune valeur de run dans §7.1–7.3 ; l'absence de mesure est consignée comme telle |
| Ne jamais créer une deuxième liste de familles (Test I) | ✓ RESPECTED | `OFFLINE_FAMILIES` source unique inchangée ; Tests F/G/H/I verts |
| Ne jamais faire de bump de buster | ✓ RESPECTED | `OFFLINE_CACHE_BUSTER = 'v2'` inchangé (query-persistence.ts:46) |
| Deux familles dans un commit = CACHE-02 violé ; consignation + code dans le même commit = D-12 violé | ✓ RESPECTED | Aucun commit de famille ; `592fa18` = docs seul |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `inspectPersistedCache` (query-persistence.ts) | Panneau offline | `families` → rendu par famille | ✓ WIRED (inchangé) | Import et consommation confirmés dans offline-panel.tsx — champs sans contenu de ligne (T-35-18) |
| `OFFLINE_FAMILIES` (query-policy.ts) | `pruneExpiredFamilies` / `famillePerimee` | lecture maxAgeMs | ✓ WIRED (inchangé) | Valeurs en vigueur : 9 × 24 h, 2 × 7 j, expressions de ms — aucun lien altéré (le plan ne devait les modifier que sur décision §7.4, qui n'a pas eu lieu) |
| `gcTime` (query-policy.ts:37) | maxAge max de OFFLINE_FAMILIES | Test F + commentaire Pitfall 1 | ✓ WIRED (inchangé) | `gcTime: 7 * 24 * 60 * 60 * 1000` ≥ maxAge max — invariant tenu, seuil 7 j non franchi |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Tests query-policy (Tests F/G/H/I du périmètre) | `cd app && npm test -- --run query-policy` | 12 passed / 1 file, 0 failed (3,44 s) | ✓ PASS |
| Squelettes + différé coexistent (pas d'écrasement D-04) | grep « Différé consigné » / `| Run |` / CHAINE-44-VERTE | 4 mentions différé datées ; squelettes Run présents ; bannière présente | ✓ PASS |
| Code app/src/ inchangé en phase 44 | `git log -- app/src/...` | dernier commit app/src = `9c78e2a` (pré-phase 44) | ✓ PASS |
| PROJECT.md sans section décision | `grep -c "Décision CACHE-01" .planning/PROJECT.md` | 0 | ✓ PASS |

### Probe Execution

Aucune sonde déclarée par les plans (les vérifications du plan 44-02 sont des grep/git, exécutés ci-dessus). La chaîne §2.7 consignée §7.6 est le résultat documenté de l'exécution du SUMMARY au commit `592fa18` ; les tests du périmètre (query-policy) ont été re-exécutés par ce vérificateur et sont verts.

### Anti-Patterns Found

Aucun marqueur de dette (TBD/FIXME/XXX/placeholder) dans les fichiers touchés. Les cellules décision vides de §7.4 et les tableaux de runs vides sont la forme demandée par le plan (squelettes D-01 conservés pour la campagne suivante, D-04), pas des stubs de code — aucun fichier app/src/ n'en contient.

### Human Verification Required

Aucune. Les trois items humains de la course précédente (checkpoint appareil, campagne + grille §7.4, chaîne finale + PROJECT.md) ont été résolus et consignés dans 44-UAT.md (3/3 pass) : la voie « différé honnêtement consigné » est l'issue prévue par le plan pour l'item 1, et les items 2–3 sont satisfaits en leur forme différé (aucune donnée inventée, chaîne verte consignée §7.6).

### Gaps Summary

**Aucun gap.** Le critère de succès 1 est une disjonction et sa branche différé est intégralement réalisée : mentions « Différé consigné » datées 2026-11-12 dans §7.1–7.5, aucune valeur inventée, aucun émulateur, aucune décision §7.4, PROJECT.md intouché, aucun commit de famille, buster et valeurs `OFFLINE_FAMILIES` inchangés, chaîne §2.7 complète verte consignée §7.6 (CHAINE-44-VERTE), commit de consignation docs distinct (D-12). CACHE-01 reste **ouverte par conception du repli** : elle sera tranchée par une campagne ultérieure au même protocole, sans modification — c'est le comportement prévu, pas une dette.

---

_Verified: 2026-11-12T08:25:00Z_
_Verifier: the agent (gsd-verifier)_
