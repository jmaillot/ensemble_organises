---
phase: "35"
slug: "deep-links-validation-multi-os"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-06"
---

# Phase 35 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Navigateur ↔ API Supabase | Bootstrap auth au démarrage : restauration de session persistée, lecture foyer, repli hors-ligne | JWT de session, identités foyer (household_id, membres) |
| Navigation interne (`state.from`) | `RequireAuth` transmet la route visée à `/connexion` ; le sign-in y navigue après login | Chemin interne (pathname + search) — surface open-redirect |
| Appareil ↔ Service Worker | Mise à jour SW pendant file d'écriture pendante (outbox) | Reload contrôlé — risque de perte d'écritures pendantes |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-35-01 | Tampering | `state.from` → navigation post-login (sign-in-page.tsx) | high | mitigate | `internalPathOf()` (sign-in-page.tsx:64-73) : résout `state.from` contre `window.location.origin`, refuse toute origine différente (couvre URL absolue, `//evil.example`, `/\evil.example`) ; émetteur unique `router.tsx:36` (RequireAuth), unique lecteur sign-in-page.tsx:133 | closed |
| T-35-02 | Information Disclosure | Écran « connexion requise » (D-07) | low | mitigate | `ConnexionRequise` (sign-in-page.tsx:85-104) : n'affiche que le chemin filtré par `internalPathOf`, aucune donnée de la vue, aucun stockage ; atteint on-device (matrice §1.5 rejeu : Passé ×2 OS) | closed |
| T-35-03 | Denial of Service | `OFFLINE_FAMILIES` élargie à `task_assignees` (query-policy.ts:86) | low | accept | Lecture seule, volume borné aux assignations du foyer, même régime que `tasks`/`household_members` (phase 33) ; décision client-side de famille de cache uniquement | closed (accepté) |
| T-35-04 | Repudiation | Consignation de la matrice multi-OS (35-02) | medium | mitigate | `35-VALIDATION-MATRICE.md` datée 2026-11-06, vocabulaire fermé D-11, 3 `Échoué` consignés honnêtement, `CONFIRMATION-CONSIGNATION` apposée | closed |
| T-35-05 | Denial of Service | Gate SW « file vide » pendant un rejeu | medium | mitigate | `update-banner.tsx:29` + `offline-panel.tsx:142` : `disabled={!isEmpty}` via `useOutboxGate` — le gate désactive le bouton, ne filtre jamais l'appel ; zéro reload pendant file non vide | closed |
| T-35-06 | Spoofing / Tampering | use-auth.ts — repli hors-ligne du bootstrap | high | mitigate | Garde d'expiration (use-auth.ts:212-219) : `expires_at` dépassé + hors-ligne → chemin invité (purge + setReady), session expirée JAMAIS appliquée comme authentifiée ; rejets `getSession`/`applySession` hors-ligne → même chemin invité. Prouvé par tests A–F + e2e hors-ligne (commits d6c76fc/95a8572/59af4fd) | closed |
| T-35-07 | Information Disclosure | session-store.ts — repli foyer persisté (`loadHousehold`) | low | accept | Repli UNIQUEMENT hors-ligne + `householdId` déjà persisté + membres vivants : foyer de CET utilisateur sur CET appareil, aucun réseau, aucune donnée nouvelle, revalidation reportée au retour du réseau (session-store.ts:173-193) | closed (accepté) |
| T-35-08 | Repudiation | Consignation du rejeu (35-05) | medium | mitigate | Tables « Rejeu » §1.4/§1.5 + item 7-rejeu datés, historique initial intact ; `deferred-items.md` réouverture honnête (DLNK-02 Android Échoué consigné avec symptôme) | closed |
| T-35-SC | Tampering | npm/pip/cargo installs (supply chain) | high | mitigate | Zéro nouvelle dépendance : `git show --stat` sur d6c76fc/95a8572/59af4fd — seuls use-auth.ts, session-store.ts, tests, e2e touchés ; aucun package.json/lockfile modifié | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-35-01 | T-35-03 | `task_assignees` dans `OFFLINE_FAMILIES` : lecture seule client-side, volume borné au foyer, régime identique aux familles acceptées en phase 33 ; aucune surface d'écriture | Utilisateur (décision plan 35-01, confirmée audit 2026-11-06) | 2026-11-06 |
| AR-35-02 | T-35-07 | Repli hors-ligne sur foyer déjà persisté : mêmes données que le cache offline de lecture accepté (phase 33) ; aucun réseau, aucune donnée nouvelle, revalidation serveur au retour du réseau | Utilisateur (décision plan 35-04, confirmée audit 2026-11-06) | 2026-11-06 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-06 | 10 | 10 | 0 | gsd-security-auditor (ASVS L1, block_on: high) |

Observations non bloquantes (hors périmètre du registre) :
- Le rejeu on-device §1.4 reste Échoué sur Android 16 (DLNK-02, réouvert dans `deferred-items.md`) — gap fonctionnel consigné, pas une menace ouverte : le périmètre sécurité de T-35-06 (session expirée jamais authentifiée) tient sur les deux OS.
- Gate SW §2 de la matrice = « Non testé » (déclenchement impossible pendant le passage, aucun build publié) — mitigation T-35-05 vérifiée dans le code ; rejeu on-device à la prochaine mise en production.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-06
