---
phase: 27-suppression-de-compte-rgpd
recorded: 2026-10-27T18:45:00Z
source: 27-REVIEW.md
severity:
  critical: 2
  warning: 4
  info: 4
  total: 10
status: issues_found
open: 10 of 10
---

# Review Disposition — Phase 27

Une ligne par finding de `27-REVIEW.md`. Décision par défaut : `open`.
Pour trier : remplacer `open` par `fixed` ou `skipped` (avec raison dans Source).
(`### ID: titre` écrit par `gsd-code-fixer` sous le même ID met la ligne à `fixed`.)

| ID | Titre | Disposition | Source |
|----|-------|-------------|--------|
| CR-01 | Le kill global des sessions ne part jamais — signature `signOut` invalide (RGDP-01 cassé) | open | code review 2026-10-27 |
| CR-02 | Déshumanisation de N lignes membres avec un seul instantané — l'annulation réécrit les noms des autres foyers | open | code review 2026-10-27 |
| WR-01 | Le rappel J-7 est perdu définitivement si le POST échoue — le commentaire « le redrive du cron est le retry » est faux | open | code review 2026-10-27 |
| WR-02 | Le manifest de médias ignore `bucket_id` — fragilité cross-bucket et jumeaux non purgés | open | code review 2026-10-27 |
| WR-03 | « Les sélecteurs excluent les lignes `account_deleted_at` » — affirmation fausse (AGENTS §2.7 I) | open | code review 2026-10-27 |
| WR-04 | Le panneau affiche « Vos sessions ont été coupées » même quand `sessions_revoked` est false | open | code review 2026-10-27 |
| IN-01 | Destinataire incohérent entre e-mail de confirmation et rappel J-7 | open | code review 2026-10-27 |
| IN-02 | Libellés promettant la « restauration des sessions » | open | code review 2026-10-27 |
| IN-03 | Coquille dans l'e-mail J-7 | open | code review 2026-10-27 |
| IN-04 | `parseBody` — la branche compat 'foyer' matche aussi un corps avec `mode` absent mais `action` invalide | open | code review 2026-10-27 |
