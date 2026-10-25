# UAT — Phase 21 : Photos dans les étapes de recette

> UAT conversationnelle du 24/10/2026, exécutée par l'utilisateur **en production**
> (build `c92cb55`). Note : la VERIFICATION.md de la phase est marquée « stalée »
> par le tooling (fichiers sources partagés modifiés depuis par la vague design) ;
> l'UAT couvre le vécu utilisateur, pas la re-preuve SQL.

## Résultats

| Test | Attente | Verdict |
|---|---|---|
| 21.1 Ajout d'une photo d'étape | Photo ajoutée depuis l'appareil, affichée recadrée, persistante au rechargement | ✓ PASS (utilisateur) |
| 21.2 Mode cuisine + impression | Image réduite une fois l'étape cochée ; photos présentes sur la feuille imprimée sans débordement | ✓ PASS (utilisateur) |
| 21.3 Vue invitée | Lien de partage : l'invité voit les photos d'étapes, en lecture seule | ✓ PASS (utilisateur) |

## Verdict de phase

**Phase 21 : UAT PASSÉE (3/3)** — aucune lacune remontée.

## Suivi

- Vérification stalée : provoquée par la vague design du 23-24/10 (fichiers
  partagés), non par un défaut de la phase. À rafraîchir si un re-run
  `execute-phase` est souhaité ; l'UAT utilisateur ne le demande pas.
