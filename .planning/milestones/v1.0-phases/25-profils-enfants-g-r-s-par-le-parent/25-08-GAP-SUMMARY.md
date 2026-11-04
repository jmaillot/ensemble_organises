---
phase: 25
plan: 25-08-GAP
title: Clôture d'écart — D-06 sur Voyages + avertissements UI-REVIEW
status: complete
completed: 2026-10-26
requires: [25-07]
provides: ["D-06 appliqué à Voyages", "UI-REVIEW warnings corrigés"]
key-files:
  created:
    - supabase/migrations/0157_voyages_d06.sql
    - supabase/tests/0157_voyages_d06.sql
  modified:
    - app/src/modules/voyages/components/trip-create-dialog.tsx
    - app/src/modules/voyages/components/trip-members-section.tsx
    - app/src/modules/parametres/components/members-panel.tsx
    - app/src/modules/parametres/hooks/use-child-profiles.ts
    - app/src/modules/parametres/hooks/use-child-profiles.test.tsx
    - app/src/modules/routines/components/routine-card.tsx
    - app/src/modules/cercle/cercle-page.tsx
    - app/e2e/child-profiles.spec.ts
    - app/src/modules/parametres/lib/child-modules.ts
commits: [62d5c43, d57013a, 8e726f1, 259d92d, cf6b660]
---

# Phase 25 Plan 25-08-GAP: Clôture d'écart Summary

**One-liner:** Voyages rebranché sur « Fermer la porte » (D-06, migration 0157 + pickers `eligibleMembersForModule`) et les deux avertissements UI-REVIEW corrigés selon le contrat 25-UI-SPEC, avec couverture unitaire et e2e réalignée.

## Ce qui a été fait

### 1. Voyages respecte D-06 (décision utilisateur 2026-10-26)

- **Migration 0157** (vers l'avant, jamais 0119 réécrite) : `'voyages'` ajouté au périmètre de `update_managed_child_profile` (signature 7 args) ; `trip_add_member` garde par `assert_child_module_allowed(p_member_id, 'voyages')` → refus 42501 si l'espace est éteint sur la fiche de l'enfant.
- **Tests SQL `0157_voyages_d06.sql`** : refus 42501, succès quand l'espace est ouvert, adulte inchangé, périmètre 22023, isolement autre foyer P0002. Le test de 0120 ouvre `'voyages'` avant l'ajout de l'enfant.
- **Frontend** : `CHILD_MANAGEABLE_MODULES` + libellé « Espace Voyages » dans les paramètres ; `trip-create-dialog.tsx` et `trip-members-section.tsx` consomment `eligibleMembersForModule(members, 'voyages')` (la garde pure de 25-07), commentaires 0119 → D-06.
- **Tests voyages réécrits** : Noé absent des pickers par défaut ; cas positif via ouverture de `'voyages'` sur la fiche (store) ; boîtes 10→9, participants 4→3.

### 2. Avertissements UI-REVIEW corrigés (décision utilisateur « Corriger aussi »)

- **ConfirmDialog D-04 + labels divergents** : bouton « Accès » → « Donner accès », état vide copie contrat, CTA `people`, toasts prénommés, option « Enfant » filtrée du sélecteur de rôle, couleur éditable à la modification (D-05), légende « Espaces où {prénom} peut figurer », corps de confirmation D-04 verbatim.
- **Troncature fiche éditable** : `updateChild` persiste déjà `colorTag` — l'UI expose maintenant le champ ; notice tuteur « agit pour lui, ici et dans les listes » (contrat §137).
- **routine-card** : gap-2, font-extrabold, 13px — alignement sur le gabarit `header-menu.tsx:32` (`min-w-[210px]` conservé, il est le gabarit existant, pas une valeur inventée).
- **Cercle** : copie de modération conditionnelle au rôle de l'auteur (enfant nommé vs copie existante, préserve `cercle-page.test.tsx:189`).

## Validation (chaîne complète §2.7, cet ordre)

| Commande | Résultat |
|---|---|
| `npm run typecheck` | ✅ 0 erreur |
| `npm test` | ✅ 201 fichiers / 1628 tests |
| `npm run build` | ✅ precache 138 entrées |
| `npm run test:e2e` | ✅ 155 passed, 7 skipped |
| `python3 scripts/check-sql-statique.py` | ✅ 209 fonctions / 157 migrations / 93 tests, aucun défaut |
| `python3 scripts/test-check-sql-statique.py` | ✅ |
| `sh scripts/migrate.sh` | ✅ toutes appliquées |
| `sh scripts/test-db.sh` | ✅ 91/91 |
| `sh scripts/test-dispatch-push.sh` | ⚠️ **NON EXÉCUTÉ** — pas d'appareil push réel abonné sur cette machine ; le SQL push (pg_net → Vault) n'est pas validé par cette campagne, à mener avant tout déploiement |

## Déviations

**[Rule 1 - Bug] Sélecteurs de test cassés par le double montage des dialogs** — `getByLabelText('Couleur')` échouait (deux dialogs montés, label portant le `*` du Field). Fix : scoper au `findByRole('dialog', { name })` + regex `/^Couleur/`. Idem pour le sélecteur de rôle (scopé au dialog).

**[Rule 1 - Bug] e2e obsolète** — `child-profiles.spec.ts` assertait l'ancienne copie « agit pour elle » ; réaligné sur le contrat §137 « agit pour lui, ici et dans les listes ».

## Décisions et observations reportées

- `contacts.linked_member_id` dans `contact-form-dialog.tsx` : lien faible, pas une appartenance d'espace — laissé tel quel.
- Picker anniversaires (`birthday-form-dialog.tsx:150`) : `members` brut, socle D-06 non appliqué — le serveur refuse 22023 ; mineur, noté.
- Migration 0120 sur disque est cassée (référence `private.ensure_uuid` inexistante) ; la définition effective en base est celle de 0157 (recopie-modifiée). Le contrôle statique signale les définitions dépassées sans échouer.
- La moitié D-12 « confirmation de suppression de commentaire » était déjà en place (`post-card.tsx:445-457`, `comments-dialog.tsx:243-255`) et `canDeleteComment` corrigé (`use-cercle.ts:431`).

## Self-Check: PASSED

- Migration 0157 appliquée et testée (91/91).
- 5 commits cités vérifiés dans `git log`.
- Chaîne de validation exécutée intégralement, résultats cités.
