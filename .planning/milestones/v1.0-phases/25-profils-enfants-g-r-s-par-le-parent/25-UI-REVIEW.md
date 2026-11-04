# Phase 25 — UI Review

**Audited:** 2026-10-26
**Baseline:** 25-UI-SPEC.md (approuvé 2026-10-25) + 25-CONTEXT.md D-01..D-23
**Screenshots:** not captured (no dev server on 3000/5173/8080) — code-only audit
**Interaction captures:** off (workflow.ui_interaction_capture is false) — interaction findings below are code-derived and say so

**Scope:** surface frontend de la phase 25 uniquement — `useIsAdult` + filtre vivantes du store, CRUD enfant du members-panel (RPC 0146/0148), modération Cercle D-12, éligibilité D-06 des quatre pickers, « Cocher pour » + rebranchage `complete_routine_occurrence`, Cercle composer masqué.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 2/4 | Le contrat de copie approuvé n'est pas suivi : 8+ libellés déclarés remplacés par des variantes (confirm de suppression, toasts sans prénom, notice « pour elle », CTA « Accès ») |
| 2. Visuals | 3/4 | Lignes enfants à 4 boutons égaux (dense sur mobile), case restrictions en `<input>` brut au lieu du primitif `Checkbox` déclaré, CTA création avec icône `plus` au lieu de `people` |
| 3. Color | 4/4 | Le seul marqueur enfant est le badge ambre (conforme), zéro couleur codée en dur, coral sur hover destructeur, accent jamais utilisé pour signaler le statut enfant |
| 4. Typography | 3/4 | Deux valeurs hors charte : `text-[13.5px]` (menu « Cocher pour ») et `font-semibold` (600) en dehors des poids 400/800 déclarés |
| 5. Spacing | 3/4 | Généralement sur l'échelle (p-3, mt-4, py-6) mais `gap-2.5`/`gap-3.5` hors grille et `min-w-[210px]` arbitraire dans le menu « Cocher pour » |
| 6. Experience Design | 2/4 | **BLOCKER** : la modération D-12 s'arrête aux posts — `canDeleteComment` n'a pas la branche adulte sur le contenu enfant ; option « Enfant » morte dans le Rôle ; couleur non éditable à l'édition |

**Overall: 17/24**

---

## Top 3 Priority Fixes

