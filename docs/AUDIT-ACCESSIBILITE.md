# Audit accessibilité — consolidation du jalon v1.5 (phase 52)

Recopie par référence (mécanisme D-07 de la phase 46) : fiches citées par ID,
sévérité et disposition verbatim, preuves pointées vers leurs rapports
sources (gitignés : preuve par leur contenu). État consolidé : **état FINAL
du jalon** (D-08) — les fixes A11Y de la phase 50 sont livrés et re-scannés.

Sources principales :
`.planning/phases/49-audit-accessibilit-wcag-2-2-aa/49-AUDIT.md` (§6
synthèse) et
`.planning/phases/50-fixes-a11y-majeurs/50-SCANS-FINAUX.md` (classement final
des scans, rejoués le 2026-11-13T16:41Z).

## Synthèse 49-AUDIT §6 (recopiée telle quelle)

| Disposition | Fiches |
|---|---|
| **bloquant** (→ phase 50) | 1 — A11Y-49-01 (cibles < 44 px sur /connexion et /foyer/rejoindre, desktop + mobile) |
| **informatif** (→ backlog QUA-04) | 7 — A11Y-49-02, 03, 04, 05, 06, 07, 08, 09 (huit fiches, dont une observation de parcours non fichée rattachée) |
| **design-verrouillé** (verify-only) | 1 — A11Y-49-10 (faux positif d'animation prouvé + D-07) |

**Aucune violation des exports n'est restée non classée** : les scans
`target-size` du plan 02 renvoient zéro violation et zéro « needs review »
sur les 18 exports ; les scans complémentaires à règles par défaut (20 scans,
49-03) produisent exactement 5 ids de violation/incomplete
(`label-content-name-mismatch`, `landmark-one-main`, `region`,
`page-has-heading-one`, `color-contrast`) + 1 id incomplete
(`aria-hidden-focus`), tous fichés ou allowlistés.

## Devenir des fiches (état final du jalon)

- **Fix en phase 50** : A11Y-49-01 (cibles < 44 px, bloquant) et les fiches
  corrigées 02/04/07 — disposition « fix ». Preuve : les 4 fixes des plans
  50-02..05 tiennent — plus aucune trace des violations corrigées (outline
  des champs, cibles < 44 px, `aria-hidden-focus` du skip-link,
  `label-content-name-mismatch` des tuiles) dans les exports finaux
  (50-SCANS-FINAUX, conclusion sur le critère 4 de ROADMAP).
- **Backlog QUA-04** : A11Y-49-03/05/06/08/09 — fichées dans
  `docs/TODO.md` §« Backlog des audits du jalon v1.5 » (quoi / pourquoi /
  comment vérifier). Non nouvelles au sens strict : les violations
  best-practice axe (landmarks) sont les mêmes que celles de la phase 49.
- **Design-verrouillé (verify-only)** : A11Y-49-10 — faux positif
  `color-contrast` d'animation prouvé (re-mesure datée 2026-11-13T13:30Z
  après 2,5 s d'attente : 0 violation sur le même état) + D-07 (jamais de
  retouche photo/overlay). Cité tel quel, jamais réécrit.

## Classement final des scans (50-SCANS-FINAUX, 2026-11-13T16:41Z)

Scans rejoués avec le harnais corrigé (50-01) : `cd app && npx playwright
test e2e/a11y-audit.spec.ts` → **14 passed**, 18 exports JSON datés 16:41 ;
garde T-50-09 vérifiée (`reglesExecutees.length ≥ 89`, 89–91, `target-size`
incluse, exit 0) ; garde T-50-02 : brut de la phase 49 intact.

- **8 nœuds allowlistés** : `color-contrast` (serious) sur les tuiles
  « Ouvrir Frigo » / « Ouvrir Menu » du tiroir mobile — couverts par
  l'allowlist A11Y-49-10 (ratios mesurés = signature de la couleur mélangée
  animée, pas de couleurs statiques différentes).
- **39 nœuds informatifs → backlog QUA-04** : `landmark-one-main` +
  `region` sur /connexion et /foyer/rejoindre (les 2 projets) et
  `page-has-heading-one` sur /connexion mobile — déjà fichés A11Y-49-05,
  hérités du backlog.
- **0 bloquant nouveau** — « Aucune violation axe bloquante des parcours
  clés ne subsiste au scan final (hormis l'allowlist consignée) » : VRAI,
  prouvé par les décomptes cités (parcours dashboard, courses, tâches,
  ardoise et dialogs de suppression à zéro violation sur les deux projets).

## Limites de couverture (49-AUDIT, citées telles quelles)

- **L1** (découverte 49-03) : le harnais du plan 02 limitait axe à
  `target-size` (`withRules`) ; les scans complémentaires à règles par
  défaut (89–90 règles exécutées) comblent le trou ; le harnais corrigé en
  phase 50 sert les scans finaux.
- **L2** : axe n'automatise qu'une fraction de WCAG 2.2 — focus visible,
  navigation clavier et focus-not-obscured relèvent de la revue humaine
  (49-AUDIT §3).
- **L3** : 89–90 règles exécutées confirmées, aucune autre règle
  taggée `wcag22*` active au-delà de `target-size`.
- **L4** : les 3 tests vitest pré-existants en échec
  (`calendrier-page.test.tsx`) sont hors périmètre de la phase 49 read-only.

## Contrôle anti-fuite

Contrôle des motifs de valeurs de secrets (clés secrètes Supabase et mot de
passe PostgreSQL) exécuté avant commit sur ce fichier → 0 occurrence
(menace T-52-06).
