# Phase 17: mode-cuisine-recette - Context

**Gathered:** 2026-10-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Depuis une fiche recette, un toggle « Mode cuisine » en haut à droite du panneau Étapes bascule vers une vue épurée pour cuisiner : étapes numérotées avec cases à cocher, progression mémorisée sur l'appareil (`eo:recette:cuisine:<recipeId>`), écran maintenu allumé via Wake Lock sans élément séparé (suit le toggle). Zéro changement serveur. Page invitée incluse à parité.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**5 requirements are locked.** See `17-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `17-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):** Toggle `aria-pressed` en `Panel action` (fiche membre + page invitée) ; Vue cuisine (numéro + texte + case, compteur, barre, réinitialiser) ; Mémoire locale par recette + purge ids obsolètes ; Wake Lock + interrupteur + repli non supporté ; Enfant : toggle visible, cases cochables, rien d'autre (cohérent `readOnly` actuel) ; Tests Vitest + e2e, typecheck + build (chaîne §2.7 hors SQL/DB : aucun SQL)
**Out of scope (from SPEC.md):** Scaler dans le mode cuisine (les quantités ne s'y affichent pas — étapes seules ; scaler reste sur la fiche) ; Minuteur par étape — pas demandé, phase ultérieure ; Photos d'étape — différées depuis la phase 16 ; Persistance serveur de la progression — interdite ; Synthèse vocale / mains-libres audio — pas demandé

**Amendement R4 acté en discuss (user) :** SPEC prévoyait « interrupteur visible dans la vue cuisine près du compteur ». Décision utilisateur : **pas d'élément séparé** — la veille suit le toggle « Mode cuisine » (ON = demande verrou, OFF/sortie = relâche). La mention discrète de repli est conservée. Le planner applique l'amendement, pas la lettre de R4.

</spec_lock>

<decisions>
## Implementation Decisions

### Confort lecture cuisine
- **D-01:** Grandes lignes aérées : texte 17–18px, espacement généreux, cases ≥ 48px. Lisible à bout de bras, écran posé, mains farineuses.
- **D-02:** Étapes cochées réduites et tassées : le texte se replie, la liste se tasse au fur et à mesure (pas de barré-sur-place, pas de masquage derrière filtre).
- **D-03:** Numéros en pastille XL accentuée, statique (pas de drag) — continuité du motif fiche en plus visible.
- **D-04:** Case à cocher à gauche du texte (reprend le motif actuel), zone tactile ≥ 48px.
- **D-05:** Point de liaison + trait vertical entre étapes conservés (motif fiche D-11 phase 16).
- **D-06:** Étapes longues : texte entier toujours visible, la ligne grandit — rien n'est caché ni tronqué en cuisinant.

### En-tête progression
- **D-07:** En-tête sticky en haut de la vue cuisine : compteur + barre toujours visibles pendant le scroll.
- **D-08:** Compteur « N/M » + barre fine sous le compteur, dans l'en-tête sticky (les deux, pas l'un seul).
- **D-09:** Bouton « Tout réinitialiser » aux deux endroits : rappel dans l'en-tête + bouton en bas de vue après la dernière étape.

### Veille (Wake Lock, sans élément séparé)
- **D-10:** Pas d'interrupteur veille séparé : la veille suit le toggle « Mode cuisine » lui-même — ON = `navigator.wakeLock.request('screen')` demandé (si supporté), OFF / sortie / démontage = relâché. Aucun switch, bouton ou case dédié près du compteur.
- **D-11:** Repli non supporté : mention discrète grise sous la barre (« veille non bloquée sur cet appareil »), jamais d'erreur. Réacquisition sur `visibilitychange` visible quand le mode est ON.

### Bascule + reset
- **D-12:** Toggle = switch « Mode cuisine » en haut à droite du panneau Étapes (`Panel action`, `aria-pressed`), OFF par défaut à chaque ouverture (SPEC R1).
- **D-13:** Bascule édition ↔ cuisine : scroll/focus conservés — on reprend où on était, pas de retour en haut.
- **D-14:** « Tout réinitialiser » : confirmation inline (« Tout effacer ? Annuler / Réinitialiser »), sans modale — aucune donnée serveur en jeu.
- **D-15:** Description du panneau Étapes bascule avec le mode (SPEC R1) : OFF → « Glissez la pastille numérotée pour réordonner. » ; ON → « Cochez au fur et à mesure. Progression mémorisée sur cet appareil. »

