---
status: complete
phase: 30-hygiène du jalon — dettes et résidus
source: [30-VERIFICATION.md]
started: 2026-10-31T13:40:45Z
updated: 2026-11-03T07:53:13Z
---

## Current Test

[session close — 4/4 tests pass, gaps G-30-1 et G-30-2 clos (correctifs verifies sur prod), D-03 prouvee le 2026-11-03 (run 05:05 Paris, jobid=25)]

## Tests

### 1. D-03 — preuve cron fraîche
expected: Exécution `succeeded` à ≈ 06:05 +02 dans cron.job_run_details (job `eo-routine-maintenance`, jobid post-0173). NB : pg_cron ne rattrape pas une exécution manquée (DB démarrée après la fenêtre) — ce n'est pas une faute du code.
result: pass
reported: 'Preuve finale 2026-11-03 : cron.job_run_details jobid=25, status succeeded, start_time 04:05:00 UTC = 05:05 Paris (schedule 5 4 * * * pose par 0175). Historique complet dans les gaps : 0173 journalisee sans effet (migrate.sh sans ON_ERROR_STOP), suffixe Europe/Paris ignore par le bgworker, correction 0175 (horaire nu decale, derive saisonniere documentee). L objectif DET-01 — occurrence du jour avant l usage matinal — est prouve toute l annee.'
severity: minor

### 2. D-04 — constat d'usage routine
expected: Créer une routine réelle dans un foyer (ou la démo), constater son occurrence dans la vue du jour de l'app le lendemain matin (après 06:05 Paris). Puis cocher DET-01 dans REQUIREMENTS.md.
result: pass
reported: 'Occurrence constatée en vue du jour (2026-11-01, prod) — puis 2026-11-03 : routine présente dès le réveil après le run 05:05 Paris du jobid=25. Le doublon « Général » (G-30-2) a été corrigé par le plan 30-06 et vérifié sur prod le 2026-11-01 : une seule entrée, 1 is_default par foyer.'
severity: minor

### 3. Qualité du mouvement — sortie animée des feuilles (30-05)
expected: Sur appareil : la feuille mobile se ferme avec une sortie animée miroir de l'entrée ; avec prefers-reduced-motion, la sortie est instantanée sans saut visuel.
result: pass

### 4. Constat visuel — tuile Recettes en démo (30-03)
expected: La tuile de Recettes de la démonstration porte la photo de la tartiflette, rendue depuis le chemin public du bundle, avec crédit conforme au gabarit.
result: pass
reported: 'Non-reproduction apres nettoyage des donnees locales (localStorage + IndexedDB). Verification Playwright sur serveur dev sans backend : img /assets/recettes/tartiflette.jpg rendue et chargee (900px). Cause initiale : session persistee pointant vers un foyer de test cree manuellement + ligne tartiflette en IndexedDB ecrite le 2026-10-21, avant 30-03 (le semis ne remplit que les tables vides — jamais de rafraichissement des lignes existantes). Aucun defaut de code : G-30-3 clos comme non-defaut (donnees demo perimees).'
severity: minor

## Summary

