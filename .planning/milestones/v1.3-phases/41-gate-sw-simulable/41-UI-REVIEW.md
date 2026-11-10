# Phase 41 — UI Review

**Audited:** 2026-11-10
**Baseline:** aucun UI-SPEC pour cette phase (aucun requis — voir ci-dessous) ; audit d'invariance sur le contrat UI existant (bandeau de mise à jour, phase 32, D-09/D-10/D-17)
**Screenshots:** not captured (no dev server on 3000/5173/8080 — audit code-only ; cohérent : la phase ne modifie aucun rendu)
**Interaction captures:** off (workflow.ui_interaction_capture is false ; et aucune UI nouvelle à capturer)

---

## Nature de la phase

Phase 41 (`41-gate-sw-simulable`) est une phase de preuve e2e : GATE-01 (gate de mise à jour « file vide ») prouvée contre deux builds réels servis sur le même origin. Aucun composant UI nouveau, aucun changement de layout, de token ou de style n'a été produit. La surface UI-touchée se limite à :

- `app/src/sw.ts` — retrait du `self.skipWaiting()` de démarrage + ajout du handler `SKIP_WAITING` (logique lifecycle, pas de rendu) ;
- le flux du bandeau de mise à jour (`app/src/components/banners/update-banner.tsx`) est **exercé** par la spec mais **non modifié**.

L'audit vérifie donc que le contrat est intact (invariance), pas qu'une nouvelle UI est correcte.

## Vérifications d'invariance (preuves)

1. **Aucun fichier UI modifié par la phase 41** — `git diff --stat 0ebf6c1..HEAD` (les 4 commits 41 : d0d44b5, 84b8a26, 9b99cbf, a8b627c) ne touche que : `app/e2e/sw-gate-real.spec.ts`, `app/playwright.config.ts`, `app/src/lib/e2e-sw-harness.ts`, `app/src/main.tsx`, `app/src/sw.ts`, `scripts/*`, `docs/EXPLOITATION.md`, `.planning/*`. **Zéro** fichier de composant, de CSS, de token ou de style.
2. **Bandeau intact** — `git log -1 -- app/src/components/banners/update-banner.tsx` → `5860ff2` (phase 32-02), dernier toucher avant la phase 41. Diff nul confirmé aussi dans le SUMMARY (`DIFF_PROTEGE=0` sur `sw-register.ts`, `use-outbox-gate.ts`, `update-banner.tsx`).
3. **Les verbatims que la spec affirme correspondent au composant réel** (`update-banner.tsx` l.22-32) :
   - `role="status"` (l.22) ↔ spec attend `getByRole('status')` contenant « Une mise à jour est disponible » ;
   - texte « Une mise à jour est disponible » (l.25) ✓ ;
   - `disabled={!isEmpty}` (l.29) ↔ cas « gate fermée » de la spec ✓ ;
   - libellé conditionnel `{isEmpty ? 'Recharger' : 'Mise à jour en préparation…'}` (l.32) ↔ cas 1 (désactivé) et cas 2 (actif) de la spec ✓ ;
   - bouton « Plus tard » (dismiss) non exercé par la spec — hors périmètre GATE-01, non régressé.
   Le contrat D-17 (renommer un verbatim DOIT casser la spec) est respecté : spec et composant sont verbatim-identiques.
4. **Anti-fork** — `onNeedRefresh` n'est implémenté que dans `app/src/lib/sw-register.ts:28`. Les occurrences dans `e2e-sw-harness.ts:18` et `sw-gate-real.spec.ts:15,182,191` sont des **commentaires/JSDoc** documentant le mécanisme, aucun appel ni réimplémentation. Le harnais écrit la file uniquement via `enqueueOutbox` sur le `queryClient` exporté (source unique D-03).
5. **UI-SPEC** — `.planning/phases/41-gate-sw-simulable/41-UI-SPEC.md` n'existe pas, et aucun UI-SPEC n'était requis : la phase ne construit aucune UI nouvelle (la phase 40, qui touchait du rendu, en avait un — le contraste confirme la règle). Rien à mettre à jour ; consigné.
6. **Changement `sw.ts` — seul écart comportemental côté UI-adjacent** : le retrait du `skipWaiting()` de démarrage **répare** le contrat UI existant plutôt que de le violer. Avant la phase 41, le bandeau D-09 (« aucun reload sans action utilisateur ») était inatteignable : le nouveau worker s'activait en silence, le bandeau n'apparaissait jamais. Après : le bandeau apparaît réellement sur worker en attente, et « Recharger » est la seule voie d'application (mode prompt D-09 restauré). C'est un PASS sur le contrat, prouvé comportementalement par les 4 cas e2e (4/4 verts, contrôle négatif vu rouge avant vert).

