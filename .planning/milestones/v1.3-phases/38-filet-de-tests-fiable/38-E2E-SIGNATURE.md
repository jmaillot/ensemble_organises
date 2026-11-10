# 38-E2E-SIGNATURE — Signature du filet de tests (phase 38)

**Run du :** 2026-11-08
**Exécuté par :** plan 38-04 (Task 1 + Task 2), executor séquentiel
**Référence avant-phase :** cd3fdf1 (commit précédant le premier commit de la phase, `4f88b89^`)
**Exigence couverte :** TEST-03

---

## 1. Chaîne §2.7 complète, dans l'ordre, chaque étape citée (§2.7 F)

| # | Étape | Commande | Résultat |
|---|-------|----------|----------|
| 1 | Typecheck | `cd app && npm run typecheck` | **VERT** — `tsc --noEmit`, aucune erreur |
| 2 | Tests unitaires | `cd app && npm test` | **VERT** — 244 fichiers de test, **1988 tests passés**, 0 échec (191.60 s). Inclut : preuve paramétrique 7 jours des helpers `debutSemaineIso`/`jourSemaine` (38-01), garde seed anti-récidive semaine, harnais WR-03 `vi.waitFor` (38-02) |
| 3 | Build | `cd app && npm run build` | **VERT** — PWA injectManifest, precache 152 entries (2748.43 KiB), `dist/sw.js` généré |
| 4 | E2E | `cd app && npm run test:e2e` | **Signature attendue obtenue** — voir §2 ci-dessous |
| 5 | Contrôle SQL statique | `python3 scripts/check-sql-statique.py` | **VERT** — « 230 fonction(s) effective(s) sur 179 migration(s) et 106 test(s), aucun défaut » (exit 0). Sorties attendues non-bloquantes : définition dépassée `0019_push_dispatch.sql` (corrigée plus loin), motif DML→ALTER exempté `0039` (inerte, connu) |
| 6 | Auto-test du contrôle | `python3 scripts/test-check-sql-statique.py` | **VERT** — « 6 cas, tous verts » (exit 0) |

`test-db.sh` non requis : aucun SQL touché par la phase (I-03, décision 38-03 consignée) — Docker non sollicité.

## 2. Signature e2e : 2 rouges → 1 rouge

**Attendu (must_haves) :** exactement 1 spec rouge, critical-paths.spec.ts:134 join-token.
**Obtenu :**

```
  2 failed
    [chromium] › e2e/critical-paths.spec.ts:134:3 › Connexion et foyer › rejoindre un foyer valide le format du token
    [mobile]   › e2e/critical-paths.spec.ts:134:3 › Connexion et foyer › rejoindre un foyer valide le format du token
  9 skipped
  165 passed (3.3m)
```

- **1 seul test rouge** (deux échecs = le même test sur les deux projets Playwright chromium + mobile), aux lignes 134–140 de `critical-paths.spec.ts` : « rejoindre un foyer valide le format du token » — timeout sur `getByLabel('Token d’invitation')`.
- **Menu guéri** : `menu.spec.ts` entièrement vert — le flake du dimanche (semis `day(offset)` traversant la grille lundi→dimanche) est corrigé par les helpers 38-01 (ancrage `debutSemaineIso`). Aucune autre spec rouge : le flake WR-03 (household-store, corrigé en 38-02 par `vi.waitFor`) ne s'est pas manifesté.
- **J-01** : ce rouge join-token est **exclu explicitement du critère SC2 de la phase 38** (38-CONTEXT.md §J-01) — il relève de TEST-02, **soldé en phase 39**. **J-02** : la spec **continue de tourner dans le run e2e standard**, sans `test.skip`, sans grepExclude, sans renommage — le rouge visible rappelle la dette jusqu'à la réécriture (§2.7 I).
- **Comparaison avant/après** : avant phase (37-VERIFICATION.md l.32,59) = **2 rouges** (join-token + flake menu). Après phase = **1 rouge** (join-token seul). État confirmé : 165 passed / 9 skipped / 2 failed, identique au run de 38-03.

## 3. Gardes statiques de discipline (Task 2)

Chaque garde : commande + résultat chiffré.

