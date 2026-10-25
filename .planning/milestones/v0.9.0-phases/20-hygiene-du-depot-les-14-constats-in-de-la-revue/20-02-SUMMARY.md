---
phase: 20-hygiene-du-depot-les-14-constats-in-de-la-revue
plan: 02
subsystem: infra
tags: [gitignore, typescript, hygiene, mojibake, comments]

# Dependency graph
requires: []
provides:
  - "`.gitignore` : trois familles d'artefacts locaux ignorées par famille (`.claude/worktrees/`, `.gsd/`, `app/shot-toggle-on.mjs`)"
  - "`app/src/types/database.ts` : une déclaration unique par type (NoteAttachmentRow, PetAttachmentRow)"
  - "`app/src/modules/parametres/lib/push.ts` : commentaires réparés, français rétabli, classe balayée et comptée"
affects: []

# Actuals (#2632) — pairs with the plan's estimate (38000 tokens) to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 482
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Famille ignorée par famille dans `.gitignore` (un répertoire, pas les fichiers un par un) — le prochain identifiant de worker est couvert"
    - "Corriger la classe (§2.7 E) : un balayage compté, pas un garde permanent par plage de caractères (D-15)"

key-files:
  created: []
  modified:
    - ".gitignore"
    - "app/src/types/database.ts"
    - "app/src/modules/parametres/lib/push.ts"

key-decisions:
  - "D-02 : les trois familles sont ignorées par famille, et `app/shot-toggle-on.mjs` n'est PAS supprimé — c'est du travail de l'auteur, mis hors du champ de `git add -A`"
  - "D-03 : les deux corps de chaque paire de types sont identiques — conserver la première déclaration, retirer la seconde (aucun champ perdu, donc pas d'union à composer)"
  - "D-15 : pas de garde permanent par plage de caractères — la preuve est le balayage compté sur `app/src`, `supabase/` et `scripts/`"

requirements-completed: [IN-02, IN-03, IN-15]

# Coverage metadata (#1602) — deterministic UAT routing in verify-work.
coverage:
  - id: D1
    description: "`.gitignore` ignore trois familles d'artefacts locaux par famille ; `git status` ne les montre plus et le script de debug reste sur le disque"
    requirement: "IN-02"
    verification:
      - kind: automated_ui
        ref: "git status --porcelain --untracked-files=all | grep -E 'shot-toggle-on|^. .\\.gsd/|^. .\\.claude/worktrees/' | wc -l == 0"
        status: pass
      - kind: automated_ui
        ref: "git check-ignore -v app/shot-toggle-on.mjs .gsd/dispatch-isolation-sentinel.json (nomme .gitignore)"
        status: pass
      - kind: automated_ui
        ref: "test -f app/shot-toggle-on.mjs → present"
        status: pass
    human_judgment: false
  - id: D2
    description: "`database.ts` ne déclare plus qu'une fois `NoteAttachmentRow` et une fois `PetAttachmentRow`"
    requirement: "IN-03"
    verification:
      - kind: unit
        ref: "grep -c '^export interface NoteAttachmentRow' src/types/database.ts == 1 ; idem PetAttachmentRow"
        status: pass
      - kind: unit
        ref: "cd app && npm run typecheck (tsc --noEmit)"
        status: pass
      - kind: unit
        ref: "cd app && npm test (139 fichiers, 1173 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "`push.ts` ne porte plus de texte corrompu ; la classe est balayée et comptée à 0 sur les trois racines, sans garde de caractères ajouté"
    requirement: "IN-15"
    verification:
      - kind: automated_ui
        ref: "grep -rnP non-latin scripts (CJK/kana/hangul/cyrillique/arabe/hébreu) sur src ../supabase ../scripts | wc -l == 0"
        status: pass
      - kind: automated_ui
        ref: "grep -rnP 'Ã[\\x80-\\xBF]|â€|Â[\\x80-\\xBF]' sur src ../supabase ../scripts | wc -l == 0"
        status: pass
      - kind: unit
        ref: "cd app && npx vitest run src/modules/parametres (5 fichiers, 47 tests)"
        status: pass
    human_judgment: false

# Metrics
duration: 18min
completed: 2026-10-16
status: complete

