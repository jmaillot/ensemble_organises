# 38-NYQUIST-AUDIT — Audit de couverture de validation (phase 38)

**Date de l'audit :** 2026-11-09
**Auditeur :** gsd-nyquist-auditor (audit rétroactif, exécution réelle des contrôles)
**Périmètre :** 3 exigences de phase (TEST-01, TEST-03, DEBT-01) portées par 4 plans exécutés et commités.

> Méthode : chaque exigence a été recoupée contre les fichiers de test réels sur disque, puis les commandes automatisées ont été **ré-exécutées le jour de l'audit** (pas seulement lues dans les summaries). Aucun test nouveau n'a été créé (périmètre audit seul).

---

## 1. Test Infrastructure (valeurs réelles relevées)

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 + React Testing Library (app/) ; Playwright (e2e) ; Python scripts (contrôle SQL statique) |
| **Config file** | `app/vitest.config.ts` (présent sur disque) |
| **Quick run command** | `cd app && npm run typecheck && npm test -- --run` |
| **Full suite command** | `cd app && npm run typecheck && npm test && npm run build && npm run test:e2e && python3 scripts/check-sql-statique.py && python3 scripts/test-check-sql-statique.py` |
| **SQL runtime (Docker)** | `sh scripts/test-db.sh` — **non requis pour la phase 38** : aucun SQL touché (I-03, consigné dans 38-03-SUMMARY) |
| **Estimated runtime** | typecheck+tests ~200 s ; e2e ~3,3 min ; SQL statique ~2 s |

Résultat de la ré-exécution d'audit (2026-11-09) :

```
cd app && npx vitest run src/lib/datetime.test.ts src/lib/data/seed.test.ts \
  src/stores/household-store.test.ts src/modules/menu/menu-page.test.tsx \
  src/modules/ardoise/guest-ardoise-page.test.tsx
→ Test Files 5 passed (5) | Tests 65 passed (65) | 5.31s
```

Contrôles statiques ré-exécutés : `check-sql-statique.py` → « 231 fonction(s) effective(s) sur 182 migration(s) et 107 test(s), aucun défaut » ; `test-check-sql-statique.py` → 6 cas verts ; awk balayage `ardoise-invite/index.ts` → 3 hits, tous les faux positifs documentés dans 38-03-SUMMARY (2× `Array.from(new Uint8Array(…))`, 1× `insert().select().single()`) ; `git diff cd3fdf1..HEAD -- app/e2e/critical-paths.spec.ts` → 0 ligne ; anti-skip sur lignes ajoutées → 0.

---

