---
phase: 38-filet-de-tests-fiable
reviewed: 2026-11-08T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - app/src/lib/datetime.ts
  - app/src/lib/datetime.test.ts
  - app/src/modules/ardoise/api.ts
  - supabase/functions/ardoise-invite/index.ts
  - app/src/lib/data/seed.ts
  - app/src/modules/menu/types.ts
  - app/src/lib/data/seed.test.ts
  - app/src/stores/household-store.test.ts
findings:
  critical: 0
  warning: 0
  info: 4
  total: 4
status: issues_found
---

# Phase 38: Code Review Report

**Reviewed:** 2026-11-08
**Depth:** standard
**Files Reviewed:** 8 (diff base `cd3fdf1` → HEAD `3642e04`)
**Status:** issues_found (informations only — aucun blocant ni avertissement)

## Summary

Revue adversariale des sources production de la phase 38, focalisée sur les six axes demandés. Verdict global : les deux corrections à risque (bornage IN-02 de l'Edge Function `service_role` et suppression de la garde morte IN-01) sont **correctes et sûres** ; les helpers datetime sont purs UTC et correctement lundi-based ; les semis et les tests respectent les décisions verrouillées S-01..I-03. Aucun Critical, aucun Warning.

Détail des axes :

1. **IN-02 (security, T-38-01)** — vérifié ligne par ligne. La lecture `expenses` reste bornée `eq('ardoise_id', ardoiseId)` (l.657-661) ; `expense_participants` est désormais bornée côté requête par `.in('expense_id', expenseIds)` (l.665-667) — plus aucune lecture de la table entière sous `service_role` ; `household_members` est bornée `eq('household_id', householdId)` dérivé de la ligne `ardoises` lue plus haut (l.634-645). Cas vide vérifié : `expenses: []` → `.in()` produit `expense_id=in.()` (postgrest-js 2.x, `dist/index.mjs` l.1712-1718), que PostgREST traite comme un ensemble vide **sans erreur** — la vue invité d'une ardoise sans dépense ne casse pas. Balayage I-01 de la fonction : toutes les autres lectures `admin.from(...)` (l.330, 344, 373, 474, 480, 528, 536, 550, 560, 575, 634, 798) sont déjà bornées (`eq` + `limit`/`maybeSingle`). La sémantique invité est préservée : le filtrage JS résiduel `expenseIdSet.has` (l.707) devient redondant mais reste une défense en profondeur ; les noms de membres/enfants viennent du même ensemble borné au foyer de l'ardoise, aucun participant ne peut manquer. Ordres déterministes (I-02) présents sur `expenses` (l.659-660) et `household_members` (l.673).
2. **IN-01** — `response` est un `Response` de `fetch` natif (l.297) : `status` est toujours un `number`, la garde `typeof … === 'number' ? … : 0` était bien morte. Aucune changement de comportement dans le chemin d'erreur, aucun code mort résiduel. (La garde analogue l.712 porte sur `response?.status` d'un résultat `functions.invoke` optionnel — elle, n'est PAS morte, correctement laissée en place.)
3. **datetime** — `debutSemaineIso`/`jourSemaine` : arithmétique UTC pure (`Date.UTC`, `getUTCDate`/`setUTCDate`), lundi = `(getUTCDay()+6)%7` correct, aucun `new Date()` horloge-réactif. La délégation `weekStartOf` (menu/types.ts l.74) est une substitution exacte de la logique précédente (même formule, mêmes primitives) — comportement menu préservé à l'octet près.
4. **Seed** — `demoMealEntries` ancré `jourSemaine(debutSemaineIso(todayIso()), 0..2)` : recalé chaque jour sur la semaine courante, foyer vivant conservé. Les autres usages `day(n)` (frigo, événements, tâches, dépenses) portent un commentaire en français nommant pourquoi ils restent relatifs au jour (l.70-72) — conforme S-01 et §2.7 (raison nommée, pas silence).
5. **Tests** — `vi.waitFor(..., { timeout: 5_000, interval: 50 })` remplace le sommeil fixe ; plus aucun `setTimeout` d'attente dans le fichier. Le test paramétrique 7 dates **injecte** les ISO en entrée (`debutSemaineIso(iso)`), zéro `setSystemTime`/`useFakeTimers`. `seed.test.ts` contient son cas qui doit échouer (§2.7 B) et son garde « contrôle qui ne regarde rien » (§2.7 F). Les espions délèguent désormais de façon synchrone via `realQP` capturé dans la factory du mock — fidèle à la synchronie de production documentée dans RETROSPECTIVE §12.
6. **I-03** — `git diff cd3fdf1..HEAD -- supabase/migrations` est vide : aucune migration SQL introduite. Aucune directive de linter ni `@ts-ignore` dans les fichiers revus.

## Critical Issues

0 — aucun.

## Warnings

0 — aucun.

## Info

### IN-01: Paramètre `debutSemaineIso` masque la fonction exportée du même nom

**File:** `app/src/lib/datetime.ts:80` (signature `jourSemaine`)
**Issue:** Le premier paramètre de `jourSemaine(debutSemaineIso: string, index: number)` porte le nom exact de la fonction exportée sœur du même module. Dans le corps, toute référence à `debutSemaineIso` désigne la chaîne, pas la fonction — piégeux si quelqu'un ajoute un appel dans ce corps, et bruit de lecture. `datetime.test.ts:135` illustre l'ambiguïté (`debutSemaineIso(jourSemaine(debut, 6))` reste correct ici, mais uniquement parce que les appels sont hors du module).
**Fix:** Renommer le paramètre `lundiIso` (ou `semaineDebutIso`) ; ajuster les 2 appels (`seed.ts`, `datetime.test.ts`).

### IN-02: Dégradation silencieuse si `household_id` de l'ardoise était absent

**File:** `supabase/functions/ardoise-invite/index.ts:672`
**Issue:** Si `householdId` valait `null` (colonne inattendue, cf. commentaire l.646-650 qui prévoit ce cas pour la couverture), `.eq('household_id', null)` ne rendrait que les lignes `household_id IS NULL` — donc aucun membre — et la vue invité rendrait « Membre » pour chaque participant au lieu de leur nom. En pratique `ardoises.household_id` est toujours renseignée (lecture `.single()` l.634-638 qui aurait déjà 404 sur ligne absente), donc le chemin est théorique — mais la sémantique du `null` diffère de l'« échec fermé » documenté pour la couverture, sans être nommée.
**Fix:** Optionnel — ajouter un garde explicite `if (!householdId) return …vide…` avant le `Promise.all`, ou un commentaire nommant le comportement du `eq(null)`, pour aligner cette lecture sur la discipline d'échec fermé du bloc couverture.

### IN-03: Fenêtre microscopique minuit entre l'initialisation du semis et l'assertion

**File:** `app/src/lib/data/seed.test.ts:29-38`
**Issue:** `demoMealEntries` est évaluée à l'import du module (dates ancrées via `todayIso()` à ce moment) tandis que l'assertion appelle `todayIso()` pendant le test. Si le run franchit exactement minuit local entre les deux (une milliseconde par semaine, dimanche 23:59:59.999), `debutSemaineIso` diffère et le test flirte. Probabilité négligeable, mais la classe « semis vs assertion à deux instants » est celle que la phase corrige.
**Fix:** Optionnel — lire l'ancre une seule fois (`const ancre = todayIso()`) et comparer `debutSemaineIso(entry.entry_date)` à une fixture recalculée depuis la même valeur capturée, ou mocker `todayIso` dans ce test.

### IN-04: Primitives `toUtcDate`/`isoOfUtc` désormais dupliquées entre `datetime.ts` et `menu/types.ts`

**File:** `app/src/modules/menu/types.ts:60-65` (miroir `app/src/lib/datetime.ts:55-58`)
**Issue:** La phase a délégué `weekStartOf` au module partagé (§2.7 E respecté pour l'arithmétique semaine), mais les deux primitives de base restent copiées dans `menu/types.ts` (encore utilisées par `weekDatesOf`, `formatDayLabel`…). Une troisième copie vivrait dans `datetime.ts`. Ce n'est pas une récidive introduite par la phase (les copies préexistaient), mais la consolidation restée ouverte est désormais visible aux deux endroits.
**Fix:** Phase future — exporter `toUtcDate`/`isoOfUtc` depuis `lib/datetime.ts` et supprimer les copies locales de `menu/types.ts`.

---

_Structural Findings (fallow) : aucun bloc fourni — N/A._

_Reviewed: 2026-11-08T00:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
