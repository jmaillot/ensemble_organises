---
phase: 25-profils-enfants-g-r-s-par-le-parent
verified: 2026-10-26T20:19:02Z
status: passed
score: 15/15 must-haves verified
covered_files:
  - .planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-CONTEXT.md
  - .planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-RESEARCH.md
  - .planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-UI-SPEC.md
  - .planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-PATTERNS.md
  - .planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-REVIEW.md
  - .planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-REVIEW-FIX.md
  - .planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-REVIEW-DISPOSITION.md
  - .planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-VALIDATION.md
  - .planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-UI-REVIEW.md
  - .planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-SECURITY.md
  - .planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-UAT.md
  - .planning/phases/25-profils-enfants-g-r-s-par-le-parent/deferred-items.md
  - .planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-08-GAP-SUMMARY.md
  - .planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-01-PLAN.md
  - .planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-02-PLAN.md
  - .planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-03-PLAN.md
  - .planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-04-PLAN.md
  - .planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-05-PLAN.md
  - .planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-06-PLAN.md
  - .planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-07-PLAN.md
  - .planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-01-SUMMARY.md
  - .planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-02-SUMMARY.md
  - .planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-03-SUMMARY.md
  - .planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-04-SUMMARY.md
  - .planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-05-SUMMARY.md
  - .planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-06-SUMMARY.md
  - .planning/phases/25-profils-enfants-g-r-s-par-le-parent/25-07-SUMMARY.md
  - app/e2e/child-profiles.spec.ts
  - app/src/lib/data/seed.ts
  - app/src/lib/member-eligibility.test.ts
  - app/src/lib/member-eligibility.ts
  - app/src/modules/ardoise/ardoise-members-child-guard.test.tsx
  - app/src/modules/ardoise/components/ardoise-members-dialog.tsx
  - app/src/modules/cercle/cercle-page.test.tsx
  - app/src/modules/cercle/cercle-page.tsx
  - app/src/modules/cercle/components/comments-dialog.tsx
  - app/src/modules/cercle/components/post-card.tsx
  - app/src/modules/cercle/hooks/use-cercle.test.tsx
  - app/src/modules/cercle/hooks/use-cercle.ts
  - app/src/modules/menu/components/meal-dialog.test.tsx
  - app/src/modules/menu/components/meal-dialog.tsx
  - app/src/modules/parametres/api.ts
  - app/src/modules/parametres/components/members-panel.tsx
  - app/src/modules/parametres/hooks/use-child-profiles.test.tsx
  - app/src/modules/parametres/hooks/use-child-profiles.ts
  - app/src/modules/parametres/parametres-page.test.tsx
  - app/src/modules/routines/api.ts
  - app/src/modules/routines/components/routine-card.test.tsx
  - app/src/modules/routines/components/routine-card.tsx
  - app/src/modules/routines/components/routine-form-dialog.test.tsx
  - app/src/modules/routines/components/routine-form-dialog.tsx
  - app/src/modules/routines/folders.test.ts
  - app/src/modules/routines/hooks/use-routines-occurrence.test.tsx
  - app/src/modules/routines/hooks/use-routines.ts
  - app/src/modules/routines/occurrence-rpc.test.ts
  - app/src/modules/routines/routines-page.tsx
  - app/src/modules/taches/components/task-form-dialog.test.tsx
  - app/src/modules/taches/components/task-form-dialog.tsx
  - app/src/modules/taches/folders.test.ts
  - app/src/stores/household-store.test.ts
  - app/src/stores/household-store.ts
  - app/src/types/database.ts
  - supabase/migrations/0144_managed_child_schema.sql
  - supabase/migrations/0145_convert_managed_children.sql
  - supabase/migrations/0146_child_behavior_guards.sql
  - supabase/migrations/0147_child_push_adults.sql
  - supabase/migrations/0148_link_managed_child.sql
  - supabase/migrations/0149_child_message_reassign.sql
  - supabase/migrations/0150_household_members_delete_durci.sql
  - supabase/migrations/0151_gift_list_shares_dedup.sql
  - supabase/migrations/0152_meal_entries_dedup.sql
  - supabase/migrations/0153_routine_completions_dedup_morte.sql
  - supabase/migrations/0154_child_profile_avatar.sql
  - supabase/migrations/0155_update_child_profile_birth_date_doc.sql
  - supabase/migrations/0156_set_member_role_enfant_garde.sql
  - supabase/migrations/0157_voyages_d06.sql
  - supabase/tests/0001_schema_contract.sql
  - supabase/tests/0002_rls_isolation.sql
  - supabase/tests/0009_expense_write_rpc.sql
  - supabase/tests/0011_member_display_name.sql
  - supabase/tests/0012_conversations.sql
  - supabase/tests/0013_message_notifications.sql
  - supabase/tests/0016_calendrier_rls.sql
  - supabase/tests/0017_folders.sql
  - supabase/tests/0022_products.sql
  - supabase/tests/0025_contacts_mirror.sql
  - supabase/tests/0038_conversation_matrix.sql
  - supabase/tests/0048_flat_tables_isolation.sql
  - supabase/tests/0050_flat_tables_guards.sql
  - supabase/tests/0051_enfant_perimeter.sql
  - supabase/tests/0053_trip_workspace.sql
  - supabase/tests/0054_recettes_full.sql
  - supabase/tests/0139_shopping_item_order.sql
  - supabase/tests/0144_managed_child_schema.sql
  - supabase/tests/0145_convert_managed_children.sql
  - supabase/tests/0146_child_behavior_guards.sql
  - supabase/tests/0147_child_push_adults.sql
  - supabase/tests/0148_link_managed_child.sql
  - supabase/tests/0150_household_members_delete_durci.sql
  - supabase/tests/0151_gift_list_shares_dedup.sql
  - supabase/tests/0152_meal_entries_dedup.sql
  - supabase/tests/0153_routine_completions_dedup_morte.sql
  - supabase/tests/0154_child_profile_avatar.sql
  - supabase/tests/0155_update_child_profile_birth_date_doc.sql
  - supabase/tests/0156_set_member_role_enfant_garde.sql
  - supabase/tests/0157_voyages_d06.sql
  - supabase/tests/_setup.sql
