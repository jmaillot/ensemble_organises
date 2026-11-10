# 39-NYQUIST-AUDIT — Audit de couverture de validation (phase 39)

**Date de l'audit :** 2026-11-09
**Auditeur :** gsd-nyquist-auditor (audit rétroactif, exécution réelle des contrôles)
**Périmètre :** 2 exigences de phase (SMOKE-01, TEST-02) portées par 2 plans exécutés et commités (39-01, 39-02), plus 6 commits de fixes UAT ultérieurs (d5af9c5 → 5618352).

> Méthode : chaque commande de la carte de vérification de 39-VALIDATION.md a été **ré-exécutée le jour de l'audit** contre l'état réel du dépôt (HEAD `3674f4e`), pas seulement lue dans les summaries. Aucun test nouveau n'a été créé (périmètre audit seul ; 39-VALIDATION.md inchangé).

---

## 1. Test Infrastructure (valeurs réelles relevées)

| Property | Value |
|----------|-------|
| **Framework** | Scripts shell §2.7 (smoke, wrapper) + Playwright (e2e réel, run séparé) + Vitest 5 / typecheck (chaîne app existante) |
| **Config file** | `app/playwright.config.ts` (testIgnore clé sur `E2E_BASE_URL`, l.14 — routage de run, présent sur disque), `app/vitest.config.*` |
| **Quick run command** | `cd app && npm run typecheck && npx vitest run` |
| **Full suite command** | `cd app && npm run typecheck && npm test && npm run build && npm run test:e2e` |
| **Runs réels (DS-01)** | `sh scripts/smoke-test.sh` et `sh scripts/test-join-token-real.sh` depuis l'hôte de la stack — environnements-dépendants par conception (secrets jamais sur la machine de travail) |
| **Estimated runtime** | quick ~30 s ; chaîne complète ~5 min (e2e standard ~3,3 min) |

Résultats de ré-exécution d'audit (2026-11-09) :

```
sh -n scripts/lib-smoke-accounts.sh scripts/smoke-test.sh scripts/test-join-token-real.sh
  → aucune sortie (syntaxe OK, 332 / 611 / 301 lignes)
garde anti-secret-argv phase-scopée (smoke-test.sh + lib-smoke-accounts.sh + test-join-token-real.sh)
  → 0 correspondance (seul hit du dépôt : scripts/smoke-functions-serveur.sh:175, préexistant, hors phase)
(cd app && npm run typecheck) → vert, aucune erreur
npx vitest run src/modules/calendrier/calendrier-page.test.tsx → 17 passed (l'échec préexistant
  documenté en 39-01-SUMMARY a été corrigé en phase 40, commit 9a656b3)
app/e2e/join-token-real.spec.ts → 6 test(), 0 test.skip/fixme, 0 grepExclude
app/e2e/critical-paths.spec.ts → les 2 anciens tests foyer/token absents (recherche → 0)
app/playwright.config.ts → testIgnore routé sur E2E_BASE_URL (l.14), commentaire « pas un skip »
docs/EXPLOITATION.md → 'Smoke-test prod' (grep OK), smoke-test.sh (l.411),
  test-join-token-real.sh (l.412), E2E_MAIL_DOMAIN (grep OK)
```

---

