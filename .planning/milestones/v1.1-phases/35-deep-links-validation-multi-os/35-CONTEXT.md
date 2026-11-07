# Phase 35: Deep links & validation multi-OS - Context

**Gathered:** 2026-11-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Un raccourci tapé en cold-start — session expirée ou hors-ligne — mène toujours à la bonne vue : la garde d'auth redirige vers le login puis ramène exactement à la cible (redirect-after-login, prouvé par un e2e dédié), et la nouvelle vue dédiée « Tâches du jour » (`/taches/jour`) rend depuis le cache persisté même en cold-start hors-ligne. L'expérience offline complète (phases 32–34) est ensuite validée de bout en bout sur desktop, Android et iOS réels via une grille de consignation honnête — chaque résultat et chaque quirk consigné, rien marqué vérifié à tort.

**Hors périmètre :** Background Sync (rejeu app fermée — différé v1.x), raccourcis iOS natifs (l'OS ignore le champ shortcuts), retour du mode démo Dexie, correction des 2 tests anniversaires préexistants (34-deferred-items), refonte du mécanisme de redirection (présumé correct, prouvé par e2e).

</domain>

<decisions>
## Implementation Decisions

### Vue « Tâches du jour » (DLNK-03)
- **D-01:** **Route dédiée `/taches/jour`** — cible du raccourci manifest (remplace la cible `/taches` posée en 32-01 dans `app/vite.config.ts`), réutilise les composants de `taches-page`, rendu prioritaire en cold-start offline (moins de données à hydrater que la page complète).
- **D-02:** **Périmètre = échéances aujourd'hui + retards** (`due_date` ≤ aujourd'hui, non faites) — les retards en rouge en haut (convention AGENTS.md §6). Une tâche en retard ne disparaît jamais de la vue.
- **D-03:** **Interaction minimale cochable** : liste + coche + bouton retour vers `/taches`. Pas de filtres, pas de dossiers, pas d'ajout rapide, pas d'édition, pas de glisser-déposer — le reste vit sur `/taches`.
- **D-04:** **Assignés visibles** avec `color_tag`/avatar (code couleur membre, convention AGENTS.md), coche selon le rôle. Les assignations Tier 1 sont déjà dans la allowlist de lecture offline.

### Redirect-after-login (DLNK-02)
- **D-05:** **Prouver l'existant, ne pas reconstruire** : le mécanisme `RequireAuth` → `state.from` → `internalPathOf()` (garde anti open-redirect T-19-43) est présumé correct. On ne corrige que si l'e2e révèle un trou. Aucune refonte.
- **D-06:** **E2e dédié = un scénario unique** : cold-start session expirée → garde → login → retour `/taches/jour` → vue rendue. C'est exactement le critère 1 du roadmap.
- **D-07:** **Deep link hors-ligne SANS session** (appareil neuf ou cache purgé) : écran explicite « connexion requise pour cette vue » — jamais une erreur technique générique sur le chemin de raccourci le plus fréquent. L'utilisateur se reconnecte plus tard.
- **D-08:** **Aucun stockage de cible au-delà de `state.from`** — pas de localStorage/sessionStorage, purge naturelle par l'histoire du routeur, zéro risque inter-utilisateurs.

### Matrice de validation multi-OS (critère 3)
- **D-09:** **Exécution = checklist guidée** : l'humain exécute sur ses appareils réels ; l'agent prépare la grille et les étapes précises par OS (quirks iOS ITP/éviction inclus dans les étapes).
- **D-10:** **Consignation = grille dédiée `35-VALIDATION-MATRICE.md`** : lignes = cas de test (install, raccourcis, lecture offline + bandeau, rejeu foreground, purge inter-utilisateurs), colonnes desktop/Android/iOS, statut + quirk par cellule.
- **D-11:** **Complétion = chaque cellule explicite** : Passé / Échoué / Quirk consigné / Non testé (appareil absent). Aucune case vide implicite. Un « Non testé » documenté est permis — l'honnêteté prime sur le 100 % (esprit AGENTS.md §2.7 F : un succès muet est un échec inexpliqué).
- **D-12:** **La grille intègre AUSSI la checklist « looks done but isn't » (PITFALLS) et la vérification gate SW « file vide » (critère 4)** — un seul document de passage, ordre fixe.

### Séquençage des plans
- **D-13:** **Construire puis valider** : Plan 1 = vue `/taches/jour` + e2e redirect + écran offline sans session ; Plan 2 = grille de validation + checklist + passage on-device guidé. La matrice teste le code final de la phase, jamais du code intermédiaire.