# Measured plan commit range (#3968)
plan_head_before: ee77b4c4a3fd812e2fbb7e67a52fe49880e8d39d
plan_head_after: 47a3402d3aec7c49cad12c55850d8360f8e2d5e6
commits: 3
---

# Phase 20 Plan 02: Hygiène du dépôt (IN-02, IN-03, IN-15) Summary

**Trois constats d'hygiène fermés sans toucher au SQL ni à l'exécution : `.gitignore` met hors du dépôt l'outillage local et le script ad hoc (par famille), `database.ts` ramène chaque type dupliqué à une déclaration unique, et `push.ts` échange un fragment CJK et un verbe anglais contre du français lisible — la classe balayée et comptée à 0.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-10-16T08:38Z (approx.)
- **Completed:** 2026-10-16T06:55:54Z
- **Tasks:** 3/3
- **Files modified:** 3

## Accomplishments

- **IN-02 / D-02** — `.gitignore` ignore les trois familles d'artefacts locaux **par famille**, chacune sous son titre avec la raison de l'omission : `.claude/worktrees/` (le répertoire entier, pas les trois fichiers), `.gsd/`, et `app/shot-toggle-on.mjs`. Le script de debug n'a **pas** été supprimé (`test -f` = present) : c'est du travail de l'auteur, on ne décide pas à sa place.
- **IN-03 / D-03** — `app/src/types/database.ts` ne déclare plus qu'une fois `NoteAttachmentRow` et une fois `PetAttachmentRow`. Les deux corps de chaque paire ont été comparés avant retrait et sont identiques ; aucun champ n'est renommé, déplacé ni supprimé.
- **IN-15 / D-15** — `push.ts:27` (fragment CJK dans une phrase française) et `push.ts:155` (verbe anglais « distinguishes ») réparés ; le balayage de la **classe** sur `app/src`, `supabase/` et `scripts/` compte `0` pour les deux familles de texte corrompu, et aucun garde permanent par plage de caractères n'a été ajouté.

## Task Commits

Each task was committed atomically (directly on `main`, `branching_strategy: none`) :

1. **Task 1 : mettre hors du dépôt l'outillage local et le script ad hoc (D-02)** — `7437f51` (chore)
2. **Task 2 : un type, une déclaration (D-03)** — `bffa442` (refactor)
3. **Task 3 : réparer les commentaires corrompus de `push.ts` et balayer la classe (D-15)** — `47a3402` (fix)

**Plan metadata:** non commité (`commit_docs: false`, `.planning/` gitignoré).

## Files Created/Modified