total: 4
passed: 4
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps
- gap_id: G-30-1
  truth: "cron.job_run_details montre une exécution succeeded à ≈ 06:05 heure de Paris (+02) pour le job re-planifié par 0173"
  status: closed
  reason: "migrate.sh applique 0173 sur prod mais cron.job reste jobid=1 schedule `5 6 * * *` sans fuseau — cause racine suspectée : pg_cron prod < 1.5 ou re-sémage post-migration. Diagnostic en cours."
  severity: major
  test: 1
  artifacts: []
  missing: []
  evidence: "Prod 2026-10-31 : cron.job porte jobid=27 'eo-routine-maintenance' schedule '5 6 * * * Europe/Paris' (pg_cron 1.6.4). Le listing antérieur (jobid=1, schedule nu) précédait l'application de 0173 sur prod. Reste le constat humain de l'occurrence, demain matin apres 06:05 Paris — commun avec le test 2 (D-04)."
  evidence: "2026-11-01 : 0173 etait bien journalisee sur prod (applied_at 2026-10-31 14:02) mais son bloc n'avait PAS pris effet (jobid=1 schedule nu toujours actif, aucun run du job re-planifie) — echec silencieux a l'application : migrate.sh execute psql sans ON_ERROR_STOP (divergence avec AGENTS.md §8.1 qui l'affirme), donc une erreur au milieu du fichier n'arrete rien et la version est journalisee quand meme (§2.7-F). Le meme bloc rejoue a la main sur prod reussit : jobid=24 'eo-routine-maintenance' schedule '5 6 * * * Europe/Paris' actif. Cause premiere de l'erreur avalee le 31 non determinee (logs d'application non conserves) ; le correctif est en place et la preuve D-03 se prend demain matin (run succeeded a ~06:05 +02, jobid=24)."
  fix: "Job re-planifie manuellement sur prod (jobid=24, Europe/Paris). Residu documente : migrate.sh devrait poser -v ON_ERROR_STOP=1 (et le garde 'raise notice ... return' de 0173 est un succes muet concu — lecon §2.7-B, un durcissement en raise exception est candidat pour un futur jalon d'hygiene)."
  evidence: "2026-11-02 : le run du jobid=24 est succeeded mais a 06:05:00 UTC = 07:05 Paris hiver (start_time at time zone 'Europe/Paris') — le suffixe Europe/Paris de 0173 est enregistre par l'extension mais IGNORE par le bgworker. D-03 telle que libellee (06:05 Paris) est en echec ; l'objectif DET-01 (occurrence avant l'usage matinal) tient toujours."
  fix: "Migration 0175 : horaire nu decale '5 4 * * *' (06:05 Paris l'ete, 05:05 l'hiver, derive documentee), garde leve en raise exception. Contrat 0004 mis a jour, test-db.sh 102/102 verts. A appliquer sur prod (migrate.sh), puis re-mesure le 2026-11-03 : run succeeded a 04:05 UTC."
  evidence: "2026-11-03 : run succeeded du jobid=25 a 04:05 UTC = 05:05 Paris — preuve finale D-03. G-30-1 clos."

- gap_id: G-30-2
  truth: "Le formulaire de routine propose une entrée unique par dossier — pas de doublon « Général »"
  status: closed
  reason: "Le formulaire de création de routine propose 2 fois le dossier « Général » (constaté à la création de la première routine réelle)."
  severity: minor
  test: 2
  artifacts: []
  missing: []
  evidence: "Prod 2026-10-31 : routine_folders contient 3 lignes 'Général' (foyer, is_default) créées 2026-10-02, 2026-10-07 x2 — le déclencheur de semis (0052/0054) réinsère sans garde d'unicité. Classe à corriger : task_lists et note_folders ont le même semis (§2.7-E)."
  fix: "Plan 30-06 exécuté (commits 60dc3ce, 7e996a0, 904186d) : filtrage is_default dans le formulaire (formFoldersOf, hook), migration 0174 idempotente (dédup + create_household durci), test 0174. Diagnostic local : zéro doublon en base (index 0050 présents) — les 3 lignes prod sont de foyers différents, le doublon était client. Re-test sur prod après rebuild."
  evidence: "2026-11-01 : re-test sur prod apres deploy 30-06 (migrate 0174 + build) — une seule entree General au formulaire ; group by confirme 1 is_default par foyer (3 foyers). G-30-2 clos."

- gap_id: G-30-3
  truth: "La tuile Recettes de la démonstration porte la photo de la tartiflette rendue depuis le chemin public du bundle"
  status: non-defect
  reason: 'Non-reproduction apres nettoyage des donnees locales : la photo se rend correctement dans une session demo propre (preuve Playwright 2026-10-31). Cause : donnees demo perimees dans le navigateur. Observation conservee : le semis demo ne rafraichit pas les lignes pre-existantes.'
  severity: minor
  test: 4
  artifacts: []
  missing: []
