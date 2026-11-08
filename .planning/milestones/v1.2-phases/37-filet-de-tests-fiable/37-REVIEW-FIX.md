---
phase: 37-filet-de-tests-fiable
reviewed: 2026-11-08T09:25:00Z
depth: quick
files_reviewed: 4
files_reviewed_list:
  - app/src/modules/ardoise/api.ts
  - app/src/modules/ardoise/guest-ardoise-page.tsx
  - app/src/modules/ardoise/guest-ardoise-page.test.tsx
  - supabase/functions/ardoise-invite/index.ts
findings:
  critical: 0
  warning: 0
  info: 2
  total: 2
status: issues_found
---

# Phase 37 — Re-review du delta de correctifs (commit b2ec826)

**Reviewed:** 2026-11-08T09:25:00Z
**Depth:** quick (re-review du delta uniquement)
**Files Reviewed:** 4
**Status:** issues_found (2 info — aucun bloqueur, les 5 correctifs sont validés)

## Summary

Re-review adversariale du commit `b2ec826` uniquement (correctifs WR-01..05). Les cinq avertissements du review initial sont effectivement résolus, chacun prouvé par un test dédié. Les tests du fichier passent (11/11 verts, exécutés lors de cette re-review). Aucun nouveau défaut bloquant ni avertissement introduit. Deux observations de niveau info seulement.

### Vérification des 5 correctifs

- **WR-02 (statut porté)** : `InviteRequestError` porte `status` (`api.ts:316-323`) ; `callArdoiseInvite` le lève avec le statut HTTP (`api.ts:313-317`). Conforme à la forme de `SettlementRequestError`, nom distinct justifié en commentaire.
- **WR-01 (aide 403)** : le state `joinIs403` est posé sur `status === 403` (`guest-ardoise-page.tsx:137`), plus aucun test sur la copie du message (`/foyer/i.test(joinError)` retiré, ligne 236). Le message serveur reste affiché tel quel ; l'aide ne peut plus disparaître par reformulation côté Edge. Test « rejet 500 : aide absente » (test.tsx:276) prouve la négative.
- **WR-03 (garde config + 5xx)** : `codeDepuisUrl` exige `isSupabaseConfigured` (`guest-ardoise-page.tsx:44-45`) ; `messageEchecLien` distingue 4xx (« ne passe plus ») de tout le reste (message générique « Impossible de charger », lignes 113-122). Test 5xx dédié (test.tsx:168-186) affirme les deux côtés (présence du générique, absence du verdict).
- **WR-04 (enfants exclus côté serveur)** : `buildGuestView` sélectionne `role` (`index.ts:657`), construit `enfantIds` (index.ts:668-674), puis filtre : participations (index.ts:688-689), payeur → générique « Membre » (index.ts:715-717), lignes `balances` et `settlements` du settlement public (index.ts:736-750). Vérification des chemins de fuite résiduels : la couverture est signée serveur via `guest-media.ts` (bornage household, jamais de donnée membre) ; `expense_participants` filtré avant `partsByExpense` ; aucun champ `paid_by` brut ne traverse (payload ne contient que `paidByName`) ; les noms des lignes settlement non filtrées proviennent du RPC pour des participants non-enfants. La contrepartie « sous-compte si un enfant participe » est documentée dans le commentaire (index.ts:659-666) et cohérente avec le modèle (l'UI interne ne propose pas d'enfant comme participant).
- **WR-05 (activeCode suit l'URL + reset)** : effet `setActiveCode(codeDepuisUrl)` sur `[codeDepuisUrl]` (guest-ardoise-page.tsx:52-55) et reset de `joinState/joinMessage/joinError/joinIs403` sur `[activeCode]` (guest-ardoise-page.tsx:92-97). Traçage des conflits : l'effet ne court que sur `codeDepuisUrl` — une saisie formulaire avec l'URL sans code (`codeDepuisUrl` null) n'écrase pas le code actif ; l'effet de reset au montage remet des valeurs déjà initiales, sans boucle (deps stables, `setActiveCode` à valeur identique ne re-déclenche rien). Test « changement de code » (test.tsx:298) prouve navigation A→B dans le même montage avec résidu de succès effacé.

### Chaîne de vérification exécutée

- `npx vitest run src/modules/ardoise/guest-ardoise-page.test.tsx` → 11/11 verts.

## Info

### IN-01: Garde mort sur `response.status`

**File:** `app/src/modules/ardoise/api.ts:315`
**Issue:** `typeof response.status === 'number'` est toujours vrai (`Response.status` est typé `number`) — le ternaire est du code mort.
**Fix:** `throw new InviteRequestError(response.status, …)` directement.

### IN-02: Lecture service-role de `household_members` sans filtre foyer (préexistant, hors delta)

**File:** `supabase/functions/ardoise-invite/index.ts:656`
**Issue:** `admin.from('household_members').select('id,display_name,role')` n'est pas borné au foyer de l'ardoise (tout comme `expense_participants` ligne 658, déjà ainsi avant le correctif). Aucune fuite en pratique : les ids sont des UUID globaux et seuls les participants de l'ardoise sont résolus, mais c'est une lecture de table entière par requête publique — contraire à l'esprit de minimisation (AGENTS.md §2.6). Préexistant au commit : non introduit par le delta.
**Fix:** ajouter `.eq('household_id', householdId)` (et pour `expense_participants`, filtrer par les `expense_id` de l'ardoise ou dénormaliser), dans un chantier séparé.

## Conventions projet

- Aucune directive de linter introduite ; les commentaires citent la raison en français avec référence au review d'origine (`WR-0X (37-REVIEW)`) — conforme à AGENTS.md §2.7.
- Migrations non touchées ; aucun SQL modifié.

---

_Reviewed: 2026-11-08T09:25:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: quick_
