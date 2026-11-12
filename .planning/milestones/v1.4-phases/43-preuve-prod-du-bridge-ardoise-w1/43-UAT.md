---
audit_acknowledged:
  milestone: v1.4
  at: 2026-11-12
  gap_snapshot: "unknown::scenarios=0"
---

# 43-UAT — Vérifications humaines de fin de phase

Source : `.planning/phases/43-preuve-prod-du-bridge-ardoise-w1/43-VERIFICATION.md`
(status human_needed, 5/6 must-haves vérifiés automatiquement, 0 gap bloquant)

## UAT-1 — Verdict humain PROOF-07 (seam client sans e2e navigateur)

**Ce qui est prouvé par la machine :**
- Le signal D-10 (« ce comportement exige un e2e navigateur ») est câblé dans
  `scripts/test-ardoise-bridge-real.sh` mais **0 émis** sur les deux runs verts
  (run 9 : `/tmp/opencode/43-01-run9.log`, run 10 : `/tmp/opencode/43-01-run10-idempotence.log`).
- Les 18 étapes HTTP traversent le fil réel (Edge ardoise-invite → RPC bridge → redeem 0181 → réconciliation) avec preuve par étape.
- Les 4 négatifs red-team sont vus rouges, l'expiration attendue 1020 s réelles sans falsification SQL.
- La doc `docs/BRIDGE-ARDOISE-PREUVE.md` nomme honnêtement ses limites (« Ce qui n'est PAS prouvé »).

**La décision demandée (par conception humaine, D-10) :**
Relire les sorties run 9/10 et la doc de preuve, puis trancher :
**aucun seam client du bridge ardoise ne requiert un e2e navigateur** pour la W1 —
PROOF-07 est couvert par la preuve HTTP sans déclenchement du signal D-10.

- [x] **PASS** — PROOF-07 satisfait sans e2e navigateur ; phase 43 close. *(Tranché le 2026-11-11 : 0 signal D-10 sur les runs 9/10, preuve HTTP complète avec 4 négatifs rouges.)*
- [ ] **FAIL** — un comportement observé (ou une étape manquée) exige un test Playwright ; le signaler, un follow-up sera créé.