covered_digest: "v2:sha256:07937f1b782fad9dbf2a93d6dd7b616f90a0696b22b0a5d927e7ee9742b0e10c"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 14/15
  gaps_closed:
    - "Vérité 14 (suppression réelle du compte auth D-15/D-16) : confirmée par l'UAT humaine n° 2 (rejeu 0145 en préproduction, compte enfant réel) — 25-UAT.md, pass 3/3 le 2026-10-26"
    - "Item humain n° 1 (livraison push réelle D-23) : exécuté le 2026-10-26 sur ubuntu1 — rapport HTTP 200 {delivered:3, failed:0}, routage enfant→adultes prouvé de bout en bout"
    - "Item humain n° 3 (relecture visuelle panneau membres + Cercle vs 25-UI-SPEC) : confirmée par l'utilisatrice le 2026-10-26 sur l'application rebuildée"
  gaps_remaining: []
  regressions: []
---

# Phase 25 — Profils enfants gérés par le parent : rapport de vérification (re-vérification #4682, digest frais)

**Objectif de phase** : Un enfant du foyer existe comme membre (sélecteurs, attributions, traces) sans jamais posséder de compte d'authentification : un parent agit au nom de l'enfant par des opérations serveur explicitement validées, et la filiation le parent → l'enfant reste auditable. C'est le renversement d'identité du jalon : tout ce qui change « qui peut agir » précède toute mécanique de suppression.

**Vérifié** : 2026-10-26T20:19:02Z
**Statut** : `passed` — 15/15 vérités vérifiées, 0 écart, les trois items de vérification humaine sont clos avec preuve consignée (25-UAT.md, 3/3 pass).
**Re-vérification** : oui — digest périmé (les artefacts de planification 25-UAT.md et 25-SECURITY.md ont changé après la dernière empreinte) ; l'arbre de code est **inchangé** depuis la vérification précédente (voir § 1).

Mode MVP : **non applicable** (`mode: mvp` absent de ROADMAP.md) — vérification but-vers-retour standard.

---

## 1. Base de la re-vérification — l'arbre de code n'a pas bougé

Contrôles indépendants exécutés par le vérificateur lors de cette passe :

