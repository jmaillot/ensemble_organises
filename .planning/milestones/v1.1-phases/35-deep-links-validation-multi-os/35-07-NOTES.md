# 35-07 — Notes d'exécution : sonde de joignabilité (gap G-35-4)

## Cas vus ROUGES avant implémentation (§2.7 : un contrôle se prouve sur un cas qui doit échouer)

- **T1, T3, T5** (cas D-11 critiques, exigés par le plan) : vus rouges — échec d'import du module `reachability` inexistant (`Failed to resolve import "./reachability"`), commit `3518321`. T2 et T4, dans le même fichier, étaient rouges pour la même cause.
- **Test E** (ordre seed→sonde dans main.tsx, garde source) : vu rouge proprement (`demarrerSondeJoignabilite()` absent de main.tsx) avant le câblage, puis vert. Les 4 tests A–D existants sont restés verts pendant tout le cycle.
- Preuve complémentaire (cas qui doit échouer du module) : les commits RED `3518321` (T1-T5) et `33f23fb` (Test E) documentent chaque échec observé ; la bascule offline est prouvée comme portée par `setOnline(false)` puisque T1 ne passait pas avant l'implémentation du module et passe uniquement avec.

## Chaîne de vérification §2.7 (partie applicable — AUCUNE modification SQL, pas de test-db.sh)

| Commande | Résultat |
|---|---|
| `cd app && npm run typecheck` | ✓ 0 erreur |
| `npx vitest run src/hooks/__tests__ src/stores/__tests__ src/lib` | ✓ 35 fichiers / 243 tests |
| `npm test` | ✓ 240 fichiers / **1908 tests**, 0 failed (1902+ requis) |
| `npm run build` | ✓ |
| `npx playwright test deep-link-redirect --reporter=list` | ✓ **6 passed** (spec inchangées ; la sonde est un no-op dans le build e2e sans VITE_SUPABASE_URL — cas T5) |
| `python3 scripts/check-sql-statique.py` | ✓ 230 fonctions effectives sur 179 migrations, 106 tests, aucun défaut (propreté : aucune migration touchée) |

Vérifications périmétrales : `git diff` vierge sur session-store.ts, use-auth.ts, supabase-adapter.ts, offline-banner.tsx ; zéro occurrence d'`AbortSignal.timeout` dans les fichiers créés (grep-negation, leçon W3) ; aucune directive de linter.

## Rappel D-11 : la fermeture de G-35-4 exige le rejeu on-device

La preuve automatisée ne suffit jamais : la fermeture de G-35-4 (comme G-35-3) exige le **rejeu on-device Android 16 du test 3 de 35-UAT.md** — cold-start déconnecté avec session, deep link `/taches/jour` → vue rendue depuis le cache AVEC bandeau hors-ligne (plus de carte « Failed to fetch »). deferred-items.md est annoté en conséquence. Le gardien 35-06 reste le filet (pire cas : sonde pas encore tranchée à la première lecture d'onlineManager du bootstrap) et n'a PAS été modifié.

## Limite honnête (T-35-12, §2.7 I)

Si la sonde de boot échoue alors que `navigator.onLine` reste true (blip backend, pas mode avion), aucun événement `online` ne se produira : l'app reste en mode cache+bandeau jusqu'à une bascule réseau réelle ou un reload. Cas résiduel accepté — données intactes, re-probe à chaque événement `online`/`offline` (y compris la sortie du mode avion), aucun retry en boucle ni timer périodique.