- `.gitignore` — trois sections ajoutées (artefacts de workers, état local de l'outillage, script de debug ad hoc), chacune avec la raison de l'omission ; aucune section existante réordonnée ni reformatée. Insertion **avant** la section « Planning local » (pas en vrac en fin de fichier).
- `app/src/types/database.ts` — deux seconds corps identiques retirés (`NoteAttachmentRow` :249-258, `PetAttachmentRow` :612-621) ; 22 lignes supprimées.
- `app/src/modules/parametres/lib/push.ts` — `:27` « `localStorage` ne faisait que doublonner l'état du serveur » ; `:155` « et distingue » au lieu de « et distinguishes ».

## Preuves mesurées

### `git status --porcelain --untracked-files=all`

**Avant** (les cinq entrées non suivies et non ignorées) :
```
?? .claude/worktrees/agent-p01-1791218649.executor-prompt.md
?? .claude/worktrees/agent-p01-1791218649.worker.json
?? .claude/worktrees/agent-p01-1791218649.worker.log
?? .gsd/dispatch-isolation-sentinel.json
?? app/shot-toggle-on.mjs
```

**Après** (au moment de la tâche 1) : seule ` M .gitignore` subsiste ; **après les trois commits** : sortie vide.

- `git status ... | grep -E "shot-toggle-on|\.gsd/|\.claude/worktrees/" | wc -l` → **0**
- `test -f app/shot-toggle-on.mjs` → **present**
- `git check-ignore -v` →
  - `.gitignore:62:.claude/worktrees/` → `.claude/worktrees/agent-x.worker.json`
  - `.gitignore:66:.gsd/` → `.gsd/dispatch-isolation-sentinel.json`
  - `.gitignore:71:app/shot-toggle-on.mjs` → `app/shot-toggle-on.mjs`

Aucune entrée non suivie et non ignorée n'est apparue au passage (rien à signaler hors périmètre).

### Décision sur chaque paire de types

| Paire | Emplacements | Corps | Décision |
|---|---|---|---|
| `NoteAttachmentRow` | `:238` / `:249` | **identiques** (id, note_id, household_id, file_url, file_name, mime_type, size_bytes, created_at) | conserver `:238`, retirer `:249` |
| `PetAttachmentRow` | `:601` / `:612` | **identiques** (id, pet_id, household_id, file_url, file_name, mime_type, size_bytes, created_at) | conserver `:601`, retirer `:612` |

Aucun corps ne divergeait, donc **pas d'union à composer** (la règle D-03 ne s'applique qu'en cas de divergence). `grep -c` = `1` pour chaque type ; `tsc --noEmit` vert ; `npm test` vert.

### Balayage de classe — résultat **compté**

| Famille | Avant | Après |
|---|---|---|
| Écritures non latines (CJK, kana, hangul, cyrillique, arabe, hébreu) | 1 (`src/modules/parametres/lib/push.ts:27`) | **0** |
| Artefacts de double-encodage UTF-8 (`Ã[\x80-\xBF]`, `â€`, `Â[\x80-\xBF]`) | 0 | **0** |

Périmètre : `app/src`, `supabase/`, `scripts/`. **Aucune occurrence trouvée hors de `push.ts`.** Aucun garde permanent par plage de caractères ajouté (D-15 : il refuserait du contenu légitime — émoji, points de suspension typographiques, citations — et serait désappris avant de servir ; la preuve est le balayage compté, pas un verrou).

## Verification Results

| # | Commande | Résultat |
|---|---|---|
| 1 | `cd app && npm run typecheck && npm test && npm run build` | **vert** — `tsc --noEmit` OK ; 139 fichiers / 1173 tests ; build Vite OK (PWA v1.3.0, `dist/sw.js` généré) |
| 2 | `git status --porcelain --untracked-files=all` + `test -f app/shot-toggle-on.mjs` | **vert** — aucune des trois familles ; script **present** |
| 3 | `grep -c '^export interface NoteAttachmentRow\|PetAttachmentRow' src/types/database.ts` | **`1` et `1`** |
| 4 | balayage famille 1 sur `src ../supabase ../scripts` | **`0`** |
| 5 | `python3 scripts/check-sql-statique.py` | **vert** — 181 fonctions effectives, « aucun défaut » (aucun SQL touché) |
| 6 | `sh scripts/migrate.sh` | **« Toutes les migrations sont déjà appliquées. »** — rien de neuf appliqué |

## Deviations from Plan

**None** — plan exécuté exactement comme écrit.

- Aucune dépendance ajoutée, aucun SQL modifié, aucun comportement d'exécution changé.
- Aucun `git add` de chemin `.planning/` (gitignoré) ; trois commits atomiques, un par tâche.
- D-15 respectée : **aucun** garde permanent par plage de caractères.

## Issues Encountered

None.

## User Setup Required

None — aucune configuration de service externe.

## Next Phase Readiness

- Les trois constats IN-02, IN-03 et IN-15 sont fermés ; les autres constats `IN-*` de la phase 20 restent ouverts (plans 20-01 et suivants).
- `npm run test:e2e` (attendu 121 passés / 5 sautés, chaîne de la phase) n'est pas dans la `<verification>` de ce plan : les changements sont un commentaire, une déduplication de types et `.gitignore`, sans effet sur l'exécution — l'e2e reste à rejouer au niveau de la phase.
- Rien à signaler dans `WINDOWS.md` : aucun stub, aucun test sauté, aucune `<verify>` non exécutée, aucune déviation.

---
*Phase: 20-hygiene-du-depot-les-14-constats-in-de-la-revue*
*Completed: 2026-10-16*

## Self-Check: PASSED

- FOUND: `.gitignore`, `app/src/types/database.ts`, `app/src/modules/parametres/lib/push.ts`, `20-02-SUMMARY.md`
- FOUND: commits `7437f51`, `bffa442`, `47a3402`
