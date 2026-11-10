---
phase: 39-outillage-prod-de-v-rification
source: 39-REVIEW.md
written: 2026-11-09T00:00:00Z
total: 10
critical: 1
high: 0
warnings: 5
info: 4
---

# Disposition des findings — 39-REVIEW.md

| Finding | Sévérité | Disposition | Détail |
|---------|----------|-------------|--------|
| CR-01 | critical | **fixed** | Commentaire fusionné dans le code exécutable (`smoke-test.sh:201`) — corrigé et commis `21db5da` (`fix(39-01)`). Vérification post-fix : `sh -n` vert ET la voie « refus sans .env » échoue maintenant avec une raison nommée (§2.7 F) au lieu de planter à la ligne 266. |
| WR-01 | warning | open | Point 6b — course entre l'expiration à 6 s et le déroulé du test (flakiness). À observer au run réel documenté (`sh scripts/test-join-token-real.sh`) ; ajuster si rouge intermittent. |
| WR-02 | warning | open | Mode signup (stack dev) — comptes créés mais jamais ni suivis ni purgés. Hors périmètre de la phase (le mode prod admin est le chemin demandé par JT-04/DS-01) ; à traiter si le mode dev-signup reste utilisé. |
| WR-03 | warning | open | Échec de suppression de foyer = simple « ! », run vert avec un résidu. Observation ; à renforcer si les foyers e2e deviennent des résidus réels en prod. |
| WR-04 | warning | open | Échec de `smoke_accounts_list` avalé silencieusement dans les cleanup. Observation. |
| WR-05 | warning | open | Détection résiduelle bornée à 1 000 utilisateurs et au paramètre `filter` non garanti. Limitation documentée ; acceptable pour la détection de résidus du run courant. |
| IN-01 | info | open | Paramètre `RUN_ID` de `smoke_accounts_purge` inutilisé. |
| IN-02 | info | open | Assignations mortes dans le wrapper. |
| IN-03 | info | open | Défaut du domaine e2e dupliqué en trois endroits. |
| IN-04 | info | open | Fichiers temporaires à nom fixe dans la bibliothèque. |

**Notes :** CR-01 corrigé pendant le gate (advisory par défaut, fix trivial + critique). Les warnings WR-01..05 ne bloquent pas : ils sont observables au run réel (DS-01) et consignés pour `/gsd-verify-work`.