## Pillar Scores

| Pillar | Verdict | Justification |
|--------|---------|---------------|
| 1. Copywriting | **PASS (invariance)** | Verbatims « Une mise à jour est disponible », « Recharger », « Mise à jour en préparation… » identiques entre spec et `update-banner.tsx:25,32` ; aucun libellé nouveau introduit par la 41 |
| 2. Visuals | **PASS (invariance)** | Aucun fichier de rendu modifié (`git diff --stat` sur les 4 commits 41 : 0 composant, 0 style) ; `role="status"` et hiérarchie du bandeau inchangés depuis la phase 32 |
| 3. Color | **PASS (invariance)** | Aucune classe de couleur, token ou variable modifiée ; le bandeau conserve `border-border bg-surface` existant |
| 4. Typography | **PASS (invariance)** | Aucune taille/graisse de police touchée ; `text-sm` du bandeau inchangé |
| 5. Spacing | **PASS (invariance)** | Aucune classe d'espacement touchée ; `px-[inherit] py-3 gap-3` du bandeau inchangés |
| 6. Experience Design | **PASS (renforcé)** | La phase 41 **prouve** des états interactionnels jusqu'ici invérifiés : gate fermée (bouton désactivé, aucun reload — cas 2), gate ouverte (application réelle — cas 1), file seule sans bandeau (cas 3), contrôle négatif falsifiable (cas 4, vu rouge avant vert). Le `disabled={!isEmpty}` et le mode prompt D-09 sont désormais couverts e2e contre un vrai lifecycle SW — 4/4 verts, `test-sw-gate.sh` EXIT=0 |

**Overall:** 6/6 verdicts PASS (audit d'invariance — pas de score numérique par pilier, aucune UI nouvelle à scorer)

---

## Top 3 Priority Fixes

Aucun. Aucun défaut UI introduit ni révélé par la phase 41. Observation mineure (non bloquante, préexistante) :

1. *(mineur, préexistant)* Le bouton « Plus tard » du bandeau (`update-banner.tsx:36`) n'est couvert que par le test RTL de la phase 32, pas par la spec e2e de la 41 — hors périmètre GATE-01, aucune action requise cette phase.
2. *(mineur, préexistant)* La spec repose sur les verbatims DOM (D-17) : toute rewording du bandeau cassera `sw-gate-real.spec.ts` — c'est le contrat voulu, rappelé ici comme garde.
3. *(mineur)* Les mentions de `onNeedRefresh` dans les commentaires du harnais/spec peuvent déclencher un faux positif du grep anti-fork à une future revue — les occurrences sont documentatives, aucune réimplémentation (vérifié cette passe).

---

## Registry Safety

Non exécuté : aucun `components.json` à la racine du scope de cette phase et aucun registre tiers listé — la phase n'installe aucun paquet (T-41-SC : gate non déclenchée, confirmé au SUMMARY).

## Files Audited

- `app/src/sw.ts` (diff phase 41 — seul fichier UI-adjacent modifié)
- `app/src/components/banners/update-banner.tsx` (intact, phase 32 — verbatims vérifiés l.22-32)
- `app/e2e/sw-gate-real.spec.ts` (nouveau — assertions vs composant réels)
- `app/src/lib/e2e-sw-harness.ts` (nouveau — anti-fork vérifié)
- `app/src/lib/sw-register.ts` (intact, phase 32)
- `app/playwright.config.ts` (routage uniquement)
- `.planning/phases/41-gate-sw-simulable/41-01-PLAN.md`, `41-01-SUMMARY.md`, `41-VERIFICATION.md`

---

_Revue consultative (advisory) : ne bloque jamais la livraison. Constat central : le contrat UI de la phase est l'invariance, et il est tenu — la seule modification UI-adjacente (`sw.ts`) restaure le comportement prompt D-09 que le bandeau existant présupposait._