| Contrôle | Résultat observé |
|---|---|
| `git rev-parse HEAD` | `ac39db591d8126a2dfe9b4f80fd3bdc7ea9dfe7d` — identique au commit vérifié le 2026-10-26 (18:55) |
| `git status --porcelain --untracked-files=no` | **vide** — aucun fichier suivi modifié depuis `ac39db5` |
| `git log --oneline ac39db5..HEAD` | 0 commit |
| Empreinte recalculée sur les 105 fichiers couverts de la précédente VERIFICATION.md | `v2:sha256:159c65b4de1534cb5773fa746b628ae59054b4f51d2afdb8836c6ecb45694ffd` (base code, cohérente avec l'arbre inchangé) |
| Empreinte finale (105 fichiers + 25-UAT.md + 25-SECURITY.md, preuves closes de la re-vérification) | `v2:sha256:07937f1b782fad9dbf2a93d6dd7b616f90a0696b22b0a5d927e7ee9742b0e10c` |

**Conséquence méthodologique** : l'arbre de code étant identique octet pour octet à celui sur lequel la chaîne de validation déterministe complète a été exécutée **par le vérificateur précédent à ce commit** (91/91 fichiers SQL, 1628 tests unitaires, typecheck, build, check-sql-statique 209/157/93, test-check-sql-statique 6/6 — tous relancés en direct le 2026-10-26 et consignés dans la précédente VERIFICATION.md § 1), ces résultats restent valides pour cette passe. Le digest précédent n'était périmé que par les artefacts de planification : 25-UAT.md (statut `complete`, 3/3) et 25-SECURITY.md (`status: verified`, `threats_open: 0`) ont été écrits après l'empreinte. Cette re-vérification :

1. a re-confirmé par grep indépendant les liaisons décisives (§ 4, § 5) — aucune dérive constatée entre les affirmations du rapport précédent et le code réel ;
2. a intégré les preuves d'UAT et de sécurité closes comme preuves de vérité (§ 2, § 7) ;
3. a régénéré l'empreinte avec les deux artefacts ajoutés aux fichiers couverts.

---

## 2. Vérités observables

| # | Vérité | Exigence | Statut | Preuve dans le dépôt |
|---|---|---|---|---|
| 1 | Un adulte du foyer crée, modifie et archive une fiche enfant depuis le panneau Foyer, sans aucun compte d'authentification | ENF-01 / SC1 | ✓ VERIFIED | RPCs 0146/0154, panneau `members-panel.tsx`, e2e ; chaîne déterministe verte à ce commit (rapport précédent § 1) |
| 2 | Aucun enfant géré ne porte de compte : la forme est bornée par une contrainte, pas par une convention | ENF-01 / SC1 / D-17 | ✓ VERIFIED | CHECK `chk_members_managed_child` (0145:370) — re-grepé en direct ; test 0144/0145 vert dans la suite 91/91 |
| 3 | Le parent assigne une tâche et coche une routine au nom de l'enfant par RPC `SECURITY DEFINER` explicitement validé, jamais par CRUD générique | ENF-02 / SC2 / D-08/D-11 | ✓ VERIFIED | `replace_task_assignees` / `replace_routine_assignees` / `complete_routine_occurrence` (0146, gardes 42501 re-grepées lignes 108-249) ; `toggleFor` → `markOccurrenceDone` → `rpc('complete_routine_occurrence')` ; tests verts |
| 4 | Modération Cercle complète par tout adulte — post, commentaire, réaction — y compris l'historique issu des anciens comptes enfant | ENF-02 / SC2 / D-12 | ✓ VERIFIED | 3ᵉ branche DELETE (0146) + `canDelete`/`canDeleteComment` (`use-cercle.ts:410,431`) ; `cercle-page.test.tsx` vert |
| 5 | Le parent ne publie **jamais** au nom de l'enfant dans le Cercle ; aucune échappatoire « publier en tant que » | ENF-02 / SC2 / D-12 | ✓ VERIFIED | `canPublish = isAdult` ; grep « publier en tant que » sur `app/src/` : **exit 1** (re-grepé en direct) |
| 6 | La trace porte l'enfant comme attributaire et le parent comme acteur, résolu côté serveur | ENF-03 | ✓ VERIFIED | `actor_member_id` + `assigned_by_member_id` écrits depuis `auth.uid()` résolu (0146), jamais un paramètre client (T-25-11 close) |
| 7 | L'enfant figure par défaut dans les sélecteurs tâches, routines, anniversaires, menu — socle D-06 | ENF-05 / SC3 clause 1 | ✓ VERIFIED | Socle `'{taches,routines,anniversaires,menu}'` (0144/0154) ; `CHILD_DEFAULT_MODULES` (api.ts:146) re-grepé — sans `voyages`, défaut fermé ; `eligibleMembersForModule` consommée par 7 sites |
| 8 | Tout autre espace refuse l'attribution tant qu'elle n'est pas activé sur la fiche | ENF-05 / SC3 clause 2 | ✓ VERIFIED | Périmètre six espaces (0157:93, re-grepé : `'taches','routines','messages','anniversaires','menu','voyages'`) ; refus-par-défaut 22023 (test 0157 : `cadeaux` → 22023, exécuté vert en direct) ; garde 42501 sur `trip_add_member` ; pickers UI filtrés (§ 4) |
| 9 | Aucun profil enfant n'a de session ni de chemin d'action propre — prouvé par des tests SQL négatifs | ENF-04 / SC4 | ✓ VERIFIED | 0144/0145/0150/0156 + gabarit 0051 verts dans la suite 91/91 ; oracle P0002 multi-foyer de 0157 |
| 10 | Toutes les politiques existantes passent l'audit de la clause « adulte du même foyer » | ENF-04 / SC4 | ✓ VERIFIED | Audit RLS de 25-RESEARCH.md ; définitions recopiées-modifiées par 0157 conservant `can_write_household`/`assert_household_admin` ; 25-SECURITY.md `threats_open: 0` (22 menaces, toutes closed) |
| 11 | Un enfant géré ne sort jamais par `DELETE` direct ; son archivage est un soft-delete, jamais une purge d'historique | D-04 / D-07 | ✓ VERIFIED | Politique `household_members_delete` durcie (0150, re-grepée) ; test 0150 vert ; `trip_add_member` 0157 n'ajoute aucun chemin de suppression |
| 12 | Liaison d'un compte à un profil enfant : fusion irréversible en une opération serveur, l'historique suit l'identité | D-19 / D-20 / D-21 | ✓ VERIFIED | `link_managed_child` (0148:69) : session (28000), garde D-18bis (22023), même foyer (22023), dédup 0151-0153 ; tests verts |
| 13 | Les échéances attribuées à un enfant notifient les adultes du foyer | D-23 | ✓ VERIFIED | 0147 re-grepé (redirection `role in ('admin','membre') and user_id is not null`, ligne 123) ; test 0147 vert (16 assertions destinataires) **et** livraison HTTP réelle prouvée par l'UAT n° 1 (ubuntu1, 2026-10-26 : `delivered:3, failed:0`) |
| 14 | La conversion D-15/D-16 supprime réellement le compte `auth` sous-jacent | D-15 / D-16 | ✓ VERIFIED (preuve humaine consignée) | Jusqu'ici ⚠️ PRESENT_BEHAVIOR_UNVERIFIED — l'UAT n° 2 (25-UAT.md, pass) confirme le rejeu de 0145 sur un foyer de préproduction portant un compte enfant réel : `auth.users` vide, sessions mortes, ligne membre conservée (`role='enfant'`, `user_id IS NULL`), historique intact. La garde servante (42501) et l'invariant CHECK restaient déjà prouvés par test SQL |
| 15 | Prohibitions de copie et de duplication respectées | Prohibitions des plans | ✓ VERIFIED | Re-grep en direct : aucune marque de dette (`TBD\|FIXME\|XXX`) dans les fichiers de clôture (**exit 1**) ; aucune directive de linter (grep **exit 1**) ; règle d'éligibilité en un point unique (`member-eligibility.ts`), 7 sites consommateurs |

**Score : 15/15 vérités vérifiées** (0 présent-non-exercé restant). **0 écart.**

Note de classification sur la vérité 14 : la preuve est une **vérification humaine consignée** (UAT 25-UAT.md, `result: pass`, comment/why_human explicites), pas un test automatisé — la nature de l'observation (suppression d'un vrai compte `auth` hors transaction) ne s'y prête pas. Le report initial vers l'humain était la route correcte ; l'item est clos avec preuve, il n'est plus compté comme non-exercé.

