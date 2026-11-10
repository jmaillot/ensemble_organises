# Éléments différés — Phase 40

## Hors périmètre découverts pendant l'exécution

### 1. Test calendrier préexistant en échec (hors périmètre 40-01)

- **Fichier :** `app/src/modules/calendrier/calendrier-page.test.tsx`
- **Test :** « supprime un événement après confirmation »
- **Symptôme :** `TestingLibraryElementError: Unable to find an element with the text: Journée libre.` — échec déterministe (2 exécutions), le module calendrier est intact dans l'arbre de travail (`git status` propre sur ces fichiers).
- **Cause probable :** test dépendant de la date courante (9 novembre 2026) — « Journée libre » est un libellé de journée sans événement, dont l'affichage dépend du mois rendu.
- **Décision :** hors périmètre du plan 40-01 (aucun fichier partagé touché par ce plan) — NON corrigé ici, à traiter dans une passe dédiée (deviation rule « scope boundary » : les échecs préexistants de fichiers non liés sont hors de portée de la tâche).
