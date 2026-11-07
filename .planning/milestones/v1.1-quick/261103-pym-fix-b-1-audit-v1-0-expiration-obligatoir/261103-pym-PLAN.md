---
phase: quick
plan: 261103-pym
type: execute
wave: 1
depends_on: []
files_modified:
  - app/src/lib/invites.ts
  - app/src/lib/invites.test.ts
  - .planning/REQUIREMENTS.md
  - docs/BACKEND.md
  - docs/EXPLOITATION.md
autonomous: true
requirements: [B-1, MSG-04, W-1]

estimate:
  tokens: 45000
  raw_tokens: 30000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - Un nouvel utilisateur peut créer un foyer en mode Supabase : createInviteToken envoie toujours un expiresAt non nul à l'Edge Function household-invite, plus jamais le 400 « Choisissez une date d'expiration ».
    - Le défaut d'expiration (+30 jours) reflète le motif du panneau d'invitations (invitations-panel, 31-04).
    - La traçabilité MSG-04 dans REQUIREMENTS.md dit Done avec justification.
    - Les docs BACKEND.md/EXPLOITATION.md décrivent le vrai planning cron `5 4 * * *` UTC (état post-0175), plus `5 6 * * * Europe/Paris`.
  artifacts:
    - app/src/lib/invites.ts (createInviteToken avec défaut d'expiration)
    - app/src/lib/invites.test.ts (test qui n'emballe PAS la gestion expiresAt de la lib)
  key_links:
    - create-household-page.tsx:56 → createInviteToken → Edge household-invite (schema Zod : expiresAt isoInstant non nul)
---

<objective>
Corriger B-1 (bloqueur audit v1.0) : l'onboarding passe un expiresAt nul à l'Edge Function qui l'exige (0176/D-14), le catch annule alors le foyer créé — un nouvel utilisateur ne peut pas créer de foyer en mode Supabase. Rattrapage cosmétique MSG-04 (traçabilité) et W-1 (dérive doc cron).
Purpose: débloquer l'onboarding Supabase (parcours critique d'entrée) et aligner les artefacts de suivi.
Output: invites.ts corrigé + test de non-régression, REQUIREMENTS.md à jour, docs cron à jour.
</objective>

<execution_context>
@~/.config/opencode/gsd-core/workflows/execute-plan.md
@~/.config/opencode/gsd-core/templates/summary.md
</execution_context>

<context>
@app/src/lib/invites.ts
@app/src/modules/landing/create-household-page.tsx
@app/src/modules/parametres/components/invitations-panel.tsx
@app/src/lib/invites.test.ts
@.planning/v1.0-MILESTONE-AUDIT.md
@AGENTS.md (§2.7 : chaîne de vérification, pas de directive de linter, commentaires qui nomment la raison en français)
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Défaut d'expiration +30 jours dans createInviteToken (B-1)</name>
  <files>app/src/lib/invites.ts, app/src/lib/invites.test.ts</files>
  <behavior>
    - Test 1 : `createInviteToken({ maxUses: 10 })` SANS expiresAt (mode démo/local des tests) produit un token dont `expiresAt` est non nul et vaut environ aujourd'hui + 30 jours (tolérance ±1 minute, format ISO instant).
    - Test 2 : `createInviteToken({ expiresAt: '2027-01-15', maxUses: 10 })` conserve la valeur explicite (le défaut n'écrase pas l'appelant).
    - Test 3 : en mode Supabase, le corps POST envoyé à l'Edge Function porte `expiresAt` non nul — si l'environnement vitest a `isSupabaseConfigured` vrai, intercepter avec un `vi.stubGlobal('fetch', ...)` sur `${supabaseFunctionsBase}/household-invite` et lire le corps JSON ; sinon couvrir via la branche démo des tests 1-2 et un test unitaire direct du helper.
  </behavior>
  <action>
Dans app/src/lib/invites.ts, au début de `createInviteToken`, calculer l'expiration effective AVANT la branche : quand `options?.expiresAt` est `undefined` (pas fourni), utiliser la même valeur par défaut que le panneau d'invitations — `${addDays(todayIso(), 30)}T23:59:00.000Z` avec `addDays`/`todayIso` importés de `@/lib/utils` (motif exact d'invitations-panel.tsx:107, 31-04). Utiliser cette valeur effective dans les DEUX branches : `expiresAt: toInstant(expiresEffective)` côté Supabase, et `expires_at` / `expiresAt` du retour démo côté local — la cohérence des deux modes évite qu'un futur appelant redécouvre le piège. Un `expiresAt: null` explicite reste tel quel (contrat du type `string | null`, pas de sur-interprétation). Commentaire en français au site du défaut qui nomme la raison : l'Edge Function `household-invite` (0176/D-14) refuse un expiresAt absent avec 400, et l'appel onboarding de create-household-page n'en fournit pas — sans ce défaut, le catch de compensation annulait le foyer créé. Ne PAS toucher à create-household-page.tsx ni à l'Edge Function (migration 0176 déjà appliquée, correction vers l'avant côté client uniquement, AGENTS.md §2.7 A).
Écrire les tests d'abord dans app/src/lib/invites.test.ts (section dédiée « expiration par défaut »), les voir rouges, puis implémenter. Ne pas mocker la lib dans ces tests — c'est précisément ce que faisait create-household-page.test.tsx:27 et pourquoi le défaut a échappé à la chaîne.
  </action>
  <verify>
    <automated>cd app && npx vitest run src/lib/invites.test.ts</automated>
  </verify>
  <done>Les trois tests passent ; createInviteToken n'émet plus jamais un expiresAt nul vers l'Edge Function quand l'appelant ne fournit pas de date.</done>
</task>

<task type="auto">
  <name>Task 2: Rattrapage traçabilité MSG-04 (REQUIREMENTS.md)</name>
  <files>.planning/REQUIREMENTS.md</files>
  <action>
Dans .planning/REQUIREMENTS.md (~ligne 118), remplacer la ligne de traçabilité `| MSG-04 | Phase 29 | Pending |` par `| MSG-04 | Phase 29 | Done |` suivie, dans la même cellule ou la colonne prévue à cet effet selon la structure du tableau, d'une courte justification : push groupé câblé (0172 + consommation par push-notify), attestation HV-5, coche du corps déjà [x]. Vérifier le libellé exact des colonnes du tableau avant d'éditer — ne pas casser le format des lignes voisines. Aucun autre row ne change.
  </action>
  <verify>
    <automated>grep -c '| MSG-04 | Phase 29 | Done |' .planning/REQUIREMENTS.md && ! grep -q '| MSG-04 | Phase 29 | Pending |' .planning/REQUIREMENTS.md</automated>
  </verify>
  <done>La ligne MSG-04 de la table de traçabilité indique Done avec justification ; aucune autre ligne modifiée.</done>
</task>

<task type="auto">
  <name>Task 3: Doc cron réel 5 4 * * * UTC (W-1)</name>
  <files>docs/BACKEND.md, docs/EXPLOITATION.md</files>
  <action>
La migration 0175_routine_cron_utc.sql (lignes 38-44, forward-fix : ne JAMAIS réécrire une migration appliquée) a re-planifié `eo-routine-maintenance` à `5 4 * * *` UTC ; l'assertion `5 4 * * *` vit dans 0004_cron.sql:231. Corriger uniquement les docs : docs/BACKEND.md lignes 1047 et 1055-1056, docs/EXPLOITATION.md ligne 310 — remplacer toute mention de `5 6 * * * Europe/Paris` par `5 4 * * *` UTC, en gardant le style de chaque document (si la phrase donnait l'équivalent Europe/Paris, écrire `5 4 * * *` UTC soit 6 h 05 Europe/Paris en heure d'hiver — vérifier la formulation existante et rester factuel : horloge UTC, fuseau explicite). Grep au préalable pour trouver TOUTES les occurrences (`5 6`, `Europe/Paris` à proximité de cron/routine), pas seulement les trois lignes citées — corriger la classe, pas l'instance (AGENTS.md §2.7 E).
  </action>
  <verify>
    <automated>! grep -rn '5 6 \* \* \*' docs/BACKEND.md docs/EXPLOITATION.md && grep -q '5 4 \* \* \*' docs/BACKEND.md && grep -q '5 4 \* \* \*' docs/EXPLOITATION.md</automated>
  </verify>
  <done>Aucune doc ne mentionne plus `5 6 * * *` ; les deux documents décrivent `5 4 * * *` UTC conformément à 0175.</done>
</task>

</tasks>

<verification>
Chaîne complète avant de déclarer fini (AGENTS.md §2.7) :
```sh
cd app && npm run typecheck && npm test && npm run build
```
Aucun SQL touché (pas de migration, pas d'Edge Function) : check-sql-statique et test-db.sh hors périmètre.
</verification>

<success_criteria>
- createInviteToken fournit un expiresAt non nul (+30 jours) quand l'appelant n'en passe pas, dans les modes Supabase et démo ; test de non-régression qui n'emballe pas la lib.
- REQUIREMENTS.md : MSG-04 = Done justifié.
- BACKEND.md et EXPLOITATION.md : cron `5 4 * * *` UTC.
- Chaîne typecheck + tests + build verte.
</success_criteria>

<output>
Créer le SUMMARY de ce quick-task dans .planning/quick/261103-pym-fix-b-1-audit-v1-0-expiration-obligatoir/ après exécution.
</output>
