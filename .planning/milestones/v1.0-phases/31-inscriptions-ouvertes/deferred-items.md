# Deferred items — phase 31

## 31-03 — échecs de tests préexistants, hors périmètre

Constatés pendant la vérification de 31-03 et **reproduits au commit de base
`8fc7756` (31-02) dans un worktree jetable** : ils précèdent ce plan et ne
relèvent pas de sa portée (aucun fichier des modules concernés n'est touché).

- `app/src/modules/anniversaires/anniversaires-page.test.tsx` — bascule liste/calendrier ; point d'un anniversaire d'origine anniversaire comme bouton d'édition (D-13, pendant)
- `app/src/modules/anniversaires/components/birthday-confetti.test.tsx` — accueille le jour J par la pluie
- `app/src/modules/calendrier/calendrier-page.test.tsx` — ajout via dialogue ; appui long sur une date ; sélection met à jour l'agenda
- `app/src/modules/courses/off-client.test.ts` — retourne null après timeout (repli manuel)

Chaîne §2.7 exécutée pour 31-03 : typecheck OK, tests des deux fichiers du plan
verts (62/62, stabilité 8 exécutions consécutives), build Vite OK, contrôle SQL
statique vert (aucune migration). Les échecs ci-dessus sont à traiter dans un
chantier dédié, pas par 31-03.
  status: acknowledged