## 2. Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 38-01-01 | 01 | 1 | TEST-01 | — | N/A (dates pures) | unit | `cd app && npx vitest run src/lib/datetime.test.ts` | ✅ `app/src/lib/datetime.test.ts` | ✅ green (ré-exécuté 2026-11-09) |
| 38-01-02 | 01 | 1 | TEST-01 | — | N/A | unit (garde de classe + cas-qui-doit-échouer) | `cd app && npx vitest run src/lib/data/seed.test.ts src/modules/menu/menu-page.test.tsx` | ✅ `app/src/lib/data/seed.test.ts` | ✅ green (ré-exécuté) |
| 38-01-03 | 01 | 1 | TEST-01 | — | N/A | static | `grep -c getUTCDay app/src/modules/menu/types.ts` → 0 ; `grep -c debutSemaineIso app/src/modules/menu/types.ts` ≥ 1 | ✅ | ✅ green (vérifié à l'audit : 0 / présent) |
| 38-02-01 | 02 | 1 | TEST-01, TEST-03 | T-38-02 | N/A | reproduction + doc | `grep -c "WR-03" docs/RETROSPECTIVE.md` ≥ 2 | ✅ `docs/RETROSPECTIVE.md` | ✅ green (campagne v1.3 §12-15, taux 1/30 consigné) |
| 38-02-02 | 02 | 1 | TEST-01 | T-38-02 | N/A | unit (attente d'état) | `cd app && npx vitest run src/stores/household-store.test.ts` ; `grep -c "setTimeout(resolve, 1200)" … = 0` ; `grep -c vi.waitFor … ≥ 1` | ✅ | ✅ green (ré-exécuté : 0 sommeil, vi.waitFor présent) |
| 38-03-01 | 03 | 1 | DEBT-01 | — | N/A | unit + static | `cd app && npx vitest run src/modules/ardoise` ; `grep -rn "typeof response.status" app/src` → rien | ✅ `app/src/modules/ardoise/guest-ardoise-page.test.tsx` | ✅ green (ré-exécuté : 0 occurrence, 81 tests module verts au run 38-03) |
| 38-03-02 | 03 | 1 | DEBT-01 | T-38-01 | Lectures service_role bornées dans la requête (pas de filtrage JS) | e2e + static | `cd app && npm run test:e2e` (parcours invité) ; `grep -c ".in('expense_id', expenseIds)" supabase/functions/ardoise-invite/index.ts` ≥ 1 ; `grep -c ".eq('household_id', householdId)" … ≥ 1` | ✅ | ✅ green (ré-exécuté : 1 et 3 ; e2e 165 passed au run 38-03/04) |
| 38-03-03 | 03 | 1 | DEBT-01 | T-38-01 | Classe entière : aucune lecture de table entière | static (awk accumulateur d'énoncés) | `awk '{buf = buf $0 " "} /;/ { if (buf ~ /\.from\(/ && buf !~ /\.eq\(/ && buf !~ /\.in\(/) { print; bad = 1 } buf = "" } END { exit bad }' supabase/functions/ardoise-invite/index.ts` | ✅ | ✅ green (ré-exécuté : 3 faux positifs connus, 16 lectures bornées) |
| 38-04-01 | 04 | 2 | TEST-03 | — | Chaîne §2.7 fiable | chain + e2e | `cd app && npm run typecheck && npm test -- --run && npm run build && npm run test:e2e` | ✅ `38-E2E-SIGNATURE.md` | ✅ green (run 2026-11-08 consigné : 1988 tests, e2e 165 passed / 9 skipped / 2 failed = join-token seul) |
| 38-04-02 | 04 | 2 | TEST-03 | T-38-03 | Pas de skip / horloge figée / garde morte introduits | static (diff-scopé) | `git diff cd3fdf1..HEAD -- app/e2e app/src \| grep -cE '^\+.*test\.(skip\|fixme)'` → 0 ; `grep -rn setSystemTime` (3 fichiers) → 0 ; `grep -rn "typeof response.status" app/src` → 0 | ✅ | ✅ green (ré-exécuté : 0 / 0 / 0) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## 3. Classification par exigence

| Requirement | Verdict | Justification |
|-------------|---------|---------------|
| **TEST-01** (2 flakes éradiqués pour la classe : menu dimanche + WR-03 timing) | **COVERED** | Preuves unitaires paramétriques (7 ISO injectés, date en entrée, 0 `setSystemTime` — S-02 respecté), garde de classe seed avec cas-qui-doit-échouer, `vi.waitFor` remplace le sommeil (ré-exécuté vert), diagnostic W-02 consigné avec taux de reproduction 1/30 avant fix. Red-before-green documenté : Task 1 « 16 failed \| TypeError: debutSemaineIso is not a function », Task 2 « garde rouge listant meal-2 = 2026-11-09, meal-3 = 2026-11-10 », plus le cas du plan prouvé rouge à tort puis corrigé (honnêteté §2.7 B exemplaire). |
| **TEST-03** (chaîne §2.7 redevenue fiable ; plus aucun rouge préexistant assumé sauf join-token) | **COVERED** | Signature e2e consignée dans 38-E2E-SIGNATURE.md : 165 passed / 9 skipped / 2 failed = join-token seul (exclu explicitement J-01, soldé en 39 via TEST-02) ; 2 rouges → 1 rouge prouvé. Gardes statiques diff-scopées toutes vertes et ré-exécutées à l'audit. Réserve (WARNING mineure) : la preuve d'exécution date du 2026-11-08 et n'est reproductible que sur la machine de l'époque ; l'audit a ré-exécuté le sous-ensemble unitaire + statique (vert), pas le run e2e complet. |
| **DEBT-01** (IN-01 supprimée, IN-02 borné dans la requête, balayage I-01) | **COVERED** (avec réserve) | IN-01 : grep ré-exécuté → 0 occurrence, aucun commentaire résiduel ; 81 tests module ardoise verts. IN-02 : greps ré-exécutés (`.in('expense_id', expenseIds)` = 1, `.eq('household_id', householdId)` = 3) ; e2e invité vert (rendu identique, preuve comportementale). I-01 : awk ré-exécuté, 16 lectures toutes bornées (tableau occurrence → borne dans 38-03-SUMMARY), hypothèse A2 prouvée. test-db.sh non requis (aucun SQL touché — I-03 appliqué, pas escamoté). **Réserve :** la propriété « lectures bornées » est vérifiée statiquement (grep/awk) + comportementalement au niveau rendu e2e, mais il n'existe pas d'assertion runtime au niveau SQL (impossible sans test-db.sh et sans SQL touché — cohérent avec I-03). |

**Bilan : 3 COVERED, 0 PARTIAL, 0 MISSING.** Aucun gap bloquant ; deux réserves WARNING documentées ci-dessous.

---

## 4. Gap Analysis (réserves non bloquantes)

| # | Réserve | Sévérité | Action recommandée |
|---|---------|----------|--------------------|
| G-1 | La propriété IN-02 (bornage service_role) n'a pas de test runtime au niveau base — elle repose sur des greps + le rendu e2e. Si le fichier `index.ts` est réécrit sans les clauses `.in/.eq`, la garde n'existe que dans la discipline de relecture (aucun test ne devient rouge automatiquement lors d'un `npm test`). | WARNING | Option : lors de la phase 39 (TEST-02, qui touche `ardoise-invite`), déplacer le balayage awk vers un script versionné appelé par la chaîne (ex. `scripts/check-bornage-ardoise.sh`), pour que la garde survive au dossier de phase. Non bloquant pour 38. |
| G-2 | Les preuves d'exécution consignées (1988 tests, e2e 165 passed, signature join-token) datent du 2026-11-08 et la signature e2e dépend de l'environnement (join-token rouge attendu). Le `npm test` complet et `test:e2e` n'ont pas été ré-exécutés intégralement à l'audit (coût ~5 min) — seuls 65 tests ciblés + statique ont été rejoués (verts). | WARNING | Rejouer la chaîne complète avant sign-off milestone (déjà couvert par `/gsd-verify-work` et audit-milestone §5.5). |

**Red-before-green (exigence projet §2.7 B) — preuve par plan :**

| Plan | Preuve rouge citée |
|------|--------------------|
| 38-01 | `Tests 16 failed \| 12 passed (28)` — `TypeError: debutSemaineIso is not a function` (Task 1) ; `AssertionError: repas hors de la semaine courante : meal-2 = 2026-11-09, meal-3 = 2026-11-10` (Task 2) ; cas-qui-doit-échouer du plan prouvé rouge à tort puis corrigé. |
| 38-02 | Reproduction W-02 avant fix : 30 exécutions chargées → 1/30 rouge (D-17) ; 37 exécutions avec traceur temporaire ; WR-03 non reproduit dit explicitement (§2.7 F). |
| 38-03 | Pas de test nouveau (correction de code) : preuve = tests existants restés verts (81 tests ardoise, e2e invité rendu identique) + gardes statiques. Red-before-green non applicable — cohérent, l'exigence §2.7 B porte sur les tests, pas sur les fix de production. |
| 38-04 | Vérification pure : les gardes sont des commandes à résultat attendu chiffré (0/0/0), leur pouvoir d'échec est démontré par leur forme (grep -cE sur diff, exit codes). |

---

## 5. Conclusion

- **nyquist_compliant : recommandé `true`** — chaque exigence possède une commande automatisée qui peut échouer, les fichiers existent, les contrôles ont été ré-exécutés verts à l'audit.
- `wave_0_complete : true` — l'infrastructure existante couvre toutes les exigences de phase (aucune installation nouvelle).
- Le VALIDATION.md draft doit être rempli avec la carte ci-dessus (contenu recommandé fourni dans la réponse de l'auditeur).
