# Audit qualité — consolidation du jalon v1.5 (phase 52)

Recopie par référence (mécanisme D-07 de la phase 46) : chaque fiche est citée
par son ID, sa sévérité et sa disposition verbatim, avec la preuve pointée
vers son rapport source — jamais réinterprétée. Les rapports sources vivent
sous `.planning/phases/` (gitignés : preuve par leur contenu, jamais
`git add -f`).

État consolidé : **état FINAL du jalon** (D-08 de la phase 52) — les fixes
précèdent le closing, la preuve citée ci-dessous est celle du jour du closing.

Source principale : `.planning/phases/51-audit-qualit-transverse/51-AUDIT.md`
(rapport unique de la phase 51), section « 7. Consolidation pour la phase 52 »
(liste prête à recopier, chemin + lignes).

## Fixations du jalon (par commit de fix)

| Fiche | Fix | Commit |
|-------|-----|--------|
| SEC-45-01 (rappel axe sécurité) | migration 0183 + testkit non-escalade, lint 0006 → 0 rows | `7795b03`, `ba4b30d` |
| QUA-51-02 | re-exports morts supprimés (2 lignes) | `c64536e` |
| QUA-51-04 | 5 micro-défauts oxlint corrigés | `e94dc5a` |
| QUA-51-05 | 13 dépendances npm retirées (`npm uninstall`, lockfile §2.1 vérifié) | `619bd04` |
| QUA-51-06 | 2 fichiers morts supprimés | `6cbb2ce` |
| QUA-51-DD-01 | module `/documents` documenté dans AGENTS.md §3 + §5 | `4f6f138` |
| QUA-51-DD-02 | bloc documentaire périmé retiré de `deploy-functions.sh` | `7a49865` |
| QUA-51-DD-03 | prose du guide prestataires alignée sur le formulaire (Type optionnel) | `3155a5a` |

## Fiches QUA-51 (fix 52 — toutes fixées)

### QUA-51-02 — re-exports morts (2 instances prouvées)

- **Surface** : `app/src/modules/courses/off-rayon.ts:113`
  (`export { normalizeRayon }`) ; `app/src/modules/recettes/api.ts:308`
  (`export type { RecipeRow }`).
- **Sévérité** : mineur — cité 45-SPEC.md §1 par référence.
- **Disposition d'origine** : fix 52. **Disposition finale : fixé** —
  commit `c64536e` (2026-11-14), chaîne §2.7 verte à l'époque du fix ;
  les deux lignes sont absentes du dépôt à l'état final
  (`grep -c "export { normalizeRayon }" app/src/modules/courses/off-rayon.ts` → 0,
  2026-11-14, jour du closing).

### QUA-51-04 — micro-défauts oxlint sur code source (5 occurrences)

- **Surface** : `src/modules/routines/types.ts:730`
  (`no-useless-spread`) ; `src/modules/notes/components/note-markdown.tsx:64`
  et `:76` (`no-unused-vars`, paramètre `node`) ; `src/modules/notes/types.ts:375`
  (`no-useless-escape`, `[\[\]]` → `/[[\]]/g`) ;
  `src/modules/parametres/api.ts:94` (`no-useless-fallback-in-spread`).
