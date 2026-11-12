# Deferred items — Phase 36

## [préexistant, hors périmètre 36] e2e `rejoindre un foyer valide le format du token` rouge avant la phase

- **Constaté pendant :** 36-02, Task 2 (`npm run test:e2e`)
- **Symptôme :** `e2e/critical-paths.spec.ts:134` échoue sur chromium et mobile — en démo, `/foyer/rejoindre` affiche « Ce lien d'invitation n'est plus valable » (pré-écran `preview.phase === 'dead'`) au lieu du formulaire ; le `fill` sur `getByLabel('Token d'invitation')` timeout.
- **Preuve du caractère préexistant :** le test échoue AUSSI sur la baseline pré-phase-36 (`b02e0a0`, parent de `fabf9f7`), rejoué dans un worktree isolé (2 failed). Il n'est donc PAS une régression de 36-01/36-02 (qui ne touchent que outbox/panneau offline/badge). Il passait encore sur l'ancêtre lointain `52c43a0` (« E2e remis au vert 147/147 ») : la régression réelle s'est introduite entre ces deux bornes, hors phase 36.
- **Décision :** non corrigé ici — hors périmètre de la phase 36 (§2.7 + AGENTS.md : pas de réparation opportuniste hors périmètre). À traiter dans une phase dédiée (probable cause : le pré-écran d'invitation 31-03/31-07 traite l'absence de token en démo comme un lien mort au lieu d'afficher le formulaire — ligne « setPreview({ phase: 'dead' }) » quand `token === null` dans `join-household-page.tsx`).
  status: acknowledged
