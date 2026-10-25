---
phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr
plan: 16
subsystem: ui
tags: [invitation, token, useSearchParams, react-router, react-hook-form, zod, prefill, parcours-foyer]

# Dependency graph
requires:
  - phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr
    provides: 19-14 — RequireAuth conserve `pathname + search`, donc `?token=…` arrive intact jusqu'à la page après connexion
provides:
  - "`/foyer/rejoindre?token=…` préremplit le champ : l'invité n'a plus à retaper 22 caractères"
  - "La saisie manuelle reste le repli (même schéma Zod, aucune soumission automatique)"
  - "Un test prouve les deux chemins — le premier rouge puis vert"
affects: [parcours d'invitation au foyer, modules/landing, modules/parametres (invitations-panel, émetteur du lien)]

actuals:
  tokens: 1161
  tasks: 1
  commits: 1
  plan_head_before: 15458ef570bc4c13da01605b16224f86d36c717f
  plan_head_after: 79e0fbd33d3c6fbbb7fbb7db259be8eb625ca6e1

tech-stack:
  added: []
  patterns:
    - "Un paramètre d'URL porteur d'un jeton est une valeur de champ, jamais une action : préremplir sans soumettre (un aperçu de lien ne consomme pas un token à usage compté)"
    - "Le chemin prérempli passe par le schéma de validation existant — pas de règle parallèle, donc pas de chemin plus permissif que la saisie manuelle"

key-files:
  created:
    - app/src/modules/landing/join-household-page.test.tsx
  modified:
    - app/src/modules/landing/join-household-page.tsx

key-decisions:
  - "`?token=` est une valeur initiale (`defaultValues`), jamais une soumission automatique : T-19-51 — le geste reste requis, et un lien prévisualisé par un client de messagerie ne consomme pas un token à usage compté"
  - "Même schéma Zod (`min(22)`) pour les deux chemins : T-19-53 — le préremplissage ne peut pas être plus permissif que la saisie manuelle ; un token trop court donne l'erreur existante, aucun état nouveau à gérer"
  - "Aucun journal, aucun affichage hors du champ : T-19-52 — le jeton est déjà dans l'URL par conception, il ne fuit nulle part ailleurs"

requirements-completed: []

coverage:
  - id: D1
    description: "Ouvrir `/foyer/rejoindre?token=…` préremplit le champ avec le jeton du lien"
    verification:
      - kind: unit
        ref: "app/src/modules/landing/join-household-page.test.tsx > (a) le paramètre ?token= devient la valeur initiale du champ, sans rien consommer"
        status: pass
    human_judgment: false
  - id: D2
    description: "Ouvrir `/foyer/rejoindre` laisse le champ vide et la saisie manuelle soumissible"
    verification:
      - kind: unit
        ref: "app/src/modules/landing/join-household-page.test.tsx > (b) sans paramètre, le champ est vide et la saisie manuelle reste possible"
        status: pass
    human_judgment: false
  - id: D3
    description: "Aucune adhésion n'est déclenchée au chargement (pas de soumission automatique)"
    verification:
      - kind: unit
        ref: "app/src/modules/landing/join-household-page.test.tsx > (a) … sans rien consommer (expect(redeemInviteToken).not.toHaveBeenCalled())"
        status: pass
    human_judgment: false

duration: 18min
completed: 2026-10-16
status: complete
---

# Phase 19 Plan 16: le lien d'invitation préremplit le champ du token

Fermer la seconde moitié du parcours d'invitation : `join-household-page.tsx` lit désormais `?token=` via `useSearchParams` et s'en sert comme valeur initiale du formulaire — le lien émis par les paramètres du foyer mène réellement à l'adhésion au lieu d'obliger l'invité à retaper 22 caractères.

## Ce que 19-14 avait laissé à moitié

19-14 a rendu la route visée solide à la connexion (`RequireAuth` conserve `pathname + search`, `router.tsx:38`) : le lien `/foyer/rejoindre?token=…` survit à l'authentification. Mais **personne ne lisait le paramètre** — `invitations-panel.tsx:71` l'émettait, `join-household-page.tsx:32` partait de `defaultValues: { token: '' }`. Le lien était *atteignable* mais pas *utile*. `deferred-items.md` §15 l'a consigné ; ce plan le clôt.

## Task 1 — le lien d'invitation remplit le champ, la saisie manuelle reste le repli

**Commit :** `79e0fbd` — `fix(19-16): le lien d'invitation préremplit le champ du token`

**Changements :**
- `join-household-page.tsx` : import de `useSearchParams` (depuis `react-router`, comme `guest-ardoise-page.tsx` et les trois autres pages invitées) ; `const initialToken = searchParams.get('token') ?? '';` puis `defaultValues: { token: initialToken }`. Un commentaire pose la contrainte : **valeur initiale, jamais action** — rien n'est soumis au chargement, la validation reste celle du schéma `min(22)` existant.
- `join-household-page.test.tsx` (nouveau, 60 lignes) : deux cas. (a) monté sur `/foyer/rejoindre?token=<25 caractères>`, le champ porte la valeur **et** `redeemInviteToken` n'est pas appelé (pas de soumission automatique). (b) monté sur `/foyer/rejoindre`, le champ est vide, la saisie manuelle est possible et la soumission appelle `redeemInviteToken` avec la valeur tapée. Motif repris de `create-household-page.test.tsx` (`renderWithProviders`, requêtes par rôle, mock partiel de `@/lib/invites` via `vi.hoisted`).

## Preuve rouge (mutation, puis restauration)

Le plan l'exige : remettre `defaultValues: { token: '' }` doit faire échouer le cas (a) en nommant la valeur attendue.

**Rouge (avant restauration) — `npx vitest run src/modules/landing/join-household-page.test.tsx` :**

```
 ❯ src/modules/landing/join-household-page.test.tsx (2 tests | 1 failed)
   × (a) le paramètre ?token= devient la valeur initiale du champ, sans rien consommer

Error: expect(element).toHaveValue(jeton-lien-19-16-abcdefgh)
Expected the element to have value:
  jeton-lien-19-16-abcdefgh
Received:
  (vide)
 ❯ src/modules/landing/join-household-page.test.tsx:41:26

 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
```

Le cas (b) reste vert pendant la mutation — il ne dépend pas du préremplissage. **Restauration** de `defaultValues: { token: initialToken }` → même commande → `Tests 2 passed (2)`. Le fichier restauré est celui du commit `79e0fbd` (vérifié : `join-household-page.tsx` relu, `defaultValues: { token: initialToken }`).

## Vérification (chaîne complète, après)

| Commande | Résultat |
|----------|----------|
| `cd app && npm run typecheck` | **vert** |
| `cd app && npm test` | **138 files, 1170 passed** — vert (était 137/1168 en 19-15 ; +1 fichier, +2 cas) |
| `cd app && npm run build` | **vert** (PWA, 100 entries précachées, `dist/sw.js` généré) |
| `python3 scripts/check-sql-statique.py` | « 181 fonction(s) effective(s) sur 124 migration(s) et 63 test(s), aucun défaut » — **vert** |
| `cd app && npm run test:e2e` | **121 passed, 5 skipped** — vert, identique à la base 19-15 |

**`migrate.sh` et `test-db.sh` n'ont aucun levier ici** — ce plan ne touche ni migration ni SQL, il ne fait que du frontend (`join-household-page.tsx` + son test). Ils n'ont pas été lancés et ne valideraient rien : le dire plutôt que de laisser croire qu'ils ont servi.

## Deviations from Plan

**Aucune** — le plan a été exécuté tel qu'écrit.

## Auth gates

Aucune.

## Known Stubs

Aucun. Les fichiers touchés n'introduisent ni valeur vide codée en dur, ni texte de remplacement, ni composant sans source de données. `initialToken` est une **entrée** lue depuis l'URL, pas un stub : sa valeur par défaut `''` est le comportement voulu du cas (b).

## Threat Flags

Aucun. Aucune surface nouvelle : le paramètre `?token=` existait déjà (émis par `invitations-panel.tsx`), il est désormais lu. Les quatre menaces du `<threat_model>` sont mitigées dans le code livré — voir `key-decisions` (T-19-50 reste côté serveur : `redeemInviteToken` transactionnel, la page ne fait que préremplir).

## Self-Check

- `app/src/modules/landing/join-household-page.tsx` — FOUND (modifié, `useSearchParams` + `defaultValues: { token: initialToken }`)
- `app/src/modules/landing/join-household-page.test.tsx` — FOUND (créé, 60 lignes)
- Commit `79e0fbd` — FOUND

## Self-Check: PASSED