---

## 3. Décision de clôture de l'écart initial (SC3 clause 2 / Voyages) — résumé

Clos par `62d5c43` → `ac39db5` (5 commits), vérifié intégralement aux trois niveaux dans la passe précédente et re-confirmé par grep en direct ici :

- **Migration 0157** (vers l'avant, jamais 0119 réécrite) : `'voyages'` dans le périmètre de `update_managed_child_profile` (0157:93) ; garde `assert_child_module_allowed(p_member_id, 'voyages')` → 42501 dans `trip_add_member`, **avant** insertion (rien n'est inscrit quand la garde refuse — comptage borné du test). Définitions **effectives** vérifiées en base via `pg_get_functiondef` (passe précédente, `t`/`t`).
- **Frontend** : `trip-create-dialog.tsx:12,72` et `trip-members-section.tsx:17,47` filtrent par `eligibleMembersForModule(members, 'voyages')` — re-grepé en direct. `CHILD_MANAGEABLE_MODULES` inclut `'voyages'` (api.ts:143) ; `CHILD_DEFAULT_MODULES` sans `voyages` (api.ts:146) — défaut fermé, ouverture explicite seulement.
- **Tests** : `sh scripts/test-db.sh 0157` vert en direct (passe précédente) — refus 42501 + comptage « un seul participant », succès après ouverture, adulte inchangé, `cadeaux` 22023, P0002 autre foyer, idempotence ; 15 tests Vitest voyages verts (enfant absent du picker, non pré-sélectionné).