- **Sévérité** : mineur — cité 45-SPEC.md §1 par référence.
- **Disposition d'origine** : fix 52. **Disposition finale : fixé** —
  commit `e94dc5a` (2026-11-14) ; équivalence regex prouvée dans le message de
  commit (une classe vide ne matche rien en JS, l'ordre des échappements compte).

### QUA-51-05 — dépendances npm inutilisées (13)

- **Surface** : `app/package.json` — 10 `dependencies`
  (`@date-fns/tz`, `@radix-ui/react-avatar/popover/progress/radio-group/scroll-area/select/separator/toast/tooltip`)
  + 3 `devDependencies` (`workbox-cacheable-response`, `workbox-expiration`,
  `workbox-strategies`).
- **Sévérité** : mineur — cité 45-SPEC.md §1 par référence (poids
  d'installation, aucun impact runtime).
- **Disposition d'origine** : fix 52. **Disposition finale : fixé** —
  commit `619bd04` (2026-11-14), retrait par `npm uninstall` ; lockfile
  vérifié (AGENTS.md §2.1) ; `workbox-core/precaching/routing` conservés
  (imports de `sw.ts` vérifiés avant retrait). Build PWA vert à l'état final
  (section TRA-03 ci-dessous).

### QUA-51-06 — fichiers morts (2)

- **Surface** : `app/scripts/screenshots.mjs` et
  `app/src/modules/ardoise/components/invite-member-dialog.tsx`.
- **Sévérité** : mineur — cité 45-SPEC.md §1 par référence.
- **Disposition d'origine** : fix 52. **Disposition finale : fixé** —
  commit `6cbb2ce` (2026-11-14) ; les 2 autres fichiers knip
  (`fixtures/sw-bon.js`, `fixtures/sw-mauvais.js`) restaient rejetés
  (consommés par le test de contrat du SW), rejet consigné dans 51-AUDIT.

### QUA-51-DD-01 — dérive docs/code : le module `documents` est absent d'AGENTS.md (§3 et §5)

- **Surface** : `AGENTS.md` §3 (arbre `/modules`, l. 369-391, 22 répertoires)
  et §5 (aucune table `documents`/`document_folders`).
- **Sévérité** : mineur — cité 45-SPEC.md §1 par référence (danger
  documentaire exact d'AGENTS.md §2.7-I).
- **Disposition d'origine** : fix 52 (critère 3 de la roadmap).
  **Disposition finale : fixé** — commit `4f6f138` (2026-11-14) : `/documents`
  ajouté à l'arbre §3, tables `documents`/`document_folders` documentées à §5
  (0143). La convention §5 porte désormais les deux tables du module.

### QUA-51-DD-02 — dérive prose/code : liste documentaire de `deploy-functions.sh` en retard sur la réalité

- **Surface** : `scripts/deploy-functions.sh:22-24` (liste documentaire de
  5 fonctions) vs réalité — 16 fonctions (`sh scripts/deploy-functions.sh --list`
  fait foi, CABL-51-03).
- **Sévérité** : mineur — cité 45-SPEC.md §1 par référence.
- **Disposition d'origine** : fix 52. **Disposition finale : fixé** —
  commit `7a49865` (2026-11-14) : bloc documentaire périmé supprimé, la liste
  réelle reste portée par `--list` (l. 26-28).

### QUA-51-DD-03 — dérive docs/code : la prose du guide prestataires dit le champ Type obligatoire, le formulaire le marque `optional`

- **Surface** : `app/src/modules/prestataires/prestataires-guide-content.ts:51`
  (« Seuls le nom et le type sont dérangeants ») vs
  `provider-form-dialog.tsx:119-121` (`<Field label="Type" optional>`,
  option « Sans type »).
- **Sévérité** : mineur — cité 45-SPEC.md §1 par référence.
- **Disposition d'origine** : fix 52. **Disposition finale : fixé** —
  commit `3155a5a` (2026-11-14) : la prose du guide est alignée sur le
  formulaire (Type optionnel).

## Fiches QUA-51 (backlog QUA-04 — hors périmètre de fix 52)

### QUA-51-01 — exports sans consommateur, classe transverse (170 exports)

- **Sévérité** : mineur — cité 45-SPEC.md §1 par référence.
- **Disposition** : backlog QUA-04 — entrée durable dans `docs/TODO.md`
  (section « Backlog des audits du jalon v1.5 ») ; liste complète symbole par
  symbole pointée vers
  `.planning/phases/51-audit-qualit-transverse/brut/triage-plan02-exports-2026-11-14.log`
  (section « ## Balayage 3 », lignes classées A).

### QUA-51-03 — duplications de helpers/formatteurs entre modules (classe, §2.7-E)

- **Sévérité** : mineur — cité 45-SPEC.md §1 par référence (chaque copie est
  correcte individuellement).
- **Disposition** : backlog QUA-04 — chantier unique « mutualiser dans
  `@/lib` » (`formatBytes`, `formatClockTime` ×3, `toReminderIso` ×2,
  `ReadMap` ×2, `GridDay` ×2, `daysUntil`, `displayablePhoto`), entrée
  durable dans `docs/TODO.md`.

## Fiches CABL-51 (verrouillées — fiches de preuve, jamais des constats)

CABL-51-01 (pg_cron : 14 jobs, 50 548 runs réussis), CABL-51-02 (testkit :
105 fichiers verts le 2026-11-14 au matin), CABL-51-03 (deploy-functions :
16 fonctions), CABL-51-04 (Dexie : 10 suites contrat) — prouvées datées dans
51-AUDIT.md, surfaces verrouillées de la stop-list 51-SPEC §2.

## TRA-03 — chaîne §2.7 complète rejouée à l'état final (blocs datés)

La chaîne complète de vérification (AGENTS.md §2.7) a été rejouée
intégralement le **2026-11-14**, à l'état FINAL du jalon (après tous les
fixes et consolidations des plans 52-01 à 52-05, dernier commit avant la
chaîne : `e3cdbe0`), dans l'ordre prescrit, chaque résultat observé consigné
(§2.7-F : jamais un succès muet). La preuve de clôture est cette dernière
exécution post-fix — les preuves vertes du matin (51-AUDIT Axe 6, 08:48Z)
sont révolues comme preuve de clôture.

```
2026-11-14T12:05:17Z  $ cd app && npm run typecheck
  → tsc --noEmit, exit=0 (aucune erreur)

2026-11-14T12:05:21Z  $ cd app && npm test
  → vitest v5 : Test Files 245 passed (245), Tests 2006 passed (2006),
    exit=0, durée 235,17 s — aucun échec, aucun hors-périmètre à
    consigner (les 3 échecs pré-existants de calendrier-page.test.tsx
    signalés en 49-AUDIT L4 sont révolus depuis la phase 51).

2026-11-14 ≈ 12:09:20Z  $ cd app && npm run build
  → Vite build OK (PWA v1.3.0, mode injectManifest, précache 152 entrées
    2752,39 KiB, dist/sw.js généré), exit=0

2026-11-14 ≈ 12:09:25Z → 12:12:55Z  $ cd app && npm run test:e2e
  → Playwright : 179 passed, 11 skipped, exit=0 (3,4 min)

2026-11-14 ≈ 12:13:05Z  $ python3 scripts/check-sql-statique.py
  → 232 fonction(s) effective(s) sur 184 migration(s) et 108 test(s),
    aucun défaut, exit=0. Deux motifs exempts consignés par le contrôle
    lui-même (définitions dépassées 0019 corrigées plus loin ; exempt
    DML→ALTER 0039 risqué mais inerte) — connus, documentés, sans effet
    sur la base.

2026-11-14 ≈ 12:13:08Z  $ python3 scripts/test-check-sql-statique.py
  → 6 cas, tous verts (dont _cas_tag_nomme_jamais_ferme et
    _cas_litteral_ouvert), exit=0

2026-11-14 ≈ 12:13:10Z  $ sh scripts/test-db.sh
  → Tests SQL : 106 fichier(s), tous verts, exit=0 — dont le test
    0183_ardoise_single_permissive_policy.test.sql (fix SEC-45-01) :
    politiques fusionnées, non-escalade §2.6 prouvée à l'état final.
    Docker disponible ce jour-là : preuve réelle, pas un grep.

=== CHAIN END 2026-11-14T12:13:18Z ===
```

### Mention explicite — test-dispatch-push.sh non concluant (§2.7-F)

```
2026-11-14 ≈ 12:13:15Z  $ sh scripts/test-dispatch-push.sh
  → Sonde Edge auth OK (400 métier attendu) ; puis :
    « aucun abonnement de push réel sur cette instance. Ouvrir
    l'application sur un appareil, autoriser les notifications, puis
    relancer. Un endpoint factice ne prouverait rien. »
```

Le script est exécutable et sa sonde répond, mais **aucun appareil abonné
n'est disponible ce jour-là** : le push réel n'a pas pu être prouvé
`delivered`. Consigné explicitement (§2.7-F — jamais un succès muet) ;
c'est la voie par défaut acceptable du plan (un push réel `delivered` la
surclasserait). Le contrôle est à rejouer à la première mise en production
naturelle avec un appareil abonné, comme les observatoires GATE-01.

## D-03 — preuve d'absence de test SQL périmé

**Aucune fiche 51 ne liste de test SQL périmé** (assertion sur une
définition dépassée). La branche « corrigés vers la définition effective »
du critère 1 de la phase 52 est satisfaite **par preuve d'absence**
(§2.7-I) :

- `test-db.sh` vert à l'état final du jalon : **106/106 fichiers verts**
  le 2026-11-14 ≈ 12:13:10Z (bloc ci-dessus). Le compteur a augmenté de
  105 → 106 pendant le jalon : le test `0183` (fix SEC-45-01, plan 52-01)
  s'est ajouté et passe — aucune assertion n'a eu besoin d'être corrigée
  vers une définition effective, aucune n'est restée verte par hasard.
- `check-sql-statique.py` : 232 définitions effectives, **aucun défaut**
  ; les seuls motifs « dépassés/exempts » affichés sont des entrées
  connues et documentées (0019 corrigé plus loin dans la même série de
  migrations, 0039 inerte) que le contrôle exclut explicitement sans
  faire échouer le dépôt — leur existence prouve que le contrôle regarde
  réellement (§2.7-F : un contrôle qui n'a jamais refusé n'a pas été
  exercé).
- `test-check-sql-statique.py` : 6 cas dont 4 doivent échouer, tous verts.

## Contrôle anti-fuite final

```
2026-11-14 (jour du closing)  $ grep -riE "sb_secre[t_]|POSTGRES_PASSW[O]RD" docs/AUDIT-QUALITE.md
  → 0 occurrence
```

Conformément à AGENTS.md §2.7-H : aucun secret de la stack ne figure dans
ce rapport — seuls des RÉSULTATS (compteurs, verdicts) y sont consignés,
jamais des valeurs de configuration.

## Synthèse de clôture QUA-03

La QUA-03 (« tout constat majeur de qualité est corrigé atomiquement »)
est satisfaite **par preuve d'absence** : le rapport 51 ne contient
**aucune fiche majeure** — les 6 fiches QUA-51-02..06 + DD-01..03 sont
toutes mineures et toutes fixées en 52 (tableau ci-dessus), chaque fix
porté par un commit isolé avec chaîne §2.7 verte à l'époque du fix
(convention 46/48/50). Les fiches transverses restantes (QUA-51-01,
QUA-51-03) sont mineures et vivent au backlog durable `docs/TODO.md` —
c'est leur disposition d'origine, pas un report silencieux.

Clôture du rapport : consolidation qualité terminée — 9 fiches fixées par
commit, 2 fiches au backlog, 4 fiches de preuve verrouillées, chaîne §2.7
complète verte datée du jour du closing, mention explicite dispatch-push,
preuve d'absence D-03 consignée, anti-fuite 0.
