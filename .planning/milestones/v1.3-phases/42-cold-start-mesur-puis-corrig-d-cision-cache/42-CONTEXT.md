# Phase 42: Cold start mesuré puis corrigé + décision cache - Context

**Gathered:** 2026-11-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Le cold start offline est mesuré avec un protocole écrit AVANT toute mesure (build prod, cache froid, réseau coupé), le panneau diagnostic existant est alimenté par des marks `performance.mark` aux 4 segments (entry chunk, activation SW, restore IndexedDB, auth bootstrap), les corrections livrées sont désignées par le profilage (jamais au doigt mouillé), et CACHE-01 (maxAge 24 h) est tranché par famille offline avec les données du panneau on-device — décision documentée dans PROJECT.md. Aucune nouvelle surface produit.

Exclusions explicites : GATE-01 en conditions réelles (observatoire événementiel hors jalon), toute autre dette v1.1/v1.2 déjà soldée, extension du modèle de partage ardoise (observation produit UAT).

Exigences : COLD-01 (protocole + instrumentation en DERNIER), COLD-02 (corrections désignées par le profil), CACHE-01 (décision maxAge).

</domain>

<decisions>
## Implementation Decisions

### Protocole de mesure (COLD-01)

- **PM-01 : 1 appareil réel de référence, médiane de N.** Un seul appareil on-device (Android, l'appareil actuellement validé pour la chaîne offline complète), mesures répétées plusieurs fois par condition, **médiane** consignée. Reproductible et honnête sur la variance, sans gérer min/max. Jamais l'émulateur (success criterion 2, déjà verrouillé).
- **PM-02 : cache froid = purge IndexedDB + réinstallation de la PWA** entre chaque run. Le protocole définit précisément cette purge (l'app doit repartir sans aucun état persistant). Réseau coupé, build prod.
- **PM-03 : doc mesures versionné.** Le protocole écrit, l'appareil, la date, la version du build (estampille quatre canaux) et les 4 segments médians avant/après correction vivent dans un document versionné du dépôt — même discipline de preuve que les autres phases (§2.7). Les mesures ne persistent PAS dans l'app : la référence, c'est le doc.

### Cible UX & fin de boucle (COLD-02)

- **CU-01 : pas de cible chiffrée imposée.** Le profilage désigne les axes, on corrige les désignés, on re-mesure, on consigne. La boucle s'arrête quand plus aucun axe à fort gain n'est désigné par le profil — fidèle au success criterion 3 (jamais au doigt mouillé).
- **CU-02 : corrections = segments tracés.** Chaque correction livrée nomme le segment source du profil qui la désigne. Le protocole liste les axes candidats (taille du entry chunk, hydratation IndexedDB, séquence auth bootstrap, activation SW).
- **CU-03 : correction hors profil autorisée mais nommée.** Si un fix non désigné par la trace s'avère nécessaire (ex. bug découvert pendant l'instrumentation), il est livré mais consigné explicitement comme **écart** dans le doc mesures — c'est la lecture du success criterion 3.

### Arbitrage CACHE-01

- **CA-01 : arbitrage PAR famille.** Chaque famille de `OFFLINE_FAMILIES` (données vivantes 24 h, annexes 7 j) est arbitrée individuellement avec les données du panneau on-device — lecture littérale de CACHE-01, pas d'arbitrage global en deux blocs.
- **CA-02 : critères fixés dans le protocole AVANT les mesures.** Volume réhydraté mesuré, tolérance produit à la donnée périmée par espace, coût réseau du re-fetch : les critères sont écrits dans le protocole avant que le panneau ne soit lu. La décision applique ces critères sans les réinventer.
- **CA-03 : statu quo justifié = décision valide.** Un changement de valeur maxAge n'est PAS obligatoire pour clore CACHE-01 : si les critères et les données confirment les valeurs actuelles (24 h vivantes / 7 j annexes), PROJECT.md documente une décision « statu quo justifié » (valeur + justification). CACHE-01 est tranchée dans les deux cas.
- **CA-04 : biais d'ordre consigné.** Le maxAge influence le volume réhydraté mesuré (biais d'ordre déjà identifié en STATE.md) : l'ordre instrumentation → lecture panneau → décision est consigné dans le doc mesures.
- Purge outbox indépendante du maxAge : déjà verrouillée (anti-feature v1.3), non re-discutée — les tests restent à jour si `OFFLINE_FAMILIES` change.