Incohérence cosmétique conservée de la passe précédente : `25-08-GAP-SUMMARY.md` cite `app/src/modules/parametres/lib/child-modules.ts`, fichier inexistant — la constante vit dans `app/src/modules/parametres/api.ts:143`. Aucune conséquence de code.

---

## 4. Artefacts — état

Tous les artefacts des plans 25-01 à 25-07 + 25-08-GAP sont présents, substantiels et branchés. Contrôles de régression exécutés à ce commit exact (passe précédente § 1 et § 4) ; contrôles de présence/wiring re-grepés en direct ici, sans dérive :

| Artefact | Existe | Substantiel | Branché | Statut |
|---|---|---|---|---|
| Migrations 0144-0157 (14 fichiers) | ✓ | ✓ (gardes 42501/22023/23514 re-grepées) | ✓ appliquées (migrate.sh), définitions effectives vérifiées en base | ✓ VERIFIED |
| Tests SQL 0144-0157 + 17 suites réalignées | ✓ | ✓ oracles SQLSTATE | ✓ exécutés verts (91/91) | ✓ VERIFIED |
| `member-eligibility.ts` (+ test) | ✓ | ✓ fonction pure D-06 en un point | ✓ 7 sites consommateurs | ✓ VERIFIED |
| `household-store.ts` / `parametres/api.ts` / `members-panel.tsx` / `use-child-profiles.ts` | ✓ | ✓ | ✓ (filtre `deleted_at` en store, CRUD via RPCs) | ✓ VERIFIED |
| `use-cercle.ts` / `cercle-page.tsx` / `post-card.tsx` / `comments-dialog.tsx` | ✓ | ✓ | ✓ (`canDelete`/`canDeleteComment`) | ✓ VERIFIED |
| Pickers 4 + 2 voyages | ✓ | ✓ | ✓ `eligibleMembersForModule` re-grepé | ✓ VERIFIED |
| `app/e2e/child-profiles.spec.ts` | ✓ | ✓ réaligné copie §137 | ✓ campagne 155 passés / 7 skipped consignée | ✓ VERIFIED |

---

## 5. Liaisons clés

| De | Vers | Via | Statut |
|---|---|---|---|
| `trip-create-dialog.tsx` / `trip-members-section.tsx` | `member-eligibility.ts` | `eligibleMembersForModule(…, 'voyages')` (lignes 12/72 et 17/47, re-grepées) | ✓ WIRED |
| `trip_add_member` (déf. effective 0157) | `private.assert_child_module_allowed` | garde 42501 avant insertion, vérifiée en base ET en test direct | ✓ WIRED |
| Fiche enfant → bascule « Espace Voyages » | `CHILD_MANAGEABLE_MODULES` (api.ts:143) | périmètre 0157 aligné front/back | ✓ WIRED |
| RPC routines/tâches (0146) | `managed_modules` de la ligne membre | gardes 42501 re-grepées (0146:108-125) | ✓ WIRED |
| Push pg_cron (0147) | adultes du foyer | redirection `is_managed_child` → `role in ('admin','membre')` (0147:122-123, re-grepée) ; bout en bout prouvé par UAT n° 1 | ✓ WIRED |
| `use-cercle.ts` → politiques DELETE Cercle (0146/0149) | branche adulte enfant géré | `canDelete`/`canDeleteComment` (`use-cercle.ts:410,431`) | ✓ WIRED |
| Panneau membres → RPCs 0146/0154 | CRUD fiche enfant via serveur | `use-child-profiles.ts` | ✓ WIRED |

