---
phase: 40-ardoise-rejoindre-via-mon-compte
source: 40-REVIEW.md
disposition_at: 2026-11-09
---

# 40 — REVIEW DISPOSITION

Une ligne par finding du rapport `40-REVIEW.md` (1 critique · 3 majeurs · 4 mineurs).
Valeur par défaut : `open` — un finding trié se distingue d'un finding oublié.

| Finding | Sévérité | Fichier | Disposition | Notes |
|---------|----------|---------|-------------|-------|
| CR-01 | critique | supabase/functions/ardoise-invite/index.ts:572-583 | fixed | Corrigé commit `9098f5e` : select `use_count,max_uses` + refus 404 uniforme côté Edge (miroir redeem_ardoise_invite 0113). |
| WR-01 | majeur | app/src/modules/landing/join-household-page.tsx:159-167 | fixed | Corrigé commit `9098f5e` : `clearArdoiseLanding()` dans le catch + test RTL. |
| WR-02 | majeur | supabase/functions/ardoise-invite/index.ts | fixed | Corrigé commit `9098f5e` : `refuseEnfant(admin, userId, row.household_id, 'code')` avant le RPC bridge. |
| WR-03 | majeur | supabase/functions/ardoise-invite/index.ts (+ 1 préexistant) | open | Comparaison lexicographique `expires_at` entre formats ISO différents — fragile à la frontière exacte. L'une des deux occurrences est préexistante (`link-view`) : hors périmètre du fix ciblé. |
| MN-01 | mineur | index.ts:297/299 | open | Doublon mort dans `translateRpcError`. |
| MN-02 | mineur | guest-ardoise-page.tsx | open | Phrase dupliquée dans la docstring. |
| MN-03 | mineur | — | open | Émission bridge non bornée en volume — à documenter. |
| MN-04 | mineur | confirm-dialog.tsx | open | Pastille toujours en palette destructive pour l'adhésion (usage non destructif). |
