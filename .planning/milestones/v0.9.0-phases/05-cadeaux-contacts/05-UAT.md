---
status: complete
phase: 05-cadeaux-contacts
source: [05-VERIFICATION.md]
started: "2026-10-05"
updated: "2026-10-19"
---

# Phase 05 — UAT (human verification)

Score: 18/18 must-haves verified (automated). 6 items require live backend + JWT / device / eyes.

## Current Test

[testing complete — 5 pass, 1 blocked (browser delivery)]

## Tests

### 1. Edge live exchange with JWT
expected: owner generates code (QR shown once), other-foyer member redeems → reservation share; regen/revoke invalidate; uniform `code invalide` oracle end to end
result: pass
note: "Verified live 2026-10-06 (Alice→Bob): QR/code generation, redeem, reservation, owner neutral badge. Reveal-to-owner explicitly declined (statu quo, surprise kept). Revoke/regen covered by RPC tests + UI paths; live regen/revoke not explicitly re-shown."

### 2. External e-mail flow
expected: /invitation/cadeau?code= → signup with invited e-mail → redeem activates share (OQ-1 A)
result: pass
note: "Verified live 2026-10-06 (uat-externe@example.fr): local autoconfirm enabled for signup (local-only), foyer join via token, redeem activated share, reservation OK. Follow-up backlog: foyer-less external journey (shared view + reserved_by_email)."

### 3. Idée→promotion→offert live reflection
expected: server→UI reflection after mutation (trigger + promotion proven separately)
result: pass
note: "Verified live 2026-10-06: idea→offert marks linked item purchased (D-06). Reverse (item→idea) out of scope → backlog (needs loop guard)."

### 4. Physical QR scan
expected: real phone readability of a generated list code
result: pass

### 5. Photo rendering visual
expected: contact-priority vs birthday fallback in aggregated anniversaries view
result: pass
note: "Verified live 2026-10-06. Drive-bys fixed: birthday local photo upload (was URL-only), contacts-shell double count."

### 6. test-dispatch-push.sh
expected: run on an equipped instance (Vault creds + real push subscription) → `delivered`, jamais `dropped`
result: pass
reported: "Serveur prouvé 3× (200/delivered:1/consumed:1, abonnement Mozilla réel) mais Firefox 156 ne déclenche jamais l'événement push (aucun reçu SW, bannière jamais affichée, après resync + endpoint neuf). À retester sur un autre navigateur/appareil."
note: |
  **Joué le 2026-10-19 sur la production**, avec quatre abonnements réels :
  `{"due": 1, "dispatched": true}`, puis
  `200 {"delivered": 3, "failed": 0, "dropped": 0, "consumed": 1}`,
  `Rappel restant : 0`, nettoyage effectué — et **notification reçue**.

  Le `blocked` d'origine accusait Firefox 156 (« ne déclenche jamais l'événement
  push ») : c'était faux. Le navigateur recevait le message et le rejetait au
  déchiffrement (`Bad encryption`, accusé `101`), parce que
  `push-notify/web-push.ts` insérait un octet `0x51` absent de la RFC 8188
  §2.1. Corrigé par `d348309` ; l'item 6 de l'UAT 09 est passé le même jour,
  pour la même raison.

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

None (backlog: WR-02/04/05/06 + 5 Infos + ardoise curly-quote sibling — see 05-REVIEW-DISPOSITION.md).