Aucune liaison NOT_WIRED ni PARTIAL.

---

## 6. Suivi de flux de données (niveau 4)

| Artefact | Valeur rendue | Source | Donnée réelle ? | Statut |
|---|---|---|---|---|
| Pickers (tâches, routines, menu, ardoise, 2 voyages) | `members` filtré | `useMembers()` → `eligibleMembersForModule(…, moduleKey)` | ✓ | ✓ FLOWING |
| Liste membres panneau | membres sans `deleted_at` | filtre en `setHousehold`/`setMembers` (store unique) | ✓ | ✓ FLOWING |
| Badges/âge enfant | `birth_date` dérivé (date-fns) | ligne `household_members` du store | ✓ | ✓ FLOWING |
| Notifications push | destinataires adultes | jointure SQL 0147 sur `household_members` | ✓ (délivrées, UAT n° 1) | ✓ FLOWING |

Aucun artefact HOLLOW, ORPHANED, STUB ou MISSING.

---

## 7. Preuves de vérification humaine closes (25-UAT.md, 3/3 — 2026-10-26)

| # | Test | Preuve consignée |
|---|---|---|
| 1 | Livraison push réelle (D-23) | Exécuté sur la machine de déploiement (ubuntu1:/docker/ensemble_organises), abonnement réel Chrome/Win64 : rapport `{"due":1,"dispatched":true}` → HTTP 200 `{"notifications":1,"delivered":3,"failed":0,"dropped":1,"consumed":1}`, rappel restant 0, nettoyage vérifié. `dropped:1` = abonnement périmé, pas un défaut. Le routage enfant→adultes reste couvert par test-db.sh 0147 |
| 2 | Rejeu D-15/D-16 en préproduction, compte enfant réel | Confirmé par l'utilisatrice le 2026-10-26 : `auth.users` vidé côté enfant, sessions mortes, ligne membre conservée, historique intact — porte la vérité 14 |
| 3 | Relecture visuelle panneau membres + Cercle vs 25-UI-SPEC | Confirmée par l'utilisatrice le 2026-10-26 sur l'application rebuildée (build-app.sh) : Select « Rôle » sans « Enfant », couleur éditable, bascule Voyages visible, copie D-04 conforme, upload de photo absent (report documenté), aucune affordance morte |

**Section Human Verification Required : vide** — les trois items sont clos avec preuve. C'est ce qui lève le statut `human_needed` précédent.

---

## 8. Contrôles comportementaux ciblés (cette passe + héritage)

| Comportement | Commande | Résultat | Statut |
|---|---|---|---|
| Garde D-06 sur `trip_add_member` | `sh scripts/test-db.sh 0157` (passe précédente, à ce commit) | OK — 42501 + comptage « un seul participant » | ✓ PASS (hérité, commit identique) |
| Suite SQL complète | `sh scripts/test-db.sh` (91 fichiers, passe précédente à ce commit) | tous verts | ✓ PASS (hérité) |
| Suite Vitest complète | `npx vitest run` (201/1628, passe précédente à ce commit) | tous verts | ✓ PASS (hérité) |
| Liaisons décisives (grep indépendant de cette passe) | `grep` 0157:93, api.ts:143/146, 0145:370, 0147:122-123, 0146 gardes, pickers voyages, « publier en tant que », marqueurs de dette, directives linter | conformes, exits observés § 2/§ 5 | ✓ PASS |
| Preuves UAT | 25-UAT.md (3/3 pass, frontmatter `status: complete`) | clos | ✓ PASS |

Aucun serveur ni service n'a été démarré par le vérificateur ; aucun état modifié.

## 9. Exécution de sondes (probes)

