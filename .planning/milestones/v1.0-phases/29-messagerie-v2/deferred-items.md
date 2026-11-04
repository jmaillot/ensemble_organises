# Deferred items — phase 29

## 2026-10-29 (29-01)

- **test 0147_child_push_adults.sql en échec préexistant** — « anniversaire enfant : annonce a chaque adulte du foyer (attendu 2, obtenu 0) », reproduit SANS les fonctions 0171 (drop + rollback : même échec). Hors périmètre du plan 29-01 (anniversaires/push D-23, phase 25) ; à diligence dans un plan futur.
- **PNG non suivis à la racine du dépôt** (captures UAT/.impeccable) — jamais commités volontairement ; nettoyage à trancher.

## 2026-10-29 (29-02)

- **0147 toujours en échec** (même signature qu'en 29-01) — seul échec restant de `test-db.sh` (1/101) ; inchangé par 0172.
- **Fonctions 0171 absentes de la base malgré le registre `schema_migrations`** — constatées en début de 29-02 (`open_direct_conversation` inconnue) ; le fichier 0171 a été réappliqué localement via `psql.sh` (idempotent, aucune réécriture). Cause de la dérive inconnue ; à surveiller au prochain déploiement.
- **Preuve push de bout en bout non exécutée** — `test-dispatch-push.sh` s'arrête explicitement à sa porte : AUCUN abonnement push réel sur cette instance (0 endpoint non-factice). Toute la preuve SQL du payload groupé est verte (test 0172_grouped_push : compteur au titre, marques de contenu absentes, consommation par liste) ; le tronçon Edge → service Push reste à prouver sur une machine avec appareil abonné.


## 2026-10-29 (29-03, exécution)
- Hors périmètre, observation : `scripts/test-dispatch-push.sh` (et d'autres scripts du dépôt ?) portent des variables shell accentuées (`Expéditeur`, `RappelCreee`…) ; dash les refuse (« Expéditeur=x: not found »). Le script ne passe donc que si `sh` est bash. À corriger si un jour le script échoue sur un dash strict. Le nouveau test-realtime-subscription.sh est en ASCII.
