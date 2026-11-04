---
phase: 29
updated: 2026-10-29T17:40:24.409414+00:00
---

| Finding | Title | Disposition | Source |
|---|---|---|---|
| CR-01 | `Expéditeur` — identifiant shell non-ASCII, script cassé sous dash | closed 2026-10-30 (plan 29-06, commit 1e48b16 — renommé `Expediteur`, preuve `LC_ALL=C dash -n`) | auto-recorded from 29-REVIEW.md (critical) |
| WR-01 | Doublons possibles dans `notification_reads` (portage D-03 et marquage concurrent) | open | auto-recorded from 29-REVIEW.md (warning) |
| WR-02 | Comparaison lexicographique d'horodatages de formats hétérogènes (pagination et tri des fils) | open | auto-recorded from 29-REVIEW.md (warning) |
| WR-03 | `open_direct_conversation` ne re-vérifie pas l'appelant supprimé | open | auto-recorded from 29-REVIEW.md (warning) |
| IN-01 | Sonde d'existence d'un `member_id` inter-foyer via les messages d'erreur | open | auto-recorded from 29-REVIEW.md (info) |
| IN-02 | Imports dupliqués du même module | open | auto-recorded from 29-REVIEW.md (info) |
| IN-03 | Instruction collée à l'accolade ouvrante | open | auto-recorded from 29-REVIEW.md (info) |
| IN-04 | `fetchReadReceipts` (démo) s'écarte du contrat du RPC | open | auto-recorded from 29-REVIEW.md (info) |
| IN-05 | Gabarit push direct dégénéré « Conversation avec votre conversation » | open | auto-recorded from 29-REVIEW.md (info) |
