# Phase 44: Décision cache maxAge par famille (CACHE-01) - Context

**Gathered:** 2026-11-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Trancher, famille par famille, le maxAge du cache offline (`OFFLINE_FAMILIES`, 11 familles dans `app/src/lib/query-policy.ts`) selon les critères §5 contraignants de `docs/MESURES-COLD-START-42.md`, sur la campagne on-device prescrite §6 — la lecture du panneau « Amorçage » précède toute décision, un statu quo justifié est une décision valide, et chaque famille modifiée est livrée en un commit atomique (valeur + Test H vert + commentaire). Aucune nouvelle surface produit : c'est une phase de preuve (campagne de mesures) + décision (grille §7.4) + édition déclarative éventuelle. La phase est bloquée sur la disponibilité physique de l'appareil de référence ; un différé honnêtement consigné est un repli valide (succès criterion 1), mais le chemin principal choisi est « préparer puis campagne ». Les exigences CACHE-01..04 (REQUIREMENTS.md) et les critères §5/§6 du document MESURES verrouillent la grande majorité des choix — ce document capture les décisions d'implémentation restantes prises en discussion.
</domain>

<decisions>
## Implementation Decisions

### Consignation des runs (sections §7.1–7.3 du document MESURES)
- **D-01:** **Squelette préparé avant la campagne.** Le plan livre d'abord des squelettes de consignation dans les sections vides de `docs/MESURES-COLD-START-42.md` (tableaux, en-têtes, mentions de protocole, rappels des règles) ; le jour J l'utilisateur dicte uniquement les valeurs mesurées depuis le panneau. Raison : la mesure est manuelle on-device (lecture panneau + dictée humaine) — pas de script auto-rédigeant possible, différence assumée avec la phase 43. Le squelette rend l'oubli de champ impossible par sa forme.
- **D-02:** Granularité **« tout par run »** : un tableau par run avec un champ par fait exigé du protocole — estampille quatre canaux, branche auth, 4 segments, total borne à borne, et les deux validations « froid » §2.1.
- **D-03:** La validation « run froid » §2.1 est **portée explicitement dans le squelette** : deux vérifications à cocher par run (panneau « rien de persisté » + SW absent/~0), règle « un run non froid n'entre pas dans les médianes » rappelée en commentaire dans le squelette.
- **D-04:** Le document `docs/MESURES-COLD-START-42.md` est **réécrit à chaque campagne**, historique dans git — convention D-08 de la phase 43 (`docs/BRIDGE-ARDOISE-PREUVE.md`), jamais de sections cumulées.

### Séquencement face à l'appareil
- **D-05:** **Préparer puis campagne.** Le plan livre d'abord tout ce qui ne dépend pas de l'appareil (squelette de consignation, grille de décision vide, procédure de campagne), puis un checkpoint humain attend l'appareil — campagne et décision dans la même session quand il est là. Le différé honnêtement consigné reste le repli documenté au checkpoint (succès criterion 1), mais ce n'est pas le chemin principal.
- **D-06:** Campagne et décision CACHE-01 dans la **MÊME session** : la grille §7.4 est remplie les données sous les yeux, la justification (a)(b)(c) écrite à chaud — le biais d'ordre §6 est respecté et la relecture différée des mesures est exclue.
- **D-07:** **Commit par famille immédiat** : chaque famille modifiée est commitée juste après sa décision (valeur + Test H vert + commentaire au même commit), avant de passer à la suivante — un échec n'enchaîne pas sur les familles restantes.
- **D-08:** Chaîne §2.7 complète **une fois à l'état final du dépôt**, après le dernier commit de famille, résultat consigné dans le document MESURES (forme §7.6 de la phase 42) — pas de chaîne par commit (le SQL n'est pas touché ; ~6 exécutions pour rien autrement).

### Emplacement de la décision
- **D-09:** La grille §7.4 est remplie **directement dans `docs/MESURES-COLD-START-42.md`** (référence versionnée des mesures, emplacement déjà prévu), puis la décision est reportée dans PROJECT.md — un seul lieu de grille, pas de duplication.
- **D-10:** PROJECT.md porte le **verdict par famille** (statu quo / nouvelle valeur) avec renvoi vers §7.4 pour la justification (a)(b)(c) complète — PROJECT.md reste lisible en une page, la justification vit à côté des données qui l'appuient.
- **D-11:** La section « Décision CACHE-01 » n'apparaît dans PROJECT.md **qu'une fois §7.4 remplie avec des données réelles** — règle §2.7 I (jamais d'affirmation sans preuve). Le squelette préparé ne touche pas PROJECT.md.
- **D-12:** Le commit de consignation (§7 rempli + PROJECT.md) est **distinct des commits de code par famille** — la consignation est auditée indépendamment, et le commit de code reste « valeur + Test H vert + commentaire » pur.

### Observabilité conditionnelle — détail cache par famille (succès criterion 4)
- **D-13:** **Tâche conditionnelle** dans le plan : le détail cache par famille n'est écrit que si le besoin apparaît — conforme au critère 4 « déclenché par besoin, jamais préventif ». Jamais livré préventivement, jamais par replanification complète.
- **D-14:** Si ajouté : une **section « détail par famille » repliée dans le panneau offline existant**, alimentée par `inspectPersistedCache` — lecture seule, zéro nouveau paquet/service (décision STATE.md verrouillée), aucune mutation du cache.
- **D-15:** **Seuil de déclenchement nommé dans le plan** : le panneau actuel suffit s'il permet de répondre aux critères (a) et (c) par famille ; sinon la tâche conditionnelle s'exécute — le seuil est écrit dans le plan, pas laissé au jugement du moment.
- **D-16:** Si l'observabilité est livrée, elle arrive **AVANT la lecture du panneau de la campagne** (pendant la phase préparatoire, au moment où le seuil est évalué contre l'outil existant) — jamais entre campagne et décision, sinon les deux lectures ne sont pas comparables.

