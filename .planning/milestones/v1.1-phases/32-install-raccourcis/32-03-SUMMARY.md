# 32-03 Summary — Bannière d'installation et panneau offline observatoire

**Statut : terminé** (2026-11-04, commit `d76ebd8`).

## Livré

- **`usePwaInstalled()`** (`use-pwa.ts`) : `display-mode: standalone` + `navigator.standalone` (iOS), patron module-scope, réactif (`change` + `appinstalled`).
- **`install-banner.tsx`** : bannière dans le slot, priorité 2 (sous `sw-update`). Conditions TOUTES requises (D-02/D-03) : non installée, non enterrée, moyen d'installer présent (Chromium `beforeinstallprompt` capé par `useInstallPrompt` réutilisé tel quel, OU UA iOS). Chromium → bouton « Installer » → invite native. iOS → pas-à-pas Safari (Partager → Sur l'écran d'accueil) **dépliable dans la bannière**, pas de page dédiée (D-01). Dismiss → `localStorage['eo-install-banner-dismissed-at']` (timestamp ms, parse `Number()` + `Number.isFinite`, repli sûr = visible). Bouton install de la barre supérieure d'`app-shell.tsx` inchangé (deuxième niveau d'invite).
- **`offline-panel.tsx`** (D-12) : ligne « Version du service worker » (ping `EO_VERSION` / réponse `EO_VERSION_REPLY` de `sw.ts`, repli honnête « Service worker indisponible »), deux versions distinctes (Pitfall 7) ; « Mise à jour en attente » + « Appliquer maintenant » (`void updateSW()`) UNIQUEMENT quand `needsRefresh`, gate `useOutboxGate` avec libellé « Mise à jour en préparation… » (Pitfall 7 : rien d'affiché sans mise à jour en attente).
- **`sw-register.ts`** : `needsRefresh` ajouté à `useSwState`, posé dans `onNeedRefresh`.

## Écart au plan, documenté

Le `<behavior>` de la Task 1 annonçait « enterrée il y a 29 jours → **visible** », en contradiction directe avec le `must_have` D-02 (« enterrée **(< 30 jours)** »). Le `must_have` prime : le test encode 29 jours → **encore masquée**, 31 jours → réapparue. Une demi-journée d'ambiguïté tranchée en faveur de la version qui ne spamme pas l'utilisatrice.

## Adaptations en cours d'exécution

- `<details>/<summary>` remplacés par un couple bouton (`aria-expanded`) + liste `hidden` : jsdom n'expose pas le rôle `button` sur `summary`.
- La référence `navigator.serviceWorker` est capturée dans l'effet (cleanup sûr même si l'environnement change après le rendu — Tests).
- Le mock `useSwState` des tests est un objet `vi.hoisted` (le store réel reste zustand).

## Vérifications exécutées

- `npx vitest run src/components/banners/` : **18/18** ✅ · `offline-panel.test.tsx` : **10/10** ✅
- Chaîne §2.7 : `npm run typecheck` ✅, `npm test` **1744/1746** (2 échecs `anniversaires-page.test.tsx` préexistants, cf. 32-01), `npm run build` ✅
- `git diff app/src/app/app-shell.tsx` : vide (bouton install intact)
- Coexistence store/slot vérifiée : `sw-update` (prio 1) au-dessus de `install` (prio 2), même store, même slot

## Phase 32 — clôture

Les trois plans sont exécutés. Reste `/gsd-verify-work` pour la validation on-device (SC-1 install desktop/Android, SC-2 invite iOS, SC-3 raccourcis + bandeau de mise à jour réel).