1. ****Modération D-12 incomplète : un adulte ne peut pas supprimer le commentaire d'un enfant.** — Le backend (0146) ouvre le DELETE sur `post_comments` pour `can_write_household AND is_managed_child(author_id)`, mais `app/src/modules/cercle/hooks/use-cercle.ts:426` (`canDeleteComment = comment.authorId === currentMemberId`) n'a reçu aucune branche adulte — seule `canDelete` (posts, ligne 406) a été étendue. Or D-12/ENF-02 déclarent « **post, commentaire, réaction** ». Impact utilisateur direct : un commentaire laissé par un enfant (ou hérité d'un ancien compte converti) est **immodérable depuis l'UI** alors que la base le permet. Fix : même branchement que `canDelete` — `if (isAdult && members.find(m => m.id === comment.authorId)?.role === 'enfant') return true;` — plus un ConfirmDialog pour la suppression de commentaire (aujourd'hui `deleteComment` part sans confirmation).
2. **Le ConfirmDialog de suppression de fiche contredit la copie déclarée D-04** (`members-panel.tsx:686-688`) — Titre correct (« Supprimer la fiche de {prénom} ? ») mais corps réel « La fiche et son historique restent conservés dans le foyer ; rien ne s'affiche plus pour elle » dit l'inverse du corps validé « La fiche **disparaît** des listes et des sélecteurs. Les tâches passées et les complétions **restent** dans l'historique, attribuées à {prénom}. » Le libellé actuel est ambigu sur le sort de la fiche elle-même. Fix : reprendre la copie du UI-SPEC § Copywriting verbatim.
3. **Fiche enfant tronquée à l'édition** — L'édition (`members-panel.tsx:493-536`) ne propose ni la **couleur** (passée figée : `colorTag: editingChild.color_tag` ligne 504) ni les **restrictions**, et la **photo** est absente (report documenté dans 25-05, pas un stub silencieux — mais le champ couleur, lui, était déclaré éditable par D-05 « fiche enrichie : nom, couleur, naissance, restrictions, photo »). Fix : ajouter le Select couleur au dialogue d'édition (même gabarit que la création, lignes 457-467).

---

## Detailed Findings

### Pillar 1: Copywriting (2/4)

Comparaison ligne à ligne du § Copywriting Contract du UI-SPEC (copie déclarée verbatim) contre les chaînes réelles :

| Élément déclaré | Réel | Écart |
|---|---|---|
| CTA création « **Ajouter un enfant** » | `members-panel.tsx:280` « Ajouter un enfant » | ✅ conforme |
| CTA liaison « **Donner accès** » | bouton de ligne `members-panel.tsx:204` « **Accès** » (aria-label correct); seul le titre du dialog porte la copie déclarée | ⚠️ libellé raccourci |
| Empty state body « Les enfants du foyer apparaissent dans les listes sans avoir besoin de compte. Créez une fiche pour chacun. » | `members-panel.tsx:268` « Créez une fiche : un adulte du foyer agira pour l'enfant dans les espaces que vous choisirez. » | ⚠️ autre copie |
| Groupe restrictions « **Espaces où il peut figurer** » + case désactivée « Il ne peut pas encore figurer dans cet espace… » | `members-panel.tsx:574` « Ce que {prénom} **voit** dans l'application » ; aucun état désactivé (les 5 cases sont toujours actives, voir Pillar 6) | ⚠️ autre libellé + état manquant |
| Confirm suppression : corps « La fiche disparaît des listes… attribuées à {prénom}. » | `members-panel.tsx:687` « La fiche et son historique restent conservés dans le foyer ; rien ne s'affiche plus pour elle. » | ❌ contredit la levée D-04 déclarée |
| Confirm modération : « Supprimer **ce contenu de {prénom}** ? » | `cercle-page.tsx:168` « Supprimer **cette publication ?** » — l'enfant n'est pas nommé, description DHA | ⚠️ |
| Notice géré : « {prénom} n'a pas de compte : un adulte agit **pour lui, ici et dans les listes**. » | `use-child-profiles.ts:26` « {prénom} n'a pas de compte : un adulte agit **pour elle**. » (accord masculin manquant + clause absente) | ⚠️ (« pour elle » se rapporte à « la fiche », jamais explicite) |
| Toast création « **La fiche de {prénom}** est créée. » | `members-panel.tsx:443` « Fiche enfant créée : un adulte agira pour elle. » (sans prénom) | ⚠️ |
| Toast suppression « La fiche de {prénom} est supprimée. Ses traces restent… » | `members-panel.tsx:694` « Fiche supprimée : son historique est conservé. » | ⚠️ |
| Toast liaison « {prénom} a désormais son propre accès… » | `members-panel.tsx:670` « Fiche reliée au compte : toute la trace suit le compte. » | ⚠️ |
| Error fallback « Enregistrement impossible. Réessayez. » | fallbacks réels « Création impossible. » / « Mise à jour impossible. » / « Liaison impossible. » — l'erreur serveur (française) est bien reprise en priorité ✅ | ⚠️ mineur |
| Mots interdits (« profil géré », « acteur », `actor_member_id`) | aucun en libellé UI (occurrences « acteur » seulement en **commentaires de code** `routine-card.tsx:14,84`) ; toast d'erreur du picker « Ce membre n'est pas servi par les routines du foyer » reste lisible ✅ | ✅ |

Ton : le contrat annonce « tutoiement » ; le code utilise le vouvoiement (« Créez », « Utilisez ») **en continuité avec le ton existant** de l'app (EmptyState Cercle préexistant « Soyez la première personne… ») — écart avec le texte du contrat mais cohérence produit conservée.
Pillier 1 est à 2 car une majorité des chaînes critiques (confirm destructeur, toasts de statut, notice, groupe fiche, CTA liaison) divergent d'une copie pourtant validée note par note — y compris une formulation dont la sémantique (sort de la fiche) n'est plus claire.

### Pillar 2: Visuals (3/4)

- Hiérarchie de ligne conforme : avatar `md` → nom tronqué `text-[13px]` (A5 ok, `members-panel.tsx:145`) → sous-ligne couleur·rôle·âge `text-[11px]` (:149-161, gabarit déclaré) → badge ambre `tone` correct (:163, seul marqueur enfant, pas d'icône ajoutée — conforme au § Color).
- actions destructrices en `ghost` + `hover:bg-coral-soft hover:text-coral-text` (:206-215, :247-257) — exactement le gabarit déclaré.
- Boutons tous libellés + `aria-label` descriptifs (pas de bouton icône seul) ✅ ; zones tactiles ≥ 44px via `size="sm"` + `min-h-11` sur le trigger « Cocher pour » (`routine-card.tsx:93`) et les items du menu (:108).
- ⚠️ Ligne enfant = 4 boutons d'égale importance (Modifier / Espaces / Accès / Supprimer) + badge + avatar ; sur 375px la ligne passe à deux rangées (flex-wrap). Pas bloquant mais la densité des 4 `secondary` identiques aplatit la hiérarchie — la rare action (Supprimer) devrait se démarquer davantage (déjà ghost, ok) tandis que « Espaces » / « Accès » pourraient être regroupés.
- ⚠️ Exception Design System : les cases des restrictions utilisent un `<input type="checkbox" className="size-4 accent-[var(--color-accent)]">` brut (`members-panel.tsx:579-590`) alors que le contrat déclare le primitif `Checkbox` de `ui/primitives` — styles focus-visible et état coché divergent du reste de l'app.
- ⚠️ CTA création : icône `plus` au lieu de l'icône `people` déclarée (`members-panel.tsx:279`).

### Pillar 3: Color (4/4)

Vérifié sur toute la surface de phase : **aucune couleur hex/rgb/oklch codée en dur** dans les fichiers modifiés du panneau, des pickers, de la carte routine et du Cercle (grep vide) ; `roleToneClass.enfant` préexistant utilise `oklch` en littéral mais n'appartient pas au diff de la phase.

- Ambre = **seul** marqueur enfant : badge `tone="amber"` (:163) et puce couleur sur `color_tag` — ⚠️vérifié positif, aucune dérive vers l'accent.
- Accent réservé : état coché des pickers (`has-[:checked]:border-accent has-[:checked]:bg-accent-faint`, `task-form-dialog.tsx:181`), highlight du menu (`data-[highlighted]:bg-accent-faint`, `routine-card.tsx:108`), carte cochée (`border-accent/25 bg-accent-faint`, :55). Aucun usage accent sur un élément déclaratif d'enfant.
- Coral : réservé aux deux chemins destructifs (hover) ✅.
- Distribution 60/30/10 respectée par héritage des surfaces `bg`/`surface`/`panel-surface` existantes — aucun aplat nouveau.

### Pillar 4: Typography (3/4)

Distribution réelle (fichiers de phase) : `text-[11px]` ×10, `text-[12px]` ×7, `text-[13px]` ×3, `text-[16px]` ×1, **`text-[13.5px]` ×1** (`routine-card.tsx:108`) ; poids `font-extrabold` (800) ×8, `font-normal` ×2, **`font-semibold` (600) ×4** — dont le nouveau trigger « Cocher pour » (`routine-card.tsx:93`, présent à l'écran, contrairement aux usages `font-semibold`/`font-[700]` préexistants du routines-page).

- La hiérarchie 11/12/13px du gabarit members-panel est tenue, l'âge est en `text-[11px] text-muted` comme déclaré ✅.
- ⚠️ Deux valeurs hors charte introduites par la phase : `text-[13.5px]` (taille absente de la table Tailwind du contrat : 13 ou 15.5) et `font-semibold` (le contrat borne les poids à 400 et 800). Fix : `text-[13px]` et `font-extrabold` (ou retrait du poids).

### Pillar 5: Spacing (3/4)

Répartition dominante : `gap-3.5` (14px, gabarit Dialog existant), `gap-1.5`/`p-3`/`mt-3`/`py-3` (grille 4/12 ✓), `mt-4`/`py-6` (16/24 ✓), `mb-0 mt-3` = motif « 2xl : notices mt-4 mb-0 » repris (:273, :285) ✅.

- ⚠️ `gap-2.5` (10px) utilisé 3× hors échelle déclarée (4/8/12/16/24) : libellés de cases restrictions (`members-panel.tsx:578`), rangée carte (`routine-card.tsx:59`), items du menu (:108).
- ⚠️ valeur arbitraire nouvelle `min-w-[210px]` / `max-w-[210px]` (menu « Cocher pour », `routine-card.tsx:102,112`) — l'échelle déclare des largeurs de gabarits existants uniquement.
- `rounded-[14px]` avatars/notices/menus et `rounded-[20px] p-[18px]` carte : gabarits existants (convention app), tolérés par la section Exceptions.
- Aucune marge et aucun gap incohérent **entre** les quatre blocs successifs du panneau : le rhythm py-3 / border-t est uniforme ✅.

### Pillar 6: Experience Design (2/4)

**Covered (conforme au contrat) :**
- Chargement : tous les Dialogs désactivent le submit et affichent « Enregistrement… »/« Création… » (:354-355, :472-473, :531-532, :599-600) ✅ ; erreurs de réseau converties en messages français.
- Erreurs : `Field error` inline pour fiche/renommage/rôle ; `toast(…, 'error')` pour modules/liaison/archivage et le picker « Cocher pour » (`routines-page.tsx:213-218`) avec l'erreur serveur reprise si lisible ✅ (garde 42501/D-13 remonte bien, prouvé par `occurrence-rpc.test.ts`).
- Vides : EmptyState « Aucun profil enfant » + CTA pour les adultes (:264-271) ✅ ; Cercle adapte son vide quand `canPublish` est faux (`cercle-page.tsx:67-73`) ✅.
- Destructif : ConfirmDialog sur suppression de fiche (D-04 archivage) et sur la **fusion irréversible** D-19 (double étape : choix du compte → confirmation « Irréversible », :654-677) ✅ — conformes à la guideline §6 « jamais de suppression en un seul tap ».
- Garde D-06 en un point unique (`member-eligibility.ts` : pur, double filet `deleted_at`, importée par les 4 pickers + page + hook — vérifié 7 imports, aucune duplication) ✅ ; enfant hors-module **absent** des options, pas grisée (UI-SPEC) ✅.

**BLOCKER — modération D-12 : commentaire de child immodérable.** `use-cercle.ts:426` `canDeleteComment = (comment) => comment.authorId === currentMemberId` — la branche adulte sur contenu d'enfant n'existe que pour les **posts** (:406-413). Le serveur l'autorise (0146, 3e branche DELETE sur `post_comments`), l'UI non : la tâche déclarée par D-12/ENF-02 (« post, commentaire, réaction ») n'est pas achevable pour les commentaires. De plus `deleteComment` s'exécute **sans confirmation** (cercle-page.tsx:86,160) contrairement au pattern destructif du module.

**Autres défauts :**
- **Option morte « Enfant »** dans le Rôle (`members-panel.tsx:396-400`) : le Select liste tous les `roleLabels` y compris « Enfant » — toujours refusé 22023 par 0145 pour un membre avec compte. Le message serveur est lisible, mais l'option ne devrait jamais être proposée (toche morte permanente). Fix : filtrer `'enfant'` du Select (ou le désactiver avec la copie déclarée du groupe restrictions).
- **État désactivé du groupe restrictions non implémenté** : le UI-SPEC déclare une case désactivée avec message « Il ne peut pas encore figurer dans cet espace… » ; les 5 cases sont toujours actives. Si le module est désactivé au niveau du foyer (`disabled_modules` 0140), la case enfant reste activable sans feedback (le risque est borné : la page du module est inaccessible).
- **Couleur non éditable** à l'édition de fiche (voir Top 3 #3).
- **Photo** :Skeleton/`avatar_url` déclarés par le UI-SPEC non rendus — report documenté (chaîne chemin→URL signée par membre) dans 25-05-SUMMARY, RPC `p_avatar_url` déjà câblé ; pas un stub silencieux, mais un écart contrat/implémentation à rouvrir.
- Fixture e2e `child-profiles.spec.ts` présente et exécutée (4/4 chromium+mobile) ✅.

---

## Registry Safety

Audit registre sauté : `components.json` absent — shadcn non initialisé (UI-SPEC frontmatter `shadcn_initialized: false`, bibliothèque first-party locale), **aucun bloc tiers** déclaré par le UI-SPEC. Rien à vérifier.

---

## Files Audited

- `app/src/modules/parametres/components/members-panel.tsx` (702 lignes, CRUD enfant, 5 dialogs + 2 ConfirmDialog)
- `app/src/modules/parametres/api.ts` (lignes 130-389 : RPC wrappers 0146/0148, CHILD_MANAGEABLE_MODULES)
- `app/src/modules/parametres/hooks/use-child-profiles.ts` (âge D-05, notice, invalidations store)
- `app/src/modules/parametres/types.ts` (roleLabels/roleOrder/roleToneClass)
- `app/src/stores/household-store.ts` (useIsAdult, filtre `vivantes` unique)
- `app/src/lib/member-eligibility.ts` (garde D-06 pure)
- `app/src/modules/routines/components/routine-card.tsx` (menu « Cocher pour »)
- `app/src/modules/routines/hooks/use-routines.ts` (`toggleFor`, self-délégation)
- `app/src/modules/routines/api.ts` (`markOccurrenceDone` → RPC 0146)
- `app/src/modules/routines/routines-page.tsx` (`toggleTargets`, report d'erreur)
- `app/src/modules/taches/components/task-form-dialog.tsx`, `modules/routines/components/routine-form-dialog.tsx`, `modules/menu/components/meal-dialog.tsx`, `modules/ardoise/components/ardoise-members-dialog.tsx` (4 pickers branchés)
- `app/src/modules/cercle/hooks/use-cercle.ts`, `modules/cercle/cercle-page.tsx` (modération, composer masqué)
- Diffs de phase : `git diff 7f6587c..ea30c96` (25-05) et `598d5be..01855d4` (25-07)