## 2. Per-Task Verification Map (statuts mis à jour)

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 39-01-01 | 01 | 1 | SMOKE-01 | T-39-01, T-39-03 | Bibliothèque comptes (`-K` 0600), sonde `mailer_autoconfirm`, purge vérifiée re-delete→404, emails `e2e+<runid>@` | statique (`sh -n`, garde anti-secret-argv) + run réel documenté | `sh -n scripts/lib-smoke-accounts.sh && sh -n scripts/smoke-test.sh && [ -z "$(grep -nE '\-H "[^"]*SECRET_KEY' scripts/smoke-test.sh scripts/lib-smoke-accounts.sh)" ]` | ❌ le script livré est le livrable ; run réel : `sh scripts/smoke-test.sh` (DS-01) | ✅ green (statique ré-exécuté 2026-11-09 ; run réel 17/17 consigné 39-UAT.md test 1, commit a85db2a) |
| 39-01-02 | 01 | 1 | SMOKE-01 | T-39-02, T-39-04, T-39-05 | Refus sans secret, 429→1 retry/422→échec nommé, résidus signalés (EE-02), parcours 5 étapes inchangé (CS-03) | statique + run réel documenté | `! grep -q 'example\.fr' scripts/smoke-test.sh && [ -z "$(grep -nE '\-H "[^"]*SECRET_KEY' scripts/*.sh)" ]` ⚠️ **commande à rescorper** (voir G-1) ; run réel : `sh scripts/smoke-test.sh` | ❌ livrable | ✅ green avec réserve (comportement prouvé : garde phase-scopée verte ré-exécutée, run réel 17/17 ; mais la commande **telle qu'écrite dans la carte est rouge** — glob `scripts/*.sh` attrape `smoke-functions-serveur.sh:175` préexistant) |
| 39-01-03 | 01 | 1 | SMOKE-01 | T-39-04 | Section « smoke-test prod » (DS-03), run manuel documenté (DS-01), `E2E_MAIL_DOMAIN` (EE-01) | statique | `grep -q 'Smoke-test prod' docs/EXPLOITATION.md && grep -q 'E2E_MAIL_DOMAIN' docs/EXPLOITATION.md` | ✅ docs/EXPLOITATION.md existant | ✅ green (ré-exécuté 2026-11-09 ; les deux commandes l.411-412 présentes) |
| 39-02-01 | 02 | 2 | TEST-02 | T-39-07, T-39-06 | Wrapper run séparé (refus sans stack, `--project=chromium`, trap purge vérifiée), spec chemin heureux 5 points JT-02, 2 anciens tests supprimés (JT-03) | statique (`sh -n`, typecheck, garde) + e2e réel (wrapper, run documenté) | `sh -n scripts/test-join-token-real.sh && (cd app && npm run typecheck) && grep -q "project=chromium" scripts/test-join-token-real.sh && grep -q "cd app" scripts/test-join-token-real.sh` ; run réel : `sh scripts/test-join-token-real.sh` | ❌ Wave 0 = le livrable | ✅ green (statique + typecheck ré-exécutés ; run réel Playwright 6/6 en 46,5 s consigné 39-UAT.md test 3, commit 5618352, purge 2 foyers + 2 comptes prouvée) |
| 39-02-02 | 02 | 2 | TEST-02 | T-39-09 | Message uniforme D-03/D-17 sur token mort (6e point JT-02), aucun skip conditionnel ajouté (JT-03) | statique (typecheck + garde anti-skip/anti-grepExclude, diff exécuté depuis la racine du dépôt) | `(cd app && npm run typecheck) && [ -z "$(git diff HEAD -- app/e2e \| grep -E '^\+.*test\.(skip\|fixme)' )" ]` | ❌ livrable | ✅ green (typecheck vert ré-exécuté ; garde verte — diff vide, exit 1 du grep = 0 ligne ajoutée ; spec : 6 `test()`, 0 skip/fixme/grepExclude) |
| 39-02-03 | 02 | 2 | TEST-02 | T-39-08 | Chaîne §2.7 verte, run standard 0 rouge assumé, signature e2e 38 re-datée (Pitfall 6) | chaîne complète | `cd app && npm run typecheck && npm test && npm run build && npm run test:e2e` | ✅ existant | ✅ green avec réserve (run consigné plan 02 : 163 passed / 9 skipped / 0 failed, signature 38 re-datée §5 ; à l'audit, typecheck + sous-ensemble unitaire ré-exécutés verts — l'échec unitaire préexistant `calendrier-page.test.tsx` est corrigé depuis, 17/17 vérifié ; chaîne complète non rejouée le jour de l'audit) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky — 6/6 rows passées de ⬜ à ✅ (aucune ❌, aucune ⚠️).*

---

## 3. Classification par exigence

| Requirement | Verdict | Justification |
|-------------|---------|---------------|
| **SMOKE-01** (smoke crée et purge ses comptes e2e via l'Admin GoTrue en prod réel, sans autoconfirm, secrets jamais en argv) | **COVERED** | Preuve statique ré-exécutée à l'audit : `sh -n` vert sur les 3 scripts, garde anti-secret-argv verte phase-scopée (curl `-K` 0600 est l'unique canal du secret — `smoke_admin_config`), sonde `settings` porte l'apikey publiable (d5af9c5), `user_metadata.full_name` au contrat GoTrue brut (5618352), purge `re-delete → 404 exigé` en code (l.216-233 de la lib). Preuve réelle consignée : run smoke 17/17 contrôles, mode prod pris (autoconfirm=false prouvé par la branche), purge prouvée, exit 0 (39-UAT.md test 1, commit a85db2a). Red-before-green authentique : 6 itérations UAT échouées avant vert (d5af9c5 apikey manquant sur sonde, a822755 `SMOKE_MAIL_DOMAIN` non borné sous `set -u`, a85db2a payloads contrat 0177, 8b93e31/8bd3348 attestation D-17, 5618352 user_metadata) — l'outillage livré a bien été vu rouge sur la stack réelle avant d'être vu vert. |
| **TEST-02** (spec e2e join-token réécrite contre le flux 31-03 actuel, jamais « réparée au vert ») | **COVERED** | Les 6 points JT-02 sont présents dans la spec (6 `test()`, 0 skip/fixme/grepExclude ré-exécuté), les 2 tests périmés de `critical-paths.spec.ts` sont supprimés (recherche → 0), le wrapper fixe `--project=chromium` (Pitfall 4, l.289) et refuse sans stack (health check avec apikey). Preuve réelle : Playwright 6/6 passed en 46,5 s contre la stack déployée, D-17 provoqué par expiration réelle (token +6 s, attente 9 s, aucune horloge figée), purge trap 2 foyers + 2 comptes prouvée (39-UAT.md test 3, commit 5618352). Le run standard est soldé : 163 passed / 9 skipped / 0 failed, signature 38 re-datée. |

**Bilan : 2 COVERED, 0 PARTIAL, 0 MISSING.** Trois réserves WARNING documentées ci-dessous, aucune bloquante.

---

## 4. Gap Analysis (réserves non bloquantes)

| # | Réserve | Sévérité | Action recommandée |
|---|---------|----------|--------------------|
| G-1 | **Commande de la ligne 39-01-02 sur-scopée.** Le garde `[ -z "$(grep -nE '\-H "[^"]*SECRET_KEY' scripts/*.sh)" ]` telle qu'écrite dans la carte est **rouge à l'audit** : le glob attrape `scripts/smoke-functions-serveur.sh:175` (`-H "apikey: $SECRET_KEY"`), occurrence préexistante et hors périmètre de la phase (déjà identifiée par 39-VERIFICATION.md). Le comportement exigé (aucun secret en argv dans les livrables 39) est bien prouvé — le même garde restreint aux 3 fichiers de la phase est vert. Mais une commande de carte qui sort rouge fausse la lecture d'audit. | WARNING | **Éditer la ligne 39-01-02 de 39-VALIDATION.md** : remplacer `scripts/*.sh` par `scripts/smoke-test.sh scripts/lib-smoke-accounts.sh` (aligner sur le verify du plan 39-01 Task 2, qui scope déjà correctement). Alternativement, corriger le hit préexistant de `smoke-functions-serveur.sh` dans une phase future (même classe de défaut §2.7 H — candidat `gsd-audit-fix`, hors périmètre 39). |
| G-2 | **Branches 429/422 jamais exercées sur un vrai 429.** Le code est présent et câblé (`create_once`, sleep 5, un seul retry, case 422 échec nommé immédiat) ; l'itération 1 de l'UAT a exercé de fait la branche d'échec nommé avec corps (400 invalid format affiché, parcours interrompu proprement). Un vrai 429 GoTrue n'a jamais été déclenché — non reproductible volontairement. | WARNING | Suivi différé déjà consigné (39-UAT.md test 4 skipped, advisory 39-VERIFICATION.md). Ne pas tenter de le forcer en UAT ; observer au premier vrai throttling. |
| G-3 | **Runs réels environnements-dépendants (DS-01).** Les deux preuves majeures (smoke 17/17, spec 6/6) datent du 2026-11-09 et ne sont reproductibles que depuis l'hôte de la stack avec `SUPABASE_SECRET_KEY` — jamais depuis la machine de travail, jamais en CI. Les commits de référence (a85db2a, 5618352) sont antérieurs à HEAD de l'audit (6 commits phase 40 depuis, dont un correctif calendrier) ; aucun ne touche les 4 fichiers livrables de la phase 39 (ré-exécution statique verte confirme l'absence de régression). | WARNING | Ré-exécuter le smoke et le wrapper avant tout sign-off milestone (déjà passage obligatoire de `/gsd-verify-work`) ; ce sont des réserves, pas des échecs. |
| G-4 | **Chaîne complète §2.7 non rejouée intégralement à l'audit** (build + e2e ~5 min non dépensés). Pendant la phase 39, la chaîne était de fait rouge sur un échec unitaire préexistant (`calendrier-page.test.tsx` l.165, consigné deferred-items) — ce qui rendait la ligne 39-02-03 exécutable seulement partiellement à l'époque. | WARNING (résolue) | Résolu hors phase : le correctif phase 40 (commit 9a656b3) rend le fichier vert — ré-exécuté à l'audit : 17/17. La chaîne complète est redevenue rejouable ; la couvrir au prochain passage standard. |

**Red-before-green (exigence projet §2.7 B) — preuve :**

| Livrable | Preuve rouge citée |
|----------|--------------------|
| Smoke + wrapper + lib (SMOKE-01/TEST-02) | Campagne UAT : 6 itérations échouées avant vert, chaque échec nommé et fixé par un commit dédié — d5af9c5 (sondes sans apikey → gateway refuse), a822755 (`SMOKE_MAIL_DOMAIN` vide sous `set -u`, email tronqué), a85db2a (payloads hors contrat réel : `client_key` uuid, `expiresAt`), 8b93e31 (modale attestation D-17 bloquante pour comptes neufs), 8bd3348 (`isVisible()` instantané → course avec la requête profil, remplacé par `waitFor visible` 10 s), 5618352 (pré-écran nommait `e2e+…-1` au lieu de Fernande — `user_metadata` manquant au curl brut). L'outillage de vérification a donc lui-même été prouvé faillible puis corrigé contre la stack réelle — c'est la forme la plus forte de red-before-green pour une phase dont les livrables SONT les tests. |
| Gardes statiques (39-01-01/02, 39-02-02) | Pouvoir d'échec démontré par leur forme (grep exit codes, `sh -n`) et par le fait que G-1 a effectivement produit un rouge (sur-scopage) — la garde phase-scopée est correcte. |

---

## 5. Conclusion

**Phase 39 : 2/2 exigences COVERED, 0 PARTIAL, 0 MISSING. Les 6 lignes de la carte de vérification passent ⬜ → ✅.**

La particularité de la phase — les livrables sont eux-mêmes des tests — est correctement couverte : les gardes statiques sont ré-exécutables (toutes vertes à l'audit, sauf la sur-scopée G-1 à corriger dans la carte), et les runs réels exigés par DS-01 ont été exécutés pendant l'UAT avec preuves consignées (commits, durées, comptes de contrôles), pas seulement affirmées. La campagne UAT à 6 itérations échouées constitue la preuve red-before-green de l'outillage lui-même.

Actions recommandées avant sign-off milestone :
1. Éditer la ligne 39-01-02 de 39-VALIDATION.md (rescorper le garde anti-secret-argv sur les 3 fichiers de la phase — G-1).
2. Ré-exécuter `sh scripts/smoke-test.sh` et `sh scripts/test-join-token-real.sh` depuis l'hôte de la stack avant `/gsd-verify-work` (G-3).
3. Optionnel (phase future) : corriger le `-H "…SECRET_KEY…"` inline préexistant de `scripts/smoke-functions-serveur.sh:175` (même classe §2.7 H).

---

*Audit : 2026-11-09 · gsd-nyquist-auditor · HEAD 3674f4e · 39-VALIDATION.md non modifié (statuts mis à jour dans le présent rapport uniquement).*
