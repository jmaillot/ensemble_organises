# 40-NYQUIST-AUDIT — Audit de couverture de validation (phase 40)

**Date de l'audit :** 2026-11-09
**Auditeur :** gsd-nyquist-auditor (ré-verification, exécution réelle des contrôles)
**Périmètre :** 3 exigences de phase (ARD-01, ARD-02, ARD-03) portées par 3 plans exécutés et commités (40-01, 40-02, 40-03), HEAD `da2fabe`.

> Méthode : audit de **ré-verification** — 40-VALIDATION.md était déjà `status: validated`, `nyquist_compliant: true` avec un bilan « 0 gap ». Chaque commande exécutable de la carte a été **ré-exécutée le jour de l'audit** contre l'état réel du dépôt, et la régression éventuelle des 6 commits post-phase a été vérifiée par diff. Aucun test nouveau n'a été créé ; 40-VALIDATION.md non modifié.

---

## 1. Test Infrastructure (valeurs réelles relevées)

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5 + React Testing Library (frontend) ; testkit SQL via `sh scripts/test-db.sh` (Docker disponible le jour de l'audit) |
| **Config file** | Config Vitest existante du projet ; `supabase/tests/_setup.sql` |
| **Quick run command** | `cd app && npx vitest run src/modules/ardoise src/modules/landing` |
| **Full suite command** | `cd app && npm run typecheck && npm test && npm run build && python3 scripts/check-sql-statique.py && sh scripts/test-db.sh` (+ `npm run test:e2e`) |
| **Estimated runtime** | ~90 s (suite complète, Docker requis pour test-db.sh) |

Résultats de ré-exécution d'audit (2026-11-09) :

```
npx vitest run guest-ardoise-page.test.tsx join-household-page.test.tsx
  → 2 fichiers, 38/38 passed (6,61 s) — conforme au claim 38/38 de 40-VALIDATION.md
python3 scripts/check-sql-statique.py → exit 0, 231 fonctions effectives sur 182
  migrations et 107 tests, aucun défaut (2 mentions de définitions dépassées /
  exemptes, préexistantes et documentées par l'outil lui-même)
python3 scripts/test-check-sql-statique.py → exit 0, 6 cas de contrôle tous verts
sh scripts/test-db.sh 0180 → OK 0180_ardoise_bridge.test.sql, 1 fichier(s) tous verts
git ls-files → 0180_ardoise_bridge.test.sql, guest-ardoise-page.test.tsx,
  join-household-page.test.tsx tous versionnés
```

---

## 2. Per-Task Verification Map (statuts re-verifiés)

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 40-01-01 | 01 | 1 | ARD-01 | T-40-01 / — | Aucun redeem sans confirmation explicite (dialog avant tout réseau) | unit (RTL) | `cd app && npx vitest run src/modules/ardoise/guest-ardoise-page.test.tsx` | ✅ | ✅ green (ré-exécuté 2026-11-09, inclus dans les 38/38) |
| 40-01-02 | 01 | 1 | ARD-01 | — | Atterrissage `/ardoise` après redeem via bridge | unit (RTL) | `cd app && npx vitest run src/modules/landing/join-household-page.test.tsx` | ✅ | ✅ green (ré-exécuté 2026-11-09, inclus dans les 38/38) |
| 40-01-03 | 01 | 1 | ARD-01 | — | `?code=`/token préservés via `state.from` | unit (RTL) | `cd app && npx vitest run src/modules/landing/join-household-page.test.tsx` | ✅ partiel | ✅ green (ré-exécuté 2026-11-09 ; réserve produit G-3 sur la branche anonyme) |
| 40-02-01 | 02 | 1 | ARD-02 | T-40-02 | Réconciliation transactionnelle : lignes migrées, part du passé conservée | SQL (testkit) | `sh scripts/test-db.sh 0180` | ✅ `supabase/tests/0180_ardoise_bridge.test.sql` | ✅ green (ré-exécuté 2026-11-09, Docker disponible → fichier vert) |
| 40-02-02 | 02 | 1 | ARD-03 | T-40-03 | Négatifs : déjà admin, déjà membre, double redemption concurrente (FOR UPDATE), rôle forcé côté serveur | SQL (testkit) | `sh scripts/test-db.sh 0180` | ✅ | ✅ green (même exécution ; verrous re-lus dans 0181:78, v_role:68, 22023:55-97) |
| 40-02-03 | 02 | 1 | ARD-03 | — | Aucune colonne `household_id` sur le modèle de partage ardoise | statique | `python3 scripts/check-sql-statique.py` + revue migration | ✅ | ✅ green (ré-exécuté exit 0 ; grep : aucun ALTER des tables `ardoises`/`ardoise_guests`/`expense_participants` dans 0180/0180b/0181 — les seules occurrences de `household_id` portent sur la table pont privée, `households` et le token) |
| 40-03-01 | 03 | 2 | ARD-01 | T-40-01 | `household-token` refuse sans session (401), refuse code mort/expiré (404 uniforme) | unit Edge / revue + e2e | suite e2e existante / `cd app && npm run test:e2e` | ✅ suite | ✅ green avec réserve (code re-vérifié statiquement : garde `isUser` index.ts:940-959, 404 uniforme « Lien invalide. » ×3 :587-596, rate limit 8:251 ; la suite e2e complète n'a pas été rejouée à l'audit — voir G-1) |

*Status : 7/7 rows ✅ green (2 avec réserve documentée), aucune ❌, aucune ⚠️ flaky.*

---

## 3. Classification par exigence

| Requirement | Verdict | Justification |
|-------------|---------|---------------|
| **ARD-01** (redeem via compte : dialog de confirmation, préservation `?code=`/token, atterrissage `/ardoise`) | **COVERED** | Les 9 cas RTL verrouillent le comportement : le clic n'ouvre que le dialog, `exchangeArdoiseCodeForHouseholdToken` absent du chemin de rendu (assertions `not.toHaveBeenCalled()`), atterrissage `/ardoise` conditionné au marqueur sessionStorage lu-et-effacé. Ré-exécutés à l'audit : 38/38 verts. |
| **ARD-02** (réconciliation transactionnelle) | **COVERED** | Migration 0181 + 8 cas SQL verts ré-exécutés le jour de l'audit (`test-db.sh 0180` → OK, Docker disponible). Red-before-green authentique consigné : commit `15e4f7a` « VU ROUGE avant application de 0181, VERT après ». Fusion par report de part (trigger différé 0008), conversion doublement bornée (pont user_id+household_id ET foyer de la dépense), purge du pont (0181:329). |
| **ARD-03** (négatifs : double redemption, rôle forcé, pas de `household_id` sur le partage) | **COVERED** | Cas SQL 4-8 verts (déjà admin, déjà membre, épuisé 22023, rôle enfant refusé 22023, grants 42501). Garde serveur re-lue dans la migration : `v_role := 'membre'` (0181:68), verrou `for update` (0181:78). Statique : aucune ALTER des tables de partage dans les 3 migrations — le grep de la carte est vert, `household_id` n'apparaît que sur la table pont privée (dénormalisation justifiée en en-tête 0180:25), `households` et `household_invite_tokens`. |

**Bilan : 3 COVERED, 0 PARTIAL, 0 MISSING.**

---

## 4. Régression des 6 commits post-phase

Les 6 commits postérieurs à la clôture (après `c05c4da`) sont : `113f83a`, `000f547` (docs phase 40), `3674f4e`, `da2fabe` (audits 38/39).

```
git diff c05c4da..HEAD --stat → 6 fichiers, 528 insertions, 0 suppression :
  tous sous .planning/phases/{38,39,40}/*.md — aucun fichier code, test, migration ou script touché.
```

**Aucune régression possible sur les livrables de la phase** : les fichiers clés (`0180*`, `0181`, Edge `ardoise-invite`, RTL, test SQL) sont inchangés depuis `9a656b3`. Les ré-exécutions vertes à HEAD confirment ce point.

---

## 5. Gap Analysis (réserves non bloquantes)

| # | Réserve | Sévérité | Action recommandée |
|---|---------|----------|--------------------|
| G-1 | **Suite e2e complète non rejouée à l'audit** (`npm run test:e2e`, backstop consigné en 40-03-SUMMARY). La ligne 40-03-01 repose à l'audit sur la re-vérification statique du code Edge (garde, 404 uniforme, rate limit) et sur le run consigné pendant la phase. Les 6 commits post-phase ne touchent aucun code, donc pas de suspicion de régression — mais l'exécution e2e date de la phase. | WARNING | Rejouer la chaîne e2e au prochain passage standard (déjà exigé par la chaîne §2.7 avant sign-off milestone). |
| G-2 | **Parcours intégr Edge↔frontend jamais exercé en conditions réelles** — déjà consigné `behavior_unverified` dans 40-VERIFICATION.md (statut `human_needed` levé en UAT, test 1 pass) et repris comme vérification manuelle dans 40-VALIDATION.md. La seule preuve runtime de l'Edge reste le smoke 401 ; `INVITE_TOKEN_HMAC_SECRET` côté runtime functions n'est exercé par aucun test automatisé. | WARNING | Vérification manuelle déjà effectuée (40-UAT.md test 1, pass) ; conserver le smoke Edge au rituel de déploiement. Aucune action nouvelle. |
| G-3 | **Observation produit : branche anonyme « Créer un compte »** ne préserve pas `?code=` via `state.from` — l'invité non connecté doit rouvrir le lien après inscription. UAT test 2 pass avec arbitrage à trancher ; non couverte par un test (comportement actuel documenté, pas une exigence violée). | WARNING | Arbitrage produit en attente (déjà consigné 40-VERIFICATION.md human_verification #2). Hors couverture Nyquist tant que la décision n'existe pas. |

**Red-before-green (exigence §2.7 B) — preuves :**

| Livrable | Preuve rouge citée |
|----------|--------------------|
| Migration 0181 / cas SQL (ARD-02) | Commit `15e4f7a` : « 8 cas SQL pont ardoise — VU ROUGE avant application de 0181, VERT après » — les tests de validation ont été vus échouer contre l'état pré-0181, la forme la plus forte de preuve de pouvoir d'échec. |
| Correctif 9098f5e (quota max_uses, garde enfant, nettoyage marqueur) | Commit de fix post-livraison — le comportement a été vu fautif puis corrigé vers l'avant. |
| Contrôle statique SQL | Ses propres cas qui doivent échouer ré-exécutés verts à l'audit (`test-check-sql-statique.py`, 6/6). |

---

## 6. Conclusion

**Phase 40 : 3/3 exigences COVERED, 0 PARTIAL, 0 MISSING. Les 7 lignes de la carte restent ✅ green après ré-exécution à HEAD.**

Le statut `validated` / `nyquist_compliant: true` de 40-VALIDATION.md **reste valable sans aucune correction** : le claim « 0 gap » est confirmé par les preuves ré-exécutées (38/38 vitest verts, `test-db.sh 0180` vert — Docker était disponible, la réserve SQL n'a pas eu à être invoquée, contrôle statique + auto-test verts, greps statiques conformes). Aucune régression des 6 commits post-phase : ils sont exclusivement documentaires (`.planning/*.md`). Trois réserves WARNING sont documentées (G-1 e2e non rejoué, G-2 intégr Edge prouvée par UAT humaine seulement, G-3 arbitrage produit en attente) — toutes déjà consignées dans les artifacts de phase, aucune nouvelle.

Actions avant sign-off milestone :
1. Rejouer la chaîne complète §2.7 (incluant e2e) au passage standard — G-1.
2. Trancher l'observation produit sur `?code=` anonyme (G-3), hors périmètre Nyquist.

---

*Audit : 2026-11-09 · gsd-nyquist-auditor · HEAD da2fabe · 40-VALIDATION.md non modifié (statuts re-verifiés dans le présent rapport uniquement).*