### the agent's Discretion
- Forme exacte de l'écran « connexion requise » (composant réutilisé vs dédié) dans les limites de D-07.
- Structure interne de la grille (colonnes supplémentaires : appareil, version OS, notes).
- Détails de composition de la vue `/taches/jour` (en-tête, compteur, état vide) dans les limites de D-02/D-03.
- Découpage fin en plans au-delà du séquençage D-13.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requis & roadmap
- `.planning/ROADMAP.md` §Phase 35 — Goal, Success Criteria 1-4
- `.planning/REQUIREMENTS.md` §Raccourcis & deep links (DLNK) — DLNK-02, DLNK-03

### Convictions projet
- `AGENTS.md` §2.7 — chaîne de vérification avant commit ; « un succès muet est un échec inexpliqué » (F) ; une absence affirmée est une affirmation (I) — fondement du D-11
- `AGENTS.md` §6 — code couleur par membre (D-04), tri retards en rouge en haut (D-02), zones tactiles ≥ 44px

### Phases 32-34 (infra posée, à consommer)
- `.planning/phases/32-install-raccourcis/32-CONTEXT.md` — manifest durci, raccourcis (cible à changer → D-01), panneau offline
- `.planning/phases/33-cache-de-lecture-offline/33-CONTEXT.md` — persister IndexedDB, namespacing, purge awaitée signOut, allowlist `query-policy.ts`
- `.planning/phases/34-file-d-criture-rejeu/34-CONTEXT.md` — file d'écriture, gate SW « file vide » branchée (critère 4), déclencheurs de rejeu foreground
- `.planning/phases/34-file-d-criture-rejeu/deferred-items.md` — 2 tests anniversaires préexistants (HORS périmètre), listener `online` historique de `route-error.tsx`

### Code
- `app/src/vite.config.ts` — raccourcis manifest, cible « Tâches du jour » à pointer vers `/taches/jour` (D-01)
- `app/src/app/router.tsx` — garde d'auth, `state.from`
- `app/src/modules/landing/sign-in-page.tsx` — `internalPathOf()` (garde T-19-43, D-05/D-06)
- `app/src/modules/taches/taches-page.tsx` — composants à réutiliser pour la vue dédiée (D-01)
- `app/src/lib/offline/query-persistence.ts` — cache persisté (rendu cold-start hors-ligne, critère 2)
- `app/src/hooks/use-auth.ts` — signOut(), purge awaitée

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/src/app/router.tsx` + `require-attestation` — la garde écrit déjà `state.from` : DLNK-02 est une preuve, pas une construction
- `app/src/modules/landing/sign-in-page.tsx` — `internalPathOf()` exportée pour test direct : la garde est vérifiable unitairement si besoin
- `app/src/modules/taches/taches-page.tsx` et ses composants — base de la vue `/taches/jour` (D-01 réutilise, ne duplique pas)
- `app/src/lib/offline/query-persistence.ts` — le cache persisté namespacé fournit le rendu cold-start hors-ligne du critère 2
- Chaîne e2e Playwright existante — le scénario DLNK-02 s'y ajoute comme test dédié

### Established Patterns
- Garde anti open-redirect : résolution contre l'origine courante, refus de toute URL absolue — D-08 s'y conforme en n'ajoutant aucun stockage
- Purge awaitée avant navigation (33-D05, 34-D17) — la purge inter-utilisateurs testée en matrice s'appuie dessus sans la modifier
- Migrations vers l'avant uniquement, tests SQL négatifs — aucune migration attendue cette phase (aucune décision de schéma)
- Honnêteté de consignation (33 : erreurs d'origine ; 34 : échecs terminaux visibles) — D-10/D-11 prolongent la même conviction

### Integration Points
- `app/vite.config.ts` — cible du raccourci « Tâches du jour » → `/taches/jour` (D-01)
- `app/src/app/router.tsx` — nouvelle route `/taches/jour` + écran « connexion requise » (D-01/D-07)
- `app/e2e/` (ou équivalent Playwright existant) — e2e dédié DLNK-02 (D-06)
- `.planning/phases/35-deep-links-validation-multi-os/35-VALIDATION-MATRICE.md` — grille créée par la phase, consignée par l'humain (D-09/D-10)

</code_context>

<specifics>
## Specific Ideas

- « L'app de poche est prête, prouvée, pas supposée » (goal du roadmap) : chaque décision de cette phase élimine un chemin vers un faux « vérifié » — cellule explicite (D-11), code final testé (D-13), e2e plutôt que refonte préventive (D-05).
- La vue `/taches/jour` est une **destination de raccourci**, pas une deuxième page de tâches : minimale, rapide, lisible en 3 secondes le matin.
- L'écran « connexion requise » est le seul ajout d'UX au-delà de la vue — il remplace une erreur générique sur le chemin le plus fréquent.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 35-Deep links & validation multi-OS*
*Context gathered: 2026-11-06*
