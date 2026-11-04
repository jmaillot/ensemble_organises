---
phase: 26-export-rgpd
plan: "06"
subsystem: database/push
tags: [gdpr, rgpd, push, cron, notification, rgex-02]

requires:
  - phase: 26-export-rgpd
    plan: "02"
    provides: "gdpr_export_jobs (notified_push posée en 0158), machine à états en_attente/en_cours/pret/echec"
  - phase: 26-export-rgpd
    plan: "03"
    provides: "Edge gdpr-export-run : la machine à états atteint pret/echec — le point d'achèvement que 0164 observe"
  - phase: 26-export-rgpd
    plan: "04"
    provides: "Déploiements Edge sérialisés (deploy-functions.sh reconstruit le miroir entier) — 26-06 déploie en dernier (v5)"

provides:
  - "Migration 0164 : branche « export » de la chaîne push existante — push_reminder_notifications (patron 0147, signatures inchangées), due_push_notifications garde étendue, consume_push_reminders branche kind 'export' (notified_push après distribution), dispatch_export_notifications + cron eo-push-exports (*/5)"
  - "push-notify : scope 'export' dans l'enum zod, reminderKind reconnaît export-<job_id>, doc-comment D-04"
  - "Tests 0164 : succès ET échec notifiés, url '/parametres' prouvée, notified_push bascule, second appel vide (T-26-19), 22023 sur scope inconnu (T-26-20)"

affects: []

actuals:
  tokens: 26000
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Recopie-modification patron 0147/0042 : définitions effectives recopiées et étendues, signatures et contrats inchangés — les jobs et le mode test appellent par leur nom"
    - "Marquage notified_push dans le sillage de la consommation 0042 : push-notify n'appelle consume_push_reminders qu'après un envoi réellement reçu — jamais un marquage anticipé (A5)"

key-files:
  created:
    - supabase/migrations/0164_gdpr_push_export.sql
    - supabase/tests/0164_gdpr_push_export.sql
  modified:
    - supabase/functions/push-notify/index.ts

decisions:
  - "Numérotation 0164 et non 0159 (plan) : 0159–0163 déjà pris par 26-02/26-03 — nouveau fichier, réécriture d'aucune migration appliquée (§2.7A)"
  - "preference null pour la branche export : l'achèvement d'un export demandé n'a pas d'interrupteur dans profiles — motif anniversaires 0019 (coalesce true), D-01 sans infrastructure nouvelle"
  - "Dispatch dédié private.dispatch_export_notifications + cron eo-push-exports (motif 0042 eo-push-messages) : la chaîne dispatch_message_notifications ne distribue que le scope 'messages' — sans appelant, aucune notification ne partirait jamais (Rule 2)"
  - "Marquage notified_push dans public.consume_push_reminders (kind 'export') : la consommation après distribution est le mécanisme 0147/0042 existant, étendu — pas une nouvelle fonction"

metrics:
  duration: ~35 min
  completed: 2026-10-27
status: complete
plan_head_before: 8d4837fdf45ad1da109ed8299c6dfbcf406ef907
plan_head_after: 7652663
commits: 2
---

# Phase 26 Plan 06: Notification push d'achèvement de l'export RGPD Summary

**One-liner:** La boucle D-01/D-02 est fermée : à l'achèvement d'un job d'export (succès comme échec), le demandeur reçoit une push par la chaîne existante — branche « export » ajoutée par recopie-modification (patron 0147/0042), notified_push bascule après distribution, et la push ne transporte jamais le lien signé ni storage_path (D-04, prouvé par assertion SQL).

## Ce qui a été fait

### Task 1 (tracer) — migration 0164 + tests SQL

- **0164** (`supabase/migrations/0164_gdpr_push_export.sql`), par recopie-modification des définitions effectives (0147 pour `push_reminder_notifications`, 0042 pour `due_push_notifications` et `consume_push_reminders`), signatures et contrats inchangés :
  - `private.push_reminder_notifications` : CTE `exports_dus` — jobs `status in ('pret','echec')` ET `notified_push = false` ; titre « Votre export est prêt » / « Votre export a échoué — réessayez depuis l'écran export » (D-02), url `/parametres` (D-04), tag `export-<job_id>`, preference null (motif anniversaires).
  - `public.due_push_notifications` : garde `p_scope` étendue à `'export'`, branche `elsif` déléguant à la même fonction privée.
  - `public.consume_push_reminders` : branche `kind = 'export'` — `update notified_push = true where id = v_id::uuid and notified_push = false`. **C'est ici que le marquage se fait**, dans le sillage exact du patron : push-notify n'appelle la consommation qu'après un envoi réellement reçu (A5) — un échec d'envoi retente au passage suivant, un envoi distribué ne repart jamais.
  - `private.dispatch_export_notifications()` + cron `eo-push-exports` (*/5) : comptage conditionnel (ne POSTe que si des destinataires ont un appareil), `post_push_dispatch('export')`, secrets dans Vault — contrats test 0004 respectés (job sans paramètre, délégation Vault).
  - Re-grants idempotents sur les quatre fonctions recréées (motif 0147 lignes 281-285, test 0001 section 7 bis).
- **Tests 0164** (`supabase/tests/0164_gdpr_push_export.sql`, 6 sections, rollback final, comptages bornés §2.7D) : succès et échec notifiés avec leurs messages distincts ; url `/parametres` prouvée ; **aucun champ de notification ne contient storage_path ni un lien http** (marque reconnaissable : long bloc de « a » dans le chemin du semis, §2.7D) ; notified_push bascule, second appel vide, consommation répétée = 0 ; en_cours muet ; scope 'export' passe la garde, scope inconnu lève 22023 ; cron + dispatch conformes aux contrats du dépôt.