### Parité invitée + enfant + a11y
- **D-16:** Page invitée à parité totale : même confort XL + sticky + compteur/barre + reset, alimentée par les étapes `link-view` déjà chargées, zéro PostgREST supplémentaire, zéro édition.
- **D-17:** Mémoire locale aussi pour l'invité : même clé `eo:recette:cuisine:<recipeId>` sur l'appareil de l'invité, purge ids obsolètes identique.
- **D-18:** Enfant : toggle visible, cases cochables seules, rien d'autre (cohérent `readOnly` actuel).
- **D-19:** A11y : compteur « N/M » annoncé poliment (`aria-live="polite"`) à chaque case, ordre tab naturel, cases ≥ 44px via primitive `Checkbox` existante.

### the agent's Discretion
Tailles px exactes (17 vs 18px, pastille XL en px), épaisseur/couleur de la barre, wording exact de la mention de repli, libellé du bouton reset (« Tout réinitialiser » vs « Tout effacer »), nom du composant vue cuisine et du hook mémoire/veille.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Exigences verrouillées
- `.planning/phases/17-mode-cuisine-recette/17-SPEC.md` — Locked requirements (R1–R5) + amendement R4 ci-dessus — MUST read before planning.
- `.planning/ROADMAP.md` (Phase 17) — Goal : toggle vue épurée + progression mémorisée + écran allumé, frontend only.

### Motifs à copier
- `app/src/modules/recettes/components/recipe-steps.tsx` — `RecipeSteps` actuel (bulles numéro, DnD, `Checkbox`, état local `checked`) : base de la vue cuisine + fiche à préserver.
- `app/src/modules/recettes/recette-detail-page.tsx` — Panneau « Étapes » (`Panel` + `RecipeSteps`, `readOnly={!canWrite}`) : emplacement du toggle `Panel action`.
- `app/src/modules/recettes/guest-recipe-page.tsx` — Page invitée (`link-view`, `readOnly`, callbacks neutres) : toggle + vue cuisine à parité, zéro PostgREST.
- `app/src/components/shared/module-shell.tsx` — `Panel` prop `action` (rendue en haut à droite) : emplacement du toggle, même motif que le favori `aria-pressed`.
- `app/src/components/ui/primitives.tsx` — Primitive `Checkbox` existante : cases cuisine (clavier + lecteur d'écran).
- `app/src/modules/recettes/api.ts` — `recipeInviteCodeStorageKey` (`eo:recipe:code:<recipeId>`) : régime mémoire appareil à copier pour `eo:recette:cuisine:<recipeId>`.
- `.planning/phases/16-recettes-du-foyer-grille-fiche-ingr-dients-tapes-partage/16-CONTEXT.md` — D-11 (bulle = poignée drag), D-12 (cases locales), D-14 (invité lecture seule).
- `AGENTS.md` §2.7 — Chaîne `cd app && npm run typecheck && npm test && npm run build` + e2e recettes (aucun SQL).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Panel action` (`@/components/shared/module-shell`) : slot haut-droite pour le switch « Mode cuisine », déjà éprouvé par le bouton favori `aria-pressed` de la grille.
- `RecipeSteps` + `StepRow` : structure numéro + texte + `Checkbox` à forker en vue cuisine (sans DnD/édition, pastille XL statique, réduction au coché).
- `Checkbox` (`@/components/ui/primitives`) : primitive clavier/lecteur existante, zones élargies via `after:-inset`.
- `recipeInviteCodeStorageKey` / `tripCodeStorageKey` : motif clé locale par id (`eo:*:code:`) à copier pour `eo:recette:cuisine:<recipeId>`.

### Established Patterns
- Mémoire appareil éprouvée (phases 15–16) : lecture/écriture/purge locale par id, ids obsolètes purgés silencieusement.
- Enfant `readOnly` : saisie/drag masqués, cases conservées (phase 16 D-12/D-14, phase 14).
- Invité lecture seule via Edge `link-view`, jamais PostgREST direct (phase 16 D-14).

### Integration Points
- `recette-detail-page.tsx` panneau « Étapes » (membre/enfant) + `guest-recipe-page.tsx` étapes invitées : les deux points de branchement du toggle + vue partagée.
- `steps` déjà chargés par la fiche (`stepsByRecipe`) : la vue cuisine lit sans appel réseau (prohibition SPEC).

</code_context>

<specifics>
## Specific Ideas

- « pas d'élément séparé » (verbatim user) : la veille suit le toggle Mode cuisine, aucun second interrupteur.
- Étapes cochées « réduites tassées », pastille « XL », texte « entier », liaison « gardée » — repris verbatim des sélections.
- Reset « aux deux endroits » (en-tête + bas), en-tête « sticky », compteur « N/M + barre ».

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 17-mode-cuisine-recette*
*Context gathered: 2026-10-14*
