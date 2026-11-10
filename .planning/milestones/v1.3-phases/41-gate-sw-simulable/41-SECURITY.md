---
phase: 41-gate-sw-simulable
audited: 2026-11-10
asvs_level: 2
block_on: high
verdict: SECURED
threats_open: 0
threats_closed: 4
threats_total: 4
commits: [d0d44b5, 84b8a26, 9b99cbf]
---

# Phase 41 — Vérification de sécurité (SECURED)

Audit des mitigations déclarées dans le `<threat_model>` de `41-01-PLAN.md`, vérifiées par grep dans le code implémenté (commits d0d44b5, 84b8a26, 9b99cbf). Posture adversarielle : chaque mitigation supposée absente jusqu'à preuve de correspondance.

## Threat Verification

| Threat ID | Category | Severity | Disposition | Verdict | Evidence |
|-----------|----------|----------|-------------|---------|----------|
| T-41-01 | Information Disclosure | low | mitigate | CLOSED | Garde build-time présente aux DEUX frontières : `app/src/lib/e2e-sw-harness.ts:46` (tout le corps derrière `import.meta.env.VITE_E2E_SW_HARNESS === '1'`) et `app/src/main.tsx:83-84` (import dynamique derrière la même garde). Preuve A2 exigée par le wrapper (`scripts/test-sw-gate.sh:86-93`) : grep du bundle du build standard pour `__eoSwHarness` / `e2e-sw-harness` = 0 occurrence, consigné avant tout lancement de spec — pas supposé. `window.__eoSwHarness` n'existe donc dans aucun bundle de production (tree-shaking sur constante d'environnement). |
| T-41-02 | Tampering | low | mitigate | CLOSED | `grep VITE_E2E_SW_HARNESS` sur `app/Dockerfile`, `compose.app.yaml`, `.env.app` = 0 occurrence. Le Dockerfile ne passe que `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `GIT_SHA` (l.13-25). `VITE_BUILD_ID`/`VITE_E2E_SW_HARNESS` sont des variables d'env de build du wrapper uniquement (`test-sw-gate.sh`, builds dist-v1/dist-v2) ; valeur de test sans secret (§2.7 H non déclenché). |
| T-41-03 | Denial of Service | low | accept | CLOSED | Risque accepté et documenté : l'en-tête du wrapper `scripts/test-sw-gate.sh:9` (« CE QUE CE SCRIPT PROUVE, ET CE QU'IL NE PROUVE PAS ») porte le bornage ; le run est séparé (`testIgnore` sur `E2E_SW_BASE_URL`, `playwright.config.ts`) et jamais branché sur la chaîne §2.7 standard — le run e2e standard reste au coût actuel (vérifié : 163 passed / 9 skipped). |
| T-41-SC | Tampering (packages) | high | mitigate | CLOSED | Aucune installation de paquet : `git show --stat` des 3 commits ne touche aucun `package.json` / lockfile ; le serveur harnais est `node:http` natif (`scripts/e2e-sw-server.mjs`, zéro dépendance). Package Legitimacy Audit non déclenché, conformément au plan. |

## Vérifications complémentaires (frontières de confiance)

- **Aucune nouvelle frontière de confiance** : `git show --stat` des 3 commits — aucune migration SQL, aucune RLS, aucun endpoint, aucun chemin d'auth, aucune politique Storage (claim du plan confirmé, déjà vérifié par 41-REVIEW.md). Périmètre : scripts de test, spec e2e, harnais flag-compilé, `sw.ts`, `main.tsx`, `playwright.config.ts`, `docs/EXPLOITATION.md`.
- **Harnais inerte en production** : garde identique dans le module et le point de branchement ; aucun chemin de composition (Dockerfile/compose) ne pose le flag ; preuve A2 par grep de bundle exigée par le wrapper. Surface SQL/RLS : aucune (revue antérieure confirmée).
- **Handler `SKIP_WAITING` de `sw.ts` (l.292-305)** : analysis précise de la frontière — un événement `message` reçu par un service worker provient, par construction du navigateur (`ExtendableMessageEvent`), d'un client sous la portée du worker, donc **same-origin uniquement** : aucun site tiers ne peut poster ce message au worker. Le handler ne réagit qu'à `{type:'SKIP_WAITING'}` — exactement le message que `updateSW()` de `vite-plugin-pwa` (`wb.messageSkipWaiting()`) envoie lorsque l'utilisateur clique « Recharger » — et à `EO_VERSION` (diagnostic interne, répond aux clients du même worker). Pas d'action déclenchable par une origine non fiable ; le skipWaiting au démarrage reste proscrit (D-09) et est absent (`sw.ts:126`, commentaire explicite). Le retrait du `self.skipWaiting()` de démarrage est une **réduction** de surface (la mise à jour ne peut plus s'activer sans action utilisateur explicite).
- **Diff nul sur les fichiers de la gate** : `git diff 0ebf6c1..9b99cbf` sur `sw-register.ts`, `use-outbox-gate.ts`, `update-banner.tsx` = 0 ligne — aucun fork ni mock de la logique de gate.
- **Deviation `sw.ts`** : le retrait du skipWaiting de démarrage + handler SKIP_WAITING est une déviation documentée (41-01-SUMMARY.md « Déviations », Rule 1 - Bug, commit d0d44b5), mappée à D-09 et revue (41-REVIEW.md « Points vérifiés sans finding »). Informational — pas un unregistered_flag : c'est une réduction du pouvoir de la gate, cohérente avec le plan.

## Findings de revue (41-REVIEW.md)

Les 4 warnings (WR-01 à WR-04) et 3 info (IN-01 à IN-03) portent sur la **robustesse du harnais de test** (fiabilité du run, fenêtres TOCTOU locales, ergonomie) — aucun ne touche la production ni n'élève la sévérité d'une menace du registre. Hors périmètre de ce audit (mitigations déclarées), laissés au suivi de la revue.

## Unregistered Flags

None — SUMMARY.md ne déclare pas de section `## Threat Flags` ; la déviation `sw.ts` est documentée et mappée (voir ci-dessus).

## Verdict

**SECURED** — 4/4 menaces CLOSED (3 mitigations prouvées dans le code, 1 risque accepté documenté). `threats_open: 0`.