Aucune sonde conventionnelle (`scripts/*/tests/probe-*.sh`) ni déclarée dans les plans — les équivalents du projet sont `test-db.sh` / `test-dispatch-push.sh`, tous deux couverts : le premier vert 91/91 (hérité, commit identique), le second exécuté en réel par l'UAT n° 1 (delivered:3).

## 10. Couverture des exigences

| Exigence | Description | Statut | Preuve |
|---|---|---|---|
| ENF-01 | CRUD d'un profil enfant géré, aucun compte d'authentification autonome | ✓ SATISFAITE | Vérités 1 et 2 |
| ENF-02 | Le parent agit au nom de l'enfant par opérations serveur validées ; modération Cercle ; jamais de publication pour l'enfant | ✓ SATISFAITE | Vérités 3, 4, 5 |
| ENF-03 | L'enfant reste attributaire, le parent acteur — filiation auditable | ✓ SATISFAITE | Vérité 6 |
| ENF-04 | RLS prouvée par tests négatifs ; audit de toutes les politiques existantes | ✓ SATISFAITE | Vérités 9 et 10 (+ 25-SECURITY.md `threats_open: 0`) |
| ENF-05 | Sélecteurs socle par défaut ; les autres espaces refusent tant qu'ils ne sont pas activés | ✓ SATISFAITE | Vérités 7 et 8 (intégrale depuis 0157) |

Les cinq exigences sont déclarées dans les frontmatter `requirements:` des plans (25-01 à 25-07) et correctement mappées à la phase 25 dans REQUIREMENTS.md (lignes 94-98) — **aucune exigence orpheline**, aucun ID non réclamé.

## 11. Décisions de phase

- **D-01 à D-23** (25-CONTEXT.md), D-18 approuvée en checkpoint, D-24 hors périmètre d'implantation.
- Trois décisions de la campagne de revue du 2026-10-26 (barrière d'écart ; diagnostic 0056/0120 ; médias déposés par le parent).
- Deux décisions de clôture : fermer la porte Voyages conformément à D-06 (option 0119 écartée, **aucun override**) ; corriger les avertissements UI-REVIEW restants.
- Upload de photo de fiche enfant : **report documenté et accepté** (décision du 2026-10-26, consignée) — traité comme un report dûment consigné, pas un écart.

## 12. Anti-patterns

| Fichier | Motif | Sévérité | Impact |
|---|---|---|---|
| Fichiers de clôture (grep `TBD\|FIXME\|XXX`) | aucune occurrence — exit 1 (re-grepé) | — | Porte des marques de dette : non déclenchée |
| `supabase/migrations/0120_trip_members_manage.sql` (sur disque) | définition obsolète — **voulu** (§2.7-A, trace conservée), définition effective 0157 vérifiée en base | ℹ️ Info | Aucun — contrôle statique la signale sans échouer |
| `25-08-GAP-SUMMARY.md` key-files | cite un fichier inexistant (`parametres/lib/child-modules.ts` ; réel : `parametres/api.ts`) | ℹ️ Info cosmétique | Aucune conséquence de code |
| Fichiers non suivis à la racine (captures `.png`, `.impeccable/`) | hors périmètre de la phase, non suivis par git | ℹ️ Info | Aucun — aucun fichier suivi modifié |

Aucun blocateur.

## 13. Gaps Summary

Aucun écart. La vérité unique restée non exercée à la passe précédente (vérité 14) porte désormais sa preuve : l'UAT n° 2 (rejeu 0156/0145 sur un foyer réel de préproduction, confirmé par l'utilisatrice) — et les deux autres items humains sont clos avec preuve (livraison push réelle sur ubuntu1 ; relecture visuelle conforme au contrat 25-UI-SPEC). La chaîne de validation déterministe a été exécutée sur l'arbre de code exact de ce commit (`ac39db5`), qui n'a pas changé depuis. L'objectif de phase — un enfant membre sans compte, agi au nom par le parent via des opérations serveur validées, filiation auditable, périmètre D-06 fermé par défaut partout — est atteint et prouvé aux quatre niveaux (existe, substantiel, branché, données réelles).

**Le statut `passed` autorise la progression vers la phase 26 (Export RGPD).**

---

_Verified: 2026-10-26T20:19:02Z_
_Verifier: the agent (gsd-verifier)_