### Task 2 — push-notify accepte le scope 'export'

- `z.enum` étendu à `'export'` (ligne 84), doc-comment étendu (contrat du scope + règle D-04), et **`reminderKind` reconnaît le tag `export-`** — sans cette reconnaissance, `consume_push_reminders` ne serait jamais appelé pour les exports et `notified_push` ne basculerait jamais (push en boucle). Le plan prévoyait « aucune autre modification attendue » : ce delta est un Rule 2 consigné.
- `sh scripts/deploy-functions.sh` vert (15 fonctions) + `run.sh recreate functions` (le runtime recharge le code).

### Task 3 — preuves

| Preuve | Commande | Résultat |
|---|---|---|
| Contrôle statique | `python3 scripts/check-sql-statique.py` | 216 fonctions / 164 migrations / 96 tests, aucun défaut |
| Ses cas qui doivent échouer | `python3 scripts/test-check-sql-statique.py` | 6 cas, tous verts |
| Tests 0164 | `sh scripts/test-db.sh 0164` | **Vert, exit 0** |
| Suite SQL complète | `sh scripts/test-db.sh` | **94 fichiers, tous verts, exit 0** |
| Typecheck frontend | `cd app && npm run typecheck` | Vert (les vecteurs RFC 8291 de web-push.ts ne sentent rien — aucune dépendance ajoutée) |
| Preuve réseau bout-en-bout (modèle test-dispatch-push) | `sh scripts/test-dispatch-push.sh` | **ABSENCE DÉCLARÉE** — voir ci-dessous |

**ABSENCE DÉCLARÉE (§2.7, jamais tue) :** `sh scripts/test-dispatch-push.sh` a été lancé le 2026-10-27 et s'est arrêté proprement : « aucun abonnement de push réel sur cette instance » — `public.push_subscriptions` contient 0 ligne sur cette stack aujourd'hui, et un endpoint factice serait `dropped` et non `delivered`, donc un chiffre juste et une preuve fausse (le script le refuse lui-même). La chaîne pg_net → push-notify → service Push reste donc prouvée au niveau SQL (0164) mais PAS au niveau livraison réseau pour cette campagne ; la preuve est à refaire avec un appareil abonné — à la phase 31 (preuve SMTP/push de la porte OUV-07), comme prévu au plan. Aucun élément n'est passé sous silence.

## Deviations from Plan

1. **[Rule 3 - Blocking] Numérotation 0164 au lieu de 0159** — le plan nommait `0159_gdpr_push_export.sql`, mais 0159–0163 sont déjà pris (0159/0160 par 26-02, 0161/0162/0163 par 26-03). La migration est un NOUVEAU fichier `0164_gdpr_push_export.sql` (tests `0164_gdpr_push_export.sql`) — aucune migration appliquée réécrite (§2.7A).
2. **[Rule 2 - Critical] `reminderKind` étendu à `export-` dans push-notify** — le plan n'anticipait pas ce delta, mais sans lui la consommation après distribution ne toucherait jamais les exports : `notified_push` ne basculerait pas et la push repartirait chaque minute (exactement le T-26-19 que le plan impose d'éviter). Corrigé avec commentaire.
3. **[Rule 2 - Critical] Dispatch dédié `private.dispatch_export_notifications` + cron `eo-push-exports`** — la chaîne « existante » (`eo-push-messages` → scope 'messages') ne distribue que les messages ; sans appelant du scope 'export', aucune notification ne partirait jamais. Le motif 0042 (dispatch dédié + comptage conditionnel + délégation post_push_dispatch) est recopié tel quel, contrats test 0004 respectés.
4. **[Écart assumé] Fréquence du cron `*/5` (et non la minute)** — motif 0042 pour les messages : un export prend déjà plusieurs minutes, 5 minutes ne dégradent pas l'expérience ; le garde T-26-19 (unicité notified_push) rend la fréquence sans risque de boucle.

## Auth Gates

Aucun — stack locale, secrets déjà dans Vault (§2.7H), aucune clé manipulée.

## Known Stubs

Aucun. La chaîne est complète côté base et Edge : l'absence de preuve réseau livrée est une ABSENCE DÉCLARÉE (pas un stub) — refaire avec appareil abonné, phase 31.

## Threat Flags

Aucun nouveau surface hors du threat model : la push porte titre générique + url `/parametres` uniquement (T-26-18, prouvé par assertion sur les champs retournés), notified_push bascule après distribution (T-26-19, prouvé), l'enum zod reste fermée et étendue d'un seul scope documenté (T-26-20), aucune installation nouvelle (T-26-SC inchangé).

## Self-Check: PASSED

- [x] `supabase/migrations/0164_gdpr_push_export.sql` existe et appliquée (schema_migrations)
- [x] `supabase/tests/0164_gdpr_push_export.sql` existe, vert
- [x] `supabase/functions/push-notify/index.ts` modifié (scope 'export', reminderKind, doc-comment)
- [x] Commits 3da6308 et 7652663 trouvés dans `git log`
- [x] `sh scripts/test-db.sh` : 94 fichiers, tous verts (exit 0)
- [x] `sh scripts/deploy-functions.sh` : 15 fonctions déployées + recreate functions
- [x] test-dispatch-push.sh : absence déclarée nommément (0 abonnement réel sur l'instance)

---
*Phase: 26-export-rgpd*
*Completed: 2026-10-27*
