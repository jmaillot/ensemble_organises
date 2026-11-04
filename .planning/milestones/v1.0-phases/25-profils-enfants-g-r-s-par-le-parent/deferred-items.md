# 25 — Éléments différés

## test 0139 : assertion de backfill non bornée (préexistant, hors périmètre 25-01)

- **Découvert pendant :** plan 25-01, exécution de la suite complète `sh scripts/test-db.sh`
- **Fichier :** `supabase/tests/0139_shopping_item_order.sql:74`
- **Symptôme :** `sh scripts/test-db.sh` complet : « le backfill a.numéroté les quatre articles (attendu 4, obtenu 5) »
- **Cause :** `private.backfill_shopping_item_positions()` (0139:44) opère sur TOUTE `shopping_list_items` et renvoie `row_count` global ; l'assertion `v_count = 4` n'est pas bornée au foyer du fixture (AGENTS.md §2.7 D-2). La base de développement contient 1 article réel → 5.
- **Preuve du caractère préexistant :** aucun fichier de ce plan ne touche `shopping_list_items` ni le backfill ; le défaut se déclenche dès qu'une ligne réelle existe — indépendant de 0144. Introduit par le commit `4450bc2` (v0.9.0).
- **Décision :** NON corrigé (règle de périmètre GSD — ne pas auto-corriger un problème préexistant sans rapport avec la tâche). Sur une base vide de données réelles, 0139 reste vert.
- **Piste de correction (pour un plan futur) :** borner l'assertion — ex. `select count(*) from shopping_list_items where list_id like 'list_t139_%' and position is distinct from <rang attendu>` ou faire du backfill une fonction paramétrée par liste ; correction VERS L'AVANT dans une nouvelle migration/test uniquement.

---

# 25-04 — Éléments différés (exécution du 2026-10-25/26)

## Résolu pendant 25-04 (pour mémoire)

- **test 0139 (ci-dessus) : CORRIGÉ pendant 25-04** — l'assertion globale `v_count = 4` a été remplacée par un comptage borné `id like 'item_t139_%' and position is null = 0` (preuve comportementale, AGENTS.md §2.7 D). Vert.
- **Régression D-07 de 0146 : CORRIGÉE** — 0146 avait réintroduit la branche `is_household_admin` sur `posts_delete_admin`, `post_comments_delete_admin` et `post_reactions_delete_admin` (recopie de la forme 0109 au lieu de 0117). 0149 rétablit la forme D-07 (auteur uniquement + branche D-12 enfant géré). 0047 et 0052 verts.

## Résolu le 2026-10-26 (suite) — familles A/B, D-01 storage, 0053 (barrière 83/83)

Les sections « Ouvert » ci-dessous sont **toutes résolues** par la campagne de
correction du 2026-10-26 (commits `3b34fbb`, `b354843`, `2211677`, `d6f4722`,
`b904caf` et les cinq antérieurs). `sh scripts/test-db.sh` sans argument :
**83/83 verts** (journal `/tmp/opencode/testdb-final.log`).

- **Famille A (0016, 0017, 0022, 0025, 0048, 0050, 0054) : CORRIGÉS.** Les
  lectures positives passent désormais par un adulte du foyer ; l'uid enfant
  attend 0 avec le libellé « uid sans membre resolu (enfant gere 0145) ».
- **Famille B (0002, 0009, 0011, 0012, 0013, 0051, 0145-test) : CORRIGÉS.**
  L'acteur de session est toujours un adulte ; l'enfant est ciblé par
  `member_id`, jamais acteur. 0051 : les oracles sont alignés sur les
  fonctions serveur réelles (`assert_household_writer`/`assert_household_member`
  42501 « vous n'appartenez pas à ce foyer ») et la preuve racine (« l'uid
  enfant ne résout aucun membre ») est affirmée en rôle postgres avant la
  section.
- **D-01 storage / 0038 : RÉSOLU sans migration.** Décision : **le parent
  dépose pour l'enfant** — l'acteur de session du dépôt est l'adulte du
  foyer, zéro changement de schéma. La politique `household_media_insert`
  (0099) a deux branches : `can_write_household` (tout adulte) et
  `can_deposit_message_media` (le fil de l'auteur). Les anciens négatifs
  « confinement cercle/ » et « fil autre » de 0038 présumaient un enfant
  ÉCRIVAIN du fil : cette classe d'acteur n'existe plus post-0145, les
  assertions ont été retirées avec justification dans le test.
- **0053 : diagnostiqué — PAS DE BUG PRODUIT.** `redeem_trip_invite` (0119)
  résout le membre par `m.user_id = p_actor_id` : l'uid enfant du fixture ne
  résout aucun membre, l'échange tombe dans la branche invitée externe qui
  exige un pseudonyme → 22023 « pseudonyme invalide ». Le test capture ce
  refus réel dans `m_enfant` et prouve l'absence d'inscription (ni voyage ni
  ardoise). Même mécanisme dans 0051 pour `redeem_ardoise_invite` (0113) :
  la branche « enfant membre ne rejoint plus » de 0113 est devenue
  inatteignable, l'oracle réel est celui de la branche invitée.
- **Constat produit à suivre (code mort bénin, PAS de migration) :** depuis
  0145, la branche `can_deposit_message_media` de `household_media_insert`
  (0099) est inatteignable par tout acteur de session — un enfant géré n'a
  pas de compte (donc pas de session) et tout adulte du foyer passe déjà par
  `can_write_household`. La fonction reste correcte et inoffensive ; sa
  suppression (avec les négatifs de 0038 qui la documentent) est une piste
  de simplification pour un plan futur, jamais une correction en place.