### the agent's Discretion
- Forme exacte des squelettes (mise en page des tableaux, libellés) — les champs requis sont verrouillés par D-02/D-03, pas leur habillage.
- Rédaction exacte de la procédure de campagne résumée (la séquence §2 reste la référence contraignante — le résumé ne la remplace pas).
- Découpage précis des plans/tâches par le planner (préparatoire → checkpoint → campagne+décision → commits).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Référence des mesures et critères de décision
- `docs/MESURES-COLD-START-42.md` — LA référence : protocole §1, purge §2/§2.1, segments §3, **critères d'arbitrage §5 (contraignants, avec tolérances produit par famille déjà énoncées)**, biais d'ordre §6, emplacements de consignation §7.1–7.4 à remplir, écarts §7.5, forme de la chaîne §7.6.
- `.planning/REQUIREMENTS.md` §CACHE-01..04 — exigences verrouillées de la phase.
- `.planning/ROADMAP.md` §Phase 44 — goal, success criteria 1..4 (campagne §6 ou différé consigné ; grille AVANT tout code ; commit atomique par famille ; observabilité déclenchée par besoin).
- `.planning/STATE.md` §Accumulated Context — décisions du jalon v1.4 : ordre par risque, zéro nouveau paquet/service, statu quo justifié = décision valide (CA-03), critères (b)(c) tranchent (biais d'ordre).

### Code à décider / à mesurer
- `app/src/lib/query-policy.ts` — `OFFLINE_FAMILIES` (11 familles, prefixes = tables réelles des hooks Tier 1), `gcTime` 7 j avec commentaire à re-regarder si une valeur dépasse 7 jours, Test H de `query-policy.test.ts` qui refuse toute divergence.
- `app/src/lib/query-policy.test.ts` — Test H (cohérence prefixes ↔ constantes api.ts), Test D/E (garde de classe de la politique).
- `app/src/lib/offline/query-persistence.ts` — `inspectPersistedCache` (ageMs, maxAgeMs, pruneEligible par famille) et `getRestoreOutcome` — source de l'observabilité conditionnelle (D-14).
- `app/src/modules/parametres/components/offline-panel.tsx` — panneau diagnostic où vivrait la section conditionnelle « détail par famille ».

### Patrons de consignation
- `.planning/milestones/v1.3-phases/38-filet-de-tests-fiable/38-E2E-SIGNATURE.md` — forme imposée de la consignation (ce qui est prouvé, ce qui ne l'est pas).
- `AGENTS.md` §2.7 — chaîne de vérification, « un succès muet est un échec inexpliqué » (F), « une absence affirmée est une affirmation » (I).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `docs/MESURES-COLD-START-42.md` : les sections §7.1–7.4 sont déjà des emplacements structurés (tableaux par famille) — le squelette préparé les complète, il ne les remplace pas.
- `inspectPersistedCache` / `getRestoreOutcome` (`app/src/lib/offline/query-persistence.ts`) : l'observabilité conditionnelle réexpose ce qui existe déjà, rien de nouveau à mesurer.
- Panneau offline existant (`app/src/modules/parametres/components/offline-panel.tsx`) : la section conditionnelle s'y insère, mêmes conventions (lecture seule).

### Established Patterns
- Source unique de politique : `OFFLINE_FAMILIES` et `gcTime` vivent dans `query-policy.ts`, le Test H refuse toute divergence avec les constantes des api.ts — toute modification de maxAge passe par ce fichier et son test au même commit.
- Document de preuve réécrit à chaque campagne, historique dans git (D-08 phase 43, appliqué en D-04).
- Verdict + renvoi dans PROJECT.md, justification détaillée dans le document de preuve (esprit 38-E2E-SIGNATURE).

### Integration Points
- `pruneExpiredFamilies` au restore : c'est là que maxAge agit — modifier une valeur change ce que le panneau montrera à la lecture suivante (biais d'ordre §6).
- `gcTime` (7 j) : doit rester ≥ au maxAge le plus long — si une famille dépasse 7 jours, le commentaire Pitfall 1 et `gcTime` se réajustent au même commit.
- Outbox, bandeau offline, service worker : intouchables (verrouillé ROADMAP.md success criteria 3, anti-feature v1.3).

</code_context>

<specifics>
## Specific Ideas

- La mesure est manuelle on-device : la différence avec la phase 43 (script auto-rédigeant) est assumée — le squelette préparé joue le rôle que le script jouait là-bas : rendre l'oubli impossible par la forme.
- Le seuil de déclenchement de l'observabilité (D-15) doit être NOMMÉ dans le plan : « le panneau suffit s'il permet de répondre aux critères (a) et (c) par famille » — sinon le « déclenché par besoin » du critère 4 reste subjectif.
- L'observabilité jamais entre campagne et décision (D-16) : deux lectures faites avec des outils différents ne sont pas comparables — la règle protège la comparabilité des médianes.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 44-Décision cache maxAge par famille (CACHE-01)*
*Context gathered: 2026-11-11*