| Garde | Commande | Résultat |
|-------|----------|----------|
| **J-02** — spec join-token intacte | `git diff cd3fdf1..HEAD -- app/e2e/critical-paths.spec.ts \| wc -l` | **0** — diff vide sur toute la phase |
| **Anti-skip** — aucune ligne ajoutée `test.skip`/`test.fixme` | `git diff cd3fdf1..HEAD -- app/e2e app/src \| grep -cE '^\+.*test\.(skip\|fixme)'` | **0** |
| **Anti-grepExclude** | `git diff cd3fdf1..HEAD -- app/e2e app/src \| grep -cE '^\+.*grepExclude'` | **0** |
| **S-02** — pas d'horloge figée | `grep -rn "setSystemTime" app/src/lib/datetime.test.ts app/src/lib/data/seed.test.ts app/src/stores/household-store.test.ts` | **0 occurrence** |
| **D-01/IN-01** — garde morte supprimée (pas commentée) | `grep -rn "typeof response.status" app/src` | **0 occurrence** ; aucune mention dans `app/src/modules/ardoise/api.ts` (aucun commentaire résiduel) |
| **S-01** — semis ancré lundi | `grep -c "jourSemaine(debutSemaineIso" app/src/lib/data/seed.ts` | **4** (≥ 3 attendu) |
| **S-01** — aucun `day()` nu dans demoMealEntries | `sed -n '/const demoMealEntries/,/^]/p' app/src/lib/data/seed.ts \| grep day(` | **0 occurrence** dans le bloc demoMealEntries (les `day(` restants du fichier appartiennent à d'autres semis — pantry, tasks, events — hors périmètre de la classe corrigée) |

### Référence : les 8 occurrences préexistantes de `test.skip` (légitimes, antérieures à la phase)

Gating viewport (7) dans `critical-paths.spec.ts` — lignes **340, 436, 453, 472, 496, 511, 547** — et gating credentials (1) dans `offline-shared-device.spec.ts:38`. Datées par `git log -S "test.skip"` :

- `critical-paths.spec.ts` : introduites au commit `a392392` (**2026-10-23**) — antérieur au démarrage de la phase (2026-11-08).
- `offline-shared-device.spec.ts` : introduit au commit `55e55f0` (**2026-11-04**) — antérieur au démarrage de la phase.

Ces skips sont des **gatings conditionnels documentés** (viewport mobile/desktop, credentials e2e réels absents), pas des rouges masqués : la garde anti-skip ne porte que sur les lignes **ajoutées** par le diff de la phase, et elle est verte (0 ligne ajoutée).

## 4. Verdict

La chaîne §2.7 est redevenue un instrument de confiance : **verte hors le rouge join-token documenté et explicitement exclu (J-01/J-02)**. Les gardes confirment qu'aucune règle verrouillée (skip, horloge figée, garde morte, grepExclude) n'a été contournée pour y parvenir.

**Prochaine étape de la dette :** ~~phase 39 (TEST-02) — réécriture de la spec join-token~~ **SOLDÉE le 2026-11-09 — voir §5.**

## 5. Révision phase 39 (2026-11-09) — les 2 rouges join-token sont soldés

**Exécuté par :** plan 39-02, executor séquentiel. **Exigence :** TEST-02 / TEST-03 (0 rouge assumé).

- Les 2 tests périmés de `critical-paths.spec.ts` (l.123-140 : « créer un foyer génère un token copiable et un QR code », « rejoindre un foyer valide le format du token » — mode démo pré-31-03) sont **supprimés** (JT-03), suppression consignée en commentaire dans le fichier.
- Le flux RÉEL 31-03 est vérifié par `app/e2e/join-token-real.spec.ts` — **run séparé documenté** orchestré par `scripts/test-join-token-real.sh` contre la stack déployée (comptes créés/purgés par `lib-smoke-accounts.sh`, un seul chemin vers `SUPABASE_SECRET_KEY`). La spec est exclue du run standard par `testIgnore` dans `playwright.config.ts` (clé `E2E_BASE_URL`) : c'est du **routage de run**, pas un skip — le wrapper inclut la spec dans son propre run, où elle échoue nommément sans ses entrées (JT-03).
- **Nouvelle baseline du run standard (re-datée 2026-11) :** `163 passed / 9 skipped / 0 failed` — le rouge join-token historique (2 échecs chromium+mobile l.134) a disparu ; les **9 skips documentés §3 restent inchangés** (2 viewport-gating critical-paths, 1 credentials offline-shared-device, et les skips modulaires précédents). Garde anti-skip / anti-grepExclude vert sur la fenêtre de diff de la phase 39.
- Le compte de tests du run standard a changé (−2 tests, −2 rouges) : cette note EST l'explication (Pitfall 6 — aucune différence « inexpliquée » au prochain run).

## Self-Check: PASSED (phase 38)

- 38-E2E-SIGNATURE.md existe (ce fichier).
- Chaîne re-exécutée dans l'ordre : typecheck ✅ / npm test 1988 ✅ / build ✅ / e2e 165-9-2 ✅ / check-sql-statique ✅ / test-check-sql-statique ✅.
- Signature : 1 seul test rouge (join-token l.134, chromium+mobile), menu vert.
- Gardes : 0 skip ajouté, 0 setSystemTime, 0 typeof response.status, 4× `jourSemaine(debutSemaineIso`, 0 `day(` nu dans demoMealEntries.

## Self-Check (révision 39-02, 2026-11-09): PASSED

- Chaîne re-exécutée : typecheck ✅ / npm test 1987/1988 (1 échec préexistant `calendrier-page.test.tsx` l.165, consigné dans deferred-items.md par le plan 39-01 — hors périmètre) / build ✅ / e2e standard **163 passed / 9 skipped / 0 failed** ✅.
- Signature : 0 rouge assumé, 9 skips inchangés (§3), join-token soldé par le run séparé documenté.