### Panneau diagnostic

- **PD-01 : section « Amorçage » — 4 segments + total.** Le panneau offline existant (`offline-panel.tsx`) reçoit une section Amorçage : les 4 segments (entry chunk, activation SW, restore IndexedDB, auth bootstrap) avec leur durée ms et le total, même style que le reste du panneau.
- **PD-02 : mesures en session seule, doc = référence.** La mesure du dernier démarrage vit dans le state de session du panneau — **pas de persistance IndexedDB supplémentaire** : ajouter de l'I/O au démarrage reviendrait à fausser la mesure par l'instrumentation elle-même. Les valeurs de référence vivent dans le doc mesures versionné (PM-03).
- **PD-03 : marks toujours actifs.** `performance.mark`/`measure` sans flag de build — l'instrumentation fait partie du produit et le panneau doit être lisible en prod réel, là où CACHE-01 doit être tranchée. Un flag de build imposerait un build spécial contradictoire avec « mesures on-device prod ».

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Exigences et décisions jalon
- `.planning/REQUIREMENTS.md` — COLD-01, COLD-02, CACHE-01, anti-features v1.3
- `.planning/ROADMAP.md` — Phase 42, success criteria 1-4
- `.planning/PROJECT.md` — dette reportée v1.1/v1.2 (amorçage ≈ 30-40 s, CACHE-01), décision de documenter dans ce fichier la valeur maxAge retenue

### État et décisions antérieures
- `.planning/STATE.md` — biais d'ordre maxAge/réhydratation, blocker machine on-device, instrumentation en DERNIER
- `.planning/phases/41-gate-sw-simulable/41-01-PLAN.md` — `prior_verify_commands` et chaîne §2.7 réutilisables

### Règles projet
- `AGENTS.md` (racine du dépôt) — §2.7 chaîne de vérification (build prod, tests, e2e, contrôle SQL statique), §2.7 F (succès muet = échec inexpliqué), §2.7 I (affirmations vérifiées)
- `docs/EXPLOITATION.md` — GATE-PROD observatoire (la phase 41 y a consigné le re-test au prochain déploiement naturel)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/src/lib/query-policy.ts` — `OFFLINE_FAMILIES` (24 h données vivantes, 7 j annexes) et `famillePerimee` : la surface exacte que CACHE-01 arbitre ; changer une valeur = politique de tests à jour
- `app/src/lib/offline/query-persistence.ts` — purge IndexedDB par famille (prédicat, pas de maxAge global, Pitfall 3) : la purge du protocole s'appuie sur ce mécanisme ; la purge outbox y est déjà indépendante du maxAge
- `app/src/modules/parametres/components/offline-panel.tsx` — le panneau diagnostic existant, cible de la section Amorçage (PD-01)
- `app/src/hooks/use-auth.ts` + `app/src/lib/sw-register.ts` — les segments auth bootstrap et activation SW à marquer
- Estampille de build à quatre canaux (`check-version-stamp.sh`) — la version build consignée dans le doc mesures (PM-03)

### Established Patterns
- Protocole écrit d'abord + preuve archivée versionnée : même discipline que la signature e2e 38 (`38-E2E-SIGNATURE.md`) et les rapports de test-db/dispatch-push
- Flag-compilation minimal en phase 41 (VITE_E2E_SW_HARNESS) : ici REJETÉ pour les marks (PD-03) — l'instrumentation est produit, pas harnais
- Aucun `performance.mark` n'existe dans le code aujourd'hui : l'instrumentation est nouvelle mais sa surface d'affichage (panneau) existe

### Integration Points
- Les marks s'insèrent dans la séquence de démarrage réelle : entry chunk (main), activation SW (`sw-register.ts`), restore IndexedDB (`query-persistence`), auth bootstrap (`use-auth.ts` / gardien 10 s)
- Le panneau offline est le point d'affichage unique — pas de nouvelle route ni de nouvelle surface

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

**Blocker rappelé (STATE.md)** : la machine on-device est requise pour les mesures ; si elle n'est pas disponible au moment de l'exécution, le différé est consigné honnêtement (§2.7 I), jamais maquillé.

</deferred>

---

*Phase: 42-cold-start-mesuré-puis-corrigé-décision-cache*
*Context gathered: 2026-11-10*
