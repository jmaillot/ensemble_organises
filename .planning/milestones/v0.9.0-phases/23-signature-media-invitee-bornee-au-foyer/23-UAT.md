# UAT — Phase 23 : Signature média invitée bornée au foyer

> UAT conversationnelle du 24/10/2026, en production (build `c92cb55`).
> La preuve SQL (migration 0128, verdict borné dans `guest_view_gift_list`)
> reste dans VERIFICATION.md.

## Résultats

| Test | Attente | Verdict |
|---|---|---|
| 23.1 Médias du lien invité | Photos de la page invitée chargées via URLs signées, sans erreur visible | ✓ PASS (utilisateur) |
| 23.2 Signature liée au lien, pas à une session | URL d'image rejouable tant que le partage est actif ; refus propre après révocation — aucun média orphelin servi | ✓ PASS (utilisateur) |

## Verdict de phase

**Phase 23 : UAT PASSÉE (2/2)** — le comportement clé (le média signé ne
survit pas à l'arrêt du partage) validé par l'utilisateur en conditions réelles.
