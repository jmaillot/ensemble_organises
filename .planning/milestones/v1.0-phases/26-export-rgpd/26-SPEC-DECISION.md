# Phase 26 — Export RGPD : Décision de portée (SPEC produit)

**Date de tranchement :** 2026-10-27
**Statut :** LOCKED — règle de liaison pour toute la phase 26

---

## Portée générale : Option A — « Ce qui me concerne »

L'archive RGPD couvre la donnée où l'utilisateur est acteur :

- **Son profil** (`profiles`)
- **Ce qu'il a créé** : champs `created_by`, `paid_by`, `author_id` dans les modules métier
- **Ce qui lui est attribué** : `task_assignees`, `routine_assignees`
- **Ses participations à l'ardoise** : `expense_participants`
- **Ses médias personnels** : objets Storage dont le chemin désigne le membre

**Limite défendable :** le droit d'accès RGPD porte sur SES données personnelles. L'archive ne livre JAMAIS la donnée personnelle créée par un autre membre du même foyer.

---

## Règle multi-foyers : Fusion

Un membre appartenant à plusieurs foyers reçoit **une seule archive ZIP** contenant :
- Un JSON par module
- Les données de **tous les foyers confondus** où le membre est acteur

Il n'y a pas d'export « par foyer » — l'identité du sujet RGPD prime sur la frontière du foyer.

---

## Liste des modules inclus

La liste suivante est **exhaustive et fermée** — le SQL d'extraction de 26-02 s'y réfère mot pour mot.

### Modules inclus

1. **profiles** — profil global du demandeur
2. **households** — foyers dont le demandeur est membre
3. **household_members** — ligne(s) du demandeur dans chaque foyer
4. **tasks** + **task_assignees** + **task_reminders** — tâches créées par le demandeur OU qui lui sont assignées
5. **events** + **event_reminders** — événements créés par le demandeur
6. **notes** + **note_attachments** — notes créées par le demandeur + leurs pièces jointes
7. **expenses** + **expense_participants** — dépenses payées par le demandeur OU où il est participant
8. **routines** + **routine_assignees** + **routine_completions** + **routine_reminders** — routines créées par le demandeur OU qui lui sont assignées + ses complétions
9. **shopping_lists** + **shopping_list_items** — listes de courses du foyer (created_by si porté, sinon toutes les listes des foyers du demandeur) + articles ajoutés par le demandeur
10. **posts** + **post_media** + **post_comments** + **post_reactions** — publications du Cercle créées par le demandeur + commentaires + réactions portées par le demandeur
11. **recipes** + **recipe_ingredients** + **recipe_steps** — recettes créées par le demandeur + ingrédients + étapes
12. **messages** / **conversations** — messages envoyés par le demandeur + conversations dont il est membre
13. **birthdays** — anniversaires créés par le demandeur (ou tous les anniversaires des foyers du demandeur si pas de created_by)
14. **pets** + **pet_records** — animaux du foyer + carnets de santé (filtrés par foyer du demandeur)
15. **loyalty_cards** — cartes de fidélité du demandeur (member_id = demandeur OU household_id des foyers du demandeur si member_id NULL)
16. **places** — lieux des foyers du demandeur
17. **gift_lists** + **gift_items** — listes de cadeaux dont le demandeur est propriétaire + articles
18. **contacts** + **contact_lists** — listes de contacts dont le demandeur est propriétaire + contacts
19. **trips** — voyages des foyers du demandeur
20. **pantry_items** — articles du frigo/garde-manger créés par le demandeur
21. **meal_entries** — repas du menu créés par le demandeur
22. **dashboard_widgets** — widgets du tableau de bord du demandeur

### Modules explicitement exclus

- **household_invite_tokens** — secrets d'invitation, jamais exportés
- **gdpr_export_jobs** — table de jobs d'export, métadonnée système

---

## Limite du bucket `gdpr-exports`

**Valeur chiffrée :** 1 Go (1073741824 octets)

Cette limite `file_size_limit` est inscrite dans la migration de création du bucket. Un export qui dépasse cette limite échoue avec un statut d'erreur notifié au demandeur (D-02).

---

## Justification de la portée « Ce qui me concerne »

1. **Conforme au droit d'accès RGPD** : le sujet a droit à SES données personnelles, pas aux données personnelles d'autrui même dans le même foyer.
2. **Défendable face à un audit** : la frontière est claire et documentée.
3. **Surface de fuite minimale** : ne livre jamais le contenu créé par un autre membre.
4. **Évolutif** : la portée peut être élargie ultérieurement (ajout de modules, élargissement d'un filtre) par une migration additive sans changement de la table de jobs.

---

## Contrainte de séquence (rappel du ROADMAP)

Cette décision est **verrouillée avant toute requête SQL**. Aucune migration, aucun RPC d'extraction, aucune requête SQL de 26-02 ou 26-03 n'est écrite avant ce tranchement.

Plan 26-02 (SQL d'extraction) et plan 26-03 (implémentation Edge + frontend) consomment ce document comme **entrée de SPEC** — ils ne réinterprètent pas, ils appliquent mot pour mot.

---

*Verrouillé le 2026-10-27 — Décision utilisateur consignée au checkpoint 26-01 Task 1*
