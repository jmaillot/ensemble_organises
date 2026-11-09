---
phase: "40"
slug: "ardoise-rejoindre-via-mon-compte"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-09"
---

# Phase 40 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| client → Edge ardoise-invite (action `household-token`) | un code de partage présenté par un client potentiellement malveillant, session `user` exigée | code de partage ardoise (22+ car.) |
| Edge → PostgreSQL (RPC bridge `create_household_bridge_token`) | émission privilégiée d'un token foyer, doit rester `service_role` uniquement | token_hash HMAC, ardoise_id, user_id |
| sessionStorage → join-household-page | marqueur d'atterrissage manipulable côté client — borne l'effet à un simple choix de destination | marqueur de navigation |
| Edge household-invite → RPC redeem (transaction) | l'Edge passe token_hash + identité ; la base décide seule des conversions | token_hash, user_id |
| private.ardoise_bridge_identities → redeem | la table pont pilote QUI voit ses participations converties | guest_id ↔ user_id |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-40-01 | Information Disclosure | action Edge `household-token` (ardoise-invite) | medium | mitigate | réponse 404 uniforme « Lien invalide. » pour inconnu/expiré/révoké (ardoise-invite/index.ts:587-596) — aucune énumération de codes ; rate limit `LIMITS['household-token']: 8/min` (ligne 251) | closed |
| T-40-02 | Elevation of Privilege | `create_household_bridge_token` | high | mitigate | `grant execute … to service_role` seul, `revoke … from public, anon, authenticated` (0180:101-102, 0180b:91-92) ; `max_uses=1` et expiration 15 min en dur (0180:76-80) ; rôle `membre` forcé par le redeem (0145) | closed |
| T-40-03 | Information Disclosure | token bridge brut | high | mitigate | rendu une seule fois dans la réponse `json({ token })` (ardoise-invite/index.ts:617) ; journalisation d'erreurs limitée à `{ code, message }` — jamais le payload ; jamais persisté | closed |
| T-40-04 | Tampering | marqueur sessionStorage `pending-ardoise-landing` | low | accept | forgeable côté client mais ne contrôle qu'une destination de navigation post-adhésion, même origin — aucun effet d'autorisation. Voir Accepted Risks Log. | closed |
| T-40-05 | Tampering | bloc réconciliation dans redeem | high | mitigate | conversion bornée au foyer du token (jointure `public.expenses`) ET aux `guest_id` posés par l'Edge pour CE `user_id` (table pont, 0181:155-217) ; purge du pont après conversion (0181:327) ; prouvé par les cas SQL de la migration | closed |
| T-40-06 | Elevation of Privilege | paramètre `p_role` du redeem | medium | mitigate | `v_role := 'membre'` en dur (0181:68) + refus `p_role='enfant'` (0181:61) recopié de 0145:207-210 — cas SQL 7 le prouve | closed |
| T-40-07 | Denial of Service | double redemption concurrente | medium | mitigate | verrou `select … for update` (0181:78) recopié de 0145:220-224 — cas SQL 6 le prouve | closed |
| T-40-08 | Tampering | flux de confirmation côté client | low | mitigate | tests RTL verrouillant « aucun appel Edge avant confirmation » (`guest-ardoise-page.test.tsx:224,391`, `expect(exchangeMock).not.toHaveBeenCalled()`) — toute régression échoue en CI | closed |
| T-40-SC | Tampering | npm/pip/cargo installs | high | mitigate | aucune installation de paquet cette phase (aucun commit sur `package.json`/lockfile) — Package Legitimacy Audit : aucun paquet, gate non déclenché | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-40-04 | T-40-04 | Le marqueur `pending-ardoise-landing` en sessionStorage est forgeable côté client, mais il ne contrôle qu'une destination de navigation post-adhésion dans le même origin — aucun effet d'autorisation ni d'accès aux données. | GLM 5.3 Flash (orchestrateur secure-phase) | 2026-11-09 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-09 | 9 | 9 | 0 | gsd-security-auditor path — L1 grep verification (register authored at plan time, ASVS 1, short-circuit) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-09
